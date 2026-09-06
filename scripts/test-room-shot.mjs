import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { roomShotPublic } from '../app/netlify/functions/lib/room-shot-eligibility.mjs';

// Execute the real route with an in-memory database. No credentials or
// live images: these checks concern access to already-published bytes.
const now = Date.now();
const live = { status: 'round', proUid: 'a', conUid: 'b', seatSeen: { a: now, b: now } };
const image = Buffer.from('fixture JPEG').toString('base64');
let round = structuredClone(live), uid = 'a', writes = 0;
const shot = { public: true, seats: { pro: { b64: image, at: now - 15000 } } };
const routeSource = fs.readFileSync('app/netlify/functions/room-shot.mjs', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async', 'globalThis.handler = async')
  .replace('export const config', 'const config');
const context = vm.createContext({
  Response, URL, Buffer, console, roomShotPublic,
  getDb: () => ({ collection: name => ({ doc: () => ({
    get: async () => ({ exists: true, data: () => name === 'live_rounds' ? round : shot }),
    set: async () => { writes++; },
  }) }) }),
  withDeadline: value => value,
  verifyIdToken: async () => ({ uid }),
  errorResponse: (message, status) => Response.json({ message }, { status }),
  jsonResponse: (value, status) => Response.json(value, { status }),
  corsResponse: () => new Response(),
});
vm.runInContext(routeSource, context);
const get = () => context.handler(new Request('https://debatable.test/api/room-shot?room=test'));
const post = () => context.handler(new Request('https://debatable.test/api/room-shot', {
  method: 'POST', headers: { authorization: 'Bearer fixture' }, body: JSON.stringify({ room: 'test', image }),
}));
assert.equal(roomShotPublic(live, now), true);
assert.equal(roomShotPublic({ ...live, seatSeen: { a: new Date(now), b: { _seconds: now / 1000 } } }, now), true);
let response = await get();
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(await response.text(), 'fixture JPEG');
assert.equal((await post()).status, 200);
assert.equal(writes, 1);
uid = 'spectator';
assert.equal((await post()).status, 403);
uid = 'a';
for (const change of [
  { isPrivate: true }, { status: 'ended' }, { conUid: 'a' }, { conUid: '' },
  { seatSeen: { a: now } }, { seatSeen: { a: now, b: now - 100000 } },
  { seatLeft: { b: now } }, { draft: { phase: 'strike' } },
]) {
  round = { ...live, ...change };
  assert.equal(roomShotPublic(round, now), false);
  assert.equal((await get()).status, 404, JSON.stringify(change));
  assert.ok((await post()).status >= 400, JSON.stringify(change));
}
round = { ...live, draft: { phase: 'done' }, seatLeft: { b: now - 1000 } };
assert.equal((await get()).status, 200);
shot.seats.pro.at = now - 75001;
assert.equal((await get()).status, 404);

// The room selects assigned participants, not spectators, hidden raw
// cameras, or screen shares. Exercise the actual uploader's selection.
const html = fs.readFileSync('app/live-round.html', 'utf8');
const start = html.indexOf('  function pushRoomShot(){');
const end = html.indexOf('    if (!data || data.length < 200) return;', start);
let captured;
const published = { width: 640 }, peer = { readyState: 2 }, hiddenRaw = { secret: true };
const state = { proUid: 'a', conUid: 'b', proName: 'A', conName: 'B', motion: 'Public topic' };
const ps = {
  local: { user_id: 'a', session_id: 'local', local: true, tracks: { video: { playable: true } } },
  peer: { user_id: 'b', session_id: 'peer', tracks: { video: { playable: true } } },
  audience: { user_id: 'c', session_id: 'audience', tracks: { video: { playable: true } } },
};
const roomContext = vm.createContext({
  document: { hidden: false }, roomShot: { busy: false }, roomShotEligible: () => true,
  state, room: { joined: true, active: 'peer', call: { participants: () => ps }, tiles: {
    'seat:peer': { video: peer }, 'seat:audience': { video: hiddenRaw },
  } },
  camConv: { mode: 'avatar', cam: { canvas: published, videoEl: hiddenRaw } },
  isAudienceName: () => false, trackOf: slot => slot?.playable,
  window: { DBRoomSnapshot: { capture: (seats, motion) => { captured = { seats, motion }; } } },
});
vm.runInContext(html.slice(start, end) + '\n}\npushRoomShot();', roomContext);
assert.equal(captured.seats[0].source, published);
assert.equal(captured.seats[1].source, peer);
assert.equal(captured.seats[1].active, true);
assert.equal(captured.motion, 'Public topic');
captured = null; delete ps.peer;
vm.runInContext('pushRoomShot()', roomContext);
assert.equal(captured, null, 'one assigned seat cannot produce a room snapshot');
console.log('Room snapshot access, expiry, presence and published-track checks passed.');
