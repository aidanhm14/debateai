/* round-notify.js — pull the user back when a live round needs them.
 *
 * The model: you can open other tabs and your round keeps running in the
 * background (WebRTC audio isn't throttled the way page timers are). The
 * missing piece is knowing WHEN to come back. This module fills it: when
 * the AI finishes its turn (or any page calls RoundNotify.alert) while the
 * tab is HIDDEN, it fires an OS notification and flashes the tab title
 * until the user returns. It never nags a focused tab.
 *
 * Self-mounting, dependency-free, idempotent. Sits alongside the DM
 * surface in notifications.js (which owns inbox/thread notifications);
 * this one owns round-turn alerts.
 *
 * Public API (window.RoundNotify):
 *   requestPermission()  — ask for OS Notification permission. MUST be
 *                          called from a user gesture (e.g. the Connect
 *                          click). Safe to call repeatedly; no-ops once
 *                          decided.
 *   alert(title, body)   — if the tab is hidden: OS notification (when
 *                          granted) + tab-title flash. No-op when focused.
 *                          Auto-clears when the tab regains focus.
 *   clear()              — manually clear the flash + last notification.
 *   supported            — boolean: the Notification API exists here.
 */
(function (global) {
  'use strict';
  if (global.RoundNotify) return;

  var doc = global.document;
  var SUPPORTED = ('Notification' in global);
  var ICON = '/assets/logo/debate-it-logo-128.png';

  var originalTitle = null;
  var flashTimer = null;
  var liveNotif = null;

  function granted() { return SUPPORTED && Notification.permission === 'granted'; }

  function requestPermission() {
    try {
      if (!SUPPORTED) return;
      if (Notification.permission === 'default') {
        var r = Notification.requestPermission();
        if (r && typeof r.catch === 'function') r.catch(function () {});
      }
    } catch (e) {}
  }

  function startFlash(msg) {
    if (originalTitle === null) originalTitle = doc.title;
    if (flashTimer) clearInterval(flashTimer);
    var on = false;
    flashTimer = setInterval(function () {
      on = !on;
      try { doc.title = on ? ('🔴 ' + msg) : originalTitle; } catch (e) {}
    }, 1000);
  }

  function clear() {
    if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
    if (originalTitle !== null) { try { doc.title = originalTitle; } catch (e) {} }
    if (liveNotif) { try { liveNotif.close(); } catch (e) {} liveNotif = null; }
  }

  function alertUser(title, body) {
    title = title || 'Your turn';
    // Only pull the user back when they're actually away.
    if (!doc.hidden) return;
    startFlash(title);
    if (granted()) {
      try {
        liveNotif = new Notification(title, {
          body: body || '',
          icon: ICON,
          tag: 'debateit-round',   // collapses repeat alerts into one
          renotify: true,
        });
        liveNotif.onclick = function () {
          try { global.focus(); } catch (e) {}
          clear();
          try { this.close(); } catch (e) {}
        };
      } catch (e) {}
    }
  }

  // Returning to the tab clears any pending nudge.
  function onBack() { if (!doc.hidden) clear(); }
  doc.addEventListener('visibilitychange', onBack);
  global.addEventListener('focus', onBack);

  global.RoundNotify = {
    requestPermission: requestPermission,
    alert: alertUser,
    clear: clear,
    supported: SUPPORTED,
  };
})(window);
