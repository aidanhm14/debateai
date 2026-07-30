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
    to: Date.UTC(2027, 0, 1),
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
];

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
