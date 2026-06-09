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
      '.ui-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;margin-right:6px;border-radius:999px;background:transparent;border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);cursor:pointer;transition:color .15s,border-color .15s,background .15s;font-family:inherit}' +
      '.ui-bell:hover{color:var(--text,#fff);border-color:var(--border-strong,rgba(255,255,255,.24))}' +
      '.ui-bell.has-unread{color:var(--accent,#ef4444);border-color:var(--accent,#ef4444)}' +
      '.ui-bell--floating{position:fixed;top:14px;right:16px;z-index:99996;background:linear-gradient(var(--bg-card,#15151a),var(--bg-card,#15151a)),var(--bg,#15151a);box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.ui-bell-badge{position:absolute;top:-3px;right:-3px;z-index:3;min-width:15px;height:15px;padding:0 3px;border-radius:999px;background:var(--accent,#ef4444);color:#fff;font-size:.58rem;font-weight:800;line-height:15px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 0 0 1.5px var(--bar-bg,#0a0a0c)}' +
      '.ui-bell-badge[hidden]{display:none}' +
      '.ui-bell-panel{position:absolute;top:calc(100% + 10px);right:0;width:320px;max-width:86vw;background:linear-gradient(var(--bg-card,#15151a),var(--bg-card,#15151a)),var(--bg,#15151a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.5);overflow:hidden;z-index:200;text-align:left;cursor:default;animation:daBellIn .16s ease-out}' +
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
      '.da-bell-toast{display:flex;align-items:center;gap:10px;padding:11px 14px;background:linear-gradient(var(--bg-card,#15151a),var(--bg-card,#15151a)),var(--bg,#15151a);border:1px solid var(--border-strong,rgba(239,68,68,.3));border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.5);text-decoration:none;color:inherit;opacity:0;transform:translateX(20px);transition:opacity .3s,transform .3s}' +
      '.da-bell-toast.in{opacity:1;transform:none}' +
      '.da-bell-toast img,.da-bell-toast__blank{width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;background:var(--bg-elev,#101014);border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);font-size:.78rem;font-weight:800}' +
      '.da-bell-toast__main{display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.da-bell-toast__name{font-size:.8rem;font-weight:800;color:var(--text,#fff)}' +
      '.da-bell-toast__preview{font-size:.74rem;color:var(--text-dim,#9aa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}' +
      '@keyframes daBellLivePulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      '@media(max-width:480px){#da-bell-toasts{left:12px;right:12px;max-width:none}.ui-bell-panel{width:300px}}' +
      '.da-spar-pill{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:999px;background:transparent;border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);cursor:pointer;font-family:inherit;font-size:.78rem;font-weight:700;letter-spacing:.01em;transition:color .15s,border-color .15s,background .15s;white-space:nowrap}' +
      '.da-spar-pill:hover{color:var(--text,#fff);border-color:var(--border-strong,rgba(255,255,255,.24))}' +
      '.da-spar-pill__dot{width:8px;height:8px;border-radius:50%;background:var(--text-ghost,#888);transition:background .2s}' +
      '.da-spar-pill.is-on{color:#22c55e;border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.08)}' +
      '.da-spar-pill.is-on .da-spar-pill__dot{background:#22c55e;animation:daSparPulse 1.7s ease-out infinite}' +
      '@keyframes daSparPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      '.da-match-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);animation:daMatchFade .2s ease-out}' +
      '@keyframes daMatchFade{from{opacity:0}to{opacity:1}}' +
      '.da-match-card{width:340px;max-width:88vw;background:linear-gradient(var(--bg-card,#15151a),var(--bg-card,#15151a)),var(--bg,#0a0a0c);border:1px solid rgba(34,197,94,.4);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:24px 22px;text-align:center;animation:daMatchPop .24s cubic-bezier(.2,.8,.2,1)}' +
      '@keyframes daMatchPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}' +
      '.da-match-eyebrow{font-size:.66rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#22c55e;margin-bottom:12px}' +
      '.da-match-ring{position:relative;width:72px;height:72px;margin:0 auto 14px}' +
      '.da-match-ring svg{transform:rotate(-90deg);width:72px;height:72px}' +
      '.da-match-ring__track{fill:none;stroke:rgba(255,255,255,.12);stroke-width:5}' +
      '.da-match-ring__bar{fill:none;stroke:#22c55e;stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset 1s linear}' +
      '.da-match-ring__num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:var(--text,#fff);font-variant-numeric:tabular-nums}' +
      '.da-match-name{font-size:1.05rem;font-weight:800;color:var(--text,#fff);margin-bottom:3px}' +
      '.da-match-sub{font-size:.8rem;color:var(--text-dim,#9aa);margin-bottom:18px}' +
      '.da-match-btns{display:flex;gap:10px}' +
      '.da-match-btn{flex:1;height:44px;border-radius:11px;font-family:inherit;font-size:.86rem;font-weight:800;cursor:pointer;border:1px solid transparent;transition:filter .15s,background .15s,border-color .15s}' +
      '.da-match-btn--accept{background:#22c55e;color:#06210f}' +
      '.da-match-btn--accept:hover{filter:brightness(1.08)}' +
      '.da-match-btn--decline{background:transparent;border-color:var(--border,rgba(255,255,255,.16));color:var(--text-dim,#9aa)}' +
      '.da-match-btn--decline:hover{color:var(--text,#fff);border-color:var(--border-strong,rgba(255,255,255,.28))}' +
      '@media(prefers-reduced-motion:reduce){.ui-bell-panel,.da-bell-toast,.da-match-overlay,.da-match-card,.da-spar-pill.is-on .da-spar-pill__dot{animation:none;transition:none}}';
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

    // activity feed state — public, auth-free. /api/recent-activity
    // returns recent live_challenges + waitlist_posts so the bell
    // shows site activity to anon visitors too (drives "this place
    // is alive" perception → sign-in conversions).
    var activity = [], activitySeen = 0, activitySeenSnapshot = 0;
    try { activitySeen = parseInt(localStorage.getItem('da-activity-seen') || '0', 10) || 0; } catch (_) {}
    // presence — real "N online in the last 5 min" from /api/online-count.
    // Pinned at the top of the activity section. Honest number per the
    // landing-page presence pipeline (admin SDK reads presence/{uid|pid}
    // docs with lastPing ≥ now-5min, 30s server cache).
    var onlineCount = null;

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

    // ── activity feed (no auth required) ─────────────────────────────
    // Pulls /api/recent-activity (30s server cache) + /api/online-count
    // (real Firestore presence, 30s server cache). Refreshes every 90s
    // while the tab is visible so the bell badge stays warm without
    // hammering the functions — that's ~960 fetches/day per active tab
    // even at one-tab-per-minute usage, well within Netlify free tier.
    loadActivity();
    loadOnlineCount();
    var activityIv = setInterval(function () {
      if (!document.hidden) { loadActivity(); loadOnlineCount(); }
    }, 90 * 1000);
    function loadActivity() {
      fetch('/api/recent-activity', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !Array.isArray(j.items)) return;
          activity = j.items.slice();
          if (panel) { markActivitySeen(); paintPanel(); }
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
          if (panel) paintPanel();
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
      var n = dmUnread + updatesUnreadCount() + activityUnreadCount();
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
      activitySeenSnapshot = activitySeen;  // same trick for activity rows
      loadActivity();               // refresh the activity feed when user opens the bell
      loadOnlineCount();            // refresh the live-presence row too
      panel = document.createElement('div');
      panel.className = 'ui-bell-panel';
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      // On phones the bell sits mid-bar (lang flag + Voice AI CTA are to
      // its right), so a panel right-aligned to the bell extends off the
      // LEFT edge of the screen and clips "WHAT'S NEW" + the card titles.
      // Mount it on <body> as a fixed, full-width-with-gutters sheet
      // instead. Body-mounted (not bell-mounted) because the topbar's
      // backdrop-filter creates a containing block that would otherwise
      // trap a position:fixed descendant. Top is measured off the live
      // bar so it clears whatever height the bar is (with/without the
      // beta strip). Desktop keeps the absolute, bell-anchored dropdown.
      if (window.matchMedia('(max-width:560px)').matches) {
        document.body.appendChild(panel);
        var bar = document.querySelector('.ui-topbar');
        var topPx = bar ? Math.round(bar.getBoundingClientRect().bottom + 8) : 60;
        panel.style.position = 'fixed';
        panel.style.top = topPx + 'px';
        panel.style.left = '12px';
        panel.style.right = '12px';
        panel.style.width = 'auto';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = (window.innerHeight - topPx - 16) + 'px';
        panel.style.overflowY = 'auto';
      } else {
        bell.appendChild(panel);
      }
      bell.setAttribute('aria-expanded', 'true');
      markUpdatesSeen();            // opening the panel clears the updates side of the badge
      markActivitySeen();           // and the activity side
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
      if (a.motion) preview += ' <span style="color:var(--text-ghost,#888)">· ' + escHtml(a.motion) + '</span>';
      var cls = 'ui-bell-row' + (isNew ? ' is-unread' : '');
      return '<a class="' + cls + '" href="' + escHtml(a.href || '/live') + '">' +
        '<span class="ui-bell-av ui-bell-av--blank" style="color:var(--accent,#ef4444)">' + iconSvg + '</span>' +
        '<span class="ui-bell-row__main">' +
          '<span class="ui-bell-row__name">' + escHtml(a.name || 'A debater') + (isNew ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
          '<span class="ui-bell-row__preview">' + preview + '</span>' +
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
      // Site activity — visible to anon visitors too. Shows recent
      // posted challenges + waitlist invites so the page reads as
      // inhabited the moment someone lands on it. The presence row
      // at the top is the strongest "alive right now" signal —
      // honest number from /api/online-count (Firestore presence
      // docs with lastPing within the last 5 min).
      html += '<div class="ui-bell-head ui-bell-head--mid">Site activity</div>';
      if (onlineCount !== null && onlineCount > 0) {
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
      if (!activity.length) {
        html += '<div class="ui-bell-empty">Quiet right now.<br>' +
                '<a href="/live" style="color:var(--accent,#ef4444);text-decoration:none;font-weight:700">Post a challenge</a>' +
                ' or <a href="/spar" style="color:var(--accent,#ef4444);text-decoration:none;font-weight:700">join the waitlist</a> to start one.</div>';
      } else {
        html += '<div class="ui-bell-list">' + activity.slice(0, 8).map(activityRowHtml).join('') + '</div>';
        html += '<a class="ui-bell-foot" href="/live">See the live board</a>';
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
    var FMT_KEY = 'debateos-spar-format';     // preferred format (shared w/ /spar)
    var HEARTBEAT_MS = 90 * 1000;             // re-stamp joinedAt so the 3-min reaper doesn't cull us
    var SCAN_MS = 60 * 1000;                  // look for a peer to pair with
    var STALE_MS = 3 * 60 * 1000;             // ignore peers older than this
    var COUNTDOWN_S = 20;                     // accept window
    var VALID = ['quick','apda','bp','worlds','asian','ld','pf','policy','casual']; // MUST match spar-pair.mjs VALID_FORMATS or the pair POST 400s
    // Don't run the matcher ON an active round (notifications.js loads on
    // /live-round + /voice-debate too) — you're already debating; being
    // re-queued as "waiting" there would pop a match mid-round.
    var ON_ROUND = /\/(live-round|voice-debate|exhibition|casual-room)/.test(location.pathname);
    // /spar runs its OWN foreground matchmaker against the same queue doc.
    // Suppress the background matcher there so the two don't fight over the
    // doc; /spar instead sets the availability flag + sends the user to
    // prep, and the matcher activates on the next page.
    var ON_SPAR = /\/spar(?:[/?#]|$)/.test(location.pathname);
    // Don't run the background matcher on public marketing / landing surfaces
    // (the homepage especially). A first-time visitor, or a returning signed-in
    // user who once flipped "Available", should never be yanked off a marketing
    // page into a live round. The availability flag persists; matching resumes
    // when they are back in the app (Prep). This was redirecting plain homepage
    // visitors into /live-round?source=spar-bg ~1s after load. Fixed 2026-06.
    var ON_PUBLIC = location.pathname === '/' ||
      /^\/(index|landing|pricing|schools|india|us|pro|story|credentials|debatable|counter|learn|leaderboard|report|privacy|terms)(?:\.html)?(?:[/?#]|$)/.test(location.pathname) ||
      /^\/(topics|debate)(?:[/?#]|$|\/)/.test(location.pathname);

    var available = false;
    try { available = localStorage.getItem(LSKEY) === '1'; } catch (e) {}
    var myUid = null, myUser = null, db = null, myRef = null;
    var ownUnsub = null, hbTimer = null, scanTimer = null;
    var pill = null, overlay = null, handledRoom = null, navigating = false;
    var declinedPeer = null, declinedAt = 0, scanning = false, pairing = false;

    function fmt() {
      var f = 'apda';
      try { f = (localStorage.getItem(FMT_KEY) || 'apda').toLowerCase(); } catch (e) {}
      return VALID.indexOf(f) >= 0 ? f : 'apda';
    }
    function shortNm(u) {
      if (!u) return 'You';
      var full = (u.displayName || '').trim();
      var p = full.split(/\s+/).filter(Boolean);
      return p.length >= 2 ? p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.'
           : (p[0] || (u.email ? u.email.split('@')[0] : 'You'));
    }
    function ts() { return window.firebase.firestore.FieldValue.serverTimestamp(); }

    // ── pill ──
    function makePill() {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'da-spar-pill';
      b.setAttribute('aria-label', 'Background sparring');
      b.style.display = 'none';
      b.innerHTML = '<span class="da-spar-pill__dot" aria-hidden="true"></span><span class="da-spar-pill__lab">Spar live</span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); setAvailable(!available); });
      return b;
    }
    function placePill(p) {
      function attempt() {
        var tb = document.querySelector('.ui-topbar-right');
        if (tb) { var bell = tb.querySelector('.ui-bell'); tb.insertBefore(p, bell || tb.firstChild); return true; }
        var bl = document.querySelector('.bar-links');
        if (bl) { bl.insertBefore(p, bl.firstChild); return true; }
        return false;
      }
      if (attempt()) return;
      var n = 0, iv = setInterval(function () { n++; if (attempt() || n > 20) clearInterval(iv); }, 100);
    }
    function paintPill() {
      if (!pill) return;
      pill.style.display = (myUid && !ON_ROUND && !ON_SPAR && !ON_PUBLIC) ? 'inline-flex' : 'none';
      var lab = pill.querySelector('.da-spar-pill__lab');
      if (available) { pill.classList.add('is-on'); if (lab) lab.textContent = 'Available'; pill.title = "You're matchable. We'll ping you when a rival is found, anywhere on the site."; }
      else { pill.classList.remove('is-on'); if (lab) lab.textContent = 'Spar live'; pill.title = 'Get matched with a human while you browse. No need to wait on the spar page.'; }
    }

    // ── availability ──
    function setAvailable(on) {
      available = !!on;
      try { localStorage.setItem(LSKEY, available ? '1' : '0'); } catch (e) {}
      try { if (window.gtag) gtag('event', on ? 'spar_bg_on' : 'spar_bg_off'); } catch (e) {}
      paintPill();
      if (available && myUid && !ON_ROUND && !ON_SPAR) goAvailable();
      else goOffline();
    }
    function goAvailable() {
      if (!myUid || ON_ROUND || ON_SPAR || ON_PUBLIC) return;
      ensureFirestore(function () {
        try { db = window.firebase.firestore(); } catch (e) { return; }
        myRef = db.collection('matchmaking_queue').doc(myUid);
        myRef.set({
          uid: myUid,
          displayName: shortNm(myUser),
          photoURL: (myUser && myUser.photoURL) || '',
          format: fmt(),
          status: 'waiting',
          broaden: true,
          background: true,
          joinedAt: ts()
        }).then(function () { watchOwnDoc(); startTimers(); scan(); })
          .catch(function (err) { console.warn('[spar-live] join failed', err && err.message); });
      });
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
        myRef.update({ joinedAt: ts() }).catch(function () {});
      }, HEARTBEAT_MS);
      scanTimer = setInterval(function () { if (!document.hidden) scan(); }, SCAN_MS);
    }
    function stopTimers() {
      if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
      if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    }

    // ── own-doc listener: drives the match card ──
    function watchOwnDoc() {
      if (!myRef) return;
      if (ownUnsub) { try { ownUnsub(); } catch (e) {} }
      ownUnsub = myRef.onSnapshot(function (doc) {
        if (!doc.exists || !available) return;
        var d = doc.data() || {};
        var matched = d.status === 'matched' && d.room && d.matchedWith;
        if (matched) {
          if (handledRoom === d.room || navigating || overlay) return;
          handledRoom = d.room;
          showMatch(d);
        } else if (overlay && !navigating) {
          // My open match got revoked (peer declined / server released it).
          closeOverlay();
          handledRoom = null;
          sparNote('Opponent passed. Still looking.');
          if (available && !ON_ROUND && !ON_SPAR) { startTimers(); scan(); }
        }
      }, function (err) { console.warn('[spar-live] own-doc listen failed', err && err.message); });
    }

    // ── peer scan → server pair ──
    function scan() {
      if (!available || !db || !myUid || navigating || overlay || scanning) return;
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
            if (s.id === declinedPeer && (now - declinedAt) < 60000) return;
            var dt = s.data() || {};
            var ms = (dt.joinedAt && dt.joinedAt.toMillis) ? dt.joinedAt.toMillis() : 0;
            if (ms && (now - ms) > STALE_MS) return;
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
        .then(function () { pairing = false; /* success drives via own-doc listener; soft-fails retry next scan */ })
        .catch(function () { pairing = false; });
    }

    // ── match-found card ──
    function showMatch(d) {
      stopTimers();
      closeOverlay();
      try { window.SFX && (window.SFX.notify ? window.SFX.notify() : (window.SFX.success && window.SFX.success())); } catch (e) {}
      try {
        if (window.Notification && Notification.permission === 'granted' && document.hidden) {
          var nn = new Notification('Match found', { body: 'vs ' + (d.matchedWithName || 'a debater') + '. Tap to accept.', icon: '/favicon.svg', tag: 'da-spar-match' });
          nn.onclick = function () { window.focus(); accept(d); nn.close(); };
        }
      } catch (e) {}
      var C = 2 * Math.PI * 32;
      overlay = document.createElement('div');
      overlay.className = 'da-match-overlay';
      overlay.innerHTML =
        '<div class="da-match-card" role="alertdialog" aria-label="Match found">' +
          '<div class="da-match-eyebrow">Match found</div>' +
          '<div class="da-match-ring">' +
            '<svg viewBox="0 0 72 72"><circle class="da-match-ring__track" cx="36" cy="36" r="32"/>' +
            '<circle class="da-match-ring__bar" cx="36" cy="36" r="32" stroke-dasharray="' + C + '" stroke-dashoffset="0"/></svg>' +
            '<span class="da-match-ring__num">' + COUNTDOWN_S + '</span>' +
          '</div>' +
          '<div class="da-match-name">vs ' + escHtml(d.matchedWithName || 'a debater') + '</div>' +
          '<div class="da-match-sub">Live round · ' + escHtml(fmt().toUpperCase()) + '</div>' +
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
        if (left <= 0) { decline(d); }
      }, 1000);
    }
    function closeOverlay() {
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
      if (!host) { host = document.createElement('div'); host.id = 'da-bell-toasts'; document.body.appendChild(host); }
      var t = document.createElement('div');
      t.className = 'da-bell-toast'; t.style.cursor = 'default';
      t.innerHTML = '<span class="da-bell-toast__blank">○</span><span class="da-bell-toast__main"><span class="da-bell-toast__name">' + escHtml(msg) + '</span></span>';
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      setTimeout(function () { t.classList.remove('in'); setTimeout(function () { if (t.parentNode) t.remove(); }, 320); }, 4000);
    }
    function accept(d) {
      if (navigating) return;
      navigating = true;
      closeOverlay();
      try { if (window.gtag) gtag('event', 'spar_bg_accept'); } catch (e) {}
      var params = new URLSearchParams({
        motion: d.pairedMotion || '',
        format: fmt(),
        pro: d.proName || shortNm(myUser),
        con: d.conName || (d.matchedWithName || 'Opponent'),
        proUid: d.proUid || myUid,
        conUid: d.conUid || d.matchedWith,
        room: d.room,
        source: 'spar-bg'
      });
      location.href = '/live-round.html?' + params.toString();
    }
    function decline(d) {
      closeOverlay();
      declinedPeer = (d && d.matchedWith) || null;
      declinedAt = Date.now();
      handledRoom = null;
      try { if (window.gtag) gtag('event', 'spar_bg_decline'); } catch (e) {}
      if (!available || ON_ROUND || ON_SPAR) return;
      // Server releases BOTH docs back to waiting (admin SDK bypasses the
      // rule that blocks writing a peer's doc), so the peer's own-doc
      // listener closes its card too instead of landing in an empty room.
      // Then I resume scanning. Local re-queue is the network-fail fallback.
      window.firebase.auth().currentUser.getIdToken().then(function (tok) {
        return fetch('/.netlify/functions/spar-unmatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: '{}'
        });
      }).then(function () { if (available) startTimers(); }).catch(function () {
        if (myRef && available) myRef.set({
          uid: myUid, displayName: shortNm(myUser), photoURL: (myUser && myUser.photoURL) || '',
          format: fmt(), status: 'waiting', broaden: true, background: true, joinedAt: ts()
        }).then(function () { startTimers(); }).catch(function () {});
      });
    }

    // ── boot ──
    pill = makePill();
    placePill(pill);
    whenFirebaseReady(function () {
      window.firebase.auth().onAuthStateChanged(function (u) {
        myUid = u ? u.uid : null;
        myUser = u || null;
        paintPill();
        if (u && available && !ON_ROUND && !ON_SPAR && !ON_PUBLIC) goAvailable();
        else {
          stopTimers();
          if (ownUnsub) { try { ownUnsub(); } catch (e) {} ownUnsub = null; }
          // On a round page, proactively clear any lingering waiting doc so
          // an in-round user isn't matchable; keep the flag so availability
          // resumes when they navigate back to a normal page. On /spar we
          // leave the doc to the page's own foreground flow.
          if (u && ON_ROUND && available) {
            ensureFirestore(function () {
              try { window.firebase.firestore().collection('matchmaking_queue').doc(u.uid).delete().catch(function () {}); } catch (e) {}
            });
          }
        }
      });
    });
  }

  // ── boot ─────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    // Idempotency: never produce a second bell (e.g. if a stale topbar
    // build still ships its own, or the module is double-included). The
    // background matcher still boots either way.
    if (document.querySelector('.ui-bell')) { sparLive(); return; }
    var bell = createBell();
    placeBell(bell);
    controller(bell);
    sparLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
