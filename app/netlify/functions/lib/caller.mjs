// Who is calling, and what are they entitled to?
//
// WHY THIS EXISTS: five endpoints that spend real money on an upstream
// provider (tts, transcribe, translate, flow, extract-claims) each grew their
// own idea of a caller. All five converged on the same answer, per-IP and
// nothing else, which is wrong in both directions at once:
//
//   - An IP is not a person. A school, a campus, or a carrier on CGNAT puts
//     hundreds of people behind one address, so a per-IP cap that is tight
//     enough to stop a script locks out a classroom.
//   - An IP is also not an account. Metering a signed-in paying user against
//     the same counter as the guest on the next desk is the same mistake from
//     the other side.
//
// A caller has up to three identities and they are not interchangeable:
// a named account (a real signup), an anonymous Firebase uid (the
// signInAnonymously() shadow user that js/notifications.js mints on nearly
// every page, which the visitor cannot reset by clearing storage), and an IP
// (the only thing left when neither is present). `key` picks the most
// specific one available so the same person counts as the same person.
//
// Entitlement is separate and deliberately conservative: `paid` is false
// unless a named account resolves to a live paid plan. A client-supplied
// "premium: true" is a request, not a fact.

import { verifyIdToken, extractBearerToken, isOwnerEmail, isNamedAccount } from './auth.mjs';
import { callerIp } from './rate-limit.mjs';

// `voice` ($12/mo) belongs here more than any other plan does: HD voice
// IS the tier. Leaving it out would have sold someone premium voice and
// then silently downgraded them to the free OpenAI voice.
const PAID_PLANS = new Set(['individual', 'team', 'lifetime', 'byok', 'voice']);
// Only EXPLICIT Stripe-bad statuses revoke. 'past_due' is a grace state Stripe
// retries through, and null/'inactive' from legacy or race-conditioned writes
// must not lock out someone who actually paid. Same rule claude.mjs uses.
const DEAD_STATUSES = new Set(['canceled', 'cancelled', 'incomplete_expired', 'unpaid']);

// A Firestore read per TTS call would be its own cost problem: a single round
// is dozens of speech chunks. Plans do not change mid-round, so cache the
// answer per uid. Short enough that an upgrade lands within minutes.
const PLAN_TTL_MS = 10 * 60_000;
const planCache = new Map(); // uid → { paid, at }

async function resolvePaid(uid, email) {
  if (isOwnerEmail(email)) return true;

  const hit = planCache.get(uid);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return hit.paid;

  let paid = false;
  try {
    // Lazy-import so callers that never ask for a plan do not pay the
    // Firestore cold-start cost.
    const { getUserTeam, withDeadline } = await import('./firestore.mjs');
    const result = await withDeadline(getUserTeam(uid), 2500);
    const team = result && result.team;
    paid = !!(team && PAID_PLANS.has(team.plan) && !DEAD_STATUSES.has(team.status));
  } catch (err) {
    // Firestore down or over quota. Fail to the FREE tier, not an error:
    // the caller still gets their round, just on the cheaper provider. A
    // hard failure here would break voice for everyone during an outage.
    console.warn('[caller] plan lookup failed, treating as free:', err && err.message);
    return false;
  }

  planCache.set(uid, { paid, at: Date.now() });
  if (planCache.size > 5000) {
    const entries = Array.from(planCache.entries());
    planCache.clear();
    entries.slice(-2500).forEach(([k, v]) => planCache.set(k, v));
  }
  return paid;
}

/**
 * Identify the caller.
 *
 * @param {Request} request
 * @param {{needPlan?: boolean}} opts  needPlan:true resolves `paid`, which may
 *        cost one cached Firestore read. Leave false when you only need to
 *        meter, not to entitle.
 * @returns {Promise<{ip,uid,anonUid,named,paid,key}>}
 *   key — most specific identity available, namespaced so a uid and an IP can
 *         never collide: 'uid_x' > 'anon_x' > 'ip_x'.
 */
export async function resolveCaller(request, { needPlan = false } = {}) {
  const ip = callerIp(request);
  const out = { ip, uid: null, anonUid: null, named: false, paid: false, key: 'ip_' + ip };

  const token = extractBearerToken(request);
  if (!token) return out;

  let decoded = null;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    // A stale or malformed token degrades to the anonymous lane rather than
    // erroring. js/app-check.js attaches tokens automatically, so a hard
    // failure here would kill a round that used to work.
    return out;
  }

  if (isNamedAccount(decoded)) {
    out.named = true;
    out.uid = decoded.sub;
    out.key = 'uid_' + decoded.sub;
    if (needPlan) out.paid = await resolvePaid(decoded.sub, decoded.email);
  } else {
    out.anonUid = decoded.sub;
    out.key = 'anon_' + decoded.sub;
  }

  return out;
}
