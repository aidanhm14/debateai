/* Ready means agreement to the exact topic, sides, mode and speech plan shown. */
(function(){
  function eligible(d){
    return !!(d && ['open','quick'].includes(d.format) && d.proUid && d.conUid && d.proUid !== d.conUid
      && !d.proUid2 && !d.conUid2 && d.teamSize !== 2 && !d.tournamentId && !d.tournamentRound && !d.tournament);
  }
  function signature(d){
    d = d || {};
    var judges = d.judgePicks || {};
    return JSON.stringify([d.format, d.motion || '', d.background || '', d.proUid, d.conUid,
      d.format === 'quick' ? DBRoundTiming.forRound(d) : [],
      judges.pro || 'chair', judges.con || 'chair', d.contextFrame || '']);
  }
  function ready(d, uid){ return !!(uid && d && d.preRoundReady && d.preRoundReady[uid] === signature(d)); }
  function bothReady(d){ return eligible(d) && ready(d,d.proUid) && ready(d,d.conUid); }
  function pending(d){
    if (!String(d.motion || '').trim()) return 'Choose a topic first.';
    if ((d.draft && !['done','cancelled'].includes(d.draft.phase))
        || (d.topicStrikes && !['done','cancelled'].includes(d.topicStrikes.phase))) return 'Finish choosing the topic and sides first.';
    if (d.motionProposal || d.sideSwap) return 'Agree or cancel the pending topic or side change first.';
    var j = d.judgePicks || {};
    if ((j.pro || 'chair') !== (j.con || 'chair')) return 'Agree on the judge before getting ready.';
    return '';
  }
  function act(db, ref, uid, action, expected, mode, timestamp){
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        if (!snap || !snap.exists) throw new Error('The room is still connecting. Try again.');
        var d = snap.data();
        if (!eligible(d) || [d.proUid,d.conUid].indexOf(uid) < 0) throw new Error('Only the two people in this round can choose and get ready.');
        if (DBRoundTiming.started(d)) throw new Error('The round has already started.');
        if (signature(d) !== expected) throw new Error('The round settings changed. Review them and click Ready again.');
        var patch = {};
        if (action === 'mode'){
          if (!['open','quick'].includes(mode)) throw new Error('Choose conversation or timed speeches.');
          if (d.speechTimingLocked) throw new Error('The round has started. Its mode is locked.');
          patch.format = mode;
          if (d.format !== mode) patch.preRoundReady = {};
        } else if (action === 'ready' || action === 'unready'){
          if (action === 'ready' && pending(d)) throw new Error(pending(d));
          patch.preRoundReady = Object.assign({}, d.preRoundReady || {});
          patch.preRoundReady[uid] = action === 'ready' ? expected : '';
        } else if (action === 'start'){
          if (pending(d)) throw new Error(pending(d));
          if (!bothReady(d)) throw new Error('Both people need to click Ready before starting.');
          if (d.format === 'quick' && uid !== d.proUid) throw new Error('The person arguing For starts the first speech.');
          var now = Date.now();
          if (d.format === 'quick'){
            patch.speechTiming = DBRoundTiming.normalize(d.speechTiming) || {version:1,seconds:DBRoundTiming.defaults()};
            patch.speechTimingLocked = true;
          }
          patch.currentTimer = {speechIdx:0,state:'running',startMs:now,accumulatedMs:0,
            totalSec:d.format === 'open' ? 3600 : patch.speechTiming.seconds[0],updatedAtMs:now};
          if (timestamp) patch.currentTimer.updatedAtServer = timestamp();
        } else throw new Error('Unknown round action.');
        tx.update(ref,patch);
        return Object.assign({},d,patch);
      });
    });
  }
  window.DBRoundStart = {eligible:eligible,signature:signature,ready:ready,bothReady:bothReady,pending:pending,act:act};
})();
