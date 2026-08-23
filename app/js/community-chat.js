/* community-chat.js
 *
 * Live community chat for the /community Live tab. Talks to
 * /api/chat-feed (server-mediated, atomic, IP rate-limited). Polls
 * every CHAT_POLL_MS for new entries; appends + scrolls if user is
 * pinned to the bottom, otherwise leaves a "↓ N new" pill so they
 * don't get yanked off whatever they were reading.
 *
 * Anonymous identity:
 *   - Handle is picked once from the lurker pool (community-seed.js
 *     buildLurkerPool) and pinned to localStorage `da-chat-handle`.
 *   - The old "X just joined!" line is retired (2026-08-23): its
 *     writer had no name to give and the room filled with identical
 *     "Anonymous joined" rows. This feed renders messages only.
 *   - User can re-roll the handle from the input bar (rare, but
 *     people care about their handle even when anonymous).
 *
 * Failure modes are silent:
 *   - GET fails → leave the existing rendered list, retry next tick
 *   - POST fails → input box turns amber, message stays in the
 *     textarea so the user can retry; no toast spam
 *
 * No firestore/auth on the client. Everything goes through the
 * Netlify function so abuse is bounded by the per-IP rate limit
 * there.
 *
 * Reply privately (2026-08-23):
 *   A handle is a pseudonym, so "is anyone free for a round?" used to
 *   be unanswerable except by shouting back into the same room. When
 *   the host page supplies `authToken`, the server returns the poster's
 *   uid on messages written by a named account (and only to a named
 *   reader), and the name in each row becomes a button. The module does
 *   not know what a DM is: it calls `onDm(uid, name, photo)` and the
 *   host decides. /spar opens its dm_threads modal, /chat opens the
 *   thread in its own sidebar. A host that passes neither option gets
 *   exactly the old behaviour.
 */
(function(){
  'use strict';

  const ENDPOINT = '/api/chat-feed';
  const HANDLE_KEY = 'da-chat-handle';
  // 20s poll. Was 8s but that burned ~450 invocations/hr/user, which on
  // /community traffic put us at the Netlify usage cap. Chat is ambient,
  // not realtime; a 12s extra delay is invisible to anyone not actively
  // typing while watching for a reply.
  const POLL_MS = 20000;
  // When the tab is hidden, slow polling to 1 minute. Most "users on
  // /community" are background tabs, not eyes-on-screen.
  const POLL_MS_HIDDEN = 60000;
  const MSG_MAX = 280;

  function readHandle(){
    try { return localStorage.getItem(HANDLE_KEY); } catch { return null; }
  }
  function writeHandle(h){
    try { localStorage.setItem(HANDLE_KEY, h); } catch {}
  }

  function pickAnonHandle(){
    if (window.DEBATEAI_SEED && typeof window.DEBATEAI_SEED.buildLurkerPool === 'function'){
      const pool = window.DEBATEAI_SEED.buildLurkerPool(80) || [];
      // Skip the bare-anonymous tokens — those make a chat unreadable
      // because every third row is "Anonymous: ...".
      const named = pool.filter(p => p.displayName && p.displayName !== 'Anonymous' && p.displayName !== '?' && p.displayName !== '—');
      if (named.length){
        return named[Math.floor(Math.random() * named.length)].displayName;
      }
    }
    // Last-resort fallback handle.
    return 'guest_' + (1000 + Math.floor(Math.random() * 8999));
  }

  function ensureHandle(){
    let h = readHandle();
    if (!h){
      h = pickAnonHandle();
      writeHandle(h);
    }
    return h;
  }

  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function timeAgo(ms){
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'just now';
    if (diff < 60 * 60_000) return Math.floor(diff / 60_000) + 'm';
    if (diff < 24 * 60 * 60_000) return Math.floor(diff / (60 * 60_000)) + 'h';
    return Math.floor(diff / (24 * 60 * 60_000)) + 'd';
  }

  // Seeded avatar per handle — same handle always draws the same face
  // (DBAvatar ships on the page; empty string degrades to text-only).
  function avChip(handle){
    if (!window.DBAvatar) return '';
    return '<span class="chat-av" aria-hidden="true">'
      + window.DBAvatar.svg(window.DBAvatar.randomConfig(handle || 'anon'), 24)
      + '</span>';
  }

  // The head is a button only when there is somewhere for it to go: a
  // named poster, a named reader, and a host that wired onDm. Your own
  // messages stay plain — a DM to yourself is a dead end, and the
  // server tells us which uid is ours so we do not have to guess from
  // the handle (handles are not unique).
  function headHtml(row, canDm){
    const inner = avChip(row.handle)
      + '<span class="chat-msg-handle">' + escHtml(row.handle || 'anon') + '</span>';
    if (!canDm) return inner;
    return '<button type="button" class="chat-msg-who" data-dm-uid="' + escHtml(row.uid) + '"'
      +   ' data-dm-name="' + escHtml(row.handle || 'Debater') + '"'
      +   ' data-dm-photo="' + escHtml(row.photo || '') + '"'
      +   ' title="Message ' + escHtml(row.handle || 'them') + ' privately">'
      + inner
      + '<span class="chat-msg-dm" aria-hidden="true">Message</span>'
      + '</button>';
  }

  function rowHtml(row, myHandle, ctx){
    const mine = row.handle && myHandle && row.handle === myHandle;
    const canDm = !!(ctx && ctx.canDm && row.uid && row.uid !== ctx.me);
    return '<div class="chat-row chat-msg' + (mine ? ' chat-msg-mine' : '') + '" data-handle="' + escHtml(row.handle) + '">'
      + '<div class="chat-msg-head">'
      +   headHtml(row, canDm)
      +   '<span class="chat-msg-time">' + escHtml(timeAgo(row.at)) + '</span>'
      + '</div>'
      + '<div class="chat-msg-text">' + escHtml(row.text) + '</div>'
      + '</div>';
  }

  function isPinnedToBottom(scroller){
    if (!scroller) return true;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  function scrollToBottom(scroller){
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }

  function init(opts){
    opts = opts || {};
    const scroller   = opts.scroller;
    const handleEl   = opts.handleEl;
    const inputEl    = opts.inputEl;
    const sendBtn    = opts.sendBtn;
    const rerollBtn  = opts.rerollBtn;
    const newPill    = opts.newPill;
    const charCountEl= opts.charCountEl;
    // Optional. authToken resolves the viewer's Firebase ID token (or
    // null); onDm receives (uid, name, photo) when a row's name is
    // clicked. Without both, this is the room exactly as it was.
    const authToken  = typeof opts.authToken === 'function' ? opts.authToken : null;
    const onDm       = typeof opts.onDm === 'function' ? opts.onDm : null;
    if (!scroller || !inputEl || !sendBtn) return;

    let myHandle = ensureHandle();
    let lastIds = new Set();
    let pendingNew = 0;
    let firstFetchDone = false;
    // Who the SERVER says we are. Null until a named account's token
    // verifies, which can be several polls after the first paint on a
    // page where auth rehydrates slowly.
    let meUid = null;
    const canDm = !!(authToken && onDm);

    function ctx(){ return { canDm, me: meUid }; }

    // Never blocks a fetch on auth. A token that is slow, missing or
    // rejected just means this poll renders no DM buttons; the next one
    // picks them up.
    async function authHeaders(){
      if (!authToken) return null;
      try {
        const t = await authToken();
        return t ? { Authorization: 'Bearer ' + t } : null;
      } catch { return null; }
    }

    if (handleEl) handleEl.textContent = myHandle;

    function updateNewPill(){
      if (!newPill) return;
      if (pendingNew > 0){
        newPill.textContent = '↓ ' + pendingNew + ' new';
        newPill.classList.add('on');
      } else {
        newPill.classList.remove('on');
      }
    }

    function applyRows(rows, repaint){
      const wasPinned = isPinnedToBottom(scroller);
      // A repaint (the viewer's identity just resolved) has to redraw
      // rows that are already on screen, so the append-only path and
      // its early return are both wrong for it.
      if (repaint){ lastIds = new Set(); firstFetchDone = false; }
      const seenBefore = lastIds.size;
      const incoming = rows.filter(r => !lastIds.has(r.id));
      if (!incoming.length && firstFetchDone) return;
      // Full rerender on first fetch (or empty state). Append-only on
      // subsequent fetches to preserve scroll position smoothly.
      if (!firstFetchDone || !seenBefore){
        scroller.innerHTML = rows.length
          ? rows.map(r => rowHtml(r, myHandle, ctx())).join('')
          : '<div class="chat-empty">first message lights this up. say something.</div>';
        firstFetchDone = true;
        // First paint goes to the bottom regardless of pin state.
        requestAnimationFrame(() => scrollToBottom(scroller));
      } else {
        const html = incoming.map(r => rowHtml(r, myHandle, ctx())).join('');
        scroller.insertAdjacentHTML('beforeend', html);
        if (wasPinned){
          requestAnimationFrame(() => scrollToBottom(scroller));
        } else {
          pendingNew += incoming.length;
          updateNewPill();
        }
      }
      rows.forEach(r => lastIds.add(r.id));
    }

    function renderEmptyOnce(){
      // First-fetch never resolved. Drop the "loading…" placeholder
      // so the user sees the empty-state copy instead of staring at
      // pending state. Subsequent fetches that DO succeed will paint
      // over this in applyRows.
      if (!firstFetchDone){
        scroller.innerHTML = '<div class="chat-empty">first message lights this up. say something.</div>';
        firstFetchDone = true;
      }
    }
    async function fetchFeed(){
      try {
        const headers = await authHeaders();
        const res = await fetch(ENDPOINT, headers ? { method: 'GET', headers } : { method: 'GET' });
        if (!res.ok){ renderEmptyOnce(); return; }
        const data = await res.json();
        if (!Array.isArray(data.rows)){ renderEmptyOnce(); return; }
        const nextMe = (typeof data.me === 'string' && data.me) ? data.me : null;
        const identityChanged = nextMe !== meUid;
        meUid = nextMe;
        // Joins are never rendered (2026-08-23). The server stopped
        // returning them; this filter covers any legacy row.
        applyRows(data.rows.filter(r => r.kind !== 'join'), identityChanged && firstFetchDone);
      } catch { renderEmptyOnce(); }
    }

    async function send(){
      const text = inputEl.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.classList.remove('chat-send-fail');
      try {
        const authed = await authHeaders();
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authed || {}),
          body: JSON.stringify({ handle: myHandle, text }),
        });
        if (!res.ok){
          sendBtn.classList.add('chat-send-fail');
          sendBtn.disabled = false;
          return;
        }
        const data = await res.json().catch(() => null);
        if (data && typeof data.me === 'string' && data.me) meUid = data.me;
        inputEl.value = '';
        updateCharCount();
        // Optimistically render the row from the server response so
        // the user sees their message immediately, even if the next
        // poll is several seconds away.
        if (data && data.row && !lastIds.has(data.row.id)){
          scroller.insertAdjacentHTML('beforeend', rowHtml(data.row, myHandle, ctx()));
          lastIds.add(data.row.id);
          requestAnimationFrame(() => scrollToBottom(scroller));
        }
      } catch {
        sendBtn.classList.add('chat-send-fail');
      } finally {
        sendBtn.disabled = false;
      }
    }

    function updateCharCount(){
      if (!charCountEl) return;
      const len = inputEl.value.length;
      charCountEl.textContent = len + '/' + MSG_MAX;
      charCountEl.classList.toggle('over', len > MSG_MAX);
    }

    inputEl.setAttribute('maxlength', String(MSG_MAX));
    inputEl.addEventListener('input', updateCharCount);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        send();
      }
    });
    sendBtn.addEventListener('click', send);

    if (rerollBtn){
      rerollBtn.addEventListener('click', () => {
        myHandle = pickAnonHandle();
        writeHandle(myHandle);
        if (handleEl) handleEl.textContent = myHandle;
      });
    }
    if (newPill){
      newPill.addEventListener('click', () => {
        pendingNew = 0;
        updateNewPill();
        scrollToBottom(scroller);
      });
    }
    // One delegated handler on the scroller, so it survives every
    // repaint and every appended row.
    if (canDm){
      scroller.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-dm-uid]') : null;
        if (!btn) return;
        const uid = btn.getAttribute('data-dm-uid');
        if (!uid || uid === meUid) return;
        e.preventDefault();
        onDm(uid, btn.getAttribute('data-dm-name') || 'Debater', btn.getAttribute('data-dm-photo') || '');
      });
    }

    scroller.addEventListener('scroll', () => {
      if (isPinnedToBottom(scroller)){
        pendingNew = 0;
        updateNewPill();
      }
    });

    updateCharCount();
    fetchFeed();
    // Adaptive polling: foreground at POLL_MS, background at POLL_MS_HIDDEN.
    // Tab-visibility flips swap the interval so 20-tab users stop hammering.
    let pollTimer = null;
    let stopped = false;
    function startPoll(){
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (stopped) return;
      const interval = document.hidden ? POLL_MS_HIDDEN : POLL_MS;
      pollTimer = setInterval(fetchFeed, interval);
    }
    startPoll();
    document.addEventListener('visibilitychange', () => {
      if (stopped) return;
      // Fetch once when returning to foreground so the user sees fresh msgs
      // without waiting up to a full poll interval.
      if (!document.hidden) fetchFeed();
      startPoll();
    });

    // Returned so a host page that HIDES the room rather than removing
    // it can stop the poll (/spar mounts this once and shows/hides it
    // across search states; re-init per state would leak an interval
    // and a visibilitychange listener every time). Additive: the
    // /community and /chat call sites ignore the return value.
    return {
      stop(){ stopped = true; startPoll(); },
      start(){ if (!stopped) return; stopped = false; fetchFeed(); startPoll(); },
      refresh: fetchFeed,
    };
  }

  window.DEBATEAI_CHAT = {
    init,
    pickAnonHandle,
    ensureHandle,
    HANDLE_KEY,
  };
})();
