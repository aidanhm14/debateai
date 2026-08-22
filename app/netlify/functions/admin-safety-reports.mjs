// The safety-report review bench.
//
// GET                                        list reports (open first)
// POST { action:'resolve', reportId, outcome, note }
//
// safety_reports has taken writes since the report modal shipped and has
// never had a reader outside the raw Firestore console, so every report
// (and, since 2026-08-22, the attached AI-use transcript screen) landed
// somewhere nobody looks. This is the reader.
//
// Same posture as admin-appeals.mjs, and it is load-bearing: there is NO
// model call in this file and no scheduled job that resolves a report on
// its own. The machine screen attached to an ai_use report is evidence
// for the human reading this queue, never a verdict, and resolving here
// records the human's call without touching strikes, bans, or ejects —
// enforcement stays in its own tools (video-moderate's peer-report path),
// where corroboration rules already live. A queue that could ban from a
// dashboard button would be the 2026-08-18 auto-ban ladder wearing an
// admin page. scripts/test-ai-use.mjs asserts the no-provider-call and
// no-cron facts.
import { requireAdmin } from './lib/admin-auth.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const OUTCOMES = new Set(['no_action', 'warned', 'escalated']);
// Bounded read: the collection holds a handful of docs today, and this
// endpoint is eager on /admin's cold open (the attention strip needs the
// open count), so the cap is what keeps "eager" honest if reports ever
// pile up. Newest first on the automatic single-field index — no
// composite (a status filter + createdAt order needs one, and a missing
// composite throws at QUERY time; see the cash-round entry).
const MAX_ROWS = 120;

const ms = (v) => {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return null; } }
  return null;
};

function row(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    reason: d.reason || 'other',
    details: d.details || '',
    reporterUid: d.reporterUid || '',
    reporterEmail: d.reporterEmail || '',
    reportedUid: d.reportedUid || '',
    reportedName: d.reportedName || '',
    roomId: d.roomId || '',
    source: d.source || '',
    status: d.status === 'resolved' ? 'resolved' : 'open',
    createdAt: ms(d.createdAt),
    // The full machine screen, raw. The REPORTER only ever saw the
    // verdict word; the reviewer is the person the evidence was
    // collected for.
    aiAnalysis: d.aiAnalysis || null,
    outcome: d.outcome || null,
    reviewNote: d.reviewNote || '',
    resolvedAt: d.resolvedAt || null,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db, uid: reviewerUid } = auth;
  const coll = db.collection('safety_reports');

  if (request.method === 'GET') {
    const snap = await coll.orderBy('createdAt', 'desc').limit(MAX_ROWS).get();
    const rows = snap.docs.map(row);
    const open = rows.filter((r) => r.status === 'open');
    const resolved = rows.filter((r) => r.status !== 'open');
    return jsonResponse({
      // Oldest open report first: the queue is a promise to the person
      // who filed it, and the row closest to being broken goes on top.
      open: open.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      resolved,
      counts: { open: open.length, resolved: resolved.length, truncated: snap.size >= MAX_ROWS },
    }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('GET or POST', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Bad JSON', 400, request); }
  if (body.action !== 'resolve') return errorResponse('Unknown action', 400, request);

  const outcome = String(body.outcome || '');
  if (!OUTCOMES.has(outcome)) return errorResponse('Outcome must be no_action, warned, or escalated.', 400, request);
  // A note is mandatory. "Resolved" with nothing behind it is
  // indistinguishable from tidying the queue, and the note is what the
  // NEXT report about the same person gets read against.
  const note = String(body.note || '').trim();
  if (note.length < 10) return errorResponse('Say what you decided and why, at least 10 characters. The next report about this person gets read against it.', 400, request);

  const ref = coll.doc(String(body.reportId || ''));
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new Error('not_found');
      if (fresh.data().status === 'resolved') throw new Error('already_resolved');
      tx.update(ref, {
        status: 'resolved',
        outcome,
        reviewerUid,
        reviewNote: note.slice(0, 2000),
        resolvedAt: Date.now(),
      });
    });
  } catch (err) {
    const m = String(err && err.message);
    if (m === 'not_found') return errorResponse('No such report.', 404, request);
    if (m === 'already_resolved') return errorResponse('This report is already resolved.', 409, request);
    throw err;
  }

  return jsonResponse({ resolved: true, outcome }, 200, request);
};

export const config = { path: '/api/admin/safety-reports' };
