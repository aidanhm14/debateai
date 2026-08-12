// Unit test for lib/crowd-verdict.mjs — the rule that decides an
// elimination final. Run: node scripts/test-crowd-verdict.mjs
//
// Every assertion here is a promise published in the tournament rules
// before the event, so a change that breaks one is a change to the
// terms of a cash contest, not a refactor.
import {
  voteWindow, canVote, tallyCrowd, isDebater,
  MIN_VOTES, TIE_MARGIN, VOTE_WINDOW_MS,
} from '../app/netlify/functions/lib/crowd-verdict.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const NOW = 1_700_000_000_000;
const finalRound = {
  crowdVerdict: true, status: 'ballot', crowdVoteClosesAt: NOW + 60_000,
  proUid: 'p1', conUid: 'c1',
};

// ── the flag is the whole blast radius ──
// Every prelim, every spar, every casual round must be untouched by this.
t('ordinary round never opens', !voteWindow({ status: 'ballot' }, NOW).open);
t('ordinary round says why',    voteWindow({ status: 'ballot' }, NOW).reason === 'not_a_crowd_round');
t('flagged final opens',        voteWindow(finalRound, NOW).open);

// ── the window ──
t('closed while speeches run', !voteWindow({ ...finalRound, status: 'round' }, NOW).open);
t('reason names the speeches',  voteWindow({ ...finalRound, status: 'round' }, NOW).reason === 'round_in_progress');
t('closed after the timer',    !voteWindow({ ...finalRound, crowdVoteClosesAt: NOW - 1 }, NOW).open);
t('host close beats the timer',
  !voteWindow({ ...finalRound, crowdVoteState: 'closed' }, NOW).open);
t('window is three minutes',    VOTE_WINDOW_MS === 180000);

// ── who may vote ──
t('debater is a debater',        isDebater(finalRound, 'p1'));
t('partner counts as a debater', isDebater({ ...finalRound, conUid2: 'c2' }, 'c2'));
t('debater refused',            !canVote(finalRound, { uid: 'p1', named: true }, NOW).ok);
t('debater refusal is named',    canVote(finalRound, { uid: 'c1', named: true }, NOW).reason === 'debater');
// Anonymous accounts are free and unlimited to mint here, so an
// anonymous vote is one loop rather than one person.
t('anonymous refused',          !canVote(finalRound, { uid: 'x', named: false }, NOW).ok);
t('anonymous refusal is named',  canVote(finalRound, { uid: 'x', named: false }, NOW).reason === 'named_account_required');
t('signed-out refused',         !canVote(finalRound, null, NOW).ok);
t('named stranger may vote',     canVote(finalRound, { uid: 'v1', named: true }, NOW).ok);

// ── the decision rule ──
const withVotes = (pro, con) => ({ ...finalRound, crowdVotes: { pro, con } });

t('crowd carries a clear result',
  tallyCrowd(withVotes(70, 30), 'con').winner === 'pro');
t('and says the crowd decided',
  tallyCrowd(withVotes(70, 30), 'con').decidedBy === 'crowd');
t('crowd beats the panel when it carries',
  tallyCrowd(withVotes(70, 30), 'con').winner !== 'con');

// A final decided 2-1 by three people looks like a result and is noise.
t('thin vote falls back to the panel',
  tallyCrowd(withVotes(2, 1), 'con').winner === 'con');
t('and says the panel decided',
  tallyCrowd(withVotes(2, 1), 'con').decidedBy === 'panel');
t('and says why',
  tallyCrowd(withVotes(2, 1), 'con').reason === 'too_few_votes');
t('floor is ten votes', MIN_VOTES === 10);
t('exactly at the floor the crowd carries',
  tallyCrowd(withVotes(9, 1), 'con').decidedBy === 'crowd');
t('one under the floor it does not',
  tallyCrowd(withVotes(5, 4), 'con').decidedBy === 'panel');

// A margin inside the noise of who happened to be watching is not a win.
t('dead heat falls back to the panel',
  tallyCrowd(withVotes(50, 50), 'pro').decidedBy === 'panel');
t('dead heat reason is the margin',
  tallyCrowd(withVotes(50, 50), 'pro').reason === 'inside_margin');
t('one vote in a hundred is inside the margin',
  tallyCrowd(withVotes(100, 99), 'pro').decidedBy === 'panel');
t('a real margin is not',
  tallyCrowd(withVotes(60, 40), 'pro').decidedBy === 'crowd');
t('margin is two percent', TIE_MARGIN === 0.02);

// ── reporting ──
t('percentage is of the crowd',  tallyCrowd(withVotes(75, 25), null).pctPro === 75);
t('no votes reads as even',      tallyCrowd(withVotes(0, 0), null).pctPro === 50);
t('no votes has no leader',      tallyCrowd(withVotes(0, 0), null).leader === null);
t('total is counted',            tallyCrowd(withVotes(12, 8), null).total === 20);
// A crowd round with no panel ballot yet must not invent a winner.
t('no panel ballot, thin vote, no winner',
  tallyCrowd(withVotes(1, 0), null).winner === null);
// Negative or junk counts cannot drag the tally below zero.
t('junk counts are floored',     tallyCrowd({ crowdVotes: { pro: -5, con: 20 } }, null).pro === 0);

console.log(`crowd verdict: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
