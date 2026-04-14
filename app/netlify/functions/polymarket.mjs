// Polymarket live markets proxy.
//
// Pulls trending active markets from the Polymarket Gamma API and returns
// a normalized, lightweight shape for the landing page to render. Cached
// for 60s in-memory so we don't hammer Gamma if the page gets traffic.
//
// Why a server proxy and not a direct browser fetch?
//   1. Gamma's CORS isn't reliably set for every endpoint
//   2. We want to filter/normalize so the client doesn't ship a 200KB blob
//   3. We can swap the upstream (Gamma → CLOB → cached snapshot) without
//      shipping a new build of landing.html

let cache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000;

const GAMMA_URL =
  'https://gamma-api.polymarket.com/markets' +
  '?active=true&closed=false&archived=false' +
  '&order=volume24hr&ascending=false&limit=40';

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function normalize(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const m of list) {
    if (!m || !m.question) continue;

    // outcomePrices ships as a JSON-encoded string like '["0.62","0.38"]'
    let prices = m.outcomePrices;
    if (typeof prices === 'string') prices = safeJson(prices);
    if (!Array.isArray(prices) || prices.length < 1) continue;

    const yesPrice = parseFloat(prices[0]);
    if (!isFinite(yesPrice)) continue;

    // outcomes ship the same way
    let outcomes = m.outcomes;
    if (typeof outcomes === 'string') outcomes = safeJson(outcomes);

    out.push({
      id: String(m.id || m.conditionId || ''),
      question: m.question.trim(),
      slug: m.slug || null,
      url: m.slug
        ? `https://polymarket.com/event/${m.slug}`
        : 'https://polymarket.com',
      yesPrice,                                   // 0..1
      yesPct: Math.round(yesPrice * 100),
      outcomes: Array.isArray(outcomes) ? outcomes : ['Yes', 'No'],
      volume24hr: Number(m.volume24hr || 0),
      volume: Number(m.volume || 0),
      endDate: m.endDate || null,
      image: m.image || m.icon || null,
    });
  }
  return out;
}

export default async (_req) => {
  const now = Date.now();
  if (cache && now < cacheExpiry) {
    return new Response(JSON.stringify(cache), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
        'access-control-allow-origin': '*',
      },
    });
  }

  try {
    const r = await fetch(GAMMA_URL, {
      headers: { accept: 'application/json', 'user-agent': 'devils-advocate/1.0' },
    });
    if (!r.ok) throw new Error('Gamma API ' + r.status);
    const raw = await r.json();
    const markets = normalize(raw).slice(0, 24);

    cache = { markets, fetchedAt: now, count: markets.length };
    cacheExpiry = now + CACHE_TTL_MS;

    return new Response(JSON.stringify(cache), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e) {
    // Don't 500 the page — return an empty list and let the client show a
    // graceful fallback. We log the error for debugging.
    console.error('[polymarket] fetch failed:', e && e.message);
    return new Response(
      JSON.stringify({ markets: [], fetchedAt: now, count: 0, error: String(e && e.message || e) }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        },
      }
    );
  }
};

export const config = { path: '/api/polymarket' };
