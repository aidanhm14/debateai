// Shared plumbing for async rounds: recorded speeches traded back and
// forth, judged by the AI ballot when the third turn (or a waiver) lands.
//
// Round shape (Firestore `async_rounds/{id}`, all writes admin-SDK only —
// the collection has no client rules on purpose, so default-deny covers it):
//   state: 'open' | 'awaiting_reply' | 'judging' | 'complete'
//   feedKey: 'open-public' | 'done-public' | 'quiet' (unlisted/hidden)
//   motion, format, visibility: 'public' | 'unlisted'
//   prop: {uid,name,photo}   opp: {uid,name,photo}|null   aiOpp: bool
//   turns: [{n,uid,ai,kind,mediaId,durationSec,transcript|null,name,photo,createdAt}]
//   deadlineAt: ms   sweepAt: ms (deleted when nothing is pending)
//   ballot: {winner,propPoints,oppPoints,rfd,model,at} | null
//   votes: {prop,opp}   reports: n   hidden: bool   replyWaived: bool
// Private subdoc `async_rounds/{id}/private/notify` holds participant
// emails for transactional notifications. Never returned by any GET.
//
// Media lives in Netlify Blobs store 'async-media':
//   m/{id}/meta        JSON {mime,bytes,partCount,uid}
//   m/{id}/p0..pN-1    binary chunks (client slices at ~4MB)

import { getStore } from '@netlify/blobs';

export const TURN_SPEC = {
  1: { who: 'prop', capSec: 95,  label: 'Opening'  },
  2: { who: 'opp',  capSec: 125, label: 'Answer'   },
  3: { who: 'prop', capSec: 65,  label: 'Reply'    },
};

export const ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000; // human window before the AI takes the opp side
export const REPLY_WINDOW_MS  = 24 * 60 * 60 * 1000; // prop reply window before it is waived

export const MAX_PART_BYTES  = 5 * 1024 * 1024;
export const MAX_PARTS       = 8;
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024;   // whisper hard limit is 25MB
export const MAX_OPEN_PER_USER = 5;

export const ALLOWED_MIME = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
  'video/webm', 'video/mp4', 'video/quicktime',
]);

export const FORMATS = new Set(['quick', 'apda', 'bp', 'worlds', 'asian', 'pf', 'ld', 'policy']);
export const FORMAT_NAMES = {
  quick: 'Quick Clash', apda: 'APDA', bp: 'British Parli', worlds: 'Worlds',
  asian: 'Asian Parli', pf: 'Public Forum', ld: 'Lincoln-Douglas', policy: 'Policy',
};

export const FEED_CACHE_KEY = 'async-feed-v1';

// ── AI-opened challenges (board cold-start) ────────────────────────
// The sweep keeps a small inventory of AI-opened challenges on the
// board so a first visitor sees something to answer, never an empty
// feed. Same philosophy as floor-seed's market inventory. Hard-badged
// as AI everywhere; humans take the Opp seat.
export const AI_UID = 'ai';
export const AI_NAME = 'The Debater · AI';
export const AI_MAX_OPEN = 2;        // never more than this many AI challenges at once
export const AI_MIN_BOARD = 3;       // only seed while open-public count is below this
export const AI_CHALLENGE_TTL_MS = 72 * 60 * 60 * 1000; // unanswered AI challenges retire
export const SEED_MOTIONS = [
  { motion: 'This House would ban political parties from accepting corporate donations.', format: 'bp' },
  { motion: 'Social media has done more harm than good to democratic debate.', format: 'quick' },
  { motion: 'This House would make voting compulsory for citizens over eighteen.', format: 'asian' },
  { motion: 'AI art should be eligible for copyright.', format: 'pf' },
  { motion: 'This House would abolish legacy preference in college admissions.', format: 'apda' },
  { motion: 'Cities should make public transit free.', format: 'quick' },
  { motion: 'This House believes exams reward the wrong skills.', format: 'worlds' },
  { motion: 'Justice requires abolishing plea bargaining in criminal cases.', format: 'ld' },
];

export function mediaStore() {
  return getStore('async-media');
}

export function newId(prefix = '') {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 18; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return prefix + s;
}

export function normMime(m) {
  // MediaRecorder reports e.g. "video/webm;codecs=vp8,opus" — key on the bare type.
  return String(m || '').split(';')[0].trim().toLowerCase();
}

export function extFor(mime) {
  return ({ 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'mp4', 'video/mp4': 'mp4',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'video/quicktime': 'mov' })[mime] || 'webm';
}

export async function readMediaMeta(store, id) {
  const raw = await store.get(`m/${id}/meta`, { type: 'json' });
  return raw || null;
}

export async function readMediaBuffer(store, id, meta) {
  const m = meta || await readMediaMeta(store, id);
  if (!m) return null;
  const parts = [];
  for (let i = 0; i < m.partCount; i++) {
    const ab = await store.get(`m/${id}/p${i}`, { type: 'arrayBuffer' });
    if (!ab) return null;
    parts.push(Buffer.from(ab));
  }
  return Buffer.concat(parts);
}

// ── transcription (OpenAI) ─────────────────────────────────────────
export async function transcribe(buffer, mime) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY unset');
  const models = [process.env.ASYNC_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe', 'whisper-1'];
  let lastErr = null;
  for (const model of models) {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mime }), 'turn.' + extFor(mime));
    fd.append('model', model);
    fd.append('response_format', 'json');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
    });
    if (r.ok) {
      const j = await r.json();
      return String(j.text || '').trim();
    }
    lastErr = `${model}: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`;
  }
  throw new Error('transcription failed: ' + lastErr);
}

// ── Claude (ballot + AI opponent speech) ───────────────────────────
export async function claude(system, user, maxTokens, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY unset');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
  const j = await r.json();
  return (j.content || []).map((c) => c.text || '').join('');
}

// ── TTS for the AI opponent turn (OpenAI, same model family as tts.mjs) ──
export async function speechToMp3(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY unset');
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ASYNC_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.ASYNC_TTS_VOICE || 'onyx',
      input: text,
      response_format: 'mp3',
      instructions: 'Varsity debater on the circuit: confident, measured pace, real conviction, no announcer voice.',
    }),
  });
  if (!r.ok) throw new Error('tts ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 160));
  return Buffer.from(await r.arrayBuffer());
}

// ── transactional email (Resend; silent no-op when unconfigured) ───
export async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Debatable <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

export function feedKeyFor(state, visibility, hidden) {
  if (hidden || visibility !== 'public') return 'quiet';
  return state === 'complete' ? 'done-public' : (state === 'open' ? 'open-public' : 'active-public');
}

// Public projection of a round doc. Emails never touch the doc itself;
// uids stay (the client needs them to know which CTA to show).
export function publicRound(id, d) {
  return {
    id,
    state: d.state, motion: d.motion, format: d.format,
    formatName: FORMAT_NAMES[d.format] || d.format,
    visibility: d.visibility, hidden: !!d.hidden,
    prop: d.prop || null, opp: d.opp || null, aiOpp: !!d.aiOpp,
    replyWaived: !!d.replyWaived,
    createdAt: d.createdAt || 0, deadlineAt: d.deadlineAt || 0, completedAt: d.completedAt || 0,
    turns: (d.turns || []).map((t) => ({
      n: t.n, kind: t.kind, mediaId: t.mediaId, durationSec: t.durationSec || 0,
      transcript: t.transcript || null, ai: !!t.ai, name: t.name || '', photo: t.photo || '',
      uid: t.uid || '', createdAt: t.createdAt || 0,
    })),
    ballot: d.ballot || null,
    votes: d.votes || { prop: 0, opp: 0 },
  };
}
