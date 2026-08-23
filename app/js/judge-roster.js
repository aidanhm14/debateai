/* ─────────────────────────────────────────────────────────────
 * JUDGE ROSTER — the rotating bench for general clash rounds.
 *
 * WHAT THIS IS
 * A round gets a judge the way a tournament gives you one: assigned,
 * not chosen. Each judge is a distinct character with a stated
 * paradigm, so the person about to speak knows what this ballot will
 * reward before they open their mouth. The draw is seeded on the
 * round id, so both debaters in a live round derive the SAME judge
 * with no server write, and nobody can reroll their way to a
 * friendlier one.
 *
 * WHAT THIS IS NOT
 * Not a judge picker. Assignment is deterministic per round.
 * Not a second panel. On ranked surfaces the season's pinned bench
 * (lib/judge-bench.mjs) still writes the verdict; this roster's
 * paradigm rides the ballot prompt as an emphasis lens only, inside
 * the same walls every lens lives in (js/judge-lenses.js): it may
 * shift what the ballot emphasises, it may NOT name a winner,
 * dictate points, override deciding on what was said, or invent a
 * burden nobody accepted. PARADIGM_GUARD below restates that to the
 * model every time a lens ships.
 *
 * NAMES ARE JUDGING PHILOSOPHIES, NEVER PEOPLE. "Flow judge" is a
 * category any debater already knows; "Sarah Chen, WUDC finalist"
 * would be a fabricated credential attached to a real verdict, which
 * is the thing /arena rejected. Keep it the first kind.
 *
 * 2026-08-23, the founder: the bench used to be ten invented
 * characters ("The Umpire", "The Playwright", "The Editor"), and it
 * read as machine-generated rather than as a tournament handing you
 * a judge. It is now FOUR, each named for a real judging philosophy.
 * Do not grow it back into a cast; a bench a debater cannot hold in
 * their head is a bench they stop reading.
 *
 * EVERY JUDGE STATES ITS COST. The "Costs you" row is not optional
 * on a new entry, same discipline as judge-lenses.js: a paradigm you
 * cannot lose under is an advert, not a paradigm.
 *
 * COPY RULE: every string renders to users. No em dashes.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PARADIGM_GUARD =
    'This judge paradigm shifts emphasis only. It may change what the ballot ' +
    'emphasises, what gets resolved first, and how hard particular mistakes are ' +
    'punished. It may NOT name a winner, dictate scores, override deciding on ' +
    'what was actually said, or invent a burden neither side accepted. When the ' +
    'paradigm and the record conflict, the record wins.';

  var ROSTER = [
    {
      key: "dean",
      name: "Warrant judge",
      glyph: "◇",
      color: "#b91f23",
      tag: "Wants the reasoning said out loud, not implied.",
      note: [
        "I have heard every conclusion before. What I have not always heard is the step that gets you there.",
        "If the run from your claim to why it matters never got said out loud, I will not say it for you. The ballot will name the exact step you skipped.",
        "Do the work in the open and I am easy to win in front of.",
      ],
      inPractice: [
        { k: "Rewards", v: "Arguments built in the open. Claim, then the reason, then why it decides the round." },
        { k: "Punishes", v: "Confident conclusions with no visible support." },
        { k: "Costs you", v: "Style points. A beautiful line that proves nothing gets read as nothing." },
      ],
      lens:
        "Judge on stated reasoning. Reward arguments whose logic is explicit: claim, warrant, and why it matters. Never fill a logical gap on a speaker's behalf; if a key step was skipped, say exactly which one, on both sides. Give no credit for rhetorical polish that carries no reasoning.",
    },
    {
      key: "backrow",
      name: "Lay judge",
      glyph: "○",
      color: "#0e7490",
      tag: "A smart stranger who has never seen a debate round.",
      note: [
        "I sat down in the back with no flow sheet and no glossary. I am paying attention, which is all you get.",
        "If you have to be a debater to understand why you won, you did not win in front of me. Explain the technical thing once, plainly, and it counts.",
        "The test I use is simple. Could I repeat your best argument to someone in the hallway and have it land?",
      ],
      inPractice: [
        { k: "Rewards", v: "Plain language. Comparisons a stranger could repeat afterwards." },
        { k: "Punishes", v: "Unexplained jargon. Arguments that only score inside the bubble." },
        { k: "Costs you", v: "Technical wins. A clever structural point that was never translated does not reach my ballot." },
      ],
      lens:
        "Judge as an attentive, intelligent listener who has never seen competitive debate. Reward clear explanation and comparisons an outsider could repeat. Give no weight to jargon or technique that was never explained in plain terms. Do not vote on a technical point that was not made understandable.",
    },
    {
      key: "bookkeeper",
      name: "Impact judge",
      glyph: "▤",
      color: "#166534",
      tag: "Everything you claim goes in a ledger, and the ledger gets totalled.",
      note: [
        "You will both end this round claiming harms and benefits. My whole job is the totalling.",
        "How big, how likely, how soon. If you never told me, I have to guess, and the ballot will say you made me guess.",
        "One impact, weighed against the other side's best, beats five impacts left in a pile.",
      ],
      inPractice: [
        { k: "Rewards", v: "Explicit comparison. \"Even if they win X, our Y is bigger and sooner, and here is why.\"" },
        { k: "Punishes", v: "Impact piles nobody weighed. Claims of catastrophe with no probability attached." },
        { k: "Costs you", v: "Breadth. Time spent stacking a sixth harm was time not spent weighing your first." },
      ],
      lens:
        "Judge on weighing. Resolve the round through explicit comparison: magnitude, probability, and timeframe. Reward speakers who compare their case against the other side's best case directly. Where neither side weighed, name the default you fell back on and say the debaters left it to you.",
    },
    {
      key: "umpire",
      name: "Flow judge",
      glyph: "▦",
      color: "#7c2d12",
      tag: "Keeps the record, and the record decides.",
      note: [
        "I write down what was said, in the speech it was said in. That page is what the round gets decided on.",
        "An argument your opponent never touched is standing at the end, and I will treat it as standing, once you tell me it matters. An answer you never gave does not exist because you meant to give it.",
        "Do not rewrite history in your last speech. I was here for the first one.",
      ],
      inPractice: [
        { k: "Rewards", v: "Direct clash. Answering the argument they actually made, then saying what survived." },
        { k: "Punishes", v: "Dropped arguments that got extended. Summaries that describe a round that did not happen." },
        { k: "Costs you", v: "Fresh brilliance in the final speech. A new argument at the end lands on a closed record." },
      ],
      lens:
        "Judge strictly on the record of what was said, speech by speech. An argument that was extended and never answered counts once its significance was stated. Penalise final-speech mischaracterisation of earlier speeches, and give no weight to arguments introduced after the other side could answer them.",
    },
  ];

  // ── deterministic draw ────────────────────────────────────────────
  // FNV-1a over the seed string. Same seed, same judge, both clients,
  // no server write. Seed with the round id (live) or a per-round
  // random id minted once at round start (solo voice).
  function hashSeed(str) {
    var h = 0x811c9dc5;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function draw(seed) {
    return ROSTER[hashSeed(seed) % ROSTER.length];
  }

  function byKey(key) {
    for (var i = 0; i < ROSTER.length; i++) {
      if (ROSTER[i].key === key) return ROSTER[i];
    }
    return null;
  }

  // The string that ships into a ballot prompt. Always guard-wrapped;
  // callers never concatenate a bare lens.
  function promptBlock(judge) {
    if (!judge) return '';
    return 'ASSIGNED JUDGE PARADIGM (' + judge.name + '): ' + judge.lens + '\n' + PARADIGM_GUARD;
  }

  window.JudgeRoster = {
    ROSTER: ROSTER,
    draw: draw,
    byKey: byKey,
    promptBlock: promptBlock,
    GUARD: PARADIGM_GUARD,
  };
})();
