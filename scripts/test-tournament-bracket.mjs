#!/usr/bin/env node
/* test-tournament-bracket.mjs
 *
 * Guards the one property the age split exists for: a person under 18
 * and an adult are never seated in the same room by the drop-in queue.
 *
 * It tests the real matcher, not a mock of it. lib/tournament.mjs is
 * pure, so the pairing that runs on the day can be run here against a
 * synthetic field, which is the only way to catch a regression where
 * someone reintroduces a single pool.
 */
import {
  AGE_BRACKETS, BRACKET_LABEL, isBracket, bracketOf, hasPlayed,
  resolveEntryBracket, canChangeBracket, partitionByBracket,
} from '../app/netlify/functions/lib/tournament-bracket.mjs';
import { pairDropIn } from '../app/netlify/functions/lib/tournament.mjs';
import { readFileSync } from 'node:fs';

let pass = 0; const fails = [];
const ok = (cond, what) => { if (cond) pass += 1; else fails.push(what); };
const eq = (a, b, what) => ok(a === b, `${what} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ── the vocabulary ───────────────────────────────────────────────────
eq(AGE_BRACKETS.length, 2, 'exactly two brackets');
ok(isBracket('u18') && isBracket('open'), 'both brackets are recognised');
ok(!isBracket('') && !isBracket('adult') && !isBracket(null), 'nothing else is');
ok(BRACKET_LABEL.u18 && BRACKET_LABEL.open, 'both brackets have a human label');

// ── reading an entry ─────────────────────────────────────────────────
eq(bracketOf({ bracket: 'u18' }), 'u18', 'explicit bracket wins');
eq(bracketOf({ bracket: 'open' }), 'open', 'explicit open');
eq(bracketOf({}), '', 'no signal at all is unassigned, never a default');
eq(bracketOf({ bracket: 'grown-up' }), '', 'a junk bracket value is unassigned, not trusted');
eq(bracketOf({ ageAttested: true }), 'open', 'legacy 18+ attestation reads as open');
eq(bracketOf({ prizeEligible: true }), 'open', 'legacy prize eligibility reads as open');
eq(bracketOf({ paidEntry: true }), '', 'a tip says nothing about age');
eq(bracketOf({ bracket: 'u18', prizeEligible: true }), 'u18',
   'an explicit under-18 answer is not overridden by a stale eligibility flag');

// ── what a register call means ───────────────────────────────────────
eq(resolveEntryBracket({ ageAttested: true }).bracket, 'open', 'attesting 18+ places you in open');
eq(resolveEntryBracket({ ageAttested: true, bracket: 'u18' }).bracket, 'open',
   'the attestation outranks a contradicting bracket field');
eq(resolveEntryBracket({ bracket: 'u18' }).bracket, 'u18', 'under 18 without attestation');
eq(resolveEntryBracket({ bracket: 'u18' }).ageAttested, false, 'and it grants no eligibility');
eq(resolveEntryBracket({}).bracket, '', 'a client that says nothing leaves it unanswered');
eq(resolveEntryBracket({ ageAttested: 'yes' }).bracket, '', 'attestation must be a real true');

// ── freezing it once rounds are played ───────────────────────────────
ok(!hasPlayed({}), 'a fresh entry has played nothing');
ok(hasPlayed({ wins: 1 }) && hasPlayed({ losses: 1 }) && hasPlayed({ byes: 1 }), 'any result counts as played');
ok(canChangeBracket({}, 'open'), 'an unassigned entry can be assigned');
ok(canChangeBracket({ bracket: 'u18' }, 'open'), 'a correction before any round is free');
ok(!canChangeBracket({ bracket: 'u18', wins: 1 }, 'open'),
   'a played entry cannot switch bracket, in the direction that would make a minor cash-eligible');
ok(!canChangeBracket({ bracket: 'open', losses: 2 }, 'u18'),
   'nor in the direction that would put an adult in the minors field');
ok(canChangeBracket({ bracket: 'open', wins: 3 }, 'open'), 'restating the same bracket is a no-op, not a move');
ok(!canChangeBracket({}, 'nonsense'), 'cannot be assigned to a bracket that does not exist');

// ── partitioning ─────────────────────────────────────────────────────
{
  const field = [
    { entryId: 'a', bracket: 'u18' },
    { entryId: 'b', bracket: 'open' },
    { entryId: 'c', ageAttested: true },
    { entryId: 'd' },
  ];
  const p = partitionByBracket(field);
  eq(p.u18.length, 1, 'one minor');
  eq(p.open.length, 2, 'two adults, one of them legacy');
  eq(p.unassigned.length, 1, 'the unanswered entry is held aside');
  ok(!p.u18.concat(p.open).some((e) => e.entryId === 'd'),
     'an unanswered entry is never folded into a playable pool');
}

// ── the property that matters: the real matcher, per bracket ─────────
{
  const now = 1_000_000;
  const mk = (id, bracket, extra = {}) => ({
    entryId: id, name: id, bracket, members: [id],
    status: 'registered', availableAt: now - 30_000,
    wins: 0, losses: 0, speaks: 0, byes: 0,
    sideCount: { gov: 0, opp: 0 }, opponents: [], ...extra,
  });
  const field = [
    mk('kid1', 'u18'), mk('kid2', 'u18'), mk('kid3', 'u18'),
    mk('ad1', 'open'), mk('ad2', 'open'), mk('ad3', 'open'), mk('ad4', 'open'),
    mk('unknown', ''),
  ];
  const pools = partitionByBracket(field);
  const bracketFor = new Map(field.map((e) => [e.entryId, e.bracket]));

  const seen = [];
  let seq = 0;
  for (const b of AGE_BRACKETS) {
    const pool = pools[b];
    if (pool.length < 2) continue;
    seq += 1;
    const draw = pairDropIn(pool, { tid: 'T#' + b, seq, now });
    for (const p of draw.pairings) seen.push([p.pairingId, p.govEntry, p.oppEntry, b]);
  }

  ok(seen.length >= 2, 'both brackets seated at least one round each');
  ok(seen.every(([, gov, opp]) => bracketFor.get(gov) === bracketFor.get(opp)),
     'NO ROUND EVER PAIRS ACROSS BRACKETS');
  ok(!seen.some(([, gov, opp]) => gov === 'unknown' || opp === 'unknown'),
     'the unanswered entry is never seated');
  const ids = seen.map(([id]) => id);
  eq(new Set(ids).size, ids.length,
     'pairing ids are unique across brackets, so two pairs cannot share a room');
}

// ── a lone entrant in their bracket waits rather than crossing over ──
{
  const now = 2_000_000;
  const mk = (id, bracket) => ({
    entryId: id, name: id, bracket, members: [id], status: 'registered',
    availableAt: now - 10_000, wins: 0, losses: 0, speaks: 0, byes: 0,
    sideCount: { gov: 0, opp: 0 }, opponents: [],
  });
  const pools = partitionByBracket([mk('kid', 'u18'), mk('ad1', 'open'), mk('ad2', 'open')]);
  eq(pools.u18.length, 1, 'one minor present');
  const draw = pairDropIn(pools.u18, { tid: 'T#u18', seq: 1, now });
  eq(draw.pairings.length, 0, 'a bracket of one seats nobody rather than borrowing an adult');
}

// ── the queue actually uses it ───────────────────────────────────────
//
// Everything above proves the PATTERN is sound. This proves the shipped
// queue applies it. Without this, someone could restore a single pool
// in tournament-dropin.mjs and every assertion above would still pass,
// which is the exact shape of a vacuous guard.
{
  const src = readFileSync(new URL('../app/netlify/functions/tournament-dropin.mjs', import.meta.url), 'utf8');
  ok(src.includes('partitionByBracket'), 'the queue partitions the field before pairing');
  ok(/pairDropIn\(\s*pool\s*,/.test(src), 'the queue pairs a bracket pool, not the whole field');
  ok(!/pairDropIn\(\s*entries\s*,/.test(src), 'the queue never pairs the undivided field');
  ok(src.includes('BRACKET_REQUIRED'), 'the queue refuses an entry that has not said which bracket it is in');
  ok(/bracketOf\(mine\.data\(\)\)/.test(src), 'and it decides that from the entry doc, not from the request body');
}

if (fails.length) {
  console.error(`\n[bracket-guard] ${fails.length} FAILED of ${pass + fails.length}:`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`[bracket-guard] ${pass} assertions passed.`);
