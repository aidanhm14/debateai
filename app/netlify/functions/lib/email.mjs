/* lib/email.mjs
 *
 * Shared email helpers for every lifecycle sender (wau-digest, winback,
 * first-round, notify-*). One place for: HTML escaping, the text/plain
 * fallback, opt-out stream logic, HMAC unsubscribe tokens + URLs, the
 * standard footer + wordmark, and the Resend send call.
 *
 * Dependency-free beyond node builtins. Env is read at CALL time (not
 * module load) so missing vars degrade gracefully and tests can stub.
 *
 * Env:
 *   RESEND_API_KEY      required to actually send; absent -> {ok:false, reason:'no-key'}
 *   EMAIL_FROM          default From when the caller passes none
 *   EMAIL_REPLY_TO      default Reply-To when the caller passes none
 *   EMAIL_UNSUB_SECRET  HMAC key for one-click unsubscribe links; absent ->
 *                       tokens/URLs are null and footers fall back to
 *                       "Reply to opt out."
 *   SITE_URL            default https://debateai.com
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SITE_URL = process.env.SITE_URL || 'https://debateai.com';

// ── HTML escaping ────────────────────────────────────────────────────────────

export function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Crude html -> text for the text/plain alternative ────────────────────────
// Strips tags, keeps link hrefs as "label (url)", collapses blank lines.

export function toText(html) {
  if (!html) return '';
  let t = String(html);
  // Drop invisible blocks entirely.
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');
  // <a href="url">label</a> -> "label (url)"
  t = t.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
    const plainLabel = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!plainLabel) return href;
    if (plainLabel === href) return href;
    return `${plainLabel} (${href})`;
  });
  // Block-level boundaries become newlines before we strip the rest.
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n');
  t = t.replace(/<li\b[^>]*>/gi, '- ');
  // Strip all remaining tags.
  t = t.replace(/<[^>]+>/g, '');
  // Decode the entities esc() produces (order matters: &amp; last).
  t = t.replace(/&nbsp;/g, ' ')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&amp;/g, '&');
  // Tidy whitespace: trim line ends, collapse runs of blank lines.
  t = t.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// ── Opt-out logic per stream ─────────────────────────────────────────────────
// profile = user_profiles doc data. null/undefined -> true (cannot verify,
// do not send). profile.emailOptOut is the global kill-switch for EVERY
// stream. 'digest' is also suppressed by wauDigestOptOut. 'winback' is also
// suppressed by wauDigestOptOut OR winbackOptOut (preserves the existing
// scheduled-winback behavior). 'onboarding' and 'transactional' are
// suppressed only by the global switch.

export function isOptedOut(profile, stream) {
  if (!profile) return true;
  if (profile.emailOptOut) return true;
  if (stream === 'digest') return !!profile.wauDigestOptOut;
  if (stream === 'winback') return !!(profile.wauDigestOptOut || profile.winbackOptOut);
  // 'onboarding', 'transactional', and anything unknown: global switch only.
  return false;
}

// ── Unsubscribe tokens + URLs ────────────────────────────────────────────────

export function unsubToken(uid, stream) {
  const secret = process.env.EMAIL_UNSUB_SECRET;
  if (!secret || !uid || !stream) return null;
  return createHmac('sha256', secret).update(`unsub:${uid}:${stream}`).digest('hex');
}

export function verifyUnsubToken(uid, stream, token) {
  const expected = unsubToken(uid, stream);
  if (!expected || !token || typeof token !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unsubUrl(uid, stream) {
  const token = unsubToken(uid, stream);
  if (!token) return null;
  return `${SITE_URL}/api/email-unsub?u=${encodeURIComponent(uid)}&s=${stream}&t=${token}`;
}

// ── Shared template pieces ───────────────────────────────────────────────────

// The wordmark div exactly as in the digest template: red "Debate" + dark "It".
export function brandHeader() {
  return `<div style="font-size:1.05rem;font-weight:900;letter-spacing:-.02em;color:#1a1a1f;margin-bottom:24px">
    <span style="color:#dc2626">Debate</span>It
  </div>`;
}

// Standard footer <p>. With an unsubscribe secret configured (and a
// non-transactional stream) it carries a real Unsubscribe link; otherwise
// it falls back to the current "Reply to opt out." sentence.
// `reason` (plain text, escaped here) overrides the default "why you got
// this" sentence so a sender doesn't stack two competing explanations.
export function renderFooter({ uid, stream, reason } = {}) {
  const url = stream && stream !== 'transactional' ? unsubUrl(uid, stream) : null;
  const optOut = url
    ? `<a href="${esc(url)}" style="color:#9b9ba8;text-decoration:underline">Unsubscribe</a>.`
    : 'Reply to opt out.';
  const why = reason
    ? esc(reason)
    : `You're getting this because you've been active on
    <a href="${SITE_URL}" style="color:#dc2626;text-decoration:none">debateai.com</a>.`;
  return `<p style="margin-top:28px;font-size:.76rem;color:#9b9ba8;line-height:1.5">
    ${why}
    ${optOut}
  </p>`;
}

// ── Send via Resend ──────────────────────────────────────────────────────────
// from:    explicit arg > EMAIL_FROM env > 'Aidan @ DebateIt <aidandavidhollinger@gmail.com>'
//          (the pre-lib prod default for the scheduled senders; do NOT swap
//          in an @debateai.com address here unless it is a verified Resend
//          sender, or every unset-env send starts 403ing)
// replyTo: explicit arg > EMAIL_REPLY_TO env > 'aidandavidhollinger@gmail.com'
// text:    when omitted, derived from html via toText().
// For digest/winback/onboarding with a computable unsub URL, RFC 8058
// one-click headers ride along so mail clients show a native Unsubscribe.
// Never throws: missing key or a network failure returns {ok:false, ...}.

export async function sendEmail({ to, subject, html, text, uid, stream, from, replyTo, headers } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'no-key' };
  if (!to) return { ok: false, reason: 'no-recipient' };

  const resolvedFrom = from || process.env.EMAIL_FROM || 'Aidan @ DebateIt <aidandavidhollinger@gmail.com>';
  const resolvedReplyTo = replyTo || process.env.EMAIL_REPLY_TO || 'aidandavidhollinger@gmail.com';
  const resolvedText = text || toText(html);

  const allHeaders = { ...(headers || {}) };
  if (stream === 'digest' || stream === 'winback' || stream === 'onboarding') {
    const url = unsubUrl(uid, stream);
    if (url) {
      allHeaders['List-Unsubscribe'] = `<${url}>`;
      allHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
  }

  const payload = {
    from: resolvedFrom,
    reply_to: resolvedReplyTo,
    to: [to],
    subject,
    html,
    text: resolvedText,
  };
  if (Object.keys(allHeaders).length) payload.headers = allHeaders;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    let id;
    try {
      const body = await res.json();
      id = body?.id;
    } catch { /* body optional */ }
    const out = { ok: res.ok, status: res.status };
    if (id) out.id = id;
    if (!res.ok) out.reason = `resend-${res.status}`;
    return out;
  } catch (e) {
    return { ok: false, reason: `fetch-failed: ${e.message}` };
  }
}
