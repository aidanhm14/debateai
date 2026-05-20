/* notifications.js — site-wide DM notification surface.
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
 *   3. floating          → fixed top-right chip when no known bar
 *      exists (in-round pages with bespoke chrome).
 *
 * Data model (matches /spar's existing DM system):
 *   dm_threads/{sorted-uid-pair} {
 *     participants:[a,b], participantInfo:{uid:{name,photo}},
 *     lastMessage, lastMessageAt, lastMessageFrom, unread:{uid:n}
 *   }
 *
 * Behavior: unread badge + dropdown of recent threads (deep-link to
 * /spar?dm=<peerUid>), an in-page toast on new inbound messages, and an
 * OS Notification when permission is granted and the tab is hidden.
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

  var FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore-compat.js';

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
    if (window.firebase && window.firebase.auth) { cb(); return; }
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (window.firebase && window.firebase.auth) { clearInterval(iv); cb(); }
      else if (n > 40) { clearInterval(iv); } // ~4s, give up — page has no auth
    }, 100);
  }

  // ── styles (injected once) ───────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('da-bell-styles')) return;
    var css =
      '.ui-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border-radius:999px;background:transparent;border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);cursor:pointer;transition:color .15s,border-color .15s,background .15s;font-family:inherit}' +
      '.ui-bell:hover{color:var(--text,#fff);border-color:var(--border-strong,rgba(255,255,255,.24))}' +
      '.ui-bell.has-unread{color:var(--accent,#ef4444);border-color:var(--accent,#ef4444)}' +
      '.ui-bell--floating{position:fixed;top:14px;right:16px;z-index:99996;background:var(--bg-card,#15151a);box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.ui-bell-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--accent,#ef4444);color:#fff;font-size:.6rem;font-weight:800;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px var(--bar-bg,#0a0a0c)}' +
      '.ui-bell-badge[hidden]{display:none}' +
      '.ui-bell-panel{position:absolute;top:calc(100% + 10px);right:0;width:320px;max-width:86vw;background:var(--bg-card,#15151a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.5);overflow:hidden;z-index:200;text-align:left;cursor:default;animation:daBellIn .16s ease-out}' +
      '@keyframes daBellIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '.ui-bell-head{padding:12px 14px 10px;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost,#888);border-bottom:1px solid var(--border,rgba(255,255,255,.08))}' +
      '.ui-bell-empty{padding:22px 16px;text-align:center;font-size:.8rem;color:var(--text-dim,#9aa);line-height:1.5}' +
      '.ui-bell-list{max-height:340px;overflow-y:auto}' +
      '.ui-bell-row{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,.06));text-decoration:none;color:inherit;transition:background .12s}' +
      '.ui-bell-row:hover{background:var(--bg-elev,#101014)}' +
      '.ui-bell-row.is-unread{background:linear-gradient(90deg,rgba(239,68,68,.08),transparent 70%)}' +
      '.ui-bell-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;object-fit:cover;display:inline-flex;align-items:center;justify-content:center}' +
      '.ui-bell-av--blank{background:var(--bg-elev,#101014);border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);font-size:.74rem;font-weight:800}' +
      '.ui-bell-row__main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.ui-bell-row__name{font-size:.82rem;font-weight:700;color:var(--text,#fff);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ui-bell-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#ef4444);flex-shrink:0}' +
      '.ui-bell-row__preview{font-size:.74rem;color:var(--text-dim,#9aa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ui-bell-row__time{font-size:.66rem;color:var(--text-ghost,#888);flex-shrink:0}' +
      '.ui-bell-foot{display:block;padding:11px 14px;text-align:center;font-size:.74rem;font-weight:700;color:var(--accent,#ef4444);text-decoration:none;border-top:1px solid var(--border,rgba(255,255,255,.08))}' +
      '.ui-bell-foot:hover{background:var(--bg-elev,#101014)}' +
      '#da-bell-toasts{position:fixed;top:70px;right:18px;z-index:400;display:flex;flex-direction:column;gap:10px;max-width:340px}' +
      '.da-bell-toast{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--bg-card,#15151a);border:1px solid var(--border-strong,rgba(239,68,68,.3));border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.5);text-decoration:none;color:inherit;opacity:0;transform:translateX(20px);transition:opacity .3s,transform .3s}' +
      '.da-bell-toast.in{opacity:1;transform:none}' +
      '.da-bell-toast img,.da-bell-toast__blank{width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;background:var(--bg-elev,#101014);border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);font-size:.78rem;font-weight:800}' +
      '.da-bell-toast__main{display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.da-bell-toast__name{font-size:.8rem;font-weight:800;color:var(--text,#fff)}' +
      '.da-bell-toast__preview{font-size:.74rem;color:var(--text-dim,#9aa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}' +
      '@media(max-width:480px){#da-bell-toasts{left:12px;right:12px;max-width:none}.ui-bell-panel{width:300px}}' +
      '@media(prefers-reduced-motion:reduce){.ui-bell-panel,.da-bell-toast{animation:none;transition:none}}';
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
    bell.setAttribute('aria-label', 'Messages');
    bell.setAttribute('aria-haspopup', 'true');
    bell.setAttribute('aria-expanded', 'false');
    bell.title = 'Messages';
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
      var tb = document.querySelector('.ui-topbar-right');
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
      return false;
    }
    if (attempt()) return;
    // The shared topbar renders via a deferred script that may run a
    // beat after us. Retry briefly, then fall back to a floating chip.
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (attempt()) { clearInterval(iv); return; }
      if (n > 15) { // ~1.5s
        clearInterval(iv);
        if (!bell.isConnected) {
          bell.classList.add('ui-bell--floating');
          document.body.appendChild(bell);
        }
      }
    }, 100);
  }

  // ── wiring (auth + firestore listen + UI) ────────────────────────
  function wire(bell) {
    var panel = null, threadsUnsub = null, prevUnread = {}, firstSnap = true;
    var rowsCache = [], myUid = null;
    var badge = bell.querySelector('.ui-bell-badge');

    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
      try {
        if (window.Notification && Notification.permission === 'default') {
          Notification.requestPermission().catch(function () {});
        }
      } catch (_) {}
    });
    document.addEventListener('click', function () { if (panel) closePanel(); });

    window.firebase.auth().onAuthStateChanged(function (u) {
      if (!u) {
        if (threadsUnsub) { try { threadsUnsub(); } catch (e) {} threadsUnsub = null; }
        bell.style.display = 'none';
        firstSnap = true; prevUnread = {}; rowsCache = [];
        return;
      }
      myUid = u.uid;
      bell.style.display = 'inline-flex';
      ensureFirestore(subscribe);
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
    }

    function onThreads(snap) {
      var rows = [], unreadCount = 0, newest = null;
      snap.forEach(function (d) {
        var data = d.data() || {};
        var unread = (data.unread && data.unread[myUid]) || 0;
        if (unread > 0) unreadCount++;
        var prev = prevUnread[d.id] || 0;
        if (!firstSnap && unread > prev && data.lastMessageFrom && data.lastMessageFrom !== myUid) {
          newest = data;
        }
        prevUnread[d.id] = unread;
        rows.push({ id: d.id, data: data, unread: unread });
      });
      rowsCache = rows;
      renderBadge(unreadCount);
      if (panel) paintPanel();
      if (!firstSnap && newest) {
        announce(peerInfo(newest, myUid), newest.lastMessage || 'sent you a message');
      }
      firstSnap = false;
    }

    function renderBadge(n) {
      if (!badge) return;
      if (n > 0) { badge.hidden = false; badge.textContent = n > 9 ? '9+' : String(n); bell.classList.add('has-unread'); }
      else { badge.hidden = true; bell.classList.remove('has-unread'); }
    }

    function togglePanel() { panel ? closePanel() : openPanel(); }
    function openPanel() {
      panel = document.createElement('div');
      panel.className = 'ui-bell-panel';
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      bell.appendChild(panel);
      bell.setAttribute('aria-expanded', 'true');
      paintPanel();
    }
    function closePanel() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      bell.setAttribute('aria-expanded', 'false');
    }
    function paintPanel() {
      if (!panel) return;
      var head = '<div class="ui-bell-head">Messages</div>';
      if (!rowsCache.length) {
        panel.innerHTML = head +
          '<div class="ui-bell-empty">No messages yet.<br>Find a sparring partner and DM them from the live board.</div>' +
          '<a class="ui-bell-foot" href="/spar">Open the live board</a>';
        return;
      }
      var body = rowsCache.map(function (t) {
        var p = peerInfo(t.data, myUid);
        var when = t.data.lastMessageAt && t.data.lastMessageAt.toMillis ? relTime(t.data.lastMessageAt.toMillis()) : '';
        var fromMe = t.data.lastMessageFrom === myUid;
        var preview = (fromMe ? 'You: ' : '') + (t.data.lastMessage || '');
        var avatar = p.photo
          ? '<img class="ui-bell-av" src="' + escHtml(p.photo) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="ui-bell-av ui-bell-av--blank">' + escHtml((p.name[0] || '?').toUpperCase()) + '</span>';
        return '<a class="ui-bell-row' + (t.unread > 0 ? ' is-unread' : '') + '" href="/spar?dm=' + encodeURIComponent(p.uid) + '">' +
          avatar +
          '<span class="ui-bell-row__main">' +
            '<span class="ui-bell-row__name">' + escHtml(p.name) + (t.unread > 0 ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
            '<span class="ui-bell-row__preview">' + escHtml(preview) + '</span>' +
          '</span>' +
          '<span class="ui-bell-row__time">' + escHtml(when) + '</span>' +
        '</a>';
      }).join('');
      panel.innerHTML = head + '<div class="ui-bell-list">' + body + '</div>' +
        '<a class="ui-bell-foot" href="/spar">Open all messages</a>';
    }

    function announce(peer, preview) {
      showToast(peer, preview);
      try { window.SFX && (window.SFX.notify ? window.SFX.notify() : (window.SFX.success && window.SFX.success())); } catch (_) {}
      try {
        if (window.Notification && Notification.permission === 'granted' && document.hidden) {
          var n = new Notification('New message from ' + peer.name, {
            body: preview,
            icon: '/favicon.svg',
            tag: 'da-dm-' + peer.uid,
          });
          n.onclick = function () { window.focus(); location.href = '/spar?dm=' + encodeURIComponent(peer.uid); n.close(); };
        }
      } catch (_) {}
    }
    function showToast(peer, preview) {
      var host = document.getElementById('da-bell-toasts');
      if (!host) { host = document.createElement('div'); host.id = 'da-bell-toasts'; document.body.appendChild(host); }
      var t = document.createElement('a');
      t.className = 'da-bell-toast';
      t.href = '/spar?dm=' + encodeURIComponent(peer.uid);
      var avatar = peer.photo
        ? '<img src="' + escHtml(peer.photo) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="da-bell-toast__blank">' + escHtml((peer.name[0] || '?').toUpperCase()) + '</span>';
      t.innerHTML = avatar +
        '<span class="da-bell-toast__main">' +
          '<span class="da-bell-toast__name">' + escHtml(peer.name) + '</span>' +
          '<span class="da-bell-toast__preview">' + escHtml(preview) + '</span>' +
        '</span>';
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      setTimeout(function () { t.classList.remove('in'); setTimeout(function () { if (t.parentNode) t.remove(); }, 320); }, 6000);
    }
  }

  // ── boot ─────────────────────────────────────────────────────────
  function init() {
    // Idempotency: never produce a second bell (e.g. if a stale topbar
    // build still ships its own, or the module is double-included).
    if (document.querySelector('.ui-bell')) return;
    injectStyles();
    var bell = createBell();
    placeBell(bell);
    whenFirebaseReady(function () { wire(bell); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
