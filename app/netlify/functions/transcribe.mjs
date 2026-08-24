// Audio → text for the AI judge's live-listen mode.
//
// /judge can now sit on the table during a real round and listen. The
// browser records the room with MediaRecorder, cuts the tape into short
// segments (~25s each), and POSTs each one here. We forward it to
// OpenAI's transcription endpoint and hand back plain text, which the
// page appends to the running transcript. When the round ends that
// transcript goes to /api/claude exactly like a pasted one, so the whole
// ballot pipeline downstream is unchanged.
//
// WHY NOT THE REALTIME API: a full round is 40-90 minutes of audio. Piping
// that through gpt-realtime audio-in costs dollars per round, and voice is
// already ~80% of per-user variable cost (see soul.md — the free voice cap
// got cut 8 → 2 over exactly this). Segment transcription runs about
// $0.006/minute, so a 45-minute round lands near $0.25. Same product, two
// orders of magnitude cheaper, and it survives a flaky phone connection
// because each segment retries independently.
//
// Auth mirrors argument-lint: App Check (soft unless APP_CHECK_REQUIRED)
// plus layered per-IP caps. Anonymous is allowed on purpose — the whole
// pitch is "put your phone on the table," and a sign-in wall before the
// mic kills that.

import { checkAppCheck } from './lib/appcheck.mjs';
import { resolveCaller } from './lib/caller.mjs';
import { checkLayers } from './lib/rate-limit.mjs';

const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';

// OpenAI caps uploads at 25MB. Our segments are ~25s of Opus (~250KB), so
// anything near the ceiling is not one of our segments.
const MAX_BYTES = 24 * 1024 * 1024;

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://itsdebatable.com',
  'https://www.itsdebatable.com',
  'https://debateai.com',
  'https://www.debateai.com',
];

const DEV_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
];

const isProduction = process.env.CONTEXT === 'production';
const ALLOWED_ORIGINS = isProduction
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
  };
}

// Two layers. A live round sends one segment every ~25s, so a single
// listener sits near 2.4/min — the minute cap only bites on something
// hammering the endpoint. The hour cap bounds a stuck client that never
// stops recording: 400 segments is roughly 2.8 hours of audio per IP.
// Moved onto lib/rate-limit.mjs and keyed by caller on 2026-08-19. The old
// counter was a module-scope Map, so it counted per Netlify isolate rather
// than per caller, and it keyed on an x-forwarded-for read BEFORE the
// Netlify-set address — a client-settable header, so rotating it walked
// straight past the cap. A signed-in user now gets their own, larger budget.
const LAYERS_ANON = [
  { window: 60_000, max: 30, label: 'minute' },
  { window: 3_600_000, max: 400, label: 'hour' },
];
const LAYERS_USER = [
  { window: 60_000, max: 45, label: 'minute' },
  { window: 3_600_000, max: 900, label: 'hour' },
];

// Domain hint. Transcription models guess badly at debate jargon left cold
// ("POI" → "poi", "Opp" → "op", "turn the case" → "turn to case"), and the
// ballot quality downstream depends on the words landing right.
const DEBATE_PROMPT =
  'A competitive debate round. Terms that appear: motion, resolution, '
  + 'Pro, Con, Aff, Neg, Gov, Opp, contention, framework, warrant, impact, '
  + 'weighing, magnitude, probability, timeframe, turn, drop, extend, '
  + 'crossfire, cross-examination, POI, point of information, rebuttal, '
  + 'summary, final focus, whip, prime minister, speaker points, the flow.';

export default async (request) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  try {
    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return new Response(JSON.stringify({
        error: 'App verification failed. Reload the page and try again.',
        code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase(),
      }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const caller = await resolveCaller(request);
    const rate = await checkLayers('transcribe', caller.key, caller.named ? LAYERS_USER : LAYERS_ANON);
    if (!rate.ok) {
      return new Response(JSON.stringify({
        error: 'Too many audio segments. Give it a minute.',
        code: 'RATE_' + String(rate.layer || '').toUpperCase(),
      }), { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      console.error('[transcribe] OPENAI_API_KEY missing');
      return new Response(JSON.stringify({ error: 'Transcription is not configured.' }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Send the audio as multipart/form-data.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const audio = form.get('audio');
    if (!audio || typeof audio === 'string' || !audio.size) {
      return new Response(JSON.stringify({ error: 'No audio segment received.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    if (audio.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'That audio segment is too large.' }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // A segment under ~2KB is silence or a truncated stop. Transcribing it
    // burns a call to hallucinate something out of noise, which is worse
    // than returning nothing — empty text just appends nothing upstream.
    if (audio.size < 2048) {
      return new Response(JSON.stringify({ ok: true, text: '' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ISO-639-1 is what the transcription API takes, so a browser locale
    // ('nl-NL') is narrowed to its base code rather than rejected by the
    // shape test below and silently dropped.
    const lang = String(form.get('language') || '').trim().slice(0, 8).toLowerCase().split('-')[0];

    // The tail of the transcript so far. Transcription models use the
    // prompt for continuity, so feeding back the last couple of sentences
    // keeps names, spellings, and mid-sentence segment seams consistent.
    const carry = String(form.get('carry') || '').trim().slice(-380);

    const upstreamForm = new FormData();
    // OpenAI dispatches on the file extension, so the filename has to match
    // the container the browser actually produced (webm on Chrome/Firefox,
    // mp4 on Safari). The client sends its real mime type through.
    const mime = (audio.type || 'audio/webm').split(';')[0];
    const ext = mime.includes('mp4') || mime.includes('m4a') ? 'mp4'
      : mime.includes('ogg') ? 'ogg'
      : mime.includes('wav') ? 'wav'
      : mime.includes('mpeg') ? 'mp3'
      : 'webm';
    upstreamForm.append('file', audio, 'segment.' + ext);
    upstreamForm.append('model', MODEL);
    upstreamForm.append('response_format', 'text');
    // The domain hint is English, and a prompt in one language over audio
    // in another pulls the transcription toward the prompt's language —
    // it is the mechanism that makes a Dutch speech come back as English
    // words that sound similar. So a declared non-English round keeps the
    // carry (which is already in that language) and drops the hint.
    const hasLang = !!lang && /^[a-z]{2}$/.test(lang);
    const hint = (hasLang && lang !== 'en') ? '' : DEBATE_PROMPT;
    const promptText = [hint, carry ? 'Continuing from: ' + carry : ''].filter(Boolean).join(' ');
    if (promptText) upstreamForm.append('prompt', promptText);
    if (hasLang) upstreamForm.append('language', lang);

    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: upstreamForm,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.warn('[transcribe] openai non-2xx', upstream.status, MODEL, errText.slice(0, 400));
      // Surface the upstream status (never the body) so a failure in
      // production is diagnosable without shipping a debug build. A bare
      // 502 told us nothing when this first went live.
      return new Response(JSON.stringify({
        error: 'Could not transcribe that segment.',
        upstreamStatus: upstream.status,
        model: MODEL,
      }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const text = (await upstream.text() || '').trim();

    return new Response(JSON.stringify({ ok: true, text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (err) {
    console.warn('[transcribe] failed', err?.message);
    return new Response(JSON.stringify({ error: 'Something went wrong transcribing the audio.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
};

export const config = {
  path: '/api/transcribe',
};
