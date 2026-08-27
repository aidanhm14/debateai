import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_LIBRARY } from '../app/netlify/functions/lib/prompts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const practice = fs.readFileSync(path.join(root, 'app/practice.html'), 'utf8');
const voiceGuidelines = fs.readFileSync(path.join(root, 'app/netlify/functions/lib/voice-guidelines.mjs'), 'utf8');
let failures = 0;

function ok(condition, label) {
  if (condition) {
    console.log('PASS', label);
    return;
  }
  failures += 1;
  console.error('FAIL', label);
}

const caseBase = PROMPT_LIBRARY.caseBase || '';
const motionDesigner = PROMPT_LIBRARY.motionDesigner || '';

for (const marker of [
  'FAIR ARCHITECTURE',
  'PRESERVE THE MOTION',
  'AUDIENCE EDITORIAL TEST',
  'ONE EDITORIAL THESIS',
  'FACT DESK',
  'FAIR ARCHITECTURE, COMMITTED ADVOCACY',
]) {
  ok(caseBase.includes(marker), 'case prompt keeps ' + marker.toLowerCase());
}

ok(motionDesigner.includes('AUDIENCE EDITORIAL TEST'), 'motion designer uses the same audience test');
ok(motionDesigner.includes('coin-flip test'), 'motion designer keeps the fairness gate');

for (const promptId of ['caseEditSelection', 'caseEditGeneral']) {
  const text = PROMPT_LIBRARY[promptId] || '';
  ok(text.includes('FACT DESK'), promptId + ' keeps fact discipline during revisions');
  ok(text.includes('PRESERVE THE MOTION'), promptId + ' cannot hide a motion rewrite');
}

for (const stale of [
  'other side sound like they are fighting gravity',
  'PROBABLY NO BUT OPP HAS A NARROW PATH',
  'Every warrant must name at least one specific actor, institution, or empirical precedent',
  '2+ named thinkers, scholars, or practitioners',
  'BUILD "KILLER LINES" INTO EVERY CASE',
  'Picture a single mother in Lagos',
]) {
  ok(!caseBase.includes(stale), 'case prompt rejects stale instruction: ' + stale);
}

ok(client.includes('CRITICAL. FAIR ARCHITECTURE, COMMITTED ADVOCACY'), 'client generation request preserves fair architecture');
ok(client.includes('CRITICAL. AUDIENCE AND EDITORIAL VALUE'), 'client generation request preserves audience value');
ok(client.includes('CRITICAL. FACT DESK'), 'client generation request preserves fact discipline');
ok(!client.includes('Opp probably can\'t win under this framework'), 'client no longer asks for a rigged framework');

for (const marker of [
  'EDITORIAL CASE TEST. FAIR ARCHITECTURE, COMMITTED ADVOCACY',
  'A cold listener should understand inside the first 20 to 30 seconds',
  'Give the case one editorial thesis',
  'Relevance beats recency; significance beats novelty',
]) {
  ok(practice.includes(marker), 'live practice prompt keeps: ' + marker);
}

ok(voiceGuidelines.includes('EDITORIAL CASE STANDARD. FAIR ARCHITECTURE, COMMITTED ADVOCACY'), 'server voice bank carries the editorial standard');
ok(voiceGuidelines.includes('Run a fact desk'), 'server voice bank carries fact discipline');

for (const stale of [
  'What decision rule locks in my side?',
  'a good framework makes your impacts weigh more and theirs weigh less without you needing better arguments',
  'A smart definition narrows the debate to terrain where your arguments are strongest',
]) {
  ok(!practice.includes(stale), 'live practice prompt rejects stale instruction: ' + stale);
}

if (failures) {
  console.error('\n' + failures + ' case editorial guard failure(s).');
  process.exit(1);
}

console.log('\nCase editorial standard holds.');
