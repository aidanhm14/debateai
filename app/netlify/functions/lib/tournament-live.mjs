// ─────────────────────────────────────────────────────────────
// Drop-in tournament: continuous pairing and a points ledger.
//
// WHY THIS EXISTS SEPARATELY FROM lib/tournament.mjs
// That engine pairs a whole field at once, per round, and it is correct
// for what it does. The Open does not work that way: doors open at 10,
// people arrive when it suits them, and standings come from the rounds
// they actually played. There is no moment when "the field" exists, so
// there is no round to draw. Pairing has to happen one pair at a time,
// out of whoever is waiting right now.
//
// The per-round engine stays for scheduled tournaments. Nothing here
// replaces it, and the two must not be blended: a per-round draw
// assumes everyone plays the same number of rounds, which is the exact
// assumption a drop-in day breaks.
//
// THE POINTS MODEL (the founder's call, 2026-08-11)
// Standings are cumulative points, not a win count. Each round pays a
// win bonus plus the speaker score above a baseline, so nine strong
// rounds beat two thin wins and a much better speaker who lost a close
// round is not buried under someone who scraped one. This is what makes
// the board identify the best arguers rather than the luckiest draws.
//
// WHAT IS DELIBERATELY NOT IN THE POINTS
// The room score (how watchable someone was) is computed separately and
// is its own award. It is NOT in the standings and must not be added.
// The judge rubric's persuasion axis is fenced against charm, fluency,
// polish, accent and dialect precisely because those fall hardest on
// second-language debaters, and a cash-deciding ladder that quietly
// rewards an accent would walk straight through that fence. Best
// speaker and most entertaining are separate honours, the way a real
// circuit does it.
//
// Pure module: no I/O, no Firestore, no clock beyond what is passed in.
// ─────────────────────────────────────────────────────────────

// A win is worth three speaker points of separation. Small enough that
// a clearly better speaker can finish above someone who edged a round,
// large enough that winning is never irrelevant.
export const WIN_POINTS = 3;

// Speaker scores run 23-30 on the scale every ballot already produces.
// Only the part ABOVE the floor scores, so turning up does not pay: a
// baseline round is worth 0 and the range per round is 0 to 10.
export const SPEAKS_BASE = 23;
export const SPEAKS_MAX = 30;

// Two lucky rounds must not top a board. Below this an entry still
// accumulates points and still appears; it is marked provisional and
// cannot take a placement.
export const MIN_ROUNDS = 3;

// A drop-in field is small, so refusing every rematch would leave
// people sitting in the queue behind an exhausted opponent list. After
// this long waiting, a rematch beats no round at all. It is recorded on
// the pairing rather than hidden, so the tab can show why.
export const REMATCH_AFTER_MS = 6 * 60 * 1000;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ── Points ─────────────────────────────────────────────────────────

/**
 * What one finished round pays. `speaks` is the 23-30 ballot score.
 *
 * A round with no speaker score still pays the win bonus: a ballot that
 * failed to produce a scorecard should not silently erase the result of
 * a round two people actually debated.
 */
export function roundPoints({ won, speaks }) {
  const s = Number(speaks);
  const quality = Number.isFinite(s) ? clamp(s, SPEAKS_BASE, SPEAKS_MAX) - SPEAKS_BASE : 0;
  return (won ? WIN_POINTS : 0) + quality;
}

/**
 * Fold a list of finished rounds into one entry's ledger.
 * Rounds are the unit; there is no per-round-number bookkeeping here
 * because a drop-in day has none.
 */
export function ledgerFor(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  let points = 0, wins = 0, losses = 0, speaksTotal = 0, speaksCount = 0;
  for (const r of list) {
    points += roundPoints(r);
    if (r.won) wins += 1; else losses += 1;
    const s = Number(r.speaks);
    if (Number.isFinite(s)) { speaksTotal += clamp(s, SPEAKS_BASE, SPEAKS_MAX); speaksCount += 1; }
  }
  const played = list.length;
  return {
    points,
    played,
    wins,
    losses,
    // Average is reported but does NOT rank, because on a drop-in day
    // the person who played nine is the one who showed up. It is here so
    // a short strong record is visible rather than invisible.
    avgPoints: played ? Math.round((points / played) * 10) / 10 : 0,
    avgSpeaks: speaksCount ? Math.round((speaksTotal / speaksCount) * 10) / 10 : 0,
    rankable: played >= MIN_ROUNDS,
  };
}

/**
 * The tab. Cumulative points first, because playing more rounds IS the
 * effort a drop-in day is rewarding. Provisional entries (under the
 * round floor) sort below every rankable one no matter their points, so
 * a hot two-round start cannot sit above someone who played all day.
 *
 * Ties break on average speaks, then on entryId so the order is stable
 * across recomputes rather than dependent on document read order. Same
 * discipline as the per-round engine.
 */
export function liveStandings(entries) {
  return (entries || []).map((e) => ({ ...e, ...ledgerFor(e.rounds || []) })).sort((a, b) => {
    if (a.rankable !== b.rankable) return a.rankable ? -1 : 1;
    if (b.points !== a.points) return b.points - a.points;
    if (b.avgSpeaks !== a.avgSpeaks) return b.avgSpeaks - a.avgSpeaks;
    return String(a.entryId).localeCompare(String(b.entryId));
  });
}

/**
 * The room score: who was worth watching. Separate on purpose, and the
 * separation is the point. It never enters `points`, never decides a
 * placement, and never reaches the prize ladder. It is an award.
 */
export function roomScoreFor(rounds) {
  const list = (Array.isArray(rounds) ? rounds : []).filter((r) => Number.isFinite(Number(r.room)));
  if (!list.length) return { room: 0, rated: 0 };
  const total = list.reduce((n, r) => n + clamp(Number(r.room), 0, 10), 0);
  return { room: Math.round((total / list.length) * 10) / 10, rated: list.length };
}

// ── Continuous pairing ─────────────────────────────────────────────

const sideDebt = (e) => (Number(e.govCount) || 0) - (Number(e.oppCount) || 0);

// Whoever has been Gov less takes Gov; even on the count, the entry
// waiting longer takes it. Deterministic, so a draw can be reproduced
// during a dispute, which is the same property the per-round engine
// buys with a seed.
function assignSides(a, b) {
  const d = sideDebt(a) - sideDebt(b);
  if (d < 0) return { gov: a, opp: b };
  if (d > 0) return { gov: b, opp: a };
  return (a.waitingSince || 0) <= (b.waitingSince || 0) ? { gov: a, opp: b } : { gov: b, opp: a };
}

/**
 * Pair ONE round out of whoever is waiting. Returns a pairing or null.
 *
 * The anchor is the entry that has been waiting LONGEST, never the
 * highest-ranked. On a queue, ranking the anchor by strength means a
 * weak entrant can sit forever while stronger pairs form around them,
 * which is how a drop-in day loses the person it most needed to keep.
 *
 * The anchor's partner is then chosen on merit:
 *   1. points proximity   closest total = the most real round available
 *   2. side pressure      an entry owed Gov meets one owed Opp
 *   3. waited longest     ties go to whoever has been queuing
 */
export function pairNext(pool, now) {
  const at = Number(now) || 0;
  const waiting = (pool || []).filter((e) => e && e.entryId && e.available !== false);
  if (waiting.length < 2) return null;

  const byWait = waiting.slice().sort((a, b) =>
    (a.waitingSince || 0) - (b.waitingSince || 0) || String(a.entryId).localeCompare(String(b.entryId)));
  const anchor = byWait[0];
  const met = new Set(anchor.opponents || []);
  const rest = byWait.slice(1);

  const fresh = rest.filter((e) => !met.has(e.entryId) && !(e.opponents || []).includes(anchor.entryId));
  // Rematches are a last resort and only after a real wait, so a small
  // field does not deadlock. Recorded, never silent.
  const waited = at - (anchor.waitingSince || 0);
  const allowRematch = fresh.length === 0 && waited >= REMATCH_AFTER_MS;
  const candidates = fresh.length ? fresh : (allowRematch ? rest : []);
  if (!candidates.length) return null;

  const anchorPoints = Number(anchor.points) || 0;
  const ranked = candidates.slice().sort((x, y) => {
    const px = Math.abs((Number(x.points) || 0) - anchorPoints);
    const py = Math.abs((Number(y.points) || 0) - anchorPoints);
    if (px !== py) return px - py;
    const sx = Math.abs(sideDebt(anchor) + sideDebt(x));
    const sy = Math.abs(sideDebt(anchor) + sideDebt(y));
    if (sx !== sy) return sx - sy;
    return (x.waitingSince || 0) - (y.waitingSince || 0)
        || String(x.entryId).localeCompare(String(y.entryId));
  });

  const partner = ranked[0];
  const { gov, opp } = assignSides(anchor, partner);
  return {
    govEntry: gov.entryId,
    oppEntry: opp.entryId,
    rematch: fresh.length === 0,
    // How far apart the two are on the board, so a tab can show whether
    // a pairing was a real power match or the best the queue could do.
    pointsGap: Math.abs((Number(gov.points) || 0) - (Number(opp.points) || 0)),
    anchorWaitedMs: Math.max(0, waited),
  };
}

/**
 * Drain the queue: pair as many as possible in one pass, longest wait
 * first. An odd entry is left waiting rather than given a bye, because
 * a bye on a drop-in day is meaningless. There is always another
 * arrival, and a free win would be points nobody debated for.
 */
export function pairAll(pool, now) {
  const remaining = (pool || []).slice();
  const pairs = [];
  for (;;) {
    const p = pairNext(remaining, now);
    if (!p) break;
    pairs.push(p);
    const out = new Set([p.govEntry, p.oppEntry]);
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (out.has(remaining[i].entryId)) remaining.splice(i, 1);
    }
  }
  return { pairs, unpaired: remaining.map((e) => e.entryId) };
}
