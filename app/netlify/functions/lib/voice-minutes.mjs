// ─────────────────────────────────────────────────────────────
// lib/voice-minutes.mjs — the voice allowance, in MINUTES, pure.
//
// WHY (2026-09-03, the founder: "make users pay for realtime API bc that
// is the most expensive, stop them at a certain reasonable point", then
// "minutes, under a subscription basis"). The cap counted MINTS: a
// ninety-second round and an eight-minute round cost the same, a topic
// restart cost a whole round, and every paid plan bypassed the cap
// outright, which on the single most expensive thing we run meant a
// $10-a-year Individual subscriber could run unlimited Realtime audio.
//
// THE MODEL. Every identity has a budget in minutes. A free identity
// gets a lifetime taste (anonymous smaller than named, because an
// anonymous uid is free to mint). A paid plan gets a MONTHLY budget that
// resets on the first of the month, not unlimited. A mint RESERVES up to
// eight minutes of the budget (the client's own hard cap) and charges
// one minute at once. The session is then SETTLED BY SERVER TIME: the
// server stamped the mint, and the end call, or the next mint if the end
// never came, stamps the close, so the charge is ceil(elapsed) capped at
// the reserve, and no client can under-report what it used. A client
// that ignores its cap still pays, at its next mint, for the whole
// reserve; that is the same bound the old model had.
//
// Past the budget the existing token path applies (tokens buy a round);
// the owner bypasses; nothing else does.
//
// Pure on purpose: the pre-commit guard drives every rule below without
// credentials. The I/O lives in lib/voice-usage.mjs.
// ─────────────────────────────────────────────────────────────

const env = (k, d) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// All env-tunable without a deploy, same posture as GUEST_FREE_ROUNDS.
export const ANON_VOICE_MINUTES = env('ANON_VOICE_MINUTES', 8);      // one short round
export const FREE_VOICE_MINUTES = env('FREE_VOICE_MINUTES', 20);     // a real taste
export const PLAN_VOICE_MINUTES_MONTH = env('PLAN_VOICE_MINUTES_MONTH', 120);
// The most a single session can reserve. Matches the /newvoice hard cap.
export const SESSION_RESERVE_MIN = Math.max(1, env('VOICE_SESSION_RESERVE_MIN', 8));
// A session that was never ended and has been open longer than this is
// stale beyond doubt; it settles at the full reserve regardless.
export const ORPHAN_AFTER_MS = 6 * 60 * 60 * 1000;

export function monthKey(nowMs) {
  const d = new Date(Number(nowMs) || 0);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/**
 * Which budget applies. `hasPlan` is planBypassesVoiceCap(team) from
 * lib/plans.mjs: a plan that used to lift the cap now gets the monthly
 * budget instead of nothing at all.
 */
export function budgetFor({ named = false, hasPlan = false } = {}) {
  if (hasPlan) return { kind: 'month', minutes: PLAN_VOICE_MINUTES_MONTH };
  if (named) return { kind: 'lifetime', minutes: FREE_VOICE_MINUTES };
  return { kind: 'lifetime', minutes: ANON_VOICE_MINUTES };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Minutes already spent against a budget, read off the usage doc.
 * Lifetime is the larger of the minutes field and the legacy round count
 * priced at a full reserve each, so nobody's spent rounds are forgiven
 * by the model change. The month bucket only counts if it is this month.
 */
export function minutesUsed(doc, budget, nowMs) {
  const d = doc || {};
  if (budget.kind === 'month') {
    return d.monthKey === monthKey(nowMs) ? num(d.monthMinutes) : 0;
  }
  const legacyRounds = num(d.rounds) + num(d.legacyRounds);
  return Math.max(num(d.minutes), legacyRounds * SESSION_RESERVE_MIN);
}

/** Minutes an unfinished session is owed at `nowMs`: elapsed, at least one, at most its reserve. */
export function settleMinutes(open, nowMs) {
  if (!open || !open.startedAtMs) return 0;
  const reserve = Math.max(1, num(open.reserve) || SESSION_RESERVE_MIN);
  const elapsed = Math.max(0, Number(nowMs) - Number(open.startedAtMs));
  const total = elapsed > ORPHAN_AFTER_MS ? reserve : Math.min(reserve, Math.max(1, Math.ceil(elapsed / 60000)));
  return Math.max(0, total - num(open.charged));
}

function addMinutes(d, minutes, nowMs) {
  if (minutes <= 0) return d;
  const key = monthKey(nowMs);
  return {
    ...d,
    minutes: num(d.minutes) + minutes,
    monthKey: key,
    monthMinutes: (d.monthKey === key ? num(d.monthMinutes) : 0) + minutes,
  };
}

/**
 * Close out whatever session is open on the doc (the end call never
 * came, or this is the end call), charging by server elapsed.
 */
export function settleOpen(doc, nowMs) {
  const d = { ...(doc || {}) };
  if (!d.open) return { doc: d, charged: 0 };
  const charged = settleMinutes(d.open, nowMs);
  const out = addMinutes(d, charged, nowMs);
  delete out.open;
  return { doc: out, charged };
}

/**
 * The gate. Settles any orphan first so it counts, then says whether a
 * new session may open and how long it may reserve.
 */
export function evaluate(doc, budget, nowMs) {
  const { doc: settled } = settleOpen(doc, nowMs);
  const used = minutesUsed(settled, budget, nowMs);
  const remaining = Math.max(0, budget.minutes - used);
  const reserve = Math.min(SESSION_RESERVE_MIN, remaining);
  return { doc: settled, used, remaining, reserve, allowed: reserve >= 1 };
}

/**
 * Open a session on the doc: charge one minute now, record the reserve
 * and the server-stamped start. Returns the doc to write.
 */
export function applyMint(doc, budget, nowMs, sessionId, { surface = '', anonymous = false, reserve } = {}) {
  const ev = evaluate(doc, budget, nowMs);
  const r = Math.max(1, Math.min(SESSION_RESERVE_MIN, Number.isFinite(reserve) ? reserve : ev.reserve));
  let d = addMinutes(ev.doc, 1, nowMs);
  d = {
    ...d,
    rounds: num(d.rounds) + 1,           // legacy counter, still informative
    anonymous: !!anonymous,
    lastRoundAt: nowMs,
    lastSurface: String(surface || '').slice(0, 40),
    open: { id: String(sessionId || ''), startedAtMs: nowMs, reserve: r, charged: 1, surface: String(surface || '').slice(0, 40) },
  };
  return { doc: d, reserve: r, used: ev.used + 1, remaining: Math.max(0, ev.remaining - 1) };
}

/** The end call. Only the session that is open may be ended; a stale id is a no-op. */
export function applyEnd(doc, sessionId, nowMs) {
  const d = doc || {};
  if (!d.open || String(d.open.id) !== String(sessionId)) return { doc: d, charged: 0, matched: false };
  const { doc: out, charged } = settleOpen(d, nowMs);
  return { doc: out, charged, matched: true };
}
