// Microsoft Clarity — session replay + heatmaps + rage-click detection.
// Free, unlimited, no consent banner required in the US.
//
// SETUP (one time, ~2 minutes):
//   1. Go to https://clarity.microsoft.com and sign in with a Microsoft account
//   2. Create a new project (name it "Debatable")
//   3. Copy the Project ID from Settings → Setup (looks like "abc123xyz")
//   4. Paste it into CLARITY_PROJECT_ID below
//   5. Deploy. Data starts flowing within minutes.
//
// After setup: recordings begin only after a browser-trusted interaction.
// That keeps cloud renderers out of the live-user map and means an untouched
// bounce is deliberately not recorded.

(function () {
  var CLARITY_PROJECT_ID = 'PASTE_CLARITY_PROJECT_ID_HERE';

  // Guard: don't load on localhost, automation frameworks, or if ID is not set.
  if (!CLARITY_PROJECT_ID || CLARITY_PROJECT_ID === 'PASTE_CLARITY_PROJECT_ID_HERE') return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  try { if (navigator.webdriver === true) return; } catch (e) {}

  var signals = ['pointerdown', 'keydown', 'touchstart'];
  var started = false;

  function startClarity(event) {
    if (started || !event || event.isTrusted !== true) return;
    started = true;
    for (var n = 0; n < signals.length; n++) {
      try { window.removeEventListener(signals[n], startClarity, true); } catch (e) {}
    }

    // Official Clarity snippet, intentionally behind the interaction gate.
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
  }

  for (var n = 0; n < signals.length; n++) {
    try {
      window.addEventListener(signals[n], startClarity, { passive: true, capture: true });
    } catch (e) {
      window.addEventListener(signals[n], startClarity, true);
    }
  }
})();
