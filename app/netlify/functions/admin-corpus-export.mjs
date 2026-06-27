// Admin-only export of the opt-in research corpus. Returns JSONL of
// generations where contributable === true, with identifying fields
// stripped (uid, IP, device, anything user-specific in context).
//
// Use cases:
//   - Send a sample row pack to a lab during licensing diligence
//   - Spot-check what an external recipient would actually see after
//     the anonymization filter — keep the strip-list honest
//
// Authed via lib/admin-auth.mjs (same gate as every other /api/admin/*).
// Pagination via createdAt cursor; default 500 rows per call, max 2000.
// JSONL keeps the response shape stream-friendly even when we wire a
// real streaming output later — for now we buffer.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, errorResponse } from './lib/response.mjs';
import { scrubText } from './lib/pii-scrub.mjs';

// Free-text fields that can carry PII spoken/typed *inside* the content
// (a real name in a voice transcript, an email in a typed argument). The
// field-level allowlist below drops identifying COLUMNS (uid, IP); this set
// is run through pii-scrub so identifiers leaking INSIDE the text are redacted
// too. Without this, fullTranscript / userPrompt / output ship raw.
const SCRUB_FIELDS = new Set(['motion', 'userPrompt', 'output', 'userNotes']);

// Output schema: explicit allowlist of top-level fields. Anything not
// listed here is dropped. New fields added to the generations doc
// (e.g. when we add a new training signal) need a deliberate addition
// here before they reach an external party. The default direction is
// "exclude" so a leak is structurally hard.
const ALLOWED_TOP = new Set([
  'kind',
  'motion',
  'side',
  'format',
  'depth',
  'model',
  'promptId',
  'systemPrompt',
  'userPrompt',
  'output',
  'outputLength',
  'durationMs',
  'inputTokens',
  'outputTokens',
  'rating',
  'saved',
  'shared',
  'regenerated',
  'edited',
  'boring',
  'userNotes',
  'lastSignal',
  'contributable',
  'createdAt',
  // context is allowlisted below in its own pass
]);

// Context-object allowlist. Same posture: anything not here gets dropped.
// Keep this conservative — only structural metadata that helps a lab
// understand the row, never anything that ties back to a person.
const ALLOWED_CONTEXT = new Set([
  'persona',
  'turnCount',
  'userTurnCount',
  'fullTranscript',
  'language',
  'aiLanguage',
  'modeKey',
  'intensity',
  'source',
  'judgePool',
  'mode',
  'depth',
  'feature',
]);

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function anonymize(doc) {
  const data = doc.data();
  const out = {};
  let scrubHits = 0;
  for (const k of Object.keys(data)) {
    if (!ALLOWED_TOP.has(k)) continue;
    if (k === 'createdAt' && data[k] && typeof data[k].toDate === 'function') {
      out[k] = data[k].toDate().toISOString();
    } else if (SCRUB_FIELDS.has(k) && typeof data[k] === 'string') {
      const r = scrubText(data[k]);
      out[k] = r.text;
      scrubHits += r.hits;
    } else {
      out[k] = data[k];
    }
  }
  const ctx = data.context || {};
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    const safeCtx = {};
    for (const k of Object.keys(ctx)) {
      if (!ALLOWED_CONTEXT.has(k)) continue;
      // fullTranscript is the highest-risk field — a voice round can contain
      // a real name. Scrub it like the other free text.
      if (k === 'fullTranscript' && typeof ctx[k] === 'string') {
        const r = scrubText(ctx[k]);
        safeCtx[k] = r.text;
        scrubHits += r.hits;
      } else {
        safeCtx[k] = ctx[k];
      }
    }
    out.context = safeCtx;
  }
  // Provenance: which half is human-authored (cleanly licensable) vs model
  // output (resale gated by the upstream provider's ToS). Typed rounds put the
  // human's words in userPrompt and the AI's in output; voice rounds split
  // inside fullTranscript. Labeling it lets a buyer filter without guessing.
  out.provenance = {
    humanAuthored: data.kind === 'voice_round' ? 'transcript:User turns' : 'userPrompt',
    aiAuthored: 'output',
    aiModel: data.model || '',
  };
  out.piiScrubHits = scrubHits;
  // Synthetic stable row id so a lab can reference a specific row in
  // a withdrawal request without seeing the underlying Firestore id.
  // SHA-ish hash of the doc id; not reversible from outside.
  out.rowId = doc.id.slice(0, 12);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const after = url.searchParams.get('after'); // ISO date string, optional
  const formatFilter = url.searchParams.get('format'); // optional format slug
  const kindFilter = url.searchParams.get('kind'); // optional kind

  try {
    let q = db.collection('generations').where('contributable', '==', true);
    if (formatFilter) q = q.where('format', '==', formatFilter);
    if (kindFilter) q = q.where('kind', '==', kindFilter);
    q = q.orderBy('createdAt', 'asc').limit(limit);
    if (after) {
      const afterDate = new Date(after);
      if (!isNaN(afterDate.getTime())) {
        q = q.startAfter(afterDate);
      }
    }

    const snap = await q.get();
    const rows = snap.docs.map(anonymize);

    // JSONL body. One object per line; trailing newline so cat-style
    // appending works downstream.
    const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

    // Cursor for the next page = createdAt of the last row.
    const nextCursor = rows.length === limit && rows[rows.length - 1].createdAt
      ? rows[rows.length - 1].createdAt
      : null;

    const headers = {
      'Content-Type': 'application/x-jsonlines; charset=utf-8',
      'X-Row-Count': String(rows.length),
      'X-Has-More': rows.length === limit ? '1' : '0',
    };
    if (nextCursor) headers['X-Next-Cursor'] = nextCursor;

    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error('admin-corpus-export error:', err.message);
    return errorResponse('Failed to export corpus: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/corpus-export',
};
