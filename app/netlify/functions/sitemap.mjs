// /sitemap.xml — static-page sitemap served as a function.
//
// Originally a hand-edited XML file with frozen <lastmod> dates. Google
// uses lastmod as a freshness hint, and a hardcoded date that never
// moves gets discounted over time. Moving this to a function lets us
// emit today's UTC date for the entries that genuinely change daily
// (today / community / live / champions / leaderboard) while
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

import { listLibraryMotions } from './lib/motion-library.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';

// Honest split: which entries genuinely move day-to-day vs which sit on
// a stable last-edit date. Don't lie about static pages being "updated
// today" — Google's lastmod heuristics catch that and discount the
// whole sitemap's trustworthiness.
const STABLE_DATE = '2026-07-22'; // bumped when meaningful content changes (2026-07-22: domain cutover to itsdebatable.com changed every page's canonical URL; 2026-06-08: sitewide Debatable rebrand changed every page's brand, title, canonical)
const DYNAMIC = new Set([
  '/', '/today', '/community', '/live',
  '/champions', '/leaderboard', '/exhibition',
]);

const URLS = [
  { path: '/',                changefreq: 'daily',   priority: '1.0' },
  { path: '/debate-it',       changefreq: 'weekly',  priority: '0.95' },
  { path: '/voice-debate',    changefreq: 'weekly',  priority: '0.92' },
  // Product-loop explainer (opponent → timed round → AI ballot). Target
  // of the hero "How it works" link; HowTo + FAQPage schema on-page.
  { path: '/how-it-works',    changefreq: 'monthly', priority: '0.88', lastmod: '2026-07-22' },
  { path: '/today',           changefreq: 'daily',   priority: '0.85' },
  // /rounds was retired 2026-05-18 (the published-rounds listing moved
  // into /community#rounds) and the note here said not to list it. That
  // note went stale on 2026-07-22, when the slug was reused for the
  // async-rounds surface: record a 90s opening, a human answers on their
  // own time, AI ballot at the end. That is a real indexable page with
  // inbound links from the landing and /spar, and it sat out of the
  // sitemap for a day because this comment still described the old
  // occupant of the URL. Relisted 2026-07-23. The individual round
  // corpus is still sitemap-rounds.xml; this is the surface page.
  { path: '/rounds',          changefreq: 'weekly',  priority: '0.80', lastmod: '2026-07-22' },
  { path: '/champions',       changefreq: 'weekly',  priority: '0.80' },
  // 2026-05-27 plane session: exhibition bumped 0.75 → 0.85 per
  // Aidan's brief ("promote exhibition debate via SEO improvements
  // strategy"). The page now ships HowTo + SoftwareApplication
  // JSON-LD targeting "ai vs ai debate" + "watch ai debate" intents.
  { path: '/exhibition',      changefreq: 'weekly',  priority: '0.85' },
  // High-intent SEO landing pages targeting specific query clusters.
  // /debate-an-ai and /debate-online are direct phrase-match doorways
  // from Google for the "debate an ai" / "debate online" intents the
  // existing /debate-it app surface can't claim because its slug is
  // taken by the typed-mode product page. /compare positions Debatable
  // next to general AI assistants without villain framing — anchor
  // pages targeting comparison-query SERPs.
  { path: '/debate-an-ai',                            changefreq: 'weekly',  priority: '0.92' },
  { path: '/debate-online',                           changefreq: 'weekly',  priority: '0.90' },
  // "debate strangers" / "omegle for debate" query cluster. Sister to
  // /debate-online, focused on the random-human /spar path (which is
  // noindex itself, so this page is the indexable doorway).
  { path: '/debate-strangers',                        changefreq: 'weekly',  priority: '0.90' },
  // 2026-05-27 plane session: dedicated SEO doorway for "ai vs ai
  // debate" — the exact-match phrase the /exhibition product page
  // can't claim with its single-word slug. Static HTML, rich JSON-LD
  // (HowTo + SoftwareApplication + FAQPage + BreadcrumbList), strong
  // CTA into /exhibition. Same playbook as /debate-an-ai → /voice-debate.
  { path: '/ai-vs-ai-debate',                         changefreq: 'weekly',  priority: '0.88' },
  // Dedicated SEO doorway for "ai debate judge" / "judge a debate
  // round" / "debate ballot" intents. Paste-a-round produces a
  // tournament-grade RFD + speaker points; PF-first, targets the
  // lay-parent-judge gap. Same playbook as /debate-an-ai.
  { path: '/judge',                                   changefreq: 'weekly',  priority: '0.88' },
  { path: '/compare/',                                changefreq: 'monthly', priority: '0.86' },
  { path: '/compare/debateit-vs-chatgpt',             changefreq: 'monthly', priority: '0.88' },
  { path: '/compare/debateit-vs-claude',              changefreq: 'monthly', priority: '0.84' },
  { path: '/compare/best-ai-for-debate-practice',     changefreq: 'monthly', priority: '0.86' },
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
  // Long-tail question guides under /learn/guides. Each targets a
  // specific question-style query that has higher commercial intent
  // and lower competition than the generic /learn/formats entries.
  // Add new slugs here when guide-bank.mjs grows.
  { path: '/learn/guides',                          changefreq: 'weekly',  priority: '0.86' },
  { path: '/learn/guides/asian-parli-pm-opening',   changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/wsdc-reply-speech',        changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/pf-crossfire-questions',   changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/bp-poi',                   changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/viva-exam-questions',      changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/guides/apda-opp-case',            changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/guides/policy-speed-reading',     changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/guides/ld-value-criterion',       changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/guides/asian-parli-whip',         changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/guides/bp-closing-extension',     changefreq: 'monthly', priority: '0.80' },
  { path: '/learn/guides/apda-pmr',                 changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/wsdc-first-prop',          changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/pf-summary-speech',        changefreq: 'monthly', priority: '0.82' },
  // 2026-07-14 top-funnel guides pack: the question-style queries a new
  // debater types before they know any format ("how to practice debate
  // online"). Highest-intent organic surface; priorities reflect that.
  { path: '/learn/guides/how-to-practice-debate-online',        changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/guides/how-to-practice-debate-alone',         changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/guides/how-to-get-better-at-debating',        changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/guides/how-to-win-a-debate',                  changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/guides/how-to-prepare-for-a-debate-tournament', changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/guides/how-to-improve-your-rebuttals',        changefreq: 'monthly', priority: '0.82' },
  // Debate fundamentals deep-content surface. Each is the canonical
  // ranking target for a foundational concept query.
  { path: '/learn/fundamentals',                       changefreq: 'weekly',  priority: '0.88' },
  { path: '/learn/fundamentals/claim-warrant-impact',  changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/fundamentals/weighing',              changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/fundamentals/rebuttal',              changefreq: 'monthly', priority: '0.84' },
  { path: '/learn/fundamentals/signposting',           changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/fundamentals/cross-examination',     changefreq: 'monthly', priority: '0.82' },
  { path: '/learn/fundamentals/register',              changefreq: 'monthly', priority: '0.80' },
  // Single-page debate glossary. 65+ terms, anchor IDs, DefinedTermSet
  // schema. Targets entity-level queries.
  { path: '/learn/glossary',                            changefreq: 'weekly',  priority: '0.86' },
  { path: '/community',       changefreq: 'daily',   priority: '0.88' },
  { path: '/leaderboard',     changefreq: 'daily',   priority: '0.85' },
  { path: '/live',            changefreq: 'daily',   priority: '0.90' },
  { path: '/pricing',         changefreq: 'monthly', priority: '0.90' },
  // 2026-07-22: these carried explicit 07-14 dates, which now predate the
  // domain cutover that rewrote their canonical URL. Left as-is they would
  // signal "older than the rest of the site" on the exact crawl where we
  // want Google to re-fetch everything under the new origin.
  { path: '/ambassadors',     changefreq: 'weekly',  priority: '0.75', lastmod: '2026-07-22' },
  { path: '/why-debateit',    changefreq: 'monthly', priority: '0.80', lastmod: '2026-07-22' },
  { path: '/learn',           changefreq: 'monthly', priority: '0.85' },
  // 2026-07-22: '/topics' -> '/topics/'. app/topics/ is a directory, so the
  // slashless form 301s to the trailing-slash one; listing the redirect made
  // every crawl of this entry a wasted hop. Same for '/compare' below.
  { path: '/topics/',         changefreq: 'weekly',  priority: '0.85' },
  { path: '/schools',         changefreq: 'monthly', priority: '0.80' },
  { path: '/high-school',     changefreq: 'monthly', priority: '0.75' },
  // 2026-07-22: '/spar' removed. app/spar.html carries
  // <meta name="robots" content="noindex">, so submitting it here asked
  // Google to crawl a page we tell it not to index — that lands as
  // "Submitted URL marked noindex" in Search Console. The indexable
  // stranger-matching page is /debate-strangers, already listed below.
  { path: '/counter',         changefreq: 'monthly', priority: '0.82' },
  { path: '/changelog',       changefreq: 'weekly',  priority: '0.50' },
  // Indexable, internally linked, never listed here (found 2026-07-23
  // by diffing the page inventory against this array). None carry
  // noindex, so Googlebot reaches them by crawl depth alone today —
  // a weak bet on a site with this little authority to spend.
  // /early is linked from three landing variants, /communication-profile
  // from six pages including /credentials and /verify, /registry from
  // three. Listing them costs nothing and stops discovery depending on
  // how deep a crawl happens to go.
  { path: '/early',                 changefreq: 'weekly',  priority: '0.60' },
  { path: '/communication-profile', changefreq: 'monthly', priority: '0.60' },
  { path: '/registry',              changefreq: 'weekly',  priority: '0.50' },
  { path: '/topics/public-forum',         changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/lincoln-douglas',      changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/policy',               changefreq: 'monthly', priority: '0.80' },
  { path: '/topics/big-questions',        changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/world-schools',        changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/congress',             changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/asian-parliamentary',  changefreq: 'monthly', priority: '0.85' },
  { path: '/topics/british-parliamentary',changefreq: 'monthly', priority: '0.85' },
  { path: '/topics/mun',                  changefreq: 'monthly', priority: '0.75' },
  { path: '/topics/apda',                 changefreq: 'monthly', priority: '0.85' },
  // Issue-debate pages (/debate/{slug}). Two-sided sample AI debates on
  // high-search-volume questions at the debate × AI/tech intersection.
  // Each is an indexable, off-nav SEO landing whose only job is to rank
  // for the question and funnel the reader into /debate-it. Kept out of
  // the topbar nav on purpose; discoverability is sitemap + the /debate
  // hub's internal cross-links. Add new slugs here as the cluster grows.
  { path: '/debate',                                          changefreq: 'weekly',  priority: '0.86' },
  { path: '/debate/should-ai-be-regulated',                   changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/will-ai-replace-human-jobs',               changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-students-be-allowed-to-use-ai',     changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-ai-generated-art-be-copyrighted',   changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-the-us-ban-tiktok',                 changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-social-media-be-banned-for-minors', changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/universal-basic-income',                   changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/is-nuclear-energy-worth-it',               changefreq: 'monthly', priority: '0.80' },
  // 2026-05-22 SEO Pack 1 — 22 new motions: 10 AI-cluster (boosts "ai debate"
  // exact-match topical authority), 8 high-volume political, 4 ed/debate-meta.
  { path: '/debate/is-ai-a-threat-to-humanity',               changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-ai-be-banned',                      changefreq: 'monthly', priority: '0.82' },
  { path: '/debate/should-ai-have-legal-rights',              changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/is-ai-conscious',                          changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-ai-replace-judges',                 changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-ai-doctors-replace-human-doctors',  changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-ai-content-be-labeled',             changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-the-government-control-ai',         changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-ai-be-allowed-in-warfare',          changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/is-ai-bad-for-the-environment',            changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-college-be-free',                   changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-the-minimum-wage-be-raised',        changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-the-electoral-college-be-abolished',changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-billionaires-exist',                changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-the-death-penalty-be-abolished',    changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-vaping-be-banned',                  changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-cars-be-banned-in-city-centers',    changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-prisons-be-abolished',              changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-schools-bring-back-oral-exams',     changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-debate-be-a-required-subject',      changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-homework-be-banned',                changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-standardized-tests-be-abolished',   changefreq: 'monthly', priority: '0.76' },
  // 2026-05-27 SEO Pack 2 — 15 new motions: 7 AI/tech-adjacent (compound
  // "ai debate" topical authority) + 8 evergreen high-volume staples.
  { path: '/debate/should-deepfakes-be-illegal',              changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-self-driving-cars-be-legal',        changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-social-media-companies-be-broken-up', changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-the-government-monitor-citizens-online', changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-cryptocurrency-be-regulated',       changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-ai-be-used-in-policing',            changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-ai-be-used-in-hiring',              changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-marijuana-be-legalized',            changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-the-voting-age-be-lowered',         changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-zoos-be-banned',                    changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-animal-testing-be-banned',          changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-school-uniforms-be-required',       changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-genetic-engineering-be-allowed',    changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-junk-food-be-taxed',                changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/should-the-government-provide-universal-healthcare', changefreq: 'monthly', priority: '0.80' },
  // 2026-07-14 SEO Pack 3 — 10 evergreen high-volume motions: 4 school-cluster
  // (phones, start times, athletes, books) + 6 civic/culture/science staples.
  { path: '/debate/should-cell-phones-be-allowed-in-school',  changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-the-school-day-start-later',        changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-college-athletes-be-paid',          changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/should-sports-betting-be-legal',           changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/do-violent-video-games-cause-violence',    changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/is-cancel-culture-good-for-society',       changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-voting-be-mandatory',               changefreq: 'monthly', priority: '0.78' },
  { path: '/debate/should-books-be-banned-in-schools',        changefreq: 'monthly', priority: '0.80' },
  { path: '/debate/is-space-exploration-worth-the-cost',      changefreq: 'monthly', priority: '0.76' },
  { path: '/debate/is-veganism-better-for-the-environment',   changefreq: 'monthly', priority: '0.76' },
  { path: '/india',           changefreq: 'monthly', priority: '0.90' },
  { path: '/us',              changefreq: 'monthly', priority: '0.85' },
  { path: '/report',          changefreq: 'monthly', priority: '0.60' },
  // debateprep.com — STAGED, DELIBERATELY NOT ENABLED (2026-07-23).
  // app/prep.html and the host rules in netlify.toml shipped in
  // 3ea56578, but the domain still answers on GoDaddy's parking lander:
  // its zone carries two parking A records (15.197.148.33, 3.33.130.190)
  // beside the correct 75.2.60.5, and the host is not a Netlify domain
  // alias yet, so there is no TLS cert for it. Submitting the URL in
  // that state earns a soft 404 on the one page that host owns, which is
  // worse than not submitting it. Cross-host entries are valid here
  // because both properties are verified under the same Search Console
  // account. Note this needs an absolute URL — every other entry is a
  // path joined onto the canonical origin, so enabling it means adding
  // an `absolute: true` branch in the builder below, not just a path.
  // ENABLE once `dig +short A debateprep.com` returns only 75.2.60.5
  // and the alias is on the cert.
  // { path: 'https://debateprep.com/', absolute: true, changefreq: 'weekly', priority: '0.80' },
  // Motion library hub (/motions). The per-motion URLs are appended
  // below from the bank rather than listed here, so adding a motion to
  // lib/motion-library.mjs is a one-file change and the sitemap cannot
  // drift out of sync with what actually renders. The /debate entries
  // above are still hand-listed because that bank predates this and a
  // conversion is a separate change.
  { path: '/motions',         changefreq: 'weekly',  priority: '0.86' },
];

// Every motion in the library, generated from the bank. These are
// substantive pages (both cases, clash, mistakes), not thin templated
// stubs, so unlike the dated /today URLs they earn a sitemap slot.
// Priority sits just under the hub and level with the /debate dossiers.
const MOTION_URLS = listLibraryMotions().map(m => ({
  path: `/motions/${m.slug}`,
  changefreq: 'monthly',
  priority: '0.80',
}));

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function buildXml() {
  const today = todayUtc();
  const urls = URLS.concat(MOTION_URLS).map(u => {
    const lastmod = u.lastmod || (DYNAMIC.has(u.path) ? today : STABLE_DATE);
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
