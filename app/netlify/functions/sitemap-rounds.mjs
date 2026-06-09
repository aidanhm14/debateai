// /sitemap-rounds.xml — dynamic sitemap for every published /r/{id}.
//
// The crawl-coverage half of the SEO play. /rounds is the human-visible
// index; this is the same content shaped for Googlebot. Without it,
// Google has to chain-crawl one round at a time from /rounds; with it,
// the full back-catalog gets indexed in a single crawl.
//
// Reads `public_rounds`, ordered by publishedAt desc, capped at 5000.
// Google's hard limit is 50k URLs / 50MB per sitemap; we're well under.
// When the round count gets larger, paginate via sitemap-rounds-1.xml /
// sitemap-rounds-2.xml etc, listed from sitemap-index.xml.
//
// In-memory cache + 1-hour edge cache. Googlebot hits sitemaps on
// roughly a per-day cadence, so 1hr is more than tight enough.

import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const LIMIT = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = { fetchedAt: 0, xml: '' };

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function escXml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => XML_ESCAPE[c]);
}

function isoDate(ts) {
  // Accept Firestore Timestamp, Date, or ISO string. Return YYYY-MM-DD.
  try {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate()
      : ts instanceof Date ? ts
      : ts ? new Date(ts) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

async function buildXml() {
  const now = Date.now();
  if (cache.xml && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.xml;
  }
  let entries = [];
  try {
    const db = getDb();
    const snap = await db.collection('public_rounds')
      .orderBy('publishedAt', 'desc')
      .limit(LIMIT)
      .get();
    entries = (snap.docs || [])
      .map(d => ({ id: d.id, publishedAt: (d.data() || {}).publishedAt }))
      .filter(r => r.id);
  } catch (err) {
    console.warn('[sitemap-rounds] firestore query failed:', err.message);
    // Soft-fail to the last good cache (could be empty on cold start).
    return cache.xml || emptyUrlset();
  }
  const urls = entries.map(r => {
    const lastmod = isoDate(r.publishedAt);
    return `  <url>
    <loc>${SITE_ORIGIN}/r/${escXml(r.id)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.62</priority>
  </url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  cache = { fetchedAt: now, xml };
  return xml;
}

function emptyUrlset() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
}

export default async () => {
  const xml = await buildXml();
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

export const config = {
  path: '/api/sitemap-rounds',
};
