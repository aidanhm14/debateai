/* scheduled-winback.mjs
 *
 * Lapsed-user win-back email. The weekly scheduled-wau-digest only
 * reaches users who were ALREADY active in the last 7 days — it preaches
 * to the choir and does nothing about retention's actual problem: people
 * who ran a round or two and drifted (soul.md S8: ~2% W1, zero new
 * signed-in cohorts for weeks). This targets exactly that cohort and
 * pulls them back with their own format and a fresh motion.
 *
 * Cohort (the "winnable lapse"):
 *   - completed >= 1 round 7-28 days ago (recent enough to remember us)
 *   - NO round in the last 7 days (genuinely lapsed, not just quiet)
 *   - not opted out (wauDigestOptOut — the shared email opt-out)
 *   - not win-back-emailed in the last 21 days (don't pester the gone)
 *
 * Content: first name, a warm one-liner, a fresh motion in the format
 * they actually ran, a reminder their saved rounds + ballots are waiting,
 * one CTA. No streak / gamify language (soul.md). No em-dashes.
 *
 * SAFE BY DEFAULT. This emails DORMANT users, which is higher-stakes than
 * the active-user digest, so it does NOT send unless WINBACK_ENABLED==='1'.
 * Otherwise it runs in DRY-RUN: it computes the cohort and writes the
 * would-send count to config/winback_state, but sends nothing and marks
 * no one. Eyeball the cohort size there, then flip WINBACK_ENABLED=1 to
 * go live. (Mirrors scheduled-wau-digest's structure and dedup hygiene.)
 *
 * Env:
 *   WINBACK_ENABLED   '1' to actually send; anything else => dry-run
 *   RESEND_API_KEY    required to send (absent => forced dry-run)
 *   WINBACK_FROM      sender (default 'Aidan @ DebateIt <hello@debateit.com>')
 *   WINBACK_REPLY_TO  reply-to (default aidandavidhollinger@gmail.com)
 *   WINBACK_MAX       per-run cap (default 80)
 *   WINBACK_LAPSE_MIN_DAYS / _MAX_DAYS  window edges (default 7 / 28)
 *   SITE_URL          default https://debateai.com
 *
 * Firestore:
 *   generations         — last 28 days, indexed on uid + createdAt
 *   user_profiles/{uid} — displayName, email, wauDigestOptOut, winbackSentAt
 *   config/winback_state — lastRunAt + last-run stats (visible signal)
 *
 * Schedule: Wednesday 16:00 UTC — offset from the Sunday wau-digest so a
 * user never gets two of our emails on the same day.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEND_ENABLED   = process.env.WINBACK_ENABLED === '1';
const FROM_EMAIL     = process.env.WINBACK_FROM || 'Aidan @ DebateIt <hello@debateit.com>';
const REPLY_TO       = process.env.WINBACK_REPLY_TO || 'aidandavidhollinger@gmail.com';
const SITE_URL       = process.env.SITE_URL || 'https://debateai.com';
const MAX_EMAILS     = parseInt(process.env.WINBACK_MAX || '80', 10);
const LAPSE_MIN_DAYS = parseInt(process.env.WINBACK_LAPSE_MIN_DAYS || '7', 10);
const LAPSE_MAX_DAYS = parseInt(process.env.WINBACK_LAPSE_MAX_DAYS || '28', 10);

const DAY_MS         = 24 * 60 * 60 * 1000;
const MIN_GAP_RUN_MS = 5 * DAY_MS;   // run dedup (cron double-fire guard)
const MIN_GAP_USER_MS = 21 * DAY_MS; // per-user: at most one win-back / 21d

// Fresh motion + readable label per format. Kept distinct from the
// wau-digest's "motion of the week" set so a user who saw that doesn't
// get a repeat here.
const FORMAT = {
  apda:       { label: 'APDA',        motion: 'This House would abolish the right to inherit wealth.' },
  bp:         { label: 'BP',          motion: 'This House believes that the news should not report on suicides.' },
  wsdc:       { label: 'WSDC',        motion: 'This House would let citizens vote directly on the national budget.' },
  pf:         { label: 'Public Forum', motion: 'Resolved: The benefits of nuclear energy outweigh the risks.' },
  ld:         { label: 'LD',          motion: 'Resolved: A just society ought to prioritize equality over liberty.' },
  policy:     { label: 'Policy',      motion: 'Resolved: The US federal government should substantially increase its public health infrastructure.' },
  asian:      { label: 'Asian Parli', motion: 'This House regrets the rise of the gig economy.' },
  congress:   { label: 'Congress',    motion: 'A bill to abolish the electoral college.' },
  mun:        { label: 'MUN',         motion: 'UNSC: the use of autonomous weapons in armed conflict.' },
  quickclash: { label: 'Quick Clash', motion: 'Social media has done more harm than good.' },
};
const DEFAULT_FMT = { label: 'debate', motion: 'This House would make voting compulsory.' };

function fmtFor(format) {
  return FORMAT[format] || (format && FORMAT[format.toLowerCase()]) || DEFAULT_FMT;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Email template ───────────────────────────────────────────────────────────
// Calm, founder-voice, no em-dashes, no streak/gamify nudge. The hook is
// "your format is still here and your past rounds are saved," not guilt.
function buildHtml({ firstName, label, motion, daysAway }) {
  const runHref = `${SITE_URL}/debate-it?motion=${encodeURIComponent(motion)}`;
  const profileHref = `${SITE_URL}/profile`;
  const greeting = firstName ? `Hey ${esc(firstName)},` : 'Hey,';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
<div style="max-width:540px;margin:0 auto;padding:32px 24px">
  <div style="font-size:1.05rem;font-weight:900;letter-spacing:-.02em;color:#1a1a1f;margin-bottom:24px">
    <span style="color:#dc2626">Debate</span>It
  </div>
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.3;color:#1a1a1f;margin:0 0 14px">
    ${greeting} a fresh ${esc(label)} round when you want it.
  </h1>
  <p style="font-size:.95rem;line-height:1.6;color:#3a3a44;margin:0 0 16px">
    It has been a little while. Your past rounds, ballots, and the read on how you argue are all still saved on your
    <a href="${profileHref}" style="color:#dc2626;text-decoration:none">profile</a>.
    When you have ten minutes, here is one worth taking a side on:
  </p>
  <p style="font-size:1rem;line-height:1.5;color:#1a1a1f;margin:0 0 22px;padding:14px 16px;background:#f0f0e8;border-radius:8px;font-weight:600">
    ${esc(motion)}
  </p>
  <a href="${runHref}" style="display:inline-block;padding:13px 24px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Take a side →
  </a>
  <p style="margin-top:22px;font-size:.9rem;line-height:1.6;color:#3a3a44">
    Or pick your own motion, or find a human to spar with on
    <a href="${SITE_URL}/spar" style="color:#dc2626;text-decoration:none">/spar</a>.
  </p>
  <p style="margin-top:26px;font-size:.76rem;color:#9b9ba8;line-height:1.5">
    You are getting this because you ran a round on
    <a href="${SITE_URL}" style="color:#9b9ba8;text-decoration:underline">debateit.com</a>.
    Reply with "stop" and I will not email you again.
  </p>
</div>
</body></html>`;
}

// ── Send via Resend ──────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
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
  const dryRun = !(SEND_ENABLED && RESEND_API_KEY);

  let db;
  try { db = getDb(); }
  catch (e) { console.error('[winback] firestore init failed:', e.message); return; }

  const now = Date.now();
  const lapseStart = new Date(now - LAPSE_MAX_DAYS * DAY_MS); // 28d ago
  const lapseEnd   = new Date(now - LAPSE_MIN_DAYS * DAY_MS); // 7d ago
  const sevenDaysAgo = new Date(now - 7 * DAY_MS);

  // Run dedup: don't re-fire within 5 days even if cron double-triggers.
  const stateRef = db.doc('config/winback_state');
  const stateSnap = await stateRef.get().catch(() => null);
  if (stateSnap && stateSnap.exists) {
    const lastRun = stateSnap.data().lastRunAt?.toMillis?.() || 0;
    if (now - lastRun < MIN_GAP_RUN_MS) {
      console.log('[winback] too soon since last run, skipping');
      return;
    }
  }
  await stateRef.set({ lastRunAt: FieldValue.serverTimestamp(), status: 'running', dryRun }, { merge: true }).catch(() => {});

  // ── 1. Who is still active (last 7 days)? Exclude them. ──────────────────────
  const activeUids = new Set();
  try {
    const recentSnap = await db.collection('generations')
      .where('createdAt', '>=', sevenDaysAgo)
      .select('uid')
      .limit(3000)
      .get();
    for (const doc of recentSnap.docs) { const u = doc.data().uid; if (u) activeUids.add(u); }
  } catch (e) {
    console.error('[winback] recent-active query failed:', e.message);
    await stateRef.set({ status: 'error', error: e.message }, { merge: true }).catch(() => {});
    return;
  }

  // ── 2. Candidates: ran a round 7-28 days ago. Keep their most-recent
  //       round's format (what they actually played). ───────────────────────────
  let candSnap;
  try {
    candSnap = await db.collection('generations')
      .where('createdAt', '>=', lapseStart)
      .where('createdAt', '<', lapseEnd)
      .select('uid', 'createdAt', 'format')
      .limit(3000)
      .get();
  } catch (e) {
    console.error('[winback] candidate query failed:', e.message);
    await stateRef.set({ status: 'error', error: e.message }, { merge: true }).catch(() => {});
    return;
  }

  const cand = new Map(); // uid -> { lastMs, format }
  for (const doc of candSnap.docs) {
    const d = doc.data();
    if (!d.uid) continue;
    const ms = d.createdAt?.toMillis?.() || 0;
    const prev = cand.get(d.uid);
    if (!prev || ms > prev.lastMs) cand.set(d.uid, { lastMs: ms, format: d.format || 'apda' });
  }

  // Lapsed = ran a round 7-28d ago, nothing in the last 7d.
  const lapsedUids = [...cand.keys()].filter(uid => !activeUids.has(uid));

  // ── 3. Send (or dry-run count). ──────────────────────────────────────────────
  let eligible = 0, sent = 0, skipped = 0, errors = 0;
  const sampleWould = [];

  for (const uid of lapsedUids) {
    // Bound the work in BOTH modes: live stops at MAX_EMAILS sent, dry-run
    // stops at MAX_EMAILS eligible — so a surprise-large lapsed cohort can
    // never read an unbounded number of profiles (Firestore-quota safe).
    if (sent >= MAX_EMAILS || eligible >= MAX_EMAILS) break;
    try {
      const profileSnap = await db.doc(`user_profiles/${uid}`).get();
      if (!profileSnap.exists) { skipped++; continue; }
      const prof = profileSnap.data();

      // Honor the shared email opt-out + a win-back-specific one + no email.
      if (prof.wauDigestOptOut || prof.winbackOptOut || !prof.email) { skipped++; continue; }

      // Per-user dedup: at most one win-back per 21 days.
      const lastSent = prof.winbackSentAt?.toMillis?.() || 0;
      if (now - lastSent < MIN_GAP_USER_MS) { skipped++; continue; }

      eligible++;
      const { label, motion } = fmtFor(cand.get(uid).format);
      const firstName = (prof.displayName || '').trim().split(/\s+/)[0] || '';

      if (dryRun) {
        if (sampleWould.length < 10) sampleWould.push({ uid, format: cand.get(uid).format, hasName: !!firstName });
        continue;
      }

      const html = buildHtml({ firstName, label, motion });
      const subject = firstName
        ? `${firstName}, your next ${label} round is ready when you are`
        : `Your next ${label} round is ready when you are`;
      const result = await sendEmail({ to: prof.email, subject, html });

      if (result.ok) {
        sent++;
        await db.doc(`user_profiles/${uid}`).update({ winbackSentAt: FieldValue.serverTimestamp() }).catch(() => {});
      } else {
        errors++;
        console.warn('[winback] send failed for uid', uid, result.status || result.reason);
      }
    } catch (e) {
      errors++;
      console.warn('[winback] uid error', uid, e.message);
    }
  }

  await stateRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    status: 'done',
    dryRun,
    candidates: lapsedUids.length,
    eligible,
    sent,
    skipped,
    errors,
    sampleWould: dryRun ? sampleWould : FieldValue.delete(),
  }, { merge: true }).catch(() => {});

  console.log(`[winback] ${dryRun ? 'DRY-RUN' : 'LIVE'} — lapsed:${lapsedUids.length} eligible:${eligible} sent:${sent} skipped:${skipped} errors:${errors}`);
};

export const config = {
  schedule: '0 16 * * 3', // Wednesday 16:00 UTC (offset from the Sunday wau-digest)
};
