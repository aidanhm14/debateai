// POST /api/ballot-voice. Mints an OpenAI Realtime session whose only job
// is to read one finished ballot aloud, verbatim, in the judge's voice.
//
// 2026-09-07, Aidan on the /live-round "Judge reading" pill: "use realtime
// api gpt this is bad audio i dont like it". The read used to go through
// /api/tts (ElevenLabs when premium, gpt-4o-mini-tts otherwise) and read
// flat. The Realtime voices (marin / cedar) are the ones the voice round
// and the pre-round topic judge already speak in, so the ballot now comes
// from the same voice the room has been hearing all round.
//
// Shape, and why it is this shape:
// - The request carries the script. The ballot exists only in the client
//   (it is rendered from the judge response, not stored on the round doc),
//   so the server cannot rebuild it. That makes this endpoint a bounded
//   text-to-speech relay, and the bounds are the security: a verified
//   Firebase token, a per-uid lane (tighter for anonymous uids, which are
//   free to mint), an IP backstop, a 4800-char cap, and a session whose
//   instructions forbid anything but reading the text it was handed.
// - Output only. No mic track, no tools, no turn detection. The client
//   opens a recv-only audio transceiver, hands the script over as one
//   user message, sends one response.create, and tears down on
//   output_audio_buffer.stopped. A session that cannot hear cannot be
//   steered into a conversation on our minutes.
// - The script rides in the mint's instructions AND is re-sent by the
//   client as a conversation item. Measured on production 2026-09-07:
//   with the text only in instructions the model said it had no ballot
//   "in this conversation" and read nothing; as a message it read the
//   whole thing verbatim. The instructions still set the role and the
//   delivery; the message is what gets read.
// - Same GA mint + SDP endpoints as room-topic.mjs; see the "OpenAI
//   Realtime API reference" section of AGENTS.md before changing the body.
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';

const BALLOT_VOICE = process.env.OPENAI_BALLOT_VOICE || 'cedar';
const MODEL_FALLBACKS = [
  process.env.OPENAI_BALLOT_REALTIME_MODEL,
  'gpt-realtime-2.1-mini', // a verbatim read does not need the big model
  'gpt-realtime-2.1',
  'gpt-realtime',
].filter(Boolean);
const supportsReasoning = (m) => /^gpt-realtime-2\.1/.test(m || '');
export const MAX_SCRIPT_CHARS = 4800;

export function cleanScript(text) {
  // Control characters out (they are never spoken and can smuggle a line
  // break into the instruction block), whitespace collapsed, hard cap.
  return String(text || '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SCRIPT_CHARS);
}

export function buildReadInstructions(script) {
  return [
    'You are the AI judge of a live debate on Debatable, reading your written ballot aloud to the two debaters and the room.',
    'Read the BALLOT below out loud, word for word, from the first word to the last. Do not add a greeting, a preface, a summary, a comment, or a closing line. Do not skip, shorten, reorder, or paraphrase anything. Do not answer questions or respond to anything other than the instruction to read.',
    'Delivery: a measured, warm tournament judge announcing a decision. Natural pace, clear pauses at sentence ends, a little weight on the winner\'s name and on the reason the round turned. No theatrics, no rushing.',
    'If the text names a side or a person, say the name exactly as written.',
    'BALLOT:',
    script,
  ].join('\n\n');
}

export async function mintBallotVoice(script, fetchImpl = fetch) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured.');
  const instructions = buildReadInstructions(script);
  let lastErr = '';
  for (const model of MODEL_FALLBACKS) {
    const session = {
      type: 'realtime', model, instructions,
      audio: { output: { voice: BALLOT_VOICE, speed: 1.0 } },
    };
    if (supportsReasoning(model)) session.reasoning = { effort: 'minimal' };
    const r = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session }),
    });
    if (r.ok) {
      const data = await r.json();
      const secret = data.client_secret || (data.value ? { value: data.value, expires_at: data.expires_at } : null);
      if (!secret) throw new Error('Mint succeeded but client_secret missing.');
      return { client_secret: secret, model, voice: BALLOT_VOICE, sdpUrl: 'https://api.openai.com/v1/realtime/calls' };
    }
    lastErr = await r.text().catch(() => '');
    console.error('[ballot-voice] mint failed', model, r.status, lastErr.slice(0, 300));
    if (r.status === 401 || r.status === 403) break;
  }
  throw new Error('REALTIME_MINT_FAILED');
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) return errorResponse('App verification failed. Reload the page and try again.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch (_) {}
  const uid = decoded && (decoded.uid || decoded.sub);
  if (!uid) return errorResponse('Sign in to hear the ballot read aloud.', 401, request);
  // One read per ballot is the honest use. Anonymous uids are free to mint,
  // so their lane is tight and the IP layer sits under both.
  const named = isNamedAccount(decoded);
  const lanes = named
    ? [{ window: 3600000, max: 8, label: 'hour' }, { window: 86400000, max: 24, label: 'day' }]
    : [{ window: 3600000, max: 3, label: 'hour' }, { window: 86400000, max: 6, label: 'day' }];
  const rate = await checkLayers('ballot-voice', `uid_${uid}`, lanes);
  if (!rate.ok) return errorResponse('The judge has read enough ballots for now. The verdict is on screen.', 429, request);
  const ipRate = await checkLayers('ballot-voice-ip', `ip_${callerIp(request)}`, [{ window: 3600000, max: 24, label: 'hour' }]);
  if (!ipRate.ok) return errorResponse('Please wait before trying again.', 429, request);
  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid request', 400, request); }
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(body.room || '')) return errorResponse('Invalid request', 400, request);
  const script = cleanScript(body.text);
  if (script.length < 12) return errorResponse('Nothing to read.', 400, request);
  try {
    const voice = await mintBallotVoice(script);
    return jsonResponse({ ok: true, voice }, 200, request);
  } catch (err) {
    console.error('[ballot-voice] mint failed:', err.message);
    return errorResponse('The judge could not speak right now.', 503, request);
  }
}
export const config = { path: '/api/ballot-voice' };
