import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicRecordingOverview } from '../app/netlify/functions/lib/recording-overview.mjs';

const fullReason = 'A saved reason with complete evidence. '.repeat(60);
const round = {
  ballot: { winner: 'pro', proPoints: 81.5, conPoints: 72, scoreScale: 100,
    rfd: fullReason, decidingIssue: 'Who bears the cost?',
    dimensions: { reasoning: { pro: 9, con: 7, privateNote: 'secret' }, invented: { pro: 10, con: 1 } },
    privateNote: 'secret', panel: { privateToken: 'secret' } },
  rfdDeep: 'Longer saved explanation.\n\nThe final paragraph survives.',
  speeches: [{ transcript: 'private speech' }], proUid: 'private uid',
};
const ready = publicRecordingOverview(round);
assert.equal(ready.overviewStatus, 'ready');
assert.equal(ready.ballot.rfd, fullReason, 'Reading the reason must not cut it at the old 900-character reveal limit');
assert.equal(ready.ballot.rfdDeep, round.rfdDeep);
assert.equal(ready.ballot.scoreScale, 100);
assert.deepEqual(ready.ballot.dimensions, { reasoning: { pro: 9, con: 7 } });
assert.ok(!JSON.stringify(ready).includes('private'));
assert.ok(!JSON.stringify(ready).includes('secret'));
for (const value of [null, undefined, '', ' ', false, {}, 'NaN']) {
  assert.equal(publicRecordingOverview({ ballot: { winner: 'con', proPoints: value } }).ballot.proPoints, null,
    'Missing scores must never become a zero');
}
assert.equal(publicRecordingOverview({ ballot: { winner: 'pro', proPoints: 0 } }).ballot.proPoints, 0);
assert.deepEqual(publicRecordingOverview({}), { overviewStatus: 'unavailable' });
assert.deepEqual(publicRecordingOverview({ ballotPending: true }), { overviewStatus: 'pending' });
for (const serverJudgeState of ['failed','incomplete']) assert.deepEqual(
  publicRecordingOverview({ballotPending:true,serverJudgeState}),{overviewStatus:'delayed'},
  'A failed judging attempt must not look like ordinary pending work');
const draw = publicRecordingOverview({ serverJudgeState: 'unresolved', ballotUnresolved: {
  outcome: 'no_winner', missing: 0, reason: 'The panel split 2 to 2.', proPoints: 72, conPoints: 74,
  judgeReasons: [{ winner: 'con', rfd: 'Saved disagreement', model: 'private metadata' }],
} });
assert.equal(draw.ballot.winner, null, 'Points must not break the saved tie');
assert.equal(draw.ballot.rfd, 'The panel split 2 to 2.');
assert.equal(draw.ballot.conPoints, 74);
assert.deepEqual(draw.ballot.judgeReasons, [{ winner: 'con', decidingIssue: '', rfd: 'Saved disagreement' }]);
assert.equal(publicRecordingOverview({ serverJudgeState: 'incomplete', ballotPending: true,
  ballotUnresolved: { outcome: 'no_winner', missing: 1 } }).overviewStatus, 'delayed');
const noContest = publicRecordingOverview({ ballotUnresolved: {
  outcome: 'no_contest', reason: 'No captured speech.', proPoints: 90, conPoints: 80,
  dimensions: round.ballot.dimensions,
} });
assert.equal(noContest.ballot.outcome, 'no_contest');
assert.equal(noContest.ballot.proPoints, null);
assert.deepEqual(noContest.ballot.dimensions, {});

// Execute the actual endpoint with database/auth/media boundaries replaced.
// Metadata must work without a Daily key or a sign-in and must respect publication.
const source = readFileSync(new URL('../app/netlify/functions/recordings.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default async (req) =>', 'return async (req) =>')
  .replace(/export const config = \{[\s\S]*$/, '');
let published = true, failJoin = false;
const reads = [];
const db = { collection(name) {
  reads.push(name);
  assert.ok(['recordings', 'live_rounds'].includes(name), 'Never read private judge storage');
  return { doc() { return { async get() {
    if (name === 'recordings') return { exists: true, data: () => ({ published, roomName: 'room-one' }) };
    if (failJoin) throw new Error('offline');
    return { exists: true, data: () => round };
  } }; } };
} };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const makeHandler = new Function('getDb', 'publicHighlights', 'publicRecordingOverview', 'jsonResponse', 'errorResponse', 'extractBearerToken', source);
const handler = makeHandler(() => db, () => [], publicRecordingOverview, json, (message, status) => json({ error: message }, status), () => null);
let response = await handler(new Request('https://example.test/api/recordings?id=recording-one'));
assert.equal(response.status, 200);
assert.equal((await response.json()).recording.ballot.rfd, fullReason);
response = await handler(new Request('https://example.test/api/recordings?id=recording-one&link=1'));
assert.equal(response.status, 401, 'Reading an overview must not unlock video playback');
published = false;
reads.length = 0;
response = await handler(new Request('https://example.test/api/recordings?id=recording-one'));
assert.equal(response.status, 404);
assert.deepEqual(reads, ['recordings'], 'An unpublished recording must not expose its ballot');
published = true; failJoin = true;
response = await handler(new Request('https://example.test/api/recordings?id=recording-one'));
assert.equal(response.status, 200);
assert.equal((await response.json()).recording.overviewStatus, 'error', 'Failure must stay distinct from a missing ballot');
console.log('Recording overview: saved decisions, missing scores, draws, privacy, playback gate and read failures passed.');
