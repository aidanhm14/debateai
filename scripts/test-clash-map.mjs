// Regression suite for the clash map (app/netlify/functions/lib/clash-map.mjs).
//
// The quote-verification gate is the whole basis for showing this thing to
// users: the map's promise is "check it yourself", so a row whose quote is
// not in the transcript has to die before it ever reaches a page. Most of
// what follows exercises that gate against the ways a model gets it wrong.
//
//   node scripts/test-clash-map.mjs

import { readFileSync } from 'node:fs';
import { parseClashMap, clashMapForBallot, CLASH_DISCIPLINE, CLASH_LABELS } from '../app/netlify/functions/lib/clash-map.mjs';
import { DEBATE_VOICE } from '../app/netlify/functions/lib/voice-guidelines.mjs';

const { forFeature } = DEBATE_VOICE;

const round = {
  motion: 'This House would make voting compulsory.',
  format: 'quick',
  turns: [
    { n: 1, transcript: 'Compulsory voting fixes the turnout gap that hands elections to whoever can mobilise the most reliable base. When everyone votes, parties stop chasing the margins and start writing policy for the median household. Australia has run this for a century and turnout sits above ninety percent.' },
    { n: 2, transcript: 'Turnout is not the problem, informed turnout is. Dragging a disengaged voter to a booth produces a donkey vote, not representation. I accept that Australian turnout is high, that is simply not in dispute, but high turnout has not made Australian politics measurably less polarised.' },
    { n: 3, transcript: 'They never answered the mobilisation point at all. Their whole case rests on the claim that a compelled vote is an uninformed vote, and they gave no reason to believe compulsion changes what a voter knows.' },
  ],
};

let pass = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else failures.push(name); }

const GOOD = [
  { claim: 'Compulsion flattens the mobilisation advantage', by: 'prop',
    claimQuote: 'When everyone votes, parties stop chasing the margins and start writing policy for the median household',
    label: 'dropped', responseQuote: '', note: 'Opp answers the informedness claim, never the mobilisation one.' },
  { claim: 'Australian turnout is above ninety percent', by: 'prop',
    claimQuote: 'Australia has run this for a century and turnout sits above ninety percent',
    label: 'conceded', responseQuote: 'I accept that Australian turnout is high, that is simply not in dispute',
    note: 'Explicitly granted, then routed around.' },
  { claim: 'A compelled vote is an uninformed vote', by: 'opp',
    claimQuote: 'Dragging a disengaged voter to a booth produces a donkey vote, not representation',
    label: 'rebutted', responseQuote: 'they gave no reason to believe compulsion changes what a voter knows',
    note: 'Prop contests the link rather than the claim.' },
];
const wrap = (clashes) => JSON.stringify({ clashes });

// ── happy path ──────────────────────────────────────────────────────
const m = parseClashMap(wrap(GOOD), round);
check('valid map survives', m && m.clashes.length === 3);
check('nothing rejected', m && m.rejected === 0);
check('dropped row carries no response quote', m && m.clashes[0].responseQuote === '');
check('label preserved', m && m.clashes[2].label === 'rebutted');
check('prose around the JSON is tolerated',
  (parseClashMap('Here is the map:\n' + wrap(GOOD) + '\nDone.', round) || {}).clashes?.length === 3);

// Whisper punctuation and model retyping never match character for character.
check('normalized matching tolerates punctuation and casing drift',
  (parseClashMap(wrap([{ ...GOOD[0], claimQuote: 'when everyone votes -- parties stop chasing the margins, and start writing policy for the median household!' }]), round) || {}).clashes?.length === 1);

// ── the gate ────────────────────────────────────────────────────────
check('invented claim quote is rejected',
  parseClashMap(wrap([{ ...GOOD[0], claimQuote: 'Compulsory voting has been shown to reduce extremism by forty percent in every democracy studied' }]), round) === null);
check('quote attributed to the wrong side is rejected',
  parseClashMap(wrap([{ ...GOOD[0], claimQuote: GOOD[2].claimQuote }]), round) === null);
check('invented response quote is rejected',
  parseClashMap(wrap([{ ...GOOD[1], responseQuote: 'Australian turnout figures are inflated by informal ballots' }]), round) === null);
check('a response quote taken from the claimant is rejected',
  parseClashMap(wrap([{ ...GOOD[1], responseQuote: GOOD[0].claimQuote }]), round) === null);
check('too-short quote is rejected',
  parseClashMap(wrap([{ ...GOOD[0], claimQuote: 'Australia' }]), round) === null);
check('unknown label is rejected', parseClashMap(wrap([{ ...GOOD[0], label: 'ignored' }]), round) === null);
check('missing side is rejected', parseClashMap(wrap([{ ...GOOD[0], by: '' }]), round) === null);
check('non-dropped row with no response quote is rejected',
  parseClashMap(wrap([{ ...GOOD[1], responseQuote: '' }]), round) === null);

// A bad row costs its own coverage, not the whole map. This is deliberately
// unlike the ballot's dimensions block, which is all-or-nothing.
const mixed = parseClashMap(wrap([GOOD[0], { ...GOOD[0], claim: 'Fabricated', claimQuote: 'I never said any of these particular words at all' }, GOOD[1]]), round);
check('bad row dropped individually, good rows kept', mixed && mixed.clashes.length === 2);
check('rejected count is reported', mixed && mixed.rejected === 1);
check('duplicate rows collapse', (parseClashMap(wrap([GOOD[0], GOOD[0]]), round) || {}).clashes?.length === 1);
check('map is capped at eight rows',
  (parseClashMap(wrap(Array.from({ length: 14 }, (_, i) => ({ ...GOOD[i % 3], claim: 'row ' + i }))), round) || {}).clashes?.length <= 8);

// ── degenerate input ────────────────────────────────────────────────
check('empty clash list is null', parseClashMap('{"clashes":[]}', round) === null);
check('non-JSON is null', parseClashMap('I could not do that.', round) === null);
check('empty string is null', parseClashMap('', round) === null);
check('missing clashes key is null', parseClashMap('{"ok":true}', round) === null);
check('transcript-less round rejects everything',
  parseClashMap(wrap(GOOD), { turns: [{ n: 1, transcript: '' }, { n: 2, transcript: '' }] }) === null);

// ── the ballot block ────────────────────────────────────────────────
const block = clashMapForBallot(m);
check('ballot block names every clash', (block.match(/DROPPED|CONCEDED|REBUTTED|SELF-CONTRADICTION/g) || []).length === 3);
check('ballot block tells the judge the map can be wrong', /can be wrong/.test(block));
check('ballot block never asserts a winner', !/\bwins\b|\bwinner\b/i.test(block));
check('ballot block is empty without a map', clashMapForBallot(null) === '');
check('ballot block is empty for an empty map', clashMapForBallot({ clashes: [] }) === '');

// ── brain integration ───────────────────────────────────────────────
// The AI debater is taught the same four labels the judge records, so it
// argues against the standard it is graded on.
const marker = 'CLASH DISCIPLINE';
for (const feat of ['case', 'sneaky', 'rebuttal', 'bot', 'simulator', 'practice']) {
  check(`speech feature carries clash discipline: ${feat}`, forFeature(feat).includes(marker));
}
// Judging and feedback surfaces take no turn, and the judge already carries
// ADJUDICATION_CORE, which owns the same reasoning from the other side.
for (const feat of ['judge', 'feedback', 'adaptive']) {
  check(`non-speech feature stays clean: ${feat}`, !forFeature(feat).includes(marker));
}

// ── the round page's renderer ───────────────────────────────────────
// clashHtml is lifted out of rounds.html and run for real rather than
// reimplemented here, so this cannot pass against a copy that has drifted
// from what ships. Escaping matters more than usual on this surface: every
// string in a clash row is model output derived from what a user said into
// a microphone, so a debater can attempt injection through their own turn.
const page = readFileSync(new URL('../app/rounds.html', import.meta.url), 'utf8');
const src = page.slice(page.indexOf('var CLASH_TAG ='), page.indexOf('function dimBarsHtml'));
check('clashHtml was found in rounds.html', src.includes('function clashHtml'));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clashHtml = new Function('esc', 'state', 'sfx', src + '\nreturn clashHtml;')(
  esc, { clashDisputed: { 'rd1__1': 'dropped' } }, () => {});

const html = clashHtml(m, 'Priya R.', 'Marcus T.', 'rd1', { '0': 3 });
check('renders one row per clash', (html.match(/class="cm-row"/g) || []).length === 3);
check('dropped row shows only the claimant quote', (html.match(/cm-q/g) || []).length === 5);
check('label chips render', /data-l="dropped"/.test(html) && /data-l="conceded"/.test(html));
check('advisory framing is on the card', /does not decide the round/.test(html));
check('undisputed row offers the control', /data-cdopen="0"/.test(html));
check('picker omits the label already applied',
  !/data-cd="0" data-cdl="dropped"/.test(html) && /data-cd="0" data-cdl="conceded"/.test(html));
check('picker offers an unlabelled option', /data-cdl=""/.test(html));
check('already-disputed row shows its own choice and no control',
  /You flagged this as dropped/.test(html) && !/data-cdopen="1"/.test(html));
check('dispute count renders', /3 flagged this mapping/.test(html));
check('rows nobody contested show no count', (html.match(/flagged this mapping/g) || []).length === 1);
check('no map renders nothing', clashHtml(null, 'a', 'b', 'rd1', null) === '');
check('empty map renders nothing', clashHtml({ clashes: [] }, 'a', 'b', 'rd1', null) === '');

// Injection through a debater's own speech.
const hostile = clashHtml({ clashes: [{
  claim: '<img src=x onerror=alert(1)>', by: 'prop',
  claimQuote: '"><script>alert(2)</script>', label: 'dropped" onmouseover="alert(3)',
  responseQuote: '', note: "</p><script>alert(4)</script>",
}] }, 'Priya R.', 'Marcus T.', 'rd1', null);
check('claim markup is escaped', !/<img src=x/.test(hostile) && /&lt;img src=x/.test(hostile));
check('quote script tag is escaped', !/<script>alert\(2\)/.test(hostile));
check('note script tag is escaped', !/<script>alert\(4\)/.test(hostile));
check('an unknown label cannot break out of the attribute',
  !/onmouseover/.test(hostile) && /data-l="rebutted"/.test(hostile));

// The four labels have to agree across the server parser, the ballot
// block, the round page, and the admin card. They drift silently
// otherwise, and a label the page cannot name renders as a blank chip.
for (const label of CLASH_LABELS) {
  check(`round page knows the label: ${label}`, new RegExp(`'?${label}'?\\s*:`).test(src));
}
const adminSrc = readFileSync(new URL('../app/admin.html', import.meta.url), 'utf8');
for (const label of CLASH_LABELS) {
  check(`admin card knows the label: ${label}`, new RegExp(`'?${label}'?\\s*:`).test(adminSrc));
}

// ── house style ─────────────────────────────────────────────────────
check('no em dashes in the debater block', !CLASH_DISCIPLINE.includes('—'));
check('no em dashes in the ballot block', !block.includes('—'));
for (const banned of ["let's break it down", 'hear me out', 'at the end of the day', "it's important to note", 'stay with me']) {
  check(`banned phrase absent: ${banned}`, !CLASH_DISCIPLINE.toLowerCase().includes(banned));
}

for (const f of failures) console.log('  FAIL:', f);
console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
