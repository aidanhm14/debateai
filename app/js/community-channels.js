/* community-channels.js
 *
 * The community chat, channelized (2026-08-11). Replaces
 * community-chat.js as the owner of the Live tab on /community:
 * a channel rail on the left, one live room on the right.
 *
 * Two kinds of channel, two backends:
 *   - #lobby is the existing anonymous room. Same server-mediated
 *     /api/chat-feed backend as before (per-IP rate limit, length
 *     cap, sanitization), same pinned localStorage handle, polled.
 *     Zero-friction stays zero-friction.
 *   - Every other channel is signed-in Firestore chat at
 *     community_channels/{ch}/messages. Real-time onSnapshot, but
 *     quota-conscious by construction: ONE subscription at a time
 *     (the active channel only, limit 40), detached when the tab is
 *     hidden or the user leaves the pane. Reads are public so
 *     lurkers can see the room is alive before signing in; posting
 *     requires a named Google account (rules enforce it).
 *
 * Unread dots: one limit(1) probe per named channel when the pane
 * opens (9 cheap reads), compared against a localStorage lastSeen
 * map. Not a true unread count, just "something happened since you
 * last looked," which is all a dot needs to say.
 */
(function(){
  'use strict';

  const CHANNELS = [
    { id: 'lobby',        label: 'lobby',        topic: 'Anonymous room. No sign-in, say anything.', anon: true },
    { id: 'general',      label: 'general',      topic: 'The main hall. Introduce yourself.' },
    { id: 'find-a-round', label: 'find-a-round', topic: 'Looking for an opponent? Post your format and time.' },
    { id: 'motions',      label: 'motions',      topic: 'Motions worth running, prep, and case ideas.' },
    { id: 'apda',         label: 'apda',         topic: 'APDA circuit talk.' },
    { id: 'bp',           label: 'bp',           topic: 'British Parliamentary and Worlds.' },
    { id: 'public-forum', label: 'public-forum', topic: 'Public Forum. Evidence fights welcome.' },
    { id: 'ld',           label: 'ld',           topic: 'Lincoln-Douglas. Frameworks and the fallout.' },
    { id: 'policy',       label: 'policy',       topic: 'Policy. Spread at your own risk.' },
    { id: 'help',         label: 'help',         topic: 'Stuck on anything? Ask here.' },
  ];

  const ANON_ENDPOINT = '/api/chat-feed';
  const HANDLE_KEY = 'da-chat-handle';
  const ACTIVE_KEY = 'da-community-channel';
  const SEEN_KEY = 'da-community-seen';
  const MSG_MAX = 500;
  const ANON_MSG_MAX = 280;
  const ANON_POLL_MS = 20000;
  const ANON_POLL_HIDDEN_MS = 60000;

  let db = null, auth = null, user = null;
  let active = null;          // channel object
  let unsub = null;           // firestore unsubscribe
  let anonTimer = null;
  let anonLastId = null;
  let pinned = true;          // stuck to bottom?
  let paneVisible = false;
  let els = {};

  // ── identity ───────────────────────────────────────────────
  function anonHandle(){
    let h = null;
    try { h = localStorage.getItem(HANDLE_KEY); } catch(e){}
    if (h) return h;
    if (window.DEBATEAI_SEED && typeof window.DEBATEAI_SEED.buildLurkerPool === 'function'){
      const pool = (window.DEBATEAI_SEED.buildLurkerPool(80) || [])
        .filter(p => p.displayName && p.displayName !== 'Anonymous' && p.displayName !== '?' && p.displayName !== '—');
      if (pool.length) h = pool[Math.floor(Math.random() * pool.length)].displayName;
    }
    if (!h) h = 'guest_' + (1000 + Math.floor(Math.random() * 8999));
    try { localStorage.setItem(HANDLE_KEY, h); } catch(e){}
    return h;
  }

  function seenMap(){
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch(e){ return {}; }
  }
  function markSeen(ch){
    const m = seenMap();
    m[ch] = Date.now();
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch(e){}
    const btn = els.rail && els.rail.querySelector('[data-ch="' + ch + '"] .disc-dot');
    if (btn) btn.hidden = true;
  }

  function escHtml(s){
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function relTime(ms){
    const d = Math.max(0, Date.now() - ms);
    if (d < 60000) return 'now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h';
    if (d < 31536000000) return Math.floor(d / 86400000) + 'd';
    return Math.floor(d / 31536000000) + 'y';
  }
  function fullTime(ms){
    try { return new Date(ms).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }); }
    catch(e){ return ''; }
  }
  function dayKey(ms){
    const d = new Date(ms);
    return [d.getFullYear(), d.getMonth(), d.getDate()].join('-');
  }
  function dayLabel(ms){
    const d = new Date(ms);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (dayKey(ms) === dayKey(today.getTime())) return 'Today';
    if (dayKey(ms) === dayKey(yesterday.getTime())) return 'Yesterday';
    try { return d.toLocaleDateString([], { month:'short', day:'numeric', year:d.getFullYear() === today.getFullYear() ? undefined : 'numeric' }); }
    catch(e){ return ''; }
  }
  function avatarHue(name){
    let hash = 0;
    String(name || '').split('').forEach(c => { hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0; });
    return Math.abs(hash) % 360;
  }
  function track(ev, meta){ try { if (window.gtag) gtag('event', ev, meta || {}); } catch(e){} }

  // ── render ─────────────────────────────────────────────────
  function build(){
    const pane = document.getElementById('livePane');
    if (!pane) return false;
    pane.innerHTML =
      '<div class="disc">' +
        '<aside class="disc-rail" aria-label="Channels">' +
          '<div class="disc-rail-head"><span>Chat rooms</span><span class="disc-open"><i></i>open</span></div>' +
          CHANNELS.map(c =>
            '<button type="button" class="disc-ch" data-ch="' + c.id + '">' +
              '<span class="disc-ch-hash">#</span>' + c.label +
              '<i class="disc-dot" hidden></i>' +
            '</button>').join('') +
          '<div class="disc-rail-foot">Private messages live in your <a href="/spar">inbox on /spar</a>.</div>' +
        '</aside>' +
        '<section class="disc-main">' +
          '<header class="disc-head">' +
            '<div class="disc-head-copy">' +
              '<div class="disc-head-top"><b id="discChName"></b></div>' +
              '<div class="disc-topic" id="discTopic"></div>' +
            '</div>' +
            '<div class="disc-activity is-quiet" id="discActivity"><i></i><span>Opening room</span></div>' +
            '<div class="disc-id" id="discIdent"></div>' +
          '</header>' +
          '<div class="disc-scroll" id="discScroll" aria-live="polite" aria-label="Messages"></div>' +
          '<button id="discNewPill" class="disc-new-pill" type="button" hidden>&darr; new messages</button>' +
          '<div class="disc-input-row" id="discInputRow"></div>' +
        '</section>' +
      '</div>';
    els = {
      pane: pane,
      rail: pane.querySelector('.disc-rail'),
      name: pane.querySelector('#discChName'),
      topic: pane.querySelector('#discTopic'),
      activity: pane.querySelector('#discActivity'),
      ident: pane.querySelector('#discIdent'),
      scroll: pane.querySelector('#discScroll'),
      newPill: pane.querySelector('#discNewPill'),
      inputRow: pane.querySelector('#discInputRow'),
    };
    els.rail.addEventListener('click', e => {
      const b = e.target.closest('.disc-ch');
      if (b) switchChannel(b.getAttribute('data-ch'));
    });
    els.scroll.addEventListener('scroll', () => {
      pinned = els.scroll.scrollTop + els.scroll.clientHeight >= els.scroll.scrollHeight - 60;
      if (pinned) els.newPill.hidden = true;
    });
    els.newPill.addEventListener('click', () => {
      els.scroll.scrollTop = els.scroll.scrollHeight;
      els.newPill.hidden = true;
      pinned = true;
    });
    return true;
  }

  function renderInputRow(){
    const ch = active;
    if (!ch) return;
    if (ch.anon){
      els.inputRow.innerHTML =
        '<div class="disc-compose">' +
          '<textarea id="discInput" class="disc-input" rows="1" maxlength="' + ANON_MSG_MAX + '" placeholder="Drop a motion, ask for a round, or disagree with someone." autocomplete="off"></textarea>' +
          '<span class="disc-keyhint">Enter sends · Shift + Enter adds a line</span>' +
        '</div>' +
        '<div class="disc-input-meta">' +
          '<button id="discReroll" class="disc-reroll" type="button" title="Pick a new anonymous handle">re-roll handle</button>' +
          '<span id="discCount" class="disc-count">0/' + ANON_MSG_MAX + '</span>' +
          '<button id="discSend" class="disc-send" type="button">Send</button>' +
        '</div>';
      els.inputRow.querySelector('#discReroll').addEventListener('click', () => {
        try { localStorage.removeItem(HANDLE_KEY); } catch(e){}
        renderIdent();
      });
    } else if (user && !user.isAnonymous){
      els.inputRow.innerHTML =
        '<div class="disc-compose">' +
          '<textarea id="discInput" class="disc-input" rows="1" maxlength="' + MSG_MAX + '" placeholder="Message #' + escHtml(ch.label) + '." autocomplete="off"></textarea>' +
          '<span class="disc-keyhint">Enter sends · Shift + Enter adds a line</span>' +
        '</div>' +
        '<div class="disc-input-meta">' +
          '<span id="discCount" class="disc-count">0/' + MSG_MAX + '</span>' +
          '<button id="discSend" class="disc-send" type="button">Send</button>' +
        '</div>';
    } else {
      els.inputRow.innerHTML =
        '<div class="disc-signin">' +
          '<span>Reading is open. Posting in #' + escHtml(ch.label) + ' takes a profile.</span>' +
          '<button type="button" class="disc-signin-btn" id="discSignIn">Sign in with Google</button>' +
        '</div>';
      els.inputRow.querySelector('#discSignIn').addEventListener('click', () => {
        if (typeof window.openAuthModal === 'function') window.openAuthModal();
        else if (auth) auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(()=>{});
      });
      return;
    }
    const input = els.inputRow.querySelector('#discInput');
    const count = els.inputRow.querySelector('#discCount');
    const send = els.inputRow.querySelector('#discSend');
    const max = ch.anon ? ANON_MSG_MAX : MSG_MAX;
    input.addEventListener('input', () => {
      count.textContent = input.value.length + '/' + max;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doSend(); }
    });
    send.addEventListener('click', doSend);
  }

  // The name this account posts under. Same rule as everywhere else: a
  // chosen name beats the account name. It matters here because it is
  // written onto every message document, so the wrong one persists in the
  // channel rather than being re-rendered correctly next load.
  function postingName(){
    if (window.DBIdentity && user) {
      const id = window.DBIdentity.forUser(user);
      if (id && id.name) return id.name;
    }
    return user ? 'Debater ' + String(user.uid || '').slice(-4).toUpperCase() : '';
  }

  function renderIdent(){
    if (!active) return;
    if (active.anon){
      els.ident.innerHTML = 'posting as <b>' + escHtml(anonHandle()) + '</b> &middot; anonymous room';
    } else if (user && !user.isAnonymous){
      els.ident.innerHTML = 'posting as <b>' + escHtml(postingName() || 'you') + '</b>';
    } else {
      els.ident.textContent = 'read-only until you sign in';
    }
  }

  function messageRowHtml(m, prev){
    // Discord-style grouping: consecutive same-author rows within
    // 5 minutes collapse under one header.
    const grouped = prev && prev.uid && m.uid && prev.uid === m.uid && (m.ts - prev.ts) < 300000;
    const classes = ['disc-msg'];
    if (grouped) classes.push('disc-msg--grouped');
    if (user && m.uid === user.uid) classes.push('disc-msg--mine');
    if ((Date.now() - m.ts) < 15 * 60000) classes.push('is-fresh');
    const stamp = fullTime(m.ts);
    const iso = new Date(m.ts).toISOString();
    const av = m.photo
      ? '<img class="disc-av" src="' + escHtml(m.photo) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="disc-av disc-av--txt" style="--avatar-hue:' + avatarHue(m.name) + '">' + escHtml((m.name || '?')[0].toUpperCase()) + '</span>';
    if (grouped){
      return '<div class="' + classes.join(' ') + '" title="' + escHtml(stamp) + '"><div class="disc-body">' + escHtml(m.text) + '</div></div>';
    }
    return '<div class="' + classes.join(' ') + '">' +
      av +
      '<div class="disc-msg-main">' +
        '<div class="disc-msg-head"><b>' + escHtml(m.name || 'debater') + '</b><time class="disc-time" datetime="' + iso + '" title="' + escHtml(stamp) + '">' + relTime(m.ts) + '</time></div>' +
        '<div class="disc-body">' + escHtml(m.text) + '</div>' +
      '</div>' +
    '</div>';
  }

  function paintActivity(msgs){
    if (!els.activity) return;
    els.activity.className = 'disc-activity is-quiet';
    const label = els.activity.querySelector('span');
    if (!msgs.length){ label.textContent = 'New room'; return; }
    const age = Math.max(0, Date.now() - msgs[msgs.length - 1].ts);
    if (age < 15 * 60000){
      els.activity.className = 'disc-activity is-live';
      label.textContent = age < 60000 ? 'Active now' : 'Active ' + Math.floor(age / 60000) + 'm ago';
    } else if (age < 24 * 3600000){
      els.activity.className = 'disc-activity is-recent';
      label.textContent = 'Last post ' + Math.floor(age / 3600000) + 'h ago';
    } else {
      label.textContent = 'Last post ' + relTime(msgs[msgs.length - 1].ts) + ' ago';
    }
  }

  function loadingHtml(){
    return '<div class="disc-empty"><span class="disc-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>Opening room</b><span>Pulling in the latest messages.</span></div>';
  }

  function paint(msgs){
    paintActivity(msgs);
    if (!msgs.length){
      els.scroll.innerHTML = '<div class="disc-empty"><span class="disc-empty-mark">#</span><b>Quiet room.</b><span>Say the first thing.</span></div>';
      return;
    }
    let html = '';
    let lastDay = '';
    for (let i = 0; i < msgs.length; i++){
      const nextDay = dayKey(msgs[i].ts);
      if (nextDay !== lastDay){
        html += '<div class="disc-day"><span>' + escHtml(dayLabel(msgs[i].ts)) + '</span></div>';
        lastDay = nextDay;
      }
      html += messageRowHtml(msgs[i], msgs[i-1]);
    }
    const wasPinned = pinned;
    els.scroll.innerHTML = html;
    if (wasPinned) els.scroll.scrollTop = els.scroll.scrollHeight;
    else els.newPill.hidden = false;
  }

  // ── firestore channels ─────────────────────────────────────
  function subscribeFs(ch){
    if (!db) { els.scroll.innerHTML = '<div class="disc-empty">Chat is unavailable right now.</div>'; return; }
    els.scroll.innerHTML = loadingHtml();
    unsub = db.collection('community_channels').doc(ch.id).collection('messages')
      .orderBy('createdAt', 'desc').limit(40)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => {
          const v = d.data() || {};
          msgs.push({
            uid: v.uid || '',
            name: v.name || 'debater',
            photo: v.photo || '',
            text: v.text || '',
            ts: (v.createdAt && v.createdAt.toMillis) ? v.createdAt.toMillis() : Date.now(),
          });
        });
        msgs.reverse();
        paint(msgs);
        markSeen(ch.id);
      }, err => {
        console.warn('[channels] snapshot error', err && err.message);
        els.scroll.innerHTML = '<div class="disc-empty">Could not load this channel. It may be a rules deploy away.</div>';
      });
  }

  function sendFs(text){
    if (!db || !user || user.isAnonymous) return Promise.reject(new Error('signin'));
    return db.collection('community_channels').doc(active.id).collection('messages').add({
      uid: user.uid,
      name: postingName() || 'debater',
      photo: user.photoURL || '',
      text: text,
      channel: active.id,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ── anon lobby (server-mediated, polled) ───────────────────
  function pollAnon(){
    fetch(ANON_ENDPOINT).then(r => r.ok ? r.json() : null).then(j => {
      if (!j || !Array.isArray(j.rows) || !active || !active.anon) return;
      // Join rows are dropped, and the server drops them too as of
      // 2026-08-23. They used to be rendered as "<name> joined" system
      // lines, but their only writer stopped supplying a name when this
      // module replaced community-chat.js, so the room filled with
      // identical "Anonymous joined" rows and the real conversation was
      // pushed off the bottom of the scroller. Kept as a client-side
      // guard so any legacy row still in the window never renders.
      const msgs = j.rows.filter(e => e.kind !== 'join').map(e => ({
        uid: 'anon:' + (e.handle || ''),
        name: e.handle || 'guest',
        photo: '',
        text: e.text || '',
        ts: e.at || Date.now(),
        kind: 'msg',
      }));
      const newest = j.rows.length ? String(j.rows[j.rows.length-1].id || '') : '';
      if (newest === anonLastId) return;
      anonLastId = newest;
      paint(msgs);
      markSeen('lobby');
    }).catch(()=>{});
  }
  function startAnon(){
    els.scroll.innerHTML = loadingHtml();
    anonLastId = null;
    pollAnon();
    schedAnon();
  }
  function schedAnon(){
    stopAnon();
    anonTimer = setInterval(pollAnon, document.hidden ? ANON_POLL_HIDDEN_MS : ANON_POLL_MS);
  }
  function stopAnon(){
    if (anonTimer){ clearInterval(anonTimer); anonTimer = null; }
  }
  function sendAnon(text){
    return fetch(ANON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: anonHandle(), text: text }),
    }).then(r => { if (!r.ok) throw new Error('post failed'); pollAnon(); });
  }

  // ── shared send ────────────────────────────────────────────
  function doSend(){
    const input = els.inputRow.querySelector('#discInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const send = els.inputRow.querySelector('#discSend');
    if (send) send.disabled = true;
    const p = active.anon ? sendAnon(text) : sendFs(text);
    p.then(() => {
      input.value = '';
      input.style.height = 'auto';
      const count = els.inputRow.querySelector('#discCount');
      if (count) count.textContent = '0/' + (active.anon ? ANON_MSG_MAX : MSG_MAX);
      pinned = true;
      track('community_msg_sent', { channel: active.id, anon: !!active.anon });
    }).catch(() => {
      input.classList.add('disc-input--err');
      setTimeout(() => input.classList.remove('disc-input--err'), 1600);
    }).then(() => { if (send) send.disabled = false; input.focus(); });
  }

  // ── channel switching ──────────────────────────────────────
  function teardownFeed(){
    if (unsub){ try { unsub(); } catch(e){} unsub = null; }
    stopAnon();
  }
  function switchChannel(id){
    const ch = CHANNELS.find(c => c.id === id) || CHANNELS[0];
    active = ch;
    try { localStorage.setItem(ACTIVE_KEY, ch.id); } catch(e){}
    els.rail.querySelectorAll('.disc-ch').forEach(b => b.classList.toggle('is-on', b.getAttribute('data-ch') === ch.id));
    els.name.textContent = '#' + ch.label;
    els.topic.textContent = ch.topic;
    if (els.activity){
      els.activity.className = 'disc-activity is-quiet';
      els.activity.querySelector('span').textContent = 'Opening room';
    }
    pinned = true;
    els.newPill.hidden = true;
    teardownFeed();
    renderIdent();
    renderInputRow();
    if (paneVisible){
      if (ch.anon) startAnon(); else subscribeFs(ch);
    }
    track('community_channel_open', { channel: ch.id });
  }

  // Unread probes: newest message per named channel vs lastSeen.
  function probeUnread(){
    if (!db) return;
    const seen = seenMap();
    CHANNELS.filter(c => !c.anon).forEach(c => {
      db.collection('community_channels').doc(c.id).collection('messages')
        .orderBy('createdAt', 'desc').limit(1).get()
        .then(snap => {
          if (snap.empty) return;
          const v = snap.docs[0].data() || {};
          const ts = (v.createdAt && v.createdAt.toMillis) ? v.createdAt.toMillis() : 0;
          if (ts > (seen[c.id] || 0) && (!active || active.id !== c.id)){
            const dot = els.rail.querySelector('[data-ch="' + c.id + '"] .disc-dot');
            if (dot) dot.hidden = false;
          }
        }).catch(()=>{});
    });
  }

  // ── pane lifecycle ─────────────────────────────────────────
  // The community page shows/hides tab panes with style.display; watch
  // for our pane becoming visible so the feed only runs when watched.
  function watchPane(){
    const check = () => {
      const vis = els.pane && els.pane.style.display !== 'none' && !document.hidden;
      if (vis === paneVisible) return;
      paneVisible = vis;
      if (vis){
        if (active.anon) startAnon(); else subscribeFs(active);
        probeUnread();
      } else {
        teardownFeed();
      }
    };
    new MutationObserver(check).observe(els.pane, { attributes: true, attributeFilter: ['style'] });
    document.addEventListener('visibilitychange', () => {
      check();
      if (paneVisible && active && active.anon) schedAnon();
    });
    check();
  }

  // ── boot ───────────────────────────────────────────────────
  function start(){
    if (!build()) return;
    try {
      if (window.firebase && firebase.apps && firebase.apps.length){
        db = firebase.firestore();
        auth = firebase.auth();
        auth.onAuthStateChanged(u => {
          user = u || null;
          renderIdent();
          renderInputRow();
        });
      }
    } catch(e){}
    // Default is #lobby, not #general (2026-08-23). Measured the same
    // day: all nine named channels held zero messages, and #general is
    // read-only without a named account, so a first-time visitor
    // clicking Chat landed in an empty room they could not even post
    // in. #lobby is the one room with anything in it and the only one
    // that takes a message without signing in. A saved choice still
    // wins; this only moves where someone with no history starts.
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_KEY); } catch(e){}
    switchChannel(saved || 'lobby');
    watchPane();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
