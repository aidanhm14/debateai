// Nightly distillation: read the best generations from yesterday and
// summarize what made them good. Output lands in learning_distillations/
// {format} where the brain functions read it at runtime and inject it
// alongside the per-format voice guidelines.
//
// This is the compounding half of the learning loop. Exemplars give the
// model raw reference rounds (whole speeches). Distillations give it the
// extracted PATTERNS — "judges loved when X structured impacts as Y" —
// so the model gets sharper even on motions with no matching exemplar.
//
// Selection criteria for the source set per format:
//   - rating >= 4 (user gave 4 or 5 stars) OR saved === true
//   - output length >= 200 chars (filters trivial regenerations)
//   - createdAt within the last 30 days (recency > volume)
//   - cap at 20 examples per format (Haiku context budget)
//
// Env vars:
//   ANTHROPIC_API_KEY     — required
//   GOOGLE_SERVICE_ACCOUNT — for admin Firestore
//   DISTILL_MIN_EXAMPLES  — minimum examples needed (default 3; below = skip)
//   DISTILL_MODEL         — override (default claude-haiku-4-5-20251001)

import { getDb, FieldValue } from './lib/firestore.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.DISTILL_MODEL || 'claude-haiku-4-5-20251001';
const MIN_EXAMPLES = parseInt(process.env.DISTILL_MIN_EXAMPLES || '3', 10);
const MAX_EXAMPLES_PER_FORMAT = 20;
const LOOKBACK_DAYS = 30;
const MAX_EXAMPLE_CHARS = 1200;  // per example, keep total prompt manageable

// Formats we run distill over. Matches the slugs used in debate-ai.html
// FORMATS and seed-round.mjs FORMATS so downstream lookups align.
const FORMATS = [
  { slug: 'apda',   name: 'APDA' },
  { slug: 'bp',     name: 'British Parli' },
  { slug: 'asian',  name: 'Asian Parli' },
  { slug: 'worlds', name: 'Worlds' },
  { slug: 'pf',     name: 'Public Forum' },
  { slug: 'ld',     name: 'Lincoln-Douglas' },
  { slug: 'policy', name: 'Policy' },
  { slug: 'congress', name: 'Congress' },
  { slug: 'mun',    name: 'MUN' },
];

const DISTILL_SYSTEM = `You are analyzing top-rated debate AI outputs to extract the patterns that made them succeed. Your job is to identify reusable moves — structural, rhetorical, and analytical — that future generations should mirror.

OUTPUT FORMAT (strict — this gets injected into prompts verbatim):

PATTERNS THAT WORK (last 30 days, top-rated rounds):
1. [Pattern name]: [1-sentence description of the move]
   Example: [≤25-word quote or paraphrase from one of the examples]
2. [Pattern name]: ...
3. [Pattern name]: ...
[3-6 patterns total]

TRAPS TO AVOID:
- [Common weakness across regenerated/low-rated examples, if any in context]

Rules:
- Be specific. "Structures impacts via magnitude/probability/timeframe" not "argues well."
- No platitudes. Skip "compelling" / "powerful" / "engaging."
- No em-dashes anywhere.
- No preface — start with "PATTERNS THAT WORK:" on line 1.
- If the examples don't reveal a clear pattern, write fewer entries rather than padding.`;

function safeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_EXAMPLE_CHARS);
}

async function fetchTopGenerations(db, format) {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  // Two parallel queries (rating-based + saved-based), dedupe by id.
  // Firestore doesn't OR on different fields without a composite, so
  // run them separately and merge in memory.
  const [ratedSnap, savedSnap] = await Promise.all([
    db.collection('generations')
      .where('format', '==', format)
      .where('rating', '>=', 4)
      .where('createdAt', '>=', cutoff)
      .orderBy('rating', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(MAX_EXAMPLES_PER_FORMAT)
      .get()
      .catch(err => { console.warn('[distill] rated query failed for', format, err.message); return { docs: [] }; }),
    db.collection('generations')
      .where('format', '==', format)
      .where('saved', '==', true)
      .where('createdAt', '>=', cutoff)
      .orderBy('createdAt', 'desc')
      .limit(MAX_EXAMPLES_PER_FORMAT)
      .get()
      .catch(err => { console.warn('[distill] saved query failed for', format, err.message); return { docs: [] }; }),
  ]);

  const byId = new Map();
  for (const doc of ratedSnap.docs || []) byId.set(doc.id, doc.data());
  for (const doc of savedSnap.docs || []) if (!byId.has(doc.id)) byId.set(doc.id, doc.data());

  return Array.from(byId.values())
    .filter(d => d && d.output && d.output.length >= 200)
    .slice(0, MAX_EXAMPLES_PER_FORMAT);
}

function buildDistillUserPrompt(format, name, examples) {
  const lines = [
    `Format: ${name} (${format})`,
    `Examples: ${examples.length} top-rated AI outputs from the last ${LOOKBACK_DAYS} days.`,
    '',
    'Extract the patterns. Output in the strict format from the system prompt.',
    '',
    '─── EXAMPLES ───',
    '',
  ];
  examples.forEach((e, i) => {
    lines.push(`EXAMPLE ${i + 1}${e.rating ? ` (rated ${e.rating}/5)` : ''}${e.saved ? ' [saved]' : ''}`);
    if (e.motion) lines.push(`Motion: ${safeText(e.motion).slice(0, 200)}`);
    if (e.kind) lines.push(`Kind: ${e.kind}${e.side ? ` · Side: ${e.side}` : ''}`);
    lines.push('');
    lines.push(safeText(e.output));
    lines.push('');
    lines.push('─────────────');
    lines.push('');
  });
  return lines.join('\n');
}

async function distillFormat(db, format) {
  const examples = await fetchTopGenerations(db, format.slug);
  if (examples.length < MIN_EXAMPLES) {
    console.log('[distill]', format.slug, 'only', examples.length, 'examples — skipping');
    return { format: format.slug, status: 'skipped', count: examples.length };
  }

  const userPrompt = buildDistillUserPrompt(format.slug, format.name, examples);

  // Call Claude Haiku via the standard messages endpoint. No streaming —
  // we want the full text in one shot for the Firestore write.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: DISTILL_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[distill]', format.slug, 'Anthropic error', res.status, errText.slice(0, 200));
    return { format: format.slug, status: 'error', count: examples.length, error: 'anthropic_' + res.status };
  }

  const data = await res.json();
  const distillation = (data.content || []).map(b => b.text || '').join('\n').trim();
  if (!distillation) {
    console.warn('[distill]', format.slug, 'empty response');
    return { format: format.slug, status: 'empty', count: examples.length };
  }

  await db.collection('learning_distillations').doc(format.slug).set({
    format: format.slug,
    formatName: format.name,
    distillation,
    exampleCount: examples.length,
    model: MODEL,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log('[distill]', format.slug, '✓ updated from', examples.length, 'examples');
  return { format: format.slug, status: 'ok', count: examples.length };
}

export default async () => {
  if (!ANTHROPIC_API_KEY) {
    console.error('[distill] ANTHROPIC_API_KEY missing');
    return new Response(JSON.stringify({ ok: false, error: 'missing_api_key' }), { status: 500 });
  }

  const db = getDb();
  const results = [];
  // Sequential, not parallel — 9 formats × Haiku is ~30s total which fits
  // the 26s Netlify limit if anything is slow. Parallelize only if needed.
  for (const format of FORMATS) {
    try {
      const r = await distillFormat(db, format);
      results.push(r);
    } catch (err) {
      console.error('[distill]', format.slug, 'crashed:', err.message);
      results.push({ format: format.slug, status: 'crashed', error: err.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Daily at 04:00 UTC = 23:30 IST / 00:00 EDT. Off-peak everywhere.
// Netlify cron syntax (5 fields, UTC). If we ever need more often, the
// distillations are idempotent — re-running just refreshes the doc.
export const config = {
  schedule: '0 4 * * *',
};
