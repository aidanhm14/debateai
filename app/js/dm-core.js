/* ══════════════════════════════════════════════════════════════════
   dm-core.js — one engine for private threads (dm_threads/{id}/messages)

   /spar, /messages and /chat each grew their own copy of this: three
   listeners, three send paths, three sets of error strings, all subtly
   different. This is the one implementation. Pages keep their own
   markup; they get data and state from here.

   THE BUG THIS EXISTS TO FIX. A Firestore onSnapshot is DEAD after it
   errors — it does not retry, ever. The messages read rule resolves the
   parent thread doc:

       get(/databases/$(db)/documents/dm_threads/$(threadId)).data.participants

   and a thread whose doc does not exist yet cannot resolve it, so the
   listen denies. That is the normal state of every brand-new
   conversation. All three surfaces caught that error, painted "No
   messages yet. Send one to start the thread." and left the listener in
   the ground. The user then sent the first message, the write succeeded,
   and nothing was listening: their own message did not appear until they
   reloaded the page. Same shape for a peer who happened to send first,
   for a network blip, and for a quota trip.

   So the rules here are:

     · A dead listener is re-attached, not reported. Retry policy per
       failure class (see scheduleRetry), immediately after our own send
       (which is the moment reads become permitted), and on tab-visible
       and network-online, because those are the moments the answer is
       likely to have changed.
     · A sent message is on screen the instant it is sent. Optimistic
       echo with a pre-generated doc id, so the server copy replaces the
       local one exactly rather than double-printing it. A message the
       reader cannot read back (quota, denied) is still THEIR message and
       still shows.
     · A failed send stays visible and retryable. The old version cleared
       the input and left a line of error text, so the words were gone.

   USAGE

     var t = DBDM.open({
       db: firestore, uid: myUid, threadId: id,
       thread: { participants, participantInfo, isGroup, groupName, lastMessage },
       senderName: fn, senderPhoto: fn,
       onMessages: function(view){ ... },   // { messages, status, error }
       onThread:   function(data){ ... },   // thread doc, or null
     });
     t.send('text');  t.retry(id);  t.setThread(meta);  t.close();

   Each message handed to onMessages:
     { id, fromUid, fromName, text, at, mine, pending, failed, error }
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.DBDM) return;

  var MSG_MAX = 1000;

  // Codes worth retrying fast: the connection went away, not the answer.
  var TRANSIENT = {
    'unavailable': 1, 'internal': 1, 'cancelled': 1, 'aborted': 1,
    'deadline-exceeded': 1, 'unknown': 1,
  };

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') { try { return ts.toMillis(); } catch (e) { return 0; } }
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    return 0;
  }

  function preview(text) {
    return text.length > 80 ? text.slice(0, 77) + '…' : text;
  }

  // Human sentence for a failure, used by every surface so the three
  // pages stop inventing their own wording for the same condition.
  function reason(err) {
    var code = (err && err.code) || '';
    if (code === 'resource-exhausted') {
      return 'The daily data budget is used up. Sending still works; reading returns after midnight Pacific.';
    }
    if (code === 'permission-denied') return 'You do not have access to this thread.';
    if (TRANSIENT[code] || code === 'unavailable') return 'Connection lost. Reconnecting…';
    return 'Could not load messages right now.' + (code ? ' (' + code + ')' : '');
  }

  function open(opts) {
    var db = opts.db;
    var uid = opts.uid;
    var threadId = opts.threadId;
    var meta = opts.thread || {};
    var nameOf = opts.senderName || function () { return 'Debater'; };
    var photoOf = opts.senderPhoto || function () { return ''; };
    var onMessages = opts.onMessages || function () {};
    var onThread = opts.onThread || function () {};
    var maxLen = opts.maxLength || MSG_MAX;

    if (!db || !uid || !threadId) return null;

    var threadRef = db.collection('dm_threads').doc(threadId);
    var msgsRef = threadRef.collection('messages');

    var closed = false;
    var server = [];            // confirmed, ascending
    var serverIds = {};
    var local = [];             // optimistic: pending / sent / failed
    var status = 'loading';     // loading | ready | error | quota
    var lastError = null;
    // Best evidence the thread doc exists. Starts from the caller's
    // hydrated lastMessage; a permission-denied with no evidence is a
    // brand-new conversation, not a locked door.
    var threadKnown = !!meta.lastMessage;

    var msgUnsub = null, docUnsub = null;
    var msgTimer = null, docTimer = null;
    var msgTries = 0, docTries = 0;

    // ── retry policy ────────────────────────────────────────────────
    // A denied listen on a thread nobody has written to yet is cheap and
    // expected, so it re-arms on a slow cadence: the peer may send the
    // first message while this modal sits open, and without the re-arm
    // that message never arrives.
    function delayFor(code, tries) {
      if (code === 'permission-denied') {
        return [8000, 15000, 30000][tries] || 60000;
      }
      if (code === 'resource-exhausted') return 60000;
      return Math.min(1000 * Math.pow(2, tries), 30000);
    }

    function scheduleRetry(which, code) {
      if (closed) return;
      var tries = which === 'msg' ? msgTries++ : docTries++;
      var wait = delayFor(code, tries);
      var t = setTimeout(function () {
        if (closed) return;
        if (which === 'msg') { msgTimer = null; listenMessages(); }
        else { docTimer = null; listenThread(); }
      }, wait);
      if (which === 'msg') msgTimer = t; else docTimer = t;
    }

    function clearTimer(which) {
      if (which === 'msg' && msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
      if (which === 'doc' && docTimer) { clearTimeout(docTimer); docTimer = null; }
    }

    // ── view assembly ───────────────────────────────────────────────
    // Server messages first (query order), then any local ones the
    // server has not echoed back. The pre-generated id is what makes
    // that de-duplication exact rather than a text-and-timestamp guess.
    function view() {
      var out = server.slice();
      for (var i = 0; i < local.length; i++) {
        if (!serverIds[local[i].id]) out.push(local[i]);
      }
      return { messages: out, status: status, error: lastError, threadExists: threadKnown };
    }

    function emit() {
      if (closed) return;
      try { onMessages(view()); } catch (e) { console.warn('[dm] render failed', e); }
    }

    // ── messages listener ───────────────────────────────────────────
    function listenMessages() {
      if (closed) return;
      clearTimer('msg');
      if (msgUnsub) { try { msgUnsub(); } catch (e) {} msgUnsub = null; }
      msgUnsub = msgsRef.orderBy('createdAt', 'asc').limitToLast(200)
        .onSnapshot(function (snap) {
          msgTries = 0;
          threadKnown = true;
          server = [];
          serverIds = {};
          snap.forEach(function (doc) {
            var m = doc.data() || {};
            // createdAt is null on the latency-compensated echo of our
            // own write. Fall back to the local stamp so a just-sent
            // message is not briefly timeless.
            var at = toMillis(m.createdAt);
            if (!at) {
              for (var j = 0; j < local.length; j++) {
                if (local[j].id === doc.id) { at = local[j].at; break; }
              }
            }
            server.push({
              id: doc.id,
              fromUid: m.fromUid || '',
              fromName: m.fromName || '',
              text: m.text || '',
              at: at || Date.now(),
              mine: m.fromUid === uid,
              pending: false,
              failed: false,
            });
            serverIds[doc.id] = 1;
          });
          // Drop locals the server has now confirmed.
          local = local.filter(function (m) { return !serverIds[m.id] || m.failed; });
          status = 'ready';
          lastError = null;
          emit();
        }, function (err) {
          var code = (err && err.code) || '';
          msgUnsub = null;
          lastError = err;
          if (code === 'permission-denied' && !threadKnown) {
            // The normal first-conversation state. Empty, not broken.
            status = 'ready';
            lastError = null;
          } else if (code === 'resource-exhausted') {
            status = 'quota';
          } else {
            status = 'error';
          }
          emit();
          scheduleRetry('msg', code);
        });
    }

    // ── thread doc listener (read receipts, unread, existence) ──────
    function listenThread() {
      if (closed) return;
      clearTimer('doc');
      if (docUnsub) { try { docUnsub(); } catch (e) {} docUnsub = null; }
      docUnsub = threadRef.onSnapshot(function (doc) {
        docTries = 0;
        if (!doc.exists) { try { onThread(null); } catch (e) {} return; }
        var d = doc.data() || {};
        if (!threadKnown) {
          // The thread just came into existence, which means the
          // messages listen that denied earlier would succeed now.
          threadKnown = true;
          if (!msgUnsub) listenMessages();
        }
        meta.lastMessage = d.lastMessage || meta.lastMessage || '';
        if (d.participantInfo) meta.participantInfo = d.participantInfo;
        try { onThread(d); } catch (e) {}
      }, function (err) {
        docUnsub = null;
        scheduleRetry('doc', (err && err.code) || '');
      });
    }

    // ── send ────────────────────────────────────────────────────────
    // The thread doc is written first because the message rule resolves
    // the participants off it; the message write of a brand-new thread
    // would deny without it. The id is generated up front so the
    // optimistic bubble and the server document are the same object.
    function write(entry) {
      var text = entry.text;
      var pInfo = Object.assign({}, meta.participantInfo || {});
      pInfo[uid] = { name: nameOf(), photo: photoOf() || '' };
      var unread = {};
      (meta.participants || []).forEach(function (u) {
        unread[u] = (u === uid) ? 0 : firebase.firestore.FieldValue.increment(1);
      });
      var doc = {
        participants: meta.participants || [],
        participantInfo: pInfo,
        lastMessage: entry.preview || preview(text),
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessageFrom: uid,
        unread: unread,
      };
      if (meta.isGroup) { doc.isGroup = true; doc.groupName = meta.groupName || 'Group'; }

      return threadRef.set(doc, { merge: true }).then(function () {
        // Reads are permitted from this point. If the listener died on
        // an empty thread, this is the moment to bring it back — before
        // the message write, so the echo arrives through the listener.
        var wasNew = !threadKnown;
        threadKnown = true;
        meta.lastMessage = doc.lastMessage;
        if (wasNew || !msgUnsub) listenMessages();
        if (!docUnsub) listenThread();
        return msgsRef.doc(entry.id).set({
          fromUid: uid,
          fromName: nameOf(),
          text: text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
    }

    function send(text, sendOpts) {
      sendOpts = sendOpts || {};
      text = (text || '').trim();
      if (!text) return Promise.resolve(null);
      if (text.length > maxLen) text = text.slice(0, maxLen);
      var first = !meta.lastMessage && !meta.isGroup;
      var entry = {
        id: msgsRef.doc().id,
        fromUid: uid,
        fromName: nameOf(),
        text: text,
        at: Date.now(),
        mine: true,
        pending: true,
        failed: false,
        // Inbox preview. Defaults to the first 80 characters; a
        // structured message (a scheduling proposal) passes its own so
        // the thread list reads as a line rather than a paragraph.
        preview: sendOpts.preview || '',
      };
      local.push(entry);
      emit();                                  // on screen before the network
      return write(entry).then(function () {
        entry.pending = false;
        emit();
        return { id: entry.id, first: first, preview: entry.preview || preview(text) };
      }).catch(function (err) {
        entry.pending = false;
        entry.failed = true;
        entry.error = err;
        emit();
        throw err;
      });
    }

    function retry(id) {
      var entry = null;
      for (var i = 0; i < local.length; i++) if (local[i].id === id) entry = local[i];
      if (!entry || entry.pending) return Promise.resolve(null);
      entry.failed = false;
      entry.pending = true;
      entry.error = null;
      emit();
      return write(entry).then(function () {
        entry.pending = false;
        emit();
        return { id: entry.id, first: false };
      }).catch(function (err) {
        entry.pending = false;
        entry.failed = true;
        entry.error = err;
        emit();
        throw err;
      });
    }

    function discard(id) {
      local = local.filter(function (m) { return m.id !== id; });
      emit();
    }

    // Zero my unread. A plain update() throws not-found on a thread doc
    // that does not exist yet, which is every brand-new conversation.
    function markRead() {
      if (!threadKnown) return Promise.resolve();
      var u = {};
      u['unread.' + uid] = 0;
      return threadRef.update(u).catch(function () {});
    }

    function wake() {
      if (closed) return;
      // Something changed outside the tab (came back, came online).
      // Anything sitting on a retry timer should try now instead.
      if (!msgUnsub && msgTimer) { clearTimer('msg'); msgTries = 0; listenMessages(); }
      if (!docUnsub && docTimer) { clearTimer('doc'); docTries = 0; listenThread(); }
    }

    function onVisible() { if (!document.hidden) wake(); }

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', wake);

    function close() {
      closed = true;
      clearTimer('msg'); clearTimer('doc');
      if (msgUnsub) { try { msgUnsub(); } catch (e) {} msgUnsub = null; }
      if (docUnsub) { try { docUnsub(); } catch (e) {} docUnsub = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', wake);
    }

    listenMessages();
    listenThread();
    emit();

    return {
      id: threadId,
      send: send,
      retry: retry,
      discard: discard,
      markRead: markRead,
      close: close,
      view: view,
      meta: function () { return meta; },
      setThread: function (m) { Object.assign(meta, m || {}); },
    };
  }

  // Scroll helpers. Every surface used to slam the feed to the bottom on
  // every repaint, which yanks the page out from under someone reading
  // back through a thread while the other side is typing.
  function nearBottom(el, slack) {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= (slack || 80);
  }

  // Wording for a send that did not land. Kept next to reason() so the
  // three surfaces stop each inventing their own sentence for the same
  // condition.
  function sendReason(err) {
    var code = (err && err.code) || '';
    if (code === 'resource-exhausted') {
      return 'Did not send: the daily data budget is used up. Try after midnight Pacific.';
    }
    if (code === 'permission-denied') return 'Did not send: you cannot post in this thread.';
    return 'Message did not send' + (code ? ' (' + code + ')' : '') + '. Tap it to retry.';
  }

  window.DBDM = {
    open: open,
    reason: reason,
    sendReason: sendReason,
    nearBottom: nearBottom,
    MSG_MAX: MSG_MAX,
  };
})();
