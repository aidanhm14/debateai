(function(root){
  'use strict';
  function matchedEntry(search){
    var q = new URLSearchParams(search);
    return !q.has('design') && !q.has('stage') && !q.has('spectate') &&
      (q.get('source') || '').indexOf('spar') === 0 &&
      !!q.get('room') && !!q.get('proUid') && !!q.get('conUid');
  }
  if (typeof module === 'object' && module.exports) module.exports = { matchedEntry: matchedEntry };
  if (!root.document) return;
  var doc = root.document, pending = matchedEntry(root.location.search);
  // Presentation only. Auth and the saved room still decide who can enter
  // and whether this is setup, an ongoing round, or an existing decision.
  if (pending) doc.documentElement.classList.add('lr-room-loading');
  function status(message){
    if (!pending) return;
    var node = doc.getElementById('roomEntryMessage');
    if (node) node.textContent = message;
  }
  root.DBRoomEntry = {
    prepare: function(){
      if (!pending) return;
      var round = doc.getElementById('roundView');
      if (round) { round.inert = true; round.setAttribute('aria-busy', 'true'); }
      var message = doc.getElementById('roomEntryStatus');
      if (message) message.hidden = false;
      var motion = doc.getElementById('rmbMotion');
      if (motion) motion.textContent = 'Your debate room';
      var call = doc.getElementById('callSub');
      if (call) call.textContent = 'Connecting to your round. Your camera and microphone controls will appear here.';
      var phase = doc.getElementById('phaseLabel');
      if (phase) phase.textContent = 'Joining round';
    },
    status: status,
    finish: function(){
      if (!pending) return;
      pending = false;
      var round = doc.getElementById('roundView');
      if (round) { round.inert = false; round.removeAttribute('aria-busy'); }
      var message = doc.getElementById('roomEntryStatus');
      if (message) message.hidden = true;
      doc.documentElement.classList.remove('lr-room-loading');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
