import fs from 'node:fs';
import path from 'node:path';

// Current system (2026-09-07, "B"): Source Serif 4 headlines (h1-h3 via
// --font-headline), Archivo for interface and body (--font-display and
// --font-body), Source Serif 4 for judge writing, Geist Mono for figures.
// DM Sans, Inter and Instrument Serif are retired and must not load.
// Keep the root/app CSS mirrors byte-identical.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const ok = (condition, message) => {
  if (!condition) fail.push(message);
};

const ui = read('app/css/ui.css');
ok(ui.includes("--font-headline:'Source Serif 4'"), 'ui.css sets Source Serif 4 as --font-headline');
ok(ui.includes("--font-body:'Archivo'"), 'ui.css sets Archivo as --font-body');
ok(ui.includes("--font-display:'Archivo'"), 'ui.css sets Archivo as --font-display');
ok(!/DM\+Sans|'DM Sans'|Inter:wght|'Inter'|Instrument\+Serif/.test(ui), 'ui.css does not load the retired DM Sans / Inter / Instrument Serif faces');
ok(ui.includes("--font-judge:'Source Serif 4'"), 'ui.css sets Source Serif 4 as --font-judge');
ok(ui.includes("--font-mono:'Geist Mono'"), 'ui.css sets Geist Mono as --font-mono');
ok(/body\{[\s\S]*font-family:var\(--font-body\) !important/.test(ui), 'ui.css forces body text to the house font');
ok(/h1,h2,h3\{[\s\S]*font-family:var\(--font-headline\) !important/.test(ui), 'ui.css forces h1-h3 to the serif headline face');
ok(/h4,h5,h6\{[\s\S]*font-family:var\(--font-display\) !important/.test(ui), 'ui.css keeps h4-h6 on the interface sans');
ok(!ui.includes('Crimson+Pro') && !ui.includes("'Crimson Pro'"), 'ui.css does not load the retired Crimson Pro face');

for (const file of ['topic.css', 'compare-light.css', 'seo-light.css', 'audience.css']) {
  const deployed = read(`app/css/${file}`);
  const mirror = read(`css/${file}`);
  ok(deployed === mirror, `css/${file} mirrors app/css/${file}`);
  ok(deployed.includes('Archivo') && !/DM\+Sans|'Inter'|Inter:wght/.test(deployed), `app/css/${file} loads Archivo and none of the retired faces`);
  ok(!deployed.includes('Crimson+Pro'), `app/css/${file} does not load Crimson Pro`);
}
const seoGrowth = read('app/seo-growth.css');
ok(seoGrowth === read('seo-growth.css'), 'seo-growth.css mirrors app/seo-growth.css');
ok(seoGrowth.includes('Archivo') && !/DM\+Sans|'Inter'|Inter:wght|Crimson\+Pro/.test(seoGrowth), 'seo-growth.css uses Archivo and none of the retired faces');

for (const file of [
  'app/newvoice.html',
  'app/benchmark.html',
  'app/registry.html',
  'app/tournaments.html',
  'app/counter.html',
  'app/float.html',
  'app/changelog.html',
  'app/privacy.html',
  'app/terms.html',
  'app/atlas.html',
  'app/oral-exam-prep.html',
  'app/index.html'
]) {
  const html = read(file);
  ok(html.includes('family=Archivo') && html.includes('Source+Serif+4'), `${file} loads the current house fonts`);
  ok(!html.includes('DM+Sans') && !html.includes('Inter:wght'), `${file} does not load the retired DM Sans / Inter`);
}

for (const file of [
  'app/ai-debate-practice.html',
  'app/debate-case-generator.html',
  'app/debate-topic-generator.html',
  'app/debate-ai-tools.html',
  'app/prediction-market-debate.html'
]) {
  const html = read(file);
  ok(html.includes('/seo-growth.css'), `${file} loads seo-growth.css`);
  ok(!html.includes('Debate<em>AI</em>') && !html.includes('DebateAI search hub'), `${file} does not use the retired visible brand`);
}

if (fail.length) {
  console.error(fail.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('Typography sweep checks passed');
