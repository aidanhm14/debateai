// Firebase Auth admin helper — REST API edition.
//
// We need to read the Firebase Auth user list (the source of truth for
// all sign-ups, including Google / email-password accounts that never
// created a user_profiles Firestore doc). The official firebase-admin
// SDK does this in one call, but it pulls in gRPC native bindings
// that esbuild can't bundle without being added to
// netlify.toml > external_node_modules — and even then, gRPC under
// Netlify Lambda is fiddly.
//
// REST API route avoids all of that:
//   1. Sign a short-lived JWT with the service-account private key
//      (RS256). subject = service-account email, scope = identitytoolkit.
//   2. Exchange the JWT at oauth2.googleapis.com/token for a Bearer
//      access token (5-min cached).
//   3. Call identitytoolkit.googleapis.com/v1/projects/{pid}/accounts:batchGet
//      paginated to list every Auth user.
//
// Same service-account credentials as lib/firestore.mjs — baked into
// _firestore-creds.mjs at build time. crypto.subtle for the signing,
// same primitive auth.mjs already uses for ID token verification.

import {
  PROJECT_ID as BAKED_PROJECT_ID,
  CLIENT_EMAIL as BAKED_CLIENT_EMAIL,
  PRIVATE_KEY_B64 as BAKED_PRIVATE_KEY_B64,
} from './_firestore-creds.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase';

let cachedToken = null;
let cachedTokenExpiry = 0;

function resolveCreds() {
  if (BAKED_PROJECT_ID && BAKED_CLIENT_EMAIL && BAKED_PRIVATE_KEY_B64) {
    return {
      projectId: BAKED_PROJECT_ID,
      clientEmail: BAKED_CLIENT_EMAIL,
      privateKey: Buffer.from(BAKED_PRIVATE_KEY_B64, 'base64').toString('utf-8'),
    };
  }
  const pid = process.env.GOOGLE_PROJECT_ID;
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (pid && email && key) {
    return { projectId: pid, clientEmail: email, privateKey: key.replace(/\\n/g, '\n') };
  }
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (sa) {
    const c = JSON.parse(sa);
    if (c.project_id && c.client_email && c.private_key) {
      return { projectId: c.project_id, clientEmail: c.client_email, privateKey: c.private_key };
    }
  }
  throw new Error('service-account credentials not configured');
}

function b64urlEncode(buf) {
  // accepts ArrayBuffer / Uint8Array / Buffer / string
  const b = (typeof buf === 'string') ? Buffer.from(buf, 'utf-8') : Buffer.from(buf);
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Convert a PEM-encoded PKCS#8 private key string to an ArrayBuffer
 * suitable for crypto.subtle.importKey. Service-account keys from
 * Google are PKCS#8 / "-----BEGIN PRIVATE KEY-----".
 */
function pemToArrayBuffer(pem) {
  const trimmed = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(trimmed, 'base64');
}

async function signRS256(headerObj, payloadObj, privateKeyPem) {
  const header = b64urlEncode(JSON.stringify(headerObj));
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  const message = `${header}.${payload}`;
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return `${message}.${b64urlEncode(sig)}`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiry > now + 30) return cachedToken;

  const { clientEmail, privateKey } = resolveCreds();
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const assertion = await signRS256(header, payload, privateKey);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`token exchange ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}

/**
 * List all Firebase Auth users via the Identity Toolkit REST API.
 *
 * Returns: Array of objects shaped roughly like firebase-admin's
 * UserRecord, only with the fields we care about so the caller code
 * doesn't have to switch on the SDK:
 *   {
 *     uid: string,
 *     providerData: [{ providerId: 'google.com' | 'password' | ... }],
 *     metadata: { creationTime: ISO string }
 *   }
 *
 * Pagination cap of 50 pages × 1000 = 50K users — past that we throw.
 */
export async function listAllAuthUsers({ pageSize = 1000, maxPages = 50 } = {}) {
  const { projectId } = resolveCreds();
  const token = await getAccessToken();
  const out = [];
  let nextPageToken;
  let pages = 0;

  do {
    const params = new URLSearchParams({ maxResults: String(pageSize) });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    const url = `${IDENTITY_TOOLKIT_BASE}/projects/${projectId}/accounts:batchGet?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`accounts:batchGet ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const u of (data.users || [])) {
      out.push({
        uid: u.localId,
        providerData: (u.providerUserInfo || []).map(p => ({ providerId: p.providerId })),
        metadata: {
          // Identity Toolkit returns createdAt as a string of Unix ms.
          creationTime: u.createdAt ? new Date(Number(u.createdAt)).toISOString() : null,
        },
      });
    }
    nextPageToken = data.nextPageToken;
    pages += 1;
    if (pages >= maxPages && nextPageToken) {
      throw new Error(`listAllAuthUsers exceeded ${maxPages} pages`);
    }
  } while (nextPageToken);

  return out;
}
