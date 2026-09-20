import { esc, renderFooter, toText, unsubUrl } from './email.mjs';
export { cohort } from './peak-hours-email.mjs';
export const CAMPAIGN = 'private-rounds-2026-09-20';
export const SUBJECT = 'Your Debatable rounds are private by default';
export const MESSAGE = `Hey,

New live rounds on Debatable now start private. No spectators, so you can focus on the person you're talking to.

Want to share a round? Choose "Record round." Recording is optional, and everyone in the round must agree to the recording and public replay before it starts. The finished replay is then posted on Watch, where it can be watched and shared.

Join a round: https://itsdebatable.com/spar

See you there,
Debatable`;
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
