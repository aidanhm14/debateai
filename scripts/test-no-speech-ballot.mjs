import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import vm from 'node:vm';
import RoundEvidence from '../app/js/round-evidence.js';
import { eligibility } from '../app/netlify/functions/lib/rating-apply.mjs';
import { fromRound } from '../app/netlify/functions/lib/judgment.mjs';

const speech = (side, text, extra = {}) => ({ side, text, ...extra });
const valid = { format: 'quick', speeches: [speech('pro', 'Buses reduce traffic.'), speech('con', 'Cars reach more places.')] };
const conversation = { format: 'open', speeches: [speech('pro', 'Jonas (Pro): Buses reduce traffic.\n\nIris (Con): Cars reach more places.', { open: true })] };
const emptyRounds = [
  {}, { speeches: [] }, { speeches: [null, {}, speech('pro', ''), speech('con', ' \n ')] },
  { speeches: [speech('pro', '(no transcript)'), speech('con', '(skipped)')] },
  { speeches: [speech('pro', '[silence]'), speech('con', '[inaudible]')] },
  { speeches: [speech('pro', '...', { durationSec: 300 }), speech('con', '?!')] },
  { speeches: valid.speeches.map(s => ({ ...s, skipped: true })) },
  { speeches: [speech('pro', 'Buses reduce traffic.'), speech('pro', 'They carry more people.')] },
  { format: 'open', speeches: [speech('pro', 'Jonas (Pro):\n\nIris (Con):')] },
  { format: 'open', speeches: [speech('pro', 'Jonas (Pro): (no transcript)\nIris (Con): (skipped)')] },
  { format: 'open', speeches: [speech('pro', 'Jonas (Pro):\nGuest (Audience): I have lots to say.\nIris (Con): Hello.')] },
  { speeches: [speech('pro', '[TIME EXPIRED]\nOnly overtime.'), speech('con', '(no transcript)')] },
];
for (const round of emptyRounds) {
  assert.equal(RoundEvidence.assess(round).ok, false, JSON.stringify(round));
  const noWinner = RoundEvidence.noContest(round, 123);
  assert.equal(noWinner.winner, null);
  assert.equal(noWinner.outcome, 'no_contest');
  assert.equal('proPoints' in noWinner, false);
  // A winner supplied by an old browser must not sneak into either ledger.
  const forged = { ...round, proUid: 'p', conUid: 'c', ballot: { winner: 'con', proPoints: 25, conPoints: 25 } };
  assert.equal(eligibility('live', forged).ok, false);
  assert.equal(fromRound('live', 'empty', forged).ok, false);
}
for (const round of [valid, conversation, { ...conversation, format: 'conversation' },
  { speeches: [speech('pro', '是'), speech('con', 'لا')] }]) {
  assert.equal(RoundEvidence.assess(round).ok, true);
  const scored = { ...round, proUid: 'p', conUid: 'c', ballot: { winner: 'pro' } };
  assert.equal(eligibility('live', scored).ok, true);
  assert.equal(fromRound('live', 'real', scored).ok, true);
}
const draw = { ...valid, proUid: 'p', conUid: 'c', serverJudgeState: 'unresolved', ballotUnresolved: { outcome: 'no_winner' } };
assert.equal(eligibility('live', draw).outcome, 'draw');
assert.equal(eligibility('live', { ...draw, speeches: [] }).ok, false);

// Run the real client fallback and renderer. No network, billing or browser
// writes are allowed to produce a ballot from missing evidence.
const page = readFileSync('app/live-round.html', 'utf8');
function fn(name) {
  const start = page.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = page.indexOf('\n  }\n', start + 1);
  assert.ok(end > start, name + ' closes');
  return page.slice(start, end + 4);
}
const nodes = {};
const node = id => nodes[id] ||= { innerHTML: '', classList: { add(){}, remove(){} } };
let writes = [], fetches = 0;
const client = { liveJourney(){}, RoundEvidence, state: { log: [], formatKey: 'quick', serverJudgeTried: true, audienceEvals: [], room: 'test' },
  ballotLoadingHTML: '', firebaseDb: null, $: node, escHtml: s => String(s).replaceAll('<', '&lt;'),
  isSpectator: () => false, clearBallotRecovery(){}, updateRoundGuide(){}, stopBallotWaitCue(){},
  capFinish(){}, endRecordingAfterReactions(){}, renderRecTail(){},
  getRoundDocRef: () => ({ update: async v => { writes.push(v); } }),
  firebase: { firestore: { FieldValue: { delete: () => null, serverTimestamp: () => 123 } } },
  fetch: async () => { fetches++; throw Error('An empty round reached a provider'); }, console,
};
vm.createContext(client);
for (const name of ['localRoundEvidence', 'renderUnresolvedBallot', 'generateBallot', 'renderBallot', 'publishBallot', 'validateLeaderboardEligibility']) vm.runInContext(fn(name), client);
client.generateBallot();
assert.equal(fetches, 0);
assert.equal(writes[0].ballotUnresolved.outcome, 'no_contest');
assert.equal(writes[0].ballotPending, false);
assert.match(node('ballotLoading').innerHTML, /No winner/);
assert.match(node('ballotLoading').innerHTML, /No scores, wins, losses or rating changes/);
assert.doesNotMatch(node('ballotLoading').innerHTML, /wins<|25|ladder records a draw/);
client.renderBallot({ winner: 'con', proPoints: 25, conPoints: 25 });
client.publishBallot({ winner: 'con' });
assert.equal(writes.length, 1);
assert.equal(client.state.lastBallot, null);
assert.equal(client.validateLeaderboardEligibility().ok, false);
// The exact server rejection that formerly triggered a second judge.
client.state = { log: [], formatKey: 'quick', audienceEvals: [], user: { getIdToken: async () => 'p' } };
client.ballotStatus = () => {};
client.handlePrivateJudgeAccess = () => false;
client.fetch = async () => ({ json: async () => ({ code: 'no_transcript' }) });
client.generateBallot();
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(client.state.ballotUnresolved.outcome, 'no_contest');

// Run the real live-judge handler with controlled I/O. Assert the durable
// terminal state, idempotency, watcher gate and absence of paid/model work.
const records = new Map();
let panels = 0, meters = 0, swapBeforeTransaction;
const ref = path => ({ path, get: async () => ({ exists: records.has(path), data: () => structuredClone(records.get(path)) }),
  update: async v => records.set(path, { ...records.get(path), ...structuredClone(v) }) });
const db = { collection: c => ({ doc: id => ref(c + '/' + id) }), async runTransaction(run) {
  if (swapBeforeTransaction) { swapBeforeTransaction(); swapBeforeTransaction = null; }
  return run({ get: r => r.get(), update: (r, v) => records.set(r.path, { ...records.get(r.path), ...structuredClone(v) }) });
} };
globalThis.__noSpeechTest = { db, panel: () => { panels++; throw Error('test panel reached'); }, meter: () => { meters++; throw Error('No speech cannot consume judging'); } };
const hooks = registerHooks({ load(url, context, next) {
  const mocks = {
    'firestore.mjs': 'export const getDb=()=>globalThis.__noSpeechTest.db; export const FieldValue={delete:()=>null,serverTimestamp:()=>123,increment:n=>n};',
    'auth.mjs': 'export const extractBearerToken=r=>r.headers.get("authorization"); export const verifyIdToken=async t=>({sub:t}); export const isNamedAccount=()=>true;',
    'appcheck.mjs': 'export const checkAppCheck=async()=>({ok:true});',
    'rate-limit.mjs': 'export const callerIp=()=>"test"; export const checkLayers=async()=>({ok:true});',
    'judge-run.mjs': 'export const runPanel=async()=>globalThis.__noSpeechTest.panel();',
    'judge-audit.mjs': 'export const auditRecord=x=>x;export const writeAudit=async()=>{};',
    'settle.mjs': 'export const settleMarket=async()=>{};',
    'tournament-round.mjs': 'export const verifyTournamentPairing=async()=>null;',
    'tournament-ledger.mjs': 'export const applyTournamentResult=async()=>null;',
    'private-judging.mjs': 'export const isPrivateJudgingRound=room=>!room.startsWith("real-");export const privateJudgeKey=s=>s;export const privateJudgeAccounts=async()=>globalThis.__noSpeechTest.meter();export const reservePrivateJudgment=async()=>globalThis.__noSpeechTest.meter();export const finishPrivateJudgment=async()=>{};',
  };
  const name = Object.keys(mocks).find(n => url.endsWith('/lib/' + n));
  return name ? { format: 'module', shortCircuit: true, source: mocks[name] } : next(url, context);
} });
const { default: judge } = await import('../app/netlify/functions/live-judge.mjs');
const call = async (id, uid = 'p') => {
  const response = await judge(new Request('https://itsdebatable.com/api/live-judge', {
    method: 'POST', headers: { authorization: uid, 'content-type': 'application/json' }, body: JSON.stringify({ room: id }),
  }), {});
  return { status: response.status, body: await response.json() };
};
for (const [i, round] of emptyRounds.entries()) {
  const id = 'empty-' + i;
  records.set('live_rounds/' + id, { ...round, proUid: 'p', conUid: 'c', ballotPending: true });
  const result = await call(id);
  assert.equal(result.body.code, 'no_contest');
  assert.equal(records.get('live_rounds/' + id).ballotPending, false);
  assert.equal(records.get('live_rounds/' + id).ballot, null);
  assert.equal((await call(id)).body.already, true);
}
records.set('live_rounds/watcher', { proUid: 'p', conUid: 'c', speeches: [] });
assert.equal((await call('watcher', 'stranger')).status, 403);
assert.equal(records.get('live_rounds/watcher').ballotUnresolved, undefined);
records.set('live_rounds/race', { proUid: 'p', conUid: 'c', speeches: [] });
swapBeforeTransaction = () => records.set('live_rounds/race', { ...valid, proUid: 'p', conUid: 'c' });
assert.equal((await call('race')).body.code, 'PLAN_CHECK_UNAVAILABLE', 'fresh speech must not be overwritten by a stale empty snapshot');
assert.equal(records.get('live_rounds/race').ballotUnresolved, undefined);
assert.equal(panels, 0);
assert.equal(meters, 0);
assert.equal([...records.keys()].every(k => k.startsWith('live_rounds/')), true, 'no judgment, rating or billing rows');
for (const [i, round] of [valid, conversation].entries()) {
  records.set('live_rounds/real-' + i, { ...round, proUid: 'p', conUid: 'c' });
  assert.equal((await call('real-' + i)).body.code, 'judge_failed', 'real speech reaches the deliberately failing test panel');
}
assert.equal(panels, 2, 'both timed and single-entry conversation rounds reach judging');
hooks.deregister();
delete globalThis.__noSpeechTest;
console.log('No-speech ballots: evidence, ledgers, browser fallback/render, server termination, retries and transaction race passed.');
