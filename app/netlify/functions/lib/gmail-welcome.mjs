import { createHash } from 'node:crypto';

export const GMAIL_SENDER = 'aidandavidhollinger@gmail.com';

export function gmailConfig() {
  let oauth;
  try { oauth = JSON.parse(process.env.WELCOME_GMAIL_OAUTH || '{}'); }
  catch { return null; }
  return oauth.client_id && oauth.client_secret && oauth.refresh_token ? oauth : null;
}

export function welcomeMessageId(uid) {
  return `<welcome.${createHash('sha256').update(uid).digest('hex')}@itsdebatable.com>`;
}

export function gmailRawMessage({ to, subject, text, uid, unsubscribe, now = new Date() }) {
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to || '')) throw new Error('invalid_recipient');
  if (!/^https:\/\/itsdebatable\.com\/api\/email-unsub\?[^\r\n<>]+$/.test(unsubscribe || '')) throw new Error('invalid_unsubscribe');
  const body = Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
  return Buffer.from([
    `From: Aidan <${GMAIL_SENDER}>`, `To: ${to}`, `Reply-To: ${GMAIL_SENDER}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Date: ${now.toUTCString()}`, `Message-ID: ${welcomeMessageId(uid)}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', `List-Unsubscribe: <${unsubscribe}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click', '', body,
  ].join('\r\n')).toString('base64url');
}

// No mailbox-read permission. Ambiguous sends need a human to check Sent by
// recipient, subject and time. Gmail may replace our submitted Message-ID and
// does not promise idempotent sends.
export async function sendGmailWelcome(message, fetcher = fetch) {
  const oauth = gmailConfig();
  if (!oauth) return { ok: false, reason: 'gmail_not_connected' };
  let raw;
  try { raw = gmailRawMessage(message); }
  catch (e) { return { ok: false, reason: e.message }; }
  let token;
  try {
    const response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...oauth, grant_type: 'refresh_token' }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, reason: `gmail_auth_${response.status}` };
    token = (await response.json()).access_token;
    if (!token) return { ok: false, reason: 'gmail_auth_no_token' };
  } catch { return { ok: false, reason: 'gmail_auth_unavailable' }; }
  try {
    const response = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return {
      ok: false, reason: `gmail_send_${response.status}`,
      ambiguous: response.status >= 500 || response.status === 408,
      quotaExhausted: response.status === 429 || response.status === 403,
    };
    const result = await response.json();
    if (!result.id) return { ok: false, reason: 'gmail_missing_receipt', ambiguous: true };
    return { ok: true, id: result.id };
  } catch { return { ok: false, reason: 'gmail_send_uncertain', ambiguous: true }; }
}
