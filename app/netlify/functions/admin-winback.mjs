// /api/admin/winback  GET
//
// Read-only view of the lapsed-user win-back cohort. The win-back cron
// (scheduled-winback.mjs, Wed 16:00 UTC) runs in DRY-RUN by default — it
// computes who it WOULD email and writes the result to config/winback_state
// without sending, until WINBACK_ENABLED=1 is set in Netlify. This card
// surfaces that state on the dashboard so the send decision can be made from
// real numbers instead of digging through Firestore. It NEVER sends or
// flips anything — purely a read.
//
// Auth: same admin gate as every other /api/admin/* (requireAdmin).

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  try {
    const doc = await db.collection('config').doc('winback_state').get();
    if (!doc.exists) {
      return jsonResponse({ exists: false, note: 'Win-back cron has not run yet (Wed 16:00 UTC).' }, 200, request);
    }
    const d = doc.data() || {};
    const lastRunAt = d.lastRunAt && typeof d.lastRunAt.toDate === 'function'
      ? d.lastRunAt.toDate().toISOString() : null;
    // sampleWould rows carry a uid; truncate it — this is an internal cohort
    // peek, not a place to surface full user ids.
    const sample = Array.isArray(d.sampleWould)
      ? d.sampleWould.slice(0, 10).map((s) => ({
          uid: typeof s.uid === 'string' ? s.uid.slice(0, 6) : '',
          format: s.format || '',
          hasName: s.hasName === true,
        }))
      : [];
    return jsonResponse({
      exists: true,
      lastRunAt,
      status: d.status || null,
      dryRun: d.dryRun !== false, // default to dry-run if unset
      candidates: d.candidates || 0,
      eligible: d.eligible || 0,
      sent: d.sent || 0,
      skipped: d.skipped || 0,
      errors: d.errors || 0,
      sampleWould: sample,
    }, 200, request);
  } catch (err) {
    console.error('admin-winback error:', err.message);
    return errorResponse('Failed to load win-back state: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/winback',
};
