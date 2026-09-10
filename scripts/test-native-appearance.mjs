import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('app/js/native-bridge.js', 'utf8');
const appearance = source.split('// BEGIN NATIVE APPEARANCE')[1].split('// END NATIVE APPEARANCE')[0];
function harness(saved, {systemDark = false, storageFails = false} = {}) {
  const attrs = new Map(), stored = new Map([['db-native-appearance', saved], ['da-theme', 'grey']]);
  const events = {}, documentEvents = {}, nativeCalls = [];
  let observer, mediaChange;
  const root = {style: {}, getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value)};
  const media = {matches: systemDark, addEventListener: (_, listener) => {mediaChange = listener;}};
  const window = {matchMedia: () => media, addEventListener: (key, fn) => {events[key] = fn;}, Capacitor: {Plugins: {
    StatusBar: {setStyle: options => {nativeCalls.push(options.style); return Promise.resolve();}, setBackgroundColor: () => Promise.reject(new Error('Unsupported on iOS'))},
    Keyboard: {setStyle: () => {throw new Error('Unsupported on web');}}
  }}};
  const localStorage = {getItem(key) {if(storageFails) throw new Error('Unavailable'); return stored.get(key);}, setItem(key, value) {if(storageFails) throw new Error('Unavailable'); stored.set(key, value);}};
  const document = {documentElement: root, readyState: 'loading', querySelector: () => null, addEventListener: (key, fn) => {documentEvents[key] = fn;}};
  vm.runInNewContext(appearance, {window, document, localStorage, Promise, MutationObserver: class {constructor(fn) {observer = fn;} observe() {}}});
  return {attrs, stored, events, nativeCalls, api: window.DBNativeAppearance,
    theme: () => attrs.get('data-native-theme'), override() {attrs.set('data-theme', 'light'); attrs.set('data-force-theme', 'light'); observer();},
    system(dark) {media.matches = dark; mediaChange();}, loaded() {documentEvents.DOMContentLoaded();}};
}
const fresh = harness(null);
assert.equal(fresh.theme(), 'light', 'Keep the existing app appearance on first use');
fresh.api.set('dark');
assert.equal(fresh.theme(), 'dark');
assert.equal(fresh.attrs.get('data-theme'), 'crimson');
assert.equal(fresh.nativeCalls.at(-1), 'DARK', 'Installed Capacitor API uses DARK for light status text');
assert.equal(fresh.stored.get('da-theme'), 'grey', 'App controls leave website preferences alone');
assert.equal(harness(fresh.stored.get('db-native-appearance')).theme(), 'dark', 'The choice survives a new page');
fresh.override();
assert.equal(fresh.attrs.get('data-theme'), 'crimson', 'Legacy force-light pages cannot replace app dark mode');
fresh.system(true); fresh.system(false);
assert.equal(fresh.theme(), 'dark', 'Explicit dark stays dark when the OS changes');
fresh.api.set('system');
assert.equal(fresh.theme(), 'light');
fresh.system(true); assert.equal(fresh.theme(), 'dark');
fresh.system(false); assert.equal(fresh.theme(), 'light');
fresh.stored.set('db-native-appearance', 'dark'); fresh.events.storage({key: 'db-native-appearance'});
assert.equal(fresh.theme(), 'dark', 'Other app views can update the preference');
fresh.stored.delete('db-native-appearance'); fresh.events.storage({key: null});
assert.equal(fresh.theme(), 'light', 'Clearing storage returns to the default');
assert.equal(harness('invalid').theme(), 'light');
assert.equal(harness('system', {systemDark:true}).theme(), 'dark', 'System choice resolves before first paint');
const privateStorage = harness(null, {storageFails:true});
privateStorage.api.set('dark'); assert.equal(privateStorage.theme(), 'dark', 'Unavailable storage still allows switching');
privateStorage.loaded();
assert.equal(privateStorage.nativeCalls.at(-1), 'DARK', 'DOM ready resyncs native plugins');
const web = {navigator: {userAgent:'Mozilla/5.0'}, location: {hostname:'itsdebatable.com'}, window:{}};
vm.runInNewContext(source, web);
assert.equal(web.window.__DB_NATIVE, false);
assert.equal(web.window.DBNativeAppearance, undefined, 'The website never receives app appearance behavior');
await new Promise(resolve => setTimeout(resolve, 0));
console.log('PASS native appearance: persistence, OS changes, late page overrides, plugin styles, storage failures, and web isolation');
