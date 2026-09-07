import fs from 'node:fs';
import path from 'node:path';

// Current system: DM Sans headings, Inter body, Source Serif 4 for judge
// writing, and Geist Mono for figures. Archivo stays available for legacy
// page rules and the wordmark. Keep the root/app CSS mirrors byte-identical.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const ok = (condition, message) => {
  if (!condition) fail.push(message);
};

const ui = read('app/css/ui.css');
ok(ui.includes("--font-body:'Inter'"), 'ui.css sets Inter as --font-body');
ok(ui.includes("--font-display:'DM Sans'"), 'ui.css sets DM Sans as --font-display');
ok(ui.includes("--font-judge:'Source Serif 4'"), 'ui.css sets Source Serif 4 as --font-judge');
ok(ui.includes("--font-mono:'Geist Mono'"), 'ui.css sets Geist Mono as --font-mono');
ok(/body\{[\s\S]*font-family:var\(--font-body\) !important/.test(ui), 'ui.css forces body text to the house font');
ok(/h1,h2,h3,h4,h5,h6\{[\s\S]*font-family:var\(--font-display\) !important/.test(ui), 'ui.css forces headings to the house font');
ok(!ui.includes('Crimson+Pro') && !ui.includes("'Crimson Pro'"), 'ui.css does not load the retired Crimson Pro face');

for (const file of ['topic.css', 'compare-light.css', 'seo-light.css', 'audience.css']) {
  const deployed = read(`app/css/${file}`);
  const mirror = read(`css/${file}`);
  ok(deployed === mirror, `css/${file} mirrors app/css/${file}`);
  ok(deployed.includes('Archivo') && deployed.includes('Inter'), `app/css/${file} loads the current sans families`);
  ok(!deployed.includes('Crimson+Pro'), `app/css/${file} does not load Crimson Pro`);
}
const seoGrowth = read('app/seo-growth.css');
ok(seoGrowth === read('seo-growth.css'), 'seo-growth.css mirrors app/seo-growth.css');
ok(seoGrowth.includes('Archivo') && seoGrowth.includes('Inter') && !seoGrowth.includes('Crimson+Pro'), 'seo-growth.css uses the current sans families');

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
  ok(html.includes('DM+Sans') && html.includes('Inter:wght'), `${file} loads the current house fonts`);
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
