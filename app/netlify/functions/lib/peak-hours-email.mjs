import { esc, renderFooter, toText, unsubUrl } from './email.mjs';
import { optedOutOfAnything } from './debate-reminder.mjs';
export const CAMPAIGN = 'peak-hours-2026-09-20';
export const SUBJECT = 'Meet someone on Debatable at 9pm';
export const MESSAGE = `Hey,

Let's get more people online at the same time so it's easier to find someone to debate.

Pick one of these daily peak hours:
• 9pm London time
• 9pm India time (IST)
• 9pm Eastern time (New York)

These are three separate sessions. Choose whichever fits your day, join around the start, and give people a few minutes to arrive.

Join a live round: https://itsdebatable.com/spar

One person on each side. Pick a topic and argue it out. No debate experience needed.

If anything gets in the way of signing in or starting a round, reply and tell us what happened.

See you there,
Debatable`;
const BAD_DOMAINS = new Set(['itsdebatable.com', 'sharklasers.com', 'ebflyai.com', 'kolsea.com', 'koboywin.com', 'jbsze.com', 'nanana.uk', 'edumail.edu.pl', 'privaterelay.appleid.com']);
export function cohort(users, profiles) {
  const groups = new Map();
  const skipped = { noEmail: 0, invalidOrTest: 0, disabled: 0, optedOut: 0, duplicate: 0 };
  for (const user of users) {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) { skipped.noEmail++; continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || BAD_DOMAINS.has(email.split('@')[1])) { skipped.invalidOrTest++; continue; }
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push(user);
  }
  const recipients = [];
  for (const [email, accounts] of groups) {
    skipped.duplicate += accounts.length - 1;
    if (accounts.some(u => u.disabled)) { skipped.disabled++; continue; }
    if (accounts.some(u => optedOutOfAnything(profiles.get(u.uid)))) { skipped.optedOut++; continue; }
    accounts.sort((a,b) => a.uid.localeCompare(b.uid));
    recipients.push({ email, uid: accounts[0].uid, uids: accounts.map(u => u.uid) });
  }
  return { recipients: recipients.sort((a,b) => a.email.localeCompare(b.email)), skipped };
}
export function payload(person) {
  const url = unsubUrl(person.uid, 'sparnight');
  if (!url) throw new Error('Unsubscribe links must be configured before sending.');
  const html = '<div style="max-width:520px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#222">'
    + MESSAGE.split('\n\n').map(p => '<p>' + esc(p).replaceAll('\n', '<br>') + '</p>').join('')
      .replace('https://itsdebatable.com/spar', '<a href="https://itsdebatable.com/spar">itsdebatable.com/spar</a>')
    + renderFooter({uid:person.uid, stream:'sparnight', reason:'You received this because you signed up for Debatable.'}) + '</div>';
  return { from:'Debatable <hello@itsdebatable.com>', reply_to:process.env.EMAIL_REPLY_TO || 'aidandavidhollinger@gmail.com',
    to:[person.email], subject:SUBJECT, html, text:toText(html),
    headers:{'List-Unsubscribe':`<${url}>`, 'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'} };
}
