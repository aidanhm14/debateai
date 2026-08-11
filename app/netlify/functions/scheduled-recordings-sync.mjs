// Pull finished Daily recordings into the Watch and clipping index.
// syncFromDaily enforces the all-party consent gate for debate rounds;
// this schedule only removes the old manual "Sync Daily" step.

import { getDb } from './lib/firestore.mjs';
import { syncFromDaily } from './recordings-admin.mjs';

export default async () => {
  if (!process.env.DAILY_API_KEY){
    console.warn('[recordings-sync] DAILY_API_KEY not configured');
    return;
  }
  try {
    const result = await syncFromDaily(getDb(), 30);
    console.log('[recordings-sync]', JSON.stringify(result));
  } catch (error) {
    console.error('[recordings-sync] failed:', error?.message || error);
  }
};

export const config = { schedule: '*/5 * * * *' };
