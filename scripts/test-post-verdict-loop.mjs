// Contract checks for the second-round loop across typed and voice ballots.
// Run with: node scripts/test-post-verdict-loop.mjs
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const practice = read('app/practice.html');
const voiceRfd = read('app/voice-rfd.html');
const newvoice = read('app/newvoice.html');

let passed = 0;
let failed = 0;
function check(label, ok) {
  if (ok) { passed++; console.log('PASS', label); }
  else { failed++; console.log('FAIL', label); }
}

for (const [name, src] of [['typed ballot', practice], ['voice ballot', voiceRfd], ['quick voice recap', newvoice]]) {
  check(name + ' has Rematch', src.includes('Rematch'));
  check(name + ' has New motion', src.includes('New motion'));
  check(name + ' has Practice weakest score', src.includes('Practice weakest score'));
  check(name + ' has Share verdict', src.includes('Share verdict'));
}

check('typed rematch keeps the current motion', practice.includes("kind === 'rematch' && motion"));
check('typed new motion uses the direct now route', practice.includes("q.set('now', '1')"));
check('typed quick rubric normalizes all three score dimensions',
  practice.includes("max: 15") && practice.includes("max: 10") && practice.includes("max: 5"));
check('typed full ballot falls back to the lowest user speech',
  practice.includes('userSpeeches.sort((a, b) => parseFloat(a.score) - parseFloat(b.score))'));
check('typed weakness launches a two-minute voice drill',
  practice.includes("return '/voice-debate?' + q.toString()"));

check('voice ballot preserves mode and side on rematch',
  voiceRfd.includes("roundQ.set('mode'") && voiceRfd.includes("roundQ.set('side'"));
check('voice ballot finds the lowest viva stage', voiceRfd.includes('lowestStage.score'));
check('voice ballot derives a drill from the judge text', voiceRfd.includes('drillModeFor(weakestText, isViva)'));
check('voice verdict uses native share with clipboard fallback',
  voiceRfd.includes('navigator.share') && voiceRfd.includes('navigator.clipboard.writeText(url)'));

check('quick voice waits for the verdict before enabling drill and share',
  newvoice.includes("$('weakestBtn').disabled = false") && newvoice.includes("$('shareVerdictBtn').disabled = false"));
check('quick voice new motion starts immediately', newvoice.includes('show(\'setup\'); start();'));
check('quick voice drill carries the judge target', newvoice.includes("q.set('background', 'Targeted drill from the last judge verdict."));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
