// Audience topic board — read the ranked list.
// Endpoint: GET /api/topic-board?sort=top|new&limit=60
//
// Public and unauthenticated by design: the board is the answer to "what
// do people want debated", and it only works as a signal if anyone can
// see it. No App Check here — a read of already-public text is not worth
// the failure mode where a visitor with a blocked reCAPTCHA sees an empty
// page.
//
// Both sorts are single-field orderBy queries (votes, createdAt), so
// Firestore's automatic indexes cover them. Keep it that way: a composite
// index here would be a console-only step that does not ship from the repo.

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { COLLECTION, FORMATS, shapeTopic } from './lib/topic-requests.mjs';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 60;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('GET only', 405, request);

  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
  const requested = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(requested)
    ? Math.min(MAX_LIMIT, Math.max(1, requested))
    : DEFAULT_LIMIT;

  try {
    const db = getDb();
    const field = sort === 'new' ? 'createdAt' : 'votes';
    const snap = await db.collection(COLLECTION)
      .orderBy(field, 'desc')
      .limit(limit)
      .get();

    const topics = snap.docs.map(shapeTopic);

    // Ties on the top sort are common early on (everything sits at 0-2
    // votes). Break them on how many separate people asked for it, then
    // on recency, so the board does not look frozen.
    if (sort === 'top') {
      topics.sort((a, b) =>
        b.votes - a.votes ||
        b.suggestedCount - a.suggestedCount ||
        (b.createdAt || 0) - (a.createdAt || 0));
    }

    return jsonResponse({
      ok: true,
      sort,
      count: topics.length,
      formats: FORMATS,
      topics,
    }, 200, request);
  } catch (err) {
    console.error('[topic-board] error:', err.message);
    return errorResponse('Could not load the board.', 500, request);
  }
};

export const config = {
  path: '/api/topic-board',
};
