/* Shared seat identity for casual 1v1 and host-approved 2v2 rooms. */
(function(root){
  'use strict';
  var KEYS = ['pro', 'pro2', 'con', 'con2'];
  function side(key){ return key === 'pro' || key === 'pro2' ? 'pro' : 'con'; }
  function uidField(key){ return side(key) + 'Uid' + (key.endsWith('2') ? '2' : ''); }
  function nameField(key){ return side(key) + 'Name' + (key.endsWith('2') ? '2' : ''); }
  function seats(round){
    return KEYS.map(function(key){ return { key:key, side:side(key), uid:round[uidField(key)] || '', name:round[nameField(key)] || '' }; });
  }
  function keyForUid(round, uid){
    if (!uid) return '';
    var seat = seats(round).find(function(s){ return s.uid === uid; });
    return seat ? seat.key : '';
  }
  function enabled(round){ return round.teamSize === 2 || !!(round.proUid2 || round.conUid2); }
  function full(round){
    var uids = seats(round).map(function(s){ return s.uid; });
    return uids.every(Boolean) && new Set(uids).size === 4;
  }
  function millis(value){
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && value.seconds != null) return value.seconds * 1000;
    return Number(value) || 0;
  }
  function started(round){
    var timer = round.currentTimer || {};
    return !!(round.teamLockedAt || round.ballot || round.ballotPending || round.ballotUnresolved
      || ['ballot','done','completed','cancelled','forfeit'].includes(round.status)
      || Number(round.speechIdx) > 0 || (round.speeches && round.speeches.length)
      || ['running','paused','ended'].includes(timer.state) || Number(timer.accumulatedMs) > 0
      || Object.values(round.openSegs || {}).some(function(rows){ return Array.isArray(rows) && rows.length; }));
  }
  function host(round){
    return round.teamHostUid || ([round.proUid,round.conUid].includes(round.posterUid) ? round.posterUid : round.proUid) || '';
  }
  // A seat owns one stream, including when both partners speak at once.
  // Seat keys, never names, identify consecutive utterances for merging.
  function conversationRows(round, ownUid, ownSegments){
    var rows = [], mine = keyForUid(round, ownUid);
    seats(round).forEach(function(seat){
      if (!seat.uid) return;
      var segments = seat.key === mine && ownSegments ? ownSegments : (round.openSegs || {})[seat.key];
      var live = (round.openLive || {})[seat.key] || {};
      var stamp = millis(live.updatedAtServer);
      var skew = stamp && live.updatedAtMs ? stamp - live.updatedAtMs : 0;
      (Array.isArray(segments) ? segments : []).forEach(function(seg){
        if (!seg || !seg.text || (seg.speakerUid && seg.speakerUid !== seat.uid)) return;
        rows.push({ at:(Number(seg.at)||0) + (seg.clock === 'server' ? 0 : skew), key:seat.key,
          side:seat.side, uid:seat.uid, name:seat.name || 'Anonymous', text:String(seg.text) });
      });
    });
    return rows.sort(function(a,b){ return a.at-b.at || KEYS.indexOf(a.key)-KEYS.indexOf(b.key); });
  }
  var api = {keys:KEYS,side:side,uidField:uidField,nameField:nameField,seats:seats,keyForUid:keyForUid,
    enabled:enabled,full:full,started:started,host:host,millis:millis,conversationRows:conversationRows};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBRoomTeams = api;
})(typeof window === 'undefined' ? globalThis : window);
