import { getDb, FieldPath } from './lib/firestore.mjs';
import judgeHandler, { isInternalJudgeCall } from './live-judge.mjs';
import { createRecoveryQueue } from './lib/ballot-recovery.mjs';

export default async request => {
  // Background endpoints acknowledge with 202 before executing. Reject
  // unauthorized payloads here before reading the database or spending.
  if (request.method !== 'POST' || !isInternalJudgeCall(request)) return;
  let job;
  try { job = await request.json(); } catch { return; }
  if (!job || typeof job !== 'object') return;
  const queue = createRecoveryQueue({ db: getDb(), documentId: FieldPath.documentId() });
  const result = await queue.run(job, judgeHandler);
  console.log('[ballot-recovery]', JSON.stringify(result));
};

export const config = { background: true };
