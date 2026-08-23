// ─────────────────────────────────────────────────────────────
// The Bounty — money that makes a specific debate happen.
//
// Someone wants to see a particular argument had, by particular
// people, and is willing to pay for it. Anyone else can add to the
// same pot. When two people take it and complete the round, the pot
// pays them.
//
// This file is PURE: shape, status machine, validation, projection,
// split maths. No I/O, no Firestore, no Stripe, no auth. The endpoints
// import it, and so does scripts/test-bounty.mjs, so there is exactly
// one definition of what a bounty is and the money rules are testable
// without touching a payment processor.
//
// ── The three money decisions, and why ──────────────────────────────
//
// 1. THE POT PAYS FOR COMPLETING THE ROUND, NOT FOR WINNING.
//    This is the load-bearing decision in the whole feature and it is
//    not a detail of the split. A pot that goes to the winner is a
//    wager on an outcome our own AI decides, which is the exact
//    circularity the judge-integrity layer exists to prevent, and it
//    would put real money on a verdict that MONEY_VERDICT_SOURCES
//    already refuses to settle on. Paying both debaters the same for
//    showing up and finishing makes the verdict irrelevant to the
//    money, so the judge cannot be worth corrupting and a losing
//    debater is never out of pocket. `splitPot` therefore takes no
//    winner argument. Do not add one.
//
// 2. THE HOUSE TAKES NOTHING. `splitPot` asserts that the splits sum
//    to the pot exactly, to the cent. Same rule as credits.mjs and
//    settle.mjs: the operator's take cannot depend on who competes or
//    who wins, and the cleanest way to guarantee that is to have no
//    take at all. The test suite fails the build if a rake appears.
//
// 3. MONEY THAT DOES NOT PRODUCE A DEBATE GOES BACK.
//    A bounty nobody takes expires and every contribution becomes
//    refundable. Holding a stranger's money for a round that never
//    happened is the one failure here that is genuinely theirs rather
//    than ours, so expiry is mandatory and has a maximum.
//
// Named targets must ACCEPT. You may aim a bounty at a person, and
// that is an invitation with money attached, never an obligation. A
// named person who does nothing simply lets it expire.
// ─────────────────────────────────────────────────────────────
import { checkContent } from './content-guard.mjs';

// ── status machine ──────────────────────────────────────────────────
// Server-owned, exactly like the challenge machine. Clients call an
// action and the server decides whether the move is legal; an illegal
// transition is a bug or an attack and both should fail loudly.
export const STATUSES = [
  'funding',    // open, taking money, waiting for two people to claim it
  'claimed',    // two debaters accepted, round not finished yet
  'completed',  // round done, pot owed to the debaters
  'expired',    // nobody took it in time, contributions refundable
  'cancelled',  // creator or an admin pulled it, contributions refundable
  'refunded',   // every contribution has been sent back
];

const TRANSITIONS = {
  // A claim can fall through (someone withdraws) back to funding, which
  // is why claimed is not a one-way door.
  funding:   ['claimed', 'expired', 'cancelled'],
  claimed:   ['completed', 'funding', 'expired', 'cancelled'],
  completed: [],
  expired:   ['refunded', 'cancelled'],
  cancelled: ['refunded'],
  refunded:  [],
};

export function canTransition(from, to) {
  if (!STATUSES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

// Statuses where the pot can still grow. A claimed bounty still takes
// money on purpose: interest usually spikes once a real matchup is
// locked in, and that money is going to the same two people either way.
export const FUNDABLE_STATUSES = new Set(['funding', 'claimed']);
// Statuses where contributions are owed back to whoever paid them.
export const REFUNDABLE_STATUSES = new Set(['expired', 'cancelled']);
export const TERMINAL_STATUSES = new Set(['completed', 'refunded']);

export const TARGET_KINDS = ['open', 'named'];

// Mirrors the live-round supported set. The Career trio and the AI-only
// formats are deliberately absent: a bounty pays two humans, so the
// format has to be one two humans can actually run against each other.
export const FORMATS = [
  'quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy',
];

// ── money bounds ────────────────────────────────────────────────────
// Every one of these is a blast-radius limit rather than a business
// rule. They exist so that a bug, a stuck retry loop, or someone
// fat-fingering a zero cannot become a large real-money incident.
export const MIN_CONTRIBUTION_CENTS = 200;      // $2
export const MAX_CONTRIBUTION_CENTS = 50000;    // $500 per person, per bounty
export const MAX_POT_CENTS = 500000;            // $5,000 total
export const MAX_TARGETS = 2;
export const MIN_EXPIRY_DAYS = 7;
export const MAX_EXPIRY_DAYS = 90;
export const DEFAULT_EXPIRY_DAYS = 30;
export const DEBATERS_NEEDED = 2;

const MAX_NAME = 60;
const MAX_NOTE = 240;

// ── split maths ─────────────────────────────────────────────────────
// Equal shares, no winner term, no house term. Integer cents only,
// because floating point money is how ledgers stop adding up.
//
// The remainder from an odd pot goes to the debater who accepted
// FIRST. It has to go somewhere, "somewhere" has to be deterministic
// so two runs of settlement agree, and rewarding the person who
// committed to the round first is the least arbitrary rule available.
// It is at most one cent per debater.
export function splitPot(potCents, debaters) {
  const pot = Math.max(0, Math.trunc(Number(potCents) || 0));
  const list = Array.isArray(debaters) ? debaters.filter(Boolean) : [];
  if (!list.length) return [];

  const ordered = list.slice().sort((a, b) => (a.acceptedAt || 0) - (b.acceptedAt || 0));
  const base = Math.floor(pot / ordered.length);
  let remainder = pot - base * ordered.length;

  const splits = ordered.map((d) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { uid: d.uid, name: d.name || '', cents: base + extra };
  });

  // The no-rake invariant, asserted rather than assumed. If this ever
  // throws, settlement must stop: silently paying out less than was
  // collected is the operator taking a cut by accident.
  const total = splits.reduce((sum, s) => sum + s.cents, 0);
  if (total !== pot) {
    throw new Error(`splitPot lost money: ${total} paid out of ${pot} collected`);
  }
  return splits;
}

// ── validation ──────────────────────────────────────────────────────
export function validateBountyInput(input = {}) {
  const motion = String(input.motion || '').trim();
  if (motion.length < 10) {
    return { ok: false, field: 'motion', reason: 'Say what the debate is about, in a sentence.' };
  }
  if (motion.length > 300) {
    return { ok: false, field: 'motion', reason: 'Keep the motion under 300 characters.' };
  }
  // The motion lands on a public board, a share card and a permanent
  // record, so it gets the same guard a challenge claim gets.
  const guard = checkContent({ text: motion, kind: 'motion' });
  if (!guard.ok) {
    return { ok: false, field: 'motion', reason: guard.reason, category: guard.category };
  }

  const format = FORMATS.includes(input.format) ? input.format : 'quick';
  const targetKind = TARGET_KINDS.includes(input.targetKind) ? input.targetKind : 'open';

  const rawTargets = Array.isArray(input.targets) ? input.targets : [];
  const targets = [];
  for (const t of rawTargets.slice(0, MAX_TARGETS)) {
    const name = String((t && t.name) || '').trim().slice(0, MAX_NAME);
    if (!name) continue;
    const g = checkContent({ text: name, kind: 'name' });
    if (!g.ok) return { ok: false, field: 'targets', reason: g.reason, category: g.category };
    targets.push({
      name,
      uid: typeof t.uid === 'string' && t.uid.length >= 8 ? t.uid : null,
      handle: typeof t.handle === 'string' ? t.handle.slice(0, 30).toLowerCase() : null,
      accepted: false,
    });
  }
  if (targetKind === 'named' && !targets.length) {
    return { ok: false, field: 'targets', reason: 'Name at least one person, or make it open to anyone.' };
  }

  let note = String(input.note || '').trim().slice(0, MAX_NOTE);
  if (note) {
    const g = checkContent({ text: note, kind: 'message' });
    if (!g.ok) return { ok: false, field: 'note', reason: g.reason, category: g.category };
  }

  let days = Number(input.expiryDays);
  if (!Number.isFinite(days)) days = DEFAULT_EXPIRY_DAYS;
  days = Math.min(MAX_EXPIRY_DAYS, Math.max(MIN_EXPIRY_DAYS, Math.trunc(days)));

  return { ok: true, value: { motion, format, targetKind, targets, note, expiryDays: days } };
}

// Contribution amount, validated against the bounty it is going into so
// a single payment can never take a pot over its ceiling.
export function validateContribution(amountCents, bounty) {
  const cents = Math.trunc(Number(amountCents) || 0);
  if (!Number.isFinite(cents) || cents < MIN_CONTRIBUTION_CENTS) {
    return { ok: false, reason: `The smallest contribution is ${formatCents(MIN_CONTRIBUTION_CENTS)}.` };
  }
  if (cents > MAX_CONTRIBUTION_CENTS) {
    return { ok: false, reason: `The most one person can add is ${formatCents(MAX_CONTRIBUTION_CENTS)}.` };
  }
  if (bounty) {
    if (!FUNDABLE_STATUSES.has(bounty.status)) {
      return { ok: false, reason: 'This bounty is not taking contributions.' };
    }
    if (isExpired(bounty)) {
      return { ok: false, reason: 'This bounty has expired and is being refunded.' };
    }
    const pot = Math.max(0, Math.trunc(Number(bounty.potCents) || 0));
    if (pot + cents > MAX_POT_CENTS) {
      return { ok: false, reason: `This pot is capped at ${formatCents(MAX_POT_CENTS)}.` };
    }
  }
  return { ok: true, value: cents };
}

export function isExpired(bounty, now) {
  const at = Number(bounty && bounty.expiresAt) || 0;
  if (!at) return false;
  if (TERMINAL_STATUSES.has(bounty.status)) return false;
  return (Number(now) || Date.now()) > at;
}

// Whether `uid` is allowed to take this bounty. A named bounty is an
// invitation to the people named on it; an open one is for anyone.
// The creator is refused either way: funding a debate and then paying
// yourself out of your own pot is not a debate anyone commissioned.
export function canClaim(bounty, uid) {
  if (!bounty || !uid) return { ok: false, reason: 'Sign in to take a bounty.' };
  if (!FUNDABLE_STATUSES.has(bounty.status)) {
    return { ok: false, reason: 'This bounty is no longer open.' };
  }
  if (isExpired(bounty)) return { ok: false, reason: 'This bounty has expired.' };
  if (bounty.creatorUid === uid) {
    return { ok: false, reason: 'You cannot debate a bounty you funded.' };
  }
  const debaters = Array.isArray(bounty.debaters) ? bounty.debaters : [];
  if (debaters.some((d) => d && d.uid === uid)) {
    return { ok: false, reason: 'You have already taken this one.' };
  }
  if (debaters.length >= DEBATERS_NEEDED) {
    return { ok: false, reason: 'Both sides are taken.' };
  }
  if (bounty.targetKind === 'named') {
    const targets = Array.isArray(bounty.targets) ? bounty.targets : [];
    // A target matches by uid. The caller binds a handle to a uid before
    // calling this (see the claim action), because a bounty aimed at
    // someone who has never signed up has no uid to match against, and
    // that is the ONLY interesting case: the whole point of a named
    // bounty is reaching a person who is not here yet.
    const named = targets.some((t) => t && t.uid && t.uid === uid);
    // A named bounty with an unclaimed open seat is takeable by anyone
    // once every named person has accepted, because at that point the
    // people it was aimed at have said yes and the round still needs a
    // second chair.
    const allNamedIn = targets.every((t) => !t.uid || debaters.some((d) => d.uid === t.uid));
    if (!named && !allNamedIn) {
      return { ok: false, reason: 'This bounty is aimed at specific people.' };
    }
  }
  return { ok: true };
}

// ── shape ───────────────────────────────────────────────────────────
export function makeBountyData(value, creator, now) {
  const ts = Number(now) || Date.now();
  return {
    motion: value.motion,
    format: value.format,
    targetKind: value.targetKind,
    targets: value.targets,
    note: value.note || '',
    creatorUid: creator.uid,
    creatorName: creator.name || 'Someone',
    status: 'funding',
    potCents: 0,
    contributorCount: 0,
    currency: 'usd',
    debaters: [],
    roundId: null,
    // Payout and refund are separate ledgers on purpose: a bounty that
    // completed owes the debaters, a bounty that expired owes the
    // funders, and no bounty ever owes both.
    payout: { status: 'none', splits: [], paidAt: null },
    refund: { status: 'none', doneAt: null },
    expiresAt: ts + value.expiryDays * 86400000,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ── projection ──────────────────────────────────────────────────────
// What a browser is allowed to see. Contributor uids never leave the
// server: who paid for a debate is not something the people debating it
// need in order to debate it, and a public funder list keyed by uid
// would tie a real payment to an account for anyone who asked.
export function publicBounty(id, d, viewerUid) {
  if (!d) return null;
  const debaters = (Array.isArray(d.debaters) ? d.debaters : []).map((x) => ({
    name: x.name || 'A debater',
    uid: x.uid || null,
    acceptedAt: x.acceptedAt || null,
  }));
  const out = {
    id,
    motion: d.motion,
    format: d.format,
    note: d.note || '',
    targetKind: d.targetKind,
    // ── An unaccepted name is NOT published (2026-08-23) ────────────
    // A bounty may be aimed at named people, which is what makes a
    // creator matchup possible and is also the one place this feature
    // could hurt someone. Publishing the name of a person who has not
    // agreed puts a permanent, public, money-attached page on a
    // commercial site reading "$500 for <real person> to debate X",
    // with their handle, without their consent. Right of publicity
    // turns on exactly that: commercial use of a name nobody licensed.
    // It also breaks our own standing rule against naming a creator as
    // a participant in a round that has not happened.
    //
    // The name's JOB is routing, deciding who may claim, and routing
    // does not need an audience. So a target is named publicly only
    // once they have ACCEPTED. Before that the name is visible to two
    // parties who already know it: whoever funded the bounty, and the
    // person it names. Everyone else sees that the bounty is aimed
    // somewhere, which is all a stranger needs to decide whether to
    // chip in.
    //
    // The upside is not only safety. It means every publicly named
    // bounty on the board is a real agreed matchup, so the name is
    // worth something when it does appear.
    targets: (Array.isArray(d.targets) ? d.targets : []).map((t) => {
      const accepted = !!t.accepted;
      const isCreator = !!viewerUid && viewerUid === d.creatorUid;
      const isTarget = !!viewerUid && !!t.uid && t.uid === viewerUid;
      if (accepted || isCreator || isTarget) {
        return { name: t.name, handle: t.handle || null, accepted, named: true };
      }
      return { name: null, handle: null, accepted: false, named: false };
    }),
    // How many people it is aimed at, so a card can say "aimed at a
    // specific debater" without naming anyone.
    targetCount: (Array.isArray(d.targets) ? d.targets : []).length,
    creatorName: d.creatorName || 'Someone',
    status: d.status,
    potCents: Math.max(0, Math.trunc(Number(d.potCents) || 0)),
    contributorCount: Math.max(0, Math.trunc(Number(d.contributorCount) || 0)),
    currency: d.currency || 'usd',
    debaters,
    seatsLeft: Math.max(0, DEBATERS_NEEDED - debaters.length),
    roundId: d.roundId || null,
    expiresAt: d.expiresAt || null,
    expired: isExpired(d),
    createdAt: d.createdAt || null,
    // The split is shown BEFORE anyone commits, because "what do I get
    // paid" should never be something a debater has to take on trust.
    projectedSplitCents: debaters.length
      ? splitPot(d.potCents || 0, debaters.length >= DEBATERS_NEEDED
          ? debaters
          : debaters.concat([{ uid: '__open__', name: 'Open seat', acceptedAt: Infinity }]))
          .map((s) => s.cents)
      : evenPreview(d.potCents || 0),
    payoutStatus: (d.payout && d.payout.status) || 'none',
    refundStatus: (d.refund && d.refund.status) || 'none',
  };
  if (viewerUid) {
    out.viewer = {
      isCreator: d.creatorUid === viewerUid,
      isDebater: debaters.some((x) => x.uid === viewerUid),
      canClaim: canClaim(d, viewerUid).ok,
    };
  }
  return out;
}

function evenPreview(potCents) {
  const pot = Math.max(0, Math.trunc(Number(potCents) || 0));
  const base = Math.floor(pot / DEBATERS_NEEDED);
  const rem = pot - base * DEBATERS_NEEDED;
  return [base + (rem > 0 ? 1 : 0), base];
}

export function formatCents(cents, currency) {
  const n = (Math.max(0, Math.trunc(Number(cents) || 0)) / 100);
  const cur = String(currency || 'usd').toUpperCase();
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : '';
  const body = n % 1 === 0 ? String(n) : n.toFixed(2);
  return sym ? `${sym}${body}` : `${body} ${cur}`;
}
