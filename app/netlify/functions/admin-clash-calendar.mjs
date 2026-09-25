// Fixed, date-bound campaign. No client-supplied recipients or copy.
import { createHash, randomUUID } from 'node:crypto';
import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { CAMPAIGN, SUBJECT, MESSAGE, cohort, payload } from './lib/clash-calendar-email.mjs';
import { campaignSuppressions } from './lib/campaign-suppressions.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const {db, uid} = gate;
  let body = {};
  try { body = await request.json(); } catch { /* read-only preview */ }
  const users = await listAllAuthUsers();
  const profileSnap = await db.collection('user_profiles').get();
  const profiles = new Map(profileSnap.docs.map(d => [d.id,d.data()]));
  const selection = cohort(users,profiles);
  const suppressed = await campaignSuppressions(db,CAMPAIGN);
  const skipped = {...selection.skipped, providerSuppressed:selection.recipients.filter(p=>suppressed.has(p.email)).length};
  const eligible = selection.recipients.filter(p=>!suppressed.has(p.email));
  const ref = db.doc(`email_campaigns/${CAMPAIGN}`);
  let state = (await ref.get()).data() || {};
  if (body.confirm === 'PREPARE') {
    await db.runTransaction(async tx => {
      const existing = (await tx.get(ref)).data();
      if (existing?.manifest) return;
      tx.set(ref,{manifest:eligible,subject:SUBJECT,contentHash:hash(MESSAGE),createdAt:Date.now(),expiresAt:Date.parse('2026-09-25T23:00:00Z'),skipped},{merge:true});
    });
    state = (await ref.get()).data() || {};
  }
  const allowedNow = new Set(eligible.map(p=>p.email));
  const recipients = (state.manifest || eligible).filter(p=>allowedNow.has(p.email));
  const remaining = recipients.filter(p => !state.sent?.[hash(p.email)]).length;
  if (body.confirm !== 'SEND') return jsonResponse({dryRun:true,subject:SUBJECT,previewText:MESSAGE,
    emailAccounts:users.filter(u => u.email).length,eligible:recipients.length,remaining,
    acceptedTotal:Object.keys(state.sent || {}).length,skipped,pending:!!state.active,prepared:!!state.manifest,frozenTotal:state.manifest?.length||0},200,request);
  if (Date.now() > Date.parse('2026-09-25T23:00:00Z')) return errorResponse('This campaign has expired.',409,request);
  if (!state.manifest || state.contentHash !== hash(MESSAGE)) return errorResponse('Prepare this exact invitation before sending.',409,request);
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_UNSUB_SECRET) return errorResponse('Email is not configured.',409,request);
  const lease = randomUUID();
  const count = Math.min(50,Math.max(1,Number.parseInt(body.batch,10) || 50));
  let active;
  try {
    active = await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data() || {};
      if (current.leaseUntil > Date.now()) throw new Error('A batch is already running.');
      let batch = current.active;
      if (batch) {
        if (Date.now() - batch.firstAttemptAt > 23 * 3600000) throw new Error('Pending batch needs provider reconciliation.');
        // Retry only the identical request within the provider dedup window.
        const allowed = new Set(recipients.map(p => p.email));
        if (batch.people.some(p => !allowed.has(p.email))) throw new Error('A pending recipient changed preferences. Reconcile before retrying.');
      } else {
        let people = recipients.filter(p => !current.sent?.[hash(p.email)]);
        if (body.test === true) people = people.filter(p => p.uids.includes(uid));
        people = people.slice(0,body.test === true ? 1 : count);
        if (!people.length) return null;
        const messages = people.map(payload);
        batch = { people, messages, firstAttemptAt:Date.now(), key:CAMPAIGN + '/' + hash(JSON.stringify(messages)) };
      }
      tx.set(ref,{active:batch,lease,leaseUntil:Date.now()+120000,subject:SUBJECT},{merge:true});
      return batch;
    });
  } catch (err) { return errorResponse(err.message,409,request); }
  if (!active) return jsonResponse({sent:0,remaining,acceptedTotal:Object.keys(state.sent || {}).length},200,request);

  let response, result;
  try {
    response = await fetch('https://api.resend.com/emails/batch',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':active.key},
      body:JSON.stringify(active.messages),signal:AbortSignal.timeout(20000),
    });
    result = await response.json();
  } catch {
    // Keep the immutable request for reconciliation or an idempotent retry.
    await ref.set({leaseUntil:0,lastError:'Provider result unknown'},{merge:true});
    return errorResponse('Provider result unknown. Retry this same campaign only.',502,request);
  }
  if (!response.ok || !Array.isArray(result.data) || result.data.length !== active.people.length || result.data.some(r => !r.id)) {
    const reason = result.name || `resend-${response.status}`;
    await ref.set({leaseUntil:0,lastError:reason},{merge:true});
    return jsonResponse({sent:0,halted:true,error:reason,message:result.message || 'Unexpected provider response',remaining},502,request);
  }
  const writes = db.batch();
  const sent = {};
  active.people.forEach((p,i) => {
    const id = hash(p.email);sent[id] = result.data[i].id;
    writes.set(db.doc(`email_campaigns/${CAMPAIGN}/recipients/${id}`),{
      email:p.email,uid:p.uid,status:'sent',providerId:result.data[i].id,sentAt:FieldValue.serverTimestamp(),
    });
    for (const account of p.uids) writes.set(db.doc(`user_profiles/${account}`),{
      clashCalendarSep25SentAt:FieldValue.serverTimestamp(),sparNightSentAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  writes.set(ref,{sent,active:null,leaseUntil:0,lastError:null,lastRunAt:FieldValue.serverTimestamp()},{merge:true});
  await writes.commit();
  return jsonResponse({sent:active.people.length,remaining:Math.max(0,remaining-active.people.length),
    acceptedTotal:Object.keys({...state.sent,...sent}).length},200,request);
};
export const config = {path:'/api/admin/clash-calendar'};
