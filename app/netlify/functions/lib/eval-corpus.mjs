// Turning consented rounds into evaluation material, and refusing to
// turn them into the wrong kind.
//
// THE CIRCULARITY PROBLEM, which is the reason this module exists as
// code rather than as a paragraph in a README. Our stored rounds carry
// a winner. That winner was decided by OUR judge. Scoring our judge for
// accuracy against a label our judge wrote measures nothing except the
// judge's agreement with itself, and it would report a very high number
// while doing it. That is the single most flattering mistake available
// here, so the label's provenance travels with every row and the
// accuracy gate is a set membership test, not a convention someone
// remembers.
//
// What our own rounds ARE good for, with no human label needed:
//   - stability   (same round twice, does the verdict hold)
//   - bias        (swap the benches / pad the loser, does it move)
//   - calibration (do speaker points drift over a season)
// Those are the evals that protect the ladder, because a systematic
// bias compounds into a rating while noise averages out. They need a
// transcript, not a ground truth, which is exactly what we have.
//
// What our own rounds are NOT good for is accuracy. That stays on the
// external fixtures where a human chair announced a call on the record.

export const LABEL_SOURCES = {
  HUMAN_PANEL:  'human_panel',   // a human chair/panel announced it (external tournament rounds)
  HUMAN_REVIEW: 'human_review',  // an appeal a disqualified-free human reviewer decided
  CROWD:        'crowd',         // audience vote aggregate
  AI_VERDICT:   'ai_verdict',    // our own judge called it
  NONE:         'none',          // no verdict recorded
};

// Only a human call earns an accuracy score. Crowd votes are deliberately
// NOT in here: a room of spectators is a real human signal and a noisy,
// non-expert one, and quietly promoting it to ground truth would import
// popularity into a number we publish as adjudication accuracy. It is
// still exported, as its own comparison signal, under its own name.
export const ACCURACY_GOLD_SOURCES = new Set([
  LABEL_SOURCES.HUMAN_PANEL,
  LABEL_SOURCES.HUMAN_REVIEW,
]);

export function usableAsAccuracyGold(labelSource) {
  return ACCURACY_GOLD_SOURCES.has(labelSource);
}

// Which evals a row can legitimately feed. Stability and bias need only
// a transcript, so any round long enough to be a round qualifies.
export const MIN_TRANSCRIPT_CHARS = 600;

export function evalUsesFor(row) {
  const uses = [];
  const longEnough = (row.transcriptChars || 0) >= MIN_TRANSCRIPT_CHARS;
  if (longEnough) { uses.push('stability', 'bias'); }
  if (longEnough && row.speakerPoints != null) uses.push('calibration');
  if (usableAsAccuracyGold(row.labelSource)) uses.push('accuracy');
  if (row.labelSource === LABEL_SOURCES.CROWD) uses.push('crowd_agreement');
  return uses;
}

// `side` + `result` is how a generations row records who won: the row
// belongs to one debater, and result says whether that debater won. A
// round with a side and no result has no verdict, not a loss.
export function winnerFromSideResult(side, result) {
  if (!side || !result) return null;
  const r = String(result).toLowerCase();
  if (r === 'won' || r === 'win') return side;
  if (r === 'lost' || r === 'loss') return null; // the other bench won, but we do not know its key from this row alone
  return null;
}

// Map one `generations` document (already anonymized by the exporter)
// into a round-shaped evaluation record.
export function toEvalRound(data, id) {
  const ctx = (data && data.context) || {};
  const transcript = typeof ctx.fullTranscript === 'string' ? ctx.fullTranscript : '';
  const winner = winnerFromSideResult(data.side, ctx.result);

  // Everything we store was decided by our own judge. A human-decided
  // label can only arrive by being attached deliberately (an appeal
  // outcome, a tournament chair), never by inference from our own row.
  let labelSource = LABEL_SOURCES.NONE;
  if (data.humanVerdict) labelSource = LABEL_SOURCES.HUMAN_REVIEW;
  else if (data.crowdVerdict) labelSource = LABEL_SOURCES.CROWD;
  else if (winner || ctx.result) labelSource = LABEL_SOURCES.AI_VERDICT;

  const row = {
    id,
    kind: data.kind || '',
    format: data.format || '',
    motion: data.motion || '',
    side: data.side || '',
    speechCount: ctx.speechCount ?? ctx.turnCount ?? null,
    speakerPoints: ctx.speakerPoints ?? null,
    transcript,
    transcriptChars: transcript.length,
    // The verdict is reported, and reported as OURS. Never as gold.
    aiWinner: winner,
    labelSource,
    accuracyGold: usableAsAccuracyGold(labelSource),
    createdAt: data.createdAt || null,
  };
  row.evalUses = evalUsesFor(row);
  return row;
}

// The guard a fixture writer calls before it is allowed to emit an
// expected-winner label. Throwing beats returning false: a builder that
// ignores a boolean writes a silently circular gold file, and that file
// then looks exactly like a real one.
export function assertAccuracyLabelAllowed(row) {
  if (!usableAsAccuracyGold(row.labelSource)) {
    throw new Error(
      `refusing to write an accuracy label for ${row.id}: labelSource is '${row.labelSource}'. ` +
      `Only ${[...ACCURACY_GOLD_SOURCES].join(' / ')} may be scored for accuracy, because every ` +
      `other label on this corpus was written by the judge under test.`
    );
  }
  return true;
}
