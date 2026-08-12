// Drives the REAL classification + the loop's decision rules against the
// exact Resend bodies observed on 2026-08-12.
import { sendEmail } from '../app/netlify/functions/lib/email.mjs';

const DAY_MS = 864e5;
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } };

// --- the already-sent window, copied from the module under test ---
function alreadySentFor(prof, eventStartMs) {
  const raw = prof?.sparNightSentAt;
  const ms = raw?.toMillis ? raw.toMillis()
           : (raw?._seconds ? raw._seconds * 1000
           : (raw instanceof Date ? raw.getTime() : 0));
  if (!ms) return false;
  return ms > (eventStartMs - DAY_MS);
}
const EVENT = Date.UTC(2026, 7, 13, 0, 0, 0);
ok('no stamp -> not sent',        alreadySentFor({}, EVENT) === false);
ok('this morning -> already sent', alreadySentFor({ sparNightSentAt: new Date(Date.UTC(2026,7,12,13,3)) }, EVENT) === true);
ok('last week -> not sent',        alreadySentFor({ sparNightSentAt: new Date(Date.UTC(2026,7,5,13,3)) }, EVENT) === false);
ok('firestore _seconds shape',     alreadySentFor({ sparNightSentAt: { _seconds: Date.UTC(2026,7,12,13,3)/1000 } }, EVENT) === true);

// --- the loop: 170 recipients, provider dies of quota after 31 ---
process.env.RESEND_API_KEY = 'test';
let calls = 0;
global.fetch = async () => {
  calls++;
  if (calls <= 31) return { ok:true, status:200, json:async()=>({id:'i'+calls}), headers:{get:()=>null} };
  return { ok:false, status:429, headers:{get:()=>null},
           json:async()=>({statusCode:429,name:'daily_quota_exceeded',message:'You have reached your daily email sending quota.'}) };
};
let sent = 0, errors = 0, quotaExhausted = false;
for (let i = 0; i < 170; i++) {
  if (quotaExhausted) break;
  const r = await sendEmail({ to:`u${i}@x.com`, subject:'s', html:'<p>h</p>' });
  if (r.ok) sent++;
  else { errors++; if (r.quotaExhausted) { quotaExhausted = true; break; } }
}
ok('sent 31 before the wall', sent === 31);
ok('stopped immediately, 1 failed request not 139', errors === 1);
ok('quota flag raised', quotaExhausted === true);
ok('total provider calls = 32, not 170', calls === 32);

const status = quotaExhausted ? 'partial-quota'
             : (errors > sent && errors > 0) ? 'mostly-failed'
             : errors > 0 ? 'done-with-errors' : 'done';
ok('status is partial-quota, never done', status === 'partial-quota');

// --- retry run: same event, the 31 are stamped, 139 remain ---
const stampedToday = new Date(Date.UTC(2026,7,12,13,3));
const cohort = Array.from({length:170}, (_,i) => (i < 31 ? { sparNightSentAt: stampedToday } : {}));
const wouldMail = cohort.filter(p => !alreadySentFor(p, EVENT)).length;
ok('retry targets exactly the 139 unsent', wouldMail === 139);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
