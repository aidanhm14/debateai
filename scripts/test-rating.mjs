// Unit test for lib/rating.mjs.
//
// The load-bearing test is the FIRST one: Glickman's own worked example
// from the Glicko-2 paper. If that does not reproduce to two decimals,
// the implementation is wrong no matter how sensible everything else
// looks. Every other assertion here is a property check on top of it.
import {
  updateRating, applyRound, displayRating, isRankable, tierFor,
  defaultRatingDoc, DEFAULT_RATING, DEFAULT_RD,
} from '../app/netlify/functions/lib/rating.mjs';

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
  t('provisional beats tier lookup', tierFor(1950, true) === 'Unranked');
}

console.log(`rating lib: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
