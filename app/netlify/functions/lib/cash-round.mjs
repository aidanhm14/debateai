// ─────────────────────────────────────────────────────────────
// THE CASH ROUND — two people pay to compete, the winner takes the pot.
//
// This is the first surface on this site where real money moves on the
// result of an argument, so the rules are here, in one pure file, and
// asserted by scripts/test-cash-round.mjs in the pre-commit hook.
//
// It is a CONTEST OF SKILL, not a wager. The people paying are the
// people competing, they decide the outcome by arguing better, and no
// spectator can put money on it. That distinction is the whole legal
// posture of the feature and every rule below exists to keep it true.
//
// ── The four money decisions, and why ───────────────────────────────
//
// 1. THE HOUSE FEE IS CHARGED AT THE DOOR, BEFORE ANYONE KNOWS THE
//    OUTCOME, AND IS IDENTICAL FOR BOTH SIDES.
//    The judge-integrity layer forbids a rake in credits.mjs and
//    settle.mjs with a specific reason: "the operator's take cannot
//    depend on who wins." A flat entry fee, taken from both debaters
//    at the same rate before a word is spoken, does not depend on who
//    wins. It is the same number whichever way the ballot goes, and
//    the house is therefore indifferent to the result, which is the
//    property that rule is protecting.
//
//    What stays forbidden, and `awardPot` asserts it: taking anything
//    out of the pot at SETTLEMENT. A cut at the door is a price. A cut
//    at settlement is a stake in the verdict our own judge writes.
//
// 2. THE WINNER TAKES THE POT, ALL OF IT.
//    Two people put in the same amount and one of them leaves with
//    everything the fee did not take. There is no consolation split,
//    because a contest whose loser gets paid is not a contest, and no
//    second deduction, because the pot was already priced.
//
// 3. A ROUND THAT PRODUCES NO VERDICT REFUNDS EVERYTHING, THE FEE
//    INCLUDED.
//    Nobody paid to sit in a queue. If the second debater never turns
//    up, or the round is abandoned, or the panel splits and records
//    `unresolved`, every debater gets their WHOLE buy-in back, gross,
//    and this site earns nothing on it. `refundPlan` returns the gross
//    figure for exactly that reason and the guard asserts it: refunding
//    net would mean charging people for a debate that never happened.
//
// 4. MONEY NEVER MOVES ON AN AI BALLOT ALONE.
//    A verdict marks the winner OWED. It does not pay them. The payout
//    unlocks only after the appeal window has closed with no appeal
//    open, and an admin sends it. Same posture as tournament prizes and
//    bounty pots, and the same reason: a machine that both decides the
//    round and releases the money is the circularity /judge-integrity
//    exists to refuse.
//
// A cash round settles only on `verdictSource:'server'`, matching
// MONEY_VERDICT_SOURCES in settle.mjs. A ballot written by one of the
// two interested browsers cannot move their money.
// ─────────────────────────────────────────────────────────────
import { checkContent } from './content-guard.mjs';

// ── status machine ──────────────────────────────────────────────────
// Server-owned. A client asks for an action and the server decides
// whether the move is legal; an illegal transition is a bug or an
// attack, and both should fail loudly rather than quietly.
export const STATUSES = [
  'open',      // created, waiting for a second debater and both buy-ins
  'funded',    // both paid, the round can be played
  'settled',   // verdict in, pot owed to the winner, appeal window running
  'paid',      // the winner has been paid
  'void',      // no verdict will come, buy-ins owed back in full
  'refunded',  // every buy-in has been sent back
];

const TRANSITIONS = {
  // A funded round can still void: someone walks, the panel splits, or
  // it simply never gets played before it expires.
  open:     ['funded', 'void'],
  funded:   ['settled', 'void'],
  // An appeal that overturns the verdict rewrites the winner while the
  // round stays settled. It does not need its own status; what it must
  // never do is reach a round already marked paid, which is why `paid`
  // is terminal and the appeal window gates the payout rather than
  // following it.
  settled:  ['paid', 'void'],
  paid:     [],
  void:     ['refunded'],
  refunded: [],
};

export function canTransition(from, to) {
  if (!STATUSES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export const FUNDABLE_STATUSES = new Set(['open']);
export const REFUNDABLE_STATUSES = new Set(['void']);
export const TERMINAL_STATUSES = new Set(['paid', 'refunded']);

// Mirrors the live-round supported set, and for the same reason bounty
// does: a cash round is two humans against each other, so the format
// has to be one two humans can actually run.
export const FORMATS = [
  'quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy',
];

export const SEATS = 2;

// ── the price ───────────────────────────────────────────────────────
// 20%, in basis points so the maths stays in integers. It is a
// constant rather than a per-round field on purpose: a fee that can be
// set per round is a fee that can be set differently for a round the
// operator has an interest in, and the point of decision 1 is that it
// never varies with anything about the contest.
export const FEE_BPS = 2000;

// Blast-radius limits, not business rules. They exist so a bug, a
// retry loop, or a fat-fingered zero cannot become a large real-money
// incident on a product whose payouts are still sent by hand.
export const MIN_BUY_IN_CENTS = 200;    // $2
export const MAX_BUY_IN_CENTS = 5000;   // $50
export const BUY_IN_PRESETS = [500, 1000, 2500];
export const DEFAULT_BUY_IN_CENTS = 500;

export const MIN_EXPIRY_HOURS = 1;
export const MAX_EXPIRY_HOURS = 168;    // one week
export const DEFAULT_EXPIRY_HOURS = 48;

const MAX_NAME = 60;
const MAX_NOTE = 240;

/**
 * The house fee on one buy-in.
 *
 * Takes the buy-in and NOTHING ELSE. The signature is the guarantee:
 * with no round, no winner and no debater in scope, the fee cannot be
 * made to depend on any of them, and the guard asserts the arity so it
 * stays that way. Rounds half-up, so a 1-cent rounding difference
 * always lands with the house rather than being conjured into the pot,
 * which keeps `collected === pot + fee` exact.
 */
export function feeOf(buyInCents) {
  const gross = Math.max(0, Math.trunc(Number(buyInCents) || 0));
  return Math.round((gross * FEE_BPS) / 10000);
}

/** What one buy-in contributes to the pot, after the door fee. */
export function netOf(buyInCents) {
  const gross = Math.max(0, Math.trunc(Number(buyInCents) || 0));
  return gross - feeOf(gross);
}

/**
 * The full price breakdown for a round at a given buy-in, for both the
 * server and the copy on the page. One function so the number a debater
 * is shown and the number they are charged cannot drift apart.
 */
export function quote(buyInCents, seats = SEATS) {
  const gross = Math.max(0, Math.trunc(Number(buyInCents) || 0));
  const n = Math.max(1, Math.trunc(Number(seats) || SEATS));
  const fee = feeOf(gross);
  const net = gross - fee;
  return {
    buyInCents: gross,
    feeCents: fee,
    netCents: net,
    seats: n,
    collectedCents: gross * n,
    potCents: net * n,
    platformCents: fee * n,
    // What the winner walks away with, which is the only figure most
    // people reading the page actually care about.
    winnerTakesCents: net * n,
    // Profit on the round, stated plainly so nobody has to derive it.
    profitCents: net * n - gross,
  };
}

/**
 * Award the pot. One winner, the whole pot, no deductions.
 *
 * Takes the pot and the winner. It does NOT take a fee, a rate, or a
 * house account, because a deduction here would be a cut of a verdict
 * our own judge wrote. Throws if the payout does not equal the pot to
 * the cent, so a future edit that quietly skims cannot settle silently.
 */
export function awardPot(potCents, winner) {
  const pot = Math.max(0, Math.trunc(Number(potCents) || 0));
  if (!winner || !winner.uid) {
    throw new Error('awardPot needs a winner; an undecided round must void, not pay');
  }
  const splits = [{ uid: winner.uid, name: winner.name || '', cents: pot }];
  const total = splits.reduce((sum, s) => sum + s.cents, 0);
  if (total !== pot) {
    throw new Error(`awardPot lost money: ${total} paid out of ${pot} pot`);
  }
  return splits;
}

/**
 * What is owed back when a round produces no verdict.
 *
 * GROSS, deliberately. Each debater gets the whole amount their card
 * was charged, fee included, because the fee bought a judged round and
 * there wasn't one. Anything less would be charging for a service not
 * delivered, and it is the single easiest place in this file to take
 * money that is not ours.
 */
export function refundPlan(entrants) {
  const list = Array.isArray(entrants) ? entrants.filter((e) => e && e.uid) : [];
  return list
    .filter((e) => Number(e.paidCents) > 0)
    .map((e) => ({
      uid: e.uid,
      name: e.name || '',
      // paidCents is what Stripe took, so it is what goes back.
      cents: Math.max(0, Math.trunc(Number(e.paidCents) || 0)),
    }));
}

// ── settlement gates ────────────────────────────────────────────────

/**
 * Whether a verdict may settle this round.
 *
 * Mirrors MONEY_VERDICT_SOURCES in settle.mjs: a ballot written by a
 * participant's own browser cannot move that participant's money, and
 * a panel that split has not decided anything, so it voids rather than
 * picking a side. There is no tie-break here and there must never be
 * one; any tie-break rule would be the house's thumb on a contest the
 * house is holding the money for.
 */
export function canSettle(round, judgment) {
  if (!round) return { ok: false, reason: 'no_round' };
  if (round.status !== 'funded') {
    return { ok: false, reason: 'not_funded' };
  }
  if (!judgment) return { ok: false, reason: 'no_judgment' };
  if (judgment.verdictSource !== 'server') {
    return { ok: false, reason: 'unverified_verdict' };
  }
  if (judgment.resolution === 'unresolved' || !judgment.winner) {
    // A split panel is a round nobody won. Void and give it all back.
    return { ok: false, reason: 'unresolved', shouldVoid: true };
  }
  const seats = Array.isArray(round.entrants) ? round.entrants : [];
  // A judgment names its winner as a SIDE KEY ('a' or 'b') and carries
  // the uids in `participants`, so the uid is resolved through that map
  // rather than by matching a side label against our own. Our sides are
  // pro/con and a judgment's may be prop/opp, and quietly matching on a
  // label that means something else is how the wrong person gets paid.
  //
  // There is deliberately NO fallback to matching the winner key
  // against a seat's uid. It looked harmless and it is not: a judgment
  // with no participants map would then pay whichever seat happened to
  // hold a uid spelled like a side key. A judgment that cannot say who
  // won must fail to settle, not guess.
  const byKey = judgment.participants && judgment.participants[judgment.winner];
  if (!byKey) return { ok: false, reason: 'winner_not_identified' };
  const winner = seats.find((e) => e && e.uid && e.uid === byKey);
  if (!winner) return { ok: false, reason: 'winner_not_in_round' };
  return { ok: true, winner };
}

/**
 * Whether the pot may actually be sent.
 *
 * Two conditions, both about the appeal rather than the ballot: the
 * window has to have closed, and no appeal may be open. `windowMs` is
 * passed in from APPEAL_WINDOW_MS so the money layer and the appeal
 * layer can never disagree about how long someone has to object.
 */
export function canPay(round, windowMs, nowMs) {
  if (!round) return { ok: false, reason: 'no_round' };
  if (round.status !== 'settled') return { ok: false, reason: 'not_settled' };
  if (round.payout && round.payout.status === 'paid') {
    return { ok: false, reason: 'already_paid' };
  }
  if (round.disputeState === 'open') return { ok: false, reason: 'appeal_open' };
  const settledAt = Number(round.settledAt) || 0;
  const now = Number(nowMs) || Date.now();
  const window = Number(windowMs) || 0;
  if (!settledAt) return { ok: false, reason: 'no_settled_at' };
  if (now < settledAt + window) {
    return { ok: false, reason: 'window_open', opensAt: settledAt + window };
  }
  return { ok: true };
}

// ── validation ──────────────────────────────────────────────────────

export function validateBuyIn(cents) {
  const value = Math.trunc(Number(cents) || 0);
  if (!Number.isFinite(value) || value < MIN_BUY_IN_CENTS) {
    return { ok: false, reason: `The smallest buy-in is ${formatCents(MIN_BUY_IN_CENTS)}.` };
  }
  if (value > MAX_BUY_IN_CENTS) {
    return { ok: false, reason: `The largest buy-in is ${formatCents(MAX_BUY_IN_CENTS)}.` };
  }
  return { ok: true, value };
}

export function validateRoundInput(input = {}) {
  const motion = String(input.motion || '').trim();
  if (motion.length < 10) {
    return { ok: false, field: 'motion', reason: 'Say what the debate is about, in a sentence.' };
  }
  if (motion.length > 300) {
    return { ok: false, field: 'motion', reason: 'Keep the motion under 300 characters.' };
  }
  const guard = checkContent({ text: motion, kind: 'motion' });
  if (!guard.ok) {
    return { ok: false, field: 'motion', reason: guard.reason, category: guard.category };
  }

  const buyIn = validateBuyIn(input.buyInCents ?? DEFAULT_BUY_IN_CENTS);
  if (!buyIn.ok) return { ok: false, field: 'buyInCents', reason: buyIn.reason };

  const format = FORMATS.includes(input.format) ? input.format : 'quick';

  let note = String(input.note || '').trim().slice(0, MAX_NOTE);
  if (note) {
    const g = checkContent({ text: note, kind: 'message' });
    if (!g.ok) return { ok: false, field: 'note', reason: g.reason, category: g.category };
  }

  let hours = Number(input.expiryHours);
  if (!Number.isFinite(hours)) hours = DEFAULT_EXPIRY_HOURS;
  hours = Math.min(MAX_EXPIRY_HOURS, Math.max(MIN_EXPIRY_HOURS, Math.trunc(hours)));

  return { ok: true, value: { motion, format, buyInCents: buyIn.value, note, expiryHours: hours } };
}

export function isExpired(round, now) {
  const at = Number(round && round.expiresAt) || 0;
  if (!at) return false;
  if (TERMINAL_STATUSES.has(round.status)) return false;
  // A funded round is not killed by the clock: both people have paid,
  // so it is owed a chance to be played rather than a refund.
  if (round.status === 'funded') return false;
  return (Number(now) || Date.now()) > at;
}

/**
 * Whether `uid` may take the empty seat.
 *
 * The creator holds the other one, so they are refused for the same
 * reason bounty refuses its funder: a person on both sides of a pot is
 * not a contest, it is a way to move money through this site.
 */
export function canJoin(round, uid) {
  if (!round || !uid) return { ok: false, reason: 'Sign in to take a seat.' };
  if (!FUNDABLE_STATUSES.has(round.status)) {
    return { ok: false, reason: 'This round is no longer open.' };
  }
  if (isExpired(round)) return { ok: false, reason: 'This round expired before anyone took it.' };
  const entrants = Array.isArray(round.entrants) ? round.entrants : [];
  if (entrants.some((e) => e && e.uid === uid)) {
    return { ok: false, reason: 'You are already in this round.' };
  }
  if (entrants.length >= SEATS) {
    return { ok: false, reason: 'Both seats are taken.' };
  }
  return { ok: true };
}

/** Both seats filled AND both buy-ins actually received. */
export function isFullyFunded(round) {
  const entrants = Array.isArray(round && round.entrants) ? round.entrants : [];
  if (entrants.length < SEATS) return false;
  return entrants.every((e) => e && e.paid === true && Number(e.paidCents) > 0);
}

// ── shapes ──────────────────────────────────────────────────────────

export function makeRoundData({ input, creator, nowMs }) {
  const now = Number(nowMs) || Date.now();
  const q = quote(input.buyInCents);
  return {
    motion: input.motion,
    format: input.format,
    note: input.note || '',
    status: 'open',
    buyInCents: input.buyInCents,
    // Stamped at creation from the constant, so a round always settles
    // on the price it was created under even if the constant later
    // changes. A published price is a promise for that round.
    feeBps: FEE_BPS,
    feeCentsPerSeat: q.feeCents,
    potCents: 0,
    platformCents: 0,
    collectedCents: 0,
    creatorUid: creator.uid,
    creatorName: creator.name || '',
    entrants: [{
      uid: creator.uid,
      name: creator.name || '',
      side: 'pro',
      joinedAt: now,
      paid: false,
      paidCents: 0,
    }],
    payout: { status: 'none', splits: [], paidAt: null },
    refunds: { status: 'none', doneAt: null },
    verdict: null,
    judgmentId: null,
    disputeState: 'none',
    settledAt: null,
    roomId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + input.expiryHours * 3600_000,
  };
}

/**
 * What a browser is allowed to see. The board is public, so this is the
 * projection that decides it. Payment identifiers never leave the
 * server, and neither does anything that would let one debater read the
 * other's Stripe record.
 */
export function publicRound(id, d) {
  if (!d) return null;
  const q = quote(Number(d.buyInCents) || 0);
  return {
    id,
    motion: d.motion || '',
    format: d.format || 'quick',
    note: d.note || '',
    status: d.status || 'open',
    buyInCents: Number(d.buyInCents) || 0,
    feeCents: Number(d.feeCentsPerSeat) || q.feeCents,
    potCents: Number(d.potCents) || 0,
    winnerTakesCents: Number(d.potCents) || 0,
    seats: SEATS,
    entrants: (Array.isArray(d.entrants) ? d.entrants : []).map((e) => ({
      uid: e.uid,
      name: e.name || '',
      side: e.side || null,
      paid: e.paid === true,
    })),
    verdict: d.verdict || null,
    winnerUid: d.payout && Array.isArray(d.payout.splits) && d.payout.splits[0]
      ? d.payout.splits[0].uid : null,
    payoutStatus: (d.payout && d.payout.status) || 'none',
    disputeState: d.disputeState || 'none',
    roomId: d.roomId || null,
    createdAt: Number(d.createdAt) || 0,
    expiresAt: Number(d.expiresAt) || 0,
    settledAt: Number(d.settledAt) || 0,
  };
}

export function formatCents(cents) {
  const n = Math.max(0, Math.trunc(Number(cents) || 0));
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}
