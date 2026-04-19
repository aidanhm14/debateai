const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://devilsadvocate1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debatethedevil.com',
  'https://www.debatethedevil.com',
];

const DEV_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
];

// Only allow localhost origins outside production
const isProduction = process.env.CONTEXT === 'production';
const ALLOWED_ORIGINS = isProduction
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

// Default origin for preflight / when request is not available
const DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];

function getOrigin(request) {
  if (!request) return DEFAULT_ORIGIN;
  const origin = request?.headers?.get?.('origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGIN;
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': getOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function corsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

export function errorResponse(message, status = 400, request) {
  return jsonResponse({ error: message }, status, request);
}
