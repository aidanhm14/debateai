// Guards on the voice-minutes model (2026-09-03). Runs in the pre-commit
// hook. Every rule that decides what a session costs is here.
import { budgetFor, minutesUsed, settleMinutes, settleOpen, evaluate, applyMint, applyEnd, monthKey,
  ANON_VOICE_MINUTES, FREE_VOICE_MINUTES, PLAN_VOICE_MINUTES_MONTH, SESSION_RESERVE_MIN, ORPHAN_AFTER_MS }
  from '../app/netlify/functions/lib/voice-minutes.mjs';
let pass = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else failures.push(m); };
const MIN = 60000; const T = Date.UTC(2026, 8, 3, 12, 0, 0);

// budgets
ok(budgetFor({ named: false }).minutes === ANON_VOICE_MINUTES && budgetFor({}).kind === 'lifetime', 'anonymous gets the small lifetime taste');
ok(budgetFor({ named: true }).minutes === FREE_VOICE_MINUTES, 'named gets the free lifetime taste');
ok(budgetFor({ named: true, hasPlan: true }).kind === 'month' && budgetFor({ hasPlan: true }).minutes === PLAN_VOICE_MINUTES_MONTH, 'a plan gets a MONTHLY budget, not unlimited');
ok(ANON_VOICE_MINUTES < FREE_VOICE_MINUTES && FREE_VOICE_MINUTES < PLAN_VOICE_MINUTES_MONTH, 'budgets are ordered anon < named < plan');
ok(SESSION_RESERVE_MIN === 8, 'a session reserves at most the 8 minute client cap');

// legacy rounds are not forgiven
const free = budgetFor({ named: true });
ok(minutesUsed({ rounds: 2 }, free, T) === 2 * SESSION_RESERVE_MIN, 'two legacy rounds count as two full reserves');
ok(minutesUsed({ rounds: 1, minutes: 12 }, free, T) === 12, 'the larger of legacy rounds and minutes wins');
// month bucket
const plan = budgetFor({ hasPlan: true });
ok(minutesUsed({ monthKey: monthKey(T), monthMinutes: 50 }, plan, T) === 50, 'this month counts');
ok(minutesUsed({ monthKey: '2026-08', monthMinutes: 500 }, plan, T) === 0, 'last month resets');
ok(minutesUsed({ minutes: 999 }, plan, T) === 0, 'lifetime minutes do not count against a monthly budget');

// server-timed settlement
ok(settleMinutes({ startedAtMs: T, reserve: 8, charged: 1 }, T + 30000) === 0, 'thirty seconds costs the one minute already charged');
ok(settleMinutes({ startedAtMs: T, reserve: 8, charged: 1 }, T + 3.2 * MIN) === 3, 'three minutes twelve seconds settles to four total, three more');
ok(settleMinutes({ startedAtMs: T, reserve: 8, charged: 1 }, T + 25 * MIN) === 7, 'a session that ran past its cap is charged the reserve, no more');
ok(settleMinutes({ startedAtMs: T, reserve: 8, charged: 1 }, T + ORPHAN_AFTER_MS + 1) === 7, 'an orphan settles at the full reserve');
ok(settleMinutes(null, T) === 0, 'nothing open, nothing owed');

// the gate
let g = evaluate({}, free, T);
ok(g.allowed && g.reserve === 8 && g.remaining === FREE_VOICE_MINUTES, 'a fresh named account may open a full session');
g = evaluate({ minutes: FREE_VOICE_MINUTES - 3 }, free, T);
ok(g.allowed && g.reserve === 3, 'three minutes left reserves three, not eight');
g = evaluate({ minutes: FREE_VOICE_MINUTES }, free, T);
ok(!g.allowed && g.reserve === 0, 'a spent budget is the wall');
g = evaluate({ minutes: 1, open: { id: 's0', startedAtMs: T - 5 * MIN, reserve: 8, charged: 1 } }, free, T);
ok(g.used === 5 && !g.doc.open, 'an orphan is settled before the gate decides');

// a mint charges one minute now and records the reserve
let m = applyMint({}, free, T, 'sess1', { surface: 'realtime' });
ok(m.doc.minutes === 1 && m.doc.open.id === 'sess1' && m.doc.open.startedAtMs === T && m.doc.open.reserve === 8 && m.doc.open.charged === 1, 'mint charges one minute and opens the session');
ok(m.doc.rounds === 1, 'the legacy round counter still increments');
ok(m.remaining === FREE_VOICE_MINUTES - 1, 'remaining reflects the minute just charged');
// a second mint with the first still open settles the first by elapsed
let m2 = applyMint(m.doc, free, T + 4.5 * MIN, 'sess2', {});
ok(m2.doc.minutes === 5 + 1 && m2.doc.open.id === 'sess2', 'an unfinished session is settled at the next mint, by server time');
// the end call
let e = applyEnd(m.doc, 'sess1', T + 2.1 * MIN);
ok(e.matched && e.charged === 2 && e.doc.minutes === 3 && !e.doc.open, 'ending at 2:06 settles to three minutes total');
e = applyEnd(m.doc, 'wrong', T + 2 * MIN);
ok(!e.matched && e.charged === 0 && e.doc.open, 'a stale session id cannot end the open session');
e = applyEnd(m.doc, 'sess1', T + 40 * MIN);
ok(e.doc.minutes === 8, 'ending late is capped at the reserve');
// the client cannot say how long it ran: the API has no duration input
ok(applyEnd.length === 3, 'applyEnd takes (doc, sessionId, now) and no client-reported duration');
// monthly: a plan user near the line reserves what is left, then walls
const pd = { monthKey: monthKey(T), monthMinutes: PLAN_VOICE_MINUTES_MONTH - 2 };
g = evaluate(pd, plan, T);
ok(g.allowed && g.reserve === 2, 'a plan two minutes from the line reserves two');
m = applyMint(pd, plan, T, 'p1', {});
ok(m.doc.monthMinutes === PLAN_VOICE_MINUTES_MONTH - 1 && m.doc.open.reserve === 2, 'plan mint books against the month bucket');
g = evaluate({ monthKey: monthKey(T), monthMinutes: PLAN_VOICE_MINUTES_MONTH }, plan, T);
ok(!g.allowed, 'a plan at its monthly line is walled until the month turns');
g = evaluate({ monthKey: monthKey(T), monthMinutes: PLAN_VOICE_MINUTES_MONTH }, plan, Date.UTC(2026, 9, 1));
ok(g.allowed && g.remaining === PLAN_VOICE_MINUTES_MONTH, 'the first of the month refills the plan budget');

for (const f of failures) console.log('  FAIL:', f);
console.log(`[test-voice-minutes] ${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
