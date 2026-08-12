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

// Every 15 minutes, not every 5. At */5 this ran 8,640 times a month and
// called the Daily API every time; measured 2026-08-12 it was finding
// nothing on every single run, because the site has zero recordings and
// has never been live. That is the exact shape the 2026-05-18 credit
// audit deleted scheduled-keepalive over and dropped kickoff-reminder to
// */15 for, and this cron shipped after that audit without inheriting it.
//
// */15 matches the two sibling operational crons (kickoff-reminder,
// spar-reaper) and costs 2,880 a month instead of 8,640. The trade is up
// to 15 minutes before a finished recording appears in the Watch index,
// which nobody is waiting on: this schedule only replaced a manual step,
// and the "Sync Daily" button on /admin still forces it immediately for
// anyone who just streamed and wants the replay now.
export const config = { schedule: '*/15 * * * *' };
