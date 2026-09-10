import { checkContent } from './content-guard.mjs';

// A challenge owns one room. Retries and both participants joining must
// converge without resetting an existing round or its agreed topic.
export async function joinChallengeRoom(db, ref, uid, now = Date.now()) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.data();
    if (!c || c.mode !== 'live' || !c.challengedUid) throw new Error('This is not a direct live challenge.');
    if (!['accepted', 'live'].includes(c.status)) throw new Error('The other person needs to accept this challenge first.');
    if (c.moderation?.state === 'hidden') throw new Error('This challenge is under review.');
    const seats = c.accepted || [];
    if (!seats.some(p => p.uid === uid)) throw new Error('Only the two people in this challenge can join.');
    const pro = seats.find(p => p.side === 'a'), con = seats.find(p => p.side === 'b');
    if (seats.length !== 2 || !pro?.uid || !con?.uid || pro.uid === con.uid) throw new Error('Both sides need to be confirmed.');
    const guard = checkContent({ text: c.claim, kind: 'motion' });
    if (!guard.ok) throw new Error(guard.reason);

    const bands = await Promise.all(seats.map(p => tx.get(db.collection('age_bands').doc(p.uid))));
    const mine = seats.findIndex(p => p.uid === uid);
    const band = bands.map(s => s.exists ? s.data().band : '');
    if (!['minor', 'adult'].includes(band[mine])) throw new Error('Confirm your age before joining this live debate.');
    if (!['minor', 'adult'].includes(band[1 - mine])) throw new Error('The other person needs to open this challenge and confirm their age before you can join.');
    if (band[0] !== band[1]) throw new Error('Live debates pair people within the same age group.');

    const room = 'Challenge-' + ref.id;
    const roundRef = db.collection('live_rounds').doc(room);
    const round = await tx.get(roundRef);
    if (round.exists && (round.data().ballot || ['done', 'completed', 'cancelled', 'forfeit'].includes(round.data().status))) {
      throw new Error('This debate has ended. Send a new challenge to debate again.');
    }
    if (round.exists) {
      const d = round.data();
      if (d.challengeId !== ref.id ||
        [d.proUid, d.conUid].sort().join('|') !== [pro.uid, con.uid].sort().join('|')) {
        throw new Error('The room could not be verified for this challenge. Send a new invite.');
      }
    }
    if (!round.exists) {
      tx.set(roundRef, {
        challengeId: ref.id, motion: c.claim, background: c.description || '', format: 'quick',
        proUid: pro.uid, conUid: con.uid, proName: pro.name || 'For', conName: con.name || 'Against',
        posterUid: c.creator.uid, posterName: c.creator.name || 'Someone',
        status: 'round', speechIdx: 0, isPrivate: c.visibility !== 'public',
        createdAt: new Date(now), roundStartedAt: now,
      });
    }
    const current = round.exists ? round.data() : {};
    const params = new URLSearchParams({
      room, source: 'challenge', format: 'quick', motion: current.motion || c.claim,
      proUid: current.proUid || pro.uid, conUid: current.conUid || con.uid,
      pro: current.proName || pro.name || 'For', con: current.conName || con.name || 'Against',
    });
    if (current.isPrivate === true || (!round.exists && c.visibility !== 'public')) params.set('private', '1');
    return { room, url: '/live-round?' + params.toString() };
  });
}
