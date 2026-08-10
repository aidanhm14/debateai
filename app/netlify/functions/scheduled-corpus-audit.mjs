// Nightly integrity audit of the licensable corpus.
//
// log-generation stamps `contributable` at write time after re-checking
// the contributor's profile, so a row is clean when it lands. This cron
// is the continuous half of that promise: it re-verifies every
// contributable row against the invariants that make the corpus
// licensable at all, and QUARANTINES violations (contributable -> false)
// rather than just reporting them. Quarantine only ever removes rows
// from the corpus, never adds, so a false positive is cheap and a false
// negative is the thing this exists to prevent.
//
// Invariants enforced:
//   - no anonymous rows (anonymous traffic is never licensed)
//   - every contributor's profile carries corpusAgeAttested === true.
//     Minors' rounds are never licensable; if the attestation is missing
//     NOW (profile deleted, attestation withdrawn, or a write that
//     predates the server re-check), the row leaves the corpus. When we
//     cannot prove 18+, the row is out.
//
// Reported but NOT quarantined:
//   - contributors who later turned the opt-in off. Consent is stamped
//     at write time (privacy §7: rounds already in the corpus under a
//     prior consent stay subject to it), so these rows remain valid;
//     the count is surfaced so the number is known, not discovered.
//
// BYOK rounds are excluded at capture time by the client (the server
// cannot see routing), so they are outside what this audit can verify.
//
// Writes corpus_audit/latest (dashboard read) + one corpus_audit_runs
// row per night (history).

import { getDb, FieldValue } from './lib/firestore.mjs';

const PAGE_SIZE = 400;
const MAX_ROWS = 4000; // far above today's corpus; raise when it matters

export default async () => {
  if (process.env.NIGHTLY_PAUSED === '1') {
    console.log('[corpus-audit] NIGHTLY_PAUSED=1, skipping run');
    return new Response(JSON.stringify({ ok: true, skipped: 'nightly_paused' }), { status: 200 });
  }
  const startedAt = new Date();
  try {
    const db = getDb();

    // ── 1. page through contributable rows ─────────────────────────
    const rows = []; // { ref, uid, anonymous }
    let cursor = null;
    while (rows.length < MAX_ROWS) {
      let q = db.collection('generations')
        .where('contributable', '==', true)
        .orderBy('createdAt', 'asc')
        .select('uid', 'anonymous', 'authProvider', 'kind')
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const d = doc.data();
        rows.push({ ref: doc.ref, uid: d.uid || '', anonymous: d.anonymous === true || d.authProvider === 'anonymous' || d.authProvider === 'anonymous_session', kind: d.kind || '' });
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }

    // ── 2. batch-read contributor profiles ─────────────────────────
    const uids = [...new Set(rows.filter((r) => !r.anonymous && r.uid).map((r) => r.uid))];
    const profiles = new Map();
    for (let i = 0; i < uids.length; i += 100) {
      const refs = uids.slice(i, i + 100).map((u) => db.collection('user_profiles').doc(u));
      const snaps = await db.getAll(...refs);
      for (const s of snaps) profiles.set(s.id, s.exists ? s.data() : null);
    }

    // ── 3. classify ────────────────────────────────────────────────
    const quarantine = []; // { ref, reason }
    let revokedLaterRows = 0;
    const revokedUids = new Set();
    for (const r of rows) {
      if (r.anonymous) { quarantine.push({ ref: r.ref, reason: 'anonymous_row' }); continue; }
      const p = profiles.get(r.uid);
      if (!p || p.corpusAgeAttested !== true) {
        quarantine.push({ ref: r.ref, reason: 'age_unattested' });
        continue;
      }
      if (p.contributeToCorpus !== true) {
        revokedLaterRows += 1;
        revokedUids.add(r.uid);
      }
    }

    // ── 4. quarantine violations ───────────────────────────────────
    const byReason = {};
    for (let i = 0; i < quarantine.length; i += PAGE_SIZE) {
      const batch = db.batch();
      for (const { ref, reason } of quarantine.slice(i, i + PAGE_SIZE)) {
        byReason[reason] = (byReason[reason] || 0) + 1;
        batch.update(ref, {
          contributable: false,
          corpusQuarantineReason: reason,
          corpusQuarantinedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // ── 5. record the run ──────────────────────────────────────────
    const summary = {
      ranAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      scanned: rows.length,
      truncated: rows.length >= MAX_ROWS,
      distinctContributors: uids.length,
      quarantined: quarantine.length,
      quarantinedByReason: byReason,
      revokedLaterRows,
      revokedLaterContributors: revokedUids.size,
      clean: rows.length - quarantine.length,
    };
    await db.collection('corpus_audit').doc('latest').set(summary, { merge: false });
    await db.collection('corpus_audit_runs').add({ ...summary, createdAt: FieldValue.serverTimestamp() });

    console.log('[corpus-audit]', JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[corpus-audit] crashed:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Nightly at 05:00 UTC — after scheduled-corpus-stats (04:30) so the
// stats snapshot reflects the pre-audit state and the audit result is
// the freshest word on corpus health.
export const config = {
  schedule: '0 5 * * *',
};
