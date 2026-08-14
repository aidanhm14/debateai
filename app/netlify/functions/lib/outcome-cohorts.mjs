// ─────────────────────────────────────────────────────────────
// Outcome cohorts — retention split by whether you WON or LOST.
//
// WHY THIS EXISTS
// Half of every round on a zero-sum ladder ends in a loss. Chess losses
// are private; losing an argument is ego damage, and an opaque verdict
// makes a loss feel rigged by default. So the number that decides
// whether this product exists is not D30, it is D30 AFTER A LOSS, and
// the honest version of it is the gap between the loss cohort and the
// win cohort. A single blended retention figure hides exactly the thing
// we need to see.
//
// NOTHING NEW IS WRITTEN TO PRODUCE THIS.
// `judgments` is already the canonical, idempotent record of who won a
// round (lib/judgment.mjs), and `events` is already the activity index
// the signup-cohort grid runs on (admin-cohorts.mjs). One judgment
// yields two rows, one winner and one loser, so the cohort is derivable
// for the entire back catalogue rather than starting from the day an
// instrumentation call was added. That also means there is no new write
// path on the judging hot path to fail.
//
// EVERYTHING HERE IS PURE. The Firestore reads live in
// admin-outcome-cohorts.mjs so this file can be driven directly by
// scripts/test-outcome-cohorts.mjs with no emulator.
//
// THE TRAP THIS FILE EXISTS TO AVOID: an immature cohort. A loss from
// three days ago cannot answer "did they come back within 30 days," and
// counting it as a no is how a retention number gets quietly halved.
// Every window carries its own matured denominator, and a row that
// cannot answer a window is excluded from that window rather than
// scored as a negative.
// ─────────────────────────────────────────────────────────────

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// "The 10 minutes after an L" from the strategy notes, taken literally.
// This is the window where a rematch, a drill, or a close-the-tab
// happens, and it is the only part of the loss experience the product
// can still act on.
export const IMMEDIATE_MS = 10 * MINUTE_MS;

export const RETURN_WINDOWS = [1, 7, 30];

// Firestore hands back Timestamps, admin writes hand back numbers, and
// old rows hand back neither. Same coercion lib/judgment.mjs uses: a
// silent NaN here would land every row in the wrong window.
export function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One judgment becomes two cohort rows: the winner and the loser.
 *
 * Deliberately includes AI-opponent rounds, which the RATING ladder
 * excludes (lib/rating-apply.mjs: beating the AI is practice, not a
 * result). That exclusion is right for a competitive ranking and wrong
 * here: losing to the AI is still losing, and if it churns people we
 * need to see it. The rows carry aiOpponent so the endpoint can split.
 *
 * Row ids follow the house convention `${source}_${eventId}_${uid}`, so
 * re-deriving over the same judgment twice yields the same two ids.
 */
export function outcomeRows(judgment) {
  if (!judgment) return [];
  const { source, eventId, winner, participants } = judgment;
  if (winner !== 'a' && winner !== 'b') return [];
  if (!participants) return [];

  const at = toMs(judgment.judgedAt) || toMs(judgment.createdAt);
  if (!at) return [];

  const rows = [];
  for (const key of ['a', 'b']) {
    const uid = participants[key];
    // The AI holds no uid, and a self-match is a test round. Neither is
    // a person whose retention means anything.
    if (!uid || typeof uid !== 'string') continue;
    if (participants.a && participants.a === participants.b) continue;
    rows.push({
      id: `${source}_${eventId}_${uid}`,
      uid,
      outcome: winner === key ? 'win' : 'loss',
      at,
      source: source || '',
      eventId: eventId || '',
      aiOpponent: !!judgment.aiOpponent,
      opponentUid: participants[key === 'a' ? 'b' : 'a'] || '',
    });
  }
  return rows;
}

/**
 * Measure one row against that user's activity timeline.
 *
 * `activity` is [{ at, event }] for the SAME uid, any order. Only
 * activity strictly after the verdict counts: the round's own
 * completion events land on the same millisecond and would otherwise
 * read as "they immediately did something," which is the verdict
 * itself, not a response to it.
 *
 * A window the row is too young to answer returns null, never false.
 */
export function measureRow(row, activity, nowMs) {
  const after = (activity || [])
    .map((a) => ({ at: toMs(a && a.at), event: String((a && a.event) || '') }))
    .filter((a) => a.at > row.at)
    .sort((x, y) => x.at - y.at);

  const age = nowMs - row.at;
  const first = after[0] || null;

  // The 10-minute question needs 10 minutes to have passed.
  const immediateMature = age >= IMMEDIATE_MS;
  const inImmediate = first && first.at - row.at <= IMMEDIATE_MS ? first : null;

  const returnedWithin = {};
  const band = {};
  let bandFloor = 0;
  for (const w of RETURN_WINDOWS) {
    const edge = w * DAY_MS;
    const mature = age >= edge;
    // Cumulative: any activity in (verdict, verdict + N days].
    returnedWithin[w] = mature ? after.some((a) => a.at - row.at <= edge) : null;
    // Non-overlapping band, so the drop-off shape is visible instead of
    // three nested numbers that can only go down.
    band[w] = mature
      ? after.some((a) => a.at - row.at > bandFloor && a.at - row.at <= edge)
      : null;
    bandFloor = edge;
  }

  return {
    ...row,
    acted10: immediateMature ? !!inImmediate : null,
    secondsToNextAction: first ? Math.round((first.at - row.at) / 1000) : null,
    firstAction: inImmediate ? inImmediate.event : '',
    returnedWithin,
    band,
  };
}

function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

function rate(hits, denom) {
  return denom > 0 ? hits / denom : null;
}

/**
 * Aggregate measured rows into one bucket. Call it once per slice the
 * endpoint wants (losses, wins, losses-to-humans, and so on) rather
 * than teaching this function about slicing.
 *
 * Every rate ships with the denominator that produced it, because at
 * this sample size a bare percentage is decoration. Same discipline as
 * the stability harness.
 */
export function summarize(measured) {
  const rows = measured || [];
  const immediateAnswerable = rows.filter((r) => r.acted10 !== null);
  const acted = immediateAnswerable.filter((r) => r.acted10);

  const returnedWithin = {};
  const band = {};
  for (const w of RETURN_WINDOWS) {
    const matureW = rows.filter((r) => r.returnedWithin[w] !== null);
    returnedWithin[w] = {
      matured: matureW.length,
      returned: matureW.filter((r) => r.returnedWithin[w]).length,
      rate: rate(matureW.filter((r) => r.returnedWithin[w]).length, matureW.length),
    };
    const matureB = rows.filter((r) => r.band[w] !== null);
    band[w] = {
      matured: matureB.length,
      active: matureB.filter((r) => r.band[w]).length,
      rate: rate(matureB.filter((r) => r.band[w]).length, matureB.length),
    };
  }

  // What people actually DO in the 10 minutes, which is the half of the
  // question a retention percentage cannot answer.
  const actionCounts = new Map();
  for (const r of acted) {
    if (!r.firstAction) continue;
    actionCounts.set(r.firstAction, (actionCounts.get(r.firstAction) || 0) + 1);
  }
  const firstActions = [...actionCounts.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event))
    .slice(0, 8);

  return {
    n: rows.length,
    users: new Set(rows.map((r) => r.uid)).size,
    acted10: {
      answerable: immediateAnswerable.length,
      acted: acted.length,
      rate: rate(acted.length, immediateAnswerable.length),
    },
    medianSecondsToNextAction: median(acted.map((r) => r.secondsToNextAction)),
    firstActions,
    returnedWithin,
    band,
  };
}

/**
 * The headline: how much worse is the loser's retention than the
 * winner's, on the same window and only where both sides have a
 * matured denominator. Null rather than 0 when either side cannot
 * answer, because "no gap" and "no data" are opposite findings.
 */
export function lossPenalty(lossSummary, winSummary) {
  const out = {};
  for (const w of RETURN_WINDOWS) {
    const l = lossSummary && lossSummary.returnedWithin[w];
    const v = winSummary && winSummary.returnedWithin[w];
    out[w] =
      l && v && l.rate !== null && v.rate !== null
        ? { delta: l.rate - v.rate, lossN: l.matured, winN: v.matured }
        : { delta: null, lossN: (l && l.matured) || 0, winN: (v && v.matured) || 0 };
  }
  return out;
}

/**
 * Smallest honest reading of the sample. The stability run taught this
 * the expensive way: a rate on a handful of rows looks like a finding
 * and is noise, so the endpoint ships the caveat next to the number
 * rather than leaving it to whoever screenshots the dashboard.
 */
export function readingGuide(lossSummary) {
  const matured30 = (lossSummary && lossSummary.returnedWithin[30].matured) || 0;
  if (matured30 === 0) {
    return 'No loss is 30 days old yet. D30 cannot be read at all; watch the 10-minute column until one is.';
  }
  if (matured30 < 30) {
    return `Only ${matured30} losses have had 30 days to answer. Treat every rate here as a tripwire, not a measurement: at this n the 95% interval spans most of the range.`;
  }
  return `${matured30} matured losses. Enough to rank cohorts against each other, not enough to publish an absolute rate.`;
}
