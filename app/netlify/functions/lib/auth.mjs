// Firebase ID token verification using Google's JWK keys.
// Uses crypto.subtle for signature verification.

let cachedKeys = null;
let cachedKeysExpiry = 0;

const FIREBASE_PROJECT_ID = 'debateos-78ac5';
const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

async function getJwks() {
  if (cachedKeys && Date.now() < cachedKeysExpiry) return cachedKeys;

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch Google JWKs');

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;
  cachedKeysExpiry = Date.now() + maxAge;

  const data = await res.json();
  cachedKeys = data.keys;
  return cachedKeys;
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('binary');
  }
  return atob(str);
}

function base64urlToUint8Array(str) {
  const binary = base64urlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Throws on invalid/expired tokens.
 */
export async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('No ID token provided');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));

  // Check claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.iat > now + 300) throw new Error('Token issued in the future');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`)
    throw new Error('Invalid issuer');
  if (!payload.sub || typeof payload.sub !== 'string')
    throw new Error('Invalid subject');

  // Get the matching JWK
  const jwks = await getJwks();
  const jwk = jwks.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key');

  // Import the JWK as a CryptoKey
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Verify signature
  const signatureBuffer = base64urlToUint8Array(parts[2]);
  const dataBuffer = new TextEncoder().encode(parts[0] + '.' + parts[1]);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBuffer,
    dataBuffer
  );

  if (!valid) throw new Error('Invalid token signature');

  return payload;
}

/**
 * Extract the Bearer token from an Authorization header.
 */
export function extractBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/**
 * Owner-account allowlist. These verified Firebase emails bypass every
 * server-side paywall: paid-plan gates, per-period usage caps, and the
 * voice-session lifetime cap. The shop owner shouldn't get locked out
 * of their own product while QA-ing it. Compared lowercase against the
 * `email` claim of a verified ID token (signature still has to validate,
 * so a spoofed email won't pass).
 *
 * To add a teammate, just add their Google address here — no other code
 * changes needed. To revoke, remove the entry and redeploy.
 */
export const OWNER_EMAILS = new Set([
  'aidandavidhollinger@gmail.com',
]);

export function isOwnerEmail(email) {
  return OWNER_EMAILS.has(String(email || '').toLowerCase());
}

/**
 * Enforce that the caller is signed in AND on a paid plan.
 * Returns { ok: true, uid, plan } on success, or { ok: false, status, error }
 * on failure — call sites should return the error response as-is.
 *
 * Use this to gate premium endpoints (Gemini, Grok, OpenAI) that free
 * users can't call. Free Claude usage goes through /api/claude which
 * has its own anonymous+trial layers and should not use this helper.
 */
export async function requirePaidPlan(request, featureName) {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in required. ' + (featureName || 'This model') + ' is a paid-plan feature.',
      code: 'AUTH_REQUIRED',
    };
  }

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication failed. Please sign in again.',
      code: 'AUTH_INVALID',
    };
  }

  // Owner bypass — short-circuit before the firestore lookup so the
  // owner can use every paid model without a team record.
  if (isOwnerEmail(decoded.email)) {
    return { ok: true, uid: decoded.sub, plan: 'owner' };
  }

  // Lazy-import firestore to avoid a circular dep + cold-start cost for
  // callers that happen to be checking auth without needing paid gating.
  const { getUserTeam } = await import('./firestore.mjs');
  const result = await getUserTeam(decoded.sub);
  const plan = result?.team?.plan;
  const status = result?.team?.status;
  const isPaid =
    plan &&
    plan !== 'trial' &&
    ['individual', 'team', 'lifetime', 'byok'].includes(plan) &&
    (!status || status === 'active' || status === 'trialing');

  if (!isPaid) {
    return {
      ok: false,
      status: 402, // Payment Required — semantically precise for this case.
      error: (featureName || 'This model') + ' is a paid feature. Upgrade to Individual ($5/mo) to unlock Gemini, GPT, and Grok alongside Claude Sonnet.',
      code: 'PAYMENT_REQUIRED',
      currentPlan: plan || 'trial',
    };
  }

  return { ok: true, uid: decoded.sub, plan };
}
