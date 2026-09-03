// ─────────────────────────────────────────────────────────────
// voice-allowance.mjs — "can this caller start a voice round right
// now?", answered by the same libraries that enforce it.
//
// WHY THIS EXISTS. /spar offers a waiting debater an AI round at 60s
// (2026-09-02). That offer hardcoded /voice-debate, and voice is capped
// at FREE_VOICE_NAMED (2) / FREE_VOICE_ANON (1) lifetime rounds. So the
// path built to rescue the ~47 sessions a week that end in nothing was
// itself handing a new signup a paywall on their third wait. The offer
// now asks here first and lands them on /practice instead when voice is
// spent, which is a full round with a ballot and a separate allowance.
//
// WHY NOT A CLIENT MIRROR. voice-debate.html already carries one
// (ANON_VOICE_LIMIT / FREE_VOICE_LIMIT), and on 2026-08-26 that mirror
// was found advertising 3/8 while the server enforced 2 — the page
// promised eight rounds and cut people off at two. Copying it into
// spar.html would be a third copy of a number that is env-overridable
// on purpose, and it would still be WRONG, because the client gate does
// not model the token-funded path at all: someone holding tokens can
// start a voice round past the free cap, and a mirror would route them
// to the lesser surface. One authority, asked over the wire.
//
// THE ORDER BELOW MIRRORS realtime-session.mjs DELIBERATELY: owner
// bypass before any Firestore read, then usage, then plan, then tokens.
// If that endpoint's order changes, change it here in the same commit,
// or this becomes a confident second opinion about someone else's rules.
//
// NOT App Check gated, on purpose. It spends no provider money, mints
// nothing, and discloses only the caller's own count back to the
// caller. Gating it would make a routing decision wait on App Check's
// ~800KB activation on a page that may never have needed it.
// ─────────────────────────────────────────────────────────────

import { verifyIdToken, extractBearerToken, isNamedAccount, isOwnerEmail } from './lib/auth.mjs';
import { getDb, getUserTeam } from './lib/firestore.mjs';
import { readVoiceUsage, freeVoiceLimit } from './lib/voice-usage.mjs';
import { planBypassesVoiceCap } from './lib/plans.mjs';
import { getTokenBalance, TOKENS, TOKENS_LIVE } from './lib/tokens.mjs';
import { corsResponse, jsonResponse } from './lib/response.mjs';

// Same global kill switch /api/voice-status reads. If voice is off for
// everyone, no allowance arithmetic can make it available.
function voiceEnabled() {
  const raw = String(process.env.VOICE_AI_ENABLED || 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off', 'disabled'].includes(raw);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms)),
  ]);
}

// An unreadable answer must never be worse than the behaviour this
// replaced, which was "always send them to voice". So every soft
// failure below resolves to ok:true with a reason naming why, rather
// than downgrading somebody who may well have rounds left.
function unknown(reason, request) {
  return jsonResponse({
    ok: true,
    reason,
    resolved: false,
    used: null,
    limit: null,
    isPro: false,
    tokenFunded: false,
    voiceEnabled: voiceEnabled(),
  }, 200, request);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, request);

  if (!voiceEnabled()) {
    return jsonResponse({
      ok: false,
      reason: 'voice_disabled',
      resolved: true,
      used: null,
      limit: null,
      isPro: false,
      tokenFunded: false,
      voiceEnabled: false,
    }, 200, request);
  }

  const token = extractBearerToken(request);
  // Tokenless is NOT the anonymous case (an anonymous visitor still
  // carries a Firebase token). It means auth had not settled, so there
  // is no identity to meter and no honest answer to give.
  if (!token) return unknown('no_identity', request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.warn('[voice-allowance] auth soft-failed:', err && err.message);
    return unknown('auth_failed', request);
  }

  const uid = decoded && decoded.sub;
  if (!uid) return unknown('no_identity', request);

  if (isOwnerEmail(decoded.email)) {
    return jsonResponse({
      ok: true, reason: 'owner', resolved: true,
      used: 0, limit: null, isPro: true, tokenFunded: false, voiceEnabled: true,
    }, 200, request);
  }

  const isNamed = isNamedAccount(decoded);
  const limit = freeVoiceLimit(isNamed);

  let used = 0;
  let isPro = false;
  let tokenFunded = false;

  try {
    const db = getDb();
    // The profile doc is read ONLY to carry pre-2026-08-26 history into
    // the count; the authoritative counter is voice_usage/{uid}, which
    // no client can write. See lib/voice-usage.mjs.
    const profileSnap = await withTimeout(
      db.collection('user_profiles').doc(uid).get(), 1500, 'profile read'
    ).catch((err) => { console.warn('[voice-allowance] profile read soft-failed:', err.message); return null; });
    const legacyProfile = (profileSnap && profileSnap.exists) ? profileSnap.data() : null;

    const readUsed = await readVoiceUsage(db, uid, legacyProfile);
    // readVoiceUsage returns null when the counter is unreadable, and
    // deliberately leaves the decision to the caller. realtime-session
    // lets the round happen; so do we.
    if (readUsed === null) return unknown('usage_unreadable', request);
    used = readUsed;

    try {
      const teamResult = await withTimeout(getUserTeam(uid), 1500, 'plan read');
      const team = teamResult && teamResult.team;
      if (team) isPro = planBypassesVoiceCap(team);
    } catch (planErr) {
      // Degrades to free, same as enforcement. A paid caller who lands
      // here is routed to /practice rather than to a wall, which costs
      // them the better surface and costs nobody a round.
      console.warn('[voice-allowance] plan lookup failed:', planErr && planErr.message);
    }

    // Past the free cap a token balance still buys the round, so the
    // answer is not limit arithmetic alone. Anonymous uids can never
    // hold a balance (buying needs a real account), which is why
    // enforcement skips this branch for them and so do we.
    if (!isPro && isNamed && used >= limit) {
      try {
        const balance = await withTimeout(getTokenBalance(uid), 1500, 'token balance read');
        tokenFunded = TOKENS_LIVE && balance >= TOKENS.VOICE_ROUND;
      } catch (tokErr) {
        console.warn('[voice-allowance] token read soft-failed:', tokErr && tokErr.message);
      }
    }
  } catch (err) {
    console.warn('[voice-allowance] read failed:', err && err.message);
    return unknown('read_failed', request);
  }

  const ok = isPro || tokenFunded || used < limit;
  return jsonResponse({
    ok,
    reason: ok
      ? (isPro ? 'pro' : (tokenFunded ? 'tokens' : 'free_rounds_left'))
      : (isNamed ? 'free_limit' : 'sign_in_required'),
    resolved: true,
    used,
    limit,
    isPro,
    tokenFunded,
    voiceEnabled: true,
  }, 200, request);
};

export const config = { path: '/api/voice-allowance' };
