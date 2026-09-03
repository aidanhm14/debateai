/* scheduled-welcome-sweep.mjs  ·  every 30 minutes
 *
 * The backstop for the welcome email. The client path (POST
 * /api/welcome-email from auth-modal.js) covers the common case; this
 * covers everything else: a native Google or Apple sign-in through the
 * Capacitor plugin, a tournament page's own popup, a tab closed before the
 * keepalive fetch left, a Resend hiccup on the first try.
 *
 * Reads the whole Auth list (a few thousand accounts, three batchGet
 * pages), keeps accounts created on or after WELCOME_SINCE_MS, and hands
 * each unstamped one to sendWelcomeTo, which claims, sends and stamps.
 * One profile read per candidate, bounded by RUN_CAP sends per run.
 *
 * WELCOME_SWEEP_ENABLED=0 turns it into a dry run that logs and sends
 * nothing. See lib/welcome-email.mjs for the rule and the template.
 */

import { getDb } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { welcomeEligibility, sendWelcomeTo, WELCOME_SINCE_MS } from './lib/welcome-email.mjs';

const RUN_CAP = Math.max(1, parseInt(process.env.WELCOME_SWEEP_CAP || '30', 10) || 30);

export default async () => {
  const dry = process.env.WELCOME_SWEEP_ENABLED === '0' || !process.env.RESEND_API_KEY;
  let users;
  try { users = await listAllAuthUsers(); }
  catch (err) {
    console.error('[welcome-sweep] listAllAuthUsers failed:', err.message);
    return new Response(JSON.stringify({ error: 'auth_list_failed' }), { status: 502 });
  }
  const db = getDb();
  const candidates = users.filter((u) => {
    const created = u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : NaN;
    return Number.isFinite(created) && created >= WELCOME_SINCE_MS && welcomeEligibility(u, null).ok;
  });
  const tally = { candidates: candidates.length, sent: 0, skipped: {}, dry };
  for (const u of candidates) {
    if (tally.sent >= RUN_CAP) { tally.skipped.cap = (tally.skipped.cap || 0) + 1; continue; }
    // Cheap pre-read so a stamped account costs one read and no transaction.
    let profile = null;
    try {
      const snap = await db.collection('user_profiles').doc(u.uid).get();
      profile = snap.exists ? (snap.data() || {}) : null;
    } catch {}
    const elig = welcomeEligibility(u, profile);
    if (!elig.ok) { tally.skipped[elig.reason] = (tally.skipped[elig.reason] || 0) + 1; continue; }
    if (dry) { tally.skipped.dry = (tally.skipped.dry || 0) + 1; continue; }
    const res = await sendWelcomeTo(db, u, { source: 'sweep' });
    if (res.sent) tally.sent += 1;
    else tally.skipped[res.reason] = (tally.skipped[res.reason] || 0) + 1;
    if (res.quotaExhausted) { tally.skipped.quota = 1; break; }
  }
  console.log('[welcome-sweep]', JSON.stringify(tally));
  return new Response(JSON.stringify(tally), { status: 200 });
};

export const config = { schedule: '3,33 * * * *' };
