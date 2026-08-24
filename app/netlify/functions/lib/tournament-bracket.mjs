/* lib/tournament-bracket.mjs
 *
 * Age brackets. PURE: no I/O, no Firestore, so it can be tested and so
 * both the pairing queue and the public tab derive the same answer from
 * the same entry doc.
 *
 * There are two brackets and they run side by side on the same day:
 *
 *   'u18'   under 18. Plays for placement and ranking. No cash.
 *   'open'  18 and over. The only bracket cash can reach.
 *
 * WHY THE POOLS ARE SEPARATE, and it is not the prize money. Cash was
 * already restricted to attested adults, so a single field was fine by
 * that measure. It is separate because a live 1:1 video round between a
 * 14-year-old and an adult stranger is a thing a coach has to defend to
 * a parent, and "they were matched by the same queue" is not a defence.
 * The split is the answer to that question, and it is the reason the
 * coach email can promise "your high schoolers are matched with each
 * other".
 *
 * AN ENTRY WITH NO BRACKET IS NEVER PAIRED. That is the whole safety
 * property, so it is stated once, here, and enforced at the queue.
 * Defaulting an unknown age to either side is the one thing this module
 * must not do: default to 'open' and a minor meets adults, default to
 * 'u18' and an adult is seated against children. Unknown means ask.
 *
 * LEGACY ENTRIES. Everyone who registered before this shipped has no
 * `bracket` field. An entry that attested 18+ is unambiguous and reads
 * as 'open'; anything else reads as unassigned and gets asked one
 * question the next time it opens the page. Registration is idempotent,
 * so answering is a single tap on the button they already pressed.
 */

export const AGE_BRACKETS = ['u18', 'open'];

export const BRACKET_LABEL = {
  u18: 'Under 18',
  open: '18 and over',
};

/** Is this a bracket the engine knows? */
export function isBracket(value) {
  return AGE_BRACKETS.includes(String(value || ''));
}

/**
 * The bracket an entry belongs to, or '' when nobody has said.
 *
 * Reads the explicit field first. The 18+ attestation is the ONLY
 * legacy signal trusted to stand in for it, because it is a claim the
 * entrant made about their own age; `paidEntry` is not, since a tip
 * says nothing about how old the tipper is.
 */
export function bracketOf(entry) {
  const e = entry || {};
  if (isBracket(e.bracket)) return e.bracket;
  if (e.ageAttested === true || e.prizeEligible === true) return 'open';
  return '';
}

/** Has this entry played anything yet? Bracket is fixed once it has. */
export function hasPlayed(entry) {
  const e = entry || {};
  return (Number(e.wins) || 0) + (Number(e.losses) || 0) + (Number(e.byes) || 0) > 0;
}

/**
 * Resolve what a register call is asking for.
 *
 * `ageAttested` and `bracket` are two ways of saying the same thing and
 * they can disagree, so one of them has to win. The attestation wins,
 * because it is the one with a prize attached and the one written into
 * the published rules. A caller that ticks 18+ is in the open bracket
 * whatever else the body says.
 *
 * Returns { bracket, ageAttested } with bracket '' when the caller has
 * not answered at all.
 */
export function resolveEntryBracket(body) {
  const b = body || {};
  const ageAttested = b.ageAttested === true;
  if (ageAttested) return { bracket: 'open', ageAttested: true };
  if (isBracket(b.bracket)) return { bracket: b.bracket, ageAttested: false };
  return { bracket: '', ageAttested: false };
}

/**
 * May this entry move to `next`?
 *
 * Once a round has been played the bracket is frozen: the standings a
 * placement is read off are per-bracket, so moving someone mid-day
 * carries their record into a field it was not earned in. Before that,
 * a correction is free and should be, because the alternative is a
 * 17-year-old stuck in the adult bracket because of one mis-tap.
 */
export function canChangeBracket(entry, next) {
  if (!isBracket(next)) return false;
  const current = bracketOf(entry);
  if (!current) return true;          // unassigned: any answer is an improvement
  if (current === next) return true;  // no-op
  return !hasPlayed(entry);
}

/**
 * Split a list of entries into pools the queue can pair inside.
 *
 * `unassigned` is returned rather than dropped so the caller can count
 * it and say something true on screen; it is never merged into either
 * pool.
 */
export function partitionByBracket(entries) {
  const out = { u18: [], open: [], unassigned: [] };
  for (const e of Array.isArray(entries) ? entries : []) {
    const b = bracketOf(e);
    if (b) out[b].push(e); else out.unassigned.push(e);
  }
  return out;
}
