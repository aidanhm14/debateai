// /sitemap-motions.xml — dynamic sitemap for /today/{YYYY-MM-DD}.
//
// Companion to sitemap-rounds.xml. The /today page renders ±3 days as
// internal links, so without an explicit sitemap the deep archive of
// dated motion URLs only gets crawled by following day-by-day chains.
// This emits a recent window of dated URLs so Googlebot can pick up the
// current ones in one pass.
//
// 2026-05-22: cut 180 → 30 days. At 180, these thin templated dated
// pages were ~75% of the whole sitemap, and GSC showed them stuck in
// "Crawled/Discovered – not indexed" while real pages (/learn,
// /community, /leaderboard, /schools) sat "Discovered – never crawled."
// Flooding a low-authority site's sitemap with near-duplicate thin URLs
// wastes crawl budget and dilutes quality signal. 30 keeps a month of
// fresh dated URLs without drowning the real pages. The deep archive
// still resolves by direct URL + the ±3-day chain on /today; it's just
// not pushed en masse. Bump back up once domain authority can carry it.
// The motion bank is deterministic per date so we don't need Firestore.

import {
  dailyMotionFor,
  formatDailyDate,
} from './lib/daily-motion-bank.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const ARCHIVE_DAYS = 30;
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
  // Start at 1, not 0: today is unshifted in below as its own higher-priority
  // entry. Starting at 0 emitted today twice, and a sitemap that lists the
  // same <loc> under two different priorities is a self-contradicting signal.
  for (let offset = 1; offset <= ARCHIVE_DAYS; offset++) {
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
