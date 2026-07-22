/* email-unsub.mjs
 *
 * Public one-click unsubscribe endpoint for lifecycle email. Reached from
 * mail clients, so there is NO auth token; the gate is the HMAC unsub
 * token minted by lib/email.mjs (keyed by EMAIL_UNSUB_SECRET).
 *
 *   GET  /api/email-unsub?u=<uid>&s=<stream>&t=<token>          -> confirm page (NO write)
 *   POST /api/email-unsub?...&confirm=1                          -> opt-out write + branded page
 *   POST /api/email-unsub?u=<uid>&s=<stream>&t=<token>          -> RFC 8058 one-click write; 200 plain text
 *   GET  /api/email-unsub?u=<uid>&s=<stream>&t=<token>&resub=1  -> undo write, "back on the list" page
 *
 * A plain GET never writes: corporate link scanners (SafeLinks, Mimecast,
 * Proofpoint) GET every URL in an inbound email on delivery and must not
 * be able to opt anyone out. Humans confirm via the interstitial's POST;
 * mail clients use the RFC 8058 one-click POST. The resub GET is the one
 * write-on-GET exception: undo links only appear on pages a human already
 * rendered, never in an email body.
 *
 * Streams: digest | winback | onboarding | all
 *   digest              -> user_profiles/{u}.wauDigestOptOut = true
 *   winback             -> user_profiles/{u}.winbackOptOut  = true
 *   onboarding or all   -> user_profiles/{u}.emailOptOut    = true (global kill-switch)
 * Resub clears the stream's flag; resub on onboarding/all clears all three
 * flags so "back on" means back on for real.
 * Every valid write also stamps emailUnsubAt + emailUnsubStream.
 *
 * EMAIL_UNSUB_SECRET unset -> 503 (links cannot be verified).
 * Invalid or missing token -> 400 branded page, no details leaked.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { esc, brandHeader, unsubUrl, verifyUnsubToken, isOptedOut, SITE_URL } from './lib/email.mjs';

const STREAMS = ['digest', 'winback', 'sparnight', 'onboarding', 'all'];

const FLAG_BY_STREAM = {
  digest: 'wauDigestOptOut',
  winback: 'winbackOptOut',
  sparnight: 'sparNightOptOut',
  onboarding: 'emailOptOut',
  all: 'emailOptOut',
};

// NOTE the digest flag also suppresses winback (isOptedOut in lib/email.mjs,
// preserving prod semantics), so the digest sentences own up to both.
// The global switch does NOT stop notify-accepted (no recipient uid to
// check there), so onboarding/all carves out self-scheduled confirmations.
const STOP_SENTENCE = {
  digest: 'The weekly digest and the occasional check-in emails stop here.',
  winback: 'The occasional check-in emails stop here. Nothing else changes.',
  sparnight: 'The Spar Night reminders stop here. Nothing else changes.',
  onboarding: 'All Debatable email stops here, except confirmations for rounds you schedule yourself.',
  all: 'All Debatable email stops here, except confirmations for rounds you schedule yourself.',
};

const CONFIRM_SENTENCE = {
  digest: 'This stops the weekly digest and the occasional check-in emails.',
  winback: 'This stops the occasional check-in emails. Nothing else changes.',
  sparnight: 'This stops the weekly Spar Night reminders. Nothing else changes.',
  onboarding: 'This stops all Debatable email, except confirmations for rounds you schedule yourself.',
  all: 'This stops all Debatable email, except confirmations for rounds you schedule yourself.',
};

const RESUME_SENTENCE = {
  digest: 'The weekly digest will show up again.',
  winback: 'The occasional check-in emails are back on.',
  sparnight: 'The Spar Night reminders are back on.',
  onboarding: 'Debatable email is back on.',
  all: 'Debatable email is back on.',
};

// ── Tiny branded page shell, styled to match the email template ──────────────

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
<div style="max-width:540px;margin:0 auto;padding:48px 24px">
  ${brandHeader()}
  ${bodyHtml}
</div>
</body></html>`;
}

function htmlResponse(status, html) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function textResponse(status, text) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function invalidPage() {
  return htmlResponse(400, page('Link invalid', `
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    This link is invalid or expired.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 22px">
    Open the latest email from Debatable and use its unsubscribe link, or reply to the email to opt out.
  </p>
  <a href="${SITE_URL}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Back to itsdebatable.com
  </a>`));
}

// GET interstitial: shows what will stop and asks for one explicit click.
// No state has changed when this renders.
function intentPage({ uid, stream, token }) {
  const action = `/api/email-unsub?u=${encodeURIComponent(uid)}&s=${encodeURIComponent(stream)}&t=${encodeURIComponent(token)}&confirm=1`;
  return htmlResponse(200, page('Unsubscribe?', `
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    Unsubscribe?
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 22px">
    ${CONFIRM_SENTENCE[stream]}
  </p>
  <form method="POST" action="${esc(action)}" style="margin:0 0 22px">
    <button type="submit" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;border:0;cursor:pointer;font-family:inherit;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
      Confirm unsubscribe
    </button>
  </form>
  <p style="margin-top:22px;font-size:.85rem;line-height:1.55;color:#3a3a44">
    Changed your mind? Nothing changes until you confirm.
    <a href="${SITE_URL}" style="color:#dc2626;text-decoration:none;font-weight:600">Back to itsdebatable.com</a>.
  </p>`));
}

function confirmPage({ uid, stream }) {
  const undoHref = `${unsubUrl(uid, stream)}&resub=1`;
  const allHref = stream === 'all' ? null : unsubUrl(uid, 'all');
  return htmlResponse(200, page("You're unsubscribed", `
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    You're unsubscribed.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 22px">
    ${STOP_SENTENCE[stream]}
  </p>
  <a href="${SITE_URL}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Back to itsdebatable.com
  </a>
  <p style="margin-top:22px;font-size:.85rem;line-height:1.55;color:#3a3a44">
    Changed your mind?
    <a href="${esc(undoHref)}" style="color:#dc2626;text-decoration:none;font-weight:600">Undo</a>.
  </p>
  ${allHref ? `<p style="margin-top:14px;font-size:.76rem;line-height:1.5;color:#9b9ba8">
    <a href="${esc(allHref)}" style="color:#9b9ba8;text-decoration:underline">Unsubscribe from all Debatable email</a>
  </p>` : ''}`));
}

// stillBlocked: the flag we just cleared is not the only one suppressing
// this stream (winback rides the digest flag, everything rides the global
// switch). Say so instead of overpromising, and offer the real fix.
function resubPage({ uid, stream, stillBlocked }) {
  const body = stillBlocked
    ? `Saved. One catch: an earlier unsubscribe still switches these emails off.
    <a href="${esc(`${unsubUrl(uid, 'all')}&resub=1`)}" style="color:#dc2626;text-decoration:none;font-weight:600">Turn all Debatable email back on</a>.`
    : RESUME_SENTENCE[stream];
  return htmlResponse(200, page("You're back on the list", `
  <h1 style="font-size:1.35rem;font-weight:800;letter-spacing:-.015em;line-height:1.25;color:#1a1a1f;margin:0 0 14px">
    You're back on the list.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 22px">
    ${body}
  </p>
  <a href="${SITE_URL}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Back to itsdebatable.com
  </a>`));
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return textResponse(405, 'Method not allowed.');
  }

  if (!process.env.EMAIL_UNSUB_SECRET) {
    return textResponse(503, 'Unsubscribe links are not configured right now. Reply to the email to opt out.');
  }

  const params = new URL(req.url).searchParams;
  const uid = (params.get('u') || '').trim();
  const stream = (params.get('s') || '').trim();
  const token = (params.get('t') || '').trim();
  // resub is honored on GET only; POST stays a pure RFC 8058 unsubscribe.
  const resub = req.method === 'GET' && params.get('resub') === '1';
  // The interstitial's form tags its POST so it gets the branded page
  // back instead of the RFC 8058 plain-text reply.
  const fromForm = req.method === 'POST' && params.get('confirm') === '1';

  if (!uid || uid.length > 128 || uid.includes('/') || !STREAMS.includes(stream)) {
    return invalidPage();
  }
  if (!verifyUnsubToken(uid, stream, token)) {
    return invalidPage();
  }

  // Plain GET: no write. Link-prefetching mail scanners GET every URL in
  // an email on delivery; the opt-out only lands on an explicit POST
  // (interstitial button or RFC 8058 one-click) or the human-only resub GET.
  if (req.method === 'GET' && !resub) {
    return intentPage({ uid, stream, token });
  }

  try {
    const db = getDb();
    const patch = resub
      ? (stream === 'onboarding' || stream === 'all'
          // "Back on" for the global switch clears the per-stream flags
          // too; otherwise the promise on the page would be empty.
          ? { emailOptOut: false, wauDigestOptOut: false, winbackOptOut: false, sparNightOptOut: false }
          : { [FLAG_BY_STREAM[stream]]: false })
      : { [FLAG_BY_STREAM[stream]]: true };
    await db.doc(`user_profiles/${uid}`).set({
      ...patch,
      emailUnsubAt: FieldValue.serverTimestamp(),
      emailUnsubStream: stream,
    }, { merge: true });

    if (resub) {
      // Honesty check: another stream's flag can still suppress these
      // emails. Read back and say so instead of overpromising.
      let stillBlocked = false;
      try {
        const snap = await db.doc(`user_profiles/${uid}`).get();
        stillBlocked = snap.exists
          ? isOptedOut(snap.data(), stream === 'all' ? 'onboarding' : stream)
          : false;
      } catch { /* default to the clean page */ }
      return resubPage({ uid, stream, stillBlocked });
    }
  } catch (e) {
    console.error('[email-unsub] firestore write failed:', e.message);
    return textResponse(500, 'Something went wrong saving your preference. Reply to the email to opt out.');
  }

  if (fromForm) {
    return confirmPage({ uid, stream });
  }
  return textResponse(200, 'Unsubscribed. Debatable will stop sending these emails.');
};

export const config = { path: '/api/email-unsub' };
