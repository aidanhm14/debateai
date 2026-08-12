// /sitemap-recordings.xml — dynamic sitemap for every published /w/{id}.
//
// The crawl-coverage half of the per-recording page work. /watch is the
// human-visible hub and fills its grid from JS, so without this file the
// only way Google reaches a replay is by executing that fetch and then
// following a link. This hands it the whole published set in one read.
//
// Same shape and cache policy as sitemap-rounds.mjs on purpose; the two
// are siblings and should stay easy to diff.
//
// Publish state is the only gate, and it is the same one /api/recordings
// and w.mjs use: `published === true`. A recording the debaters did not
// agree to publish must never reach a sitemap, because a sitemap is the
// one surface that actively invites a crawl.

import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const LIMIT = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = { fetchedAt: 0, xml: '' };

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function escXml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => XML_ESCAPE[c]);
}

// startTs is unix SECONDS on the recordings doc (Daily's shape), not ms
// and not a Firestore Timestamp. Getting this wrong silently emits 1970
// as every lastmod, which Google reads as a sitemap of ancient content.
function isoDateFromTs(startTs) {
  const secs = Number(startTs);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  const d = new Date(secs * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function buildXml() {
  const now = Date.now();
  if (cache.xml && now - cache.fetchedAt < CACHE_TTL_MS) return cache.xml;

  let entries = [];
  try {
    const db = getDb();
    // Single-field orderBy + in-code publish filter, matching
    // recordings.mjs: `published` + `startTs` together would need a
    // composite index for no real gain at this collection size.
    const snap = await db.collection('recordings')
      .orderBy('startTs', 'desc')
      .limit(LIMIT)
      .get();
    entries = (snap.docs || [])
      .filter(d => (d.data() || {}).published === true)
      .map(d => ({ id: d.id, startTs: (d.data() || {}).startTs }))
      .filter(r => r.id);
  } catch (err) {
    console.warn('[sitemap-recordings] firestore query failed:', err.message);
    return cache.xml || emptyUrlset();
  }

  const urls = entries.map((r) => {
    const lastmod = isoDateFromTs(r.startTs);
    return `  <url>
    <loc>${SITE_ORIGIN}/w/${escXml(r.id)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.66</priority>
  </url>`;
  }).join('\n') || FALLBACK_URLS;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  cache = { fetchedAt: now, xml };
  return xml;
}

// Search Console reports a urlset with zero <url> entries as an error, so
// carry the hub page while nothing is published. Real entries displace it.
// This is the live case today: the recordings collection is empty.
const FALLBACK_URLS = `  <url>
    <loc>${SITE_ORIGIN}/watch</loc>
    <changefreq>daily</changefreq>
    <priority>0.84</priority>
  </url>`;

function emptyUrlset() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${FALLBACK_URLS}\n</urlset>\n`;
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
  path: '/api/sitemap-recordings',
};
