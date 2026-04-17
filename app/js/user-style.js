/* Debate-style profile system.
 *
 * Two data sources feed one profile:
 *   1. "silent"    — observed from the user's actual messages over time
 *                    (length, jargon usage, concession rate, specificity).
 *   2. "questionnaire" — explicit answers the user gives via the style modal
 *                    (experience level, preferred format, voice, goals).
 *
 * The combined profile renders into a short directive block that we prepend
 * to every AI call via the {{userStyle}} template slot in prompts.mjs.
 *
 * Storage: localStorage for everyone, with a hook point for Firestore sync
 * once we have signed-in users.
 *
 * Exposed on window as:
 *   window.DebateStyle.getProfile()
 *   window.DebateStyle.setProfile(partial)
 *   window.DebateStyle.submitQuestionnaire(answers)
 *   window.DebateStyle.captureMessage(text, ctx)
 *   window.DebateStyle.buildUserStyleBlock()  -> string
 *   window.DebateStyle.hasMeaningfulProfile() -> bool
 *   window.DebateStyle.reset()
 */
(function(){
  'use strict';

  var STORAGE_KEY = 'debateos-style-profile-v1';
  var LEGACY_KEYS = []; // reserved for future migrations
  var MIN_MSGS_FOR_SIGNAL = 3;

  /* ───────────────────── storage ─────────────────────── */
  function blankProfile(){
    return {
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      questionnaire: null,   // populated by the style modal
      silent: {              // populated by captureMessage()
        msgCount: 0,
        totalChars: 0,
        totalSentences: 0,
        jargonHits: 0,
        concessionHits: 0,
        properNounHits: 0,
        yearHits: 0,
        allcapsHits: 0,
        recentTopics: [],
      },
    };
  }

  function readProfile(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankProfile();
      var p = JSON.parse(raw);
      if (!p || p.version !== 1) return blankProfile();
      // Defensive: ensure required sub-objects exist even if older data.
      if (!p.silent) p.silent = blankProfile().silent;
      return p;
    } catch(e){
      return blankProfile();
    }
  }

  function writeProfile(p){
    try {
      p.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch(e){ /* localStorage can throw in private mode; profile is best-effort */ }
  }

  /* ───────────────────── public API ─────────────────────── */
  function getProfile(){ return readProfile(); }

  function setProfile(partial){
    var p = readProfile();
    // Shallow merge of top-level fields; caller is responsible for internal shape.
    for (var k in partial){ if (Object.prototype.hasOwnProperty.call(partial,k)) p[k] = partial[k]; }
    writeProfile(p);
    return p;
  }

  function submitQuestionnaire(answers){
    var p = readProfile();
    p.questionnaire = Object.assign({}, p.questionnaire || {}, answers, { completedAt: Date.now() });
    writeProfile(p);
    return p;
  }

  function reset(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  }

  /* ───────────────────── silent signal extraction ─────────────────────── */
  // Lightweight heuristics — no NLP libs, just pattern counts. Over many messages
  // these converge into a decent profile of how the user actually debates.
  var JARGON_TERMS = [
    'warrant','impact','framework','framer','weigh','weighing','uniqueness','link','counterplan','kritik',
    'perm','permutation','topicality','extend','spike','impact calculus','timeframe','probability',
    'magnitude','counterfactual','steelman','opp','aff','gov','neg','pmr','loc','mg','mo','pmc','lor',
    'a2','apda','npda','worlds','bp','pf','policy','point of information','poi','cross-ex',
    'revealed preference','overton window','median voter','network effects','moral hazard',
  ];
  var CONCESSION_PATTERNS = [
    /\bthey(?:'re| are) right\b/i,
    /\bi(?:'ll| will) grant\b/i,
    /\bconcede\b/i,
    /\beven if\b/i,
    /\bfair point\b/i,
    /\bthat's true\b/i,
    /\bpoint taken\b/i,
  ];
  var YEAR_RX = /\b(18|19|20)\d{2}\b/;
  var PROPER_NOUN_RX = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
  var SENTENCE_SPLIT = /[.!?]+/;

  function captureMessage(text, ctx){
    if (typeof text !== 'string' || text.trim().length < 5) return;
    var p = readProfile();
    var s = p.silent;
    var lower = text.toLowerCase();

    s.msgCount += 1;
    s.totalChars += text.length;
    var sentences = text.split(SENTENCE_SPLIT).filter(function(x){ return x.trim().length > 0; });
    s.totalSentences += Math.max(1, sentences.length);

    // Jargon: count distinct jargon terms that appear (capped per message so one
    // very jargony message doesn't dominate the score).
    var jargonThisMsg = 0;
    for (var i=0;i<JARGON_TERMS.length;i++){
      if (lower.indexOf(JARGON_TERMS[i]) !== -1){ jargonThisMsg++; if (jargonThisMsg >= 5) break; }
    }
    s.jargonHits += jargonThisMsg;

    // Concessions
    for (var j=0;j<CONCESSION_PATTERNS.length;j++){
      if (CONCESSION_PATTERNS[j].test(text)){ s.concessionHits += 1; break; }
    }

    // Named-anchor richness: proper nouns + explicit years.
    var propers = text.match(PROPER_NOUN_RX) || [];
    // De-dupe to avoid one name being repeated inflating the score.
    var uniqueProp = {};
    for (var k=0;k<propers.length;k++){ uniqueProp[propers[k]] = true; }
    s.properNounHits += Math.min(Object.keys(uniqueProp).length, 6);
    if (YEAR_RX.test(text)) s.yearHits += 1;

    // ALL-CAPS emphasis (>3 chars) — signal of passion / heavy emphasis style.
    if (/\b[A-Z]{4,}\b/.test(text)) s.allcapsHits += 1;

    // Track topic keywords lightly (optional, only if ctx.motion provided).
    if (ctx && ctx.motion && typeof ctx.motion === 'string'){
      s.recentTopics.push({ motion: ctx.motion.slice(0,120), at: Date.now() });
      if (s.recentTopics.length > 12) s.recentTopics.shift();
    }

    writeProfile(p);
  }

  /* ───────────────────── summary → prompt block ─────────────────────── */
  function summarize(p){
    var s = p.silent || {};
    var n = s.msgCount || 0;
    // If we don't have enough silent data, we still may have questionnaire data.
    var silent = null;
    if (n >= MIN_MSGS_FOR_SIGNAL) {
      var avgMsgLen = s.totalChars / n;
      var avgSentLen = s.totalSentences > 0 ? s.totalChars / s.totalSentences : 0;
      silent = {
        lengthProfile: avgMsgLen < 220 ? 'short' : avgMsgLen < 500 ? 'medium' : 'long',
        sentenceProfile: avgSentLen < 80 ? 'punchy' : avgSentLen < 140 ? 'standard' : 'flowing',
        jargonLevel: s.jargonHits / n > 1.2 ? 'high' : s.jargonHits / n > 0.35 ? 'moderate' : 'low',
        concessionHabit: s.concessionHits / n > 0.3 ? 'frequent' : s.concessionHits / n > 0.1 ? 'occasional' : 'rare',
        anchorDensity: s.properNounHits / n > 2.5 ? 'high' : s.properNounHits / n > 0.8 ? 'moderate' : 'low',
        yearCitations: s.yearHits / n > 0.25 ? 'often' : 'rare',
        emphasisStyle: s.allcapsHits / n > 0.25 ? 'heavy-emphasis' : 'restrained',
        sampleSize: n,
      };
    }
    return { silent: silent, questionnaire: p.questionnaire };
  }

  // Render a natural-language block the AI can actually follow, or null if we
  // have no meaningful data yet (don't inject noise into the prompt).
  function buildUserStyleBlock(){
    var p = readProfile();
    var sum = summarize(p);
    if (!sum.silent && !sum.questionnaire) return null;

    var lines = [];
    lines.push('This user has a known debate-style profile. Match their preferences where reasonable:');

    if (sum.questionnaire) {
      var q = sum.questionnaire;
      if (q.experienceLevel) lines.push('- Experience level: ' + q.experienceLevel + '. Calibrate assumed knowledge accordingly.');
      if (q.formats && q.formats.length) lines.push('- Preferred formats: ' + q.formats.join(', ') + '.');
      if (q.role) lines.push('- Context: ' + q.role + '.');
      if (q.argumentStyle) lines.push('- Argument style they prefer: ' + q.argumentStyle + '.');
      if (q.wantsJargon === false) lines.push('- They DO NOT want debate jargon. Use plain English even for technical moves.');
      if (q.wantsJargon === true) lines.push('- They ARE comfortable with debate jargon (warrant, impact calculus, A2, framework). Use it freely.');
      if (q.preferredWeighing && q.preferredWeighing.length) lines.push('- Weighing axes they find persuasive: ' + q.preferredWeighing.join(', ') + '. Reach for these.');
      if (q.influences) lines.push('- Debaters or voices they admire: ' + q.influences + '. Adopt similar rhythm when appropriate.');
      if (q.avoid) lines.push('- Things they explicitly want you to avoid: ' + q.avoid + '.');
      if (q.goals) lines.push('- What they want to get better at: ' + q.goals + '. Bias feedback toward these areas.');
    }

    if (sum.silent) {
      var s = sum.silent;
      var obs = [];
      obs.push('writes ' + s.lengthProfile + ' messages with ' + s.sentenceProfile + ' sentences');
      obs.push('uses debate jargon ' + s.jargonLevel + 'ly');
      obs.push('concedes opponent points ' + s.concessionHabit + 'ly');
      obs.push('cites named anchors (people/events/orgs) with ' + s.anchorDensity + ' density');
      obs.push('references specific years ' + s.yearCitations);
      if (s.emphasisStyle === 'heavy-emphasis') obs.push('uses ALL-CAPS for emphasis in the text they write');
      lines.push('- Observed from ' + s.sampleSize + ' of their past messages: they ' + obs.join('; ') + '.');
      lines.push('- Mirror their jargon level and sentence rhythm, but you are NOT required to match their weaknesses (e.g., if they rarely concede, you should still concede properly — you are modeling good form).');
    }

    lines.push('Do not mention this profile explicitly in your response. Just reflect it in how you write.');
    return lines.join('\n');
  }

  function hasMeaningfulProfile(){
    var p = readProfile();
    if (p.questionnaire && Object.keys(p.questionnaire).length > 2) return true;
    if (p.silent && p.silent.msgCount >= MIN_MSGS_FOR_SIGNAL) return true;
    return false;
  }

  /* ───────────────────── export ─────────────────────── */
  window.DebateStyle = {
    getProfile: getProfile,
    setProfile: setProfile,
    submitQuestionnaire: submitQuestionnaire,
    captureMessage: captureMessage,
    buildUserStyleBlock: buildUserStyleBlock,
    hasMeaningfulProfile: hasMeaningfulProfile,
    reset: reset,
    _storageKey: STORAGE_KEY,
  };
})();
