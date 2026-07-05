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
 * Env: RESEND_API_KEY (required for sending; a missing key makes every
 *   send a safe no-op via lib/email.mjs, so this is preview / local-dev
 *   safe). WAU_DIGEST_FROM / WAU_DIGEST_REPLY_TO override the lib-wide
 *   sender defaults when set; leave them unset to use the lib defaults.
 *
 * Firestore reads:
 *   generations — last 14 days, indexed on uid + createdAt
 *   user_profiles/{uid} — displayName, email, emailOptOut, wauDigestOptOut
 *   disclosures — last 7 days, ordered by votes desc, limit 1
 *   config/wau_digest_state — lastRunAt, so we never double-send
 *
 * Cap: MAX_EMAILS per run so a runaway re-fire can't burn quota.
 * Each user is only emailed if their last wauDigestSentAt < 6 days
 * ago (server-side dedup even if cron double-fires).
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL } from './lib/email.mjs';
import { dailyMotionFor } from './lib/daily-motion-bank.mjs';

const FROM_EMAIL     = process.env.WAU_DIGEST_FROM || undefined;     // undefined -> lib default
const REPLY_TO       = process.env.WAU_DIGEST_REPLY_TO || undefined; // undefined -> lib default
const MAX_EMAILS     = parseInt(process.env.WAU_DIGEST_MAX || '200', 10);
const MIN_GAP_MS     = 6 * 24 * 60 * 60 * 1000; // 6 days — prevents double-send

// One motion per format to use as the "try this next" hook. Keys match
// the REAL format slugs stored in `generations` (log-generation.mjs
// stores whatever the client sends, unnormalized): the canonical
// lowercase vocabulary from debate-it / room-judge ('quick', 'worlds',
// 'asian', ...), the voice-debate mode keys ('quickclash', 'apda', ...),
// and index.html's UPPERCASE ids ('APDA', 'BP', 'WSDC', 'AP', ...) which
// the lowercased lookup below folds in. Anything unmapped (viva,
// courtroom, negotiation, pitch, ...) falls to the weekly-rotating
// fallback picked from lib/daily-motion-bank.mjs at run time.
const MOTD_BY_FORMAT = {
  apda:     'That privacy is overrated.',
  bp:       'This House would ban social media for under-18s.',
  worlds:   'This House believes that developed nations owe climate reparations.',
  pf:       'Resolved: The European Union should forgive Greek national debt.',
  ld:       'Resolved: Civil disobedience is justified in a democratic society.',
  policy:   'Resolved: The federal government should expand collective bargaining rights.',
  asian:    'This House would require corporations to disclose executive pay ratios.',
  congress: 'A bill to establish a universal basic income pilot program.',
  mun:      'UNSC Resolution: Responsibility to Protect in humanitarian crises.',
  popper:   'This House believes that economic sanctions do more harm than good.',
  quickclash: 'Technology does more harm than good.',
};

// Stored slug -> canonical MOTD key. Lookup lowercases first, so this
// only needs the already-lowercase synonyms.
const FORMAT_ALIASES = {
  quick:      'quickclash', // debate-it / room-judge slug
  clash:      'quickclash', // newvoice
  '1v1':      'quickclash', // index.html one-on-one id
  crossex:    'quickclash', // voice-debate drill modes: format-agnostic clash
  rebuttal:   'quickclash',
  layjudge:   'quickclash',
  aggressive: 'quickclash',
  steelman:   'quickclash',
  wsdc:       'worlds',     // index.html 'WSDC' lowercased
  ap:         'asian',      // index.html Asian Parli id
  cp:         'apda',       // index.html Canadian Parli id, closest impromptu kin
  kp:         'popper',     // index.html Karl Popper id
  philosophy: 'ld',         // philosopher mode, LD is the framework format
};

function motdForFormat(fmt, fallback) {
  const key = String(fmt || '').toLowerCase();
  return MOTD_BY_FORMAT[key] || MOTD_BY_FORMAT[FORMAT_ALIASES[key]] || fallback;
}

// ── Email template ───────────────────────────────────────────────────────────

function buildHtml({ uid, firstName, roundsThisWeek, roundsLastWeek, avgScore, topCase, nextMotion }) {
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
  ${brandHeader()}
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    ${firstName ? `This week, ${esc(firstName)}` : 'This week'}: ${roundsThisWeek} round${roundsThisWeek === 1 ? '' : 's'}.
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
  ${renderFooter({ uid, stream: 'digest' })}
</div>
</body></html>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async () => {
  let db;
  try { db = (await import('./lib/firestore.mjs')).getDb(); }
  catch (e) { console.error('[wau-digest] firestore init failed:', e.message); return; }

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

  // Weekly-rotating fallback motion for users whose top format has no
  // dedicated entry above. Deterministic per run date (Sunday cron), so
  // every week's fallback differs but a re-run the same day matches.
  let fallbackMotd = 'That the free press does more harm than good.';
  try {
    const pick = dailyMotionFor(new Date(now).toISOString().slice(0, 10));
    if (pick && typeof pick.motion === 'string' && pick.motion) fallbackMotd = pick.motion;
  } catch { /* keep the static fallback */ }

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

      // Opt-out (global emailOptOut kill switch + wauDigestOptOut) / no email.
      if (isOptedOut(prof, 'digest') || !prof.email) { skipped++; continue; }

      // Dedup: don't send twice in a week.
      const lastSent = prof.wauDigestSentAt?.toMillis?.() || 0;
      if (now - lastSent < MIN_GAP_MS) { skipped++; continue; }

      const stats = uidMap.get(uid);
      const avgScore = stats.scoreCount > 0 ? stats.totalScore / stats.scoreCount : null;
      const topFormat = [...stats.formats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'apda';

      const html = buildHtml({
        uid,
        firstName: (prof.displayName || '').trim().split(/\s+/)[0] || '',
        roundsThisWeek: stats.count7d,
        roundsLastWeek: prevUidCounts.get(uid) || 0,
        avgScore,
        topCase,
        nextMotion: motdForFormat(topFormat, fallbackMotd),
      });

      const subject = `${stats.count7d} round${stats.count7d === 1 ? '' : 's'} this week. Your next motion is inside.`;
      const result = await sendEmail({
        to: prof.email,
        subject,
        html,
        uid,
        stream: 'digest',
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
      });

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
