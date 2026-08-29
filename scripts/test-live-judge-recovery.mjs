// Regression coverage for the live-room ballot watchdog. These helpers are
// pure on purpose: recovery authorization and lease timing must stay
// testable without Firestore or provider keys.
import {
  RECOVERY_GRACE_MS,
  JUDGE_LEASE_MS,
  FAILURE_COOLDOWN_MS,
  buildNoWinnerBallot,
  ratingChangesFrom,
  recoveryWaitMs,
  judgeLeaseWaitMs,
} from '../app/netlify/functions/live-judge.mjs';
import { readFileSync } from 'node:fs';

let failures = 0;
function ok(condition, label) {
  if (condition) console.log('  ok', label);
  else { console.error('FAIL', label); failures += 1; }
}

const now = 1_800_000_000_000;
ok(!Number.isFinite(recoveryWaitMs({}, now)), 'a room without ballotPending cannot be recovered');
ok(!Number.isFinite(recoveryWaitMs({ ballotPending: true }, now)), 'a pending room needs a durable timestamp');
ok(
  recoveryWaitMs({ ballotPending: true, ballotPendingAt: now - RECOVERY_GRACE_MS + 2_000 }, now) === 2_000,
  'watchers wait through the recovery grace period',
);
ok(
  recoveryWaitMs({ ballotPending: true, ballotPendingAt: now - RECOVERY_GRACE_MS - 1 }, now) === 0,
  'an abandoned pending ballot becomes recoverable',
);
ok(
  recoveryWaitMs({
    ballotPending: true,
    ballotPendingAt: now - RECOVERY_GRACE_MS - 1,
    serverJudgeFailedAt: now - FAILURE_COOLDOWN_MS + 3_000,
  }, now) === 3_000,
  'a provider failure has a retry cooldown',
);
ok(
  judgeLeaseWaitMs({ serverJudgeState: 'running', serverJudgeStartedAt: now - JUDGE_LEASE_MS + 4_000 }, now) === 4_000,
  'a live server lease blocks duplicate panels',
);
ok(
  judgeLeaseWaitMs({ serverJudgeState: 'running', serverJudgeStartedAt: now - JUDGE_LEASE_MS - 1 }, now) === 0,
  'an expired lease can be recovered',
);
ok(judgeLeaseWaitMs({ serverJudgeState: 'failed' }, now) === 0, 'a failed lease is not permanently locked');

const split = buildNoWinnerBallot({
  ballot: { winner: null, proPoints: 78.5, conPoints: 74 },
  panel: {
    resolution: 'unresolved', votesCast: 2, panelSize: 3, quorum: 2,
    tally: { a: 1, b: 1 },
  },
  jurorResults: [
    {
      ok: true, jurorId: 'anthropic', model: 'claude-test',
      ballot: { winner: 'pro', decidingIssue: 'comparative harm', rfd: 'Pro won the impact comparison.' },
    },
    {
      ok: true, jurorId: 'openai', model: 'gpt-test',
      ballot: { winner: 'con', decidingIssue: 'causal link', rfd: 'Con won on causation.' },
    },
    { ok: false, jurorId: 'google', model: 'gemini-test', error: 'timeout' },
  ],
}, { proName: 'Team Pro', conName: 'Team Con' }, now);
ok(split.outcome === 'no_winner', 'a split is stored as a first-class no-winner outcome');
ok(split.tally.pro === 1 && split.tally.con === 1, 'the no-winner ballot preserves the vote split');
ok(split.missing === 1, 'the no-winner ballot discloses a missing panel seat');
ok(split.reason.includes('split 1 to 1') && split.reason.includes('2 matching votes'), 'the no-winner ballot explains why no verdict carried');
ok(split.judgeReasons.length === 2, 'the no-winner ballot preserves every usable judge reason');
ok(split.judgeReasons[0].decidingIssue === 'comparative harm', 'the deciding issue stays attached to its judge');
ok(split.proPoints === 78.5 && split.conPoints === 74 && split.scoreScale === 100, 'both speaker scores survive a no-winner result');
ok(!JSON.stringify(split).includes('undefined'), 'the no-winner ballot contains no Firestore-breaking undefined values');

const ratingMirror = ratingChangesFrom({ changes: [
  { uid: 'pro-user', delta: 2.4, after: { rating: 1512.4 }, result: 'draw' },
  { uid: 'con-user', delta: -2.4, after: { rating: 1487.6 }, result: 'draw' },
] });
ok(ratingMirror['pro-user'].result === 'draw' && ratingMirror['con-user'].after === 1488, 'both draw-rating deltas are mirrored to the room');

const lone = buildNoWinnerBallot({
  panel: { resolution: 'unresolved', votesCast: 1, panelSize: 3, quorum: 2, tally: { a: 1, b: 0 } },
  jurorResults: [],
}, {}, now);
ok(lone.reason.includes('Only 1 of 3 judges') && lone.reason.includes('2 matching votes'), 'a short panel explains the quorum failure');

const empty = buildNoWinnerBallot({
  panel: { resolution: 'no_votes', votesCast: 0, panelSize: 3, quorum: 2, tally: { a: 0, b: 0 } },
  jurorResults: [],
}, {}, now);
ok(empty.reason.includes('No judge returned a usable vote'), 'a no-vote panel explains the provider failure plainly');

const evenQuorate = buildNoWinnerBallot({
  panel: { resolution: 'unresolved', votesCast: 4, panelSize: 4, quorum: 2, tally: { a: 2, b: 2 } },
  jurorResults: [],
}, {}, now);
ok(evenQuorate.reason.includes('split 2 to 2') && evenQuorate.reason.includes('strict majority'), 'a quorate even panel explains that matching votes still did not carry');

const appCheckSource = readFileSync(new URL('../app/js/app-check.js', import.meta.url), 'utf8');
const liveRoundSource = readFileSync(new URL('../app/live-round.html', import.meta.url), 'utf8');
const gatedBlock = appCheckSource.match(/var GATED = \[([\s\S]*?)\];/);
const authBlock = appCheckSource.match(/var AUTH_ROUTES = \[([\s\S]*?)\];/);
ok(gatedBlock && gatedBlock[1].includes("'/api/live-judge'"), 'live judge always mints an App Check token');
ok(authBlock && authBlock[1].includes("'/api/live-judge'"), 'live judge always carries the Firebase caller token');
ok(
  /function generateBallot\(attempt\)\{[\s\S]{0,500}if \(isSpectator\(\)\) return;/.test(liveRoundSource),
  'spectators never enter the participant-authored fallback judge',
);
ok(liveRoundSource.includes('The ladder records a draw'), 'the no-winner screen discloses its ladder treatment');
ok(/d\.ballot \|\| d\.ballotUnresolved \|\| state\.lastBallot/.test(liveRoundSource), 'no-winner speaker points feed each participant record');

if (failures) {
  console.error(`test-live-judge-recovery: ${failures} failure(s)`);
  process.exit(1);
}
console.log('test-live-judge-recovery: all assertions passed');
