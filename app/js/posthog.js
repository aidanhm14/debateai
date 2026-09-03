// PostHog: session replay + product events for Debatable.
//
// Replaces the Microsoft Clarity loader (js/clarity.js, retired 2026-09-03,
// which shipped with a placeholder id for four months and never recorded a
// session). track.js injects this file, so coverage is exactly track.js's
// coverage: every public page. Pages without track.js (admin, og-image,
// offline, _more-preview) get nothing, on purpose.
//
// SETUP: paste the project API key (starts with "phc_") into POSTHOG_KEY.
// The key is a public write-only token and is safe in client code. A
// missing key makes this whole file a no-op.
//
// What is recorded, and what is not:
//   - Recording starts only after a browser-trusted pointer, key, or touch
//     event, the same gate the presence beat uses, so cloud renderers and
//     an untouched bounce are never recorded.
//   - Every input, textarea and contenteditable is masked. Sign-in forms,
//     motion fields and the round transcript box never reach PostHog.
//   - Direct messages and chat bodies are masked by selector, and the
//     inbox pages themselves are skipped entirely (SKIP_PATHS).
//   - <video>, <canvas> and <iframe> are blocked from the recorder: a camera
//     feed, a screen share, the Daily call or an avatar mask renders as an
//     empty box in the replay. Camera frames never leave the room.
//   - Named accounts are identified by Firebase uid only. Never a name,
//     never an email. Anonymous uids are not identified (see
//     feedback_anon_firebase_not_signed_in: an anonymous uid is a browser,
//     not a person).
//
// Kill switches: ?replay=off on any URL, or
// localStorage['debatable-replay'] = 'off', both per browser. REPLAY_SAMPLE
// below trims the share of sessions recorded if the free tier
// (5,000 replays a month) starts running out.
(function () {
  'use strict';
  var POSTHOG_KEY = 'PASTE_POSTHOG_PROJECT_KEY_HERE';
  var POSTHOG_HOST = 'https://us.i.posthog.com';
  var REPLAY_SAMPLE = 1; // 0..1 share of sessions that record a replay

  // Never here: the inbox and chat show other people's messages, and the
  // admin surfaces show other people's everything.
  var SKIP_PATHS = /^\/(messages|chat|inbox|admin[a-z-]*|og-image|offline|_more-preview)(\/|\.html|$)/;
  var MASK_TEXT = '.msg-b, .cx-msg, .disc-msg-main, [data-private]';

  if (window.__daPosthogLoaded) return;
  window.__daPosthogLoaded = true;

  if (!POSTHOG_KEY || POSTHOG_KEY.indexOf('phc_') !== 0) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (SKIP_PATHS.test(location.pathname)) return;
  try { if (navigator.webdriver === true) return; } catch (e) {}
  try {
    if (/[?&]replay=off\b/.test(location.search)) { localStorage.setItem('debatable-replay', 'off'); }
    if (localStorage.getItem('debatable-replay') === 'off') return;
  } catch (e) {}

  var signals = ['pointerdown', 'keydown', 'touchstart'];
  var started = false;

  function gateOff() {
    for (var n = 0; n < signals.length; n++) {
      try { window.removeEventListener(signals[n], start, true); } catch (e) {}
    }
  }

  // Firebase auth may already be on the page (practice, index) or arrive
  // later through track.js. Poll briefly rather than load our own copy:
  // a second SDK injection is the exact race the 2026-08-18 App Check
  // entry documents.
  function watchIdentity(ph) {
    var tries = 0;
    var identified = false;
    var timer = setInterval(function () {
      tries++;
      var fb = window.firebase;
      if (!(fb && fb.auth && fb.apps && fb.apps.length)) {
        if (tries > 40) clearInterval(timer); // ~20s, then give up
        return;
      }
      clearInterval(timer);
      try {
        fb.auth().onAuthStateChanged(function (user) {
          try {
            if (user && !user.isAnonymous) {
              identified = true;
              ph.identify(user.uid, { account_type: 'named' });
            } else if (identified) {
              identified = false;
              ph.reset();
            }
          } catch (e) {}
        });
      } catch (e) {}
    }, 500);
  }

  function start(event) {
    if (started || !event || event.isTrusted !== true) return;
    started = true;
    gateOff();

    // Official PostHog snippet (array.js), behind the interaction gate.
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: MASK_TEXT,
        blockSelector: 'video, canvas, iframe',
        recordCrossOriginIframes: false,
        sampleRate: REPLAY_SAMPLE,
      },
      persistence: 'localStorage+cookie',
      respect_dnt: true,
    });
    // Stamp the arm and theme the visitor was actually served, so a
    // replay can be filtered the way GA4 events already are.
    try {
      var html = document.documentElement;
      window.posthog.register({
        first_screen: html.getAttribute('data-first-screen') || '',
        theme: html.getAttribute('data-theme') || html.getAttribute('data-lighting') || '',
        native_app: !!window.__DB_NATIVE,
      });
    } catch (e) {}
    watchIdentity(window.posthog);
  }

  for (var n = 0; n < signals.length; n++) {
    try {
      window.addEventListener(signals[n], start, { passive: true, capture: true });
    } catch (e) {
      window.addEventListener(signals[n], start, true);
    }
  }
})();
