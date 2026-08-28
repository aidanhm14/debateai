#!/usr/bin/env node
// The ballot is the product. These guards stop a prompt cleanup from
// quietly turning it back into a result plus a speech summary.

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const live = read('app/netlify/functions/live-judge.mjs');
const asyncSweep = read('app/netlify/functions/async-sweep.mjs');
const oneOff = read('app/judge.html');
const lenses = read('app/js/judge-lenses.js');
const paradigms = read('app/judge-paradigms.html');
const integrity = read('app/judge-integrity.html');
const charter = read('app/netlify/functions/lib/judge-charter.mjs');
const stability = read('scripts/eval/run-stability-eval.mjs');

let pass = 0;
const failures = [];
function check(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}

// A useful ballot decides the flow, identifies consequential silence,
// points to the record, and leaves a concrete next move. All three
// production ballot surfaces owe the same minimum even though their
// output shapes and lengths differ.
check('live ballot refuses to summarize speeches back', /Do not summarise the speeches back/.test(live));
check('live ballot names only consequential extended drops', /every consequential drop[\s\S]{0,180}extended it[\s\S]{0,180}ballot/.test(live));
check('live ballot quotes the line that settled a clash', /Quote the line that settled a clash/.test(live));
check('live ballot ends with the change the loser needed', /single thing the losing side needed to change/.test(live));

check('async short ballot names only consequential extended drops', /each consequential drop[\s\S]{0,180}extended it[\s\S]{0,180}ballot significance/.test(asyncSweep));
check('async short ballot ends with the change the loser needed', /single thing the losing side needed to change/.test(asyncSweep));
check('async full ballot walks every substantive argument', /Walk EVERY substantive argument/.test(asyncSweep));
check('async full ballot has a drops section', /THE DROPS: every consequential dropped argument/.test(asyncSweep));
check('async full ballot gives a concrete fix per side', /one concrete fix for their next round/.test(asyncSweep));
check('async full ballot says how the result flips', /HOW THIS FLIPS/.test(asyncSweep));

check('one-off short ballot still names the issue, test, drop or weighing, and fix',
  /Name the deciding issue, the test that settled it, the drop or the weighing that made the difference, and the one change that flips it/.test(oneOff));
check('one-off standard ballot names drops and the losing fix',
  /walk through the key clashes, name drops, do explicit weighing, and close with what the losing side needed to win/.test(oneOff));
check('one-off full ballot walks every substantive argument', /Walk EVERY substantive argument/.test(oneOff));
check('one-off full ballot gives concrete next-round fixes', /one concrete fix for their next round/.test(oneOff));
check('one-off full ballot says how the result flips', /HOW THIS FLIPS/.test(oneOff));

// Fluency cannot proxy for argumentative quality. The rule must survive
// in the server-written ballots, the one-off judge lens, and the public
// rubric rather than living on a marketing page alone.
check('live ballot bars fluency and polish', /NOT confidence, fluency, accent, or polish/.test(live));
check('async ballot bars fluency and polish', /NOT delivery, fluency, confidence, accent, or polish/.test(asyncSweep));
check('one-off judge lens bars fluency and polish', /Never score confidence, accent, fluency, or delivery polish/.test(lenses));
check('published rubric bars identity and delivery bias', /No identity or delivery bias[\s\S]{0,180}accent, fluency, confidence/.test(charter));

// The paradigm and the stability method must be readable before anyone
// is asked to trust a rating derived from the ballot.
check('the public paradigm guide remains live', /Choose a decision paradigm/.test(paradigms));
check('the public guide explains the fluency fence', /Delivery, fluency, confidence, and accent are never scored/.test(paradigms));
check('the integrity page explains the unchanged repeat run', /exact same prompt twice and counts any changed verdict as unstable/.test(integrity));
check('the integrity page does not call agreement proof', /Agreement is stronger evidence for a verdict, not proof/.test(integrity));
check('the stability runner accepts consented production corpus fixtures', /opt\('corpus'/.test(stability) && /loadCorpus\(CORPUS/.test(stability));

if (failures.length) {
  console.error(`[ballot-utility] ${failures.length} FAILED:`);
  for (const failure of failures) console.error('  FAIL ' + failure);
  process.exit(1);
}

console.log(`[ballot-utility] ${pass} assertions passed`);
