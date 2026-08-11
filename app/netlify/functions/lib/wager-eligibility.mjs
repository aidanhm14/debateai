// ─────────────────────────────────────────────────────────────
// Who is allowed to put points at stake.
//
// Until now the answer was "anyone with a token", across all three
// economies (floor_*, predict_*, credit_*). That was survivable only
// because the currency is non-redeemable. It stops being survivable the
// moment any of the three real-money pipes opens (ENTRY_PAYMENTS_LIVE,
// BETA_NO_CHARGE, TOKENS_LIVE are each one env var from live), because
// every one of those paths needs to be able to say who was 17 and who
// was in a jurisdiction that forbids this.
//
// Two gates, deliberately asymmetric:
//
//   1. AGE. `onboarding.ageRange` is self-reported and already collects
//      '13-15' and '16-18'. A profile carrying a minor range is refused
//      OUTRIGHT and cannot attest its way out: letting a self-declared
//      15-year-old tick an "I am 18" box would make the attestation
//      worth less than the data we already hold. Everyone else must
//      carry an explicit `wagerAgeAttested`, which is a separate flag
//      from `corpusAgeAttested` on purpose. Consenting to have your
//      transcript licensed and consenting to stake are different acts,
//      and one must never be read as the other.
//
//   2. JURISDICTION. Read from Netlify's edge geo only. `lib/geo.mjs`
//      honours a `?country=` query override, which is correct for
//      choosing a payment processor and disqualifying for a compliance
//      control, so this module deliberately does not use it.
//
// Both gates FAIL CLOSED on a read error. A wager surface that cannot
// tell who it is talking to must not take the bet.
//
// Today this changes nothing for an adult user with an attestation, and
// the jurisdiction list ships empty. That is the point: the mechanism is
// wired so turning it on is an env change, not a build.
// ─────────────────────────────────────────────────────────────

// Self-reported ranges from js/onboarding.js that put the user under 18.
// Keep in sync with the ageRange options there.
export const MINOR_AGE_RANGES = new Set(['13-15', '16-18', 'under-13']);

export const ELIGIBILITY_REASONS = {
  minor: 'Staking is 18+. Your profile says you are under 18, so this is not available on your account.',
  no_attestation: 'Confirm you are 18 or older before staking points.',
  jurisdiction: 'Staking is not available in your location.',
  unknown: 'Could not verify staking eligibility. Try again.',
};

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

/**
 * Countries where staking is switched off, as an env-driven allow/deny.
 * Empty by default, so this ships as a no-op and becomes a real control
 * with `WAGER_BLOCKED_COUNTRIES=US,FR` and no redeploy.
 */
export function blockedCountries() {
  const raw = String(process.env.WAGER_BLOCKED_COUNTRIES || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
}

/**
 * Country code from Netlify's edge only. Never from a query param and
 * never from a client-supplied body field, because both are trivially
 * forged and this value is a compliance control, not a display hint.
 * Returns '' when the edge told us nothing.
 */
export function trustedCountry(request, context) {
  try {
    const g = context && context.geo;
    if (g && typeof g.country === 'string' && /^[A-Za-z]{2}$/.test(g.country)) {
      return g.country.toUpperCase();
    }
    if (g && g.country && typeof g.country.code === 'string' && /^[A-Za-z]{2}$/.test(g.country.code)) {
      return g.country.code.toUpperCase();
    }
  } catch (e) { /* fall through to the header */ }
  try {
    const blob = request && request.headers && request.headers.get('x-nf-geo');
    if (blob) {
      const j = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'));
      const cc = j && (typeof j.country === 'string' ? j.country : (j.country && j.country.code));
      if (typeof cc === 'string' && /^[A-Za-z]{2}$/.test(cc)) return cc.toUpperCase();
    }
  } catch (e) { /* unparseable geo is the same as no geo */ }
  return '';
}

/**
 * Jurisdiction gate. Unknown country is ALLOWED while the blocklist is
 * empty (the overwhelmingly common case is simply that the edge did not
 * report), and REFUSED once an operator has declared a blocklist, because
 * at that point a missing country is the shape a VPN-shaped request takes
 * and we would rather turn away a real user than serve a blocked one.
 */
export function checkJurisdiction(request, context) {
  const blocked = blockedCountries();
  if (blocked.size === 0) return { ok: true, country: trustedCountry(request, context) };
  const cc = trustedCountry(request, context);
  if (!cc) return { ok: false, reason: 'jurisdiction', country: '' };
  if (blocked.has(cc)) return { ok: false, reason: 'jurisdiction', country: cc };
  return { ok: true, country: cc };
}

/**
 * Age gate. Reads user_profiles/{uid} once per 5 minutes per uid.
 * Returns { ok:true } or { ok:false, reason } where reason keys into
 * ELIGIBILITY_REASONS.
 */
export async function checkWagerAge(db, uid) {
  if (!uid) return { ok: false, reason: 'unknown' };
  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && now - hit.at < CACHE_MS) return hit.result;

  let result;
  try {
    const snap = await db.collection('user_profiles').doc(uid).get();
    const d = snap.exists ? snap.data() : null;
    const range = d && d.onboarding && typeof d.onboarding.ageRange === 'string'
      ? d.onboarding.ageRange.trim().toLowerCase()
      : '';
    if (range && MINOR_AGE_RANGES.has(range)) {
      result = { ok: false, reason: 'minor' };
    } else if (!d || d.wagerAgeAttested !== true) {
      result = { ok: false, reason: 'no_attestation' };
    } else {
      result = { ok: true };
    }
  } catch (err) {
    // Fail closed, and do not cache a failure: a transient Firestore
    // error must not lock a legitimate user out for five minutes.
    console.warn('[wager-eligibility] age check failed, refusing:', err.message);
    return { ok: false, reason: 'unknown' };
  }

  cache.set(uid, { at: now, result });
  return result;
}

/**
 * Both gates. Call this immediately before any code path that moves a
 * stake. Returns { ok:true, country } or { ok:false, reason, message }.
 */
export async function checkWagerEligibility(db, uid, request, context) {
  const j = checkJurisdiction(request, context);
  if (!j.ok) return { ok: false, reason: j.reason, message: ELIGIBILITY_REASONS.jurisdiction };
  const a = await checkWagerAge(db, uid);
  if (!a.ok) return { ok: false, reason: a.reason, message: ELIGIBILITY_REASONS[a.reason] || ELIGIBILITY_REASONS.unknown };
  return { ok: true, country: j.country };
}

/**
 * Drop one uid's cached decision. Call immediately after writing an
 * attestation, or the user waits up to 5 minutes to be let in and
 * reasonably concludes the button is broken.
 */
export function invalidateWagerEligibility(uid) { if (uid) cache.delete(uid); }

// Test seam: the 5-minute cache would otherwise make a suite that flips
// a profile between assertions read stale.
export function _clearWagerEligibilityCache() { cache.clear(); }
