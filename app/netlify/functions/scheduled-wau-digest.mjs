/* scheduled-wau-digest.mjs
 *
 * Weekly active-user email digest. Fires every Sunday at 09:00 UTC.
 * Sends a personalized ~200-word email to every signed-in user who
 * completed at least one round in the past 7 days.
 *
 * Email contents:
 *   - Their personal round count vs the previous week
 *   - Their average speaker-point score if we have it
 *   - The top-rated community disclosure posted this week (title +
 *     1-line judge verdict) as social proof that real rounds happen
 *   - A single "run this next" motion suggestion seeded from their
 *     most-used format
 *   - CTA back into the app
 *
 * Env: RESEND_API_KEY (required for sending; omitting returns 200 with
 *   sent:0 so this is safe in preview / local-dev environments)
 *
 * Firestore reads:
 *   generations — last 14 days, indexed on uid + createdAt
 *   user_profiles/{uid} — displayName, email, wauDigestOptOut
 *   disclosures — last 7 days, ordered by votes desc, limit 1
 *   config/wau_digest_state — lastRunAt, so we never double-send
 *
 * Cap: MAX_EMAILS per run so a runaway re-fire can't burn quota.
 * Each user is only emailed if their last wauDigestSentAt < 6 days
 * ago (server-side dedup even if cron double-fires).
 */

import { getDb, FieldValue } from './lib/firestore.mjs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = process.env.WAU_DIGEST_FROM || 'Aidan @ DebateIt <hello@debateai.com>';
const REPLY_TO       = process.env.WAU_DIGEST_REPLY_TO || 'aidandavidhollinger@gmail.com';
const SITE_URL       = process.env.SITE_URL || 'https://debateai.com';
const MAX_EMAILS     = parseInt(process.env.WAU_DIGEST_MAX || '200', 10);
const MIN_GAP_MS     = 6 * 24 * 60 * 60 * 1000; // 6 days — prevents double-send

// One motion per format to use as the "try this next" hook.
const MOTD_BY_FORMAT = {
  apda:     'That privacy is overrated.',
  bp:       'This House would ban social media for under-18s.',
  wsdc:     'This House believes that developed nations owe climate reparations.',
  pf:       'Resolved: The European Union should forgive Greek national debt.',
  ld:       'Resolved: Civil disobedience is justified in a democratic society.',
  policy:   'Resolved: The federal government should expand collective bargaining rights.',
  asian:    'This House would require corporations to disclose executive pay ratios.',
  congress: 'A bill to establish a universal basic income pilot program.',
  mun:      'UNSC Resolution: Responsibility to Protect in humanitarian crises.',
  quickclash: 'Technology does more harm than good.',
};
const DEFAULT_MOTD = 'That the free press does more harm than good.';

function motdForFormat(fmt) {
  return MOTD_BY_FORMAT[fmt] || DEFAULT_MOTD;
}

// ── Email template ───────────────────────────────────────────────────────────

function buildHtml({ firstName, roundsThisWeek, roundsLastWeek, avgScore, topCase, nextMotion, format }) {
  const delta = roundsThisWeek - roundsLastWeek;
  const deltaStr = delta === 0 ? 'Same as last week.' : delta > 0
    ? `Up ${delta} from last week.`
    : `Down ${Math.abs(delta)} from last week.`;
  const scoreStr = typeof avgScore === 'number' && !isNaN(avgScore)
    ? `Your average judge score this week: <strong>${avgScore.toFixed(1)}</strong> / 30.`
    : '';
  const caseBlock = topCase
    ? `<p style="font-size:.92rem;line-height:1.55;color:#3a3a44;margin:0 0 8px">
        Top community disclosure this week: <strong>${esc(topCase.motion)}</strong>.
        ${topCase.verdict ? `Judge's read: "${esc(topCase.verdict.slice(0, 120))}"` : ''}
       </p>`
    : '';
  const nextHref = `${SITE_URL}/debate-it?motion=${encodeURIComponent(nextMotion)}`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
<div style="max-width:540px;margin:0 auto;padding:32px 24px">
  <div style="font-size:1.05rem;font-weight:900;letter-spacing:-.02em;color:#1a1a1f;margin-bottom:24px">
    <span style="color:#dc2626">Debate</span> AI
  </div>
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    ${firstName ? `This week, ${firstName}` : 'This week'}: ${roundsThisWeek} round${roundsThisWeek === 1 ? '' : 's'}.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 6px">
    ${deltaStr} ${scoreStr}
  </p>
  ${caseBlock}
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 8px">
    Motion for the week:
  </p>
  <p style="font-size:.95rem;line-height:1.55;color:#1a1a1f;margin:0 0 22px;padding:12px 14px;background:#f0f0e8;border-radius:8px;font-weight:600">
    ${esc(nextMotion)}
  </p>
  <a href="${nextHref}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Run this round →
  </a>
  <p style="margin-top:28px;font-size:.76rem;color:#9b9ba8;line-height:1.5">
    You're getting this because you've been active on
    <a href="${SITE_URL}" style="color:#dc2626;text-decoration:none">debateai.com</a>.
    Reply to opt out.
  </p>
</div>
</body></html>`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Send via Resend ─────────────────────────────────────────────────────────

async function sendEmail({ to, firstName, subject, html }) {
  if (!RESEND_API_KEY) return { ok: false, reason: 'no-key' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, reply_to: REPLY_TO, to: [to], subject, html }),
  });
  return { ok: res.ok, status: res.status };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async () => {
  let db;
  try { db = (await import('./lib/firestore.mjs')).getDb(); }
  catch (e) { console.error('[wau-digest] firestore init failed:', e.message); return; }

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

  // Dedup guard: check last run.
  const stateRef = db.doc('config/wau_digest_state');
  const stateSnap = await stateRef.get().catch(() => null);
  if (stateSnap && stateSnap.exists) {
    const lastRun = stateSnap.data().lastRunAt?.toMillis?.() || 0;
    if (now - lastRun < MIN_GAP_MS) {
      console.log('[wau-digest] too soon since last run, skipping');
      return;
    }
  }

  // Mark run started immediately to prevent concurrent double-fire.
  await stateRef.set({ lastRunAt: FieldValue.serverTimestamp(), status: 'running' }, { merge: true }).catch(() => {});

  // ── 1. Collect active UIDs from generations ──────────────────────────────
  let genSnap;
  try {
    genSnap = await db.collection('generations')
      .where('createdAt', '>=', sevenDaysAgo)
      .select('uid', 'createdAt', 'format', 'speakerPoints')
      .limit(2000)
      .get();
  } catch (e) {
    console.error('[wau-digest] generations query failed:', e.message);
    await stateRef.set({ status: 'error', error: e.message }, { merge: true }).catch(() => {});
    return;
  }

  // Aggregate per-uid stats.
  const uidMap = new Map(); // uid -> { count7d, totalScore, scoreCount, formats: Map }
  for (const doc of genSnap.docs) {
    const { uid, format, speakerPoints } = doc.data();
    if (!uid) continue;
    if (!uidMap.has(uid)) uidMap.set(uid, { count7d: 0, totalScore: 0, scoreCount: 0, formats: new Map() });
    const u = uidMap.get(uid);
    u.count7d++;
    const sp = typeof speakerPoints?.user === 'number' ? speakerPoints.user : null;
    if (sp !== null) { u.totalScore += sp; u.scoreCount++; }
    u.formats.set(format || 'apda', (u.formats.get(format || 'apda') || 0) + 1);
  }

  // Last-week counts for delta.
  let prevSnap;
  try {
    prevSnap = await db.collection('generations')
      .where('createdAt', '>=', fourteenDaysAgo)
      .where('createdAt', '<', sevenDaysAgo)
      .select('uid')
      .limit(2000)
      .get();
  } catch { prevSnap = { docs: [] }; }

  const prevUidCounts = new Map();
  for (const doc of prevSnap.docs) {
    const { uid } = doc.data();
    if (uid) prevUidCounts.set(uid, (prevUidCounts.get(uid) || 0) + 1);
  }

  // ── 2. Top community disclosure this week ────────────────────────────────
  let topCase = null;
  try {
    const discSnap = await db.collection('disclosures')
      .where('createdAt', '>=', sevenDaysAgo)
      .orderBy('createdAt', 'desc')
      .orderBy('votes', 'desc')
      .limit(1)
      .get();
    if (!discSnap.empty) {
      const d = discSnap.docs[0].data();
      topCase = { motion: d.motion || '', verdict: d.verdict || d.rfd || '' };
    }
  } catch { /* optional */ }

  // ── 3. Send emails ────────────────────────────────────────────────────────
  const uids = [...uidMap.keys()].slice(0, MAX_EMAILS);
  let sent = 0, skipped = 0, errors = 0;

  for (const uid of uids) {
    try {
      const profileSnap = await db.doc(`user_profiles/${uid}`).get();
      if (!profileSnap.exists) { skipped++; continue; }
      const prof = profileSnap.data();

      // Opt-out / no email.
      if (prof.wauDigestOptOut || !prof.email) { skipped++; continue; }

      // Dedup: don't send twice in a week.
      const lastSent = prof.wauDigestSentAt?.toMillis?.() || 0;
      if (now - lastSent < MIN_GAP_MS) { skipped++; continue; }

      const stats = uidMap.get(uid);
      const avgScore = stats.scoreCount > 0 ? stats.totalScore / stats.scoreCount : null;
      const topFormat = [...stats.formats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'apda';

      const html = buildHtml({
        firstName: (prof.displayName || '').trim().split(/\s+/)[0] || '',
        roundsThisWeek: stats.count7d,
        roundsLastWeek: prevUidCounts.get(uid) || 0,
        avgScore,
        topCase,
        nextMotion: motdForFormat(topFormat),
        format: topFormat,
      });

      const subject = `${stats.count7d} round${stats.count7d === 1 ? '' : 's'} this week — keep the streak going`;
      const result = await sendEmail({ to: prof.email, html, subject });

      if (result.ok) {
        sent++;
        // Mark sent so we don't double-send.
        await db.doc(`user_profiles/${uid}`).update({ wauDigestSentAt: FieldValue.serverTimestamp() }).catch(() => {});
      } else {
        errors++;
        console.warn('[wau-digest] send failed for uid', uid, result.status);
      }
    } catch (e) {
      errors++;
      console.warn('[wau-digest] uid error', uid, e.message);
    }
  }

  await stateRef.set({ lastRunAt: FieldValue.serverTimestamp(), status: 'done', sent, skipped, errors }, { merge: true }).catch(() => {});
  console.log(`[wau-digest] done — sent:${sent} skipped:${skipped} errors:${errors}`);
};

export const config = {
  schedule: '0 9 * * 0', // Every Sunday 09:00 UTC
};
