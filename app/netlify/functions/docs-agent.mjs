// Counter Docs editing agent (Stage 2).
//
// Endpoint: POST /api/docs-agent
// Body:
//   {
//     userRequest: string,    // "rewrite this thesis to be more direct"
//     passage:     string,    // the doc text the user wants to edit (or full doc snippet)
//     docTitle:    string,    // for the system prompt's context
//   }
// Returns:
//   { tool: 'propose_edit', input: { containsText, replaceText, reason } }
//   or { error: '...' } on failure
//
// The function is intentionally narrower than claude.mjs: no streaming,
// no prompt-library injection, no _voiceFeature. Just a single Claude
// call with one tool and a tight system prompt. The extension calls
// this from the SW; the SW then calls /v1/documents/{docId}:batchUpdate
// with replaceAllText on the user's behalf if they confirm.

import { checkAppCheck } from './lib/appcheck.mjs';

const MODEL = process.env.DOCS_AGENT_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are an editor helping a student sharpen their own academic work before they defend it orally to a panel. The student wrote the passage below; your job is to make it tighter and more defensible without changing what the student is trying to say.

Rules:
- ONE edit per response. The student reviews each edit before it is applied.
- Stay surgical. Replace only what needs replacing — a phrase, a sentence, at most a paragraph. Do not rewrite text the student didn't ask about.
- Match the existing register. Don't make casual writing academic, or vice versa. The student knows their reader.
- No fabricated citations, no invented numbers, no scholar name-drops. The student said this; you're just sharpening it.
- The passage is the student's voice. Preserve its specific claims and examples. Sharpen wording, structure, and precision; don't replace ideas.
- If the request is genuinely impossible (e.g. asking you to fact-check a claim you can't verify), respond with reason explaining why and suggest the closest defensible edit instead.

Output format: call propose_edit. The containsText must appear EXACTLY ONCE in the passage so the replacement is unambiguous. Pick a long enough span (full sentence, or half-paragraph) to be unique.`;

const PROPOSE_EDIT_TOOL = {
  name: 'propose_edit',
  description: 'Propose a single text replacement in the student’s document. The student will review and confirm before it is applied via Google Docs API replaceAllText.',
  input_schema: {
    type: 'object',
    properties: {
      containsText: {
        type: 'string',
        description: 'The exact existing text to replace. MUST appear exactly once in the passage. Pick a span (full sentence, or longer) long enough to be unique. Match capitalization and punctuation exactly.',
      },
      replaceText: {
        type: 'string',
        description: 'The new text. May be the same length, longer, or shorter. Preserves the student’s voice and claims.',
      },
      reason: {
        type: 'string',
        description: 'One sentence explaining why this edit makes the passage more defensible under panel cross-examination.',
      },
    },
    required: ['containsText', 'replaceText', 'reason'],
  },
};

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

function corsFor(request) {
  const origin = request?.headers?.get?.('origin') || '';
  // The Counter chrome extension origin is chrome-extension://<id> which is
  // not in ALLOWED_ORIGINS by design — extension fetches don't go through
  // the page's CORS, so they aren't subject to this check. We only echo
  // back debateai.com etc. for browser-side calls.
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
    'Vary': 'Origin',
  };
}

export default async (request, context) => {
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

  // App Check: optional for the chrome extension origin (it has no
  // App Check token), required for browser-origin requests.
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

  const userRequest = String(body?.userRequest || '').trim();
  const passage = String(body?.passage || '').trim();
  const docTitle = String(body?.docTitle || '').trim().slice(0, 200);

  if (!userRequest) {
    return new Response(JSON.stringify({ error: 'userRequest is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  if (!passage) {
    return new Response(JSON.stringify({ error: 'passage is required (the doc text to edit)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  // Hard cap on passage size. The Counter UI shows the first 600 chars
  // of the doc; the agent should be working on a focused span anyway,
  // not the whole novel. 8K chars is plenty for a paragraph or two.
  if (passage.length > 8000) {
    return new Response(JSON.stringify({ error: 'passage too long (max 8000 chars). Trim to the relevant section.' }), {
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
    'Passage (the student\'s own writing):',
    '"""',
    passage,
    '"""',
    '',
    `Student request: ${userRequest}`,
    '',
    'Call propose_edit with the single tightest replacement that addresses the request.',
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
        tools: [PROPOSE_EDIT_TOOL],
        tool_choice: { type: 'tool', name: 'propose_edit' },
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

  const toolUse = data.content.find((c) => c.type === 'tool_use' && c.name === 'propose_edit');
  if (!toolUse) {
    // Anthropic decided to respond with text instead of the tool. Surface
    // its message so the user sees why (e.g. it pushed back on the request).
    const text = data.content.find((c) => c.type === 'text');
    return new Response(JSON.stringify({
      error: 'agent did not propose an edit',
      assistantMessage: text?.text || '',
    }), {
      status: 200, // not a server error — agent's choice
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const { containsText, replaceText, reason } = toolUse.input || {};
  if (!containsText || typeof replaceText !== 'string' || !reason) {
    return new Response(JSON.stringify({ error: 'agent tool call missing required fields' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Sanity check: containsText must actually appear in the passage we
  // sent. If the agent hallucinated, we reject before showing the user
  // a confirmation that would silently no-op.
  if (!passage.includes(containsText)) {
    return new Response(JSON.stringify({
      error: 'agent proposed edit on text not found in the passage. Refine the request and try again.',
      proposed: { containsText: containsText.slice(0, 200), reason },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  // Multiple-occurrence guard — replaceAllText would replace ALL of them
  // and that's almost never what the user intended.
  const occurrences = passage.split(containsText).length - 1;
  if (occurrences > 1) {
    return new Response(JSON.stringify({
      error: `agent picked text that appears ${occurrences} times in the passage. Refine the request to target a unique span.`,
      proposed: { containsText: containsText.slice(0, 200), reason },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  return new Response(JSON.stringify({
    tool: 'propose_edit',
    input: { containsText, replaceText, reason },
    model: data.model || MODEL,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
};
