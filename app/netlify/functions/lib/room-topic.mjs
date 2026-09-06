// The pre-round topic host, rebuilt 2026-09-06 as a VOICE in the room.
//
// The 09-02 version was a modal: consent step, a typed question, a
// "let the AI listen" button, a textarea, an "I am ready" button, then a
// second modal with the proposal. The founder's read of it on a real
// round: "this is horrible ... not another pop up to read." So the modal
// is gone. One person taps Let AI suggest, an OpenAI Realtime voice joins
// the Daily room through the tapper's browser, says it is the judge and
// asks what they want to argue about, listens to BOTH of them, and calls
// the propose_motion tool when it has one. The proposal lands on the
// round doc and the resolution bar shows a one-tap Use it for each seat.
//
// What this module owns: the phase machine (listening -> proposed ->
// done | cancelled), the public projection, the judge's instructions,
// and the tool schema. It is pure; room-topic.mjs runs it in a
// transaction and mints the Realtime key.
import { buildMatchMotionContext, validateProposedMotion } from './spar-motion-generation.mjs';
import { SENSITIVE_MOTION_POLICY } from './content-guard.mjs';
export const TOPIC_MAX_MS = 3 * 60000;
export const TOPIC_MAX_PROPOSALS = 3;
// The one line the judge says on arrival. A literal, because a model told to
// "greet them" improvises and a mini model improvised badly.
export const TOPIC_GREETING = "Hi, I'm your judge. Sounds like you two could use a hand picking what to argue about. What's something you actually disagree on, or something you've been thinking about lately?";
export function topicRoundOpen(round) {
  return !!round && !round.tournamentRound && !round.tournamentId && !round.ballotPending
    && !['complete', 'ended', 'ballot', 'judged', 'cancelled'].includes(round.status)
    && !(Number(round.speechIdx) > 0) && !(round.speeches || []).length
    && (!round.currentTimer || (round.currentTimer.state === 'ready'
      && !Number(round.currentTimer.accumulatedMs) && !Number(round.currentTimer.startMs)));
}
// A hint for the judge, never a claim about either person. The match
// profiles only ever yield a general issue the two answered differently;
// the judge is told to use what they SAY in the room over any of it.
export function topicContext(a, b, seed) {
  return buildMatchMotionContext(a, b, seed);
}
export function newTopicTalk(uids, by, from, context, id, now, attempt = 1) {
  return { id, attempt, uids, by, host: by, from, context: context || null, phase: 'listening',
    proposals: 0, proposal: '', accepts: {}, startedAt: now };
}
export function publicTopicTalk(talk) {
  if (!talk) return null;
  return { id: talk.id, phase: talk.phase, by: talk.by, host: talk.host,
    proposals: talk.proposals || 0, accepts: talk.accepts || {},
    proposal: talk.proposal || '', error: talk.error || '', expiresAt: talk.startedAt + TOPIC_MAX_MS };
}
export function advanceTopicTalk(talk, uid, body, now) {
  if (!talk || !talk.uids.includes(uid) || body.id !== talk.id) throw new Error('This topic discussion is no longer available.');
  const t = structuredClone(talk);
  if (['done', 'cancelled'].includes(t.phase)) return t;
  if (body.action === 'cancel' || now - t.startedAt >= TOPIC_MAX_MS) {
    t.phase = 'cancelled'; t.context = null; return t;
  }
  if (body.action === 'propose') {
    // Only the browser running the judge can relay a proposal, because
    // that is the only client that heard the tool call. The other seat
    // has Use it and Keep ours, not a channel into the motion.
    if (t.host !== uid) throw new Error('Only the judge can propose a resolution.');
    if (!['listening', 'proposed'].includes(t.phase)) return t;
    if (t.proposals >= TOPIC_MAX_PROPOSALS) throw new Error('Enough suggestions. Pick one, or use Change it.');
    const result = validateProposedMotion(body.motion, t.from);
    if (!result.ok) {
      const why = { same: 'That is the resolution you already have. Try another.',
        hedged_output: 'That one grants both sides. Take one side, no "but", no "however".',
        attributed_output: 'That one names the people. State the claim about the world, not about them.',
        malformed_output: 'That is not one declarative sentence of at least four words.' };
      throw new Error(why[result.reason] || 'Please choose a safer civic, technology, culture or everyday-life question.');
    }
    t.proposals += 1; t.proposal = result.motion; t.accepts = {}; t.phase = 'proposed';
  } else if (body.action === 'accept' && t.phase === 'proposed') {
    t.accepts[uid] = true;
    if (t.uids.every(id => t.accepts[id])) { t.phase = 'done'; t.context = null; }
  }
  return t;
}
export const TOPIC_TOOLS = Object.freeze([{
  type: 'function',
  name: 'propose_motion',
  description: 'Put one resolution to both people. Call this once you have heard enough to suggest something they will genuinely disagree about. The app shows it on screen with a Use it button for each of them; you do not need to ask them to say yes.',
  parameters: {
    type: 'object',
    properties: {
      motion: { type: 'string', description: 'One declarative claim that takes ONE side, 12 to 200 characters, plain words. No question mark. Never "but", "however" or "on the other hand": a sentence that grants both sides is not a resolution. No names of the two people. Only call this after at least one of them has said something about what they want to argue; never before.' },
    },
    required: ['motion'],
  },
}]);
function clean(s, max) {
  return String(s || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function buildTopicJudgeInstructions({ names, from, context, attempt }) {
  const [a, b] = (names || []).map(n => clean(n, 40) || 'one of them');
  const issueLine = context && context.issue
    ? `If they have nothing, one subject they answered differently on when they signed up was ${context.issue}. That is a hint about a subject, never about what either of them believes. Offer it only if they are stuck.`
    : 'If they have nothing, offer two or three concrete everyday choices (money, technology, culture, work, cities) and let them pick.';
  const currentLine = from ? `The resolution on their screen right now is "${clean(from, 220)}". They want something else, so do not suggest that one or a rewording of it.` : '';
  const retryLine = attempt > 1 ? 'This is not their first attempt. Be quicker and try a different area.' : '';
  return `You are the judge in a Debatable room. Two people, ${a} and ${b}, are on a video call about to argue one question, and they want help choosing what to argue about. You have joined the call by voice. You hear both of them on one channel and you will not always be able to tell who is speaking, so do not attribute views to a name unless someone says whose view it is.

${SENSITIVE_MOTION_POLICY}
${currentLine}
${issueLine}
${retryLine}

HOW THIS GOES:
1. Open with exactly this, once, and nothing more: "${TOPIC_GREETING}" Then stop and listen. Never greet twice. Do not explain the product.
2. Listen. NEVER call propose_motion before at least one of them has actually said something about what they want to argue. If nobody has spoken yet, wait. Let them talk to each other. Do not fill silence faster than about five seconds. Short reactions are fine ("okay", "go on") but keep them under eight words.
3. At most two follow-up questions, each under twenty words, only to find the real disagreement. Do not lecture, summarise, or coach.
4. As soon as you can see a claim they would genuinely split on, call the propose_motion tool with one declarative sentence. Do that within about ninety seconds. Then read the resolution out loud word for word, and add only: tap Use it if you are both in, or say "something else". No commentary on the resolution, no "this might feel", no explaining why you picked it.
5. If they say they want something else, call propose_motion again with a different area. You get three tries total.
6. If anyone says stop, or that they will keep their current topic, say "No problem, I will leave you to it" and stop talking.

THE RESOLUTION:
- One plain declarative claim a stranger could argue either side of in five minutes. 12 to 200 characters, one sentence. No question mark. Name a concrete actor, policy or tradeoff.
- Take ONE side of the tradeoff in the sentence, so the other person has the other side. Never "X, but Y", never "on the one hand", never a sentence that grants both sides. "Cities should ban private cars downtown" is a resolution. "Banning cars helps pedestrians but hurts shops" is not.
- Build it from what they actually said. If they agree with each other, find the tradeoff inside the thing they agree on rather than inventing a disagreement.
- Never take a side. Never say who is right. Never assign sides; the app does that.
- No invented facts, names, statistics or competitive debate jargon. No em dashes.
- Do not put either person's name in the resolution.

VOICE: warm, quick, a little dry. Short sentences. No "as an AI". No throat-clearing. You are a person who has walked into a room, not a form.`;
}
