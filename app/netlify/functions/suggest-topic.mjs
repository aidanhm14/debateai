// Audience topic board — submit a request.
// Endpoint: POST /api/suggest-topic
// Payload: { topic, why?, format? }
//
// Open to anonymous visitors on purpose. The whole point of the board is
// to hear from people who have not signed up yet, so requiring auth would
// gut the signal. App Check keeps scripted callers out, the per-IP rate
// limit caps flooding, and content-guard is the floor on what gets written.
//
// Identical wording merges onto one doc (see topicId in lib) so the board
// ranks demand instead of showing the same motion five times.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { checkContent, sanitizeText } from './lib/content-guard.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { COLLECTION, isFormat, topicId, shapeTopic } from './lib/topic-requests.mjs';

const TOPIC_MIN = 10;
const TOPIC_MAX = 200;
const WHY_MAX = 240;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return errorResponse('App verification failed. Reload and try again.', 401, request);
  }

  const ip = callerIp(request);
  const rl = await checkLayers('suggest-topic', ip, [
    { label: 'tenmin', window: 600_000, max: 4 },
    { label: 'day', window: 86_400_000, max: 20 },
  ]);
  if (!rl.ok) {
    return errorResponse('That is a lot of topics at once. Try again a bit later.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const rawTopic = typeof body.topic === 'string' ? body.topic : '';
  const rawWhy = typeof body.why === 'string' ? body.why : '';
  const format = isFormat(body.format) ? body.format : 'any';

  const topicCheck = checkContent({
    text: rawTopic, kind: 'motion', minLength: TOPIC_MIN, maxLength: TOPIC_MAX,
  });
  if (!topicCheck.ok) return errorResponse(topicCheck.reason, 400, request);

  if (rawWhy.trim()) {
    const whyCheck = checkContent({ text: rawWhy, kind: 'note', maxLength: WHY_MAX });
    if (!whyCheck.ok) return errorResponse(whyCheck.reason, 400, request);
  }

  const topic = sanitizeText(rawTopic, 'motion').slice(0, TOPIC_MAX);
  const why = sanitizeText(rawWhy, 'note').slice(0, WHY_MAX);

  const id = topicId(topic);
  if (!id) return errorResponse('That topic needs some actual words in it.', 400, request);

  // Optional identity. A signed-in suggester gets their name on the card;
  // a bad/expired token is not an error here, it just means anonymous.
  let uid = null;
  let authorName = '';
  const token = extractBearerToken(request);
  if (token) {
    try {
      const payload = await verifyIdToken(token);
      uid = payload.sub || null;
      authorName = String(payload.name || '').trim().slice(0, 40);
    } catch { /* anonymous */ }
  }

  try {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();

    if (snap.exists) {
      // Same motion, different person. Count the demand, keep the original
      // wording and the original author. Only fill in a `why` if the first
      // suggester left it blank.
      const existing = snap.data() || {};
      const update = {
        suggestedCount: FieldValue.increment(1),
        lastSuggestedAt: FieldValue.serverTimestamp(),
      };
      if (why && !existing.why) update.why = why;
      await ref.update(update);
      const after = await ref.get();
      return jsonResponse({ ok: true, merged: true, topic: shapeTopic(after) }, 200, request);
    }

    await ref.set({
      topic,
      why,
      format,
      votes: 0,
      suggestedCount: 1,
      authorName,
      authorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      lastSuggestedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();
    return jsonResponse({ ok: true, merged: false, topic: shapeTopic(created) }, 200, request);
  } catch (err) {
    console.error('[suggest-topic] error:', err.message);
    return errorResponse('Could not save that topic. Try again.', 500, request);
  }
};

export const config = {
  path: '/api/suggest-topic',
};
