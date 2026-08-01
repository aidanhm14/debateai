// WS2 Phase 3: Log reaction to a speech moment.
// Endpoint: POST /api/log-reaction
// Payload: { roundId, speechIndex, reactionKey }
// Stores reactions per speech for later analysis.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { json, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, speechIndex, reactionKey } = body;
  if (!roundId || typeof speechIndex !== 'number' || !reactionKey) {
    return errorResponse('roundId, speechIndex, reactionKey required', 400, request);
  }

  const validReactions = ['strong', 'dodge', 'citation', 'direct', 'unclear'];
  if (!validReactions.includes(reactionKey)) {
    return errorResponse('Invalid reactionKey', 400, request);
  }

  try {
    const db = getDb();

    // Store: voice_rounds/{id}/reactions/{speechIndex}/{reactionKey}
    const reactionRef = db.collection('voice_rounds').doc(roundId)
      .collection('reactions').doc(String(speechIndex))
      .collection('types').doc(reactionKey);

    await reactionRef.set({
      count: FieldValue.increment(1),
      lastReactedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Denormalize reaction count on speech doc
    await db.collection('voice_rounds').doc(roundId)
      .collection('reactions').doc(String(speechIndex))
      .update({ [reactionKey]: FieldValue.increment(1) })
      .catch(() => db.collection('voice_rounds').doc(roundId)
        .collection('reactions').doc(String(speechIndex))
        .set({ [reactionKey]: 1 }, { merge: true }));

    return json({ ok: true, roundId, speechIndex, reactionKey }, 200, request);
  } catch (err) {
    console.error('[log-reaction] error:', err.message);
    return errorResponse('Failed to log reaction', 500, request);
  }
};

export const config = {
  path: '/api/log-reaction',
};
