/* visitor-counter.js
 *
 * Live MAU-style counter for the /community Members surface. Talks
 * to /api/visitor-tick (Netlify function backed by a single Firestore
 * doc, server-side increment). Same-origin call — no CORS preflight,
 * no auth, no Firestore client SDK needed.
 *
 * Lifecycle on every page load:
 *   1. If localStorage flag `da-member-since` is missing → POST to
 *      tick the counter (the device joins for the first time), set
 *      the flag.
 *   2. If the flag is present → GET the current count.
 *
 * Either way the response carries `count`. We hand it to a callback
 * so the consumer (community.html) can update the displayed number
 * and personalize the "+ you" line.
 *
 * Failure mode: any network/server error → silent. The page already
 * has a static baseline (the `data-baseline` attr on #memberCount),
 * so users on Safari ITP, in-app browsers, or with the function down
 * still see a number, just not a live one.
 */
(function(){
  'use strict';

  const ENDPOINT = '/api/visitor-tick';
  const KEY = 'da-member-since';

  function readFlag(){
    try { return localStorage.getItem(KEY); } catch (e){ return null; }
  }
  function writeFlag(){
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e){}
  }

  function fmt(n){
    return Number(n).toLocaleString('en-US');
  }

  // Durable per-device id, same `_da_aid` key track.js mints so the
  // counter and the events pipeline dedupe on the SAME subject. Read
  // it rather than assuming track.js ran: this module loads on pages
  // that don't carry track.js, and whoever gets there first wins.
  // Returns '' when localStorage is blocked, and the server then
  // declines to increment (see visitor-tick.mjs) instead of counting
  // that browser again on every page load.
  var AID_KEY = '_da_aid';
  function deviceId(){
    try {
      var id = localStorage.getItem(AID_KEY);
      if (!id){
        id = (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
             (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        localStorage.setItem(AID_KEY, id);
      }
      return id;
    } catch (e){ return ''; }
  }

  // Minimal fetch wrapper. Returns { count, ticked, source } on success
  // or null on any error. Never throws into the consumer.
  // No handle is sent any more: /api/visitor-tick stopped writing a
  // "joined" row into the community chat feed on 2026-08-23, because
  // the handle lookup below had been dead since /community was
  // channelized and every tick wrote a nameless "Anonymous joined"
  // line into the room instead.
  async function call(method){
    try {
      const init = { method };
      if (method === 'POST'){
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify({ deviceId: deviceId() });
      }
      const res = await fetch(ENDPOINT, init);
      if (!res.ok) return null;
      const data = await res.json();
      if (typeof data.count !== 'number') return null;
      return data;
    } catch (e){
      return null;
    }
  }

  // Public surface.
  // sync(opts) — fires the right request, calls onCount(count, ticked)
  //   when the response lands. opts.onCount is optional; if absent the
  //   call still runs (so the counter ticks on first visit even if the
  //   page hasn't wired display logic yet).
  async function sync(opts){
    opts = opts || {};
    const cb = typeof opts.onCount === 'function' ? opts.onCount : null;
    const stored = readFlag();
    const method = stored ? 'GET' : 'POST';
    const data = await call(method);
    if (method === 'POST') writeFlag();
    if (data && cb){
      try { cb(data.count, data.ticked === true, data); } catch (e){}
    }
    return data;
  }

  window.DEBATEAI_VISITOR_COUNTER = {
    sync,
    fmt,
    ENDPOINT,
    KEY,
  };
})();
