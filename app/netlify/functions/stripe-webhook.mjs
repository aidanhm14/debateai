import Stripe from 'stripe';
import { getDb, PLANS, FieldValue } from './lib/firestore.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Get raw body for signature verification
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response('Webhook verification failed', { status: 400 });
  }

  const db = getDb();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        // Handle lifetime one-time payment
        if (session.mode === 'payment') {
          const paymentIntentId = session.payment_intent;
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          const teamId = paymentIntent.metadata?.teamId;
          const plan = paymentIntent.metadata?.plan;

          if (teamId && plan === 'lifetime') {
            await db.collection('teams').doc(teamId).update({
              plan: 'lifetime',
              status: 'active',
              usageLimit: 250,
              maxMembers: 3,
              lifetimePurchasedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Team ${teamId} purchased lifetime plan`);
          }
          break;
        }

        if (session.mode !== 'subscription') break;

        const subscriptionId = session.subscription;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const teamId = subscription.metadata?.teamId;

        if (!teamId) {
          console.error('No teamId in subscription metadata');
          break;
        }

        // Determine plan from price
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);

        await db.collection('teams').doc(teamId).update({
          stripeSubscriptionId: subscriptionId,
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: PLANS[plan].requests,
          maxMembers: PLANS[plan].members,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Team ${teamId} subscribed to ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const teamId = subscription.metadata?.teamId;
        if (!teamId) break;

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);
        const periodStart = new Date(subscription.current_period_start * 1000);
        const periodEnd = new Date(subscription.current_period_end * 1000);

        const teamRef = db.collection('teams').doc(teamId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) { console.error('Team not found:', teamId); break; }
        const teamData = teamDoc.data();

        // Reset usage if new billing period
        const oldPeriodStart = teamData.currentPeriodStart?.toDate?.()
          || teamData.currentPeriodStart;
        const isNewPeriod = !oldPeriodStart ||
          periodStart.getTime() !== new Date(oldPeriodStart).getTime();

        const updates = {
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: PLANS[plan].requests,
          maxMembers: PLANS[plan].members,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (isNewPeriod) {
          updates.usageThisPeriod = 0;
        }

        await teamRef.update(updates);
        console.log(`Team ${teamId} subscription updated: ${plan} (${subscription.status})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const teamId = subscription.metadata?.teamId;
        if (!teamId) break;

        await db.collection('teams').doc(teamId).update({
          status: 'canceled',
          plan: 'trial',
          usageLimit: PLANS.trial.requests,
          maxMembers: PLANS.trial.members,
          stripeSubscriptionId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Team ${teamId} subscription canceled`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        // Find team by subscription ID
        const teamsSnap = await db.collection('teams')
          .where('stripeSubscriptionId', '==', subscriptionId)
          .limit(1)
          .get();

        if (teamsSnap.empty) break;

        const teamDoc = teamsSnap.docs[0];
        await teamDoc.ref.update({
          status: 'active',
          usageThisPeriod: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Team ${teamDoc.id} payment succeeded, usage reset`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        const teamsSnap = await db.collection('teams')
          .where('stripeSubscriptionId', '==', subscriptionId)
          .limit(1)
          .get();

        if (teamsSnap.empty) break;

        const teamDoc = teamsSnap.docs[0];
        await teamDoc.ref.update({
          status: 'past_due',
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Team ${teamDoc.id} payment failed, marked past_due`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    console.error(`Failed event ID: ${event.id}, type: ${event.type}, data: ${JSON.stringify(event.data?.object?.id || 'unknown')}`);
    // Return 500 so Stripe retries the webhook — failed billing updates must not be silently dropped
    return new Response(JSON.stringify({ error: 'Processing failed', eventType: event.type }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/**
 * Map a Stripe price ID to our plan name.
 */
function getPlanFromPrice(priceId) {
  const individualPrice = process.env.STRIPE_PRICE_INDIVIDUAL;
  const teamPrice = process.env.STRIPE_PRICE_TEAM;

  if (priceId === individualPrice) return 'individual';
  if (priceId === teamPrice) return 'team';
  console.warn('Unknown price ID:', priceId, '— defaulting to individual');
  return 'individual';
}

/**
 * Map Stripe subscription status to our status.
 */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'past_due',
    incomplete_expired: 'canceled',
    paused: 'canceled',
  };
  return statusMap[stripeStatus] || 'active';
}

export const config = {
  path: '/api/stripe-webhook',
};
