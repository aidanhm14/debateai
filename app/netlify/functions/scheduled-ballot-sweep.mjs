import { getDb, FieldPath } from './lib/firestore.mjs';
import { createRecoveryQueue } from './lib/ballot-recovery.mjs';

// Scheduled functions have only 30 seconds. They dispatch bounded work;
// only ballot-recovery-background runs the patient judge in-process.
export default async () => {
  const secret = String(process.env.INTERNAL_JUDGE_KEY || '');
  if (secret.length < 16) {
    console.warn('[ballot-sweep] internal key unavailable, recovery disabled');
    return new Response('disabled', { status: 200 });
  }
  const origin = process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://itsdebatable.com';
  const endpoint = new URL('/.netlify/functions/ballot-recovery-background', origin);
  const queue = createRecoveryQueue({ db: getDb(), documentId: FieldPath.documentId() });
  const result = await queue.dispatch(async job => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-judge-key': secret },
      body: JSON.stringify(job), signal: AbortSignal.timeout(8_000), redirect: 'error',
    });
    if (response.status !== 202) throw new Error('Background invocation rejected');
  });
  console.log('[ballot-sweep]', JSON.stringify(result));
  return new Response('ok', { status: 200 });
};

export const config = { schedule: '* * * * *' };
