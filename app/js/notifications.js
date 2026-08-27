/* notifications.js — site-wide notification surface.
 *
 * One self-mounting module included on every auth-bearing page. It
 * owns the whole notification experience so there's a single source of
 * truth (the bell used to live inside topbar.js; it was extracted here
 * so non-topbar pages — leaderboard, live, live-round, voice-debate,
 * voice-rfd — get notifications too).
 *
 * Mount strategy (first match wins):
 *   1. .ui-topbar-right  → inserted before the primary CTA / user slot
 *      (shared topbar pages).
 *   2. .bar-links        → inserted before the bar CTA (custom-bar
 *      pages like /leaderboard).
 *   3. nav.bar .bar-meta → inserted after Back to board on /live-round.
 *   4. floating          → fixed top-right chip when no known bar
 *      exists (in-round pages with bespoke chrome).
 *
 * Data model (matches /spar's existing DM system):
 *   dm_threads/{sorted-uid-pair} {
 *     participants:[a,b], participantInfo:{uid:{name,photo}},
 *     lastMessage, lastMessageAt, lastMessageFrom, unread:{uid:n}
 *   }
 *
 * Behavior: unread badge with a hover/click preview, an in-page toast on
 * new inbound messages, and an OS Notification when permission is granted
 * and the tab is hidden. The preview links to the full notifications page.
 * Firestore is loaded lazily — only signed-in users on pages that
 * didn't already ship the SDK pay the cost, once.
 *
 * Idempotent: bails if a bell is already on the page (so double-include
 * or a topbar that still renders its own bell can't produce two).
 */
(function () {
  'use strict';

  if (window.__daNotificationsLoaded) return;
  window.__daNotificationsLoaded = true;

  // ── Attention helpers (shared by the DM bell + the spar matchmaker) ──
  // "Away" = the user isn't actively looking at this tab. document.hidden
  // alone misses the common desktop case: another browser window or app is
  // focused while this tab is still the active one in its own window.
  // hasFocus() catches that, so a "match found" while you're in a different
  // window or app actually pings you.
  function daAway(){ try { return document.hidden || !document.hasFocus(); } catch (_) { return !!document.hidden; } }
  function daCanOsNotify(){ return !!(window.Notification && Notification.permission === 'granted' && daAway()); }
  // Ask for notification permission on a real user gesture (Safari refuses
  // a passive request). Safe to call repeatedly; no-ops once decided.
  function daAskNotify(){
    try {
      if (daIsNative()) { daRegisterNativePush(); return; } // native handles its own permission prompt
      if (!window.Notification) return;
      if (Notification.permission === 'granted') { daRegisterPush(); return; }
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(function (p) { if (p === 'granted') daRegisterPush(); }).catch(function () {});
      }
    } catch (_) {}
  }
  // Register this browser/device for Web Push so a spar match (or a DM) can
  // reach the user even with the tab or installed PWA fully closed. Needs a
  // signed-in identity (push is routed by uid) and server-side VAPID keys; if
  // push isn't configured server-side yet, this no-ops. Runs once per page.
  function daB64ToU8(b){ var p = '='.repeat((4 - b.length % 4) % 4); var s = (b + p).replace(/-/g, '+').replace(/_/g, '/'); var raw = atob(s); var arr = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i); return arr; }
  function daCurrentUser(){ try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser; } catch (_) { return null; } }
  // True inside the Capacitor native app (iOS/Android shell), false on web.
  function daIsNative(){ try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (_) { return false; } }
  // Native push: WKWebView has no Web Push, so the iOS/Android app registers an
  // FCM token via @capacitor-firebase/messaging and we deliver through FCM
  // (lib/fcm.mjs). Same push_subscribe endpoint, native branch. Tap routing
  // navigates the WebView to the notification's url.
  var _daNativeRegistered = false;
  function daRegisterNativePush(){
    try {
      if (_daNativeRegistered) return;
      var FM = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseMessaging;
      if (!FM) return;
      var user = daCurrentUser();
      if (!user || user.isAnonymous) return;
      _daNativeRegistered = true;
      function postToken(token){
        if (!token) return;
        var u = daCurrentUser(); if (!u) return;
        u.getIdToken().then(function (tok) {
          return fetch('/.netlify/functions/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ nativeToken: token, platform: (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'ios' }),
          });
        }).catch(function () {});
      }
      FM.requestPermissions().then(function (res) {
        if (!res || res.receive !== 'granted') { _daNativeRegistered = false; return; }
        FM.getToken().then(function (r) { postToken(r && r.token); }).catch(function () {});
      }).catch(function () { _daNativeRegistered = false; });
      // Token can rotate; re-register when it does.
      try { FM.addListener('tokenReceived', function (e) { postToken(e && e.token); }); } catch (_) {}
      // Tap on a notification → open the deep-linked screen in the WebView.
      try { FM.addListener('notificationActionPerformed', function (e) {
        var url = e && e.notification && e.notification.data && e.notification.data.url;
        if (url) { try { location.href = url; } catch (_) {} }
      }); } catch (_) {}
    } catch (_) { _daNativeRegistered = false; }
  }
  var _daPushRegistered = false;
  function daRegisterPush(){
    try {
      if (daIsNative()) { daRegisterNativePush(); return; }
      if (_daPushRegistered) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!window.Notification || Notification.permission !== 'granted') return;
      var user = daCurrentUser();
      if (!user) return;
      _daPushRegistered = true;
      navigator.serviceWorker.ready.then(function (reg) {
        fetch('/.netlify/functions/push-subscribe', { method: 'GET' })
          .then(function (r) { return r.json(); })
          .then(function (cfg) {
            if (!cfg || !cfg.configured || !cfg.publicKey) { _daPushRegistered = false; return; }
            return reg.pushManager.getSubscription().then(function (existing) {
              return existing || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: daB64ToU8(cfg.publicKey) });
            }).then(function (sub) {
              if (!sub) return;
              return user.getIdToken().then(function (tok) {
                return fetch('/.netlify/functions/push-subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                  body: JSON.stringify({ subscription: sub.toJSON(), ua: navigator.userAgent }),
                });
              });
            });
          })
          .catch(function () { _daPushRegistered = false; });
      }).catch(function () { _daPushRegistered = false; });
    } catch (_) { _daPushRegistered = false; }
  }
  // ── live-round alerts (go-live broadcast) ────────────────────────
  // Receive side: an opt-in, separate from being available yourself, so a
  // user can ask to be pinged when ANY debater goes live (even while on
  // another app). Cached in localStorage for instant UI; the server copy in
  // notify_prefs is what go-live.mjs fans out against.
  // ── muted threads ────────────────────────────────────────────────
  // Group chats notify by DEFAULT (2026-08-23): a group nobody is told
  // about is a group nobody comes back to, and the previous behaviour
  // buried group activity under whichever 1:1 thread was newest. Muting
  // is per thread and opt-OUT, held on the device because it is a
  // "leave me alone on this laptop" preference rather than an account
  // fact. A muted thread still LISTS, it just stops making noise: no
  // toast, no OS notification, no badge count.
  var DA_MUTED_KEY = 'da-muted-threads';
  function daMutedSet() {
    try { return JSON.parse(localStorage.getItem(DA_MUTED_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function daIsMuted(threadId) { return !!daMutedSet()[threadId]; }
  function daSetMuted(threadId, muted) {
    if (!threadId) return;
    var m = daMutedSet();
    if (muted) m[threadId] = 1; else delete m[threadId];
    try { localStorage.setItem(DA_MUTED_KEY, JSON.stringify(m)); } catch (_) {}
    // Mirror to the account so Web Push respects it too. A device-local
    // mute would quiet the badge and still buzz the phone, which reads
    // as the mute not working. Anonymous sessions keep the local copy
    // only; they have no account to write to.
    var user = daCurrentUser();
    if (!user || user.isAnonymous) return;
    user.getIdToken().then(function (tok) {
      return fetch('/.netlify/functions/notify-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ muteThread: threadId, muted: !!muted }),
      });
    }).catch(function () {});
  }
  // Server copy wins on load: mutes set on a phone should hold on a
  // laptop. Merged rather than replaced so a mute made while offline on
  // this device is not thrown away.
  function daMergeMutedFromServer(list) {
    if (!Array.isArray(list)) return;
    var m = daMutedSet();
    for (var i = 0; i < list.length; i++) if (list[i]) m[list[i]] = 1;
    try { localStorage.setItem(DA_MUTED_KEY, JSON.stringify(m)); } catch (_) {}
  }

  var DA_LIVE_ALERTS_KEY = 'da-live-alerts';
  function daGetLiveAlerts() { try { return localStorage.getItem(DA_LIVE_ALERTS_KEY) === '1'; } catch (_) { return false; } }
  function daSetLiveAlerts(on, cb) {
    on = !!on;
    try { localStorage.setItem(DA_LIVE_ALERTS_KEY, on ? '1' : '0'); } catch (_) {}
    // Turning alerts ON must also secure a push subscription for this device,
    // or there's nothing to deliver to.
    if (on) daAskNotify();
    var user = daCurrentUser();
    if (!user || user.isAnonymous) { if (cb) cb(on); return; }
    user.getIdToken().then(function (tok) {
      return fetch('/.netlify/functions/notify-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ liveAlerts: on }),
      });
    }).then(function () { if (cb) cb(on); }).catch(function () { if (cb) cb(on); });
  }
  // Broadcast side: tell the pool a debater just went live. Server enforces a
  // per-debater cooldown, so calling this on every "Available" flip is safe.
  // Guests broadcast too (2026-08-22) — most queue joiners are anonymous, and
  // a broadcast only named accounts can fire almost never fires. The server
  // holds the anti-spam line (per-uid cooldown for named accounts, one shared
  // global cooldown for all anonymous callers, server-constructed text).
  // Optional cb receives the server response ({broadcast, recipients, sent})
  // or null, so /spar can tell the waiter how many people were pinged.
  function daBroadcastGoLive(format, mode, cb) {
    try {
      var user = daCurrentUser();
      if (!user) { if (cb) cb(null); return; }
      user.getIdToken().then(function (tok) {
        return fetch('/.netlify/functions/go-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify({ format: format || 'apda', mode: mode || 'spar' }),
        });
      }).then(function (r) { return r && r.json ? r.json() : null; })
        .then(function (j) { if (cb) cb(j || null); })
        .catch(function () { if (cb) cb(null); });
    } catch (_) { if (cb) cb(null); }
  }
  // Exposed so the /spar foreground matchmaker (which suppresses the
  // background matcher) can still fire the go-live broadcast on queue join.
  try { window.daBroadcastGoLive = daBroadcastGoLive; window.daSetLiveAlerts = daSetLiveAlerts; window.daGetLiveAlerts = daGetLiveAlerts; } catch (_) {}
  // Cross-platform attention signal: blink the tab title until the user
  // returns. Works where new Notification() doesn't — notably iOS Safari,
  // which can't fire OS notifications without an installed-PWA push build.
  var _daTitleTimer = null, _daTitleReal = null;
  function daFlashTitle(msg){
    if (!daAway() || _daTitleTimer) return;
    _daTitleReal = document.title;
    var on = true;
    _daTitleTimer = setInterval(function(){ document.title = on ? msg : _daTitleReal; on = !on; }, 1100);
  }
  function daStopFlashTitle(){
    if (!_daTitleTimer) return;
    clearInterval(_daTitleTimer); _daTitleTimer = null;
    if (_daTitleReal != null) { document.title = _daTitleReal; _daTitleReal = null; }
  }
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) daStopFlashTitle(); });
  window.addEventListener('focus', daStopFlashTitle);

  // ── Audible alerts ──────────────────────────────────────────────────
  // /js/sfx.js is lazy site-wide (topbar only injects it once someone
  // touches the speaker toggle, which almost nobody does). This module
  // ships on 49 pages and fires the most important pings on the site —
  // and 44 of those 49 carried no sfx.js at all, /spar and /live-round
  // among them. On every one of those, window.SFX was undefined, so each
  // `window.SFX && SFX.notify()` guard silently no-opped: the match card
  // appeared, the countdown ran, and the round was lost in total silence.
  // So load it ourselves, on demand, and arm the audio context while the
  // user is still interacting — browsers only unlock audio on a gesture,
  // and an alert by definition fires when nobody is interacting.
  // In-round / matchmaking pages have their own louder surfaces; a
  // background "someone is live" ping on top of a live round is noise.
  var DA_ON_ROUND_PAGE = /\/(live-round|voice-debate|exhibition|casual-room|newvoice|room-judge|spar)/.test(location.pathname);
  function daMatchCardUp(){ try { return !!document.querySelector('.da-match-overlay'); } catch (_) { return false; } }
  // ── busy in ANOTHER tab ─────────────────────────────────────────
  // A path test answers for this tab only, so a debater who opened a
  // second tab mid-round read as idle here and got invited into a round
  // they were already in. js/round-presence.js publishes a heartbeat from
  // the round (and matchmaker) tab; this is the read side. Inlined rather
  // than taken off window.DARoundPresence because this file can load
  // first — a missing writer must fail open, never throw. Keep the key
  // and the freshness window in step with that file.
  var DA_PRESENCE_KEY = 'da-round-presence';
  var DA_PRESENCE_FRESH_MS = 150 * 1000;
  function daPresenceKind() {
    try {
      var d = JSON.parse(localStorage.getItem(DA_PRESENCE_KEY) || 'null');
      if (!d || !d.kind) return '';
      return (Date.now() - (d.at || 0) > DA_PRESENCE_FRESH_MS) ? '' : d.kind;
    } catch (_) { return ''; }
  }
  // True on a round/queue page OR while any other tab is running one.
  function daBusyRound() { return DA_ON_ROUND_PAGE || !!daPresenceKind(); }

  var _daSfxLoad = null;
  function daEnsureSfx(){
    if (window.SFX && window.SFX.alert) { try { window.SFX.arm(); } catch (_) {} return Promise.resolve(window.SFX); }
    if (_daSfxLoad) return _daSfxLoad;
    _daSfxLoad = new Promise(function (resolve) {
      function done(){ try { window.SFX && window.SFX.arm && window.SFX.arm(); } catch (_) {} resolve(window.SFX || null); }
      var existing = document.querySelector('script[src*="/js/sfx.js"]');
      if (existing) {
        // Already in the document (eager tag, or topbar's on-demand load).
        // It may still be parsing — wait for load, but don't hang forever
        // if it fired before we attached.
        if (window.SFX && window.SFX.alert) { done(); return; }
        existing.addEventListener('load', done, { once: true });
        existing.addEventListener('error', done, { once: true });
        setTimeout(done, 3000);
        return;
      }
      var el = document.createElement('script');
      el.src = '/js/sfx.js';
      el.async = true;
      el.addEventListener('load', done, { once: true });
      el.addEventListener('error', done, { once: true });
      document.head.appendChild(el);
    });
    return _daSfxLoad;
  }
  // Play the urgent cue. Async on first call (script fetch), which is fine:
  // an alert landing 80ms late still lands. `times` is the repeat count —
  // more repeats for a longer decision window.
  function daAlert(times){
    daEnsureSfx().then(function (sfx) {
      if (!sfx) return;
      try {
        if (sfx.alert) sfx.alert(times);
        else if (sfx.notify) sfx.notify();
        else if (sfx.success) sfx.success();
      } catch (_) {}
    }).catch(function () {});
  }
  // Soft cue. Inbound DM / group message: audible, but never the urgent
  // repeating alert — a chat ping mid-task should not read like a round
  // is starting.
  function daPing(){
    daEnsureSfx().then(function (sfx) {
      if (!sfx) return;
      try { (sfx.notify || sfx.success || function(){})(); } catch (_) {}
    }).catch(function () {});
  }
  try { window.daEnsureSfx = daEnsureSfx; window.daAlert = daAlert; window.daPing = daPing; } catch (_) {}

  // The matchmaking + in-round pages fire SFX from their own inline code
  // (spar.html's match chime at the foreground matcher, live-round.html's
  // join-request ping) and none of them ship /js/sfx.js. Load it up front
  // there so those existing call sites stop no-opping; everywhere else it
  // stays lazy until an alert is actually possible.
  if (DA_ON_ROUND_PAGE) { try { daEnsureSfx(); } catch (_) {} }

  var FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js';
  // Self-bootstrap firebase so the Available pill + DM bell work on ANY
  // page that loads this script, including marketing/content sub-pages
  // that don't set up firebase themselves. Pages that already init
  // firebase are detected and left alone (no double init).
  var APP_SDK_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js';
  var AUTH_SDK_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js';
  var FIREBASE_CONFIG = {
    apiKey: ["AIzaSyDDx","TYlyWLOJnFP99","e7XsLPb3FwIEijNNM"].join(""),
    authDomain: "debateos-78ac5.firebaseapp.com",
    projectId: "debateos-78ac5",
    storageBucket: "debateos-78ac5.firebasestorage.app",
    messagingSenderId: "860359449192",
    appId: "1:860359449192:web:f5dc0060dbd50d6c4fb9dd",
  };
  function loadScriptOnce(id, src, cb) {
    var ex = document.getElementById(id);
    if (ex) { if (ex.dataset.loaded) cb(); else ex.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script'); s.id = id; s.src = src;
    s.addEventListener('load', function () { s.dataset.loaded = '1'; cb(); }, { once: true });
    s.addEventListener('error', function () {});
    document.head.appendChild(s);
  }
  function ensureApp() {
    try {
      if (window.firebase && firebase.auth && (!firebase.apps || !firebase.apps.length)) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
    } catch (e) {}
  }

  // ── helpers ──────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relTime(ms) {
    if (!ms) return '';
    var diff = Date.now() - ms, m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd';
    return Math.floor(d / 7) + 'w';
  }
  function peerOf(data, myUid) {
    var ps = (data && data.participants) || [];
    for (var i = 0; i < ps.length; i++) { if (ps[i] !== myUid) return ps[i]; }
    return '';
  }
  function peerInfo(data, myUid) {
    var uid = peerOf(data, myUid);
    var info = (data && data.participantInfo && data.participantInfo[uid]) || {};
    return { uid: uid, name: info.name || 'Debater', photo: info.photo || '' };
  }
  // Unified display for a thread row (1:1 or group). Groups show the
  // group name + a deep link by thread id; 1:1 shows the peer.
  function threadDisplay(data, myUid, threadId) {
    var isGroup = !!(data && data.isGroup) || ((data && data.participants) || []).length > 2;
    if (isGroup) {
      return {
        isGroup: true,
        name: (data && data.groupName) || 'Group',
        photo: '',
        count: ((data && data.participants) || []).length,
        // 2026-07-01: bell rows land on /messages (the dedicated inbox)
        // instead of bouncing through /spar. Same dm_threads docs; the
        // thread/dm params are understood by both surfaces.
        href: '/messages?thread=' + encodeURIComponent(threadId),
      };
    }
    var p = peerInfo(data, myUid);
    return { isGroup: false, name: p.name, photo: p.photo, count: 2, href: '/messages?dm=' + encodeURIComponent(p.uid) + '&name=' + encodeURIComponent(p.name || '') };
  }
  function groupAvatarSvg() {
    return '<span class="ui-bell-av ui-bell-av--blank">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
      '</span>';
  }

  function ensureFirestore(cb) {
    if (typeof window.firebase === 'undefined') return;
    if (window.firebase.firestore) { cb(); return; }
    var existing = document.getElementById('da-firestore-sdk');
    if (existing) { existing.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script');
    s.id = 'da-firestore-sdk';
    s.src = FIRESTORE_SDK_URL;
    s.addEventListener('load', function () { if (window.firebase.firestore) cb(); }, { once: true });
    s.addEventListener('error', function () { /* offline / blocked — bell stays quiet */ });
    document.head.appendChild(s);
  }

  function whenFirebaseReady(cb) {
    var done = false;
    function fire() { if (done) return; done = true; cb(); }
    function ready() { return window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length; }
    if (ready()) { fire(); return; }
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (ready()) { clearInterval(iv); fire(); return; }
      // ~1.5s in: the page clearly isn't bringing its own firebase, so
      // bootstrap it ourselves. The poll then catches ready() once our
      // SDKs load + ensureApp() inits the shared app.
      if (n === 15) {
        loadScriptOnce('da-fb-app', APP_SDK_URL, function () {
          loadScriptOnce('da-fb-auth', AUTH_SDK_URL, function () { ensureApp(); });
        });
      }
      if (n > 80) { clearInterval(iv); } // ~8s hard stop
    }, 100);
  }

  // ── styles (injected once) ───────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('da-bell-styles')) return;
    var css =
      /* Component-local palette, so the widget carries its own theme instead of
         borrowing the page's. These rules used to read ui.css tokens directly,
         and a handful of pages that are authored LIGHT do not load /css/ui.css
         (tournaments, several SEO pages) -- so every token fell through to its
         dark literal and painted a black panel on cream. The light arm keys off
         the html attributes the pre-paint theme script already writes, which is
         present on every page whether or not ui.css is. */
      ':root{--dab-surface:#17171b;--dab-elev:#212127;--dab-border:rgba(255,255,255,.11);--dab-border-strong:rgba(255,255,255,.24);--dab-text:#fff;--dab-dim:rgba(255,255,255,.72);--dab-ghost:rgba(255,255,255,.55);--dab-accent:var(--accent,#ef4444);--dab-ok:var(--success-text,#4ade80);--dab-unread:rgba(239,68,68,.09);--dab-shadow:0 20px 64px rgba(0,0,0,.52)}' +
      'html[data-theme="crimson"],body.crimson-theme{--dab-surface:#1a0a0a;--dab-elev:#241111;--dab-border:rgba(239,68,68,.16);--dab-border-strong:rgba(239,68,68,.3)}' +
      'html[data-theme="light"],html[data-lighting="light"],body.light-theme{--dab-surface:#fffdf8;--dab-elev:#f3efe5;--dab-border:rgba(23,23,22,.12);--dab-border-strong:rgba(23,23,22,.26);--dab-text:#171716;--dab-dim:rgba(23,23,22,.70);--dab-ghost:rgba(23,23,22,.60);--dab-accent:#b91c1c;--dab-ok:#166534;--dab-unread:rgba(185,28,28,.07);--dab-shadow:0 2px 4px rgba(22,19,14,.06),0 24px 60px rgba(22,19,14,.18)}' +
      '.ui-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:999px;background:transparent;border:1px solid var(--dab-border);color:var(--dab-dim);cursor:pointer;transition:color .15s,border-color .15s,background .15s;font-family:inherit}' +
      '.ui-bell--round{flex:0 0 auto}' +
      '.ui-bell:hover{color:var(--dab-text);border-color:var(--dab-border-strong)}' +
      '.ui-bell.has-unread{color:var(--dab-accent);border-color:var(--dab-accent)}' +
      '.ui-bell--floating{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));right:16px;z-index:99996;background:var(--dab-surface);box-shadow:var(--dab-shadow)}' +
      '.ui-bell-badge{position:absolute;top:-3px;right:-3px;z-index:3;min-width:15px;height:15px;padding:0 3px;border-radius:999px;background:var(--dab-accent);color:#fff;font-size:.58rem;font-weight:800;line-height:15px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 0 0 1.5px var(--bar-bg,var(--dab-surface))}' +
      '.ui-bell-badge[hidden]{display:none}' +
      '.ui-bell-panel{position:fixed;top:0;right:0;width:400px;max-width:calc(100vw - 24px);max-height:calc(100vh - 88px);display:flex;flex-direction:column;background:var(--dab-surface);border:1px solid var(--dab-border);border-radius:16px;box-shadow:var(--dab-shadow);overflow:hidden;z-index:99998;text-align:left;cursor:default;animation:daBellIn .16s ease-out}' +
      '@keyframes daBellIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '.ui-bell-panel__bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:15px 16px 13px;border-bottom:1px solid var(--dab-border)}' +
      '.ui-bell-panel__title{font-size:1rem;font-weight:850;letter-spacing:-.01em;color:var(--dab-text)}' +
      '.ui-bell-panel__hint{font-size:.68rem;font-weight:700;color:var(--dab-ghost)}' +
      '.ui-bell-panel__scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}' +
      '.ui-bell-panel .ui-bell-list{max-height:none;overflow:visible}' +
      '.ui-bell-head{padding:12px 14px 10px;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--dab-ghost);border-bottom:1px solid var(--dab-border)}' +
      '.ui-bell-head--mid{border-top:1px solid var(--dab-border)}' +
      '.ui-bell-head__n{margin-left:7px;font-size:.6rem;font-weight:800;color:var(--dab-dim);letter-spacing:.06em}' +
      // Section chips in the dropdown. Same job as the /notifications
      // page filters: every section is one tap away instead of one long
      // scroll past whichever section happens to be busiest.
      '.ui-bell-tabs{display:flex;gap:6px;flex-shrink:0;padding:10px 12px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--dab-border)}' +
      '.ui-bell-tabs::-webkit-scrollbar{display:none}' +
      '.ui-bell-tab{flex:none;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--dab-border);background:transparent;color:var(--dab-dim);font-family:inherit;font-size:.74rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:color .12s,border-color .12s,background .12s}' +
      '.ui-bell-tab:hover{color:var(--dab-text);border-color:var(--dab-border-strong)}' +
      '.ui-bell-tab.is-on{color:#fff;background:var(--dab-accent);border-color:var(--dab-accent)}' +
      '.ui-bell-tab i{font-style:normal;font-size:.62rem;font-weight:800;padding:1px 5px;border-radius:999px;background:var(--dab-accent);color:#fff;font-variant-numeric:tabular-nums}' +
      '.ui-bell-tab.is-on i{background:rgba(255,255,255,.28)}' +
      '.ui-bell-foot--btn{width:100%;background:transparent;border:0;border-top:1px solid var(--dab-border);font-family:inherit;cursor:pointer}' +
      // A thread row and its mute control are siblings, so the row keeps
      // being one link and the button keeps being one button.
      '.ui-bell-rowwrap{position:relative;display:block}' +
      '.ui-bell-rowwrap .ui-bell-row{padding-right:44px}' +
      '.ui-bell-row.is-muted .ui-bell-row__name,.ui-bell-row.is-muted .ui-bell-row__preview{opacity:.62}' +
      '.ui-bell-tag{flex-shrink:0;font-size:.56rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--dab-ghost);border:1px solid var(--dab-border);border-radius:999px;padding:1px 6px}' +
      '.ui-bell-mute{position:absolute;top:50%;right:10px;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--dab-ghost);cursor:pointer;opacity:.55;transition:opacity .12s,color .12s,border-color .12s}' +
      '.ui-bell-rowwrap:hover .ui-bell-mute{opacity:1}' +
      '.ui-bell-mute:hover{color:var(--dab-text);border-color:var(--dab-border)}' +
      '.ui-bell-mute.is-on{opacity:1;color:var(--dab-accent);border-color:var(--dab-border)}' +
      '.ui-bell-empty{padding:22px 16px;text-align:center;font-size:.8rem;color:var(--dab-dim);line-height:1.5}' +
      '.ui-bell-list{max-height:340px;overflow-y:auto}' +
      '.ui-bell-row{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--dab-border);text-decoration:none;color:inherit;transition:background .12s}' +
      '.ui-bell-row:hover{background:var(--dab-elev)}' +
      '.ui-bell-row.is-unread{background:linear-gradient(90deg,var(--dab-unread),transparent 70%)}' +
      '.ui-bell-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;object-fit:cover;display:inline-flex;align-items:center;justify-content:center}' +
      '.ui-bell-av--blank{background:var(--dab-elev);border:1px solid var(--dab-border);color:var(--dab-dim);font-size:.74rem;font-weight:800}' +
      '.ui-bell-row__main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.ui-bell-row__name{font-size:.82rem;font-weight:700;color:var(--dab-text);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ui-bell-dot{width:7px;height:7px;border-radius:50%;background:var(--dab-accent);flex-shrink:0}' +
      '.ui-bell-row__preview{font-size:.74rem;color:var(--dab-dim);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.ui-bell-row__time{font-size:.66rem;color:var(--dab-ghost);flex-shrink:0}' +
      '.ui-bell-foot{display:block;flex-shrink:0;padding:12px 14px;text-align:center;font-size:.78rem;font-weight:700;color:var(--dab-accent);text-decoration:none;border-top:1px solid var(--dab-border)}' +
      '.ui-bell-foot:hover{background:var(--dab-elev)}' +
      '#da-bell-toasts{position:fixed;top:calc(66px + env(safe-area-inset-top,0px));left:50%;z-index:9999;display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100vw - 24px));transform:translateX(-50%);pointer-events:none}' +
      '.da-bell-toast{display:flex;align-items:center;gap:11px;width:100%;padding:12px 15px;background:var(--dab-surface);border:1px solid var(--dab-border-strong);border-radius:14px;box-shadow:var(--dab-shadow);text-decoration:none;color:inherit;pointer-events:auto;opacity:0;transform:translateY(-24px) scale(.97);transition:opacity .26s ease,transform .32s cubic-bezier(.2,.8,.2,1)}' +
      '.da-bell-toast.in{opacity:1;transform:translateY(0) scale(1)}' +
      '.da-bell-toast img,.da-bell-toast__blank{width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;background:var(--dab-elev);border:1px solid var(--dab-border);color:var(--dab-dim);font-size:.78rem;font-weight:800}' +
      '.da-bell-toast__main{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}' +
      '.da-bell-toast__eyebrow{font-size:.58rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:var(--dab-accent)}' +
      '.da-bell-toast__name{font-size:.86rem;font-weight:800;color:var(--dab-text)}' +
      '.da-bell-toast__preview{font-size:.78rem;color:var(--dab-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@keyframes daBellLivePulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      '@media(max-width:560px){.ui-bell-panel{width:auto;max-width:none}.ui-bell-panel__hint{display:none}}' +
      '@media(max-width:480px){#da-bell-toasts{top:calc(58px + env(safe-area-inset-top,0px));left:12px;right:12px;width:auto;transform:none}}' +
      '.da-spar-pill{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:999px;background:transparent;border:1px solid var(--dab-border);color:var(--dab-dim);cursor:pointer;font-family:inherit;font-size:.78rem;font-weight:700;letter-spacing:.01em;transition:color .15s,border-color .15s,background .15s;white-space:nowrap}' +
      '.da-spar-pill:hover{color:var(--dab-text);border-color:var(--dab-border-strong)}' +
      '.da-spar-pill__dot{width:8px;height:8px;border-radius:50%;background:var(--dab-ghost);transition:background .2s}' +
      '.da-spar-pill.is-on{color:var(--dab-ok);border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.08)}' +
      '[data-theme="light"] .da-spar-pill.is-on,[data-lighting="light"] .da-spar-pill.is-on,body.light-theme .da-spar-pill.is-on{color:#166534;border-color:rgba(22,101,52,.5);background:rgba(22,101,52,.08)}' +
      '.da-spar-pill.is-on .da-spar-pill__dot{background:#22c55e;animation:daSparPulse 1.7s ease-out infinite}' +
      // The "x" affordance: hidden on desktop (the pill is a wide toggle
      // there), shown on phones when available so turning availability
      // off is one obvious tap. Non-interactive — the whole pill is the
      // toggle; this is just the visual cue.
      '.da-spar-pill__off{display:none;font-size:1.05rem;line-height:1;opacity:.75;pointer-events:none}' +
      // Mobile is where most TikTok traffic lands, and the tight phone
      // bar had NO availability control at all (the toggle was hidden
      // outright). Keep the bar clean by hiding the toggle when you are
      // not available, but the moment you ARE available show a compact
      // green "Available x" chip so a phone user can turn it off. Below
      // 380px the label drops so "· x" always clears the bell + CTA.
      '@media(max-width:560px){.ui-topbar .da-spar-pill:not(.is-on){display:none!important}.ui-topbar .da-spar-pill.is-on{padding:0 11px;gap:6px}.da-spar-pill.is-on .da-spar-pill__off{display:inline-flex}}' +
      '@media(max-width:380px){.ui-topbar .da-spar-pill.is-on .da-spar-pill__lab{display:none}}' +
      // Bar-less pages (/tournaments, /atlas, /safety, the judge pages) have
      // no .ui-topbar-right to mount into, so the pill floats beside the
      // bell's own floating chip rather than never appearing. Right offset
      // clears the bell (right:16px, ~36px wide) plus a gap.
      '.da-spar-pill--floating{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));right:62px;z-index:99996;height:36px;background:var(--dab-surface);box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '@media(max-width:560px){.da-spar-pill--floating .da-spar-pill__lab{display:none}.da-spar-pill--floating{padding:0 11px;right:58px}}' +
      '@keyframes daSparPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      '.da-match-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);animation:daMatchFade .2s ease-out}' +
      '@keyframes daMatchFade{from{opacity:0}to{opacity:1}}' +
      '.da-match-card{width:340px;max-width:88vw;background:var(--dab-surface);border:1px solid rgba(34,197,94,.4);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:24px 22px;text-align:center;animation:daMatchPop .24s cubic-bezier(.2,.8,.2,1)}' +
      '@keyframes daMatchPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}' +
      '.da-match-eyebrow{font-size:.66rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#22c55e;margin-bottom:12px}' +
      '.da-match-ring{position:relative;width:72px;height:72px;margin:0 auto 14px}' +
      '.da-match-ring svg{transform:rotate(-90deg);width:72px;height:72px}' +
      '.da-match-ring__track{fill:none;stroke:var(--dab-border-strong);stroke-width:5}' +
      '.da-match-ring__bar{fill:none;stroke:#22c55e;stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset 1s linear}' +
      '.da-match-av{position:absolute;inset:8px;width:56px;height:56px;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;background:var(--dab-elev);border:1px solid var(--dab-border);color:var(--dab-text);font-size:1.3rem;font-weight:800}' +
      '.da-match-ring__num{position:absolute;right:-3px;bottom:-3px;min-width:22px;height:22px;padding:0 5px;border-radius:999px;background:#22c55e;color:#06210f;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px var(--dab-surface)}' +
      '.da-match-name{font-size:1.05rem;font-weight:800;color:var(--dab-text);margin-bottom:3px}' +
      '.da-match-sub{font-size:.8rem;color:var(--dab-dim);margin-bottom:18px}' +
      '.da-match-btns{display:flex;gap:10px}' +
      '.da-match-btn{flex:1;height:44px;border-radius:11px;font-family:inherit;font-size:.86rem;font-weight:800;cursor:pointer;border:1px solid transparent;transition:filter .15s,background .15s,border-color .15s}' +
      '.da-match-btn--accept{background:#22c55e;color:#06210f}' +
      '.da-match-btn--accept:hover{filter:brightness(1.08)}' +
      '.da-match-btn--decline{background:transparent;border-color:var(--dab-border);color:var(--dab-dim)}' +
      '.da-match-btn--decline:hover{color:var(--dab-text);border-color:var(--dab-border-strong)}' +
      // "They already said yes." consents[peer] has been on this doc
      // since the ready-check shipped and the card never read it, so a
      // debater standing in an open room waiting on one click looked
      // exactly like one who had not answered either. This is the
      // population least likely to accept (they are mid-task on another
      // page), so it is the population that most needs the true reason.
      // The card is already green, so the state cannot be signalled by
      // colour alone: it gets a filled chip and a brighter ring.
      '.da-match-locked{display:inline-flex;align-items:center;gap:6px;margin:0 auto 10px;padding:5px 12px;border-radius:999px;background:#22c55e;color:#06210f;font-size:.7rem;font-weight:800;letter-spacing:.01em}' +
      '.da-match-locked svg{flex:none}' +
      '.da-match-card.is-locked{border-color:#22c55e;box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(34,197,94,.35)}' +
      '.da-match-card.is-locked .da-match-av{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.22)}' +
      // Waiting-on-them card. Text only until now: no motion, no sense
      // of a window, nothing but a Cancel button to press. Same fix as
      // /spar's consent wait — say what is happening as it happens, and
      // say that leaving is not the only way out.
      '.da-match-phase{font-size:.76rem;font-weight:600;color:var(--dab-dim);min-height:1.1em;margin-bottom:10px;animation:daMatchPhase .3s ease both}' +
      '@keyframes daMatchPhase{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}' +
      '.da-match-hold{font-size:.74rem;line-height:1.5;color:var(--dab-dim);background:rgba(127,127,127,.09);border:1px solid var(--dab-border);border-radius:11px;padding:9px 12px;margin-bottom:14px}' +
      '.da-match-hold b{color:var(--dab-text);font-weight:800}' +
      '.da-match-ring.is-wait .da-match-ring__bar{stroke-dasharray:60 141;transition:none;animation:daMatchSpin 1.4s linear infinite;transform-origin:50% 50%}' +
      '@keyframes daMatchSpin{to{transform:rotate(360deg)}}' +
      // Stand down while a sign-in modal is open so mobile never stacks
      // modal + go-live card + signup-nudge at the same time.
      // Webcam preview strip — shows a cold visitor what a live round
      // actually looks like before they opt in. Real face-library shots
      // (face02 + face12) so the preview reads as two real debaters,
      // not as the placeholder silhouettes that came before. The two
      // faces are picked from visually distinct rooms (kitchen vs
      // white-walled bedroom) on purpose — seat-you / seat-opp share a
      // shoot and read as AI-clone (see landing.html's SKIP/same-shoot
      // note for the same fix on the hero).
      '@media(prefers-reduced-motion:reduce){.ui-bell-panel,.da-bell-toast,.da-match-overlay,.da-match-card,.da-match-phase,.da-match-ring.is-wait .da-match-ring__bar,.da-spar-pill.is-on .da-spar-pill__dot{animation:none;transition:none}}';
    var style = document.createElement('style');
    style.id = 'da-bell-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── bell element + placement ─────────────────────────────────────
  function createBell() {
    var bell = document.createElement('button');
    bell.className = 'ui-bell';
    bell.type = 'button';
    bell.setAttribute('aria-label', 'Notifications');
    bell.setAttribute('aria-haspopup', 'true');
    bell.setAttribute('aria-expanded', 'false');
    bell.title = 'Notifications';
    bell.style.display = 'none'; // shown once auth resolves with a user
    bell.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      '</svg>' +
      '<span class="ui-bell-badge" hidden>0</span>';
    return bell;
  }

  function placeBell(bell) {
    // Already mounted somewhere? (defensive — placeBell is called once.)
    if (bell.isConnected) return;
    function attempt() {
      // .app-topbar-right is the main /app (index.html) React topbar;
      // without it the bell + Available pill had no anchor there and the
      // bell fell back to floating.
      var tb = document.querySelector('.ui-topbar-right') || document.querySelector('.app-topbar-right');
      if (tb) {
        var anchor = tb.querySelector('.ui-btn-primary') || document.getElementById('barUser');
        tb.insertBefore(bell, anchor || null);
        return true;
      }
      var barLinks = document.querySelector('.bar-links');
      if (barLinks) {
        var cta = barLinks.querySelector('.bar-cta');
        barLinks.insertBefore(bell, cta || barLinks.firstChild);
        return true;
      }
      // /live-round has bespoke chrome rather than the shared topbar. Its
      // old floating fallback sat directly over the Back to board link on
      // narrow screens. Keep the bell in the row so flexbox reserves its
      // width and the unread badge can never cover navigation.
      var roundMeta = document.querySelector('nav.bar .bar-meta');
      if (roundMeta) {
        bell.classList.add('ui-bell--round');
        roundMeta.appendChild(bell);
        return true;
      }
      return false;
    }
    if (attempt()) return;
    // The shared topbar renders via a deferred script that may run a
    // beat after us. Retry briefly, then fall back to a floating chip.
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (attempt()) { clearInterval(iv); return; }
      // ~6s: the /app React topbar (.app-topbar-right) can render well
      // after us; wait it out before falling back to a floating chip.
      if (n > 60) {
        clearInterval(iv);
        if (!bell.isConnected) {
          bell.classList.add('ui-bell--floating');
          document.body.appendChild(bell);
        }
      }
    }, 100);
  }

  // ── controller: badge + page feed ─────────────────────────────────
  // The bell counts two things: a "What's new" updates feed (the changelog,
  // which loads for every visitor) and the DM inbox (which wires up only
  // once a user is signed in). One combined unread badge opens the preview.
  function controller(bell) {
    var badge = bell.querySelector('.ui-bell-badge');
    var panel = null, seenSnapshot = 0;
    var panelOpenTimer = null, panelCloseTimer = null;
    // Full-page mode: /notifications carries an always-open container that
    // renders the same feed the bell dropdown does, uncapped. When it
    // exists, every data callback repaints it alongside the panel.
    var pageEl = document.getElementById('daNotifPage');
    var pageFilter = 'all';

    function bindPageFilters() {
      var buttons = document.querySelectorAll('[data-notif-filter]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function () {
          var next = this.getAttribute('data-notif-filter') || 'all';
          if (!/^(all|matches|replies|messages|updates)$/.test(next)) next = 'all';
          pageFilter = next;
          for (var j = 0; j < buttons.length; j++) {
            buttons[j].setAttribute('aria-pressed', buttons[j].getAttribute('data-notif-filter') === pageFilter ? 'true' : 'false');
          }
          paintPage();
        });
      }
    }
    if (pageEl) bindPageFilters();

    // updates feed state
    var updates = [], updatesSeen = 0;
    try { updatesSeen = parseInt(localStorage.getItem('da-updates-seen') || '0', 10) || 0; } catch (_) {}

    // activity feed state — public, auth-free. /api/recent-activity
    // returns recent live_challenges + waitlist_posts so the bell
    // shows site activity to anon visitors too (drives "this place
    // is alive" perception → sign-in conversions).
    var activity = [], activitySeen = 0, activitySeenSnapshot = 0;
    try { activitySeen = parseInt(localStorage.getItem('da-activity-seen') || '0', 10) || 0; } catch (_) {}

    // First-visit baselines. If there's no stored "seen" marker yet, this
    // visitor has never had a chance to see anything, so everything that
    // exists right now is treated as already-seen and the badge starts at
    // 0. Without this a brand-new visitor saw a phantom "9+" for items
    // that predate their arrival. Only things published AFTER this visit
    // count from here on.
    var hadUpdatesBaseline = false, hadActivityBaseline = false;
    try { hadUpdatesBaseline = localStorage.getItem('da-updates-seen') != null; } catch (_) {}
    try { hadActivityBaseline = localStorage.getItem('da-activity-seen') != null; } catch (_) {}
    // presence — real "N online in the last 5 min" from /api/online-count.
    // Pinned at the top of the activity section. Honest number per the
    // landing-page presence pipeline (admin SDK reads presence/{uid|pid}
    // docs with lastPing ≥ now-5min, 30s server cache).
    var onlineCount = null;
    // "Live now" — debaters actually waiting for a round (matchmaking_queue),
    // from /api/live-now. The actionable presence signal vs the generic
    // online count. { count, debaters:[{uid,name,format}] }.
    var liveNow = null;
    // Who was live at the last poll, so a rising count can be told apart
    // from the same two people still sitting in the queue. Null until the
    // first poll lands — a page-load baseline must not ping.
    var liveSeenUids = null;
    var lastLivePing = 0;
    var LIVE_PING_COOLDOWN_MS = 5 * 60 * 1000;
    // Next scheduled round from /api/schedule-round (community scheduling,
    // 2026-07-14). Soonest upcoming round or null; rendered as a bell row
    // so scheduled rounds advertise themselves on every page.
    var nextRound = null;

    // DM state
    var myUid = null, dmRows = [], dmUnread = 0, signedInReal = false;
    var threadsUnsub = null, prevUnread = {}, firstSnap = true;

    // Forum-reply state — replies landing on YOUR /community discussion
    // threads. Before this layer they surfaced nowhere off /community.
    var replyRows = [], repliesUnsub = null, replyFirstSnap = true;
    var replySeen = 0, replySeenSnapshot = 0;
    try { replySeen = parseInt(localStorage.getItem('da-forum-reply-seen') || '0', 10) || 0; } catch (_) {}
    var hadReplyBaseline = false;
    try { hadReplyBaseline = localStorage.getItem('da-forum-reply-seen') != null; } catch (_) {}

    bell.style.display = 'inline-flex'; // visible to everyone for updates, not just signed-in users

    function canHover() {
      return window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    }
    function cancelPanelTimers() {
      if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
      if (panelCloseTimer) { clearTimeout(panelCloseTimer); panelCloseTimer = null; }
    }
    function schedulePanelOpen() {
      cancelPanelTimers();
      if (panel) return;
      panelOpenTimer = setTimeout(function () { panelOpenTimer = null; openPanel(); }, 90);
    }
    function schedulePanelClose() {
      if (panelOpenTimer) { clearTimeout(panelOpenTimer); panelOpenTimer = null; }
      if (panelCloseTimer) clearTimeout(panelCloseTimer);
      panelCloseTimer = setTimeout(function () { panelCloseTimer = null; closePanel(); }, 180);
    }

    bell.addEventListener('mouseenter', function () { if (canHover()) schedulePanelOpen(); });
    bell.addEventListener('mouseleave', function () { if (canHover()) schedulePanelClose(); });
    bell.addEventListener('focus', function () { if (canHover()) openPanel(); });
    bell.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      daAskNotify(); // request permission (if needed) + register Web Push on grant
      if (!panel) openPanel();
      else if (!canHover()) closePanel();
    });
    bell.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePanel(); bell.blur(); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openPanel();
        var firstLink = panel && panel.querySelector('a,button');
        if (firstLink) firstLink.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (panel && !bell.contains(e.target) && !panel.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel) { closePanel(); bell.focus(); }
    });
    window.addEventListener('resize', function () { if (panel) positionPanel(); });

    // /notifications page: landing on it counts as reading everything, the
    // same way opening the dropdown does. Snapshot first so this visit's
    // new items still carry their unread dot.
    if (pageEl) {
      seenSnapshot = updatesSeen;
      activitySeenSnapshot = activitySeen;
      replySeenSnapshot = replySeen;
      paintPage();
    }

    // ── updates feed (no auth required) ──────────────────────────────
    loadUpdates();
    function loadUpdates() {
      fetch('/changelog.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          updates = (Array.isArray(list) ? list : []).slice()
            .sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
          if (!hadUpdatesBaseline) { markUpdatesSeen(); hadUpdatesBaseline = true; } // first visit: caught up
          if (panel || pageEl) { markUpdatesSeen(); paintPanel(); } // open while loading: count as read
          renderBadge();
        })
        .catch(function () { /* offline / missing file — updates stay empty */ });
    }
    function updatesUnreadCount() {
      var n = 0;
      for (var i = 0; i < updates.length; i++) if ((updates[i].id || 0) > updatesSeen) n++;
      return n;
    }
    function markUpdatesSeen() {
      var max = updatesSeen;
      for (var i = 0; i < updates.length; i++) max = Math.max(max, updates[i].id || 0);
      if (max > updatesSeen) {
        updatesSeen = max;
        try { localStorage.setItem('da-updates-seen', String(max)); } catch (_) {}
      }
    }

    // ── activity feed (no auth required) ─────────────────────────────
    // Pulls /api/recent-activity (30s server cache) + /api/online-count
    // (real Firestore presence, 30s server cache). Refreshes every 90s
    // while the tab is visible so the bell badge stays warm without
    // hammering the functions — that's ~960 fetches/day per active tab
    // even at one-tab-per-minute usage, well within Netlify free tier.
    loadActivity();
    loadOnlineCount();
    loadLiveNow();
    loadNextRound();
    var hiddenTicks = 0;
    var activityIv = setInterval(function () {
      if (!document.hidden) {
        hiddenTicks = 0;
        loadActivity(); loadOnlineCount(); loadLiveNow(); loadNextRound();
        return;
      }
      // Hidden tab. The feed / online count / next round are all cosmetic
      // and can wait for the user to come back. "Someone just went live"
      // cannot — being alerted while you are looking at something else is
      // the entire point of it. So poll that ONE endpoint (15s server
      // cache, shared) at a third of the rate, and only for people who
      // explicitly turned live alerts on. Web Push covers this population
      // too, but only where a push subscription exists: iOS Safari outside
      // an installed PWA has none, and this is their only path.
      if (!signedInReal || !daGetLiveAlerts()) return;
      if (++hiddenTicks < 2) return;   // ~3 min while hidden
      hiddenTicks = 0;
      loadLiveNow();
    }, 90 * 1000);
    function loadNextRound() {
      fetch('/api/schedule-round', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var rows = (j && Array.isArray(j.rounds)) ? j.rounds : [];
          var next = null;
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].startAt > Date.now()) { next = rows[i]; break; }
          }
          nextRound = next;
          if (panel || pageEl) paintPanel();
        })
        .catch(function () { /* function down — row stays hidden */ });
    }
    function loadLiveNow() {
      fetch('/api/live-now', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || typeof j.count !== 'number') return;
          liveNow = j;
          announceNewlyLive(j);
          if (panel || pageEl) paintPanel();
        })
        .catch(function () { /* function down — live row stays hidden */ });
    }
    // Someone new just joined the queue. Until now this only repainted a
    // row inside a closed bell panel, so a debater going live while you
    // were reading another tab was completely silent — you found out by
    // opening the bell, by which point they had usually timed out.
    // Sound + tab-title + OS notification, with a cooldown so a busy
    // queue can't turn into a metronome.
    function announceNewlyLive(j) {
      var ids = {};
      var rows = (j && j.debaters) || [];
      for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].uid) ids[rows[i].uid] = rows[i];
      var prev = liveSeenUids;
      liveSeenUids = ids;
      if (!prev) return;                       // first poll = baseline, not news
      if (!signedInReal) return;               // no queue to join, no ping
      if (daBusyRound() || daMatchCardUp()) return;
      if (Date.now() - lastLivePing < LIVE_PING_COOLDOWN_MS) return;
      var fresh = [];
      for (var uid in ids) if (!prev[uid] && uid !== myUid) fresh.push(ids[uid]);
      if (!fresh.length) return;
      lastLivePing = Date.now();
      var who = String(fresh[0].name || 'A debater');
      var more = fresh.length > 1 ? ' and ' + (fresh.length - 1) + ' more' : '';
      daAlert(daAway() ? 2 : 1);
      daFlashTitle(who + ' is live');
      try {
        if (daCanOsNotify()) {
          var ln = new Notification(who + more + ' is looking to spar', { body: 'Tap to find your match.', icon: '/favicon.svg', tag: 'da-live-now' });
          ln.onclick = function () { window.focus(); try { location.href = '/spar'; } catch (_) {} ln.close(); };
        }
      } catch (_) {}
    }

    function loadActivity() {
      fetch('/api/recent-activity', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !Array.isArray(j.items)) return;
          activity = j.items.slice();
          if (!hadActivityBaseline) { markActivitySeen(); hadActivityBaseline = true; } // first visit: caught up
          if (panel || pageEl) { markActivitySeen(); paintPanel(); }
          renderBadge();
        })
        .catch(function () { /* function down — section stays quiet */ });
    }
    function loadOnlineCount() {
      fetch('/api/online-count', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || typeof j.online !== 'number') return;
          onlineCount = Math.max(0, j.online | 0);
          if (panel || pageEl) paintPanel();
        })
        .catch(function () { /* function down — presence row stays hidden */ });
    }
    function activityUnreadCount() {
      var n = 0;
      for (var i = 0; i < activity.length; i++) if ((activity[i].when || 0) > activitySeen) n++;
      return n;
    }
    function markActivitySeen() {
      var max = activitySeen;
      for (var i = 0; i < activity.length; i++) max = Math.max(max, activity[i].when || 0);
      if (max > activitySeen) {
        activitySeen = max;
        try { localStorage.setItem('da-activity-seen', String(max)); } catch (_) {}
      }
    }

    // ── combined unread badge (DMs + new updates + new activity) ─────
    function renderBadge() {
      if (!badge) return;
      // The unread count is for real signed-in users only. A signed-out
      // (or anonymous) visitor has no DMs and nothing they've "missed", so
      // the old phantom "9+" was noise. They still get the bell + the
      // panel (activity / what's-new) on click; just no nagging number.
      var n = signedInReal ? (dmUnread + updatesUnreadCount() + activityUnreadCount() + replyUnreadCount()) : 0;
      if (n > 0) { badge.hidden = false; badge.textContent = n > 9 ? '9+' : String(n); bell.classList.add('has-unread'); }
      else { badge.hidden = true; bell.classList.remove('has-unread'); }
    }

    // ── DM layer (auth + firestore) ──────────────────────────────────
    whenFirebaseReady(function () {
      window.firebase.auth().onAuthStateChanged(function (u) {
        // Only a real (non-anonymous) account counts as "signed in" for the
        // badge. Anonymous auth has no durable inbox or reachable profile.
        signedInReal = !!(u && !u.isAnonymous);
        if (!u || u.isAnonymous) {
          if (threadsUnsub) { try { threadsUnsub(); } catch (e) {} threadsUnsub = null; }
          if (repliesUnsub) { try { repliesUnsub(); } catch (e) {} repliesUnsub = null; }
          myUid = null; dmRows = []; dmUnread = 0; prevUnread = {}; firstSnap = true;
          replyRows = []; replyFirstSnap = true;
          renderBadge(); if (panel || pageEl) paintPanel();
          return;
        }
        myUid = u.uid;
        daRegisterPush(); // Web Push: subscribe a signed-in device on load (no-op if permission/VAPID absent)
        // Reconcile the live-alert toggle with the server copy so it reads
        // right across devices (localStorage is only this device's cache).
        u.getIdToken().then(function (tok) {
          return fetch('/.netlify/functions/notify-prefs', { headers: { 'Authorization': 'Bearer ' + tok } });
        }).then(function (r) { return r.json(); }).then(function (p) {
          if (!p) return;
          try { localStorage.setItem(DA_LIVE_ALERTS_KEY, p.liveAlerts ? '1' : '0'); } catch (_) {}
          daMergeMutedFromServer(p.mutedThreads);
          if (panel || pageEl) paintPanel();
        }).catch(function () {});
        renderBadge(); // apply the sign-in gate as soon as auth resolves
        ensureFirestore(subscribe);
      });
    });

    function subscribe() {
      if (!window.firebase.firestore || !myUid) return;
      var db;
      try { db = window.firebase.firestore(); }
      catch (e) { console.warn('[notifications] firestore unavailable', e && e.message); return; }
      if (threadsUnsub) { try { threadsUnsub(); } catch (e) {} }
      threadsUnsub = db.collection('dm_threads')
        .where('participants', 'array-contains', myUid)
        .orderBy('lastMessageAt', 'desc')
        .limit(20)
        .onSnapshot(onThreads, function (err) {
          console.warn('[notifications] inbox listen failed', err && err.message);
        });
      subscribeForumReplies(db);
    }

    // ── forum-reply layer ────────────────────────────────────────────
    // Watch replies on your 10 newest /community threads and surface
    // them in the bell (badge + panel row + toast/OS notification),
    // deep-linking to /community#thread=<id>. Cost-guarded for the
    // free Firestore tier: one get() for your thread ids + a single
    // listener capped at 12 reply docs. Every failure path is silent —
    // this layer is decoration on the bell, never load-bearing.
    function subscribeForumReplies(db) {
      if (repliesUnsub) { try { repliesUnsub(); } catch (e) {} repliesUnsub = null; }
      replyFirstSnap = true;
      db.collection('forum_posts')
        .where('authorUid', '==', myUid)
        .where('parentId', '==', null)
        .limit(30)
        .get()
        .then(function (snap) {
          var mine = snap.docs.map(function (d) {
            var data = d.data() || {};
            return { id: d.id, title: data.title || '', at: (data.createdAt && data.createdAt.seconds) || 0 };
          });
          if (!mine.length) return;
          mine.sort(function (a, b) { return b.at - a.at; });
          var ids = mine.slice(0, 10).map(function (t) { return t.id; });
          var titles = {};
          mine.forEach(function (t) { titles[t.id] = t.title; });
          function attach(q, sortClient) {
            return q.onSnapshot(function (s) { onReplySnap(s, titles); }, function (err) {
              // in+orderBy needs the (rootId, createdAt) composite; if
              // this environment lacks it, retry without orderBy and
              // sort client-side (onReplySnap sorts anyway).
              if (sortClient) return;
              if (err && /FAILED_PRECONDITION|index/i.test(err.message || '')) {
                repliesUnsub = attach(db.collection('forum_posts').where('rootId', 'in', ids).limit(40), true);
              }
            });
          }
          repliesUnsub = attach(
            db.collection('forum_posts').where('rootId', 'in', ids).orderBy('createdAt', 'desc').limit(12),
            false
          );
        })
        .catch(function () { /* silent */ });
    }

    function onReplySnap(snap, titles) {
      var rows = [];
      snap.forEach(function (d) {
        var data = d.data() || {};
        if (data.authorUid === myUid) return; // my own replies aren't news
        rows.push({
          id: d.id,
          threadId: data.rootId || '',
          threadTitle: titles[data.rootId] || '',
          name: data.authorName || 'A debater',
          content: (data.content || '').replace(/\s+/g, ' '),
          when: ((data.createdAt && data.createdAt.seconds) || 0) * 1000,
        });
      });
      rows.sort(function (a, b) { return b.when - a.when; });
      rows = rows.slice(0, 8);
      var newest = rows.length ? rows[0] : null;
      var isFresh = !replyFirstSnap && newest && newest.when > replySeen &&
        !replyRows.some(function (r) { return r.id === newest.id; });
      replyRows = rows;
      // First-ever visit: everything that already exists counts as seen,
      // same baseline rule as the updates/activity feeds.
      if (!hadReplyBaseline) { markRepliesSeen(); hadReplyBaseline = true; }
      renderBadge();
      if (panel || pageEl) paintPanel();
      if (isFresh) {
        announce(
          { name: newest.name + ' replied to your thread', href: '/community#thread=' + encodeURIComponent(newest.threadId), isGroup: true, photo: '' },
          newest.content.slice(0, 90)
        );
      }
      replyFirstSnap = false;
    }

    function replyUnreadCount() {
      var n = 0;
      for (var i = 0; i < replyRows.length; i++) if ((replyRows[i].when || 0) > replySeen) n++;
      return n;
    }
    function markRepliesSeen() {
      var max = replySeen;
      for (var i = 0; i < replyRows.length; i++) max = Math.max(max, replyRows[i].when || 0);
      if (max > replySeen) {
        replySeen = max;
        try { localStorage.setItem('da-forum-reply-seen', String(max)); } catch (_) {}
      }
    }

    function onThreads(snap) {
      var rows = [], unreadCount = 0, newest = null;
      snap.forEach(function (d) {
        var data = d.data() || {};
        var unread = (data.unread && data.unread[myUid]) || 0;
        // Muting is opt-out and per thread. It suppresses the badge and
        // the announce; the row itself stays on the list, because
        // "quiet" is not the same as "hidden".
        var muted = daIsMuted(d.id);
        if (unread > 0 && !muted) unreadCount++;
        var prev = prevUnread[d.id] || 0;
        if (!firstSnap && !muted && unread > prev && data.lastMessageFrom && data.lastMessageFrom !== myUid) {
          newest = { data: data, id: d.id };
        }
        prevUnread[d.id] = unread;
        rows.push({ id: d.id, data: data, unread: unread, muted: muted });
      });
      dmRows = rows; dmUnread = unreadCount;
      renderBadge();
      if (panel || pageEl) paintPanel();
      if (!firstSnap && newest) {
        announce(threadDisplay(newest.data, myUid, newest.id), newest.data.lastMessage || 'sent a message');
      }
      firstSnap = false;
    }

    // ── panel ────────────────────────────────────────────────────────
    function positionPanel() {
      if (!panel) return;
      var rect = bell.getBoundingClientRect();
      var gutter = 12;
      var topPx = Math.round(rect.bottom + 10);
      panel.style.top = topPx + 'px';
      panel.style.bottom = 'auto';
      panel.style.maxHeight = Math.max(220, window.innerHeight - topPx - gutter) + 'px';
      if (window.matchMedia('(max-width:560px)').matches) {
        panel.style.left = gutter + 'px';
        panel.style.right = gutter + 'px';
        panel.style.width = 'auto';
        panel.style.maxWidth = 'none';
      } else {
        panel.style.left = 'auto';
        panel.style.right = Math.max(gutter, Math.round(window.innerWidth - rect.right)) + 'px';
        panel.style.width = '400px';
        panel.style.maxWidth = 'calc(100vw - 24px)';
      }
    }

    function openPanel() {
      cancelPanelTimers();
      if (panel) { positionPanel(); return; }
      seenSnapshot = updatesSeen;   // snapshot before marking, so the new ones still get a dot
      activitySeenSnapshot = activitySeen;  // same trick for activity rows
      replySeenSnapshot = replySeen;        // and for forum-reply rows
      loadActivity();               // refresh the activity feed when user opens the bell
      loadOnlineCount();            // refresh the live-presence row too
      panel = document.createElement('div');
      panel.className = 'ui-bell-panel';
      panel.id = 'daBellPanel';
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      panel.addEventListener('mouseenter', cancelPanelTimers);
      panel.addEventListener('mouseleave', function () { if (canHover()) schedulePanelClose(); });
      document.body.appendChild(panel);
      positionPanel();
      bell.setAttribute('aria-expanded', 'true');
      bell.setAttribute('aria-controls', 'daBellPanel');
      markUpdatesSeen();            // opening the panel clears the updates side of the badge
      markActivitySeen();           // and the activity side
      markRepliesSeen();            // and the forum-reply side
      renderBadge();
      paintPanel();
    }
    function closePanel() {
      cancelPanelTimers();
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      bell.setAttribute('aria-expanded', 'false');
      bell.removeAttribute('aria-controls');
    }

    function updateRowHtml(u) {
      var isNew = (u.id || 0) > seenSnapshot;
      var inner =
        '<span class="ui-bell-av ui-bell-av--blank" style="color:var(--dab-accent)">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>' +
        '</span>' +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(u.title || 'Update') + (isNew ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview" style="white-space:normal">' + escHtml(u.body || '') + '</span>' +
        '</span>' +
        '<span class="ui-bell-row__time">' + escHtml(u.date || '') + '</span>';
      var cls = 'ui-bell-row' + (isNew ? ' is-unread' : '');
      return u.href
        ? '<a class="' + cls + '" href="' + escHtml(u.href) + '">' + inner + '</a>'
        : '<div class="' + cls + '" style="cursor:default">' + inner + '</div>';
    }

    // Activity row — recent live_challenges + waitlist_posts from
    // /api/recent-activity. Public, no auth. The icon swaps based
    // on kind so users can tell a "challenge" (sword) from a
    // "waitlist invite" (door). Each row deep-links to /live or
    // /spar so a click on activity converts into an actual visit.
    function activityRowHtml(a) {
      var isNew = (a.when || 0) > activitySeenSnapshot;
      var when = a.when ? relTime(a.when) : '';
      var iconSvg = a.kind === 'waitlist'
        // door-open glyph: "open to a round, come in"
        ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4v16M3 21h18M13 4l-7 2v14M9 12h.01"/></svg>'
        // crossed-swords glyph: "open debate challenge"
        : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5 21 11l-2.5-2.5L12 15"/><path d="M9.5 6.5 3 13l2.5 2.5L12 9"/><path d="m21 3-5 1-1 5M3 21l5-1 1-5"/></svg>';
      var preview = escHtml(a.label || '');
      if (a.motion) preview += ' <span style="color:var(--dab-ghost)">· ' + escHtml(a.motion) + '</span>';
      var cls = 'ui-bell-row' + (isNew ? ' is-unread' : '');
      return '<a class="' + cls + '" href="' + escHtml(a.href || '/live') + '">' +
        '<span class="ui-bell-av ui-bell-av--blank" style="color:var(--dab-accent)">' + iconSvg + '</span>' +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(a.name || 'A debater') + (isNew ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview">' + preview + '</span>' +
        '</span>' +
        '<span class="ui-bell-row__time">' + escHtml(when) + '</span>' +
      '</a>';
    }

    // Forum-reply row — someone replied on one of your /community
    // threads. Deep-links straight into the thread modal.
    function replyRowHtml(r) {
      var isNew = (r.when || 0) > replySeenSnapshot;
      var when = r.when ? relTime(r.when) : '';
      return '<a class="ui-bell-row' + (isNew ? ' is-unread' : '') + '" href="/community#thread=' + encodeURIComponent(r.threadId) + '">' +
        '<span class="ui-bell-av ui-bell-av--blank" style="color:var(--dab-accent)">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '</span>' +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(r.name) + ' replied' + (isNew ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview">' + escHtml(r.content.slice(0, 90)) + (r.threadTitle ? ' <span style="color:var(--dab-ghost)">· re: ' + escHtml(r.threadTitle.slice(0, 60)) + '</span>' : '') + '</span>' +
        '</span>' +
        '<span class="ui-bell-row__time">' + escHtml(when) + '</span>' +
      '</a>';
    }

    function dmRowHtml(t) {
      var disp = threadDisplay(t.data, myUid, t.id);
      var when = t.data.lastMessageAt && t.data.lastMessageAt.toMillis ? relTime(t.data.lastMessageAt.toMillis()) : '';
      var fromMe = t.data.lastMessageFrom === myUid;
      var preview = (fromMe ? 'You: ' : '') + (t.data.lastMessage || '');
      var avatar = disp.isGroup
        ? groupAvatarSvg()
        : (disp.photo
          ? '<img class="ui-bell-av" src="' + escHtml(disp.photo) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="ui-bell-av ui-bell-av--blank">' + escHtml((disp.name[0] || '?').toUpperCase()) + '</span>');
      var muted = !!t.muted;
      var link = '<a class="ui-bell-row' + (t.unread > 0 && !muted ? ' is-unread' : '') + (muted ? ' is-muted' : '') + '" href="' + disp.href + '">' +
        avatar +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(disp.name) +
            (disp.isGroup ? '<span class="ui-bell-tag">group</span>' : '') +
            (t.unread > 0 && !muted ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview">' + escHtml(preview) + '</span>' +
        '</span>' +
        '<span class="ui-bell-row__time">' + escHtml(when) + '</span>' +
      '</a>';
      // The mute control is a sibling of the link, not a child: a button
      // inside an anchor is invalid, and nesting it would make the whole
      // row swallow the click that was meant for the thread.
      return '<div class="ui-bell-rowwrap">' + link +
        '<button type="button" class="ui-bell-mute' + (muted ? ' is-on' : '') + '" data-bell-mute="' + escHtml(t.id) + '" ' +
          'aria-pressed="' + (muted ? 'true' : 'false') + '" ' +
          'title="' + (muted ? 'Muted. Turn notifications back on' : 'Mute this conversation') + '" ' +
          'aria-label="' + (muted ? 'Unmute ' : 'Mute ') + escHtml(disp.name) + '">' +
          (muted
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.6 13A17 17 0 0 1 18 8a6 6 0 0 0-9.3-5"/><path d="M6 8a6 6 0 0 0-.6 2.6C5.4 17 3 19 3 19h13"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>') +
        '</button>' +
      '</div>';
    }

    // Opt-in row: "Alert me when rounds are forming". Pings this user (Web
    // Push, even on another app) whenever any debater goes live. Distinct
    // from the "Available" pill, which makes YOU matchable.
    function liveAlertRowHtml() {
      var on = daGetLiveAlerts();
      return '<button type="button" id="daLiveAlertToggle" class="ui-bell-la" aria-pressed="' + (on ? 'true' : 'false') + '" ' +
        'style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:0;border-bottom:1px solid var(--dab-border);background:transparent;color:inherit;cursor:pointer;text-align:left;font-family:inherit">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:' + (on ? 'rgba(34,197,94,.14)' : 'var(--dab-elev)') + ';color:' + (on ? '#22c55e' : 'var(--dab-dim)') + '">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '</span>' +
        '<span style="flex:1;min-width:0">' +
          '<span style="display:block;font-size:.96rem;font-weight:700;color:var(--dab-text)">Alert me when rounds are forming</span>' +
          '<span style="display:block;font-size:.82rem;color:var(--dab-dim)">Get pinged when a debater goes live, even in another app</span>' +
        '</span>' +
        '<span aria-hidden="true" style="position:relative;flex-shrink:0;width:36px;height:21px;border-radius:999px;transition:background .15s;background:' + (on ? '#22c55e' : 'var(--dab-border-strong)') + '">' +
          '<span style="position:absolute;top:2px;left:' + (on ? '17px' : '2px') + ';width:17px;height:17px;border-radius:50%;background:#fff;transition:left .15s"></span>' +
        '</span>' +
      '</button>';
    }
    function bindLiveAlertToggle() {
      // Class-based so the panel and the /notifications page can both carry
      // the toggle without fighting over one element id.
      var btns = document.querySelectorAll('.ui-bell-la');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (e) {
          e.stopPropagation();
          var next = !daGetLiveAlerts();
          daSetLiveAlerts(next, function () { paintPanel(); });
          paintPanel(); // optimistic repaint (also repaints the page)
        });
      }
    }

    function matchesFeedHtml(expanded) {
      var html = '<div class="ui-bell-head ui-bell-head--mid">Matches and live rounds' +
        (activity.length ? '<span class="ui-bell-head__n">' + activity.length + '</span>' : '') + '</div>';
      var hasRows = false;
      if (myUid) html += liveAlertRowHtml();
      // People actually waiting for a round. This stays above general
      // activity because it is the one notification the user can act on now.
      if (liveNow && liveNow.count > 0) {
        hasRows = true;
        var others = (liveNow.debaters || []).filter(function (d) { return d.uid !== myUid; });
        var names = others.slice(0, 3).map(function (d) { return escHtml((d.name || '').split(/\s+/)[0]); }).filter(Boolean);
        var sub = names.length ? names.join(', ') + (liveNow.count > names.length ? ' and more' : '') : 'Tap to find your match';
        html += '<div class="ui-bell-list">' +
          '<a class="ui-bell-row" href="/spar?from=bell-live" style="background:linear-gradient(90deg,rgba(34,197,94,.10),transparent 75%)">' +
            '<span class="ui-bell-av ui-bell-av--blank" style="position:relative;color:#22c55e">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5 21 11l-2.5-2.5L12 15"/><path d="M9.5 6.5 3 13l2.5 2.5L12 9"/><path d="m21 3-5 1-1 5M3 21l5-1 1-5"/></svg>' +
            '</span>' +
            '<span class="ui-bell-row__main">' +
              '<span class="ui-bell-row__name">' + liveNow.count + (liveNow.count === 1 ? ' debater looking to spar' : ' debaters looking to spar') + '</span>' +
              '<span class="ui-bell-row__preview">' + sub + '</span>' +
            '</span>' +
            '<span class="ui-bell-row__time" style="color:#22c55e">spar →</span>' +
          '</a>' +
        '</div>';
      }
      if (onlineCount !== null && onlineCount > 0) {
        hasRows = true;
        html += '<div class="ui-bell-list">' +
          '<a class="ui-bell-row" href="/live">' +
            '<span class="ui-bell-av ui-bell-av--blank" style="position:relative">' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.55);animation:daBellLivePulse 1.7s ease-out infinite"></span>' +
            '</span>' +
            '<span class="ui-bell-row__main">' +
              '<span class="ui-bell-row__name">' + onlineCount + ' online right now</span>' +
              '<span class="ui-bell-row__preview">Active in the last 5 minutes</span>' +
            '</span>' +
            '<span class="ui-bell-row__time">live</span>' +
          '</a>' +
        '</div>';
      }
      if (nextRound && nextRound.startAt > Date.now()) {
        hasRows = true;
        var nd = new Date(nextRound.startAt);
        var sameDay = nd.toDateString() === new Date().toDateString();
        var whenTxt = (sameDay ? 'Today' : nd.toLocaleDateString(undefined, { weekday: 'short' })) +
          ' ' + nd.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        var fmtNames = { quick: 'General', apda: 'APDA', bp: 'BP', worlds: 'Worlds', asian: 'Asian Parli', ld: 'LD', pf: 'Public Forum', policy: 'Policy', congress: 'Congress' };
        var schedSub = escHtml(whenTxt) + ' · ' + (fmtNames[nextRound.format] || 'General') +
          (nextRound.rsvpCount > 0 ? ' · ' + nextRound.rsvpCount + ' in' : '');
        html += '<div class="ui-bell-list">' +
          '<a class="ui-bell-row" href="/community?from=bell-sched">' +
            '<span class="ui-bell-av ui-bell-av--blank" style="position:relative">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            '</span>' +
            '<span class="ui-bell-row__main">' +
              '<span class="ui-bell-row__name">Next scheduled round</span>' +
              '<span class="ui-bell-row__preview">' + schedSub + '</span>' +
            '</span>' +
            '<span class="ui-bell-row__time">RSVP →</span>' +
          '</a>' +
        '</div>';
      }
      if (activity.length) {
        hasRows = true;
        var cap = expanded ? 40 : 4;
        html += '<div class="ui-bell-list">' + activity.slice(0, cap).map(activityRowHtml).join('') + '</div>';
        html += activity.length > cap
          ? '<button type="button" class="ui-bell-foot ui-bell-foot--btn" data-bell-filter="matches">' +
              (activity.length - cap) + ' more open round' + (activity.length - cap === 1 ? '' : 's') + '</button>'
          : '<a class="ui-bell-foot" href="/challenges">See claims and challenges</a>';
      }
      if (!hasRows) {
        html += '<div class="ui-bell-empty">Quiet right now.<br>' +
                '<a href="/challenges" style="color:var(--dab-accent);text-decoration:none;font-weight:700">Post a claim</a>' +
                ' or <a href="/spar" style="color:var(--dab-accent);text-decoration:none;font-weight:700">join the waitlist</a> to start one.</div>';
      }
      return html;
    }

    function repliesFeedHtml(showEmpty, limit) {
      if (!myUid) {
        return showEmpty
          ? '<div class="ui-bell-head ui-bell-head--mid">Replies</div><div class="ui-bell-empty">Sign in to see replies to your community threads.</div>'
          : '';
      }
      if (replyRows.length) {
        var shownR = limit ? replyRows.slice(0, limit) : replyRows;
        var hiddenR = replyRows.length - shownR.length;
        var html = '<div class="ui-bell-head ui-bell-head--mid">Replies to your threads' +
          '<span class="ui-bell-head__n">' + replyRows.length + '</span></div>';
        html += '<div class="ui-bell-list">' + shownR.map(replyRowHtml).join('') + '</div>';
        if (hiddenR > 0) {
          html += '<button type="button" class="ui-bell-foot ui-bell-foot--btn" data-bell-filter="replies">' +
            hiddenR + ' more repl' + (hiddenR === 1 ? 'y' : 'ies') + '</button>';
        }
        return html;
      }
      return showEmpty
        ? '<div class="ui-bell-head ui-bell-head--mid">Replies</div><div class="ui-bell-empty">No replies yet.<br><a href="/community" style="color:var(--dab-accent);text-decoration:none;font-weight:700">Start a community thread</a> to open the conversation.</div>'
        : '';
    }

    // `limit` caps the section in the dropdown. Before this the messages
    // list rendered every thread, so on an account with a dozen
    // conversations the Rounds, Replies and Updates sections sat below
    // hundreds of pixels of DMs and were, in practice, invisible.
    function messagesFeedHtml(showEmpty, limit) {
      if (!myUid) {
        return showEmpty
          ? '<div class="ui-bell-head ui-bell-head--mid">Messages</div><div class="ui-bell-empty">Sign in to see your messages.</div>'
          : '';
      }
      if (dmRows.length) {
        var shown = limit ? dmRows.slice(0, limit) : dmRows;
        var hidden = dmRows.length - shown.length;
        return '<div class="ui-bell-head ui-bell-head--mid">Messages' +
            (dmRows.length ? '<span class="ui-bell-head__n">' + dmRows.length + '</span>' : '') + '</div>' +
          '<div class="ui-bell-list">' + shown.map(dmRowHtml).join('') + '</div>' +
          (hidden > 0
            ? '<button type="button" class="ui-bell-foot ui-bell-foot--btn" data-bell-filter="messages">' +
                hidden + ' more conversation' + (hidden === 1 ? '' : 's') + '</button>'
            : '<a class="ui-bell-foot" href="/messages">Open all messages</a>');
      }
      return showEmpty
        ? '<div class="ui-bell-head ui-bell-head--mid">Messages</div><div class="ui-bell-empty">No messages yet.<br>Open a debater profile or the live board to start one.</div><a class="ui-bell-foot" href="/messages">Open messages</a>'
        : '';
    }

    function updatesFeedHtml(expanded) {
      var html = '<div class="ui-bell-head ui-bell-head--mid">Product updates' +
        (updates.length ? '<span class="ui-bell-head__n">' + updates.length + '</span>' : '') + '</div>';
      if (!updates.length) return html + '<div class="ui-bell-empty">No product updates yet.</div>';
      var capU = expanded ? 60 : 3;
      html += '<div class="ui-bell-list">' + updates.slice(0, capU).map(updateRowHtml).join('') + '</div>';
      if (updates.length > capU) {
        html += '<button type="button" class="ui-bell-foot ui-bell-foot--btn" data-bell-filter="updates">' +
          (updates.length - capU) + ' more update' + (updates.length - capU === 1 ? '' : 's') + '</button>';
      }
      return html;
    }

    // The full page is ordered by relevance: personal activity first,
    // actionable live matches next, and product announcements last.
    // `compact` is the dropdown. Every section is capped there so all
    // four are reachable without scrolling past one of them, and each
    // cap ends in a control that opens that section in full.
    function buildFeedHtml(full, filter, compact) {
      filter = filter || 'all';
      if (filter === 'matches') return matchesFeedHtml(true);
      if (filter === 'replies') return repliesFeedHtml(true);
      if (filter === 'messages') return messagesFeedHtml(true);
      if (filter === 'updates') return updatesFeedHtml(true);
      var html = '';
      html += messagesFeedHtml(false, compact ? 4 : 0);
      html += repliesFeedHtml(false, compact ? 3 : 0);
      html += matchesFeedHtml(!compact);
      html += updatesFeedHtml(!compact);
      return html;
    }

    // Section switcher for the dropdown, mirroring the filter chips the
    // /notifications page already has. Counts are unread, not totals, so
    // a chip only shouts when it has something new behind it.
    var panelFilter = 'all';
    function panelTabsHtml() {
      var tabs = [
        { k: 'all',      label: 'All',      n: 0 },
        { k: 'messages', label: 'Messages', n: dmUnread },
        { k: 'matches',  label: 'Rounds',   n: activityUnreadCount() },
        { k: 'replies',  label: 'Replies',  n: replyUnreadCount() },
        { k: 'updates',  label: 'Updates',  n: updatesUnreadCount() }
      ];
      return '<div class="ui-bell-tabs" role="group" aria-label="Notification sections">' +
        tabs.map(function (t) {
          var on = panelFilter === t.k;
          return '<button type="button" class="ui-bell-tab' + (on ? ' is-on' : '') + '" ' +
            'data-bell-filter="' + t.k + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
            escHtml(t.label) + (t.n > 0 ? '<i>' + (t.n > 9 ? '9+' : t.n) + '</i>' : '') + '</button>';
        }).join('') +
      '</div>';
    }

    function paintPanel() {
      if (pageEl) paintPage();
      if (!panel) return;
      var oldScroller = panel.querySelector('.ui-bell-panel__scroll');
      var oldScrollTop = oldScroller ? oldScroller.scrollTop : 0;
      // The dropdown gets a footer link to the full page; the page itself
      // obviously doesn't.
      panel.innerHTML =
        '<div class="ui-bell-panel__bar"><span class="ui-bell-panel__title">Notifications</span>' +
          (panelFilter === 'all' ? '<span class="ui-bell-panel__hint">Scroll to browse</span>' : '') + '</div>' +
        panelTabsHtml() +
        '<div class="ui-bell-panel__scroll">' + buildFeedHtml(true, panelFilter, panelFilter === 'all') + '</div>' +
        '<a class="ui-bell-foot" href="/notifications" style="font-weight:800">Notifications page &rarr;</a>';
      var newScroller = panel.querySelector('.ui-bell-panel__scroll');
      if (newScroller && oldScrollTop) newScroller.scrollTop = oldScrollTop;
      if (myUid) bindLiveAlertToggle();
      bindPanelSectionControls();
      bindMuteToggles(panel);
    }

    // Both the chips and the per-section "N more" controls carry
    // data-bell-filter, so one binder covers both.
    function bindPanelSectionControls() {
      if (!panel) return;
      var btns = panel.querySelectorAll('[data-bell-filter]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          panelFilter = this.getAttribute('data-bell-filter') || 'all';
          paintPanel();
          var sc = panel && panel.querySelector('.ui-bell-panel__scroll');
          if (sc) sc.scrollTop = 0;
        });
      }
    }

    // Mute lives on the row it belongs to, in the one place every thread
    // is already listed, so turning a loud group down never means hunting
    // for a settings page.
    function bindMuteToggles(root) {
      var scopes = root ? [root] : [panel, pageEl];
      for (var s = 0; s < scopes.length; s++) {
        if (!scopes[s]) continue;
        var btns = scopes[s].querySelectorAll('[data-bell-mute]');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var id = this.getAttribute('data-bell-mute');
            var next = !daIsMuted(id);
            daSetMuted(id, next);
            // Recompute the badge off the rows we already hold rather
            // than waiting for the next snapshot.
            for (var j = 0; j < dmRows.length; j++) {
              if (dmRows[j].id === id) dmRows[j].muted = next;
            }
            var n = 0;
            for (var k = 0; k < dmRows.length; k++) if (dmRows[k].unread > 0 && !dmRows[k].muted) n++;
            dmUnread = n;
            renderBadge();
            paintPanel();
          });
        }
      }
    }

    function paintPage() {
      if (!pageEl) return;
      pageEl.innerHTML = buildFeedHtml(true, pageFilter);
      if (myUid) bindLiveAlertToggle();
      bindMuteToggles(pageEl);
      // Viewing the page reads everything: advance the seen markers (the
      // snapshots above keep this visit's unread dots visible) and clear
      // the bell badge.
      markUpdatesSeen();
      markActivitySeen();
      markRepliesSeen();
      renderBadge();
    }

    function announce(disp, preview) {
      showToast(disp, preview);
      daPing();
      daFlashTitle('New message'); // cross-platform (incl. iOS) tab-title ping
      try {
        if (daCanOsNotify()) {
          var title = disp.isGroup ? disp.name : ('New message from ' + disp.name);
          var n = new Notification(title, {
            body: preview,
            icon: '/favicon.svg',
            tag: 'da-thread-' + disp.href,
          });
          n.onclick = function () { window.focus(); location.href = disp.href; n.close(); };
        }
      } catch (_) {}
    }
    function showToast(disp, preview) {
      var host = document.getElementById('da-bell-toasts');
      if (!host) {
        host = document.createElement('div');
        host.id = 'da-bell-toasts';
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'false');
        document.body.appendChild(host);
      }
      var t = document.createElement('a');
      t.className = 'da-bell-toast';
      t.href = disp.href;
      t.setAttribute('aria-label', 'Open new message from ' + disp.name);
      var avatar = disp.isGroup
        ? '<span class="da-bell-toast__blank"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>'
        : (disp.photo
          ? '<img src="' + escHtml(disp.photo) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="da-bell-toast__blank">' + escHtml((disp.name[0] || '?').toUpperCase()) + '</span>');
      t.innerHTML = avatar +
        '<span class="da-bell-toast__main">' +
          '<span class="da-bell-toast__eyebrow">' + (disp.isGroup ? 'New activity' : 'New message') + '</span>' +
          '<span class="da-bell-toast__name">' + escHtml(disp.name) + '</span>' +
          '<span class="da-bell-toast__preview">' + escHtml(preview) + '</span>' +
        '</span>';
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      setTimeout(function () { t.classList.remove('in'); setTimeout(function () { if (t.parentNode) t.remove(); }, 320); }, 6000);
    }
  }

  // ── background spar matchmaking ──────────────────────────────────
  // Decouples /spar matchmaking from the /spar page. A signed-in user
  // flips "Available" (a pill next to the bell) and keeps using Prep or
  // any page; their queue doc sits waiting in the background with
  // broaden:true. When another available debater is found, the EXISTING
  // server pair function (/.netlify/functions/spar-pair, admin SDK)
  // matches both docs, and a "Match found · Accept/Decline" card pops
  // anywhere on the site. Accept → /live-round; decline/timeout → stay
  // available. Reuses the live infra wholesale: same matchmaking_queue
  // doc shape as /spar, same spar-pair function, same /live-round spawn
  // params. No new security rule (client only reads the queue + writes
  // its OWN doc; the cross-write is spar-pair's). One new composite
  // index (broaden,status,joinedAt) for the scan, in firestore.indexes.
  //
  // Cost guard (project is on the Firestore free tier and blew quota in
  // May): only opted-in users run anything; the own-doc listener is 1
  // doc; the peer scan + heartbeat run on slow intervals and pause while
  // the tab is hidden; stale docs self-reap via spar-pair's reaper.
  function sparLive() {
    if (window.__daSparLiveLoaded) return;
    window.__daSparLiveLoaded = true;

    var LSKEY = 'da-spar-bg';                 // '1' when available
    // Self-attested age band (js/age-gate.js). The background matcher
    // never prompts — it reads whatever /spar or /debate-chat recorded.
    // '' (never asked) pairs as an adult-side unknown; a recorded minor
    // only pairs with another recorded minor (enforced in spar-pair).
    function agBand() { try { var b = localStorage.getItem('da-age-band'); return (b === 'minor' || b === 'adult') ? b : ''; } catch (e) { return ''; } }
    function agOk(mine, theirs) { theirs = (theirs === 'minor' || theirs === 'adult') ? theirs : ''; if (mine === 'minor' || theirs === 'minor') return mine === theirs; return true; }
    // Server-record self-heal (the 2026-08-22 hardening): spar-pair now
    // enforces bands from age_bands/{uid}, so an account that answered the
    // question before the record existed gets AGE_BAND_REQUIRED on its
    // first pair attempt. Re-POST the stored answer once; age-gate.js is
    // not loaded on most topbar pages, so the POST is inlined. A 409 means
    // the account already has a (different) recorded answer — adopt it.
    var agHealAt = 0;
    function agHeal(band) {
      if (Date.now() - agHealAt < 10000) return;
      agHealAt = Date.now();
      try {
        window.firebase.auth().currentUser.getIdToken().then(function (tok) {
          return fetch('/api/age-band', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ band: band })
          });
        }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
          .then(function (r) {
            if (r.status === 409 && r.body && (r.body.band === 'minor' || r.body.band === 'adult')) {
              try { localStorage.setItem('da-age-band', r.body.band); } catch (e) {}
            }
          }).catch(function () {});
      } catch (e) {}
    }
    var FMT_KEY = 'debateos-spar-format';     // preferred format (shared w/ /spar)
    var HEARTBEAT_MS = 90 * 1000;             // re-stamp joinedAt so the 3-min reaper doesn't cull us
    var SCAN_MS = 60 * 1000;                  // look for a peer to pair with
    var STALE_MS = 3 * 60 * 1000;             // ignore peers older than this
    // 2026-08-26: 20 -> 45, matching /spar's CONSENT_DECIDE_SEC. This
    // overlay is by definition shown to someone doing something else on
    // another page, which is the case a twenty-second window serves
    // worst. Must stay BELOW spar-pair's GHOST_CONSENT_MS (55s) so a
    // live tab always answers before the server calls it a ghost.
    var COUNTDOWN_S = 45;                     // accept window
    var REINVITE_COOLDOWN_MS = 2 * 60 * 1000; // after a decline/timeout, stay quiet this long before any re-invite
    var VALID =['quick','apda','bp','worlds','asian','ld','pf','policy','congress','casual']; // MUST match spar-pair.mjs VALID_FORMATS or the pair POST 400s
    // Don't run the matcher ON an active round (notifications.js loads on
    // /live-round + /voice-debate too) — you're already debating; being
    // re-queued as "waiting" there would pop a match mid-round.
    // newvoice + room-judge added 2026-08-23: both are live-round surfaces
    // (a voice round, and judging someone else's round). They were missing
    // here, so anyone on them stayed matchable and could be pulled into a
    // second round mid-round. The pill now floats on bar-less pages, which
    // would have made that reachable rather than theoretical.
    var ON_ROUND = /\/(live-round|voice-debate|exhibition|casual-room|newvoice|room-judge)/.test(location.pathname);
    // /spar runs its OWN foreground matchmaker against the same queue doc.
    // Suppress the background matcher there so the two don't fight over the
    // doc; /spar instead sets the availability flag + sends the user to
    // prep, and the matcher activates on the next page.
    var ON_SPAR = /\/spar(?:\.html)?(?:[/?#]|$)/.test(location.pathname);
    // Don't run the background matcher on public marketing / landing surfaces
    // (the homepage especially). A first-time visitor, or a returning signed-in
    // user who once flipped "Available", should never be yanked off a marketing
    // page into a live round. The availability flag persists; matching resumes
    // when they are back in the app (Prep). This was redirecting plain homepage
    // visitors into /live-round?source=spar-bg ~1s after load. Fixed 2026-06.
    // 2026-06-15: live matching now runs everywhere the topbar shows
    // (user ask: "be live for live debates while you scroll"). The
    // earlier gate that disabled the matcher on public/marketing pages
    // existed to stop a returning available user from being yanked into
    // a round on the homepage. That risk is handled differently now:
    // showMatch is CARD-ONLY (it never auto-navigates — Accept is always
    // required), so a visitor can't be pulled into a round without an
    // explicit tap. Availability stays opt-in (the Go-live prompt / the
    // pill), so only users who chose it ever write to the queue. With
    // those two guarantees the public-page exclusion is no longer needed.
    var ON_PUBLIC = false;
    // Those two answer for THIS tab. js/round-presence.js publishes the same
    // fact across tabs, so a second tab opened mid-round stops reading as
    // idle and queueing the debater for a second round. 'round' behaves like
    // ON_ROUND (step out of the queue: the round tab has no card to answer
    // an invite with, so a peer accepting lands in an empty room); 'spar'
    // behaves like ON_SPAR (that tab's foreground matcher owns the doc, so
    // stay off it rather than delete it).
    function inRound() { return ON_ROUND || daPresenceKind() === 'round'; }
    function inSpar() { return ON_SPAR || daPresenceKind() === 'spar'; }
    function busyElsewhere() { return inRound() || inSpar(); }

    var available = false;
    try { available = localStorage.getItem(LSKEY) === '1'; } catch (e) {}
    var myUid = null, myUser = null, db = null, myRef = null;
    var ownUnsub = null, hbTimer = null, scanTimer = null;
    var pill = null, overlay = null, handledRoom = null, navigating = false;
    // Ready-check state. consentRoom marks the room we've already shown a
    // card for, so the snapshot that lands when our own accept writes
    // `consents` doesn't restart the countdown. awaitingPeer means we
    // accepted and are holding for the other side.
    var consentRoom = null, awaitingPeer = false;
    var declinedPeer = null, declinedAt = 0, scanning = false, pairing = false;
    var suppressAvailableNoteOnce = false;
    // After a decline (or a timed-out invite) we step out of the queue and stay
    // quiet until declineUntil, so an available user is never re-pinged in a
    // tight loop. A manual "go available" toggle clears it (see setAvailable).
    var declineUntil = 0, cooldownTimer = null;
    var docGone = false; // own queue doc reaped/cancelled while we still think we're available

    function fmt() {
      var f = 'apda';
      try { f = (localStorage.getItem(FMT_KEY) || 'apda').toLowerCase(); } catch (e) {}
      return VALID.indexOf(f) >= 0 ? f : 'apda';
    }
    function isRealUser(u) {
      return !!(u && !u.isAnonymous);
    }
    // 2026-08-18: the BACKGROUND pill is named accounts only. Being
    // silently matchable sitewide while browsing is a different decision
    // from trying a round on the page that offers one, and /spar meters
    // guests rather than refusing them (2026-08-19).
    //
    // CORRECTION 2026-08-22: this comment used to say "this file signs
    // nearly every visitor in anonymously for the bell". It does not,
    // and has not for as long as the shipped bundle shows: grep the
    // whole of app/ for signInAnonymously and it appears only in
    // practice.html, live.html, live-round.html and tournament.html.
    // The claim was load-bearing and wrong, because /spar's guest lane
    // was designed on top of it and therefore never reached anyone whose
    // first stop was /spar. That page now mints its own guest session.
    // Do not restore the claim from a stale doc.
    function isQueueUser(u) {
      return isRealUser(u);
    }
    // Both of these are written INTO the matchmaking_queue doc, which the
    // opponent reads, so neither may ever fall back to a real identity.
    // They used to: shortNm dropped to the account's displayName and then
    // to the email local part, and publicUsername led with the email local
    // part outright, so a failed public-identity.js load published
    // someone's real name and the front of their address to a stranger.
    // The fallback is now a uid tail, which identifies nobody.
    function shortNm(u) {
      if (!u) return 'You';
      if (window.DBIdentity) return window.DBIdentity.forUser(u).name;
      var tail = String(u.uid || '').slice(-4).toUpperCase();
      return (u.isAnonymous ? 'Guest ' : 'Debater ') + tail;
    }
    function publicUsername(u) {
      if (window.DBIdentity) return window.DBIdentity.forUser(u).username;
      return 'debater_' + String(u && u.uid || '').slice(-4).toLowerCase();
    }
    function ts() { return window.firebase.firestore.FieldValue.serverTimestamp(); }
    function ensureQueueUser(cb) {
      whenFirebaseReady(function () {
        var auth;
        try { auth = window.firebase.auth(); } catch (e) {}
        if (!auth) { if (window.openAuthModal) window.openAuthModal(); return; }
        function use(u) {
          if (u) {
            myUid = u.uid;
            myUser = u;
            paintPill();
          }
          cb(u);
        }
        // Going available means a stranger can be paired into a live
        // round with you, so it needs a real account. An anonymous
        // session is treated as signed out here and routed to the
        // chooser rather than quietly minted into the queue.
        var u = auth.currentUser;
        if (isRealUser(u)) { use(u); return; }
        if (window.openAuthModal) window.openAuthModal();
        else try { location.href = '/spar'; } catch (e) {}
      });
    }

    // ── pill ──
    function makePill() {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'da-spar-pill';
      b.setAttribute('aria-label', 'Background sparring');
      b.style.display = 'none';
      b.innerHTML = '<span class="da-spar-pill__dot" aria-hidden="true"></span><span class="da-spar-pill__lab">Spar live</span><span class="da-spar-pill__off" aria-hidden="true">×</span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); setAvailable(!available); });
      return b;
    }
    function placePill(p) {
      function attempt() {
        // Explicit opt-in slot for pages with their own bespoke bar
        // (/tournaments, /atlas, the judge pages). Floating over a bar
        // that already exists is the /live-round mistake placeBell
        // documents, so a page with chrome names where the pill goes.
        // data-da-pill-slot="end" appends; default prepends. A slot that
        // also holds the wordmark wants "end", or the pill lands left of
        // the brand.
        var slot = document.querySelector('[data-da-pill-slot]');
        if (slot) {
          if (slot.getAttribute('data-da-pill-slot') === 'end') slot.appendChild(p);
          else slot.insertBefore(p, slot.firstChild);
          return true;
        }
        var tb = document.querySelector('.ui-topbar-right') || document.querySelector('.app-topbar-right');
        if (tb) { var bell = tb.querySelector('.ui-bell'); tb.insertBefore(p, bell || tb.firstChild); return true; }
        var bl = document.querySelector('.bar-links');
        if (bl) { bl.insertBefore(p, bl.firstChild); return true; }
        return false;
      }
      if (attempt()) return;
      // ~6s for the /app React topbar, then float. Without the fallback the
      // pill silently never mounted on any page lacking a known bar, so
      // "available across the whole app" stopped at the topbar pages.
      // Mirrors placeBell's floating chip so the two sit side by side.
      var n = 0, iv = setInterval(function () {
        n++;
        if (attempt()) { clearInterval(iv); return; }
        if (n > 60) {
          clearInterval(iv);
          if (!p.isConnected) {
            p.classList.add('da-spar-pill--floating');
            document.body.appendChild(p);
            paintPill(); // re-assert visibility now that it has a parent
          }
        }
      }, 100);
    }
    function paintPill() {
      if (!pill) return;
      // On public/marketing/content pages we don't show the "Spar live"
      // toggle to cold visitors. But once the user IS available (they
      // went available at /spar), the green "Available" status follows
      // them everywhere so they know they're still matchable and can
      // turn it off, which is the whole queue-follows-you promise. So:
      // always hidden in a round / on /spar; on public pages show ONLY
      // when available; on app pages show always.
      var show = myUid && !ON_ROUND && !ON_SPAR && (available || !ON_PUBLIC);
      pill.style.display = show ? 'inline-flex' : 'none';
      var lab = pill.querySelector('.da-spar-pill__lab');
      if (available) { pill.classList.add('is-on'); if (lab) lab.textContent = 'Available'; pill.title = "You're matchable. Keep this tab open while you work in other tabs and we'll ping you the moment a rival is found. Tap to turn off."; pill.setAttribute('aria-label', "Available for live debates. Tap to turn off."); }
      else { pill.classList.remove('is-on'); if (lab) lab.textContent = 'Spar live'; pill.title = 'Get matched with a human while you browse. No need to wait on the spar page.'; pill.setAttribute('aria-label', 'Go available for live debates'); }
    }

    // ── availability ──
    // Lazy-load the one-time age question for a manual opt-in without a
    // recorded band. Without it the queue doc is a phantom: spar-pair
    // refuses every pair with AGE_BAND_REQUIRED, so real waiters see an
    // entry they can never meet. age-gate.js is not loaded on most
    // topbar pages, so pull it in on demand; if the script fails to
    // load, do nothing rather than enqueue an unpairable doc.
    function askBandThen(cb) {
      if (window.daAskAgeBand) { window.daAskAgeBand(function () { cb(); }); return; }
      var s = document.createElement('script');
      s.src = '/js/age-gate.js';
      s.onload = function () { if (window.daAskAgeBand) window.daAskAgeBand(function () { cb(); }); };
      document.head.appendChild(s);
    }
    function setAvailable(on, quiet) {
      // quiet=true is the programmatic path (the landing live-pull
      // auto-enlist): no OS-permission ask (needs a real gesture), no
      // go-live broadcast to the opted-in pool, no "Matchable" toast.
      // The queue doc, pill, and matcher behave identically.
      if (on && !myUid) {
        available = false;
        try { localStorage.setItem(LSKEY, '0'); } catch (e) {}
        ensureQueueUser(function () { setAvailable(true, quiet); });
        return;
      }
      // Manual opt-in with no age answer: ask first, then proceed. The
      // quiet (programmatic) path never asks — its callers are gated on
      // a recorded band instead, because the modal has no dismiss and
      // must only ever appear on a real click.
      if (on && !quiet && myUid && !agBand()) {
        askBandThen(function () { setAvailable(true, quiet); });
        return;
      }
      available = !!on;
      // Going available = the moment the user most wants to be pinged when a
      // match lands while they browse elsewhere. Ask for OS-notification
      // permission here, on this real click (Safari ignores passive asks).
      if (available && !quiet) daAskNotify();
      try { localStorage.setItem(LSKEY, available ? '1' : '0'); } catch (e) {}
      try { if (window.gtag) gtag('event', on ? 'spar_bg_on' : 'spar_bg_off'); } catch (e) {}
      paintPill();
      // A manual opt-in is an explicit "match me now", so it clears any
      // lingering post-decline quiet window.
      if (on) { declineUntil = 0; if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; } }
      if (available && myUid && busyElsewhere()) {
        // Already debating (or already queued from the matchmaker tab).
        // Keep the standing intent, leave that tab's queue doc alone, and
        // say why nothing happened instead of silently doing nothing.
        if (!quiet) sparNote(inRound() ? "You're already in a round in another tab. We'll make you matchable again when it ends." : "Your other tab is already looking for an opponent.");
        return;
      }
      if (available && myUid && !ON_ROUND && !ON_SPAR) {
        if (quiet) suppressAvailableNoteOnce = true;
        goAvailable();
        // Going live = ping the pool of opted-in debaters (server enforces a
        // per-debater cooldown so this can't spam on repeated toggles).
        if (!quiet) daBroadcastGoLive(fmt(), 'spar');
        // Tell them why the tab matters: a hidden tab pauses our own scan, but
        // the queue doc stays live so an active peer can still pair you and the
        // OS ping fires. Close the tab and the doc is reaped = unmatchable.
        if (suppressAvailableNoteOnce) suppressAvailableNoteOnce = false;
        else sparNote('Matchable. Keep this tab open and we will ping you when a human opponent is ready.');
      }
      else goOffline();
    }
    // Programmatic hook for the landing live-pull module (and QA).
    window.DASparLive = {
      setAvailable: setAvailable,
      isAvailable: function () { return available; },
      // The viewer's own uid, published so sitewide cards can tell "someone
      // is waiting" from "you are waiting". /api/live-now is shared-cached
      // and therefore cannot personalise; its header says self-filtering is
      // the client's job, and until now the only client doing it was the
      // announce path a few lines below. live-popup.js had no auth access at
      // all, so it offered a user their own open seat as an opponent.
      uid: function () { return myUid || null; }
    };
    function goAvailable() {
      if (!myUid || busyElsewhere() || ON_PUBLIC) return;
      // Going available is a click. That click is the last user gesture we
      // are guaranteed before a match lands, and browsers only unlock audio
      // on a gesture — so load + unlock the sound bank here, not at ping
      // time when the tab may already be in the background.
      daEnsureSfx();
      ensureFirestore(function () {
        if (!available) return; // toggled off while the SDK was still loading
        try { db = window.firebase.firestore(); } catch (e) { return; }
        myRef = db.collection('matchmaking_queue').doc(myUid);
        var blockedUids = [];
        try { blockedUids = JSON.parse(localStorage.getItem('dit-blocked-users') || '[]'); if (!Array.isArray(blockedUids)) blockedUids = []; } catch (e) { blockedUids = []; }
        myRef.set({
          uid: myUid,
          displayName: shortNm(myUser),
          username: publicUsername(myUser),
          photoURL: (myUser && myUser.photoURL) || '',
          ageBand: agBand(),
          format: fmt(),
          status: 'waiting',
          broaden: true,
          background: true,
          blockedUids: blockedUids.slice(-100),
          joinedAt: ts()
        }).then(function () {
          if (!available) { myRef.delete().catch(function () {}); return; } // toggled off mid-write
          watchOwnDoc(); startTimers(); scan();
        })
          .catch(function (err) { console.warn('[spar-live] join failed', err && err.message); });
      });
    }
    // Zombie-screen guard (2026-08-18, mirrors spar.html): the heartbeat
    // below already stops for hidden tabs, but a VISIBLE unattended
    // screen (monitor left on, kiosk browser) heartbeated and requeued
    // forever, throwing dead 20s proposals at every new human. Past 4
    // hours with zero interaction the doc is left to the reaper; the
    // first real touch requeues instantly, so "Available" stays a
    // standing intent for anyone actually around.
    var ATTN_STALE_MS = 4 * 60 * 60 * 1000;
    var lastAttn = Date.now(), attnMoveT = 0;
    function humanAround() { return Date.now() - lastAttn < ATTN_STALE_MS; }
    function markAttn() {
      lastAttn = Date.now();
      if (docGone && !document.hidden) requeue();
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, markAttn, { passive: true });
    });
    document.addEventListener('pointermove', function () {
      var n = Date.now();
      if (n - attnMoveT > 60000) { attnMoveT = n; markAttn(); }
    }, { passive: true });

    // Re-create the waiting doc after the server reaper cancelled it (or a
    // stale_peer_skip), so a green "Available" pill can never sit on a doc
    // peers can't see. Guards mirror goAvailable + the overlay/nav states.
    function requeue() {
      if (!myUid || !myRef || !available || busyElsewhere() || ON_PUBLIC || overlay || navigating) return;
      if (Date.now() < declineUntil) return; // honour the post-decline quiet window
      if (!humanAround()) return;            // zombie-screen guard: rejoin on next real touch
      docGone = false;
      var blockedUids = [];
      try { blockedUids = JSON.parse(localStorage.getItem('dit-blocked-users') || '[]'); if (!Array.isArray(blockedUids)) blockedUids = []; } catch (e) { blockedUids = []; }
      myRef.set({
        uid: myUid, displayName: shortNm(myUser), username: publicUsername(myUser), photoURL: (myUser && myUser.photoURL) || '',
        ageBand: agBand(),
        format: fmt(), status: 'waiting', broaden: true, background: true,
        blockedUids: blockedUids.slice(-100), joinedAt: ts()
      }).then(function () { startTimers(); scan(); }).catch(function () {});
    }
    function goOffline() {
      stopTimers();
      if (ownUnsub) { try { ownUnsub(); } catch (e) {} ownUnsub = null; }
      closeOverlay();
      handledRoom = null;
      if (myRef) { myRef.delete().catch(function () {}); }
    }
    function startTimers() {
      stopTimers();
      hbTimer = setInterval(function () {
        if (document.hidden || !available || !myRef) return;
        if (!humanAround()) { docGone = true; return; } // stop feeding a zombie doc; reaper sweeps it
        myRef.update({ joinedAt: ts() }).catch(function () {});
      }, HEARTBEAT_MS);
      scanTimer = setInterval(function () { if (!document.hidden) scan(); }, SCAN_MS);
    }
    function stopTimers() {
      if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
      if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    }

    // ── the round can start AFTER this tab went available ────────────
    // Accept a match in the other tab (or open a round from anywhere) and
    // this tab is still queued, still scanning, and still able to pop a
    // card mid-round. The path guards all ran once, at boot, so nothing
    // caught that. This does: a localStorage read every 10s, no network,
    // running whether or not the tab is visible. It steps out of the queue
    // for as long as the round lasts and steps back in when it ends, so
    // availability survives the round instead of being spent by it.
    var pausedForRound = false;
    function busyGuard() {
      if (busyElsewhere()) {
        if (!available || pausedForRound) return;
        pausedForRound = true;
        if (overlay && pendingMatch) decline(pendingMatch, true);   // frees the peer
        else closeOverlay();
        consentRoom = null; awaitingPeer = false; handledRoom = null;
        stopTimers();
        if (ownUnsub) { try { ownUnsub(); } catch (e) {} ownUnsub = null; }
        // Only a round drops the doc. On /spar that doc belongs to the
        // matchmaker tab and deleting it would cancel their search.
        if (inRound() && myRef) myRef.delete().catch(function () {});
        return;
      }
      if (!pausedForRound) return;
      pausedForRound = false;
      if (available && myUid && !ON_PUBLIC && !navigating && !overlay) goAvailable();
    }
    setInterval(busyGuard, 10 * 1000);

    // ── own-doc listener: drives the match card ──
    function watchOwnDoc() {
      if (!myRef) return;
      if (ownUnsub) { try { ownUnsub(); } catch (e) {} }
      ownUnsub = myRef.onSnapshot(function (doc) {
        if (!available) return;
        // Reaped (deleted) or cancelled server-side while the tab sat hidden
        // past the reaper window: heartbeat alone can't fix the status, so
        // re-queue. Hidden tabs defer to the visibilitychange handler (cost
        // guard: no Firestore churn while nobody's looking).
        if (!doc.exists || (doc.data() || {}).status === 'cancelled') {
          docGone = true;
          if (!document.hidden) requeue();
          return;
        }
        docGone = false;
        var d = doc.data() || {};
        // READY-CHECK (2026-08-12). spar-pair now lands EVERY pair in
        // 'consent' first, background sessions included, so this is the
        // state an invite arrives in. 'matched' only appears once both
        // sides have accepted, and that is the one we navigate on.
        //
        // Accepting writes `consents` onto this same doc, which fires
        // another snapshot with the status still 'consent' — so the
        // card must not be re-rendered (it would restart the countdown
        // and re-chime). consentRoom is that guard.
        var pending = d.status === 'consent' && d.room && d.matchedWith;
        var matched = d.status === 'matched' && d.room && d.matchedWith;
        if (pending) {
          if (consentRoom === d.room || navigating) {
            // Same proposal, another snapshot. Re-rendering is still
            // banned (it would restart the countdown and re-chime), but
            // one thing on this snapshot IS worth reading: whether they
            // have now accepted. Patch that in place instead.
            if (consentRoom === d.room && !navigating) markPeerAccepted(d);
            return;
          }
          if (Date.now() < declineUntil) { sendConsent(d.matchedWith, false, true); return; }
          consentRoom = d.room;
          showMatch(d);
          // Their accept can already be on the first snapshot we see, if
          // they answered before this listener attached.
          markPeerAccepted(d);
          return;
        }
        if (matched) {
          if (handledRoom === d.room || navigating) return;
          // Post-decline quiet window: a peer paired us before we finished
          // stepping out. Release them back to 'waiting' and stay quiet
          // instead of popping another invite.
          if (Date.now() < declineUntil) { releaseMatch(); return; }
          handledRoom = d.room;
          consentRoom = null;
          // Both sides are in. If our own card is still up (we accepted
          // and were waiting on them) close it and go; if this is a
          // legacy instant match with no consent phase, showMatch still
          // covers it.
          if (awaitingPeer || overlay) { awaitingPeer = false; goToRound(d); }
          else showMatch(d);
          return;
        }
        if (!pending && !matched && (overlay || awaitingPeer) && !navigating) {
          // My open invite got revoked: the peer passed, their 20s ran
          // out, or the server ghost-cancelled a side that never acted.
          // The doc is back to 'waiting' (or cancelled), so drop the
          // card and resume scanning.
          closeOverlay();
          handledRoom = null;
          consentRoom = null;
          awaitingPeer = false;
          sparNote('Opponent passed. Still looking.');
          if (available && !busyElsewhere()) { startTimers(); scan(); }
        }
      }, function (err) { console.warn('[spar-live] own-doc listen failed', err && err.message); });
    }

    // ── peer scan → server pair ──
    function scan() {
      if (!available || !db || !myUid || navigating || overlay || scanning || Date.now() < declineUntil) return;
      scanning = true;
      db.collection('matchmaking_queue')
        .where('broaden', '==', true)
        .where('status', '==', 'waiting')
        .orderBy('joinedAt')
        .limit(8).get()
        .then(function (snap) {
          scanning = false;
          var peer = null, now = Date.now();
          snap.forEach(function (s) {
            if (peer || s.id === myUid) return;
            if (s.id === declinedPeer && (now - declinedAt) < REINVITE_COOLDOWN_MS) return;
            var dt = s.data() || {};
            var ms = (dt.joinedAt && dt.joinedAt.toMillis) ? dt.joinedAt.toMillis() : 0;
            if (ms && (now - ms) > STALE_MS) return;
            if (!agOk(agBand(), dt.ageBand)) return; // age rule; server refuses these anyway
            peer = s.id;
          });
          if (peer) callPair(peer);
        })
        .catch(function (err) {
          scanning = false;
          console.warn('[spar-live] scan failed (needs broaden,status,joinedAt index)', err && err.message);
        });
    }
    function callPair(peerUid) {
      if (pairing || navigating) return;
      pairing = true;
      window.firebase.auth().currentUser.getIdToken().then(function (tok) {
        return fetch('/.netlify/functions/spar-pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify({ peerUid: peerUid, format: fmt(), broaden: true })
        });
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (r) {
          pairing = false; // success drives via own-doc listener; soft-fails retry next scan
          // No server-recorded age band for this account. Heal it from the
          // stored answer; with no stored answer either, stand down — the
          // question lives on /spar's card, and an "Available" pill that
          // can never match is the dark-feature failure this log warns about.
          if (r && r.body && r.body.code === 'AGE_BAND_REQUIRED') {
            var b = agBand();
            if (b) { agHeal(b); }
            else {
              setAvailable(false);
              sparNote('One quick age question is needed before live rounds. Open Spar to answer it.');
            }
          }
        })
        .catch(function () { pairing = false; });
    }

    // ── match-found card ──
    // The doc behind the card that is currently up, so the cross-tab guard
    // below can pass on it properly (release the peer) instead of just
    // yanking the card off the screen.
    var pendingMatch = null;
    function showMatch(d) {
      // Mid-round in another tab. Pass rather than render: the debater
      // cannot take this round, and passing frees the peer now instead of
      // stranding them for the length of the countdown.
      if (busyElsewhere()) { decline(d, true); return; }
      pendingMatch = d;
      stopTimers();
      closeOverlay();
      daAlert(daAway() ? 3 : 1); // repeats only when away, so it carries from another tab/room
      daFlashTitle('Match found!'); // cross-platform (incl. iOS) tab-title ping
      try {
        if (daCanOsNotify()) {
          var nn = new Notification('Match found', { body: 'vs ' + (d.matchedWithName || 'a debater') + '. Tap to accept.', icon: '/favicon.svg', tag: 'da-spar-match' });
          nn.onclick = function () { window.focus(); accept(d); nn.close(); };
        }
      } catch (e) {}
      var C = 2 * Math.PI * 32;
      var oppNm = d.matchedWithName || 'a debater';
      var oppPhoto = d.matchedWithPhoto || '';
      var oppInitial = (String(oppNm).replace(/^vs\s+/i, '').trim()[0] || '?').toUpperCase();
      var oppAv = oppPhoto
        ? '<img class="da-match-av" src="' + escHtml(oppPhoto) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="da-match-av">' + escHtml(oppInitial) + '</span>';
      overlay = document.createElement('div');
      overlay.className = 'da-match-overlay';
      overlay.innerHTML =
        '<div class="da-match-card" role="alertdialog" aria-label="Match found">' +
          // Nobody is in the room yet at this point: the server has paired
          // two queue documents and BOTH sides are being invited. Saying
          // "opponent in the room" here promised a person who was not
          // there, and the room could still end up empty if they decline.
          // Name what actually happened.
          '<div class="da-match-eyebrow">Debater found</div>' +
          '<div class="da-match-ring">' +
            '<svg viewBox="0 0 72 72"><circle class="da-match-ring__track" cx="36" cy="36" r="32"/>' +
            '<circle class="da-match-ring__bar" cx="36" cy="36" r="32" stroke-dasharray="' + C + '" stroke-dashoffset="0"/></svg>' +
            oppAv +
            '<span class="da-match-ring__num">' + COUNTDOWN_S + '</span>' +
          '</div>' +
          '<div class="da-match-name">vs ' + escHtml(oppNm) + '</div>' +
          '<div class="da-match-sub">Live round · ' + escHtml((d.pairedFormat || fmt()).toUpperCase()) + '</div>' +
          '<div class="da-match-btns">' +
            '<button type="button" class="da-match-btn da-match-btn--decline">Decline</button>' +
            '<button type="button" class="da-match-btn da-match-btn--accept">Accept</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      var bar = overlay.querySelector('.da-match-ring__bar');
      var num = overlay.querySelector('.da-match-ring__num');
      overlay.querySelector('.da-match-btn--accept').addEventListener('click', function () { accept(d); });
      overlay.querySelector('.da-match-btn--decline').addEventListener('click', function () { decline(d); });
      var left = COUNTDOWN_S;
      overlay.__tick = setInterval(function () {
        left--;
        if (num) num.textContent = left > 0 ? left : 0;
        if (bar) bar.style.strokeDashoffset = (C * (COUNTDOWN_S - left) / COUNTDOWN_S);
        // Timed out with nobody at the keyboard. Pass as `auto` so the
        // server can tell a silent tab from a human choosing to skip.
        if (left <= 0) { decline(d, true); }
      }, 1000);
    }
    function closeOverlay() {
      pendingMatch = null;
      // Sweep the phase stepper here too, not only where the card is
      // swapped: every teardown path (decline, timeout, peer passed,
      // navigation) goes through this one function, and an interval
      // holding a detached card would outlive all of them.
      stopWaitPhases();
      if (overlay) {
        if (overlay.__tick) clearInterval(overlay.__tick);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
      }
    }
    // Small standalone toast (reuses the bell-toast styles) for matcher
    // status notes like "opponent passed" that aren't DM/activity rows.
    function sparNote(msg) {
      var host = document.getElementById('da-bell-toasts');
      if (!host) {
        host = document.createElement('div');
        host.id = 'da-bell-toasts';
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'false');
        document.body.appendChild(host);
      }
      var t = document.createElement('div');
      t.className = 'da-bell-toast'; t.style.cursor = 'default';
      t.innerHTML = '<span class="da-bell-toast__blank">○</span><span class="da-bell-toast__main"><span class="da-bell-toast__name">' + escHtml(msg) + '</span></span>';
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      setTimeout(function () { t.classList.remove('in'); setTimeout(function () { if (t.parentNode) t.remove(); }, 320); }, 4000);
    }
    // Tell the server we are here. The round does NOT open on this — the
    // doc stays 'consent' until the other side answers too, and the
    // 'matched' snapshot is what navigates. Accepting into a room the
    // peer never entered is the whole bug this gate exists to close.
    function sendConsent(peerUid, ok, auto) {
      if (!peerUid) return;
      try { if (window.gtag) gtag('event', ok ? 'spar_bg_consent_accept' : 'spar_bg_consent_pass', { auto: !!auto }); } catch (e) {}
      try {
        window.firebase.auth().currentUser.getIdToken().then(function (tok) {
          return fetch('/.netlify/functions/spar-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ action: 'consent', accept: !!ok, auto: !!auto, peerUid: peerUid })
          });
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            if (j && j.ok) return;
            // 'consent_state_gone' needs nothing: my own snapshot has
            // already moved me. Any other failure left the proposal
            // alive but my click dead, so put the card back rather than
            // leave the user staring at a spinner until a timer unwinds
            // it. Mirrors spar.html's recoverConsentCard.
            var reason = (j && (j.reason || j.error)) || 'unknown';
            if (reason === 'consent_state_gone') return;
            console.warn('[spar-live] consent POST soft-failed:', reason);
            if (ok) { awaitingPeer = false; consentRoom = null; }
          }).catch(function (err) {
            console.warn('[spar-live] consent POST failed', err);
            if (ok) { awaitingPeer = false; consentRoom = null; }
          });
      } catch (e) { /* auth missing: the peer's own timeout backstops us */ }
    }

    // Patch the live invite card to say they have already committed.
    // In place, never a re-render: the countdown belongs to my window
    // and restarting it here would hand a stalling user free seconds.
    // Idempotent, because snapshots repeat.
    function markPeerAccepted(d) {
      if (!overlay || awaitingPeer || navigating) return;
      var peer = d && d.matchedWith;
      if (!peer || !d.consents || !d.consents[peer]) return;
      var card = overlay.querySelector('.da-match-card');
      if (!card || card.classList.contains('is-locked')) return;
      card.classList.add('is-locked');
      var nm = (d.matchedWithName || 'They');
      var eyebrow = card.querySelector('.da-match-eyebrow');
      if (eyebrow) eyebrow.textContent = 'Waiting on you';
      var sub = card.querySelector('.da-match-sub');
      if (sub) sub.textContent = 'They said yes. The room opens the moment you do.';
      var acceptBtn = card.querySelector('.da-match-btn--accept');
      if (acceptBtn) acceptBtn.textContent = 'Join them';
      var ring = card.querySelector('.da-match-ring');
      if (ring && !card.querySelector('.da-match-locked')) {
        var chip = document.createElement('div');
        chip.className = 'da-match-locked';
        chip.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
          'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
          escHtml(nm) + ' already accepted';
        ring.parentNode.insertBefore(chip, ring.nextSibling);
      }
      // The most expensive moment to miss on the whole site: someone is
      // sitting in a room waiting, and the only thing between them and a
      // round is this user pressing a button they cannot see. Ping harder
      // than the initial match card and re-flash the title even if the
      // match-found flash was already dismissed by a focus event.
      daAlert(daAway() ? 4 : 2);
      daStopFlashTitle();
      daFlashTitle(nm + ' is waiting.');
      try {
        if (daCanOsNotify()) {
          var an = new Notification(nm + ' accepted', { body: 'The room opens the moment you do.', icon: '/favicon.svg', tag: 'da-spar-match' });
          an.onclick = function () { window.focus(); accept(d); an.close(); };
        }
      } catch (e) {}
      try { if (window.gtag) gtag('event', 'spar_bg_peer_accepted_shown'); } catch (e) {}
    }

    function accept(d) {
      if (navigating || awaitingPeer) return;
      try { if (window.gtag) gtag('event', 'spar_bg_accept'); } catch (e) {}
      // Legacy instant match (no consent phase): go straight in.
      if (d && d.status === 'matched') { goToRound(d); return; }
      // Ready-check: register presence and hold. Swap the card for a
      // waiting state so the click visibly did something and the
      // countdown stops pretending to be a deadline we still own.
      awaitingPeer = true;
      showWaitingForPeer(d);
      sendConsent(d && d.matchedWith, true, false);
    }

    // Captions for the waiting card, stepped against their real window
    // rather than invented. Everything here is something we know: the
    // proposal is on their screen, their window is COUNTDOWN_S wide,
    // and past it we are into the ghost sweep. Cleared by closeOverlay
    // via waitPhaseTimer.
    var waitPhaseTimer = null;
    var WAIT_PHASES = [
      { until: 5, text: 'Card is on their screen' },
      { until: 18, text: 'Reading it' },
      { until: 32, text: 'Still their move' },
      { until: COUNTDOWN_S, text: 'Their window is almost up' },
      { until: Infinity, text: 'No answer yet. Holding your place.' },
    ];
    function stopWaitPhases() {
      if (waitPhaseTimer) { clearInterval(waitPhaseTimer); waitPhaseTimer = null; }
    }
    function startWaitPhases(card) {
      stopWaitPhases();
      var t0 = Date.now(), last = '';
      function tick() {
        var el = card && card.querySelector('#daMatchPhase');
        if (!el) { stopWaitPhases(); return; }
        var secs = (Date.now() - t0) / 1000, text = '';
        for (var i = 0; i < WAIT_PHASES.length; i++) {
          if (secs < WAIT_PHASES[i].until) { text = WAIT_PHASES[i].text; break; }
        }
        if (text === last) return;
        last = text;
        el.textContent = text;
        // Replay the entrance so a swapped line reads as a change.
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      }
      tick();
      waitPhaseTimer = setInterval(tick, 500);
    }

    // Card state after accepting: their clock is the one still running.
    // This state MUST keep an exit. It used to render text only, so a
    // peer who never answered (and a missed server ghost-cancel) left
    // the user staring at a card with nothing to press.
    function showWaitingForPeer(d) {
      if (!overlay) return;
      if (overlay.__tick) { clearInterval(overlay.__tick); overlay.__tick = null; }
      var card = overlay.querySelector('.da-match-card');
      if (!card) return;
      var nm = (d && d.matchedWithName) || 'them';
      // A still card with one button gets that button pressed, and the
      // button here dissolves a real pair. So: a spinner that says the
      // wait is live, a caption stepping through what is happening on
      // their side, and the guarantee spelled out — Cancel becomes a
      // choice rather than the only visible exit. Their window is
      // COUNTDOWN_S; past it we are into the server's ghost sweep and
      // the 45s backstop below.
      card.classList.remove('is-locked');
      card.innerHTML =
        '<div class="da-match-eyebrow">You’re in</div>' +
        '<div class="da-match-ring is-wait">' +
          '<svg viewBox="0 0 72 72"><circle class="da-match-ring__track" cx="36" cy="36" r="32"/>' +
          '<circle class="da-match-ring__bar" cx="36" cy="36" r="32"/></svg>' +
        '</div>' +
        '<div class="da-match-name">Waiting for ' + escHtml(nm) + '</div>' +
        '<div class="da-match-phase" id="daMatchPhase"></div>' +
        '<div class="da-match-hold">If they have walked away, <b>you lose nothing.</b> ' +
          'We put you back in the queue on our own and keep looking.</div>' +
        '<div class="da-match-btns">' +
          '<button type="button" class="da-match-btn da-match-btn--decline">Cancel</button>' +
        '</div>';
      startWaitPhases(card);
      var cancelBtn = card.querySelector('.da-match-btn--decline');
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        decline(d, false);
        sparNote('Cancelled. You are back in the queue.');
      });
      // Backstop: the server ghost-cancels a silent peer at ~25s, but if
      // that sweep is ever missed this card must not hold the page
      // forever. clearInterval in closeOverlay also clears timeouts.
      // 75s, above the server's 55s ghost sweep, which is above the peer's
      // 45s decide window. Those three have to stay in that order or the
      // backstop starts reporting live peers as ghosts.
      overlay.__tick = setTimeout(function () {
        decline(d, true);
        sparNote('No answer from ' + nm + '. Back in the queue.');
      }, 75000);
    }

    function goToRound(d) {
      if (navigating) return;
      navigating = true;
      closeOverlay();
      var params = new URLSearchParams({
        motion: d.pairedMotion || '',
        format: d.pairedFormat || fmt(),
        pro: d.proName || shortNm(myUser),
        con: d.conName || (d.matchedWithName || 'Opponent'),
        proUid: d.proUid || myUid,
        conUid: d.conUid || d.matchedWith,
        room: d.room,
        source: 'spar-bg'
      });
      var href = '/live-round.html?' + params.toString();
      // Both sides are in and this tab is about to navigate itself into a
      // live round. That used to happen in total silence: someone who
      // stepped away during the wait came back to a round already running.
      //
      // Navigation tears down the AudioContext, so the ping has to finish
      // BEFORE we leave. Hold the jump while the user is away — they are
      // not watching, so the delay costs nothing, and it is the difference
      // between hearing the round start and walking into a dead clock.
      if (!daAway()) { location.href = href; return; }
      daAlert(3);
      try {
        if (daCanOsNotify()) {
          var rn = new Notification('Your round is starting', { body: 'vs ' + ((d && d.matchedWithName) || 'your opponent') + '. Tap to join.', icon: '/favicon.svg', tag: 'da-spar-match' });
          rn.onclick = function () { window.focus(); rn.close(); };
        }
      } catch (e) {}
      setTimeout(function () { location.href = href; }, 2200);
    }
    // Release the current match back to the queue (the peer returns to
    // 'waiting' via the admin SDK, so their card closes instead of landing in
    // an empty room) and then drop our OWN waiting doc so nobody can re-pair us.
    // Shared by decline and the cooldown-race guard in watchOwnDoc.
    function releaseMatch() {
      handledRoom = null;
      function dropMine() { if (myRef) myRef.delete().catch(function () {}); }
      try {
        window.firebase.auth().currentUser.getIdToken().then(function (tok) {
          return fetch('/.netlify/functions/spar-unmatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: '{}'
          });
        }).then(dropMine).catch(dropMine);
      } catch (e) { dropMine(); }
    }
    // Re-enter the queue once the post-decline quiet window elapses, but only
    // if the user is still available and idle (no card / round / nav / hidden).
    // A hidden tab at fire time is picked up by the visibilitychange requeue.
    function pauseForCooldown() {
      if (cooldownTimer) clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(function () {
        cooldownTimer = null;
        if (available && myUid && !busyElsewhere() && !ON_PUBLIC && !overlay && !navigating && !document.hidden) {
          goAvailable();
        }
      }, Math.max(0, declineUntil - Date.now()));
    }
    function decline(d, auto) {
      closeOverlay();
      declinedPeer = (d && d.matchedWith) || null;
      declinedAt = Date.now();
      handledRoom = null;
      var wasPending = !!consentRoom;
      consentRoom = null;
      awaitingPeer = false;
      try { if (window.gtag) gtag('event', 'spar_bg_decline', { auto: !!auto }); } catch (e) {}
      // In the ready-check phase the pass goes through the consent API,
      // which reverts BOTH docs to 'waiting' with a mutual skip so the
      // pair isn't re-proposed immediately. spar-unmatch is for a match
      // that already completed, and calling it here would leave the
      // proposal behind. An `auto` pass (our 20s ran out) additionally
      // feeds the server's ghost-cancel heuristic, which is how a peer
      // waiting on a dead tab gets released instead of stranded.
      if (wasPending) sendConsent(d && d.matchedWith, false, !!auto);
      if (!available || busyElsewhere()) return;
      // Don't re-invite someone who just declined (or let an invite time out).
      // Stay quiet for REINVITE_COOLDOWN_MS: stop scanning, release the peer
      // back to 'waiting' so they aren't stranded, drop our own queue doc so
      // no one re-pairs us, then re-enter the queue once the window elapses.
      // requeue()/scan() both self-guard on declineUntil, so an inbound pair or
      // a tab-focus can't sneak a card in during the window.
      declineUntil = Date.now() + REINVITE_COOLDOWN_MS;
      stopTimers();
      // A consent pass has already reverted the peer server-side, so
      // only drop our own doc; calling releaseMatch would fire
      // spar-unmatch against a match that never completed.
      if (wasPending) { if (myRef) myRef.delete().catch(function () {}); }
      else releaseMatch();
      pauseForCooldown();
    }

    // The scroll-triggered 'be live for live debates?' bottom card was
    // removed 2026-07-19: it stacked on top of the home-magnet popup for
    // cold visitors on deep SEO pages, and asking someone to stay
    // matchable before they have seen the main page is the wrong order.
    // Going live still happens from the topbar pill and /spar.

    // ── boot ──
    pill = makePill();
    placePill(pill);
    whenFirebaseReady(function () {
      window.firebase.auth().onAuthStateChanged(function (u) {
        var queueUser = isQueueUser(u) ? u : null;
        myUid = queueUser ? queueUser.uid : null;
        myUser = queueUser;
        paintPill();
        // 2026-08-23 (Aidan: "make it so ppl are available when using
        // other parts of app"): availability defaults ON for signed-in
        // people browsing the app instead of waiting for a pill click.
        // Three guards. Named account: the pill's standing rule, a
        // stranger's opponent must be accountable. A recorded age band:
        // without one spar-pair refuses every pair (AGE_BAND_REQUIRED),
        // so the doc would be a phantom entry real waiters can see but
        // never meet; the no-dismiss age modal must never auto-pop, so
        // band-less users keep the manual pill, which now asks first.
        // No explicit opt-out: the pill writes '0' and that choice
        // holds until they toggle it back. Quiet path (no OS ask, no
        // go-live broadcast), and a one-time note says the state out
        // loud, because being silently matchable is not consent.
        // Match cards still always require an Accept; nothing here can
        // pull anyone into a round without a tap.
        if (queueUser && !available && !busyElsewhere()) {
          var optedOut = false;
          try { optedOut = localStorage.getItem(LSKEY) === '0'; } catch (e) {}
          if (!optedOut && agBand()) {
            try { if (window.gtag) gtag('event', 'spar_bg_auto_on'); } catch (e) {}
            setAvailable(true, true);
            try {
              if (localStorage.getItem('da-spar-bg-auto-noted') !== '1') {
                localStorage.setItem('da-spar-bg-auto-noted', '1');
                sparNote("You're open to a live round while you browse. If someone matches you, we ask first. Turn it off with the Available pill up top.");
              }
            } catch (e) {}
            return;
          }
        }
        if (queueUser && available && !busyElsewhere() && !ON_PUBLIC) goAvailable();
        else {
          stopTimers();
          if (ownUnsub) { try { ownUnsub(); } catch (e) {} ownUnsub = null; }
          // On a round page OR a public marketing page, proactively clear any
          // lingering waiting doc: there's no own-doc listener here, so a
          // peer could match it and accept into an empty room (ghost match).
          // Keep the flag so availability resumes on the next eligible page.
          // On /spar we leave the doc to the page's own foreground flow.
          if (queueUser && available && (inRound() || ON_PUBLIC)) {
            ensureFirestore(function () {
              try { window.firebase.firestore().collection('matchmaking_queue').doc(queueUser.uid).delete().catch(function () {}); } catch (e) {}
            });
          }
        }
      });
    });
    // Coming back to a tab whose queue doc was reaped while hidden: fix it now.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && docGone) requeue();
    });
    // Best-effort: never strand a matchable 'waiting' doc behind a navigation
    // or tab close (the next page may be public and never boot a listener).
    // goAvailable() recreates it on the next eligible page. Skip while
    // navigating into an accepted match (live-round needs the matched doc)
    // and while the match card is open (decline/timeout owns that path).
    window.addEventListener('pagehide', function () {
      if (myRef && available && !navigating && !overlay) { try { myRef.delete(); } catch (e) {} }
    });
  }

  // ── boot ─────────────────────────────────────────────────────────
  function bootSparLive() {
    if (window.DBIdentity) { sparLive(); return; }
    if (window.__dbIdentityLoading) {
      window.addEventListener('debatable-identity-ready', sparLive, { once: true });
      return;
    }
    window.__dbIdentityLoading = true;
    var script = document.createElement('script');
    script.src = '/js/public-identity.js';
    script.onload = function () {
      window.__dbIdentityLoading = false;
      window.dispatchEvent(new Event('debatable-identity-ready'));
      sparLive();
    };
    script.onerror = function () {
      window.__dbIdentityLoading = false;
      sparLive();
    };
    document.head.appendChild(script);
  }

  function init() {
    injectStyles();
    // Idempotency: never produce a second bell (e.g. if a stale topbar
    // build still ships its own, or the module is double-included). The
    // background matcher still boots either way.
    if (document.querySelector('.ui-bell')) { bootSparLive(); return; }
    var bell = createBell();
    placeBell(bell);
    controller(bell);
    bootSparLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
