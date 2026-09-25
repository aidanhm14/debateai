import assert from 'node:assert/strict';
import {cohort,payload,CAMPAIGN} from '../app/netlify/functions/lib/clash-calendar-email.mjs';
process.env.EMAIL_UNSUB_SECRET='test-only';
const accounts=[{uid:'a',email:'same@example.org',emailVerified:false},{uid:'b',email:'SAME@example.org',emailVerified:true},{uid:'c',email:'guest@example.org',emailVerified:false}];
let r=cohort(accounts,new Map());assert.equal(r.recipients.length,1);assert.equal(r.recipients[0].uid,'b');assert.equal(r.skipped.unverified,1);
assert.equal(cohort(accounts,new Map([['a',{emailOptOut:true}]])).recipients.length,0,'duplicate opt-out applies to address');
assert.equal(cohort(accounts.map(u=>({...u,disabled:true})),new Map()).recipients.length,0);
const p=payload(r.recipients[0]);assert.equal(p.to.length,1);assert.match(p.text,/https:\/\/itsdebatable.com\/clash-hours/);assert.match(p.text,/9pm India/);assert.match(p.text,/9pm London/);assert.match(p.text,/9pm Eastern/);assert.doesNotMatch(p.text,/Sydney|—/);assert.equal(p.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.equal(CAMPAIGN,'clash-calendar-2026-09-25');
console.log('Calendar invitation: verified members, duplicate suppression, opt-outs, individual envelopes, calendar links passed');
