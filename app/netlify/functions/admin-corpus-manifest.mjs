// Admin-only corpus datasheet: one call that returns everything a
// licensing conversation needs, with every number queryable rather than
// remembered. Pairs with /api/admin/corpus-export (the rows themselves);
// this is the cover sheet.
//
// Contents:
//   - policy: consent model, policy version, age gate, exclusions
//   - schema: the exact export allowlists (imported from the same module
//     the exporter enforces, so this cannot drift from reality)
//   - counts: licensable rows, by kind / format, consent-ledger volume
//   - audit: the latest nightly integrity-audit result
//   - provenance: which kinds are human-authored vs model output
//
// Truth-audit posture: this endpoint reports zeros as zeros. Nothing in
// it is an external claim; it is the query those claims must cite.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { SCRUB_FIELDS, ALLOWED_TOP, ALLOWED_CONTEXT } from './lib/corpus-schema.mjs';
import { CONSENT_POLICY_VERSION } from './lib/consent.mjs';

const SCAN_LIMIT = 4000; // matches scheduled-corpus-audit MAX_ROWS

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  try {
    // ── counts that have single-field indexes: cheap aggregates ────
    const [contributableCount, optInCount, captureCount, ledgerCount] = await Promise.all([
      db.collection('generations').where('contributable', '==', true).count().get()
        .then((s) => s.data().count || 0).catch(() => 0),
      db.collection('user_profiles').where('contributeToCorpus', '==', true).count().get()
        .then((s) => s.data().count || 0).catch(() => 0),
      db.collection('user_profiles').where('transcriptCapture', '==', true).count().get()
        .then((s) => s.data().count || 0).catch(() => 0),
      db.collection('consent_events').count().get()
        .then((s) => s.data().count || 0).catch(() => 0),
    ]);

    // ── per-kind / per-format breakdown: light scan, select() only ──
    // Avoids composite (contributable, kind) indexes. Bounded and cheap
    // at today's scale; when the corpus outgrows SCAN_LIMIT the
    // breakdown reports the truncation instead of lying.
    const byKind = {};
    const byFormat = {};
    let scanned = 0;
    let oldest = null;
    let newest = null;
    try {
      const snap = await db.collection('generations')
        .where('contributable', '==', true)
        .orderBy('createdAt', 'asc')
        .select('kind', 'format', 'createdAt')
        .limit(SCAN_LIMIT)
        .get();
      scanned = snap.size;
      snap.forEach((doc) => {
        const d = doc.data();
        const k = d.kind || 'unknown';
        const f = d.format || 'unknown';
        byKind[k] = (byKind[k] || 0) + 1;
        byFormat[f] = (byFormat[f] || 0) + 1;
        const t = d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate().toISOString() : null;
        if (t) { if (!oldest) oldest = t; newest = t; }
      });
    } catch (e) {
      console.warn('[corpus-manifest] breakdown scan failed:', e.message);
    }

    // ── snapshots from the nightly crons ───────────────────────────
    const [statsDoc, auditDoc] = await Promise.all([
      db.collection('corpus_stats').doc('latest').get().catch(() => null),
      db.collection('corpus_audit').doc('latest').get().catch(() => null),
    ]);

    const manifest = {
      generatedAt: new Date().toISOString(),
      policy: {
        policyVersion: CONSENT_POLICY_VERSION,
        consentModel: 'opt-in, off by default, stamped at write time; server re-checks the profile before marking any row contributable',
        ageGate: '18+ attestation required on the profile; rows without it are never licensed and the nightly audit quarantines any that slip through',
        anonymousTraffic: 'never licensed',
        byokRounds: 'excluded at capture time by the client (the server cannot see BYOK routing)',
        revocation: 'forward-only; prior rounds stay under the consent they were written with (privacy §7). Per-round withdrawal honored by email.',
        rawAudio: 'never stored; transcripts and timing only, no voiceprints',
        consentLedger: 'append-only consent_events collection: every grant, withdrawal, and decline with surface + policy version',
      },
      counts: {
        contributableRows: contributableCount,
        breakdownScanned: scanned,
        breakdownTruncated: scanned >= SCAN_LIMIT,
        byKind,
        byFormat,
        oldestRowAt: oldest,
        newestRowAt: newest,
        optInMembers: optInCount,
        transcriptCaptureMembers: captureCount,
        consentLedgerEvents: ledgerCount,
      },
      provenance: {
        allHumanKinds: ['live_round'],
        mixedKinds: ['voice_round'],
        note: 'live_round rows are all-human speech with a judge-ballot output; voice_round transcripts interleave human and model turns (User turns are human-authored); all other kinds are model outputs whose resale is gated by the upstream provider ToS. Rows label this in their provenance field.',
      },
      schema: {
        topLevelFields: [...ALLOWED_TOP].sort(),
        contextFields: [...ALLOWED_CONTEXT].sort(),
        piiScrubbedFields: [...SCRUB_FIELDS].sort().concat(['context.fullTranscript']),
        note: 'Allowlist-only export: any field not listed is dropped before a row leaves. uid, IP, device, and account identifiers are never exported; rowId is a non-reversible hash for withdrawal requests.',
      },
      stats: statsDoc && statsDoc.exists ? statsDoc.data() : null,
      audit: auditDoc && auditDoc.exists ? auditDoc.data() : { neverRan: true },
      endpoints: {
        rows: '/api/admin/corpus-export',
        preferencePairs: '/api/admin/corpus-export?mode=preference',
        publicStats: '/api/corpus-stats',
      },
    };

    return jsonResponse(manifest, 200, request);
  } catch (err) {
    console.error('admin-corpus-manifest error:', err.message);
    return errorResponse('Failed to build manifest: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/corpus-manifest',
};
