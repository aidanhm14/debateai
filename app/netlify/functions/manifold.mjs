// Manifold Markets live markets proxy.
//
// Manifold is the play-money sister to Polymarket — indie, intellectually
// playful, run by people who'd love being featured next to Polymarket on
// our landing page. Its public API is friendlier than Gamma:
//   GET https://api.manifold.markets/v0/markets?limit=100
//   GET https://api.manifold.markets/v0/search-markets?term=...&limit=20
//
// We pull recent active binary markets, sort by 24h trade volume, and
// normalize to the same shape as /api/polymarket so the landing page
// can render both with one card component.

let cache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000;

const MANIFOLD_URL =
  'https://api.manifold.markets/v0/search-markets' +
  '?term=&sort=score&filter=open&contractType=BINARY&limit=60';

function normalize(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const m of list) {
    if (!m || !m.question) continue;
    if (m.outcomeType !== 'BINARY' && m.outcomeType !== undefined) continue;
    if (m.isResolved) continue;

    // Manifold returns probability as a 0..1 float
    const p = typeof m.probability === 'number' ? m.probability : null;
    if (p == null || !isFinite(p)) continue;

    out.push({
      id: String(m.id || ''),
      question: String(m.question).trim(),
      slug: m.slug || null,
      url: m.url || (m.slug && m.creatorUsername
        ? `https://manifold.markets/${m.creatorUsername}/${m.slug}`
        : 'https://manifold.markets'),
      yesPrice: p,
      yesPct: Math.round(p * 100),
      outcomes: ['Yes', 'No'],
      // Manifold uses "volume24Hours" — we normalize to volume24hr to match
      // the Polymarket shape so the landing page card is source-agnostic.
      volume24hr: Number(m.volume24Hours || 0),
      volume: Number(m.volume || 0),
      endDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
      image: m.coverImageUrl || null,
      // tag we use client-side for filter chips + the "source" badge
      source: 'manifold',
    });
  }
  // Sort by 24h volume descending so the biggest action floats up
  out.sort((a, b) => b.volume24hr - a.volume24hr);
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
    const r = await fetch(MANIFOLD_URL, {
      headers: { accept: 'application/json', 'user-agent': 'devils-advocate/1.0' },
    });
    if (!r.ok) throw new Error('Manifold API ' + r.status);
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
    console.error('[manifold] fetch failed:', e && e.message);
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

export const config = { path: '/api/manifold' };
