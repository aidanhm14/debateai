// POST /api/record-import — seed a Glicko rating from an imported record.
//
// Three modes:
//   { mode:'tabroom', shard:'g', rowIds:[...], claimedName, consent:true }
//   { mode:'upload', extractionId:'x...', rows:[...], claimedName, consent:true }
//   { mode:'self', level:'circuit', consent:true }
//
// The client never supplies a rating. For tabroom mode it supplies row
// ids from the static records index (app/records-index/{a..z,0}.json,
// built from Tabroom's public per-tournament JSON by
// ~/debateit-outreach/build_records_index.py); the server re-reads
// those rows from its own copy of the index and recomputes the seed, so
// a tampered client can at worst claim rows that exist publicly anyway.
//
// UPLOAD MODE, and why it does not undo any of the rules below.
// Tabroom is most of the US circuit and almost none of the rest of the
// world, so /api/record-extract reads a record out of evidence the user
// supplies from any platform (see that file). The rows it produces come
// back through here, and three things keep them honest:
//   - The client cannot mint rows. It may only reference an extraction
//     THIS uid owns, and the server re-reads the rows from its own
//     stored copy. A hand-rolled POST with invented numbers references
//     no extraction and is refused.
//   - An edit may only move a row in the UNFLATTERING direction
//     (clampToAttested). People have to be able to correct a misread
//     digit or they will not trust the number; letting the correction
//     raise the seed would make the evidence decorative. So a
//     correction downward is free and a correction upward needs new
//     evidence, which is the same trade the additive rule makes.
//   - Every uploaded row is stamped provenance 'upload', which caps the
//     seed at 1750 against Tabroom's 1900 and floors the deviation at
//     290 against 240. A mixed claim takes the weaker terms, so one
//     verified weekend cannot launder ten uploaded ones.
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
  clampToAttested, commonNameToken, provenanceOf,
} from './lib/record-seed.mjs';
import { displayRating, defaultRatingDoc } from './lib/rating.mjs';

const SITE_ORIGIN = process.env.URL || 'https://itsdebatable.com';
const MAX_ROWS = 40;

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
        claimed: sd && sd.source !== 'self'
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
  let editSummary = null;    // upload: what the client corrected, and what we refused

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
      p: 'tabroom',
    }));
    claimedName = String(body.claimedName || '').slice(0, 80);
  } else if (mode === 'upload') {
    const extractionId = String(body.extractionId || '');
    if (!/^x[a-z0-9]{6,40}$/.test(extractionId)) return errorResponse('Bad extraction id', 400, request);

    let snap;
    try {
      snap = await withDeadline(getDb().collection('record_extractions').doc(extractionId).get(), 3000);
    } catch (err) {
      console.error('[record-import] extraction read failed', err.message);
      return errorResponse('Could not load that import. Try again.', 503, request);
    }
    if (!snap.exists) return errorResponse('That import expired. Upload your record again.', 404, request);

    const ex = snap.data();
    // Ownership, not just existence. An extraction id is a short random
    // string, and one person's read of their own record must never be
    // claimable by anyone else who guesses it.
    if (ex.uid !== uid) return errorResponse('That import is not yours.', 403, request);

    const attested = (ex.rows || []).map((r) => ({ ...r, p: 'upload' }));
    if (!attested.length) return errorResponse('That import had no readable rounds.', 400, request);

    // The client may send corrections. clampToAttested lets them lower a
    // win count or raise a loss count freely and refuses the reverse, so
    // fixing a misread digit is free and inflating one is not.
    const reconciled = clampToAttested(Array.isArray(body.rows) ? body.rows : [], attested);
    incomingRows = reconciled.rows.filter((r) => (r.pw + r.pl + r.ew + r.el) > 0);
    if (!incomingRows.length) return errorResponse('No decided rounds left after your edits.', 400, request);
    editSummary = { clamped: reconciled.clamped, corrected: reconciled.corrected, extractionId };
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
        // Any evidence-backed prior takes part in the merge, whichever
        // source it came from. Tabroom rows and uploaded rows live in
        // one union and dedupe on the same row id, so a person who
        // claimed a Tabroom weekend can add an uploaded WUDC record to
        // it and the seed recomputes over both.
        const priorRows = prior && prior.source !== 'self'
          ? normalizeClaimedRows(prior.rows, prior.rowIds)
          : [];
        const merged = mergeClaimedRows(priorRows, incomingRows);
        if (prior && prior.source !== 'self' && merged.added === 0) {
          return { ok: false, reason: 'no_new_rows' };
        }
        if (merged.rows.length > MAX_ROWS) {
          return { ok: false, reason: 'too_many_rows', limit: MAX_ROWS };
        }
        // Checked across the union, not just the new rows: on an
        // additive model, bolting a stranger's wins onto an honest
        // claim is the attack, and only the union sees it. The rule
        // lives in record-seed.mjs so it is unit-tested rather than
        // asserted here; rows the extractor could not read a name from
        // impose no constraint, because an unnamed personal results
        // sheet is a real thing and refusing it catches nobody.
        if (!commonNameToken(merged.rows)) return { ok: false, reason: 'name_mismatch' };

        seed = seedFromRecord(merged.rows, at);
        if (!seed) return { ok: false, reason: 'no_decided_rounds' };
        seededMeta = {
          // The union's provenance, not this submission's: once an
          // uploaded row is in the record the whole claim carries the
          // weaker terms, and the label has to say so.
          source: provenanceOf(merged.rows),
          rowIds: merged.rows.map((r) => r.i),
          rows: merged.rows,
          claimedName: claimedName || (prior && prior.claimedName) || '',
          added: merged.added,
          ...(editSummary ? { lastEdit: editSummary } : {}),
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
        meta: seededMeta.source !== 'self'
          ? {
              source: seededMeta.source,
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

  // Close the audit loop: the extraction now records the claim it
  // became. Best-effort on purpose — the seed is already committed, and
  // failing the request after a successful transaction would tell the
  // user their import did not happen when it did.
  if (editSummary) {
    try {
      await withDeadline(getDb().collection('record_extractions').doc(editSummary.extractionId).set({
        claimed: true, claimedAt: Date.now(), revision: result.revision,
      }, { merge: true }), 2500);
    } catch (err) {
      console.warn('[record-import] could not mark extraction claimed', err.message);
    }
  }

  return jsonResponse({
    ok: true,
    rating: displayRating(result.doc),
    seeded: {
      source: result.seededMeta.source,
      evidence: result.seed.evidence,
      revision: result.revision,
      added: result.added,
      // What we refused to take from the client's edits. Surfaced rather
      // than swallowed: someone who typed a bigger number should be told
      // it was not used, not left believing it was.
      ...(editSummary ? { clamped: editSummary.clamped, corrected: editSummary.corrected } : {}),
    },
  }, 200, request);
};

export const config = { path: '/api/record-import' };
