import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { faceThumbnailSvg } from '../app/netlify/functions/lib/replay-thumbnail.mjs';

const bytes = Buffer.from('public thumbnail fixture');
let recording = { published: true, roomName: 'round', thumbnailUrl: 'existing' };
let still = bytes.toString('base64'), reads = 0;
const source = fs.readFileSync(new URL('../app/netlify/functions/recording-thumb.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export const config', 'const config')
  .replace('export default async', 'globalThis.handler = async');
const context = vm.createContext({
  Buffer, URL, Response, AbortSignal, console, faceThumbnailSvg,
  getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => recording }) }) }) }),
  savedRoundThumbnail: async () => { reads++; return still; },
  getStore: () => ({ get: async () => bytes }),
  errorResponse: (error, status) => Response.json({ error }, { status }),
});
vm.runInContext(source, context);
const get = query => context.handler(new Request('https://test/api/recording-thumb?id=recording-123' + query));

let response = await get('&framing=faces');
assert.equal(response.headers.get('content-type'), 'image/svg+xml');
assert.equal(response.headers.get('cache-control'), 'no-store');
const svg = await response.text();
assert.equal((svg.match(/data:image\/jpeg;base64,/g) || []).length, 2);
assert.ok(svg.includes('viewBox="8 36 308 234"') && svg.includes('viewBox="324 36 308 234"'));
assert.ok(!svg.includes('<script') && !svg.includes('http://test'));
response = await get('');
assert.equal(response.headers.get('content-type'), 'image/jpeg');
assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
response = await get('&framing=unknown');
assert.equal(response.headers.get('content-type'), 'image/jpeg');

// The crop never applies to owner-chosen frames, arbitrary recording
// stills or external video frames, whose layouts are not known.
for (const override of [{ thumbV: 1 }, { youtubeId: 'external' }]) {
  recording = { published: true, ...override }; reads = 0;
  response = await get('&framing=faces');
  assert.equal(reads, 0);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
}
recording = { published: true, roomName: 'round' }; still = null;
response = await get('&framing=faces');
assert.equal(response.headers.get('content-type'), 'image/jpeg');
recording = { published: false }; reads = 0;
assert.equal((await get('&framing=faces')).status, 404);
assert.equal(reads, 0, 'publication is checked before reading a snapshot');
console.log('Replay thumbnails: public-only crop, uncached consent checks, owner frames and original JPEG fallback passed.');
