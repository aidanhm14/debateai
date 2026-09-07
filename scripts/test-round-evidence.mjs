// Guards app/js/round-evidence.js, the gate in front of the live judge.
// 2026-09-07: a conversation round labels each line "Name (For):" /
// "Name (Against):" (the format's side labels), and the side reader only
// knew the bench keys. Eleven minutes of transcribed conversation read
// as silence and the judge was never called. Runs in the pre-commit hook.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RE = require('../app/js/round-evidence.js');

let fails = 0;
function ok(cond, msg){ if (!cond){ fails++; console.error('FAIL', msg); } }

const talk = (text) => ({ format: 'open', proName: 'Jonas', conName: 'Phat',
  speeches: [{ code: 'TALK', side: 'pro', open: true, text }] });

// The exact shape that shipped as "No winner" on 2026-09-07.
let a = RE.assess(talk('Jonas (For): Unions are going to be obsolete because of nationalization.\n\nPhat (Against): Unions are going to become more necessary.'));
ok(a.ok && a.pro && a.con, 'For/Against labels count as both sides speaking');

// Every label a format prints, both benches.
for (const [pro, con] of [['Pro','Con'],['Proposition','Opposition'],['Government','Opposition'],['Aff','Neg'],['Affirmative','Negative'],['Gov','Opp'],['OG','OO']]){
  const r = RE.assess(talk(`Jonas (${pro}): a full argument here.\n\nPhat (${con}): a full reply here.`));
  ok(r.ok, `labels ${pro}/${con} recognised`);
}

// Unknown label, known seat name: the name decides.
a = RE.assess(talk('Jonas (Yes): a full argument here.\n\nPhat (No): a full reply here.'));
ok(a.ok, 'seat names resolve a label the reader does not know');

// One side only is still a missing side, not a contest.
a = RE.assess(talk('Jonas (For): a full argument here.\n\nJonas (For): and more of it.'));
ok(!a.ok && a.pro && !a.con && a.reason === 'missing_side_speech', 'one side talking is missing_side_speech');

// Placeholders are still not speech.
a = RE.assess(talk('Jonas (For): (no transcript)\n\nPhat (Against): [skipped]'));
ok(!a.ok && a.reason === 'no_speech', 'placeholders are not speech');

// Timed formats are untouched.
a = RE.assess({ format: 'quick', speeches: [{ side: 'pro', text: 'an opening' }, { side: 'con', text: 'a reply' }] });
ok(a.ok, 'timed round with both sides');
a = RE.assess({ format: 'quick', speeches: [{ side: 'pro', text: 'an opening' }, { side: 'con', text: '(no transcript)' }] });
ok(!a.ok && a.reason === 'missing_side_speech', 'timed round missing a side');

// The message the page prints.
const nc = RE.noContest(talk(''));
ok(/No speech was captured/.test(nc.reason) && nc.outcome === 'no_contest', 'noContest shape');

if (fails){ console.error(fails + ' round-evidence guard(s) failed'); process.exit(1); }
console.log('round-evidence guard: ok');
