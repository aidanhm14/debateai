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

  // 2026-09-07: a conversation round labels its lines with the format's
  // SIDE LABELS ("Jonas (For):", "Phat (Against):"), and this only knew
  // the bench keys. Both sides resolved to null, an eleven-minute round
  // with live AI notes read as silence, and the judge was never called.
  // The reader now accepts every label the formats print and, for a
  // conversation, falls back to the seat NAMES on the round.
  function sideOf(side){
    var s = String(side || '').toLowerCase().trim();
    if (/^(pro|prop|proposition|gov|government|aff|affirmative|for|og|cg)$/.test(s)) return 'pro';
    if (/^(con|contra|opp|opposition|neg|negative|against|oo|co)$/.test(s)) return 'con';
    return null;
  }

  function nameSide(name, round){
    var n = String(name || '').toLowerCase().trim();
    if (!n) return null;
    var pro = String(round.proName || '').toLowerCase().trim();
    var con = String(round.conName || '').toLowerCase().trim();
    if (pro && n === pro && n !== con) return 'pro';
    if (con && n === con && n !== pro) return 'con';
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
          var match = line.match(/^\s*([^\n]*?)\(([^)]+)\):\s*(.*)$/i);
          if (match){
            flush();
            side = sideOf(match[2]) || nameSide(match[1], round);
            text = match[3];
          }
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
