import { esc, sendEmail, renderFooter, brandHeader, SITE_URL, isOptedOut } from './email.mjs';
import { getAuthUserByUid } from './auth-admin.mjs';

// ── Partner-pool email alerts ──────────────────────────────────────
//
// The partner pool is ASYNCHRONOUS in a way the spar queue is not.
// A spar match resolves in under a minute while you watch a spinner;
// finding a partner can take hours, and nobody sits on a page that
// long. Without an email the pool only works when two people happen
// to be looking at the same screen at the same moment, which is the
// exact liquidity problem Open Spar Night was created to solve.
//
// Two moments are worth an email, and nothing else is:
//   PROPOSED   somebody specific asked to team up with you, and the
//              proposal expires if you never answer.
//   TEAMED     it is settled, here is who you are debating with.
//
// Recipient addresses are resolved SERVER-SIDE from Firebase Auth. The
// proposer never learns the other person's address, and no client ever
// hands us an address to send to.
//
// Everything here is best effort. An email failure must never fail the
// partnership: the handshake already committed in Firestore before
// this runs, and the page shows the same state without the email.

const STREAM = 'partner';

async function recipient(db, uid) {
  try {
    const [authUser, profileSnap] = await Promise.all([
      getAuthUserByUid(uid),
      db.collection('user_profiles').doc(uid).get().catch(() => null),
    ]);
    if (!authUser || !authUser.email) return null;
    const profile = profileSnap && profileSnap.exists ? profileSnap.data() : null;
    // No profile means we cannot check consent, and isOptedOut treats
    // that as opted out. That is the right default: a missing profile
    // is an unknown, not a yes.
    if (isOptedOut(profile, STREAM)) return null;
    return { uid, email: authUser.email, name: authUser.displayName || '' };
  } catch (err) {
    console.warn('[partner-email] recipient lookup failed:', err?.message || err);
    return null;
  }
}

function shell({ eyebrow, headline, sub, body, ctaLabel, ctaHref, uid }) {
  return `<!doctype html>
<html><body style="margin:0;padding:28px 20px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1f">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(20,20,30,.08);border-radius:14px;padding:26px 28px">
    ${brandHeader()}
    <div style="font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#dc2626">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 8px;font-size:1.4rem;font-weight:800;letter-spacing:-.01em;color:#141419">${esc(headline)}</h1>
    <p style="margin:0 0 16px;font-size:.95rem;line-height:1.6;color:#4a4a55">${esc(sub)}</p>
    ${body || ''}
    <a href="${esc(ctaHref)}" style="display:inline-block;margin-top:6px;padding:12px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.9rem;border-radius:100px">${esc(ctaLabel)}</a>
    ${renderFooter({ uid, stream: STREAM, reason: 'You are getting this because you joined the partner pool on itsdebatable.com.' })}
  </div>
</body></html>`;
}

function factRow(label, value) {
  if (!value) return '';
  return `<p style="margin:0 0 6px;font-size:.88rem;color:#4a4a55">
    <strong style="color:#141419">${esc(label)}:</strong> ${esc(value)}</p>`;
}

// Somebody proposed a partnership. Time-sensitive: the proposal
// unwinds if it is never answered, so the mail says so rather than
// implying it will sit there forever.
export async function notifyProposal(db, { toUid, fromName, fromNote, format, fit }) {
  const to = await recipient(db, toUid);
  if (!to) return { ok: false, skipped: true };
  const body =
    `<div style="background:#faf9f6;border:1px solid rgba(20,20,30,.07);border-radius:10px;padding:14px 16px;margin:0 0 18px">
      ${factRow('Debater', fromName)}
      ${factRow('Format', format)}
      ${factRow('Match', fit)}
      ${fromNote ? factRow('They said', fromNote) : ''}
    </div>`;
  return sendEmail({
    to: to.email,
    uid: toUid,
    stream: STREAM,
    subject: (fromName || 'A debater') + ' wants to be your 2v2 partner',
    html: shell({
      eyebrow: 'Partner request',
      headline: (fromName || 'A debater') + ' wants to team up',
      sub: 'Open the partner page to accept. Nobody is teamed up until you both say yes, and the request unwinds if neither of you answers.',
      body,
      ctaLabel: 'Open the partner page',
      ctaHref: SITE_URL + '/partners',
      uid: toUid,
    }),
  });
}

// The partnership is settled. Both members get this one.
export async function notifyTeamFormed(db, { uids, teamName, memberInfo, format }) {
  const results = await Promise.allSettled((uids || []).map(async (uid) => {
    const to = await recipient(db, uid);
    if (!to) return { ok: false, skipped: true };
    const partnerUid = (uids || []).find((u) => u !== uid);
    const partnerName = (memberInfo && memberInfo[partnerUid] && memberInfo[partnerUid].name) || 'your partner';
    const body =
      `<div style="background:#faf9f6;border:1px solid rgba(20,20,30,.07);border-radius:10px;padding:14px 16px;margin:0 0 18px">
        ${factRow('Team', teamName)}
        ${factRow('Partner', partnerName)}
        ${factRow('Format', format)}
      </div>`;
    return sendEmail({
      to: to.email,
      uid,
      stream: STREAM,
      subject: 'You are teamed up with ' + partnerName,
      html: shell({
        eyebrow: 'Partnership formed',
        headline: 'You and ' + partnerName + ' are a team',
        sub: 'Either of you can put the team in the queue, and the other does not need to be at their screen. The round link pulls them in when it fires.',
        body,
        ctaLabel: 'Queue for a 2v2',
        ctaHref: SITE_URL + '/partners',
        uid,
      }),
    });
  }));
  return { ok: true, sent: results.filter((r) => r.status === 'fulfilled' && r.value && r.value.ok).length };
}
