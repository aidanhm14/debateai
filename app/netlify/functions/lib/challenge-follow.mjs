export async function setChallengeFollow(db, ref, uid, desired, now = Date.now()) {
  return db.runTransaction(async tx => {
    const followRef = ref.collection('followers').doc(uid);
    const [challenge, previous] = await Promise.all([tx.get(ref), tx.get(followRef)]);
    const d = challenge.data();
    if (!d || d.moderation?.state === 'hidden') throw new Error('This challenge is unavailable.');
    const following = typeof desired === 'boolean' ? desired : !previous.exists;
    const followers = Math.max(0, Number(d.crowd?.followers) || 0) +
      (following === previous.exists ? 0 : following ? 1 : -1);
    if (following !== previous.exists) {
      if (following) tx.set(followRef, { at: now }); else tx.delete(followRef);
      tx.update(ref, { 'crowd.followers': Math.max(0, followers) });
    }
    return { following, followers: Math.max(0, followers) };
  });
}
