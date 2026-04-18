// Firebase App Check token verification.
// Mirrors the structure of auth.mjs: JWT signature check via JWKS + claim
// validation against the Firebase project. Used to gate the anonymous AI
// endpoints — only legitimate browsers running our Firebase web app can
// produce a valid App Check token, so this blocks scripted abuse.
//
// Env vars:
//   FIREBASE_PROJECT_NUMBER  e.g. "860359449192" (= the messagingSenderId in
//                            FIREBASE_CONFIG; visible in Firebase Console).
//   APP_CHECK_REQUIRED       "true" to hard-enforce; anything else logs only.
//
// Header sent by the client: X-Firebase-AppCheck

let cachedKeys = null;
let cachedKeysExpiry = 0;

const APPCHECK_JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const PROJECT_NUMBER = process.env.FIREBASE_PROJECT_NUMBER || '860359449192';

async function getJwks() {
  if (cachedKeys && Date.now() < cachedKeysExpiry) return cachedKeys;
  const res = await fetch(APPCHECK_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch App Check JWKs');
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
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('binary');
  return atob(str);
}

function base64urlToUint8Array(str) {
  const binary = base64urlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function verifyAppCheckToken(token) {
  if (!token) throw new Error('No App Check token provided');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid App Check token format');

  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));

  if (header.typ !== 'JWT') throw new Error('Invalid App Check token type');
  if (header.alg !== 'RS256') throw new Error('Invalid App Check token alg');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('App Check token expired');
  if (payload.iat > now + 300) throw new Error('App Check token issued in the future');
  if (payload.iss !== `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`) {
    throw new Error('Invalid App Check issuer');
  }
  // aud is an array containing "projects/PROJECT_NUMBER"
  const expectedAud = `projects/${PROJECT_NUMBER}`;
  const audMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedAud)
    : payload.aud === expectedAud;
  if (!audMatches) throw new Error('Invalid App Check audience');

  const jwks = await getJwks();
  const jwk = jwks.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown App Check signing key');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signatureBuffer = base64urlToUint8Array(parts[2]);
  const dataBuffer = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBuffer,
    dataBuffer
  );
  if (!valid) throw new Error('Invalid App Check signature');
  return payload;
}

export function extractAppCheckToken(request) {
  return request?.headers?.get?.('x-firebase-appcheck') || null;
}

/**
 * Gate helper for anonymous routes. Returns { ok, reason }.
 *  - When APP_CHECK_REQUIRED !== 'true', always returns { ok: true } and
 *    only logs failures (soft-enforce mode for staged rollout).
 *  - When APP_CHECK_REQUIRED === 'true', returns { ok: false } on missing
 *    or invalid tokens.
 */
export async function checkAppCheck(request) {
  const enforced = process.env.APP_CHECK_REQUIRED === 'true';
  const token = extractAppCheckToken(request);
  if (!token) {
    if (enforced) return { ok: false, reason: 'missing' };
    return { ok: true, reason: 'soft-pass-missing' };
  }
  try {
    await verifyAppCheckToken(token);
    return { ok: true, reason: 'verified' };
  } catch (err) {
    console.warn('[appcheck] verification failed:', err.message);
    if (enforced) return { ok: false, reason: 'invalid' };
    return { ok: true, reason: 'soft-pass-invalid' };
  }
}
