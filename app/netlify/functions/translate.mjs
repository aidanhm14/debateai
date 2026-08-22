// Live caption translation for cross-language human rounds.
//
// Two debaters in a /live-round can now speak different languages. The
// active speaker's browser transcribes them with the Web Speech API in
// THEIR language and publishes the text onto the round doc tagged with
// a language code; the opponent's client sees a language it does not
// read, calls this, and paints translated captions instead.
//
// WHY NOT THE REALTIME API: Realtime is a speech-to-speech model and is
// already what powers the AI opponent. This path is text in, text out
// (the transcript already exists on the round doc), so a small chat
// model is both faster and an order of magnitude cheaper per call. The
// speech never leaves the browser twice.
//
// HARD CONSTRAINT: translate only. The model must not answer, argue,
// summarise, soften or "improve" the speech. A debater's exact claim is
// the thing being judged, so a translation that tidies an argument is a
// scoring bug, not a nicety.

import { checkAppCheck } from './lib/appcheck.mjs';
import { resolveCaller } from './lib/caller.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { callModel, textOf, CHEAP_FAST } from './lib/cheap.mjs';

// Translation of short UI and round strings. gpt-4o-mini was already
// cheap at $0.15/$0.60; the fast tier is $0.06/$0.13. TRANSLATE_MODEL
// overrides, and a gpt-* or claude-* id there routes to that vendor.
const MODEL = process.env.TRANSLATE_MODEL || CHEAP_FAST;
const MAX_INPUT_CHARS = 4000;

// Mirrors REALTIME_LANG_NAMES in realtime-session.mjs so a language is
// either supported everywhere or nowhere.
const LANG_NAMES = {
  en: 'English',   es: 'Spanish',    fr: 'French',   de: 'German',
  pt: 'Portuguese', it: 'Italian',   nl: 'Dutch',    hi: 'Hindi',
  bn: 'Bengali',   ta: 'Tamil',      ur: 'Urdu',     ar: 'Arabic',
  zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian',
  tr: 'Turkish',   id: 'Indonesian', vi: 'Vietnamese', pl: 'Polish',
};

const PRODUCTION_ORIGINS = [
  'https://itsdebatable.com',
  'https://www.itsdebatable.com',
  'https://debateai.com',
  'https://www.debateai.com',
  'https://debateos1.netlify.app',
  'https://www.debateit.live',
];

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allow = PRODUCTION_ORIGINS.includes(origin)
    ? origin
    : (origin.startsWith('http://localhost') ? origin : PRODUCTION_ORIGINS[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const json = (body, status, request) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

// Per-IP throttle. Captions fire every couple of seconds during a live
// speech, so the ceiling is deliberately higher than the brain
// endpoints, but a rotating bot still gets stopped.
// Moved onto lib/rate-limit.mjs and keyed by caller on 2026-08-19, with an
// hour and a day layer added. The old counter had a 60-second window and
// NOTHING above it, so a caller pinned just under 90/min could run all day
// unbounded; it also lived in a module-scope Map, which counts per Netlify
// isolate rather than per caller. Captions fire every couple of seconds
// during a live speech, so the minute ceiling stays deliberately high.
const TRANSLATE_LAYERS_ANON = [
  { window: 60_000, max: 90, label: 'minute' },
  { window: 3_600_000, max: 1200, label: 'hour' },
  { window: 86_400_000, max: 4000, label: 'day' },
];
const TRANSLATE_LAYERS_USER = [
  { window: 60_000, max: 120, label: 'minute' },
  { window: 3_600_000, max: 2400, label: 'hour' },
  { window: 86_400_000, max: 12000, label: 'day' },
];

export default async (request) => {
  // 204 must have a null body. new Response('') throws in undici and the
  // edge turns that into a 502, which is what OPTIONS was returning.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request);

  const caller = await resolveCaller(request);
  const rate = await checkLayers('translate', caller.key, caller.named ? TRANSLATE_LAYERS_USER : TRANSLATE_LAYERS_ANON);
  if (!rate.ok) return json({ error: 'Too many translation requests.', code: 'RATE_' + String(rate.layer || '').toUpperCase() }, 429, request);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400, request); }

  const text = String(body.text || '').slice(0, MAX_INPUT_CHARS).trim();
  const from = String(body.from || '').toLowerCase().slice(0, 5).split('-')[0];
  const to = String(body.to || '').toLowerCase().slice(0, 5).split('-')[0];

  if (!text) return json({ text: '' }, 200, request);
  if (!LANG_NAMES[to]) return json({ error: 'Unsupported target language.' }, 400, request);
  // Same language on both sides means the caller should not have called.
  if (from && from === to) return json({ text, translated: false }, 200, request);

  // Enforce the App Check result (was discarded). Soft-passes until
  // APP_CHECK_REQUIRED=true in prod, so this is a no-op today and real
  // enforcement once App Check is configured; the per-IP limiter above is the
  // gate in the meantime.
  const ac = await checkAppCheck(request).catch(() => ({ ok: true, reason: 'error' }));
  if (!ac.ok) return json({ error: 'App verification failed. Reload and try again.', code: 'APP_CHECK_' + String(ac.reason || '').toUpperCase() }, 401, request);

  // Either key translates: the cheap provider runs it and OpenAI is the
  // declared fallback, so gating on OpenAI alone would switch translation
  // off on a config that can still serve it.
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'Translation is not configured.' }, 503, request);

  const fromName = LANG_NAMES[from] || 'the source language';
  const toName = LANG_NAMES[to];

  const system = [
    `You translate live debate speech from ${fromName} into ${toName}.`,
    'Output ONLY the translation. No preamble, no notes, no quotation marks around the whole thing.',
    'Translate faithfully, including hedges, weak claims and mistakes. Do NOT strengthen, soften, tidy, shorten or complete an argument.',
    'This is a partial live transcript, so it may stop mid-sentence. Translate what is there and stop; do not finish the thought.',
    'Keep debate terminology intact where the target language uses the loanword (motion, POI, rebuttal, speaker points).',
    'Keep names, numbers and cited sources exactly as given.',
  ].join(' ');

  try {
    let data;
    try {
      data = await callModel({
        model: MODEL,
        fallback: 'gpt-4o-mini',
        label: 'translate',
        body: {
          temperature: 0,
          max_tokens: 1200,
          system,
          messages: [{ role: 'user', content: text }],
        },
      });
    } catch (err) {
      console.error('translate upstream error', String(err?.message || err).slice(0, 300));
      // Surface only a generic failure, never the upstream error body: it
      // can leak key/quota/model-access hints. Full detail is logged
      // server-side above.
      return json({ error: 'Translation failed.', upstreamStatus: 502 }, 502, request);
    }

    const out = textOf(data).trim();
    return json({ text: out, translated: true, from, to, model: MODEL }, 200, request);
  } catch (err) {
    console.error('translate error:', err);
    return json({ error: 'Translation failed.' }, 500, request);
  }
};

export const config = {
  path: '/api/translate',
};
