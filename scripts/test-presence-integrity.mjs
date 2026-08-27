import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isAutomatedUserAgent,
  isSuspiciousPresenceCell,
  publicPresencePin,
} from '../app/netlify/functions/lib/presence-quality.mjs';

const edgeFilter = readFileSync(new URL('../app/netlify/edge-functions/traffic-quality.js', import.meta.url), 'utf8');
const edgeModule = await import('data:text/javascript;base64,' + Buffer.from(edgeFilter).toString('base64'));
const trafficQuality = edgeModule.default;
const { isObviousAutomatedDocument } = edgeModule;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', name);
  } catch (err) {
    console.error('  FAIL', name);
    throw err;
  }
}

console.log('Presence integrity');

test('normal Safari is not classified as automation', () => {
  assert.equal(isAutomatedUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'
  ), false);
});

for (const [name, ua] of [
  ['Google renderer', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['headless Chrome', 'Mozilla/5.0 HeadlessChrome/127.0.0.0 Safari/537.36'],
  ['Playwright', 'Playwright/1.48'],
  ['direct curl', 'curl/8.7.1'],
]) {
  test(name + ' is refused', () => assert.equal(isAutomatedUserAgent(ua), true));
}

for (const [name, cell] of [
  ['Moses Lake screenshot shape', { n: 14, n30: 2, n5: 0 }],
  ['Des Moines screenshot shape', { n: 12, n30: 12, n5: 2 }],
  ['San Jose screenshot shape', { n: 22, n30: 22, n5: 6 }],
  ['fast five-session burst', { n: 9, n30: 6, n5: 5 }],
  ['thirty-minute burst', { n: 11, n30: 8, n5: 1 }],
]) {
  test(name + ' is quarantined', () => assert.equal(isSuspiciousPresenceCell(cell), true));
}

test('small recent household cell remains visible', () => {
  assert.equal(isSuspiciousPresenceCell({ n: 4, n30: 4, n5: 4 }), false);
});

test('ordinary spread-out cell remains visible', () => {
  assert.equal(isSuspiciousPresenceCell({ n: 11, n30: 3, n5: 1 }), false);
});

test('public pin exposes location but normalizes the exact city count', () => {
  const pin = publicPresencePin({
    lat: 37.3, lng: -121.9, city: 'San Jose', country: 'US',
    n: 7, n30: 2, n5: 1, lastSeen: 123,
  });
  assert.deepEqual(pin, {
    lat: 37.3, lng: -121.9, city: 'San Jose', country: 'US', n: 1, lastSeen: 123,
  });
});

test('public pin omits a quarantined cell', () => {
  assert.equal(publicPresencePin({ n: 12, n30: 2, n5: 0 }), null);
});

function documentRequest(userAgent, path = '/', headers = {}) {
  return new Request('https://itsdebatable.com' + path, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'sec-fetch-dest': 'document',
      'user-agent': userAgent,
      ...headers,
    },
  });
}

test('edge refuses a headless HTML page before it becomes a CDN pageview', () => {
  const request = documentRequest('Mozilla/5.0 HeadlessChrome/127.0.0.0 Safari/537.36');
  assert.equal(isObviousAutomatedDocument(request), true);
  assert.equal(trafficQuality(request)?.status, 204);
});

test('edge preserves Google search crawling', () => {
  const request = documentRequest('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(isObviousAutomatedDocument(request), false);
  assert.equal(trafficQuality(request), undefined);
});

test('edge preserves ordinary browsers', () => {
  const request = documentRequest('Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36');
  assert.equal(isObviousAutomatedDocument(request), false);
});

test('edge never intercepts APIs or static assets', () => {
  assert.equal(isObviousAutomatedDocument(documentRequest('curl/8.7.1', '/api/presence-live')), false);
  assert.equal(isObviousAutomatedDocument(documentRequest('curl/8.7.1', '/js/track.js')), false);
});

test('edge catches direct scripted requests for extensionless pages', () => {
  const request = new Request('https://itsdebatable.com/spar', {
    headers: { 'user-agent': 'curl/8.7.1' },
  });
  assert.equal(isObviousAutomatedDocument(request), true);
});

const track = readFileSync(new URL('../app/js/track.js', import.meta.url), 'utf8');
const clarity = readFileSync(new URL('../app/js/clarity.js', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../app/netlify/functions/presence-live.mjs', import.meta.url), 'utf8');
const adminEndpoint = readFileSync(new URL('../app/netlify/functions/admin-visitors.mjs', import.meta.url), 'utf8');
const appNetlify = readFileSync(new URL('../app/netlify.toml', import.meta.url), 'utf8');
const rootNetlify = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');

test('client gate requires a browser-trusted event', () => {
  assert.match(track, /event\.isTrusted !== true/);
});

test('client gate has no passive dwell unlock', () => {
  assert.doesNotMatch(track, /PRESENCE_DWELL_MS/);
  assert.doesNotMatch(track, /visibleMs/);
});

test('client gate does not treat scrolling as proof', () => {
  assert.match(track, /PRESENCE_SIGNALS = \['pointerdown', 'keydown', 'touchstart'\]/);
  assert.doesNotMatch(track, /PRESENCE_SIGNALS[^\n]*(?:scroll|wheel)/);
});

test('client gate invalidates sessions trusted by v1', () => {
  assert.match(track, /PRESENCE_GATE_VERSION = '2'/);
  assert.match(track, /sessionStorage\.removeItem\('_da_plast'\)/);
});

test('session replay also waits for trusted interaction', () => {
  assert.match(clarity, /event\.isTrusted !== true/);
  assert.match(clarity, /intentionally behind the interaction gate/);
});

test('server write has automation and shared-rate gates', () => {
  assert.match(endpoint, /isAutomatedUserAgent\(userAgent\)/);
  assert.match(endpoint, /checkLayers\('presence-live'/);
  assert.match(endpoint, /callerIp\(request\)/);
});

test('server read uses a fresh cache namespace and cell quarantine', () => {
  assert.match(endpoint, /presence-live:pins:trusted-v1/);
  assert.match(endpoint, /isSuspiciousPresenceCell\(cell\)/);
  assert.match(endpoint, /const pin = publicPresencePin\(cell\)/);
});

test('public payload cannot restore synthetic presence or signup padding', () => {
  for (const retired of [
    'PRESENCE_BASELINE', 'SIGNUP_BASELINE', 'AMBIENT_CITIES',
    'buildAmbientPins', 'googleSignupCount',
  ]) {
    assert.equal(endpoint.includes(retired), false, retired + ' still exists');
  }
  assert.doesNotMatch(endpoint, /pins\.concat/);
  assert.doesNotMatch(endpoint, /payload\.signups/);
});

test('admin live totals use the same burst quarantine', () => {
  assert.match(adminEndpoint, /isSuspiciousPresenceCell\(cell\)/);
  assert.match(adminEndpoint, /suppressedLiveSessions/);
});

test('edge filter remains narrow and configured in both Netlify layouts', () => {
  assert.doesNotMatch(edgeFilter, /googlebot|bingbot/i);
  assert.match(appNetlify, /edge_functions = "netlify\/edge-functions"/);
  assert.match(rootNetlify, /edge_functions = "app\/netlify\/edge-functions"/);
});

console.log(`\n${passed} presence-integrity assertions passed.`);
