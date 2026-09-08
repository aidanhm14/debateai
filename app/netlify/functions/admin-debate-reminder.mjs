// One-off September 8 reminder. Preview and send are driven from /admin.
// Per-address receipts survive profile changes; Resend keys protect retries.
import { createHash } from 'node:crypto';
import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { sendEmail, verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { STREAM, STAMP, SUBJECT, MESSAGE, renderReminder, buildCohort } from './lib/debate-reminder.mjs';

const FROM = process.env.DEBATE_REMINDER_FROM || process.env.LAUNCH_FROM || 'Debatable <hello@debateai.com>';
const REPLY_TO = process.env.LAUNCH_REPLY_TO || 'aidandavidhollinger@gmail.com';
const CAMPAIGN = 'debate-reminder-2026-09-08';
const hash = email => createHash('sha256').update(email).digest('hex');
const pause = () => new Promise(resolve => setTimeout(resolve, 600));

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const {db, uid} = gate;
  let body = {};
  try { body = await request.json(); } catch { /* preview */ }
  const wantsSend = body.confirm === 'SEND';
  const live = await verifiedSenderDomains();
  // The send-only production key cannot list domains. Both fallbacks were
  // verified for the existing launch and Clash Hour campaigns.
  const allowed = live.ok ? live.domains : ['debateai.com', 'itsdebatable.com'];
  const senderVerified = allowed.includes(senderDomain(FROM)) && !!process.env.RESEND_API_KEY;
  if ((wantsSend || body.test) && !senderVerified) return errorResponse('Email sender unavailable or unverified. Nothing sent.', 409, request);

  const users = await listAllAuthUsers();
  if (body.test) {
    const me = users.find(u => u.uid === uid);
    if (!me?.email) return errorResponse('The signed-in admin has no email.', 409, request);
    const result = await sendEmail({to:me.email, subject:SUBJECT, html:renderReminder(uid),
      uid, stream:STREAM, from:FROM, replyTo:REPLY_TO});
    return jsonResponse({test:true, to:me.email, result}, 200, request);
  }
  const [profileSnap, receiptSnap] = await Promise.all([
    db.collection('user_profiles').get(),
    db.collection(`email_campaigns/${CAMPAIGN}/recipients`).get(),
  ]);
  const profiles = new Map(profileSnap.docs.map(d => [d.id, d.data()]));
  const accepted = new Set(receiptSnap.docs.filter(d => d.data().status === 'sent').map(d => d.data().email));
  const {recipients, skipped} = buildCohort(users, profiles, accepted);
  const result = {dryRun:!wantsSend, from:FROM, replyTo:REPLY_TO, senderVerified,
    subject:SUBJECT, previewText:MESSAGE, accounts:users.length, eligible:recipients.length,
    sent:0, remaining:recipients.length, errors:0, skipped, errorReasons:{},
    sample:wantsSend ? [] : recipients.slice(0,5).map(r => r.email),
    acceptedTotal:accepted.size, halted:false};
  if (!wantsSend) return jsonResponse(result, 200, request);
  // A date-bound campaign cannot accidentally send "today" months later.
  if (Date.now() > Date.parse('2026-09-11T00:00:00Z')) return errorResponse('This reminder campaign has expired.', 409, request);

  const started = Date.now();
  for (const person of recipients.slice(0,5)) {
    if (Date.now() - started > 6000) break;
    const ref = db.doc(`email_campaigns/${CAMPAIGN}/recipients/${hash(person.email)}`);
    const canAttempt = await db.runTransaction(async tx => {
      const old = await tx.get(ref), data = old.data() || {};
      if (data.status === 'sent') return false;
      // An unresolved request older than Resend's 24-hour retention needs
      // provider reconciliation, never a fresh blind resend.
      if (data.firstAttemptAt && Date.now() - data.firstAttemptAt > 23 * 3600000)
        throw new Error('An earlier send needs provider reconciliation. Nothing retried.');
      if (data.leaseUntil > Date.now()) return false;
      tx.set(ref, {email:person.email, status:'pending', firstAttemptAt:data.firstAttemptAt || Date.now(),
        leaseUntil:Date.now() + 60000}, {merge:true});
      return true;
    });
    if (!canAttempt) { result.halted = true; break; }
    const res = await sendEmail({to:person.email, subject:SUBJECT, html:renderReminder(person.uid),
      uid:person.uid, stream:STREAM, from:FROM, replyTo:REPLY_TO,
      idempotencyKey:CAMPAIGN + '/' + hash(person.email)});
    if (!res.ok) {
      result.errors++; result.halted = true;
      result.errorReasons[res.reason || 'send-failed'] = 1;
      await ref.set({leaseUntil:0, error:res.reason || 'send-failed'}, {merge:true});
      break;
    }
    // Persist the provider receipt before profile stamps. A failed profile
    // write cannot cause the next batch to mail the address again.
    await ref.set({status:'sent', providerId:res.id || null, sentAt:FieldValue.serverTimestamp(), leaseUntil:0}, {merge:true});
    result.sent++; result.remaining--; result.acceptedTotal++;
    for (const account of person.accounts) await db.doc(`user_profiles/${account.uid}`).set({
      [STAMP]:FieldValue.serverTimestamp(), sparNightSentAt:FieldValue.serverTimestamp(),
    }, {merge:true});
    await pause();
  }
  await db.doc(`email_campaigns/${CAMPAIGN}`).set({subject:SUBJECT,
    lastRunAt:FieldValue.serverTimestamp(), lastResult:result}, {merge:true});
  return jsonResponse(result, 200, request);
};
export const config = {path:'/api/admin/debate-reminder'};
