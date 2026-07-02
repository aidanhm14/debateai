// ─────────────────────────────────────────────────────────────
// Scheduled: keep the AI-vs-AI market inventory full so the board is
// never empty (the cold-start backbone), and keep one featured "main
// event" running. Runs every 5 minutes. Creates floor_markets docs
// with a server-anchored timeline. Play credits only.
// ─────────────────────────────────────────────────────────────
import { getDb } from './lib/firestore.mjs';
import { FLOOR, makeMarketData } from './lib/floor.mjs';

export default async () => {
  const stats = { aiActive: 0, featuredActive: 0, created: 0 };
  try {
    const db = getDb();
    const now = Date.now();

    // active markets = those whose round has not yet ended
    const snap = await db.collection('floor_markets').where('resolveAt', '>', now).limit(60).get();
    for (const doc of snap.docs) {
      const m = doc.data();
      if (m.settled) continue;
      if (m.kind === 'featured') stats.featuredActive++;
      else stats.aiActive++;
    }

    const batch = db.batch();
    let toCreate = 0;

    for (let i = stats.aiActive; i < FLOOR.AI_MARKETS; i++) {
      const ref = db.collection('floor_markets').doc();
      batch.set(ref, makeMarketData('ai', now));
      toCreate++;
    }
    if (stats.featuredActive < 1) {
      const ref = db.collection('floor_markets').doc();
      batch.set(ref, makeMarketData('featured', now));
      toCreate++;
    }

    if (toCreate > 0) await batch.commit();
    stats.created = toCreate;

    console.log('[floor-seed]', JSON.stringify(stats));
    return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[floor-seed] fatal', err);
    return new Response('error', { status: 500 });
  }
};

export const config = {
  schedule: '*/5 * * * *', // every 5 minutes
};
