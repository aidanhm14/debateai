// Contract checks for the remembered loadout and explicit AI queue exit.
// Run with: node scripts/test-instant-start.mjs
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const prefs = read('app/js/prefs-sync.js');
const topbar = read('app/js/topbar.js');
const practice = read('app/practice.html');
const voice = read('app/voice-debate.html');
const newvoice = read('app/newvoice.html');
const spar = read('app/spar.html');

let passed = 0;
let failed = 0;
function check(label, ok) {
  if (ok) { passed++; console.log('PASS', label); }
  else { failed++; console.log('FAIL', label); }
}

[
  'debateos-round-format', 'debateos-round-side', 'debateos-round-voice',
  'debateos-round-duration', 'debateos-voice-mode', 'debateos-voice-side',
  'debateai-persona', 'debateos-newvoice-side'
].forEach((key) => check('account sync includes ' + key, prefs.includes("'" + key + "'")));

check('global action clearly starts an AI debate', /href: '\/practice\?now=1', label: 'Debate an AI'/.test(topbar));
check('practice seeds the saved format', practice.includes("localStorage.getItem('debateos-round-format')"));
check('practice seeds the saved side', practice.includes("localStorage.getItem('debateos-round-side')"));
check('practice seeds the saved voice', practice.includes("localStorage.getItem('debateos-round-voice')"));
check('practice launch requires an explicit now flag', practice.includes("qs.get('now') === '1'"));
check('practice launch stages one start', practice.includes('setInstantStartPending(true)'));
check('voice trainer saves mode', voice.includes("localStorage.setItem('debateos-voice-mode', mode)"));
check('voice trainer saves side', voice.includes("localStorage.setItem('debateos-voice-side', side)"));
check('voice trainer saves persona', voice.includes('rememberPersona(personaKey)'));
check('quick voice saves side', newvoice.includes("localStorage.setItem('debateos-newvoice-side', side)"));

check('human queue starts with a factual status', spar.includes('Searching the live queue'));
check('queue promises no automatic AI switch', spar.includes('We will not switch you to AI.'));
check('AI choice appears after a short wait', /elapsed >= 12[^]*aiOpponentOffer/.test(spar));
check('AI option is explicit', spar.includes('Debate AI now'));
check('human wait remains explicit', spar.includes('Keep searching'));
check('AI click starts the chosen format', spar.includes("'/practice?now=1&format='"));
check('old unverifiable queue claims are gone', !spar.includes('Pinging recent sparrers') && !spar.includes('Searching active circuits'));
check('no timer invokes fallback', !/setTimeout\s*\(\s*renderFallback/.test(spar));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
