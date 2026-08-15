#!/usr/bin/env node
// Guard for the bounty money rules. Runs in the pre-commit hook.
//
// A bounty moves real money, so the three promises the page makes to a
// stranger are asserted here rather than trusted to a code review:
//   1. the pot pays for completing the round, never for winning
//   2. the house takes nothing, to the cent
//   3. money that produces no debate is refundable
//
// Per the habit this repo learned the hard way: a suite that passes on
// its first run has not been shown to test anything. Every guard below
// was checked by deliberately breaking the code it covers.
import {
  splitPot, validateBountyInput, validateContribution, canTransition, canClaim,
  isExpired, makeBountyData, publicBounty, formatCents,
  STATUSES, FUNDABLE_STATUSES, REFUNDABLE_STATUSES, TERMINAL_STATUSES,
  MIN_CONTRIBUTION_CENTS, MAX_CONTRIBUTION_CENTS, MAX_POT_CENTS, DEBATERS_NEEDED,
} from '../app/netlify/functions/lib/bounty.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; return; }
  fails.push(label);
}
function throws(fn, label) {
  try { fn(); fails.push(label + ' (expected a throw)'); }
  catch { pass++; }
}

// ── 1. no rake, ever ────────────────────────────────────────────────
const two = [{ uid: 'a', name: 'A', acceptedAt: 1 }, { uid: 'b', name: 'B', acceptedAt: 2 }];
for (const pot of [0, 1, 2, 3, 199, 200, 4999, 5000, 12345, 999999, MAX_POT_CENTS]) {
  const splits = splitPot(pot, two);
  const sum = splits.reduce((s, x) => s + x.cents, 0);
  ok(sum === pot, `splitPot conserves ${pot} (got ${sum})`);
  ok(splits.every((s) => Number.isInteger(s.cents)), `splitPot integer cents at ${pot}`);
  ok(splits.every((s) => s.cents >= 0), `splitPot no negative share at ${pot}`);
}
// Odd pots: the extra cent is deterministic and goes to the first accepter.
const odd = splitPot(101, two);
ok(odd.find((s) => s.uid === 'a').cents === 51, 'odd remainder goes to the first accepter');
ok(odd.find((s) => s.uid === 'b').cents === 50, 'odd remainder is exactly one cent');
const reordered = splitPot(101, [two[1], two[0]]);
ok(reordered.find((s) => s.uid === 'a').cents === 51,
   'split is ordered by acceptedAt, not by array order');

// The signature itself is the guarantee that the verdict cannot move
// money. If someone adds a winner parameter this stops being true.
ok(splitPot.length === 2, 'splitPot takes only (pot, debaters), so no winner can be passed');
const src = readFileSync(join(ROOT, 'app/netlify/functions/lib/bounty.mjs'), 'utf8');
ok(!/\bwinner\b/i.test(src.replace(/\/\/[^\n]*/g, '')),
   'no winner term in bounty logic (comments excluded)');
for (const word of ['rake', 'houseCut', 'commission', 'feeCents', 'platformFee']) {
  ok(!new RegExp(`\\b${word}\\b`).test(src.replace(/\/\/[^\n]*/g, '')),
     `no ${word} in bounty logic`);
}

// ── 2. status machine ───────────────────────────────────────────────
ok(canTransition('funding', 'claimed'), 'funding -> claimed');
ok(canTransition('claimed', 'completed'), 'claimed -> completed');
ok(canTransition('claimed', 'funding'), 'claimed -> funding (a debater withdrew)');
ok(canTransition('expired', 'refunded'), 'expired -> refunded');
ok(canTransition('cancelled', 'refunded'), 'cancelled -> refunded');
ok(!canTransition('completed', 'refunded'), 'a completed bounty cannot be refunded out from under the debaters');
ok(!canTransition('refunded', 'funding'), 'refunded is terminal');
ok(!canTransition('funding', 'completed'), 'cannot complete a bounty nobody took');
ok(!canTransition('funding', 'nonsense'), 'unknown status is refused');
ok(STATUSES.every((s) => typeof s === 'string'), 'statuses are strings');
// completed and refunded are the only ends, and they are mutually exclusive
ok(TERMINAL_STATUSES.has('completed') && TERMINAL_STATUSES.has('refunded'),
   'both terminal states are marked terminal');
ok(![...REFUNDABLE_STATUSES].some((s) => TERMINAL_STATUSES.has(s)),
   'no status is both refundable and terminal, so nobody is owed twice');

// ── 3. contribution bounds ──────────────────────────────────────────
const open = { status: 'funding', potCents: 0, expiresAt: Date.now() + 8.64e7 };
ok(!validateContribution(MIN_CONTRIBUTION_CENTS - 1, open).ok, 'refuses below the minimum');
ok(validateContribution(MIN_CONTRIBUTION_CENTS, open).ok, 'accepts the minimum');
ok(!validateContribution(MAX_CONTRIBUTION_CENTS + 1, open).ok, 'refuses above the per-person cap');
ok(!validateContribution(500, { ...open, potCents: MAX_POT_CENTS }).ok, 'refuses when the pot is full');
ok(!validateContribution(500, { ...open, status: 'expired' }).ok, 'refuses funding an expired bounty');
ok(!validateContribution(500, { ...open, status: 'completed' }).ok, 'refuses funding a finished bounty');
ok(validateContribution(500, { ...open, status: 'claimed' }).ok, 'a claimed bounty still takes money');
ok(!validateContribution(500, { ...open, expiresAt: Date.now() - 1000 }).ok,
   'refuses funding past the expiry even if the status has not swept yet');
ok(!validateContribution(1.5, open).ok || Number.isInteger(validateContribution(1.5, open).value ?? 0),
   'fractional cents never survive validation');
ok(!validateContribution('50000000', open).ok, 'a string over the cap is still over the cap');
ok(!validateContribution(NaN, open).ok, 'NaN is refused');
ok(!validateContribution(-5000, open).ok, 'negative contributions are refused');

// ── 4. expiry ───────────────────────────────────────────────────────
ok(isExpired({ status: 'funding', expiresAt: Date.now() - 1 }), 'past expiry reads expired');
ok(!isExpired({ status: 'funding', expiresAt: Date.now() + 6e4 }), 'before expiry does not');
ok(!isExpired({ status: 'completed', expiresAt: 1 }), 'a completed bounty is never "expired"');
ok(!isExpired({ status: 'refunded', expiresAt: 1 }), 'a refunded bounty is never "expired"');
const inp = validateBountyInput({ motion: 'THW abolish the electoral college entirely', expiryDays: 9999 });
ok(inp.ok && inp.value.expiryDays <= 90, 'expiry is clamped to the maximum');
const inp2 = validateBountyInput({ motion: 'THW abolish the electoral college entirely', expiryDays: 1 });
ok(inp2.ok && inp2.value.expiryDays >= 7, 'expiry is clamped to the minimum');
ok(makeBountyData(inp.value, { uid: 'u', name: 'N' }, 1000).expiresAt > 1000, 'expiry is always set');

// ── 5. who may claim ────────────────────────────────────────────────
const base = { status: 'funding', potCents: 1000, creatorUid: 'creator', debaters: [], targetKind: 'open', targets: [] };
ok(canClaim(base, 'someone').ok, 'anyone may take an open bounty');
ok(!canClaim(base, 'creator').ok, 'the funder cannot pay themselves');
ok(!canClaim(base, '').ok, 'a signed-out visitor cannot claim');
ok(!canClaim({ ...base, status: 'completed' }, 'x').ok, 'cannot claim a finished bounty');
ok(!canClaim({ ...base, expiresAt: Date.now() - 1 }, 'x').ok, 'cannot claim an expired bounty');
ok(!canClaim({ ...base, debaters: [{ uid: 'x' }] }, 'x').ok, 'cannot claim twice');
ok(!canClaim({ ...base, debaters: [{ uid: 'p' }, { uid: 'q' }] }, 'x').ok, 'cannot claim a full bounty');
const named = { ...base, targetKind: 'named', targets: [{ uid: 'star', name: 'Star' }] };
ok(canClaim(named, 'star').ok, 'a named person may take their own bounty');
ok(!canClaim(named, 'rando').ok, 'a stranger may not take a named bounty');
ok(canClaim({ ...named, debaters: [{ uid: 'star' }] }, 'rando').ok,
   'once the named person is in, the second seat opens to anyone');

// ── 6. projection leaks nothing ─────────────────────────────────────
const doc = makeBountyData(
  validateBountyInput({ motion: 'THW pay college athletes a salary', targetKind: 'open' }).value,
  { uid: 'creator-uid', name: 'Creator' }, Date.now(),
);
doc.potCents = 5000;
doc.debaters = [{ uid: 'deb-1', name: 'One', acceptedAt: 1 }];
const pub = JSON.stringify(publicBounty('bid', doc, 'viewer'));
ok(!pub.includes('creator-uid'), 'the funder uid never reaches the browser');
ok(pub.includes('Creator'), 'the funder display name does');
ok(publicBounty('bid', doc).viewer === undefined, 'no viewer block without a viewer');
ok(publicBounty('bid', doc, 'creator-uid').viewer.isCreator === true, 'creator sees themselves as creator');
ok(publicBounty('bid', doc, 'deb-1').viewer.isDebater === true, 'a debater sees themselves as a debater');
ok(publicBounty('bid', doc, 'viewer').seatsLeft === DEBATERS_NEEDED - 1, 'seats left is reported');
// The split preview must equal what settlement would actually pay.
const preview = publicBounty('bid', doc, 'viewer').projectedSplitCents;
ok(preview.reduce((a, b) => a + b, 0) === 5000, 'the previewed split adds up to the pot');

// ── 7. input validation ─────────────────────────────────────────────
ok(!validateBountyInput({ motion: 'too short' }).ok, 'a too-short motion is refused');
ok(!validateBountyInput({ motion: 'x'.repeat(301) }).ok, 'an over-long motion is refused');
ok(!validateBountyInput({ motion: 'THW do the thing properly', targetKind: 'named', targets: [] }).ok,
   'a named bounty with nobody named is refused');
const okIn = validateBountyInput({ motion: 'THW ban private jets for domestic flights', format: 'nonsense' });
ok(okIn.ok && okIn.value.format === 'quick', 'an unknown format falls back rather than throwing');
const tgt = validateBountyInput({
  motion: 'THW ban private jets for domestic flights', targetKind: 'named',
  targets: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
});
ok(tgt.ok && tgt.value.targets.length <= 2, 'targets are capped at two');
ok(tgt.value.targets.every((t) => t.accepted === false), 'a named target starts unaccepted, never opted in for them');

// ── 8. formatting ───────────────────────────────────────────────────
ok(formatCents(5000) === '$50', 'whole dollars drop the decimals');
ok(formatCents(4999) === '$49.99', 'part dollars keep them');
ok(formatCents(0) === '$0', 'zero renders');
ok(formatCents(-100) === '$0', 'negative money never renders as negative');

// ── report ──────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`[bounty-guard] ${fails.length} FAILED of ${pass + fails.length}`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`[bounty-guard] ${pass} assertions passed`);
