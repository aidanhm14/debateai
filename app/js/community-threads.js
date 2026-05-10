/* community-threads.js
 *
 * Hand-written seed forum threads + replies for /community#discussion.
 * Sized small on purpose (9 threads, ~20 replies total) so the page
 * reads as "small active community" rather than "manufactured forum
 * dump." Authors are handle-style usernames; reply count on the list
 * view is derived from replies.length so the badge never lies.
 *
 * Each thread carries seed:true + a 'da-thread-*' id prefix. Real
 * Firestore replies (signed-in users replying to a seed thread) still
 * merge in via the live snapshot listener.
 */
(function(){
  'use strict';

  const SEED_VERSION = 3;

  const THREADS_RAW = [

    // ── Asian Parli + Indian-circuit threads ──────────────────────────

    {
      title: 'Asian Parli reply speeches: what actually wins them?',
      category: 'asian',
      authorName: 'parli_pilgrim',
      ageHours: 6,
      voteScore: 14,
      voteCount: 16,
      content:
`Junior speaker giving the reply but I keep getting marked down at locals. Coach says I'm "summarizing not weighing." What's the difference in practice? Is the reply just a fancy whip with the bias allowed?

Specifically: do you organize by clash or by argument? My instinct is by clash but the model speeches I've seen from NUS / NLU all read like extended whip speeches organized by argument extension.`,
      replies: [
        { authorName: 'delhi_circuit', hoursAfter: 1.5, voteScore: 6,
          content: `Reply is by clash, not by argument. The whip extends arguments. The reply COMPARES outcomes per clash. That's the actual difference, and that's why "summarizing not weighing" is the canonical mark-down.` },
        { authorName: 'flow_rat', hoursAfter: 4, voteScore: 2,
          content: `Don't open with structure ("I will cover three issues today"). Open with the conclusion ("opp wins this round on the harm-to-vulnerable clash"). Then walk back. Reply is the only speech where you get to do that.` },
      ],
    },

    {
      title: 'India circuit motion bank: anyone tracking weekly?',
      category: 'asian',
      authorName: 'delhi_circuit',
      ageHours: 13,
      voteScore: 22,
      voteCount: 24,
      content:
`Putting together a shared sheet for motions from BITS, NLSIU, Manipal, IIT-B, and the smaller invitationals. Tagging by topic area + difficulty + format (most are Asian Parli, some BP). Ping me if you want write access. Goal is a clean 2025-26 archive that's actually searchable, unlike the random Drive folders we all have right now.`,
      replies: [
        { authorName: 'tarun', hoursAfter: 2.5, voteScore: 8,
          content: `Yes please. The Drive folder situation is genuinely cursed. I can contribute IIT-D and JNU sets going back to last September.` },
        { authorName: 'octas_or_bust', hoursAfter: 4, voteScore: 6,
          content: `Add me. I have 60+ from BITS Goa 2024 and the Asian Open prelims that I've never published anywhere. Happy to upload if there's a clean format.` },
        { authorName: 'wsdcbound', hoursAfter: 9, voteScore: 3,
          content: `Tag suggestion: include the round number (R1, R2, semis, finals) so people can self-grade against the level the motion was actually argued at.` },
      ],
    },

    {
      title: 'WSDC-style POI etiquette when the speaker is clearly cooking',
      category: 'worlds',
      authorName: 'octas_or_bust',
      ageHours: 22,
      voteScore: 7,
      voteCount: 9,
      content:
`Asking for the JV teammates. They keep accepting POIs in the wrong protected window or, worse, accepting them when their own 7th minute is on fire and we needed the airtime. What's the rule of thumb you actually use?`,
      replies: [
        { authorName: 'closingoo', hoursAfter: 2, voteScore: 5,
          content: `The best teams I've watched accept ONE in minute 4. Just one. The second POI is what the opponent expects; declining it puts pressure back on them.` },
        { authorName: 'whip_only', hoursAfter: 6, voteScore: 3,
          content: `What I tell my JV: never in your last 90 seconds. If you're cooking, protect the burn. POIs are for when you have time to repurpose them.` },
      ],
    },

    // ── BP + Worlds craft threads ─────────────────────────────────────

    {
      title: 'BP closing-half extensions: is "new mech" dead?',
      category: 'bp',
      authorName: 'closingoo',
      ageHours: 30,
      voteScore: 18,
      voteCount: 21,
      content:
`Feels like every closing extension at recent EUDC outrounds was either (a) a new actor or (b) a reframing of the same mech with a new principled angle, and almost never a new mech proper. Is that just my impression or is the meta actually shifting away from new-mech extensions because they're easy to characterize as "post-hoc" by the chair?

Curious what closing-half teams here have been running.`,
      replies: [
        { authorName: 'mgextension', hoursAfter: 3, voteScore: 9,
          content: `Not dead but the bar moved. A new mech now has to be obviously distinct from opening's: different actor, different timeline, or different mechanism axis. Otherwise the chair codes it as opening's case extended and you lose the freshness credit.` },
        { authorName: 'oo_bench', hoursAfter: 9, voteScore: 5,
          content: `Counter-take: new mech is alive at WUDC but dead at most EUDC outrounds. Norm is regional. WUDC chairs are more willing to reward genuine innovation; EUDC chairs penalize the perceived risk.` },
        { authorName: 'theory_pls', hoursAfter: 21, voteScore: 2,
          content: `Practical heuristic for closing teams: write TWO extensions in prep. One new-mech, one principled-frame. Pick after watching opening teams and reading the chair's posture. Hedges the meta-risk.` },
      ],
    },

    // ── PF / LD / Policy ──────────────────────────────────────────────

    {
      title: 'PF Sept-Oct topic: how are people handling the NATO-expansion historical lit?',
      category: 'pf',
      authorName: 'pfdrops',
      ageHours: 19,
      voteScore: 6,
      voteCount: 8,
      content:
`The Mearsheimer / Sarotte / Vachudova trio is doing a lot of work on both sides and judges seem to be tired of it. Anyone running a non-obvious framing? I'm thinking about a "third-party externality" frame that makes the resolution about Ukraine specifically, but worried it reads as topical evasion.`,
      replies: [
        { authorName: 'crystallize', hoursAfter: 4, voteScore: 4,
          content: `I've been running a "cost-internalization" frame on Pro and a "sphere-of-influence realism" frame on Con. Neither is novel exactly but they're reframings of the trio you mentioned. Judges have responded better than to direct-quote evidence.` },
        { authorName: 'cite_or_die', hoursAfter: 12, voteScore: 1,
          content: `The third-party framing isn't evasion if you tie it explicitly to the resolution's "on balance" weighing. Risk is only if you run it as the WHOLE case rather than the weighing layer.` },
      ],
    },

    {
      title: 'LD novices: how do you stop getting the framework debate dropped?',
      category: 'ld',
      authorName: 'criterionkid',
      ageHours: 56,
      voteScore: 11,
      voteCount: 12,
      content:
`Coaching 4 novices this season. Every round their value/criterion goes uncontested in the NC and then nobody picks it up in the rebuttals. I've drilled "extend framework FIRST" but it slips when they're under time pressure. Looking for either a checklist or a phrasing template that has worked for your kids.`,
      replies: [
        { authorName: 'tabover_truth', hoursAfter: 8, voteScore: 5,
          content: `Phrase template: "1AR. First, framework. Extend my V/C, Neg never engaged it. That alone wins because..." Repeating "first, framework" makes it muscle memory. We literally write it on the top of the flow paper as a visual cue.` },
        { authorName: 'parli_pilgrim', hoursAfter: 22, voteScore: 4,
          content: `Other trick: have them write the framework callout on the top of their flow paper before the round even starts. Visual cue that survives time pressure. Drop rate fell ~50% in our novice cohort doing just this.` },
      ],
    },

    // ── Meta threads about Debate AI itself ───────────────────────────

    {
      title: 'Anyone using Debate AI for actual circuit prep, or only drills?',
      category: 'meta',
      authorName: 'wsdcbound',
      ageHours: 48,
      voteScore: 27,
      voteCount: 31,
      content:
`Curious how people are integrating this into prep. My current loop:

1. Generate a case in 10-12 min via the AI
2. Cut it down to my own outline in another 10
3. Run a sparring round against the AI on the opposite side
4. Read the RFD, mark dropped args, redo the speech once

Total: ~45 min for a full prep cycle. Is anyone doing this differently, or is this basically the optimal use? Genuine question. Interested if there's a faster loop I'm missing.`,
      replies: [
        { authorName: 'parli_pilgrim', hoursAfter: 5, voteScore: 12,
          content: `Closer to what I do: skip step 1 entirely. I write my own outline first, then use the AI for the OPPOSITE side to stress-test. Catches more drops than letting it write your case for you.` },
        { authorName: 'closingoo', hoursAfter: 9, voteScore: 9,
          content: `+1. The AI's case quality is fine but it tends to converge to the same 2-3 args per motion. The opp-side stress test is where the real value sits.` },
        { authorName: 'nightshift_', hoursAfter: 21, voteScore: 5,
          content: `Step 5 missing from your loop: feed the RFD back into the next round so the AI judges you the same way twice. Closes the loop and surfaces patterns ("you keep dropping the impact comparison") that one round won't show.` },
      ],
    },

    {
      title: 'Voice mode hot take: best for impromptu, less useful for prepped',
      category: 'meta',
      authorName: 'nightshift_',
      ageHours: 67,
      voteScore: 19,
      voteCount: 22,
      content:
`Used voice mode for a week. It's clearly the killer feature for APDA / Worlds impromptu prep; the time pressure and the live POIs are basically the round. For prepped formats (LD, Policy, PF) the typed mode still feels better because you can flow it cleanly and re-read.

Anyone else seeing this split?`,
      replies: [
        { authorName: 'octas_or_bust', hoursAfter: 11, voteScore: 6,
          content: `Same observation. Voice mode is unbeatable for impromptu speaks. For prepped, the typed flow is irreplaceable. Honestly feels like two different products serving different parts of the prep cycle.` },
        { authorName: 'mgextension', hoursAfter: 17, voteScore: 4,
          content: `The flow capture overlay would change everything. Even a basic transcript with timestamps would be enough to flow off of.` },
      ],
    },

    // ── General / cross-format ────────────────────────────────────────

    {
      title: 'The single most underrated skill in any format?',
      category: 'general',
      authorName: 'frontlinekid',
      ageHours: 110,
      voteScore: 31,
      voteCount: 36,
      content:
`Mine: writing the ballot in your head while you're still speaking the rebuttal. If you can't picture the judge's RFD by your last 30 seconds, you're not weighing; you're just rebutting.

Curious what other people would put in this slot. The thing nobody tells you in your first season that turns out to be 80% of why someone wins.`,
      replies: [
        { authorName: 'wsdcbound', hoursAfter: 14, voteScore: 14,
          content: `Mine: knowing when to drop YOUR OWN argument. Concession weighting is a craft. The novice instinct is to defend everything, but if arg #2 is sinking, leave it and double down on #1+#3.` },
        { authorName: 'closingoo', hoursAfter: 19, voteScore: 11,
          content: `Listening. Genuinely listening to the opponent instead of pre-writing your rebuttal during their speech. The number of varsity debaters who flow nothing past minute 3 is criminal.` },
        { authorName: 'tundra', hoursAfter: 28, voteScore: 9,
          content: `Choosing what to LEAVE OUT. A 7-min speech with 3 contentions beats a 7-min speech with 5 every time, because depth wins and breadth lets the opponent pick which one to attack.` },
        { authorName: 'parli_pilgrim', hoursAfter: 56, voteScore: 5,
          content: `Reading the chair specifically. Wing-and-chair judges weight differently. Read the CHAIR's flow, weight to that one, accept you'll lose the wings sometimes. The ballot you can win is more valuable than the panel you can't.` },
      ],
    },

  ];

  function tsLike(date){
    const ms = date.getTime();
    return {
      seconds: Math.floor(ms / 1000),
      nanoseconds: 0,
      toDate(){ return date; },
    };
  }

  function build(){
    const now = Date.now();
    return THREADS_RAW.map((t, i) => {
      const threadDate = new Date(now - (t.ageHours || 1) * 60 * 60 * 1000);
      const threadId = 'da-thread-' + String(i+1).padStart(3, '0');
      const replies = (t.replies || []).map((r, j) => {
        const replyDate = new Date(threadDate.getTime() + (r.hoursAfter || 1) * 60 * 60 * 1000);
        return {
          id: threadId + '-r' + String(j+1).padStart(2, '0'),
          authorUid: 'da-seed-reply-' + threadId + '-' + (j+1),
          authorName: r.authorName,
          authorPhoto: '',
          title: '',
          content: r.content,
          parentId: threadId,
          rootId: threadId,
          category: t.category,
          createdAt: tsLike(replyDate),
          voteScore: r.voteScore || 0,
          voteCount: r.voteCount || (r.voteScore || 0),
          seed: true,
          seedV: SEED_VERSION,
        };
      });
      return {
        id: threadId,
        authorUid: 'da-seed-thread-' + (i+1),
        authorName: t.authorName,
        authorPhoto: '',
        title: t.title,
        content: t.content,
        category: t.category,
        parentId: null,
        rootId: null,
        createdAt: tsLike(threadDate),
        voteScore: t.voteScore || 0,
        voteCount: t.voteCount || (t.voteScore || 0),
        replyCount: replies.length,
        seed: true,
        seedV: SEED_VERSION,
        replies: replies,
      };
    });
  }

  // Once real activity reaches this many threads, seeds retreat entirely.
  // Tunable via opts.floorThreshold.
  const FLOOR_THRESHOLD = 8;

  function merge(realRows, opts){
    const limit = (opts && opts.limit) || 100;
    const real = Array.isArray(realRows) ? realRows : [];
    const threshold = (opts && typeof opts.floorThreshold === 'number')
      ? opts.floorThreshold : FLOOR_THRESHOLD;
    // Seed-floor: once the forum has its own gravity, seeds go quiet.
    if (threshold > 0 && real.length >= threshold){
      return real.slice(0, limit);
    }
    const seeds = build();
    const all = real.concat(seeds);
    all.sort((a, b) => {
      const as = (a.createdAt && a.createdAt.seconds) || 0;
      const bs = (b.createdAt && b.createdAt.seconds) || 0;
      return bs - as;
    });
    return all.slice(0, limit);
  }

  function getReplies(threadId){
    if (!threadId || typeof threadId !== 'string' || threadId.indexOf('da-thread-') !== 0) return [];
    const seeds = build();
    const t = seeds.find(s => s.id === threadId);
    return t ? (t.replies || []) : [];
  }

  window.DEBATEAI_THREADS = {
    version: SEED_VERSION,
    build,
    merge,
    getReplies,
    count: THREADS_RAW.length,
  };
})();
