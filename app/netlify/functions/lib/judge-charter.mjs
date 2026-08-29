// ─────────────────────────────────────────────────────────────
// THE JUDGE CHARTER — published before the round, versioned, hashed.
//
// WHY THIS EXISTS
// An AI judge that the operator owns, tunes, and can silently update is
// house control of the outcome. That is the objection a plaintiff's
// lawyer makes in the first paragraph, and it is the same hole the data
// thesis already concedes: AI-judge resolution is circular. While that
// was only an epistemic problem it could stay an open question. The
// moment credits, standing, or money settle off a verdict, it becomes a
// legal one.
//
// The answer is not "trust the model". It is to remove the operator's
// ability to move an outcome quietly:
//
//   1. PUBLISHED RUBRIC. The criteria are written down, versioned, and
//      HASHED before the round. Every judgment records the hash it was
//      decided under, so nobody can be judged by a rubric that was
//      edited after they spoke. Edit the rubric and the hash changes,
//      which is exactly the point.
//   2. PINNED MODEL. The judge model is pinned per season and
//      disclosed. An operational override still exists, because a
//      provider outage cannot be allowed to freeze every round, but it
//      CANNOT BE QUIET: an override is stamped on every audit record
//      and reported by the public charter as a deviation from the pin.
//   3. NO OPERATOR INTEREST. The fee is identical whichever side wins,
//      and there is no rake at all. Stated here as a promise and
//      asserted against the settlement code by the test script.
//
// This module is PURE. No I/O, no Firestore, no clock of its own. It is
// the single source of truth for what the judge promised to do, and
// scripts/test-judge-integrity.mjs asserts the promises hold.
//
// COPY RULE: every string in RUBRICS, FEE_POLICY, and APPEAL_POLICY is
// rendered on a public page. No em dashes, no banned phrases.
// ─────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';

// ── the published rubric ────────────────────────────────────────────
//
// This is the plain-language, public statement of the method the
// adjudication core (lib/adjudication.mjs) implements. The core is the
// prompt; this is the promise. If you change how the judge decides, you
// change BOTH, mint a new rubric version here, and pin the new version
// to a new season. Editing a rubric version in place is the one thing
// this whole file exists to prevent.
export const RUBRICS = {
  'adjudication-2026-08': {
    version: 'adjudication-2026-08',
    publishedAt: Date.UTC(2026, 6, 30),
    title: 'How the ballot is decided',
    summary:
      'The comparative is the unit of decision. Nothing scores for being true in the abstract. '
      + 'It scores only if the side showed it is better than the other side\'s world. '
      + 'The judge decides on what was actually said, resolves the clashes, and names the test that resolved each one.',

    // Applied to every key argument, in this order.
    tests: [
      { key: 'comparative', label: 'Comparative', body: 'An argument never weighed against the other side is dead weight, however true.' },
      { key: 'symmetry', label: 'Symmetry', body: 'If the same mechanism runs on both sides it cancels. The side claiming it has to prove the asymmetric margin.' },
      { key: 'delta', label: 'Delta', body: 'The difference from the counterfactual has to be shown. No marginal change means the point is discounted to near zero.' },
      { key: 'status-quo', label: 'Status quo', body: 'A change that already happens, or is already priced in, is not offense.' },
      { key: 'warrant', label: 'Warrant', body: 'Characterization with no mechanism is assertion. Painting a picture of what could be is not explaining why it is.' },
      { key: 'burden', label: 'Burden', body: 'The judge names the precise sub-claim the case needed and never discharged. That gap is frequently the whole decision.' },
      { key: 'terminal', label: 'Terminal impact', body: 'Awareness rising, money being raised, or confidence falling is not an impact until the next causal step is proven.' },
      { key: 'responsive', label: 'Responsiveness', body: 'A later speaker has to beat the answer that was actually given, not repeat the original claim with more confidence.' },
      { key: 'actor', label: 'Actor incentive and capacity', body: 'For any claimed behavior change: who acts, why they want to, what power they have, and whether the timeline fits.' },
      { key: 'motion-shape', label: 'Motion shape', body: 'Teams win the actual words. Regrets the rise of something is not regrets it existing. Alleged is not convicted.' },
    ],

    // Force order. Named out loud in the ballot when it decides a clash.
    weighing: [
      { rank: 1, label: 'Logically prior', body: 'If A has to be true before B\'s benefit can land, A is resolved first and gates B.' },
      { rank: 2, label: 'Certainty against magnitude', body: 'A certain smaller impact beats a speculative larger one unless the larger one was actually weighed in.' },
      { rank: 3, label: 'Offense against defense', body: 'Mitigation dents. A turn, where the opponent\'s own material becomes your offense, outweighs pure defense.' },
      { rank: 4, label: 'Proximity and vulnerability', body: 'Ties break toward the more affected, less mobile, more vulnerable actor.' },
      { rank: 5, label: 'Intermediary harm', body: 'A side pays for the bad step its payoff routes through before the payoff is credited.' },
      { rank: 6, label: 'Specific route against broad vibe', body: 'Where both sides name plausible impacts, the cleaner causal route wins over the grander one with missing links.' },
    ],

    // The async ballot scorecard. Each side is scored alone on each axis.
    dimensions: [
      { key: 'clarity', label: 'Clarity', scale: '1 to 10', body: 'Structure, signposting, intelligibility.' },
      { key: 'reasoning', label: 'Reasoning', scale: '1 to 10', body: 'Warrants and link chains.' },
      { key: 'responsiveness', label: 'Responsiveness', scale: '1 to 10', body: 'Direct clash with what the other side actually said.' },
      { key: 'weighing', label: 'Weighing', scale: '1 to 10', body: 'Impact comparison and crystallization of the ballot story.' },
    ],

    speakerPoints: {
      scale: '25.0 to 30.0, one decimal',
      body:
        'The default is the middle of the scale. A speaker rises above it only when the judge can name the specific thing that earned it: '
        + 'a landed turn, a real extension, genuine comparative weighing, a warranted mechanism. '
        + 'A speaker drops below it for a named flaw: a dropped contention, an unwarranted key claim, non-responsive rebuttal, no weighing. '
        + 'Speaker points do not decide the round and are reported separately from the verdict.',
    },

    // No coin flips. The default ladder is fixed and stated in the ballot.
    deadlock: {
      body: 'When a clash is genuinely unresolved the judge names an explicit default rather than picking. The ladder is fixed and stated in the ballot.',
      ladder: [
        'The side whose comparative was actually explained.',
        'Capacity, when incentive is symmetric on both sides.',
        'The most certain impact.',
      ],
    },

    // Limits on the judge, not on the debaters. These are the promises
    // that make a ballot reviewable.
    outOfBounds: [
      'No model repair. Funding, incentives, actor capacity, legal authority, and timelines are not filled in because they seem plausible. If the speech did not say it, it stays a gap.',
      'No invented arguments. The judge never credits a point nobody made.',
      'No reward for a claim that is flatly false in the real world, even when it went unanswered.',
      'No deciding on what the judge would have argued. The flow is the record.',
      'A judge instruction supplied by a debater may shift emphasis. It may never name a winner, dictate scores, or override deciding on the flow.',
    ],
  },

  // ── adjudication-2026-08b ────────────────────────────────────────
  //
  // Supersedes adjudication-2026-08. Three changes, and all three are
  // about the same complaint: the ballot could tell you that you lost
  // without telling you what you lost ON.
  //
  //   1. PERSUASION IS SCORED, AND FENCED. A round is spoken to a room,
  //      and a method that scores only the flow quietly teaches debaters
  //      that being understood does not count. So persuasion becomes a
  //      fifth scorecard axis. It is fenced hard in the same breath: it
  //      scores whether the comparative actually landed on a reasonable
  //      listener, never charm, confidence, accent, fluency, or volume,
  //      and it cannot outrank the flow. It breaks a tie the flow left
  //      genuinely tied. That fence is the whole reason it is safe to
  //      score at all.
  //   2. THE DECIDING ISSUE IS NAMED. Every ballot states the one clash
  //      the round turned on. This is the fairness fix: an appeal, a
  //      coach, and a debater can all check whether the judge decided
  //      the round they actually had, and the panel can measure whether
  //      its jurors agreed on WHY, not only on who.
  //   3. THE DEBATER-FACING LIMITS ARE EXPLICIT. Two new out-of-bounds
  //      lines: no penalty for a norm nobody stated before the round,
  //      and an agreed paradigm can never widen a burden past what both
  //      sides accepted. Both exist because a paradigm system is only
  //      fair if the downside of picking one is knowable in advance.
  'adjudication-2026-08b': {
    version: 'adjudication-2026-08b',
    publishedAt: Date.UTC(2026, 7, 12),
    title: 'How the ballot is decided',
    summary:
      'The comparative is the unit of decision. Nothing scores for being true in the abstract. '
      + 'It scores only if the side showed it is better than the other side\'s world. '
      + 'The judge decides on what was actually said, resolves the clashes, names the one issue that decided the round, and names the test that resolved it. '
      + 'Persuasion is scored on its own axis and can break a genuine tie. It never overrides the flow.',

    tests: [
      { key: 'comparative', label: 'Comparative', body: 'An argument never weighed against the other side is dead weight, however true.' },
      { key: 'symmetry', label: 'Symmetry', body: 'If the same mechanism runs on both sides it cancels. The side claiming it has to prove the asymmetric margin.' },
      { key: 'delta', label: 'Delta', body: 'The difference from the counterfactual has to be shown. No marginal change means the point is discounted to near zero.' },
      { key: 'status-quo', label: 'Status quo', body: 'A change that already happens, or is already priced in, is not offense.' },
      { key: 'warrant', label: 'Warrant', body: 'Characterization with no mechanism is assertion. Painting a picture of what could be is not explaining why it is.' },
      { key: 'burden', label: 'Burden', body: 'The judge names the precise sub-claim the case needed and never discharged. That gap is frequently the whole decision.' },
      { key: 'terminal', label: 'Terminal impact', body: 'Awareness rising, money being raised, or confidence falling is not an impact until the next causal step is proven.' },
      { key: 'responsive', label: 'Responsiveness', body: 'A later speaker has to beat the answer that was actually given, not repeat the original claim with more confidence.' },
      { key: 'actor', label: 'Actor incentive and capacity', body: 'For any claimed behavior change: who acts, why they want to, what power they have, and whether the timeline fits.' },
      { key: 'motion-shape', label: 'Motion shape', body: 'Teams win the actual words. Regrets the rise of something is not regrets it existing. Alleged is not convicted.' },
      { key: 'landed', label: 'Did it land', body: 'An argument the other side could not reasonably follow did not do its work. The judge says where it stopped being followable and treats that as the speaker\'s cost, not the listener\'s.' },
    ],

    weighing: [
      { rank: 1, label: 'Logically prior', body: 'If A has to be true before B\'s benefit can land, A is resolved first and gates B.' },
      { rank: 2, label: 'Certainty against magnitude', body: 'A certain smaller impact beats a speculative larger one unless the larger one was actually weighed in.' },
      { rank: 3, label: 'Offense against defense', body: 'Mitigation dents. A turn, where the opponent\'s own material becomes your offense, outweighs pure defense.' },
      { rank: 4, label: 'Proximity and vulnerability', body: 'Ties break toward the more affected, less mobile, more vulnerable actor.' },
      { rank: 5, label: 'Intermediary harm', body: 'A side pays for the bad step its payoff routes through before the payoff is credited.' },
      { rank: 6, label: 'Specific route against broad vibe', body: 'Where both sides name plausible impacts, the cleaner causal route wins over the grander one with missing links.' },
      { rank: 7, label: 'Persuasion, last and only on a tie', body: 'When the comparative work is genuinely level, the side that made a reasonable listener understand and believe its world takes it. This rung is reached only after every rung above it came out even, and the ballot has to say so out loud.' },
    ],

    dimensions: [
      { key: 'clarity', label: 'Clarity', scale: '1 to 10', body: 'Structure, signposting, intelligibility.' },
      { key: 'reasoning', label: 'Reasoning', scale: '1 to 10', body: 'Warrants and link chains.' },
      { key: 'responsiveness', label: 'Responsiveness', scale: '1 to 10', body: 'Direct clash with what the other side actually said.' },
      { key: 'weighing', label: 'Weighing', scale: '1 to 10', body: 'Impact comparison and crystallization of the ballot story.' },
      { key: 'persuasion', label: 'Persuasion', scale: '1 to 10', body: 'Whether the case actually moved a reasonable listener: concrete stakes, a world you can picture, an argument built to be understood the first time. Not charm, confidence, accent, fluency, or volume.' },
    ],

    speakerPoints: {
      scale: '25.0 to 30.0, one decimal',
      body:
        'The default is the middle of the scale. A speaker rises above it only when the judge can name the specific thing that earned it: '
        + 'a landed turn, a real extension, genuine comparative weighing, a warranted mechanism. '
        + 'A speaker drops below it for a named flaw: a dropped contention, an unwarranted key claim, non-responsive rebuttal, no weighing. '
        + 'Speaker points do not decide the round and are reported separately from the verdict.',
    },

    // Every ballot names the single clash the round turned on. It is the
    // thing a debater can actually argue with, and it is what makes an
    // appeal reviewable instead of a rematch.
    decidingIssue: {
      body:
        'Every ballot names the one issue that decided the round, in a short phrase, and names the test that resolved it. '
        + 'A ballot that cannot name its deciding issue has not resolved the round, it has summarized it. '
        + 'On a panel, whether the jurors named the SAME deciding issue is reported next to whether they named the same winner: '
        + 'three judges agreeing on the winner for three different reasons is a weaker result than the vote count alone suggests, and hiding that would be flattering the number.',
    },

    deadlock: {
      body: 'When a clash is genuinely unresolved the judge names an explicit default rather than picking. The ladder is fixed and stated in the ballot.',
      ladder: [
        'The side whose comparative was actually explained.',
        'Capacity, when incentive is symmetric on both sides.',
        'The most certain impact.',
        'The side that made its world understandable to a reasonable listener, stated in the ballot as a persuasion default.',
      ],
    },

    outOfBounds: [
      'No model repair. Funding, incentives, actor capacity, legal authority, and timelines are not filled in because they seem plausible. If the speech did not say it, it stays a gap.',
      'No invented arguments. The judge never credits a point nobody made.',
      'No reward for a claim that is flatly false in the real world, even when it went unanswered.',
      'No deciding on what the judge would have argued. The flow is the record.',
      'A judge instruction supplied by a debater may shift emphasis. It may never name a winner, dictate scores, or override deciding on the flow.',
      'No penalty for a norm nobody stated. A debater is never marked down for missing a convention that was not in the format, the rubric, or an agreed paradigm they could read before the round.',
      'An agreed paradigm may sharpen a burden both sides accepted. It may never invent a new one, and it may never be read to require something a debater had no notice of.',
      'Persuasion never overrides the flow. It is scored on its own axis and may break a tie the flow left level. Delivery, fluency, accent, and confidence are not persuasion and are not scored at all.',
    ],
  },

  // ── adjudication-2026-08c ───────────────────────────────────────
  //
  // New public rounds use one casual 1v1 method and one 100-point
  // score. Earlier rubric versions stay byte-for-byte intact so an old
  // ballot can always be checked against the promise it received.
  'adjudication-2026-08c': {
    version: 'adjudication-2026-08c',
    publishedAt: Date.UTC(2026, 7, 27),
    title: 'How a casual 1v1 is scored',
    summary:
      'One person argues Pro and one argues Con. The judge decides from what both people actually said, names the issue that decided the round, and gives each side one argument score from 1 to 100. Competitive debate formats and their special rules are not used.',
    tests: [
      { key: 'claim', label: 'Clear claim', body: 'The side states what it wants the listener to believe.' },
      { key: 'reason', label: 'Reasoning', body: 'Each important claim has a believable explanation connecting it to the conclusion.' },
      { key: 'example', label: 'Support', body: 'Examples, facts, or concrete scenarios support the reasoning instead of replacing it.' },
      { key: 'responsive', label: 'Direct response', body: 'The side answers the strongest point the other person actually made.' },
      { key: 'comparative', label: 'Comparison', body: 'The side explains why its consequence matters more than the other side\'s consequence.' },
      { key: 'accuracy', label: 'Accuracy', body: 'A flatly false claim earns no credit merely because it went unanswered.' },
      { key: 'follow-through', label: 'Follow-through', body: 'The side carries its key idea through the round and answers the response to it.' },
      { key: 'understood', label: 'Understood once', body: 'A reasonable listener can follow the argument the first time they hear it.' },
    ],
    weighing: [
      { rank: 1, label: 'Reasoning', body: 'A conclusion with a complete explanation beats a larger claim with a missing link.' },
      { rank: 2, label: 'Direct response', body: 'A point that survives the other side\'s best answer beats one that was left unanswered.' },
      { rank: 3, label: 'Probability and stakes', body: 'The judge compares how likely each consequence is and how much it matters.' },
      { rank: 4, label: 'Specificity', body: 'A concrete route to a consequence beats a broad prediction with no stated mechanism.' },
      { rank: 5, label: 'Persuasion, only after substance', body: 'If the substantive comparison is genuinely level, the argument that a reasonable listener could best understand and believe takes the round. Charm, confidence, accent, fluency, and volume never count.' },
    ],
    dimensions: [
      { key: 'clarity', label: 'Clarity', scale: '1 to 10', body: 'Could a listener follow the argument the first time?' },
      { key: 'reasoning', label: 'Reasoning', scale: '1 to 10', body: 'Did the claims have complete and believable explanations?' },
      { key: 'responsiveness', label: 'Responses', scale: '1 to 10', body: 'Did the side answer what the other person actually said?' },
      { key: 'weighing', label: 'Comparison', scale: '1 to 10', body: 'Did the side explain which consequences mattered more and why?' },
      { key: 'strategy', label: 'Focus', scale: '1 to 10', body: 'Did the side spend its time on the issues that decided the round?' },
      { key: 'persuasion', label: 'Persuasion', scale: '1 to 10', body: 'Did the argument move a reasonable listener through concrete stakes and a checkable story? Not charm, confidence, accent, fluency, polish, or volume.' },
    ],
    speakerPoints: {
      scale: '1 to 100, one decimal',
      body:
        'The public argument score is derived from the six dimensions. Reasoning counts 25 percent, responses 20 percent, comparison 20 percent, clarity 15 percent, focus 10 percent, and persuasion 10 percent. The judge cannot replace that calculation with a separate impression. The score does not decide the winner and is reported separately from the verdict.',
    },
    decidingIssue: {
      body:
        'Every ballot names the one question that decided the round and explains why one side answered it better. A ballot that cannot name that question has summarized the conversation instead of deciding it.',
    },
    deadlock: {
      body: 'When the main issue is genuinely even, the judge states which published comparison resolved it instead of inventing a tie-break.',
      ladder: [
        'The side with the more complete explanation.',
        'The side that better answered the other person\'s strongest point.',
        'The side with the more likely and better-supported consequence.',
        'Persuasion, only when the substantive comparison is still genuinely level.',
      ],
    },
    outOfBounds: [
      'No invented support. The judge never fills a missing fact, mechanism, or answer because it seems plausible.',
      'No invented arguments. The judge never credits a point nobody made.',
      'No format penalty. Competitive debate conventions, named formats, and unstated jargon are not part of a casual 1v1 ballot.',
      'No identity or delivery bias. Name, school, accent, fluency, confidence, volume, and apparent experience never affect the verdict or score.',
      'Persuasion never overrides the arguments. It may resolve only a substantive tie and may never repair a missing reason or response.',
      'A judge preference may shift emphasis. It may never name a winner, dictate a score, invent a burden, or add a rule that both sides did not see before the round.',
    ],
  },
};

// ── seasons ─────────────────────────────────────────────────────────
//
// A season pins a rubric version AND a judge panel for a fixed window.
// Seasons are append-only history: once a window has closed, its entry
// is a record of what judged those rounds and must not be edited.
//
// `from` is inclusive, `to` is exclusive. The last season's `to` is
// null, meaning open-ended.
export const SEASONS = [
  {
    id: '2026-preseason',
    from: 0,
    to: Date.UTC(2026, 6, 30),
    rubricVersion: 'adjudication-2026-07',
    published: false,
    panel: null,
    note:
      'Single judge, one model call per ballot, and the criteria were not published in advance. '
      + 'Recorded here so ballots issued in this window are still attributable to a stated configuration rather than quietly reclassified under the newer rubric.',
  },
  {
    id: '2026-fall',
    from: Date.UTC(2026, 6, 30),
    // Closed early on 2026-08-12 when the panel and the rubric both
    // changed. Shortening an OPEN window is the append-only way to start
    // a new season; the closed record below must not be edited again.
    to: Date.UTC(2026, 7, 12),
    rubricVersion: 'adjudication-2026-08',
    published: true,
    panel: {
      size: 3,
      // A majority of the panel that actually returned a vote. Two
      // agreeing jurors carry a verdict; a 1-1 split after a juror
      // failure does not.
      quorum: 2,
      // Three independent model families on purpose. Three calls to one
      // model measure sampling noise; three families measure whether the
      // round was actually decidable. Model ids are the ones this repo
      // already pins in its brain proxies.
      jurors: [
        { id: 'j1', provider: 'anthropic', model: 'claude-sonnet-5' },
        { id: 'j2', provider: 'openai', model: 'gpt-4o' },
        { id: 'j3', provider: 'google', model: 'gemini-2.0-flash' },
      ],
      // Disclosed and deliberately not a tie-break in the house's
      // favor. An even split is recorded as unresolved: the debaters
      // still get every juror's reasoning, the ladder does not move,
      // and any market voids at face value. Refunding is side-neutral;
      // any tie-break rule would hand the operator a thumb.
      noMajority: 'unresolved',
    },
    note: 'First season with a published rubric, a pinned three-family panel, and a human appeal route.',
  },
  {
    id: '2026-persuasion',
    from: Date.UTC(2026, 7, 12),
    // This window was open when the next rubric was published. Closing
    // it at a future UTC boundary preserves every earlier ballot under
    // this exact configuration and avoids backdating the new method.
    to: Date.UTC(2026, 7, 28),
    rubricVersion: 'adjudication-2026-08b',
    published: true,
    panel: {
      size: 3,
      quorum: 2,
      // Three independent model families, refreshed to each family's
      // current top tier. Every id here was verified live against the
      // real ballot prompt on 2026-08-11 before it was pinned, because
      // a pin nobody has run is a promise nobody has kept.
      //
      // EFFORT IS PART OF THE PIN. A ballot is a bounded task against a
      // published method, and the top reasoning tiers spend minutes
      // re-deriving that method. Measured on the full prompt: `low`
      // returned clean, parseable ballots on both live seats and roughly
      // halved wall clock (anthropic 32.4s to 16.1s, openai 28.3s to
      // 13.5s). Undisclosed effort would be exactly the kind of quiet
      // dial this charter exists to remove, so it is pinned and audited
      // alongside the model id.
      jurors: [
        { id: 'j1', provider: 'anthropic', model: 'claude-fable-5', effort: 'low' },
        { id: 'j2', provider: 'openai', model: 'gpt-5.5', effort: 'low' },
        { id: 'j3', provider: 'google', model: 'gemini-3.6-flash' },
      ],
      noMajority: 'unresolved',
    },
    note:
      'Panel refreshed to each family\'s current top tier, and the rubric now scores persuasion on its own fenced axis and requires every ballot to name the issue that decided the round. '
      + 'DISCLOSED AT PIN TIME: the Google seat was dark when this season opened. The account\'s Gemini billing was exhausted on 2026-08-11, so that juror returns a provider error and the panel runs two-handed until it is topped up. '
      + 'Two agreeing jurors still carry a verdict; a two-handed split records as unresolved, which is the correct posture and not a workaround. '
      + 'DeepSeek is wired as a standby family so the third seat can be re-pinned without a new provider integration.',
  },
];

// Reuse the exact panel object whose three models and effort pins were
// verified live for the previous season. No provider, model, effort, or
// quorum changes at this boundary; only the published rubric changes.
SEASONS.push({
  id: '2026-casual-1v1',
  from: Date.UTC(2026, 7, 28),
  // Close at a future boundary published before the Open. Earlier
  // ballots stay under the exact configuration that judged them.
  to: Date.UTC(2026, 7, 29, 10),
  rubricVersion: 'adjudication-2026-08c',
  published: true,
  panel: SEASONS[SEASONS.length - 1].panel,
  note:
    'New rounds use one casual one-on-one method and one score out of 100. Competitive format rules and team structures are not used. The verified panel and its effort pins are unchanged.',
});

// The Debatable Open uses the same three pinned model families and the
// same published rubric. The operational change is narrower: all three
// seats must return before the council's two-vote majority can carry.
// This preserves majority rule without presenting a two-seat response as
// a three-judge council. A provider-wide failure may still enter the
// disclosed single-Claude emergency path in judge-run.mjs.
SEASONS.push({
  id: '2026-open-council',
  from: Date.UTC(2026, 7, 29, 10),
  to: Date.UTC(2027, 3, 1),
  rubricVersion: 'adjudication-2026-08c',
  published: true,
  panel: {
    ...SEASONS[SEASONS.length - 1].panel,
    minimumVotes: 3,
  },
  note:
    'The three pinned model families and the published casual one-on-one rubric are unchanged. All three council seats must return before a two-vote majority can carry. A short council retries instead of presenting two judges as three.',
});

export const SEASON_IDS = SEASONS.map((s) => s.id);

// Which season governs a moment in time.
export function seasonFor(nowMs) {
  const t = Number(nowMs);
  const at = Number.isFinite(t) ? t : 0;
  for (const s of SEASONS) {
    if (at >= s.from && (s.to === null || at < s.to)) return s;
  }
  // Past the last declared window. Fall through to the most recent
  // season rather than inventing one, and let the charter report that
  // the calendar needs extending.
  return SEASONS[SEASONS.length - 1];
}

export function seasonById(id) {
  return SEASONS.find((s) => s.id === id) || null;
}

// True when `nowMs` sits past every declared season window. The public
// charter surfaces this so an expired calendar is visible rather than
// silently reusing a stale pin.
export function seasonExpired(nowMs) {
  const last = SEASONS[SEASONS.length - 1];
  if (last.to === null) return false;
  return Number(nowMs) >= last.to;
}

// ── the hash ────────────────────────────────────────────────────────
//
// Canonical, key-sorted serialization so the digest depends on rubric
// CONTENT and not on how the object literal happens to be ordered.
// Anyone can recompute this from the published charter JSON and confirm
// the rubric that judged them is the rubric on the page.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function canonicalJson(value) {
  return canonical(value);
}

// sha256 of the canonical rubric, truncated to 16 hex chars. Full
// length adds no practical collision resistance for a document anyone
// can fetch and diff, and a short digest is one a debater can actually
// eyeball against a ballot.
export function rubricHash(version) {
  const r = RUBRICS[version];
  if (!r) return '';
  return createHash('sha256').update(canonical(r)).digest('hex').slice(0, 16);
}

export function rubricFor(version) {
  return RUBRICS[version] || null;
}

// ── fee neutrality ──────────────────────────────────────────────────
//
// Fix 4. The operator's take must not depend on who wins. Here that is
// structural rather than a policy anyone has to remember: settlement is
// pari-mutuel off the staked pool, there is no rake term at all, and
// there is no house position to pay. scripts/test-judge-integrity.mjs
// reads lib/credits.mjs and asserts the payout function contains no
// rake, no fee, and no reference to a house account, so a later commit
// cannot introduce a side-dependent cut quietly.
export const FEE_POLICY = {
  version: 'fee-2026-08',
  rake: 0,
  body:
    'The operator earns the same amount whichever side wins a round. There is no rake, no spread, and no house position. '
    + 'Prediction settlement is pari-mutuel: the pool staked by the people who were wrong is what pays the people who were right, '
    + 'and the platform takes nothing out of it in either direction.',
  guarantees: [
    'No fee, cut, or rake is taken from a settled pool.',
    'The platform holds no position in any market and cannot stake one.',
    'Debaters cannot stake on their own round.',
    'Subscription and token pricing is set per account and never varies with a verdict.',
    'Prediction credits are free, non-purchasable, non-transferable, and non-redeemable.',
    'The audience vote is a separate public reading and never settles a market or moves the ladder.',
  ],
};

// ── appeals ─────────────────────────────────────────────────────────
//
// Fix 3. Real debate has an appeal route and it is unremarkable there.
// Windows are stated up front so the route is a right rather than a
// favor the operator grants case by case.
export const APPEAL_POLICY = {
  version: 'appeal-2026-08',
  windowHours: 72,
  grounds: [
    { key: 'not-on-flow', label: 'Decided on something nobody said', body: 'The ballot credits an argument that is not in the transcript, or repairs a case the speech never made.' },
    { key: 'missed-drop', label: 'Missed a drop that decided the round', body: 'A point the ballot treats as answered was never answered.' },
    { key: 'misread-motion', label: 'Misread the motion', body: 'The ballot judged wording the motion does not carry.' },
    { key: 'rubric-departure', label: 'Departed from the published rubric', body: 'The stated criteria, weighing order, or deadlock ladder was not applied.' },
    { key: 'panel-split', label: 'The panel did not agree', body: 'The jurors split and the round turns on which one you believe.' },
    { key: 'process', label: 'Something went wrong with the round', body: 'A missing transcript, a truncated speech, or the wrong format applied.' },
  ],
  outcomes: [
    { key: 'upheld', body: 'The verdict stands. The reviewer says why against the rubric.' },
    { key: 'overturned', body: 'The verdict flips. Standing and any settled credits are reversed and re-paid off the corrected result.' },
    { key: 'void', body: 'The round produced no usable result. Standing is reversed and every stake is refunded at face value.' },
  ],
  body:
    'Either debater can appeal a ballot within 72 hours. A human reviewer, not the model that wrote it, decides the appeal. '
    + 'Filing freezes settlement on that round so credits do not move on a verdict under review. '
    + 'Reviewers cannot appeal or review a round they debated in, and every resolution is recorded with the reviewer and the reason.',
  guarantees: [
    'A human decides. The appeal is never routed back to the model that wrote the ballot.',
    'Filing an appeal freezes settlement on that round.',
    'A reviewer cannot rule on a round they took part in.',
    'The original ballot is never deleted. An overturn is recorded as a revision alongside it.',
  ],
};

// ── what gets logged ────────────────────────────────────────────────
//
// Fix 5. Stated publicly so the retention promise is checkable, and so
// the audit record's shape is documented in one place rather than
// inferred from whatever the writer happened to set.
export const AUDIT_POLICY = {
  version: 'audit-2026-08',
  body:
    'Every ballot writes an immutable audit record at the moment it is issued. Records are never edited. '
    + 'A correction is appended as a revision, the same posture as the credit ledger.',
  fields: [
    'The season, rubric version, and rubric hash the round was decided under.',
    'Every juror: provider, model id, whether it was the pinned model or an override, and its raw vote.',
    'The panel outcome: majority, agreement level, dissenting jurors, and the spread between jurors.',
    'A hash of the exact prompt each juror received, so the input can be shown to have been identical.',
    'Timing and failures, including any juror that did not return a vote.',
    'Every appeal, who reviewed it, the outcome, and the reason.',
  ],
};

export const CHARTER_VERSION = 'charter-2026-08';

// The public document. `running` is what the process is actually
// configured to do right now, which is deliberately reported next to
// the pin rather than in place of it: a disclosed override is
// acceptable, a silent one is the whole problem.
export function charterDoc(nowMs, running = null) {
  const season = seasonFor(nowMs);
  const rubric = rubricFor(season.rubricVersion);
  return {
    charterVersion: CHARTER_VERSION,
    generatedAt: Number(nowMs) || 0,
    season: {
      id: season.id,
      from: season.from,
      to: season.to,
      rubricVersion: season.rubricVersion,
      rubricHash: rubricHash(season.rubricVersion),
      rubricPublished: !!season.published,
      panel: season.panel,
      note: season.note,
    },
    calendarExpired: seasonExpired(nowMs),
    rubric: rubric || { version: season.rubricVersion, published: false },
    fee: FEE_POLICY,
    appeals: APPEAL_POLICY,
    audit: AUDIT_POLICY,
    history: SEASONS.map((s) => ({
      id: s.id, from: s.from, to: s.to,
      rubricVersion: s.rubricVersion,
      rubricHash: rubricHash(s.rubricVersion),
      rubricPublished: !!s.published,
      panelSize: s.panel ? s.panel.size : 1,
      note: s.note,
    })),
    ...(running ? { running } : {}),
  };
}
