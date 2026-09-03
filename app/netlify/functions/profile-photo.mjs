// Public profile pictures, backed by Netlify Blobs.
//
//   GET  /api/profile-photo?uid=<uid>&v=<timestamp>  -> image/jpeg
//   POST /api/profile-photo                          -> { url, version }
//
// The browser crops and re-encodes every upload as a square JPEG before it
// gets here. The endpoint still checks the bytes, size, account, and request
// rate. Public identities store only { kind:'photo', v }, never an arbitrary
// URL. Renderers combine that version with the uid they already received from
// the round, profile, or leaderboard row.

import { getStore } from '@netlify/blobs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export const config = { path: '/api/profile-photo' };

const STORE = 'profile-photos';
const MAX_BYTES = 650 * 1024;
const UID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const LIMITS = [
  { window: 60 * 60 * 1000, max: 20, label: 'hour' },
  { window: 24 * 60 * 60 * 1000, max: 50, label: 'day' },
];

function namedAccount(payload) {
  const provider = payload?.firebase?.sign_in_provider;
  return !!provider && provider !== 'anonymous';
}

function photoUrl(uid, version) {
  return `https://itsdebatable.com/api/profile-photo?uid=${encodeURIComponent(uid)}&v=${version}`;
}

function imageResponse(bytes, versioned) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': versioned ? 'public, max-age=604800, immutable' : 'public, max-age=300',
      'Netlify-CDN-Cache-Control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const uid = params.get('uid') || '';
    if (!UID_RE.test(uid)) return errorResponse('Invalid profile', 400, request);
    const bytes = await getStore(STORE).get(`avatar/${uid}.jpg`, { type: 'arrayBuffer' });
    if (!bytes || !bytes.byteLength) {
      const missing = errorResponse('Profile picture not found', 404, request);
      missing.headers.set('Cache-Control', 'public, max-age=60');
      return missing;
    }
    return imageResponse(bytes, !!params.get('v'));
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let payload;
  try {
    payload = await verifyIdToken(extractBearerToken(request));
  } catch {
    return errorResponse('Sign in to upload a profile picture', 401, request);
  }
  if (!namedAccount(payload)) return errorResponse('Create an account to upload a profile picture', 403, request);

  const uid = payload.sub;
  if (!UID_RE.test(uid)) return errorResponse('Invalid account', 400, request);
  const limited = await checkLayers('profile_photo', `uid_${uid}`, LIMITS);
  if (!limited.ok) return errorResponse('Too many profile picture changes. Try again later.', 429, request);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return errorResponse('That picture is too large', 413, request);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return errorResponse('That picture is too large', 413, request);
  // JPEG SOI + EOI. The browser-side canvas encoder produces this exact
  // shape; anything else is rejected instead of being served as an image.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return errorResponse('Upload a JPG, PNG, or WebP picture', 415, request);
  }

  const version = Date.now();
  const url = photoUrl(uid, version);
  try {
    await getStore(STORE).set(`avatar/${uid}.jpg`, bytes.buffer);

    const db = getDb();
    const profileRef = db.collection('user_profiles').doc(uid);
    const current = await profileRef.get();
    const data = current.exists ? (current.data() || {}) : {};
    const avatarIdentity = data.avatarIdentity && typeof data.avatarIdentity === 'object'
      ? data.avatarIdentity : {};
    await profileRef.set({
      photoURL: url,
      avatarIdentity: {
        ...avatarIdentity,
        version: 4,
        photoVersion: version,
        pref: 'photo',
        pfpAuto: false,
        updatedAtMs: version,
      },
      avatarIdentityUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // A public profile is optional. If one exists, keep its picture current;
    // do not create a public profile just because somebody uploaded a photo.
    const publicRef = db.collection('public_profiles').doc(uid);
    const publicSnap = await publicRef.get();
    if (publicSnap.exists) {
      await publicRef.set({ photo: url, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return jsonResponse({ ok: true, url, version }, 200, request);
  } catch (err) {
    console.warn('[profile-photo] upload failed:', err?.message || err);
    return errorResponse('Could not save that picture right now', 503, request);
  }
};
