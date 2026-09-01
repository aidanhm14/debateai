/* ── DBFriends: the friend graph engine (2026-08-31) ──────────────────
   One doc per pair in `friendships/{a_b}` (sorted uids joined by '_',
   the dm_threads convention). The doc's `state` map carries each side's
   own consent and NOTHING else decides the relationship:
     state[a]=='accepted' && state[b]=='accepted'  -> friends
     only requester accepted                       -> pending
   Declining or unfriending is deleting the doc. firestore.rules holds
   the own-key guard, so neither side can ever write the other's half;
   this module can therefore be trusted only as far as any client code,
   which is exactly as far as it needs to be.

   Like dm-core, this engine renders nothing. Pages call init() with the
   compat db + uid, then watch() for a live view:
     { friends: [row], incoming: [row], outgoing: [row], status }
   where row = { pairId, otherUid, otherName, doc }.

   Presence is deliberately NOT a heartbeat: availableNow() reads the
   friend's own matchmaking_queue doc (signed-in read is allowed), which
   means "they have the Available pill on / are in the queue right now".
   That is the only honest per-uid signal on the site; a green dot that
   claims more would be lying (see the 2026-08-31 recon in soul.md). */
(function () {
  'use strict';

  var db = null, uid = null;
  var unsub = null, cbs = [], last = { friends: [], incoming: [], outgoing: [], status: 'idle' };

  function pairIdFor(a, b) {
    var p = [String(a), String(b)].sort();
    return p[0] + '_' + p[1];
  }

  function rowFrom(doc) {
    var d = doc.data() || {};
    var uids = d.uids || [];
    var other = uids[0] === uid ? uids[1] : uids[0];
    var names = d.names || {};
    return {
      pairId: doc.id,
      otherUid: other,
      otherName: names[other] || 'A debater',
      requestedBy: d.requestedBy || '',
      doc: d,
    };
  }

  function classify(snap) {
    var friends = [], incoming = [], outgoing = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      var st = d.state || {};
      var row = rowFrom(doc);
      if (!row.otherUid) return;
      var mine = st[uid] === 'accepted';
      var theirs = st[row.otherUid] === 'accepted';
      if (mine && theirs) friends.push(row);
      else if (theirs && !mine) incoming.push(row);
      else if (mine && !theirs) outgoing.push(row);
    });
    // Ignored-request hint lives client-side only: hiding is not a
    // server state, so a repeat request resurfaces after a real accept
    // elsewhere. Cheap and honest.
    var ignored = ignoredSet();
    incoming = incoming.filter(function (r) { return !ignored[r.otherUid]; });
    return { friends: friends, incoming: incoming, outgoing: outgoing, status: 'ready' };
  }

  function ignoredSet() {
    try {
      var arr = JSON.parse(localStorage.getItem('da-friend-ignored') || '[]');
      var m = {}; arr.forEach(function (u) { m[u] = 1; }); return m;
    } catch (e) { return {}; }
  }
  function ignore(otherUid) {
    try {
      var arr = JSON.parse(localStorage.getItem('da-friend-ignored') || '[]');
      if (arr.indexOf(otherUid) === -1) arr.push(otherUid);
      localStorage.setItem('da-friend-ignored', JSON.stringify(arr.slice(-100)));
    } catch (e) {}
    emit();
  }

  function emit() {
    cbs.forEach(function (cb) { try { cb(last); } catch (e) {} });
  }

  function init(opts) {
    db = opts.db; uid = opts.uid;
    if (!db || !uid) return false;
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    // array-contains on uids matches the read rule's `uid in resource.data.uids`,
    // so the query is provable and allowed. No orderBy -> no composite index.
    unsub = db.collection('friendships')
      .where('uids', 'array-contains', uid)
      .onSnapshot(function (snap) {
        last = classify(snap);
        emit();
      }, function (err) {
        last = { friends: [], incoming: [], outgoing: [], status: 'error', error: err };
        emit();
        // Same posture as dm-core: a dead listener is re-attached, not
        // reported. Denials here mean signed-out or anonymous; retry slow.
        setTimeout(function () { if (db && uid) init({ db: db, uid: uid }); }, 20000);
      });
    return true;
  }

  function watch(cb) {
    cbs.push(cb);
    try { cb(last); } catch (e) {}
    return function () { cbs = cbs.filter(function (c) { return c !== cb; }); };
  }

  function statusWith(otherUid) {
    var id = pairIdFor(uid, otherUid);
    function has(list) { return list.some(function (r) { return r.pairId === id; }); }
    if (has(last.friends)) return 'friends';
    if (has(last.incoming)) return 'incoming';
    if (has(last.outgoing)) return 'outgoing';
    return 'none';
  }

  function request(otherUid, otherName, myName) {
    if (!db || !uid || !otherUid || otherUid === uid) return Promise.reject(new Error('bad-target'));
    var pair = [uid, String(otherUid)].sort();
    var id = pair[0] + '_' + pair[1];
    var st = {}; st[uid] = 'accepted';
    var names = {};
    names[uid] = myName || 'A debater';
    names[otherUid] = otherName || 'A debater';
    return db.collection('friendships').doc(id).set({
      uids: pair,
      requestedBy: uid,
      state: st,
      names: names,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function accept(otherUid, myName) {
    var id = pairIdFor(uid, otherUid);
    var u = {};
    u['state.' + uid] = 'accepted';
    u['names.' + uid] = myName || 'A debater';
    u['acceptedAt'] = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection('friendships').doc(id).update(u);
  }

  function remove(otherUid) {
    var id = pairIdFor(uid, otherUid);
    return db.collection('friendships').doc(id).delete();
  }

  /* "Available now": one doc read against the friend's own queue doc.
     True only while they hold the Available pill / sit in the queue,
     which is the same 6-minute window /api/live-now trusts. */
  function availableNow(otherUid) {
    if (!db) return Promise.resolve(false);
    return db.collection('matchmaking_queue').doc(String(otherUid)).get()
      .then(function (snap) {
        if (!snap.exists) return false;
        var d = snap.data() || {};
        if (d.status !== 'waiting') return false;
        var t = d.joinedAt && d.joinedAt.toMillis ? d.joinedAt.toMillis() : 0;
        return (Date.now() - t) < 6 * 60 * 1000;
      })
      .catch(function () { return false; });
  }

  window.DBFriends = {
    init: init,
    watch: watch,
    request: request,
    accept: accept,
    remove: remove,
    ignore: ignore,
    statusWith: statusWith,
    availableNow: availableNow,
    pairIdFor: pairIdFor,
  };
})();
