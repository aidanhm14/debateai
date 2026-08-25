// Unit test for lib/rating.mjs.
//
// The load-bearing test is the FIRST one: Glickman's own worked example
// from the Glicko-2 paper. If that does not reproduce to two decimals,
// the implementation is wrong no matter how sensible everything else
// looks. Every other assertion here is a property check on top of it.
import {
  updateRating, applyRound, displayRating, isRankable, tierFor, conservativeRating,
  PROVISIONAL_RD,
  defaultRatingDoc, DEFAULT_RATING, DEFAULT_RD,
} from '../app/netlify/functions/lib/rating.mjs';
import { eligibility } from '../app/netlify/functions/lib/rating-apply.mjs';

let pass = 0, fail = 0;
const t = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.error('  FAIL:', name, got !== undefined ? `(got ${got})` : ''); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── 1. Glickman's published example ─────────────────────────────────
// Player r=1500 RD=200 sigma=0.06, tau=0.5, versus:
//   (1400, 30)  win
//   (1550, 100) loss
//   (1700, 300) loss
// Paper's answer: r'=1464.06, RD'=151.52, sigma'=0.05999
{
  const out = updateRating({ rating: 1500, rd: 200, vol: 0.06 }, [
    { rating: 1400, rd: 30,  score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ]);
  t('Glickman example: rating 1464.06', near(out.rating, 1464.06, 0.05), out.rating.toFixed(4));
  t('Glickman example: RD 151.52',      near(out.rd, 151.52, 0.05),      out.rd.toFixed(4));
  t('Glickman example: vol 0.05999',    near(out.vol, 0.05999, 0.0001),  out.vol.toFixed(6));
}

// ── 2. direction + magnitude ────────────────────────────────────────
{
  const { a, b } = applyRound({ rating: 1500, rd: 200 }, { rating: 1500, rd: 200 }, 'a');
  t('winner gains', a.rating > 1500, a.rating.toFixed(1));
  t('loser loses',  b.rating < 1500, b.rating.toFixed(1));
  t('symmetric between equals', near(a.rating - 1500, 1500 - b.rating, 0.01));
  t('both get more certain', a.rd < 200 && b.rd < 200);
}
{
  // Beating a much stronger opponent must move you more than beating a
  // much weaker one. This is the whole point of a rating system.
  const bigUpset = applyRound({ rating: 1500, rd: 150 }, { rating: 1900, rd: 60 }, 'a').a;
  const expected = applyRound({ rating: 1500, rd: 150 }, { rating: 1100, rd: 60 }, 'a').a;
  t('upset win > expected win', bigUpset.rating - 1500 > expected.rating - 1500,
    `${(bigUpset.rating - 1500).toFixed(1)} vs ${(expected.rating - 1500).toFixed(1)}`);
}
{
  // A confident opponent should move you more than an unknown one.
  const vsKnown   = applyRound({ rating: 1500, rd: 150 }, { rating: 1500, rd: 40  }, 'a').a;
  const vsUnknown = applyRound({ rating: 1500, rd: 150 }, { rating: 1500, rd: 350 }, 'a').a;
  t('known opponent moves you more', vsKnown.rating > vsUnknown.rating);
}
{
  const { a, b } = applyRound({ rating: 1500, rd: 200 }, { rating: 1500, rd: 200 }, 'draw');
  t('draw between equals is ~neutral', near(a.rating, 1500, 0.5) && near(b.rating, 1500, 0.5));
}

// ── 3. certainty behaviour ──────────────────────────────────────────
{
  // A settled player must not swing on one result the way a new one does.
  const newbie  = applyRound({ rating: 1500, rd: 350 }, { rating: 1500, rd: 100 }, 'a').a;
  const veteran = applyRound({ rating: 1500, rd: 45  }, { rating: 1500, rd: 100 }, 'a').a;
  t('high RD moves further', (newbie.rating - 1500) > (veteran.rating - 1500) * 3,
    `${(newbie.rating - 1500).toFixed(1)} vs ${(veteran.rating - 1500).toFixed(1)}`);
}
{
  const idle = updateRating({ rating: 1600, rd: 60, vol: 0.06 }, []);
  t('idle keeps rating', idle.rating === 1600);
  t('idle grows RD',     idle.rd > 60, idle.rd.toFixed(2));
  t('idle RD is capped', updateRating({ rating: 1600, rd: 349, vol: 0.06 }, []).rd <= DEFAULT_RD);
}

// ── 4. robustness ───────────────────────────────────────────────────
{
  t('missing fields default cleanly', (() => {
    const out = updateRating({}, [{ score: 1 }]);
    return Number.isFinite(out.rating) && Number.isFinite(out.rd) && out.vol > 0;
  })());
  t('undefined player survives', (() => {
    const out = applyRound(undefined, undefined, 'a');
    return Number.isFinite(out.a.rating) && Number.isFinite(out.b.rating);
  })());
  t('a long streak stays finite', (() => {
    let p = defaultRatingDoc(0);
    for (let i = 0; i < 300; i++) {
      p = { ...p, ...updateRating(p, [{ rating: 1500, rd: 50, score: 1 }]) };
    }
    return Number.isFinite(p.rating) && Number.isFinite(p.rd) && p.rd > 0 && p.vol > 0;
  })());
}

// ── 5. presentation + ranking gate ──────────────────────────────────
{
  const fresh = displayRating({ rating: 1500, rd: 350, games: 0 });
  t('fresh is provisional',  fresh.provisional === true);
  t('fresh tier is Unranked', fresh.tier === 'Unranked');
  t('range brackets rating', fresh.range[0] < fresh.rating && fresh.range[1] > fresh.rating);

  const settled = displayRating({ rating: 1700, rd: 60, games: 20 });
  t('settled is not provisional', settled.provisional === false);
  t('1700 is Varsity',            settled.tier === 'Varsity', settled.tier);
  t('1800 is Elite',   displayRating({ rating: 1800, rd: 60, games: 20 }).tier === 'Elite');
  t('1950 is Titan',   displayRating({ rating: 1950, rd: 60, games: 20 }).tier === 'Titan');
  t('tiers ascend',    (() => {
    const at = (r) => displayRating({ rating: r, rd: 50, games: 9 }).tier;
    return new Set([at(1250), at(1350), at(1500), at(1600), at(1700), at(1800), at(1950)]).size === 7;
  })());

  t('one lucky win is not rankable', !isRankable({ rd: 290, games: 1 }));
  t('thin record is not rankable',   !isRankable({ rd: 80,  games: 2 }));
  t('real record is rankable',        isRankable({ rd: 80,  games: 12 }));
  // The rankable line is coupled to the /claim seed floor: a record
  // imported from Tabroom sits at RD 240 and must never rank off
  // self-reported history. test-record-seed asserts the margin from the
  // seed side; assert it here too, so someone raising the line in this
  // file sees the reason in this file.
  t('the rankable line stays clear of the claimed-record seed floor',
    PROVISIONAL_RD * 2 < 240);
  t('a 1-0 is never ranked, however lucky',
    !isRankable({ rd: 286, games: 1 }) && !isRankable({ rd: 120, games: 2 }));
  t('provisional beats tier lookup', tierFor(1950, true) === 'Unranked');
}

// ── 6. eligibility: who actually counts ─────────────────────────────
// This is the gate that decides whether a round touches the public
// ladder. Getting it wrong either publishes results people opted out
// of, or rates people for beating a bot.
{
  const asyncBase = {
    state: 'complete', aiOpp: false, hidden: false, visibility: 'public',
    ballot: { winner: 'prop' }, prop: { uid: 'u1', name: 'A' }, opp: { uid: 'u2', name: 'B' },
    motion: 'THW test',
  };
  const e = eligibility('async', asyncBase);
  t('async public complete is eligible', e.ok);
  t('async winner maps to side a',       e.ok && e.outcome === 'a');
  t('async verdict is server-owned',     e.ok && e.verdictSource === 'server');
  t('async opp win maps to b',
    eligibility('async', { ...asyncBase, ballot: { winner: 'opp' } }).outcome === 'b');

  t('AI opponent excluded',
    eligibility('async', { ...asyncBase, aiOpp: true }).reason === 'ai_opponent');
  // Seeded async challenges carry the AI as a NAMED seat (uid 'ai') with
  // no aiOpp flag; one rated for real on 2026-08-18. The rule checks the
  // seats, not just the flag.
  t('AI seated as prop excluded even without aiOpp flag',
    eligibility('async', { ...asyncBase, prop: { uid: 'ai', name: 'The Debater' } }).reason === 'ai_opponent');
  t('AI seated as opp excluded even without aiOpp flag',
    eligibility('async', { ...asyncBase, opp: { uid: 'ai', name: 'The Debater' } }).reason === 'ai_opponent');
  t('unlisted excluded',
    eligibility('async', { ...asyncBase, visibility: 'unlisted' }).reason === 'not_public');
  t('hidden excluded',
    eligibility('async', { ...asyncBase, hidden: true }).reason === 'hidden');
  t('incomplete excluded',
    eligibility('async', { ...asyncBase, state: 'open' }).reason === 'not_complete');
  t('no ballot excluded',
    eligibility('async', { ...asyncBase, ballot: null }).reason === 'no_verdict');
  t('garbage winner excluded',
    eligibility('async', { ...asyncBase, ballot: { winner: 'maybe' } }).reason === 'no_verdict');
  t('missing opponent excluded',
    eligibility('async', { ...asyncBase, opp: null }).reason === 'missing_participant');
  t('self-play excluded',
    eligibility('async', { ...asyncBase, opp: { uid: 'u1' } }).reason === 'same_user');

  const liveBase = {
    ballot: { winner: 'pro' }, proUid: 'p1', conUid: 'c1',
    proName: 'Pro', conName: 'Con', motion: 'THW test',
    leaderboardConsent: { p1: true, c1: true },
  };
  t('live with mutual consent is eligible', eligibility('live', liveBase).ok);
  t('live verdict marked participant-written',
    eligibility('live', liveBase).verdictSource === 'participant');
  // Consent is an OPT-OUT (2026-08-24). These three asserted the old
  // dual-opt-in rule and were left behind when it flipped, so the guard
  // was failing on main while asserting a privacy model the code had
  // already stopped implementing. Rewritten to pin what it does now:
  // silence rates, and only an explicit false stops the round.
  t('live with one side silent still rates',
    eligibility('live', { ...liveBase, leaderboardConsent: { p1: true } }).ok);
  t('live with no consent map still rates',
    eligibility('live', { ...liveBase, leaderboardConsent: {} }).ok);
  t('live with no consent field at all still rates',
    eligibility('live', { ...liveBase, leaderboardConsent: undefined }).ok);
  t('explicit false on either side stops the round',
    eligibility('live', { ...liveBase, leaderboardConsent: { p1: false, c1: true } }).reason === 'opted_out'
    && eligibility('live', { ...liveBase, leaderboardConsent: { p1: true, c1: false } }).reason === 'opted_out');
  t('only a real false opts out, not a falsy value',
    eligibility('live', { ...liveBase, leaderboardConsent: { p1: 0, c1: true } }).ok);
  t('live con win maps to b',
    eligibility('live', { ...liveBase, ballot: { winner: 'con' } }).outcome === 'b');

  t('unknown source rejected', eligibility('nope', liveBase).reason === 'unknown_source');
  t('missing doc rejected',    eligibility('async', null).reason === 'not_found');
}


// ── conservative ordering ───────────────────────────────────────────
// The ladder SHOWS rating and SORTS by the bottom of the interval, so an
// unproven round costs position rather than buying it.
{
  const oneWin  = { rating: 1776, rd: 286, games: 1 };  // 1-0, unmeasured
  const record  = { rating: 1669, rd: 211, games: 4 };  // 3-1, real record
  t('conservative floor is rating minus two RD',
    conservativeRating({ rating: 1500, rd: 100 }) === 1300);
  t('a 3-1 record outranks a 1-0 despite a lower rating',
    conservativeRating(record) > conservativeRating(oneWin));
  t('the higher raw rating is still the one displayed',
    displayRating(oneWin).rating > displayRating(record).rating);
  t('displayRating carries the same floor the board sorts on',
    displayRating(record).floor === Math.round(conservativeRating(record)));
  t('missing fields fall back to defaults, never NaN',
    Number.isFinite(conservativeRating({})) && Number.isFinite(conservativeRating(null)));
  t('shrinking RD raises the floor without moving the rating',
    conservativeRating({ rating: 1600, rd: 80 }) > conservativeRating({ rating: 1600, rd: 250 }));
}

console.log(`rating lib: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
