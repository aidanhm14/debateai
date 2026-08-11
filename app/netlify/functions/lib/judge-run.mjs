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

const DIM_AXES = ['clarity', 'reasoning', 'responsiveness', 'weighing'];
const JUROR_MAX_TOKENS = 900;

/**
 * Per-axis scorecard. All four axes must carry finite scores for BOTH
 * sides or the whole block is dropped: the renderers treat dimensions as
 * all-or-nothing, and a partial scorecard reads as a lopsided verdict. A
 * model that ignores the field yields a ballot shaped exactly like the
 * pre-scorecard ones.
 */
export function parseDims(raw, aKey, bKey) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const axis of DIM_AXES) {
    const a = raw[axis];
    const av = Math.round(Number(a && a[aKey]));
    const bv = Math.round(Number(a && a[bKey]));
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return null;
    out[axis] = {
      [aKey]: Math.max(1, Math.min(10, av)),
      [bKey]: Math.max(1, Math.min(10, bv)),
    };
  }
  return out;
}

/**
 * Build a ballot parser bound to a pair of side keys. Points are clamped
 * to the 25-30 speaker scale server-side: a juror that returns 47 or 3
 * would otherwise flow straight through fromRound() into the ladder.
 */
export function makeBallotParser(aKey, bKey) {
  const aPts = `${aKey}Points`;
  const bPts = `${bKey}Points`;
  return function parseBallot(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in ballot output');
    const j = JSON.parse(m[0]);
    const clamp = (x) => Math.max(25, Math.min(30, Math.round(Number(x) * 10) / 10 || 27));
    const aPoints = clamp(j[aPts]);
    const bPoints = clamp(j[bPts]);
    let winner = j.winner === aKey || j.winner === bKey ? j.winner : null;
    if (!winner) winner = aPoints >= bPoints ? aKey : bKey;
    const dimensions = parseDims(j.dimensions, aKey, bKey);
    return {
      winner,
      [aPts]: aPoints,
      [bPts]: bPoints,
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
  const parseBallot = makeBallotParser(aKey, bKey);

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
    const r = await callJuror(solo, system, user, JUROR_MAX_TOKENS, parseBallot);
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
        models: [singleModel],
        jurorsWanted: wanted.length,
        jurorsAvailable: available.length,
      },
      jurorResults: [r],
    };
  }

  const results = await callPanel(available, system, user, JUROR_MAX_TOKENS, parseBallot);
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
      degraded: available.length < wanted.length,
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
      models: available.map((j) => j.model),
      jurorsWanted: wanted.length,
      jurorsAvailable: available.length,
    },
    jurorResults: results,
  };
}
