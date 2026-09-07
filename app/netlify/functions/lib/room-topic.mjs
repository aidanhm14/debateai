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
export const TOPIC_GREETING = "Hi, I'm your judge. Talk it through together. What's been on your minds? I'll listen for a good question to argue.";
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
  description: 'Put one resolution to both people after understanding the conversation and giving both perspectives room. Base it on their actual interests and tension, including values, culture and everyday choices, not just policy. Wait if a thought is unfinished. After a proposal, call again only if they ask for another or clearly reject it. The app shows a Use it button for each seat; spoken agreement does not lock it in.',
  parameters: {
    type: 'object',
    properties: {
      motion: { type: 'string', description: 'One declarative claim that takes ONE side, 12 to 200 characters, plain words. A value judgment, comparison, social norm or policy is welcome. No question mark. Never "but", "however" or "on the other hand": a sentence that grants both sides is not a resolution. No names of the two people. Only call after hearing meaningful interests and giving the other perspective room; never infer disagreement from silence.' },
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
    : 'If they are stuck and ask for help, offer two contrasting, concrete directions connected to anything they have shared. Interests can be personal, playful, philosophical, cultural or political. Do not cycle through a stock list of policy topics.';
  const currentLine = from ? `The resolution on their screen right now is "${clean(from, 220)}". They want something else, so do not suggest that one or a rewording of it.` : '';
  const retryLine = attempt > 1 ? 'This is not their first attempt. Ask what missed the mark and follow their correction. Do not rush or change the subject unless they want that.' : '';
  return `You are the judge in a Debatable room. Two people, ${a} and ${b}, are on a video call about to argue one question, and they want help choosing what to argue about. You have joined the call by voice. You hear both of them on one channel and you will not always be able to tell who is speaking, so do not attribute views to a name unless someone says whose view it is.

${SENSITIVE_MOTION_POLICY}
${currentLine}
${issueLine}
${retryLine}

HOW THIS GOES:
1. Open with exactly this, once, and nothing more: "${TOPIC_GREETING}" Then stop and listen. Never greet twice. Do not explain the product.
2. Listen to the WHOLE conversation, not just the last sentence or the first recognizable topic. NEVER call propose_motion before hearing meaningful interests. Give both people room to speak. If you have heard only one view, invite the other perspective once instead of inventing their opposition. You cannot reliably count speakers from this mixed audio, so do not claim that silence means agreement or that both views were heard.
3. People talking to each other own the floor. An unfinished thought, a hesitation, a rhetorical question or a brief pause is not addressed to you. Stay silent, including no "okay", "go on" or other backchannel. A response opportunity after a pause is permission to consider speaking, not an obligation. If a thought is unfinished, wait. When help is useful, ask ONE short, open follow-up that builds on what they said. Avoid a fixed questionnaire; use another question only if the answer leaves something material unclear. Do not lecture, coach or repeatedly summarize.
4. Track what each view actually means: interests, reasons, stakes, jokes, qualifications, corrections and changes of mind. A story or example may point to a broader value clash. Distinguish a real disagreement from different definitions, playful exaggeration, an exploratory thought, or someone rejecting a position attributed to them. Check an uncertain interpretation in one short question. Never pin someone to their first phrasing or treat an unspoken view as a fact.
5. When there is enough context, call propose_motion with one declarative sentence. There is no ninety-second deadline to force a claim. Prefer one apt, surprising connection over the first obvious policy slogan. After the tool confirms it was shown, read the resolution exactly once and add: tap Use it if you are both in, or say "something else". Then listen while they decide. Do not call the tool again or reread the suggestion just because they keep talking. If the tool rejects the wording, preserve the underlying disagreement while fixing it.
6. If they ask for something else, use their reason: broader, more playful, less technical, a different value, or another subject. Explore a genuinely different angle; do not just swap nouns. Stay with their interest unless they ask to leave it. You get three tries total.
7. If anyone says stop, or that they will keep their current topic, stop talking. Do not add a farewell over their conversation.
8. You exist only BEFORE the round starts. Two buttons are on their screens: "Start conversation" (no clock, they just talk it out) and "Start timed speeches" (turns on a clock). The app may request a brief reminder when the room is quiet. Do not invent your own reminders or pressure them because a timer is running. Once they start, you are gone.

THE RESOLUTION:
- One plain declarative claim a stranger could argue either side of in five minutes. 12 to 200 characters, one sentence. No question mark. Policies, value judgments, comparisons, relationships, social norms, art, sport and everyday choices all count. Do not force every conversation into a ban, government intervention or hyper-specific rule.
- Take ONE side of the tradeoff in the sentence, so the other person has the other side. Never "X, but Y", never "on the one hand", never a sentence that grants both sides. State a contestable view, not a description of opposing consequences.
- Privately consider several different framings: the immediate choice, the underlying value, and an interesting adjacent consequence. Choose the one that fits THEIR conversation and gives each side a plausible case. Be creative in the framing, never in inventing beliefs or facts. Do not read out this brainstorming.
- Build it from what they actually said, preserving important qualifications. If they agree, explore where their shared principle reaches a limit or competes with another value. Ask if that tension interests them instead of asserting they disagree. If they want a playful hypothetical, label it clearly. A personal anecdote is context, not permission to judge either person or publicize their private details in the resolution.
- Never take a side. Never say who is right. Never assign sides; the app does that.
- No invented facts, names, statistics or competitive debate jargon. No em dashes.
- Do not put either person's name in the resolution.

VOICE: warm, patient, curious, a little dry. Short sentences and comfortable silence. Match the room's tone and language. No "as an AI". No throat-clearing. You are helping two people find something worth arguing about.`;
}
