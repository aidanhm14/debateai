// Tournament-only standings points.
//
// The argument ballot remains the published judge score and decides the
// round. This module applies the separately disclosed camera-presence rule
// only to the speaker-points tiebreak used by the tournament tab.

export const TOURNAMENT_CAMERA_POINTS = Object.freeze({
  camera: 2,
  avatar: -1,
  off: -3,
});

export const TOURNAMENT_SPREAD_WPM = 250;

function oneDecimal(value) {
  return Math.round(Number(value) * 10) / 10;
}

function sideOf(speech) {
  return String(speech && speech.side || '').toLowerCase();
}

function wordsIn(text) {
  const clean = String(text || '').trim();
  if (!clean || clean === '(skipped)' || clean === '(no transcript)') return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

export function speechPaceWpm(speech) {
  const seconds = Number(speech && speech.durationSec);
  const words = wordsIn(speech && speech.text);
  if (!Number.isFinite(seconds) || seconds <= 0 || words <= 0) return null;
  return Math.round((words * 60) / seconds);
}

export function sidePace(speeches, side) {
  let words = 0;
  let seconds = 0;
  for (const speech of Array.isArray(speeches) ? speeches : []) {
    if (!speech || speech.skipped || sideOf(speech) !== side) continue;
    const speechWords = wordsIn(speech.text);
    const speechSeconds = Number(speech.durationSec);
    if (!speechWords || !Number.isFinite(speechSeconds) || speechSeconds <= 0) continue;
    words += speechWords;
    seconds += speechSeconds;
  }
  const wpm = words && seconds ? Math.round((words * 60) / seconds) : null;
  return {
    words,
    seconds: oneDecimal(seconds),
    wpm,
    spreading: Number.isFinite(wpm) && wpm > TOURNAMENT_SPREAD_WPM,
  };
}

export function sideCameraAdjustment(speeches, side) {
  const seen = [];
  let weightedPoints = 0;
  let weightedSeconds = 0;

  for (const speech of Array.isArray(speeches) ? speeches : []) {
    if (!speech || speech.skipped || sideOf(speech) !== side) continue;
    const mode = String(speech.cameraMode || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(TOURNAMENT_CAMERA_POINTS, mode)) continue;
    const seconds = Math.max(1, Number(speech.durationSec) || 1);
    seen.push(mode);
    weightedPoints += TOURNAMENT_CAMERA_POINTS[mode] * seconds;
    weightedSeconds += seconds;
  }

  if (!weightedSeconds) {
    return { mode: 'unknown', adjustment: 0 };
  }

  const unique = [...new Set(seen)];
  return {
    mode: unique.length === 1 ? unique[0] : 'mixed',
    adjustment: oneDecimal(weightedPoints / weightedSeconds),
  };
}

function sideScore(basePoints, speeches, side) {
  const base = basePoints === null || basePoints === undefined || basePoints === ''
    ? Number.NaN
    : Number(basePoints);
  const camera = sideCameraAdjustment(speeches, side);
  const pace = sidePace(speeches, side);
  const argumentPoints = Number.isFinite(base) ? oneDecimal(base) : null;
  const standingPoints = argumentPoints == null
    ? null
    : oneDecimal(Math.max(0, Math.min(100, argumentPoints + camera.adjustment)));
  return {
    argumentPoints,
    cameraMode: camera.mode,
    presenceAdjustment: camera.adjustment,
    standingPoints,
    paceWpm: pace.wpm,
    spreading: pace.spreading,
  };
}

export function buildTournamentScorecard({ speeches, proPoints, conPoints } = {}) {
  return {
    policyVersion: '2026-08-29',
    cameraPoints: { ...TOURNAMENT_CAMERA_POINTS },
    spreadingThresholdWpm: TOURNAMENT_SPREAD_WPM,
    pro: sideScore(proPoints, speeches, 'pro'),
    con: sideScore(conPoints, speeches, 'con'),
  };
}
