import { createHash, randomUUID } from 'node:crypto';
import { buildPool } from './motion-draft.mjs';
import { DRAFT_MOTIONS } from './draft-motions.mjs';
import { checkContent } from './content-guard.mjs';
import { topicRoundOpen } from './room-topic.mjs';

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export const strikesPending = d => !!d && !['done', 'cancelled'].includes(d.phase);

// Only commitments leave the server until BOTH people have struck.
export function publicStrikes(d) {
  if (!d) return null;
  const out = { id: d.id, phase: d.phase, by: d.by, pool: d.pool,
    committed: Object.fromEntries(d.uids.map(uid => [uid, !!d.strikes[uid]])),
    motionUid: d.motionUid, sideUid: d.sideUid, chosenId: d.chosenId || '' };
  if (d.uids.every(uid => d.strikes[uid])) {
    out.strikes = d.strikes;
    out.survivors = d.survivors || [];
  }
  return out;
}

export async function runTopicStrikes(db, uid, body, fieldValue) {
  const roundRef = db.collection('live_rounds').doc(body.room);
  const privateRef = db.collection('room_topic_strikes').doc(body.room);
  const stampRef = db.collection('round_drafts').doc(body.room);
  return db.runTransaction(async tx => {
    const [rs, ds, ss] = await Promise.all([tx.get(roundRef), tx.get(privateRef), tx.get(stampRef)]);
    const round = rs.exists ? rs.data() : null;
    const stamp = ss.exists ? ss.data() : null;
    if (!round || ![round.proUid, round.conUid].includes(uid)) fail('Only the two seated people can choose topics.', 403);
    if (!round.proUid || !round.conUid || round.proUid === round.conUid || round.teamSize === 2 || round.proUid2 || round.conUid2) fail('Strikes need one person on each side.');
    if (!topicRoundOpen(round) || stamp?.tournamentId || stamp?.draftConfig?.pool
        || (round.draft && round.draft.phase !== 'done') || (stamp?.draft && stamp.draft.phase !== 'done')) fail('Choose topics before the round starts, outside a tournament or another draft.');
    let draft = ds.exists ? ds.data() : null;
    const revision = Number(draft?.revision) || 0;
    // Independent blind commitments may arrive together at the same revision.
    const independentStrike = body.action === 'strike' && draft?.phase === 'strike' && body.id === draft.id;
    if (body.revision != null && body.revision !== revision && !independentStrike) fail('The topic choice has moved on. Try again.');
    const uids = [round.proUid, round.conUid].sort();
    if (body.action === 'invite') {
      if (strikesPending(draft)) fail('A strike invitation is already open.');
      if (round.motionProposal || (round.topicConversation && !['done', 'cancelled'].includes(round.topicConversation.phase))) fail('Finish or withdraw the current topic proposal first.');
      const id = randomUUID();
      const verified = stamp?.eligible && stamp.uids?.length === 2 && stamp.uids.every(u => uids.includes(u));
      const suggestions = [...new Set([...(verified ? stamp.draftConfig?.suggestions || [] : []), ...DRAFT_MOTIONS.casual])]
        .filter(text => checkContent({ text, kind: 'motion', minLength: 12, maxLength: 200 }).ok);
      const pool = buildPool(id, 'casual', { suggestions, poolSize: 5 });
      if (pool.length !== 5) fail('Could not find five topics. Try spinning one instead.');
      const first = createHash('sha256').update(id).digest()[0] % 2;
      draft = { id, phase: 'offered', by: uid, uids, from: round.motion || '', pool, strikes: {},
        motionUid: uids[first], sideUid: uids[1 - first] };
    } else {
      if (!draft || !strikesPending(draft) || body.id !== draft.id || !draft.uids.every(u => uids.includes(u))) fail('This topic choice is no longer open.');
      if (body.action === 'cancel') draft.phase = 'cancelled';
      else {
        if ((round.motion || '') !== draft.from) fail('The topic changed. Cancel strikes and start again.');
        if (body.action === 'accept' && draft.phase === 'offered' && uid !== draft.by) draft.phase = 'strike';
        else if (body.action === 'strike' && draft.phase === 'strike') {
          if (draft.strikes[uid]) fail('Your strikes are already locked.');
          const ids = body.ids;
          if (!Array.isArray(ids) || ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !draft.pool.some(p => p.id === id))) fail('Choose exactly two different topics to strike.');
          draft.strikes[uid] = ids;
          if (draft.uids.every(u => draft.strikes[u])) {
            const removed = new Set(draft.uids.flatMap(u => draft.strikes[u]));
            draft.survivors = draft.pool.filter(p => !removed.has(p.id)).map(p => p.id);
            draft.phase = draft.survivors.length === 1 ? 'side' : 'motion';
            if (draft.survivors.length === 1) draft.chosenId = draft.survivors[0];
          }
        } else if (body.action === 'motion' && draft.phase === 'motion' && uid === draft.motionUid && draft.survivors.includes(body.motionId)) {
          draft.chosenId = body.motionId; draft.phase = 'side';
        } else if (body.action === 'side' && draft.phase === 'side' && uid === draft.sideUid && ['pro', 'con'].includes(body.side)) {
          draft.side = body.side; draft.phase = 'done';
        } else fail('That choice is not available to you right now.');
      }
    }
    draft.revision = revision + 1;
    const patch = { topicStrikes: publicStrikes(draft), topicStrikesRevision: draft.revision };
    if (draft.phase === 'done') {
      const names = { [round.proUid]: round.proName || 'For', [round.conUid]: round.conName || 'Against' };
      patch.motion = draft.pool.find(p => p.id === draft.chosenId).text;
      patch.proUid = draft.side === 'pro' ? draft.sideUid : draft.motionUid;
      patch.conUid = draft.side === 'con' ? draft.sideUid : draft.motionUid;
      patch.proName = names[patch.proUid]; patch.conName = names[patch.conUid];
      if (patch.proUid !== round.proUid) {
        const picks = round.judgePicks || {};
        patch.judgePicks = { pro: picks.con || 'chair', con: picks.pro || 'chair' };
      }
      patch.background = '';
      patch.motionProposal = fieldValue.delete(); patch.motionProposalAccepts = {};
      patch.sideSwap = fieldValue.delete();
    }
    tx.set(privateRef, draft);
    tx.update(roundRef, patch);
    const reply = { topicStrikes: patch.topicStrikes, topicStrikesRevision: draft.revision };
    for (const key of ['motion', 'background', 'proUid', 'conUid', 'proName', 'conName']) reply[key] = patch[key] ?? round[key] ?? '';
    if (patch.judgePicks) reply.judgePicks = patch.judgePicks;
    if (draft.phase === 'done') { reply.motionProposal = null; reply.motionProposalAccepts = {}; reply.sideSwap = null; }
    return { ok: true, round: reply };
  });
}
