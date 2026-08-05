/* live-pull.js — landing-only live-spar pull-in.
 *
 * Two jobs, both under the landing_live_pull_v1 experiment ('pull' arm):
 *
 *   1. POPUP. A few seconds after load, read /api/live-now once. If a
 *      debater is waiting, the card pulls the visitor straight at the
 *      round (/spar runs the real matchmaker on arrival). If nobody is
 *      waiting, the card offers one-tap availability: the sitewide
 *      background matcher (js/notifications.js) then pops its
 *      Accept/Decline match card the moment an opponent shows up.
 *
 *   2. AUTO-ENLIST. Signed-in, non-anonymous visitors are quietly
 *      marked available on load, so an active seeker elsewhere can
 *      match them. Consent is preserved downstream: the match card
 *      always requires an explicit Accept, never a redirect. Anonymous
 *      visitors are NOT auto-enlisted (that would mint a Firebase anon
 *      account plus queue writes for every drive-by visitor, the exact
 *      free-tier drain the 2026-05 audits were about); they get the
 *      popup instead. Auto-enlist re-arms at most once per 24h, so a
 *      user who flips the pill off stays off for at least a day.
 *
 * QA: ?livepull=pull|control forces the arm; ?livepull=off disables.
 * Frequency: popup at most once per 24h; "Not now" snoozes 24h.
 */
(function () {
  'use strict';

  var AB_KEY = 'da-lpull-ab';
  var SNOOZE_KEY = 'da-lpull-snooze';
  var AUTO_KEY = 'da-lpull-auto';
  var DAY = 24 * 60 * 60 * 1000;

  var qs = '';
  try { qs = (location.search || '').toLowerCase(); } catch (e) {}
  if (/[?&]livepull=off(?:&|$)/.test(qs)) return;

  var forced = false;
  var arm = '';
  if (/[?&]livepull=pull(?:&|$)/.test(qs)) { arm = 'pull'; forced = true; }
  else if (/[?&]livepull=control(?:&|$)/.test(qs)) { arm = 'control'; forced = true; }
  if (!arm) {
    try {
      arm = localStorage.getItem(AB_KEY) || '';
      if (arm !== 'pull' && arm !== 'control') {
        arm = Math.random() < 0.5 ? 'pull' : 'control';
        localStorage.setItem(AB_KEY, arm);
      }
    } catch (e) { arm = 'pull'; }
  }
  window.__abAssignments = window.__abAssignments || {};
  window.__abAssignments.landing_live_pull_v1 = forced ? { variant: arm, forced: true } : { variant: arm };
  if (arm !== 'pull') return;

  function emit(name, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    } catch (e) {}
  }
  function stamp(key) {
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
  }
  function fresh(key) {
    try { return Date.now() - (parseInt(localStorage.getItem(key), 10) || 0) < DAY; } catch (e) { return false; }
  }

  // ── auto-enlist (signed-in named accounts only) ──────────────────
  function tryAutoEnlist() {
    if (fresh(AUTO_KEY)) return;
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      if (tries > 40) { clearInterval(t); return; }   // ~10s then give up
      var api = window.DASparLive;
      var auth = null;
      try { auth = window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length ? window.firebase.auth() : null; } catch (e) {}
      if (!api || !auth) return;
      var u = auth.currentUser;
      if (!u) return;               // keep waiting; onAuthStateChanged may still land
      clearInterval(t);
      if (u.isAnonymous || api.isAvailable()) return;
      stamp(AUTO_KEY);
      api.setAvailable(true, true);
      emit('live_pull_autoenlist', {});
    }, 250);
  }

  // ── popup ────────────────────────────────────────────────────────
  function css() {
    var s = document.createElement('style');
    s.textContent =
      '.lpull{position:fixed;right:18px;bottom:88px;z-index:12000;width:min(340px,calc(100vw - 28px));' +
        'background:#fffdf8;border:1px solid #e8e2dc;border-radius:18px;padding:18px 18px 16px;' +
        'box-shadow:0 24px 60px rgba(31,26,23,.22);font-family:"Crimson Pro",Georgia,serif;color:#1d1d22;' +
        'transform:translateY(14px);opacity:0;transition:transform .28s ease,opacity .28s ease}' +
      '.lpull.on{transform:none;opacity:1}' +
      '.lpull-kicker{display:inline-flex;align-items:center;gap:7px;color:#d32929;font-weight:900;' +
        'letter-spacing:.14em;text-transform:uppercase;font-size:.66rem;margin-bottom:8px}' +
      '.lpull-kicker i{width:8px;height:8px;border-radius:50%;background:#ef4444;' +
        'box-shadow:0 0 0 5px rgba(239,68,68,.12);animation:lpullPulse 1.6s ease-in-out infinite}' +
      '@keyframes lpullPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      '.lpull-title{font-size:1.22rem;font-weight:900;line-height:1.15;margin:0 0 6px}' +
      '.lpull-body{font-size:.92rem;line-height:1.4;color:#68625f;margin:0 0 14px}' +
      '.lpull-row{display:flex;gap:8px;align-items:center}' +
      '.lpull-cta{flex:1;display:inline-flex;align-items:center;justify-content:center;appearance:none;cursor:pointer;' +
        'border:1px solid #ef4444;background:#ef4444;color:#fff;border-radius:999px;padding:11px 16px;' +
        'font:800 .95rem "Crimson Pro",Georgia,serif;text-decoration:none;transition:background .15s}' +
      '.lpull-cta:hover{background:#d32929}' +
      '.lpull-later{appearance:none;border:none;background:transparent;color:#9b9692;cursor:pointer;' +
        'font:700 .85rem "Crimson Pro",Georgia,serif;padding:10px 8px}' +
      '.lpull-later:hover{color:#68625f}' +
      '@media(prefers-reduced-motion:reduce){.lpull{transition:none}.lpull-kicker i{animation:none}}';
    document.head.appendChild(s);
  }

  function showCard(waiting) {
    css();
    var card = document.createElement('aside');
    card.className = 'lpull';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Live debate');
    var n = waiting > 0 ? waiting : 0;
    if (n > 0) {
      card.innerHTML =
        '<div class="lpull-kicker"><i></i>Live now</div>' +
        '<p class="lpull-title">' + n + (n === 1 ? ' debater is' : ' debaters are') + ' waiting to spar.</p>' +
        '<p class="lpull-body">A live round is one tap away. Walk in, argue, read the ballot.</p>' +
        '<div class="lpull-row">' +
          '<a class="lpull-cta" href="/spar?from=live-pull" data-ab-test="landing_live_pull_v1" data-ab-target="join_waiting">Debate them now</a>' +
          '<button class="lpull-later" type="button">Not now</button>' +
        '</div>';
    } else {
      card.innerHTML =
        '<div class="lpull-kicker"><i></i>Live rounds</div>' +
        '<p class="lpull-title">Debate a human, live.</p>' +
        '<p class="lpull-body">Go available and the moment a debater shows up, we pull you into a round. You keep browsing until then.</p>' +
        '<div class="lpull-row">' +
          '<button class="lpull-cta" type="button" data-ab-test="landing_live_pull_v1" data-ab-target="go_available">Go available</button>' +
          '<button class="lpull-later" type="button">Not now</button>' +
        '</div>';
    }
    document.body.appendChild(card);
    setTimeout(function () { card.classList.add('on'); }, 30);
    emit('live_pull_seen', { waiting: n });

    var later = card.querySelector('.lpull-later');
    if (later) later.addEventListener('click', function () {
      stamp(SNOOZE_KEY);
      card.remove();
    });
    if (n === 0) {
      var go = card.querySelector('.lpull-cta');
      go.addEventListener('click', function () {
        if (window.DASparLive) window.DASparLive.setAvailable(true);
        card.querySelector('.lpull-title').textContent = 'You are matchable.';
        card.querySelector('.lpull-body').textContent = 'Keep this tab open. The moment an opponent is ready, a match card pops and you accept into the round.';
        go.remove();
        stamp(SNOOZE_KEY);
      });
    }
  }

  // Never talk over an open modal (auth, signup nudge, intro). Wait
  // until the screen is modal-free, up to a minute, then show.
  function whenModalFree(fn, waited) {
    waited = waited || 0;
    var blocked = false;
    try {
      var dialogs = document.querySelectorAll('[role="dialog"],[aria-modal="true"],.ob-modal.is-open');
      for (var i = 0; i < dialogs.length; i++) {
        var d = dialogs[i];
        if (d.classList.contains('lpull')) continue;
        var r = d.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { blocked = true; break; }
      }
    } catch (e) {}
    if (!blocked) { fn(); return; }
    if (waited >= 60000) return;   // modal never closed — skip this visit
    setTimeout(function () { whenModalFree(fn, waited + 2000); }, 2000);
  }

  function boot() {
    tryAutoEnlist();
    if (fresh(SNOOZE_KEY)) return;
    setTimeout(function () {
      fetch('/api/live-now', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var n = j && typeof j.count === 'number' ? j.count : 0;
          whenModalFree(function () {
            showCard(n);
            stamp(SNOOZE_KEY);
          });
        })
        .catch(function () { /* function down — no popup */ });
    }, 4500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
