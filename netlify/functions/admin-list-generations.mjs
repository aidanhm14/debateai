// /api/admin/list-generations?format=apda&kind=case&limit=20&onlyUnrated=true
//
// Admin-only. Returns recent `generations` docs matching the filter so the
// admin rating tool at /admin-rate.html can surface them one at a time for
// 1-5 + boring-flag rating. The rating writes back via
// /api/admin/rate-generation, which lands `rating` directly on the
// generation doc so scheduled-distill.mjs picks it up on the next nightly
// pass (it queries `rating >= 4 OR saved`).
//
// Pagination: cursor on createdAt (ms epoch). Caller passes ?before=<ms>
// to fetch the next page.
//
// Auth: ADMIN_UID env var OR user_profiles.{uid}.isAdmin === true.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

const VALID_FORMATS = new Set([
  '', 'apda', 'bp', 'worlds', 'asian', 'wsdc', 'ld', 'pf', 'policy',
  'congress', 'mun', 'quick', 'viva',
]);

const VALID_KINDS = new Set([
  '', 'case', 'tightblock', 'sneaky', 'opp_attack', 'opponent', 'rebuttal',
  'poi', 'philosophy', 'judge_adapt', 'judge', 'debate_chat', 'casual',
  'bot', 'vision', 'resolution', 'voice_round', 'other',
]);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-list-generations auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-list-generations profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || '').toLowerCase();
  const kind = (url.searchParams.get('kind') || '').toLowerCase();
  const onlyUnrated = url.searchParams.get('onlyUnrated') === 'true';
  // Boring catalog filter — when on, only return generations the rater
  // flagged generic/boring. Closes the loop on the (b) cataloging
  // commitment: data is collected via the voice-debate post-RFD widget
  // + the admin rate tool's boring toggle; this is the read surface that
  // lets you act on the pile per-format. Client-side filter (no composite
  // index needed) for the same reason as onlyUnrated.
  const onlyBoring = url.searchParams.get('onlyBoring') === 'true';
  const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, limitRaw)) : DEFAULT_LIMIT;
  const beforeRaw = parseInt(url.searchParams.get('before') || '', 10);

  if (!VALID_FORMATS.has(format)) return errorResponse('Invalid format', 400, request);
  if (!VALID_KINDS.has(kind)) return errorResponse('Invalid kind', 400, request);

  try {
    // Base query: order by createdAt desc, optionally filter format.
    // kind is filtered client-side after the fetch so we don't need a
    // composite index for every (format, kind) pair. Rating filter is
    // also client-side for the same reason — admins only rate dozens
    // per session, not millions, so over-fetching by 3x is fine.
    let q = db.collection('generations').orderBy('createdAt', 'desc');
    if (format) q = q.where('format', '==', format);
    if (Number.isFinite(beforeRaw)) {
      q = q.where('createdAt', '<', new Date(beforeRaw));
    }
    // Fetch 3x the requested limit to compensate for client-side filtering.
    // onlyBoring needs an even wider net since boring-flagged docs are a
    // small fraction of total — 6x compensates without going wild.
    const fetchLimit = onlyBoring ? Math.min(MAX_LIMIT * 6, limit * 8) :
      (onlyUnrated || kind ? Math.min(MAX_LIMIT * 3, limit * 4) : limit);
    q = q.limit(fetchLimit);

    const snap = await q.get();
    const docs = [];
    let lastCreatedAtMs = null;

    // Defensive: any single bad doc (non-string field, weird type from legacy
    // writes, etc.) used to take down the whole batch with a 500. Now: coerce
    // text fields via String(), and catch per-doc so one bad apple doesn't
    // hide the rest.
    const safeStr = (v) => (v == null ? '' : String(v));
    const safeMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);

    for (const d of snap.docs) {
      try {
        const data = d.data() || {};
        const createdAtMs = safeMs(data.createdAt);
        lastCreatedAtMs = createdAtMs;
        if (kind && data.kind !== kind) continue;
        if (onlyUnrated && typeof data.rating === 'number') continue;
        if (onlyBoring && data.boring !== true) continue;
        const outputStr = safeStr(data.output);
        const ctx = data.context && typeof data.context === 'object' && !Array.isArray(data.context)
          ? data.context
          : {};
        docs.push({
          id: d.id,
          uid: safeStr(data.uid),
          kind: safeStr(data.kind),
          format: safeStr(data.format),
          motion: safeStr(data.motion).slice(0, 600),
          side: safeStr(data.side).slice(0, 40),
          model: safeStr(data.model).slice(0, 100),
          output: outputStr.slice(0, 6000),
          outputLength: typeof data.outputLength === 'number' ? data.outputLength : outputStr.length,
          systemPrompt: safeStr(data.systemPrompt).slice(0, 2000),
          userPrompt: safeStr(data.userPrompt).slice(0, 2000),
          fullTranscript: safeStr(ctx.fullTranscript).slice(0, 12000),
          rating: typeof data.rating === 'number' ? data.rating : null,
          boring: data.boring === true,
          // userNotes lands here when a low-rated round (or any boring-
          // flagged round) gets a free-text "what didn't land" comment
          // from the voice-debate widget, or when the admin rate tool
          // adds adminNotes. Both feed the same field; the UI shows it
          // inline so the cataloging view has the rater's actual reason.
          userNotes: safeStr(data.userNotes || data.adminNotes).slice(0, 600),
          ratedAt: safeMs(data.ratedAt),
          createdAt: createdAtMs,
        });
        if (docs.length >= limit) break;
      } catch (perDocErr) {
        console.error('admin-list-generations: skipping bad doc', d.id, perDocErr.message);
      }
    }

    return jsonResponse({
      ok: true,
      items: docs,
      cursor: lastCreatedAtMs,
      filters: { format, kind, onlyUnrated, limit },
    }, 200, request);
  } catch (err) {
    console.error('admin-list-generations error:', err.message, err.code || '');
    return errorResponse('Failed to list generations: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = {
  path: '/api/admin/list-generations',
};
