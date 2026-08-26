// ─────────────────────────────────────────────────────────────
// lib/plans.mjs — what each plan COSTS, as one fact.
//
// PURE. No firebase-admin, no Stripe, no I/O, so the guard script can
// import it without credentials.
//
// WHY THIS FILE EXISTS. On 2026-08-24 the live Stripe price objects
// were measured against what the site advertises and they disagreed:
// Individual billed $5.00/MONTH while every surface said $10/year, and
// Team billed $30.00/month against an advertised $50/year. Those were
// the pre-2026-05-14 prices; the repricing decision swept the HTML and
// nobody re-pointed Stripe. A customer who clicked Upgrade would have
// been charged six times the advertised figure, on a monthly cadence
// they never agreed to.
//
// It survived because the two halves were each guarded alone and never
// against each other. scripts/check-prices.mjs hard-blocks a stale price
// STRING in a user-facing .html, and it works. Nothing compared those
// strings to the price OBJECTS money actually settles against, and a
// price id is an opaque token, so reading the env var tells you nothing
// about what it charges. The mismatch was invisible from inside the repo.
//
// So the amount lives HERE, next to the id, and create-checkout refuses
// to mint a session whose Stripe price disagrees with it. A drift is now
// a loud 500 on our side instead of a silent overcharge on theirs.
//
// CHANGING A PRICE is three edits that must land together:
//   1. this file,
//   2. the Stripe price object (a NEW price — never edit one in place,
//      Stripe forbids it and grandfathered subscriptions ride the old),
//   3. the env var, and the user-facing copy the price guard polices.
// scripts/test-plans.mjs asserts 1 and 3 agree and runs in the hook.
// ─────────────────────────────────────────────────────────────

// Canonical consumer pricing. Locked 2026-06-27 (Individual $5→$10,
// Team $20→$50, both annual); Lifetime removed from sale 2026-07-03 but
// kept as an entitlement for existing grants, which is why it has no
// price entry and cannot be checked out.
export const PLAN_PRICING = {
  byok:       { amountCents: 100,  currency: 'usd', interval: 'month', label: '$1/mo' },
  individual: { amountCents: 1000, currency: 'usd', interval: 'year',  label: '$10/year' },
  voice:      { amountCents: 1200, currency: 'usd', interval: 'month', label: '$12/mo' },
  team:       { amountCents: 5000, currency: 'usd', interval: 'year',  label: '$50/year' },
};

// VOICE IS MONTHLY AND THAT IS NOT A STYLE CHOICE. soul.md section 7
// has sold Voice at $12/mo since the tier was written, and the reason is
// in the 2026-06-27 unit-economics audit: a live voice round is roughly
// 80% of per-user variable cost, so the annual cadence that makes
// Individual feel like a tournament fee would lose money on anyone who
// actually used voice. Every other consumer tier is an entitlement; this
// one is closer to metered supply wearing a subscription's clothes.
//
// It existed on /pricing for months before it existed here: the card, the
// Reserve button and the JSON-LD Offer all advertised $12/mo while
// PLAN_PRICING had no `voice` key, so it could not be bought. The voice
// cap's own bypass list did not name it either, so buying it would not
// have lifted the cap it was sold to lift. Both are closed now (see the
// gate in realtime-session.mjs). If Voice is ever withdrawn, take the
// door out of PURCHASABLE_PLANS and leave the entitlement, the way
// lifetime was handled, rather than deleting the plan.

// Plans a browser may open checkout for. `lifetime` is deliberately
// absent: it was withdrawn from sale, and an entitlement that still
// works for existing holders is not the same thing as a door.
export const PURCHASABLE_PLANS = Object.keys(PLAN_PRICING);

export const envKeyForPlan = (plan) => ({
  byok: 'STRIPE_PRICE_BYOK',
  individual: 'STRIPE_PRICE_INDIVIDUAL',
  voice: 'STRIPE_PRICE_VOICE',
  team: 'STRIPE_PRICE_TEAM',
}[plan]);

// Price ids that USED to be canonical. A subscription created against
// one keeps billing at the old rate forever (Stripe never re-prices an
// existing subscription), so the webhook still has to know what plan it
// grants. Without this the lookup falls through to a warn-and-default,
// which is a guess about somebody's paid entitlement.
//
// Never delete an entry. A row here is the only record of what an
// existing subscriber is actually paying.
export const LEGACY_PRICE_PLANS = {
  price_1TIsfoQmgdy6tzIaESTF6Snb: { plan: 'individual', was: '$5.00/month', retired: '2026-08-24' },
  price_1TIsgHQmgdy6tzIaoDEaZTty: { plan: 'team',       was: '$30.00/month', retired: '2026-08-24' },
};

/**
 * Does a Stripe price object charge what we say it charges?
 * Takes the price object, returns { ok } or { ok:false, reason }.
 * Kept pure and total so the guard script can exercise every branch.
 */
export function priceMatchesCanonical(plan, price) {
  const want = PLAN_PRICING[plan];
  if (!want) return { ok: false, reason: `no canonical price for plan "${plan}"` };
  if (!price || typeof price !== 'object') return { ok: false, reason: 'no price object' };
  if (price.active === false) return { ok: false, reason: 'the Stripe price is archived' };
  if (price.unit_amount !== want.amountCents) {
    return {
      ok: false,
      reason: `Stripe charges ${fmt(price.unit_amount, price.currency)} but ${plan} is sold as ${want.label}`,
    };
  }
  if (String(price.currency || '').toLowerCase() !== want.currency) {
    return { ok: false, reason: `Stripe price is in ${price.currency}, canonical is ${want.currency}` };
  }
  const interval = price.recurring && price.recurring.interval;
  if (interval !== want.interval) {
    return { ok: false, reason: `Stripe bills every ${interval || 'one-off'}, ${plan} is sold per ${want.interval}` };
  }
  if (price.recurring && price.recurring.interval_count !== 1) {
    return { ok: false, reason: `Stripe bills every ${price.recurring.interval_count} ${interval}s` };
  }
  return { ok: true };
}

function fmt(cents, currency) {
  if (typeof cents !== 'number') return 'nothing';
  const n = (cents / 100).toFixed(2);
  return String(currency || 'usd').toLowerCase() === 'usd' ? `$${n}` : `${n} ${String(currency).toUpperCase()}`;
}

// ── Who bypasses the voice cap ────────────────────────────────────
// ONE list, because three minters used to keep their own copy of it and
// they had already drifted: realtime-session, coach-session and
// room-judge-session each hardcoded ['individual','lifetime','team',
// 'byok'], so adding the `voice` tier meant remembering three files.
// That is the same shape as the bug this whole pass is fixing, where
// /pricing sold a tier no gate had heard of.
//
// A subscription only loses access on an EXPLICIT Stripe-bad status.
// An unknown or missing status keeps access: Stripe reports states we
// do not enumerate, and locking a paying customer out over an
// unrecognised string is the wrong way to be wrong.
export const VOICE_PRO_PLANS = ['individual', 'lifetime', 'team', 'byok', 'voice'];
const VOICE_SUB_PLANS = new Set(['byok', 'individual', 'team', 'voice']);
const KNOWN_INACTIVE = new Set(['canceled', 'cancelled', 'incomplete_expired', 'unpaid']);

export function planBypassesVoiceCap(team) {
  if (!team || !team.plan) return false;
  if (!VOICE_PRO_PLANS.includes(team.plan)) return false;
  if (VOICE_SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status)) return false;
  return true;
}
