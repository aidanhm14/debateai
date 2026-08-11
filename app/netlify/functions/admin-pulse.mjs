// /api/admin/pulse — review queue for the nightly X pulse.
//
// scheduled-x-pulse.mjs writes fault lines harvested from X into
// pulse_candidates with status:'pending'. Nothing reaches a student
// until it is approved here. X discourse is unfiltered and this product
// ships to schools, so the gate is the point, not an inconvenience.
//
// GET  → the queue: pending first (newest first), then recently approved.
// POST → { fingerprint, action: 'approve'|'reject'|'edit', ... }
//
// Approving does two things: it flips the candidate's status, and it
// rebuilds topic_pulse/current, which is the single doc every consumer
// reads (lib/discourse.mjs for prompt injection, topic-pulse.mjs for the
// motion pool and the public page). Rebuilding rather than incrementally
// patching keeps one source of truth and makes un-approving trivially
// correct.
//
// Rejection is durable: the fingerprint stays in pulse_candidates as
// status:'rejected' so the nightly job's preload skips it forever. A
// "no" should only need saying once.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

// Cap what the dashboard pulls. The queue should never be huge; if it is,
// the nightly job is over-producing and that is the thing to fix.
const MAX_PENDING = 60;
const MAX_APPROVED = 40;

// Cap on what rides into topic_pulse/current. This doc is read on brain
// calls, so its size is a latency and token cost on the hot path.
const MAX_LIVE_FAULT_LINES = 30;

async function requireAdmin(request) {
  const token = extractBearerToken(request);
  if (!token) return { error: errorResponse('Authorization required', 401, request) };

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-pulse auth error:', err.message);
    return { error: errorResponse('Authentication failed. Please sign in again.', 401, request) };
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-pulse profile check error:', err.message);
    }
  }
  if (!isAdmin) return { error: errorResponse('Forbidden: admin access required', 403, request) };

  return { uid, db, email: decoded.email || null };
}

function serialize(doc) {
  const d = doc.data() || {};
  const created = d.createdAt && typeof d.createdAt.toMillis === 'function'
    ? d.createdAt.toMillis() : null;
  return {
    fingerprint: d.fingerprint || doc.id,
    domain: d.domain || '',
    domainLabel: d.domainLabel || '',
    headline: d.headline || '',
    summary: d.summary || '',
    sideA: d.sideA || null,
    sideB: d.sideB || null,
    vocabulary: d.vocabulary || [],
    actors: d.actors || [],
    heat: d.heat || 3,
    motions: d.motions || [],
    citations: d.citations || [],
    status: d.status || 'pending',
    createdAt: created,
  };
}

// Rebuild topic_pulse/current from every approved candidate. Hot-path
// consumers read this one doc, so it carries only what they need: the
// discourse fields for prompt injection and the motions for the pool.
async function rebuildLivePulse(db) {
  const snap = await db.collection('pulse_candidates')
    .where('status', '==', 'approved')
    .get();

  const rows = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    rows.push({
      fingerprint: d.fingerprint || doc.id,
      domain: d.domain || '',
      domainLabel: d.domainLabel || '',
      headline: d.headline || '',
      summary: d.summary || '',
      sideA: d.sideA || null,
      sideB: d.sideB || null,
      vocabulary: d.vocabulary || [],
      actors: d.actors || [],
      heat: d.heat || 3,
      motions: d.motions || [],
      citations: (d.citations || []).slice(0, 10),
      approvedAt: d.reviewedAt && typeof d.reviewedAt.toMillis === 'function'
        ? d.reviewedAt.toMillis() : null,
    });
  });

  // Hottest first, then most recently approved. Consumers that take a
  // slice get the liveliest arguments rather than an arbitrary set.
  rows.sort((a, b) => (b.heat - a.heat) || ((b.approvedAt || 0) - (a.approvedAt || 0)));
  const faultLines = rows.slice(0, MAX_LIVE_FAULT_LINES);

  await db.collection('topic_pulse').doc('current').set({
    faultLines,
    count: faultLines.length,
    motionCount: faultLines.reduce((n, r) => n + (r.motions || []).length, 0),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return faultLines.length;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db, uid } = gate;

  // ── GET: the queue ──────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      // Two scoped queries beat one full-collection read: rejected rows
      // are dead weight on the dashboard and can grow without bound.
      const [pendingSnap, approvedSnap, stateSnap] = await Promise.all([
        db.collection('pulse_candidates')
          .where('status', '==', 'pending')
          .limit(MAX_PENDING).get(),
        db.collection('pulse_candidates')
          .where('status', '==', 'approved')
          .limit(MAX_APPROVED).get(),
        db.collection('config').doc('x_pulse_state').get(),
      ]);

      const pending = [];
      pendingSnap.forEach(d => pending.push(serialize(d)));
      const approved = [];
      approvedSnap.forEach(d => approved.push(serialize(d)));

      // Newest first. Sorted here rather than in the query so no
      // composite index is required for (status, createdAt).
      pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      approved.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const state = stateSnap.exists ? (stateSnap.data() || {}) : {};
      const lastRunAt = state.lastRunAt && typeof state.lastRunAt.toMillis === 'function'
        ? state.lastRunAt.toMillis() : null;

      return jsonResponse({
        pending,
        approved,
        lastRun: {
          at: lastRunAt,
          ageMs: lastRunAt ? Date.now() - lastRunAt : null,
          // 36h mirrors the distillations card: one missed nightly run is
          // a blip, two is a regression worth a red pill.
          stale: !lastRunAt || (Date.now() - lastRunAt) > 36 * 60 * 60 * 1000,
          domains: state.lastDomains || [],
          costUsd: state.lastCostUsd || 0,
          results: state.lastResults || [],
        },
      }, 200, request);
    } catch (err) {
      console.error('admin-pulse GET error:', err);
      return errorResponse('Something went wrong. Please try again.', 500, request);
    }
  }

  // ── POST: review actions ────────────────────────────────────────────
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { fingerprint, action } = body || {};
  if (!fingerprint || typeof fingerprint !== 'string') {
    return errorResponse('fingerprint required', 400, request);
  }
  if (!['approve', 'reject', 'edit'].includes(action)) {
    return errorResponse('action must be approve, reject, or edit', 400, request);
  }

  try {
    const ref = db.collection('pulse_candidates').doc(fingerprint);
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('Candidate not found', 404, request);

    const patch = {
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: uid,
    };

    if (action === 'approve') patch.status = 'approved';
    if (action === 'reject') patch.status = 'rejected';

    if (action === 'edit') {
      // Editing lets a good fault line through with a bad motion fixed,
      // rather than forcing a reject on an otherwise usable candidate.
      if (Array.isArray(body.motions)) {
        patch.motions = body.motions
          .filter(m => m && m.format && m.text)
          .slice(0, 12)
          .map(m => ({
            format: String(m.format).slice(0, 20),
            // Strip em-dashes on the way in. House rule, and hand-editing
            // is exactly where one slips back in.
            text: String(m.text).slice(0, 400).replace(/[—–]/g, ','),
            bg: String(m.bg || '').slice(0, 1200).replace(/[—–]/g, ','),
          }));
      }
      if (typeof body.headline === 'string' && body.headline.trim()) {
        patch.headline = body.headline.trim().slice(0, 300);
      }
      if (typeof body.summary === 'string') {
        patch.summary = body.summary.trim().slice(0, 900);
      }
      // An edit that says so also approves, so the common path is one click.
      if (body.approve === true) patch.status = 'approved';
    }

    await ref.set(patch, { merge: true });

    // Any status change can add or remove a live fault line, so rebuild.
    const liveCount = await rebuildLivePulse(db);

    return jsonResponse({ ok: true, fingerprint, status: patch.status || snap.get('status'), liveCount }, 200, request);
  } catch (err) {
    console.error('admin-pulse POST error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/pulse',
};
