import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

process.env.EMAIL_UNSUB_SECRET = 'dm-email-test-secret';

const { buildDmEmail, isRecentDmMessage, DM_MESSAGE_MAX_AGE_MS } = await import('../app/netlify/functions/lib/dm-email.mjs');
const { isOptedOut } = await import('../app/netlify/functions/lib/email.mjs');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

check('email is generic and contains no private thread metadata', () => {
  const email = buildDmEmail({
    uid: 'recipient-1',
    senderName: 'PRIVATE SENDER',
    groupName: 'PRIVATE GROUP',
    threadId: 'PRIVATE THREAD',
    messageText: 'PRIVATE MESSAGE',
  });
  assert.equal(email.subject, 'You have a new message on Debatable');
  assert.match(email.html, /Open your inbox to read it and reply/);
  assert.match(email.html, /https:\/\/itsdebatable\.com\/chat/);
  assert.doesNotMatch(email.html, /PRIVATE (SENDER|GROUP|THREAD|MESSAGE)/);
  assert.doesNotMatch(email.html, /chat\?thread=/);
});

check('DM email includes a stream-specific unsubscribe link', () => {
  const email = buildDmEmail({ uid: 'recipient-2' });
  assert.match(email.html, /api\/email-unsub\?u=recipient-2&amp;s=dm&amp;t=/);
});

check('DM opt-out is separate from other account email', () => {
  assert.equal(isOptedOut({ dmOptOut: true }, 'dm'), true);
  assert.equal(isOptedOut({ dmOptOut: false }, 'dm'), false);
  assert.equal(isOptedOut({ emailOptOut: true, dmOptOut: false }, 'dm'), true);
});

check('only freshly created messages can trigger email', () => {
  const now = Date.now();
  assert.equal(isRecentDmMessage({ createdAt: now - 1_000 }, now), true);
  assert.equal(isRecentDmMessage({ createdAt: now - DM_MESSAGE_MAX_AGE_MS - 1 }, now), false);
  assert.equal(isRecentDmMessage({ createdAt: now + 60_001 }, now), false);
  assert.equal(isRecentDmMessage({}, now), false);
});

const endpoint = readFileSync(new URL('../app/netlify/functions/notify-dm.mjs', import.meta.url), 'utf8');
const core = readFileSync(new URL('../app/js/dm-core.js', import.meta.url), 'utf8');
const liveRound = readFileSync(new URL('../app/live-round.html', import.meta.url), 'utf8');
const spar = readFileSync(new URL('../app/spar.html', import.meta.url), 'utf8');

check('server verifies both the thread and exact message author', () => {
  assert.match(endpoint, /threadRef\.get\(\), messageRef\.get\(\)/);
  assert.match(endpoint, /participants\.includes\(callerUid\)/);
  assert.match(endpoint, /message\.fromUid !== callerUid/);
  assert.match(endpoint, /isRecentDmMessage\(message\)/);
});

check('server never sends DM content or identity metadata to email', () => {
  assert.doesNotMatch(endpoint, /message\.text/);
  assert.doesNotMatch(endpoint, /participantInfo/);
  assert.doesNotMatch(endpoint, /senderName/);
  assert.doesNotMatch(endpoint, /groupName/);
  assert.match(endpoint, /buildDmEmail\(\{ uid: recipientUid \}\)/);
});

check('shared inbox engine notifies with a message id and keepalive', () => {
  assert.match(core, /fetch\('\/api\/notify-dm'/);
  assert.match(core, /keepalive: true/);
  assert.match(core, /threadId: threadId, messageId: messageId/);
});

check('live-round DM composer notifies with its generated message id', () => {
  assert.match(liveRound, /fetch\('\/api\/notify-dm'/);
  assert.match(liveRound, /notifyDmEmail\(tid,msgRef\.id,0\)/);
  assert.match(liveRound, /threadId:threadId,messageId:messageId/);
  assert.match(liveRound, /keepalive:true/);
});

check('retired first-message route is compatibility-only', () => {
  const compatibilityPath = new URL('../app/netlify/functions/notify-dm-accept.mjs', import.meta.url);
  assert.equal(existsSync(compatibilityPath), true);
  const compatibility = readFileSync(compatibilityPath, 'utf8');
  assert.match(compatibility, /return notifyDm\(forwarded\)/);
  assert.doesNotMatch(compatibility, /sendEmail|message\.text|acceptEmailSentAt/);
  assert.doesNotMatch(spar, /notify-dm-accept/);
});

console.log(`DM email guard: ${passed} checks passed`);
