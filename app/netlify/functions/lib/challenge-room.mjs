import { checkContent } from './content-guard.mjs';
import { feedKeyFor } from './challenge.mjs';

// A challenge owns one room. Retries and both participants joining must
// converge without resetting an existing round or its agreed topic.
export async function joinChallengeRoom(db, ref, uid, now = Date.now()) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.data();
    if (!c || c.mode !== 'live') throw new Error('This is not a live challenge.');
    if (!['accepted', 'live'].includes(c.status)) throw new Error('The other person needs to accept this challenge first.');
    if (c.moderation?.state === 'hidden') throw new Error('This challenge is under review.');
    if (c.scheduledAt > now) throw new Error('Your sides are reserved. The room opens at the scheduled time.');
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
    if (c.eventId !== room || c.status !== 'live') {
      tx.update(ref, { eventId: room, status: 'live',
        feedKey: feedKeyFor('live', c.visibility, c.moderation?.state), updatedAt: now });
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

// Read the existing room's decision. The caller can request a refresh but
// cannot supply a winner, a ballot, or a replacement room ID.
export async function syncChallengeRoom(db, ref, now = Date.now()) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const c = snap.data();
    if (!c || c.mode !== 'live' || !['accepted', 'live', 'judging', 'completed'].includes(c.status)) {
      return { data: c, changed: false };
    }
    const room = 'Challenge-' + ref.id;
    const round = await tx.get(db.collection('live_rounds').doc(room));
    if (!round.exists) return { data: c, changed: false };
    const d = round.data();
    if (d.challengeId !== ref.id || (c.accepted || []).map(p => p.uid).sort().join('|') !==
        [d.proUid, d.conUid].sort().join('|')) return { data: c, changed: false };
    const ballot = d.ballot;
    const done = ballot && (['pro', 'con'].includes(ballot.winner) ||
      (ballot.winner === null && ballot.resolution === 'unresolved'));
    const status = done ? 'completed' : ['cancelled', 'forfeit'].includes(d.status) ? 'cancelled' : c.status;
    // A room made private after opening stops exposing its result publicly.
    const result = done && d.isPrivate !== true ? {
      motion: String(d.motion || c.claim).slice(0, 300),
      winner: ballot.winner,
      winnerUid: ballot.winner === 'pro' ? d.proUid : ballot.winner === 'con' ? d.conUid : '',
      winnerName: ballot.winner === 'pro' ? d.proName : ballot.winner === 'con' ? d.conName : '',
      rfd: String(ballot.rfd || '').slice(0, 12000),
      proPoints: Number.isFinite(ballot.proPoints) ? ballot.proPoints : null,
      conPoints: Number.isFinite(ballot.conPoints) ? ballot.conPoints : null,
    } : null;
    const patch = { status, eventId: room, result, roomPrivate: d.isPrivate === true,
      feedKey: feedKeyFor(status, c.visibility, c.moderation?.state) };
    const changed = Object.keys(patch).some(key => JSON.stringify(c[key]) !== JSON.stringify(patch[key]));
    if (changed) tx.update(ref, { ...patch, updatedAt: now });
    return { data: { ...c, ...patch }, changed, completed: changed && status === 'completed' && c.status !== 'completed' };
  });
}

export async function challengeRoomAdmission(db, room, uid, receiveOnly, now = Date.now()) {
  if (!room.startsWith('Challenge-')) return false;
  const id = room.slice('Challenge-'.length);
  const [challenge, round] = await Promise.all([
    db.collection('challenges').doc(id).get(), db.collection('live_rounds').doc(room).get(),
  ]);
  const c = challenge.data(), d = round.data();
  if (!c || !d || d.challengeId !== id || c.moderation?.state === 'hidden' ||
      !['accepted', 'live'].includes(c.status) || c.scheduledAt > now) throw new Error('This challenge room is not open.');
  const uids = (c.accepted || []).map(p => p.uid);
  if (uids.length !== 2 || new Set(uids).size !== 2 || uids.sort().join('|') !== [d.proUid, d.conUid].sort().join('|')) {
    throw new Error('The challenge seats could not be verified.');
  }
  if (receiveOnly) {
    if (c.visibility !== 'public' || d.isPrivate === true) throw new Error('This challenge is not open to spectators.');
  } else if (!uids.includes(uid)) throw new Error('Only the two accepted people can take a seat.');
  return true;
}
