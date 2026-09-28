// Contract checks for the remembered loadout and explicit AI queue exit.
// Run with: node scripts/test-instant-start.mjs
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const prefs = read('app/js/prefs-sync.js');
const topbar = read('app/js/topbar.js');
const practice = read('app/practice.html');
const voice = read('app/voice-debate.html');
const newvoice = read('app/newvoice.html');
const realtimeSession = read('app/netlify/functions/realtime-session.mjs');
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

check('global AI pill is off the rail', !/label: 'Debate an AI'/.test(topbar));
check('Explore menu routes the one public AI door to the /newvoice setup screen', topbar.includes("href: '/newvoice?handoff=topbar-ai'") && topbar.includes("label: 'Solo practice'") && !topbar.includes('autostart=1'));
check('default practice starts in casual 1v1', practice.includes("if (!COMPETITIVE_ENTRY) return 'quick';") && !practice.includes("localStorage.getItem('debateos-round-format')"));
// 2026-09-07, Aidan: 1v1 only. The competitive entry still exists but its
// picker offers only one-on-one structures; the parliamentary and US-circuit
// groups (2v2 / 3v3 / 4-team formats) are gone from every picker.
check('competitive practice is an explicit scoped entry',
  practice.includes("get('entry') === 'competitive'") &&
  practice.includes("{ cap: 'One-on-one', keys: ['quick', 'ld'] }") &&
  !practice.includes("{ cap: 'Parliamentary', keys: ['apda', 'bp', 'asian', 'worlds', 'popper'] }") &&
  !practice.includes("{ cap: 'US circuit', keys: ['pf', 'ld', 'policy', 'congress'] }"));
check('competitive practice falls through to the default one-on-one structure',
  practice.includes("if (picked && isOneOnOne(picked) && picked !== 'quick') return picked;") &&
  practice.includes("g.keys.filter(isOneOnOne)."));
check('practice seeds the saved side', practice.includes("localStorage.getItem('debateos-round-side')"));
check('practice seeds the saved voice', practice.includes("localStorage.getItem('debateos-round-voice')"));
check('practice launch requires an explicit now flag', practice.includes("qs.get('now') === '1'"));
check('practice launch stages one start', practice.includes('setInstantStartPending(true)'));
check('voice trainer saves mode', voice.includes("localStorage.setItem('debateos-voice-mode', mode)"));
check('voice trainer saves side', voice.includes("localStorage.setItem('debateos-voice-side', side)"));
check('voice trainer saves persona', voice.includes('rememberPersona(personaKey)'));
check('quick voice saves side', newvoice.includes("localStorage.setItem('debateos-newvoice-side', side)"));

check('human queue starts with a factual status', spar.includes('Searching the live queue'));
check('queue waits for mutual acceptance', spar.includes('The room opens when you both accept.'));
check('waiting stage offers an explicit AI link', spar.includes('href="/newvoice?handoff=spar-wait-stage"') && spar.includes('data-cta="spar-wait-ai">Debate the AI'));
check('AI option is explicit', spar.includes('Debate the AI'));
check('human wait remains explicit', spar.includes('Keep waiting'));
check('AI click opens the /newvoice setup screen', /function aiOfferDest\(\)\{\s*return '\/newvoice\?handoff=spar-ai-choice'/.test(spar));
check('the queue can be cancelled without a time limit', spar.includes('id="cancelBtn">Stop searching') && spar.includes('id="countdownNum">No time limit'));
check('old unverifiable queue claims are gone', !spar.includes('Pinging recent sparrers') && !spar.includes('Searching active circuits'));
check('no timer invokes fallback', !/setTimeout\s*\(\s*renderFallback/.test(spar));

check('practice voice CTA opens the live room immediately',
  practice.includes("q.set('autostart', '1')") && practice.includes("return '/newvoice?' + q.toString()") && !practice.includes("return '/voice-debate?' + q.toString()"));
// The AI setup offers two voice modes. Timed rounds and the old typed
// competitive handoff have been retired from this door.
check('direct newvoice offers its two supported voice modes',
  newvoice.includes('Casual back-and-forth') &&
  newvoice.includes('<b>Conversation</b>') &&
  !newvoice.includes('<b>Timed round</b>') &&
  !newvoice.includes('For competitive debaters.') &&
  !newvoice.includes('Karl Popper') &&
  !newvoice.includes('3 types of debate out loud.'));
check('conversation path reaches the realtime prompt',
  newvoice.includes("debateStyle = btn.dataset.path === 'conversation'") &&
  newvoice.includes('debateStyle,') &&
  realtimeSession.includes("body.debateStyle === 'conversation'") &&
  realtimeSession.includes('CONVERSATION MODE:'));
check('AI setup has no retired typed-round handoff', !/href="\/practice\?entry=competitive/.test(newvoice));
check('newvoice auto-starts only when the door handed a motion',
  newvoice.includes("const autoStart = !trainingRequested && entryQuery.get('autostart') === '1'") &&
  newvoice.includes('if (autoStart && handedMotion && !previewMode) {') &&
  newvoice.includes("window.addEventListener('DOMContentLoaded', () =>"));
check('generic doors carry no autostart', !topbar.includes('autostart=1') && !spar.includes('autostart=1'));
check('the typed handoff still opens the room immediately with its motion',
  practice.includes("q.set('motion', motion.trim().slice(0, 220));") && practice.includes("q.set('autostart', '1');"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
