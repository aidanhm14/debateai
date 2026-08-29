// ──────────────────────────────────────────────────────────────────
// Usage surface — keeps low-usage alerts compact, then turns the free
// cap into a focused plan modal when there is a real decision to make.
//
// Drop-in: <script src="/js/usage-banner.js" defer></script>
// Needs the page to have Firebase compat auth available (usually
// co-loaded with /js/track.js — load both and they share the SDK).
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Native builds cannot steer people to web payment under App Store 3.1.1.
  if (window.__DB_NATIVE || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;

  const FIREBASE_CONFIG = {
    apiKey: ['AIzaSyDDx', 'TYlyWLOJnFP99', 'e7XsLPb3FwIEijNNM'].join(''),
    authDomain: 'debateos-78ac5.firebaseapp.com',
    projectId: 'debateos-78ac5',
    storageBucket: 'debateos-78ac5.firebasestorage.app',
    messagingSenderId: '860359449192',
    appId: '1:860359449192:web:f5dc0060dbd50d6c4fb9dd',
  };
  const SDK_VERSION = '10.13.2';
  const POLL_MS = 45_000; // Re-fetch usage every 45s so the banner stays live.
  const MANAGE_URL = 'https://itsdebatable.com/app#team';
  const PRICING_URL = '/pricing?source=usage-cap#plans';
  const CAP_DISMISS_KEY = '_da_usage_cap_dismissed';

  let currentUser = null;
  let lastUsage = null;
  let pollTimer = null;
  let rootEl = null;
  let dismissTimer = null;
  let modalOpen = false;
  let previousBodyOverflow = '';
  let previousActiveElement = null;
  const AUTO_DISMISS_MS = 5000;
  const FADE_MS = 400;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureFirebase() {
    if (!window.firebase || !window.firebase.initializeApp) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
    }
    if (!window.firebase.auth) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-auth-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  }

  function ensureRoot() {
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'da-usage-banner';
    rootEl.style.fontFamily = 'Archivo,Inter,system-ui,-apple-system,sans-serif';
    ensureStyles();
    if (document.body) document.body.appendChild(rootEl);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(rootEl));
    return rootEl;
  }

  function ensureStyles() {
    if (document.getElementById('da-usage-styles')) return;
    const style = document.createElement('style');
    style.id = 'da-usage-styles';
    style.textContent = [
      '#da-usage-banner.da-usage-pill-root{position:fixed;top:calc(14px + var(--cohort-banner-h,0px));right:14px;left:auto;z-index:9000;padding:0;pointer-events:none;max-width:min(380px,calc(100vw - 28px))}',
      '#da-usage-banner.da-cap-modal-root{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,16,24,.76);pointer-events:auto;overflow:auto;-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px)}',
      '#da-usage-banner .da-usage-pill{margin:10px 12px 0;padding:7px 12px;border:1px solid;display:inline-flex;align-items:center;gap:10px;border-radius:999px;font-size:12px;font-weight:600;pointer-events:auto;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,.25);letter-spacing:.02em;white-space:nowrap;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis}',
      '#da-usage-banner .da-cap-card{position:relative;width:min(620px,100%);overflow:hidden;border:1px solid rgba(220,38,38,.22);border-radius:28px;background:#fff;color:#171717;box-shadow:0 32px 90px rgba(0,0,0,.38);animation:daCapIn .28s cubic-bezier(.22,.9,.32,1) both}',
      '#da-usage-banner .da-cap-card:focus{outline:none}',
      '#da-usage-banner .da-cap-card::before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#ef4444,#b91c1c)}',
      '#da-usage-banner .da-cap-content{padding:38px 42px 40px}',
      '#da-usage-banner .da-cap-top{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}',
      '#da-usage-banner .da-cap-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#b91c1c;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}',
      '#da-usage-banner .da-cap-eyebrow-dot{width:9px;height:9px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 6px rgba(239,68,68,.1)}',
      '#da-usage-banner .da-cap-close{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#52525b;font:600 24px/1 Arial,sans-serif;cursor:pointer;transition:background .15s,color .15s,transform .15s}',
      '#da-usage-banner .da-cap-close:hover{background:#f4f4f5;color:#18181b;transform:translateY(-1px)}',
      '#da-usage-banner .da-cap-title{max-width:520px;margin:0;font-size:clamp(2rem,5vw,3.25rem);font-weight:900;line-height:1;letter-spacing:-.035em;color:#171717}',
      '#da-usage-banner .da-cap-lede{max-width:530px;margin:18px 0 26px;color:#52525b;font-size:1rem;line-height:1.6}',
      '#da-usage-banner .da-cap-offer{display:grid;grid-template-columns:170px 1fr;gap:20px;align-items:stretch;margin-bottom:24px}',
      '#da-usage-banner .da-cap-price{display:flex;flex-direction:column;justify-content:center;padding:22px;border-radius:20px;background:#171717;color:#fff}',
      '#da-usage-banner .da-cap-price strong{font-size:2.75rem;line-height:.9;letter-spacing:-.06em}',
      '#da-usage-banner .da-cap-price span{margin-top:8px;color:#d4d4d8;font-size:.82rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}',
      '#da-usage-banner .da-cap-benefits{display:grid;gap:10px;margin:0;padding:18px 20px;list-style:none;border:1px solid #e4e4e7;border-radius:20px;background:#fafafa}',
      '#da-usage-banner .da-cap-benefits li{display:flex;align-items:center;gap:10px;color:#27272a;font-size:.9rem;font-weight:700;line-height:1.35}',
      '#da-usage-banner .da-cap-check{display:grid;place-items:center;width:21px;height:21px;flex:0 0 auto;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:.75rem;font-weight:900}',
      '#da-usage-banner .da-cap-actions{display:flex;align-items:center;gap:12px}',
      '#da-usage-banner .da-cap-cta{display:flex;align-items:center;justify-content:center;min-height:54px;flex:1;padding:14px 22px;border-radius:15px;background:#dc2626;color:#fff;font-size:.94rem;font-weight:900;text-align:center;text-decoration:none;box-shadow:0 12px 28px rgba(220,38,38,.26);transition:background .15s,transform .15s,box-shadow .15s}',
      '#da-usage-banner .da-cap-cta:hover{background:#b91c1c;transform:translateY(-1px);box-shadow:0 16px 32px rgba(185,28,28,.3)}',
      '#da-usage-banner .da-cap-later{min-height:54px;padding:12px 17px;border:0;background:transparent;color:#71717a;font:700 .86rem/1 Archivo,Inter,system-ui,sans-serif;cursor:pointer}',
      '#da-usage-banner .da-cap-later:hover{color:#27272a}',
      '#da-usage-banner .da-cap-note{margin:13px 0 0;color:#a1a1aa;font-size:.73rem;line-height:1.45;text-align:center}',
      '@keyframes daCapIn{from{opacity:0;transform:translateY(18px) scale(.975)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@media(max-width:600px){#da-usage-banner.da-cap-modal-root{align-items:safe flex-end;padding:12px}#da-usage-banner .da-cap-card{border-radius:24px 24px 18px 18px}#da-usage-banner .da-cap-content{padding:28px 22px 24px}#da-usage-banner .da-cap-top{margin-bottom:16px}#da-usage-banner .da-cap-title{font-size:2.2rem}#da-usage-banner .da-cap-lede{margin:14px 0 20px;font-size:.92rem}#da-usage-banner .da-cap-offer{grid-template-columns:1fr;gap:10px}#da-usage-banner .da-cap-price{align-items:baseline;flex-direction:row;justify-content:flex-start;gap:10px;padding:18px 20px}#da-usage-banner .da-cap-price strong{font-size:2.35rem}#da-usage-banner .da-cap-price span{margin:0}#da-usage-banner .da-cap-actions{align-items:stretch;flex-direction:column}#da-usage-banner .da-cap-later{min-height:42px}}',
      '@media(max-width:600px) and (max-height:700px){#da-usage-banner .da-cap-content{padding:22px 20px 16px}#da-usage-banner .da-cap-top{margin-bottom:12px}#da-usage-banner .da-cap-title{font-size:2rem}#da-usage-banner .da-cap-lede{margin:10px 0 16px}#da-usage-banner .da-cap-offer{margin-bottom:18px}#da-usage-banner .da-cap-price{padding:15px 20px}#da-usage-banner .da-cap-benefits{gap:8px;padding:14px 20px}#da-usage-banner .da-cap-note{margin-top:8px}}',
      '@media(prefers-reduced-motion:reduce){#da-usage-banner .da-cap-card{animation:none}#da-usage-banner .da-cap-cta,#da-usage-banner .da-cap-close{transition:none}}',
    ].join('');
    document.head.appendChild(style);
  }

  // Palette tiered by how close to the cap the user is. We don't nag people
  // who just started — the banner stays invisible under 50% used.
  function severityFor(used, limit) {
    if (!limit) return null;
    const pct = (used / limit) * 100;
    if (pct < 50) return null;
    if (pct < 75) return { bg: '#22c55e18', border: '#22c55e44', text: '#4ade80', label: 'remaining' };
    if (pct < 90) return { bg: '#f59e0b18', border: '#f59e0b44', text: '#fbbf24', label: 'running low' };
    if (pct < 100) return { bg: '#ef444418', border: '#ef444455', text: '#fca5a5', label: 'almost out' };
    return { bg: '#ef444428', border: '#ef444488', text: '#ef4444', label: 'cap reached' };
  }

  function track(name, data) {
    try { if (window.gtag) window.gtag('event', name, data || {}); } catch (_) {}
    try { if (window.dosTrack) window.dosTrack(name, data || {}); } catch (_) {}
  }

  function capWasDismissed() {
    try { return sessionStorage.getItem(CAP_DISMISS_KEY) === '1'; }
    catch (_) { return false; }
  }

  function teardownModal() {
    if (!modalOpen) return;
    modalOpen = false;
    document.removeEventListener('keydown', handleModalKeydown);
    if (document.body) document.body.style.overflow = previousBodyOverflow;
    if (previousActiveElement && previousActiveElement.focus && previousActiveElement.isConnected) {
      try { previousActiveElement.focus({ preventScroll: true }); } catch (_) {}
    }
    previousActiveElement = null;
  }

  function clearRoot() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    teardownModal();
    if (!rootEl) return;
    rootEl.onclick = null;
    rootEl.className = '';
    rootEl.innerHTML = '';
  }

  function handleModalKeydown(event) {
    if (!modalOpen || !rootEl) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissCapModal('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(rootEl.querySelectorAll('a[href],button:not([disabled])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function dismissCapModal(reason) {
    try { sessionStorage.setItem(CAP_DISMISS_KEY, '1'); } catch (_) {}
    track('usage_cap_paywall_dismiss', { reason: reason || 'dismiss', plan: 'trial' });
    clearRoot();
  }

  function renderCapModal(used, limit) {
    const root = ensureRoot();
    clearRoot();
    root.className = 'da-cap-modal-root';

    const card = document.createElement('section');
    card.className = 'da-cap-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'da-cap-title');
    card.setAttribute('aria-describedby', 'da-cap-description');
    card.tabIndex = -1;

    const content = document.createElement('div');
    content.className = 'da-cap-content';

    const top = document.createElement('div');
    top.className = 'da-cap-top';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'da-cap-eyebrow';
    const dot = document.createElement('span');
    dot.className = 'da-cap-eyebrow-dot';
    dot.setAttribute('aria-hidden', 'true');
    const quota = document.createElement('span');
    quota.textContent = used + ' of ' + limit + ' free requests used';
    eyebrow.appendChild(dot);
    eyebrow.appendChild(quota);
    top.appendChild(eyebrow);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'da-cap-close';
    close.setAttribute('aria-label', 'Close plan offer');
    close.textContent = '\u00d7';
    close.addEventListener('click', () => dismissCapModal('close'));
    top.appendChild(close);
    content.appendChild(top);

    const title = document.createElement('h2');
    title.id = 'da-cap-title';
    title.className = 'da-cap-title';
    title.textContent = 'Keep the rounds coming.';
    content.appendChild(title);

    const lede = document.createElement('p');
    lede.id = 'da-cap-description';
    lede.className = 'da-cap-lede';
    lede.textContent = 'Individual gives you 250 requests every month, all 6 brains, and the tools to build the next case.';
    content.appendChild(lede);

    const offer = document.createElement('div');
    offer.className = 'da-cap-offer';
    const price = document.createElement('div');
    price.className = 'da-cap-price';
    const amount = document.createElement('strong');
    amount.textContent = '$10';
    const cadence = document.createElement('span');
    cadence.textContent = 'for a full year';
    price.appendChild(amount);
    price.appendChild(cadence);
    offer.appendChild(price);

    const benefits = document.createElement('ul');
    benefits.className = 'da-cap-benefits';
    ['250 requests each month', 'All 6 AI brains', 'Competition depth and memory'].forEach((text) => {
      const item = document.createElement('li');
      const check = document.createElement('span');
      check.className = 'da-cap-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '\u2713';
      item.appendChild(check);
      item.appendChild(document.createTextNode(text));
      benefits.appendChild(item);
    });
    offer.appendChild(benefits);
    content.appendChild(offer);

    const actions = document.createElement('div');
    actions.className = 'da-cap-actions';
    const cta = document.createElement('a');
    cta.className = 'da-cap-cta';
    cta.href = PRICING_URL;
    cta.textContent = 'See Individual for $10/year';
    cta.addEventListener('click', () => track('usage_cap_paywall_click', { plan: 'individual', price: 10 }));
    actions.appendChild(cta);
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'da-cap-later';
    later.textContent = 'Not now';
    later.addEventListener('click', () => dismissCapModal('not_now'));
    actions.appendChild(later);
    content.appendChild(actions);

    const note = document.createElement('p');
    note.className = 'da-cap-note';
    note.textContent = '$10/year is the current Individual price.';
    content.appendChild(note);
    card.appendChild(content);
    root.appendChild(card);

    root.onclick = (event) => {
      if (event.target === root) dismissCapModal('backdrop');
    };

    previousActiveElement = document.activeElement;
    previousBodyOverflow = document.body ? document.body.style.overflow : '';
    if (document.body) document.body.style.overflow = 'hidden';
    modalOpen = true;
    document.addEventListener('keydown', handleModalKeydown);
    window.setTimeout(() => card.focus({ preventScroll: true }), 0);
    track('usage_cap_paywall_view', { used, limit, plan: 'trial' });
  }

  function renderPill(used, limit, isPaid, palette) {
    const root = ensureRoot();
    clearRoot();
    root.className = 'da-usage-pill-root';
    const remaining = Math.max(0, limit - used);
    const ctaText = isPaid ? 'Manage' : 'Free vs Paid';

    const pill = document.createElement('div');
    pill.className = 'da-usage-pill';
    pill.style.background = palette.bg;
    pill.style.borderColor = palette.border;
    pill.style.color = palette.text;

    const msg = document.createElement('span');
    msg.textContent = used + ' / ' + limit + ' requests this month \u00b7 ' +
      (remaining === 0 ? 'cap reached' : remaining + ' left');
    pill.appendChild(msg);

    const cta = document.createElement('a');
    cta.href = isPaid ? MANAGE_URL : PRICING_URL;
    cta.textContent = ctaText;
    cta.style.cssText = [
      'padding:3px 10px',
      'background:' + palette.text,
      'color:#0b0f17',
      'border-radius:999px',
      'font-weight:800',
      'font-size:11px',
      'text-decoration:none',
      'letter-spacing:.04em',
      'text-transform:uppercase',
    ].join(';');
    pill.appendChild(cta);
    pill.style.transition = 'opacity ' + FADE_MS + 'ms ease';
    root.appendChild(pill);

    dismissTimer = setTimeout(function () {
      if (!pill.isConnected) return;
      pill.style.opacity = '0';
      setTimeout(function () {
        if (pill.isConnected && root.contains(pill)) pill.remove();
      }, FADE_MS);
    }, AUTO_DISMISS_MS);
  }

  function render(usage) {
    const root = ensureRoot();
    if (!usage) { clearRoot(); return; }

    const used = usage.usageThisPeriod || 0;
    const limit = usage.usageLimit || 0;
    const plan = usage.plan || 'trial';
    const isPaid = plan && plan !== 'trial';

    // used > limit means the cap is not actually being enforced. An earlier
    // rollout kept requests working past the plan number.
    // Showing "15 / 3 · cap reached · UPGRADE" is false scarcity wired
    // to a dead upgrade path — hide instead of lying.
    if (limit > 0 && used > limit) { clearRoot(); return; }

    const sev = severityFor(used, limit);
    // Hide entirely when comfortable. Paid users see it past 50% (budget
    // awareness is useful). Free users only see it once they're actually
    // running low (75%+) — the constant pre-cap "X / N requests" banner
    // signaled "this is a paid product" too aggressively. Softened 2026-05-14.
    if (!sev && isPaid) { clearRoot(); return; }
    if (!isPaid) {
      const pct = limit > 0 ? (used / limit) * 100 : 0;
      if (pct < 75) { clearRoot(); return; }
    }

    const palette = sev || { bg: '#3b82f618', border: '#3b82f644', text: '#60a5fa', label: 'used' };
    const remaining = Math.max(0, limit - used);
    if (remaining > 0 && !isPaid) {
      try { sessionStorage.removeItem(CAP_DISMISS_KEY); } catch (_) {}
    }
    if (remaining === 0 && !isPaid) {
      if (capWasDismissed()) { clearRoot(); return; }
      renderCapModal(used, limit);
      return;
    }

    renderPill(used, limit, isPaid, palette);
  }

  async function fetchUsage() {
    if (!currentUser) return;
    // Skip polling when the tab is hidden — usage doesn't change for a
    // user who isn't actively in the app, and idle tabs were hammering
    // /api/teams/usage every 45s while their owner was somewhere else.
    if (document.hidden) return;
    try {
      const token = await currentUser.getIdToken();
      const r = await fetch('/api/teams/usage', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok) {
        // 404 = user hasn't created a team yet; show a gentle nudge anyway
        // so they know the system uses teams + sees the settings entry.
        if (r.status === 404) {
          // No team yet — pre-cap free user. Stay hidden (the in-app
          // counter inside practice.html already shows their quota; the
          // global floating banner here would just double up the paid
          // signal).
        }
        return;
      }
      const data = await r.json();
      lastUsage = data;
      render(data);
    } catch (e) { /* silent */ }
  }

  async function init() {
    // Skip on the admin and auth-less marketing pages where showing usage
    // makes no sense. Landing / pricing / high-school are marketing surfaces.
    const path = location.pathname;
    const skip = [
      '/admin', '/admin.html', '/changelog', '/changelog.html',
    ];
    if (skip.some(p => path === p || path.endsWith(p))) return;

    await ensureFirebase();
    firebase.auth().onAuthStateChanged((user) => {
      currentUser = user && !user.isAnonymous ? user : null;
      if (!currentUser) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        clearRoot();
        return;
      }
      fetchUsage();
      if (pollTimer) clearInterval(pollTimer);
      // Hidden tabs skip the fetch; the visibilitychange handler below
      // refreshes immediately on return, so nothing is stale.
      pollTimer = setInterval(() => { if (!document.hidden) fetchUsage(); }, POLL_MS);
    });

    // Also refresh when the tab becomes visible again — users often come
    // back after generating on another tab and want to see the updated count.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUser) fetchUsage();
    });
  }

  init().catch((e) => { if (window.console && console.warn) console.warn('[usage-banner]', e.message); });
})();
