// Real notification setup flow in a VM. Every browser, native, and network
// boundary is mocked: this test never subscribes a device or sends an alert.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app/js/notifications.js', import.meta.url), 'utf8');
const prefix = source.slice(0, source.indexOf('  // Cross-platform attention signal:'));
function fixture(options = {}) {
  const writes = [], calls = [];
  const memory = new Map();
  let current = { uid: 'person-a', isAnonymous: false, getIdToken: async () => 'test-token' };
  const subscription = { toJSON: () => ({ endpoint: 'https://example.invalid/push', keys: { auth: 'test', p256dh: 'test' } }) };
  const registration = { pushManager: { getSubscription: async () => null, subscribe: async () => { calls.push('subscribe'); return subscription; } } };
  const notifications = {
    permission: options.permission || 'default',
    requestPermission: async () => { calls.push('permission'); notifications.permission = options.grant || 'granted'; return notifications.permission; },
  };
  const native = {
    checkPermissions: async () => { calls.push('native-check'); return { receive: options.permission || 'prompt' }; },
    requestPermissions: async () => { calls.push('native-request'); return { receive: options.grant || 'granted' }; },
    getToken: async () => ({ token: 'test-native-token' }), addListener() {},
  };
  const context = {
    Promise, Uint8Array, atob: (v) => Buffer.from(v, 'base64').toString('binary'),
    setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) },
    Notification: notifications, PushManager: function () {},
    navigator: { userAgent: options.ua || 'Mozilla Chrome desktop', serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
    document: { querySelector: () => true, hasFocus: () => true, hidden: false },
    location: { pathname: '/profile' },
    firebase: { auth: () => ({ currentUser: current }) },
    fetch: async (url, request = {}) => {
      calls.push(url + ':' + (request.method || 'GET'));
      if (request.body) writes.push({ url, body: JSON.parse(request.body) });
      if (options.changeAccount && url.includes('notify-prefs')) current = { ...current, uid: 'person-b' };
      return {
        ok: !(options.saveFail && url.includes('push-subscribe') && request.method === 'POST') && !(options.prefsFail && url.includes('notify-prefs')),
        json: async () => ({ configured: options.configured !== false, publicKey: 'BA' }),
      };
    },
  };
  if (options.native) context.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { FirebaseMessaging: native } };
  context.window = context;
  vm.runInNewContext(prefix + '\nwindow.testPush = daRegisterPush; window.testReady = daDevicePushReady;\n})();', context);
  return { context, calls, writes, memory };
}
let f = fixture();
assert.equal(await f.context.daSetLiveAlerts(true), true);
assert.deepEqual(f.calls.filter(c => c === 'permission' || c === 'subscribe' || c.includes(':POST')), [
  'permission', 'subscribe', '/.netlify/functions/push-subscribe:POST', '/.netlify/functions/notify-prefs:POST',
]);
assert.equal(f.context.daGetLiveAlertsState(), 'on');
assert.equal(await f.context.daSetLiveAlerts(false), true);
assert.equal(f.context.daGetLiveAlerts(), false);
assert.equal(f.context.testReady(), true, 'turning off pool alerts preserves the device for other notifications');
for (const options of [{ grant: 'denied' }, { configured: false }, { saveFail: true }, { prefsFail: true }, { changeAccount: true }]) {
  f = fixture(options);
  assert.equal(await f.context.daSetLiveAlerts(true), false, JSON.stringify(options));
  assert.equal(f.context.daGetLiveAlerts(), false, 'failed setup cannot say alerts are enabled');
  assert.notEqual(f.context.daGetLiveAlertsState(), 'on');
  if (!options.prefsFail && !options.changeAccount) assert.equal(f.writes.some(w => w.url.includes('notify-prefs')), false, 'no opt-in before a registered device');
}
f = fixture({ native: true });
assert.equal(await f.context.testPush(), false);
assert.deepEqual(f.calls, ['native-check'], 'auth load checks native permission without prompting');
assert.equal(await f.context.daSetLiveAlerts(true), true);
assert.equal(f.calls.filter(c => c === 'native-request').length, 1);
assert.equal(f.writes[0].body.nativeToken, 'test-native-token');
assert.equal(f.context.daGetLiveAlertsState(), 'on');
f = fixture({ native: true, saveFail: true });
assert.equal(await f.context.daSetLiveAlerts(true), false);
assert.equal(f.context.daGetLiveAlerts(), false);
f = fixture({ ua: 'iPhone' });
assert.equal(f.context.daGetLiveAlertsState(), 'install', 'Safari on iPhone has actionable install guidance');
console.log('test-live-alert-setup: passed browser/native permission, registration, save failure, account change, opt-out, and iPhone setup checks');

const webpushSource = readFileSync(new URL('../app/netlify/functions/lib/webpush.mjs', import.meta.url), 'utf8');
const fanout = webpushSource.slice(webpushSource.indexOf('export async function sendToManyUsers'), webpushSource.indexOf('// Send a notification to every device')).replace('export ', '');
const attempted = [];
const nativeOnly = {
  pushConfigured: () => false, fcmConfigured: () => true,
  sendToUser: async uid => { attempted.push(uid); return { sent: uid === 'registered' ? 1 : 0 }; },
};
vm.runInNewContext(fanout + '\nthis.send = sendToManyUsers;', nativeOnly);
const result = await nativeOnly.send(['registered', 'no-device'], { title: 'Test' });
assert.deepEqual(attempted, ['registered', 'no-device'], 'native alerts fan out without browser VAPID');
assert.equal(result.delivered, 1, 'recipient count reflects accepted devices only');
assert.equal(result.sent, 1);
console.log('test-live-alert-setup: native-only broadcast and accepted-delivery counting passed');
