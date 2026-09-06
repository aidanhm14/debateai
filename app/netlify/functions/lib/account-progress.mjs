import { AggregateField } from '@google-cloud/firestore';
import { withDeadline } from './firestore.mjs';

// One aggregate over the complete account history. Do not derive lifetime
// XP from a leaderboard page or a limited list of recent rounds.
export function progressFromAggregate(data) {
  return { xp: Number.isFinite(data?.points) ? Math.max(0, Math.round(data.points)) : 0 };
}

export async function fetchAccountProgress(db, uid) {
  const history = db.collection('leaderboard_entries').where('uid', '==', uid);
  try {
    const snap = await withDeadline(history.orderBy('score', 'desc')
      .aggregate({ points: AggregateField.sum('score') }).get(), 2500);
    return progressFromAggregate(snap.data());
  } catch (error) {
    // An index still building or an unavailable aggregation transport must
    // not erase XP. A uid-only projection uses the automatic single-field
    // index and reads scores only, with no history truncation. Public board
    // callers cache the result, so this fallback is not a per-visitor scan.
    console.warn('[account-progress] aggregate fallback', error?.code || error?.name || 'unavailable');
    const snap = await withDeadline(history.select('score').get(), 2500);
    let points = 0;
    snap.forEach(doc => { const score = doc.data()?.score; if (Number.isFinite(score)) points += score; });
    return progressFromAggregate({ points });
  }
}
