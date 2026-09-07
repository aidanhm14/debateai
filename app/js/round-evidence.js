(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoundEvidence = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  // Timer entries, transcript placeholders and speaker labels are not speech.
  // Keep this identical for the browser fallback, server panel and ledgers.
  function hasWords(text){
    if (typeof text !== 'string') return false;
    var clean = text.replace(/\[(?:TIME EXPIRED|OVERRAN)[^\]]*\][\s\S]*$/i, '')
      .replace(/[\[(]\s*(?:skipped|no transcript(?: captured)?|no speech(?: detected)?|inaudible|unintelligible|silence|silent|music|applause)\s*[\])]/gi, '').trim();
    return !/^(?:skipped|no transcript(?: captured)?|no speech(?: detected)?|inaudible|unintelligible|silence|silent)$/i.test(clean)
      && /[\p{L}\p{N}]/u.test(clean);
  }

  function sideOf(side){
    var s = String(side || '').toLowerCase();
    if (/^(pro|prop|gov|aff|og|cg)$/.test(s)) return 'pro';
    if (/^(con|opp|neg|oo|co)$/.test(s)) return 'con';
    return null;
  }

  function assess(round){
    round = round || {};
    var spoke = { pro: false, con: false };
    (Array.isArray(round.speeches) ? round.speeches : []).forEach(function(s){
      if (!s || s.skipped) return;
      if (s.open || /^(open|conversation)$/.test(String(round.format || '').toLowerCase())){
        // A conversation is stored as ONE entry containing both labelled
        // sides. The entry's side is only a timer owner, not its speaker.
        var side = null, text = '';
        function flush(){ if (side && hasWords(text)) spoke[side] = true; }
        String(s.text || '').split('\n').forEach(function(line){
          var match = line.match(/^\s*[^\n]*?\(([^)]+)\):\s*(.*)$/i);
          if (match){ flush(); side = sideOf(match[1]); text = match[2]; }
          else if (side) text += '\n' + line;
        });
        flush();
      } else {
        var side = sideOf(s.side);
        if (side && hasWords(s.text)) spoke[side] = true;
      }
    });
    var ok = spoke.pro && spoke.con;
    return { ok: ok, pro: spoke.pro, con: spoke.con,
      reason: ok ? '' : (!spoke.pro && !spoke.con ? 'no_speech' : 'missing_side_speech') };
  }

  function noContest(round, now){
    var evidence = assess(round);
    return { outcome: 'no_contest', resolution: evidence.reason || 'no_speech', winner: null,
      at: now || Date.now(),
      reason: !evidence.pro && !evidence.con
        ? 'No speech was captured. There is nothing to judge.'
        : 'Speech was not captured from both sides. A transcript from each side is needed to decide a winner.' };
  }

  return { hasWords: hasWords, assess: assess, noContest: noContest };
});
