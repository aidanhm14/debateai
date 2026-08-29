import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../app/landing.html', import.meta.url), 'utf8');
const appEdge = new URL('../app/netlify/edge-functions/share-title.mjs', import.meta.url);
const rootEdge = new URL('../netlify/edge-functions/share-title.mjs', import.meta.url);

function metaContent(attribute, name) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${name}["'])[^>]*\\bcontent=["']([^"']+)["'][^>]*>`, 'i');
  return (landing.match(pattern) || [])[1] || '';
}

const ogTitle = metaContent('property', 'og:title');
const twitterTitle = metaContent('name', 'twitter:title');
const checks = [
  ['Open Graph and Twitter titles are present', Boolean(ogTitle && twitterTitle)],
  ['Open Graph and Twitter use one pinned title', ogTitle === twitterTitle],
  ['retired title assignment metadata is absent', !landing.includes('debatable:share-title-variant')],
  ['retired title experiment tracking is absent', !landing.includes('share_title_view') && !landing.includes('__shareTitleAb')],
  ['retired edge function remains removed', !fs.existsSync(appEdge) && !fs.existsSync(rootEdge)],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
