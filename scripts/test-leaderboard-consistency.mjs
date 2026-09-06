import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fetchRatingRows, composeTopRows } from '../app/netlify/functions/lib/rating-board.mjs';
import { fetchAccountProgress } from '../app/netlify/functions/lib/account-progress.mjs';

const placedUid = 'p'.repeat(28), newUid = 'n'.repeat(28);
const histories = { [placedUid]: Array(250).fill(25.4), [newUid]: [80.4] };
const ratings = [
  { id: newUid, data: () => ({ rating: 1900, rd: 200, games: 1, wins: 1 }) },
  { id: placedUid, data: () => ({ rating: 1500, rd: 80, games: 5, wins: 3 }) },
];
const profiles = { [placedUid]: { displayName: 'Current name' }, [newUid]: { name: 'New person' } };
const db = {
  collection(name) {
    if (name === 'user_ratings') return { orderBy: () => ({ limit: () => ({ get: async () => ({ forEach: cb => ratings.forEach(cb) }) }) }) };
    if (name === 'user_profiles') return { doc: uid => uid };
    if (name === 'leaderboard_entries') return {
      where(field, operator, uid) {
        assert.equal(field, 'uid'); assert.equal(operator, '==');
        return { orderBy(field, direction) {
          assert.equal(field, 'score'); assert.equal(direction, 'desc');
          return { aggregate: () => ({ get: async () => ({ data: () => ({ points: histories[uid].reduce((a, b) => a + b, 0) }) }) }) };
        } };
      },
    };
    throw new Error('Unexpected collection: ' + name);
  },
  getAll: async (...uids) => uids.map(uid => ({ id: uid, exists: true, data: () => profiles[uid] })),
};
const rows = await fetchRatingRows(db);
assert.equal(rows[0].uid, placedUid, 'Placed account outranks a one-round high rating');
assert.equal(rows[0].name, 'Current name');
assert.equal(rows[0].rank, 1);
assert.equal(rows[1].rank, null, 'Placement has no invented rank');
assert.equal(rows[0].xp, 6350, 'XP includes every round, beyond top-100 and profile-200 limits');
assert.deepEqual(await fetchAccountProgress(db, placedUid), { xp: rows[0].xp });
assert.deepEqual(composeTopRows(rows.slice().reverse(), [], 8), rows, 'Teaser and full board agree');
assert.deepEqual(composeTopRows([], [], 8), []);

let projected = false;
const fallbackDb = { collection: () => ({ where: () => ({
  orderBy: () => ({ aggregate: () => ({ get: async () => { throw Object.assign(new Error('Index unavailable'), { code: 9 }); } }) }),
  select(field) {
    assert.equal(field, 'score'); projected = true;
    return { get: async () => ({ forEach: cb => [...histories[placedUid], null, 'bad'].forEach(score => cb({ data: () => ({ score }) })) }) };
  },
}) }) };
assert.deepEqual(await fetchAccountProgress(fallbackDb, placedUid), { xp: 6350 }, 'Index failure retains complete XP through a scores-only query');
assert.equal(projected, true);

const source = readFileSync('app/leaderboard.html', 'utf8');
const fn = source.slice(source.indexOf('async function loadRatingLadder(){'), source.indexOf('// Standings for the head-to-head tab:'));
const ctx = { window: { DBDomains: true }, DBDomains: { levelFor: xp => ({ xp, level: 10 }) },
  console, fetch: async () => ({ ok: true, json: async () => ({ rows }) }) };
vm.createContext(ctx); vm.runInContext(fn, ctx);
const rendered = await ctx.loadRatingLadder();
assert.equal(rendered[0]._xp, 6350);
assert.equal(rendered[0]._level.xp, 6350);
ctx.fetch = async () => ({ ok: true, json: async () => ({ rows: [], error: 'unavailable' }) });
assert.equal(await ctx.loadRatingLadder(), null, 'API failure must not claim an empty ladder');
console.log('Leaderboard consistency: complete XP, current names, placement, shared rank order and failed loads passed.');
