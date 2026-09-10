import { publicName } from './public-identity.mjs';
// ─────────────────────────────────────────────────────────────
// lib/workspace.mjs — the billing workspace a plan attaches to.
//
// Every plan (Stripe or Razorpay) settles onto a `teams` doc: the
// webhook writes plan/status there and every entitlement gate reads it
// back through getUserTeam. Until 2026-09-07 the checkout endpoints
// refused to mint a session for a user with no team (404 NEEDS_TEAM)
// and the client answered with a "Name your workspace" modal before
// Stripe. The founder watched a stranger hit that step on the way to
// paying: a person who has decided to pay should land on the card form
// on the next click, not on a naming question about a concept the
// product never showed them.
//
// So the workspace is created HERE, server-side, the first time it is
// needed. Nothing about the data model moved: the same Stripe customer,
// the same `teams` / `team_members` / `user_profiles` writes that
// create-team.mjs has always made, factored out so create-team,
// create-checkout and razorpay-order share one implementation instead
// of three that drift.
// ─────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import { getDb, getUserTeam, PLANS, FieldValue } from './firestore.mjs';

// Two fast clicks on a checkout button must not create two workspaces.
// The dedupe is per warm instance, which covers the double-click case
// (both requests land on the same instance within milliseconds); a
// genuine cross-instance race is bounded by getUserTeam running again
// inside createWorkspace.
const inFlight = new Map();

export function defaultWorkspaceName(decoded) {
  const first = String(decoded?.name || '').trim().split(/\s+/)[0];
  return first ? `${first}'s workspace` : 'My workspace';
}

/**
 * Create a workspace for a named account. Mirrors what create-team.mjs
 * did inline. Returns the same shape as getUserTeam().
 */
export async function createWorkspace(decoded, teamName) {
  const uid = decoded.sub;
  const email = decoded.email || '';
  const name = await publicName(getDb(), uid);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const customer = await stripe.customers.create({
    email,
    name: teamName,
    metadata: { firebaseUid: uid },
  });

  const db = getDb();
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const teamRef = db.collection('teams').doc();
  const teamData = {
    name: teamName,
    ownerId: uid,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: null,
    plan: 'trial',
    status: 'active',
    trialEndsAt: null,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    usageThisPeriod: 0,
    usageLimit: PLANS.trial.requests,
    memberCount: 1,
    maxMembers: PLANS.trial.members,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await teamRef.set(teamData);

  const membership = {
    teamId: teamRef.id,
    userId: uid,
    email,
    displayName: name,
    role: 'owner',
    joinedAt: FieldValue.serverTimestamp(),
  };
  await db.collection('team_members').add(membership);

  await db.collection('user_profiles').doc(uid).set({
    teamId: teamRef.id,
    email,
    displayName: name,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    team: { id: teamRef.id, ...teamData, currentPeriodEnd: periodEnd },
    teamRef,
    membership: { ...membership, role: 'owner' },
  };
}

/**
 * The caller's workspace, created on first use. Returns the same shape
 * as getUserTeam() and never null for a named account.
 */
export async function ensureWorkspace(decoded) {
  const uid = decoded.sub;
  const existing = await getUserTeam(uid);
  if (existing) return existing;
  if (inFlight.has(uid)) return inFlight.get(uid);
  const p = (async () => {
    try {
      // Re-check inside the critical section: another instance may have
      // created it between our read and now.
      const again = await getUserTeam(uid);
      if (again) return again;
      return await createWorkspace(decoded, defaultWorkspaceName(decoded));
    } finally {
      inFlight.delete(uid);
    }
  })();
  inFlight.set(uid, p);
  return p;
}
