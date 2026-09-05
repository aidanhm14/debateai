// Two successful private judged rounds per account, shared by /judge and
// private live rooms. All records are server-only (Firestore default deny).
import { createHash, randomUUID } from 'node:crypto';
import { isOwnerEmail, verifyIdToken, extractBearerToken, isNamedAccount } from './auth.mjs';
import { getDb, getUserTeam, withDeadline } from './firestore.mjs';
import { planBypassesVoiceCap } from './plans.mjs';
import { getAuthUserByUid } from './auth-admin.mjs';

export const FREE_PRIVATE_JUDGMENTS = 2;
export const PRIVATE_JUDGE_LEASE_MS = 360_000;
export const PRIVATE_JUDGE_ERROR = 'Your two free private judged rounds are used. Upgrade to Individual ($10/year) to keep judging private rounds.';
const authorized = new WeakSet();
export function authorizePrivateJudgeRequest(request) { authorized.add(request); return request; }
export function privateJudgeKey(value) { return createHash('sha256').update(String(value)).digest('hex'); }
export function isPrivateJudgingRound(room, round) {
  return round?.isPrivate === true || ['private', 'squad'].includes(round?.source)
    || /^(Private-|Squad-)/i.test(String(room));
}
export async function privateJudgeAccounts(uids, decoded = null) {
  return Promise.all([...new Set(uids.filter(Boolean))].map(async uid => {
    // The sweep has no caller token, and the other seat is never proven by
    // the caller's token. Resolve those identities from Firebase Auth so
    // disposable anonymous UIDs cannot replenish the lifetime allowance.
    const own = decoded?.sub === uid;
    const account = own ? null : await withDeadline(getAuthUserByUid(uid), 2500);
    const named = own ? isNamedAccount(decoded) : !!account?.providerData?.some(provider => provider.providerId && provider.providerId !== 'anonymous');
    if (!named) {
      const error = new Error('Sign in with a real account to use private judging.');
      error.code = 'PRIVATE_JUDGE_SIGN_IN_REQUIRED'; error.status = 401; throw error;
    }
    if (isOwnerEmail(own ? decoded.email : account.email)) return { uid, paid: true };
    const membership = await withDeadline(getUserTeam(uid), 2500);
    return { uid, paid: planBypassesVoiceCap(membership?.team) };
  }));
}
export const paymentRequired = () => ({ ok: false, code: 'PRIVATE_JUDGE_PAYMENT_REQUIRED', error: PRIVATE_JUDGE_ERROR, limit: 2, upgradeUrl: '/pricing', status: 402 });
const pendingAt = (data, now) => Object.fromEntries(Object.entries(data?.pending || {}).filter(([, p]) => Number(p?.until) > now));

// Usable inside the live room's own claim transaction. All reads precede
// writes, and every participating account is reserved atomically.
export async function reservePrivateJudgment(tx, db, { key, accounts, now = Date.now(), leaseMs = PRIVATE_JUDGE_LEASE_MS }) {
  const ref = db.collection('private_judge_receipts').doc(key);
  const receipt = await tx.get(ref);
  const prior = receipt.exists ? receipt.data() : {};
  if (prior.state === 'complete') return { ok: true, already: true, key, output: prior.output || '' };
  if (prior.state === 'running' && prior.until > now) return { ok: false, code: 'PRIVATE_JUDGE_IN_PROGRESS', status: 409, retryAfterMs: prior.until - now };
  const free = accounts.filter(a => !a.paid);
  const rows = [];
  for (const account of free) {
    const usageRef = db.collection('private_judge_usage').doc(account.uid);
    const snap = await tx.get(usageRef);
    const data = snap.exists ? snap.data() : {};
    const used = Math.max(0, Math.trunc(Number(data.used) || 0));
    const pending = pendingAt(data, now);
    delete pending[key];
    if (used >= FREE_PRIVATE_JUDGMENTS) return paymentRequired();
    if (used + Object.keys(pending).length >= FREE_PRIVATE_JUDGMENTS) return { ok: false, code: 'PRIVATE_JUDGE_IN_PROGRESS', status: 409, error: 'Your free private judging requests are still running. Retry when they finish.' };
    rows.push({ usageRef, used, pending });
  }
  const token = randomUUID();
  for (const row of rows) tx.set(row.usageRef, { used: row.used, pending: { ...row.pending, [key]: { until: now + leaseMs, token } } }, { merge: false });
  tx.set(ref, { state: 'running', token, until: now + leaseMs, uids: accounts.map(a => a.uid), freeUids: free.map(a => a.uid), startedAt: now });
  return { ok: true, key, token };
}

// On success the receipt and all account charges commit together with the
// live ballot when `write` is supplied. A stale worker cannot complete a
// newer worker's reservation. Failure never spends a free use.
export async function finishPrivateJudgment(db, claim, { success = false, output = '', source = null, write, now = Date.now() } = {}) {
  if (!claim?.key || claim.already) throw new Error('A completed private judgment cannot be rewritten.');
  return db.runTransaction(async tx => {
    const ref = db.collection('private_judge_receipts').doc(claim.key);
    const snap = await tx.get(ref);
    const receipt = snap.exists ? snap.data() : {};
    if (receipt.token !== claim.token || receipt.state !== 'running' || (success && receipt.until <= now)) throw new Error('Private judging reservation expired. Retry this round.');
    const rows = [];
    for (const uid of receipt.freeUids || []) {
      const usageRef = db.collection('private_judge_usage').doc(uid);
      const usage = await tx.get(usageRef);
      const data = usage.exists ? usage.data() : {};
      const pending = { ...(data.pending || {}) }; delete pending[claim.key];
      rows.push({ usageRef, pending, used: Math.max(0, Math.trunc(Number(data.used) || 0)) });
    }
    for (const row of rows) tx.set(row.usageRef, { used: row.used + (success ? 1 : 0), pending: row.pending });
    tx.set(ref, { ...receipt, state: success ? 'complete' : 'failed', until: 0, completedAt: success ? now : null, output: success ? output.slice(0, 180_000) : '', ...(success && source ? { source } : {}) });
    if (write) await write(tx);
  });
}

// The generic model proxies cannot be an alternate free /judge door.
// A WeakSet marks in-process requests from the metered endpoint; no HTTP
// header or browser-supplied receipt can impersonate that capability.
export async function guardPrivateJudgeProxy(request, body) {
  const room = body._judgeRoom;
  delete body._judgeRoom; delete body._judgeSupplement;
  if (body._feature !== 'live-round' || authorized.has(request)) return null;
  if (typeof room !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(room)) {
    return { ok: false, status: 409, code: 'PRIVATE_JUDGE_ROUTE_REQUIRED', error: 'Open the round judge to judge this private round.' };
  }
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch { return { status: 401, code: 'SIGN_IN_REQUIRED', error: 'Sign in to judge a round.' }; }
  if (!isNamedAccount(decoded)) return { status: 401, code: 'SIGN_IN_REQUIRED', error: 'Sign in to judge a round.' };
  const snap = await getDb().collection('live_rounds').doc(room).get();
  const round = snap.exists ? snap.data() : {};
  if (![round.proUid, round.conUid, round.proUid2, round.conUid2].includes(decoded.sub)) return { status: 403, error: 'Not a participant.' };
  const receiptSnap = await getDb().collection('private_judge_receipts').doc(privateJudgeKey('live:' + room)).get();
  if (!isPrivateJudgingRound(room, round) && !receiptSnap.exists) return null;
  // Even a completed receipt is not permission to run arbitrary prompts.
  // Included explanations use /api/private-judge and its fixed saved source.
  return { status: 402, code: 'PRIVATE_JUDGE_SERVER_REQUIRED', error: 'Private rounds are judged by the room panel. Retry judging in the room.' };
}
