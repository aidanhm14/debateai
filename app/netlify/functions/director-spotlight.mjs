// ── /api/director/spotlight ────────────────────────────────────────
//
// A reversible editorial choice for the tournament floor. Spotlighting
// does not move either participant, alter the judge, change recording
// permission, or cut the room into the separate host broadcast. It only
// tells public tournament surfaces which already-public live room to put
// first and render larger.

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

function cleanKey(value, max = 120) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max);
}

async function tournamentFor(db, key) {
  let snap = await db.collection('tournaments').doc(key).get();
  if (snap.exists) return snap;
  const bySlug = await db.collection('tournaments').where('slug', '==', key).limit(1).get();
  return bySlug.empty ? null : bySlug.docs[0];
}

async function activePairingForRoom(tRef, room) {
  const [rounds, entries] = await Promise.all([
    tRef.collection('rounds').get(),
    tRef.collection('entries').get(),
  ]);
  const activeIds = new Set(entries.docs
    .map((doc) => String((doc.data() || {}).inPairing || ''))
    .filter(Boolean));
  for (const roundDoc of rounds.docs) {
    const round = roundDoc.data() || {};
    const released = round.status === 'released' || round.status === 'complete' || round.kind === 'dropin';
    if (!released) continue;
    const pairing = (Array.isArray(round.pairings) ? round.pairings : []).find((p) =>
      p && String(p.room || '') === room && p.status !== 'complete'
      && activeIds.has(String(p.pairingId || '')));
    if (pairing) return { roundKey: roundDoc.id, pairing };
  }
  return null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON', 400, request); }

  const action = String(body?.action || 'spotlight');
  const key = cleanKey(body?.t, 64);
  if (!key) return errorResponse('Missing tournament', 400, request);

  const tournament = await tournamentFor(gate.db, key);
  if (!tournament) return errorResponse('Tournament not found', 404, request);

  if (action === 'clear') {
    await tournament.ref.update({
      spotlightRoom: FieldValue.delete(),
      spotlightPairingId: FieldValue.delete(),
      spotlightRoundKey: FieldValue.delete(),
      spotlightAt: FieldValue.delete(),
      spotlightBy: FieldValue.delete(),
    });
    return jsonResponse({ ok: true, spotlightRoom: '' }, 200, request);
  }

  if (action !== 'spotlight') return errorResponse('Unknown action', 400, request);
  const room = cleanKey(body?.room, 120);
  if (!room) return errorResponse('Missing room', 400, request);

  // Validate against the tournament ledger, not a room id supplied by
  // the browser. A finished or unrelated room cannot be promoted.
  const found = await activePairingForRoom(tournament.ref, room);
  if (!found) return errorResponse('That tournament room is no longer live.', 409, request);

  await tournament.ref.update({
    spotlightRoom: room,
    spotlightPairingId: String(found.pairing.pairingId || ''),
    spotlightRoundKey: found.roundKey,
    spotlightAt: FieldValue.serverTimestamp(),
    spotlightBy: gate.uid,
  });

  return jsonResponse({
    ok: true,
    spotlightRoom: room,
    pairingId: String(found.pairing.pairingId || ''),
    roundKey: found.roundKey,
  }, 200, request);
};

export const config = { path: '/api/director/spotlight' };
