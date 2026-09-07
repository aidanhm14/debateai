(function () {
  'use strict';
  var source = document.currentScript.getAttribute('data-page') || location.pathname;
  var preview = false;
  try { preview = window !== parent && parent.__DB_DESIGN_HOST === true; } catch (_) {}
  if (preview) {
    window.__DB_DESIGN_PREVIEW = true;
    // Run before the page's own scripts: a design preview must never join a queue,
    // submit a form, mint AI sessions, write analytics, or open a live connection.
    var fetchRead = window.fetch.bind(window);
    window.fetch = function (input, options) {
      var method = String((options && options.method) || (input && input.method) || 'GET').toUpperCase();
      if (!/^(GET|HEAD|OPTIONS)$/.test(method)) return Promise.resolve(new Response('{"error":"Private design preview: changes to live data are paused"}', { status: 403, headers: { 'Content-Type': 'application/json' } }));
      return fetchRead(input, options);
    };
    var xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method) {
      if (!/^(GET|HEAD|OPTIONS)$/i.test(method)) throw new Error('Private design preview: live writes are paused');
      return xhrOpen.apply(this, arguments);
    };
    navigator.sendBeacon = function () { return false; };
    window.WebSocket = function () { throw new Error('Private design preview: live connections are paused'); };
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function () { return Promise.reject(new Error('Camera and microphone are off in the design preview')); };
      navigator.mediaDevices.getDisplayMedia = navigator.mediaDevices.getUserMedia;
    }
    if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error('Service workers are off in the design preview')); };
    document.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); }, true);
    return;
  }
  if (/^\/(admin|design|studio|tools)(\/|\.|$)/.test(location.pathname)) return;
  var cacheKey = 'db-public-design:' + source;
  function apply(data) {
    if (!data.changes || !data.changes.length) return;
    import('/js/design/runtime.mjs').then(function (m) {
      var ready = function () { m.mountDesign(document, data, source); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
    }).catch(function () {});
  }
  try {
    var cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < 15000) { apply(cached.data); return; }
  } catch (_) {}
  fetch('/api/site-design?page=' + encodeURIComponent(source)).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    if (!data) return;
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: data })); } catch (_) {}
    apply(data);
  }).catch(function () {});
})();
