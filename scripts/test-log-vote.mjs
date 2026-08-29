#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fn = read('app/netlify/functions/log-vote.mjs');
const client = read('app/js/vote-collector.js');
const writeStart = fn.indexOf('await voteRef.set(');
const writeEnd = writeStart === -1 ? -1 : fn.indexOf('\n    });', writeStart);
const writeCall = writeStart === -1 || writeEnd === -1 ? '' : fn.slice(writeStart, writeEnd);

let failures = 0;
function check(ok, message) {
  if (ok) return;
  failures += 1;
  console.error(`FAIL log-vote: ${message}`);
}

check(client.includes("fetch('/api/log-vote'"), 'client and function must share /api/log-vote');
check(fn.includes("export const config = { path: '/api/log-vote' };"), 'function must declare its public Netlify path');
check(/await voteRef\.set\(\{[\s\S]*?trustWeight,\s*\}\);/.test(fn), 'Firestore set must receive one data object');
check(writeCall && !/\b200\b|\breq\b/.test(writeCall), 'HTTP response arguments must never be passed to Firestore set');
check(fn.includes('const clientIp = callerIp(req);'), 'stored clustering IP must use the trusted callerIp resolver');

if (failures) process.exit(1);
console.log('log-vote route: all checks passed');
