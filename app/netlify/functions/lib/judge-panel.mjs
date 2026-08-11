// ─────────────────────────────────────────────────────────────
// THE PANEL — ensemble judging, and the statistics that make it
// evidence rather than a talking point.
//
// WHY AN ENSEMBLE
// One model call is one opinion, and an opinion the operator can tune.
// Three independent model families deciding the same round produce
// something a single call cannot: a measurement of whether the round
// was decidable at all. When three families agree, the verdict is a
// property of the flow. When they split, the verdict was a property of
// the judge, and saying so out loud is worth more than hiding it behind
// a confident ballot.
//
// This is also the answer to the circularity objection. Documented
// inter-rater reliability is the evidence that skill predominates: if
// agreement is high, the ballot is tracking the debate. If it is low,
// the honest move is to publish that number and stop settling anything
// on the split cases, which is what `noMajority: 'unresolved'` does.
//
// THREE FAMILIES, NOT THREE SAMPLES
// Three calls to one model measure sampling temperature. That would
// produce a flattering agreement number that means almost nothing,
// because the correlated error is the model itself. Different families
// have different priors about debate, so their agreement is the
// number worth publishing.
//
// This module is PURE. Provider calls live in judge-jurors.mjs so the
// math here is directly testable; scripts/test-judge-integrity.mjs
// drives every function below with fixtures.
// ─────────────────────────────────────────────────────────────

// ── one juror's vote, normalized ────────────────────────────────────
//
// Every surface has its own side labels (async: prop/opp, live:
// pro/con). The panel reasons in a/b, the same abstraction the
// judgments collection already uses, so the tally never has to know
// which surface it came from.
export function normalizeVote(juror, ballot, aKey, bKey) {
  if (!ballot) return null;
  const w = ballot.winner;
  const winner = w === aKey || w === 'a' ? 'a' : (w === bKey || w === 'b' ? 'b' : null);
  if (!winner) return null;
  const a = Number(ballot[aKey + 'Points']);
  const b = Number(ballot[bKey + 'Points']);
  return {
    jurorId: juror.id,
    provider: juror.provider,
    model: juror.model,
    winner,
    points: {
      a: Number.isFinite(a) ? a : null,
      b: Number.isFinite(b) ? b : null,
    },
    // Signed margin from a's point of view. The spread of this across
    // jurors is the panel's real variance signal: three jurors can all
    // say "a" while disagreeing wildly about how close it was.
    margin: Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) * 10) / 10 : null,
    dimensions: normalizeDims(ballot.dimensions, aKey, bKey),
    // The one clash this juror says decided the round. Carried through
    // the tally so the panel can report whether the jurors agreed on the
    // REASON and not just on the name at the top of the ballot.
    decidingIssue: String(ballot.decidingIssue || '').slice(0, 160),
    rfd: String(ballot.rfd || '').slice(0, 2000),
  };
}

// Four required axes plus whatever grew on top. Same floor as the parser
// in judge-run.mjs and both renderers: a required axis missing drops the
// card, an optional one missing just means this ballot predates it.
const REQUIRED_AXES = ['clarity', 'reasoning', 'responsiveness', 'weighing'];
const OPTIONAL_AXES = ['persuasion'];
const DIM_AXES = [...REQUIRED_AXES, ...OPTIONAL_AXES];

function normalizeDims(dm, aKey, bKey) {
  if (!dm || typeof dm !== 'object') return null;
  const out = {};
  for (const axis of DIM_AXES) {
    const ax = dm[axis];
    const a = Number(ax && (ax[aKey] !== undefined ? ax[aKey] : ax.a));
    const b = Number(ax && (ax[bKey] !== undefined ? ax[bKey] : ax.b));
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      if (REQUIRED_AXES.includes(axis)) return null;
      continue;
    }
    out[axis] = { a, b };
  }
  return out;
}

// ── medians ─────────────────────────────────────────────────────────
//
// Median rather than mean, deliberately. One juror that misreads the
// round and returns 25.0 against 30.0 should not drag the reported
// score; with three jurors the median is the middle opinion and a
// single outlier cannot move it at all.
export function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  const v = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return Math.round(v * 10) / 10;
}

function stdev(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, n) => s + n, 0) / xs.length;
  const varc = xs.reduce((s, n) => s + (n - mean) * (n - mean), 0) / (xs.length - 1);
  return Math.round(Math.sqrt(varc) * 100) / 100;
}

// ── did they agree on WHY ───────────────────────────────────────────
//
// A 3-0 panel that names three different deciding issues is not the same
// object as a 3-0 panel that names one, and reporting only the vote count
// flatters the first case. So the deciding issues are clustered and the
// largest cluster is published next to the winner tally.
//
// The comparison is deliberately crude: a stopworded token set and a
// Jaccard overlap. Anything cleverer would be a semantic judgement made
// by another model, which is the exact circularity this whole subsystem
// exists to avoid. Crude and inspectable beats clever and unauditable,
// and the failure mode is under-reporting agreement, which is the safe
// direction to be wrong in for a number we might quote.
const ISSUE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'to', 'and', 'or', 'is', 'was', 'it', 'its',
  'this', 'that', 'whether', 'round', 'debate', 'clash', 'issue', 'question',
  'side', 'case', 'argument', 'point', 'turned', 'turns', 'decided', 'decides',
  'over', 'about', 'for', 'with', 'their', 'they', 'them',
]);

export function issueTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !ISSUE_STOPWORDS.has(w)),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits += 1;
  return hits / (a.size + b.size - hits);
}

// Largest set of jurors naming what reads as the same deciding issue.
// Greedy single-link clustering: with a panel of three there is nothing
// a smarter algorithm would find that this misses.
export function issueConsensus(votes, threshold = 0.34) {
  const named = (votes || []).filter((v) => v && v.decidingIssue && issueTokens(v.decidingIssue).size);
  if (named.length < 2) {
    return { named: named.length, largestCluster: named.length, agreement: null, issue: named.length ? named[0].decidingIssue : '' };
  }
  const toks = named.map((v) => issueTokens(v.decidingIssue));
  let best = { members: [0], size: 1 };
  for (let i = 0; i < named.length; i += 1) {
    const members = [i];
    for (let k = 0; k < named.length; k += 1) {
      if (k !== i && jaccard(toks[i], toks[k]) >= threshold) members.push(k);
    }
    if (members.length > best.size) best = { members, size: members.length };
  }
  return {
    named: named.length,
    largestCluster: best.size,
    agreement: Math.round((best.size / named.length) * 100) / 100,
    issue: named[best.members[0]].decidingIssue,
  };
}

// ── the tally ───────────────────────────────────────────────────────
//
// Returns the panel verdict plus everything needed to publish the
// disagreement. `winner` is null when no side reaches quorum, and a
// null winner must never be coerced into a result downstream: that is
// the case the charter promises to leave unresolved rather than
// tie-break in the house's favor.
export function tallyPanel(votes, panel) {
  const cast = (votes || []).filter((v) => v && (v.winner === 'a' || v.winner === 'b'));
  const quorum = (panel && panel.quorum) || 2;
  const size = (panel && panel.size) || 3;

  const forA = cast.filter((v) => v.winner === 'a');
  const forB = cast.filter((v) => v.winner === 'b');
  const top = forA.length >= forB.length ? 'a' : 'b';
  const topCount = Math.max(forA.length, forB.length);
  const otherCount = Math.min(forA.length, forB.length);

  // Quorum AND a strict majority of the votes actually cast. A 1-1
  // split does not carry even though 1 is not zero, and a 2-2 panel
  // does not carry even though 2 meets quorum.
  const decided = cast.length > 0 && topCount >= quorum && topCount > otherCount;
  const winner = decided ? top : null;

  const margins = cast.map((v) => v.margin).filter((m) => Number.isFinite(m));
  // Agreement on the reason, reported whether or not the winner carried.
  // On an unresolved panel this is the more informative number of the
  // two: jurors who split the winner but named the same deciding issue
  // disagreed about a call, while jurors who named different issues were
  // not judging the same round.
  const issues = issueConsensus(cast);

  return {
    winner,
    resolution: decided ? 'majority' : (cast.length ? 'unresolved' : 'no_votes'),
    unanimous: decided && otherCount === 0 && cast.length === size,
    votesCast: cast.length,
    panelSize: size,
    quorum,
    tally: { a: forA.length, b: forB.length },
    // Share of cast votes behind the recorded winner. 1.0 unanimous,
    // 0.67 on a 2-1, and reported even when the panel failed to decide.
    agreement: cast.length ? Math.round((topCount / cast.length) * 100) / 100 : 0,
    dissent: decided ? cast.filter((v) => v.winner !== winner).map((v) => v.jurorId) : [],
    missing: Math.max(0, size - cast.length),
    points: {
      a: median(cast.map((v) => v.points && v.points.a)),
      b: median(cast.map((v) => v.points && v.points.b)),
    },
    dimensions: medianDims(cast),
    // How far apart the jurors were on the margin, in speaker points.
    // A unanimous panel with a spread of 4 is a different animal from a
    // unanimous panel with a spread of 0.3, and only one of them should
    // read as a comfortable round.
    marginSpread: margins.length > 1 ? Math.round((Math.max(...margins) - Math.min(...margins)) * 10) / 10 : 0,
    marginStdev: stdev(margins),
    // Did the jurors agree on WHY. `issueAgreement` is the share of
    // issue-naming jurors in the largest cluster; null when fewer than
    // two named one, because one opinion is not agreement.
    decidingIssue: issues.issue,
    issuesNamed: issues.named,
    issueAgreement: issues.agreement,
    // The ballot shown to debaters. The majority's reasoning is the
    // record; a dissent is surfaced separately rather than blended,
    // because averaging two contradictory RFDs produces prose that
    // reasons like neither juror.
    leadJurorId: decided ? (cast.find((v) => v.winner === winner) || {}).jurorId || '' : '',
  };
}

function medianDims(cast) {
  const withDims = cast.filter((v) => v.dimensions);
  if (!withDims.length) return null;
  const out = {};
  for (const axis of DIM_AXES) {
    const a = median(withDims.map((v) => v.dimensions[axis] && v.dimensions[axis].a));
    const b = median(withDims.map((v) => v.dimensions[axis] && v.dimensions[axis].b));
    if (a === null || b === null) {
      // A panel mixing a juror that scored persuasion with one that did
      // not still has a real median on the four required axes. Dropping
      // the whole card there would let one juror's omission delete a
      // scorecard the rest of the panel agreed on.
      if (REQUIRED_AXES.includes(axis)) return null;
      continue;
    }
    out[axis] = { a: Math.round(a), b: Math.round(b) };
  }
  return out;
}

// ── inter-rater reliability ─────────────────────────────────────────
//
// Fleiss' kappa on the binary winner, which is the standard statistic
// for "did N raters agree more than chance would predict". Reported
// rather than a raw agreement percentage because raw agreement is
// inflated whenever one side wins more often overall: a panel that
// always said "a" would score 100% agreement while measuring nothing.
// Kappa nets that out.
//
// `items` is an array of { a, b } vote counts, one per judged round.
// Rounds where fewer than two jurors voted carry no agreement
// information and are excluded rather than counted as perfect.
export function fleissKappa(items) {
  const rows = (items || [])
    .map((it) => ({ a: Number(it && it.a) || 0, b: Number(it && it.b) || 0 }))
    .filter((r) => r.a + r.b >= 2);
  const N = rows.length;
  if (!N) return null;

  // Fleiss assumes a fixed number of raters per item. Panels can lose a
  // juror to a provider failure, so per-item P is computed against that
  // item's own rater count, which is the standard correction for
  // unequal n.
  let sumP = 0;
  let totalA = 0;
  let totalB = 0;
  for (const r of rows) {
    const n = r.a + r.b;
    sumP += (r.a * (r.a - 1) + r.b * (r.b - 1)) / (n * (n - 1));
    totalA += r.a;
    totalB += r.b;
  }
  const total = totalA + totalB;
  const pBarObserved = sumP / N;
  const pA = totalA / total;
  const pB = totalB / total;
  const pBarExpected = pA * pA + pB * pB;

  // Every rater agreed on every item. Kappa is undefined (0/0) when
  // expected agreement is also 1; report perfect rather than NaN.
  if (pBarExpected >= 1) return { kappa: pBarObserved >= 1 ? 1 : 0, n: N, observed: pBarObserved, expected: pBarExpected, degenerate: true };

  const kappa = (pBarObserved - pBarExpected) / (1 - pBarExpected);
  return {
    kappa: Math.round(kappa * 1000) / 1000,
    n: N,
    observed: Math.round(pBarObserved * 1000) / 1000,
    expected: Math.round(pBarExpected * 1000) / 1000,
    degenerate: false,
  };
}

// Landis and Koch bands, the conventional reading of a kappa. Labelled
// so the public page does not have to interpret a bare number, and
// stated as a band rather than a grade because that is what a kappa is.
export function kappaBand(kappa) {
  if (kappa === null || kappa === undefined || !Number.isFinite(kappa)) return 'not enough data';
  if (kappa < 0) return 'worse than chance';
  if (kappa < 0.21) return 'slight';
  if (kappa < 0.41) return 'fair';
  if (kappa < 0.61) return 'moderate';
  if (kappa < 0.81) return 'substantial';
  return 'almost perfect';
}

// Roll a set of audit records into the published reliability figures.
// Pure so the endpoint is a thin read-and-format wrapper and the maths
// is covered by tests.
export function reliabilityFrom(records) {
  const rows = (records || []).filter((r) => r && r.panel && r.panel.tally);
  const items = rows.map((r) => r.panel.tally);
  const kappa = fleissKappa(items);

  const decided = rows.filter((r) => r.panel.resolution === 'majority');
  const unanimous = decided.filter((r) => r.panel.unanimous);
  const unresolved = rows.filter((r) => r.panel.resolution === 'unresolved');
  const spreads = rows.map((r) => Number(r.panel.marginSpread)).filter((n) => Number.isFinite(n));
  // Published alongside winner agreement because the two can diverge,
  // and when they do it is the interesting result: a panel that agrees
  // on the winner far more often than on the reason is agreeing about
  // something other than the round.
  const issueRates = rows.map((r) => Number(r.panel.issueAgreement)).filter((n) => Number.isFinite(n));

  return {
    rounds: rows.length,
    decided: decided.length,
    unanimous: unanimous.length,
    unanimousRate: decided.length ? Math.round((unanimous.length / decided.length) * 100) / 100 : null,
    unresolved: unresolved.length,
    unresolvedRate: rows.length ? Math.round((unresolved.length / rows.length) * 100) / 100 : null,
    meanAgreement: rows.length
      ? Math.round((rows.reduce((s, r) => s + (Number(r.panel.agreement) || 0), 0) / rows.length) * 100) / 100
      : null,
    medianMarginSpread: median(spreads),
    meanIssueAgreement: issueRates.length
      ? Math.round((issueRates.reduce((s, n) => s + n, 0) / issueRates.length) * 100) / 100
      : null,
    issueAgreementN: issueRates.length,
    kappa: kappa ? kappa.kappa : null,
    kappaBand: kappaBand(kappa ? kappa.kappa : null),
    kappaN: kappa ? kappa.n : 0,
    // Honest small-sample guard. A kappa over a handful of rounds is
    // noise, and publishing it as a headline number would be exactly
    // the overclaim this system exists to avoid.
    reportable: !!kappa && kappa.n >= 30,
  };
}

export const RELIABILITY_MIN_N = 30;
