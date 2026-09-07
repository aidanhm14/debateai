// Read-only voice allowance for routing and the pre/post-round meter.
// Uses the same minute budget, plan predicate and token fallback as the
// minter. It never mints, spends, writes usage, or accepts client counts.
import { verifyIdToken, extractBearerToken, isNamedAccount, isOwnerEmail } from './lib/auth.mjs';
import { getDb, getUserTeam } from './lib/firestore.mjs';
import { voiceGate, SESSION_RESERVE_MIN } from './lib/voice-usage.mjs';
import { planBypassesVoiceCap } from './lib/plans.mjs';
import { getTokenBalance, TOKENS, TOKENS_LIVE } from './lib/tokens.mjs';
import { corsResponse, jsonResponse } from './lib/response.mjs';

function voiceEnabled() {
  return !['false', '0', 'no', 'off', 'disabled'].includes(String(process.env.VOICE_AI_ENABLED || 'true').trim().toLowerCase());
}
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
function reply(data, request) {
  const response = jsonResponse({
    unit: 'minutes', used: null, limit: null, remaining: null, period: null,
    resetsAt: null, nextSessionMinutes: null, isPro: false, hasPlan: false,
    tokenFunded: false, tokensLive: TOKENS_LIVE, tokenCost: TOKENS.VOICE_ROUND,
    voiceEnabled: voiceEnabled(), ...data,
  }, 200, request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
function unknown(reason, request) {
  // Do not manufacture a paywall from a failed read. The mint remains
  // authoritative; an unresolved routing answer preserves the voice door.
  return reply({ ok: true, reason, resolved: false }, request);
}
export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, request);
  if (!voiceEnabled()) return reply({ ok: false, reason: 'voice_disabled', resolved: true }, request);
  const token = extractBearerToken(request);
  if (!token) return unknown('no_identity', request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return unknown('auth_failed', request); }
  const uid = decoded && decoded.sub;
  if (!uid) return unknown('no_identity', request);
  if (isOwnerEmail(decoded.email)) return reply({
    ok: true, reason: 'owner', resolved: true, used: 0,
    isPro: true, nextSessionMinutes: SESSION_RESERVE_MIN,
  }, request);
  // Ordinary mints require a named account. The ten-second anonymous
  // preview has its own endpoint and never consumes this allowance.
  if (!isNamedAccount(decoded)) return reply({ ok: false, reason: 'sign_in_required', resolved: true }, request);
  try {
    const db = getDb();
    const [profileSnap, membership] = await Promise.all([
      withTimeout(db.collection('user_profiles').doc(uid).get(), 1500, 'profile read'),
      withTimeout(getUserTeam(uid), 1500, 'plan read'),
    ]);
    const hasPlan = planBypassesVoiceCap(membership && membership.team);
    const nowMs = Date.now();
    const gate = await withTimeout(voiceGate(db, uid, {
      named: true, hasPlan, nowMs,
      legacyProfileData: profileSnap.exists ? profileSnap.data() : null,
    }), 1500, 'usage read');
    if (!gate) return unknown('usage_unreadable', request);
    let tokenFunded = false;
    if (!gate.allowed) {
      // Existing balances remain spendable in the minter even when the
      // token purchase surface is off. TOKENS_LIVE only steers that link.
      // If the balance cannot be read, do not claim the caller must pay.
      const balance = await withTimeout(getTokenBalance(uid), 1500, 'token read');
      tokenFunded = balance >= TOKENS.VOICE_ROUND;
    }
    const monthly = gate.budget.kind === 'month';
    const now = new Date(nowMs);
    const ok = gate.allowed || tokenFunded;
    return reply({
      ok, resolved: true,
      reason: tokenFunded ? 'tokens' : gate.allowed ? (hasPlan ? 'plan_minutes_left' : 'free_minutes_left') : (hasPlan ? 'month_limit' : 'free_limit'),
      used: gate.used, limit: gate.budget.minutes, remaining: gate.remaining,
      period: gate.budget.kind,
      resetsAt: monthly ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString() : null,
      nextSessionMinutes: tokenFunded ? SESSION_RESERVE_MIN : gate.reserve,
      isPro: hasPlan, hasPlan, tokenFunded,
    }, request);
  } catch (err) {
    console.warn('[voice-allowance] read failed:', err && err.message);
    return unknown('read_failed', request);
  }
};
export const config = { path: '/api/voice-allowance' };
