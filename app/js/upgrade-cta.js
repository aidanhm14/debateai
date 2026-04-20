// ──────────────────────────────────────────────────────────────────
// Persistent Upgrade CTA — a small floating "Upgrade" pill in the
// bottom-right of every page. Visible only for signed-in free users;
// hidden for paid plans, hidden for signed-out visitors (those get
// the landing-page CTA instead). Clicking routes to /pricing.
//
// Drop-in: <script src="/js/upgrade-cta.js" defer></script>
// Pairs with /js/track.js (shares Firebase auth) and /js/usage-banner.js
// (usage banner is at the top; upgrade CTA is at the bottom, so they
// don't compete for space).
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: ['AIzaSyDDx', 'TYlyWLOJnFP99', 'e7XsLPb3FwIEijNNM'].join(''),
    authDomain: 'debateos-78ac5.firebaseapp.com',
    projectId: 'debateos-78ac5',
    storageBucket: 'debateos-78ac5.firebasestorage.app',
    messagingSenderId: '860359449192',
    appId: '1:860359449192:web:f5dc0060dbd50d6c4fb9dd',
  };
  const SDK_VERSION = '10.7.1';
  const PRICING_URL = '/pricing';
  const REFRESH_MS = 120_000; // Re-check team plan every 2 min.
  const DISMISS_HOURS = 24;   // Respect a dismiss for a day.

  let currentUser = null;
  let rootEl = null;
  let pollTimer = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureFirebase() {
    if (!window.firebase || !firebase.initializeApp) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
    }
    if (!window.firebase.auth) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-auth-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  }

  function isDismissed() {
    try {
      const until = parseInt(localStorage.getItem('_da_upg_dismiss_until') || '0', 10);
      return Date.now() < until;
    } catch { return false; }
  }

  function dismiss() {
    try {
      localStorage.setItem('_da_upg_dismiss_until', String(Date.now() + DISMISS_HOURS * 3600_000));
    } catch {}
    if (rootEl) rootEl.style.display = 'none';
  }

  function ensureRoot() {
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'da-upgrade-cta';
    rootEl.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:99998',
      'font-family:Inter,system-ui,-apple-system,sans-serif',
      'display:none',
    ].join(';');
    const append = () => document.body && document.body.appendChild(rootEl);
    if (document.body) append();
    else document.addEventListener('DOMContentLoaded', append);
    return rootEl;
  }

  function render(state) {
    const root = ensureRoot();
    if (state === 'hidden') { root.style.display = 'none'; root.innerHTML = ''; return; }
    if (isDismissed()) { root.style.display = 'none'; return; }

    root.innerHTML = '';
    const card = document.createElement('div');
    card.style.cssText = [
      'background:linear-gradient(135deg,#ef4444,#dc2626)',
      'color:#fff',
      'padding:12px 18px 12px 16px',
      'border-radius:14px',
      'box-shadow:0 12px 40px -10px rgba(239,68,68,.6), 0 0 0 1px rgba(255,255,255,.08) inset',
      'display:flex',
      'align-items:center',
      'gap:14px',
      'max-width:340px',
      'font-size:.82rem',
      'font-weight:600',
      'line-height:1.35',
      'animation:daSlideIn .35s ease-out',
    ].join(';');

    // Inline keyframes once.
    if (!document.getElementById('da-upg-anim')) {
      const st = document.createElement('style');
      st.id = 'da-upg-anim';
      st.textContent = '@keyframes daSlideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
      document.head.appendChild(st);
    }

    const icon = document.createElement('div');
    icon.style.cssText = 'width:30px;height:30px;flex-shrink:0;border-radius:8px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:1.05rem';
    icon.textContent = '\u26A1';
    card.appendChild(icon);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:800;font-size:.88rem;letter-spacing:.01em;margin-bottom:2px';
    title.textContent = state === 'capped' ? "You've hit the free cap" : 'Unlock everything for $5/mo';
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:.72rem;opacity:.85;font-weight:500';
    sub.textContent = state === 'capped'
      ? 'Resume unlimited drafts + all 4 brains.'
      : '250 drafts/mo · Sneaky · Opp Attack · Live';
    body.appendChild(title);
    body.appendChild(sub);
    card.appendChild(body);

    const cta = document.createElement('a');
    cta.href = PRICING_URL;
    cta.textContent = 'See plans';
    cta.style.cssText = [
      'background:#fff',
      'color:#dc2626',
      'padding:7px 13px',
      'border-radius:999px',
      'font-weight:800',
      'font-size:.74rem',
      'text-decoration:none',
      'letter-spacing:.04em',
      'text-transform:uppercase',
      'white-space:nowrap',
      'flex-shrink:0',
      'transition:.15s',
    ].join(';');
    cta.onmouseenter = () => { cta.style.background = '#fef2f2'; };
    cta.onmouseleave = () => { cta.style.background = '#fff'; };
    card.appendChild(cta);

    const close = document.createElement('button');
    close.setAttribute('aria-label', 'Dismiss for 24h');
    close.innerHTML = '&times;';
    close.style.cssText = [
      'background:transparent',
      'border:none',
      'color:rgba(255,255,255,.7)',
      'font-size:1.2rem',
      'cursor:pointer',
      'padding:0 2px',
      'margin-left:-4px',
      'line-height:1',
      'flex-shrink:0',
      'font-family:inherit',
    ].join(';');
    close.onclick = (e) => { e.preventDefault(); dismiss(); };
    card.appendChild(close);

    root.appendChild(card);
    root.style.display = 'block';
  }

  async function checkPlan() {
    if (!currentUser) { render('hidden'); return; }
    try {
      const token = await currentUser.getIdToken();
      const r = await fetch('/api/teams/usage', { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 404) {
        // No team yet — definitely a free user. Show CTA.
        render('default');
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      const plan = data.plan;
      const isPaid = plan && plan !== 'trial' && ['individual','team','lifetime','byok'].includes(plan);
      if (isPaid) { render('hidden'); return; }
      const used = data.usageThisPeriod || 0;
      const limit = data.usageLimit || 0;
      if (limit > 0 && used >= limit) render('capped');
      else render('default');
    } catch (e) { /* silent */ }
  }

  async function init() {
    // Skip on the pricing page itself (obvious) and the admin dashboard.
    const path = location.pathname;
    if (path === '/pricing' || path.endsWith('/pricing.html')) return;
    if (path === '/admin' || path.endsWith('/admin.html')) return;

    await ensureFirebase();
    firebase.auth().onAuthStateChanged((user) => {
      currentUser = user || null;
      if (!user) { render('hidden'); if (pollTimer) clearInterval(pollTimer); return; }
      checkPlan();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(checkPlan, REFRESH_MS);
    });
  }

  init().catch(e => { if (window.console && console.warn) console.warn('[upgrade-cta]', e.message); });
})();
