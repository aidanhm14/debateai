/* community-threads.js
 *
 * Hand-written seed forum threads + replies for /community#discussion.
 * Same social-proof rationale as community-disclosures.js: a brand-new
 * visitor who lands on an empty Discussion tab won't post first.
 *
 * Each thread carries seed:true + a 'da-thread-*' id prefix. Each thread
 * also carries a `replies` array with hand-written replies, so when a
 * visitor clicks through they see actual back-and-forth instead of a
 * "💬 18" badge that opens onto "No replies yet." The reply count
 * shown on the list view is derived from replies.length, never inflated.
 *
 * Real Firestore replies (signed-in users replying to a seed thread)
 * still merge in via the live snapshot listener — seeds render first
 * because their timestamps are older.
 *
 * Topics weighted to:
 *   - The Indian circuit (Asian Parli, WSDC) since traffic is ~80% India
 *   - Format-specific craft questions (the kind that drive return
 *     engagement on a debate forum)
 *   - One or two meta-threads about the product itself, which seeds
 *     the "this site has its own community" feel.
 */
(function(){
  'use strict';

  const SEED_VERSION = 2;

  const THREADS_RAW = [

    // ── Asian Parli + Indian-circuit threads ──────────────────────────

    {
      title: 'Asian Parli reply speeches: what actually wins them?',
      category: 'asian',
      authorName: 'Aarav K.',
      ageHours: 6,
      voteScore: 14,
      voteCount: 16,
      content:
`Junior speaker giving the reply but I keep getting marked down at locals. Coach says I'm "summarizing not weighing." What's the difference in practice? Is the reply just a fancy whip with the bias allowed?

Specifically: do you organize by clash or by argument? My instinct is by clash but the model speeches I've seen from NUS / NLU all read like extended whip speeches organized by argument extension.`,
      replies: [
        { authorName: 'Anika R.', hoursAfter: 1.5, voteScore: 6,
          content: `Reply is by clash, not by argument. The whip extends arguments. The reply COMPARES outcomes per clash. That's the actual difference, and that's why "summarizing not weighing" is the canonical mark-down.` },
        { authorName: 'Sara T.', hoursAfter: 2.5, voteScore: 4,
          content: `Practical drill: at the end of every clash in your reply, say one sentence starting "so on this issue..." and one sentence starting "and that matters because...". Forces the comparison. We made juniors do this for a month and reply marks went up roughly half a point on average.` },
        { authorName: 'Hassan A.', hoursAfter: 4, voteScore: 2,
          content: `Also: don't open with structure ("I will cover three issues today"). Open with the conclusion ("opp wins this round on the harm-to-vulnerable clash"). Then walk back. Reply is the only speech where you get to do that.` },
      ],
    },

    {
      title: 'India circuit motion bank: anyone tracking weekly?',
      category: 'asian',
      authorName: 'Anika R.',
      ageHours: 13,
      voteScore: 22,
      voteCount: 24,
      content:
`Putting together a shared sheet for motions from BITS, NLSIU, Manipal, IIT-B, and the smaller invitationals. Tagging by topic area + difficulty + format (most are Asian Parli, some BP). Ping me if you want write access. Goal is a clean 2025-26 archive that's actually searchable, unlike the random Drive folders we all have right now.`,
      replies: [
        { authorName: 'Tarun B.', hoursAfter: 2.5, voteScore: 8,
          content: `Yes please. The Drive folder situation is genuinely cursed. I can contribute IIT-D and JNU sets going back to last September.` },
        { authorName: 'Diya S.', hoursAfter: 4, voteScore: 6,
          content: `Add me. I have 60+ from BITS Goa 2024 and the Asian Open prelims that I've never published anywhere. Happy to upload if there's a clean format.` },
        { authorName: 'Niharika P.', hoursAfter: 7, voteScore: 4,
          content: `Tag suggestion: include the round number (R1, R2, semis, finals) so people can self-grade against the level the motion was actually argued at.` },
        { authorName: 'Aarav K.', hoursAfter: 9, voteScore: 3,
          content: `+1 to round-tagging. Also useful: difficulty rating from the team that RAN it, not the team that wrote it. Big delta sometimes.` },
        { authorName: 'Akhil V.', hoursAfter: 11, voteScore: 2,
          content: `Anika DM me the sheet, will mirror the Bombay-circuit additions weekly.` },
      ],
    },

    {
      title: 'WSDC-style POI etiquette when the speaker is clearly cooking',
      category: 'worlds',
      authorName: 'Diya S.',
      ageHours: 22,
      voteScore: 7,
      voteCount: 9,
      content:
`Asking for the JV teammates. They keep accepting POIs in the wrong protected window or, worse, accepting them when their own 7th minute is on fire and we needed the airtime. What's the rule of thumb you actually use? "Accept exactly two, ideally one in minute 3 and one in minute 5" is what I tell them but I want a less mechanical answer.`,
      replies: [
        { authorName: 'Hassan A.', hoursAfter: 2, voteScore: 5,
          content: `The best teams I've watched accept ONE in minute 4. Just one. The second POI is what the opponent expects; declining it puts pressure back on them. Counter-meta works.` },
        { authorName: 'Olivia H.', hoursAfter: 6, voteScore: 3,
          content: `What I tell my JV: never in your last 90 seconds. If you're cooking, protect the burn. POIs are for when you have time to repurpose them, not when you're already mid-impact.` },
        { authorName: 'Sara T.', hoursAfter: 14, voteScore: 1,
          content: `Counter-mechanical answer they'll actually remember: take a POI when accepting it BENEFITS you (someone fires a question that lets you make a point you couldn't otherwise). Skip when it doesn't.` },
      ],
    },

    // ── BP + Worlds craft threads ─────────────────────────────────────

    {
      title: 'BP closing-half extensions: is "new mech" dead?',
      category: 'bp',
      authorName: 'Hassan A.',
      ageHours: 30,
      voteScore: 18,
      voteCount: 21,
      content:
`Feels like every closing extension at recent EUDC outrounds was either (a) a new actor or (b) a reframing of the same mech with a new principled angle, and almost never a new mech proper. Is that just my impression or is the meta actually shifting away from new-mech extensions because they're easy to characterize as "post-hoc" by the chair?

Curious what closing-half teams here have been running. Happy to swap notes.`,
      replies: [
        { authorName: 'Olivia H.', hoursAfter: 3, voteScore: 9,
          content: `Not dead but the bar moved. A new mech now has to be obviously distinct from opening's mech: different actor, different timeline, or different mechanism axis. Otherwise the chair codes it as opening's case extended and you lose the freshness credit.` },
        { authorName: 'Sara T.', hoursAfter: 5, voteScore: 7,
          content: `Agree. We've been winning closing on what I'd call "principled extensions": same mech, but a new ethical frame that wasn't on the table from opening. Reads cleaner to chairs and is genuinely harder for opening to absorb.` },
        { authorName: 'Akhil V.', hoursAfter: 9, voteScore: 5,
          content: `Counter-take: new mech is alive at WUDC but dead at most EUDC outrounds. Norm is regional. WUDC chairs are more willing to reward genuine innovation; EUDC chairs penalize the perceived risk.` },
        { authorName: 'Hassan A.', hoursAfter: 14, voteScore: 3,
          content: `Akhil's right re: regional split. WUDC chairs are still rewarding genuine new mech if it solves a clash the opening pair didn't even touch. EUDC defaults to "extension as deepening." Adapt to the room.` },
        { authorName: 'Pranav B.', hoursAfter: 21, voteScore: 2,
          content: `Practical heuristic for closing teams: write TWO extensions in prep. One new-mech, one principled-frame. Pick after watching opening teams and reading the chair's posture. Hedges the meta-risk.` },
      ],
    },

    {
      title: 'How do you weigh "principle wins" vs "practical wins" in BP outrounds?',
      category: 'bp',
      authorName: 'Sara T.',
      ageHours: 41,
      voteScore: 9,
      voteCount: 11,
      content:
`Lost a quarter on a 2-1 where the panel split exactly along principle vs practical. The chair voted us up on the principled clash. Wing voted us down because we "failed to engage the implementation question." Both true. How do you make sure both sides are covered in 7 minutes without it reading as scattered?`,
      replies: [
        { authorName: 'Pranav B.', hoursAfter: 6, voteScore: 4,
          content: `The "both true" problem is the trap. You don't actually need to cover both equally. You need to weigh which one DOMINATES under the chair's framework, then frontload that one. The other gets the leftover 90 seconds.` },
        { authorName: 'Diya S.', hoursAfter: 11, voteScore: 3,
          content: `What worked for us: 90 sec on principle (clean, sharp, unanswered), 4 min on practical (the mech actually works, here's how). Skews practical but the principle scaffold gives the wing what they want without burning your central airtime.` },
        { authorName: 'Olivia H.', hoursAfter: 19, voteScore: 2,
          content: `Less elegant but works: explicitly TELL the panel you're doing both. "Principle holds; here's why. Practical also holds; here's how." Naming the structure forces them to grade you on both rather than picking one and ignoring the other.` },
      ],
    },

    // ── PF / LD / Policy ──────────────────────────────────────────────

    {
      title: 'PF Sept-Oct topic: how are people handling the NATO-expansion historical lit?',
      category: 'pf',
      authorName: 'Henry M.',
      ageHours: 19,
      voteScore: 6,
      voteCount: 8,
      content:
`The Mearsheimer / Sarotte / Vachudova trio is doing a lot of work on both sides and judges seem to be tired of it. Anyone running a non-obvious framing? I'm thinking about a "third-party externality" frame that makes the resolution about Ukraine specifically, but worried it reads as topical evasion.`,
      replies: [
        { authorName: 'Meera J.', hoursAfter: 4, voteScore: 4,
          content: `I've been running a "cost-internalization" frame on Pro and a "sphere-of-influence realism" frame on Con. Neither is novel exactly but they're reframings of the trio you mentioned. Judges have responded better than to direct-quote evidence.` },
        { authorName: 'Henry M.', hoursAfter: 6, voteScore: 2,
          content: `Cost-internalization is good. I'm running something similar on Con: "who pays the externality." Helps move past the Mearsheimer fatigue.` },
        { authorName: 'Madison T.', hoursAfter: 12, voteScore: 1,
          content: `The third-party framing isn't evasion if you tie it explicitly to the resolution's "on balance" weighing. Judges will follow you there. The risk is only if you run it as the WHOLE case rather than the weighing layer.` },
      ],
    },

    {
      title: 'LD novices: how do you stop getting the framework debate dropped?',
      category: 'ld',
      authorName: 'Sophia W.',
      ageHours: 56,
      voteScore: 11,
      voteCount: 12,
      content:
`Coaching 4 novices this season. Every round their value/criterion goes uncontested in the NC and then nobody picks it up in the rebuttals. I've drilled "extend framework FIRST" but it slips when they're under time pressure. Looking for either a checklist or a phrasing template that has worked for your kids.`,
      replies: [
        { authorName: 'Ethan G.', hoursAfter: 8, voteScore: 5,
          content: `Phrase template: "1AR. First, framework. Extend my V/C, Neg never engaged it. That alone wins because..." Repeating "first, framework" makes it muscle memory. We literally write it on the top of the flow paper as a visual cue.` },
        { authorName: 'Sophia W.', hoursAfter: 14, voteScore: 3,
          content: `Going to drill that exact opening line tomorrow. Thanks.` },
        { authorName: 'Anika R.', hoursAfter: 22, voteScore: 4,
          content: `Other trick: have them write the framework callout on the top of their flow paper before the round even starts. Visual cue that survives time pressure. We saw drop rate fall ~50% in our novice cohort doing just this.` },
        { authorName: 'Aarav K.', hoursAfter: 36, voteScore: 2,
          content: `If your novices keep dropping framework even with the prompt, it might be that they don't yet understand WHY framework wins. Drill the "framework collapses the link debate" point until they can explain it cold. They drop what they don't believe matters.` },
      ],
    },

    {
      title: 'Policy 1NC strategy: how many off-case do you actually run anymore?',
      category: 'policy',
      authorName: 'Sebastian L.',
      ageHours: 72,
      voteScore: 4,
      voteCount: 7,
      content:
`Asking because circuit feels split. The Texas/Kansas pattern still runs 6+ off, the Dartmouth/Northwestern pattern is more like 3 deep + a kritik. We're an East Coast HS team with limited research bandwidth. Trying to figure out where the diminishing returns hit before our 1AR collapses under it.`,
      replies: [
        { authorName: 'Vihaan T.', hoursAfter: 10, voteScore: 3,
          content: `We're East Coast too. 4 off + a kritik is the sweet spot for us. Anything more and the 1AR can't recover; anything less and we lose flexibility against teams that prep narrowly.` },
        { authorName: 'Sebastian L.', hoursAfter: 14, voteScore: 1,
          content: `4 + K matches what our coach said. Going to test it at our next invitational and report back.` },
        { authorName: 'Niharika P.', hoursAfter: 28, voteScore: 1,
          content: `Bandwidth tip: the K doesn't need to be deeply prepped if you go for it as theory rather than as substantive offense. 1NR shell + 2NR collapse to "Aff failed to engage" wins more often than people admit.` },
      ],
    },

    // ── Meta threads about Debate AI itself ───────────────────────────

    {
      title: 'Anyone using Debate AI for actual circuit prep, or only drills?',
      category: 'meta',
      authorName: 'Olivia H.',
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
        { authorName: 'Aarav K.', hoursAfter: 5, voteScore: 12,
          content: `Closer to what I do: skip step 1 entirely. I write my own outline first, then use the AI for the OPPOSITE side to stress-test. Catches more drops than letting it write your case for you.` },
        { authorName: 'Hassan A.', hoursAfter: 9, voteScore: 9,
          content: `Aarav's right. The AI's case quality is fine but it tends to converge to the same 2-3 args per motion. The opp-side stress test is where the real value sits.` },
        { authorName: 'Olivia H.', hoursAfter: 13, voteScore: 6,
          content: `OK that's a real adjustment. Going to swap step 1 for a hand-write and let the AI stress-test from the other side. Will report back next week.` },
        { authorName: 'Tarun B.', hoursAfter: 21, voteScore: 5,
          content: `Step 5 missing from your loop: feed the RFD back into the next round so the AI judges you the same way twice. Closes the loop and surfaces patterns ("you keep dropping the impact comparison") that one round won't show.` },
        { authorName: 'Sara T.', hoursAfter: 32, voteScore: 4,
          content: `Voice mode for the actual speech delivery is the move. Writing the speech is fine; rehearsing it is where the AI is irreplaceable, because nothing else gives you live POIs at home at 11pm.` },
      ],
    },

    {
      title: 'Voice mode hot take: best for impromptu, less useful for prepped',
      category: 'meta',
      authorName: 'Tarun B.',
      ageHours: 67,
      voteScore: 19,
      voteCount: 22,
      content:
`Used voice mode for a week. It's clearly the killer feature for APDA / Worlds impromptu prep; the time pressure and the live POIs are basically the round. For prepped formats (LD, Policy, PF) the typed mode still feels better because you can flow it cleanly and re-read.

Anyone else seeing this split? Curious if the voice team has plans for a "flow capture" overlay so it stops being a tradeoff.`,
      replies: [
        { authorName: 'Diya S.', hoursAfter: 11, voteScore: 6,
          content: `Same observation. Voice mode is unbeatable for impromptu speaks. For prepped, the typed flow is irreplaceable. Honestly feels like two different products serving different parts of the prep cycle.` },
        { authorName: 'Sara T.', hoursAfter: 17, voteScore: 4,
          content: `The flow capture overlay would change everything. Has anyone asked the team about it directly? Even a basic transcript with timestamps would be enough to flow off of.` },
        { authorName: 'Tarun B.', hoursAfter: 23, voteScore: 3,
          content: `Sara's right that it's the missing link. I'd genuinely pay extra for that feature. The voice mode round + a flow you can review is the full prep loop.` },
        { authorName: 'Akhil V.', hoursAfter: 41, voteScore: 2,
          content: `Workaround in the meantime: I screen-record voice rounds and re-listen for the sections I'd want to flow. Janky but it works until the overlay ships.` },
      ],
    },

    // ── General / cross-format ────────────────────────────────────────

    {
      title: 'What\'s the cleanest way to learn a new format from scratch?',
      category: 'general',
      authorName: 'Niharika P.',
      ageHours: 89,
      voteScore: 8,
      voteCount: 10,
      content:
`Background is APDA. Trying to pick up BP because the international circuit I want to do uses it. The structural differences (4 teams, extensions, no MG/MO collapse) are obvious from the rulebook. The harder thing is the JUDGING: what BP judges actually reward at the margin vs. what APDA judges do.

Has anyone written a clean side-by-side? Most of what I find is one-format or the other.`,
      replies: [
        { authorName: 'Hassan A.', hoursAfter: 17, voteScore: 5,
          content: `BP judges reward "engagement" specifically: show you understood the closing half's argument before you attack it. APDA judges reward "tightness": short, fast, decisive. Same speech style won't win in both rooms.` },
        { authorName: 'Olivia H.', hoursAfter: 31, voteScore: 3,
          content: `+1 to Hassan. Also: BP loves layered weighing (principled + practical). APDA mostly weighs on practical. Adapt the weighing pattern or you'll bleed wing votes.` },
        { authorName: 'Niharika P.', hoursAfter: 47, voteScore: 2,
          content: `Layered weighing is exactly what I keep tripping on. Going to drill it specifically. Thanks both.` },
        { authorName: 'Sara T.', hoursAfter: 64, voteScore: 1,
          content: `Practical advice: judge a few BP rounds before debating any. You learn the chair's mental model from the inside, which is faster than learning it from your own ballots.` },
      ],
    },

    {
      title: 'The single most underrated skill in any format?',
      category: 'general',
      authorName: 'Priya S.',
      ageHours: 110,
      voteScore: 31,
      voteCount: 36,
      content:
`Mine: writing the ballot in your head while you're still speaking the rebuttal. If you can't picture the judge's RFD by your last 30 seconds, you're not weighing; you're just rebutting.

Curious what other people would put in this slot. The thing nobody tells you in your first season that turns out to be 80% of why someone wins.`,
      replies: [
        { authorName: 'Olivia H.', hoursAfter: 14, voteScore: 14,
          content: `Mine: knowing when to drop YOUR OWN argument. Concession weighting is a craft. The novice instinct is to defend everything, but if arg #2 is sinking, leave it and double down on #1+#3. Way more matches won this way than lost.` },
        { authorName: 'Hassan A.', hoursAfter: 19, voteScore: 11,
          content: `Listening. Genuinely listening to the opponent instead of pre-writing your rebuttal during their speech. The number of varsity debaters who flow nothing past minute 3 is criminal.` },
        { authorName: 'Tarun B.', hoursAfter: 28, voteScore: 9,
          content: `Choosing what to LEAVE OUT. A 7-min speech with 3 contentions beats a 7-min speech with 5 every time, because depth wins and breadth lets the opponent pick which one to attack.` },
        { authorName: 'Sara T.', hoursAfter: 41, voteScore: 7,
          content: `Eye contact during your own speech. People underrate it because it sounds basic, but you can FEEL the panel lean forward when you find the right judge. Worth more than a hot warrant.` },
        { authorName: 'Aarav K.', hoursAfter: 56, voteScore: 5,
          content: `Reading the chair specifically. Wing-and-chair judges weight differently. Read the CHAIR's flow, weight to that one, accept you'll lose the wings sometimes. The ballot you can win is more valuable than the panel you can't.` },
        { authorName: 'Diya S.', hoursAfter: 78, voteScore: 4,
          content: `Pacing your own anxiety. Not "stay calm." Stay calm is impossible. KNOW what your anxiety does to your speech and pre-correct. Mine: I rush minute 1. So I deliberately slow my first 90 seconds. Nothing else changed; mark went up.` },
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

  // Map a thread definition to a Firestore-shaped thread doc, including
  // computed reply timestamps. The replies array is attached as a
  // non-Firestore field; the openThread modal reads it directly when
  // thread.seed is true.
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
        // replyCount derived from the replies array — never inflated past
        // what we actually have, so the badge on the list view doesn't
        // lie about what the click-through reveals.
        replyCount: replies.length,
        seed: true,
        seedV: SEED_VERSION,
        // Non-Firestore field. openThread reads this directly when
        // rendering a seed thread modal, instead of returning empty
        // from the rootId snapshot query.
        replies: replies,
      };
    });
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

  // Helper exposed for openThread: given a thread id, return the seeded
  // replies array (oldest first). Returns [] if the id doesn't match a
  // seed thread, so the caller can safely concatenate without checking.
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
