// Key-moment generation sweep. Finds published recordings that have no
// highlights answer yet and nudges /api/recording-highlights for ONE of
// them per run.
//
// Deliberately its own cron rather than a rider on scheduled-recordings-
// sync: the sync already spends its execution budget on the Daily list
// plus up to three thumbnail warms, and a highlight pass is a ~5-20s
// model call. Riding along would put the whole sync at the ~26s
// execution wall (see the Netlify function time budget note), where a
// timeout kills the SYNC — the thing that publishes recordings at all.
//
// One per run at */15 means a fresh replay has its moments within 15
// minutes and a cold backfill drains at ~4/hour, both fine: nobody is
// waiting on this, and each pass is one Sonnet call.
//
// The candidate scan is one bounded read (newest 60, filtered in code),
// because Firestore cannot query for a MISSING field — the existence-
// query trap — so `highlightsStatus == null` is checked client-side.

import { getDb } from './lib/firestore.mjs';

const SITE = 'https://itsdebatable.com';

export default async () => {
  const db = getDb();
  let candidate = null;
  try {
    const snap = await db.collection('recordings')
      .orderBy('startTs', 'desc')
      .limit(60)
      .get();
    for (const doc of snap.docs){
      const d = doc.data() || {};
      if (d.published !== true || d.teaser === true) continue;
      if (d.highlightsStatus === 'done' || d.highlightsStatus === 'none') continue;
      candidate = doc.id;
      break;
    }
  } catch (e) {
    console.error('[scheduled-highlights] scan failed:', e?.message || e);
    return;
  }
  if (!candidate){
    return;   // everything published has an answer; the common steady state
  }
  try {
    const r = await fetch(SITE + '/api/recording-highlights?id=' + encodeURIComponent(candidate), {
      headers: { 'user-agent': 'debatable-highlights-sweep' },
    });
    const body = await r.json().catch(() => null);
    console.log('[scheduled-highlights]', candidate, r.status, body && body.status,
      body && Array.isArray(body.highlights) ? body.highlights.length + ' moments' : '');
  } catch (e) {
    console.warn('[scheduled-highlights] nudge failed for', candidate, e?.message || e);
  }
};

// */15 offset from the recordings sync (also */15) only by luck of cold
// starts; the order does not matter, since a recording the sync has not
// published yet is simply not a candidate until the next pass.
export const config = { schedule: '7,22,37,52 * * * *' };
