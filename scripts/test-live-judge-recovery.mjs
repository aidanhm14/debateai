// Regression coverage for the live-room ballot watchdog. These helpers are
// pure on purpose: recovery authorization and lease timing must stay
// testable without Firestore or provider keys.
import {
  RECOVERY_GRACE_MS,
  JUDGE_LEASE_MS,
  FAILURE_COOLDOWN_MS,
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

if (failures) {
  console.error(`test-live-judge-recovery: ${failures} failure(s)`);
  process.exit(1);
}
console.log('test-live-judge-recovery: all assertions passed');
