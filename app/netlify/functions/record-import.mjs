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
//   - Refused once you have any rated platform game, so a loss can
//     never be re-rolled into a fresh import. This is the rule that
//     actually stops gaming, and it is unchanged.
//   - A seed may be REVISED by adding more records, and only by adding.
//     The rating is recomputed over the union of every row ever
//     claimed (mergeClaimedRows), so a revision cannot drop the
//     tournament that dragged the number down. Adding evidence moves
//     the number whichever way the evidence points. Seeding used to be
//     once-ever with rating_changes/seed_{uid} as the lock; that was a
//     blunt stand-in for the games>0 rule above, and it also refused
//     the honest case of someone who claimed one weekend and then
//     remembered three more.
//   - A self-report is not evidence, so it can be the FIRST word and
//     never a later one: no self-report may revise an existing seed,
//     in either direction. Otherwise "revise" means picking a level
//     until the number flatters you, which is the whole failure mode.
//   - All selected rows must share a name token, checked across the
//     WHOLE union rather than only the new rows: one person's rows
//     share their surname, a grab-bag of strangers' wins does not, and
//     bolting a stranger onto an honest claim is the obvious attack on
//     an additive model.
//   - Every revision appends its own rating_changes row (seed_{uid} is
//     revision 0 and is never rewritten), matching the append-only
//     posture the rest of the rating ledger uses.
//   - The seed RD floor (record-seed.mjs) keeps seeded-only accounts
//     off the public board until they play MIN_RATED_GAMES real rounds.
//   - consent:true is the same public-record consent the board uses.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import {
  seedFromRecord, seedFromSelfReport, mergeClaimedRows, normalizeClaimedRows,
} from './lib/record-seed.mjs';
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
      const sd = d.seeded || null;
      return jsonResponse({
        ok: true,
        exists: true,
        rating: displayRating(d),
        seeded: sd ? { source: sd.source, at: sd.at, revision: Number(sd.revision) || 0 } : null,
        // Only for the tabroom source: the client renders these as the
        // rows a revision keeps, so the additive rule is visible rather
        // than merely enforced.
        claimed: sd && sd.source === 'tabroom'
          ? { rowIds: sd.rowIds || [], rows: sd.rows || [], claimedName: sd.claimedName || '' }
          : null,
        // A rated round closes seeding for good; the client uses this
        // to hide the revise path rather than offering a dead button.
        canRevise: (Number(d.games) || 0) === 0,
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
  let incomingRows = null;   // tabroom: rows re-read from our own index
  let selfSeed = null;       // self: the level's seed, validated up front
  let claimedName = '';

  if (mode === 'self') {
    selfSeed = seedFromSelfReport(body.level);
    if (!selfSeed) return errorResponse('Pick a level.', 400, request);
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
    const found = index.filter((r) => wanted.has(r.i));
    if (!found.length) return errorResponse('Those rows were not found.', 404, request);

    // Row id travels with the row from here on: the merge dedupes on it,
    // and a stored row without one cannot take part in a later revision.
    incomingRows = found.map((r) => ({
      i: r.i, n: r.n, t: r.t, d: r.d, f: r.f,
      pw: r.pw, pl: r.pl, ew: r.ew, el: r.el,
    }));
    claimedName = String(body.claimedName || '').slice(0, 80);
  } else {
    return errorResponse('Unknown mode', 400, request);
  }

  const db = getDb();
  const rateRef = db.collection('user_ratings').doc(uid);
  const at = Date.now();

  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      const rateSnap = await tx.get(rateRef);
      const pre = rateSnap.exists ? rateSnap.data() : null;
      // The one refusal that has to stay absolute: once a round on this
      // platform has moved the number, no import may touch it again.
      if (pre && (Number(pre.games) || 0) > 0) return { ok: false, reason: 'already_rated' };

      const prior = (pre && pre.seeded) || null;
      const revision = prior ? (Number(prior.revision) || 0) + 1 : 0;

      let seed;
      let seededMeta;

      if (mode === 'self') {
        // A level pick carries no evidence, so it can open an account's
        // record and never amend one. Allowing it here would let anyone
        // re-pick until the number flattered them.
        if (prior) return { ok: false, reason: 'self_after_seed' };
        seed = selfSeed;
        seededMeta = { source: 'self', level: String(body.level) };
      } else {
        const priorRows = prior && prior.source === 'tabroom'
          ? normalizeClaimedRows(prior.rows, prior.rowIds)
          : [];
        const merged = mergeClaimedRows(priorRows, incomingRows);
        if (prior && prior.source === 'tabroom' && merged.added === 0) {
          return { ok: false, reason: 'no_new_rows' };
        }
        if (merged.rows.length > MAX_ROWS) {
          return { ok: false, reason: 'too_many_rows', limit: MAX_ROWS };
        }
        // Checked across the union, not just the new rows: on an
        // additive model, bolting a stranger's wins onto an honest
        // claim is the attack, and only the union sees it.
        const common = merged.rows.map((r) => new Set(tokens(r.n)))
          .reduce((acc, set) => new Set([...acc].filter((t) => set.has(t))));
        if (!common.size) return { ok: false, reason: 'name_mismatch' };

        seed = seedFromRecord(merged.rows, at);
        if (!seed) return { ok: false, reason: 'no_decided_rounds' };
        seededMeta = {
          source: 'tabroom',
          rowIds: merged.rows.map((r) => r.i),
          rows: merged.rows,
          claimedName: claimedName || (prior && prior.claimedName) || '',
          added: merged.added,
        };
      }

      const before = pre || defaultRatingDoc(at);
      const doc = {
        rating: seed.rating, rd: seed.rd, vol: seed.vol,
        games: 0, wins: 0, losses: 0, draws: 0,
        peak: seed.rating, lastEventAt: 0,
        seeded: {
          ...seededMeta,
          evidence: seed.evidence,
          at,
          revision,
          firstSeededAt: (prior && prior.firstSeededAt) || (prior && prior.at) || at,
        },
        createdAt: (pre && pre.createdAt) || at,
        updatedAt: at,
      };
      tx.set(rateRef, doc, { merge: true });

      // Revision 0 keeps the bare id and is never rewritten, matching
      // changeId() in lib/rating-apply.mjs. Each revision appends, so
      // the ledger shows every version of a claimed record.
      const changeRef = db.collection('rating_changes')
        .doc(revision > 0 ? `seed_${uid}_r${revision}` : `seed_${uid}`);
      tx.set(changeRef, {
        uid,
        name: (seededMeta.claimedName || '').slice(0, 40),
        source: 'seed',
        eventId: `seed_${uid}`,
        result: 'seed',
        rev: revision,
        verdictSource: 'import',
        before: { rating: before.rating, rd: before.rd, vol: before.vol },
        after: { rating: seed.rating, rd: seed.rd, vol: seed.vol },
        delta: Math.round((seed.rating - before.rating) * 10) / 10,
        meta: seededMeta.source === 'tabroom'
          ? {
              source: 'tabroom',
              rows: seededMeta.rowIds.length,
              added: seededMeta.added,
              claimedName: seededMeta.claimedName,
            }
          : seededMeta,
        at,
      });
      return { ok: true, doc, seededMeta, seed, revision, added: seededMeta.added || 0 };
    });
  } catch (err) {
    console.error('[record-import] tx failed', err.message);
    return errorResponse('Could not save the seed. Try again.', 503, request);
  }

  if (!result.ok) {
    const MESSAGES = {
      already_rated: 'You already have rated rounds here; your rating is live, no seed needed.',
      self_after_seed: 'Your rating is already seeded. You can add more tournament records to it, but a level pick cannot revise it.',
      no_new_rows: 'Those entries are already in your record. Select tournaments you have not claimed yet.',
      too_many_rows: `That would take you past ${MAX_ROWS} claimed entries, which is the cap.`,
      name_mismatch: 'Those entries do not share a name with your existing record. Select only rows that are you.',
      no_decided_rounds: 'No decided rounds in that selection.',
    };
    const msg = MESSAGES[result.reason] || 'That import could not be applied.';
    return jsonResponse({ ok: false, reason: result.reason, message: msg }, 409, request);
  }

  return jsonResponse({
    ok: true,
    rating: displayRating(result.doc),
    seeded: {
      source: result.seededMeta.source,
      evidence: result.seed.evidence,
      revision: result.revision,
      added: result.added,
    },
  }, 200, request);
};

export const config = { path: '/api/record-import' };
