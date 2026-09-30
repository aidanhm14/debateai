const AXES = ['reasoning', 'responsiveness', 'weighing', 'clarity', 'strategy', 'persuasion'];
const text = value => typeof value === 'string' ? value : '';
const score = value => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
  && Number.isFinite(Number(value)) ? Number(value) : null;

// Only the public round's saved decision belongs on a published replay.
// Never join private judging records, transcripts, account data or model inputs.
export function publicRecordingOverview(round = {}) {
  const decided = round.ballot && ['pro', 'con'].includes(round.ballot.winner);
  const unresolved = round.ballotUnresolved;
  const noContest = unresolved?.outcome === 'no_contest';
  const draw = unresolved?.outcome === 'no_winner' && round.serverJudgeState === 'unresolved'
    && Number(unresolved.missing || 0) === 0;
  const b = decided ? round.ballot : (noContest || draw) ? unresolved : null;
  if (!b) return {
    overviewStatus: ['failed', 'incomplete'].includes(round.serverJudgeState) ? 'delayed'
      : round.ballotPending || ['queued', 'running'].includes(round.serverJudgeState)
        ? 'pending' : 'unavailable',
  };
  const dimensions = {};
  if (!noContest) for (const key of AXES) {
    const row = b.dimensions?.[key];
    const pro = score(row?.pro), con = score(row?.con);
    if (pro !== null && con !== null && pro >= 1 && pro <= 10 && con >= 1 && con <= 10) {
      dimensions[key] = { pro, con };
    }
  }
  return {
    overviewStatus: 'ready',
    ballot: {
      winner: decided ? b.winner : null,
      outcome: decided ? 'decided' : noContest ? 'no_contest' : 'no_winner',
      proPoints: noContest ? null : score(b.proPoints),
      conPoints: noContest ? null : score(b.conPoints),
      scoreScale: [30, 100].includes(Number(b.scoreScale)) ? Number(b.scoreScale) : null,
      decidingIssue: text(b.decidingIssue),
      rfd: text(b.rfd) || text(b.reason),
      rfdDeep: noContest ? '' : text(round.rfdDeep) || text(b.rfdDeep),
      dimensions,
      judgeReasons: draw && Array.isArray(b.judgeReasons) ? b.judgeReasons.map(reason => ({
        winner: ['pro', 'con'].includes(reason?.winner) ? reason.winner : null,
        decidingIssue: text(reason?.decidingIssue),
        rfd: text(reason?.rfd),
      })) : [],
    },
  };
}
