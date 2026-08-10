// WS2 Phase 5: audience bonus — debaters earn points when their round
// had viewers. Called by the client once the ballot renders; idempotent
// (transaction-guarded on viewerBonus.awarded), so both debaters and
// any spectator can fire it without double-crediting.
//
// Endpoint: POST /api/live-viewer-points
// Payload:  { roomId }
// Returns:  { ok, points, uniqueViewers, viewerMinutes, alreadyAwarded }
//
// Formula (server-derived only — nothing client-trusted):
// - watchers = live_rounds/{roomId}/watchers docs, minus the two
//   debater UIDs (self-watching earns nothing)
// - uniqueViewers = watcher docs (doc id = Firebase uid, so unique accounts)
// - viewerMinutes = sum(beats) / 2  (one beat per 30s heartbeat)
// - points = 10 × uniqueViewers + 1 × floor(viewerMinutes), capped at 300
// Both debaters receive the same bonus: the audience watched the debate,
// not one side. Credits user_profiles.{uid}.viewerPoints; the round doc
// gets viewerBonus for display.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';

const POINTS_PER_VIEWER = 10;
const POINTS_PER_MINUTE = 1;
const POINTS_CAP = 300;

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const roomId = String(body.roomId || '').slice(0, 120);
  if (!roomId) return errorResponse('roomId required', 400, request);

  try {
    const db = getDb();
    const roundRef = db.collection('live_rounds').doc(roomId);

    // Read watchers outside the transaction — the tally is stable once
    // the round has a ballot, and the awarded flag inside the
    // transaction is what prevents double-crediting.
    const watchersSnap = await roundRef.collection('watchers').get();

    const result = await db.runTransaction(async (txn) => {
      const roundSnap = await txn.get(roundRef);
      if (!roundSnap.exists) return { error: 'Round not found', status: 404 };
      const round = roundSnap.data() || {};

      if (round.viewerBonus && round.viewerBonus.awarded) {
        return { alreadyAwarded: true, ...round.viewerBonus };
      }
      if (!round.ballot) {
        return { error: 'Round has no ballot yet', status: 409 };
      }

      const proUid = round.proUid || '';
      const conUid = round.conUid || '';

      let uniqueViewers = 0;
      let beats = 0;
      watchersSnap.forEach((d) => {
        if (d.id === proUid || d.id === conUid) return; // self-watch
        uniqueViewers += 1;
        beats += (d.data() || {}).beats || 1;
      });

      const viewerMinutes = Math.floor(beats / 2);
      const points = Math.min(
        POINTS_CAP,
        uniqueViewers * POINTS_PER_VIEWER + viewerMinutes * POINTS_PER_MINUTE
      );

      const bonus = {
        awarded: true,
        points,
        uniqueViewers,
        viewerMinutes,
        awardedAt: FieldValue.serverTimestamp(),
      };
      txn.set(roundRef, { viewerBonus: bonus }, { merge: true });

      if (points > 0) {
        for (const uid of [proUid, conUid]) {
          if (!uid) continue;
          txn.set(
            db.collection('user_profiles').doc(uid),
            {
              viewerPoints: FieldValue.increment(points),
              viewerPointsRounds: FieldValue.increment(1),
            },
            { merge: true }
          );
        }
      }

      return { alreadyAwarded: false, points, uniqueViewers, viewerMinutes };
    });

    if (result.error) return errorResponse(result.error, result.status, request);

    return jsonResponse({
      ok: true,
      roomId,
      points: result.points || 0,
      uniqueViewers: result.uniqueViewers || 0,
      viewerMinutes: result.viewerMinutes || 0,
      alreadyAwarded: !!result.alreadyAwarded,
    }, 200, request);
  } catch (err) {
    console.error('[live-viewer-points] error:', err.message);
    return errorResponse('Failed to award viewer points', 500, request);
  }
};

export const config = {
  path: '/api/live-viewer-points',
};
