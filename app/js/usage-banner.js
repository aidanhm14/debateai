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
  let dismissTimer = null;
  // The pill is informational, not modal — sitting in the topbar
  // forever feels naggy, especially at cap-reached where the user has
  // already seen it. Auto-fade after AUTO_DISMISS_MS so it surfaces,
  // registers, and gets out of the way.
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
    // 2026-05-26 (rev2): banner moved off center entirely. At top:60
    // center the cap-reached pill was overlapping the hero headline
    // ("Debate it. Debate it. Debate it.") in Aidan's screenshot —
    // both were center-anchored, both at similar vertical positions
    // on a 1440x900 viewport. Moved to top-right corner so it sits
    // contextually near the user-avatar / "Aidan OUT" cluster in the
    // topbar (which is where "your usage" mentally belongs) and out
    // of the hero headline column entirely.
    rootEl.style.cssText = [
      'position:fixed',
      // Ride below the founding-cohort strip when it's present —
      // cohort-banner.js publishes its height as --cohort-banner-h
      // (the topbar shifts by the same var). Without this the pill
      // sat ON the red strip, red-on-red.
      'top:calc(14px + var(--cohort-banner-h, 0px))',
      'right:14px',
      'left:auto',
      'transform:none',
      'z-index:9000',
      'padding:0',
      'pointer-events:none',
      'max-width:min(380px, calc(100vw - 28px))',
      'font-family:Crimson Pro,Inter,system-ui,-apple-system,sans-serif',
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

  // Auto-dismiss timer for the "cap reached" banner only. The lower-
  // severity banners (50/75/90%) stay put — they're useful nudges that
  // a user can act on. The "cap reached" banner is a one-time signal:
  // user already hit zero, no further action is possible from the bar
  // itself, so leaving it there permanently just clutters the top of
  // every page. Fade it out ~5s after render so the message lands once.
  let capDismissTimer = null;
  let capFadeTimer = null;
  function clearCapDismissTimers() {
    if (capDismissTimer) { clearTimeout(capDismissTimer); capDismissTimer = null; }
    if (capFadeTimer)    { clearTimeout(capFadeTimer);    capFadeTimer    = null; }
  }

  function render(usage) {
    const root = ensureRoot();
    clearCapDismissTimers(); // a fresh render cancels any pending fade
    if (!usage) { root.innerHTML = ''; return; }

    const used = usage.usageThisPeriod || 0;
    const limit = usage.usageLimit || 0;
    const plan = usage.plan || 'trial';
    const isPaid = plan && plan !== 'trial';

    // used > limit means the cap is not actually being enforced (beta:
    // every tier is $0 and requests keep working past the plan number).
    // Showing "15 / 3 · cap reached · UPGRADE" is false scarcity wired
    // to a dead upgrade path — hide instead of lying.
    if (limit > 0 && used > limit) { root.innerHTML = ''; return; }

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

    // Smooth fade for the auto-dismiss + any hover cancel.
    pill.style.transition = 'opacity ' + FADE_MS + 'ms ease';

    root.appendChild(pill);

    // Auto-dismiss when at cap. 4.5s read window, then 600ms fade,
    // then remove from DOM. Honors prefers-reduced-motion by skipping
    // the opacity transition.
    if (remaining === 0) {
      const reduceMotion =
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      pill.style.transition = reduceMotion ? 'none' : 'opacity .6s ease, transform .6s ease';
      capDismissTimer = setTimeout(() => {
        if (!pill.isConnected) return;
        pill.style.opacity = '0';
        pill.style.transform = 'translateY(-8px)';
        capFadeTimer = setTimeout(() => {
          // Re-check root in case render() fired again between schedule and fire.
          if (root.contains(pill)) root.innerHTML = '';
        }, reduceMotion ? 0 : 620);
      }, 4500);
    }
    // Also auto-dismiss the standard pill after AUTO_DISMISS_MS so it
    // surfaces, then yanks itself to give the topbar its space back.
    // Re-renders (poll refresh, auth flip) reset the timer.
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(function () {
      if (!pill.isConnected) return;
      pill.style.opacity = '0';
      setTimeout(function () {
        if (pill.isConnected && root.contains(pill)) pill.remove();
      }, FADE_MS);
    }, AUTO_DISMISS_MS);
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
          // counter inside debate-it.html already shows their quota; the
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
