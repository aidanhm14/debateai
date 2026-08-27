#!/usr/bin/env node
// The site does not run abortion or highly triggering motions. This guard
// covers both halves of that promise: seeded/public motion sources stay clean,
// and custom motion entry points use the shared server boundary.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkContent,
  isSensitiveMotion,
  SENSITIVE_MOTION_POLICY,
} from '../app/netlify/functions/lib/content-guard.mjs';
import { DRAFT_MOTIONS } from '../app/netlify/functions/lib/draft-motions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (value, message) => { n++; assert.ok(value, message); };

const blocked = [
  'Abortion should be protected by federal law.',
  'This House opposes terminating a pregnancy.',
  'This House regrets the pro-choice movement.',
  'This House would debate reproductive rights.',
  'This House would change the law on marital rape.',
  'The news should not report on suicides.',
  'This House supports physician-assisted dying.',
  'Schools should teach a unit about child abuse.',
  'This House would ban school shootings through stricter laws.',
  'This House would abolish capital punishment.',
  'This House regrets discourse about ethnic cleansing.',
];

for (const motion of blocked) {
  const result = checkContent({ text: motion, kind: 'motion' });
  ok(!result.ok, 'blocked motion passed: ' + motion);
  ok(result.category === 'sensitive_motion', 'wrong block category: ' + motion);
}

const allowed = [
  'The voting age should be lowered to 16.',
  'This House would require ranked-choice voting in national elections.',
  'Manufacturers should provide replacement parts and repair manuals.',
  'This House regrets the dominance of streaming services in music.',
  'Public transport should be free in major cities.',
  'This House would require police officers to hold professional licenses.',
];

for (const motion of allowed) {
  const result = checkContent({ text: motion, kind: 'motion' });
  ok(result.ok, 'safe motion blocked: ' + motion);
}

Object.entries(DRAFT_MOTIONS).forEach(([format, motions]) => {
  motions.forEach((motion) => {
    ok(!isSensitiveMotion(motion), `sensitive ${format} draft motion: ${motion}`);
  });
});

// These are the active sources that can print, suggest, email, or index a
// motion. Internal moderation dictionaries and the boundary itself are not
// scanned because they must name the categories they refuse.
const PUBLIC_MOTION_SOURCES = [
  'app/index.html',
  'app/landing.html',
  'app/landing-classic.html',
  'app/landing-full.html',
  'app/practice.html',
  'app/newvoice.html',
  'app/voice-debate.html',
  'app/debate-chat.html',
  'app/high-school.html',
  'app/live-round.html',
  'app/debate-topic-generator.html',
  'app/js/domains.js',
  'app/netlify/functions/scheduled-winback.mjs',
  'app/netlify/functions/lib/daily-motion-bank.mjs',
  'app/netlify/functions/lib/debate-bank.mjs',
  'app/netlify/functions/lib/draft-motions.mjs',
  'app/netlify/functions/lib/education-bank.mjs',
  'app/netlify/functions/lib/format-bank.mjs',
  'app/netlify/functions/lib/fundamentals-bank.mjs',
  'app/netlify/functions/lib/guide-bank.mjs',
  'app/netlify/functions/lib/motion-library.mjs',
];

for (const rel of PUBLIC_MOTION_SOURCES) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hits = source.split('\n').filter((line) => isSensitiveMotion(line));
  ok(!hits.length, `${rel} still contains sensitive motions or examples:\n${hits.slice(0, 12).join('\n')}`);
}

const realtime = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/realtime-session.mjs'), 'utf8');
const coach = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/coach-session.mjs'), 'utf8');
const roomJudge = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/room-judge-session.mjs'), 'utf8');
const asyncTurn = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/async-turn.mjs'), 'utf8');
const scheduleRound = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/schedule-round.mjs'), 'utf8');
const tournamentAdmin = fs.readFileSync(path.join(ROOT, 'app/netlify/functions/tournament-admin.mjs'), 'utf8');

ok(SENSITIVE_MOTION_POLICY.includes('SITE MOTION BOUNDARY'), 'voice policy block is missing');
for (const [name, source] of [
  ['realtime-session', realtime],
  ['coach-session', coach],
  ['room-judge-session', roomJudge],
]) {
  ok(source.includes('SENSITIVE_MOTION_POLICY'), name + ' does not carry the spoken-motion boundary');
  ok(source.includes("kind: 'motion'"), name + ' does not reject an initial sensitive motion');
}
for (const [name, source] of [
  ['async-turn', asyncTurn],
  ['schedule-round', scheduleRound],
  ['tournament-admin', tournamentAdmin],
]) {
  ok(source.includes("kind: 'motion'"), name + ' does not guard stored custom motions');
}

console.log(`sensitive-motion guard: ${n} assertions passed`);
