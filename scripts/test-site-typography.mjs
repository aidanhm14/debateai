import fs from 'node:fs';
import path from 'node:path';

// Crimson Pro is the universal face: body AND display, every page.
// The 2026-08-10 Flow pairing (Inter body + Crimson display) was reverted
// the same week. These checks exist so a sans body face cannot creep back
// onto the shared surfaces one page at a time.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const ok = (condition, message) => {
  if (!condition) fail.push(message);
};

const ui = read('app/css/ui.css');
ok(ui.includes("--font-body:'Crimson Pro'"), 'ui.css sets Crimson Pro as --font-body');
ok(ui.includes("--font-display:'Crimson Pro'"), 'ui.css sets Crimson Pro as --font-display');
ok(/body\{[\s\S]*font-family:var\(--font-body\) !important/.test(ui), 'ui.css forces body text to the house font');
ok(/h1,h2,h3,h4,h5,h6\{[\s\S]*font-family:var\(--font-display\) !important/.test(ui), 'ui.css forces headings to the house font');
ok(!/--font-body:'Inter'/.test(ui), 'ui.css does not reintroduce a sans body face');

for (const file of [
  'app/css/topic.css',
  'css/topic.css',
  'app/css/compare-light.css',
  'css/compare-light.css',
  'app/css/seo-light.css',
  'css/seo-light.css',
  'app/css/audience.css',
  'css/audience.css',
  'app/seo-growth.css',
  'seo-growth.css'
]) {
  const css = read(file);
  ok(css.includes('Crimson+Pro'), `${file} loads Crimson Pro`);
  ok(!/font-family:\s*'Inter'/.test(css), `${file} does not set Inter as a body face`);
}

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
  ok(html.includes('Crimson'), `${file} declares the house font`);
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
