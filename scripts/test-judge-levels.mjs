// The three visible live-round judge types must be identical in the
// browser and the server-written ballot path.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JUDGE_LEVELS,
  agreedJudgeLevel,
  agreedJudgeLevelBlock,
} from '../app/netlify/functions/lib/judge-levels.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function assert(ok, message) {
  if (ok) return;
  failures++;
  console.error('FAIL: ' + message);
}

const source = readFileSync(join(root, 'app/js/judge-lenses.js'), 'utf8');
const liveRoundSource = readFileSync(join(root, 'app/live-round.html'), 'utf8');
const sparSource = readFileSync(join(root, 'app/spar.html'), 'utf8');
const liveJudgeSource = readFileSync(join(root, 'app/netlify/functions/live-judge.mjs'), 'utf8');
const browser = {};
new Function('window', source)(browser);
const client = browser.JUDGE_LENSES || [];
const expected = ['lay', 'chair', 'tech'];

assert(client.length === 3, `browser exposes exactly three judge types, got ${client.length}`);
assert(client.map((x) => x.key).join(',') === expected.join(','), 'browser order is Casual viewer, Standard, Experienced');
assert(Object.keys(JUDGE_LEVELS).join(',') === expected.join(','), 'server exposes the same three keys');

for (const level of client) {
  const server = JUDGE_LEVELS[level.key];
  assert(!!server, `server has ${level.key}`);
  if (!server) continue;
  assert(server.name === level.name, `${level.key} name matches client and server`);
  assert(server.lens === level.lens, `${level.key} instruction matches client and server`);
}

assert(agreedJudgeLevel({ pro: 'lay', con: 'lay' }).key === 'lay', 'matching casual picks resolve to casual');
assert(agreedJudgeLevel({ pro: 'tech', con: 'tech' }).key === 'tech', 'matching experienced picks resolve to experienced');
assert(agreedJudgeLevel({ pro: 'lay', con: 'tech' }).key === 'chair', 'split picks cannot steer the server and fall back to standard');
assert(agreedJudgeLevel({ pro: 'old-lens', con: 'old-lens' }).key === 'chair', 'retired keys fall back to standard');
assert(agreedJudgeLevelBlock({ pro: 'chair', con: 'chair' }) === '', 'standard adds no hidden special instruction');
assert(/Casual viewer/.test(agreedJudgeLevelBlock({ pro: 'lay', con: 'lay' })), 'casual reaches the server prompt');
assert(/Experienced/.test(agreedJudgeLevelBlock({ pro: 'tech', con: 'tech' })), 'experienced reaches the server prompt');

assert(!/judge-roster\.js/.test(liveRoundSource), 'live round no longer assigns a separate random judge persona');
assert(!/assignedJudge|assignedParadigmBlock/.test(liveRoundSource), 'live round has no hidden assigned-judge path');
assert(/insertBefore\(el, motionBar\.nextSibling\)/.test(liveRoundSource), 'in-round judge types sit directly below the resolution');
assert(/id="setupJudgeTypes"/.test(liveRoundSource), 'direct round setup shows judge types before the round');
assert(/judgePicks: state\.judgePicks/.test(liveRoundSource), 'direct round setup publishes its judge type');
assert(/agreedJudgeLevelBlock\(d\.judgePicks\)/.test(liveJudgeSource), 'server ballot applies the agreed visible judge type');
assert(!/assignedParadigmBlock/.test(liveJudgeSource), 'server ballot no longer uses a separate assigned persona');
assert((sparSource.match(/id="lensStrip"/g) || []).length === 1, 'spar exposes one judge-type selector');
assert(!/var JUDGE_PRESETS\s*=/.test(sparSource), 'spar no longer exposes the retired preset list');

for (const level of client) {
  const strings = [level.name, level.tag, level.lens]
    .concat(level.bullets || [])
    .concat(level.note || [])
    .concat((level.inPractice || []).map((row) => row.k + ' ' + row.v));
  assert(!strings.some((s) => /—/.test(String(s))), `${level.key} user copy has no em dash`);
}

if (failures) {
  console.error(`test-judge-levels: ${failures} failure(s)`);
  process.exit(1);
}
console.log('test-judge-levels: all assertions passed');
