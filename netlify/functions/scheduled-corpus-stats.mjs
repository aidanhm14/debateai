// Nightly aggregation of corpus stats for the public /research page.
// Writes to corpus_stats/latest so the read path (corpus-stats.mjs) can
// serve cached numbers without scanning the generations collection on
// every page load.
//
// Two-tier counting:
//   - Internal corpus = every generation row, used by the learning loop.
//     This is what the per-format distillations + exemplars read from.
//   - Licensable corpus = rows where contributable === true. Only created
//     for accounts that opted in via the profile toggle (added 2026-05-25).
//     This is what /research advertises as the dataset under license terms.
//
// Both numbers shipped because they answer different questions: investors /
// curious public visitors want to see scale (internal); a lab licensing
// lead wants to know the consented subset.

import { getDb } from './lib/firestore.mjs';

// Format slugs we report on; mirrors the FORMATS list in scheduled-distill.
const REPORTED_FORMATS = [
  'apda', 'bp', 'asian', 'worlds', 'pf', 'ld', 'policy',
  'congress', 'mun', 'quickclash', 'viva',
];

// Voice-minute estimate: each voice_round generation logs the round's
// turn-by-turn transcript. We don't store raw audio so duration is
// estimated from turn-count × an empirical avg-turn-seconds. Generous
// rounding down to avoid overstating.
const VOICE_SECS_PER_TURN = 18;

export default async () => {
  if (process.env.NIGHTLY_PAUSED === '1') {
    console.log('[corpus-stats] NIGHTLY_PAUSED=1, skipping run');
    return new Response(JSON.stringify({ ok: true, skipped: 'nightly_paused' }), { status: 200 });
  }
  try {
    const db = getDb();
    const now = new Date();

    // ── 1. count user_profiles with contributeToCorpus = true ──────
    let optInMembers = 0;
    try {
      const optIn = await db.collection('user_profiles')
        .where('contributeToCorpus', '==', true)
        .count().get();
      optInMembers = optIn.data().count || 0;
    } catch (e) {
      console.warn('[corpus-stats] optInMembers count failed:', e.message);
    }

    // ── 2. count generations (internal corpus, all rows) ───────────
    let totalInternalRounds = 0;
    try {
      const all = await db.collection('generations').count().get();
      totalInternalRounds = all.data().count || 0;
    } catch (e) {
      console.warn('[corpus-stats] total count failed:', e.message);
    }

    // ── 3. count generations where contributable = true ────────────
    let totalContributable = 0;
    try {
      const c = await db.collection('generations')
        .where('contributable', '==', true)
        .count().get();
      totalContributable = c.data().count || 0;
    } catch (e) {
      console.warn('[corpus-stats] contributable count failed:', e.message);
    }

    // ── 4. count voice_round generations + estimate voice minutes ──
    let voiceRounds = 0;
    let voiceMinutesEstimate = 0;
    try {
      const v = await db.collection('generations')
        .where('kind', '==', 'voice_round')
        .count().get();
      voiceRounds = v.data().count || 0;
      // Best-effort estimate; the page rounds again so this is approximate.
      voiceMinutesEstimate = Math.round((voiceRounds * 6 * VOICE_SECS_PER_TURN) / 60);
    } catch (e) {
      console.warn('[corpus-stats] voice count failed:', e.message);
    }

    // ── 5. per-format internal counts ──────────────────────────────
    const byFormat = {};
    for (const slug of REPORTED_FORMATS) {
      try {
        const r = await db.collection('generations')
          .where('format', '==', slug)
          .count().get();
        const n = r.data().count || 0;
        if (n > 0) byFormat[slug] = n;
      } catch (e) {
        // Index probably missing for a format slug — skip silently, the
        // page handles missing keys.
      }
    }

    // ── 6. earliest corpus entry (for "tracking since" copy) ───────
    let firstCorpusEntryAt = null;
    try {
      const first = await db.collection('generations')
        .orderBy('createdAt', 'asc').limit(1).get();
      if (!first.empty) {
        const f = first.docs[0].data();
        firstCorpusEntryAt = f.createdAt ? f.createdAt.toDate().toISOString() : null;
      }
    } catch (e) {
      console.warn('[corpus-stats] first entry lookup failed:', e.message);
    }

    // ── 7. distinct languages — sample top-N recent and dedupe ─────
    // Full distinct would scan everything; an N=500 recent sample is
    // representative enough for the page and cheap.
    const langs = new Set();
    try {
      const recent = await db.collection('generations')
        .orderBy('createdAt', 'desc').limit(500).get();
      recent.forEach((doc) => {
        const ctx = doc.data().context || {};
        const lang = (ctx.language || ctx.aiLanguage || '').trim().slice(0, 8).toLowerCase();
        if (lang && /^[a-z]{2}(-[a-z]{2})?$/.test(lang)) langs.add(lang);
      });
    } catch (e) {
      console.warn('[corpus-stats] languages sample failed:', e.message);
    }
    const languages = Array.from(langs).sort();
    if (languages.length === 0) languages.push('en'); // never empty

    // ── 8. write the snapshot ──────────────────────────────────────
    const snapshot = {
      updatedAt: now.toISOString(),
      // Internal (every account, used by the learning loop)
      totalInternalRounds,
      voiceRounds,
      voiceMinutesEstimate,
      byFormat,
      languages,
      firstCorpusEntryAt,
      // Licensable (opt-in only)
      optInMembers,
      totalContributable,
      // Static facts the page also displays
      learningLoopActiveSince: '2026-05-13',
      consentLayerActiveSince: '2026-05-25',
    };

    await db.collection('corpus_stats').doc('latest').set(snapshot, { merge: false });

    console.log('[corpus-stats]', JSON.stringify({
      totalInternalRounds, totalContributable, optInMembers,
      voiceRounds, formats: Object.keys(byFormat).length, langs: languages.length,
    }));

    return new Response(JSON.stringify({ ok: true, snapshot }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[corpus-stats] crashed:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Daily at 04:30 UTC, 30 min after scheduled-distill so distill runs first.
export const config = {
  schedule: '30 4 * * *',
};
