// /api/poll  →  Brand-name poll (debateit / debatenow / debatable / debateai).
//
// Why this exists: soul.md §10 (2026-05-25) committed to "Debatable" as the
// new visible brand and parked a DNS migration on debatable.com. The user
// wants engaged users to weigh in on the name choice before pulling the
// DNS trigger. This endpoint backs that poll.
//
// Method semantics
//  - GET   /api/poll          → returns tally { choices, total, yourChoice? }
//  - POST  /api/poll {choice} → records vote, returns updated tally
//
// Dedupe model
//  - Signed-in users only. uid is the dedupe key (brand_poll/{uid} doc).
//    Anonymous voting is too easy to brigade — and the engaged-user signal
//    is the one we actually want (per §2 audience reality reframe).
//  - Re-voting is allowed: a user can change their mind. The tally
//    decrements the old choice and increments the new one in a transaction
//    so concurrent re-votes can't double-count.
//
// Storage
//  - brand_poll/{uid}        = { choice, ts }
//  - brand_poll_tally/_counts = { debateit, debatenow, debatable, debateai,
//                                  total, updatedAt }
//
// Rate limit: 6/min/uid. A user changing their mind 6 times in a minute
// is fine; 60 is abuse.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const VALID_CHOICES = ['debateit', 'debatenow', 'debatable', 'debateai'];
const TALLY_DOC = '_counts';

// Rate limit
const rateLimits = new Map();
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(uid);
  }
}, 5 * 60 * 1000);

function emptyTally() {
  const out = { total: 0 };
  for (const c of VALID_CHOICES) out[c] = 0;
  return out;
}

async function readTally(db) {
  const snap = await db.collection('brand_poll_tally').doc(TALLY_DOC).get();
  const base = emptyTally();
  if (!snap.exists) return base;
  const data = snap.data() || {};
  for (const c of VALID_CHOICES) {
    base[c] = typeof data[c] === 'number' ? data[c] : 0;
  }
  base.total = typeof data.total === 'number'
    ? data.total
    : VALID_CHOICES.reduce((sum, c) => sum + base[c], 0);
  return base;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  // GET: public tally. No auth required for read so the admin card +
  // any future public surface can show counts.
  if (request.method === 'GET') {
    try {
      const db = getDb();
      const tally = await readTally(db);
      // If a bearer token is present, also tell the client their choice
      // so the UI can render the "you voted X" state across devices.
      const token = extractBearerToken(request);
      let yourChoice = null;
      if (token) {
        try {
          const decoded = await verifyIdToken(token);
          const doc = await db.collection('brand_poll').doc(decoded.sub).get();
          if (doc.exists) yourChoice = doc.data()?.choice || null;
        } catch {
          // bad token is fine — just don't return yourChoice
        }
      }
      return jsonResponse({ tally, yourChoice }, 200, request);
    } catch (err) {
      console.error('poll GET error:', err.message);
      return errorResponse('Failed to read poll', 500, request);
    }
  }

  // POST: requires sign-in.
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to vote', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  if (isRateLimited(uid)) {
    return errorResponse('Slow down — try again in a minute.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }

  const choice = String(body?.choice || '').toLowerCase().trim();
  if (!VALID_CHOICES.includes(choice)) {
    return errorResponse('Invalid choice', 400, request);
  }

  try {
    const db = getDb();
    const voteRef = db.collection('brand_poll').doc(uid);
    const tallyRef = db.collection('brand_poll_tally').doc(TALLY_DOC);

    await db.runTransaction(async (tx) => {
      const [voteSnap, tallySnap] = await Promise.all([
        tx.get(voteRef),
        tx.get(tallyRef),
      ]);

      const updates = { updatedAt: FieldValue.serverTimestamp() };
      // Seed any missing fields so the increments land on a number.
      if (!tallySnap.exists) {
        for (const c of VALID_CHOICES) updates[c] = 0;
        updates.total = 0;
      }

      if (voteSnap.exists) {
        const prev = voteSnap.data()?.choice;
        if (prev === choice) {
          // No-op: same vote.
          return;
        }
        if (VALID_CHOICES.includes(prev)) {
          updates[prev] = FieldValue.increment(-1);
        }
        updates[choice] = FieldValue.increment(1);
        // total stays the same (one user, one vote, just moved)
      } else {
        updates[choice] = FieldValue.increment(1);
        updates.total = FieldValue.increment(1);
      }

      tx.set(tallyRef, updates, { merge: true });
      tx.set(voteRef, {
        choice,
        ts: FieldValue.serverTimestamp(),
        // Stash a few read-only context bits for later analysis.
        // No PII beyond what we already log for any signed-in action.
        ua: (request.headers.get('user-agent') || '').slice(0, 200),
      }, { merge: true });
    });

    const tally = await readTally(db);
    return jsonResponse({ ok: true, yourChoice: choice, tally }, 200, request);
  } catch (err) {
    console.error('poll POST error:', err.message);
    return errorResponse('Vote failed', 500, request);
  }
};

export const config = {
  path: '/api/poll',
};
