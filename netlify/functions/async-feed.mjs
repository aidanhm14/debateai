// /api/async/feed — the async-rounds marketplace.
//
// GET            → public feed: open challenges + recently completed
//                  public rounds. Shared-cached 60s (read-quota care).
// GET ?mine=1    → auth: the caller's rounds, both seats, with a
//                  needsAction flag. Equality-only queries, no composites.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';
import { publicRound, FEED_CACHE_KEY, FORMAT_NAMES } from './lib/async-rounds.mjs';

const FEED_TTL_MS = 60 * 1000;

function feedRow(id, d) {
  return {
    id, motion: d.motion, format: d.format, formatName: FORMAT_NAMES[d.format] || d.format,
    state: d.state, prop: d.prop, opp: d.opp, aiOpp: !!d.aiOpp,
    createdAt: d.createdAt || 0, deadlineAt: d.deadlineAt || 0, completedAt: d.completedAt || 0,
    winner: d.ballot ? d.ballot.winner : null,
    votes: d.votes || { prop: 0, opp: 0 },
    turnCount: (d.turns || []).length,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const url = new URL(request.url);
  const db = getDb();

  if (url.searchParams.get('mine')) {
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Sign in to see your rounds.', 401, request);
    let uid;
    try { uid = (await verifyIdToken(token)).sub; }
    catch { return errorResponse('Authentication failed.', 401, request); }

    const [asProp, asOpp] = await Promise.all([
      withDeadline(db.collection('async_rounds').where('prop.uid', '==', uid).limit(50).get(), 2500),
      withDeadline(db.collection('async_rounds').where('opp.uid', '==', uid).limit(50).get(), 2500),
    ]);
    const seen = new Set();
    const rounds = [];
    for (const snap of [asProp, asOpp]) {
      snap.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        const d = doc.data();
        const row = feedRow(doc.id, d);
        row.needsAction = d.state === 'awaiting_reply' && d.prop && d.prop.uid === uid;
        rounds.push(row);
      });
    }
    rounds.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ rounds, at: Date.now() }, 200, request);
  }

  const cached = await getCachedShared(FEED_CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const [openSnap, doneSnap] = await Promise.all([
      withDeadline(db.collection('async_rounds').where('feedKey', '==', 'open-public').limit(40).get(), 2500),
      withDeadline(db.collection('async_rounds').where('feedKey', '==', 'done-public').limit(40).get(), 2500),
    ]);
    const open = []; const done = [];
    openSnap.forEach((doc) => open.push(feedRow(doc.id, doc.data())));
    doneSnap.forEach((doc) => done.push(feedRow(doc.id, doc.data())));
    open.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const payload = { open: open.slice(0, 24), done: done.slice(0, 24), at: Date.now() };
    await setCachedShared(FEED_CACHE_KEY, payload, FEED_TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[async-feed]', err && err.message);
    return jsonResponse({ open: [], done: [], at: Date.now(), error: 'feed-unavailable' }, 200, request);
  }
};

export const config = { path: '/api/async/feed' };
