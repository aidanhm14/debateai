// POST /api/signin-link — mail the passwordless sign-in link ourselves.
//
// WHY THIS EXISTS. Until 2026-08-26 the emailed sign-in link was sent by
// Firebase's own mailer: from noreply@debateos-78ac5.firebaseapp.com,
// subject "Sign in to DebateOS", body the stock Identity Toolkit
// template. Gmail filed it as Spam with "similar to messages that were
// identified as spam in the past", which is the correct verdict on a
// shared Google-owned sending domain carrying a template millions of
// projects send unmodified. A sign-in link in Spam is not a slow sign-in,
// it is no sign-in: nobody hunts for it, and the account never happens.
//
// Everything needed to fix it was already here. lib/email.mjs sends
// through Resend from hello@itsdebatable.com, a domain with real SPF and
// DKIM that our lifecycle mail already ships from. lib/auth-admin.mjs can
// mint an Identity Toolkit access token off the service account. So this
// endpoint asks Firebase to GENERATE the link without sending it
// (returnOobLink), and puts it in our own envelope.
//
// Two more deliverability wins ride along, and they matter as much as the
// sender does:
//
//   1. THE LINK IS REHOSTED ON OUR OWN DOMAIN. Firebase hands back a
//      debateos-78ac5.firebaseapp.com/__/auth/action URL. An email from
//      itsdebatable.com whose only link points at a firebaseapp.com host
//      reads as a phishing pattern to a filter and to a person. The
//      Firebase JS SDK does not care what host the link is on: both
//      isSignInWithEmailLink() and credentialWithLink() parse `mode`,
//      `oobCode` and `apiKey` out of the query and send the code to the
//      API. So the same code goes out on
//      https://itsdebatable.com/<their page>?mode=signIn&oobCode=…, which
//      lands directly on the page they were reading with no redirect hop,
//      where auth-modal.js's completeEmailLink() already picks it up.
//
//   2. ONE LINK, PLAIN WORDS, NO MARKETING. The template is short, has a
//      single URL, no images, no tracking pixel, and a text/plain part
//      (lib/email.mjs derives it). That profile is most of what a filter
//      scores before it ever looks at the domain.
//
// FAILURE POSTURE: any failure here returns a status the CLIENT can fall
// back from, and auth-modal.js falls back to Firebase's own
// sendSignInLinkToEmail(). A spam-foldered link beats no link, so this
// endpoint being down must never mean nobody can sign in.

import { checkAppCheck } from './lib/appcheck.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { generateEmailSignInLink } from './lib/auth-admin.mjs';
import { sendEmail, esc, brandHeader, SITE_URL } from './lib/email.mjs';

// Where a sign-in link is allowed to land. This is the security boundary
// of the whole endpoint: the oobCode travels in the URL, so whoever hosts
// the page the link opens can sign in as that person. The client sends its
// own location and a forged one would be an account-takeover vector, so
// only origins we serve are accepted and anything else falls back to the
// canonical site rather than being honoured.
const ALLOWED_ORIGINS = new Set([
  'https://itsdebatable.com',
  'https://www.itsdebatable.com',
  'https://debateai.com',
  'https://www.debateai.com',
  'https://debateos1.netlify.app',
  'http://localhost:8888',
  'http://localhost:5173',
]);

// Per address AND per IP. The address layer is the one that matters: it
// stops this from becoming a way to mail-bomb a stranger's inbox from our
// verified domain, which would cost us the domain reputation this whole
// change is about. The IP layer catches a script walking a list.
const LAYERS_EMAIL = [
  { window: 60 * 60_000, max: 5, label: 'email-hour' },
  { window: 24 * 60 * 60_000, max: 12, label: 'email-day' },
];
const LAYERS_IP = [
  { window: 10 * 60_000, max: 8, label: 'ip-10m' },
  { window: 60 * 60_000, max: 20, label: 'ip-hour' },
  { window: 24 * 60 * 60_000, max: 60, label: 'ip-day' },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Rebuild the action link on our own domain. Keeps exactly the parameters
// the SDK reads and drops Firebase's continueUrl, which is redundant once
// the link already IS the destination.
function rehost(oobLink, target) {
  const src = new URL(oobLink);
  const out = new URL(target);
  for (const key of ['mode', 'oobCode', 'apiKey', 'lang', 'tenantId']) {
    const value = src.searchParams.get(key);
    if (value) out.searchParams.set(key, value);
  }
  return out.toString();
}

// The destination the link opens. Path only: a client-supplied query would
// ride into the email untouched, and the page it lands on is one we serve.
function resolveTarget(raw) {
  const fallback = `${SITE_URL}/practice`;
  if (!raw || typeof raw !== 'string') return fallback;
  let url;
  try { url = new URL(raw); } catch { return fallback; }
  if (!ALLOWED_ORIGINS.has(url.origin)) return fallback;
  const path = url.pathname && url.pathname.startsWith('/') && !url.pathname.startsWith('//')
    ? url.pathname
    : '/practice';
  return `${url.origin}${path}`;
}

function template({ link, name }) {
  const greeting = name ? `Hi ${esc(name)},` : 'Hi,';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1f;max-width:520px">
  ${brandHeader()}
  <p style="margin:0 0 16px">${greeting}</p>
  <p style="margin:0 0 24px">Here is your sign-in link. Open it on the device you asked from and you are in. There is no password to remember.</p>
  <p style="margin:0 0 24px">
    <a href="${esc(link)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:10px">Sign in to Debatable</a>
  </p>
  <p style="margin:0 0 24px;font-size:.86rem;color:#6b6b76">Button not working? Paste this into your browser:<br>
    <a href="${esc(link)}" style="color:#b91c1c;word-break:break-all">${esc(link)}</a>
  </p>
  <p style="margin:0 0 8px;font-size:.86rem;color:#6b6b76">The link works once and expires in an hour. If you did not ask to sign in, ignore this and nothing happens.</p>
  <p style="margin:24px 0 0;font-size:.86rem;color:#6b6b76">Aidan<br>itsdebatable.com</p>
</div>`;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({ error: 'APP_CHECK_' + (appCheck.reason || 'failed').toUpperCase(), fallback: true }, 401, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }

  const email = String(body?.email || '').trim().toLowerCase();
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!EMAIL_RE.test(email) || email.length > 254) return errorResponse('Enter a valid email.', 400, request);

  const ip = callerIp(request);
  const byEmail = await checkLayers('signin-link', `email_${email}`, LAYERS_EMAIL);
  if (!byEmail.ok) {
    return jsonResponse({ error: 'RATE_LIMITED', layer: byEmail.layer }, 429, request);
  }
  const byIp = await checkLayers('signin-link', `ip_${ip}`, LAYERS_IP);
  if (!byIp.ok) {
    return jsonResponse({ error: 'RATE_LIMITED', layer: byIp.layer }, 429, request);
  }

  const target = resolveTarget(body?.continueUrl);

  let link;
  try {
    link = rehost(await generateEmailSignInLink(email, target), target);
  } catch (err) {
    // Credentials missing, Identity Toolkit down, email-link provider
    // disabled. The client still has Firebase's own sender.
    console.error('[signin-link] generate failed:', err && err.message);
    return jsonResponse({ error: 'LINK_UNAVAILABLE', fallback: true }, 503, request);
  }

  const sent = await sendEmail({
    to: email,
    subject: 'Your Debatable sign-in link',
    html: template({ link, name }),
    stream: 'transactional',
    // Replies to a sign-in link are a person who is stuck, and they should
    // reach a human rather than a mailbox nobody reads.
    replyTo: 'aidandavidhollinger@gmail.com',
  });

  if (!sent.ok) {
    console.error('[signin-link] send failed:', sent.reason, sent.message || '');
    return jsonResponse({ error: 'SEND_FAILED', reason: sent.reason, fallback: true }, 502, request);
  }

  return jsonResponse({ ok: true, sender: 'resend' }, 200, request);
};

export const config = {
  path: '/api/signin-link',
};
