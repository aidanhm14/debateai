import assert from 'node:assert/strict';
import { FieldValue } from '../app/netlify/functions/lib/firestore.mjs';
import { gmailRawMessage, sendGmailWelcome, GMAIL_SENDER } from '../app/netlify/functions/lib/gmail-welcome.mjs';
import { sendWelcomeTo, welcomeEligibility, WELCOME_DELAY_MS } from '../app/netlify/functions/lib/welcome-email.mjs';
import { runWelcomeQueue } from '../app/netlify/functions/lib/welcome-queue.mjs';
import { sendCampaignWelcome } from '../app/netlify/functions/lib/gmail-campaign.mjs';

const env = { ...process.env };
const now = Date.parse('2026-09-21T12:00:00Z');
Object.assign(process.env, {
  WELCOME_TRANSPORT: 'gmail', WELCOME_GMAIL_SINCE: '2026-09-21T00:00:00Z',
  WELCOME_GMAIL_OAUTH: JSON.stringify({ client_id: 'test', client_secret: 'test', refresh_token: 'test' }),
  EMAIL_UNSUB_SECRET: 'test-only',
});
const user = uid => ({ uid, email: `${uid}@example.com`, displayName: 'Sam Lee', emailVerified: true,
  providerData: [{ providerId: 'google.com' }], metadata: { creationTime: '2026-09-21T10:00:00Z' } });
const message = { uid: 'u1', to: 'sam@example.com', subject: 'welcome to debatable', text: 'Hey Sam,\n9 pm Sydney time',
  unsubscribe: 'https://itsdebatable.com/api/email-unsub?u=u1&s=onboarding&t=test' };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`ok ${name}`); }

function fakeDb() {
  const rows = new Map();
  let serial = Promise.resolve();
  const apply = (ref, patch, options) => {
    const data = options?.merge ? { ...(rows.get(ref.path) || {}) } : {};
    for (const [key, value] of Object.entries(patch)) {
      if (value?.isEqual?.(FieldValue.delete())) delete data[key];
      else if (value?.isEqual?.(FieldValue.serverTimestamp())) data[key] = { toMillis: () => now };
      else data[key] = value;
    }
    rows.set(ref.path, data);
  };
  const snapshot = ref => ({ exists: rows.has(ref.path), data: () => rows.get(ref.path) });
  const ref = (name, id) => ({ path: `${name}/${id}`, get: async function () { return snapshot(this); },
    set: async function (patch, options) { apply(this, patch, options); } });
  const query = (name, before = Infinity, count = Infinity) => ({
    doc: id => ref(name, id),
    where: (field, op, value) => { assert.equal(field, 'nextAttemptAt'); assert.equal(op, '<='); return query(name, value, count); },
    orderBy: field => { assert.equal(field, 'nextAttemptAt'); return query(name, before, count); },
    limit: limit => query(name, before, limit),
    get: async () => ({ docs: [...rows.entries()].filter(([path, data]) => path.startsWith(name + '/') && data.nextAttemptAt <= before)
      .sort((a, b) => a[1].nextAttemptAt - b[1].nextAttemptAt).slice(0, count)
      .map(([path, data]) => ({ id: path.split('/')[1], ref: ref(name, path.split('/')[1]), data: () => data })) }),
  });
  const db = { rows, failReceipt: false,
    collection: name => query(name),
    runTransaction(fn) {
      const run = serial.then(async () => {
        const writes = [];
        const result = await fn({ get: async ref => snapshot(ref), set: (...args) => writes.push(args) });
        if (db.failReceipt && writes.some(([, patch]) => patch.status === 'sent')) throw new Error('receipt unavailable');
        for (const args of writes) apply(...args);
        return result;
      });
      serial = run.catch(() => {});
      return run;
    },
  };
  return db;
}

try {
  await check('explicit historical follow-up stays inside its frozen cohort and sends once', async () => {
    const db = fakeDb(); let sends = 0;
    db.rows.set('welcome_campaigns/last-150', { status: 'approved', expiresAt: now + 3600_000, uids: ['u1', 'u2', 'u3'] });
    db.rows.set('user_profiles/u1', { signupWelcomeSentAt: { toMillis: () => now - 86400_000 } });
    db.rows.set('user_profiles/u2', { emailOptOut: true });
    db.rows.set('user_profiles/u3', { signupWelcomeSentAt: {}, signupWelcomeProvider: 'gmail' });
    const options = { now: () => now, sender: async message => { sends++; assert.equal(message.to, 'u1@example.com'); return { ok: true, id: 'campaign-receipt' }; } };
    assert.equal((await sendCampaignWelcome(db, user('outsider'), 'last-150', options)).reason, 'not_in_approved_campaign');
    assert.equal((await sendCampaignWelcome(db, user('u2'), 'last-150', options)).reason, 'opted_out');
    assert.equal((await sendCampaignWelcome(db, user('u3'), 'last-150', options)).reason, 'already_sent');
    await Promise.all([sendCampaignWelcome(db, user('u1'), 'last-150', options), sendCampaignWelcome(db, user('u1'), 'last-150', options)]);
    assert.equal(sends, 1);
    assert.equal(db.rows.get('gmail_campaign_deliveries/last-150_u1').status, 'sent');
    assert.ok(db.rows.get('user_profiles/u1').personalGmailWelcomeSentAt);
    assert.equal(db.rows.has('config/welcome_gmail_budget'), false);
    assert.equal((await sendCampaignWelcome(db, user('u1'), 'last-150', options)).reason, 'already_sent');
  });
  await check('campaign ambiguity and expired or oversized approvals cannot send again', async () => {
    const db = fakeDb(); let sends = 0;
    db.rows.set('welcome_campaigns/last-150', { status: 'approved', expiresAt: now + 3600_000, uids: ['u1'] });
    const options = { now: () => now, sender: async () => { sends++; return { ok: false, reason: 'network', ambiguous: true }; } };
    await sendCampaignWelcome(db, user('u1'), 'last-150', options);
    assert.equal((await sendCampaignWelcome(db, user('u1'), 'last-150', options)).reason, 'delivery_needs_review');
    db.rows.set('welcome_campaigns/oversized', { status: 'approved', expiresAt: now + 3600_000, uids: Array(151).fill('u1') });
    assert.equal((await sendCampaignWelcome(db, user('u1'), 'oversized', options)).reason, 'not_in_approved_campaign');
    assert.equal((await sendCampaignWelcome(db, user('u1'), 'last-150', { ...options, now: () => now + 3600_001 })).reason, 'not_in_approved_campaign');
    assert.equal(sends, 1);
  });
  await check('an automatic welcome and manual follow-up cannot race into two copies', async () => {
    const db = fakeDb(); let sends = 0;
    db.rows.set('welcome_campaigns/last-150', { status: 'approved', expiresAt: now + 3600_000, uids: ['u1'] });
    const options = { now: () => now, sender: async () => { sends++; return { ok: true, id: 'one-copy' }; } };
    await Promise.all([sendCampaignWelcome(db, user('u1'), 'last-150', options), sendWelcomeTo(db, user('u1'), options)]);
    assert.equal(sends, 1);
  });
  await check('signup persists a five-minute delay without consuming capacity; a worker sends after the tab closes', async () => {
    const db = fakeDb(); let sends = 0; let clock = now;
    const fresh = { ...user('fresh'), metadata: { creationTime: new Date(now).toISOString() } };
    const options = { now: () => clock, sender: async () => { sends++; return { ok: true, id: 'delayed' }; } };
    const queued = await sendWelcomeTo(db, fresh, options);
    assert.equal(queued.reason, 'queued'); assert.equal(queued.sendAfter, now + WELCOME_DELAY_MS);
    assert.equal(db.rows.has('config/welcome_gmail_budget'), false);
    assert.equal(db.rows.has('user_profiles/fresh'), false);
    clock += WELCOME_DELAY_MS - 1;
    assert.equal((await sendWelcomeTo(db, fresh, options)).sendAfter, queued.sendAfter);
    const worker = { db, lookupUser: async () => fresh, now: () => clock,
      send: (db, u, opts) => sendWelcomeTo(db, u, { ...opts, sender: options.sender }) };
    assert.equal((await runWelcomeQueue(worker)).sent, 0); assert.equal(sends, 0);
    clock++;
    await Promise.all([runWelcomeQueue(worker), runWelcomeQueue(worker)]);
    assert.equal(sends, 1); assert.equal(db.rows.get('welcome_deliveries/fresh').status, 'sent');
    assert.equal((await runWelcomeQueue(worker)).due, 0);
  });
  await check('queue honors later opt-outs, removes missing accounts, and never replays uncertain deliveries', async () => {
    const db = fakeDb(); let sends = 0;
    for (const id of ['opted', 'missing', 'held']) db.rows.set('welcome_deliveries/' + id,
      { status: id === 'held' ? 'uncertain' : 'pending', nextAttemptAt: now - 1 });
    db.rows.set('user_profiles/opted', { emailOptOut: true });
    await runWelcomeQueue({ db, now: () => now, lookupUser: async uid => uid === 'missing' ? null : user(uid),
      send: (db, u, opts) => sendWelcomeTo(db, u, { ...opts, sender: async () => { sends++; return { ok: true }; } }) });
    assert.equal(sends, 0);
    assert.equal(db.rows.get('welcome_deliveries/opted').status, 'suppressed');
    assert.equal(db.rows.get('welcome_deliveries/missing').status, 'suppressed');
    assert.equal(db.rows.get('welcome_deliveries/held').status, 'uncertain');
    assert.equal((await runWelcomeQueue({ db, now: () => now })).due, 0);
  });
  await check('one real Gmail sender, one recipient, plain text and unsubscribe', () => {
    const raw = Buffer.from(gmailRawMessage(message), 'base64url').toString();
    assert.match(raw, new RegExp(`From: Aidan <${GMAIL_SENDER.replaceAll('.', '\\.')}>`));
    assert.match(raw, /To: sam@example.com\r\n/);
    assert.doesNotMatch(raw, /Bcc:|Cc:|text\/html/);
    assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
    assert.equal(Buffer.from(raw.split('\r\n\r\n')[1], 'base64').toString(), message.text);
    assert.throws(() => gmailRawMessage({ ...message, to: 'sam@example.com\r\nBcc: bad@example.com' }));
  });
  await check('Gmail API uses OAuth and returns its receipt', async () => {
    const calls = [];
    const result = await sendGmailWelcome(message, async (url, options) => {
      calls.push({ url, options });
      return Response.json(calls.length === 1 ? { access_token: 'token' } : { id: 'gmail-id' });
    });
    assert.equal(result.id, 'gmail-id');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer token');
    assert.match(calls[1].url, /users\/me\/messages\/send$/);
  });
  await check('failed token refresh never reaches send', async () => {
    let calls = 0;
    const result = await sendGmailWelcome(message, async () => { calls++; return new Response('', { status: 400 }); });
    assert.equal(calls, 1); assert.equal(result.ambiguous, undefined);
  });
  await check('network loss after dispatch is ambiguous', async () => {
    let calls = 0;
    const result = await sendGmailWelcome(message, async () => {
      if (++calls === 1) return Response.json({ access_token: 'token' });
      throw new Error('connection lost');
    });
    assert.equal(result.ambiguous, true);
  });
  await check('concurrent client and sweep send only once', async () => {
    const db = fakeDb(); let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: true, id: 'sent' }; } };
    await Promise.all([sendWelcomeTo(db, user('u1'), options), sendWelcomeTo(db, user('u1'), options)]);
    assert.equal(sends, 1);
    assert.equal(db.rows.get('welcome_deliveries/u1').status, 'sent');
    assert.ok(db.rows.get('user_profiles/u1').signupWelcomeSentAt);
    assert.equal((await sendWelcomeTo(db, user('u1'), options)).reason, 'already_sent');
  });
  await check('uncertain dispatch never automatically repeats', async () => {
    const db = fakeDb(); let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: false, ambiguous: true, reason: 'uncertain' }; } };
    assert.equal((await sendWelcomeTo(db, user('u1'), options)).needsReview, true);
    await sendWelcomeTo(db, user('u1'), { ...options, now: () => now + 86400_000 });
    assert.equal(sends, 1);
  });
  await check('successful send with failed stamp is held for review', async () => {
    const db = fakeDb(); db.failReceipt = true; let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: true, id: 'sent' }; } };
    assert.equal((await sendWelcomeTo(db, user('u1'), options)).reason, 'stamp_failed');
    await sendWelcomeTo(db, user('u1'), { ...options, now: () => now + 86400_000 });
    assert.equal(sends, 1);
  });
  await check('definitive rejection retries later, with a delay', async () => {
    const db = fakeDb(); let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: false, reason: 'gmail_auth_400' }; } };
    await sendWelcomeTo(db, user('u1'), options);
    assert.equal((await sendWelcomeTo(db, user('u1'), options)).reason, 'retry_later');
    await sendWelcomeTo(db, user('u1'), { ...options, now: () => now + 31 * 60_000 });
    assert.equal(sends, 2);
  });
  await check('rolling cap preserves capacity for personal mail', async () => {
    process.env.WELCOME_GMAIL_DAILY_CAP = '1';
    const db = fakeDb(); let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: true }; } };
    await sendWelcomeTo(db, user('u1'), options);
    assert.equal((await sendWelcomeTo(db, user('u2'), options)).reason, 'daily_cap');
    assert.equal(sends, 1); delete process.env.WELCOME_GMAIL_DAILY_CAP;
  });
  await check('opt-outs, disabled users, unverified emails and old accounts are skipped', async () => {
    const db = fakeDb(); db.rows.set('user_profiles/u1', { emailOptOut: true });
    let sends = 0;
    const options = { now: () => now, sender: async () => { sends++; return { ok: true }; } };
    assert.equal((await sendWelcomeTo(db, user('u1'), options)).reason, 'opted_out');
    for (const patch of [{ disabled: true }, { emailVerified: false }, { metadata: { creationTime: '2026-09-20T10:00:00Z' } }]) {
      assert.equal(welcomeEligibility({ ...user('u2'), ...patch }, null, now).ok, false);
    }
    assert.equal(sends, 0);
  });
  console.log(`gmail-welcome: ${checks} checks passed`);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
}
