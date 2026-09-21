import { getDb } from './lib/firestore.mjs';
import { getAuthUserByUid } from './lib/auth-admin.mjs';
import { welcomeReady } from './lib/welcome-email.mjs';
import { runWelcomeQueue } from './lib/welcome-queue.mjs';

export default async () => {
  if (process.env.WELCOME_SWEEP_ENABLED === '0' || !welcomeReady()) {
    return Response.json({ skipped: 'disabled' });
  }
  try {
    const tally = await runWelcomeQueue({ db: getDb(), lookupUser: getAuthUserByUid });
    console.log('[welcome-queue]', JSON.stringify(tally));
    return Response.json(tally);
  } catch {
    console.error('[welcome-queue] due-job query failed');
    return Response.json({ error: 'queue_failed' }, { status: 502 });
  }
};

export const config = { schedule: '* * * * *' };
