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
        href: '/spar?thread=' + encodeURIComponent(threadId),
      };
    }
    var p = peerInfo(data, myUid);
    return { isGroup: false, name: p.name, photo: p.photo, count: 2, href: '/spar?dm=' + encodeURIComponent(p.uid) };
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
      '.ui-bell-head--mid{border-top:1px solid var(--border,rgba(255,255,255,.08))}' +
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

  // ── controller: badge + panel shared by two feeds ────────────────
  // The bell now carries two things: a "What's new" updates feed (the
  // changelog — loads for every visitor, no auth) and the DM inbox
  // (wires up only once a user is signed in). One combined unread badge.
  function controller(bell) {
    var badge = bell.querySelector('.ui-bell-badge');
    var panel = null, seenSnapshot = 0;

    // updates feed state
    var updates = [], updatesSeen = 0;
    try { updatesSeen = parseInt(localStorage.getItem('da-updates-seen') || '0', 10) || 0; } catch (_) {}

    // DM state
    var myUid = null, dmRows = [], dmUnread = 0;
    var threadsUnsub = null, prevUnread = {}, firstSnap = true;

    bell.style.display = 'inline-flex'; // visible to everyone for updates, not just signed-in users

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

    // ── updates feed (no auth required) ──────────────────────────────
    loadUpdates();
    function loadUpdates() {
      fetch('/changelog.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          updates = (Array.isArray(list) ? list : []).slice()
            .sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
          if (panel) { markUpdatesSeen(); paintPanel(); } // open while loading: count as read
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

    // ── combined unread badge (DMs + new updates) ────────────────────
    function renderBadge() {
      if (!badge) return;
      var n = dmUnread + updatesUnreadCount();
      if (n > 0) { badge.hidden = false; badge.textContent = n > 9 ? '9+' : String(n); bell.classList.add('has-unread'); }
      else { badge.hidden = true; bell.classList.remove('has-unread'); }
    }

    // ── DM layer (auth + firestore) ──────────────────────────────────
    whenFirebaseReady(function () {
      window.firebase.auth().onAuthStateChanged(function (u) {
        if (!u) {
          if (threadsUnsub) { try { threadsUnsub(); } catch (e) {} threadsUnsub = null; }
          myUid = null; dmRows = []; dmUnread = 0; prevUnread = {}; firstSnap = true;
          renderBadge(); if (panel) paintPanel();
          return;
        }
        myUid = u.uid;
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
    }

    function onThreads(snap) {
      var rows = [], unreadCount = 0, newest = null;
      snap.forEach(function (d) {
        var data = d.data() || {};
        var unread = (data.unread && data.unread[myUid]) || 0;
        if (unread > 0) unreadCount++;
        var prev = prevUnread[d.id] || 0;
        if (!firstSnap && unread > prev && data.lastMessageFrom && data.lastMessageFrom !== myUid) {
          newest = { data: data, id: d.id };
        }
        prevUnread[d.id] = unread;
        rows.push({ id: d.id, data: data, unread: unread });
      });
      dmRows = rows; dmUnread = unreadCount;
      renderBadge();
      if (panel) paintPanel();
      if (!firstSnap && newest) {
        announce(threadDisplay(newest.data, myUid, newest.id), newest.data.lastMessage || 'sent a message');
      }
      firstSnap = false;
    }

    // ── panel ────────────────────────────────────────────────────────
    function togglePanel() { panel ? closePanel() : openPanel(); }
    function openPanel() {
      seenSnapshot = updatesSeen;   // snapshot before marking, so the new ones still get a dot
      panel = document.createElement('div');
      panel.className = 'ui-bell-panel';
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      bell.appendChild(panel);
      bell.setAttribute('aria-expanded', 'true');
      markUpdatesSeen();            // opening the panel clears the updates side of the badge
      renderBadge();
      paintPanel();
    }
    function closePanel() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      bell.setAttribute('aria-expanded', 'false');
    }

    function updateRowHtml(u) {
      var isNew = (u.id || 0) > seenSnapshot;
      var inner =
        '<span class="ui-bell-av ui-bell-av--blank" style="color:var(--accent,#ef4444)">' +
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
      return '<a class="ui-bell-row' + (t.unread > 0 ? ' is-unread' : '') + '" href="' + disp.href + '">' +
        avatar +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(disp.name) + (t.unread > 0 ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview">' + escHtml(preview) + '</span>' +
        '</span>' +
        '<span class="ui-bell-row__time">' + escHtml(when) + '</span>' +
      '</a>';
    }

    function paintPanel() {
      if (!panel) return;
      var html = '<div class="ui-bell-head">What’s new</div>';
      if (!updates.length) {
        html += '<div class="ui-bell-empty">No updates yet.</div>';
      } else {
        html += '<div class="ui-bell-list">' + updates.slice(0, 6).map(updateRowHtml).join('') + '</div>';
      }
      if (myUid) {
        html += '<div class="ui-bell-head ui-bell-head--mid">Messages</div>';
        if (!dmRows.length) {
          html += '<div class="ui-bell-empty">No messages yet.<br>Find a sparring partner and DM them from the live board.</div>';
        } else {
          html += '<div class="ui-bell-list">' + dmRows.map(dmRowHtml).join('') + '</div>';
        }
        html += '<a class="ui-bell-foot" href="/spar">Open all messages</a>';
      }
      panel.innerHTML = html;
    }

    function announce(disp, preview) {
      showToast(disp, preview);
      try { window.SFX && (window.SFX.notify ? window.SFX.notify() : (window.SFX.success && window.SFX.success())); } catch (_) {}
      try {
        if (window.Notification && Notification.permission === 'granted' && document.hidden) {
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
      if (!host) { host = document.createElement('div'); host.id = 'da-bell-toasts'; document.body.appendChild(host); }
      var t = document.createElement('a');
      t.className = 'da-bell-toast';
      t.href = disp.href;
      var avatar = disp.isGroup
        ? '<span class="da-bell-toast__blank"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>'
        : (disp.photo
          ? '<img src="' + escHtml(disp.photo) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="da-bell-toast__blank">' + escHtml((disp.name[0] || '?').toUpperCase()) + '</span>');
      t.innerHTML = avatar +
        '<span class="da-bell-toast__main">' +
          '<span class="da-bell-toast__name">' + escHtml(disp.name) + '</span>' +
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
    controller(bell);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
