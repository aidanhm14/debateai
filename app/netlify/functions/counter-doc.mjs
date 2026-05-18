// Counter-the-draft endpoint.
//
// POST /api/counter-doc
// Body:
//   {
//     passage:  string,    // the user's draft / argument
//     docTitle: string?,   // optional, for prompt context
//     intensity: 'measured' | 'firm' | 'fierce'?,   // default 'firm'
//   }
// Returns:
//   {
//     thesis:           string,
//     weakestClaim:     string,
//     rebuttals: [{
//       claim:    string,
//       warrant:  string,
//       impact:   string,
//     }],
//     examinersQuestion: string,
//     drillTopic:        string,    // short motion-style line the user can run in voice
//     model:             string,
//   }
//
// Unlike docs-agent.mjs (which is an editor that proposes one in-place
// replacement), this endpoint is an opponent. It reads the passage as
// the user's argument and returns structured counter-arguments the user
// can defend against in a voice round. No edits are applied — the
// extension surfaces these as cards in the side panel with a "Drill
// this in voice" CTA.

import { checkAppCheck } from './lib/appcheck.mjs';

const MODEL = process.env.COUNTER_DOC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1400;

const SYSTEM_PROMPT = `You are a varsity debater preparing to cross-examine the writer of the passage below. Your job: find the weakest load-bearing claim, build the three strongest rebuttals, and surface the one question their toughest reader will ask first.

Rules:
- Treat the passage as an argument under attack, not a draft to polish. You are not their editor; you are their opponent.
- Pick the SINGLE weakest load-bearing claim, not the most cosmetic flaw. If they kept the prose and lost this claim, the argument collapses.
- For each rebuttal: name the claim being attacked, give the warrant (the mechanism that makes the rebuttal land), and run the impact (what changes about the conclusion if the rebuttal sticks). Magnitude / probability / timeframe where relevant.
- Three rebuttals. Each one different in shape: usually one mechanism / one counterexample / one impact-turn — vary based on what the passage actually says.
- No fabricated citations, no invented numbers, no "Smith 2022" name-drops. If you reach for evidence, reach for the kind of evidence that's genuinely well-known in the relevant field.
- No throat-clearing. No "the writer makes an interesting point". Open with the rebuttal, not a preamble.
- The examinersQuestion is one sentence the user should be ready to answer the moment they sit down. Specific, concrete, lands inside the weakest claim.
- The drillTopic is a short motion-style line (under 90 chars) the user could drop into a voice round to rehearse defending their actual claim. Phrase it as "This house [verb]" or a flat declarative — whichever is more natural for the passage.
- No em-dashes. Periods, commas, semicolons only.
- Match the intensity dial: 'measured' = senior academic voice, 'firm' = circuit debater (default), 'fierce' = adversarial cross-examiner. Don't be a sycophant on any setting.

Output: call propose_counter once with all fields populated. Every field is required.`;

const PROPOSE_COUNTER_TOOL = {
  name: 'propose_counter',
  description: 'Return a structured set of counter-arguments to the passage so the writer can defend it under cross-examination.',
  input_schema: {
    type: 'object',
    properties: {
      thesis: {
        type: 'string',
        description: 'One sentence stating the passage\'s central claim, as you read it. Use this to verify you understood before counter-pointing.',
      },
      weakestClaim: {
        type: 'string',
        description: 'The single load-bearing claim in the passage that is most vulnerable. One sentence.',
      },
      rebuttals: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        description: 'Exactly three rebuttals, each with claim / warrant / impact.',
        items: {
          type: 'object',
          properties: {
            claim:   { type: 'string', description: 'The rebuttal\'s thesis — what about the passage is wrong.' },
            warrant: { type: 'string', description: 'The mechanism / reasoning that makes the claim land.' },
            impact:  { type: 'string', description: 'What changes about the writer\'s conclusion if this rebuttal sticks. Magnitude, probability, timeframe where relevant.' },
          },
          required: ['claim', 'warrant', 'impact'],
        },
      },
      examinersQuestion: {
        type: 'string',
        description: 'One sentence the writer should be ready to answer the moment they sit down for cross-ex. Concrete, specific, lives inside the weakest claim.',
      },
      drillTopic: {
        type: 'string',
        description: 'A short motion-style line (under 90 chars) the writer could drop into a voice round to rehearse defending the actual claim.',
      },
    },
    required: ['thesis', 'weakestClaim', 'rebuttals', 'examinersQuestion', 'drillTopic'],
  },
};

const PRODUCTION_ORIGINS = [
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

function corsFor(request) {
  const origin = request?.headers?.get?.('origin') || '';
  // Chrome extension origin is chrome-extension://<id> — extension fetches
  // aren't subject to page CORS so we just echo back the default.
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
    'Vary': 'Origin',
  };
}

const VALID_INTENSITIES = new Set(['measured', 'firm', 'fierce']);

export default async (request) => {
  const CORS = corsFor(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const origin = request.headers.get('origin') || '';
  const isExtensionOrigin = origin.startsWith('chrome-extension://');
  if (!isExtensionOrigin) {
    const appCheckOK = await checkAppCheck(request).catch(() => false);
    if (!appCheckOK && process.env.NODE_ENV === 'production') {
      return new Response(JSON.stringify({ error: 'app-check-failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const passage = String(body?.passage || '').trim();
  const docTitle = String(body?.docTitle || '').trim().slice(0, 200);
  const intensityIn = String(body?.intensity || '').trim().toLowerCase();
  const intensity = VALID_INTENSITIES.has(intensityIn) ? intensityIn : 'firm';

  if (!passage) {
    return new Response(JSON.stringify({ error: 'passage is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  if (passage.length < 40) {
    return new Response(JSON.stringify({
      error: 'passage is too short to counter — paste a paragraph or longer.',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  if (passage.length > 12000) {
    return new Response(JSON.stringify({
      error: 'passage too long (max 12000 chars). Trim to the relevant section.',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'server missing ANTHROPIC_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const userMessage = [
    docTitle ? `Document: "${docTitle}"` : '',
    `Intensity: ${intensity}`,
    'Passage:',
    '"""',
    passage,
    '"""',
    '',
    'Call propose_counter with the strongest three rebuttals you can build against this passage.',
  ].filter(Boolean).join('\n');

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [PROPOSE_COUNTER_TOOL],
        tool_choice: { type: 'tool', name: 'propose_counter' },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'anthropic upstream unreachable: ' + (e?.message || e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => '');
    return new Response(JSON.stringify({ error: `anthropic ${upstream.status}: ${txt.slice(0, 400)}` }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const data = await upstream.json().catch(() => null);
  if (!data || !Array.isArray(data.content)) {
    return new Response(JSON.stringify({ error: 'anthropic returned unexpected shape' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const toolUse = data.content.find((c) => c.type === 'tool_use' && c.name === 'propose_counter');
  if (!toolUse) {
    const text = data.content.find((c) => c.type === 'text');
    return new Response(JSON.stringify({
      error: 'model did not return a structured counter',
      assistantMessage: text?.text || '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const out = toolUse.input || {};
  const rebuttals = Array.isArray(out.rebuttals) ? out.rebuttals : [];
  if (rebuttals.length !== 3 || !out.thesis || !out.weakestClaim || !out.examinersQuestion || !out.drillTopic) {
    return new Response(JSON.stringify({ error: 'model returned incomplete counter shape' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  for (const r of rebuttals) {
    if (!r?.claim || !r?.warrant || !r?.impact) {
      return new Response(JSON.stringify({ error: 'model returned malformed rebuttal' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  return new Response(JSON.stringify({
    thesis: String(out.thesis).trim(),
    weakestClaim: String(out.weakestClaim).trim(),
    rebuttals: rebuttals.map((r) => ({
      claim: String(r.claim).trim(),
      warrant: String(r.warrant).trim(),
      impact: String(r.impact).trim(),
    })),
    examinersQuestion: String(out.examinersQuestion).trim(),
    drillTopic: String(out.drillTopic).trim().slice(0, 200),
    model: data.model || MODEL,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
};
