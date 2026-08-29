#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Guards the money story that check-prices.mjs cannot see.
//
// check-prices.mjs reads user-facing HTML and blocks a retired price
// string. It works, and it was working on 2026-08-24 when the live
// Stripe Individual price was measured at $5.00/MONTH against an
// advertised $10/year. Both halves were individually correct; nothing
// compared them, because a Stripe price id is an opaque token and
// reading the env var tells you nothing about the amount behind it.
//
// So this asserts the two halves agree at the level they CAN be
// compared offline: the canonical amounts in lib/plans.mjs must be the
// same numbers the site prints, and must not be any string the price
// guard bans. The amount-vs-Stripe check cannot run here (it needs a
// live API key) and lives in create-checkout's fail-closed verifyPrice.
//
// Runs in scripts/hooks/pre-commit. Never bypass with --no-verify.
// ─────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PLAN_PRICING, PURCHASABLE_PLANS, envKeyForPlan,
  priceMatchesCanonical, LEGACY_PRICE_PLANS,
  VOICE_PRO_PLANS, planBypassesVoiceCap,
} from '../app/netlify/functions/lib/plans.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('  FAIL: ' + msg); } };

// ── 1. canonical pricing is the pricing soul.md §7 locked ──────────
const EXPECTED = {
  byok:       { amountCents: 100,  interval: 'month', label: '$1/mo' },
  individual: { amountCents: 1000, interval: 'year',  label: '$10/year' },
  // Voice is monthly on purpose (unit economics, not style) and was
  // advertised on /pricing for months before it existed as a plan.
  voice:      { amountCents: 1200, interval: 'month', label: '$12/mo' },
  team:       { amountCents: 5000, interval: 'year',  label: '$50/year' },
};
for (const [plan, want] of Object.entries(EXPECTED)) {
  const got = PLAN_PRICING[plan];
  ok(!!got, `${plan} has a canonical price`);
  if (!got) continue;
  ok(got.amountCents === want.amountCents,
    `${plan} is ${want.amountCents}c, found ${got.amountCents}c (soul.md §7 locked this)`);
  ok(got.interval === want.interval, `${plan} bills per ${want.interval}, found ${got.interval}`);
  ok(got.label === want.label, `${plan} label is "${want.label}", found "${got.label}"`);
  ok(got.currency === 'usd', `${plan} is priced in usd`);
}

// ── 2. the label and the amount cannot disagree ────────────────────
// The failure this whole file exists for is a number drifting from the
// words beside it. A label that does not restate its own amount is that
// drift, one file earlier.
for (const [plan, p] of Object.entries(PLAN_PRICING)) {
  const dollars = p.amountCents / 100;
  const shown = p.label.match(/\$\s?([\d.]+)/);
  ok(!!shown, `${plan} label "${p.label}" states a dollar figure`);
  if (shown) {
    ok(Math.abs(parseFloat(shown[1]) - dollars) < 0.005,
      `${plan} label says $${shown[1]} but amountCents is ${p.amountCents} ($${dollars})`);
  }
  const perYear = /year|yr/i.test(p.label);
  ok(perYear === (p.interval === 'year'),
    `${plan} label "${p.label}" states the ${p.interval} cadence it actually bills on`);
}

// ── 3. no canonical price is a string the HTML guard bans ──────────
// If these ever collided, the guard would be blocking the site from
// printing the price we are charging, which means one of the two is
// wrong and shipping is the wrong response either way.
const guardSrc = readFileSync(join(ROOT, 'scripts/check-prices.mjs'), 'utf8');
const banned = [...guardSrc.matchAll(/\{\s*re:\s*(\/[^\n]+?\/[gimsuy]*)\s*,/g)].map((m) => m[1]);
ok(banned.length >= 3, `parsed the banned-price patterns out of check-prices.mjs (found ${banned.length})`);
for (const [plan, p] of Object.entries(PLAN_PRICING)) {
  for (const src of banned) {
    const body = src.slice(1, src.lastIndexOf('/'));
    const flags = src.slice(src.lastIndexOf('/') + 1);
    let re; try { re = new RegExp(body, flags); } catch { continue; }
    ok(!re.test(p.label),
      `${plan} label "${p.label}" is a price check-prices.mjs bans from user-facing copy`);
  }
}

// ── 4. every purchasable plan can actually be bought ───────────────
for (const plan of PURCHASABLE_PLANS) {
  ok(!!PLAN_PRICING[plan], `purchasable plan ${plan} has a price`);
  ok(!!envKeyForPlan(plan), `purchasable plan ${plan} names an env var`);
}
// Lifetime was withdrawn from sale 2026-07-03. The entitlement stays for
// existing grants; the DOOR must not come back without a decision.
ok(!PURCHASABLE_PLANS.includes('lifetime'),
  'lifetime is not purchasable (withdrawn 2026-07-03; entitlement kept, door closed)');
ok(!PLAN_PRICING.lifetime, 'lifetime has no canonical price');

// ── 4b. the voice tier actually lifts the voice cap ────────────────
// The bug this guards: /pricing sold Voice at $12/mo, and the voice
// cap's bypass list did not name `voice`, so buying the tier sold to
// remove the cap removed nothing. Three separate minters kept their own
// copy of that list, which is why it drifted; there is now one.
for (const plan of PURCHASABLE_PLANS) {
  if (plan === 'byok') continue; // BYOK is a key, not a voice entitlement
  ok(VOICE_PRO_PLANS.includes(plan),
    `purchasable plan ${plan} is in VOICE_PRO_PLANS (or it cannot lift the voice cap it is sold beside)`);
}
ok(planBypassesVoiceCap({ plan: 'voice', status: 'active' }), 'an active voice subscription bypasses the voice cap');
ok(!planBypassesVoiceCap({ plan: 'voice', status: 'canceled' }), 'a canceled voice subscription does not');
ok(!planBypassesVoiceCap({ plan: 'trial' }), 'trial does not bypass the voice cap');
ok(!planBypassesVoiceCap(null), 'no team does not bypass the voice cap');
ok(planBypassesVoiceCap({ plan: 'lifetime' }), 'lifetime (no status) still bypasses');
ok(planBypassesVoiceCap({ plan: 'individual', status: 'past_due' }),
  'past_due is a grace state, not a lockout');

// ── 4c. active public surfaces must describe live billing ─────────
// Consumer subscriptions went live on 2026-08-26. A page that still says
// every tier is free or calls today's numbers "future pricing" can send a
// person into a real checkout under the opposite promise.
function sourceFiles(dir) {
  // Build output and installed packages are not public source surfaces.
  // Walking them made the price guard recurse forever on npm's
  // node_modules links and blocked every otherwise valid commit.
  const ignoredDirs = new Set(['node_modules', 'dist', '.netlify']);
  return readdirSync(dir).filter((name) => !ignoredDirs.has(name)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}
const archivedBillingSources = new Set([
  join(ROOT, 'app/landing-classic.html'),
  join(ROOT, 'app/landing-full.html'),
  join(ROOT, 'app/report.html'),
]);
const staleBilling = /free (?:in|while|during) (?:the )?(?:public )?beta|every tier (?:is|currently) \$0|post-beta (?:plans?|pricing)|future pricing|pricing turns on|planned Individual price/i;
const staleBillingHits = sourceFiles(join(ROOT, 'app'))
  .filter((path) => /\.(?:html|js|mjs|txt)$/.test(path))
  .filter((path) => !path.includes(`${join(ROOT, 'app/dist')}/`))
  .filter((path) => !path.includes(`${join(ROOT, 'app/copy-edit')}/`))
  .filter((path) => !archivedBillingSources.has(path))
  .filter((path) => staleBilling.test(readFileSync(path, 'utf8')))
  .map((path) => path.slice(ROOT.length + 1));
ok(staleBillingHits.length === 0,
  `active public billing copy states that subscriptions are live${staleBillingHits.length ? ` (stale: ${staleBillingHits.join(', ')})` : ''}`);

// ── 5. legacy prices resolve deliberately, never by guess ──────────
ok(Object.keys(LEGACY_PRICE_PLANS).length > 0,
  'LEGACY_PRICE_PLANS records the retired prices existing subscribers still ride');
let envChecked = 0;
for (const [id, row] of Object.entries(LEGACY_PRICE_PLANS)) {
  ok(/^price_[A-Za-z0-9]+$/.test(id), `legacy key ${id} is a Stripe price id`);
  ok(!!row.plan && !!row.was, `legacy ${id} records both its plan and what it charged`);
  ok(!!PLAN_PRICING[row.plan] || row.plan === 'lifetime',
    `legacy ${id} names a plan we still recognise (found "${row.plan}")`);
  // A legacy id that is ALSO the live env value would mean a price was
  // never really replaced. Only assertable where the env exists: in the
  // hook it does not, and comparing against undefined would pass every
  // time while proving nothing. Counted, so a vacuous run is visible
  // rather than looking like a green check.
  const live = process.env[envKeyForPlan(row.plan)];
  if (live) {
    envChecked++;
    ok(live !== id, `legacy price ${id} is not still wired as the live ${row.plan} price`);
  }
}
if (!envChecked) {
  console.log('[plan-guard] note: STRIPE_PRICE_* not in env, so the live-vs-legacy'
    + ' collision check did not run. Run with the Netlify env to exercise it.');
}

// ── 6. priceMatchesCanonical actually rejects the 2026-08-24 drift ──
// The bug that motivated all of this, replayed as a fixture. If this
// passes, the guard is not guarding.
const realDrift = { unit_amount: 500, currency: 'usd', active: true, recurring: { interval: 'month', interval_count: 1 } };
ok(!priceMatchesCanonical('individual', realDrift).ok,
  'the real 2026-08-24 drift ($5.00/month sold as $10/year) is rejected');
const good = { unit_amount: 1000, currency: 'usd', active: true, recurring: { interval: 'year', interval_count: 1 } };
ok(priceMatchesCanonical('individual', good).ok, 'a correct $10/year price passes');
ok(!priceMatchesCanonical('individual', { ...good, active: false }).ok, 'an archived price is rejected');
ok(!priceMatchesCanonical('individual', { ...good, currency: 'eur' }).ok, 'a wrong-currency price is rejected');
ok(!priceMatchesCanonical('individual', { ...good, recurring: { interval: 'month', interval_count: 1 } }).ok,
  'the right amount on the wrong cadence is rejected');
ok(!priceMatchesCanonical('individual', { ...good, recurring: { interval: 'year', interval_count: 2 } }).ok,
  'billing every 2 years is rejected');
ok(!priceMatchesCanonical('individual', { unit_amount: 1000, currency: 'usd', active: true }).ok,
  'a one-off price for a subscription plan is rejected');
ok(!priceMatchesCanonical('individual', null).ok, 'a missing price object is rejected');
ok(!priceMatchesCanonical('lifetime', good).ok, 'a plan with no canonical price can never match');

if (fails) {
  console.error(`\n[plan-guard] ${fails} of ${checks} checks FAILED.`);
  console.error('  Canonical: BYOK $1/mo · Individual $10/year · Team $50/year (no Lifetime).');
  console.error('  Changing a price = lib/plans.mjs + a NEW Stripe price + the env var, together.');
  process.exit(1);
}
console.log(`[plan-guard] ${checks} checks passed.`);
