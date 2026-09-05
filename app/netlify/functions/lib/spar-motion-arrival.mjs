// Pure final-consent guard. Generated text becomes the round's motion only
// while BOTH people are accepting this exact proposal. Never patch a room.
export function motionForPairArrival(stamp, mine, theirs, room, myUid, peerUid) {
  if (!room || mine?.room !== room || theirs?.room !== room) return null;
  if (mine.status !== 'consent' || theirs.status !== 'consent') return null;
  if (mine.matchedWith !== peerUid || theirs.matchedWith !== myUid) return null;
  if (mine.motion || theirs.motion) return null; // explicit human choice wins
  if (stamp?.eligible !== true || stamp.uids?.length !== 2
      || !stamp.uids.includes(myUid) || !stamp.uids.includes(peerUid)) return null;
  const result = stamp.motionGeneration;
  if (!['generated', 'fallback'].includes(result?.status)) return null;
  return typeof result.motion === 'string' && result.motion.length >= 12
    && result.motion.length <= 200 ? result.motion : null;
}

export function draftConfigForPairMotion(config, motion) {
  return {
    ...(config || {}),
    suggestions: [motion, ...(config?.suggestions || []).filter((text) => text !== motion)],
    recommendedMotion: motion,
  };
}
