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
 *   - The same handle is what visitor-tick uses for the "X just
 *     joined!" line, so the chat avatar and the join event match.
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
 */
(function(){
  'use strict';

  const ENDPOINT = '/api/chat-feed';
  const HANDLE_KEY = 'da-chat-handle';
  const POLL_MS = 8000;
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

  function rowHtml(row, myHandle){
    if (row.kind === 'join'){
      return '<div class="chat-row chat-join">'
        + '<span class="chat-join-name">' + escHtml(row.handle || 'Anonymous') + '</span>'
        + ' <span class="chat-join-verb">just joined.</span>'
        + '</div>';
    }
    const mine = row.handle && myHandle && row.handle === myHandle;
    return '<div class="chat-row chat-msg' + (mine ? ' chat-msg-mine' : '') + '" data-handle="' + escHtml(row.handle) + '">'
      + '<div class="chat-msg-head">'
      +   '<span class="chat-msg-handle">' + escHtml(row.handle || 'anon') + '</span>'
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
    if (!scroller || !inputEl || !sendBtn) return;

    let myHandle = ensureHandle();
    let lastIds = new Set();
    let pendingNew = 0;
    let firstFetchDone = false;

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

    function applyRows(rows){
      const wasPinned = isPinnedToBottom(scroller);
      const seenBefore = lastIds.size;
      const incoming = rows.filter(r => !lastIds.has(r.id));
      if (!incoming.length && firstFetchDone) return;
      // Full rerender on first fetch (or empty state). Append-only on
      // subsequent fetches to preserve scroll position smoothly.
      if (!firstFetchDone || !seenBefore){
        scroller.innerHTML = rows.length
          ? rows.map(r => rowHtml(r, myHandle)).join('')
          : '<div class="chat-empty">first message lights this up. say something.</div>';
        firstFetchDone = true;
        // First paint goes to the bottom regardless of pin state.
        requestAnimationFrame(() => scrollToBottom(scroller));
      } else {
        const html = incoming.map(r => rowHtml(r, myHandle)).join('');
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
        const res = await fetch(ENDPOINT, { method: 'GET' });
        if (!res.ok){ renderEmptyOnce(); return; }
        const data = await res.json();
        if (!Array.isArray(data.rows)){ renderEmptyOnce(); return; }
        applyRows(data.rows);
      } catch { renderEmptyOnce(); }
    }

    async function send(){
      const text = inputEl.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.classList.remove('chat-send-fail');
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: myHandle, text }),
        });
        if (!res.ok){
          sendBtn.classList.add('chat-send-fail');
          sendBtn.disabled = false;
          return;
        }
        const data = await res.json().catch(() => null);
        inputEl.value = '';
        updateCharCount();
        // Optimistically render the row from the server response so
        // the user sees their message immediately, even if the next
        // poll is several seconds away.
        if (data && data.row && !lastIds.has(data.row.id)){
          scroller.insertAdjacentHTML('beforeend', rowHtml(data.row, myHandle));
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
    scroller.addEventListener('scroll', () => {
      if (isPinnedToBottom(scroller)){
        pendingNew = 0;
        updateNewPill();
      }
    });

    updateCharCount();
    fetchFeed();
    setInterval(fetchFeed, POLL_MS);
  }

  window.DEBATEAI_CHAT = {
    init,
    pickAnonHandle,
    ensureHandle,
    HANDLE_KEY,
  };
})();
