import { randomUUID } from 'node:crypto';
import { cleanSparMatchProfile, POLITICAL_MOTIONS } from './spar-match-profile.mjs';
import { checkContent } from './content-guard.mjs';
import { checkLayers } from './rate-limit.mjs';

export const GENERATION_DEADLINE_MS = 4000;
const MODEL = process.env.SPAR_MOTION_MODEL || 'claude-haiku-4-5-20251001';
const LAYERS = [
  { window: 60_000, max: 8, label: 'min' },
  { window: 3_600_000, max: 40, label: 'hour' },
];
const CONTRASTS = Object.freeze({
  economy: ['Higher taxes on the rich and more spending on public services.', 'Lower taxes and more competition between businesses.'],
  immigration: ['Easier immigration.', 'More selective immigration.'],
  speech: ['More moderation of political speech online.', 'Less moderation of political speech online.'],
  democracy: ['Reforming democratic institutions.', 'Preserving institutional stability.'],
});
const RELEVANCE = {
  economy: /\b(tax(?:es|ing|ation)?|wealth|income|wages?|workers?|employers?|business(?:es)?|companies|markets?|econom(?:y|ic)|government|public spending|subsid(?:y|ies)|ownership|redistribut\w*|inheritance)\b/i,
  immigration: /\b(immigra\w*|migrants?|citizenship|borders?|visas?|refugees?|residency)\b/i,
  speech: /\b(speech|misinformation|disinformation|censorship|censor\w*|social media|platforms?|moderation|moderate|political content)\b/i,
  democracy: /\b(democra\w*|vot(?:e|es|ers|ing)|elections?|electoral|political parties|constitution\w*|institutions?|term limits?|legislatur\w*|parliament\w*|ranked.choice|citizen assemblies)\b/i,
};
const normalizedClaim = (text) => String(text || '').trim().toLowerCase().replace(/[.!]+$/, '');
const BANK_CLAIMS = new Set(Object.values(POLITICAL_MOTIONS).flat().map(normalizedClaim));

// General opposing answers identify a subject, never a person's position on
// the specific policy the model invents. Caller order carries no information.
export function buildMatchMotionContext(mine, theirs, seed = '') {
  const a = cleanSparMatchProfile(mine).stances;
  const b = cleanSparMatchProfile(theirs).stances;
  const opposed = Object.keys(CONTRASTS).filter((key) =>
    a[key] !== 'skip' && b[key] !== 'skip' && a[key] !== b[key]);
  if (!opposed.length) return null;
  let hash = 0x811c9dc5;
  for (const ch of String(seed)) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const issue = opposed[hash % opposed.length];
  return { issue, contrasts: [...CONTRASTS[issue]] };
}

function cleanContext(value) {
  if (!value || !Object.hasOwn(CONTRASTS, value.issue)) return null;
  if (!Array.isArray(value.contrasts)
      || JSON.stringify(value.contrasts) !== JSON.stringify(CONTRASTS[value.issue])) return null;
  return { issue: value.issue, contrasts: [...CONTRASTS[value.issue]] };
}

function safeText(value, max) {
  return typeof value === 'string' && value.length >= 12 && value.length <= max
    && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u2014\u202a-\u202e\u2066-\u2069]/.test(value)
    && !/(?:https?:\/\/|www\.)/i.test(value)
    && checkContent({ text: value, kind: 'motion' }).ok;
}

export function validateGeneratedMotion(value, context) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).sort().join(',') !== 'against,for,motion') {
    return { ok: false, reason: 'malformed_output' };
  }
  if (!safeText(value.motion, 200) || !safeText(value.for, 240) || !safeText(value.against, 240)) {
    return { ok: false, reason: 'unsafe_output' };
  }
  if (/[?!]/.test(value.motion) || /[.;]\s+\S/.test(value.motion)
      || value.motion.split(/\s+/).length < 4
      || value.for.toLowerCase() === value.against.toLowerCase()) {
    return { ok: false, reason: 'malformed_output' };
  }
  if (Object.values(value).some((text) => /\b(you|your|yours|opponents?|participants?|these people|both people|the pair)\b/i.test(text))) {
    return { ok: false, reason: 'attributed_output' };
  }
  if (BANK_CLAIMS.has(normalizedClaim(value.motion))) return { ok: false, reason: 'bank_repeat' };
  const clean = cleanContext(context);
  if (!clean || !RELEVANCE[clean.issue].test(value.motion)) return { ok: false, reason: 'unrelated_output' };
  return { ok: true, motion: value.motion };
}

const SYSTEM = `Write one fresh resolution for a casual one-on-one spoken debate.
The input is one general issue with two explicit opposing questionnaire options.
Neither option establishes what either person believes about a specific policy.
Invent a concrete claim that exposes that disagreement without claiming either
person supports it. Give each side a plausible, distinct reason to argue it.
Return only JSON with exactly three string fields: motion, for, against.
Motion: one declarative sentence, 12 to 200 characters, understandable on a phone.
For and against: one plausible short argument each, 12 to 240 characters each.
Name a concrete actor, policy or tradeoff. Avoid a broad topic, a question, a
bundle of unrelated claims, loaded labels, invented facts, statistics or names.
Do not infer a country, identity, party, skill, ideology or private backstory.
Do not mention the questionnaire, profiles, matching, either person or their views.
No competitive debate jargon, em dashes, markup, links, examples or prefaces.
Never use abortion or reproductive policy, sexual or domestic violence, suicide,
self-harm, child abuse, torture, graphic violence, mass or school shootings,
capital punishment, assisted dying, genocide or ethnic cleansing.
The motion must connect directly to the supplied issue and both general options.
Return the JSON object and nothing else.`;

function publicResult(state) {
  if (state && (state.status === 'generated' || state.status === 'fallback')) {
    return { status: state.status, motion: state.motion || '', reason: state.reason || '' };
  }
  return { status: 'ineligible', motion: '', reason: 'not_prepared' };
}

function eligible(data, uid) {
  return data && data.eligible === true && Array.isArray(data.uids)
    && data.uids.length === 2 && data.uids.includes(uid);
}

function fallbackState(state, reason, now) {
  return {
    status: 'fallback', motion: safeText(state && state.fallback, 200) ? state.fallback : '',
    reason, completedAt: now,
  };
}

// The stamp, context and fallback are server-written in the existing private
// round_drafts doc. This function cannot mint eligibility or accept client text.
// Dependencies are injectable so races and hung providers can be tested offline.
export async function ensurePairMotion(db, room, uid, options = {}) {
  const now = options.now || Date.now;
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const fetcher = options.fetch || fetch;
  const limiter = options.checkLayers || checkLayers;
  const apiKey = options.apiKey === undefined ? process.env.ANTHROPIC_API_KEY : options.apiKey;
  const budget = Math.max(1, Math.min(GENERATION_DEADLINE_MS, options.deadlineMs || GENERATION_DEADLINE_MS));
  if (!/^[A-Za-z0-9-]{1,120}$/.test(String(room || '')) || !uid) return publicResult(null);
  const ref = db.collection('round_drafts').doc(room);
  const claimId = randomUUID();
  let claim;
  try {
    claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      if (!eligible(data, uid)) return { state: null };
      const state = data.motionGeneration;
      if (!state || state.status === 'generated' || state.status === 'fallback') return { state };
      if (state.status === 'running') return { state };
      if (state.status !== 'ready') return { state: null };
      const context = cleanContext(state.context);
      if (!context || !safeText(state.fallback, 200)) {
        const terminal = fallbackState(state, 'invalid_context', now());
        tx.update(ref, { motionGeneration: terminal });
        return { state: terminal };
      }
      const startedAt = now();
      const running = { status: 'running', context, fallback: state.fallback, claimId, startedAt, deadlineAt: startedAt + budget };
      tx.update(ref, { motionGeneration: running });
      return { state: running, owned: true };
    });
  } catch (_) {
    return { status: 'fallback', motion: '', reason: 'storage_unavailable' };
  }
  if (!claim.state || claim.state.status !== 'running') return publicResult(claim.state);

  async function finish(result, expectedClaim) {
    try {
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        if (!eligible(data, uid)) return publicResult(null);
        const state = data.motionGeneration;
        if (!state || state.status !== 'running') return publicResult(state);
        if (state.claimId !== expectedClaim) return publicResult(null);
        const timely = Number.isFinite(state.deadlineAt) && now() < state.deadlineAt;
        const terminal = result.ok && timely
          ? { status: 'generated', motion: result.motion, reason: '', model: MODEL, completedAt: now() }
          : fallbackState(state, timely ? (result.reason || 'provider_error') : 'timeout', now());
        // Replacing the map erases the anonymous contrast and claim together.
        tx.update(ref, { motionGeneration: terminal });
        return publicResult(terminal);
      });
    } catch (_) {
      return { status: 'fallback', motion: claim.state.fallback, reason: 'storage_unavailable' };
    }
  }

  if (!claim.owned) {
    const deadline = Math.min(Number(claim.state.deadlineAt) || now(), now() + budget);
    while (now() < deadline) {
      await delay(Math.min(100, Math.max(1, deadline - now())));
      try {
        const snap = await ref.get();
        const data = snap.exists ? snap.data() : null;
        if (!eligible(data, uid)) return publicResult(null);
        if (data.motionGeneration?.status !== 'running') return publicResult(data.motionGeneration);
      } catch (_) { break; }
    }
    return finish({ ok: false, reason: 'timeout' }, claim.state.claimId);
  }

  const controller = new AbortController();
  let timer;
  const remaining = Math.max(0, claim.state.deadlineAt - now());
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'timeout' });
    }, remaining);
  });
  const generate = async () => {
    if (!apiKey) return { ok: false, reason: 'unconfigured' };
    const callerKey = /^uid_/.test(options.callerKey || '') ? options.callerKey
      : (options.ip ? 'ip_' + options.ip : '');
    if (!callerKey) return { ok: false, reason: 'missing_caller' };
    const allowed = await limiter('sparmotion', callerKey, LAYERS);
    if (!allowed.ok) return { ok: false, reason: 'rate_limited' };
    // A limiter returning after the deadline must never start a provider call.
    if (controller.signal.aborted || now() >= claim.state.deadlineAt) return { ok: false, reason: 'timeout' };
    const response = await fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, temperature: 0.8, system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(claim.state.context) }] }),
    });
    if (!response.ok) return { ok: false, reason: 'provider_error' };
    const body = await response.text();
    if (controller.signal.aborted || now() >= claim.state.deadlineAt) return { ok: false, reason: 'timeout' };
    if (body.length > 16000) return { ok: false, reason: 'malformed_output' };
    let payload, answer;
    try {
      payload = JSON.parse(body);
      if (payload.stop_reason === 'max_tokens') return { ok: false, reason: 'malformed_output' };
      const text = (payload.content || []).filter((part) => part.type === 'text').map((part) => part.text || '').join('').trim();
      // Haiku sometimes wraps its JSON despite the prompt. Accept one complete
      // optional-json fence only; JSON.parse still rejects prose or extra payloads.
      const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```$/i.exec(text);
      answer = JSON.parse(fenced ? fenced[1] : text);
    } catch (_) { return { ok: false, reason: 'malformed_output' }; }
    return validateGeneratedMotion(answer, claim.state.context);
  };
  const result = await Promise.race([generate().catch(() => ({ ok: false, reason: 'provider_error' })), timeout]);
  clearTimeout(timer);
  controller.abort();
  return finish(result, claim.state.claimId);
}
