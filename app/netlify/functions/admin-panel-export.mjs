// Admin-only export of the opt-in opinion panel. GET /api/admin/panel-export
//
// Same posture as admin-corpus-export: allowlist everything, scrub the free
// text, ship JSONL, page on a createdAt cursor. Different asset though, so
// it gets its own endpoint rather than a mode flag on the other one.
//
// THREE MODES, and the second two are the reason this exists
//   default    one row per response. The raw instrument.
//   panel      one row per panelist: their whole answered series, so a
//              buyer can model an individual's belief structure across
//              propositions instead of treating every answer as unrelated.
//   drift      only rows where the panelist had answered the same stem
//              before, carrying the prior position and the signed shift.
//              This is the differentiated slice. A static poll cannot
//              produce it, and when the trigger is post_round it carries
//              the round and the respondent's own stated cause.
//
// WHAT NEVER LEAVES
// The raw uid never appears on a response row at all, so there is nothing
// to strip there. panelistId is already a salted hash; rotating
// CORPUS_HASH_SALT severs the link between an export and any account. Free
// text (`reason`, `attribution`) runs through pii-scrub, because a person
// explaining why they believe something is exactly where a real name turns
// up.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, errorResponse } from './lib/response.mjs';
import { scrubText } from './lib/pii-scrub.mjs';
import { getProposition } from './lib/stance-bank.mjs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

// Response fields allowed out. `signedIn` and `contributable` ride along so
// a recipient can verify the consent posture of every row they hold rather
// than taking the datasheet's word for it.
const ALLOWED = new Set([
  'panelistId',
  'propositionId',
  'topic',
  'position',
  'confidence',
  'reason',
  'trigger',
  'surface',
  'wave',
  'priorPosition',
  'priorConfidence',
  'shift',
  'roundId',
  'attribution',
  'contributable',
]);

const SCRUB = new Set(['reason', 'attribution']);

function anonymize(doc) {
  const d = doc.data();
  const out = {};
  for (const k of Object.keys(d)) {
    if (!ALLOWED.has(k)) continue;
    if (SCRUB.has(k) && typeof d[k] === 'string' && d[k]) {
      out[k] = scrubText(d[k]).text;
    } else {
      out[k] = d[k];
    }
  }
  if (d.createdAt && typeof d.createdAt.toDate === 'function') {
    out.createdAt = d.createdAt.toDate().toISOString();
  }
  // The proposition text travels with the row. Without it every row is an
  // opaque slug and the file is unusable without a second lookup, and the
  // wording is the instrument, so it belongs beside the answer.
  const p = getProposition(d.propositionId);
  if (p) out.propositionText = p.text;
  out.scale = '-3 strongly disagree to +3 strongly agree, 0 neutral';
  out.provenance = 'human-authored opinion response, opt-in, 18+ attested';
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || '';
  const topicFilter = url.searchParams.get('topic') || '';
  const propFilter = url.searchParams.get('proposition') || '';
  const after = url.searchParams.get('after');
  let limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    let q = db.collection('stance_responses').where('contributable', '==', true);
    if (propFilter) q = q.where('propositionId', '==', propFilter);
    q = q.orderBy('createdAt', 'asc').limit(limit);
    if (after) {
      const d = new Date(after);
      if (!isNaN(d.getTime())) q = q.startAfter(d);
    }

    const snap = await q.get();
    let rows = snap.docs.map(anonymize);
    // Applied in memory so a second equality field needs no composite index.
    if (topicFilter) rows = rows.filter(r => r.topic === topicFilter);

    if (mode === 'drift') {
      rows = rows.filter(r => r.priorPosition !== null && r.priorPosition !== undefined);
    }

    if (mode === 'panel') {
      // Regroup into one row per panelist. Ordering inside a panelist is
      // preserved from the createdAt sort above, so a series reads
      // chronologically.
      const byPanelist = new Map();
      for (const r of rows) {
        if (!byPanelist.has(r.panelistId)) {
          byPanelist.set(r.panelistId, { panelistId: r.panelistId, responses: [] });
        }
        byPanelist.get(r.panelistId).responses.push({
          propositionId: r.propositionId,
          propositionText: r.propositionText,
          topic: r.topic,
          position: r.position,
          confidence: r.confidence,
          wave: r.wave,
          shift: r.shift,
          trigger: r.trigger,
          reason: r.reason,
          attribution: r.attribution,
          at: r.createdAt,
        });
      }
      const panels = Array.from(byPanelist.values());
      const bodyP = panels.map(p => JSON.stringify(p)).join('\n') + (panels.length ? '\n' : '');
      return new Response(bodyP, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-jsonlines; charset=utf-8',
          'X-Panelist-Count': String(panels.length),
          'X-Response-Count': String(rows.length),
        },
      });
    }

    const body = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    const nextCursor = snap.docs.length === limit && rows.length
      ? rows[rows.length - 1].createdAt
      : null;

    const headers = {
      'Content-Type': 'application/x-jsonlines; charset=utf-8',
      'X-Row-Count': String(rows.length),
      'X-Scanned': String(snap.size),
      'X-Has-More': snap.docs.length === limit ? '1' : '0',
    };
    if (nextCursor) headers['X-Next-Cursor'] = nextCursor;

    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error('[admin-panel-export]', err.message);
    return errorResponse('Failed to export panel: ' + err.message, 500, request);
  }
};

export const config = { path: '/api/admin/panel-export' };
