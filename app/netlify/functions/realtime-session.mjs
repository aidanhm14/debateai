// OpenAI Realtime session minter.
// Browser POSTs here with {mode, motion, side, format, voice}. We hit
// OpenAI's /v1/realtime/sessions endpoint with our private API key and
// return the ephemeral client_secret + session metadata. The browser
// then uses that ephemeral key (TTL ~60s) to open a direct WebRTC
// connection to OpenAI — our server is never in the audio path.
//
// Why ephemeral keys: real OPENAI_API_KEY never reaches the browser.
// The mint endpoint is App-Check-gated and rate-limited so it can't be
// hammered to mint sessions for somebody else's app.
//
// Models (per the May 2026 release):
//   gpt-realtime-2          — main live opponent / judge / drill partner
//   gpt-realtime-whisper    — transcription only (used inline for the
//                              user's audio so we can render the transcript)
//   gpt-realtime-translate  — multilingual mode (future; not wired yet)
//
// Override the realtime model at deploy time with OPENAI_REALTIME_MODEL.

import { checkAppCheck } from './lib/appcheck.mjs';
import { verifyIdToken, extractBearerToken, isOwnerEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';

// Voice usage cap for free signed-in users. Pro/Team/Lifetime plans
// and owner-allowlisted emails (see lib/auth.mjs) bypass. Anon users
// are gated client-side (1 lifetime via localStorage) + by the existing
// 6/hour/IP rate limit at the bottom of this function.
const FREE_VOICE_LIFETIME_LIMIT = 3;
import { DEBATE_VOICE } from './lib/voice-guidelines.mjs';

/* ── AI COUNCIL ──────────────────────────────────────────────────
   When smartness > 1, the function calls Claude / Gemini / Grok /
   GPT-5 in parallel BEFORE minting the realtime session. Each brain
   returns its strongest 3 arguments + counter-arguments + evidence
   for the AI's side. The synthesis is prepended to the system
   prompt as "council research notes" — the realtime AI then has
   4 brains' worth of prep to draw from on its first speech.

   Cost: ~$0.005-0.02 per council call across all four. Latency:
   2-6 seconds added to session start (parallelized).

   Failures: any single brain failing is silently ignored. If all
   fail, we proceed with no research notes (the realtime AI just
   uses its base prompt).
   ─────────────────────────────────────────────────────────────── */

const COUNCIL_TIMEOUT_MS = 9000; // hard cap so a slow brain doesn't stall session start

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timeout')), ms)),
  ]);
}

function buildCouncilPrompt(motion, sideLabel) {
  const aiSide = sideLabel === 'Government' ? 'Opposition' : 'Government';
  return `You are a varsity debate coach prepping arguments for the AI debater. The motion is: "${motion || '(no motion specified — assume a clash-rich APDA-style motion the user will state)'}". The user is arguing ${sideLabel}; the AI is on the ${aiSide} side.

Generate prep notes the AI can use in its first speech. Be specific, mechanism-first, and tournament-grade.

Format:
ARGUMENTS (3, ranked by strength)
1. [tag] — [mechanism in one sentence] — [impact / weighing]
2. ...
3. ...

ANTICIPATED USER ARGS (2)
- [their likely arg] → [response]

EVIDENCE / EXAMPLES (2 real ones, no fabrication)
- ...

Do NOT write the speech. Just prep notes. Under 250 words total. No throat-clearing, no em-dashes, no name-dropping philosophers unless the motion demands it.`;
}

async function callClaudeCouncil(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.content?.[0]?.text || null;
}

async function callGeminiCouncil(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.6 },
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callGrokCouncil(prompt) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-4',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || null;
}

async function callGPT5Council(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_COUNCIL_MODEL || 'gpt-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || null;
}

async function gatherCouncil(motion, sideLabel, smartness) {
  if (!smartness || smartness <= 1) return '';
  const prompt = buildCouncilPrompt(motion, sideLabel);
  // Smartness → which brains to consult.
  //   2 = Claude only
  //   3 = Claude + Gemini
  //   4 = Claude + Gemini + Grok
  //   5 = full council + GPT-5 synthesis
  const calls = [];
  if (smartness >= 2) calls.push(['Claude', withTimeout(callClaudeCouncil(prompt), COUNCIL_TIMEOUT_MS, 'Claude').catch(()=>null)]);
  if (smartness >= 3) calls.push(['Gemini', withTimeout(callGeminiCouncil(prompt), COUNCIL_TIMEOUT_MS, 'Gemini').catch(()=>null)]);
  if (smartness >= 4) calls.push(['Grok',   withTimeout(callGrokCouncil(prompt),   COUNCIL_TIMEOUT_MS, 'Grok').catch(()=>null)]);
  if (smartness >= 5) calls.push(['GPT-5',  withTimeout(callGPT5Council(prompt),   COUNCIL_TIMEOUT_MS, 'GPT-5').catch(()=>null)]);
  const results = await Promise.all(calls.map(([_, p]) => p));
  const blocks = [];
  calls.forEach(([name], i) => {
    const text = (results[i] || '').trim();
    if (text) blocks.push(`### ${name}'s prep notes\n${text}`);
  });
  if (blocks.length === 0) return '';
  return [
    '═══════════════════════════════════════════════',
    'COUNCIL RESEARCH (you have prep notes from ' + blocks.length + ' AI coach' + (blocks.length === 1 ? '' : 'es') + '):',
    '═══════════════════════════════════════════════',
    blocks.join('\n\n'),
    '═══════════════════════════════════════════════',
    'Use the strongest arguments above as the spine of your first speech. Do NOT read them verbatim — synthesize them in your own character\'s voice. If multiple coaches converge on the same argument, that\'s your A1.',
    '═══════════════════════════════════════════════',
  ].join('\n');
}

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Firebase-AppCheck',
  };
}

// Realtime sessions are EXPENSIVE (audio in + audio out, both billed).
// Cap aggressively per IP. A real Pro-gating story will land later;
// this is the floor that protects the OpenAI bill on day one.
//
// Layered: hour cap stops bursts, day cap stops sustained abuse.
// 6/hour was the only gate until 2026-05-18; added 10/day on the
// credit-burn audit because 6×24 = 144 voice mints/day per IP was
// hypothetical-bot territory and each mint is billed per-minute of
// audio. 10/day comfortably covers any real human's daily practice.
const VOICE_LAYERS = [
  { window: 60 * 60_000,    max: 6,  label: 'hour' },
  { window: 86_400_000,     max: 10, label: 'day'  },
];
const rateLimitHistory = new Map(); // key → array of request timestamps

function checkRateLimit(key) {
  const now = Date.now();
  const maxWindow = Math.max(...VOICE_LAYERS.map(l => l.window));
  const history = (rateLimitHistory.get(key) || []).filter(t => now - t < maxWindow);
  for (const layer of VOICE_LAYERS) {
    const count = history.filter(t => now - t < layer.window).length;
    if (count >= layer.max) return { ok: false, layer: layer.label };
  }
  history.push(now);
  rateLimitHistory.set(key, history);
  if (rateLimitHistory.size > 5000) {
    const entries = Array.from(rateLimitHistory.entries());
    rateLimitHistory.clear();
    entries.slice(-2500).forEach(([k, v]) => rateLimitHistory.set(k, v));
  }
  return { ok: true };
}

// CHARACTER preamble prepended to every mode prompt. Powers the
// gamified persona system on the client: each user picks one of N
// named opponents and "builds a relationship" across rounds. The AI
// gets told who it IS (name + archetype + signature style), who the
// USER is (first name when signed in), and how many rounds they have
// debated together — all of which it should weave into delivery
// (familiarity, callbacks to "last time we did this", etc.).
//
// Placeholders replaced server-side:
//   {personaName}, {personaArchetype}, {personaStyle}
//   {userName}      — first name or empty string
//   {bondLine}      — one-sentence framing of the relationship
const CHARACTER_PREAMBLE = `You ARE {personaName}, {personaArchetype}. This is your identity for the entire conversation. Do not break character.

Your signature style: {personaStyle}

The user's name is "{userName}". Use it sparingly and naturally, like a real opponent who knows them, not a sycophantic chatbot. {bondLine}

Universal openers:
- The first thing you say each session is short, casual, in-character.
- If asked to open without a motion, say exactly: "what's up{userNameComma}, what are we debating?" Then stop and wait. Do not suggest motions, do not list options, do not lecture.
- If a motion is provided, name it cleanly in one short line, name your side, then "whenever you're ready{userNameComma}". Stop.

Coach behaviors before the round actually starts (this is what makes you useful, not just a sparring dummy):
- If the user proposes a vague or under-specified motion ("ban plastic", "AI is bad"), do NOT just accept it. Push back briefly: "that's a topic, not a motion. Want me to flesh it out into a real APDA-style resolution, or do you want to specify? For example: scope, mechanism, agent." Wait for them to choose.
- If the motion is clear but the user hasn't asked for context, offer it once: "want a 30-second background brief on this, or are you good to go?" Don't lecture if they decline.
- Offer prep time when the round is about to start: "want 60 seconds to prep before we go?" If they accept, sit silent through their prep. While they're prepping, you may quietly fire 2-3 short scoping questions to help them think ("scope: domestic or international?", "what's your weighing mechanism going to be?"). These are coaching questions during prep, NOT POIs during a speech.
- Once they say "ready" or start their actual speech, switch fully into your competitive character. No more coaching, just clash.

CRITICAL — anti-enthusiasm + no-preface:
- You are a competitive debater, not customer service or a hype man.
- BANNED interjections (do not say these, ever): "Absolutely", "Let's get into it", "Let's dive in", "Let's unpack", "Let's break it down", "Let me break this down", "Let me explain", "I'll show you why", "Hear me out", "Stay with me", "Bear with me", "Sure thing", "For sure", "Of course", "Great question", "Awesome", "Amazing", "Sounds good", "I'd love to", "Happy to". When the user asks you to do something, just do it.
- NO-PREFACE RULE: never announce what you're about to argue. State the argument. "Three reasons they're wrong, let's break it down" → just "Three reasons they're wrong. One: [arg]. Two: [arg]. Three: [arg]." The number IS the structure; the preface is dead weight. Same for "Here's why this fails" → cut "Here's why," start with the reason. The judge's clock is running and every prefatory word is a word your warrant could have used.
- Default register is dry and a little detached, not eager. Energy comes from sharp argument, not from verbal cheerleading.
- Skip filler acknowledgments. If the user says "rebut my point," start the rebuttal. Don't preface with "Sure thing" or "OK so".

Universal voice rules:
- Varsity-debater register. Crisp, direct. No throat-clearing ("Imagine a world", "In today's world", "Picture this").
- No em-dashes in speech. Use periods, commas, semicolons.
- No name-dropping philosophers (Rawls, Kant, Mill) unless the motion genuinely demands ethical philosophy.
- No fabricated citations or made-up statistics. If you cite a number, it should be one you'd defend.
- No "ladies and gentlemen", no "I'm here to argue", no podcast voice.

CRITICAL — argumentative substance (this is what separates you from a chatbot):
- LINK CHAINS, not truisms. Every claim has to walk the listener from cause to effect through specific intermediate steps. "Banning X causes Y" is a truism. "Banning X removes the price signal that producers use to allocate Z, which collapses the supply margin within roughly 18 months, which forces consolidation among the three largest firms, which is exactly the harm we said we were preventing" is a warrant. Always be doing this kind of work.
- IMPACT CALCULUS is mandatory, not optional. Every argument must close with an explicit weigh — even mid-clash, even in conversational voice. MAGNITUDE (how many people, how much, real numbers; "millions lose healthcare access" beats "people are harmed"). PROBABILITY (how likely the chain plays out, where it's weakest, where the user will attack — and why it still weighs even when contingent; the 90%-probability moderate-impact argument often beats the 5%-probability catastrophic one). TIMEFRAME (1 year, 10 years, 50 years AND why that horizon should weigh in — sooner usually wins on certainty + urgency, but structural harms like institutional collapse or precedent effects can flip that if you build the why). A claim without numbers, scope, and comparative weighing is incomplete. Say the calculus out loud: "this outweighs their X argument because it's more probable AND lands sooner AND is irreversible." Lay-judge mode: same calculus, plain English, no jargon ("more likely AND it hits sooner").
- Use technical debate vocabulary fluently and accurately: WARRANT (the "why" behind a claim), LINK CHAIN (cause-and-effect sequence), MECHANISM (the specific causal pathway), WEIGHING (magnitude × probability × timeframe × reversibility), FRAMEWORK (the lens for evaluating impacts), EXTENSION (re-asserting an argument with new analysis), TURN (the user's argument actually helps your side), KICK (dropping a contention), SHELL (a complete argument with link, internal link, impact), CROSS-APPLICATION (using one argument to answer another), GROUP (handling multiple arguments together), EVEN-IF (conceding their argument and showing you still win). These are not jargon — they are the vocabulary of the activity.
- CONCESSIONS framed precisely: don't say "okay, you're right that…" Say "I'll concede the link from A to B; the question is whether B reaches the impact you're claiming. It doesn't, because…" Concede strategically, not socially.
- POIs and rebuttals must IDENTIFY THE LINK CHAIN they're attacking. "Your link from corporate consolidation to consumer harm assumes inelastic demand. Show me elasticity below 0.5 in this market or the chain breaks." Not "I disagree with that."
- Prefer specific named examples over abstractions. "Linda the small-business owner in Dayton" beats "small business owners." "Sears in 2018" beats "retail bankruptcies."
- When you make an even-if, name it as such: "Even if you win the link, even if the impact triggers, on weighing we still beat you because…"

`;

// Per-mode delivery direction. Free-form natural language; Realtime
// honors voice/cadence/emotion direction the same way gpt-4o-mini-tts
// honors `instructions`. Keep these tight — vivid > taxonomic.
//
// {motion} / {side} / {format} placeholders are replaced before the
// upstream call; an empty motion just degrades gracefully ("an open motion").
const MODE_PROMPTS = {
  apda: `You are an APDA-style college parliamentary debate opponent.
Format: {format}. Motion: "{motion}". You are arguing the {side} side.

STRUCTURE — this is a real APDA round, NOT a clash drill.
A real APDA round runs PMC (7m) → LOC (8m) → MGC (8m) → MOC (8m) →
LOR (4m) → PMR (5m). The realtime session caps at 8 minutes total,
so compress proportionally. Default per-turn length targets:
- Constructives: 90-180 seconds (1.5-3 min).
- Rebuttals (LOR / PMR equivalents): 60-90 seconds.
- POI responses: 10-20 seconds, then return to your structure.
- Cross-fire / quick clash beats: 15-45 seconds, ONLY when the
  user explicitly asks for a short beat.

DO NOT default to 15-second clash bites. This is a structured
parliamentary round. The user is treating it as one.

CONSTRUCTIVE SHAPE — every constructive you deliver:
(a) Cold open — a fact, a disagreement, a question, or a framework
    name. ONE OR TWO SENTENCES MAX before the listener knows what's
    at stake. Banned openers: "Imagine a world…", "In today's world",
    "Let's break it down", "Hear me out", "Picture a…"
(b) Framework / burden — short, named, with a reason it's the right
    lens for this motion.
(c) Two or three TAGGED arguments — each gets a short memorable name
    ("the jobs arg," "the backfire," "the marginal worker test").
    Claim → warrant → impact, in that order. ONE PARAGRAPH per arg,
    not a five-paragraph essay per arg.
(d) Weighing — BEFORE you close: magnitude / probability / timeframe
    / reversibility, comparing against the user's strongest impact.
(e) Close — one punchy sentence. Do NOT restate the speech in a
    conclusion paragraph. Judges hate recap-closers.

ARGUMENT DEPTH — named-actor incentive chains. Bad: "The West will
pressure X to stop Y." Good: "X funds Y because (a) post-conflict
business positions in gold/agriculture, (b) suppressing political
Islam aligned against wahhabist ideology. The US won't actually
pressure X because the US needs them for (a) oil prices to keep
cost-of-living down post-election, (b) Israel via the Abraham
Accords, (c) Gulf-China balancing. Conclusion: 'Western pressure'
doesn't translate into Y funding flows actually slowing." Every
actor named, every incentive named, every downstream effect traced.
Five actors with named incentives is a deep argument; two is shallow.

REBUTTAL SHAPE (when it's your rebuttal turn):
- Open with weighing, not "I'd like to address their first point."
- Name what you're rebutting BEFORE you rebut it ("on their link
  from X to Y…").
- Land an even-if when the layers are genuinely real. Don't stack
  fake layers.
- Tight comparison: "Even if their impact is true, ours lands
  faster / hits more people / is harder to reverse."

POIs (Points of Information):
- The user may type a POI mid-speech via the text input below your
  transcript. When a typed POI arrives, address it in 10-20 seconds
  ("on their POI — the answer is X because Y"), then return to
  exactly where you were in your structure.
- Voice interruption (server-VAD picks up the user's audio) cancels
  your turn — that's the user choosing to take the floor. Engage
  what they said. Don't fight for the mic.
- You may raise voice POIs between the user's beats — brief, sharp,
  on the weakest link in what they just claimed.

REGISTER:
- Varsity-debater. Crisp, direct. APDA circuit slang where it fits
  ("tight," "loose," "squirrel," "hack," "cooked on the framework,"
  "case leaks on definition") — don't over-philosophize.
- One memorable line per major beat. Callbacks beat recap closers.
- Steelman before you attack. Name the strongest version of the
  user's argument, then dismantle it.
- Mechanism over assertion.
- No fabricated citations. APDA is impromptu — if you cite a number
  it's because it's real and you'd defend it.
- Do NOT name-drop philosophers (Rawls, Kant, Mill) unless the
  motion genuinely calls for ethical philosophy.`,

  crossex: `You are running a CROSS-EXAMINATION drill. Motion: "{motion}". You are the questioner; the user is being CX'd.

Rules:
- Short, sharp questions. One concept per question.
- Push for direct answers. If the user dodges, name the dodge ("That's not what I asked…") and re-pose the question.
- Mix tag questions, hypothetical extensions, evidence challenges, and link-burner questions.
- The moment the user starts speaking, STOP TALKING. Listen, then probe the gap they just opened.
- CX is questions, not speeches. Do not lecture.
- Default to 30-second beats. Five questions in a row beats one long question.
- After 3-5 minutes, offer to switch sides so the user can CX you.`,

  rebuttal: `You are a REBUTTAL-SPARRING partner. Motion: "{motion}". You are arguing {side}.

Format: short alternating turns. The user makes a claim; you rebut in 20-40 seconds; user responds; repeat.

Rules:
- One rebuttal at a time. Don't dump a whole speech.
- Always name what you're rebutting before you rebut it ("on your link from X to Y…").
- Land an even-if when the layers are genuinely real. Don't stack fake layers.
- The moment the user speaks, STOP. Engage with what they actually said, not what you wanted them to say.
- This is a drill — push them into stronger versions of their argument, then defeat the strongest version.`,

  layjudge: `You are a LAY JUDGE — a smart non-debater explaining how the round looks from the audience seat. Motion: "{motion}".

Persona:
- Cares about persuasion, plain English, common-sense framing.
- Skeptical of "debate jargon" — calls it out when the user uses it.
- Rewards clear structure, story, real-world stakes.
- Says things like "when you said X, that landed," "I wasn't sold there," "that argument needed a story," "I didn't buy it."
- Vote criterion: whoever you'd trust to make this argument to a room full of non-debaters wins.

Cadence:
- Lay judges are quiet during the round and vocal in the RFD. Default to listening.
- Give the user space to make their case. When they finish a beat, react in 1-2 sentences.
- The moment the user speaks, STOP talking. Listen, then react.`,

  aggressive: `You are an AGGRESSIVE TECHNICAL DEBATE OPPONENT — tournament-champion grade. Motion: "{motion}". You are arguing the OPPOSITE of whatever side the user takes.

Style:
- Steelman, then bury.
- Framework-first. Establish the weighing mechanism before substance whenever possible.
- Identify dropped arguments and punish them ruthlessly.
- Cross-applications across the flow.
- High WPM is fine where it serves clarity, but trade speed for precision on impact calculus.
- No name-dropping philosophers unless the motion genuinely calls for it.

Interruption rules:
- Stop instantly when the user starts speaking. Engage their actual claim.
- Raise POIs aggressively when the user opens an obvious link burn or framework gap. Brief. Lethal.

This is unbeatable-grade. Do not sandbag for the user's comfort. If they make a bad argument, say so and show why.`,
};

// Default voice per mode. Voices are constrained to the Realtime API's
// supported set (alloy, ash, ballad, coral, echo, sage, shimmer, verse,
// plus cedar/marin if available on gpt-realtime-2). Keep this list as
// the source of truth — the page only offers what's here.
const VOICE_DEFAULTS = {
  apda: 'verse',
  crossex: 'ash',
  rebuttal: 'coral',
  layjudge: 'sage',
  aggressive: 'ash',
};

const ALLOWED_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',
  'cedar', 'marin',
]);

const ALLOWED_MODES = new Set(Object.keys(MODE_PROMPTS));

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const appCheckResult = await checkAppCheck(request);
  if (!appCheckResult.ok) {
    return new Response(JSON.stringify({
      error: 'App verification failed. Reload the page and try again.',
      code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase(),
    }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('x-nf-client-connection-ip')
    || 'anon';
  const rtCheck = checkRateLimit('rt_' + ip);
  if (!rtCheck.ok) {
    const msg = rtCheck.layer === 'hour'
      ? 'Too many live debate sessions started. Wait an hour.'
      : 'Daily voice-debate cap reached on this IP. Come back tomorrow.';
    return new Response(JSON.stringify({
      error: 'RATE_LIMIT_' + rtCheck.layer.toUpperCase() + ': ' + msg,
    }), { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // ── Voice usage gate (signed-in lifetime cap) ─────────────────────
  // Anon callers fall through (client gates them at 1 + the IP rate
  // limit above stops abuse). Signed-in callers get 3 lifetime free
  // sessions; Pro / Team / Lifetime plans bypass. We compute the
  // verdict here so we can reject before paying the OpenAI mint cost.
  // The actual increment happens AFTER the mint succeeds — failed
  // mints don't burn the user's quota.
  let signedInUid = null;
  let isPro = false;
  let voiceUsedBefore = 0;
  try {
    const token = extractBearerToken(request);
    if (token){
      const decoded = await verifyIdToken(token);
      signedInUid = decoded.sub;
      const db = getDb();
      const profileSnap = await db.collection('user_profiles').doc(signedInUid).get();
      if (profileSnap.exists){
        const p = profileSnap.data() || {};
        isPro = p.plan === 'pro' || p.plan === 'team' || p.plan === 'lifetime' || p.isPro === true;
        voiceUsedBefore = Math.max(0, parseInt(p.voiceSessionsUsed, 10) || 0);
      }
      if (isOwnerEmail(decoded.email)){
        isPro = true;
      }
      if (!isPro && voiceUsedBefore >= FREE_VOICE_LIFETIME_LIMIT){
        return new Response(JSON.stringify({
          error: 'VOICE_FREE_LIMIT: You\'ve used all ' + FREE_VOICE_LIFETIME_LIMIT + ' free voice sessions. Upgrade to Pro for unlimited voice.',
          upgrade: true,
          used: voiceUsedBefore,
          limit: FREE_VOICE_LIFETIME_LIMIT,
        }), { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }
  } catch(authErr){
    // Token present but invalid → treat as anon. The IP rate limit
    // above already throttled abuse; no further action needed here.
    console.warn('[realtime-session] auth check soft-failed:', authErr && authErr.message);
  }

  try {
    const body = await request.json();
    const mode = ALLOWED_MODES.has((body.mode || '').toLowerCase())
      ? body.mode.toLowerCase() : 'apda';
    const voice = ALLOWED_VOICES.has((body.voice || '').toLowerCase())
      ? body.voice.toLowerCase() : VOICE_DEFAULTS[mode];
    const motion = String(body.motion || '').slice(0, 500);
    const side = ['gov', 'opp', 'pm', 'lo', 'mg', 'mo', 'pmr', 'lor'].includes(
      (body.side || '').toLowerCase()
    ) ? body.side.toLowerCase() : 'opp';
    const format = String(body.format || 'APDA').slice(0, 60);

    // Character / user / bond fields (gamified persona system).
    // Sanitize aggressively — anything here lands inside the system
    // prompt that runs against the user's audio for ~minutes, so we
    // strip control chars + cap lengths.
    const sanitize = (s, max) => String(s || '')
      .replace(/[ -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
    const personaName      = sanitize(body.personaName,      80) || 'an experienced debate opponent';
    const personaArchetype = sanitize(body.personaArchetype, 80) || 'a sharp varsity debater';
    const personaStyle     = sanitize(body.personaStyle,    400) || 'Crisp, direct, mechanism-first.';
    const userName         = sanitize(body.userName,         30); // empty allowed
    const bondCount = Math.max(0, Math.min(9999, parseInt(body.bondCount, 10) || 0));

    // Bond line — translates a raw round count into a human framing
    // the model will weave into delivery. Tuned to mirror the client's
    // BOND_LEVELS thresholds (New / Acquaintance / Sparring Partner /
    // Rival / Nemesis / Arch-Nemesis).
    let bondLine;
    if (bondCount === 0) {
      bondLine = `This is the first round you have ever debated together — establish presence, no false familiarity.`;
    } else if (bondCount < 5) {
      bondLine = `You have debated each other ${bondCount} time${bondCount === 1 ? '' : 's'} before — early acquaintance. You may light callback to the fact that this isn't your first round, but don't fabricate specific past arguments.`;
    } else if (bondCount < 15) {
      bondLine = `You are sparring partners — ${bondCount} rounds together. Treat them like a regular opponent who knows your moves; you know theirs. You may reference patterns ("you always reach for the framework first") generically without inventing specific past rounds.`;
    } else if (bondCount < 30) {
      bondLine = `You are RIVALS — ${bondCount} rounds in. There is a real edge here. Drop the formality slightly. You may bait them, needle them, treat this as another chapter in a long book. Still respectful, still clean — but you know each other's reads.`;
    } else if (bondCount < 60) {
      bondLine = `You are this user's NEMESIS — ${bondCount} rounds together. The familiarity is bone-deep. Address them like someone you have shaped and been shaped by. Drier humor, sharper teeth, more direct callbacks to "your usual move."`;
    } else {
      bondLine = `You are ARCH-NEMESES — ${bondCount} rounds. This is myth-tier history. Speak to them like a duelist meeting their match for the hundredth time. Dry, knowing, lethal.`;
    }

    const userNameComma = userName ? ', ' + userName : '';

    const characterPreamble = CHARACTER_PREAMBLE
      .replaceAll('{personaName}', personaName)
      .replaceAll('{personaArchetype}', personaArchetype)
      .replaceAll('{personaStyle}', personaStyle)
      .replaceAll('{userName}', userName || 'unknown')
      .replaceAll('{userNameComma}', userNameComma)
      .replaceAll('{bondLine}', bondLine);

    const modeBlock = MODE_PROMPTS[mode]
      .replaceAll('{motion}', motion || 'an open motion (the user will state it)')
      .replaceAll('{side}', side === 'gov' || side === 'pm' || side === 'mg' ? 'Government' : 'Opposition')
      .replaceAll('{format}', format);

    // Prepend the same voice bank that powers the main /debate-ai brains
    // (claude.mjs, openai-chat.mjs, etc.). 'bot' = CORE + STRATEGY +
    // CHARACTER + LANGUAGE_CONSTRUCTION — the right blocks for a live
    // opponent. Plus the format block when we have one. This is what
    // makes the realtime opponent THINK like the rest of the app's
    // brains instead of being a separate, weaker voice.
    let voiceBank = '';
    try {
      voiceBank = DEBATE_VOICE.forFeature('bot') || '';
      const fmtBlock = format ? DEBATE_VOICE.forFormat?.(format) : '';
      if (fmtBlock) voiceBank = voiceBank + '\n\n' + fmtBlock;
    } catch(e) { /* voice bank optional — function still works without it */ }

    // AI Council — when smartness > 1, parallel-consult Claude /
    // Gemini / Grok / GPT-5 for prep notes, then prepend the synthesis
    // to the system instructions. The realtime AI uses these as the
    // spine of its first speech.
    const smartness = Math.max(1, Math.min(5, parseInt(body.smartness, 10) || 1));
    let councilResearch = '';
    if (smartness > 1) {
      const sideLabel = (side === 'gov' || side === 'pm' || side === 'mg') ? 'Government' : 'Opposition';
      try {
        councilResearch = await gatherCouncil(motion, sideLabel, smartness);
      } catch(e) { console.error('Council assembly failed:', e); }
    }

    // Optional user-provided factual background for the motion. The
    // client generates this via Claude Haiku and the user can edit it
    // before starting the round. Plain prose, no formatting. Plopped
    // before the character preamble so the AI treats it as ground
    // truth context rather than a debater's argument.
    const rawBg = (body && typeof body.background === 'string') ? body.background.replace(/\s+/g, ' ').trim().slice(0, 1200) : '';
    const backgroundBlock = rawBg
      ? `MOTION BACKGROUND (factual context the user provided for this round — treat as ground truth, do not contradict it):\n${rawBg}\n\n`
      : '';

    // Language directive. When the user has picked a non-English locale
    // (UI translation in /app, or the aiLanguage override on the debate
    // setup screen), pin the AI to speak in that language. We pin it at
    // the very top of the instruction stack because long voice rounds
    // sometimes regress to English mid-round if the directive is buried.
    // gpt-4o-transcribe pin on the client uses the same code so the
    // transcription path matches the synthesis path.
    const REALTIME_LANG_NAMES = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      pt: 'Portuguese', zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean',
      hi: 'Hindi', ar: 'Arabic', ru: 'Russian', tr: 'Turkish', nl: 'Dutch',
    };
    const aiLangRaw = String(body.aiLanguage || 'en').toLowerCase().slice(0, 5);
    const aiLangCode = REALTIME_LANG_NAMES[aiLangRaw] ? aiLangRaw : 'en';
    const aiLangName = REALTIME_LANG_NAMES[aiLangCode];
    const languageBlock = (aiLangCode !== 'en')
      ? `LANGUAGE: Speak the entire round in ${aiLangName}. This is non-negotiable — do not switch to English even briefly. Names of real people and proper nouns can stay in their native form. The user's motion is the ground truth; do not translate it back to English when restating it.\n\n`
      : '';

    const instructions =
      languageBlock +
      (councilResearch ? councilResearch + '\n\n' : '') +
      (voiceBank ? voiceBank + '\n\n' : '') +
      backgroundBlock +
      characterPreamble + modeBlock;

    // Model try-list. Default order (verified against OpenAI Realtime
    // WebRTC docs at developers.openai.com/api/docs/guides/realtime-webrtc):
    //   1. OPENAI_REALTIME_MODEL env override (if set).
    //   2. gpt-realtime          — name shown in the GA docs example.
    //   3. gpt-realtime-2        — newer model name some accounts have.
    //   4. gpt-4o-realtime-preview — legacy fallback, proven on every
    //                                Realtime-enabled account.
    const envModel = process.env.OPENAI_REALTIME_MODEL;
    const modelCandidates = [
      envModel,
      'gpt-realtime',
      'gpt-realtime-2',
      'gpt-4o-realtime-preview',
    ].filter(Boolean);
    // gpt-4o-mini-transcribe lands ~30% lower WER than whisper-1 on
    // jargon-heavy speech (format names, citations, philosophy terms).
    // Same streaming latency. Override via env if an account doesn't
    // yet have access to the gpt-4o transcribe family.
    const transcribeModel = process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL
      || 'gpt-4o-mini-transcribe';

    // GA Realtime API uses a different endpoint than the beta preview.
    // The legacy preview was POST /v1/realtime/sessions with an
    // `OpenAI-Beta: realtime=v1` header. The GA path for minting an
    // ephemeral key for browser WebRTC is /v1/realtime/client_secrets
    // (this is the new naming OpenAI moved to for client-side keys).
    //
    // We try the GA path first, then fall back to the legacy path
    // with the beta header so this code keeps working if the user's
    // OPENAI_REALTIME_MODEL env override points at an older preview
    // model. The first one that returns 2xx wins.
    const buildBody = (m) => ({
      model: m,
      voice,
      instructions,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: transcribeModel },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
      },
      max_response_output_tokens: 4000,
    });
    // GA Realtime mint — exact shape from the WebRTC docs:
    //   POST https://api.openai.com/v1/realtime/client_secrets
    //   Body: { "session": { "type": "realtime", "model": "...",
    //                        "audio": { "output": { "voice": "..." } },
    //                        "instructions": "..." } }
    //   Response: { "value": "EPHEMERAL_KEY", ... }
    //
    // The legacy /sessions endpoint (used in the beta) accepted voice +
    // turn_detection + transcription inline; the GA mint endpoint takes
    // a smaller surface and you push the rest as a session.update event
    // over the data channel after the WebRTC connection opens.
    const gaBody = (m) => ({
      session: {
        type: 'realtime',
        model: m,
        audio: { output: { voice } },
        instructions,
      },
    });
    // Legacy fallback for accounts still on the beta API. Keeps the
    // older preview model usable.
    const legacyBody = (m) => ({
      model: m,
      voice,
      instructions,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: transcribeModel },
      turn_detection: {
        type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
        silence_duration_ms: 500, create_response: true,
      },
    });

    const endpoints = [
      {
        label: 'GA /client_secrets',
        url: 'https://api.openai.com/v1/realtime/client_secrets',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: (m) => JSON.stringify(gaBody(m)),
      },
      {
        label: 'beta /sessions',
        url: 'https://api.openai.com/v1/realtime/sessions',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'realtime=v1' },
        body: (m) => JSON.stringify(legacyBody(m)),
      },
    ];

    let upstream = null;
    let lastErrText = '';
    let lastLabel = '';
    let model = modelCandidates[0];
    // (endpoint × model) try-matrix. First combination that returns
    // 2xx wins. Auth failures short-circuit the whole thing.
    outer: for (const ep of endpoints) {
      for (const candidate of modelCandidates) {
        model = candidate;
        const r = await fetch(ep.url, {
          method: 'POST',
          headers: ep.headers,
          body: ep.body(candidate),
        });
        lastLabel = ep.label + ' / ' + candidate;
        if (r.ok) { upstream = r; break outer; }
        lastErrText = await r.text().catch(() => '');
        console.error(`Realtime mint failed [${lastLabel}]:`, r.status, lastErrText.slice(0, 300));
        if (r.status === 401 || r.status === 403) { upstream = r; break outer; }
      }
    }

    if (!upstream || !upstream.ok) {
      let openaiMessage = '';
      try {
        const parsed = JSON.parse(lastErrText);
        openaiMessage = parsed?.error?.message
          || parsed?.message
          || (typeof parsed?.error === 'string' ? parsed.error : '')
          || '';
      } catch(e) { openaiMessage = lastErrText.slice(0, 300); }
      return new Response(JSON.stringify({
        error: 'REALTIME_MINT_' + (upstream?.status || 'ALL_FAILED'),
        openai: openaiMessage,
        modelTried: model,
        endpointTried: lastLabel,
      }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const session = await upstream.json();
    // Response shapes:
    //   GA /client_secrets → { value, expires_at, session: {...} }
    //   legacy /sessions   → { client_secret: { value, expires_at }, id, ... }
    // Normalize both so the browser sees a consistent
    // { client_secret: { value, expires_at }, session_id, sdpUrl }.
    const clientSecret = session.client_secret
      || (session.value ? { value: session.value, expires_at: session.expires_at } : null);
    const sessionId = session.id || session.session?.id || null;
    // SDP exchange URL differs between APIs:
    //   GA → POST https://api.openai.com/v1/realtime/calls
    //   legacy → POST https://api.openai.com/v1/realtime?model=...
    const isGA = lastLabel.startsWith('GA');
    const sdpUrl = isGA
      ? 'https://api.openai.com/v1/realtime/calls'
      : 'https://api.openai.com/v1/realtime?model=' + encodeURIComponent(model);
    const sdpHeaders = isGA ? {} : { 'OpenAI-Beta': 'realtime=v1' };

    // Mint succeeded — increment the signed-in user's voice counter
    // atomically. Fire-and-forget: we don't want a Firestore hiccup
    // to delay the WebRTC handshake the browser is waiting on. If the
    // increment fails, the next mint call re-reads the (stale) count
    // and the user effectively gets one extra session — acceptable
    // failure mode.
    if (signedInUid && !isPro){
      try {
        getDb().collection('user_profiles').doc(signedInUid).set({
          voiceSessionsUsed: FieldValue.increment(1),
          voiceSessionLastAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(function(e){
          console.warn('[realtime-session] increment failed:', e && e.message);
        });
      } catch(e){
        console.warn('[realtime-session] increment threw:', e && e.message);
      }
    }

    // Hand the browser only what WebRTC needs. The ephemeral
    // client_secret is short-lived and scoped to one session — safe to
    // ship to the page. The raw OPENAI_API_KEY stays here.
    return new Response(JSON.stringify({
      client_secret: clientSecret,
      session_id: sessionId,
      model,
      voice,
      mode,
      endpoint: lastLabel,
      sdpUrl,
      sdpHeaders,
      voiceUsage: signedInUid ? {
        used: voiceUsedBefore + 1,
        limit: isPro ? null : FREE_VOICE_LIFETIME_LIMIT,
        isPro: isPro,
      } : null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    console.error('realtime-session handler error:', err);
    return new Response(JSON.stringify({ error: 'Realtime session failed.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
};

export const config = {
  path: '/api/realtime-session',
};
