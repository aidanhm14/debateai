// /sitemap-motions.xml — dynamic sitemap for /today/{YYYY-MM-DD}.
//
// Companion to sitemap-rounds.xml. The /today page renders ±3 days as
// internal links, so without an explicit sitemap the deep archive of
// dated motion URLs only gets crawled by following day-by-day chains.
// This emits the last 180 days outright so Googlebot can pick them up
// in one pass.
//
// 180 days × 1 page each = ~180 URLs, well under any sitemap limit. The
// motion bank is deterministic per date so we don't need Firestore.

import {
  dailyMotionFor,
  formatDailyDate,
} from './lib/daily-motion-bank.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const ARCHIVE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function buildXml() {
  const todayMs = Date.now();
  const lastmod = isoDay(new Date(todayMs));
  const lines = [];
  // Today first, then walking backward. /today (the bare URL) is its
  // own sitemap entry in the static sitemap, so we start one day before
  // and walk back ARCHIVE_DAYS days. Every URL here is a stable,
  // permanently-rendered page (the motion is a pure function of date),
  // so Google can cache them indefinitely.
  for (let offset = 0; offset < ARCHIVE_DAYS; offset++) {
    const d = new Date(todayMs - offset * DAY_MS);
    const dateStr = formatDailyDate(d);
    // Touch the bank so a bank lookup failure surfaces as an empty entry
    // rather than a 200 with broken-link content downstream.
    const motion = dailyMotionFor(d);
    if (!motion || !motion.motion) continue;
    lines.push(`  <url>
    <loc>${SITE_ORIGIN}/today/${dateStr}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.55</priority>
  </url>`);
  }
  // Then today as priority 0.85, since the bare /today URL canonicalizes
  // here daily and bots that hit the static sitemap also see this.
  lines.unshift(`  <url>
    <loc>${SITE_ORIGIN}/today/${isoDay(new Date(todayMs))}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join('\n')}
</urlset>
`;
}

export default async () => {
  const xml = buildXml();
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 6-hour edge cache. The set of URLs only changes once per UTC
      // midnight, so this is comfortably tight.
      'Cache-Control': 'public, max-age=21600, s-maxage=21600',
    },
  });
};

export const config = {
  path: '/api/sitemap-motions',
};
