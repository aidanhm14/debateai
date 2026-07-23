// Unit test for lib/credits.mjs and lib/judgment.mjs.
//
// The first block is the important one. The Floor shipped a market
// economy that settled on Math.random() because settlement was allowed
// to produce a winner without a verdict record. These assertions make
// that regression loud: no randomness in the settlement path, and no
// winner without a judgment.
import fs from 'node:fs';
import {
  CREDITS, windowOf, stakeable, poolMult, impliedPct, makeMarket,
  verdictFrom, payoutFor, txnId, ledgerEntry, defaultAccount,
  sharpScore, canStake, marketId,
} from '../app/netlify/functions/lib/credits.mjs';
import { fromRound, judgmentId, RUBRIC_VERSION } from '../app/netlify/functions/lib/judgment.mjs';

let pass = 0, fail = 0;
const t = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.error('  FAIL:', name, got !== undefined ? `(got ${got})` : ''); }
};

// ── 1. no randomness in the money path ──────────────────────────────
{
  for (const f of ['credits.mjs', 'judgment.mjs']) {
    const src = fs.readFileSync(new URL(`../app/netlify/functions/lib/${f}`, import.meta.url), 'utf8');
    // Strip comments so the word "random" in prose does not trip this.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    t(`${f} has no Math.random`, !/Math\s*\.\s*random/.test(code));
    t(`${f} has no crypto randomness`, !/randomUUID|getRandomValues/.test(code));
  }
}

// ── 2. no winner without a judgment ─────────────────────────────────
{
  t('null judgment refuses',      verdictFrom(null).reason === 'no_judgment');
  t('undefined judgment refuses', verdictFrom(undefined).reason === 'no_judgment');
  t('empty judgment refuses',     verdictFrom({}).reason === 'bad_judgment');
  t('garbage winner refuses',     verdictFrom({ winner: 'maybe' }).reason === 'bad_judgment');
  t('disputed judgment refuses',
    verdictFrom({ winner: 'a', disputeState: 'open' }).reason === 'disputed');

  const good = verdictFrom({ id: 'async_x', winner: 'a', verdictSource: 'server' });
  t('valid judgment settles A', good.ok && good.side === 'A');
  t('settlement carries judgment id', good.judgmentId === 'async_x');
  t('settlement carries verdict provenance', good.verdictSource === 'server');
  t('winner b maps to B', verdictFrom({ winner: 'b' }).side === 'B');
}

// ── 3. payouts ──────────────────────────────────────────────────────
{
  const pool = { A: 100, B: 300 };
  t('loser gets nothing', payoutFor({ side: 'B', stake: 50, window: 'live' }, 'A', pool) === 0);
  t('winner gets pari-mutuel',
    payoutFor({ side: 'A', stake: 50, window: 'live' }, 'A', pool) === Math.round(50 * 4));
  t('early read pays the multiplier',
    payoutFor({ side: 'A', stake: 50, window: 'early' }, 'A', pool) === Math.round(50 * 4 * 1.5));
  t('zero stake pays zero', payoutFor({ side: 'A', stake: 0, window: 'live' }, 'A', pool) === 0);
  t('negative stake cannot pay', payoutFor({ side: 'A', stake: -100, window: 'live' }, 'A', pool) === 0);
  t('no position pays zero', payoutFor(null, 'A', pool) === 0);
  t('empty pool does not divide by zero',
    Number.isFinite(payoutFor({ side: 'A', stake: 10, window: 'live' }, 'A', { A: 0, B: 0 })));
}

// ── 4. staking gate ─────────────────────────────────────────────────
{
  const now = 1000;
  const m = makeMarket({ source: 'live', eventId: 'e1', claim: 'c',
    sideA: { uid: 'p1', label: 'Pro' }, sideB: { uid: 'c1', label: 'Con' },
    startsAt: 2000, lockAt: 3000, now });

  t('early window before start',   windowOf(m, 1500) === 'early');
  t('live window mid-round',       windowOf(m, 2500) === 'live');
  t('locked after lock',           windowOf(m, 3500) === 'locked');
  t('settled beats the clock',     windowOf({ ...m, settled: true }, 1500) === 'settled');
  t('locked is not stakeable',     !stakeable('locked'));

  t('outsider may stake',   canStake({ uid: 'x', market: m, position: null, nowMs: 1500 }).ok);
  t('pro debater excluded', canStake({ uid: 'p1', market: m, position: null, nowMs: 1500 }).reason === 'debater_excluded');
  t('con debater excluded', canStake({ uid: 'c1', market: m, position: null, nowMs: 1500 }).reason === 'debater_excluded');
  t('double stake refused', canStake({ uid: 'x', market: m, position: { side: 'A' }, nowMs: 1500 }).reason === 'already_staked');
  t('late stake refused',   canStake({ uid: 'x', market: m, position: null, nowMs: 9999 }).reason === 'locked');
  t('settled market refused',
    canStake({ uid: 'x', market: { ...m, settled: true }, position: null, nowMs: 1500 }).reason === 'settled');
  t('early stake gets the better multiplier',
    canStake({ uid: 'x', market: m, position: null, nowMs: 1500 }).mult >
    canStake({ uid: 'x', market: m, position: null, nowMs: 2500 }).mult);
}

// ── 5. ledger ───────────────────────────────────────────────────────
{
  t('txn ids are deterministic', txnId('settle', 'm1', 'u1') === txnId('settle', 'm1', 'u1'));
  t('txn ids separate kinds',    txnId('stake', 'm1', 'u1') !== txnId('settle', 'm1', 'u1'));
  t('txn ids separate users',    txnId('settle', 'm1', 'u1') !== txnId('settle', 'm1', 'u2'));

  const e = ledgerEntry({ kind: 'stake', uid: 'u1', amount: -50.4, balanceAfter: 949.6,
    refType: 'market', refId: 'm1', reason: 'Backed Pro', actor: 'system', now: 5 });
  t('amounts are integers',   Number.isInteger(e.amount));
  t('balances are integers',  Number.isInteger(e.balanceAfter));
  t('wallet type is play',    e.walletType === 'play');
  t('bad kind throws', (() => {
    try { ledgerEntry({ kind: 'withdraw', uid: 'u', amount: 1, balanceAfter: 1, refId: 'r', now: 1 }); return false; }
    catch { return true; }
  })());
  t('no transfer kind exists', !['transfer', 'withdraw', 'purchase', 'cashout']
    .some((k) => { try { ledgerEntry({ kind: k, uid: 'u', amount: 1, balanceAfter: 1, refId: 'r', now: 1 }); return true; } catch { return false; } }));

  const acct = defaultAccount('u1', 7);
  t('opening grant matches the Floor', acct.credits === CREDITS.START && acct.credits === 1000);
}

// ── 6. odds display ─────────────────────────────────────────────────
{
  t('even pool reads 50',      impliedPct({ A: 100, B: 100 }) === 50);
  t('empty pool reads 50',     impliedPct({ A: 0, B: 0 }) === 50);
  t('lopsided pool reads 75',  impliedPct({ A: 300, B: 100 }) === 75);
  t('pool multiplier is total over side', poolMult({ A: 100, B: 300 }, 'A') === 4);
  t('empty side does not divide by zero', poolMult({ A: 0, B: 300 }, 'A') === 1);
}

// ── 7. judgment extraction ──────────────────────────────────────────
{
  const asyncRound = {
    state: 'complete',
    ballot: { winner: 'prop', propPoints: 28.5, oppPoints: 27, rfd: 'clean weighing', model: 'claude-x', at: 42 },
    prop: { uid: 'u1' }, opp: { uid: 'u2' }, motion: 'THW test',
  };
  const j = fromRound('async', 'e1', asyncRound);
  t('async judgment extracted',    j.ok);
  t('prop maps to side a',         j.value.winner === 'a');
  t('model version recorded',      j.value.modelVersion === 'claude-x');
  t('rubric version recorded',     j.value.rubricVersion === RUBRIC_VERSION);
  t('async verdict is server-owned', j.value.verdictSource === 'server');
  t('judgment id is deterministic', j.value.id === judgmentId('async', 'e1'));
  t('incomplete round has no judgment',
    fromRound('async', 'e1', { ...asyncRound, state: 'open' }).reason === 'not_complete');

  // Unlike the rating ladder, a judgment does NOT require leaderboard
  // consent. Consent governs the public ladder, not whether the round
  // had a winner; conflating them would strand every predictor on an
  // unconsented round.
  const liveRound = { ballot: { winner: 'con', at: 9 }, proUid: 'p', conUid: 'c', motion: 'm' };
  const lj = fromRound('live', 'e2', liveRound);
  t('live judgment needs no consent', lj.ok);
  t('con maps to side b',             lj.value.winner === 'b');
  t('live verdict marked participant', lj.value.verdictSource === 'participant');
  t('missing participant rejected',
    fromRound('live', 'e2', { ballot: { winner: 'pro' } }).reason === 'missing_participant');
  t('unknown source rejected', fromRound('nope', 'e', {}).reason === 'unknown_source');
}

// ── 8. sharp score ──────────────────────────────────────────────────
{
  const thin   = sharpScore({ bets: 3,   wins: 3,  staked: 300,   returned: 600 });
  const proven = sharpScore({ bets: 100, wins: 60, staked: 10000, returned: 13000 });
  t('a proven record outranks a hot streak', proven > thin, `${proven} vs ${thin}`);
  t('a fresh account is finite', Number.isFinite(sharpScore({})));

  // Sparse samples must not read as skill. This is the Floor's bug.
  const perfect3 = sharpScore({ bets: 3, wins: 3, staked: 300, returned: 900 });
  const solid50  = sharpScore({ bets: 50, wins: 32, staked: 5000, returned: 6500 });
  t('3-for-3 does not outrank 32-of-50', solid50 > perfect3, `${solid50} vs ${perfect3}`);

  // More evidence at the same win rate should score higher, not lower.
  const same10  = sharpScore({ bets: 10,  wins: 6,  staked: 1000,  returned: 1300 });
  const same200 = sharpScore({ bets: 200, wins: 120, staked: 20000, returned: 26000 });
  t('same rate, more evidence scores higher', same200 > same10, `${same200} vs ${same10}`);

  // An unbounded streak multiplier re-introduces the hot hand.
  const streaky = sharpScore({ bets: 20, wins: 20, staked: 2000, returned: 5000, streak: 20 });
  const capped  = sharpScore({ bets: 20, wins: 20, staked: 2000, returned: 5000, streak: 5 });
  t('streak bonus is capped', streaky === capped, `${streaky} vs ${capped}`);
  t('a loser scores below a winner',
    sharpScore({ bets: 50, wins: 10, staked: 5000, returned: 2000 })
    < sharpScore({ bets: 50, wins: 40, staked: 5000, returned: 8000 }));
  t('market ids are deterministic', marketId('live', 'e1') === 'live_e1');
}

console.log(`credits + judgment: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
