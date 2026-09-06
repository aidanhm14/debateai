import { randomUUID } from 'node:crypto';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { callModel, FALLBACK_FAST } from './lib/cheap.mjs';
import { topicRoundOpen, topicContext, newTopicTalk, publicTopicTalk, advanceTopicTalk,
  TOPIC_SYSTEM, TOPIC_MAX_MS, topicGenerationInput, finishTopicGeneration } from './lib/room-topic.mjs';

export async function runTopicAction(db, uid, body, generate, now = Date.now) {
  const roomRef = db.collection('live_rounds').doc(body.room);
  const stampRef = db.collection('round_drafts').doc(body.room);
  const ref = db.collection('room_topic_talks').doc(body.room);
  const result = await db.runTransaction(async tx => {
    const [roomSnap, stampSnap, snap] = await Promise.all([tx.get(roomRef), tx.get(stampRef), tx.get(ref)]);
    const round = roomSnap.exists ? roomSnap.data() : null;
    const stamp = stampSnap.exists ? stampSnap.data() : null;
    if (!stamp?.eligible || stamp.uids?.length !== 2 || !stamp.uids.includes(uid)
        || !round || ![round.proUid, round.conUid].includes(uid)
        || !stamp.uids.every(id => [round.proUid, round.conUid].includes(id))) throw new Error('Only the two seated people can choose this topic.');
    if (!topicRoundOpen(round) || stamp.tournamentId || stamp.draftConfig?.pool || (stamp.draft && stamp.draft.phase !== 'done')) throw new Error('Choose a topic before the round starts, outside the motion draft.');
    let talk = snap.exists ? snap.data() : null;
    const previous = talk?.phase;
    if (body.action === 'open') {
      if (talk && !['done', 'cancelled'].includes(talk.phase) && now() - talk.startedAt < TOPIC_MAX_MS) return { talk };
      if (talk?.attempt >= 3) throw new Error('Use Change it or Draft one together to choose another topic.');
      const profiles = await Promise.all(stamp.uids.map(id => tx.get(db.collection('spar_match_profiles').doc(id))));
      const attempt = (talk?.attempt || 0) + 1;
      const context = topicContext(profiles[0].data(), profiles[1].data(), body.room + ':' + attempt);
      talk = newTopicTalk(stamp.uids, uid, round.motion || '', context, randomUUID(), now(), attempt);
    } else {
      talk = advanceTopicTalk(talk, uid, body, now());
    }
    if (round.motion !== talk.from && talk.phase !== 'done') {
      talk = { ...talk, phase: 'cancelled', lines: [], seen: [], context: null };
    }
    const patch = { topicConversation: publicTopicTalk(talk) };
    if (talk.phase === 'done') {
      if (round.motion !== talk.from && round.motion !== talk.proposal) throw new Error('The resolution changed. Open a new discussion.');
      patch.motion = talk.proposal;
      patch.motionProposal = FieldValue.delete(); patch.motionProposalAccepts = FieldValue.delete();
    }
    tx.set(ref, talk);
    tx.update(roomRef, patch);
    return { talk, generate: previous !== 'generating' && talk.phase === 'generating' };
  });
  if (!result.generate) return publicTopicTalk(result.talk);
  let final;
  try { final = finishTopicGeneration(result.talk, await generate(topicGenerationInput(result.talk))); }
  catch (_) { final = { ...result.talk, phase: 'cancelled', error: 'Could not find a suitable resolution. Your current resolution is unchanged. Try another discussion or use Change it.', lines: [], seen: [], context: null }; }
  return db.runTransaction(async tx => {
    const [snap, roundSnap] = await Promise.all([tx.get(ref), tx.get(roomRef)]);
    const current = snap.exists ? snap.data() : null;
    const round = roundSnap.exists ? roundSnap.data() : null;
    if (current?.id !== result.talk.id || current?.phase !== 'generating') return publicTopicTalk(current);
    if (!topicRoundOpen(round) || round.motion !== current.from || now() - current.startedAt >= TOPIC_MAX_MS) {
      final = { ...final, phase: 'cancelled', proposal: '', lines: [], seen: [], context: null };
    }
    tx.set(ref, final);
    tx.update(roomRef, { topicConversation: publicTopicTalk(final) });
    return publicTopicTalk(final);
  });
}
export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch (_) {}
  if (!isNamedAccount(decoded)) return errorResponse('Sign in to choose a topic.', 401, request);
  const uid = decoded.uid || decoded.sub;
  const rate = await checkLayers('room-topic', uid, [{ window: 60000, max: 30, label: 'minute' }, { window: 3600000, max: 150, label: 'hour' }]);
  if (!rate.ok) return errorResponse('Please wait before trying again.', 429, request);
  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid request', 400, request); }
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(body.room || '') || !['open', 'consent', 'line', 'ready', 'accept', 'cancel'].includes(body.action)) return errorResponse('Invalid request', 400, request);
  try {
    const talk = await runTopicAction(getDb(), uid, body, async input => {
      const response = await callModel({ model: process.env.SPAR_MOTION_MODEL || FALLBACK_FAST, fallback: FALLBACK_FAST, timeoutMs: 9000, label: 'room-topic',
        body: { max_tokens: 700, system: TOPIC_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(input) }] } });
      if (response.stop_reason === 'max_tokens') throw new Error('Incomplete suggestion');
      const text = (response.content || []).filter(p => p.type === 'text').map(p => p.text).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      return JSON.parse(text);
    });
    return jsonResponse({ ok: true, talk }, 200, request);
  } catch (err) {
    // State-machine rejections are written for the two people. Provider and DB errors stay private.
    const safe = /^(Only the two|Choose a topic|Use Change it|This topic|Keep each|Please choose|Enough conversation|Say or type|The resolution changed)/.test(err.message || '');
    return errorResponse(safe ? err.message : 'Could not update the topic discussion. Try again.', safe ? 409 : 503, request);
  }
}
export const config = { path: '/api/room-topic' };
