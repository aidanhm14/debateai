// ─────────────────────────────────────────────────────────────
// AI practice rating — the decision layer for /api/ai-rating.
//
// WHAT THIS IS
// A debater's rating for rounds AGAINST THE AI (typed /practice rounds
// and /voice-debate rounds). Same Glicko-2 engine as the human ladder
// (lib/rating.mjs), but it is a SEPARATE number in a SEPARATE
// collection (ai_ratings/{uid}), and it must never feed user_ratings,
// the leaderboard, credits, or standings.
//
// WHY SEPARATE, and do not "unify" this without a founder decision:
// the ballot for an AI round is authored in the participant's own
// browser (the same trust bar the human ladder already accepts for
// live rounds — see MONEY_VERDICT_SOURCES in settle.mjs for the one
// place that bar is refused), and the opponent is a machine anybody
// can replay all day. Wins against it are practice signal, not
// head-to-head standing. Mixed into the public human ladder it would
// be farmable rating; on its own it is a progress number whose blast
// radius is the owner's profile.
//
// THE AI ANCHOR
// The AI opponent is a fixed rating anchor, not a persisted player:
// its number never drifts from being beaten, because thousands of
// debaters beating one shared "AI account" would deflate it to the
// floor and make every later win worthless. rd 80 says we are fairly
// sure of its strength without claiming certainty.
//
// Pure module: no I/O, no Firestore, no clock. The endpoint owns the
// transaction; scripts/test-ai-rating.mjs pins the rules.
// ─────────────────────────────────────────────────────────────

import {
  updateRating,
  DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOL,
  displayRating,
} from './rating.mjs';

export const AI_ANCHOR = { rating: 1500, rd: 80 };

// A round with almost nothing said by the debater is not a rateable
// round. This is an honesty floor, not security (the transcript is
// client-supplied either way); it stops an empty or abandoned round
// from moving the number.
export const MIN_USER_WORDS = 120;

export const KINDS = new Set(['practice', 'voice']);

// Rated AI rounds per caller. Generous for a human, tight for a loop.
export const RATE_LAYERS = [
  { window: 60 * 60 * 1000, max: 6, label: 'hour' },
  { window: 24 * 60 * 60 * 1000, max: 16, label: 'day' },
];

// Winner strings as the two ballot surfaces actually emit them.
// practice: parsed.winner is 'user' | 'ai' | anything-else-is-a-split.
// voice-rfd: detectWinner() returns 'user' | 'ai' | '' (no call).
// A round with NO call rates nothing — a missing verdict is not a draw.
export function normalizeOutcome(winner) {
  if (winner === 'user') return 1;
  if (winner === 'ai') return 0;
  if (winner === 'draw' || winner === 'split' || winner === 'tie') return 0.5;
  return null;
}

// transcript: [{ who: 'user'|'ai', text }]
export function userWordCount(transcript) {
  if (!Array.isArray(transcript)) return 0;
  let n = 0;
  for (const t of transcript) {
    if (!t || t.who !== 'user' || typeof t.text !== 'string') continue;
    n += t.text.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

// state: the stored ai_ratings doc (or null for a first round).
// score: 1 | 0 | 0.5 from normalizeOutcome.
// Returns the next stored shape plus the display projection.
export function applyAiRound(state, score) {
  const pre = {
    rating: Number.isFinite(state?.rating) ? state.rating : DEFAULT_RATING,
    rd: Number.isFinite(state?.rd) ? state.rd : DEFAULT_RD,
    vol: Number.isFinite(state?.vol) && state.vol > 0 ? state.vol : DEFAULT_VOL,
  };
  const next = updateRating(pre, [{ rating: AI_ANCHOR.rating, rd: AI_ANCHOR.rd, score }]);
  const games = (Number(state?.games) || 0) + 1;
  const stored = {
    rating: next.rating,
    rd: next.rd,
    vol: next.vol,
    games,
    wins: (Number(state?.wins) || 0) + (score === 1 ? 1 : 0),
    losses: (Number(state?.losses) || 0) + (score === 0 ? 1 : 0),
    draws: (Number(state?.draws) || 0) + (score === 0.5 ? 1 : 0),
  };
  return {
    stored,
    before: Math.round(pre.rating),
    display: displayRating({ ...stored }),
    delta: Math.round(next.rating) - Math.round(pre.rating),
  };
}
