// ─────────────────────────────────────────────────────────────────────
// THE STAGE — pure decision layer for "a viewer asks to join the debate".
//
// A tournament stream is one host talking to an audience that can only
// watch. This module is the rulebook for opening two seats in that
// broadcast to people who are currently watching it, and for handing the
// resulting argument to the judge in a shape the judge can actually
// score.
//
// NOTHING HERE TOUCHES THE NETWORK. Everything is a pure function over
// plain objects, so the rules that decide who may speak, whose clock is
// running, and what the judge is shown can be tested without a Daily
// room, a Firestore document, or a provider key. stage.mjs (the
// endpoint) owns state; this owns decisions.
//
// TWO MODES, and they are genuinely different products rather than one
// timer setting:
//
//   structured — alternating turns on a clock. One floor, one speaker,
//                the other side listening for what to answer. This is
//                the casual 1v1 the rest of the site runs, put on a
//                stream. Judged by the existing casual 1v1 method.
//
//   casual     — one open floor for a fixed stretch. Both microphones
//                live. Cutting in is legal. There is no turn order to
//                break, so there is nothing procedural for a judge to
//                punish, which is exactly why it needs a judging method
//                of its own: the ordinary method reads "the other side
//                never got to finish that" as a dropped argument, and
//                here it may simply be a conversation working the way
//                conversations work.
//
// THE LOAD-BEARING RULE FOR CASUAL: taking the floor is not an argument.
// Volume, persistence and airtime never win an exchange. What the
// interruption markers below exist for is the opposite question: when a
// point was cut off, was it ever answered? See markInterruptions.
// ─────────────────────────────────────────────────────────────────────

export const STAGE_MODES = ['structured', 'casual'];

// Structured turn order. Fixed rather than host-configurable on purpose:
// a stream has an audience that did not choose to be there, and what
// keeps them is a round that ends. 3/3/2/2 is ten minutes of speech,
// which is a segment. A host who wants a tournament format has
// /live-round; this is the show.
export const STRUCTURED_SEQUENCE = [
  { side: 'pro', label: 'Pro opening', ms: 180000 },
  { side: 'con', label: 'Con opening', ms: 180000 },
  { side: 'pro', label: 'Pro reply', ms: 120000 },
  { side: 'con', label: 'Con reply', ms: 120000 },
];

// Casual lengths the host may pick. Bounded rather than free-form so a
// stray value cannot open a floor that never closes.
export const CASUAL_LENGTHS_MS = [300000, 480000, 720000];
export const DEFAULT_CASUAL_MS = 480000;

export const SIDES = ['pro', 'con'];
export const MAX_NOTE = 140;
export const MAX_MOTION = 240;
export const MAX_TURN_CHARS = 4000;
export const MAX_TURNS = 400;

// A speaker's clock and the listener's clock are two different browsers,
// so an overlap under this is a hand-off with network jitter on it, not
// somebody cutting in. Generous on purpose: see the note on
// markInterruptions about why being wrong here costs nothing.
export const INTERRUPT_GRACE_MS = 700;

// A turn shorter than this is a cough, an "mhm", or a hand-off noise. It
// stays on the record (it is part of what the room sounded like) but it
// is never treated as an interruption and never counted as airtime,
// because backchannel is not floor-taking.
export const BACKCHANNEL_MS = 1200;
export const BACKCHANNEL_WORDS = 3;

// A pending request whose owner stopped polling has closed the tab.
export const REQUEST_STALE_MS = 6 * 60000;

export function normalizeMode(value) {
  const v = String(value || '').toLowerCase().trim();
  return STAGE_MODES.includes(v) ? v : null;
}

export function normalizeSide(value) {
  const v = String(value || '').toLowerCase().trim();
  return SIDES.includes(v) ? v : null;
}

export function otherSide(side) {
  return side === 'pro' ? 'con' : side === 'con' ? 'pro' : null;
}

// Free text a stranger types and other people read. Control characters
// are stripped rather than escaped: this is stored, and the surfaces
// that render it use textContent, so the job here is keeping newlines
// and terminal escapes out of a field a host reads in a queue.
export function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizeCasualMs(value) {
  const n = Number(value);
  return CASUAL_LENGTHS_MS.includes(n) ? n : DEFAULT_CASUAL_MS;
}

// ── Requests ────────────────────────────────────────────────────────
//
// A hand raise is a RECORD, never a seat. Nothing a viewer sends puts
// them on the stream; the host admits, and the send token is minted at
// that point against the verified uid of the person who asked. A viewer
// naming a side is stating a preference, and the host may seat them on
// either one, because a stage holding two people who both want Pro is
// not a debate.

export function buildRequest(input = {}, now = Date.now()) {
  const mode = normalizeMode(input.mode);
  if (!mode) return { error: 'mode must be structured or casual' };
  const side = normalizeSide(input.side); // optional: null means "either"
  const name = cleanText(input.name, 40) || 'Guest';
  return {
    request: {
      uid: String(input.uid || ''),
      name,
      side,
      mode,
      note: cleanText(input.note, MAX_NOTE),
      state: 'pending',
      askedAt: now,
      seenAt: now,
    },
  };
}

// What the HOST sees. Oldest first, because the queue's only fairness
// property is that raising your hand earlier is worth something, and
// any cleverer ranking is the house picking its own guests.
export function queueView(requests, now = Date.now(), staleMs = REQUEST_STALE_MS) {
  return (Array.isArray(requests) ? requests : [])
    .filter((r) => r && r.state === 'pending' && !isStale(r, now, staleMs))
    .sort((a, b) => (a.askedAt || 0) - (b.askedAt || 0))
    .map((r) => ({
      uid: r.uid,
      name: r.name || 'Guest',
      side: r.side || null,
      mode: r.mode,
      note: r.note || '',
      waitingMs: Math.max(0, now - (r.askedAt || now)),
    }));
}

// A pending request whose owner stopped polling has left the page. The
// queue drops it rather than letting a host admit somebody who is not
// there, which is the empty-chair failure the live-round ready check
// exists to prevent, one surface over.
export function isStale(request, now = Date.now(), staleMs = REQUEST_STALE_MS) {
  if (!request || request.state !== 'pending') return false;
  const last = request.seenAt || request.askedAt || 0;
  return now - last >= staleMs;
}

// ── Seats ───────────────────────────────────────────────────────────

export function emptyBoard(roomName, now = Date.now()) {
  return {
    roomName: String(roomName || ''),
    status: 'idle',
    mode: null,
    motion: '',
    seats: { pro: null, con: null },
    openedAt: null,
    speechIdx: 0,
    turnStartedAt: null,
    casualMs: DEFAULT_CASUAL_MS,
    updatedAt: now,
  };
}

export function seatedUids(board) {
  const s = (board && board.seats) || {};
  return SIDES.map((k) => s[k] && s[k].uid).filter(Boolean);
}

export function seatOf(board, uid) {
  if (!uid) return null;
  const s = (board && board.seats) || {};
  for (const side of SIDES) if (s[side] && s[side].uid === uid) return side;
  return null;
}

// Which side a newly admitted guest lands on. Their preference wins when
// that seat is open, otherwise they take what is left. Null means the
// stage is full, and the endpoint refuses rather than bumping somebody
// who is already speaking.
export function seatFor(board, preferred) {
  const s = (board && board.seats) || {};
  const want = normalizeSide(preferred);
  if (want && !s[want]) return want;
  for (const side of SIDES) if (!s[side]) return side;
  return null;
}

// ── The clock ───────────────────────────────────────────────────────
//
// The server holds the anchor (when the current turn started) and the
// clients derive the tick. That is what lets a viewer poll a shared
// cached endpoint every few seconds and still watch a smooth countdown,
// and it is why nothing here returns a "seconds remaining" that is
// already stale by the time it is serialized.

export function structuredStep(idx) {
  const i = Math.max(0, Math.floor(Number(idx) || 0));
  return STRUCTURED_SEQUENCE[i] || null;
}

export function clockFor(board, now = Date.now()) {
  if (!board || board.status !== 'debating') {
    return { running: false, side: null, label: '', endsAt: null, remainingMs: 0 };
  }
  if (board.mode === 'casual') {
    const started = Number(board.openedAt) || now;
    const endsAt = started + normalizeCasualMs(board.casualMs);
    return {
      running: true,
      side: null, // open floor: nobody holds it
      label: 'Open floor',
      endsAt,
      remainingMs: Math.max(0, endsAt - now),
      expired: now >= endsAt,
    };
  }
  const step = structuredStep(board.speechIdx);
  if (!step) return { running: false, side: null, label: '', endsAt: null, remainingMs: 0 };
  const started = Number(board.turnStartedAt) || now;
  const endsAt = started + step.ms;
  return {
    running: !!board.turnStartedAt,
    side: step.side,
    label: step.label,
    index: Math.max(0, Math.floor(Number(board.speechIdx) || 0)),
    total: STRUCTURED_SEQUENCE.length,
    endsAt,
    remainingMs: Math.max(0, endsAt - now),
    expired: !!board.turnStartedAt && now >= endsAt,
  };
}

// Who is allowed a live microphone right now. In structured mode that is
// one seat; in casual mode it is both, which IS the mode.
//
// The stage client mutes itself off this, and the host keeps an eject as
// the enforceable backstop. A client that ignores it is talking out of
// turn in a structured round, which the judge is shown and told not to
// score. Reaching into somebody else's microphone from our server would
// be a larger power than this feature needs.
export function floorHolders(board) {
  if (!board || board.status !== 'debating') return [];
  if (board.mode === 'casual') return SIDES.filter((s) => board.seats && board.seats[s]);
  const step = structuredStep(board.speechIdx);
  return step && board.seats && board.seats[step.side] ? [step.side] : [];
}

export function advanceStructured(board, now = Date.now()) {
  const next = Math.max(0, Math.floor(Number(board.speechIdx) || 0)) + 1;
  if (next >= STRUCTURED_SEQUENCE.length) {
    return { status: 'ended', speechIdx: STRUCTURED_SEQUENCE.length, turnStartedAt: null, endedAt: now };
  }
  return { status: 'debating', speechIdx: next, turnStartedAt: now };
}

// ── Turns ───────────────────────────────────────────────────────────
//
// A turn is one continuous stretch of one person talking, as their own
// browser heard it. Each client transcribes its own microphone, so the
// text necessarily comes from a participant. The SIDE and the NAME on it
// do not: those are stamped by the endpoint from the seat map against
// the verified uid, which is the difference between a transcript and a
// submission.

export function buildTurn(input = {}, board, now = Date.now()) {
  const side = seatOf(board, input.uid);
  if (!side) return { error: 'not seated' };
  const text = cleanText(input.text, MAX_TURN_CHARS);
  if (!text) return { error: 'empty turn' };

  // Offsets arrive in SERVER time: every poll hands the client the
  // server clock so it can correct its own. Two browsers timestamping
  // one conversation from two unsynchronized clocks is the whole reason
  // overlap is treated as annotation rather than as evidence.
  const rawStart = Number.isFinite(Number(input.startedAt)) ? Number(input.startedAt) : now;
  const rawEnd = Number.isFinite(Number(input.endedAt)) ? Number(input.endedAt) : now;
  const open = Number(board && board.openedAt) || rawStart;
  const startedAt = Math.max(open, Math.min(rawStart, rawEnd));
  return {
    turn: {
      uid: String(input.uid || ''),
      side,
      name: (board.seats[side] && board.seats[side].name) || (side === 'pro' ? 'Pro' : 'Con'),
      text,
      startedAt,
      endedAt: Math.max(startedAt, rawEnd),
      speechIdx: board.mode === 'structured' ? Math.max(0, Math.floor(Number(board.speechIdx) || 0)) : null,
      at: now,
    },
  };
}

export function sortTurns(turns) {
  return (Array.isArray(turns) ? turns : [])
    .filter((t) => t && t.text)
    .slice(0, MAX_TURNS)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0) || (a.at || 0) - (b.at || 0));
}

export function isBackchannel(turn) {
  if (!turn) return true;
  const words = String(turn.text || '').trim().split(/\s+/).filter(Boolean).length;
  const dur = Math.max(0, (turn.endedAt || 0) - (turn.startedAt || 0));
  return words <= BACKCHANNEL_WORDS && dur <= BACKCHANNEL_MS;
}

/**
 * Mark which turns began while the other side was still talking.
 *
 * THIS IS ANNOTATION, NOT EVIDENCE, and the distinction is what makes
 * the feature safe to ship. Two browsers cannot agree on the clock to
 * within a tenth of a second, so a marker here is sometimes wrong. It
 * costs nothing when it is, because the judging method is told in as
 * many words that cutting in never wins or loses a point. What the
 * marker buys is the question that actually matters in an open-floor
 * argument: when a point was cut off mid-sentence, did the other side
 * ever come back and answer it, or did the interruption bury it?
 *
 * A short backchannel ("right", "sure", "no") is never an interruption.
 * People make agreement noises over each other constantly, and calling
 * that floor-taking would mark half of a healthy conversation.
 */
export function markInterruptions(turns) {
  const ordered = sortTurns(turns);
  return ordered.map((turn, i) => {
    if (isBackchannel(turn)) return { ...turn, backchannel: true, interrupts: null, overlapMs: 0 };
    let interrupts = null;
    let overlapMs = 0;
    for (let j = i - 1; j >= 0 && j >= i - 6; j--) {
      const prev = ordered[j];
      if (!prev || prev.side === turn.side || isBackchannel(prev)) continue;
      const overlap = (prev.endedAt || 0) - (turn.startedAt || 0);
      if (overlap > INTERRUPT_GRACE_MS) {
        interrupts = prev.side;
        overlapMs = Math.round(overlap);
      }
      break;
    }
    return { ...turn, interrupts, overlapMs, backchannel: false };
  });
}

/**
 * Airtime per side, in milliseconds and words.
 *
 * Reported to the judge and immediately disarmed by the method: the side
 * that talked more did not thereby win. It is reported at all because a
 * judge that cannot see a four-to-one split cannot tell the difference
 * between someone who was concise and someone who never got a word in,
 * and those two deserve very different ballots.
 */
export function airtime(turns) {
  const out = { pro: { ms: 0, words: 0, turns: 0 }, con: { ms: 0, words: 0, turns: 0 } };
  for (const t of sortTurns(turns)) {
    const bucket = out[t.side];
    if (!bucket) continue;
    bucket.ms += Math.max(0, (t.endedAt || 0) - (t.startedAt || 0));
    bucket.words += String(t.text || '').trim().split(/\s+/).filter(Boolean).length;
    bucket.turns += 1;
  }
  return out;
}

export function stamp(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/**
 * The transcript the judge reads for a CASUAL round.
 *
 * Deliberately not a list of speeches. It is a timestamped dialogue with
 * the cut-ins marked, because the artifact being judged is an exchange:
 * who asked what, who answered, who changed the subject, and what got
 * buried under an interruption. Rendering it as tidy alternating blocks
 * would delete the one thing that makes conversational judging possible.
 */
export function conversationTranscript(turns, board) {
  const marked = markInterruptions(turns);
  const open = Number(board && board.openedAt) || (marked[0] && marked[0].startedAt) || 0;
  return marked.map((t, i) => {
    const at = stamp((t.startedAt || open) - open);
    const who = `${t.name || (t.side === 'pro' ? 'Pro' : 'Con')} (${t.side.toUpperCase()})`;
    const cut = t.interrupts ? ` [cuts in over ${t.interrupts.toUpperCase()}]` : '';
    const back = t.backchannel ? ' [short reaction]' : '';
    return `[${i + 1}] ${at} ${who}${cut}${back}: ${t.text}`;
  }).join('\n');
}

/**
 * The transcript the judge reads for a STRUCTURED round: turns grouped
 * back into the speech they belong to, because in that mode the speech
 * is the unit and the segmentation is an artifact of how the microphone
 * was captured rather than anything that happened in the room.
 */
export function structuredTranscript(turns, board) {
  const ordered = sortTurns(turns);
  const bySpeech = new Map();
  for (const t of ordered) {
    const idx = Number.isFinite(Number(t.speechIdx)) ? Number(t.speechIdx) : 0;
    if (!bySpeech.has(idx)) bySpeech.set(idx, []);
    bySpeech.get(idx).push(t);
  }
  const out = [];
  STRUCTURED_SEQUENCE.forEach((step, idx) => {
    const chunk = bySpeech.get(idx) || [];
    const own = chunk.filter((t) => t.side === step.side);
    const intruders = chunk.filter((t) => t.side !== step.side && !isBackchannel(t));
    const seat = (board && board.seats && board.seats[step.side]) || null;
    const who = `${(seat && seat.name) || step.side.toUpperCase()} (${step.side.toUpperCase()})`;
    const body = own.map((t) => t.text).join(' ').trim();
    if (!body && !intruders.length) return;
    out.push(`[${idx + 1}] ${step.label} — ${who}:\n${body || '(no speech recorded)'}`);
    if (intruders.length) {
      // Reported, and the method is told not to score it. Somebody
      // talking out of turn is a stage-management problem for the host,
      // not a debating fault for the judge to price.
      out.push(`    (off-turn from the other side during this speech: ${intruders.map((t) => '"' + t.text.slice(0, 160) + '"').join(' ')})`);
    }
  });
  return out.join('\n\n');
}

export function transcriptFor(turns, board) {
  return board && board.mode === 'casual'
    ? conversationTranscript(turns, board)
    : structuredTranscript(turns, board);
}

/**
 * Is there enough here to judge?
 *
 * A stage round can end because the clock ran out on two people who
 * barely spoke, and a ballot written over forty words is a ballot that
 * invented most of what it describes. Both sides have to have said
 * something substantive: one person monologuing for eight minutes at a
 * silent guest is not an argument and must not be scored as one.
 */
export function judgeReadiness(turns, board) {
  const air = airtime(turns);
  const substantive = sortTurns(turns).filter((t) => !isBackchannel(t));
  if (substantive.length < 4) return { ok: false, code: 'too_short', air };
  if (air.pro.words < 60) return { ok: false, code: 'pro_silent', air };
  if (air.con.words < 60) return { ok: false, code: 'con_silent', air };
  return { ok: true, air };
}

/**
 * The airtime line handed to the judge, with its own disclaimer
 * attached. The number and the warning travel together on purpose: a
 * later edit that keeps one and drops the other is how "who talked more"
 * quietly becomes "who won".
 */
export function airtimeBrief(turns) {
  const air = airtime(turns);
  return [
    `AIRTIME (context only, never a reason to prefer a side): `
      + `Pro spoke ${stamp(air.pro.ms)} across ${air.pro.turns} turns, ${air.pro.words} words. `
      + `Con spoke ${stamp(air.con.ms)} across ${air.con.turns} turns, ${air.con.words} words.`,
    'Talking more is not arguing better. Use this only to tell a concise debater apart from one who could not get a word in.',
  ].join('\n');
}

// ── The public projection ───────────────────────────────────────────
//
// What a tokenless viewer is allowed to know. Names and sides are public
// (they are on camera on the stream, saying them). Uids are not: a stage
// uid plus the public profile surfaces is a way to assemble a
// participant list nobody agreed to publish.

export function publicBoard(board, now = Date.now()) {
  if (!board || board.status === 'idle' || !board.mode) {
    return { active: false, status: 'idle', serverNow: now };
  }
  const seats = {};
  for (const side of SIDES) {
    const seat = board.seats && board.seats[side];
    seats[side] = seat
      ? { name: seat.name || (side === 'pro' ? 'Pro' : 'Con'), role: seat.role || 'guest' }
      : null;
  }
  return {
    active: board.status === 'debating' || board.status === 'judging',
    status: board.status,
    mode: board.mode,
    motion: board.motion || '',
    seats,
    clock: clockFor(board, now),
    // The anchor, not the tick. Clients derive a smooth countdown from
    // this through a cached response, which is what keeps the public
    // read on a shared cache instead of one invocation per viewer.
    serverNow: now,
  };
}
