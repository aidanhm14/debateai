export const STILL_CONSENT_VERSION = 'round-stills-v1-2026-09-07';
export const STILL_COUNT = 8;
export const STILL_GAP_MS = 60000;

export function roundStillsAllowed(round, permission) {
  const uids = [round?.proUid, round?.conUid];
  return !!(round && !permission?.disabled && !round.isPrivate && !round.recordingDeleteRequested
    && !round.proUid2 && !round.conUid2 && uids[0] && uids[1] && uids[0] !== uids[1]
    && round.recordingPublishAllowed === true
    && uids.every(uid => round.recordingConsents?.[uid] === true
      && permission?.consents?.[uid] === STILL_CONSENT_VERSION));
}

export function clearRoundStills(writer, db, room) {
  for (let i = 0; i < STILL_COUNT; i++) writer.delete(db.collection('round_stills').doc(room + '_' + i));
  writer.delete(db.collection('round_still_sets').doc(room));
}

export async function savedRoundThumbnail(db, room) {
  if (!room) return null;
  const [round, permission, set] = await Promise.all([
    db.collection('live_rounds').doc(room).get(),
    db.collection('round_still_permissions').doc(room).get(),
    db.collection('round_still_sets').doc(room).get(),
  ]);
  if (!roundStillsAllowed(round.data(), permission.data()) || !set.exists) return null;
  const frames = set.data().frames || [];
  // Prefer a frame with both cameras, then a later moment in the argument.
  const best = frames.slice().sort((a, b) => (b.visibleSeats - a.visibleSeats) || b.at - a.at)[0];
  if (!best) return null;
  const shot = await db.collection('round_stills').doc(best.id).get();
  return shot.exists ? shot.data().thumbnail : null;
}
