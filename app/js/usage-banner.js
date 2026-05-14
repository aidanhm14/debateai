// ──────────────────────────────────────────────────────────────────
// Usage banner — shows "X / N requests remaining this month" on
// every page a user visits while signed in. Converts once they hit
// ~70% usage, aggressive upgrade nudge at 90%+.
//
// Drop-in: <script src="/js/usage-banner.js" defer></script>
// Needs the page to have Firebase compat auth available (usually
// co-loaded with /js/track.js — load both and they share the SDK).
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
  const POLL_MS = 45_000; // Re-fetch usage every 45s so the banner stays live.
  const MANAGE_URL = 'https://debateai.com/app#team';

  let currentUser = null;
  let lastUsage = null;
  let pollTimer = null;
  let rootEl = null;

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
    rootEl.style.cssText = [
      'position:fixed',
      'top:0',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99999',
      'padding:0',
      'pointer-events:none',
      'max-width:100%',
      'font-family:Inter,system-ui,-apple-system,sans-serif',
    ].join(';');
    if (document.body) document.body.appendChild(rootEl);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(rootEl));
    return rootEl;
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

  function render(usage) {
    const root = ensureRoot();
    if (!usage) { root.innerHTML = ''; return; }

    const used = usage.usageThisPeriod || 0;
    const limit = usage.usageLimit || 0;
    const plan = usage.plan || 'trial';
    const isPaid = plan && plan !== 'trial';

    const sev = severityFor(used, limit);
    // Hide entirely when comfortable. Paid users see it past 50% (budget
    // awareness is useful). Free users only see it once they're actually
    // running low (75%+) — the constant pre-cap "X / N requests" banner
    // signaled "this is a paid product" too aggressively. Softened 2026-05-14.
    if (!sev && isPaid) { root.innerHTML = ''; return; }
    if (!isPaid) {
      const pct = limit > 0 ? (used / limit) * 100 : 0;
      if (pct < 75) { root.innerHTML = ''; return; }
    }

    // Default palette when we decided to show without a hit-the-floor trigger.
    const palette = sev || { bg: '#3b82f618', border: '#3b82f644', text: '#60a5fa', label: 'used' };
    const remaining = Math.max(0, limit - used);
    const ctaText = isPaid ? 'Manage' : 'Upgrade';

    root.innerHTML = '';
    const pill = document.createElement('div');
    pill.style.cssText = [
      'margin:10px 12px 0',
      'padding:7px 12px',
      'background:' + palette.bg,
      'border:1px solid ' + palette.border,
      'color:' + palette.text,
      'border-radius:999px',
      'font-size:12px',
      'font-weight:600',
      'display:inline-flex',
      'align-items:center',
      'gap:10px',
      'pointer-events:auto',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'box-shadow:0 4px 16px rgba(0,0,0,.25)',
      'letter-spacing:.02em',
      'white-space:nowrap',
      'max-width:calc(100vw - 24px)',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');

    const msg = document.createElement('span');
    msg.textContent = used + ' / ' + limit + ' requests this month \u00b7 ' +
      (remaining === 0 ? 'cap reached' : remaining + ' left');
    pill.appendChild(msg);

    const cta = document.createElement('a');
    cta.href = MANAGE_URL;
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

    root.appendChild(pill);
  }

  async function fetchUsage() {
    if (!currentUser) return;
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
          // counter inside debate-ai.html already shows their quota; the
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
      currentUser = user || null;
      if (!user) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (rootEl) rootEl.innerHTML = '';
        return;
      }
      fetchUsage();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(fetchUsage, POLL_MS);
    });

    // Also refresh when the tab becomes visible again — users often come
    // back after generating on another tab and want to see the updated count.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUser) fetchUsage();
    });
  }

  init().catch((e) => { if (window.console && console.warn) console.warn('[usage-banner]', e.message); });
})();
