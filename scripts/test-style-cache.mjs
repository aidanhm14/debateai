import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readPageSource } from './lib/page-source.mjs';

const worker = readFileSync('app/sw.js', 'utf8');
assert.equal(worker, readFileSync('sw.js', 'utf8'));
const handlers = {}, cache = new Map();
let requests = 0, offline = false;
const response = text => ({ ok: true, type: 'basic', text, clone() { return response(text); } });
vm.runInNewContext(worker, {
  URL, console,
  self: { location: { origin: 'https://itsdebatable.com' }, addEventListener: (key, fn) => { handlers[key] = fn; } },
  caches: {
    match: async request => cache.get(request.url),
    open: async () => ({ put: async (request, value) => cache.set(request.url, value) }),
  },
  fetch: async () => { requests++; if (offline) throw new Error('Offline'); return response('current'); },
});
async function load(url, destination) {
  let result;
  handlers.fetch({ request: { url, destination, mode: 'no-cors', method: 'GET' }, respondWith(promise) { result = promise; } });
  return result;
}
const local = 'https://itsdebatable.com/css/landing/first-screen-wide.css';
cache.set(local, response('old height cap'));
assert.equal((await load(local, 'style')).text, 'current', 'A cached stylesheet must not defeat a deployed layout');
assert.equal(requests, 1);
offline = true;
assert.equal((await load(local, 'style')).text, 'current', 'Styles remain available offline');
offline = false;
for (const [url, kind] of [['https://fonts.googleapis.com/css2?family=Inter', 'style'], ['https://itsdebatable.com/img/face.jpg', 'image']]) {
  cache.set(url, response('cached asset'));
  const before = requests;
  assert.equal((await load(url, kind)).text, 'cached asset');
  assert.equal(requests, before, 'Remote fonts and images keep their cache-first behavior');
}
const html = readFileSync('app/landing.html', 'utf8');
for (const file of ['first-screen-wide', 'stream-and-highlights']) {
  assert.match(html, new RegExp('/css/landing/' + file + '\\.css\\?v=[\\w.-]+'), 'The height fix must also bypass already-active older workers');
}
const expanded = readPageSource('app/landing.html');
assert.ok(expanded.includes(readFileSync('app/css/landing/first-screen-wide.css', 'utf8')));
assert.ok(expanded.includes(readFileSync('app/css/landing/stream-and-highlights.css', 'utf8')));
console.log('Style cache: fresh CSS wins, offline styles work, remote assets stay cached, versioned sources resolve.');
