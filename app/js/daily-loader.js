/* daily-loader.js
 *
 * One pinned, resilient entry point for Daily across live rounds, casual
 * rooms, the broadcast studio, and watch surfaces. The normal path is the
 * same-origin vendored bundle, so an ad blocker, a slow public CDN, or an
 * unannounced `latest` release cannot push a watcher into Daily Prebuilt.
 * Exact-version CDN copies are disaster fallbacks only.
 *
 * Vendored package: @daily-co/daily-js 0.92.2
 * Bundle SHA-256: 4199d9996bafaa500d97362eb109c2a300ffbead41ce5c4df7132517f7ad5636
 */
(function (w, d) {
  'use strict';

  if (w.DebatableDaily) return;

  var VERSION = '0.92.2';
  var SOURCES = [
    '/vendor/daily-iframe-' + VERSION + '.js',
    'https://cdn.jsdelivr.net/npm/@daily-co/daily-js@' + VERSION + '/dist/daily-iframe.js',
    'https://unpkg.com/@daily-co/daily-js@' + VERSION + '/dist/daily-iframe.js'
  ];
  var pending = null;
  var loadedFrom = '';

  function one(src) {
    return new Promise(function (resolve, reject) {
      if (w.DailyIframe) { loadedFrom = loadedFrom || 'existing'; resolve(w.DailyIframe); return; }

      var s = d.createElement('script');
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        s.onload = s.onerror = null;
        try { s.remove(); } catch (e) {}
        reject(new Error('Daily SDK timed out: ' + src));
      }, 4500);

      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok && w.DailyIframe) {
          loadedFrom = src;
          resolve(w.DailyIframe);
        } else {
          try { s.remove(); } catch (e) {}
          reject(new Error('Daily SDK unavailable: ' + src));
        }
      }

      s.src = src;
      s.async = true;
      if (src.charAt(0) !== '/') s.crossOrigin = 'anonymous';
      s.setAttribute('data-daily-sdk', VERSION);
      s.onload = function () { finish(true); };
      s.onerror = function () { finish(false); };
      d.head.appendChild(s);
    });
  }

  function load() {
    if (w.DailyIframe) {
      loadedFrom = loadedFrom || 'same-origin';
      return Promise.resolve(w.DailyIframe);
    }
    if (pending) return pending;

    pending = SOURCES.reduce(function (chain, src) {
      return chain.catch(function () { return one(src); });
    }, Promise.reject(new Error('start'))).catch(function (err) {
      pending = null;
      throw err;
    });
    return pending;
  }

  w.DebatableDaily = {
    version: VERSION,
    load: load,
    source: function () { return loadedFrom; }
  };

  // Start immediately so the SDK negotiates in parallel with Firebase and
  // the rest of the page. Callers still await load() before mounting.
  load().catch(function (err) {
    console.warn('[Daily loader]', err && err.message);
  });
})(window, document);
