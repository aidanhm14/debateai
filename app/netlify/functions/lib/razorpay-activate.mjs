// Shared plan-activation logic used by both razorpay-verify.mjs (the
// synchronous "user just paid" handshake) and razorpay-webhook.mjs (the
// async "Razorpay says payment captured" backup). Idempotent: replaying
// the same paymentId returns the existing team state without bumping
// the period or resetting usage counters.

import { getDb, PLANS, FieldValue } from './firestore.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 30;

export async function activateRazorpayPayment({ teamId, plan, paymentId, orderId, source }) {
  if (!PLANS[plan]) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  const db = getDb();
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) {
    throw new Error(`Team not found: ${teamId}`);
  }
  const teamData = teamDoc.data();

  // Idempotency. The webhook can land before, after, or simultaneously
  // with verify; either way we only want to extend the period once per
  // paymentId.
  if (teamData.lastRazorpayPaymentId === paymentId) {
    return { idempotent: true, plan: teamData.plan, currentPeriodEnd: teamData.currentPeriodEnd || null };
  }

  const planDef = PLANS[plan];
  const isLifetime = plan === 'lifetime';
  const now = new Date();
  const existingEnd = teamData.currentPeriodEnd?.toDate?.()
    ?? (teamData.currentPeriodEnd ? new Date(teamData.currentPeriodEnd) : null);
  const startFrom = existingEnd && existingEnd > now ? existingEnd : now;
  const newEnd = new Date(startFrom.getTime() + PERIOD_DAYS * MS_PER_DAY);

  const updates = {
    plan,
    status: 'active',
    paymentProvider: 'razorpay',
    usageLimit: planDef.requests,
    maxMembers: planDef.members,
    lastRazorpayPaymentId: paymentId,
    lastRazorpayOrderId: orderId,
    lastRazorpayActivationSource: source || 'unknown',
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isLifetime) {
    updates.lifetimePurchasedAt = FieldValue.serverTimestamp();
    updates.currentPeriodStart = FieldValue.delete();
    updates.currentPeriodEnd = FieldValue.delete();
  } else {
    updates.currentPeriodStart = now;
    updates.currentPeriodEnd = newEnd;
    // Reset counter on a real new period (no overlap with the prior end,
    // or upgrade/downgrade to a different tier).
    if (!existingEnd || existingEnd <= now || teamData.plan !== plan) {
      updates.usageThisPeriod = 0;
    }
  }

  await teamRef.update(updates);

  return {
    idempotent: false,
    plan,
    currentPeriodEnd: isLifetime ? null : newEnd,
  };
}
