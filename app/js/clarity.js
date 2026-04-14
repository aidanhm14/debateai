// Microsoft Clarity — session replay + heatmaps + rage-click detection.
// Free, unlimited, no consent banner required in the US.
//
// SETUP (one time, ~2 minutes):
//   1. Go to https://clarity.microsoft.com and sign in with a Microsoft account
//   2. Create a new project (name it "Devil's Advocate")
//   3. Copy the Project ID from Settings → Setup (looks like "abc123xyz")
//   4. Paste it into CLARITY_PROJECT_ID below
//   5. Deploy. Data starts flowing within minutes.
//
// After setup: watch recordings at clarity.microsoft.com to see where users
// fumble, rage-click, or bounce. Worth 100x more than aggregate pageviews.

(function () {
  var CLARITY_PROJECT_ID = 'PASTE_CLARITY_PROJECT_ID_HERE';

  // Guard: don't load on localhost or if ID not set yet
  if (!CLARITY_PROJECT_ID || CLARITY_PROJECT_ID === 'PASTE_CLARITY_PROJECT_ID_HERE') return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  // Official Clarity snippet
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1;
    t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
})();
