// Retrieval-augmented prompting for Debate AI generations.
//
// Before sending a generation request to a model, we fetch a small set of
// past high-signal outputs on similar motions and inject them into the
// system prompt as positive examples — plus one low-signal output as an
// anti-example. This is the closing half of the self-recurring feedback
// loop: every rated/saved/discarded generation written by log-generation
// becomes a teacher for the next generation, with no fine-tuning required.
//
// Source data:
//   generations           — full prompt → output, indexed by kind/motion/format
//   generation_signals    — rate, save, share, regenerate, edit, discard, copy
//   log-generation.mjs denormalizes the most-recent signal onto the
//   generation doc as { rating, saved, shared, regenerated, edited, lastSignal }
//
// Strategy:
//   1. Pull the top-N high-signal candidates (rating>=4 OR saved==true)
//      and the top-M low-signal candidates (rating<=2 OR lastSignal in
//      discard|regenerate). Two queries each (Firestore can't OR), merged
//      by id.
//   2. Score by topic similarity (Jaccard over stop-word-filtered motion
//      tokens) plus a 5x boost for format match.
//   3. Drop the requesting user's own outputs to avoid same-person echo
//      chambers.
//   4. Return a single string block ready to be prepended to body.system.
//
// Cost: ~one Firestore query per generation (cheap), plus a ~1.5-2k token
// addition to the system prompt. Both bounded by hard caps below.

const STOP_WORDS = new Set([
  'a','an','and','any','are','as','at','be','because','been','but','by','can','do','does','don','for','from',
  'had','has','have','he','her','him','his','how','i','if','in','into','is','it','its','just','me','more',
  'most','my','no','not','now','of','on','one','only','or','our','out','should','so','some','such','than',
  'that','the','their','them','they','this','those','to','too','was','we','were','what','when','where',
  'which','who','will','with','would','you','your','thbt','thw','this','house','believes','that','would',
]);

const MAX_CANDIDATES_HIGH = 60;
const MAX_CANDIDATES_LOW = 30;
const MAX_EXEMPLAR_CHARS = 1400;
const MAX_ANTI_CHARS = 700;

function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function clip(text, max) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= max) return text;
  // Try to break at a sentence-ish boundary so the excerpt isn't mid-word.
  const slice = text.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
  if (lastBreak > max * 0.6) return slice.slice(0, lastBreak + 1) + ' …';
  return slice + ' …';
}

// Map the brain-endpoint `feature` tag onto the `kind` value stored on
// generations. log-generation.mjs accepts: case, tightblock, sneaky,
// opp_attack, rebuttal, poi, philosophy, judge_adapt, other.
const FEATURE_TO_KIND = {
  case: 'case',
  resolution: 'case',           // motion designer outputs are case-adjacent
  bot: 'case',                  // AI debater speeches generated as cases
  simulator: 'case',
  practice: 'rebuttal',
  vision: 'case',
  philosophy: 'philosophy',
  feedback: null,               // judge / feedback don't get exemplars
  judge: null,
  adaptive: null,
  debateChat: null,             // conversational, no clean exemplar pool yet
  casual: null,
  unknown: null,
};

// Public entry point. Returns either an empty string (no signal yet) or a
// single block to prepend to body.system. Failures swallow silently —
// retrieval is fire-and-best-effort; never block a generation on a
// Firestore hiccup.
export async function buildExemplarBlock(db, opts = {}) {
  if (!db) return '';
  const {
    feature,
    motion,
    format = '',
    side = '',
    uid = null,
    limit = 2,
    antiLimit = 1,
  } = opts;

  // Bail early when the feature has no exemplar pool.
  const kind = FEATURE_TO_KIND[feature];
  if (!kind) return '';
  if (!motion || typeof motion !== 'string' || motion.trim().length < 8) return '';

  const wantedTokens = tokenize(motion);
  if (wantedTokens.size < 2) return '';

  try {
    // Two queries each for high / low signal, merged by id. We prefer
    // recent docs (orderBy createdAt desc) but cap to MAX_CANDIDATES_*
    // so we never scan the full collection.
    const col = db.collection('generations');
    const highQ1 = col.where('kind', '==', kind).where('rating', '>=', 4).orderBy('rating', 'desc').orderBy('createdAt', 'desc').limit(MAX_CANDIDATES_HIGH);
    const highQ2 = col.where('kind', '==', kind).where('saved', '==', true).orderBy('createdAt', 'desc').limit(MAX_CANDIDATES_HIGH);
    const lowQ1  = col.where('kind', '==', kind).where('rating', '<=', 2).orderBy('rating', 'asc').orderBy('createdAt', 'desc').limit(MAX_CANDIDATES_LOW);
    const lowQ2  = col.where('kind', '==', kind).where('lastSignal', '==', 'discard').orderBy('createdAt', 'desc').limit(MAX_CANDIDATES_LOW);

    const [hSnap1, hSnap2, lSnap1, lSnap2] = await Promise.all([
      highQ1.get().catch(() => null),
      highQ2.get().catch(() => null),
      lowQ1.get().catch(() => null),
      lowQ2.get().catch(() => null),
    ]);

    const merged = new Map();
    function ingest(snap, bucket) {
      if (!snap) return;
      snap.forEach(d => {
        const data = d.data() || {};
        if (!data.output || data.output.length < 80) return;
        if (uid && data.uid === uid) return; // skip the requester's own — avoids self-loop
        const cand = merged.get(d.id) || { id: d.id, data, bucket };
        // If we already saw it as high-signal, keep that (positive wins).
        cand.bucket = bucket === 'high' || cand.bucket === 'high' ? 'high' : 'low';
        merged.set(d.id, cand);
      });
    }
    ingest(hSnap1, 'high');
    ingest(hSnap2, 'high');
    ingest(lSnap1, 'low');
    ingest(lSnap2, 'low');

    if (!merged.size) return '';

    // Score each candidate.
    const scored = [];
    for (const cand of merged.values()) {
      const candTokens = tokenize(cand.data.motion || '');
      let score = jaccard(wantedTokens, candTokens);
      if (format && cand.data.format && String(cand.data.format).toLowerCase() === String(format).toLowerCase()) {
        score *= 5; // strong boost for format match
      }
      if (side && cand.data.side && String(cand.data.side).toLowerCase() === String(side).toLowerCase()) {
        score *= 1.5;
      }
      // Light recency tiebreaker (createdAt is a Firestore timestamp).
      const ts = cand.data.createdAt && cand.data.createdAt.toMillis ? cand.data.createdAt.toMillis() : 0;
      score += ts / 1e16; // tiny influence, only used when scores tie
      scored.push({ ...cand, score });
    }

    const positives = scored
      .filter(c => c.bucket === 'high' && c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const negatives = scored
      .filter(c => c.bucket === 'low' && c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, antiLimit);

    if (!positives.length && !negatives.length) return '';

    const out = [];
    if (positives.length) {
      out.push('PRIOR HIGH-SIGNAL OUTPUTS ON SIMILAR MOTIONS — anonymized training-pool excerpts. Read these as references for what good looks like in this voice; do NOT copy phrasing or specific examples. Generate fresh content with comparable structure, specificity, and tone.');
      out.push('');
      positives.forEach((p, i) => {
        const tag = String.fromCharCode(65 + i); // A, B
        const m = p.data.motion ? String(p.data.motion).slice(0, 200) : '(motion not stored)';
        const fmt = p.data.format ? String(p.data.format) : 'unspecified';
        const sd = p.data.side ? String(p.data.side) : 'unspecified';
        const sig = p.data.rating ? `rating: ${p.data.rating}` : (p.data.saved ? 'saved by user' : 'high-signal');
        out.push(`EXEMPLAR ${tag} — motion: "${m}" | format: ${fmt} | side: ${sd} | ${sig}`);
        out.push(clip(p.data.output, MAX_EXEMPLAR_CHARS));
        out.push('');
      });
    }
    if (negatives.length) {
      out.push('PRIOR LOW-SIGNAL OUTPUT — this output scored poorly with users. Identify what fails in it (vague warrants, generic framing, hedging, missing impact calculus, format mismatch, etc.) and AVOID those patterns:');
      out.push('');
      negatives.forEach(n => {
        const m = n.data.motion ? String(n.data.motion).slice(0, 200) : '(motion not stored)';
        const fmt = n.data.format ? String(n.data.format) : 'unspecified';
        const sig = (typeof n.data.rating === 'number' && n.data.rating <= 2) ? `rating: ${n.data.rating}` : `last signal: ${n.data.lastSignal || 'unknown'}`;
        out.push(`ANTI-EXEMPLAR — motion: "${m}" | format: ${fmt} | ${sig}`);
        out.push(clip(n.data.output, MAX_ANTI_CHARS));
        out.push('');
      });
    }

    return out.join('\n');
  } catch (err) {
    // Soft-fail. Retrieval is best-effort; never break a generation.
    console.warn('[retrieval] buildExemplarBlock failed:', err.message);
    return '';
  }
}

// Mutates body in place: prepends the exemplar block to body.system. Does
// nothing if the feature doesn't qualify or no exemplars are found.
export async function applyRetrieval(db, body, request) {
  if (!body || typeof body !== 'object') return;
  const feature = body._retrievalFeature || body._voiceFeature || body._feature;
  const motion = body._retrievalMotion;
  const format = body._retrievalFormat || body._voiceFormat;
  const side = body._retrievalSide;
  const uid = body._retrievalUid; // server attaches this when authed
  // Strip the retrieval hints regardless of outcome so we don't leak them
  // to the upstream model.
  delete body._retrievalFeature;
  delete body._retrievalMotion;
  delete body._retrievalFormat;
  delete body._retrievalSide;
  delete body._retrievalUid;

  if (!feature || !motion) return;

  const block = await buildExemplarBlock(db, { feature, motion, format, side, uid });
  if (!block) return;

  if (typeof body.system === 'string') {
    body.system = block + '\n\n' + (body.system || '');
  } else if (Array.isArray(body.system)) {
    body.system = [{ type: 'text', text: block }, ...body.system];
  } else {
    body.system = block;
  }
}
