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
      // Bottom-LEFT, above the read-aloud pill (left:16/bottom:16). The
      // bottom-right corner belongs to the signup nudge + feedback pill;
      // parking here means the nudge can pop later without stacking on us.
      '.lpull{position:fixed;left:18px;bottom:88px;z-index:12000;width:min(340px,calc(100vw - 28px));' +
        'background:#fffdf8;border:1px solid #e8e2dc;border-radius:18px;padding:18px 18px 16px;' +
        'box-shadow:0 24px 60px rgba(31,26,23,.22);font-family:"Archivo",Georgia,serif;color:#1d1d22;' +
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
        'border:1px solid #ef4444;background:#b91c1c;color:#fff;border-radius:999px;padding:11px 16px;' +
        'font:800 .95rem "Archivo",Georgia,serif;text-decoration:none;transition:background .15s}' +
      '.lpull-cta:hover{background:#d32929}' +
      '.lpull-later{appearance:none;border:none;background:transparent;color:#68625f;cursor:pointer;' +
        'font:700 .85rem "Archivo",Georgia,serif;padding:10px 8px}' +
      '.lpull-later:hover{color:#68625f}' +
      // Phones: one bar across the foot of the screen rather than a
      // 340px slab wedged next to the feedback pill, which read as two
      // competing floating objects on a 375px screen.
      '@media(max-width:560px){.lpull{left:12px;right:12px;bottom:66px;width:auto;padding:15px 15px 13px;border-radius:16px}' +
        '.lpull-title{font-size:1.1rem}.lpull-body{font-size:.87rem;margin-bottom:12px}}' +
      '@media(prefers-reduced-motion:reduce){.lpull{transition:none}.lpull-kicker i{animation:none}}';
    document.head.appendChild(s);
  }

  function showCard(waiting, trigger) {
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

    // device + trigger ride every event this card emits. Without them a
    // single blended CTR hides which half of the arm is working, and the
    // two halves no longer fire at the same moment in the visit.
    var tag = { waiting: n, device: isPhone() ? 'mobile' : 'desktop', trigger: trigger || 'timer' };
    emit('live_pull_seen', tag);
    function click(action) {
      var p = { waiting: tag.waiting, device: tag.device, trigger: tag.trigger, action: action };
      emit('live_pull_click', p);
    }

    // The signup nudge outranks this card. On narrow screens it goes
    // full-width at the bottom and would sit under us, so if it appears
    // and actually overlaps, get out of the way (snooze is already set).
    var yieldT = setInterval(function () {
      if (!card.isConnected) { clearInterval(yieldT); return; }
      var nudge = document.querySelector('.signup-nudge');
      if (!nudge) return;
      var a = card.getBoundingClientRect();
      var b = nudge.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 &&
          a.left < b.right && b.left < a.right &&
          a.top < b.bottom && b.top < a.bottom) {
        clearInterval(yieldT);
        card.remove();
      }
    }, 800);

    var later = card.querySelector('.lpull-later');
    if (later) later.addEventListener('click', function () {
      click('dismiss');
      stamp(SNOOZE_KEY);
      card.remove();
    });
    if (n > 0) {
      // An anchor, so the event has to go out before the navigation does.
      var join = card.querySelector('.lpull-cta');
      if (join) join.addEventListener('click', function () { click('join_waiting'); });
    }
    if (n === 0) {
      var go = card.querySelector('.lpull-cta');
      go.addEventListener('click', function () {
        click('go_available');
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

  /* Subtract yourself. /api/live-now is shared-cached and counts every
     waiting doc, yours included, so a lone available user was told "1
     waiting to spar" and sent to meet themselves. isAvailable() is the
     exact answer for the background matcher; the uid scan covers a queue
     joined on another surface, and is exact whenever the count fits
     inside the sample the endpoint returns. */
  function minusSelf(j) {
    var n = Math.max(0, (j && j.count | 0) || 0);
    if (!n) return 0;
    var mine = false;
    try { mine = !!(window.DASparLive && window.DASparLive.isAvailable && window.DASparLive.isAvailable()); } catch (e) {}
    if (!mine) {
      var me = '';
      try {
        if (window.DASparLive && window.DASparLive.uid) me = String(window.DASparLive.uid() || '');
        if (!me) {
          var fb = window.firebase;
          if (fb && fb.apps && fb.apps.length && typeof fb.auth === 'function') {
            var cu = fb.auth().currentUser;
            me = (cu && cu.uid) ? String(cu.uid) : '';
          }
        }
      } catch (e) {}
      var rows = (j && j.debaters) || [];
      for (var i = 0; me && i < rows.length; i++) {
        if (rows[i] && String(rows[i].uid) === me) { mine = true; break; }
      }
    }
    return Math.max(0, n - (mine ? 1 : 0));
  }

  function pull(trigger) {
    fetch('/api/live-now', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var n = minusSelf(j);
        whenModalFree(function () {
          showCard(n, trigger);
          stamp(SNOOZE_KEY);
        });
      })
      .catch(function () { /* function down — no popup */ });
  }

  // On a phone the card is nearly the full width of the screen, so at
  // 4.5s it landed on top of the example-round board — the one thing on
  // the first screen that shows a stranger what a round IS. Outside
  // feedback (relayed by the founder, 2026-08-25) read the first screen as
  // "way too much going on", and this was the loudest part of it: a
  // ribbon, a topbar, two CTAs, a sign-in ask and then an overlay,
  // inside five seconds.
  //
  // So the phone gate is not "sooner or later", it is "not until the
  // demo has played". The board runs RUN_MS 3400 + HOLD_MS 6200 in
  // landing.html, so ONE COMPLETE ROUND — clock, motion, verdict, and
  // the verdict's hold — is 9.6 seconds. Two triggers, whichever lands
  // first:
  //
  //   scroll  the visitor has scrolled past the first screen, so they
  //           are done with it whether or not they watched the board.
  //   dwell   DWELL_MS of VISIBLE time, sized past that 9.6s cycle so
  //           the verdict has landed and held before anything covers
  //           it. This is the one that matters: the first cut of this
  //           gate had scroll only, which silently dropped every phone
  //           visitor who never scrolls — and on the strongest
  //           conversion surface the site has, that is a worse bug than
  //           the overlay it fixed.
  //
  // Dwell counts visible time only, and the beat resets its clock on
  // every visibility change, so a backgrounded tab accrues nothing and
  // cannot fire the card at a visitor who is not looking. Same posture
  // as the presence human-gate.
  //
  // Desktop is unchanged (the card is a 340px corner slab there and
  // covers nothing). Both arms of landing_live_pull_v1 are assigned
  // before this point, so the experiment population is untouched; what
  // changes is WHEN the pull arm fires on a phone. live_pull_seen and
  // live_pull_click now carry device + trigger so mobile and desktop,
  // and scroll and dwell, are separable in GA4 rather than a note in a
  // commit message.
  var PHONE_MAX = 700;
  var DWELL_MS = 12000;   // > one 9.6s demo round, with margin

  function isPhone() {
    try { return window.innerWidth < PHONE_MAX; } catch (e) { return false; }
  }

  function armPull() {
    if (!isPhone()) {
      setTimeout(function () { pull('timer'); }, 4500);
      return;
    }

    var fired = false;
    var dwell = 0;
    var last = Date.now();
    var beat = null;

    function fire(trigger, delay) {
      if (fired) return;
      fired = true;
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      if (beat) { clearInterval(beat); beat = null; }
      setTimeout(function () { pull(trigger); }, delay);
    }
    // The viewport height is not always measurable at boot (a detached
    // or not-yet-laid-out tab reports 0), and `scrollY >= 0 * 0.75` is
    // trivially true, which would open the gate instantly and put the
    // card straight back on top of the board. Measured here: the card
    // appeared at 6.7s at scrollY 48. So an unmeasurable viewport is
    // not a scrolled one — wait for a real number and let dwell or a
    // later scroll event carry it.
    function onScroll() {
      var vh = window.innerHeight || 0;
      if (vh < 200) return;
      if (window.scrollY >= vh * 0.75) fire('scroll', 600);
    }
    function onVis() { last = Date.now(); }

    beat = setInterval(function () {
      var now = Date.now();
      if (!document.hidden) dwell += now - last;
      last = now;
      if (dwell >= DWELL_MS) fire('dwell', 0);
    }, 500);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    onScroll();   // deep-link / restored scroll position counts as scrolled
  }

  function boot() {
    tryAutoEnlist();
    if (fresh(SNOOZE_KEY)) return;
    armPull();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
