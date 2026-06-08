// Public read of the corpus-stats snapshot that the nightly aggregator
// (scheduled-corpus-stats.mjs) writes to corpus_stats/latest. Served via
// a function (not a direct Firestore client read) so the firestore.rules
// stay lean and the page doesn't need Firebase auth to load.
//
// Returns the snapshot verbatim if it exists, or a small bootstrap shape
// with zeros if the nightly aggregator hasn't run yet on a fresh deploy.

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  try {
    const db = getDb();
    const doc = await db.collection('corpus_stats').doc('latest').get();

    if (!doc.exists) {
      // Bootstrap shape so the page can render before the first cron run.
      // Values are intentionally clearly-zero / placeholder.
      return jsonResponse({
        bootstrap: true,
        updatedAt: null,
        totalInternalRounds: 0,
        totalContributable: 0,
        optInMembers: 0,
        voiceRounds: 0,
        voiceMinutesEstimate: 0,
        byFormat: {},
        languages: ['en'],
        firstCorpusEntryAt: null,
        learningLoopActiveSince: '2026-05-13',
        consentLayerActiveSince: '2026-05-25',
      }, 200, request);
    }

    return jsonResponse(doc.data(), 200, request);
  } catch (err) {
    console.error('[corpus-stats:read]', err.message);
    return errorResponse('Failed to load corpus stats', 500, request);
  }
};

export const config = {
  path: '/api/corpus-stats',
};
