/* ── Partner compatibility ─────────────────────────────────────────
 *
 * A short quiz on /partners, and the scoring that ranks the pool with
 * it. Loaded by the page; exposes window.PartnerFit.
 *
 * Why a quiz at all. An unranked pool is a list of strangers, and the
 * only signal in it is who joined most recently, which is not a reason
 * to spend an hour debating with someone. Five questions is enough to
 * separate a novice who wants to drill fundamentals from a circuit
 * debater prepping for a tournament, and that difference is what makes
 * a partnership work or waste both people's evening.
 *
 * Scoring is deliberately CLIENT-side. It ranks and explains; it does
 * not decide anything. The server never trusts it, no partnership
 * depends on it, and the pool documents it reads are already public to
 * signed-in users. Putting it here keeps the pool list to one Firestore
 * read instead of a round trip per candidate.
 *
 * The one rule worth stating: complementary beats identical on
 * SPEAKING POSITION and identical beats complementary on everything
 * else. Two people who both want to speak first will spend every round
 * negotiating; two people who both want tournament prep will not.
 */
(function(){
  'use strict';

  var QUESTIONS = [
    {
      key: 'level',
      label: 'Where are you at',
      options: [
        { v: 'novice',      t: 'New to it' },
        { v: 'competing',   t: 'Competing at school' },
        { v: 'experienced', t: 'A few seasons in' },
        { v: 'circuit',     t: 'Open circuit' },
      ],
    },
    {
      key: 'goal',
      label: 'What you want out of it',
      options: [
        { v: 'learn',  t: 'Drill the fundamentals' },
        { v: 'prep',   t: 'Prep for a tournament' },
        { v: 'casual', t: 'Casual rounds for fun' },
      ],
    },
    {
      key: 'position',
      label: 'Where you like to speak',
      options: [
        { v: 'first',  t: 'First speaker' },
        { v: 'second', t: 'Second speaker' },
        { v: 'either', t: 'Either is fine' },
      ],
    },
    {
      key: 'availability',
      label: 'When you are usually free',
      options: [
        { v: 'weekdays', t: 'Weekday evenings' },
        { v: 'weekends', t: 'Weekends' },
        { v: 'most',     t: 'Most days' },
        { v: 'flexible', t: 'Whenever' },
      ],
    },
    {
      key: 'intensity',
      label: 'How hard you want it',
      options: [
        { v: 'relaxed', t: 'Relaxed' },
        { v: 'focused', t: 'Focused' },
        { v: 'hard',    t: 'No mercy' },
      ],
    },
  ];

  var LEVEL_ORDER = { novice: 0, competing: 1, experienced: 2, circuit: 3 };
  var INTENSITY_ORDER = { relaxed: 0, focused: 1, hard: 2 };

  function get(p, key){ return (p && p[key]) || ''; }

  // 0-100. Every component is additive and capped, so a missing answer
  // costs points rather than breaking the score: somebody who skipped
  // the quiz still appears in the pool, just lower down.
  function score(me, them){
    var s = 0;

    // Format. The strongest single signal, because a partnership in
    // the wrong format is not a partnership.
    var fa = get(me, 'format'), fb = get(them, 'format');
    if (fa && fb && fa === fb) s += 25;
    else if (!fa || !fb) s += 8;

    // Goal. Identical is best. Prep and drilling sit next to each
    // other; casual against either is the real mismatch, because one
    // person is keeping score and the other is not.
    var ga = get(me, 'goal'), gb = get(them, 'goal');
    if (ga && gb){
      if (ga === gb) s += 25;
      else if ((ga !== 'casual') && (gb !== 'casual')) s += 12;
      else s += 2;
    }

    // Speaking position. The one axis where OPPOSITE is better.
    var pa = get(me, 'position'), pb = get(them, 'position');
    if (pa && pb){
      if ((pa === 'first' && pb === 'second') || (pa === 'second' && pb === 'first')) s += 20;
      else if (pa === 'either' || pb === 'either') s += 14;
      else s += 0;   // both want the same seat: a real thing to sort out
    }

    // Level. Close is good. A gap of three is a coaching session, and
    // people should be able to choose that on purpose rather than be
    // matched into it.
    var la = LEVEL_ORDER[get(me, 'level')], lb = LEVEL_ORDER[get(them, 'level')];
    if (la != null && lb != null){
      var gap = Math.abs(la - lb);
      s += gap === 0 ? 15 : gap === 1 ? 11 : gap === 2 ? 5 : 0;
    }

    // Availability. Two people who are never free at the same time
    // will never actually run a round, however well they match.
    var aa = get(me, 'availability'), ab = get(them, 'availability');
    if (aa && ab){
      if (aa === ab) s += 10;
      else if (aa === 'flexible' || ab === 'flexible' || aa === 'most' || ab === 'most') s += 8;
      else s += 1;
    }

    // Intensity. A tiebreak, not a gate.
    var ia = INTENSITY_ORDER[get(me, 'intensity')], ib = INTENSITY_ORDER[get(them, 'intensity')];
    if (ia != null && ib != null){
      var d = Math.abs(ia - ib);
      s += d === 0 ? 5 : d === 1 ? 3 : 0;
    }

    return Math.max(0, Math.min(100, Math.round(s)));
  }

  var FORMAT_TEXT = {
    quick: 'Quick Clash', apda: 'APDA', asian: 'Asian Parli',
    bp: 'BP', worlds: 'Worlds',
  };
  function fmtLabel(f){ return FORMAT_TEXT[f] || f; }

  var GOAL_TEXT = { learn: 'drilling fundamentals', prep: 'tournament prep', casual: 'casual rounds' };
  var AVAIL_TEXT = { weekdays: 'weekday evenings', weekends: 'weekends', most: 'most days', flexible: 'any time' };

  // The two or three things actually driving the score, in plain
  // words. A number with no reason behind it is not worth showing.
  function reasons(me, them){
    var out = [];
    var fa = get(me, 'format'), fb = get(them, 'format');
    if (fa && fb && fa !== fb) out.push('Wants ' + fmtLabel(fb) + ', not ' + fmtLabel(fa));
    var pa = get(me, 'position'), pb = get(them, 'position');
    if ((pa === 'first' && pb === 'second') || (pa === 'second' && pb === 'first')){
      out.push('You speak ' + pa + ', they speak ' + pb);
    } else if (pa && pa === pb && pa !== 'either'){
      out.push('You both want to speak ' + pa);
    }

    var ga = get(me, 'goal'), gb = get(them, 'goal');
    if (ga && ga === gb && GOAL_TEXT[ga]) out.push('Both here for ' + GOAL_TEXT[ga]);
    else if (ga && gb && GOAL_TEXT[gb]) out.push('They want ' + GOAL_TEXT[gb]);

    var la = LEVEL_ORDER[get(me, 'level')], lb = LEVEL_ORDER[get(them, 'level')];
    if (la != null && lb != null){
      var gap = Math.abs(la - lb);
      if (gap === 0) out.push('Same experience level');
      else if (gap >= 2) out.push('Further along than you');
    }

    var aa = get(me, 'availability'), ab = get(them, 'availability');
    if (aa && ab && aa === ab && AVAIL_TEXT[aa]) out.push('Both free ' + AVAIL_TEXT[aa]);
    else if (ab && AVAIL_TEXT[ab] && (!aa || aa !== ab)) out.push('Free ' + AVAIL_TEXT[ab]);

    return out.slice(0, 3);
  }

  // Bands are set so that "Strong" requires the whole picture to line
  // up, INCLUDING complementary speaking positions. Two people who
  // both want to speak first can agree to swap, but a label reading
  // "Strong match" directly above "You both want to speak first" is
  // the tool contradicting itself, so that case tops out at Good.
  function band(n){
    if (n >= 85) return 'Strong match';
    if (n >= 65) return 'Good match';
    if (n >= 40) return 'Workable';
    return 'Long shot';
  }

  window.PartnerFit = {
    QUESTIONS: QUESTIONS,
    score: score,
    reasons: reasons,
    band: band,
    // Read the quiz answers off a container of <select data-pref="key">.
    read: function(root){
      var out = {};
      QUESTIONS.forEach(function(q){
        var el = root && root.querySelector('[data-pref="' + q.key + '"]');
        if (el && el.value) out[q.key] = el.value;
      });
      return out;
    },
    // Render the quiz into a container.
    render: function(root, saved){
      if (!root) return;
      root.innerHTML = QUESTIONS.map(function(q){
        return '<div><label class="f" for="pref-' + q.key + '">' + q.label + '</label>' +
          '<select class="in" id="pref-' + q.key + '" data-pref="' + q.key + '">' +
          q.options.map(function(o){
            var sel = saved && saved[q.key] === o.v ? ' selected' : '';
            return '<option value="' + o.v + '"' + sel + '>' + o.t + '</option>';
          }).join('') +
          '</select></div>';
      }).join('');
    },
  };
})();
