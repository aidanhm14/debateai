import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import schedule from '../app/js/clash-schedule.js';
import handler from '../app/netlify/functions/clash-calendar.mjs';
assert.equal(schedule.SESSIONS.length,3);
for(const s of schedule.SESSIONS){
 const raw=readFileSync(new URL('../app/calendars/clash-'+s.id+'.ics',import.meta.url),'utf8');
 assert.ok(!/(^|[^\r])\n/.test(raw),'ICS uses CRLF');
 for(const line of raw.split('\r\n')) assert.ok(Buffer.byteLength(line)<=75,'fold long ICS lines');
 assert.ok(raw.includes('DTSTART;TZID='+s.tz+':20260925T210000'));
 assert.ok(raw.includes('DTEND;TZID='+s.tz+':20260925T223000'));
 assert.ok(raw.includes('UID:clash-hour-'+s.id+'@itsdebatable.com'));
 assert.ok(raw.includes('RRULE:FREQ=DAILY'));
 assert.ok(raw.includes('BEGIN:VTIMEZONE\r\nTZID:'+s.tz));
 assert.ok(raw.includes('TRIGGER:-PT10M'));
 const result=await handler(new Request('https://itsdebatable.com/api/clash-calendar?session='+s.id));
 assert.equal(result.status,302);
 const url=new URL(result.headers.get('location'));
 assert.equal(url.hostname,'calendar.google.com');
 assert.equal(url.searchParams.get('ctz'),s.tz);
 assert.equal(url.searchParams.get('recur'),'RRULE:FREQ=DAILY');
 assert.match(url.searchParams.get('dates'),/^\d{8}T210000\/\d{8}T223000$/);
}
for(const [tz,day,hour] of [['Europe/London','2026-10-24',20],['Europe/London','2026-10-25',21],['America/New_York','2026-10-31',1],['America/New_York','2026-11-01',2],['Asia/Kolkata','2026-11-01',15]]){
 const [y,m,d]=day.split('-').map(Number);
 assert.equal(new Date(schedule.wallToUtc(y,m,d,21,0,tz)).getUTCHours(),hour,tz+' DST');
}
assert.equal((await handler(new Request('https://itsdebatable.com/api/clash-calendar?session=evil'))).status,404);
assert.equal((await handler(new Request('https://itsdebatable.com/api/clash-calendar?session=india',{method:'POST'}))).status,405);
console.log('Clash calendars: three daily events, stable UIDs, RFC lines, DST, Google fields and endpoint allowlist passed');
