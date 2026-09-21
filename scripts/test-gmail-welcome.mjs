import assert from 'node:assert/strict';
import { FieldValue } from '../app/netlify/functions/lib/firestore.mjs';
import { gmailRawMessage, sendGmailWelcome, GMAIL_SENDER } from '../app/netlify/functions/lib/gmail-welcome.mjs';
import { sendWelcomeTo, welcomeEligibility } from '../app/netlify/functions/lib/welcome-email.mjs';

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
  const db = { rows, failReceipt: false,
    collection: name => ({ doc: id => ({ path: `${name}/${id}`, get: async function () { return snapshot(this); },
      set: async function (patch, options) { apply(this, patch, options); } }) }),
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
