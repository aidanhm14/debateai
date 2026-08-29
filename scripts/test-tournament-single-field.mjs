#!/usr/bin/env node
/* test-tournament-single-field.mjs
 *
 * The August 29 Open runs one shared competitive field. Legacy entry docs
 * can still contain the retired `u18` or `open` value, including accidental
 * answers, but pairing, standings, and registration must ignore it.
 */
import { readFileSync } from 'node:fs';
import { pairDropIn } from '../app/netlify/functions/lib/tournament.mjs';

let pass = 0;
const fails = [];
const ok = (cond, what) => { if (cond) pass += 1; else fails.push(what); };

// The real matcher must treat retired age values as inert entry metadata.
{
  const now = 1_000_000;
  const entry = (entryId, bracket) => ({
    entryId,
    name: entryId,
    bracket,
    members: [entryId],
    status: 'checked_in',
    availableAt: now - 30_000,
    wins: 0,
    losses: 0,
    speaks: 0,
    byes: 0,
    sideCount: { gov: 0, opp: 0 },
    opponents: [],
  });
  const draw = pairDropIn([
    entry('mistapped-below-18', 'u18'),
    entry('mistapped-18-plus', 'open'),
  ], { tid: 'one-field', seq: 1, now });
  ok(draw.pairings.length === 1, 'legacy age answers do not split the pairing pool');
  const seated = new Set(draw.pairings.flatMap((p) => [p.govEntry, p.oppEntry]));
  ok(seated.has('mistapped-below-18') && seated.has('mistapped-18-plus'),
    'entrants with different legacy answers can be paired together');
}

// Guard the wiring as well as the pure matcher. A caller-side partition
// would make the behavioural test above vacuous while restoring two fields.
{
  const dropin = readFileSync(new URL('../app/netlify/functions/tournament-dropin.mjs', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../app/netlify/functions/tournament.mjs', import.meta.url), 'utf8');
  const entryPage = readFileSync(new URL('../app/tournaments.html', import.meta.url), 'utf8');
  const eventPage = readFileSync(new URL('../app/open.html', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../app/tournament-rules.html', import.meta.url), 'utf8');

  ok(/pairDropIn\(\s*entries\s*,/.test(dropin), 'the queue pairs the undivided entry field');
  ok(!dropin.includes('partitionByBracket'), 'the queue has no age partition');
  ok(!dropin.includes('BRACKET_REQUIRED'), 'the queue never blocks on a retired age answer');
  ok(!dropin.includes('tournament-bracket'), 'the retired age-bracket helper is not imported');
  ok(/standings\((?:entries|standingEntries)\)/.test(api),
    'the public standings rank one field, optionally limited by live check-in');
  ok(!api.includes('rankByBracket'), 'the API has no per-age standings path');
  ok(!api.includes('resolveEntryBracket'), 'registration does not resolve an age bracket');
  ok(!api.includes('prizeEligible:'), 'registration does not classify the entrant by age');
  ok(!entryPage.includes('ageGroup'), 'the entry page has no age selection state');
  ok(!entryPage.includes('value="u18"') && !entryPage.includes('value="open"'),
    'the entry page has no under-18 or 18-plus controls');
  ok(!eventPage.includes('myBracket') && !eventPage.includes('BRACKET_REQUIRED'),
    'the event page never asks for a bracket before joining the queue');
  ok(entryPage.includes('We encourage entrants to be 18+.'), 'registration carries the requested 18+ encouragement');
  ok(rules.includes('We encourage entrants to be 18+.'), 'the official rules match the entry page');
}

if (fails.length) {
  console.error(`\n[single-field-guard] ${fails.length} FAILED of ${pass + fails.length}:`);
  for (const failure of fails) console.error('  x ' + failure);
  process.exit(1);
}
console.log(`[single-field-guard] ${pass} assertions passed.`);
