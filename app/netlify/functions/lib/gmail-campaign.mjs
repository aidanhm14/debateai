import { FieldValue } from './firestore.mjs';
import { gmailConfig, sendGmailWelcome } from './gmail-welcome.mjs';
import { firstNameOf, renderWelcome, SUBJECT, STREAM, welcomeRecipientEligibility } from './welcome-email.mjs';
import { toText, unsubUrl } from './email.mjs';

export function validCampaignId(id) {
  return typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);
}

function campaignRecipient(user, profile) {
  const eligible = welcomeRecipientEligibility(user, profile);
  if (!eligible.ok) return eligible;
  // The old unversioned welcome is a different note. The 2026-09-21 copy,
  // whether sent via Gmail or Resend, and this explicit follow-up share a guard.
  if (profile?.personalGmailWelcomeSentAt || (profile?.signupWelcomeSentAt && profile?.signupWelcomeProvider)) {
    return { ok: false, reason: 'already_sent' };
  }
  return { ok: true };
}

export async function sendCampaignWelcome(db, user, campaignId, { sender, now = Date.now } = {}) {
  if (!validCampaignId(campaignId)) return { sent: false, reason: 'invalid_campaign' };
  if (!sender && (!gmailConfig() || !process.env.EMAIL_UNSUB_SECRET)) return { sent: false, reason: 'gmail_not_connected' };
  const manifest = db.collection('welcome_campaigns').doc(campaignId);
  const profileRef = db.collection('user_profiles').doc(user.uid);
  const delivery = db.collection('gmail_campaign_deliveries').doc(`${campaignId}_${user.uid}`);
  const budget = db.collection('config').doc('welcome_gmail_followup_budget');
  const claim = await db.runTransaction(async tx => {
    const campaign = (await tx.get(manifest)).data();
    if (!campaign || campaign.status !== 'approved' || !(campaign.expiresAt > now()) ||
        !Array.isArray(campaign.uids) || campaign.uids.length > 150 || !campaign.uids.includes(user.uid)) {
      return { reason: 'not_in_approved_campaign' };
    }
    const profile = (await tx.get(profileRef)).data();
    const eligible = campaignRecipient(user, profile);
    if (!eligible.ok) return { reason: eligible.reason };
    if (profile?.personalGmailWelcomeClaimedAt || profile?.signupWelcomeClaimedAt) return { reason: 'delivery_needs_review' };
    const state = (await tx.get(delivery)).data() || {};
    if (['sent', 'dispatching', 'uncertain'].includes(state.status)) return { reason: state.status === 'sent' ? 'already_sent' : 'delivery_needs_review' };
    if (state.nextAttemptAt > now()) return { reason: 'retry_later' };
    const reservations = ((await tx.get(budget)).data()?.reservations || []).filter(t => t > now() - 86400_000);
    // Explicit follow-ups have a separate 150/day allowance. The automatic
    // signup limit stays 100/day, leaving the combined system at most 250/day.
    if (reservations.length >= 150) return { reason: 'daily_cap' };
    tx.set(budget, { reservations: [...reservations, now()] });
    tx.set(delivery, { status: 'dispatching', startedAt: now(), campaignId, provider: 'gmail' });
    tx.set(profileRef, { personalGmailWelcomeClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { claimed: true, profile };
  });
  if (!claim.claimed) return { sent: false, reason: claim.reason };
  let result;
  try {
    const fresh = (await profileRef.get()).data();
    if (!campaignRecipient(user, fresh).ok) {
      await delivery.set({ status: 'suppressed' }, { merge: true });
      await profileRef.set({ personalGmailWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
      return { sent: false, reason: 'suppressed' };
    }
    result = await (sender || sendGmailWelcome)({
      uid: `${campaignId}:${user.uid}`, to: user.email, subject: SUBJECT,
      text: toText(renderWelcome({ firstName: firstNameOf(user, claim.profile), uid: user.uid })),
      unsubscribe: unsubUrl(user.uid, STREAM),
    });
  } catch { result = { ok: false, reason: 'delivery_exception', ambiguous: true }; }
  if (!result.ok) {
    await delivery.set({ status: result.ambiguous ? 'uncertain' : 'retry', reason: result.reason,
      nextAttemptAt: now() + (result.quotaExhausted ? 86400_000 : 30 * 60_000) }, { merge: true });
    if (!result.ambiguous) await profileRef.set({ personalGmailWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
    return { sent: false, reason: result.reason, needsReview: !!result.ambiguous, quotaExhausted: !!result.quotaExhausted };
  }
  try {
    await db.runTransaction(async tx => {
      tx.set(delivery, { status: 'sent', providerId: result.id, sentAt: now() }, { merge: true });
      tx.set(profileRef, { personalGmailWelcomeSentAt: FieldValue.serverTimestamp(),
        personalGmailWelcomeCampaign: campaignId, personalGmailWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
    });
  } catch { return { sent: true, reason: 'stamp_failed', needsReview: true }; }
  return { sent: true, reason: 'sent', id: result.id };
}
