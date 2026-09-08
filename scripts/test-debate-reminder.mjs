import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import schedule from '../app/js/clash-schedule.js';
import {buildCohort, renderReminder, STAMP, MESSAGE} from '../app/netlify/functions/lib/debate-reminder.mjs';
import {sendEmail} from '../app/netlify/functions/lib/email.mjs';

// Independent DST changes must never move a city's 9 PM session.
for (const date of ['2026-09-08','2026-10-03','2026-10-04','2026-10-25','2026-11-01','2027-03-14','2027-03-28','2027-04-04']) {
  for (const session of schedule.SESSIONS) {
    const now = Date.parse(date + 'T00:00:00Z');
    const st = schedule.nextFor(session, now), p = schedule.parts(st.start, session.tz);
    assert.equal(+p.hour, 21); assert.equal(+p.minute, 0);
    assert.ok(st.start + schedule.LIVE_MS > now);
    const url = new URL(schedule.calendarUrl(st));
    assert.equal(url.searchParams.get('ctz'), session.tz);
    assert.equal(url.searchParams.get('recur'), 'RRULE:FREQ=DAILY');
    assert.match(url.searchParams.get('dates'), /T210000\/\d{8}T223000/);
    assert.equal(schedule.nextFor(session, st.start + 89 * 60000).start, st.start);
    assert.ok(schedule.nextFor(session, st.start + 90 * 60000).start > st.start);
  }
}
const toIso = st => new Date(st.start).toISOString();
assert.equal(toIso(schedule.nextSession(Date.parse('2026-09-08T10:00Z'))), '2026-09-08T11:00:00.000Z');
assert.equal(toIso(schedule.nextSession(Date.parse('2026-09-08T13:00Z'))), '2026-09-08T19:00:00.000Z');
assert.equal(toIso(schedule.nextSession(Date.parse('2026-09-08T21:00Z'))), '2026-09-09T01:00:00.000Z');
const browser = {window:{}, Intl, Date};
vm.runInNewContext(fs.readFileSync(new URL('../app/js/clash-schedule.js',import.meta.url),'utf8'), browser);
assert.equal(toIso(browser.window.DBClashSchedule.nextSession(Date.parse('2026-10-25T13:00Z'))), '2026-10-25T20:00:00.000Z');

const users = [{uid:'a',email:'A@example.org'}, {uid:'a2',email:'a@example.org'},
  {uid:'b',email:'b@example.org'}, {uid:'c',email:'c@example.org'},
  {uid:'d',email:'d@example.org'}, {uid:'guest'},
  {uid:'off',email:'off@example.org',disabled:true}, {uid:'test',email:'test@itsdebatable.com'}];
let profiles = new Map([['b',{sparNightOptOut:true}], ['c',{[STAMP]:true}]]);
let cohort = buildCohort(users,profiles,new Set(['d@example.org']));
assert.deepEqual(cohort.recipients.map(r=>r.email), ['a@example.org']);
assert.equal(cohort.skipped.duplicate,1);
profiles.set('a2',{emailOptOut:true});
assert.equal(buildCohort(users,profiles,new Set(['d@example.org'])).recipients.length,0);
for (const flag of ['emailOptOut','wauDigestOptOut','winbackOptOut','sparNightOptOut','openOptOut','streamOptOut']) {
  assert.equal(buildCohort([{uid:'one',email:'one@example.org'}],new Map([['one',{[flag]:true}]]),new Set()).recipients.length,0);
}
assert.ok(MESSAGE.split(/\s+/).length < 85);
assert.doesNotMatch(renderReminder('test'), /<img|<h1|utm_|<table/);

// Dedup keys belong on the provider request, not inside the email headers.
process.env.RESEND_API_KEY = 'test'; process.env.EMAIL_UNSUB_SECRET = 'test';
let captured;
globalThis.fetch = async (url, init) => { captured = init; return {ok:true,status:200,json:async()=>({id:'receipt'}),headers:{get:()=>null}}; };
const sent = await sendEmail({to:'one@example.org',subject:'s',html:renderReminder('one'),uid:'one',stream:'sparnight',idempotencyKey:'campaign/one'});
assert.equal(sent.id,'receipt');
assert.equal(captured.headers['Idempotency-Key'],'campaign/one');
const payload = JSON.parse(captured.body);
assert.equal(payload.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
assert.match(payload.text,/Unsubscribe/);
assert.equal(payload.to.length,1);
console.log('PASS: city times, DST, calendars, live boundaries, dedup, opt-outs and email headers');

// Drive the actual admin handler with in-memory database/provider boundaries.
const {createHash} = await import('node:crypto');
const {SUBJECT, STREAM} = await import('../app/netlify/functions/lib/debate-reminder.mjs');
const source = fs.readFileSync(new URL('../app/netlify/functions/admin-debate-reminder.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default async request =>','return async request =>')
  .replace(/^export const config.*$/m,'');
let records = new Map(), writes=0, calls=0, failAt=Infinity;
const getDoc = key => ({id:key.split('/').pop(), data:()=>records.get(key)});
const db = {
  doc:key=>({key,get:async()=>getDoc(key),set:async(value)=>{writes++;records.set(key,{...records.get(key),...value});}}),
  collection:key=>({get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(key+'/')&&!k.slice(key.length+1).includes('/')).map(getDoc)})}),
  runTransaction:async fn=>fn({get:async ref=>getDoc(ref.key),set:(ref,value)=>{writes++;records.set(ref.key,{...records.get(ref.key),...value});}}),
};
const authUsers = Array.from({length:6},(_,i)=>({uid:'u'+i,email:'u'+i+'@example.org'}));
const fakeDate = class extends Date {static now(){return Date.parse('2026-09-08T18:00:00Z');}};
const handler = new Function('createHash','requireAdmin','FieldValue','corsResponse','jsonResponse','errorResponse',
  'listAllAuthUsers','sendEmail','verifiedSenderDomains','senderDomain','STREAM','STAMP','SUBJECT','MESSAGE','renderReminder','buildCohort','setTimeout','Date',source)(
  createHash,async()=>({db,uid:'admin'}),{serverTimestamp:()=>123},()=>({}),x=>x,(message,status)=>({message,status}),
  async()=>authUsers,async()=>{calls++;return calls===failAt?{ok:false,reason:'quota',quotaExhausted:true}:{ok:true,id:'id'+calls};},
  async()=>({ok:true,domains:['debateai.com']}),()=> 'debateai.com',STREAM,STAMP,SUBJECT,MESSAGE,renderReminder,buildCohort,
  resolve=>resolve(),fakeDate);
const req = data=>({method:'POST',json:async()=>data});
let result = await handler(req({}));
assert.equal(result.eligible,6); assert.equal(calls,0); assert.equal(writes,0);
result = await handler(req({confirm:'SEND'}));
assert.equal(result.sent,5); assert.equal(result.remaining,1);
result = await handler(req({confirm:'SEND'}));
assert.equal(result.sent,1); assert.equal(result.remaining,0); assert.equal(calls,6);
result = await handler(req({confirm:'SEND'}));
assert.equal(result.sent,0); assert.equal(calls,6); assert.equal(result.acceptedTotal,6);
records = new Map(); calls=0; failAt=2;
result = await handler(req({confirm:'SEND'}));
assert.equal(result.sent,1); assert.equal(result.remaining,5); assert.equal(result.halted,true); assert.equal(calls,2);
failAt=Infinity;
result = await handler(req({confirm:'SEND'}));
assert.equal(result.sent,5); assert.equal(result.remaining,0); assert.equal(result.acceptedTotal,6);
console.log('PASS: preview sends/writes nothing, resumable batches, no duplicate resend, quota stop and truthful remaining count');
