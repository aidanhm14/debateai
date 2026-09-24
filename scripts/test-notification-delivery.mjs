import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
async function clickNotification(url, urls) {
  const listeners = {}, actions = [];
  const self = { location: { origin: 'https://itsdebatable.com' }, addEventListener: (name, handler) => { listeners[name] = handler; },
    clients: { matchAll: async () => urls.map((url, i) => ({ url, focus: () => actions.push(['focus', i]), navigate: destination => actions.push(['navigate', destination]) })),
      openWindow: target => actions.push(['open', target]) } };
  vm.runInNewContext(sw, { self, URL, console });
  let pending;
  listeners.notificationclick({ notification: { data: { url }, tag: 'da-spar-match', close() {} }, waitUntil: p => { pending = p; } });
  await pending;
  return actions;
}
assert.deepEqual(await clickNotification('/spar', ['https://itsdebatable.com/live-round?room=active']), [['open', '/spar?src=push&pk=match']]);
assert.deepEqual(await clickNotification('/live-round?room=active', ['https://itsdebatable.com/live-round.html?room=active']), [['focus', 0]]);
assert.deepEqual(await clickNotification('/notifications', ['https://itsdebatable.com/live-round?room=active', 'https://itsdebatable.com/notifications?src=push&pk=match']), [['focus', 1]]);
assert.deepEqual(await clickNotification('https://example.invalid', ['https://itsdebatable.com/']), []);
assert.deepEqual(await clickNotification('javascript:alert(1)', []), []);
console.log('Notification clicks: exact destination focus, live-call preservation, new tab, and same-origin checks passed.');

const sfx = readFileSync(new URL('../app/js/sfx.js', import.meta.url), 'utf8');
let audio, now = 1000, muted = false, started = 0, stopped = 0, pendingResume;
const events = {};
class Audio {
  constructor(){ audio = this; this.state = 'suspended'; this.currentTime = 1; this.destination = {}; }
  resume(){ return new Promise(resolve => { pendingResume = () => { this.state = 'running'; resolve(); }; }); }
  createOscillator(){ return { frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, disconnect(){}, start(){ started++; }, stop(at){ if (at === undefined) stopped++; } }; }
  createGain(){ return { gain: { setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, disconnect(){} }; }
}
const context = { Promise, Date: { now: () => now }, setTimeout: () => 0, AudioContext: Audio,
  localStorage: { getItem: () => muted ? '1' : '0', setItem: (key, value) => { muted = value === '1'; } },
  matchMedia: () => ({ matches: true }), addEventListener: (key, fn) => { events[key] = fn; } };
context.window = context;
vm.runInNewContext(sfx, context);
context.SFX.arm(); pendingResume(); await Promise.resolve();
assert.equal(context.SFX.canSound(), true);
audio.state = 'interrupted'; assert.equal(context.SFX.canSound(), false);
events.pointerdown(); pendingResume(); await Promise.resolve();
assert.equal(context.SFX.canSound(), true, 'a later gesture recovers interrupted audio');
context.SFX.notify(); assert.equal(started, 2, 'message cues respect explicit mute, not reduced-motion');
context.SFX.mute(); assert.equal(stopped, 2, 'mute stops scheduled tones');
context.SFX.notify(); assert.equal(started, 2);
context.SFX.unmute(); audio.state = 'suspended';
context.SFX.alert(3); now += 5000; pendingResume(); await Promise.resolve();
assert.equal(started, 2, 'an old alert cannot burst out when audio finally resumes');
audio.state = 'closed'; assert.equal(context.SFX.canSound(), false, 'closed context is replaced and must unlock');
console.log('Sound cues: interrupted recovery, explicit mute, reduced-motion notification, and stale-alert expiry passed.');
