// WS2 Phase 3: Log reaction to a speech moment.
// Endpoint: POST /api/log-reaction
// Payload: { roundId, speechIndex, reactionKey }
// Stores reactions per speech for later analysis.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';

// 2026-09-07 security sweep: was keyless and unmetered, incrementing
// reaction counters under ANY voice_rounds id. Token required (anonymous
// is fine), ids validated, metered per uid and IP, round must exist.
const ROUND_ID = /^[A-Za-z0-9_-]{1,120}$/;
const UID_LAYERS = [
  { window: 60_000, max: 60, label: 'min' },
  { window: 3_600_000, max: 600, label: 'hour' },
];
const IP_LAYERS = [
  { window: 60_000, max: 240, label: 'min' },
  { window: 3_600_000, max: 2400, label: 'hour' },
];

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let uid;
  try { uid = (await verifyIdToken(token)).sub; }
  catch { return errorResponse('Invalid token', 401, request); }

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
  if (!ROUND_ID.test(String(roundId)) || !Number.isInteger(speechIndex) || speechIndex < 0 || speechIndex > 200) {
    return errorResponse('Invalid roundId or speechIndex', 400, request);
  }

  const ipGate = await checkLayers('reaction', 'ip_' + callerIp(request), IP_LAYERS);
  if (!ipGate.ok) return errorResponse('Too many requests', 429, request);
  const uidGate = await checkLayers('reaction', 'uid_' + uid, UID_LAYERS);
  if (!uidGate.ok) return errorResponse('Too many requests', 429, request);

  try {
    const db = getDb();

    const roundSnap = await db.collection('voice_rounds').doc(roundId).get();
    if (!roundSnap.exists) return errorResponse('Round not found', 404, request);

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

    return jsonResponse({ ok: true, roundId, speechIndex, reactionKey }, 200, request);
  } catch (err) {
    console.error('[log-reaction] error:', err.message);
    return errorResponse('Failed to log reaction', 500, request);
  }
};

export const config = {
  path: '/api/log-reaction',
};
