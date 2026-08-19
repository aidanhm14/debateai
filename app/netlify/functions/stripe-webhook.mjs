import Stripe from 'stripe';
import { getDb, PLANS, FieldValue } from './lib/firestore.mjs';
import { TOKENS, grantTokensForInvoice, setTokenSubscriptionState } from './lib/tokens.mjs';

// Newer Stripe API versions move invoice.subscription under
// invoice.parent.subscription_details. Read both shapes.
function getInvoiceSubscriptionId(invoice) {
  const raw = invoice?.subscription
    ?? invoice?.parent?.subscription_details?.subscription
    ?? null;
  if (!raw) return null;
  return typeof raw === 'string' ? raw : raw.id;
}

// Tokens subscriptions are per-user (metadata: kind + uid), not team
// plans. Every subscription-shaped handler branches here first so the
// team logic below only ever sees team subscriptions.
function tokensUidFromSubscription(subscription) {
  if (subscription?.metadata?.kind !== 'tokens') return null;
  return subscription.metadata.uid || null;
}

// Stripe API 2024-06-20+ moved current_period_start / current_period_end
// from the Subscription object onto its line items. Older API versions
// still put them on the subscription. Read both so we keep working
// across an account that's been rolled forward to the Dahlia version.
function getSubscriptionPeriod(subscription) {
  const item = subscription?.items?.data?.[0];
  const start = subscription?.current_period_start ?? item?.current_period_start;
  const end = subscription?.current_period_end ?? item?.current_period_end;
  return {
    periodStart: start ? new Date(start * 1000) : null,
    periodEnd: end ? new Date(end * 1000) : null,
  };
}

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

        // Tournament pay-in (entry-checkout.mjs). Payment lands as
        // tournaments/{tid}/payments/{uid} — keyed by uid so a webhook
        // retry is an idempotent overwrite, never a duplicate. The
        // registration itself lives in the engine's entries
        // subcollection (tournament.mjs register action); paying makes
        // that entry payout-eligible, it does not create it.
        if (session.metadata?.kind === 'tournament_entry') {
          const { uid, tid } = session.metadata;
          if (uid && tid) {
            const tRef = db.collection('tournaments').doc(tid);
            await tRef.collection('payments').doc(uid).set({
              uid,
              status: 'paid',
              amountCents: session.amount_total ?? null,
              currency: session.currency || 'usd',
              stripeSessionId: session.id,
              paymentIntentId: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
              // Payouts are settled manually from the Stripe dashboard
              // for now; settlement flips this to 'owed' for placers.
              payout: { status: 'none' },
              createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            // Entry fees are counted, NOT added to the prize pool.
            // prizePoolCents is what /tournaments advertises ("$850 in
            // cash prizes") and what the fixed 500/250/100 ladder pays.
            // Incrementing it by the fee made every paid entry inflate
            // the advertised prize by $5 while the payout stayed put:
            // measured on the first real payment, the page went to $855
            // for a ladder that still totals $850. It also contradicted
            // the page's own promise that prizes are funded by us and
            // not raised from a pot of entry fees. The money collected
            // is real and worth knowing, so it gets its own field.
            await tRef.set({
              paidEntries: FieldValue.increment(1),
              entryFeesCents: FieldValue.increment(session.amount_total || 0),
            }, { merge: true });
            // Stamp the debater's engine entry when it already exists,
            // so the tab can show payout eligibility without a second
            // lookup. Best-effort: paying before registering is fine.
            try {
              const entry = await tRef.collection('entries')
                .where('members', 'array-contains', uid).limit(1).get();
              // prizeEligible is the field eligibility reads answer to;
              // paidEntry additionally records that money moved.
              if (!entry.empty) await entry.docs[0].ref.update({ paidEntry: true, prizeEligible: true, entryKind: 'paid' });
            } catch (e) {
              console.warn('tournament entry stamp failed:', e.message);
            }
            console.log(`Tournament pay-in: ${tid} by ${uid}`);
          }
          break;
        }

        // Bounty funding (bounty-checkout.mjs). The contribution lands
        // as bounties/{bid}/contributions/{uid} — keyed by uid so a
        // webhook retry is an idempotent overwrite, never a second
        // charge counted twice into the pot.
        //
        // The pot increments ONLY on a first-time contribution from this
        // uid, guarded inside a transaction. Without that, a Stripe
        // retry on a delivery we already processed would inflate a pot
        // that two real people are about to be paid out of.
        if (session.metadata?.kind === 'bounty_fund') {
          const { uid, bid } = session.metadata;
          const amount = session.amount_total ?? 0;
          if (uid && bid && amount > 0) {
            const bRef = db.collection('bounties').doc(bid);
            const cRef = bRef.collection('contributions').doc(uid);
            try {
              await db.runTransaction(async (tx) => {
                const [bSnap, cSnap] = await Promise.all([tx.get(bRef), tx.get(cRef)]);
                if (!bSnap.exists) throw new Error(`bounty ${bid} is gone`);
                const prev = cSnap.exists ? (cSnap.data() || {}) : null;
                // The IDEMPOTENCY KEY IS THE SESSION ID, not "has this
                // person paid before". Stripe redelivers an event it did
                // not get a 2xx for, and a same-uid check would read a
                // redelivery of one payment and a genuine second payment
                // as the same thing. Every processed session is recorded
                // so the first is skipped and the second still counts.
                const seen = Array.isArray(prev?.sessionIds) ? prev.sessionIds : [];
                if (seen.includes(session.id)) return;
                const prior = Number(prev?.amountCents) || 0;
                const firstFromThisPerson = !prev || prev.status !== 'paid';
                tx.set(cRef, {
                  uid,
                  amountCents: prior + amount,
                  currency: session.currency || 'usd',
                  status: 'paid',
                  sessionIds: seen.concat([session.id]),
                  paymentIntentIds: (Array.isArray(prev?.paymentIntentIds) ? prev.paymentIntentIds : [])
                    .concat([typeof session.payment_intent === 'string'
                      ? session.payment_intent
                      : (session.payment_intent?.id ?? null)].filter(Boolean)),
                  refund: prev?.refund || { status: 'none', doneAt: null },
                  updatedAt: FieldValue.serverTimestamp(),
                  ...(prev ? {} : { createdAt: FieldValue.serverTimestamp() }),
                }, { merge: true });
                tx.update(bRef, {
                  potCents: FieldValue.increment(amount),
                  // A second contribution from the same person grows the
                  // pot but not the backer count.
                  contributorCount: FieldValue.increment(firstFromThisPerson ? 1 : 0),
                  updatedAt: Date.now(),
                });
              });
              console.log(`Bounty funded: ${bid} by ${uid} (${amount})`);
            } catch (e) {
              console.error('bounty fund failed:', e.message);
            }
          }
          break;
        }

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

        // Tokens plan: record the linkage; the grant itself rides
        // invoice.payment_succeeded (idempotent per invoice).
        const tokensUid = tokensUidFromSubscription(subscription);
        if (tokensUid) {
          await setTokenSubscriptionState(tokensUid, {
            stripeCustomerId: session.customer || null,
            stripeSubscriptionId: subscriptionId,
            status: mapStripeStatus(subscription.status),
          });
          console.log(`Tokens subscription started for uid ${tokensUid}`);
          break;
        }

        const teamId = subscription.metadata?.teamId;

        if (!teamId) {
          console.error('No teamId in subscription metadata');
          break;
        }

        // Determine plan from price
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);

        const { periodStart: newStart, periodEnd: newEnd } = getSubscriptionPeriod(subscription);
        const planDef = PLANS[plan] || PLANS.individual;
        await db.collection('teams').doc(teamId).update({
          stripeSubscriptionId: subscriptionId,
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: planDef.requests,
          maxMembers: planDef.members,
          ...(newStart ? { currentPeriodStart: newStart } : {}),
          ...(newEnd ? { currentPeriodEnd: newEnd } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Team ${teamId} subscribed to ${plan}`);
        break;
      }

      // customer.subscription.created fires on every new subscription.
      // We were relying on checkout.session.completed alone, which DOES
      // fire for the standard Checkout flow but NOT when a user changes
      // plans through the Stripe billing portal — there's no Checkout
      // session there, just a subscription mutation. Handling created
      // explicitly closes that gap. Idempotent with .updated since we
      // do a conditional update on teams/{teamId}.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        const tokensUid = tokensUidFromSubscription(subscription);
        if (tokensUid) {
          await setTokenSubscriptionState(tokensUid, {
            stripeSubscriptionId: subscription.id,
            status: mapStripeStatus(subscription.status),
          });
          console.log(`Tokens subscription ${subscription.status} for uid ${tokensUid}`);
          break;
        }

        const teamId = subscription.metadata?.teamId;
        if (!teamId) break;

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);
        const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);

        const teamRef = db.collection('teams').doc(teamId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) { console.error('Team not found:', teamId); break; }
        const teamData = teamDoc.data();

        // Reset usage if new billing period (only if we have a period to compare against).
        const oldPeriodStart = teamData.currentPeriodStart?.toDate?.()
          || teamData.currentPeriodStart;
        const isNewPeriod = !!periodStart && (!oldPeriodStart ||
          periodStart.getTime() !== new Date(oldPeriodStart).getTime());

        const planDef = PLANS[plan] || PLANS.individual;
        const updates = {
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: planDef.requests,
          maxMembers: planDef.members,
          updatedAt: FieldValue.serverTimestamp(),
          ...(periodStart ? { currentPeriodStart: periodStart } : {}),
          ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
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

        // Tokens: cancellation stops future grants; the balance already
        // granted stays spendable.
        const tokensUid = tokensUidFromSubscription(subscription);
        if (tokensUid) {
          await setTokenSubscriptionState(tokensUid, {
            stripeSubscriptionId: null,
            status: 'canceled',
          });
          console.log(`Tokens subscription canceled for uid ${tokensUid}`);
          break;
        }

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
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (!subscriptionId) break;

        // Tokens plan: this is THE grant path. One grant per paid
        // invoice, idempotent on the invoice id, so first payment,
        // renewals, and Stripe retries all resolve to exactly one
        // ledger entry each.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tokensUid = tokensUidFromSubscription(subscription);
        if (tokensUid) {
          const perCycle = parseInt(subscription.metadata?.tokensPerCycle, 10) || TOKENS.PER_CYCLE;
          const res = await grantTokensForInvoice({
            uid: tokensUid,
            invoiceId: invoice.id,
            amount: perCycle,
            reason: 'Subscription token grant',
          });
          console.log(res.granted
            ? `Granted ${perCycle} tokens to uid ${tokensUid} (invoice ${invoice.id})`
            : `Duplicate token grant skipped for invoice ${invoice.id}`);
          break;
        }

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
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (!subscriptionId) break;

        const failedSub = await stripe.subscriptions.retrieve(subscriptionId);
        const tokensUid = tokensUidFromSubscription(failedSub);
        if (tokensUid) {
          await setTokenSubscriptionState(tokensUid, { status: 'past_due' });
          console.log(`Tokens subscription past_due for uid ${tokensUid}`);
          break;
        }

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
  const byokPrice = process.env.STRIPE_PRICE_BYOK;
  const individualPrice = process.env.STRIPE_PRICE_INDIVIDUAL;
  const teamPrice = process.env.STRIPE_PRICE_TEAM;

  if (priceId === byokPrice) return 'byok';
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
