import RoundEvidence from '../../../js/round-evidence.js';
// Analytics only. Do not infer completion from the request to judge.
export function roundOutcome(d) {
  if (d.ballot) return 'decided';
  const unresolved = d.ballotUnresolved;
  const reason = typeof unresolved === 'string' ? unresolved : unresolved?.resolution;
  if (reason === 'unresolved') return 'unresolved';
  if (unresolved) return 'no_contest';
  if (d.ballotPending || d.status === 'ballot') return 'pending';
  return 'unfinished';
}

// Conversation segments arrive while people speak, before an end-of-round
// speech row exists. Keep this independent from completed-speech counts.
export function hasCapturedSpeech(d) {
  return (Array.isArray(d.speeches) ? d.speeches : []).some(s => s && RoundEvidence.hasWords(s.text))
    || Object.values(d.openSegs || {}).some(rows => Array.isArray(rows) && rows.some(s => s && RoundEvidence.hasWords(s.text)));
}
