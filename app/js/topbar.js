/* Shared topbar — single source of truth for /landing, /debate-ai,
   /learn, /high-school, /leaderboard, /live, /pricing.
   Each page gets the SAME markup, the SAME link order, the SAME theme
   dots, and the SAME auth slot, so navigation no longer feels jumpy
   between pages.

   USAGE: include `<div id="daTopbar"></div>` at the top of <body>, then
   load this script with `defer`. The script:
     1. Looks up the current path to mark the active link.
     2. Renders the topbar into #daTopbar.
     3. Wires up the theme dots (writes/reads localStorage `da-theme`).
     4. Hydrates the sign-in slot if `firebase` is loaded.

   Pages that already have their own `.bar` / `.ui-topbar` / `.hs-bar`
   markup should remove it before mounting this. The CSS lives in
   /css/ui.css under .ui-topbar* — every page already loads ui.css. */
(function(){
  var here = (location.pathname || '/').replace(/\/$/,'') || '/';

  // ── Defensive: nuke any stray theme-dot / lighting-toggle markup ──
  // The grey/red/white "theme dot" tray was removed across the site on
  // 2026-05-10 (brand consolidation), but cached old HTML still ships
  // the markup to users who haven't picked up a fresh deploy. Rather
  // than wait for SW invalidation, sweep the DOM at topbar-load time
  // so the dots disappear immediately on any page they leak into. The
  // topbar (rendered below) does NOT include theme dots, so removing
  // any `.theme-dots` host that exists in the DOM is always correct.
  // Same for `.lighting-toggle` (the dark/dim/light pill) which was
  // dropped from /debate-ai but still rendered by some old caches.
  function sweepStaleTheming(){
    document.querySelectorAll('.theme-dots, .lighting-toggle').forEach(function(el){
      try { el.remove(); } catch(e){}
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepStaleTheming);
  } else {
    sweepStaleTheming();
  }

  // Ensure /js/sfx.js is loaded. The SFX mute toggle (rendered + wired
  // below) calls window.SFX.toggleMute() and isMuted(), so the module
  // needs to be present on every page that mounts the shared topbar.
  // landing/learn/voice-debate/community/pricing/spar don't include
  // sfx.js explicitly; without this auto-inject the toggle button
  // rendered fine but its click handler short-circuited because
  // window.SFX was undefined and the user got "this button doesn't
  // work." Idempotent: skips if SFX already on window or a script tag
  // is already in the head. Defer so it doesn't block topbar render.
  (function ensureSfxLoaded(){
    if (window.SFX) return;
    if (document.querySelector('script[src*="/js/sfx.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/sfx.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  // Normalize a few synonyms so "/" and "/landing" both light up Home.
  function pathMatches(href){
    var h = href.replace(/\/$/,'') || '/';
    if (h === here) return true;
    if (h === '/' && (here === '' || here === '/landing')) return true;
    if (h === '/debate-ai' && /\/debate-ai/.test(here)) return true;
    return false;
  }

  // Canonical link order. Keep tight — this is the bar, not a sitemap.
  // The primary CTA on the right (Voice AI pill, set further down) is
  // always present; it doubles as a back-to-app for visitors who landed
  // on a marketing page mid-flow.
  //
  // 2026-05-13: trimmed from 9 → 5 links. College Prep, High School,
  // Learn to Argue, and India were carrying second-tier audience
  // entry points that landed on the topbar of every page on the site,
  // pushing the bar's link list past the eye's scan budget. Those
  // surfaces still exist; they just route via in-page CTAs + footer +
  // the audience-page redirects rather than top-nav real estate.
  // Pricing dropped because /pricing was unused after the canonical
  // pricing data moved into the FAQ + JSON-LD.
  //
  // 2026-05-18: Learn restored. The /learn surface has grown into a
  // real educational hub (fundamentals + format references + 10
  // long-tail guides + 4 education primers). It's now one of the
  // strongest SEO surfaces on the site and needs first-class
  // navigation, not footer-only access. Positioned between Prep
  // (where users build cases) and Today (the daily motion) so it
  // reads as the natural "before you compete, learn" entry point.
  var LINKS = [
    { href: '/voice-debate',  label: 'Voice'        },
    { href: '/app#case',      label: 'Prep'         },
    { href: '/learn',         label: 'Learn'        },
    { href: '/today',         label: 'Today'        },
    // 2026-05-18: /rounds standalone listing retired — the published-
    // rounds tab now lives inside /community. The topbar already links
    // to Community below, so a separate Rounds entry would just point
    // to the same surface twice.
    { href: '/live',          label: 'Live', live: true },
    { href: '/champions',     label: 'Champions'    },
    { href: '/community',     label: 'Community'    },
    { href: '/leaderboard',   label: 'Leaderboard'  },
    { href: '/#faq',          label: 'FAQ'          },
  ];

  function el(tag, attrs, children){
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs){
      if (k === 'style' && typeof attrs[k] === 'object'){
        for (var s in attrs[k]) n.style[s] = attrs[k][s];
      } else if (k === 'html') {
        n.innerHTML = attrs[k];
      } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function'){
        n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] !== false && attrs[k] != null){
        n.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function(c){
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }

  function render(mountId){
    var mount = document.getElementById(mountId || 'daTopbar');
    if (!mount) return;

    var nav = el('nav', { class: 'ui-topbar', 'aria-label': 'Site navigation' });
    var left = el('div', { class: 'ui-topbar-left' }, [
      el('a', {
        href: '/',
        class: 'ui-topbar-logo',
        'aria-label': 'Debate AI, home',
        title: 'Back to home',
        html: '<span>Debate</span> AI.<sup style="font-size:.5em;opacity:.55;margin-left:2px;font-weight:400">&trade;</sup>',
      }),
      // 2026-05-18: the "Beta · Updating daily" chip used to sit next to
      // the wordmark on every page. It read as crowded chrome that
      // pushed the nav links rightward without earning the pixels.
      // Beta state still lives in the /pricing FAQ and the floating
      // upgrade-cta pill; the topbar doesn't need to also pin it.
    ]);

    var right = el('div', { class: 'ui-topbar-right' });
    LINKS.forEach(function(L){
      var active = !L.external && pathMatches(L.href);
      var attrs = {
        href: L.href,
        class: 'ui-topbar-link' + (active ? ' is-active' : ''),
        title: L.label,
      };
      // External links (YouTube demo, etc.) open in a new tab so the
      // user doesn't lose the page; rel=noopener prevents the popup
      // from reaching back through window.opener.
      if (L.external){
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      var a = el('a', attrs);
      if (L.live){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        var dot = el('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;display:inline-block';
        a.appendChild(dot);
      }
      a.appendChild(document.createTextNode(L.label));
      right.appendChild(a);
    });

    // SFX mute toggle. Sits between the page links and the auth slot
    // so it's consistent across pages. Inline SVG speaker icon —
    // not an emoji (per the 2026-05-10 emoji sweep). aria-pressed
    // flips when the user toggles, the strike-through line in the
    // SVG appears via CSS when [aria-pressed=true]. State is read
    // from window.SFX.isMuted() (localStorage da-sfx-muted) so it
    // picks up whatever the user set on a previous page.
    var sfxBtn = el('button', {
      class: 'sfx-toggle',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Toggle sound effects',
      title: 'Mute sounds',
    });
    sfxBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M11 5 6 9H2v6h4l5 4z"/>' +
        '<path class="sfx-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
        '<path class="sfx-wave" d="M19 5a9 9 0 0 1 0 14"/>' +
        '<line class="sfx-strike" x1="3" y1="3" x2="21" y2="21"/>' +
      '</svg>';
    right.appendChild(sfxBtn);

    // Theme toggle. Single sun/moon button (not the old 3-dot tray)
    // so the topbar stays uncluttered while users can still flip to
    // the light token set. Three-way cycle (2026-05-14): light →
    // crimson → stone → light. Stone is the warm-graphite dark
    // variant; crimson is the pure-black brand-red variant. Icon
    // shows sun when current is any dark family (click goes light)
    // and moon when current is light (click goes dark). Legacy
    // `da-theme=grey` is honored on load and treated as dark-family
    // for cycle purposes (click → light). CSS lives in /css/ui.css
    // under .theme-toggle.
    var themeBtn = el('button', {
      class: 'theme-toggle',
      type: 'button',
      'aria-label': 'Toggle theme',
      title: 'Switch theme',
    });
    themeBtn.innerHTML =
      // Sun (shown when in dark theme → click goes light)
      '<svg class="ti-sun" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' +
      '</svg>' +
      // Moon (shown when in light theme → click goes dark)
      '<svg class="ti-moon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
      '</svg>';
    right.appendChild(themeBtn);

    // DM notification bell. Hidden until auth resolves with a signed-in
    // user (wireNotifications flips display). Surfaces the dm_threads
    // unread count site-wide so a DM reaches the user on any page, not
    // just /spar. Inline SVG bell (no emoji, per the brand sweep). The
    // badge + dropdown panel are children so positioning is anchored
    // to the button.
    var bellBtn = el('button', {
      class: 'ui-bell',
      type: 'button',
      'aria-label': 'Messages',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      title: 'Messages',
    });
    bellBtn.style.display = 'none';
    bellBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      '</svg>' +
      '<span class="ui-bell-badge" hidden>0</span>';
    right.appendChild(bellBtn);

    // Primary CTA is Voice AI everywhere — voice is the moat
    // against ChatGPT (real-time, sub-200ms, full interruption) and
    // the user-flagged most-important surface. Brand red (same as
    // the Debate AI pill on /voice-debate) keeps the topbar visually
    // calm; the prior gold-amber gradient read as braggy and
    // out-of-brand. Falls back to "Debate AI" when already on
    // /voice-debate so the bar still has a working CTA on every page.
    var onVoiceDebate = /\/voice-debate(\b|\/)/.test(here);
    var cta;
    if (onVoiceDebate) {
      cta = el('a', {
        href: '/debate-ai',
        class: 'ui-btn ui-btn-primary ui-btn-sm',
        style: { padding: '8px 18px' },
      }, 'Debate AI');
    } else {
      cta = el('a', {
        href: '/voice-debate',
        class: 'ui-btn ui-btn-primary ui-btn-sm',
        title: 'Talk out loud. The AI cuts in.',
        style: { padding: '8px 18px' },
      }, 'Voice AI');
    }
    right.appendChild(cta);

    var userSlot = el('span', { id: 'barUser' });
    userSlot.style.display = 'none';
    right.appendChild(userSlot);

    nav.appendChild(left);
    nav.appendChild(right);
    mount.replaceChildren(nav);

    wireThemeToggle();
    wireSfxToggle();
    injectBellStyles();
    wireNotifications(bellBtn);
    hydrateUser(userSlot);
  }

  // ── DM notifications ─────────────────────────────────────────────
  // Site-wide unread-DM surface. Listens to dm_threads where the user
  // is a participant (same query /spar's inbox uses) and reflects the
  // unread count in the topbar bell + a dropdown panel. On a NEW
  // inbound message it fires a lightweight in-page toast and, if the
  // user granted permission, an OS notification. Firestore is loaded
  // lazily — only signed-in users on pages that didn't already ship
  // the SDK pay the cost, and only once.
  var FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore-compat.js';
  function ensureFirestore(cb){
    if (typeof window.firebase === 'undefined') return;
    if (window.firebase.firestore){ cb(); return; }
    var existing = document.getElementById('da-firestore-sdk');
    if (existing){ existing.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script');
    s.id = 'da-firestore-sdk';
    s.src = FIRESTORE_SDK_URL;
    s.addEventListener('load', function(){ if (window.firebase.firestore) cb(); }, { once: true });
    s.addEventListener('error', function(){ /* offline / blocked — bell stays quiet */ });
    document.head.appendChild(s);
  }

  function escHtmlBell(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function relTimeBell(ms){
    if (!ms) return '';
    var diff = Date.now() - ms, m = Math.floor(diff/60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    var h = Math.floor(m/60); if (h < 24) return h + 'h';
    var d = Math.floor(h/24); if (d < 7) return d + 'd';
    return Math.floor(d/7) + 'w';
  }
  function peerOf(data, myUid){
    var ps = (data && data.participants) || [];
    for (var i=0;i<ps.length;i++){ if (ps[i] !== myUid) return ps[i]; }
    return '';
  }
  function peerInfo(data, myUid){
    var uid = peerOf(data, myUid);
    var info = (data && data.participantInfo && data.participantInfo[uid]) || {};
    return { uid: uid, name: info.name || 'Debater', photo: info.photo || '' };
  }

  function wireNotifications(bellBtn){
    if (!bellBtn) return;
    if (typeof window.firebase === 'undefined' || !window.firebase.auth) return;

    var panel = null;          // dropdown element (lazy)
    var threadsUnsub = null;
    var prevUnread = {};       // threadId -> my unread count, last snapshot
    var firstSnap = true;
    var rowsCache = [];
    var myUid = null;
    var badge = bellBtn.querySelector('.ui-bell-badge');

    bellBtn.addEventListener('click', function(e){
      e.stopPropagation();
      togglePanel();
      // Ask for OS-notification permission on first deliberate open —
      // a user gesture, never auto-prompted on load.
      try {
        if (window.Notification && Notification.permission === 'default'){
          Notification.requestPermission().catch(function(){});
        }
      } catch(_){}
    });
    document.addEventListener('click', function(){ if (panel) closePanel(); });

    window.firebase.auth().onAuthStateChanged(function(u){
      if (!u){
        if (threadsUnsub){ try { threadsUnsub(); } catch(e){} threadsUnsub = null; }
        bellBtn.style.display = 'none';
        firstSnap = true; prevUnread = {}; rowsCache = [];
        return;
      }
      myUid = u.uid;
      bellBtn.style.display = 'inline-flex';
      ensureFirestore(function(){ subscribe(); });
    });

    function subscribe(){
      if (!window.firebase.firestore || !myUid) return;
      // firebase.firestore() throws if the app wasn't initialized on
      // this page (some auth-only pages init lazily). Guard so the bell
      // degrades to "no live badge" instead of throwing in the topbar.
      var db;
      try { db = window.firebase.firestore(); }
      catch (e){ console.warn('[topbar:dm] firestore unavailable', e && e.message); return; }
      if (threadsUnsub){ try { threadsUnsub(); } catch(e){} }
      threadsUnsub = db.collection('dm_threads')
        .where('participants', 'array-contains', myUid)
        .orderBy('lastMessageAt', 'desc')
        .limit(20)
        .onSnapshot(onThreads, function(err){
          // Most likely a missing (participants, lastMessageAt) index
          // until firestore.indexes.json is deployed. Fail quiet — the
          // bell just won't light up.
          console.warn('[topbar:dm] inbox listen failed', err && err.message);
        });
    }

    function onThreads(snap){
      var rows = [], unreadCount = 0, newest = null;
      snap.forEach(function(d){
        var data = d.data() || {};
        var unread = (data.unread && data.unread[myUid]) || 0;
        if (unread > 0) unreadCount++;
        var prev = prevUnread[d.id] || 0;
        if (!firstSnap && unread > prev && data.lastMessageFrom && data.lastMessageFrom !== myUid){
          newest = data; // a genuinely new inbound message landed
        }
        prevUnread[d.id] = unread;
        rows.push({ id: d.id, data: data, unread: unread });
      });
      rowsCache = rows;
      renderBadge(unreadCount);
      if (panel) paintPanel();
      if (!firstSnap && newest){
        var p = peerInfo(newest, myUid);
        announce(p, newest.lastMessage || 'sent you a message');
      }
      firstSnap = false;
    }

    function renderBadge(n){
      if (!badge) return;
      if (n > 0){ badge.hidden = false; badge.textContent = n > 9 ? '9+' : String(n); bellBtn.classList.add('has-unread'); }
      else { badge.hidden = true; bellBtn.classList.remove('has-unread'); }
    }

    function togglePanel(){ panel ? closePanel() : openPanel(); }
    function openPanel(){
      panel = document.createElement('div');
      panel.className = 'ui-bell-panel';
      panel.addEventListener('click', function(e){ e.stopPropagation(); });
      bellBtn.appendChild(panel);
      bellBtn.setAttribute('aria-expanded', 'true');
      paintPanel();
    }
    function closePanel(){
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      bellBtn.setAttribute('aria-expanded', 'false');
    }
    function paintPanel(){
      if (!panel) return;
      var head = '<div class="ui-bell-head">Messages</div>';
      if (!rowsCache.length){
        panel.innerHTML = head +
          '<div class="ui-bell-empty">No messages yet.<br>Find a sparring partner and DM them from the live board.</div>' +
          '<a class="ui-bell-foot" href="/spar">Open the live board</a>';
        return;
      }
      var body = rowsCache.map(function(t){
        var p = peerInfo(t.data, myUid);
        var when = t.data.lastMessageAt && t.data.lastMessageAt.toMillis ? relTimeBell(t.data.lastMessageAt.toMillis()) : '';
        var fromMe = t.data.lastMessageFrom === myUid;
        var preview = (fromMe ? 'You: ' : '') + (t.data.lastMessage || '');
        var avatar = p.photo
          ? '<img class="ui-bell-av" src="' + escHtmlBell(p.photo) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="ui-bell-av ui-bell-av--blank">' + escHtmlBell((p.name[0] || '?').toUpperCase()) + '</span>';
        return '<a class="ui-bell-row' + (t.unread > 0 ? ' is-unread' : '') + '" href="/spar?dm=' + encodeURIComponent(p.uid) + '">' +
          avatar +
          '<span class="ui-bell-row__main">' +
            '<span class="ui-bell-row__name">' + escHtmlBell(p.name) + (t.unread > 0 ? '<span class="ui-bell-dot"></span>' : '') + '</span>' +
            '<span class="ui-bell-row__preview">' + escHtmlBell(preview) + '</span>' +
          '</span>' +
          '<span class="ui-bell-row__time">' + escHtmlBell(when) + '</span>' +
        '</a>';
      }).join('');
      panel.innerHTML = head + '<div class="ui-bell-list">' + body + '</div>' +
        '<a class="ui-bell-foot" href="/spar">Open all messages</a>';
    }

    // New-message announcement: a toast (always) + an OS notification
    // (if the user granted permission and the tab is hidden — no point
    // double-notifying a tab they're actively looking at).
    function announce(peer, preview){
      showToast(peer, preview);
      try { window.SFX && window.SFX.notify ? window.SFX.notify() : (window.SFX && window.SFX.success && window.SFX.success()); } catch(_){}
      try {
        if (window.Notification && Notification.permission === 'granted' && document.hidden){
          var n = new Notification('New message from ' + peer.name, {
            body: preview,
            icon: '/favicon.svg',
            tag: 'da-dm-' + peer.uid,
          });
          n.onclick = function(){ window.focus(); location.href = '/spar?dm=' + encodeURIComponent(peer.uid); n.close(); };
        }
      } catch(_){}
    }
    function showToast(peer, preview){
      var host = document.getElementById('da-bell-toasts');
      if (!host){
        host = document.createElement('div');
        host.id = 'da-bell-toasts';
        document.body.appendChild(host);
      }
      var t = document.createElement('a');
      t.className = 'da-bell-toast';
      t.href = '/spar?dm=' + encodeURIComponent(peer.uid);
      var avatar = peer.photo
        ? '<img src="' + escHtmlBell(peer.photo) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="da-bell-toast__blank">' + escHtmlBell((peer.name[0] || '?').toUpperCase()) + '</span>';
      t.innerHTML = avatar +
        '<span class="da-bell-toast__main">' +
          '<span class="da-bell-toast__name">' + escHtmlBell(peer.name) + '</span>' +
          '<span class="da-bell-toast__preview">' + escHtmlBell(preview) + '</span>' +
        '</span>';
      host.appendChild(t);
      requestAnimationFrame(function(){ t.classList.add('in'); });
      setTimeout(function(){ t.classList.remove('in'); setTimeout(function(){ if (t.parentNode) t.remove(); }, 320); }, 6000);
    }
  }

  function injectBellStyles(){
    if (document.getElementById('da-bell-styles')) return;
    var css =
      '.ui-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border-radius:999px;background:transparent;border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text-dim,#9aa);cursor:pointer;transition:color .15s,border-color .15s,background .15s}' +
      '.ui-bell:hover{color:var(--text,#fff);border-color:var(--border-strong,rgba(255,255,255,.24))}' +
      '.ui-bell.has-unread{color:var(--accent,#ef4444);border-color:var(--accent,#ef4444)}' +
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

  // SFX mute toggle. Reads window.SFX.isMuted() (localStorage-backed)
  // on mount + on click. SFX module loads with `defer` on every page
  // that needs it, but topbar.js may render before sfx.js parses —
  // we read defensively and re-sync via a window 'load' listener so
  // late-arriving state is reflected without a reload.
  function wireSfxToggle(){
    var btn = document.querySelector('.ui-topbar .sfx-toggle');
    if (!btn) return;
    function syncBtn(){
      var muted = !!(window.SFX && window.SFX.isMuted && window.SFX.isMuted());
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.title = muted ? 'Sounds muted — click to unmute' : 'Mute sounds';
    }
    syncBtn();
    // Re-sync once the page is fully loaded in case sfx.js was deferred.
    window.addEventListener('load', syncBtn, { once: true });
    btn.addEventListener('click', function(){
      if (!window.SFX || typeof window.SFX.toggleMute !== 'function') return;
      var nowMuted = window.SFX.toggleMute();
      syncBtn();
      // Acoustic confirmation when sound comes BACK on. Going-to-muted
      // is silent by construction (SFX.confirm() would no-op after the
      // toggle). Without this, the user hits unmute and gets no signal
      // that anything happened — they have to interact with something
      // else to verify sound returned. confirm() is short + warm.
      if (!nowMuted) { try { window.SFX.confirm && window.SFX.confirm(); } catch(_){} }
    });
  }

  // Theme toggle — applies the saved theme on mount and wires the
  // sun/moon button. Cycle is dark (crimson) ↔ light. Treats grey
  // (legacy) as part of the "dark family": click from grey goes to
  // light, click again to crimson; grey is no longer reachable from
  // the toggle but still honored if saved in localStorage by an older
  // session. Hard reload on change so the token cascade and any
  // per-section <style> blocks settle from a clean slate.
  function wireThemeToggle(){
    // Migration v2026-05: dark is the brand default. One-time sweep
    // clears a legacy `da-theme=light` so subpages match the marketing
    // landing's dark front door. Gated by `da-theme-default-v2` so it
    // only runs once per browser; users who explicitly re-toggle to
    // light afterward keep their preference (the sentinel is already
    // set, so the migration won't fire again).
    try {
      if (!localStorage.getItem('da-theme-default-v2')) {
        if (localStorage.getItem('da-theme') === 'light') {
          localStorage.removeItem('da-theme');
        }
        localStorage.setItem('da-theme-default-v2', '1');
      }
    } catch(e){}
    var saved = '';
    try { saved = localStorage.getItem('da-theme') || ''; } catch(e){}
    if (!saved) saved = document.documentElement.getAttribute('data-theme') || 'crimson';
    document.documentElement.setAttribute('data-theme', saved);
    // Auto-sync data-lighting from data-theme on every page load. Fixes
    // the legacy out-of-sync state where /debate-ai set data-lighting
    // independently of data-theme and a user-toggled `da-theme=light`
    // wasn't reflected as `debateos-lighting=light`. Without this, the
    // topbar text picked up the [data-theme="light"] dark-text rule
    // from ui.css while the body kept the dark bg — unreadable nav.
    // Pages that explicitly want a different lighting (e.g. debate-ai's
    // React `lighting` state) can still override after this runs; the
    // attribute is just no longer left stale on first paint.
    var lighting = (saved === 'light') ? 'light' : 'dark';
    try { localStorage.setItem('debateos-lighting', lighting); } catch(e){}
    document.documentElement.setAttribute('data-lighting', lighting);
    syncBtn(saved);

    var btn = document.querySelector('.ui-topbar .theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var prev = document.documentElement.getAttribute('data-theme') || 'crimson';
      // Binary toggle (2026-05-18): user wants only dark + light, no
      // middle grey/stone variant. Anything that isn't `light` flips to
      // light; light flips back to crimson. Legacy values (grey, stone)
      // are treated as dark for the purpose of "next click goes light",
      // so users who had those saved get a sensible one-click escape
      // hatch without us having to migrate localStorage.
      var next = (prev === 'light') ? 'crimson' : 'light';
      var lighting = (next === 'light') ? 'light' : 'dark';
      try {
        localStorage.setItem('da-theme', next);
        localStorage.setItem('debateos-lighting', lighting);
      } catch(e){}
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.setAttribute('data-lighting', lighting);
      window.location.reload();
    });

    function syncBtn(t){
      var b = document.querySelector('.ui-topbar .theme-toggle');
      if (!b) return;
      var isLight = (t === 'light');
      // Tooltip names the only other state since the cycle is now
      // binary. Legacy grey/stone values are treated as dark — next
      // click goes light.
      var nextLabel = isLight ? 'Dark' : 'Light';
      b.setAttribute('aria-label', 'Switch to ' + nextLabel);
      b.title = 'Switch to ' + nextLabel;
      // Sun/moon visibility flips via CSS attribute selector on the
      // <html> data-theme so we don't have to do anything else here.
    }
  }

  // Sign-in slot. Only hydrates if the page already loaded firebase
  // (so we don't bloat pages that don't need it). Shows initial +
  // signs out on click.
  //
  // Extension hook: if the page sets `window.daTopbarUserSlot = function(slot, user){...}`
  // BEFORE this script loads, we hand off rendering after auth state
  // is known. /debate-ai uses this to add an "Account" button that
  // opens its in-app modal — without that hook we'd lose access to
  // BYOK / API key / plan settings on /debate-ai.
  function hydrateUser(slot){
    if (typeof window.firebase === 'undefined' || !window.firebase.auth) return;
    // Track the first auth event so we can distinguish "page loaded
    // with an already-signed-in user" (no sound) from "user just
    // completed the OAuth flow" (chime). Without this guard, every
    // page navigation while signed in would re-fire the chime.
    var seenAuth = false;
    try {
      window.firebase.auth().onAuthStateChanged(function(u){
        var wasFirst = !seenAuth;
        seenAuth = true;
        // Fire SFX.success only on a genuine sign-in: the very FIRST
        // auth event in this page session was a null user (or no event
        // came before) and now we have a user. The pre-existing case
        // (first event already has u set) means they were already
        // signed in from a prior page — no chime.
        if (u && !wasFirst) {
          try { window.SFX && window.SFX.success && window.SFX.success(); } catch(_){}
        }
        if (!u){ slot.style.display = 'none'; slot.innerHTML = ''; return; }
        if (typeof window.daTopbarUserSlot === 'function'){
          slot.style.display = 'inline-flex';
          slot.style.alignItems = 'center';
          slot.style.gap = '8px';
          try { window.daTopbarUserSlot(slot, u); return; } catch(e){ /* fall through */ }
        }
        slot.style.display = 'inline-flex';
        slot.style.alignItems = 'center';
        slot.style.gap = '10px';
        slot.style.fontSize = '.72rem';
        slot.style.color = 'var(--text-dim)';
        var first = ((u.displayName || u.email || '').split(/\s+/)[0]) || 'Account';
        slot.innerHTML = '';
        // Name doubles as the entry point to /profile so every signed-in
        // page surfaces a path to the dashboard. Pill chrome (rounded
        // border, optional photo, hover highlight) signals it's
        // clickable. On the /profile page itself we render a non-link
        // span so we don't show a "you are here → here" dead link;
        // the pill border switches to the accent to indicate "you're
        // already on this page."
        var onProfile = /^\/profile/.test(here);
        var nameLink;
        if (onProfile){
          nameLink = document.createElement('span');
          nameLink.style.cssText = 'color:var(--text);font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--accent);background:var(--bg-elev)';
        } else {
          nameLink = document.createElement('a');
          nameLink.href = '/profile';
          nameLink.title = 'Open your dashboard';
          nameLink.style.cssText = 'color:var(--text);text-decoration:none;font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card,transparent);transition:background .15s,border-color .15s';
          nameLink.addEventListener('mouseenter', function(){
            nameLink.style.background = 'var(--bg-elev)';
            nameLink.style.borderColor = 'var(--accent)';
          });
          nameLink.addEventListener('mouseleave', function(){
            nameLink.style.background = 'var(--bg-card,transparent)';
            nameLink.style.borderColor = 'var(--border)';
          });
        }
        if (u.photoURL){
          var img = document.createElement('img');
          img.src = u.photoURL;
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          img.style.cssText = 'width:18px;height:18px;border-radius:50%;object-fit:cover';
          nameLink.appendChild(img);
        }
        var nameText = document.createElement('span');
        nameText.textContent = first;
        nameLink.appendChild(nameText);
        var out = document.createElement('button');
        out.type = 'button';
        out.textContent = 'Sign out';
        out.style.cssText = 'background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-family:inherit;font-size:.68rem;padding:0';
        out.addEventListener('click', function(){
          try { window.firebase.auth().signOut(); } catch(e){}
        });
        slot.appendChild(nameLink);
        slot.appendChild(out);
      });
    } catch(e){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ render(); });
  } else {
    render();
  }

  // Public hook so per-page code can re-render after auth or theme
  // changes if it needs to (rare).
  window.daTopbar = { render: render };
})();
