#!/usr/bin/env node
/* ── test-ballot-read.mjs ─────────────────────────────────────────────
   Guards the ballot reading-depth control (app/js/ballot-read.js).

   What it protects, and why each one is worth a test rather than a
   comment: a ballot surface only stops being a wall of text while all
   three of its depths are still declared. A sweep that drops the
   `full` tier from one page silently restores the old behaviour there
   and nothing errors, which is the class of failure this repo keeps
   finding by hand months later. The rules are CSS, so a missing
   selector fails the same silent way.

   Also holds the line between THIS control and the judge-delivery
   length picked before a round (lib/judge-delivery.mjs, Short /
   Medium / Extensive): that one decides how long the judge WRITES,
   this one decides how much of what was written is on screen. Their
   vocabularies must stay different or the two read as one setting.

   Static analysis plus a sandboxed load of the module. No network, no
   npm. Wired into scripts/hooks/pre-commit. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + msg); } };

// ── 1. the module ──────────────────────────────────────────────────
const SRC = read('app/js/ballot-read.js');

ok(/var LEVELS = \['summary', 'ballot', 'full'\]/.test(SRC), 'three depths, in order');
ok(/var DEFAULT = 'ballot'/.test(SRC),
  'default is the reason for decision: summary hides the reasoning, which is what a ballot is');
ok(/var KEY = 'da-ballot-read'/.test(SRC), 'storage key is da-ballot-read');
ok(read('app/js/prefs-sync.js').includes("'da-ballot-read'"),
  'the key rides prefs-sync, or the choice is lost on a second device');

// The two controls must not share a vocabulary. judge-delivery owns
// short / medium / extensive; this owns summary / ballot / full.
{
  const delivery = read('app/netlify/functions/lib/judge-delivery.mjs');
  ok(/DETAILS = \{[\s\S]*?\bshort:/.test(delivery) && /\bextensive:/.test(delivery),
    'judge-delivery still owns short / medium / extensive');
  ok(!/'short'|'extensive'/.test(SRC.split('firstSentences')[0]),
    'the reading control does not reuse the delivery length words');
}

// Every hide rule: three exact tiers, two floors, three ceilings.
const RULES = [
  '[data-ballot-read="summary"] [data-read-tier="ballot"]',
  '[data-ballot-read="summary"] [data-read-tier="full"]',
  '[data-ballot-read="ballot"] [data-read-tier="summary"]',
  '[data-ballot-read="ballot"] [data-read-tier="full"]',
  '[data-ballot-read="full"] [data-read-tier="summary"]',
  '[data-ballot-read="full"] [data-read-tier="ballot"]',
  '[data-ballot-read="summary"] [data-read-min="ballot"]',
  '[data-ballot-read="summary"] [data-read-min="full"]',
  '[data-ballot-read="ballot"] [data-read-min="full"]',
  '[data-ballot-read="ballot"] [data-read-max="summary"]',
  '[data-ballot-read="full"] [data-read-max="summary"]',
  '[data-ballot-read="full"] [data-read-max="ballot"]',
];
for (const r of RULES) ok(SRC.includes(r), 'CSS hides ' + r);
ok(/\{display:none!important\}/.test(SRC),
  'the hide is !important, or an inline display on a tiered block wins');

// White on #ef4444 measures 3.99:1 and fails AA at this size; #dc2626
// is 4.83:1. Same correction the /spar sign-in gate took 2026-08-18.
ok(/aria-pressed="true"\]\{background:#dc2626/.test(SRC),
  'the selected pill uses #dc2626, not the lighter accent red');

// ── 2. the module runs and behaves ─────────────────────────────────
const sandboxWindow = {};
const sandbox = {
  window: sandboxWindow,
  document: {
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null }),
    addEventListener() {},
    contains: () => false,
  },
};
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const BR = sandboxWindow.BallotRead;

ok(!!BR, 'the module publishes window.BallotRead');
ok(BR.get() === 'ballot', 'with no stored value the depth is ballot');
ok(BR.atLeast('full', 'ballot') === true && BR.atLeast('summary', 'ballot') === false,
  'atLeast compares rank, not string equality');
ok(BR.isAt('ballot', 'ballot') === true && BR.isAt('ballot', 'full') === false, 'isAt is exact');
ok(BR.atLeast('nonsense', 'ballot') === true,
  'an unknown depth falls back to the default rather than throwing');

// The summary read must never invent text. With nothing to summarise it
// returns nothing and the caller decides what to show.
ok(BR.firstSentences('', 2) === '', 'no text in, no text out');
ok(BR.firstSentences(null, 2) === '', 'null in, no text out');
ok(BR.firstSentences('One. Two. Three. Four.', 2) === 'One. Two.',
  'takes exactly the first two sentences');
ok(BR.firstSentences('A single unpunctuated clause', 2) === 'A single unpunctuated clause',
  'text with no sentence break comes back whole');
ok(BR.firstSentences('x'.repeat(400), 2).length <= 302,
  'an unpunctuated wall is truncated, not dumped');

// ── 3. every surface still declares all three depths ───────────────
const SURFACES = [
  { file: 'app/live-round.html', tiers: ['summary', 'ballot', 'full'] },
  { file: 'app/judge.html', tiers: ['summary', 'ballot', 'full'] },
  { file: 'app/practice.html', tiers: ['ballot', 'full'] },   // summary = the decision banner, always on
  { file: 'app/voice-rfd.html', tiers: ['full'] },            // summary/ballot ride max and min
  { file: 'app/rounds.html', tiers: ['summary', 'full'] },    // ballot is built dynamically, see §5
];
for (const s of SURFACES) {
  const html = read(s.file);
  ok(html.includes('/js/ballot-read.js'), s.file + ' loads the control');
  ok(/data-read-set|BallotRead\.mount|className: 'ballot-read'/.test(html),
    s.file + ' mounts or renders the control');
  for (const t of s.tiers) {
    const declared = html.includes(`data-read-tier="${t}"`) ||
                     html.includes(`'data-read-tier': '${t}'`);
    ok(declared, `${s.file} still declares the ${t} depth`);
  }
}

// The long-form block on each surface is the one the reader asked to be
// able to put away. Anchored per surface, not "the file mentions full
// somewhere", because these files carry several tiered blocks.
ok(read('app/live-round.html').includes('<div id="deepRfdSlot" data-read-tier="full">'),
  'live-round full ballot slot is full only');
ok(read('app/practice.html').includes("el('details', { 'data-read-tier': 'full', open: ballotRead === 'full'"),
  'practice full ballot opens at full and hides below it');
ok(read('app/judge.html').includes('id="fullBallotBlock" data-read-tier="full"'),
  'judge full ballot block is full only');
ok(read('app/rounds.html').includes('class="b-deep" data-read-tier="full"'),
  'rounds full ballot block is full only');
{
  const v = read('app/voice-rfd.html');
  ok(v.includes('data-read-max="ballot"'), 'voice-rfd keeps the decision on summary and ballot');
  ok(v.includes('section--full" data-read-tier="full"'), 'voice-rfd verbatim ballot is full only');
  ok(v.includes('section--ballot" data-read-tier="full"'), 'voice-rfd long RFD is full only');
  ok(v.includes('section--best" data-read-min="ballot"'), 'voice-rfd best moment is ballot and deeper');
  ok(v.includes('section--transcript" data-read-min="ballot"'), 'voice-rfd transcript is off the summary');
  // Read-aloud has to sit outside the full-only section: it is the one
  // control that matters at every depth, and its <audio> element has to
  // stay reachable while it is playing.
  ok(v.indexOf('id="readRfdBtn"') < v.indexOf('section--full" data-read-tier="full"'),
    'voice-rfd read-aloud sits above the full-only section');
}

// ── 4. the judge is asked for its own summary ──────────────────────
for (const f of ['app/live-round.html', 'app/judge.html']) {
  const html = read(f);
  const asks = (html.match(/"summary": "<2-3 sentences/g) || []).length;
  ok(asks >= 2, `${f} asks both ballot shapes for a summary (found ${asks})`);
}

// ── 5. picking Full can never land on an empty pane ────────────────
ok(/long-form ballot did not come back/.test(read('app/live-round.html')),
  'live-round falls back to the RFD when the full ballot fails');
ok(/long-form ballot did not come back/.test(read('app/judge.html')),
  'judge falls back to the RFD when the full ballot fails');
ok(/deepBallot \|\| deepBallotLoading \? 'ballot' : null/.test(read('app/practice.html')),
  'practice keeps the RFD visible at full when no long-form ballot exists');
ok(/data-read-' \+ \(r\.ballot\.rfdDeep \? 'tier="ballot"' : 'min="ballot"'\)/.test(read('app/rounds.html')),
  'rounds keeps the RFD visible at full when the doc carries no full ballot');

console.log(`\nballot-read: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
