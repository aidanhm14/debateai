import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { roundStillsAllowed, clearRoundStills, savedRoundThumbnail, STILL_CONSENT_VERSION, STILL_COUNT, STILL_GAP_MS } from '../app/netlify/functions/lib/round-stills.mjs';
import { roomShotPublic } from '../app/netlify/functions/lib/room-shot-eligibility.mjs';
import { BULK_QUERIES } from '../app/netlify/functions/lib/account-deletion.mjs';

let now = Date.now(), uid = 'a', admin = true;
const live = { status: 'round', proUid: 'a', conUid: 'b', proName: 'A', conName: 'B', motion: 'Public transit should be free',
  recordingStatus: 'recording', recordingPublishAllowed: true, recordingConsents: { a: true, b: true } };
const permission = { consents: { a: STILL_CONSENT_VERSION, b: STILL_CONSENT_VERSION } };
const data = new Map();
const ref = (collection, id) => ({ path: collection + '/' + id });
const snapshot = reference => ({ exists: data.has(reference.path), data: () => structuredClone(data.get(reference.path)) });
function merge(a, b) {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) result[key] = value && typeof value === 'object' && !Array.isArray(value)
    ? merge(result[key], value) : value;
  return result;
}
function set(reference, value, options) {
  data.set(reference.path, structuredClone(options?.merge ? merge(data.get(reference.path), value) : value));
}
let lock = Promise.resolve();
const db = {
  collection: name => ({ doc: id => ({ ...ref(name, id), get: async () => snapshot(ref(name, id)), set: async (d, opts) => set(ref(name, id), d, opts) }) }),
  runTransaction: action => {
    const run = lock.then(async () => {
      const writes = [];
      const tx = { get: async r => snapshot(r), set: (r, d, opts) => writes.push(() => set(r, d, opts)), delete: r => writes.push(() => data.delete(r.path)) };
      const result = await action(tx); writes.forEach(write => write()); return result;
    });
    lock = run.catch(() => {}); return run;
  },
};
const roundKey = 'live_rounds/test';
function resetRound(change = {}) { data.set(roundKey, { ...live, seatSeen: { a: now, b: now }, ...change }); }
resetRound(); data.set('round_still_permissions/test', permission);
assert.equal(roundStillsAllowed(live, permission), true);
for (const change of [{ isPrivate: true }, { recordingDeleteRequested: true }, { recordingConsents: { a: true } }, { proUid2: 'c' }, { conUid: 'a' }]) {
  assert.equal(roundStillsAllowed({ ...live, ...change }, permission), false);
}
assert.equal(roundStillsAllowed(live, {}), false, 'old recording permission is not screenshot permission');
assert.equal(roundStillsAllowed(live, { ...permission, disabled: true }), false);

// This fixture tests the route's transport/access boundaries. The browser
// smoke below separately encodes real canvases with the actual renderer.
const bytes = Buffer.alloc(250, 0); bytes.set([255, 216, 255], 0); bytes.set([255, 217], 248);
const b64 = bytes.toString('base64');
const route = fs.readFileSync('app/netlify/functions/round-stills.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async', 'globalThis.handler = async').replace('export const config', 'const config');
const context = vm.createContext({
  Buffer, URL, Response, console, Number, Date: class extends Date { static now(){ return now; } },
  roomShotPublic, roundStillsAllowed, STILL_COUNT, STILL_GAP_MS, getDb: () => db,
  extractBearerToken: () => 'test', verifyIdToken: async () => { if (!uid) throw new Error('no auth'); return { sub: uid }; },
  requireAdmin: async () => admin ? { db } : { error: new Response('Denied', { status: 403 }) },
  jsonResponse: (value, status) => Response.json(value, { status }),
  errorResponse: (error, status) => Response.json({ error }, { status }), corsResponse: () => new Response(),
});
vm.runInContext(route, context);
const post = (extra = {}) => context.handler(new Request('https://test/api/round-stills', { method: 'POST', body: JSON.stringify({
  room: 'test', thumbnail: 'data:image/jpeg;base64,' + b64, clean: b64, visibleSeats: 2, ...extra,
}) }));
const get = query => context.handler(new Request('https://test/api/round-stills?room=test' + query));
assert.equal((await post({ thumbnail: 'not an image' })).status, 400);
uid = null; assert.equal((await post()).status, 401);
uid = 'spectator'; assert.equal((await post()).status, 403);
uid = 'a'; data.set('round_still_permissions/test', {}); assert.equal((await post()).status, 403);
data.set('round_still_permissions/test', permission);
for (const change of [{ isPrivate: true }, { seatSeen: { a: now } }, { status: 'ended' }, { draft: { phase: 'strike' } }, { recordingConsents: { a: true, b: false } }]) {
  resetRound(change); assert.equal((await post()).status, 403);
}
resetRound({ recordingStatus: 'stopped' }); assert.equal((await post()).status, 409); resetRound();
const parallel = await Promise.all(Array.from({ length: 10 }, () => post()));
const results = await Promise.all(parallel.map(r => r.json()));
assert.equal(results.filter(r => r.id).length, 1, 'both clients cannot fill the archive with duplicate frames');
assert.equal(data.get('round_still_sets/test').frames.length, 1);
admin = false; assert.equal((await get('&frame=0')).status, 403); admin = true;
const image = await get('&frame=0&kind=clean');
assert.equal(image.status, 200); assert.equal(image.headers.get('cache-control'), 'no-store');
assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
assert.equal((await get('&frame=9')).status, 400);
assert.equal(await savedRoundThumbnail(db, 'test'), b64);
for (let i = 1; i < 8; i++) { now += 60001; resetRound(); assert.equal((await (await post()).json()).count, i + 1); }
now += 60001; resetRound(); assert.equal((await (await post()).json()).skipped, 'complete');
assert.equal(data.get('round_still_sets/test').frames.length, 8);
resetRound({ isPrivate: true }); assert.equal((await get('&frame=0')).status, 404); assert.equal(await savedRoundThumbnail(db, 'test'), null);
resetRound();
await db.runTransaction(async tx => {
  tx.set(ref('round_still_permissions', 'test'), { consents: { a: false, b: STILL_CONSENT_VERSION } });
  clearRoundStills(tx, db, 'test');
});
assert.equal([...data.keys()].filter(k => k.startsWith('round_stills/') || k.startsWith('round_still_sets/')).length, 0);
assert.equal((await post()).status, 403); assert.equal((await get('&frame=0')).status, 404);
for (const collection of ['round_stills', 'round_still_sets', 'round_still_permissions']) {
  assert.ok(BULK_QUERIES.some(q => q.collection === collection && q.field === 'uids' && q.op === 'array-contains'));
}

// Exercise the real recording-consent writer, including an older client
// that has never shown the new still-image disclosure.
const recordingSource = fs.readFileSync('app/netlify/functions/round-recording.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async', 'globalThis.recordingHandler = async')
  .replace('export async function', 'async function').replace('export const config', 'const recordingConfig');
const recordingContext = vm.createContext({
  ...{ Buffer, URL, Response, console, process: { env: { DAILY_API_KEY: 'fixture' } }, AbortSignal },
  Date: class extends Date { static now(){ return now; } },
  verifyIdToken: async () => ({ sub: uid }), extractBearerToken: () => 'test', getDb: () => db,
  FieldValue: { serverTimestamp: () => now, delete: () => null }, STILL_CONSENT_VERSION, clearRoundStills,
  jsonResponse: (value, status) => Response.json(value, { status }),
  errorResponse: (error, status) => Response.json({ error }, { status }), corsResponse: () => new Response(),
  fetch: async () => Response.json({ ok: true }),
});
vm.runInContext(recordingSource, recordingContext);
function consent(extra) { return recordingContext.recordingHandler(new Request('https://test/api/round-recording', {
  method: 'POST', body: JSON.stringify({ room: 'test', action: 'consent', consent: true, adultOrGuardianApproved: true, ...extra }),
})); }
resetRound(); data.delete('round_still_permissions/test');
uid = 'a'; assert.equal((await consent({})).status, 200);
assert.equal(data.get('round_still_permissions/test').consents.a, false);
now++;
assert.equal((await consent({ stillConsentVersion: STILL_CONSENT_VERSION })).status, 200);
uid = 'b'; now++;
assert.equal((await consent({ stillConsentVersion: STILL_CONSENT_VERSION })).status, 200);
assert.equal(roundStillsAllowed(data.get(roundKey), data.get('round_still_permissions/test')), true);
assert.equal((await post()).status, 200);
now++; assert.equal((await consent({ consent: false })).status, 200);
assert.equal(data.has('round_still_sets/test'), false);
assert.equal(data.has('round_stills/test_0'), false);
assert.equal(data.get('round_still_permissions/test').consents.b, false);
assert.equal((await post()).status, 403);

// Parse all changed browser code, including the large room's inline blocks.
for (const name of ['app/live-round.html', 'app/round-images.html']) {
  const html = fs.readFileSync(name, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/src=|application\/ld\+json/.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: name });
  }
}
console.log('Round stills: consent, private/admin access, duplicate uploads, caps, withdrawal, account purge and browser syntax passed.');
