import { isOptedOut, renderFooter, SITE_URL } from './email.mjs';
export const STREAM = 'sparnight';
export const STAMP = 'reminderSep08SentAt';
export const SUBJECT = "Debatable is updated. Let's debate tonight.";
const EXCLUDE_EMAILS = new Set([
  // own + brand accounts
  'aidandavidhollinger@gmail.com', 'ahollinger@uchicago.edu',
  'trydebatable@gmail.com', 'contact@devilsadvocateteam.com',
  // family: NOT excluded, per the founder's call on the Clash Hour run.
  // Tier 1 notable signups: personal email from the founder instead
  'futarchy@gmail.com', 'john@superdebate.org', 'hines.debate@gmail.com',
  'adamboazbecker@gmail.com', 'antonia@theresanaiforthat.com',
  // educators on school domains: Program-tier leads, personal notes instead
  'lorenzo.balderas@jonesboroschools.net', 'ardanche@usd356.org',
  'pclements@usd261.com', 'beau.hulgan@pfisd.net',
  'vnguyen@headroyce.org', 'edward@5ft.org',
]);
const EXCLUDE_DOMAINS = new Set([
  'itsdebatable.com',            // dryrun.* test accounts + aidan@
  'sharklasers.com', 'ebflyai.com', 'kolsea.com', 'koboywin.com',
  'jbsze.com', 'nanana.uk', 'edumail.edu.pl',
  'privaterelay.appleid.com',    // relay mail bounces; sender not registered with Apple
]);

export function excluded(email) {
  const e = String(email || '').toLowerCase();
  if (EXCLUDE_EMAILS.has(e)) return true;
  return EXCLUDE_DOMAINS.has(e.split('@')[1] || '');
}

// Stricter than isOptedOut(profile,'onboarding'), deliberately. That call
// only reads the global switch, which would let this land on someone who
// had specifically muted the live hours. Anyone who has ever asked for
// less email gets none of this one.
const OPT_OUT_FLAGS = ['emailOptOut', 'wauDigestOptOut', 'winbackOptOut',
                       'sparNightOptOut', 'openOptOut', 'streamOptOut'];
export function optedOutOfAnything(prof) {
  if (!prof) return false;             // missing doc is not an opt-out
  if (isOptedOut(prof, STREAM)) return true;
  return OPT_OUT_FLAGS.some(f => !!prof[f]);
}


export const MESSAGE = `Hey,

The website is updated and ready. Let's start debating today.

Join us at one of three daily sessions:
9 PM New York
9 PM Berlin
9 PM Sydney

Each is a separate session at 9 PM in that city's local time. Pick the one that suits you.

https://itsdebatable.com/spar

See you in a round,
Debatable`;

export function renderReminder(uid) {
  const paragraphs = MESSAGE.split('\n\n').map(p => '<p>' + p.replaceAll('\n', '<br>') + '</p>');
  return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">'
    + paragraphs.join('').replace('https://itsdebatable.com/spar', '<a href="' + SITE_URL + '/spar">itsdebatable.com/spar</a>')
    + renderFooter({uid, stream: STREAM, reason: 'You received this because you signed up for Debatable.'}) + '</div>';
}

export function buildCohort(users, profiles, receipts) {
  const skipped = {noEmail:0, excluded:0, optedOut:0, alreadySent:0, duplicate:0};
  const byEmail = new Map();
  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) { skipped.noEmail++; continue; }
    if (u.disabled || excluded(email)) { skipped.excluded++; continue; }
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(u);
  }
  const recipients = [];
  for (const [email, accounts] of byEmail) {
    accounts.sort((a,b) => a.uid.localeCompare(b.uid));
    skipped.duplicate += accounts.length - 1;
    if (accounts.some(u => optedOutOfAnything(profiles.get(u.uid)))) { skipped.optedOut++; continue; }
    if (receipts.has(email) || accounts.some(u => profiles.get(u.uid)?.[STAMP])) { skipped.alreadySent++; continue; }
    recipients.push({email, uid:accounts[0].uid, accounts});
  }
  return {recipients, skipped};
}
