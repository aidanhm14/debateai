import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const ok = (condition, message) => {
  if (!condition) fail.push(message);
};

const ui = read('app/css/ui.css');
ok(ui.includes("--font-body:'Inter'"), 'ui.css exposes Inter as --font-body');
ok(ui.includes("--font-display:'Crimson Pro'"), 'ui.css exposes Crimson Pro as --font-display');
ok(ui.includes('--font-legacy-serif'), 'ui.css keeps the previous serif stack for rollback');
ok(/body\{[\s\S]*font-family:var\(--font-body\) !important/.test(ui), 'ui.css forces body text to Flow body font');
ok(/h1,h2,h3,h4,h5,h6\{[\s\S]*font-family:var\(--font-display\) !important/.test(ui), 'ui.css forces headings to Flow display font');

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
  ok(css.includes('Crimson+Pro') && css.includes('Inter'), `${file} loads the Flow font pair`);
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
  ok(html.includes('Inter') && html.includes('Crimson'), `${file} declares the Flow font pair`);
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
