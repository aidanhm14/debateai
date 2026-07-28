// ─────────────────────────────────────────────────────────────
// Sway — the integrity layer on top of opinion-delta capture.
//
// `log-opinion-delta.mjs` already records a stance before the round, a
// stance after the ballot, and timestamped taps in between. That is a
// persuasion measurement. What it was missing is the machinery that
// makes the measurement survive somebody trying to break it, or
// somebody in diligence asking what it is resolved against.
//
// The objection this exists to answer: an AI judge that scores
// arguments, and a corpus sold on the strength of those scores, is a
// closed loop. A model's opinion about a model's opinion. Measured
// mind-change is the way out, because it is external to the model.
// But "we asked the room" is only better than the ballot if the
// asking is honest. Four mechanisms:
//
//  1. HOLDOUT ARM. A deterministic quarter of viewers are never shown
//     the pre-round question. Committing to a side in public makes
//     people defend it, so a within-subject delta systematically
//     under-reads real movement. The unanchored arm's closing split is
//     the control that measures how much. Without it, every number is
//     confounded by the act of asking and we cannot say by how much.
//
//  2. STAKE EXCLUSION. Anyone holding a position on the round's market
//     is recorded and never counted. A voter with credits riding on
//     the outcome has a reason to misreport their own mind. Staking is
//     supposed to make opinions honest; letting stakers vote on the
//     thing they staked on would do the exact opposite.
//
//  3. WATCH GATE + INTEGRITY WEIGHT. The cheapest attack is four
//     friends who vote one way before and the other way after. That
//     looks like fresh identities who arrive, vote twice, and leave.
//     Weight is confidence, not accusation: an identity with history
//     counts fully, a brand-new anonymous one counts less, and anyone
//     who did not watch counts zero.
//
//  4. DELIVERY CONTROL. Mind-change tracks charisma at least as much
//     as reasoning. A round against the AI opponent holds delivery
//     constant, so those rounds are the clean arm for isolating
//     argument quality from performance.
//
// Pure functions only. No I/O. Callers own the writes.
// ─────────────────────────────────────────────────────────────

export const SWAY = {
  // Smallest fraction that still yields a usable control split in a
  // room of roughly forty, which is the realistic size of a live round.
  HOLDOUT_PCT: 0.25,

  // A closing stance from someone who watched forty seconds is noise.
  MIN_WATCH_MS: 90 * 1000,

  // Under this we publish counts and refuse to publish a percentage.
  // A delta built on nine people is a marketing claim.
  MIN_COUNTED: 20,
};

// FNV-1a. Deterministic across restarts and across the two requests a
// single viewer makes. The arm must never be re-rolled between the
// opening and closing stance or the holdout stops being a holdout.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Keyed on the identity the row is owned by, so a signed-in viewer and
// the same browser signed out do not land in different arms mid-round.
export function assignArm(roundId, ownerKey) {
  return (hash32(`${roundId}:${ownerKey}`) % 1000) < SWAY.HOLDOUT_PCT * 1000
    ? 'holdout'
    : 'exposed';
}

// Confidence weight, not a fraud score. Published alongside the
// headline: a number that only holds up when every voter counts 1.0 is
// a number that got farmed.
export function integrityWeight({ signedIn, accountAgeDays, priorRounds, watchMs, staked }) {
  if (staked) return 0;
  if (!(watchMs >= SWAY.MIN_WATCH_MS)) return 0;

  let w = 1;
  if (!signedIn) w *= 0.4;
  else if (!(accountAgeDays >= 1)) w *= 0.5;
  else if (!(accountAgeDays >= 7)) w *= 0.8;
  if (signedIn && priorRounds >= 3) w *= 1.15;

  return Math.min(1.2, Math.round(w * 100) / 100);
}

function split() { return { pro: 0, con: 0, undecided: 0 }; }

function pct(s) {
  const n = s.pro + s.con + s.undecided;
  if (!n) return { pro: 0, con: 0, undecided: 0, n: 0 };
  const r = v => Math.round((v / n) * 1000) / 10;
  return { pro: r(s.pro), con: r(s.con), undecided: r(s.undecided), n };
}

export function emptyTally() {
  return {
    pre: split(),          // exposed arm, opening stance
    post: split(),         // exposed arm, closing stance
    holdoutPost: split(),  // holdout arm, closing stance, never anchored
    switched: 0,           // exposed voters whose side actually changed
    counted: 0,            // exposed closing stances with weight above zero
    holdoutCounted: 0,
    excludedStakers: 0,
    lowWatch: 0,
  };
}

// The published record. Reports what weakens the number next to the
// number, so a reader can discount it without having to ask us.
export function swayReport(tally, meta = {}) {
  const t = { ...emptyTally(), ...(tally || {}) };
  const pre = pct(t.pre), post = pct(t.post), hold = pct(t.holdoutPost);
  const thin = t.counted < SWAY.MIN_COUNTED;

  // Signed net movement. Positive means the proposition gained ground.
  const netShift = thin ? null : Math.round((post.pro - pre.pro) * 10) / 10;

  // Share of the room that changed its mind at all, either direction.
  // This is the honest headline: a round where twenty moved to pro and
  // eighteen moved to con has a tiny net shift and enormous churn, and
  // those are two different facts about the arguments.
  const churn = thin || !t.counted
    ? null
    : Math.round((t.switched / t.counted) * 1000) / 10;

  // How much the act of asking moved the answer. If the anchored and
  // unanchored arms land in the same place, the pre-round question is
  // not distorting the measurement.
  const anchoringGap = (hold.n >= SWAY.MIN_COUNTED && post.n)
    ? Math.round((post.pro - hold.pro) * 10) / 10
    : null;

  return {
    pre, post, holdoutPost: hold,
    netShift, churn, anchoringGap,
    counted: t.counted,
    holdoutCounted: t.holdoutCounted,
    excludedStakers: t.excludedStakers,
    lowWatch: t.lowWatch,
    thin,
    deliveryControlled: !!meta.deliveryControlled,
    population: meta.population || 'Debatable live audience, self-selected',
    minWatchSeconds: Math.round(SWAY.MIN_WATCH_MS / 1000),
    holdoutPct: SWAY.HOLDOUT_PCT,
  };
}

// Caveats travel with every published number. A figure without its
// population and its sample size does not survive diligence, and
// shipping one that cannot is worse than shipping none.
export function caveatsFor(report) {
  const out = [];
  if (report.thin) {
    out.push(`Sample under ${SWAY.MIN_COUNTED}. Counts shown, no percentage published.`);
  }
  if (report.anchoringGap !== null && Math.abs(report.anchoringGap) >= 8) {
    out.push(`Anchoring gap ${report.anchoringGap > 0 ? '+' : ''}${report.anchoringGap} points. Asking before the round moved the answer after it, so read the delta as a floor.`);
  }
  if (report.holdoutCounted < SWAY.MIN_COUNTED) {
    out.push('Holdout arm too small to check anchoring on this round.');
  }
  if (!report.deliveryControlled) {
    out.push('Delivery not held constant. Movement on a human vs human round carries speaker performance as well as argument quality.');
  }
  if (report.excludedStakers) {
    out.push(`${report.excludedStakers} staked voter${report.excludedStakers === 1 ? '' : 's'} excluded from the count.`);
  }
  out.push(`Population: ${report.population}. Not a representative panel of anyone.`);
  return out;
}

// Per-argument attribution. A closing stance may name the one claim
// that moved it, against the claims the judge already segmented to
// write the ballot. That is what turns a round-level number into
// argument-level rows without stopping the round to poll after every
// claim, and the rows are the corpus.
export function argumentScores(rows, args) {
  const byId = new Map();
  for (const a of args || []) {
    byId.set(a.id, {
      id: a.id,
      side: a.side || null,
      speaker: a.speaker || null,
      text: a.text || '',
      moved: 0,
      weighted: 0,
    });
  }
  for (const r of rows || []) {
    const hit = byId.get(r.argId);
    if (!hit) continue;
    hit.moved += 1;
    hit.weighted += (r.weight || 0);
  }
  return [...byId.values()]
    .map(r => ({ ...r, weighted: Math.round(r.weighted * 100) / 100 }))
    .sort((a, b) => b.weighted - a.weighted);
}
