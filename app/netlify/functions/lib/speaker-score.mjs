// ─────────────────────────────────────────────────────────────
// SPEAKER SCORE — one number, DERIVED from the scored axes.
//
// WHY DERIVED RATHER THAN ASKED FOR
// The judge used to be asked for a headline figure directly, on the
// APDA 25-30 band. Two things go wrong with that and they compound.
//
// A model asked for a number on a six-point band regresses to the
// middle of it, so every round lands between 26 and 29 whatever
// happened. And the axes it scores separately are on a full 1-10, so
// the two disagree in public. Measured on a real published round on
// 2026-08-21: the axes read 8/8/8/7/8 against 4/3/3/2/3, which is a
// rout, and the headline read 28.5 against 25.4, which reads as a
// squeaker. Aidan looked at that card and said the round was not close.
// He was right, and the ballot was arguing with itself on screen.
//
// So the headline is no longer an opinion. It is the weighted mean of
// the axes the judge already scored, on 1-100. A blowout on the axes
// is now a blowout on the scoreboard, by construction, and a judge
// cannot flatten a rout by reaching for the middle of a narrow band.
//
// THE WEIGHTS ARE A PUBLISHED CLAIM, not a tuning knob. They say what
// this product thinks winning an argument is made of: whether your
// reasoning held, whether you answered theirs, and whether you weighed
// what was left. Delivery is last on purpose and persuasion is capped
// at the bottom of the ladder, for the reason the charter already
// gives: a scoring system that rewards polish over substance falls
// hardest on second-language speakers, and this one must not.
//
// Changing a weight changes what every future ballot means, so it is a
// rubric change and belongs in the season pin, not in a patch.
// ─────────────────────────────────────────────────────────────

export const AXIS_WEIGHTS = {
  reasoning: 2.5,       // did the argument actually hold up
  responsiveness: 2.0,  // did you answer what they said
  weighing: 2.0,        // did you compare what was left standing
  clarity: 1.5,         // could a listener follow it the first time
  strategy: 1.0,        // did you spend your time on what mattered
  persuasion: 1.0,      // did it move a reasonable listener, NOT polish
};

export const AXIS_KEYS = Object.keys(AXIS_WEIGHTS);

/**
 * Blend one side's axes into a 1-100 score.
 *
 * `dims` is the ballot's dimensions object, {axis: {pro, con}}, and
 * `side` is 'pro' or 'con'. Axes that are missing are DROPPED and the
 * weights renormalise over what is present, so an older four-axis
 * ballot still scores on the same scale rather than being punished for
 * the axes nobody asked it for. Returns null when nothing is scorable,
 * which the caller must treat as "no derived score" rather than zero.
 */
export function speakerScoreFromDims(dims, side) {
  if (!dims || typeof dims !== 'object') return null;
  let weighted = 0;
  let weight = 0;
  for (const axis of AXIS_KEYS) {
    const row = dims[axis];
    if (!row || typeof row !== 'object') continue;
    const raw = Number(row[side]);
    if (!Number.isFinite(raw)) continue;
    const v = Math.max(1, Math.min(10, raw));
    weighted += v * AXIS_WEIGHTS[axis];
    weight += AXIS_WEIGHTS[axis];
  }
  if (!weight) return null;
  const mean = weighted / weight;          // 1-10
  const out = Math.round(mean * 100) / 10; // 10-100, one decimal
  return Math.max(1, Math.min(100, out));
}

/**
 * Both sides at once, with the model's own figures as the fallback.
 *
 * The model's numbers are used ONLY when the axes cannot be blended,
 * because a ballot with no usable axes and no headline is worse than
 * one carrying the judge's own estimate. When both are present the
 * derived value wins: that is the whole point.
 */
export function deriveSpeakerScores(ballot) {
  const dims = ballot && ballot.dimensions;
  const pro = speakerScoreFromDims(dims, 'pro');
  const con = speakerScoreFromDims(dims, 'con');
  const fallback = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    pro: pro != null ? pro : fallback(ballot && ballot.proPoints),
    con: con != null ? con : fallback(ballot && ballot.conPoints),
    derived: pro != null && con != null,
  };
}

/**
 * How far apart the two sides finished, in plain words, for copy that
 * wants to say whether a round was close without inventing a threshold
 * per surface. Bands are deliberately wide: the interesting distinction
 * is decided-vs-close, not one point of separation.
 */
export function marginBand(a, b) {
  const gap = Math.abs(Number(a) - Number(b));
  if (!Number.isFinite(gap)) return '';
  if (gap < 4) return 'razor thin';
  if (gap < 10) return 'close';
  if (gap < 20) return 'clear';
  if (gap < 35) return 'decisive';
  return 'one sided';
}
