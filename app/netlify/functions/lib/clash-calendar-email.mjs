import {cohort as baseCohort} from './peak-hours-email.mjs';
import {esc, renderFooter, toText, unsubUrl} from './email.mjs';
export const CAMPAIGN = 'clash-calendar-2026-09-25';
export const SUBJECT = 'Put a Debatable Clash Hour in your calendar';
export const MESSAGE = `Hey,

Let's make it easier to find someone to debate. We're getting people together for three Clash Hours every day:

9pm India time (IST)
9pm London time
9pm Eastern time (New York)

These are three separate sessions, each lasting 90 minutes. Pick whichever fits your day, join around the start, and give people a few minutes to arrive.

Add a session to Google Calendar or Apple Calendar:
https://itsdebatable.com/clash-hours

Your calendar shows the time where you are. Each session repeats daily, so you only need to add it once. The page also has .ics downloads for Outlook and other calendars.

When it's time, join here: https://itsdebatable.com/spar

You can turn on match and message notifications for each phone or computer at https://itsdebatable.com/notifications

See you in a round,
Debatable`;
export function cohort(users,profiles){
 const result=baseCohort(users,profiles);
 const byUid=new Map(users.map(u=>[u.uid,u]));
 result.skipped.unverified=0;
 result.recipients=result.recipients.filter(p=>{
   const verified=p.uids.find(uid=>byUid.get(uid)?.emailVerified === true);
   if(!verified){result.skipped.unverified++;return false;}
   p.uid=verified;return true;
 });
 return result;
}
export function payload(person){
 const url=unsubUrl(person.uid,'sparnight');
 if(!url)throw new Error('Unsubscribe must be configured');
 let html='<div style="max-width:540px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#222">'
  +MESSAGE.split('\n\n').map(p=>'<p>'+esc(p).replaceAll('\n','<br>')+'</p>').join('');
 for(const path of ['clash-hours','spar','notifications']) html=html.replaceAll('https://itsdebatable.com/'+path,'<a href="https://itsdebatable.com/'+path+'">itsdebatable.com/'+path+'</a>');
 html+=renderFooter({uid:person.uid,stream:'sparnight',reason:'You received this because you signed up for Debatable.'})+'</div>';
 return {from:'Debatable <hello@itsdebatable.com>',reply_to:process.env.EMAIL_REPLY_TO || 'aidandavidhollinger@gmail.com',to:[person.email],subject:SUBJECT,html,text:toText(html),headers:{'List-Unsubscribe':`<${url}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
