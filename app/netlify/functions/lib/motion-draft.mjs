// motion-draft.mjs — the pre-round motion draft. PURE. No I/O, no Firestore.
//
// Both debaters get the SAME five motions, strike two each with the other
// side's strikes hidden, and whatever survives runs. A coin flip splits the
// two powers that are left: one debater calls the motion when more than one
// survives, the other calls their side. That split is the whole fairness
// argument. Last word on the motion is real power, so side choice is what
// it costs; handing one person both would make the flip decide the round.
//
// The arithmetic that shapes everything here: two strikes each from five,
// blind, means the strikes can OVERLAP. Survivors is not always one. It is
// 1 (no overlap), 2 (one shared strike), or 3 (both shared). It can never be
// 0, because two sides can only ever remove four distinct motions from five,
// and it can never be 5, because each side must spend both strikes. So the
// motion-pick beat is not an edge case bolted on, it is the common case:
// with random strikes it fires more often than it does not.
//
// Determinism is load-bearing in two directions. The slate is seeded off the
// pair so both clients could derive it independently, and the auto-picks a
// timeout falls back to are seeded too, so a draft resolved by two expired
// clocks lands on the same motion and the same sides for both people rather
// than on whichever client's POST arrived first.
//
// State lives on both queue docs under `draft` and is advanced by the server
// (spar-pair.mjs) inside the existing consent transaction. The client renders
// it and never decides it: a client that could pick its own side would just
// pick the winning one.

import { draftPoolFor } from './draft-motions.mjs';

export const DRAFT_VERSION = 1;
export const SLATE_SIZE = 5;
export const STRIKES_PER_SIDE = 2;

// Shot clocks, seconds. The strike window carries the reading load (five
// motions to weigh) so it gets the longest; the two pick beats are a single
// choice off a short list. Total worst case is ~28s of pre-round, which is
// long for a queue and short for a champ select. It is active time, not
// waiting time, which is the trade being made.
export const STRIKE_SEC = 14;
export const PICK_SEC = 9;

export const PHASES = ['strike', 'motion', 'side', 'done'];

// ── seeded randomness ───────────────────────────────────────────────
// FNV-1a, then mulberry32. Both are tiny, both are deterministic across
// Node and every browser, and neither pulls a dependency into a function
// bundle. Math.random() cannot be used anywhere in this file: the two
// clients and the server all have to land on the same answer.
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates over a COPY. Shuffling the pool in place would mutate the
// module-level DRAFT_MOTIONS array and quietly reorder every later draft in
// the same warm Lambda instance.
function shuffled(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

// The seed for a pair. Sorted uids, so both sides compute the same value
// whichever one of them is asking, plus the room id so two people who queue
// into each other twice in a session do not get the same five motions again.
export function draftSeed(uidA, uidB, room) {
  return [String(uidA || ''), String(uidB || '')].sort().join('~') + '|' + String(room || '');
}

// ── slate ───────────────────────────────────────────────────────────

export function buildSlate(seed, format) {
  const pool = draftPoolFor(format);
  const rand = mulberry32(hash32('slate:' + seed));
  const picked = shuffled(pool, rand).slice(0, SLATE_SIZE);
  return picked.map((text, i) => ({ id: 'm' + (i + 1), text: String(text) }));
}

// Roles. One debater calls the motion, the other calls the side, and which
// is which is a coin flip nobody can influence: it is derived from the seed
// before either of them has touched anything.
export function assignRoles(seed, uidA, uidB) {
  const pair = [String(uidA), String(uidB)].sort();
  const heads = mulberry32(hash32('coin:' + seed))() < 0.5;
  return {
    motionUid: heads ? pair[0] : pair[1],
    sideUid: heads ? pair[1] : pair[0],
  };
}

export function createDraft(seed, format, uidA, uidB) {
  const roles = assignRoles(seed, uidA, uidB);
  return {
    v: DRAFT_VERSION,
    seed: String(seed),
    slate: buildSlate(seed, format),
    motionUid: roles.motionUid,
    sideUid: roles.sideUid,
    strikes: {},
    motionId: null,
    side: null,       // the side sideUid takes: 'pro' | 'con'
    autoMotion: false, // a clock, not a person, made this call
    autoSide: false,
    phase: 'strike',
  };
}

// ── strikes ─────────────────────────────────────────────────────────

function slateIds(draft) {
  return (draft && Array.isArray(draft.slate) ? draft.slate : []).map((m) => m.id);
}

// Client input. Never trust the count, the membership, or the uniqueness:
// a hand-rolled POST striking four motions would leave one survivor of its
// own choosing, which is the whole draft handed to whoever opens devtools.
export function sanitizeStrikes(draft, raw) {
  const valid = new Set(slateIds(draft));
  const out = [];
  const list = Array.isArray(raw) ? raw : [];
  for (const r of list) {
    const id = String(r || '');
    if (valid.has(id) && out.indexOf(id) === -1) out.push(id);
    if (out.length >= STRIKES_PER_SIDE) break;
  }
  return out;
}

// Fill a short or empty strike set. Called for a timeout, and for the AI
// opponent. Seeded per uid so the same expired clock always fills the same
// way, and so the two sides do not fill identically (which would leave three
// survivors every single time a pair both went quiet).
export function autoStrikes(draft, uid, existing) {
  const have = sanitizeStrikes(draft, existing);
  if (have.length >= STRIKES_PER_SIDE) return have;
  const rand = mulberry32(hash32('auto:' + (draft && draft.seed) + ':' + String(uid)));
  const rest = shuffled(slateIds(draft).filter((id) => have.indexOf(id) === -1), rand);
  return have.concat(rest.slice(0, STRIKES_PER_SIDE - have.length));
}

// What is left. Order follows the slate, not the strike order, so the
// deterministic fallback below ("first survivor") means the same thing on
// every client.
export function survivorsOf(draft) {
  const struck = new Set();
  const strikes = (draft && draft.strikes) || {};
  Object.keys(strikes).forEach((uid) => {
    (Array.isArray(strikes[uid]) ? strikes[uid] : []).forEach((id) => struck.add(id));
  });
  return slateIds(draft).filter((id) => !struck.has(id));
}

export function bothStruck(draft, uidA, uidB) {
  const s = (draft && draft.strikes) || {};
  const done = (u) => Array.isArray(s[u]) && s[u].length === STRIKES_PER_SIDE;
  return done(uidA) && done(uidB);
}

// ── phase machine ───────────────────────────────────────────────────
//
// Returns a NEW draft object; never mutates the argument. Called after every
// write so the phase on the doc is always derived from the facts on the doc,
// not from a client's claim about which beat it is on.
export function advance(draft, uidA, uidB) {
  const d = Object.assign({}, draft, { strikes: Object.assign({}, draft.strikes) });

  if (!bothStruck(d, uidA, uidB)) {
    d.phase = 'strike';
    return d;
  }

  const survivors = survivorsOf(d);

  // One survivor means the strikes already decided it. The motion holder
  // gets no choice here and the client renders the lock-in beat instead,
  // which is a moment rather than a decision.
  if (survivors.length === 1) {
    d.motionId = survivors[0];
  } else if (d.motionId && survivors.indexOf(d.motionId) === -1) {
    // A motion that was picked and then somehow is not a survivor cannot be
    // trusted. Fall back rather than run a round on a struck motion.
    d.motionId = null;
  }

  if (!d.motionId) {
    d.phase = 'motion';
    return d;
  }
  if (d.side !== 'pro' && d.side !== 'con') {
    d.phase = 'side';
    return d;
  }
  d.phase = 'done';
  return d;
}

// Whose clock is running. The client uses this to know whether to render a
// decision or a spectator view, and the server uses it to reject a pick from
// the debater who does not hold that power.
export function actorFor(draft) {
  if (!draft) return null;
  if (draft.phase === 'motion') return draft.motionUid;
  if (draft.phase === 'side') return draft.sideUid;
  return null;
}

export function applyMotionPick(draft, uid, motionId) {
  if (draft.phase !== 'motion') return { ok: false, reason: 'wrong_phase' };
  if (String(uid) !== String(draft.motionUid)) return { ok: false, reason: 'not_your_call' };
  const survivors = survivorsOf(draft);
  if (survivors.indexOf(String(motionId)) === -1) return { ok: false, reason: 'motion_struck' };
  return { ok: true, draft: Object.assign({}, draft, { motionId: String(motionId), autoMotion: false }) };
}

export function applySidePick(draft, uid, side) {
  if (draft.phase !== 'side') return { ok: false, reason: 'wrong_phase' };
  if (String(uid) !== String(draft.sideUid)) return { ok: false, reason: 'not_your_call' };
  const s = String(side).toLowerCase();
  if (s !== 'pro' && s !== 'con') return { ok: false, reason: 'bad_side' };
  return { ok: true, draft: Object.assign({}, draft, { side: s, autoSide: false }) };
}

// Timeout resolution. Deliberately NOT random at call time: both clients and
// the server derive the same answer from the seed, so a draft that expires on
// both sides at once cannot resolve two different ways.
export function autoResolve(draft) {
  const d = Object.assign({}, draft);
  if (d.phase === 'motion') {
    const survivors = survivorsOf(d);
    d.motionId = survivors[0] || null;
    d.autoMotion = true;
  } else if (d.phase === 'side') {
    d.side = mulberry32(hash32('side:' + d.seed))() < 0.5 ? 'pro' : 'con';
    d.autoSide = true;
  }
  return d;
}

// ── result ──────────────────────────────────────────────────────────
//
// The only thing downstream cares about: which motion, and who is on which
// side. `side` is the side the SIDE HOLDER took, so the other debater gets
// the remainder. Returns null until the draft is done, so a caller cannot
// half-open a round on an unfinished draft.
export function draftResult(draft, uidA, uidB) {
  if (!draft || draft.phase !== 'done' || !draft.motionId) return null;
  const entry = (draft.slate || []).find((m) => m.id === draft.motionId);
  if (!entry) return null;
  const other = String(draft.sideUid) === String(uidA) ? String(uidB) : String(uidA);
  const proUid = draft.side === 'pro' ? String(draft.sideUid) : other;
  const conUid = draft.side === 'pro' ? other : String(draft.sideUid);
  return { motion: entry.text, motionId: entry.id, proUid, conUid };
}
