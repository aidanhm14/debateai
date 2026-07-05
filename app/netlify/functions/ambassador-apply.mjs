import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail } from './lib/email.mjs';

// Ambassador application capture for /ambassadors. Anonymous-allowed POST
// (applicants are almost never signed in). Replaces the Netlify Forms
// dependency: form detection is not enabled on the site, so data-netlify
// POSTs 404. This function is the real endpoint.
//
// Writes one doc per email to `ambassador_applications/{emailHash}` so a
// re-submit updates the existing application instead of duplicating, then
// emails the founder a copy (best-effort — the Firestore doc is the record).
//
// Rate limit: 3 applications per IP per hour. A real applicant applies once.

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 3;
const rateLimits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(k);
  }
}, 10 * 60 * 1000);

function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

// FNV-1a 32-bit hex hash. Stable email → doc id mapping without
// importing crypto; we just need dedup, not cryptographic strength.
function emailHash(email) {
  const s = String(email || '').trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIFY_TO = process.env.AMBASSADOR_NOTIFY_TO || 'aidandavidhollinger@gmail.com';

function clamp(s, n) {
  return typeof s === 'string' ? s.trim().slice(0, n) : '';
}

function notifyHtml(app) {
  const row = (k, v) => v
    ? `<tr><td style="padding:6px 14px 6px 0;color:#757166;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#1c1b18">${esc(v)}</td></tr>`
    : '';
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#3d3a33;max-width:620px">
    <h2 style="font-size:19px;color:#1c1b18;margin:0 0 4px">New ambassador application</h2>
    <p style="margin:0 0 16px;color:#757166">${esc(app.name)} · ${esc(app.school)}</p>
    <table style="border-collapse:collapse;font-size:15px">
      ${row('Name', app.name)}
      ${row('Email', app.email)}
      ${row('School', app.school)}
      ${row('Circuit / formats', app.circuit)}
      ${row('Grad year', app.gradYear)}
      ${row('Link', app.link)}
    </table>
    <p style="margin:16px 0 4px;color:#757166">Where they would start:</p>
    <p style="margin:0;padding:12px 14px;background:#faf9f6;border:1px solid #e7e4dc;border-radius:8px;color:#1c1b18">${esc(app.firstRoom)}</p>
  </div>`;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return errorResponse('Too many applications from this address. Try again later.', 429, request);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse('Invalid JSON body', 400, request);
  }

  // Honeypot from the form markup: bots fill it, humans never see it.
  if (clamp(body['bot-field'], 50)) {
    return jsonResponse({ ok: true }, 200, request);
  }

  const email = clamp(body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return errorResponse('Enter a valid email address', 400, request);
  }

  const app = {
    name: clamp(body.name, 120),
    email,
    school: clamp(body.school, 160),
    circuit: clamp(body.circuit, 160),
    gradYear: clamp(body.grad_year, 12),
    link: clamp(body.link, 300),
    firstRoom: clamp(body.first_room, 1200),
  };
  if (!app.name || !app.school || !app.circuit || !app.firstRoom) {
    return errorResponse('Fill in every required field', 400, request);
  }

  let stored = false;
  try {
    const db = getDb();
    const ref = db.collection('ambassador_applications').doc(emailHash(email));
    let existing = null;
    try { existing = await ref.get(); } catch (e) {
      console.warn('[ambassador-apply] existence check failed (quota?):', e && e.message);
    }
    const doc = {
      ...app,
      ip,
      userAgent: clamp(request.headers.get('user-agent') || '', 200),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existing || !existing.exists) doc.createdAt = FieldValue.serverTimestamp();
    await ref.set(doc, { merge: true });
    stored = true;
  } catch (e) {
    console.error('[ambassador-apply] write failed:', e);
  }

  // Best-effort founder notification; never throws (lib returns {ok:false}).
  const mail = await sendEmail({
    to: NOTIFY_TO,
    subject: `Ambassador application: ${app.name} (${app.school})`,
    html: notifyHtml(app),
    stream: 'transactional',
    replyTo: app.email,
  });
  if (!mail.ok) console.warn('[ambassador-apply] notify email failed:', mail.reason || mail.status);

  if (!stored && !mail.ok) {
    return errorResponse('Could not save your application. Try again in a moment.', 500, request);
  }
  return jsonResponse({ ok: true }, 200, request);
}

export const config = { path: '/api/ambassador-apply' };
