// PURE half of the live-discourse injection. No I/O, no Firestore, no
// clock. Everything here is testable in isolation and is exercised by
// scripts/test-discourse.mjs in the pre-commit hook.
//
// Split out of discourse.mjs for the same reason judge-charter.mjs and
// brain-health.mjs are pure: the dangerous parts of this feature are all
// decisions, not fetches. Which feature is allowed to see the block, how
// strong a topical match has to be, and what the block actually says are
// each a way to do real damage quietly, and none of them need a database
// to verify.

// Only debate-generation features get live discourse.
//
// JUDGING IS EXCLUDED AND MUST STAY EXCLUDED. A ballot that has been fed
// what X thinks about the motion is a ballot with a thumb on the scale,
// and the judge charter forbids exactly that. This is the same rule the
// brain block follows, and it is asserted by the test suite rather than
// trusted to a code comment.
export const DISCOURSE_FEATURES = new Set([
  'case', 'tightblock', 'opp_attack', 'opponent', 'rebuttal', 'sneaky',
]);

// Stoplist for scoring only. Deliberately small: it exists to stop motion
// boilerplate ("this house would") from counting as topical overlap, not
// to be a general-purpose stopword list.
const STOP = new Set([
  'this', 'that', 'house', 'would', 'believes', 'should', 'resolved',
  'thbt', 'thw', 'ths', 'thr', 'the', 'and', 'for', 'with', 'from',
  'their', 'there', 'when', 'what', 'which', 'have', 'has', 'not',
  'are', 'was', 'were', 'been', 'its', 'his', 'her', 'they', 'them',
  'all', 'any', 'more', 'than', 'into', 'over', 'about', 'must',
]);

export function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  );
}

// Two solid content-word hits, or one headline hit plus a vocabulary hit.
// Below this the block is NOISE, and noise is worse than nothing here:
// an unrelated fault line does not get ignored by the model, it gets
// used, and the round drifts to whatever X was arguing about instead.
export const MIN_SCORE = 5;

// Score a fault line against a motion. Overlap counts against the
// headline, the circulating vocabulary, and the named actors, because a
// motion about "frontier model licensing" should still match a fault
// line that never uses those words but names the same bills and labs.
export function scoreMatch(motionTokens, line) {
  if (!motionTokens || !motionTokens.size || !line) return 0;

  const head = tokens(line.headline);
  const vocab = tokens((line.vocabulary || []).join(' '));
  const actors = tokens((line.actors || []).join(' '));

  let score = 0;
  for (const t of motionTokens) {
    if (head.has(t)) score += 3;       // headline overlap is the strongest signal
    else if (vocab.has(t)) score += 2;
    else if (actors.has(t)) score += 2;
  }
  return score;
}

export function bestMatch(motion, faultLines) {
  if (!motion || !Array.isArray(faultLines) || !faultLines.length) return null;
  const mt = tokens(motion);
  let best = null;
  let bestScore = 0;
  for (const line of faultLines) {
    if (!line || !line.headline) continue;
    const s = scoreMatch(mt, line);
    if (s > bestScore) { bestScore = s; best = line; }
  }
  return bestScore >= MIN_SCORE ? best : null;
}

// The four HOW TO USE lines at the bottom are the guardrail, not filler.
// Without them the model treats a list of popular phrasings as a list of
// true claims, starts citing posts as evidence, and drifts toward
// whichever side had more volume. The test asserts each one survives.
export function renderBlock(line) {
  if (!line || !line.headline) return '';

  const parts = [
    '',
    '─── LIVE DISCOURSE (how this argument is actually being had right now) ───',
    `CONTESTED: ${line.headline}`,
  ];

  if (line.summary) parts.push(`WHY NOW: ${line.summary}`);

  const a = line.sideA || {};
  const b = line.sideB || {};
  if (a.label && (a.phrasing || []).length) {
    parts.push(`ONE SIDE (${a.label}) SAYS: ${a.phrasing.join(' / ')}`);
  }
  if (b.label && (b.phrasing || []).length) {
    parts.push(`THE OTHER SIDE (${b.label}) SAYS: ${b.phrasing.join(' / ')}`);
  }
  if ((line.vocabulary || []).length) {
    parts.push(`CURRENT TERMS: ${line.vocabulary.join(', ')}`);
  }
  if ((line.actors || []).length) {
    parts.push(`BEING CITED: ${line.actors.join(', ')}`);
  }

  parts.push(
    '',
    'HOW TO USE THIS:',
    '- These are the live terms and targets. Prefer them over the framing',
    '  you would reach for by default, which is likely a few years stale.',
    '- Engage the strongest version of the opposing phrasing above. It is',
    '  what a real opponent will actually say.',
    '- This is vocabulary, NOT evidence and NOT a position. Popularity on',
    '  a platform is not a warrant. Never say "people on X are saying" or',
    '  cite a post as proof. If you cannot warrant a claim yourself, drop it.',
    '- Format rules and your voice guidelines outrank everything here.',
    '─── END LIVE DISCOURSE ───',
    ''
  );

  return parts.join('\n');
}

// One call: feature gate, match, render. Returns '' when anything is
// missing, which is the safe direction for prompt enrichment.
export function buildDiscourseBlock({ motion, feature, faultLines } = {}) {
  if (!DISCOURSE_FEATURES.has(feature)) return '';
  const line = bestMatch(motion, faultLines);
  return line ? renderBlock(line) : '';
}
