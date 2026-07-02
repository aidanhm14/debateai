// /sitemap-programs.xml — sitemap for the /programs state directory.
//
// Emits /programs plus one URL per state that has mapped programs.
// Data is baked (lib/programs-data.mjs), so this costs zero Firestore
// reads and can cache hard. Referenced from sitemap-index.xml + robots.

import { PROGRAMS, STATE_NAMES } from './lib/programs-data.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const LASTMOD = '2026-07-02'; // bump when the baked dataset refreshes

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default async () => {
  const states = new Set(PROGRAMS.map((p) => p.st));
  const urls = [`${SITE_ORIGIN}/programs`];
  for (const st of states) {
    const name = STATE_NAMES[st];
    if (name) urls.push(`${SITE_ORIGIN}/programs/${slugify(name)}`);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${LASTMOD}</lastmod></url>`).join('\n')}
</urlset>`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

export const config = {
  path: '/sitemap-programs.xml',
};
