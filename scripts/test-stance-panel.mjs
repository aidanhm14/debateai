// Guards for the opinion panel's pure layer.
//
// The panel's whole value is that the instrument holds still. A reworded
// stem, a duplicate id, or a quietly changed scale breaks comparability
// across everyone who already answered, and the breakage is invisible: the
// data keeps arriving and keeps looking fine. These assertions are the only
// thing standing between an edit and a silently ruined time series.
//
// Run: node scripts/test-stance-panel.mjs

import {
  PROPOSITIONS,
  TOPICS,
  SEGMENTS,
  STANCE_SCALE,
  STANCE_TRIGGERS,
  REASK_AFTER_DAYS,
  MAX_WAVES,
  getProposition,
  isValidProposition,
  isValidSegment,
  summariseAggregate,
  bucketKey,
} from '../app/netlify/functions/lib/stance-bank.mjs';

let pass = 0;
const fails = [];

function ok(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}

function eq(a, b, msg) {
  ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

// ── the bank ──────────────────────────────────────────────────────
ok(PROPOSITIONS.length >= 30, 'bank has a usable number of propositions');

const ids = new Set();
for (const p of PROPOSITIONS) {
  ok(!ids.has(p.id), `duplicate proposition id: ${p.id}`);
  ids.add(p.id);
  ok(/^[a-z0-9-]+$/.test(p.id), `id is a clean slug: ${p.id}`);
  ok(typeof p.text === 'string' && p.text.length > 20, `${p.id} has real text`);
  ok(p.text.endsWith('.'), `${p.id} text is a declarative ending in a period`);
  ok(TOPICS.includes(p.topic), `${p.id} topic "${p.topic}" is a known topic`);
  ok(Array.isArray(p.tags) && p.tags.length > 0, `${p.id} has tags`);

  // A negated stem makes the scale ambiguous: disagreeing with "X should
  // not be allowed" is a double negative and respondents split on what they
  // meant. Phrase the positive and let the scale carry the direction.
  ok(!/\bshould not\b|\bshouldn't\b|\bnot be\b/i.test(p.text),
    `${p.id} stem is not negated: "${p.text}"`);

  // A question mark means it was written as a survey question, not a
  // proposition, and "strongly agree" does not answer a question.
  ok(!p.text.includes('?'), `${p.id} is a proposition, not a question`);

  // House style. These would ship straight into user-facing copy.
  ok(!p.text.includes('—'), `${p.id} has no em-dash`);
}

// Every topic should actually be used, or rotation quietly favours the
// topics that exist over the ones that only exist in the list.
for (const t of TOPICS) {
  ok(PROPOSITIONS.some(p => p.topic === t), `topic "${t}" has at least one proposition`);
}

// No topic should dominate: a panel that is 40% one domain reads as an
// agenda and the cross-topic rotation stops being meaningful.
for (const t of TOPICS) {
  const share = PROPOSITIONS.filter(p => p.topic === t).length / PROPOSITIONS.length;
  ok(share <= 0.25, `topic "${t}" is ${Math.round(share * 100)}% of the bank, over the 25% cap`);
}

// ── lookups ───────────────────────────────────────────────────────
ok(isValidProposition(PROPOSITIONS[0].id), 'known id validates');
ok(!isValidProposition('not-a-real-id'), 'unknown id rejected');
ok(!isValidProposition(''), 'empty id rejected');
ok(!isValidProposition(null), 'null id rejected');
// A prototype-chain key must not read as a valid proposition.
ok(!isValidProposition('constructor'), 'prototype key rejected');
ok(getProposition('not-a-real-id') === null, 'unknown lookup returns null');

// ── scale ─────────────────────────────────────────────────────────
eq(STANCE_SCALE.min, -3, 'scale floor is -3');
eq(STANCE_SCALE.max, 3, 'scale ceiling is +3');
for (let v = -3; v <= 3; v++) {
  ok(STANCE_SCALE.labels[String(v)], `scale point ${v} has a label`);
}
// Symmetry matters: an unbalanced scale biases the mean.
eq(STANCE_SCALE.max, -STANCE_SCALE.min, 'scale is symmetric around neutral');

// ── bucket keys ───────────────────────────────────────────────────
// Firestore field paths cannot contain a hyphen, so negatives are spelled.
eq(bucketKey(-3), 'pm3', 'negative bucket key spells the sign');
eq(bucketKey(0), 'p0', 'neutral bucket key');
eq(bucketKey(3), 'p3', 'positive bucket key');
const keys = new Set();
for (let v = -3; v <= 3; v++) keys.add(bucketKey(v));
eq(keys.size, 7, 'every scale point maps to a distinct bucket key');

// ── aggregate maths ───────────────────────────────────────────────
eq(summariseAggregate({}).n, 0, 'empty aggregate does not throw');
eq(summariseAggregate({}).agreePct, null, 'empty aggregate reports null, not 0%');
eq(summariseAggregate(undefined).n, 0, 'undefined aggregate does not throw');

const agg = {
  n: 10,
  buckets: { pm3: 2, pm2: 1, pm1: 1, p0: 2, p1: 1, p2: 2, p3: 1 },
  uniqueN: 10,
  uniqueSum: -1,
  confidenceSum: 600,
  confidenceN: 10,
  shiftN: 4,
  shiftSum: 2,
  changedMindN: 3,
};
const s = summariseAggregate(agg);
eq(s.disagreePct, 40, 'disagree share');
eq(s.neutralPct, 20, 'neutral share');
eq(s.agreePct, 40, 'agree share');
eq(s.disagreePct + s.neutralPct + s.agreePct, 100, 'shares total 100');
eq(s.mean, -0.1, 'mean off first answers');
eq(s.meanConfidence, 60, 'mean confidence');
eq(s.changedMindPct, 75, 'share of re-asked panelists who moved');
eq(s.meanShift, 0.5, 'mean signed shift');
eq(s.reaskedN, 4, 're-asked count');

// The mean must ignore re-asks. If it used `sum`/`n` instead of
// `uniqueSum`/`uniqueN`, a panelist who answers four times would count four
// times and the average would track whoever returns most.
const skewed = {
  n: 100, sum: 300,          // lots of repeat answers, all strongly agree
  uniqueN: 2, uniqueSum: -4, // but only two people ever answered first
  buckets: { pm2: 2 },
};
eq(summariseAggregate(skewed).mean, -2, 'mean ignores repeat answers');

// ── segments ──────────────────────────────────────────────────────
ok(isValidSegment('ageBand', 'under-18'), 'known segment value validates');
ok(!isValidSegment('ageBand', '17'), 'a raw age is not a valid band');
ok(!isValidSegment('nope', 'x'), 'unknown segment key rejected');
ok(!isValidSegment('toString', 'x'), 'prototype key is not a segment');
ok(SEGMENTS.ageBand.includes('under-18'),
  'the under-18 band exists; log-stance reads it to block licensing');
for (const [k, vals] of Object.entries(SEGMENTS)) {
  ok(Array.isArray(vals) && vals.length >= 2, `${k} has real options`);
  eq(new Set(vals).size, vals.length, `${k} options are unique`);
}

// ── triggers ──────────────────────────────────────────────────────
ok(STANCE_TRIGGERS.has('panel'), 'the standing panel trigger exists');
ok(STANCE_TRIGGERS.has('post_round'), 'the attribution trigger exists');
ok(!STANCE_TRIGGERS.has('anything'), 'trigger set is closed');

// ── re-ask window ─────────────────────────────────────────────────
// Too short measures mood, too long and panelists churn before wave two.
ok(REASK_AFTER_DAYS >= 30 && REASK_AFTER_DAYS <= 180,
  `re-ask window ${REASK_AFTER_DAYS}d is in the useful range`);
ok(MAX_WAVES >= 3, 'enough waves stored to see a trend');

// ── report ────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n[stance-panel] ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`[stance-panel] ${pass} assertions passed`);
