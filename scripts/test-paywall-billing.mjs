import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as plans from '../app/netlify/functions/lib/plans.mjs';
const read = path => process.env.PAYWALL_BASE_REF
  ? execFileSync('git', ['show', process.env.PAYWALL_BASE_REF + ':' + path], { encoding: 'utf8' })
  : readFileSync(path, 'utf8');
function load(path, context) {
  const source = read(path).replace(/^import\b[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
    .replace('export default async', 'globalThis.handler = async').replace('export const config', 'const config');
  vm.createContext(context); vm.runInContext(source, context); return context;
}
const quiet = { log() {}, warn() {}, error() {} };
let failures = 0;
async function check(name, fn) { try { await fn(); console.log('  PASS ' + name); } catch (e) { failures++; console.error('  FAIL ' + name + ': ' + e.message); } }
for (const plan of plans.PURCHASABLE_PLANS) {
  await check(plan + ' status policy', () => {
    for (const status of ['active', 'trialing', 'past_due', undefined]) assert.equal(plans.hasActivePaidPlan({ plan, status }), true, String(status));
    for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']) assert.equal(plans.hasActivePaidPlan({ plan, status }), false, status);
  });
}
await check('premium model gate honours the same retry grace as voice', async () => {
  const source = read('app/netlify/functions/lib/auth.mjs').slice(read('app/netlify/functions/lib/auth.mjs').indexOf('export async function requirePaidPlan'))
    .replace('export async function', 'async function').replace("import('./firestore.mjs')", 'getFirestore()');
  let team = { plan: 'voice', status: 'past_due' };
  const context = { ...plans, extractBearerToken: () => 'token', verifyIdToken: async () => ({ sub: 'alice' }), isNamedAccount: () => true, isOwnerEmail: () => false,
    getFirestore: async () => ({ getUserTeam: async () => ({ team }), withDeadline: p => p }) };
  vm.createContext(context); vm.runInContext(source, context);
  assert.equal((await context.requirePaidPlan({}, 'GPT')).ok, true);
  team = { plan: 'voice', status: 'incomplete' }; assert.equal((await context.requirePaidPlan({}, 'GPT')).status, 402);
});
const env = { BETA_NO_CHARGE: 'false', STRIPE_SECRET_KEY: 'test', STRIPE_PRICE_INDIVIDUAL: 'price_shared', STRIPE_PRICE_VOICE: 'price_shared' };
let checkouts = 0;
const checkout = load('app/netlify/functions/create-checkout.mjs', { ...plans, Request, Response, console: quiet, process: { env },
  extractBearerToken: () => 'token', verifyIdToken: async () => ({ sub: 'alice' }), isNamedAccount: () => true,
  ensureWorkspace: async () => ({ team: { id: 'team1', plan: 'trial' }, membership: { role: 'owner' } }),
  corsResponse: () => new Response(null, { status: 204 }), errorResponse: (error, status) => new Response(JSON.stringify({ error }), { status }),
  jsonResponse: (body, status) => new Response(JSON.stringify(body), { status }),
  Stripe: class { prices = { retrieve: async () => ({ unit_amount: 1000, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }) }; checkout = { sessions: { create: async () => { checkouts++; return { url: 'https://checkout.stripe.test/session' }; } } }; },
});
await check('cached price approval cannot authorise a different plan sharing the same price ID', async () => {
  const call = plan => checkout.handler(new Request('https://itsdebatable.com/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }));
  assert.equal((await call('individual')).status, 200);
  assert.equal((await call('voice')).status, 500); assert.equal(checkouts, 1);
});
let event, current;
let team = { plan: 'trial', status: 'active', usageThisPeriod: 2 };
const teamRef = { get: async () => ({ exists: true, data: () => ({ ...team }) }), update: async fields => { Object.assign(team, fields); } };
const db = { collection: () => ({ doc: () => teamRef, where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ id: 'team1', ref: teamRef }] }) }) }) }), runTransaction: fn => fn({ get: ref => ref.get(), update: (ref, fields) => ref.update(fields) }) };
const webhook = load('app/netlify/functions/stripe-webhook.mjs', {
  Response, console: quiet, process: { env: { STRIPE_SECRET_KEY: 'test', STRIPE_WEBHOOK_SECRET: 'test', STRIPE_PRICE_VOICE: 'price_voice' } },
  LEGACY_PRICE_PLANS: plans.LEGACY_PRICE_PLANS, getDb: () => db,
  PLANS: { trial: { requests: 3, members: 3 }, individual: { requests: 9999, members: 1 }, voice: { requests: 9999, members: 1 } },
  FieldValue: { serverTimestamp: () => 'now' },
  Stripe: class { webhooks = { constructEvent: () => event }; subscriptions = { retrieve: async () => current }; },
});
function subscription(status = 'active', price = 'price_voice') {
  return { id: 'sub_voice', customer: 'cus_alice', status, metadata: { teamId: 'team1' }, cancel_at_period_end: false, items: { data: [{ price: { id: price }, current_period_start: 1788220800, current_period_end: 1790812800 }] } };
}
async function deliver(object, type = 'customer.subscription.updated') {
  event = { id: 'evt_test', type, data: { object } };
  return webhook.handler(new Request('https://itsdebatable.com/api/stripe-webhook', { method: 'POST', body: '{}' }));
}
await check('unfinished first payment never becomes the paid retry grace state', async () => {
  current = subscription('incomplete'); assert.equal((await deliver(current)).status, 200);
  assert.equal(plans.hasActivePaidPlan(team), false); assert.equal(team.status, 'incomplete');
});
await check('subscription event alone records the billing linkage', async () => {
  current = subscription(); assert.equal((await deliver(current, 'customer.subscription.created')).status, 200);
  assert.equal(team.stripeSubscriptionId, 'sub_voice'); assert.equal(team.stripeCustomerId, 'cus_alice');
});
await check('out-of-order subscription event uses current Stripe state', async () => {
  current = subscription('active'); assert.equal((await deliver(subscription('incomplete'))).status, 200); assert.equal(team.status, 'active');
});
await check('resuming in the billing portal clears the pending cancellation', async () => {
  team.cancelAtPeriodEnd = true; team.cancelAt = new Date(); current = subscription();
  await deliver(current); assert.equal(team.cancelAtPeriodEnd, false); assert.equal(team.cancelAt, null);
});
await check('unknown price retries without inventing an Individual entitlement', async () => {
  const before = { ...team }; current = subscription('active', 'price_unknown');
  assert.equal((await deliver(current)).status, 500); assert.deepEqual(team, before);
});
await check('missing price and missing environment values cannot match each other', async () => {
  current = subscription(); current.items.data = [];
  assert.equal((await deliver(current)).status, 500);
});
await check('old subscription cancellation cannot revoke the replacement', async () => {
  team = { plan: 'voice', status: 'active', stripeSubscriptionId: 'sub_new' };
  const old = subscription('canceled'); await deliver(old, 'customer.subscription.deleted');
  assert.equal(team.plan, 'voice'); assert.equal(team.stripeSubscriptionId, 'sub_new');
  current = old; await deliver(old); assert.equal(team.status, 'active');
});
await check('invoice retries and proration invoices cannot repeatedly refill usage', async () => {
  current = subscription(); team = { plan: 'voice', status: 'active', stripeSubscriptionId: current.id, usageThisPeriod: 8 };
  const invoice = { id: 'in_cycle', subscription: current.id, billing_reason: 'subscription_cycle' };
  assert.equal((await deliver(invoice, 'invoice.payment_succeeded')).status, 200); assert.equal(team.usageThisPeriod, 0);
  team.usageThisPeriod = 7; await deliver(invoice, 'invoice.payment_succeeded'); assert.equal(team.usageThisPeriod, 7);
  await deliver({ ...invoice, id: 'in_proration', billing_reason: 'subscription_update' }, 'invoice.payment_succeeded'); assert.equal(team.usageThisPeriod, 7);
});
await check('late invoice events cannot override current subscription status', async () => {
  current = subscription('canceled'); team.stripeSubscriptionId = current.id;
  await deliver({ id: 'in_old', subscription: current.id }, 'invoice.payment_succeeded'); assert.equal(team.status, 'canceled');
  current = subscription('active');
  await deliver({ id: 'in_old', subscription: current.id }, 'invoice.payment_failed'); assert.equal(team.status, 'active');
});
if (failures) throw new Error(failures + ' billing regression checks failed');
console.log('Billing paywalls: status policy, model parity, price cache, webhook linkage and recovery passed.');
