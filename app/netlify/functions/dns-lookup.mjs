import { promises as dns } from 'node:dns';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];

// RFC 1035 + modern TLDs: labels 1–63 chars, ASCII letters/digits/hyphens,
// no leading/trailing hyphen; total length ≤253. Reject anything exotic
// before handing it to the resolver.
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

const rateLimits = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

function isRateLimited(key) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(k);
  }
}, 5 * 60 * 1000);

function normalizeRecord(type, record) {
  if (type === 'MX') return { priority: record.priority, exchange: record.exchange };
  if (type === 'SOA') return record;
  if (type === 'CAA') return record;
  if (type === 'TXT') return Array.isArray(record) ? record.join('') : record;
  return record;
}

async function resolveType(domain, type) {
  try {
    const records = await dns.resolve(domain, type);
    const list = Array.isArray(records) ? records : [records];
    return { ok: true, records: list.map((r) => normalizeRecord(type, r)) };
  } catch (err) {
    // NODATA / NOTFOUND / NXDOMAIN are expected for many record types on any
    // given domain — surface them as empty rather than blowing up the page.
    const benign = ['ENODATA', 'ENOTFOUND', 'ENOENT'];
    if (benign.includes(err.code)) return { ok: true, records: [] };
    return { ok: false, error: err.code || 'RESOLVE_FAILED' };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const url = new URL(request.url);
  const domainRaw = (url.searchParams.get('domain') || '').trim().toLowerCase();
  const typeParam = (url.searchParams.get('type') || '').trim().toUpperCase();

  if (!domainRaw) return errorResponse('Missing `domain` query parameter', 400, request);
  if (!DOMAIN_RE.test(domainRaw)) return errorResponse('Invalid domain format', 400, request);

  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  if (isRateLimited(ip)) return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);

  const types = typeParam && RECORD_TYPES.includes(typeParam) ? [typeParam] : RECORD_TYPES;
  const started = Date.now();

  const entries = await Promise.all(
    types.map(async (t) => [t, await resolveType(domainRaw, t)])
  );

  const results = Object.fromEntries(entries);
  const elapsedMs = Date.now() - started;

  return jsonResponse(
    { domain: domainRaw, queriedAt: new Date().toISOString(), elapsedMs, results },
    200,
    request
  );
};

export const config = {
  path: '/api/dns-lookup',
};
