/* meta-pixel.js — Meta (Facebook) pixel, OFF until an id is set.
 *
 * WHY THIS SHIPS INERT, AND WHY THAT IS NOT LAZINESS
 * --------------------------------------------------
 * /privacy currently states, in these words: "We do not set advertising
 * cookies. We do not use Facebook Pixel or other third-party cross-site
 * tracking pixels on the app." With no id configured, that sentence stays
 * TRUE: nothing below runs, no script is fetched, no cookie is set, and
 * no request reaches Meta.
 *
 * THE MOMENT YOU SET PIXEL_ID, THAT SENTENCE BECOMES FALSE.
 * /privacy must be updated in the SAME commit that sets the id:
 *   1. Rewrite the line above (it is in the Cookies section of
 *      app/privacy.html) to disclose the pixel and that it sets
 *      advertising cookies.
 *   2. Add a Meta Platforms row to the sub-processor table beneath it.
 *   3. Decide the consent question. Today the site sets no advertising
 *      cookies, so it needs no consent banner. A pixel changes that for
 *      visitors in the EU and UK, and traffic here is global.
 * That page was corrected once already, on 2026-05-19, for claiming no
 * Google Analytics while GA4 was live on three pages. Do not repeat it.
 *
 * WHAT IT MEASURES
 * ----------------
 * One thing worth optimising toward: a completed tournament entry. The
 * ad account was found on 2026-08-19 optimising for "landing page views"
 * against an audience of 252 to 296 MILLION, which buys page loads from
 * people with no interest in debate. A conversion event is what lets the
 * bidder find the other kind of person, and lets anyone tell afterwards
 * whether a dollar produced an entrant.
 *
 * Events, deduped so a double click or a refresh cannot inflate them:
 *   CompleteRegistration  an entry landed in the bracket. Entry is free
 *                         (2026-08-22), so this is the conversion.
 *   Purchase              a $5 tip came back paid from Stripe. Optional,
 *                         buys nothing, and is not an entry.
 *
 * USAGE
 *   window.metaTrack('CompleteRegistration', { content_name: 'open' })
 * Safe to call from anywhere. With no id it returns false and does
 * nothing, so call sites never need to know whether it is configured.
 */
(function () {
  'use strict';

  // Paste the pixel id from Events Manager here. Empty means OFF.
  // Read the privacy note above BEFORE filling this in.
  var PIXEL_ID = '';

  // A pixel id is all digits. A pasted URL or a name would otherwise be
  // injected into the Meta script tag, so reject anything else outright.
  var VALID = /^[0-9]{6,20}$/;

  function disabled() { return !PIXEL_ID || !VALID.test(PIXEL_ID); }

  // Deduped per browser, not per page load: the entry flow can bounce
  // through Stripe and back, and a refreshed success page must not count
  // a second conversion.
  function alreadyFired(key) {
    try {
      var k = 'da-mp-' + key;
      if (localStorage.getItem(k)) return true;
      localStorage.setItem(k, String(Date.now()));
      return false;
    } catch (e) {
      return false; // storage blocked: better a possible double than a miss
    }
  }

  window.metaTrack = function (event, params, opts) {
    if (disabled() || !event) return false;
    var once = !opts || opts.once !== false;
    if (once && alreadyFired(event)) return false;
    try {
      if (typeof window.fbq !== 'function') return false;
      window.fbq('track', event, params || {});
      return true;
    } catch (e) { return false; }
  };

  if (disabled()) return;

  /* Meta's own loader, unchanged except that it only reaches here when an
     id is actually configured. */
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
})();
