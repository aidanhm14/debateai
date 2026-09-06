// POST /api/room-topic. The voice judge that helps two seated people pick
// a resolution before the round (lib/room-topic.mjs has the why).
//
// Actions: open (starts the talk and, for the host, mints the OpenAI
// Realtime key the browser dials with), propose (host relays the judge's
// tool call), accept (either seat), cancel (either seat).
//
// The mint is real money, so it sits behind App Check, a named account,
// the round_drafts eligibility stamp (both seats, casual pair, no draft
// pool) and a per-uid limit. The browser does WebRTC to OpenAI directly;
// this server never touches the audio.
import { randomUUID } from 'node:crypto';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { topicRoundOpen, topicContext, newTopicTalk, publicTopicTalk, advanceTopicTalk,
  TOPIC_MAX_MS, TOPIC_TOOLS, TOPIC_GREETING, buildTopicJudgeInstructions } from './lib/room-topic.mjs';

const TOPIC_VOICE = process.env.OPENAI_TOPIC_VOICE || 'marin';
const MODEL_FALLBACKS = [
  process.env.OPENAI_TOPIC_REALTIME_MODEL,
  'gpt-realtime-2.1-mini', // a topic host does not need the big model; mini is cheaper and faster
  'gpt-realtime-2.1',
  'gpt-realtime',
].filter(Boolean);
const supportsReasoning = (m) => /^gpt-realtime-2\.1/.test(m || '');

export async function runTopicAction(db, uid, body, now = Date.now) {
  const roomRef = db.collection('live_rounds').doc(body.room);
  const stampRef = db.collection('round_drafts').doc(body.room);
  const ref = db.collection('room_topic_talks').doc(body.room);
  return db.runTransaction(async tx => {
    const [roomSnap, stampSnap, snap] = await Promise.all([tx.get(roomRef), tx.get(stampRef), tx.get(ref)]);
    const round = roomSnap.exists ? roomSnap.data() : null;
    const stamp = stampSnap.exists ? stampSnap.data() : null;
    if (!stamp?.eligible || stamp.uids?.length !== 2 || !stamp.uids.includes(uid)
        || !round || ![round.proUid, round.conUid].includes(uid)
        || !stamp.uids.every(id => [round.proUid, round.conUid].includes(id))) throw new Error('Only the two seated people can choose this topic.');
    if (!topicRoundOpen(round) || stamp.tournamentId || stamp.draftConfig?.pool || (stamp.draft && stamp.draft.phase !== 'done')) throw new Error('Choose a topic before the round starts, outside the motion draft.');
    let talk = snap.exists ? snap.data() : null;
    if (body.action === 'open') {
      if (talk && !['done', 'cancelled'].includes(talk.phase) && now() - talk.startedAt < TOPIC_MAX_MS) {
        return { talk, round, resumed: true };
      }
      if (talk?.attempt >= 3) throw new Error('Use Change it or Draft one together to choose another topic.');
      const profiles = await Promise.all(stamp.uids.map(id => tx.get(db.collection('spar_match_profiles').doc(id))));
      const attempt = (talk?.attempt || 0) + 1;
      const context = topicContext(profiles[0].data(), profiles[1].data(), body.room + ':' + attempt);
      talk = newTopicTalk(stamp.uids, uid, round.motion || '', context, randomUUID(), now(), attempt);
    } else {
      talk = advanceTopicTalk(talk, uid, body, now());
    }
    if (round.motion !== talk.from && talk.phase !== 'done') {
      talk = { ...talk, phase: 'cancelled', context: null };
    }
    const patch = { topicConversation: publicTopicTalk(talk) };
    if (talk.phase === 'done') {
      if (round.motion !== talk.from && round.motion !== talk.proposal) throw new Error('The resolution changed. Open a new discussion.');
      patch.motion = talk.proposal;
      patch.motionProposal = FieldValue.delete(); patch.motionProposalAccepts = FieldValue.delete();
    }
    tx.set(ref, talk);
    tx.update(roomRef, patch);
    return { talk, round, resumed: false };
  });
}

// Mint the Realtime key the host's browser dials with. GA shape from the
// AGENTS.md reference; the beta /sessions path is deliberately not tried
// here because every model in the list is GA.
export async function mintTopicVoice(instructions, fetchImpl = fetch) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured.');
  let lastErr = '';
  for (const model of MODEL_FALLBACKS) {
    const session = {
      type: 'realtime', model, instructions,
      tools: TOPIC_TOOLS, tool_choice: 'auto',
      audio: { output: { voice: TOPIC_VOICE, speed: 1.05 } },
    };
    if (supportsReasoning(model)) session.reasoning = { effort: 'low' };
    const r = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session }),
    });
    if (r.ok) {
      const data = await r.json();
      const secret = data.client_secret || (data.value ? { value: data.value, expires_at: data.expires_at } : null);
      if (!secret) throw new Error('Mint succeeded but client_secret missing.');
      return { client_secret: secret, model, voice: TOPIC_VOICE, greeting: TOPIC_GREETING, sdpUrl: 'https://api.openai.com/v1/realtime/calls' };
    }
    lastErr = await r.text().catch(() => '');
    console.error('[room-topic] mint failed', model, r.status, lastErr.slice(0, 300));
    if (r.status === 401 || r.status === 403) break;
  }
  throw new Error('REALTIME_MINT_FAILED');
}

export function topicNames(round, uids) {
  return (uids || []).map(id => id === round.conUid ? round.conName : round.proName);
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) return errorResponse('App verification failed. Reload the page and try again.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch (_) {}
  if (!isNamedAccount(decoded)) return errorResponse('Sign in to choose a topic.', 401, request);
  const uid = decoded.uid || decoded.sub;
  const rate = await checkLayers('room-topic', uid, [{ window: 60000, max: 30, label: 'minute' }, { window: 3600000, max: 150, label: 'hour' }]);
  if (!rate.ok) return errorResponse('Please wait before trying again.', 429, request);
  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid request', 400, request); }
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(body.room || '') || !['open', 'propose', 'accept', 'cancel'].includes(body.action)) return errorResponse('Invalid request', 400, request);
  if (body.action === 'open') {
    // The mint is the expensive call. 6 an hour is three full attempts
    // twice over; nobody choosing a topic in good faith gets near it.
    const voiceRate = await checkLayers('room-topic-voice', uid, [{ window: 3600000, max: 6, label: 'hour' }, { window: 86400000, max: 20, label: 'day' }]);
    if (!voiceRate.ok) return errorResponse('The judge has helped you pick enough topics for now. Use Change it or Spin a motion.', 429, request);
  }
  try {
    const { talk, round } = await runTopicAction(getDb(), uid, body);
    const out = { ok: true, talk: publicTopicTalk(talk) };
    if (body.action === 'open' && talk.host === uid && talk.phase === 'listening') {
      const instructions = buildTopicJudgeInstructions({
        names: topicNames(round, talk.uids), from: talk.from, context: talk.context, attempt: talk.attempt,
      });
      try { out.voice = await mintTopicVoice(instructions); }
      catch (err) {
        console.error('[room-topic] voice mint failed:', err.message);
        // No voice means no judge. Cancel the talk so the other seat is
        // not left watching a strip for a judge who never arrives.
        await runTopicAction(getDb(), uid, { room: body.room, id: talk.id, action: 'cancel' }).catch(() => {});
        return errorResponse('The judge could not join right now. Try Spin a motion, or Change it.', 503, request);
      }
    }
    return jsonResponse(out, 200, request);
  } catch (err) {
    // State-machine rejections are written for the two people. Provider and DB errors stay private.
    const safe = /^(Only the two|Choose a topic|Use Change it|This topic|Please choose|That is the resolution|Enough suggestions|Only the judge|The resolution changed)/.test(err.message || '');
    return errorResponse(safe ? err.message : 'Could not update the topic discussion. Try again.', safe ? 409 : 503, request);
  }
}
export const config = { path: '/api/room-topic' };
