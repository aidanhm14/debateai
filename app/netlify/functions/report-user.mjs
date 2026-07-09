import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const REASONS = new Set(['harassment', 'hate_or_threats', 'sexual_content', 'spam', 'other']);

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Invalid token', 401, request); }

  let body;
  try { body = await request.json(); }
  catch (e) { return errorResponse('Bad JSON', 400, request); }

  const reporterUid = decoded.sub;
  const reportedUid = clean(body.reportedUid, 128);
  const reason = clean(body.reason, 40);
  const details = clean(body.details, 1000);
  const roomId = clean(body.roomId, 180);
  const reportedName = clean(body.reportedName, 120);
  const shouldBlock = body.block !== false;

  if (!reportedUid || reportedUid === reporterUid) return errorResponse('Invalid reported user', 400, request);
  if (!REASONS.has(reason)) return errorResponse('Invalid reason', 400, request);

  const db = getDb();
  const report = {
    reporterUid,
    reporterEmail: clean(decoded.email, 220),
    reportedUid,
    reportedName,
    reason,
    details,
    roomId,
    source: clean(body.source || 'live_round', 80),
    platform: clean(body.platform || 'web', 32),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  };

  const writes = [db.collection('safety_reports').add(report)];
  if (shouldBlock) {
    writes.push(db.collection('user_blocks').doc(reporterUid).collection('blocked').doc(reportedUid).set({
      reportedName,
      reason,
      roomId,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await Promise.all(writes);

  return jsonResponse({ ok: true, blocked: shouldBlock }, 200, request);
};

export const config = { path: '/api/report-user' };
