/* Age bands for live human pairing (2026-08-22).
 *
 * A state speech association read the queue correctly: 13-year-olds and
 * unrelated adults shared one matchmaking pool, on camera. The terms have
 * required 13+ with adult supervision since they were written, but nothing
 * at the door ever asked, so nothing could separate anyone.
 *
 * This module owns the one-time question. The answer lives in
 * localStorage 'da-age-band' ('adult' | 'minor'), syncs across a
 * signed-in user's devices via prefs-sync.js, and rides every
 * matchmaking_queue doc as `ageBand` so spar-pair.mjs can enforce the
 * rule server-side: an attested minor is only ever paired with another
 * attested minor. Attestation is the ceiling of what a site can know
 * without ID checks; the honest claim, made on /safety, is "adults are
 * never KNOWINGLY paired with minors", backed by the moderation layer.
 *
 * Explicit colors on purpose: this overlay renders on pages whose theme
 * tokens differ, and var(--text) on an assumed surface is how two
 * invisible-text bugs shipped (see the 2026-08-18 decision log).
 */
(function () {
  'use strict';
  if (window.daAgeBand) return;

  var KEY = 'da-age-band';

  window.daAgeBand = function () {
    try {
      var b = localStorage.getItem(KEY);
      return (b === 'minor' || b === 'adult') ? b : '';
    } catch (e) { return ''; }
  };

  // Pairing rule, mirrored in spar-pair.mjs (the server copy is the
  // authority; this one only saves doomed proposals client-side).
  // minor+minor ok; adult with adult or unattested ok; an attested
  // minor never pairs with anyone who did not attest minor.
  window.daAgeBandsOk = function (a, b) {
    a = (a === 'minor' || a === 'adult') ? a : '';
    b = (b === 'minor' || b === 'adult') ? b : '';
    if (a === 'minor' || b === 'minor') return a === b;
    return true;
  };

  // Record the answer on the ACCOUNT (age_bands/{uid} via /api/age-band,
  // write-once, admin-SDK only — the 2026-08-22 hardening). The server
  // record is what spar-pair actually enforces; localStorage and the
  // queue-doc mirror are paint hints and client-side pre-filters. A 409
  // AGE_BAND_LOCKED means this account already answered (another device
  // before prefs-sync landed, or an edited localStorage): the recorded
  // answer wins and is adopted locally, because a value a browser could
  // overwrite would put the hint and the enforcement in different hands.
  // cb(band) on success or lock-adoption, cb('') when the POST failed —
  // callers proceed either way, since spar-pair answers
  // AGE_BAND_REQUIRED and this gets retried on that code.
  window.daRecordAgeBand = function (band, cb) {
    cb = cb || function () {};
    var u;
    try { u = window.firebase && firebase.auth && firebase.auth().currentUser; } catch (e) {}
    if (!u || (band !== 'minor' && band !== 'adult')) { cb(''); return; }
    u.getIdToken().then(function (tok) {
      return fetch('/api/age-band', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ band: band }),
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    }).then(function (r) {
      if (r.status === 409 && r.body && (r.body.band === 'minor' || r.body.band === 'adult')) {
        try { localStorage.setItem(KEY, r.body.band); } catch (e) {}
        cb(r.body.band);
        return;
      }
      cb(r.ok ? band : '');
    }).catch(function () { cb(''); });
  };

  // Ask once, then call cb(band). If already answered, calls back
  // synchronously without rendering anything.
  window.daAskAgeBand = function (cb) {
    var have = window.daAgeBand();
    if (have) { cb(have); return; }
    if (document.getElementById('daAgeGate')) return;

    var wrap = document.createElement('div');
    wrap.id = 'daAgeGate';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'How old are you?');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(8,8,12,.62);padding:20px;';
    wrap.innerHTML =
      '<div style="max-width:420px;width:100%;background:#16161b;color:#f2f2f6;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:26px 24px;box-shadow:0 24px 64px rgba(0,0,0,.5);font-family:Archivo,-apple-system,system-ui,sans-serif;">' +
        '<div style="font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#ef4444;margin-bottom:8px;">Before you meet a stranger</div>' +
        '<h2 style="margin:0 0 8px;font-size:1.25rem;line-height:1.3;color:#f2f2f6;">How old are you?</h2>' +
        '<p style="margin:0 0 16px;font-size:.9rem;line-height:1.55;color:#b9b9c6;">Live rounds pair you with a real person on camera. People aged 13 to 17 are only matched with others who said the same, so their wait can be longer. Debatable is not for anyone under 13.</p>' +
        '<button type="button" data-band="adult" style="display:block;width:100%;padding:13px 16px;margin-bottom:10px;border:0;border-radius:10px;background:#dc2626;color:#fff;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;">I am 18 or older</button>' +
        '<button type="button" data-band="minor" style="display:block;width:100%;padding:13px 16px;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:transparent;color:#f2f2f6;font-size:.95rem;font-weight:600;cursor:pointer;font-family:inherit;">I am 13 to 17</button>' +
        '<p style="margin:14px 0 0;font-size:.76rem;line-height:1.5;color:#8b8b99;">Answer honestly. This is recorded once and decides who you can be matched with. <a href="/safety" style="color:#b9b9c6;">How we keep rounds safe</a>.</p>' +
      '</div>';

    function pick(band) {
      // prefs-sync.js intercepts localStorage.setItem for SYNCED_KEYS,
      // so this one line is also what carries the answer across devices.
      try { localStorage.setItem(KEY, band); } catch (e) {}
      try { gtag('event', 'age_band_set', { band: band }); } catch (e) {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      // Server record BEFORE the callback: the caller's next move is a
      // queue join whose pair attempts spar-pair refuses until the
      // account has a recorded band. If the POST fails, proceed anyway —
      // the AGE_BAND_REQUIRED recovery in each caller retries it.
      window.daRecordAgeBand(band, function (recorded) {
        cb(recorded || band);
      });
    }
    wrap.querySelectorAll('button[data-band]').forEach(function (btn) {
      btn.addEventListener('click', function () { pick(btn.getAttribute('data-band')); });
    });
    document.body.appendChild(wrap);
    var first = wrap.querySelector('button');
    if (first) first.focus();
  };

  // ── Sessions, and the quiet ask ─────────────────────────────────────
  // 2026-09-07, the founder off a screen recording: "after a few website
  // sessions ask how old the user is, not at first." The modal above is
  // still the fallback the live queue needs (spar-pair refuses to pair
  // two people until both have a recorded band, so a first-session visitor
  // who walks straight into the queue is asked there and then). What
  // changes is that a returning visitor is asked BEFORE they reach that
  // door, from the corner, on their third session or later, so the queue
  // never has to interrupt them. Sessions are counted once per browser
  // session (sessionStorage mark, localStorage total), the same way the
  // experience ask counts visits.
  var SESSIONS = 'da-session-count';
  var SESSION_MARK = 'da-session-counted';
  var SNOOZE = 'da-age-ask-snooze';
  var ASK_AFTER_SESSIONS = 3;
  function sessionCount() {
    var n = 0;
    try { n = parseInt(localStorage.getItem(SESSIONS), 10) || 0; } catch (e) {}
    try {
      if (sessionStorage.getItem(SESSION_MARK) !== '1') {
        sessionStorage.setItem(SESSION_MARK, '1');
        n += 1;
        localStorage.setItem(SESSIONS, String(n));
      }
    } catch (e) {}
    return n;
  }
  window.daSessionCount = sessionCount;
  window.daAgeAskDue = function () {
    if (window.daAgeBand()) return false;
    var snoozed = 0;
    try { snoozed = parseInt(localStorage.getItem(SNOOZE), 10) || 0; } catch (e) {}
    if (snoozed && Date.now() < snoozed) return false;
    return sessionCount() >= ASK_AFTER_SESSIONS;
  };

  // The corner card. Not a modal: nothing is blocked, the page stays
  // usable, and "Later" snoozes it for a week. Signed-in named accounts
  // only, because the answer is recorded on the account; a guest who
  // answers here would answer again after signing in anyway.
  window.daMaybeAskAgeBand = function () {
    if (!window.daAgeAskDue()) return false;
    if (document.getElementById('daAgeGate') || document.getElementById('daAgeAsk')) return false;
    var u = null;
    try { u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser; } catch (e) {}
    if (!u || u.isAnonymous) return false;
    var card = document.createElement('div');
    card.id = 'daAgeAsk';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'How old are you?');
    card.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99980;max-width:340px;width:calc(100% - 32px);background:#16161b;color:#f2f2f6;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 16px 14px;box-shadow:0 18px 48px rgba(0,0,0,.45);font-family:Archivo,-apple-system,system-ui,sans-serif;';
    card.innerHTML =
      '<div style="font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#ef4444;margin-bottom:6px;">One question, once</div>' +
      '<div style="font-size:1rem;font-weight:700;line-height:1.3;margin-bottom:6px;">How old are you?</div>' +
      '<p style="margin:0 0 12px;font-size:.82rem;line-height:1.5;color:#b9b9c6;">Live rounds pair you with a real person on camera. People aged 13 to 17 are only matched with each other. Answering now means the queue never has to ask.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" data-band="adult" style="flex:1 1 auto;padding:10px 12px;border:0;border-radius:9px;background:#dc2626;color:#fff;font-size:.86rem;font-weight:700;cursor:pointer;font-family:inherit;">18 or older</button>' +
        '<button type="button" data-band="minor" style="flex:1 1 auto;padding:10px 12px;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:transparent;color:#f2f2f6;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit;">13 to 17</button>' +
        '<button type="button" data-later="1" style="flex:0 0 auto;padding:10px 10px;border:0;border-radius:9px;background:transparent;color:#8b8b99;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;">Later</button>' +
      '</div>';
    function done() { if (card.parentNode) card.parentNode.removeChild(card); }
    card.querySelectorAll('button[data-band]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var band = btn.getAttribute('data-band');
        try { localStorage.setItem(KEY, band); } catch (e) {}
        try { gtag('event', 'age_band_set', { band: band, surface: 'quiet_ask' }); } catch (e) {}
        done();
        window.daRecordAgeBand(band, function () {});
      });
    });
    card.querySelector('button[data-later]').addEventListener('click', function () {
      try { localStorage.setItem(SNOOZE, String(Date.now() + 7 * 86400000)); } catch (e) {}
      try { gtag('event', 'age_ask_later'); } catch (e) {}
      done();
    });
    document.body.appendChild(card);
    try { gtag('event', 'age_ask_shown', { sessions: sessionCount() }); } catch (e) {}
    return true;
  };

  // Loaded by topbar.js with data-proactive: count this session and, if
  // the ask is due, wait for a real signed-in user and a little visible
  // time before asking. Round surfaces never get it (a question over a
  // live speech is worse than never asking).
  (function () {
    var me = document.currentScript;
    if (!me || !me.hasAttribute('data-proactive')) { sessionCount(); return; }
    if (/^\/(live-round|live|casual-room|stage|studio|room-judge|spar|partners|debate-chat|voice-debate|newvoice|practice|admin)(?:\.html)?(?:\/|$)/.test(location.pathname)) { sessionCount(); return; }
    if (!window.daAgeAskDue()) return;
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      if (document.hidden) return;
      if (tries > 40) { clearInterval(t); return; }
      var u = null;
      try { u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser; } catch (e) {}
      if (!u || u.isAnonymous) return;
      if (tries < 8) return; // ~8 visible seconds before the card appears
      clearInterval(t);
      window.daMaybeAskAgeBand();
    }, 1000);
  })();
})();
