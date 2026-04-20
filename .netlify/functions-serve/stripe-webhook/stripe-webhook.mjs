
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// ../../../netlify/functions/stripe-webhook.mjs
import Stripe from "stripe";

// ../../../netlify/functions/lib/firestore.mjs
import { Firestore, FieldValue } from "@google-cloud/firestore";
var db = null;
function getDb() {
  if (db) return db;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error("GOOGLE_SERVICE_ACCOUNT not configured");
  let creds;
  try {
    creds = JSON.parse(serviceAccount);
  } catch (e) {
    console.error("GOOGLE_SERVICE_ACCOUNT JSON parse failed. First 50 chars:", serviceAccount.slice(0, 50), "... Last 50 chars:", serviceAccount.slice(-50));
    throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON. Re-paste the service account key.");
  }
  if (!creds.project_id || !creds.client_email || !creds.private_key) {
    console.error("GOOGLE_SERVICE_ACCOUNT missing fields. Keys found:", Object.keys(creds).join(", "));
    throw new Error("GOOGLE_SERVICE_ACCOUNT is missing required fields (project_id, client_email, or private_key).");
  }
  db = new Firestore({
    projectId: creds.project_id,
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key
    }
  });
  return db;
}
var PLANS = {
  trial: { requests: 3, members: 3, priceMonthly: 0 },
  byok: { requests: 9999, members: 1, priceMonthly: 100 },
  individual: { requests: 250, members: 1, priceMonthly: 500 },
  lifetime: { requests: 250, members: 3, priceMonthly: 0 },
  team: { requests: 1500, members: 50, priceMonthly: 3e3 }
};

// ../../../netlify/functions/stripe-webhook.mjs
function getSubscriptionPeriod(subscription) {
  const item = subscription?.items?.data?.[0];
  const start = subscription?.current_period_start ?? item?.current_period_start;
  const end = subscription?.current_period_end ?? item?.current_period_end;
  return {
    periodStart: start ? new Date(start * 1e3) : null,
    periodEnd: end ? new Date(end * 1e3) : null
  };
}
var stripe_webhook_default = async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response("Webhook verification failed", { status: 400 });
  }
  const db2 = getDb();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "payment") {
          const paymentIntentId = session.payment_intent;
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          const teamId2 = paymentIntent.metadata?.teamId;
          const plan2 = paymentIntent.metadata?.plan;
          if (teamId2 && plan2 === "lifetime") {
            await db2.collection("teams").doc(teamId2).update({
              plan: "lifetime",
              status: "active",
              usageLimit: 250,
              maxMembers: 3,
              lifetimePurchasedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`Team ${teamId2} purchased lifetime plan`);
          }
          break;
        }
        if (session.mode !== "subscription") break;
        const subscriptionId = session.subscription;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const teamId = subscription.metadata?.teamId;
        if (!teamId) {
          console.error("No teamId in subscription metadata");
          break;
        }
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);
        const { periodStart: newStart, periodEnd: newEnd } = getSubscriptionPeriod(subscription);
        const planDef = PLANS[plan] || PLANS.individual;
        await db2.collection("teams").doc(teamId).update({
          stripeSubscriptionId: subscriptionId,
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: planDef.requests,
          maxMembers: planDef.members,
          ...newStart ? { currentPeriodStart: newStart } : {},
          ...newEnd ? { currentPeriodEnd: newEnd } : {},
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`Team ${teamId} subscribed to ${plan}`);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const teamId = subscription.metadata?.teamId;
        if (!teamId) break;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);
        const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);
        const teamRef = db2.collection("teams").doc(teamId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) {
          console.error("Team not found:", teamId);
          break;
        }
        const teamData = teamDoc.data();
        const oldPeriodStart = teamData.currentPeriodStart?.toDate?.() || teamData.currentPeriodStart;
        const isNewPeriod = !!periodStart && (!oldPeriodStart || periodStart.getTime() !== new Date(oldPeriodStart).getTime());
        const planDef = PLANS[plan] || PLANS.individual;
        const updates = {
          plan,
          status: mapStripeStatus(subscription.status),
          usageLimit: planDef.requests,
          maxMembers: planDef.members,
          updatedAt: FieldValue.serverTimestamp(),
          ...periodStart ? { currentPeriodStart: periodStart } : {},
          ...periodEnd ? { currentPeriodEnd: periodEnd } : {}
        };
        if (isNewPeriod) {
          updates.usageThisPeriod = 0;
        }
        await teamRef.update(updates);
        console.log(`Team ${teamId} subscription updated: ${plan} (${subscription.status})`);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const teamId = subscription.metadata?.teamId;
        if (!teamId) break;
        await db2.collection("teams").doc(teamId).update({
          status: "canceled",
          plan: "trial",
          usageLimit: PLANS.trial.requests,
          maxMembers: PLANS.trial.members,
          stripeSubscriptionId: null,
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`Team ${teamId} subscription canceled`);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;
        const teamsSnap = await db2.collection("teams").where("stripeSubscriptionId", "==", subscriptionId).limit(1).get();
        if (teamsSnap.empty) break;
        const teamDoc = teamsSnap.docs[0];
        await teamDoc.ref.update({
          status: "active",
          usageThisPeriod: 0,
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`Team ${teamDoc.id} payment succeeded, usage reset`);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;
        const teamsSnap = await db2.collection("teams").where("stripeSubscriptionId", "==", subscriptionId).limit(1).get();
        if (teamsSnap.empty) break;
        const teamDoc = teamsSnap.docs[0];
        await teamDoc.ref.update({
          status: "past_due",
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`Team ${teamDoc.id} payment failed, marked past_due`);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    console.error(`Failed event ID: ${event.id}, type: ${event.type}, data: ${JSON.stringify(event.data?.object?.id || "unknown")}`);
    return new Response(JSON.stringify({ error: "Processing failed", eventType: event.type }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
function getPlanFromPrice(priceId) {
  const byokPrice = process.env.STRIPE_PRICE_BYOK;
  const individualPrice = process.env.STRIPE_PRICE_INDIVIDUAL;
  const teamPrice = process.env.STRIPE_PRICE_TEAM;
  if (priceId === byokPrice) return "byok";
  if (priceId === individualPrice) return "individual";
  if (priceId === teamPrice) return "team";
  console.warn("Unknown price ID:", priceId, "\u2014 defaulting to individual");
  return "individual";
}
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    paused: "canceled"
  };
  return statusMap[stripeStatus] || "active";
}
var config = {
  path: "/api/stripe-webhook"
};
export {
  config,
  stripe_webhook_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vbmV0bGlmeS9mdW5jdGlvbnMvc3RyaXBlLXdlYmhvb2subWpzIiwgIi4uLy4uLy4uL25ldGxpZnkvZnVuY3Rpb25zL2xpYi9maXJlc3RvcmUubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5pbXBvcnQgeyBnZXREYiwgUExBTlMsIEZpZWxkVmFsdWUgfSBmcm9tICcuL2xpYi9maXJlc3RvcmUubWpzJztcblxuLy8gU3RyaXBlIEFQSSAyMDI0LTA2LTIwKyBtb3ZlZCBjdXJyZW50X3BlcmlvZF9zdGFydCAvIGN1cnJlbnRfcGVyaW9kX2VuZFxuLy8gZnJvbSB0aGUgU3Vic2NyaXB0aW9uIG9iamVjdCBvbnRvIGl0cyBsaW5lIGl0ZW1zLiBPbGRlciBBUEkgdmVyc2lvbnNcbi8vIHN0aWxsIHB1dCB0aGVtIG9uIHRoZSBzdWJzY3JpcHRpb24uIFJlYWQgYm90aCBzbyB3ZSBrZWVwIHdvcmtpbmdcbi8vIGFjcm9zcyBhbiBhY2NvdW50IHRoYXQncyBiZWVuIHJvbGxlZCBmb3J3YXJkIHRvIHRoZSBEYWhsaWEgdmVyc2lvbi5cbmZ1bmN0aW9uIGdldFN1YnNjcmlwdGlvblBlcmlvZChzdWJzY3JpcHRpb24pIHtcbiAgY29uc3QgaXRlbSA9IHN1YnNjcmlwdGlvbj8uaXRlbXM/LmRhdGE/LlswXTtcbiAgY29uc3Qgc3RhcnQgPSBzdWJzY3JpcHRpb24/LmN1cnJlbnRfcGVyaW9kX3N0YXJ0ID8/IGl0ZW0/LmN1cnJlbnRfcGVyaW9kX3N0YXJ0O1xuICBjb25zdCBlbmQgPSBzdWJzY3JpcHRpb24/LmN1cnJlbnRfcGVyaW9kX2VuZCA/PyBpdGVtPy5jdXJyZW50X3BlcmlvZF9lbmQ7XG4gIHJldHVybiB7XG4gICAgcGVyaW9kU3RhcnQ6IHN0YXJ0ID8gbmV3IERhdGUoc3RhcnQgKiAxMDAwKSA6IG51bGwsXG4gICAgcGVyaW9kRW5kOiBlbmQgPyBuZXcgRGF0ZShlbmQgKiAxMDAwKSA6IG51bGwsXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZSgnTWV0aG9kIG5vdCBhbGxvd2VkJywgeyBzdGF0dXM6IDQwNSB9KTtcbiAgfVxuXG4gIGNvbnN0IHN0cmlwZSA9IG5ldyBTdHJpcGUocHJvY2Vzcy5lbnYuU1RSSVBFX1NFQ1JFVF9LRVkpO1xuICBjb25zdCB3ZWJob29rU2VjcmV0ID0gcHJvY2Vzcy5lbnYuU1RSSVBFX1dFQkhPT0tfU0VDUkVUO1xuXG4gIC8vIEdldCByYXcgYm9keSBmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICBjb25zdCByYXdCb2R5ID0gYXdhaXQgcmVxdWVzdC50ZXh0KCk7XG4gIGNvbnN0IHNpZyA9IHJlcXVlc3QuaGVhZGVycy5nZXQoJ3N0cmlwZS1zaWduYXR1cmUnKTtcblxuICBsZXQgZXZlbnQ7XG4gIHRyeSB7XG4gICAgZXZlbnQgPSBzdHJpcGUud2ViaG9va3MuY29uc3RydWN0RXZlbnQocmF3Qm9keSwgc2lnLCB3ZWJob29rU2VjcmV0KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcignV2ViaG9vayBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGZhaWxlZDonLCBlcnIubWVzc2FnZSk7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZSgnV2ViaG9vayB2ZXJpZmljYXRpb24gZmFpbGVkJywgeyBzdGF0dXM6IDQwMCB9KTtcbiAgfVxuXG4gIGNvbnN0IGRiID0gZ2V0RGIoKTtcblxuICB0cnkge1xuICAgIHN3aXRjaCAoZXZlbnQudHlwZSkge1xuICAgICAgY2FzZSAnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnOiB7XG4gICAgICAgIGNvbnN0IHNlc3Npb24gPSBldmVudC5kYXRhLm9iamVjdDtcblxuICAgICAgICAvLyBIYW5kbGUgbGlmZXRpbWUgb25lLXRpbWUgcGF5bWVudFxuICAgICAgICBpZiAoc2Vzc2lvbi5tb2RlID09PSAncGF5bWVudCcpIHtcbiAgICAgICAgICBjb25zdCBwYXltZW50SW50ZW50SWQgPSBzZXNzaW9uLnBheW1lbnRfaW50ZW50O1xuICAgICAgICAgIGNvbnN0IHBheW1lbnRJbnRlbnQgPSBhd2FpdCBzdHJpcGUucGF5bWVudEludGVudHMucmV0cmlldmUocGF5bWVudEludGVudElkKTtcbiAgICAgICAgICBjb25zdCB0ZWFtSWQgPSBwYXltZW50SW50ZW50Lm1ldGFkYXRhPy50ZWFtSWQ7XG4gICAgICAgICAgY29uc3QgcGxhbiA9IHBheW1lbnRJbnRlbnQubWV0YWRhdGE/LnBsYW47XG5cbiAgICAgICAgICBpZiAodGVhbUlkICYmIHBsYW4gPT09ICdsaWZldGltZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCkudXBkYXRlKHtcbiAgICAgICAgICAgICAgcGxhbjogJ2xpZmV0aW1lJyxcbiAgICAgICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJyxcbiAgICAgICAgICAgICAgdXNhZ2VMaW1pdDogMjUwLFxuICAgICAgICAgICAgICBtYXhNZW1iZXJzOiAzLFxuICAgICAgICAgICAgICBsaWZldGltZVB1cmNoYXNlZEF0OiBGaWVsZFZhbHVlLnNlcnZlclRpbWVzdGFtcCgpLFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBUZWFtICR7dGVhbUlkfSBwdXJjaGFzZWQgbGlmZXRpbWUgcGxhbmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLm1vZGUgIT09ICdzdWJzY3JpcHRpb24nKSBicmVhaztcblxuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IHNlc3Npb24uc3Vic2NyaXB0aW9uO1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBhd2FpdCBzdHJpcGUuc3Vic2NyaXB0aW9ucy5yZXRyaWV2ZShzdWJzY3JpcHRpb25JZCk7XG4gICAgICAgIGNvbnN0IHRlYW1JZCA9IHN1YnNjcmlwdGlvbi5tZXRhZGF0YT8udGVhbUlkO1xuXG4gICAgICAgIGlmICghdGVhbUlkKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignTm8gdGVhbUlkIGluIHN1YnNjcmlwdGlvbiBtZXRhZGF0YScpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIHBsYW4gZnJvbSBwcmljZVxuICAgICAgICBjb25zdCBwcmljZUlkID0gc3Vic2NyaXB0aW9uLml0ZW1zLmRhdGFbMF0/LnByaWNlPy5pZDtcbiAgICAgICAgY29uc3QgcGxhbiA9IGdldFBsYW5Gcm9tUHJpY2UocHJpY2VJZCk7XG5cbiAgICAgICAgY29uc3QgeyBwZXJpb2RTdGFydDogbmV3U3RhcnQsIHBlcmlvZEVuZDogbmV3RW5kIH0gPSBnZXRTdWJzY3JpcHRpb25QZXJpb2Qoc3Vic2NyaXB0aW9uKTtcbiAgICAgICAgY29uc3QgcGxhbkRlZiA9IFBMQU5TW3BsYW5dIHx8IFBMQU5TLmluZGl2aWR1YWw7XG4gICAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCkudXBkYXRlKHtcbiAgICAgICAgICBzdHJpcGVTdWJzY3JpcHRpb25JZDogc3Vic2NyaXB0aW9uSWQsXG4gICAgICAgICAgcGxhbixcbiAgICAgICAgICBzdGF0dXM6IG1hcFN0cmlwZVN0YXR1cyhzdWJzY3JpcHRpb24uc3RhdHVzKSxcbiAgICAgICAgICB1c2FnZUxpbWl0OiBwbGFuRGVmLnJlcXVlc3RzLFxuICAgICAgICAgIG1heE1lbWJlcnM6IHBsYW5EZWYubWVtYmVycyxcbiAgICAgICAgICAuLi4obmV3U3RhcnQgPyB7IGN1cnJlbnRQZXJpb2RTdGFydDogbmV3U3RhcnQgfSA6IHt9KSxcbiAgICAgICAgICAuLi4obmV3RW5kID8geyBjdXJyZW50UGVyaW9kRW5kOiBuZXdFbmQgfSA6IHt9KSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBUZWFtICR7dGVhbUlkfSBzdWJzY3JpYmVkIHRvICR7cGxhbn1gKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJ2N1c3RvbWVyLnN1YnNjcmlwdGlvbi51cGRhdGVkJzoge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBldmVudC5kYXRhLm9iamVjdDtcbiAgICAgICAgY29uc3QgdGVhbUlkID0gc3Vic2NyaXB0aW9uLm1ldGFkYXRhPy50ZWFtSWQ7XG4gICAgICAgIGlmICghdGVhbUlkKSBicmVhaztcblxuICAgICAgICBjb25zdCBwcmljZUlkID0gc3Vic2NyaXB0aW9uLml0ZW1zLmRhdGFbMF0/LnByaWNlPy5pZDtcbiAgICAgICAgY29uc3QgcGxhbiA9IGdldFBsYW5Gcm9tUHJpY2UocHJpY2VJZCk7XG4gICAgICAgIGNvbnN0IHsgcGVyaW9kU3RhcnQsIHBlcmlvZEVuZCB9ID0gZ2V0U3Vic2NyaXB0aW9uUGVyaW9kKHN1YnNjcmlwdGlvbik7XG5cbiAgICAgICAgY29uc3QgdGVhbVJlZiA9IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCk7XG4gICAgICAgIGNvbnN0IHRlYW1Eb2MgPSBhd2FpdCB0ZWFtUmVmLmdldCgpO1xuICAgICAgICBpZiAoIXRlYW1Eb2MuZXhpc3RzKSB7IGNvbnNvbGUuZXJyb3IoJ1RlYW0gbm90IGZvdW5kOicsIHRlYW1JZCk7IGJyZWFrOyB9XG4gICAgICAgIGNvbnN0IHRlYW1EYXRhID0gdGVhbURvYy5kYXRhKCk7XG5cbiAgICAgICAgLy8gUmVzZXQgdXNhZ2UgaWYgbmV3IGJpbGxpbmcgcGVyaW9kIChvbmx5IGlmIHdlIGhhdmUgYSBwZXJpb2QgdG8gY29tcGFyZSBhZ2FpbnN0KS5cbiAgICAgICAgY29uc3Qgb2xkUGVyaW9kU3RhcnQgPSB0ZWFtRGF0YS5jdXJyZW50UGVyaW9kU3RhcnQ/LnRvRGF0ZT8uKClcbiAgICAgICAgICB8fCB0ZWFtRGF0YS5jdXJyZW50UGVyaW9kU3RhcnQ7XG4gICAgICAgIGNvbnN0IGlzTmV3UGVyaW9kID0gISFwZXJpb2RTdGFydCAmJiAoIW9sZFBlcmlvZFN0YXJ0IHx8XG4gICAgICAgICAgcGVyaW9kU3RhcnQuZ2V0VGltZSgpICE9PSBuZXcgRGF0ZShvbGRQZXJpb2RTdGFydCkuZ2V0VGltZSgpKTtcblxuICAgICAgICBjb25zdCBwbGFuRGVmID0gUExBTlNbcGxhbl0gfHwgUExBTlMuaW5kaXZpZHVhbDtcbiAgICAgICAgY29uc3QgdXBkYXRlcyA9IHtcbiAgICAgICAgICBwbGFuLFxuICAgICAgICAgIHN0YXR1czogbWFwU3RyaXBlU3RhdHVzKHN1YnNjcmlwdGlvbi5zdGF0dXMpLFxuICAgICAgICAgIHVzYWdlTGltaXQ6IHBsYW5EZWYucmVxdWVzdHMsXG4gICAgICAgICAgbWF4TWVtYmVyczogcGxhbkRlZi5tZW1iZXJzLFxuICAgICAgICAgIHVwZGF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgICAgICAuLi4ocGVyaW9kU3RhcnQgPyB7IGN1cnJlbnRQZXJpb2RTdGFydDogcGVyaW9kU3RhcnQgfSA6IHt9KSxcbiAgICAgICAgICAuLi4ocGVyaW9kRW5kID8geyBjdXJyZW50UGVyaW9kRW5kOiBwZXJpb2RFbmQgfSA6IHt9KSxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaXNOZXdQZXJpb2QpIHtcbiAgICAgICAgICB1cGRhdGVzLnVzYWdlVGhpc1BlcmlvZCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0ZWFtUmVmLnVwZGF0ZSh1cGRhdGVzKTtcbiAgICAgICAgY29uc29sZS5sb2coYFRlYW0gJHt0ZWFtSWR9IHN1YnNjcmlwdGlvbiB1cGRhdGVkOiAke3BsYW59ICgke3N1YnNjcmlwdGlvbi5zdGF0dXN9KWApO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnY3VzdG9tZXIuc3Vic2NyaXB0aW9uLmRlbGV0ZWQnOiB7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IGV2ZW50LmRhdGEub2JqZWN0O1xuICAgICAgICBjb25zdCB0ZWFtSWQgPSBzdWJzY3JpcHRpb24ubWV0YWRhdGE/LnRlYW1JZDtcbiAgICAgICAgaWYgKCF0ZWFtSWQpIGJyZWFrO1xuXG4gICAgICAgIGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJykuZG9jKHRlYW1JZCkudXBkYXRlKHtcbiAgICAgICAgICBzdGF0dXM6ICdjYW5jZWxlZCcsXG4gICAgICAgICAgcGxhbjogJ3RyaWFsJyxcbiAgICAgICAgICB1c2FnZUxpbWl0OiBQTEFOUy50cmlhbC5yZXF1ZXN0cyxcbiAgICAgICAgICBtYXhNZW1iZXJzOiBQTEFOUy50cmlhbC5tZW1iZXJzLFxuICAgICAgICAgIHN0cmlwZVN1YnNjcmlwdGlvbklkOiBudWxsLFxuICAgICAgICAgIHVwZGF0ZWRBdDogRmllbGRWYWx1ZS5zZXJ2ZXJUaW1lc3RhbXAoKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFRlYW0gJHt0ZWFtSWR9IHN1YnNjcmlwdGlvbiBjYW5jZWxlZGApO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnaW52b2ljZS5wYXltZW50X3N1Y2NlZWRlZCc6IHtcbiAgICAgICAgY29uc3QgaW52b2ljZSA9IGV2ZW50LmRhdGEub2JqZWN0O1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IGludm9pY2Uuc3Vic2NyaXB0aW9uO1xuICAgICAgICBpZiAoIXN1YnNjcmlwdGlvbklkKSBicmVhaztcblxuICAgICAgICAvLyBGaW5kIHRlYW0gYnkgc3Vic2NyaXB0aW9uIElEXG4gICAgICAgIGNvbnN0IHRlYW1zU25hcCA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJylcbiAgICAgICAgICAud2hlcmUoJ3N0cmlwZVN1YnNjcmlwdGlvbklkJywgJz09Jywgc3Vic2NyaXB0aW9uSWQpXG4gICAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgICAgLmdldCgpO1xuXG4gICAgICAgIGlmICh0ZWFtc1NuYXAuZW1wdHkpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IHRlYW1Eb2MgPSB0ZWFtc1NuYXAuZG9jc1swXTtcbiAgICAgICAgYXdhaXQgdGVhbURvYy5yZWYudXBkYXRlKHtcbiAgICAgICAgICBzdGF0dXM6ICdhY3RpdmUnLFxuICAgICAgICAgIHVzYWdlVGhpc1BlcmlvZDogMCxcbiAgICAgICAgICB1cGRhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBUZWFtICR7dGVhbURvYy5pZH0gcGF5bWVudCBzdWNjZWVkZWQsIHVzYWdlIHJlc2V0YCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICdpbnZvaWNlLnBheW1lbnRfZmFpbGVkJzoge1xuICAgICAgICBjb25zdCBpbnZvaWNlID0gZXZlbnQuZGF0YS5vYmplY3Q7XG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbklkID0gaW52b2ljZS5zdWJzY3JpcHRpb247XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uSWQpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IHRlYW1zU25hcCA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1zJylcbiAgICAgICAgICAud2hlcmUoJ3N0cmlwZVN1YnNjcmlwdGlvbklkJywgJz09Jywgc3Vic2NyaXB0aW9uSWQpXG4gICAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgICAgLmdldCgpO1xuXG4gICAgICAgIGlmICh0ZWFtc1NuYXAuZW1wdHkpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IHRlYW1Eb2MgPSB0ZWFtc1NuYXAuZG9jc1swXTtcbiAgICAgICAgYXdhaXQgdGVhbURvYy5yZWYudXBkYXRlKHtcbiAgICAgICAgICBzdGF0dXM6ICdwYXN0X2R1ZScsXG4gICAgICAgICAgdXBkYXRlZEF0OiBGaWVsZFZhbHVlLnNlcnZlclRpbWVzdGFtcCgpLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhgVGVhbSAke3RlYW1Eb2MuaWR9IHBheW1lbnQgZmFpbGVkLCBtYXJrZWQgcGFzdF9kdWVgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnNvbGUubG9nKGBVbmhhbmRsZWQgZXZlbnQgdHlwZTogJHtldmVudC50eXBlfWApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3IgcHJvY2Vzc2luZyAke2V2ZW50LnR5cGV9OmAsIGVycik7XG4gICAgY29uc29sZS5lcnJvcihgRmFpbGVkIGV2ZW50IElEOiAke2V2ZW50LmlkfSwgdHlwZTogJHtldmVudC50eXBlfSwgZGF0YTogJHtKU09OLnN0cmluZ2lmeShldmVudC5kYXRhPy5vYmplY3Q/LmlkIHx8ICd1bmtub3duJyl9YCk7XG4gICAgLy8gUmV0dXJuIDUwMCBzbyBTdHJpcGUgcmV0cmllcyB0aGUgd2ViaG9vayBcdTIwMTQgZmFpbGVkIGJpbGxpbmcgdXBkYXRlcyBtdXN0IG5vdCBiZSBzaWxlbnRseSBkcm9wcGVkXG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUHJvY2Vzc2luZyBmYWlsZWQnLCBldmVudFR5cGU6IGV2ZW50LnR5cGUgfSksIHtcbiAgICAgIHN0YXR1czogNTAwLFxuICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgcmVjZWl2ZWQ6IHRydWUgfSksIHtcbiAgICBzdGF0dXM6IDIwMCxcbiAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcbiAgfSk7XG59O1xuXG4vKipcbiAqIE1hcCBhIFN0cmlwZSBwcmljZSBJRCB0byBvdXIgcGxhbiBuYW1lLlxuICovXG5mdW5jdGlvbiBnZXRQbGFuRnJvbVByaWNlKHByaWNlSWQpIHtcbiAgY29uc3QgYnlva1ByaWNlID0gcHJvY2Vzcy5lbnYuU1RSSVBFX1BSSUNFX0JZT0s7XG4gIGNvbnN0IGluZGl2aWR1YWxQcmljZSA9IHByb2Nlc3MuZW52LlNUUklQRV9QUklDRV9JTkRJVklEVUFMO1xuICBjb25zdCB0ZWFtUHJpY2UgPSBwcm9jZXNzLmVudi5TVFJJUEVfUFJJQ0VfVEVBTTtcblxuICBpZiAocHJpY2VJZCA9PT0gYnlva1ByaWNlKSByZXR1cm4gJ2J5b2snO1xuICBpZiAocHJpY2VJZCA9PT0gaW5kaXZpZHVhbFByaWNlKSByZXR1cm4gJ2luZGl2aWR1YWwnO1xuICBpZiAocHJpY2VJZCA9PT0gdGVhbVByaWNlKSByZXR1cm4gJ3RlYW0nO1xuICBjb25zb2xlLndhcm4oJ1Vua25vd24gcHJpY2UgSUQ6JywgcHJpY2VJZCwgJ1x1MjAxNCBkZWZhdWx0aW5nIHRvIGluZGl2aWR1YWwnKTtcbiAgcmV0dXJuICdpbmRpdmlkdWFsJztcbn1cblxuLyoqXG4gKiBNYXAgU3RyaXBlIHN1YnNjcmlwdGlvbiBzdGF0dXMgdG8gb3VyIHN0YXR1cy5cbiAqL1xuZnVuY3Rpb24gbWFwU3RyaXBlU3RhdHVzKHN0cmlwZVN0YXR1cykge1xuICBjb25zdCBzdGF0dXNNYXAgPSB7XG4gICAgYWN0aXZlOiAnYWN0aXZlJyxcbiAgICB0cmlhbGluZzogJ3RyaWFsaW5nJyxcbiAgICBwYXN0X2R1ZTogJ3Bhc3RfZHVlJyxcbiAgICBjYW5jZWxlZDogJ2NhbmNlbGVkJyxcbiAgICB1bnBhaWQ6ICd1bnBhaWQnLFxuICAgIGluY29tcGxldGU6ICdwYXN0X2R1ZScsXG4gICAgaW5jb21wbGV0ZV9leHBpcmVkOiAnY2FuY2VsZWQnLFxuICAgIHBhdXNlZDogJ2NhbmNlbGVkJyxcbiAgfTtcbiAgcmV0dXJuIHN0YXR1c01hcFtzdHJpcGVTdGF0dXNdIHx8ICdhY3RpdmUnO1xufVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0ge1xuICBwYXRoOiAnL2FwaS9zdHJpcGUtd2ViaG9vaycsXG59O1xuIiwgImltcG9ydCB7IEZpcmVzdG9yZSwgRmllbGRWYWx1ZSB9IGZyb20gJ0Bnb29nbGUtY2xvdWQvZmlyZXN0b3JlJztcblxubGV0IGRiID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERiKCkge1xuICBpZiAoZGIpIHJldHVybiBkYjtcblxuICBjb25zdCBzZXJ2aWNlQWNjb3VudCA9IHByb2Nlc3MuZW52LkdPT0dMRV9TRVJWSUNFX0FDQ09VTlQ7XG4gIGlmICghc2VydmljZUFjY291bnQpIHRocm93IG5ldyBFcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBub3QgY29uZmlndXJlZCcpO1xuXG4gIGxldCBjcmVkcztcbiAgdHJ5IHtcbiAgICBjcmVkcyA9IEpTT04ucGFyc2Uoc2VydmljZUFjY291bnQpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBKU09OIHBhcnNlIGZhaWxlZC4gRmlyc3QgNTAgY2hhcnM6Jywgc2VydmljZUFjY291bnQuc2xpY2UoMCwgNTApLCAnLi4uIExhc3QgNTAgY2hhcnM6Jywgc2VydmljZUFjY291bnQuc2xpY2UoLTUwKSk7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdHT09HTEVfU0VSVklDRV9BQ0NPVU5UIGlzIG5vdCB2YWxpZCBKU09OLiBSZS1wYXN0ZSB0aGUgc2VydmljZSBhY2NvdW50IGtleS4nKTtcbiAgfVxuXG4gIGlmICghY3JlZHMucHJvamVjdF9pZCB8fCAhY3JlZHMuY2xpZW50X2VtYWlsIHx8ICFjcmVkcy5wcml2YXRlX2tleSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0dPT0dMRV9TRVJWSUNFX0FDQ09VTlQgbWlzc2luZyBmaWVsZHMuIEtleXMgZm91bmQ6JywgT2JqZWN0LmtleXMoY3JlZHMpLmpvaW4oJywgJykpO1xuICAgIHRocm93IG5ldyBFcnJvcignR09PR0xFX1NFUlZJQ0VfQUNDT1VOVCBpcyBtaXNzaW5nIHJlcXVpcmVkIGZpZWxkcyAocHJvamVjdF9pZCwgY2xpZW50X2VtYWlsLCBvciBwcml2YXRlX2tleSkuJyk7XG4gIH1cblxuICBkYiA9IG5ldyBGaXJlc3RvcmUoe1xuICAgIHByb2plY3RJZDogY3JlZHMucHJvamVjdF9pZCxcbiAgICBjcmVkZW50aWFsczoge1xuICAgICAgY2xpZW50X2VtYWlsOiBjcmVkcy5jbGllbnRfZW1haWwsXG4gICAgICBwcml2YXRlX2tleTogY3JlZHMucHJpdmF0ZV9rZXksXG4gICAgfSxcbiAgfSk7XG4gIHJldHVybiBkYjtcbn1cblxuLy8gUGxhbiB0aWVyIGRlZmluaXRpb25zXG5leHBvcnQgY29uc3QgUExBTlMgPSB7XG4gIHRyaWFsOiAgeyByZXF1ZXN0czogMywgICAgbWVtYmVyczogMywgIHByaWNlTW9udGhseTogMCB9LFxuICBieW9rOiAgICAgICB7IHJlcXVlc3RzOiA5OTk5LCBtZW1iZXJzOiAxLCAgcHJpY2VNb250aGx5OiAxMDAgfSxcbiAgaW5kaXZpZHVhbDogeyByZXF1ZXN0czogMjUwLCAgbWVtYmVyczogMSwgIHByaWNlTW9udGhseTogNTAwIH0sXG4gIGxpZmV0aW1lOiAgIHsgcmVxdWVzdHM6IDI1MCwgIG1lbWJlcnM6IDMsICBwcmljZU1vbnRobHk6IDAgfSxcbiAgdGVhbTogICAgICAgeyByZXF1ZXN0czogMTUwMCwgbWVtYmVyczogNTAsIHByaWNlTW9udGhseTogMzAwMCB9LFxufTtcblxuLyoqXG4gKiBMb29rIHVwIGEgdXNlcidzIHRlYW0gZ2l2ZW4gdGhlaXIgRmlyZWJhc2UgVUlELlxuICogUmV0dXJucyB7IHRlYW0sIHRlYW1SZWYsIG1lbWJlcnNoaXAgfSBvciBudWxsIGlmIG5vIHRlYW0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRVc2VyVGVhbSh1aWQpIHtcbiAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gIC8vIEZpbmQgbWVtYmVyc2hpcFxuICBjb25zdCBtZW1iZXJzaGlwcyA9IGF3YWl0IGRiLmNvbGxlY3Rpb24oJ3RlYW1fbWVtYmVycycpXG4gICAgLndoZXJlKCd1c2VySWQnLCAnPT0nLCB1aWQpXG4gICAgLmxpbWl0KDEpXG4gICAgLmdldCgpO1xuXG4gIGlmIChtZW1iZXJzaGlwcy5lbXB0eSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgbWVtYmVyc2hpcCA9IG1lbWJlcnNoaXBzLmRvY3NbMF0uZGF0YSgpO1xuICBjb25zdCB0ZWFtUmVmID0gZGIuY29sbGVjdGlvbigndGVhbXMnKS5kb2MobWVtYmVyc2hpcC50ZWFtSWQpO1xuICBjb25zdCB0ZWFtRG9jID0gYXdhaXQgdGVhbVJlZi5nZXQoKTtcblxuICBpZiAoIXRlYW1Eb2MuZXhpc3RzKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4ge1xuICAgIHRlYW06IHsgaWQ6IHRlYW1Eb2MuaWQsIC4uLnRlYW1Eb2MuZGF0YSgpIH0sXG4gICAgdGVhbVJlZixcbiAgICBtZW1iZXJzaGlwLFxuICB9O1xufVxuXG4vKipcbiAqIEluY3JlbWVudCB1c2FnZSBjb3VudGVyIGZvciBhIHRlYW0gYW5kIGxvZyB0aGUgcmVxdWVzdC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvZ1VzYWdlKHRlYW1JZCwgdXNlcklkLCBmZWF0dXJlLCBpbnB1dFRva2VucyA9IDAsIG91dHB1dFRva2VucyA9IDApIHtcbiAgY29uc3QgZGIgPSBnZXREYigpO1xuXG4gIC8vIEF0b21pYyBpbmNyZW1lbnQgb2YgdGhlIHRlYW0gdXNhZ2UgY291bnRlclxuICBhd2FpdCBkYi5jb2xsZWN0aW9uKCd0ZWFtcycpLmRvYyh0ZWFtSWQpLnVwZGF0ZSh7XG4gICAgdXNhZ2VUaGlzUGVyaW9kOiBGaWVsZFZhbHVlLmluY3JlbWVudCgxKSxcbiAgICB1cGRhdGVkQXQ6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gIH0pO1xuXG4gIC8vIEFwcGVuZCBkZXRhaWxlZCB1c2FnZSBsb2dcbiAgYXdhaXQgZGIuY29sbGVjdGlvbigndXNhZ2VfbG9ncycpLmFkZCh7XG4gICAgdGVhbUlkLFxuICAgIHVzZXJJZCxcbiAgICBmZWF0dXJlLFxuICAgIGlucHV0VG9rZW5zLFxuICAgIG91dHB1dFRva2VucyxcbiAgICB0aW1lc3RhbXA6IEZpZWxkVmFsdWUuc2VydmVyVGltZXN0YW1wKCksXG4gIH0pO1xufVxuXG5leHBvcnQgeyBGaWVsZFZhbHVlIH07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBQUEsT0FBTyxZQUFZOzs7QUNBbkIsU0FBUyxXQUFXLGtCQUFrQjtBQUV0QyxJQUFJLEtBQUs7QUFFRixTQUFTLFFBQVE7QUFDdEIsTUFBSSxHQUFJLFFBQU87QUFFZixRQUFNLGlCQUFpQixRQUFRLElBQUk7QUFDbkMsTUFBSSxDQUFDLGVBQWdCLE9BQU0sSUFBSSxNQUFNLHVDQUF1QztBQUU1RSxNQUFJO0FBQ0osTUFBSTtBQUNGLFlBQVEsS0FBSyxNQUFNLGNBQWM7QUFBQSxFQUNuQyxTQUFTLEdBQUc7QUFDVixZQUFRLE1BQU0sNkRBQTZELGVBQWUsTUFBTSxHQUFHLEVBQUUsR0FBRyxzQkFBc0IsZUFBZSxNQUFNLEdBQUcsQ0FBQztBQUN2SixVQUFNLElBQUksTUFBTSw2RUFBNkU7QUFBQSxFQUMvRjtBQUVBLE1BQUksQ0FBQyxNQUFNLGNBQWMsQ0FBQyxNQUFNLGdCQUFnQixDQUFDLE1BQU0sYUFBYTtBQUNsRSxZQUFRLE1BQU0sc0RBQXNELE9BQU8sS0FBSyxLQUFLLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDakcsVUFBTSxJQUFJLE1BQU0sK0ZBQStGO0FBQUEsRUFDakg7QUFFQSxPQUFLLElBQUksVUFBVTtBQUFBLElBQ2pCLFdBQVcsTUFBTTtBQUFBLElBQ2pCLGFBQWE7QUFBQSxNQUNYLGNBQWMsTUFBTTtBQUFBLE1BQ3BC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
