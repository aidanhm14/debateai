// ─────────────────────────────────────────────────────────────
// The crowd verdict — the audience decides an elimination final.
//
// The Open runs prelims on the AI panel and hands the FINAL to the room:
// the audience vote is the verdict and it controls the prize, while the
// panel still writes its ballot on the same round and publishes beside
// it. Two records, one of them decides.
//
// WHY THIS IS OFF BY DEFAULT
// `crowdVerdict` is a per-round flag and nothing sets it except a host.
// Every ordinary round, every prelim, and every casual spar keeps the
// published rubric and is untouched by this file. A popularity vote is
// the right instrument for one round a season and the wrong one for a
// ladder, because it measures who brought friends.
//
// WHY NAMED ACCOUNTS ONLY
// Firebase anonymous accounts are free and unlimited to mint here (see
// the 2026-07-28 rate-limit entry), so an anonymous vote is not one
// person, it is one loop. A vote that decides $500 has to cost a real
// account to cast. This is the same `sign_in_provider != 'anonymous'`
// line firestore.rules calls isNamedAccount.
//
// WHY DEBATERS CANNOT VOTE
// They are the interested parties. Same reason the appeal bench
// disqualifies a reviewer who debated the round.
//
// Pure module: no I/O, no Firestore, no clock beyond what is handed in.
// The endpoint does the reads; everything decidable is decided here so
// it can be tested without a database.
// ─────────────────────────────────────────────────────────────

export const VOTE_STATES = ['pending', 'open', 'closed'];

// How long the room gets once voting opens. Long enough that a viewer
// who stepped away for the last speech can still vote, short enough
// that the result lands while the stream is still on.
export const VOTE_WINDOW_MS = 3 * 60 * 1000;

// Below this, a crowd verdict is not a verdict. A final decided 2-1 by
// three people is worse than no crowd verdict at all, because it looks
// like a result and is noise. Under the floor the round falls back to
// the panel ballot, and the rules say so in advance rather than after
// somebody loses on it.
export const MIN_VOTES = 10;

// A margin this thin is inside the noise of who happened to be watching,
// so the panel ballot resolves it. Stated in advance for the same reason
// the floor is: a tiebreak invented after a close result is a thumb on
// the scale.
export const TIE_MARGIN = 0.02;

export function isDebater(round, uid) {
  if (!round || !uid) return false;
  return uid === round.proUid || uid === round.conUid
      || uid === round.proUid2 || uid === round.conUid2;
}

/**
 * Is voting open on this round right now, and if not, why not.
 * Returns { open: bool, state, reason?, closesAt? }.
 *
 * The window opens when the LAST SPEECH IS DONE, never earlier: voting
 * mid-round would be voting on half a debate, and the half people saw
 * would depend on when they arrived.
 */
export function voteWindow(round, now) {
  const at = Number(now) || 0;
  if (!round) return { open: false, state: 'pending', reason: 'not_found' };
  if (round.crowdVerdict !== true) return { open: false, state: 'pending', reason: 'not_a_crowd_round' };

  // A host can close early from the control room. That wins over the timer.
  if (round.crowdVoteState === 'closed') {
    return { open: false, state: 'closed', reason: 'closed', closesAt: round.crowdVoteClosesAt || 0 };
  }
  if (round.status !== 'ballot') {
    return { open: false, state: 'pending', reason: 'round_in_progress' };
  }
  const closesAt = Number(round.crowdVoteClosesAt) || 0;
  if (closesAt && at >= closesAt) {
    return { open: false, state: 'closed', reason: 'closed', closesAt };
  }
  return { open: true, state: 'open', closesAt };
}

/**
 * Read the tally. `panelWinner` is the AI panel's call on the same
 * round, used only when the crowd cannot carry it.
 *
 * Returns the decision AND the reason, because "the crowd decided" and
 * "the crowd was too thin so the panel decided" must be distinguishable
 * on the record and on screen. A result that hides which rule produced
 * it is the thing this whole layer exists to avoid.
 */
export function tallyCrowd(round, panelWinner) {
  const votes = (round && round.crowdVotes) || {};
  const pro = Math.max(0, Number(votes.pro) || 0);
  const con = Math.max(0, Number(votes.con) || 0);
  const total = pro + con;
  const pctPro = total ? pro / total : 0.5;
  const margin = Math.abs(pctPro - 0.5) * 2;

  const base = {
    pro, con, total,
    pctPro: Math.round(pctPro * 100),
    leader: pro === con ? null : (pro > con ? 'pro' : 'con'),
  };

  if (total < MIN_VOTES) {
    return { ...base, winner: panelWinner || null, decidedBy: 'panel', reason: 'too_few_votes' };
  }
  if (margin < TIE_MARGIN) {
    return { ...base, winner: panelWinner || null, decidedBy: 'panel', reason: 'inside_margin' };
  }
  return { ...base, winner: base.leader, decidedBy: 'crowd', reason: 'crowd_majority' };
}

/**
 * May this account cast a vote. Split from the window check so the
 * client can render an honest disabled state ("debaters cannot vote on
 * their own round") instead of a button that fails on tap.
 */
export function canVote(round, voter, now) {
  const win = voteWindow(round, now);
  if (!win.open) return { ok: false, reason: win.reason };
  if (!voter || !voter.uid) return { ok: false, reason: 'sign_in' };
  if (!voter.named) return { ok: false, reason: 'named_account_required' };
  if (isDebater(round, voter.uid)) return { ok: false, reason: 'debater' };
  return { ok: true, closesAt: win.closesAt };
}
