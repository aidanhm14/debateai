// GET /api/engines — the public engine roster.
//
// Open and keyless on purpose, the same posture as /api/judge/charter:
// "six brains, nine open engines" is a claim we make on marketing
// surfaces, so the list behind it should be fetchable by anyone who
// wants to check it rather than being prose we retype per page.
//
// `available` is computed from env here and nowhere else. A house whose
// API key is missing returns available:false and the picker greys it
// out, which is the difference between a roster and an advertisement.
import { engineRoster } from './lib/engines.mjs';

const ALLOWED_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://itsdebatable.com',
  'https://www.itsdebatable.com',
  'https://debateai.com',
  'https://www.debateai.com',
  'http://localhost:8888',
  'http://localhost:3000',
];

function cors(request) {
  const origin = request?.headers?.get?.('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async (request) => {
  const CORS = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const reachable = {
    claude: !!process.env.ANTHROPIC_API_KEY,
    gpt: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    grok: !!process.env.XAI_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    openlab: !!process.env.OPENROUTER_API_KEY,
  };

  const roster = engineRoster(reachable);

  return new Response(JSON.stringify(roster), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Short public cache: the roster changes on deploy, not per
      // request, and this is hit by every picker mount.
      'Cache-Control': 'public, max-age=300, s-maxage=900',
      ...CORS,
    },
  });
};

export const config = {
  path: '/api/engines',
};
