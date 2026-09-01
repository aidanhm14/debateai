// Guard for the AI practice rating (lib/ai-rating.mjs + ai-rating.mjs).
// Pins the promises that make the number safe to show:
//   - it is SEPARATE from the human ladder (endpoint never touches
//     user_ratings or rating-apply),
//   - the AI anchor never persists an update (no deflation),
//   - a missing verdict is NOT a draw,
//   - empty rounds do not move it,
//   - application is idempotent per round and stamps provenance.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  AI_ANCHOR, MIN_USER_WORDS, KINDS,
  normalizeOutcome, userWordCount, applyAiRound,
} from '../app/netlify/functions/lib/ai-rating.mjs';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// ── outcome normalization ───────────────────────────────────────────
ok(normalizeOutcome('user') === 1, 'user win = 1');
ok(normalizeOutcome('ai') === 0, 'ai win = 0');
ok(normalizeOutcome('draw') === 0.5 && normalizeOutcome('split') === 0.5, 'draw/split = 0.5');
// The one that matters: no call is NOT a draw. A ballot that failed to
// parse, a viva report, a skipped verdict — none of these rate.
for (const bad of ['', null, undefined, 'unknown', 'USER', 0, {}]) {
  ok(normalizeOutcome(bad) === null, 'no verdict rates nothing: ' + JSON.stringify(bad));
}

// ── word floor ──────────────────────────────────────────────────────
const say = (who, words) => ({ who, text: Array(words).fill('word').join(' ') });
ok(userWordCount([say('user', 80), say('ai', 500), say('user', 50)]) === 130, 'counts only the user side');
ok(userWordCount([say('ai', 5000)]) === 0, 'AI words never satisfy the floor');
ok(userWordCount(null) === 0 && userWordCount([{ who: 'user' }]) === 0, 'degenerate transcripts count 0');
ok(MIN_USER_WORDS >= 100, 'the floor stays a real floor');

// ── rating movement ─────────────────────────────────────────────────
const win1 = applyAiRound(null, 1);
ok(win1.stored.rating > 1500, 'a first win raises the rating');
ok(win1.delta > 0 && win1.before === 1500, 'delta positive from the 1500 start');
ok(win1.stored.games === 1 && win1.stored.wins === 1 && win1.stored.losses === 0, 'record counts the win');
const loss1 = applyAiRound(null, 0);
ok(loss1.stored.rating < 1500 && loss1.delta < 0, 'a first loss lowers the rating');
const draw1 = applyAiRound(null, 0.5);
ok(Math.abs(draw1.stored.rating - 1500) < 1, 'a draw from 1500 barely moves');
ok(draw1.stored.draws === 1, 'record counts the draw');
// Sequencing: state threads through.
const win2 = applyAiRound(win1.stored, 1);
ok(win2.stored.games === 2 && win2.stored.rating > win1.stored.rating, 'a second win compounds');
ok(win2.stored.rd < win1.stored.rd, 'rd shrinks as games accumulate');
// Diminishing returns: farming wins against a fixed anchor flattens out.
let s = null;
for (let i = 0; i < 60; i++) s = applyAiRound(s, 1).stored;
const g60 = applyAiRound(s, 1);
ok(g60.delta <= 2, 'sixty straight wins vs the anchor have flattened (anti-farm)');
ok(s.rating < 2400, 'anchor farming cannot run to infinity quickly');

// ── the anchor never persists ───────────────────────────────────────
ok(AI_ANCHOR.rating === 1500 && AI_ANCHOR.rd >= 50 && AI_ANCHOR.rd <= 150,
  'anchor stays a modest-certainty constant: rd far below 50 turns every round into a huge swing, far above 150 into noise');
const libSrc = readFileSync(new URL('../app/netlify/functions/lib/ai-rating.mjs', import.meta.url), 'utf8');
ok(!/applyRound\(/.test(libSrc), 'lib never uses the two-sided applyRound: the AI side must not receive an update');

// ── endpoint promises, pinned as source scans ───────────────────────
const fnSrc = readFileSync(new URL('../app/netlify/functions/ai-rating.mjs', import.meta.url), 'utf8');
ok(!/collection\(\s*['\"]user_ratings/.test(fnSrc), 'endpoint never touches the human ladder collection');
ok(!/import[^;]*rating-apply/.test(fnSrc), 'endpoint never imports the ladder applier');
ok(/if\s*\(!isNamedAccount\(decoded\)\)/.test(fnSrc), 'the named-account gate is live, not just imported');
ok(/\.runTransaction\(/.test(fnSrc) && /ai_rating_changes/.test(fnSrc), 'idempotency is transaction-claimed');
ok(/verdictSource:\s*'participant'/.test(fnSrc), 'provenance stamped on every change row');
ok(/checkLayers\(/.test(fnSrc), 'rated rounds are rate-limited');
ok(KINDS.has('practice') && KINDS.has('voice') && KINDS.size === 2, 'exactly the two AI surfaces');

console.log('[test-ai-rating] ' + n + ' assertions passed');
