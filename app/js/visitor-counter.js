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

  // Minimal fetch wrapper. Returns { count, ticked, source } on success
  // or null on any error. Never throws into the consumer.
  // POST optionally carries a handle so the join event written by
  // /api/visitor-tick uses the same name the user will post under in
  // the live chat.
  async function call(method, handle){
    try {
      const init = { method };
      if (method === 'POST'){
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify({ handle: handle || null });
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
    // If the chat module is loaded, prefer its handle so the join
    // event in the chat feed matches the name the user will post
    // under. Falls back to opts.handle, then null (server uses
    // "Anonymous").
    let handle = opts.handle || null;
    if (!handle && window.DEBATEAI_CHAT && typeof window.DEBATEAI_CHAT.ensureHandle === 'function'){
      try { handle = window.DEBATEAI_CHAT.ensureHandle(); } catch (e){}
    }
    const data = await call(method, handle);
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
