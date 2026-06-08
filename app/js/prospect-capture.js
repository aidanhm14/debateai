/* ─── Prospect Capture (2026-05-27) ─────────────────────────────────
   Lightweight email/phone collector for visitors who won't sign in with
   Google. Writes to Firestore `prospects` (one doc per submission, no
   real auth — these are tracking signals, not user accounts) with a
   `/api/log-prospect` server-side fallback for browsers where Firestore
   client SDK is blocked (Safari ITP, Instagram/TikTok in-app browsers).

   Usage:
     window.ProspectCapture.mount(containerEl, {
       source: 'landing-intro',     // required, where this lives
       onSuccess: (data) => {},     // optional, after successful write
       compact: false,              // optional, smaller layout for modals
     });

   Hidden behind window.ProspectCapture rather than imported so the
   single-file React pages (landing, debate-ai, index, voice-debate) can
   each call it without bundler changes. ───────────────────────────── */
(function(){
  'use strict';
  if (window.ProspectCapture) return;

  // ── Validation ────────────────────────────────────────────────────
  // Conservative — surface a clear inline error before hitting the
  // network, since blocked clients hide network errors from users.
  function validEmail(s){
    if (!s || typeof s !== 'string') return false;
    s = s.trim();
    if (s.length > 254) return false;
    // RFC-5322 simple: local@domain.tld, no spaces
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }
  function normalizePhone(s){
    if (!s) return '';
    var raw = String(s).replace(/[^\d+]/g, '');
    if (!raw) return '';
    if (raw.length < 7 || raw.length > 18) return '';
    return raw;
  }

  // ── Persistence ───────────────────────────────────────────────────
  // Try client Firestore first (cheaper, no function invocation), fall
  // back to /api/log-prospect when the client SDK isn't available or
  // the write is blocked (App Check rejection, network filter, etc.).
  async function writeProspect(payload){
    var doc = {
      email:   payload.email || '',
      phone:   payload.phone || '',
      source:  payload.source || 'unknown',
      ua:      (navigator.userAgent || '').slice(0, 240),
      locale:  (navigator.language || '').slice(0, 16),
      page:    (location.pathname + location.search).slice(0, 240),
      ref:     (document.referrer || '').slice(0, 240),
      createdAt: Date.now(),
    };
    var firestoreOk = false;
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        var db = firebase.firestore();
        await db.collection('prospects').add({
          ...doc,
          // Use server timestamp when the client SDK is available so
          // ordering is honest under clock skew.
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          clientCreatedAt: doc.createdAt,
        });
        firestoreOk = true;
      }
    } catch(e) {
      // Permission denied, network blocked, App Check failure — fall
      // through to the server endpoint.
      firestoreOk = false;
    }
    if (!firestoreOk) {
      try {
        var r = await fetch('/api/log-prospect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        });
        if (!r.ok) throw new Error('log-prospect ' + r.status);
      } catch(e) {
        // Both paths failed. Surface the error so the caller can show a
        // softer "we couldn't save that, sign in works too" message.
        throw e;
      }
    }
    // Analytics signal regardless of which path landed.
    try {
      if (window.gtag) {
        window.gtag('event', 'prospect_capture', {
          source: payload.source || 'unknown',
          has_phone: !!payload.phone,
        });
      }
    } catch(e){}
    // Mark so the same browser doesn't get re-prompted across surfaces.
    try { localStorage.setItem('debatable-prospect-captured', String(Date.now())); } catch(e){}
    return { ok: true, via: firestoreOk ? 'firestore' : 'function' };
  }

  // ── Already-captured helper ───────────────────────────────────────
  function alreadyCaptured(){
    try { return !!localStorage.getItem('debatable-prospect-captured'); } catch(e){ return false; }
  }

  // ── UI ────────────────────────────────────────────────────────────
  // Renders directly into a container element. Theme-aware via CSS vars
  // (--text, --text-dim, --border, --accent) so it adopts the host
  // page's palette without per-surface styling. Falls back to dark
  // defaults when those vars aren't defined.
  function mount(container, opts){
    if (!container || container.nodeType !== 1) return;
    opts = opts || {};
    var source = opts.source || 'unknown';
    var compact = !!opts.compact;
    var onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;

    // Inject scoped CSS once per page.
    if (!document.getElementById('prospect-capture-styles')) {
      var style = document.createElement('style');
      style.id = 'prospect-capture-styles';
      style.textContent =
        '.pc-wrap{display:flex;flex-direction:column;gap:8px;width:100%;font-family:inherit}' +
        '.pc-label{font-size:.72rem;font-weight:600;letter-spacing:.04em;color:var(--text-dim,#94a3b8);text-align:center;margin:2px 0 2px}' +
        '.pc-row{display:flex;gap:6px;align-items:stretch}' +
        '.pc-input{flex:1;min-width:0;padding:11px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.16));background:var(--c-surface2,rgba(255,255,255,.04));color:var(--text,#e4e8f0);font-size:.92rem;font-family:inherit;outline:none;transition:border-color .15s,background .15s}' +
        '.pc-input:focus{border-color:var(--accent,#ef4444);background:var(--c-surface,rgba(255,255,255,.06))}' +
        '.pc-input::placeholder{color:var(--text-dim,#94a3b8);opacity:.7}' +
        '.pc-submit{padding:11px 18px;border-radius:10px;border:none;background:var(--accent,#ef4444);color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background .15s,transform .15s}' +
        '.pc-submit:hover{background:#dc2626;transform:translateY(-1px)}' +
        '.pc-submit:disabled{opacity:.55;cursor:wait;transform:none}' +
        '.pc-phone-toggle{font-size:.74rem;color:var(--text-dim,#94a3b8);background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:center;padding:4px;text-decoration:underline;text-underline-offset:3px}' +
        '.pc-phone-toggle:hover{color:var(--text,#fff)}' +
        '.pc-phone-row{display:flex;gap:6px;align-items:stretch}' +
        '.pc-msg{font-size:.78rem;line-height:1.45;text-align:center;padding:6px 4px 0}' +
        '.pc-msg.err{color:#fca5a5}' +
        '.pc-msg.ok{color:#86efac}' +
        '.pc-privacy{font-size:.66rem;line-height:1.5;text-align:center;color:var(--text-dim,#94a3b8);opacity:.78;padding:6px 2px 0;font-weight:500;letter-spacing:.01em}' +
        '.pc-privacy a{color:inherit;text-decoration:underline;text-underline-offset:2px}' +
        '.pc-privacy a:hover{color:var(--text,#fff)}' +
        '.pc-success{padding:14px;border-radius:10px;background:rgba(34,197,94,.10);border:1px solid rgba(134,239,172,.32);color:var(--text,#e4e8f0);text-align:center;font-size:.88rem;line-height:1.5}' +
        '.pc-success strong{color:#86efac;display:block;margin-bottom:4px;font-size:.95rem}' +
        '.pc-success-priv{display:block;margin-top:6px;font-size:.7rem;opacity:.78;color:var(--text-dim,#94a3b8);letter-spacing:.02em}' +
        '[data-theme="light"] .pc-input{background:rgba(0,0,0,.03);color:#1a1a1f;border-color:rgba(0,0,0,.14)}' +
        '[data-theme="light"] .pc-input:focus{background:#fff}' +
        '[data-theme="light"] .pc-phone-toggle{color:#5a5a64}' +
        '[data-theme="light"] .pc-phone-toggle:hover{color:#1a1a1f}' +
        '[data-theme="light"] .pc-success{background:rgba(22,163,74,.08);color:#1a1a1f}' +
        '[data-theme="light"] .pc-success strong{color:#15803d}' +
        '[data-lighting="light"] .pc-input{background:rgba(0,0,0,.03);color:#1a1a1f;border-color:rgba(0,0,0,.14)}' +
        '[data-lighting="light"] .pc-success{background:rgba(22,163,74,.08);color:#1a1a1f}' +
        '';
      document.head.appendChild(style);
    }

    // Render shell.
    container.innerHTML =
      '<div class="pc-wrap" data-pc-source="' + escapeAttr(source) + '">' +
        '<div class="pc-label">Or drop an email so we can ping you when it sharpens</div>' +
        '<form class="pc-form" novalidate>' +
          '<div class="pc-row">' +
            '<input class="pc-input pc-email" type="email" inputmode="email" autocomplete="email" placeholder="you@school.edu" required />' +
            '<button class="pc-submit" type="submit">Save</button>' +
          '</div>' +
          '<div class="pc-phone-section" hidden>' +
            '<div class="pc-phone-row" style="margin-top:6px">' +
              '<input class="pc-input pc-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 555 0123 (optional)" />' +
            '</div>' +
          '</div>' +
          '<button class="pc-phone-toggle" type="button">+ add phone (optional)</button>' +
          '<div class="pc-privacy">Privacy is honored. No spam, no list rentals, no third-party trackers on this field. <a href="/privacy" target="_blank" rel="noopener">privacy policy</a></div>' +
          '<div class="pc-msg" role="status" aria-live="polite"></div>' +
        '</form>' +
      '</div>';

    var form = container.querySelector('.pc-form');
    var emailEl = container.querySelector('.pc-email');
    var phoneEl = container.querySelector('.pc-phone');
    var phoneSection = container.querySelector('.pc-phone-section');
    var phoneToggle = container.querySelector('.pc-phone-toggle');
    var msgEl = container.querySelector('.pc-msg');
    var submitBtn = container.querySelector('.pc-submit');

    phoneToggle.addEventListener('click', function(){
      var hidden = phoneSection.hasAttribute('hidden');
      if (hidden) {
        phoneSection.removeAttribute('hidden');
        phoneToggle.textContent = '− hide phone';
        try { phoneEl.focus(); } catch(e){}
      } else {
        phoneSection.setAttribute('hidden','');
        phoneToggle.textContent = '+ add phone (optional)';
      }
    });

    function setMsg(text, kind){
      msgEl.textContent = text || '';
      msgEl.className = 'pc-msg' + (kind ? ' ' + kind : '');
    }

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var email = (emailEl.value || '').trim();
      var phone = normalizePhone(phoneEl ? phoneEl.value : '');
      if (!validEmail(email)) {
        setMsg('That email looks off. Double-check the @ and the dot.', 'err');
        try { emailEl.focus(); } catch(_){}
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      setMsg('', '');
      try {
        await writeProspect({ email: email, phone: phone, source: source });
        // Replace the form with a success state.
        container.innerHTML =
          '<div class="pc-success">' +
            '<strong>Got it. ' + escapeHtml(email) + '</strong>' +
            "We'll ping you when there's something worth sharing." +
            '<span class="pc-success-priv">Privacy is honored. No spam, no list rentals.</span>' +
          '</div>';
        try { if (onSuccess) onSuccess({ email: email, phone: phone, source: source }); } catch(_){}
      } catch(err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save';
        setMsg("Couldn't save that. Try signing in with Google instead, it takes one click.", 'err');
      }
    });
  }

  // ── Tiny HTML escapers ────────────────────────────────────────────
  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function escapeAttr(s){ return escapeHtml(s); }

  window.ProspectCapture = {
    mount: mount,
    submit: writeProspect,  // exposed so callers can submit programmatically
    validEmail: validEmail,
    normalizePhone: normalizePhone,
    alreadyCaptured: alreadyCaptured,
  };
})();
