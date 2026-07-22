import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL } from './lib/email.mjs';

// Send a one-time "your first round is in the books" email to a user
// who just completed round #1. Wired to the post-round flow on
// /debate-it. Idempotent via user_profiles.firstRoundEmailSentAt so
// re-firing the same user's first-round endpoint never sends twice.
//
// Sends through lib/email.mjs on the 'onboarding' stream: shared esc /
// wordmark / footer, automatic text/plain part, and List-Unsubscribe
// headers when EMAIL_UNSUB_SECRET is configured. FIRST_ROUND_FROM /
// FIRST_ROUND_REPLY_TO still override the lib's from/replyTo resolution
// when set. Note: the old direct-Resend path attached a
// tags:[{category:'first-round'}] label; the shared sendEmail doesn't
// support Resend tags, so that dashboard label is gone.
//
// If RESEND_API_KEY is missing, return 200 with sent:false so the
// client doesn't error out; local-dev / preview environments shouldn't
// break the round-completion flow.

// "Try this next" motion suggestions, one per category. Picked so a
// brand-new debater has an obvious 2nd-round hook regardless of what
// they ran first.
const NEXT_MOTION_BY_CATEGORY = {
  policy:   'This House would tax billionaires out of existence.',
  ethics:   'This House would let people sell one of their kidneys.',
  tech:     'This House would ban algorithmic newsfeeds.',
  edu:      'This House would scrap legacy admissions at universities.',
  india:    'This House would lift the ban on commercial surrogacy in India.',
  default:  'This House would require all teenagers to learn a second language.',
};

function buildHtml({ uid, firstName, motion, side, format, rfdSnippet, nextMotion }) {
  // Keep it short. No em-dashes (per soul.md). Plain HTML, mobile-
  // friendly. Slice BEFORE escaping so a truncation can't cut an
  // entity in half.
  const motionEsc = esc(motion || 'your first motion');
  const nextEsc = esc(nextMotion);
  const rfdEsc = esc((rfdSnippet || '').slice(0, 600));
  const tryHref = SITE_URL + '/debate-it?motion=' + encodeURIComponent(nextMotion);

  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  ${brandHeader()}
  <h1 style="font-size:1.5rem;font-weight:800;letter-spacing:-.015em;line-height:1.2;color:#1a1a1f;margin:0 0 14px">
    First round in. Here's where I'd work next${firstName ? ', ' + esc(firstName) : ''}.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 18px">
    You ran <strong>${motionEsc}</strong>${side ? ' on the <strong>' + esc(side) + '</strong> side' : ''}${format ? ' (' + esc(format) + ')' : ''}.${rfdEsc ? " The judge's read:" : ''}
  </p>
  ${rfdEsc ? `<blockquote style="margin:0 0 22px;padding:14px 16px;border-left:3px solid #dc2626;background:rgba(220,38,38,.05);font-size:.92rem;line-height:1.6;color:#1a1a1f;border-radius:0 8px 8px 0">
    ${rfdEsc}
  </blockquote>` : ''}
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 8px">
    The fastest way to fix what dropped is to run it again on a similar motion. Here's one:
  </p>
  <p style="font-size:.95rem;line-height:1.55;color:#1a1a1f;margin:0 0 22px;padding:12px 14px;background:#f0f0e8;border-radius:8px;font-weight:600">
    ${nextEsc}
  </p>
  <a href="${tryHref}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Run this round →
  </a>
  <p style="font-size:.7rem;color:#8a8a94;margin:32px 0 0;border-top:1px solid #e8e8e0;padding-top:16px">
    Debatable · itsdebatable.com · Built by a UChicago parliamentary debater.
  </p>
  ${renderFooter({ uid, stream: 'onboarding', reason: 'You finished your first round on itsdebatable.com. One of these per signup, never a repeat. Reply if you want to talk debate, the AI, or anything else.' })}
</div>
</body></html>`;
}

function pickNextMotion(motion) {
  const m = (motion || '').toLowerCase();
  if (/billion|tax|wealth|capital|market|economy|trade/.test(m)) return NEXT_MOTION_BY_CATEGORY.policy;
  if (/right|moral|ethic|justice|fair|consent/.test(m)) return NEXT_MOTION_BY_CATEGORY.ethics;
  if (/ai|algorithm|tech|social media|internet|data/.test(m)) return NEXT_MOTION_BY_CATEGORY.tech;
  if (/school|education|university|admissions|student/.test(m)) return NEXT_MOTION_BY_CATEGORY.edu;
  if (/india|hindu|caste|delhi|mumbai|bollywood|surrogacy/.test(m)) return NEXT_MOTION_BY_CATEGORY.india;
  return NEXT_MOTION_BY_CATEGORY.default;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('send-first-round-email auth error:', err.message);
    return errorResponse('Authentication failed', 401, request);
  }

  const uid = decoded.sub;
  const email = decoded.email;
  if (!email) return errorResponse('No email on token; cannot send', 400, request);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const motion = String(body.motion || '').slice(0, 400);
  const side = String(body.side || '').slice(0, 80);
  const format = String(body.format || '').slice(0, 80);
  const rfdSnippet = String(body.rfdSnippet || '').slice(0, 1000);
  const firstName = String(body.firstName || '').slice(0, 40).trim();

  const db = getDb();

  // Idempotency check: if we already sent this user the first-round
  // email, do nothing. Same uid hitting save twice should not nag
  // them with a second copy of the same welcome. The same profile read
  // feeds the opt-out check below, so suppression costs zero extra reads.
  let alreadySent = false;
  let profile = null;
  try {
    const profileRef = db.collection('user_profiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      profile = profileSnap.data() || {};
      if (profile.firstRoundEmailSentAt) alreadySent = true;
    }
  } catch (err) {
    console.warn('send-first-round-email profile read failed:', err.message);
  }
  if (alreadySent) {
    return jsonResponse({ sent: false, reason: 'already_sent' }, 200, request);
  }

  // Opt-out check. Only when we actually have a profile doc: a brand-new
  // user often has no user_profiles doc yet, and a flaky read shouldn't
  // suppress the one welcome email they'll ever get.
  if (profile && isOptedOut(profile, 'onboarding')) {
    return jsonResponse({ sent: false, reason: 'opted_out' }, 200, request);
  }

  // Round-count gate: only fire on the user's actual FIRST round.
  // Some clients call this on every save; the gate keeps it honest.
  let roundCount = 0;
  try {
    const roundsSnap = await db.collection('debate_rounds')
      .where('uid', '==', uid)
      .limit(2)
      .get();
    roundCount = roundsSnap.size;
  } catch (err) {
    // Composite-index race or schema mismatch; proceed optimistically.
    console.warn('send-first-round-email round count check failed:', err.message);
  }
  // If 0 rounds saved yet, this could be racing the save write. Proceed.
  // If 2+, the user has already done multiple rounds. Skip.
  if (roundCount > 1) {
    return jsonResponse({ sent: false, reason: 'not_first_round', roundCount }, 200, request);
  }

  const nextMotion = pickNextMotion(motion);
  const html = buildHtml({ uid, firstName, motion, side, format, rfdSnippet, nextMotion });
  const subject = 'First round in. Here\'s where I\'d work next.';

  // Send via the shared lib. Missing RESEND_API_KEY returns sent:false
  // rather than 500 so the client flow never breaks; the lib also
  // derives the text/plain part and attaches List-Unsubscribe headers
  // when the unsub secret is configured.
  const result = await sendEmail({
    to: email,
    subject,
    html,
    uid,
    stream: 'onboarding',
    from: process.env.FIRST_ROUND_FROM || undefined,
    replyTo: process.env.FIRST_ROUND_REPLY_TO || undefined,
  });

  if (!result.ok) {
    if (result.reason === 'no-key') {
      return jsonResponse({ sent: false, reason: 'no_email_provider_configured' }, 200, request);
    }
    console.error('Resend error:', result.status || '', result.reason || '');
    if (result.status) {
      return errorResponse('Email provider error: ' + result.status, 502, request);
    }
    return errorResponse('Failed to send: ' + (result.reason || 'unknown'), 500, request);
  }

  // Mark sent so we don't dupe.
  try {
    await db.collection('user_profiles').doc(uid).set({
      firstRoundEmailSentAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('send-first-round-email mark-sent write failed:', err.message);
  }
  return jsonResponse({ sent: true }, 200, request);
};

export const config = {
  path: '/api/send-first-round-email',
};
