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

const MODEL = process.env.TRANSLATE_MODEL || 'gpt-4o-mini';
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
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 90;

function throttled(ip) {
  const now = Date.now();
  const rec = HITS.get(ip) || { n: 0, reset: now + WINDOW_MS };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + WINDOW_MS; }
  rec.n += 1;
  HITS.set(ip, rec);
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) if (now > v.reset) HITS.delete(k);
  }
  return rec.n > MAX_PER_WINDOW;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request);

  const ip = request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown';
  if (throttled(ip)) return json({ error: 'Too many translation requests.' }, 429, request);

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

  await checkAppCheck(request).catch(() => {});

  const key = process.env.OPENAI_API_KEY;
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('translate upstream error', res.status, detail.slice(0, 300));
      return json({ error: 'Translation failed.' }, 502, request);
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || '';
    return json({ text: out, translated: true, from, to, model: MODEL }, 200, request);
  } catch (err) {
    console.error('translate error:', err);
    return json({ error: 'Translation failed.' }, 500, request);
  }
};

export const config = {
  path: '/api/translate',
};
