// motion-draft.mjs — the pre-round motion negotiation. PURE. No I/O, no Firestore.
//
// THE STRIKE BEAT IS GONE (2026-09-02, the founder: "get rid of the whole
// feature to strike motions - offer a motion, then offer one to offer one
// or strike - give them options in a strategic manner"). Blind strikes over
// a dealt slate were a vetoing game: both sides removed motions at once and
// whatever nobody hated became the round, which reliably produced the
// blandest card on the table. This is a NEGOTIATION instead. One debater
// puts a motion up. The other answers it. Every answer is a real choice with
// a real cost, and the cost is always the same currency:
//
//   ONE PERSON DECIDES THE MOTION. THE OTHER DECIDES THE SIDE.
//
// That invariant survives from the strike design and is the whole fairness
// argument. Last word on what is argued is real power, so last word on which
// bench you sit is what it costs; handing one person both would make the
// coin flip decide the round rather than the debate.
//
// The tree, and every branch is priced:
//
//   1. OFFER    the offerer (seeded coin flip) puts one motion up.
//   2. RESPOND  the responder picks one of three:
//        take     we debate it. The responder picks their side.
//        back     kill it. The offerer must offer a DIFFERENT one and the
//                 responder must take that. The responder still picks their
//                 side, because they never chose a motion, they refused one.
//                 ONE free veto, never two.
//        counter  the responder puts their own motion up. The offerer then
//                 picks WHICH of the two runs and picks their own side.
//      So the only way to get your own motion onto the table is to give up
//      the side. That is the trade, and it is one sentence long on purpose.
//   3. SIDE     whoever the branch handed the side call to takes a bench.
//
// WHAT THIS DELETED, and why none of it is missed. There is no slate, no
// strike allowance, no reveal, and no blindness: every move here is
// SEQUENTIAL and PUBLIC, one actor at a time, so there is no simultaneous
// secret to protect. publicDraft() used to BE the blindness and is now an
// honest identity projection; the round doc can carry the whole draft
// because nothing on it is a card somebody has not played yet.
//
// Determinism is still load-bearing. The suggestion pool is seeded off the
// pair so both clients derive the same cards, and every timeout resolution
// is seeded too, so a beat that expires on both clocks at once cannot land
// the two browsers on two different motions.
//
// A client never decides anything here. The server (round-draft.mjs) runs
// this module over the stored draft; a client that could pick its own side
// would pick the winning one.

import { draftPoolFor } from './draft-motions.mjs';

export const DRAFT_VERSION = 3;

// How many suggestions whoever is offering gets to choose between. Four is
// enough to have a preference and few enough to read in a shot clock; a
// tournament stamps its own published pool instead.
export const POOL_SIZE = 4;

// Shot clocks, seconds. The two beats that carry reading load (choosing what
// to offer, weighing three answers) get the longer clocks; picking between
// two motions or two benches is one glance. Worst path — offer, counter,
// choose, side — is about 49s, and every second of it is somebody's turn
// rather than dead waiting.
export const OFFER_SEC = 16;
export const RESPOND_SEC = 14;
export const COUNTER_SEC = 14;
export const CHOOSE_SEC = 10;
export const SIDE_SEC = 9;

export const PHASES = ['offer', 'respond', 'counter', 'choose', 'side', 'done'];
export const RESPONSES = ['take', 'back', 'counter'];

// A motion written by hand rather than taken off the suggestion cards.
// Bounds here are structural; the CONTENT boundary (the site's motion rules)
// is the endpoint's job and runs before any of this is reached.
export const MOTION_MIN = 12;
export const MOTION_MAX = 200;

export function secondsFor(phase) {
  if (phase === 'offer') return OFFER_SEC;
  if (phase === 'respond') return RESPOND_SEC;
  if (phase === 'counter') return COUNTER_SEC;
  if (phase === 'choose') return CHOOSE_SEC;
  if (phase === 'side') return SIDE_SEC;
  return SIDE_SEC;
}

// ── seeded randomness ───────────────────────────────────────────────
// FNV-1a, then mulberry32. Both tiny, both deterministic across Node and
// every browser, neither pulls a dependency into a function bundle.
// Math.random() cannot be used anywhere in this file: the two clients and
// the server all have to land on the same answer.
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

// Fisher-Yates over a COPY. Shuffling in place would mutate the module-level
// pool array and quietly reorder every later draft in the same warm Lambda.
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
// whichever one is asking, plus the room id so two people who queue into
// each other twice do not get the same cards again.
export function draftSeed(uidA, uidB, room) {
  return [String(uidA || ''), String(uidB || '')].sort().join('~') + '|' + String(room || '');
}

// ── the suggestion pool ─────────────────────────────────────────────

export function buildPool(seed, format, options = {}) {
  const custom = Array.isArray(options.pool)
    ? options.pool.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  const suggestions = Array.isArray(options.suggestions)
    ? options.suggestions.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  const locked = custom.length >= 2;
  // `pool` is an event rule and therefore locked. `suggestions` is the
  // private matchmaker's mutually interesting starting deck; either person
  // can still write a counter of their own. Keeping those meanings separate
  // prevents personalization from quietly inheriting tournament rigidity.
  const source = locked ? custom : (suggestions.length >= 2 ? suggestions : draftPoolFor(format));
  // Both kinds draw the same way. A tournament's published list is the
  // SOURCE, not the screen: every motion a room can reach came off the
  // published twenty, and each room draws its own few from it, which is
  // what the strike design did too. Twenty cards under a shot clock is a
  // reading exercise, not a choice.
  const want = Math.max(2, Math.min(source.length, 8,
    Math.round(Number(options.poolSize) || POOL_SIZE)));
  const rand = mulberry32(hash32('pool:' + seed));
  const recommended = !locked && suggestions.includes(options.recommendedMotion)
    ? options.recommendedMotion : null;
  const ordered = shuffled(source, rand);
  const selected = recommended
    ? [recommended, ...ordered.filter((text) => text !== recommended)].slice(0, want)
    : ordered.slice(0, want);
  return selected.map((text, i) => ({
    id: 'p' + (i + 1), text: String(text),
    ...(text === recommended ? { recommended: true } : {}),
  }));
}

// Who offers first. A coin flip nobody can influence: derived from the seed
// before either debater has touched anything. It decides only who MOVES
// first, not who ends up with which power — the branch decides that.
export function assignRoles(seed, uidA, uidB) {
  const pair = [String(uidA), String(uidB)].sort();
  const heads = mulberry32(hash32('coin:' + seed))() < 0.5;
  return { offerUid: heads ? pair[0] : pair[1], respondUid: heads ? pair[1] : pair[0] };
}

export function createDraft(seed, format, uidA, uidB, options = {}) {
  const roles = assignRoles(seed, uidA, uidB);
  const pool = buildPool(seed, format, options);
  return {
    v: DRAFT_VERSION,
    seed: String(seed),
    pool,
    // A stamped pool (tournament) publishes its motions, so nobody writes
    // one by hand: an event's motion list has to mean what it says.
    poolLocked: Array.isArray(options.pool) && options.pool.length >= 2,
    offerUid: roles.offerUid,
    respondUid: roles.respondUid,
    // Motions actually put on the table. Grows by at most three (an offer,
    // a replacement after a send-back, a counter).
    table: [],
    offerId: null,     // the live offer, from offerUid
    counterId: null,   // the counter, from respondUid
    sentBack: [],      // table ids the responder refused; at most one
    response: null,    // 'take' | 'back' | 'counter'
    motionId: null,
    sideUid: null,     // set by the branch, not by the coin flip
    side: null,        // the side sideUid takes: 'pro' | 'con'
    autoOffer: false,  // a clock, not a person, made this call
    autoResponse: false,
    autoMotion: false,
    autoSide: false,
    phase: 'offer',
  };
}

// ── reading the draft ───────────────────────────────────────────────

export function tableOf(draft) {
  return (draft && Array.isArray(draft.table)) ? draft.table : [];
}
export function poolOf(draft) {
  return (draft && Array.isArray(draft.pool)) ? draft.pool : [];
}
export function motionTextOf(draft, id) {
  const hit = tableOf(draft).find((m) => m.id === String(id));
  return hit ? hit.text : '';
}
// One free veto, never two. Written as a function because it is a RULE, and
// a rule stated once cannot drift between the server and the board.
export const VETOES_PER_ROUND = 1;
export function vetoesLeft(draft) {
  const used = (draft && Array.isArray(draft.sentBack)) ? draft.sentBack.length : 0;
  return Math.max(0, VETOES_PER_ROUND - used);
}
// What the offerer may still put up: the suggestions, minus anything already
// on the table or already refused. Deliberately excludes sent-back motions,
// because re-offering the one they just killed would make the veto a joke.
export function offerablePool(draft) {
  const taken = new Set(tableOf(draft).map((m) => String(m.text || '').toLowerCase()));
  return poolOf(draft).filter((m) => !taken.has(String(m.text || '').toLowerCase()));
}
// The motions the offerer is choosing between at the 'choose' beat.
export function contenders(draft) {
  if (!draft) return [];
  return [draft.offerId, draft.counterId]
    .filter(Boolean)
    .map((id) => tableOf(draft).find((m) => m.id === id))
    .filter(Boolean);
}

// ── phase machine ───────────────────────────────────────────────────
//
// Returns a NEW draft; never mutates the argument. Called after every write
// so the phase on the doc is derived from the FACTS on the doc rather than
// from a client's claim about which beat it is on.
export function advance(draft) {
  const d = Object.assign({}, draft);
  if (d.motionId && (d.side === 'pro' || d.side === 'con')) d.phase = 'done';
  else if (d.motionId) d.phase = 'side';
  else if (d.response === 'counter' && !d.counterId) d.phase = 'counter';
  else if (d.response === 'counter') d.phase = 'choose';
  else if (!d.offerId) d.phase = 'offer';
  else d.phase = 'respond';
  return d;
}

// Whose clock is running. The client uses it to know whether to render a
// decision or a watching state; the server uses it to reject a move from the
// debater who does not hold that power.
export function actorFor(draft) {
  if (!draft) return null;
  if (draft.phase === 'offer') return draft.offerUid;
  if (draft.phase === 'respond') return draft.respondUid;
  if (draft.phase === 'counter') return draft.respondUid;
  if (draft.phase === 'choose') return draft.offerUid;
  if (draft.phase === 'side') return draft.sideUid;
  return null;
}

// The first two beats are the ones that PROVE somebody is at a keyboard.
// Before the responder has answered, exactly one person has moved, so
// resolving a stalled beat for the silent one is how a room opens onto an
// empty chair — the 411-round finding. Those beats may only be expired by
// the debater whose own clock ran out; a silent peer unwinds through the
// ghost path instead. Past the response both have acted, so either side may
// expire and a slow click never costs the round.
export function eitherMayExpire(draft) {
  if (!draft) return false;
  return draft.phase === 'counter' || draft.phase === 'choose' || draft.phase === 'side'
    || (draft.phase === 'offer' && !!draft.response);
}

// ── moves ───────────────────────────────────────────────────────────

function normalizeText(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function nextTableId(draft) {
  return 't' + (tableOf(draft).length + 1);
}

// Put a motion on the table. Used by BOTH the offer beat and the counter
// beat, because "name the motion you want" is the same act either way.
// `poolId` takes one of the suggestions; `text` writes one by hand and is
// refused outright on a stamped tournament pool.
export function applyOffer(draft, uid, input = {}) {
  const phase = draft && draft.phase;
  if (phase !== 'offer' && phase !== 'counter') return { ok: false, reason: 'wrong_phase' };
  const who = phase === 'offer' ? draft.offerUid : draft.respondUid;
  if (String(uid) !== String(who)) return { ok: false, reason: 'not_your_call' };

  let text = '';
  const poolId = input.poolId ? String(input.poolId) : '';
  if (poolId) {
    const card = offerablePool(draft).find((m) => m.id === poolId);
    if (!card) return { ok: false, reason: 'bad_motion' };
    text = card.text;
  } else {
    if (draft.poolLocked) return { ok: false, reason: 'pool_locked' };
    text = normalizeText(input.text);
    if (text.length < MOTION_MIN) return { ok: false, reason: 'too_short' };
    if (text.length > MOTION_MAX) return { ok: false, reason: 'too_long' };
  }
  const lower = text.toLowerCase();
  // Offering the motion that was just sent back, or the one already up,
  // would let the offerer answer a veto by ignoring it.
  if (tableOf(draft).some((m) => String(m.text || '').toLowerCase() === lower)) {
    return { ok: false, reason: 'duplicate' };
  }

  const entry = { id: nextTableId(draft), text, by: String(uid) };
  const d = Object.assign({}, draft, { table: tableOf(draft).concat([entry]) });
  if (phase === 'offer') {
    d.offerId = entry.id;
    d.autoOffer = false;
    // A send-back buys ONE replacement and the responder must take it. The
    // motion settles here, and the side stays with the responder because
    // refusing a motion is not choosing one.
    if (d.response === 'back') {
      d.motionId = entry.id;
      d.sideUid = d.respondUid;
    }
  } else {
    d.counterId = entry.id;
  }
  return { ok: true, draft: d };
}

// The responder's answer, and the whole strategic beat.
export function applyResponse(draft, uid, choice) {
  if (!draft || draft.phase !== 'respond') return { ok: false, reason: 'wrong_phase' };
  if (String(uid) !== String(draft.respondUid)) return { ok: false, reason: 'not_your_call' };
  const c = String(choice || '').toLowerCase();
  if (RESPONSES.indexOf(c) === -1) return { ok: false, reason: 'bad_choice' };

  const d = Object.assign({}, draft, { response: c, autoResponse: false });
  if (c === 'take') {
    d.motionId = draft.offerId;
    d.sideUid = draft.respondUid;
  } else if (c === 'back') {
    if (vetoesLeft(draft) <= 0) return { ok: false, reason: 'no_veto_left' };
    d.sentBack = (draft.sentBack || []).concat([draft.offerId]);
    d.offerId = null;
    // The side stays with the responder; the offerer owes a replacement.
  } else {
    // Counter. Putting your own motion up costs the side, every time.
    d.sideUid = draft.offerUid;
  }
  return { ok: true, draft: d };
}

// The offerer picking between their motion and the counter.
export function applyMotionPick(draft, uid, motionId) {
  if (!draft || draft.phase !== 'choose') return { ok: false, reason: 'wrong_phase' };
  if (String(uid) !== String(draft.offerUid)) return { ok: false, reason: 'not_your_call' };
  const id = String(motionId);
  if (contenders(draft).every((m) => m.id !== id)) return { ok: false, reason: 'bad_motion' };
  return { ok: true, draft: Object.assign({}, draft, { motionId: id, autoMotion: false }) };
}

export function applySidePick(draft, uid, side) {
  if (!draft || draft.phase !== 'side') return { ok: false, reason: 'wrong_phase' };
  if (String(uid) !== String(draft.sideUid)) return { ok: false, reason: 'not_your_call' };
  const s = String(side).toLowerCase();
  if (s !== 'pro' && s !== 'con') return { ok: false, reason: 'bad_side' };
  return { ok: true, draft: Object.assign({}, draft, { side: s, autoSide: false }) };
}

// ── timeouts ────────────────────────────────────────────────────────
//
// Deliberately NOT random at call time: both clients and the server derive
// the same answer from the seed, so a beat that expires on two clocks at
// once cannot resolve two different ways. Every auto path is marked on the
// draft so the board can say a clock made the call, not a person.
export function autoResolve(draft) {
  const d = Object.assign({}, draft);
  const rand = (salt) => mulberry32(hash32(salt + ':' + d.seed + ':' + tableOf(d).length))();

  if (d.phase === 'offer' || d.phase === 'counter') {
    const options = offerablePool(d);
    // Nothing left to offer is only reachable on an exhausted custom pool.
    // Falling through leaves the phase where it was rather than opening a
    // round on no motion at all.
    if (!options.length) return d;
    const pick = options[Math.floor(rand('auto-offer') * options.length)] || options[0];
    const res = applyOffer(d, d.phase === 'offer' ? d.offerUid : d.respondUid, { poolId: pick.id });
    if (!res.ok) return d;
    const out = res.draft;
    if (d.phase === 'offer') out.autoOffer = true;
    return out;
  }
  if (d.phase === 'respond') {
    // A clock running out is not a veto and not a counter. Taking what is
    // on the table is the neutral outcome, and it is the one that leaves
    // the side with the person who did not act, so silence is never
    // rewarded and never punished.
    const res = applyResponse(d, d.respondUid, 'take');
    if (!res.ok) return d;
    const out = res.draft;
    out.autoResponse = true;
    return out;
  }
  if (d.phase === 'choose') {
    const list = contenders(d);
    if (!list.length) return d;
    d.motionId = list[Math.floor(rand('auto-motion') * list.length)].id;
    d.autoMotion = true;
    return d;
  }
  if (d.phase === 'side') {
    d.side = rand('auto-side') < 0.5 ? 'pro' : 'con';
    d.autoSide = true;
    return d;
  }
  return d;
}

// ── publication ─────────────────────────────────────────────────────
//
// The projection that reaches live_rounds/{room}.draft, which every client
// in the room can read. Under the strike design this function WAS the
// blindness: two people moved at once, so publishing one side's strikes
// handed the other the whole draft. There is no simultaneous move left, so
// there is nothing to withhold and this is now an honest whole-draft copy.
// It is kept as a function on purpose: it is the one place that decides what
// a shared document is allowed to say, and the next beat that IS secret
// should be redacted here rather than anywhere else.
export function publicDraft(draft, phaseAt) {
  return {
    v: draft.v,
    phase: draft.phase,
    pool: draft.pool,
    poolLocked: !!draft.poolLocked,
    table: tableOf(draft),
    offerUid: draft.offerUid,
    respondUid: draft.respondUid,
    offerId: draft.offerId || null,
    counterId: draft.counterId || null,
    sentBack: draft.sentBack || [],
    vetoesLeft: vetoesLeft(draft),
    response: draft.response || null,
    motionId: draft.motionId || null,
    sideUid: draft.sideUid || null,
    side: draft.side || null,
    autoOffer: !!draft.autoOffer,
    autoResponse: !!draft.autoResponse,
    autoMotion: !!draft.autoMotion,
    autoSide: !!draft.autoSide,
    phaseAt: phaseAt || null,
  };
}

// ── result ──────────────────────────────────────────────────────────
//
// The only thing downstream cares about: which motion, and who is on which
// side. `side` is the side the SIDE HOLDER took, so the other debater gets
// the remainder. Returns null until the draft is done, so a caller cannot
// half-open a round on an unfinished negotiation.
export function draftResult(draft, uidA, uidB) {
  // Every one of these is load-bearing. `side` in particular: without the
  // check a done-but-sideless draft still produced an assignment, because
  // `side === 'pro'` is merely false when the side was never picked, which
  // silently seated the side holder on Con. Caught by the guard, 2026-09-02.
  if (!draft || draft.phase !== 'done' || !draft.motionId || !draft.sideUid) return null;
  if (draft.side !== 'pro' && draft.side !== 'con') return null;
  const entry = tableOf(draft).find((m) => m.id === draft.motionId);
  if (!entry) return null;
  const other = String(draft.sideUid) === String(uidA) ? String(uidB) : String(uidA);
  const proUid = draft.side === 'pro' ? String(draft.sideUid) : other;
  const conUid = draft.side === 'pro' ? other : String(draft.sideUid);
  return { motion: entry.text, motionId: entry.id, proUid, conUid };
}
