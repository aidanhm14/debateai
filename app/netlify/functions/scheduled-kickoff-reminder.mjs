// Scheduled function: runs every 5 minutes, finds live debates that
// kick off in the next 5-15 minutes, and emails both parties a
// "10 min until kickoff" reminder. Marks the challenge with
// reminderSent: true so we never double-fire.
//
// Catches the "I forgot we had a debate" failure mode without users
// having to add the calendar invite (most don't).
//
// Env vars (set in Netlify, same as notify-accepted):
//   RESEND_API_KEY        — Resend API key
//   RESEND_FROM           — verified sender (defaults to onboarding@resend.dev)
//   GOOGLE_SERVICE_ACCOUNT — Firebase service account JSON for admin Firestore

import { getDb } from './lib/firestore.mjs';

const RESEND_API = 'https://api.resend.com/emails';

function escHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function fmtTime(scheduledAt){
  if (!scheduledAt) return 'soon';
  const d = new Date(scheduledAt);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function reminderTemplate({ motion, format, kickoff, roomUrl, opponent, opponentContact, minutesAway }){
  const safe = escHtml;
  const contactLine = opponentContact
    ? `<p style="margin:6px 0 0;font-size:13px;color:#9ca3af">Opponent contact: <strong style="color:#e5e7eb">${safe(opponentContact)}</strong></p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#15151a;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden">
    <tr><td style="padding:24px 28px 16px">
      <div style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ef4444">Debate AI · Kickoff Reminder</div>
      <h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.01em">Kickoff in ~${safe(minutesAway)} min</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#9ca3af">Your live debate starts at ${safe(kickoff)}. Hop into the round room when you're ready.</p>
    </td></tr>
    <tr><td style="padding:8px 28px 4px">
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px 16px">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280">Motion</p>
        <p style="margin:0 0 14px;font-size:15px;color:#f3f4f6;line-height:1.5">${safe(motion)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af"><strong style="color:#e5e7eb">Format:</strong> ${safe(format)}</p>
        <p style="margin:0;font-size:13px;color:#9ca3af"><strong style="color:#e5e7eb">Opponent:</strong> ${safe(opponent)}</p>
        ${contactLine}
      </div>
    </td></tr>
    <tr><td style="padding:18px 28px 26px">
      <a href="${safe(roomUrl)}" style="display:inline-block;padding:12px 22px;background:#ef4444;color:#fff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:.02em">Open the round room</a>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#6b7280">If you can't make it, hit Bail on the live board so the slot reopens.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(apiKey, from, to, subject, html){
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok){
    let detail = ''; try { detail = await res.text(); } catch {}
    throw new Error('Resend ' + res.status + ': ' + detail.slice(0, 300));
  }
  return await res.json();
}

function fmtName(o){ return (o && (o.name || o.handle)) || 'Anonymous'; }

function buildRoundUrl(challenge){
  const id = challenge.id;
  const roomName = 'DebateAI-' + String(id).replace(/[^a-zA-Z0-9]/g,'');
  const yourSide = challenge.side === 'pro' ? 'con' : 'pro';
  const params = new URLSearchParams({
    motion: challenge.motion || challenge.topicLine || challenge.themeLine || '',
    format: challenge.format,
    pro: yourSide === 'pro' ? (challenge.accepterName || 'You') : (challenge.posterName || challenge.handle || 'Opponent'),
    con: yourSide === 'con' ? (challenge.accepterName || 'You') : (challenge.posterName || challenge.handle || 'Opponent'),
    room: roomName,
    challengeId: id,
  });
  return 'https://debateai.com/live-round.html?' + params.toString();
}

export default async (req) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Debate AI <onboarding@resend.dev>';
  if (!apiKey) {
    console.warn('[scheduled-kickoff] RESEND_API_KEY missing, skipping run');
    return new Response('skipped (no api key)', { status: 200 });
  }

  let db;
  try { db = getDb(); }
  catch (e) {
    console.warn('[scheduled-kickoff] Firestore not configured', e.message);
    return new Response('skipped (no firestore)', { status: 200 });
  }

  const now = Date.now();
  // Window: 5-25 min from now. Paired with the 15-min cron cadence so
  // every scheduled debate lands in exactly one run (reminderSent guard
  // also dedupes if a challenge straddles two windows). Reminder fires
  // 5-25 min before kickoff, median ~15 min.
  const windowStart = now + 5 * 60 * 1000;
  const windowEnd   = now + 25 * 60 * 1000;

  // Firestore stores scheduledAt as a number (epoch ms) per the
  // /live.html publishChallenge schema, so a numeric range query
  // works directly.
  const snap = await db.collection('live_challenges')
    .where('scheduledAt', '>=', windowStart)
    .where('scheduledAt', '<=', windowEnd)
    .get();

  const stats = { matched: snap.size, sent: 0, skipped: 0, errors: [] };

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const id = doc.id;
    if (d.reminderSent === true) { stats.skipped++; continue; }

    // Emails moved off the public live_challenges doc into the private
    // live_challenge_contacts/{id} companion. Read from companion first;
    // fall back to legacy d.* fields for old docs that haven't been
    // scrubbed yet. Skip the round if neither source has both emails.
    let posterEmail = d.posterEmail || '';
    let accepterEmail = d.accepterEmail || '';
    let accepterContact = d.accepterContact || '';
    try {
      const c = await db.collection('live_challenge_contacts').doc(id).get();
      if (c.exists) {
        const cd = c.data() || {};
        posterEmail = cd.posterEmail || posterEmail;
        accepterEmail = cd.accepterEmail || accepterEmail;
        accepterContact = cd.accepterContact || accepterContact;
      }
    } catch (e) { /* fall back to whatever's on the doc */ }
    if (!accepterEmail || !posterEmail) { stats.skipped++; continue; }

    const minutesAway = Math.max(1, Math.round((d.scheduledAt - now) / 60000));
    const kickoff = fmtTime(d.scheduledAt);
    const motion = String(d.motion || d.topicLine || d.themeLine || '').slice(0, 500);
    const format = String(d.format || '');
    const roundUrl = buildRoundUrl({ id, ...d });

    const posterHtml = reminderTemplate({
      motion, format, kickoff, roomUrl: roundUrl,
      opponent: fmtName({ name: d.accepterName }),
      opponentContact: accepterContact || accepterEmail || '',
      minutesAway,
    });
    const accepterHtml = reminderTemplate({
      motion, format, kickoff, roomUrl: roundUrl,
      opponent: fmtName({ name: d.posterName, handle: d.handle }),
      opponentContact: posterEmail || '',
      minutesAway,
    });

    try {
      await Promise.allSettled([
        sendEmail(apiKey, from, [posterEmail],   `Kickoff in ${minutesAway} min: ` + motion.slice(0, 60), posterHtml),
        sendEmail(apiKey, from, [accepterEmail], `Kickoff in ${minutesAway} min: ` + motion.slice(0, 60), accepterHtml),
      ]);
      await doc.ref.update({ reminderSent: true, reminderSentAt: Date.now() });
      stats.sent++;
    } catch (e) {
      stats.errors.push(id + ': ' + (e.message || e));
    }
  }

  console.log('[scheduled-kickoff] stats', stats);
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Netlify scheduled functions: runs every 15 minutes. Dropped from
// 5-min on 2026-05-18 to cut invocation count by ~70% (288/day →
// 96/day). Window above widened to 5-25 min so coverage stays full
// with no gaps. Reminder fires 5-25 min before kickoff, median ~15 min.
export const config = {
  schedule: '*/15 * * * *',
};
