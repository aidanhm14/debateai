// /sitemap.xml — static-page sitemap served as a function.
//
// Originally a hand-edited XML file with frozen <lastmod> dates. Google
// uses lastmod as a freshness hint, and a hardcoded date that never
// moves gets discounted over time. Moving this to a function lets us
// emit today's UTC date for the entries that genuinely change daily
// (today / rounds / community / live / champions / leaderboard) while
// keeping stable historical dates on truly-static pages (/pricing,
// /landing, format references) so the freshness signal stays honest.
//
// Dynamic per-collection URLs (/r/{id}, /today/{date}) live in
// sitemap-rounds.xml and sitemap-motions.xml; the sitemap-index.xml
// stitches all three together. Don't list them here.
//
// 1-hour edge cache. Googlebot polls sitemaps on a per-day cadence at
// most, so even uncached this would be a rounding-error workload —
// the cache is purely for cost hygiene.

const SITE_ORIGIN = 'https://debateai.com';

// Honest split: which entries genuinely move day-to-day vs which sit on
// a stable last-edit date. Don't lie about static pages being "updated
// today" — Google's lastmod heuristics catch that and discount the
// whole sitemap's trustworthiness.
const STABLE_DATE = '2026-05-14'; // bumped when meaningful content changes
const DYNAMIC = new Set([
  '/', '/today', '/rounds', '/community', '/live',
  '/champions', '/leaderboard', '/exhibition',
]);

const URLS = [
  { path: '/',                changefreq: 'daily',   priority: '1.0' },
  { path: '/debate-ai',       changefreq: 'weekly',  priority: '0.95' },
  { path: '/voice-debate',    changefreq: 'weekly',  priority: '0.92' },
  { path: '/today',           changefreq: 'daily',   priority: '0.85' },
  { path: '/rounds',          changefreq: 'hourly',  priority: '0.82' },
  { path: '/champions',       changefreq: 'weekly',  priority: '0.80' },
  { path: '/exhibition',      changefreq: 'weekly',  priority: '0.75' },
  { path: '/learn/formats/apda',     changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/bp',       changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/worlds',   changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/asian',    changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/formats/pf',       changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/ld',       changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/policy',   changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/congress', changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/formats/mun',      changefreq: 'monthly', priority: '0.78' },
  // Education sub-hub under /learn. Domain-knowledge primers with a
  // self-check quiz on each. Add new entries here when
  // education-bank.mjs grows.
  { path: '/learn/education',                       changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/education/finance',               changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/education/feminist-theory',       changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/education/international-relations',changefreq: 'monthly', priority: '0.78' },
  { path: '/learn/education/climate-policy',        changefreq: 'monthly', priority: '0.78' },
  { path: '/community',       changefreq: 'daily',   priority: '0.88' },
  { path: '/leaderboard',     changefreq: 'daily',   priority: '0.85' },
  { path: '/live',            changefreq: 'daily',   priority: '0.90' },
  { path: '/pricing',         changefreq: 'monthly', priority: '0.90' },
  { path: '/learn',           changefreq: 'monthly', priority: '0.85' },
  { path: '/topics',          changefreq: 'weekly',  priority: '0.85' },
  { path: '/schools',         changefreq: 'monthly', priority: '0.80' },
  { path: '/high-school',     changefreq: 'monthly', priority: '0.75' },
  { path: '/spar',            changefreq: 'weekly',  priority: '0.78' },
  { path: '/counter',         changefreq: 'monthly', priority: '0.82' },
  { path: '/changelog',       changefreq: 'weekly',  priority: '0.50' },
  { path: '/topics/public-forum',         changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/lincoln-douglas',      changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/policy',               changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/big-questions',        changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/world-schools',        changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/congress',             changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/asian-parliamentary',  changefreq: 'monthly', priority: '0.85' },
  { path: '/topics/british-parliamentary',changefreq: 'monthly', priority: '0.85' },
  { path: '/india',           changefreq: 'monthly', priority: '0.90' },
  { path: '/us',              changefreq: 'monthly', priority: '0.85' },
  { path: '/report',          changefreq: 'monthly', priority: '0.60' },
];

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function buildXml() {
  const today = todayUtc();
  const urls = URLS.map(u => {
    const lastmod = DYNAMIC.has(u.path) ? today : STABLE_DATE;
    return `  <url>
    <loc>${SITE_ORIGIN}${u.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export default async () => {
  const xml = buildXml();
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

export const config = {
  path: '/api/sitemap',
};
