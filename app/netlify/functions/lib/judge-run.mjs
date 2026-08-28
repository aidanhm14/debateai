// ─────────────────────────────────────────────────────────────
// The panel runner. ONE implementation, shared by every surface that
// produces a server-authored verdict.
//
// This logic used to live inline in async-sweep.mjs. It moved here when
// live rounds needed the same thing, because two copies of "how a panel
// decides a round" is how the degraded-mode and no-majority semantics
// drift apart, and those two are the difference between a disclosed
// limitation and a silent one.
//
// The only thing parameterised is the pair of SIDE KEYS, because the two
// surfaces genuinely name their sides differently on the wire: async
// ballots speak prop/opp, live ballots speak pro/con. Everything about
// how a verdict is reached is identical by construction.
//
// Nothing else belongs in here. In particular no scoring policy, no
// tie-break, and no fallback winner: an even split returns null and the
// caller must leave the round unresolved (see lib/judge-panel.mjs).
// ─────────────────────────────────────────────────────────────

import { callJuror, callPanel, jurorAvailable } from './judge-jurors.mjs';
import { normalizeVote, tallyPanel } from './judge-panel.mjs';

// DEGRADED MODE, disclosed rather than silent. If a provider key is unset
// or a juror fails, the panel runs short. When too few jurors are
// available to reach the season's quorum, the ballot falls back to a
// single judge and is STAMPED degraded, which the public charter endpoint
// surfaces. JUDGE_REQUIRE_PANEL=1 refuses a verdict instead of degrading;
// the default keeps rounds moving, because a missing key should not
// silently freeze every ballot on the site.
const PANEL_ENABLED = process.env.JUDGE_PANEL_ENABLED !== '0';
const REQUIRE_PANEL = process.env.JUDGE_REQUIRE_PANEL === '1';

// The four axes every rubric since 2026-07-30 has demanded, plus any
// added later. REQUIRED is the floor and OPTIONAL is what grew on top,
// because a list that is strictly all-or-nothing cannot grow: adding
// persuasion under the old rule made a four-axis ballot yield NO
// scorecard at all, where it used to yield four. The renderers take the
// same floor, so the two halves agree.
const REQUIRED_AXES = ['clarity', 'reasoning', 'responsiveness', 'weighing'];
const OPTIONAL_AXES = ['strategy', 'persuasion'];
const DIM_AXES = [...REQUIRED_AXES, ...OPTIONAL_AXES];

// Output budget per juror. Was 900, which had stopped being enough
// SILENTLY. Measured against a real three-speech round on 2026-08-11:
// the pinned Anthropic juror spent its entire 900 on reasoning, returned
// `stop_reason: max_tokens` with no closing brace, failed to parse, and
// recorded as a missing vote on every ballot. Reasoning models bill
// thinking against max_tokens, so a cap tuned before they existed reads
// as a parse bug forever and looks like the parser's fault.
//
// 3000 clears the widest measured ballot (2064 tokens) with headroom.
// This is the one place both surfaces read it from, so live rounds, which
// can settle credits, were carrying the same defect.
const JUROR_MAX_TOKENS = Number(process.env.JUDGE_JUROR_MAX_TOKENS || 3000);

/**
 * Per-axis scorecard. Every axis must carry finite scores for BOTH sides
 * or the whole block is dropped: the renderers treat dimensions as
 * all-or-nothing, and a partial scorecard reads as a lopsided verdict. A
 * model that ignores the field yields a ballot shaped exactly like the
 * pre-scorecard ones.
 *
 * Persuasion joined the list with the 2026-persuasion season. The
 * renderers take the four original axes as a FLOOR rather than requiring
 * the full list, so rounds judged before it still show their scorecard.
 */
export function parseDims(raw, aKey, bKey) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const axis of DIM_AXES) {
    const a = raw[axis];
    const av = Math.round(Number(a && a[aKey]));
    const bv = Math.round(Number(a && a[bKey]));
    if (!Number.isFinite(av) || !Number.isFinite(bv)) {
      // A required axis missing still drops the whole card: a partial
      // core scorecard reads as a lopsided verdict. An OPTIONAL axis
      // missing just means this ballot predates it, or the juror
      // skipped it, and four honest axes beat none.
      if (REQUIRED_AXES.includes(axis)) return null;
      continue;
    }
    out[axis] = {
      [aKey]: Math.max(1, Math.min(10, av)),
      [bKey]: Math.max(1, Math.min(10, bv)),
    };
  }
  return out;
}

/**
 * Build a ballot parser bound to a pair of side keys and an explicit
 * score scale. Legacy callers default to 30. New casual callers pass
 * 100, so an in-flight old round is never silently reinterpreted.
 */
export function makeBallotParser(aKey, bKey, scoreScale = 30) {
  const aPts = `${aKey}Points`;
  const bPts = `${bKey}Points`;
  const scale100 = Number(scoreScale) === 100;
  return function parseBallot(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in ballot output');
    const j = JSON.parse(m[0]);
    const clamp = (x) => {
      const n = Number(x);
      if (!Number.isFinite(n)) return scale100 ? 55 : 27;
      return scale100
        ? Math.max(1, Math.min(100, Math.round(n * 10) / 10))
        : Math.max(25, Math.min(30, Math.round(n * 10) / 10));
    };
    const aPoints = clamp(j[aPts]);
    const bPoints = clamp(j[bPts]);
    let winner = j.winner === aKey || j.winner === bKey ? j.winner : null;
    if (!winner) winner = aPoints >= bPoints ? aKey : bKey;
    const dimensions = parseDims(j.dimensions, aKey, bKey);
    return {
      winner,
      [aPts]: aPoints,
      [bPts]: bPoints,
      // The one clash this juror says decided the round. Optional on
      // purpose: a juror that omits it still casts a valid vote, it just
      // contributes nothing to the issue-agreement figure, which beats
      // discarding a vote over a missing string.
      decidingIssue: String(j.decidingIssue || '').slice(0, 160),
      rfd: String(j.rfd || '').slice(0, 1600),
      ...(dimensions ? { dimensions } : {}),
    };
  };
}

/**
 * Run the season's panel over one prompt pair.
 *
 * @param season   from seasonFor(ms) in judge-charter.mjs
 * @param system   byte-identical for every juror (the audit asserts this)
 * @param user
 * @param opts     { aKey, bKey, singleModel }
 * @returns { ballot, panel, jurorResults }
 *
 * `ballot.winner` is null on an unresolved split. Callers MUST NOT
 * complete a round on a null winner; async retries, live leaves the
 * round in its pending state. Any tie-break here would be the house
 * putting a thumb on the scale.
 */
export async function runPanel(season, system, user, opts = {}) {
  const aKey = opts.aKey || 'prop';
  const bKey = opts.bKey || 'opp';
  const singleModel = opts.singleModel || 'claude-sonnet-5';
  const parseBallot = makeBallotParser(aKey, bKey, opts.scoreScale);
  // A synchronous live-room function has a harder wall-clock ceiling than
  // the async sweep. Callers may lower the per-juror ceiling so provider
  // aborts become disclosed missing votes before the edge kills the whole
  // function. Omitting it preserves the shared 30-second default.
  const jurorTimeoutMs = Number.isFinite(Number(opts.jurorTimeoutMs))
    ? Math.max(1_000, Number(opts.jurorTimeoutMs))
    : undefined;

  const panelCfg = PANEL_ENABLED ? (season && season.panel) : null;
  const wanted = (panelCfg && panelCfg.jurors) || [];
  const available = wanted.filter(jurorAvailable);
  const quorum = (panelCfg && panelCfg.quorum) || 2;

  // Not enough jurors to constitute the panel the season promised.
  if (!panelCfg || available.length < quorum) {
    if (REQUIRE_PANEL && panelCfg) {
      throw new Error(`panel not constitutable: ${available.length} of ${wanted.length} jurors available, quorum ${quorum}`);
    }
    const solo = { id: 'single', provider: 'anthropic', model: singleModel };
    const r = await callJuror(solo, system, user, JUROR_MAX_TOKENS, parseBallot, jurorTimeoutMs);
    if (!r.ok || !r.ballot) throw new Error(`single judge failed: ${r.error || 'no ballot'}`);
    const ballot = r.ballot;
    return {
      ballot: { ...ballot, model: singleModel },
      panel: {
        resolution: 'single',
        degraded: !!panelCfg,
        votesCast: 1, panelSize: 1, quorum: 1,
        tally: ballot.winner === aKey ? { a: 1, b: 0 } : { a: 0, b: 1 },
        agreement: 1, unanimous: false, dissent: [], dissents: [],
        marginSpread: 0, marginStdev: 0,
        // One judge cannot agree with anyone, so issue agreement is null
        // rather than 1. Recording a lone judge as unanimous on the
        // reason would inflate the published reliability figure using
        // exactly the rounds that had no panel behind them.
        decidingIssue: ballot.decidingIssue || '',
        issuesNamed: ballot.decidingIssue ? 1 : 0,
        issueAgreement: null,
        models: [singleModel],
        jurorsWanted: wanted.length,
        jurorsAvailable: available.length,
      },
      jurorResults: [r],
    };
  }

  const results = await callPanel(available, system, user, JUROR_MAX_TOKENS, parseBallot, jurorTimeoutMs);
  const votes = results
    .filter((r) => r.ok && r.ballot)
    .map((r) => normalizeVote(r, r.ballot, aKey, bKey))
    .filter(Boolean);

  const tally = tallyPanel(votes, { size: available.length, quorum });
  const lead = votes.find((v) => v.jurorId === tally.leadJurorId) || votes[0] || null;

  // Every juror that came out the other way, with its reasoning intact.
  // Blending contradictory RFDs into one paragraph produces prose that
  // reasons like neither juror, so a dissent is shown as a dissent.
  const dissents = votes
    .filter((v) => tally.winner && v.winner !== tally.winner)
    .map((v) => ({ jurorId: v.jurorId, model: v.model, winner: v.winner === 'a' ? aKey : bKey, rfd: v.rfd }));

  const ballot = {
    winner: tally.winner === 'a' ? aKey : (tally.winner === 'b' ? bKey : null),
    [`${aKey}Points`]: tally.points.a,
    [`${bKey}Points`]: tally.points.b,
    // The majority's deciding issue, not a blend: tallyPanel returns the
    // one from the largest agreeing cluster, so this is the reason the
    // panel actually converged on rather than whichever juror was first.
    ...(tally.decidingIssue ? { decidingIssue: tally.decidingIssue } : {}),
    rfd: lead ? lead.rfd : '',
    ...(tally.dimensions ? {
      dimensions: Object.fromEntries(
        Object.entries(tally.dimensions).map(([axis, v]) => [axis, { [aKey]: v.a, [bKey]: v.b }]),
      ),
    } : {}),
    model: lead ? lead.model : '',
  };

  return {
    ballot,
    panel: {
      resolution: tally.resolution,
      // Degraded means the panel did not run at full strength, and the
      // measure has to be VOTES rather than configured keys. The old
      // test was `available.length < wanted.length`, which only catches
      // a juror whose key is unset: a juror whose provider returns 429
      // or times out was counted as available, cast no vote, and the
      // ballot still reported degraded:false. That is the silent
      // degradation the charter exists to forbid, and it is not
      // hypothetical (the Google seat has been returning 429 on every
      // round since its billing was exhausted). The reliability endpoint
      // counts degraded panels off this flag, so it was undercounting.
      degraded: tally.votesCast < wanted.length,
      votesCast: tally.votesCast,
      panelSize: tally.panelSize,
      quorum,
      tally: tally.tally,
      agreement: tally.agreement,
      unanimous: tally.unanimous,
      dissent: tally.dissent,
      dissents,
      marginSpread: tally.marginSpread,
      marginStdev: tally.marginStdev,
      // Agreement on the REASON, recorded next to agreement on the
      // winner. The reliability endpoint rolls these up, and the two
      // diverging is the finding worth having: three jurors agreeing on
      // the winner for three different reasons is a weaker result than
      // the vote count alone suggests.
      decidingIssue: tally.decidingIssue,
      issuesNamed: tally.issuesNamed,
      issueAgreement: tally.issueAgreement,
      models: available.map((j) => j.model),
      jurorsWanted: wanted.length,
      jurorsAvailable: available.length,
    },
    jurorResults: results,
  };
}
