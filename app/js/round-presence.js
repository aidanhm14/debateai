/* round-presence.js — cross-tab "this person is mid-round" marker.
 *
 * THE BUG THIS CLOSES. Every "join a round" surface on this site decided
 * whether the visitor was busy by reading its OWN tab's location.pathname:
 * notifications.js (ON_ROUND / DA_ON_ROUND_PAGE), live-pull.js, and
 * live-popup.js all did their own copy of that test. So a debater who was
 * mid-round and opened a SECOND tab looked completely idle to that tab.
 * With availability now defaulting ON for signed-in visitors, the second
 * tab would queue them, a peer would pair them, and a "Match found ·
 * Accept" card would pop while they were speaking in the other tab. The
 * go-live ping and the sitewide "someone is waiting" card did the same
 * thing more quietly. All of them invited someone into a round they were
 * already in.
 *
 * THE FIX. The tab that IS the round publishes a heartbeat here; every
 * other tab reads it before offering a round. Two kinds, because they
 * mean different things to the matchmaker:
 *
 *   'round' — already debating or watching the tournament broadcast.
 *             Nothing may offer a round, and the queue doc should be
 *             dropped: that tab has no card to answer with, so a peer
 *             accepting into it lands in an empty room.
 *   'spar'  — the matchmaker page is open in another tab. It owns the
 *             queue doc there, so a second tab must stay off the doc
 *             rather than delete it.
 *
 * INCLUDE THIS on any page that is a live round or the matchmaker. It
 * self-detects by path, so it is inert (and harmless) anywhere else. Keep
 * ROUND_RE in step with ON_ROUND in js/notifications.js; a round surface
 * that ships without this file is invisible to the other tabs again.
 *
 * Readers: js/notifications.js, js/live-pull.js, js/live-popup.js. They
 * each inline the same ~8-line read rather than depend on this file being
 * loaded first — a reader that races the writer must fail open, not throw.
 */
(function () {
  'use strict';
  if (window.DARoundPresence) return;

  var KEY = 'da-round-presence';
  // A hidden tab's timers are throttled to about one tick a minute, and the
  // round tab is by definition the hidden one while the debater looks at the
  // second tab. So the freshness window has to survive two missed beats.
  // pagehide clears the marker on every normal exit, so the only cost of a
  // long window is a crashed tab holding matchmaking off for ~2 minutes.
  var BEAT_MS = 20 * 1000;
  var FRESH_MS = 150 * 1000;
  var ROUND_RE = /\/(live-round|voice-debate|exhibition|casual-room|newvoice|room-judge)/;
  var SPAR_RE = /\/spar(?:\.html)?(?:[/?#]|$)/;
  // Public tournament pages are spectator surfaces for now. Publishing the
  // same busy signal here also pauses a general Spar matcher left open in a
  // second tab, which a path guard in the visible tab cannot reach.
  var SPECTATOR_RE = /^\/(?:open|tournament|tournaments|watch)(?:\.html)?(?:\/|$)/;
  // Which tab wrote the marker. Two round tabs at once is rare, but closing
  // one must not un-busy the other.
  var TAB = 'p' + Math.random().toString(36).slice(2, 10);

  function path() { try { return location.pathname || ''; } catch (e) { return ''; } }
  function myKind() {
    var p = path();
    if (ROUND_RE.test(p) || SPECTATOR_RE.test(p)) return 'round';
    if (SPAR_RE.test(p)) return 'spar';
    return '';
  }
  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d || !d.kind) return '';
      return (Date.now() - (d.at || 0) > FRESH_MS) ? '' : d.kind;
    } catch (e) { return ''; }
  }

  var kind = myKind();

  function beat() {
    if (!kind) return;
    try { localStorage.setItem(KEY, JSON.stringify({ kind: kind, at: Date.now(), tab: TAB, path: path() })); } catch (e) {}
  }
  function clear() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.tab && d.tab !== TAB) return;   // another round tab owns it now
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  window.DARoundPresence = {
    kind: read,                                   // '' | 'round' | 'spar', anywhere
    mine: function () { return kind; },
    clear: clear
  };

  if (!kind) return;
  beat();
  setInterval(beat, BEAT_MS);
  // A visible tab is the authoritative one; re-stamp on focus so a marker
  // that aged out while the tab sat hidden comes straight back.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
  window.addEventListener('pageshow', function (e) { if (e && e.persisted) beat(); });
  // Leaving the round page (navigation or tab close) un-busies immediately,
  // so availability resumes without waiting out the freshness window.
  window.addEventListener('pagehide', clear);
})();
