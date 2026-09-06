import { AggregateField } from '@google-cloud/firestore';
import { withDeadline } from './firestore.mjs';

// One aggregate over the complete account history. Do not derive lifetime
// XP from a leaderboard page or a limited list of recent rounds.
export function progressFromAggregate(data) {
  return { xp: Number.isFinite(data?.points) ? Math.max(0, Math.round(data.points)) : 0 };
}

export async function fetchAccountProgress(db, uid) {
  const snap = await withDeadline(db.collection('leaderboard_entries')
    .where('uid', '==', uid)
    .orderBy('score', 'desc')
    .aggregate({ points: AggregateField.sum('score') }).get(), 2500);
  return progressFromAggregate(snap.data());
}
