// POST /api/record-import — seed a Glicko rating from an imported record.
//
// Two modes:
//   { mode:'tabroom', shard:'g', rowIds:[...], claimedName, consent:true }
//   { mode:'self', level:'circuit', consent:true }
//
// The client never supplies a rating. For tabroom mode it supplies row
// ids from the static records index (app/records-index/{a..z,0}.json,
// built from Tabroom's public per-tournament JSON by
// ~/debateit-outreach/build_records_index.py); the server re-reads
// those rows from its own copy of the index and recomputes the seed, so
// a tampered client can at worst claim rows that exist publicly anyway.
//
// Integrity rules:
//   - Seeding happens once, ever (rating_changes/seed_{uid} is the lock).
//   - Refused once you have any rated platform game, so a loss can
//     never be re-rolled into a fresh import.
//   - All selected rows must share a name token: one person's rows
//     share their surname, a grab-bag of strangers' wins does not.
//   - The seed RD floor (record-seed.mjs) keeps seeded-only accounts
//     off the public board until they play MIN_RATED_GAMES real rounds.
//   - consent:true is the same public-record consent the board uses.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { seedFromRecord, seedFromSelfReport } from './lib/record-seed.mjs';
import { displayRating, defaultRatingDoc } from './lib/rating.mjs';

const SITE_ORIGIN = process.env.URL || 'https://itsdebatable.com';
const MAX_ROWS = 40;

const tokens = (s) => (String(s || '').toLowerCase().match(/[a-z]+/g) || []).filter((t) => t.length >= 2);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST' && request.method !== 'GET') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in first.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;

  // GET → your own rating doc, so /claim can double as the "here is
  // your number" surface for someone who already seeded or played.
  if (request.method === 'GET') {
    try {
      const snap = await withDeadline(getDb().collection('user_ratings').doc(uid).get(), 2500);
      if (!snap.exists) return jsonResponse({ ok: true, exists: false }, 200, request);
      const d = snap.data();
      return jsonResponse({
        ok: true,
        exists: true,
        rating: displayRating(d),
        seeded: d.seeded ? { source: d.seeded.source, at: d.seeded.at } : null,
      }, 200, request);
    } catch (err) {
      console.error('[record-import] get failed', err.message);
      return errorResponse('Could not load your rating.', 503, request);
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid request body', 400, request); }

  if (body.consent !== true) {
    return errorResponse('A seeded rating is a public competitive record. Tick the consent box.', 400, request);
  }

  const mode = String(body.mode || '');
  let seed = null;
  let seededMeta = null;

  if (mode === 'self') {
    seed = seedFromSelfReport(body.level);
    if (!seed) return errorResponse('Pick a level.', 400, request);
    seededMeta = { source: 'self', level: String(body.level) };
  } else if (mode === 'tabroom') {
    const shard = String(body.shard || '');
    if (!/^[a-z0]$/.test(shard)) return errorResponse('Bad shard', 400, request);
    const rowIds = Array.isArray(body.rowIds) ? body.rowIds.map(String).slice(0, MAX_ROWS) : [];
    if (!rowIds.length) return errorResponse('Select at least one tournament row.', 400, request);

    let index;
    try {
      const res = await withDeadline(fetch(`${SITE_ORIGIN}/records-index/${shard}.json`), 8000);
      if (!res.ok) throw new Error(`index ${res.status}`);
      index = await res.json();
    } catch (err) {
      console.error('[record-import] index fetch failed', err.message);
      return errorResponse('Could not load the records index. Try again.', 503, request);
    }

    const wanted = new Set(rowIds);
    const rows = index.filter((r) => wanted.has(r.i));
    if (!rows.length) return errorResponse('Those rows were not found.', 404, request);

    // One person's entries share a surname across every selected row.
    const common = rows.map((r) => new Set(tokens(r.n)))
      .reduce((acc, set) => new Set([...acc].filter((t) => set.has(t))));
    if (!common.size) {
      return errorResponse('Those entries do not share a name. Select only rows that are you.', 400, request);
    }

    seed = seedFromRecord(rows, Date.now());
    if (!seed) return errorResponse('No decided rounds in that selection.', 400, request);
    seededMeta = {
      source: 'tabroom',
      rowIds: rows.map((r) => r.i),
      rows: rows.map((r) => ({ n: r.n, t: r.t, d: r.d, f: r.f, pw: r.pw, pl: r.pl, ew: r.ew, el: r.el })),
      claimedName: String(body.claimedName || '').slice(0, 80),
    };
  } else {
    return errorResponse('Unknown mode', 400, request);
  }

  const db = getDb();
  const rateRef = db.collection('user_ratings').doc(uid);
  const lockRef = db.collection('rating_changes').doc(`seed_${uid}`);
  const at = Date.now();

  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      const [rateSnap, lockSnap] = await Promise.all([tx.get(rateRef), tx.get(lockRef)]);
      if (lockSnap.exists) return { ok: false, reason: 'already_seeded' };
      const pre = rateSnap.exists ? rateSnap.data() : null;
      if (pre && (Number(pre.games) || 0) > 0) return { ok: false, reason: 'already_rated' };

      const before = pre || defaultRatingDoc(at);
      const doc = {
        rating: seed.rating, rd: seed.rd, vol: seed.vol,
        games: 0, wins: 0, losses: 0, draws: 0,
        peak: seed.rating, lastEventAt: 0,
        seeded: { ...seededMeta, evidence: seed.evidence, at },
        createdAt: (pre && pre.createdAt) || at,
        updatedAt: at,
      };
      tx.set(rateRef, doc, { merge: true });
      tx.set(lockRef, {
        uid,
        name: (seededMeta.claimedName || '').slice(0, 40),
        source: 'seed',
        eventId: `seed_${uid}`,
        result: 'seed',
        verdictSource: 'import',
        before: { rating: before.rating, rd: before.rd, vol: before.vol },
        after: { rating: seed.rating, rd: seed.rd, vol: seed.vol },
        delta: Math.round((seed.rating - before.rating) * 10) / 10,
        meta: seededMeta.source === 'tabroom'
          ? { source: 'tabroom', rows: seededMeta.rowIds.length, claimedName: seededMeta.claimedName }
          : seededMeta,
        at,
      });
      return { ok: true, doc };
    });
  } catch (err) {
    console.error('[record-import] tx failed', err.message);
    return errorResponse('Could not save the seed. Try again.', 503, request);
  }

  if (!result.ok) {
    const msg = result.reason === 'already_seeded'
      ? 'You already imported a record. A seed applies once.'
      : 'You already have rated rounds here; your rating is live, no seed needed.';
    return jsonResponse({ ok: false, reason: result.reason, message: msg }, 409, request);
  }

  return jsonResponse({
    ok: true,
    rating: displayRating(result.doc),
    seeded: { source: seededMeta.source, evidence: seed.evidence },
  }, 200, request);
};

export const config = { path: '/api/record-import' };
