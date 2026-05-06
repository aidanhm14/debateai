// /api/list-debaters — returns the public debater directory shown on /live
// Community tab. Reads public_profiles where isPublic == true, sorted by
// most-recently-updated. Anyone can call (no auth required) — the data is
// already public-by-consent on each profile, and gating it behind auth
// would block the social-proof value of the directory for first-time
// visitors landing on /live.
//
// Privacy contract:
//   - public_profiles is mirrored from user_profiles by save-profile.mjs
//   - Only fields the user explicitly typed into the public-profile editor
//     end up here. Email is never written. photoURL comes from the auth
//     token, but the user can omit nickname/location to stay anonymous.
//   - isPublic == false → excluded from the list.

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60; // generous — read-only endpoint, anon allowed
const rateLimitMap = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const e = rateLimitMap.get(key);
  if (!e || now - e.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  e.count += 1;
  return e.count <= RATE_LIMIT_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now - v.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(k);
  }
}, 5 * 60 * 1000);

const MAX_LIMIT = 60;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  if (!checkRateLimit(ip)) {
    return errorResponse('Too many requests. Try again in a moment.', 429, request);
  }

  try {
    const url = new URL(request.url);
    const reqLimit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 24));
    const formatFilter = (url.searchParams.get('format') || '').toLowerCase().slice(0, 24) || null;
    const circuitFilter = (url.searchParams.get('circuit') || '').toLowerCase().slice(0, 32) || null;

    const db = getDb();
    let q = db.collection('public_profiles')
      .where('isPublic', '==', true)
      .orderBy('updatedAt', 'desc')
      .limit(reqLimit);

    const snap = await q.get();
    const debaters = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      // Apply secondary filters in-memory — Firestore can't do array-contains
      // + orderBy(updatedAt) without a composite index, and the directory
      // is small enough that filtering N=24-60 docs in JS is free.
      if (formatFilter) {
        const formats = Array.isArray(d.formats) ? d.formats.map(x => String(x).toLowerCase()) : [];
        if (!formats.includes(formatFilter)) return;
      }
      if (circuitFilter) {
        if (String(d.circuit || '').toLowerCase() !== circuitFilter) return;
      }
      // Strip server-only / sensitive fields. Only ship what's safe to render.
      debaters.push({
        uid: doc.id,
        nickname: d.nickname || '',
        displayName: d.displayName || '',
        photoURL: d.photoURL || null,
        location: d.location || '',
        school: d.school || '',
        circuit: d.circuit || '',
        formats: Array.isArray(d.formats) ? d.formats : [],
        styleTags: Array.isArray(d.styleTags) ? d.styleTags : [],
        bio: d.bio || '',
        years: d.years || '',
        signatureCases: Array.isArray(d.signatureCases) ? d.signatureCases : [],
        wins: typeof d.wins === 'number' ? d.wins : null,
        losses: typeof d.losses === 'number' ? d.losses : null,
        updatedAt: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : null,
      });
    });

    return jsonResponse({ ok: true, debaters, count: debaters.length }, 200, request);
  } catch (err) {
    console.error('[list-debaters]', err.message);
    return errorResponse('Could not load debaters.', 500, request);
  }
};

export const config = { path: '/api/list-debaters' };
