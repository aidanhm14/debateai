import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { rollingSevenDays } from '../app/netlify/functions/lib/rolling-spar-activity.mjs';
const now = new Date('2026-09-14T12:34:56.000Z');
const cutoff = now.getTime() - 7 * 86400000;
const stored = {
  week_count: 1,
  by_day: { '2026-09-07': 9, '2026-09-08': 20, '2026-09-13': 7, '2026-09-14': 2 },
  by_time: { [cutoff - 1]: 5, [cutoff]: 3, [cutoff + 1]: 1, [now.getTime()]: 2 },
};
assert.equal(rollingSevenDays(stored, now).count, 33, 'exact cutoff, no double counting, includes pre-Monday attempts');
assert.equal(rollingSevenDays(stored, new Date(now.getTime() + 1)).count, 30, 'ticks expire after exactly 168 hours');
assert.equal(rollingSevenDays({ by_day: { '2026-09-14': 100 }, by_time: { [now.getTime()+1]: 5 } }, new Date('2026-09-13T20:00:00Z')).count, 0, 'future data is excluded');
assert.equal(rollingSevenDays({ month_key: '2026-09', month_count: 377, by_day: { '2026-09-02': 20, '2026-09-06': 253 } }, new Date('2026-09-07T05:00:00Z')).count, 377, 'preserves existing month history while entirely within seven days');
assert.equal(rollingSevenDays({ month_key: '2026-09', month_count: 377, by_day: { '2026-09-03': 20 } }, new Date('2026-09-09T05:00:00Z')).count, 20, 'does not include an expired month total');
assert.equal(rollingSevenDays({ by_day: { '2026-12-30': 5, '2027-01-01': 3 }, month_key: '2026-12', month_count: 999 }, new Date('2027-01-02T00:00:00Z')).count, 8, 'year and month changes do not reset retained history');
assert.equal(rollingSevenDays({}, now).count, 0);
assert.equal(stored.week_count, 1, 'reads do not reset stored counters');

const source = readFileSync(new URL('../app/spar.html', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('  function renderMetaLive(){'), source.indexOf('  function startMetaLive(){'));
const elems = { metaQueue: {}, metaQueueLabel: {}, dot: { style: {} } };
const ctx = vm.createContext({
  Date: { now: () => now.getTime() },
  document: { getElementById: id => elems[id], querySelector: () => elems.dot },
  metaLiveCounts: { queue: 0 }, metaLiveUnsub: { queue: null }, metaLiveTimer: null,
  metaQueueSnapshot: [{ data: () => ({joinedAt: {seconds: now.getTime()/1000 - 60}}) }],
  queuePeerCanMatch: () => true, clearInterval() {},
});
vm.runInContext(render + '\nrenderMetaLive();', ctx);
assert.equal(elems.metaQueue.textContent, '1');
ctx.Date.now = () => now.getTime() + 61000;
vm.runInContext('renderMetaLive();', ctx);
assert.equal(elems.metaQueue.textContent, '0', 'a silent peer expires without another snapshot');
console.log('PASS rolling activity: exact expiry, week/month/year boundaries, retained totals, live peer expiry');
