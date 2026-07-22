// /api/async/round — one round, plus the signed-in actions on it.
//
// GET ?id=            → public projection (unlisted rounds resolve by id;
//                       the id is the capability).
// POST {id, action}   → auth:
//   expedite          creator ends the human window now; the sweep's AI
//                     opponent answers on its next pass (≤15 min).
//   vote {side}       one vote per account on a completed round;
//                     participants excluded. Tallies live on the doc.
//   report {reason}   flags the round; two distinct reporters hide it
//                     from the feed pending review.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { deleteCachedShared } from './lib/admin-cache.mjs';
import { publicRound, FEED_CACHE_KEY } from './lib/async-rounds.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!id) return errorResponse('Missing round id', 400, request);
    const snap = await withDeadline(db.collection('async_rounds').doc(id).get(), 2500);
    if (!snap.exists) return errorResponse('Round not found', 404, request);
    const d = snap.data();
    if (d.hidden) {
      // Participants may still see their own round while it is under review.
      const token = extractBearerToken(request);
      let uid = null;
      if (token) { try { uid = (await verifyIdToken(token)).sub; } catch {} }
      const isParty = uid && ((d.prop && d.prop.uid === uid) || (d.opp && d.opp.uid === uid));
      if (!isParty) return errorResponse('This round is under review.', 410, request);
    }
    return jsonResponse({ round: publicRound(snap.id, d), at: Date.now() }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in first.', 401, request);
  let uid;
  try { uid = (await verifyIdToken(token)).sub; }
  catch { return errorResponse('Authentication failed.', 401, request); }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const id = String(body.id || '');
  const action = String(body.action || '');
  if (!id) return errorResponse('Missing round id', 400, request);
  const ref = db.collection('async_rounds').doc(id);

  try {
    if (action === 'expedite') {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Round not found.');
        const d = snap.data();
        if (!d.prop || d.prop.uid !== uid) throw new Error('Only the opener can call the AI in.');
        if (d.state !== 'open') throw new Error('This round is past the open window.');
        tx.update(ref, { deadlineAt: Date.now(), sweepAt: Date.now() });
      });
      return jsonResponse({ ok: true, note: 'The AI opponent answers on the next sweep, within about 15 minutes.' }, 200, request);
    }

    if (action === 'vote') {
      const side = body.side === 'prop' || body.side === 'opp' ? body.side : null;
      if (!side) return errorResponse('Pick a side', 400, request);
      const votes = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Round not found.');
        const d = snap.data();
        if (d.state !== 'complete') throw new Error('Voting opens when the ballot is in.');
        if ((d.prop && d.prop.uid === uid) || (d.opp && d.opp.uid === uid)) throw new Error('Debaters in the round cannot vote on it.');
        const voteRef = ref.collection('votes').doc(uid);
        const prior = await tx.get(voteRef);
        if (prior.exists) throw new Error('You already voted on this round.');
        const v = { prop: (d.votes && d.votes.prop) || 0, opp: (d.votes && d.votes.opp) || 0 };
        v[side] += 1;
        tx.set(voteRef, { side, at: Date.now() });
        tx.update(ref, { votes: v });
        return v;
      });
      return jsonResponse({ ok: true, votes }, 200, request);
    }

    if (action === 'report') {
      const reason = String(body.reason || '').slice(0, 300);
      const hidden = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Round not found.');
        const d = snap.data();
        const repRef = ref.collection('reports').doc(uid);
        const prior = await tx.get(repRef);
        if (prior.exists) return !!d.hidden; // one report per account counts once
        const n = (d.reports || 0) + 1;
        const hide = n >= 2;
        tx.set(repRef, { reason, at: Date.now() });
        tx.update(ref, { reports: n, hidden: hide, ...(hide ? { feedKey: 'quiet' } : {}) });
        return hide;
      });
      if (hidden) await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
      return jsonResponse({ ok: true, hidden }, 200, request);
    }

    return errorResponse('Unknown action', 400, request);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Action failed.';
    const expected = /Round|vote|ballot|opener|window|already|Debaters/i.test(msg);
    if (!expected) console.error('[async-round]', err);
    return errorResponse(msg, expected ? 409 : 500, request);
  }
};

export const config = { path: '/api/async/round' };
