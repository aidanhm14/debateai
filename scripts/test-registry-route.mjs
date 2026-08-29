import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const appToml = read('app/netlify.toml');
const rootToml = read('netlify.toml');
const landing = read('app/landing.html');
const landingFull = read('app/landing-full.html');
const landingClassic = read('app/landing-classic.html');

const redirect = /from = "\/registry"\s+to = "\/credentials"\s+status = 301\s+force = true/;
const checks = [
  ['app config retires the broken registry route', redirect.test(appToml)],
  ['root config mirrors the registry redirect', redirect.test(rootToml)],
  ['public landing variants do not link the dead page', [landing, landingFull, landingClassic].every((html) => !html.includes('href="/registry"'))],
  ['no unreviewed public registry endpoint exists', !fs.existsSync(new URL('../app/netlify/functions/list-recent-certs.mjs', import.meta.url))],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
