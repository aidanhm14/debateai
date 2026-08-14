// ─────────────────────────────────────────────────────────────
// Guards on the outcome-cohort math (lib/outcome-cohorts.mjs).
//
// The number this feeds is "after-loss D30", which is the one the
// strategy notes say decides whether the product exists. A retention
// number that is quietly wrong is worse than no number, because it
// gets pitched. So the assertions here are mostly about the two ways
// this specific measurement lies:
//
//   1. Immature rows scored as negatives. A loss from three days ago
//      cannot answer D30, and counting it as "did not return" halves
//      the figure invisibly.
//   2. The verdict's own events counted as a response to the verdict.
//
// Run: node scripts/test-outcome-cohorts.mjs
// ─────────────────────────────────────────────────────────────
import {
  outcomeRows, measureRow, summarize, lossPenalty, readingGuide,
  toMs, IMMEDIATE_MS, DAY_MS,
} from '../app/netlify/functions/lib/outcome-cohorts.mjs';

let pass = 0;
let fail = 0;
function t(label, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.error('FAIL: ' + label);
}

const NOW = 1_760_000_000_000;
const judgment = (over = {}) => ({
  source: 'async',
  eventId: 'r1',
  winner: 'a',
  participants: { a: 'alice', b: 'bob' },
  judgedAt: NOW - 60 * DAY_MS,
  aiOpponent: false,
  ...over,
});

// ── 1. one judgment, two rows, opposite outcomes ────────────────────
{
  const rows = outcomeRows(judgment());
  t('a judgment yields exactly two rows', rows.length === 2);
  const alice = rows.find((r) => r.uid === 'alice');
  const bob = rows.find((r) => r.uid === 'bob');
  t('winner is the win row', alice.outcome === 'win');
  t('the other side is the loss row', bob.outcome === 'loss');
  t('opponent is carried', alice.opponentUid === 'bob' && bob.opponentUid === 'alice');

  // Deterministic ids are what make re-deriving safe. Without this a
  // second pass over the same judgment doubles both cohorts.
  const again = outcomeRows(judgment());
  t('row ids are deterministic', again[0].id === rows[0].id && again[1].id === rows[1].id);
  t('row id follows the house convention', bob.id === 'async_r1_bob');
}

// ── 2. rows that are not people ─────────────────────────────────────
{
  t('no winner means no rows', outcomeRows(judgment({ winner: null })).length === 0);
  t('unresolved verdict yields no rows', outcomeRows(judgment({ winner: 'tie' })).length === 0);
  t('missing judgment yields no rows', outcomeRows(null).length === 0);
  t('no timestamp yields no rows', outcomeRows(judgment({ judgedAt: 0, createdAt: 0 })).length === 0);
  t('a self-match is dropped', outcomeRows(judgment({ participants: { a: 'alice', b: 'alice' } })).length === 0);
  // The AI holds no uid, so an AI round yields the human's row only.
  const ai = outcomeRows(judgment({ participants: { a: 'alice', b: '' }, aiOpponent: true }));
  t('AI opponent yields the human row only', ai.length === 1 && ai[0].uid === 'alice');
  t('AI rounds are flagged, not dropped', ai[0].aiOpponent === true);
  t('createdAt is the fallback clock', outcomeRows(judgment({ judgedAt: 0, createdAt: NOW - DAY_MS })).length === 2);
}

// ── 3. the verdict's own events are not a response to it ────────────
{
  const row = outcomeRows(judgment())[1];
  const m = measureRow(row, [
    { at: row.at, event: 'round_complete' },          // same ms as the verdict
    { at: row.at - 5_000, event: 'speech_end' },      // before it
  ], NOW);
  t('activity at or before the verdict does not count', m.acted10 === false);
  t('no next action means no seconds', m.secondsToNextAction === null);
  t('no first action recorded', m.firstAction === '');
}

// ── 4. the 10-minute window ─────────────────────────────────────────
{
  const row = outcomeRows(judgment())[1];
  const inside = measureRow(row, [{ at: row.at + 4 * 60_000, event: 'rematch_click' }], NOW);
  t('action inside 10 minutes counts', inside.acted10 === true);
  t('first action is named', inside.firstAction === 'rematch_click');
  t('seconds to next action are recorded', inside.secondsToNextAction === 240);

  const edge = measureRow(row, [{ at: row.at + IMMEDIATE_MS, event: 'drill_start' }], NOW);
  t('the boundary is inclusive', edge.acted10 === true);

  const outside = measureRow(row, [{ at: row.at + IMMEDIATE_MS + 1, event: 'drill_start' }], NOW);
  t('one ms past the window does not count', outside.acted10 === false);
  t('a later action still reports its delay', outside.secondsToNextAction === 600);
  t('but is not named as the first action', outside.firstAction === '');

  // A round judged 4 minutes ago cannot answer a 10-minute question.
  const young = measureRow({ ...row, at: NOW - 4 * 60_000 }, [], NOW);
  t('an unaged row returns null, not false, for the 10 minutes', young.acted10 === null);
}

// ── 5. maturity, which is the whole point ───────────────────────────
{
  const fresh = outcomeRows(judgment({ judgedAt: NOW - 3 * DAY_MS }))[1];
  const m = measureRow(fresh, [], NOW);
  t('a 3-day-old loss can answer D1', m.returnedWithin[1] === false);
  t('a 3-day-old loss cannot answer D7', m.returnedWithin[7] === null);
  t('a 3-day-old loss cannot answer D30', m.returnedWithin[30] === null);

  const old = measureRow(outcomeRows(judgment())[1], [], NOW);
  t('a 60-day-old loss answers every window', old.returnedWithin[30] === false && old.returnedWithin[7] === false);

  // The failure this guards: immature rows dragging a rate down.
  const mixed = [
    measureRow(outcomeRows(judgment({ eventId: 'r1' }))[1], [{ at: NOW - 59 * DAY_MS, event: 'x' }], NOW),
    measureRow(outcomeRows(judgment({ eventId: 'r2', judgedAt: NOW - DAY_MS }))[1], [], NOW),
    measureRow(outcomeRows(judgment({ eventId: 'r3', judgedAt: NOW - DAY_MS }))[1], [], NOW),
  ];
  const s = summarize(mixed);
  t('D30 denominator counts only matured rows', s.returnedWithin[30].matured === 1);
  t('D30 rate is not diluted by young rows', s.returnedWithin[30].rate === 1);
  t('D1 sees all three', s.returnedWithin[1].matured === 3);
}

// ── 6. cumulative vs banded ─────────────────────────────────────────
{
  const row = outcomeRows(judgment())[1];
  // Active once, on day 20: inside the cumulative D30, inside the 8-30
  // band, and absent from both earlier windows.
  const m = measureRow(row, [{ at: row.at + 20 * DAY_MS, event: 'round_start' }], NOW);
  t('cumulative D30 catches day-20 activity', m.returnedWithin[30] === true);
  t('cumulative D7 does not', m.returnedWithin[7] === false);
  t('the 8-30 band catches it', m.band[30] === true);
  t('the 2-7 band does not', m.band[7] === false);
  t('the day-1 band does not', m.band[1] === false);
}

// ── 7. summarize ────────────────────────────────────────────────────
{
  const mk = (id, acts) => measureRow(outcomeRows(judgment({ eventId: id }))[1], acts, NOW);
  const rows = [
    mk('r1', [{ at: NOW - 60 * DAY_MS + 60_000, event: 'rematch_click' }]),
    mk('r2', [{ at: NOW - 60 * DAY_MS + 180_000, event: 'rematch_click' }]),
    mk('r3', []),
  ];
  const s = summarize(rows);
  t('n counts rows', s.n === 3);
  t('users are deduped', s.users === 1);
  t('acted10 rate is over answerable rows', Math.abs(s.acted10.rate - 2 / 3) < 1e-9);
  t('median seconds is over actors only', s.medianSecondsToNextAction === 120);
  t('first actions are ranked', s.firstActions[0].event === 'rematch_click' && s.firstActions[0].count === 2);
  t('an empty bucket does not divide by zero', summarize([]).acted10.rate === null);
  t('an empty bucket reports zero n', summarize([]).n === 0);
}

// ── 8. the headline delta ───────────────────────────────────────────
{
  const loseAll = summarize([measureRow(outcomeRows(judgment())[1], [], NOW)]);
  const winBack = summarize([measureRow(
    outcomeRows(judgment({ eventId: 'r9' }))[0], [{ at: NOW - 50 * DAY_MS, event: 'x' }], NOW,
  )]);
  const p = lossPenalty(loseAll, winBack);
  t('loss penalty is negative when losers churn', p[30].delta === -1);
  t('penalty carries both denominators', p[30].lossN === 1 && p[30].winN === 1);

  // "No gap" and "no data" must not look the same.
  const young = summarize([measureRow(outcomeRows(judgment({ judgedAt: NOW - DAY_MS }))[1], [], NOW)]);
  t('no matured data yields a null delta, not zero', lossPenalty(young, young)[30].delta === null);
}

// ── 9. the reading guide refuses to oversell ────────────────────────
{
  const none = summarize([measureRow(outcomeRows(judgment({ judgedAt: NOW - DAY_MS }))[1], [], NOW)]);
  t('zero matured says D30 cannot be read', /cannot be read/.test(readingGuide(none)));
  const few = summarize([measureRow(outcomeRows(judgment())[1], [], NOW)]);
  t('a small sample is called a tripwire', /tripwire/.test(readingGuide(few)));
}

// ── 10. timestamp coercion ──────────────────────────────────────────
{
  t('epoch ms passes through', toMs(1234) === 1234);
  t('a Firestore Timestamp coerces', toMs({ toMillis: () => 999 }) === 999);
  t('a seconds shape coerces', toMs({ seconds: 2 }) === 2000);
  t('a Date coerces', toMs(new Date(5000)) === 5000);
  t('garbage is zero, never NaN', toMs('nope') === 0 && toMs(undefined) === 0);
  // NaN here would silently land every row in the earliest window.
  t('NaN is never returned', !Number.isNaN(toMs({})));
}

console.log(`\noutcome-cohorts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
