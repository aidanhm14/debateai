import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import * as metrics from '../app/netlify/functions/lib/admin-metrics.mjs';
import { corsResponse, jsonResponse, errorResponse } from '../app/netlify/functions/lib/response.mjs';

const { DAY, namedAccounts, countSignups, activeMetrics, activityCoverage, exitCardMetrics, experimentAssessment, isSigninFailure } = metrics;
const now = Date.parse('2026-09-25T20:00:00Z');
const ts = t => ({ toMillis: () => t, toDate: () => new Date(t) });
const event = (uid, age) => ({ uid, createdAt: ts(now - age * DAY) });
const users = [
  { uid: 'google', providerData: [{ providerId: 'google.com' }], metadata: { creationTime: new Date(now - DAY).toISOString() } },
  { uid: 'password', providerData: [{ providerId: 'password' }], metadata: { creationTime: new Date(now - 6.9 * DAY).toISOString() } },
  { uid: 'older', providerData: [{ providerId: 'apple.com' }], metadata: { creationTime: new Date(now - 8 * DAY).toISOString() } },
  { uid: 'guest', providerData: [], metadata: { creationTime: new Date(now).toISOString() } },
  { uid: 'anon', providerData: [{ providerId: 'anonymous' }] },
];
const accounts = namedAccounts(users);
assert.equal(accounts.length, 3);
assert.equal(countSignups(accounts, now - 7 * DAY, now), 2);
assert.equal(countSignups(accounts, now - DAY, now), 1, 'inclusive start boundary');
assert.equal(countSignups(accounts, now - 2 * DAY, now - DAY), 0, 'exclusive end boundary');

const full = [event('today', .1), event('today', .2), event('yesterday', .9), event('week', 4), event('month', 20), event('old', 35)];
const coverage = activityCoverage(full, { sinceMs: now - 56 * DAY, now, truncated: false });
assert.deepEqual(activeMetrics(full, { now, coverage }), { dau: 2, wau: 3, mau: 4, stickinessPct: 50 });
const recent = Array.from({ length: 4000 }, (_, i) => event('uid' + i % 225, .1));
assert.deepEqual(activeMetrics(recent, { now, coverage: activityCoverage(recent, { sinceMs: now - 56 * DAY, now, truncated: true }) }),
  { dau: null, wau: null, mau: null, stickinessPct: null }, '225/225 from a short sample must not become 100%');
const partial = [...full.slice(0, 4), event('boundary', 10)];
assert.deepEqual(activeMetrics(partial, { now, coverage: activityCoverage(partial, { sinceMs: now - 56 * DAY, now, truncated: true }) }),
  { dau: 2, wau: 3, mau: null, stickinessPct: null }, 'individually complete windows survive');
assert.deepEqual(activeMetrics([], { now, coverage: activityCoverage([], { sinceMs: now - 28 * DAY, now, truncated: false }) }),
  { dau: 0, wau: 0, mau: 0, stickinessPct: null }, 'complete empty windows are real zeros');
assert.equal(activityCoverage([event('cutoff', 1)], { sinceMs: now - 28 * DAY, now, truncated: true }).completeFrom(now - DAY), false,
  'events tied at the capped timestamp may still be missing');

for (const name of ['sign_in_start', 'sign_in_complete', 'sign_in_success', 'sign_in_already', 'sign_in_provider']) {
  assert.equal(isSigninFailure({ event: name, code: 'unknown' }), false);
  assert.equal(isSigninFailure({ event: name, code: 'auth/popup-blocked' }), false);
}
assert.equal(isSigninFailure({ event: 'sign_in_error', code: 'unknown' }), true);
assert.equal(isSigninFailure({ code: 'auth/popup-blocked' }), true);
assert.equal(isSigninFailure({ code: 'unknown' }), false);
for (const clicks of [[0, 0], [2, 0], [9, 9], [500, 2]]) {
  for (const sampled of [true, false]) {
    const result = experimentAssessment(clicks.map((n, i) => ({ variant: String(i), impressions: 1000, uniqueConversions: n })), sampled);
    assert.equal(result.ready, false);
    assert.equal(result.leader, '');
    assert.match(result.assessment, /no winner established/);
  }
}
const card = (id, reason, via = 'card') => ({ metadata: { card_id: id, reason, via } });
const cards = [card('a', 'shown'), card('a', 'shown'), card('a', 'confused'), card('a', 'confused'), card('b', 'shown'), card('b', 'skipped'),
  ...Array.from({ length: 54 }, () => card('', 'opponent_no_show', 'known')),
  ...Array.from({ length: 42 }, () => card('', 'shown')),
  ...Array.from({ length: 14 }, () => card('', 'confused'))];
const result = exitCardMetrics(cards);
assert.equal(result.answerRate, 50);
assert.equal(result.shown, 2);
assert.equal(result.answered, 1);
assert.equal(result.known, 54);
assert.equal(result.legacyShown, 42);
assert.equal(result.legacyAnswered, 14);
assert.equal(exitCardMetrics(cards, true).answerRate, null);
assert.equal(exitCardMetrics([...cards, card('orphan', 'confused')]).answerRate, null);
assert.equal(exitCardMetrics([...cards, card('a', 'skipped')]).answerRate, null);
assert.equal(exitCardMetrics([card('', 'shown'), card('', 'confused')]).answerRate, null, 'legacy events are not matched prompts');

// Exercise deployed handlers with a Firestore-shaped store. No network, credentials or production writes.
const functions = new URL('../app/netlify/functions/', import.meta.url);
const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
function harness(file, data = {}, overrides = {}) {
  const writes = [], queries = [];
  function collection(name) {
    let filters = [], maximum = Infinity, order, direction;
    const q = {
      where(field, op, value) { filters.push([field, op, value]); return q; },
      orderBy(field, dir) { order = field; direction = dir; return q; },
      limit(n) { maximum = n; return q; },
      count() { return { get: async () => ({ data: () => ({ count: (data[name] || []).length }) }) }; },
      async add(d) { writes.push(d); return {}; },
      async get() {
        queries.push({ name, maximum, filters });
        if (overrides.failEvents && name === 'events') throw Error('event read failed');
        const value = (d, field) => {
          const v = field.split('.').reduce((o, k) => o?.[k], d);
          return v?.toMillis ? v.toMillis() : v instanceof Date ? +v : v;
        };
        let rows = (data[name] || []).filter(d => filters.every(([f, op, raw]) => {
          const a = value(d, f), b = raw instanceof Date ? +raw : raw;
          return op === '>=' ? a >= b : op === '<' ? a < b : a === b;
        }));
        if (order) rows = rows.slice().sort((a,b) => (value(a,order) - value(b,order)) * (direction === 'desc' ? -1 : 1));
        const docs = rows.slice(0, maximum).map((d,i) => ({ id: 'doc' + i, data: () => d }));
        return { docs, size: docs.length, forEach: fn => docs.forEach(fn) };
      },
    };
    return q;
  }
  const db = { collection, collectionGroup: collection };
  const context = {
    ...metrics, Date: FixedDate, URL, Request, Response, console: { warn() {}, error() {} },
    setTimeout: () => 0, clearTimeout() {}, process: { env: { ADMIN_UID: 'owner' } },
    corsResponse, jsonResponse, errorResponse, getDb: () => db, FieldValue: { serverTimestamp: () => ts(now) },
    requireAdmin: async () => ({ db, uid: 'owner' }), verifyIdToken: async () => ({ sub: 'owner' }),
    extractBearerToken: () => 'test-token', isAdminEmail: () => true,
    getCachedShared: async () => null, getStaleShared: async () => null, setCachedShared: async () => {}, wantsFresh: () => false, TTL_HEAVY: 1,
    getExcludedUids: async () => new Set(), loadAccountLedger: async () => ({ accounts, anonymous: 2, generatedAt: new Date(now).toISOString() }),
    ...overrides,
  };
  const src = readFileSync(new URL(file, functions), 'utf8').replace(/^import .*;\n/gm, '')
    .replace('export default async (request) =>', 'globalThis.handler = async (request) =>').replace(/export const config/g, 'const config');
  runInNewContext(src, context, { filename: file });
  return { handler: context.handler, writes, queries };
}
const req = (query = '') => new Request('https://itsdebatable.com/api/test' + query);
let h = harness('admin-cohorts.mjs', { events: [...recent, event('overflow', .2)] });
let response = await h.handler(req('?weeks=8'));
let payload = await response.json();
assert.equal(response.status, 200);
assert.equal(payload.dau, null);
assert.equal(payload.stickinessPct, null);
assert.equal(payload.cohortRows.reduce((n,r) => n+r.size,0), 3, 'Auth signups exist with no profile documents');
assert.ok(payload.cohortRows.flatMap(r=>r.cells).every(c=>c.pct === null));
h = harness('admin-cohorts.mjs', { events: full });
payload = await (await h.handler(req('?weeks=2'))).json();
assert.equal(payload.mau, 4, 'even a two-week cohort request covers the 28-day active window');
assert.equal(payload.dau, 2, 'DAU is rolling 24h, not UTC day');
h = harness('admin-cohorts.mjs', {}, { failEvents: true });
assert.equal((await h.handler(req())).status, 500, 'failed reads must not become zero retention');
h = harness('admin-analytics.mjs', { user_profiles: Array.from({ length: 20 }, () => ({ createdAt: ts(now) })) });
payload = await (await h.handler(req())).json();
assert.equal(payload.totalUsers, 3);
assert.equal(payload.recentSignups, 2);
assert.equal(payload.daily.reduce((n,d)=>n+d.newUsers,0), 3);
assert.ok(h.queries.every(q=>q.name !== 'user_profiles'));
h = harness('admin-northstar.mjs');
payload = await (await h.handler(req())).json();
assert.equal(payload.accounts.named, 3);
assert.equal(payload.accounts.recentSignups, 2);
h = harness('admin-signin-errors.mjs', { signin_errors: [
  { event: 'sign_in_start', timestamp: ts(now) }, { event: 'sign_in_complete', timestamp: ts(now) },
  { event: 'sign_in_error', code: 'unknown', timestamp: ts(now) }, { code: 'auth/popup-blocked', timestamp: ts(now) },
] });
payload = await (await h.handler(req())).json();
assert.equal(payload.totalErrors, 2);
assert.equal(payload.excludedNonErrors, 2);
h = harness('log-signin-error.mjs');
for (const name of ['sign_in_start', 'sign_in_complete', 'sign_in_error']) {
  assert.equal((await h.handler(new Request('https://itsdebatable.com/api/log-signin-error', { method: 'POST', body: JSON.stringify({ event: name }) }))).status, 200);
}
assert.equal(h.writes.length, 1);
assert.equal(h.writes[0].event, 'sign_in_error');
h = harness('admin-round-exits.mjs', { events: cards.map(d=>({ ...d, event: 'round_exit_reason', createdAt: ts(now - 1000) })) });
payload = await (await h.handler(req())).json();
assert.equal(payload.answerRate, 50);
assert.equal(payload.cards.known, 54);

// Rendering must stay truthful, including a stale payload from the old A/B API.
const html = readFileSync(new URL('../app/admin.html', import.meta.url), 'utf8');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/src=|application\/ld\+json/.test(match[1])) continue;
  new Script(match[2], { filename: 'admin inline script' });
}
const nodes = new Map();
const $ = id => { if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '' }); return nodes.get(id); };
const ctx = { $, cachedAnalytics: { daily: [{ date: 'Sep 25', newUsers: 197 }] }, cachedCohorts: payload, cachedRealtime: null,
  drawSpark() {}, drawLine() {}, fmtTs: String, esc: s => String(s ?? ''), fmt: n => n == null ? '—' : String(n) };
function runSection(start, end) { runInNewContext(html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))), ctx); }
runSection('function drawUsersChart()', 'function drawSpark(');
runSection('function cohortShade(', '// ── Heatmap +');
const incomplete = { cohortRows: [{ weekLabel: 'Sep 20', size: 197, cells: [{ pct: null, active: null, complete: false }] }], sampled: true, coverageSinceISO: new Date(now).toISOString(), dau: null, wau: null, mau: null, stickinessPct: null };
ctx.cachedCohorts = incomplete;
ctx.renderCohorts(incomplete);
assert.match($('cohort-body').innerHTML, /Incomplete event history/);
assert.doesNotMatch($('cohort-body').innerHTML, />0%/);
assert.match($('dau-mau-meta').textContent, /unavailable/);
assert.doesNotMatch($('engagement-metrics').innerHTML, /100%|null/);
assert.doesNotMatch($('user-metrics').innerHTML, /225|null/);
runSection('function renderExperiments(', 'function renderAnalytics(');
ctx.renderExperiments({ experiments: [{ test: 'zero-clicks', ready: true, leader: 'off', variants: [{ variant: 'off', impressions: 1000, uniqueConversions: 0, conversionRate: 0 }] }], polls: [] });
assert.match($('experiments-body').innerHTML, /no winner established/);
assert.doesNotMatch($('experiments-body').innerHTML, /Early lead/);

// The client error sink only sees errors; the ordinary event stream retains lifecycle events.
const track = readFileSync(new URL('../app/js/track.js', import.meta.url), 'utf8');
const bridgeSource = track.slice(track.indexOf('  function bridge('), track.indexOf('  try {\n    var origGtag'));
const sinkCalls = [], ordinaryCalls = [];
const bridgeCtx = { postSigninError: n => sinkCalls.push(n), baseMeta: m => m, post: (n,m) => ordinaryCalls.push(m.name) };
runInNewContext(bridgeSource, bridgeCtx);
for (const name of ['sign_in_start', 'sign_in_complete', 'sign_in_error']) bridgeCtx.bridge(name, {});
assert.deepEqual(sinkCalls, ['sign_in_error']);
assert.deepEqual(ordinaryCalls, ['sign_in_start', 'sign_in_complete', 'sign_in_error']);

// Drive a real exit-card click through a minimal DOM: display and answer carry
// one ID, a second card gets a new ID, and known exits do not become cards.
let cardSequence = 0;
const receipts = [];
const dom = [];
function element(tag) {
  const el = { tag, children: [], style: {}, listeners: {}, value: '',
    appendChild(child) { this.children.push(child); dom.push(child); },
    setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    focus() {}, remove() { this.removed = true; },
  };
  return el;
}
const exitWindow = { crypto: { randomUUID: () => 'prompt-' + ++cardSequence }, track: (name, metadata) => receipts.push({ event: name, metadata }) };
runInNewContext(readFileSync(new URL('../app/js/round-exit.js', import.meta.url), 'utf8'), {
  window: exitWindow, setTimeout: () => 1, clearTimeout() {},
  document: { createElement: element, getElementById: id => dom.find(e=>e.id === id && !e.removed), head: element('head'), body: element('body') },
});
const firstCard = exitWindow.RoundExit.ask({ surface: 'live', reasons: ['confused'] });
dom.find(e=>e.className === 'rx-chip').listeners.click();
await firstCard;
assert.equal(receipts[0].metadata.card_id, receipts[1].metadata.card_id);
const secondCard = exitWindow.RoundExit.ask({ surface: 'live' });
dom.filter(e=>e.className === 'rx-skip').at(-1).listeners.click();
await secondCard;
assert.notEqual(receipts[0].metadata.card_id, receipts[2].metadata.card_id);
exitWindow.RoundExit.known('opponent_no_show', { surface: 'live' });
assert.equal(receipts.at(-1).metadata.card_id, undefined);
assert.equal(exitCardMetrics(receipts).answerRate, 50);
console.log('admin metric integrity: source, coverage, failures, A/B, card pairing, handlers and rendering passed');
