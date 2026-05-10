/* community-threads.js
 *
 * Hand-written seed forum threads for /community#discussion. Same
 * social-proof rationale as community-disclosures.js: a brand-new
 * visitor who lands on an empty Discussion tab won't post first.
 *
 * Each thread carries seed:true + a 'da-thread-*' id prefix. Reply
 * counts are inflated to feel lived-in, but the underlying reply
 * docs do not exist; clicking a seed thread opens its body alone
 * because the existing Firestore reply pipeline only renders real
 * docs. That's an acceptable tradeoff for v1 (we lose a small
 * fraction of click-throughs, we win the populated list view).
 *
 * Topics weighted to:
 *   - The Indian circuit (Asian Parli, WSDC) since traffic is ~80% India
 *   - Format-specific craft questions (the kind that actually drive
 *     return engagement on a debate forum)
 *   - One or two meta-threads about the product itself, which seeds
 *     the "this site has its own community" feel.
 */
(function(){
  'use strict';

  const SEED_VERSION = 1;

  const THREADS_RAW = [

    // ── Asian Parli + Indian-circuit threads ──────────────────────────

    {
      title: 'Asian Parli reply speeches: what actually wins them?',
      category: 'asian',
      authorName: 'Aarav K.',
      ageHours: 6,
      voteScore: 14,
      voteCount: 16,
      replyCount: 9,
      content:
`Junior speaker giving the reply but I keep getting marked down at locals. Coach says I'm "summarizing not weighing." What's the difference in practice? Is the reply just a fancy whip with the bias allowed?

Specifically: do you organize by clash or by argument? My instinct is by clash but the model speeches I've seen from NUS / NLU all read like extended whip speeches organized by argument extension.`
    },

    {
      title: 'India circuit motion bank: anyone tracking weekly?',
      category: 'asian',
      authorName: 'Anika R.',
      ageHours: 13,
      voteScore: 22,
      voteCount: 24,
      replyCount: 11,
      content:
`Putting together a shared sheet for motions from BITS, NLSIU, Manipal, IIT-B, and the smaller invitationals. Tagging by topic area + difficulty + format (most are Asian Parli, some BP). Ping me if you want write access. Goal is a clean 2025-26 archive that's actually searchable, unlike the random Drive folders we all have right now.`
    },

    {
      title: 'WSDC-style POI etiquette when the speaker is clearly cooking',
      category: 'worlds',
      authorName: 'Diya S.',
      ageHours: 22,
      voteScore: 7,
      voteCount: 9,
      replyCount: 4,
      content:
`Asking for the JV teammates. They keep accepting POIs in the wrong protected window or, worse, accepting them when their own 7th minute is on fire and we needed the airtime. What's the rule of thumb you actually use? "Accept exactly two, ideally one in minute 3 and one in minute 5" is what I tell them but I want a less mechanical answer.`
    },

    // ── BP + Worlds craft threads ─────────────────────────────────────

    {
      title: 'BP closing-half extensions: is "new mech" dead?',
      category: 'bp',
      authorName: 'Hassan A.',
      ageHours: 30,
      voteScore: 18,
      voteCount: 21,
      replyCount: 14,
      content:
`Feels like every closing extension at recent EUDC outrounds was either (a) a new actor or (b) a reframing of the same mech with a new principled angle, and almost never a new mech proper. Is that just my impression or is the meta actually shifting away from new-mech extensions because they're easy to characterize as "post-hoc" by the chair?

Curious what closing-half teams here have been running. Happy to swap notes.`
    },

    {
      title: 'How do you weigh "principle wins" vs "practical wins" in BP outrounds?',
      category: 'bp',
      authorName: 'Sara T.',
      ageHours: 41,
      voteScore: 9,
      voteCount: 11,
      replyCount: 6,
      content:
`Lost a quarter on a 2-1 where the panel split exactly along principle vs practical. The chair voted us up on the principled clash. Wing voted us down because we "failed to engage the implementation question." Both true. How do you make sure both sides are covered in 7 minutes without it reading as scattered?`
    },

    // ── PF / LD / Policy ──────────────────────────────────────────────

    {
      title: 'PF Sept-Oct topic: how are people handling the NATO-expansion historical lit?',
      category: 'pf',
      authorName: 'Henry M.',
      ageHours: 19,
      voteScore: 6,
      voteCount: 8,
      replyCount: 3,
      content:
`The Mearsheimer / Sarotte / Vachudova trio is doing a lot of work on both sides and judges seem to be tired of it. Anyone running a non-obvious framing? I'm thinking about a "third-party externality" frame that makes the resolution about Ukraine specifically, but worried it reads as topical evasion.`
    },

    {
      title: 'LD novices: how do you stop getting the framework debate dropped?',
      category: 'ld',
      authorName: 'Sophia W.',
      ageHours: 56,
      voteScore: 11,
      voteCount: 12,
      replyCount: 7,
      content:
`Coaching 4 novices this season. Every round their value/criterion goes uncontested in the NC and then nobody picks it up in the rebuttals. I've drilled "extend framework FIRST" but it slips when they're under time pressure. Looking for either a checklist or a phrasing template that has worked for your kids.`
    },

    {
      title: 'Policy 1NC strategy: how many off-case do you actually run anymore?',
      category: 'policy',
      authorName: 'Sebastian L.',
      ageHours: 72,
      voteScore: 4,
      voteCount: 7,
      replyCount: 5,
      content:
`Asking because circuit feels split. The Texas/Kansas pattern still runs 6+ off, the Dartmouth/Northwestern pattern is more like 3 deep + a kritik. We're an East Coast HS team with limited research bandwidth. Trying to figure out where the diminishing returns hit before our 1AR collapses under it.`
    },

    // ── Meta threads about Debate AI itself ───────────────────────────

    {
      title: 'Anyone using Debate AI for actual circuit prep, or only drills?',
      category: 'meta',
      authorName: 'Olivia H.',
      ageHours: 48,
      voteScore: 27,
      voteCount: 31,
      replyCount: 18,
      content:
`Curious how people are integrating this into prep. My current loop:

1. Generate a case in 10-12 min via the AI
2. Cut it down to my own outline in another 10
3. Run a sparring round against the AI on the opposite side
4. Read the RFD, mark dropped args, redo the speech once

Total: ~45 min for a full prep cycle. Is anyone doing this differently, or is this basically the optimal use? Genuine question. Interested if there's a faster loop I'm missing.`
    },

    {
      title: 'Voice mode hot take: best for impromptu, less useful for prepped',
      category: 'meta',
      authorName: 'Tarun B.',
      ageHours: 67,
      voteScore: 19,
      voteCount: 22,
      replyCount: 10,
      content:
`Used voice mode for a week. It's clearly the killer feature for APDA / Worlds impromptu prep; the time pressure and the live POIs are basically the round. For prepped formats (LD, Policy, PF) the typed mode still feels better because you can flow it cleanly and re-read.

Anyone else seeing this split? Curious if the voice team has plans for a "flow capture" overlay so it stops being a tradeoff.`
    },

    // ── General / cross-format ────────────────────────────────────────

    {
      title: 'What\'s the cleanest way to learn a new format from scratch?',
      category: 'general',
      authorName: 'Niharika P.',
      ageHours: 89,
      voteScore: 8,
      voteCount: 10,
      replyCount: 6,
      content:
`Background is APDA. Trying to pick up BP because the international circuit I want to do uses it. The structural differences (4 teams, extensions, no MG/MO collapse) are obvious from the rulebook. The harder thing is the JUDGING: what BP judges actually reward at the margin vs. what APDA judges do.

Has anyone written a clean side-by-side? Most of what I find is one-format or the other.`
    },

    {
      title: 'The single most underrated skill in any format?',
      category: 'general',
      authorName: 'Priya S.',
      ageHours: 110,
      voteScore: 31,
      voteCount: 36,
      replyCount: 23,
      content:
`Mine: writing the ballot in your head while you're still speaking the rebuttal. If you can't picture the judge's RFD by your last 30 seconds, you're not weighing; you're just rebutting.

Curious what other people would put in this slot. The thing nobody tells you in your first season that turns out to be 80% of why someone wins.`
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
    return THREADS_RAW.map((t, i) => ({
      id: 'da-thread-' + String(i+1).padStart(3, '0'),
      authorUid: 'da-seed-thread-' + (i+1),
      authorName: t.authorName,
      authorPhoto: '',
      title: t.title,
      content: t.content,
      category: t.category,
      parentId: null,
      rootId: null,
      createdAt: tsLike(new Date(now - (t.ageHours || 1) * 60 * 60 * 1000)),
      voteScore: t.voteScore || 0,
      voteCount: t.voteCount || (t.voteScore || 0),
      replyCount: t.replyCount || 0,
      seed: true,
      seedV: SEED_VERSION,
    }));
  }

  function merge(realRows, opts){
    const limit = (opts && opts.limit) || 100;
    const seeds = build();
    const all = Array.isArray(realRows) ? realRows.concat(seeds) : seeds.slice();
    all.sort((a, b) => {
      const as = (a.createdAt && a.createdAt.seconds) || 0;
      const bs = (b.createdAt && b.createdAt.seconds) || 0;
      return bs - as;
    });
    return all.slice(0, limit);
  }

  window.DEBATEAI_THREADS = {
    version: SEED_VERSION,
    build,
    merge,
    count: THREADS_RAW.length,
  };
})();
