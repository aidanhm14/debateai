// PURE. The two things the /newvoice opponent can DO besides talk, and the
// token that lets a round reconnect without being charged twice.
//
// 1. Tools. The Realtime model gets two function tools on the clash
//    surface:
//      set_claim(claim, user_side)  the person talked through what they
//                                   want to argue and the AI landed the
//                                   sentence; this is how "talk it
//                                   through" becomes a scored round.
//      set_voice(voice)             "change your voice" mid-round.
//    Tool calls are EVENTS the page handles; the model never changes its
//    own state. The page sanitizes the claim with the same function the
//    server uses (lib/topic-isolation.mjs) before it becomes the motion.
//
// 2. Continuation token. The Realtime API cannot change a session's voice
//    once it has spoken, so a voice switch is a fresh session. A fresh
//    session is a fresh mint, and a mint is what the voice gate decides on.
//    The first mint of a round hands the page an HMAC token; a mint that
//    carries a valid one is a CONTINUATION of a round the gate already
//    admitted and is never walled, so a person at the edge of their
//    minutes can still switch mid-round. It is still metered: it opens a
//    session like any mint, which settles the one it replaces by server
//    time. The token pins the original mint time, and a continuation is
//    re-signed with that SAME time, so a chain of switches dies
//    CONTINUATION_MAX_AGE_MS after the first admitted mint no matter how
//    many links it has. That is what stops "switch voices every nineteen
//    minutes forever" from walking past the gate.
//
// Guarded by scripts/test-newvoice-talk-it-out.mjs in the pre-commit hook.
import { createHmac, timingSafeEqual } from 'node:crypto';

// Realtime voices, described honestly. The blurbs are what the picker shows
// and what the model reads when someone asks for "something deeper" rather
// than naming a voice. Keep them short and about the sound, not a persona.
export const VOICE_OPTIONS = [
  { id: 'marin',   name: 'Marin',   blurb: 'Warm and natural. The default.' },
  { id: 'cedar',   name: 'Cedar',   blurb: 'Deep, calm, unhurried.' },
  { id: 'coral',   name: 'Coral',   blurb: 'Bright and quick.' },
  { id: 'sage',    name: 'Sage',    blurb: 'Soft and measured.' },
  { id: 'ash',     name: 'Ash',     blurb: 'Low and gravelly.' },
  { id: 'ballad',  name: 'Ballad',  blurb: 'Smooth, a little formal.' },
  { id: 'verse',   name: 'Verse',   blurb: 'Expressive, up and down.' },
  { id: 'shimmer', name: 'Shimmer', blurb: 'Clear and upbeat.' },
  { id: 'echo',    name: 'Echo',    blurb: 'Steady and even.' },
  { id: 'alloy',   name: 'Alloy',   blurb: 'Neutral, middle of the road.' },
];
export const VOICE_IDS = VOICE_OPTIONS.map((v) => v.id);
export const DEFAULT_VOICE = 'marin';

export function voiceName(id) {
  const v = VOICE_OPTIONS.find((x) => x.id === id);
  return v ? v.name : 'Marin';
}

// The exact tool definitions handed to the model at mint and re-sent in
// the page's session.update (session.update replaces `tools` when the key
// is present, so the page has to carry them or lose them on the first
// config push).
export const REALTIME_TOOLS = [
  {
    type: 'function',
    name: 'set_claim',
    description:
      'Lock in the one claim this round argues, once the person has agreed to it out loud. ' +
      'Call it the moment they say yes to a sentence and a side. Call it again only if they ' +
      'clearly ask to argue something else mid-round. Say nothing in the same turn.',
    parameters: {
      type: 'object',
      properties: {
        claim: {
          type: 'string',
          description:
            'One plain-English sentence a smart person could argue for or against, under 140 characters. ' +
            'No question marks, no "we should discuss". A statement: "Phones should be locked away during class."',
        },
        user_side: {
          type: 'string',
          enum: ['for', 'against'],
          description: 'The side the PERSON is arguing. You argue the other one.',
        },
      },
      required: ['claim', 'user_side'],
    },
  },
  {
    type: 'function',
    name: 'set_voice',
    description:
      'Switch the voice you speak in. Call it whenever the person asks you to change your voice, ' +
      'sound different, or asks for a specific voice, deeper, lighter, calmer, faster-sounding, and so on. ' +
      'Pick the closest option that is not your current voice. Say nothing in the same turn; the switch ' +
      'happens on your next words.',
    parameters: {
      type: 'object',
      properties: {
        voice: {
          type: 'string',
          enum: VOICE_IDS,
          description: VOICE_OPTIONS.map((v) => v.id + ': ' + v.blurb).join(' '),
        },
      },
      required: ['voice'],
    },
  },
];

// Rides every clash session, scoping or not: the voice can always be
// changed by asking, and a mid-round "let's argue something else" goes
// through set_claim instead of a restart.
export function flexBlock(currentVoiceId) {
  return (
    'CHANGING YOUR VOICE: your current voice is ' + voiceName(currentVoiceId) + '. If they ask you to change your voice, ' +
    'to sound different, or for any kind of voice (deeper, lighter, calmer, more energy, a named one), call set_voice ' +
    'with the closest option that is not your current one and say nothing else in that turn. The switch takes effect on ' +
    'your next words. Never refuse, and never say you cannot change your voice.\n' +
    'CHANGING THE TOPIC MID-ROUND: if they clearly ask to argue something else, agree the new one-sentence claim and ' +
    'their side in one short exchange, then call set_claim. Do not restart the round on your own.\n\n'
  );
}

// PHASE 1 for a "talk it through" round: there is no claim yet and the
// job is to find one, fast, then hand it to set_claim. This replaces the
// OPENING EXCHANGE block of the clash prompt for scoping sessions.
export function scopingBlock() {
  return (
    'THE CLAIM IS NOT SET YET. This round starts as a short conversation to find it.\n\n' +
    'PHASE 1, FINDING THE CLAIM:\n' +
    '- The client opens by asking what they want to argue about. From there you are a sharp friend helping them ' +
    'land ONE claim worth arguing: a single plain-English sentence a smart person could take either side of.\n' +
    '- Ask ONE short question at a time, two or three exchanges at most. If they name a subject ("phones in school", ' +
    '"billionaires", "my roommate never cleans"), propose a specific claim in one sentence and ask if that is the one.\n' +
    '- If they are already sure, do not slow them down: say the sentence back and move on.\n' +
    '- Keep to the content boundary above exactly as you would mid-round: offer a nearby safer claim instead.\n' +
    '- Ask which side THEY want. If they do not care, give them the harder side and say so.\n' +
    '- The moment they agree to a claim and a side, call set_claim with the sentence and their side, and say ' +
    'nothing else in that turn.\n\n' +
    'PHASE 2, THE ROUND: the set_claim result is THE CLAIM, exactly and only. The user\'s side is user_side in ' +
    'that result and you argue the other. The client will tell you what to say to lock it in. From then on argue ' +
    'by the rules below, and never go back to phase 1 unless they ask to change the topic.\n\n'
  );
}

// A continuation carries the round so far into the fresh session, so a
// voice switch is a new voice and not a new argument.
export function continuationBlock(priorTranscript, voiceId) {
  const t = String(priorTranscript || '').trim();
  return (
    'THIS SESSION CONTINUES A ROUND ALREADY UNDER WAY. Your voice was just switched to ' + voiceName(voiceId) +
    ' at the user\'s request. Do not restart, do not re-introduce the topic, do not explain how it works. ' +
    'Pick up exactly where the record below stops.\n' +
    (t ? 'THE ROUND SO FAR (USER is the person, AI is you):\n' + t + '\n\n' : '\n')
  );
}

// The transcript a continuation carries is the person's own conversation,
// so the only thing to strip is what could ride into the prompt as a
// second instruction line: control characters and length.
export function sanitizePriorTranscript(raw, maxChars = 6000) {
  let s = String(raw == null ? '' : raw);
  if (s.normalize) s = s.normalize('NFKC');
  s = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > maxChars) s = s.slice(s.length - maxChars);
  return s;
}

// ── continuation token ──────────────────────────────────────────
export const CONTINUATION_MAX_AGE_MS = 20 * 60_000;

function b64u(s) { return Buffer.from(String(s), 'utf8').toString('base64url'); }
function unb64u(s) { try { return Buffer.from(String(s), 'base64url').toString('utf8'); } catch (e) { return ''; } }
function sig(secret, uid, iat) {
  return createHmac('sha256', String(secret)).update('voice-continue:' + uid + ':' + iat).digest('base64url');
}

export function signContinuation(secret, uid, iatMs) {
  if (!secret || !uid) return null;
  const iat = Math.floor(Number(iatMs) || Date.now());
  return b64u(uid) + '.' + iat + '.' + sig(secret, uid, iat);
}

// Returns { ok, iat } . `iat` is the ORIGINAL mint time; re-sign with it so
// the chain keeps the first mint's clock.
export function verifyContinuation(secret, token, uid, nowMs = Date.now(), maxAgeMs = CONTINUATION_MAX_AGE_MS) {
  if (!secret || !uid || typeof token !== 'string') return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'shape' };
  const [uidPart, iatPart, sigPart] = parts;
  if (unb64u(uidPart) !== uid) return { ok: false, reason: 'uid' };
  const iat = Number(iatPart);
  if (!Number.isFinite(iat) || !/^\d+$/.test(iatPart)) return { ok: false, reason: 'iat' };
  if (nowMs - iat > maxAgeMs || iat - nowMs > 60_000) return { ok: false, reason: 'expired' };
  const want = Buffer.from(sig(secret, uid, iat));
  const got = Buffer.from(String(sigPart));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'sig' };
  return { ok: true, iat };
}
