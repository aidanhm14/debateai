/* Versioned casual speech plans. Saved or running rounds keep their own plan. */
(function(){
  var defaults = [240, 240, 180, 180, 120, 120];
  var legacy = [300, 300, 180, 180];
  function normalize(value){
    if (!value || value.version !== 1 || !Array.isArray(value.seconds) || value.seconds.length !== 6) return null;
    if (!value.seconds.every(function(n){ return Number.isInteger(n) && n >= 60 && n <= 600 && n % 30 === 0; })) return null;
    if (value.seconds[0] !== value.seconds[1] || value.seconds[2] !== value.seconds[3] || value.seconds[4] !== value.seconds[5]) return null;
    return { version:1, seconds:value.seconds.slice() };
  }
  function started(d){
    d = d || {};
    var t = d.currentTimer || {};
    return Number(d.speechIdx) > 0 || !!(d.speeches && d.speeches.length) || !!d.ballot || !!d.ballotPending
      || d.status === 'ballot' || d.status === 'ended' || d.status === 'completed' || d.status === 'done' || d.status === 'forfeit'
      || !!d.teamLockedAt || t.state === 'running' || t.state === 'paused' || t.state === 'ended'
      || Number(t.startMs) > 0 || Number(t.accumulatedMs) > 0;
  }
  function fixed(d){ return !!(d && (d.tournamentId || d.tournamentRound || d.tournament)); }
  function team(d){ return !!(d && (d.teamSize === 2 || d.proUid2 || d.conUid2)); }
  function forRound(d){
    if (team(d)) return legacy.slice();
    var saved = normalize(d && d.speechTiming);
    if (saved) return saved.seconds;
    return d && d.format === 'quick' && (started(d) || fixed(d)) ? legacy.slice() : defaults.slice();
  }
  function speeches(seconds){
    var six = seconds.length === 6;
    return seconds.map(function(n, i){
      var side = i % 2 ? 'con' : 'pro';
      var part = !six && i === 1 ? 'Opening and response' : i < 2 ? 'Opening' : six && i < 4 ? 'Response' : 'Closing';
      return {code:(side === 'pro' ? 'P' : 'C') + (Math.floor(i / 2) + 1), name:part + ' (' + (side === 'pro' ? 'For' : 'Against') + ')', side:side, time:n};
    });
  }
  // A transaction reads the current room, so a late settings save cannot
  // rewrite a clock that the other person has already started.
  function save(db, ref, uid, value, chooseTimed, lock){
    var plan = normalize(value);
    if (!plan) return Promise.reject(new Error('Choose 1 to 10 minutes for each speech.'));
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        if (!snap || !snap.exists) throw new Error('The room is still connecting. Try again.');
        var d = snap.data() || {};
        if (!uid || [d.proUid, d.conUid, d.proUid2, d.conUid2, d.posterUid].indexOf(uid) < 0) throw new Error('Only people in this round can change its timing.');
        if (started(d) || d.speechTimingLocked) throw new Error('The round has started. Its timing is locked.');
        if (fixed(d)) throw new Error('The tournament fixes the timing.');
        if (team(d)) throw new Error('Team rounds keep their existing speech timing.');
        if (d.format && d.format !== 'quick' && d.format !== 'open') throw new Error('This round keeps its existing timing.');
        // Start chooses/locks the latest shared schedule, not a caller's
        // stale DOM fields. Only an explicit duration edit replaces it.
        var chosen = chooseTimed || lock ? normalize(d.speechTiming) || {version:1,seconds:defaults.slice()} : plan;
        var update = {speechTiming:chosen};
        if (!lock) update.preRoundReady = {};
        if (chooseTimed) update.format = 'quick';
        if (lock) update.speechTimingLocked = true;
        tx.update(ref, update);
        return chosen;
      });
    });
  }
  window.DBRoundTiming = { defaults:function(){ return defaults.slice(); }, normalize:normalize, started:started,
    forRound:forRound, speeches:speeches, save:save };
})();
