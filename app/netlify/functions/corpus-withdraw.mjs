// Self-serve withdrawal of your own rounds from the licensable corpus.
// POST /api/corpus-withdraw   { roundId } | { all: true }
//
// Privacy policy s7 says: "If you want a specific anonymized round
// withdrawn, email [the founder] with the round date and motion and we
// will remove it from future shipments." That is a real commitment and
// it is honoured by a human reading mail, which makes it slow and makes
// it depend on someone describing a round well enough to be found. This
// is the same promise, kept in one click, by round id.
//
// WHAT IT DOES AND DOES NOT CLAIM. Setting contributable:false removes
// the round from every FUTURE export, which is exactly what the policy
// promises. It cannot reach a copy already shipped to a recipient; the
// policy says "best-effort recall" for those and that stays a human
// conversation. The response says so in as many words rather than
// implying an erasure that did not happen.
//
// The opt-in toggle in profile settings is a different thing and both
// need to exist: turning the toggle off stops FUTURE rounds joining,
// and per s7 rounds already in the corpus stay under the consent that
// was in force when they landed. This is how someone reaches back and
// pulls one of those out anyway. `all: true` pulls every one of them.

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';

const LAYERS = [
  { window: 60 * 60 * 1000, max: 30, label: 'hour' },
  { window: 24 * 60 * 60 * 1000, max: 100, label: 'day' },
];

const MAX_BULK = 1000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to withdraw a round', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Invalid token', 401, request); }

  if (!isNamedAccount(decoded)) {
    return errorResponse('Guest sessions have no rounds in the corpus', 403, request);
  }

  const uid = decoded.sub;
  const gate = await checkLayers('withdraw', 'uid_' + uid, LAYERS);
  if (!gate.ok) return errorResponse('Too many requests, try again later', 429, request);

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const db = getDb();
  const stamp = {
    contributable: false,
    corpusWithdrawnAt: FieldValue.serverTimestamp(),
    corpusWithdrawnBy: 'self_serve',
  };

  try {
    if (body.all === true) {
      const snap = await db.collection('generations')
        .where('uid', '==', uid).where('contributable', '==', true)
        .limit(MAX_BULK).get();
      await Promise.all(snap.docs.map((d) => d.ref.set(stamp, { merge: true })));
      return jsonResponse({
        ok: true,
        withdrawn: snap.size,
        note: 'Removed from every future corpus export. Copies already shipped to a recipient are a best-effort recall; email to start one.',
      }, 200, request);
    }

    const roundId = typeof body.roundId === 'string' ? body.roundId.trim() : '';
    if (!roundId || roundId.length > 200) return errorResponse('roundId required', 400, request);

    const ref = db.collection('generations').doc(roundId);
    const doc = await ref.get();

    // OWNERSHIP IS CHECKED, AND A ROUND THAT IS NOT YOURS ANSWERS THE
    // SAME WAY AS ONE THAT DOES NOT EXIST. Distinguishing them would let
    // anyone probe whether a given round id is real, which is a small
    // leak and a completely unnecessary one.
    if (!doc.exists || doc.data().uid !== uid) {
      return errorResponse('No such round on your account', 404, request);
    }

    if (doc.data().contributable !== true) {
      return jsonResponse({ ok: true, withdrawn: 0, note: 'That round was not in the corpus.' }, 200, request);
    }

    await ref.set(stamp, { merge: true });
    return jsonResponse({
      ok: true,
      withdrawn: 1,
      roundId,
      note: 'Removed from every future corpus export. Copies already shipped to a recipient are a best-effort recall; email to start one.',
    }, 200, request);
  } catch (err) {
    console.error('corpus-withdraw error:', err.message);
    return errorResponse('Could not withdraw that round', 500, request);
  }
};

export const config = {
  path: '/api/corpus-withdraw',
};
