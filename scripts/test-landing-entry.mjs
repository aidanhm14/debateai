import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('app/landing.html', 'utf8');
const boot = html.match(/<script id="landing-entry-boot">([\s\S]*?)<\/script>/)[1];
const main = fs.readFileSync('app/js/landing-entry.js', 'utf8');
function target() {
  const events = new Map();
  return {
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); },
    fire(name, rest = {}) { for (const fn of [...(events.get(name) || [])]) fn({ type: name, ...rest }); },
    count() { return [...events.values()].reduce((sum, set) => sum + set.size, 0); }
  };
}
function harness(options = {}) {
  const attrs = new Map([['data-first-screen', options.arm || 'ticker']]);
  const root = { getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
  const timers = new Map(); let timerID = 0;
  const effects = [];
  function piece(role, rect = {}, style = {}) {
    return { role, getAttribute: () => role, getBoundingClientRect: () => ({ top: 100, bottom: 300, width: 200, height: 200, ...rect }),
      style: { opacity: '1', transform: 'none', visibility: 'visible', ...style },
      animate(frames, timing) {
        if (options.throwOnAnimate || (options.throwAfter != null && effects.length >= options.throwAfter)) throw new Error('Animation unavailable');
        let resolve, reject;
        const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
        const animation = { frames, timing, finished, node: this, cancelled: false, resolve,
          cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
        effects.push(animation); return animation;
      }
    };
  }
  const pieces = [piece('board'), piece('camera-a'), piece('camera-b'), piece('topic', {}, { opacity: '0' }),
    piece('decision', {}, { transform: 'matrix(1, 0, 0, 1, 20, 0)' }), piece('primary'),
    piece('ai', { width: 0, height: 0 }), piece('standings', { top: 1000, bottom: 1200 }),
    piece('mobile-primary', { width: options.mobile ? 200 : 0 }), piece('mobile-ai', { width: options.mobile ? 200 : 0 })];
  const brand = piece('header'); const nav = [piece('nav'), piece('nav', { width: 0, height: 0 })];
  const media = Object.assign(target(), { matches: !!options.reduced });
  const document = Object.assign(target(), { documentElement: root, readyState: 'interactive', hidden: !!options.hidden,
    querySelector: () => brand, querySelectorAll: selector => selector.includes('ui-topbar-right') ? nav : pieces });
  const window = Object.assign(target(), { document, matchMedia: query => query.includes('max-width') ? { matches: !!options.mobile } : media, innerHeight: 800, scrollY: options.scrollY || 0,
    getComputedStyle: node => node.style, Element: { prototype: { animate() {} } },
    performance: { getEntriesByType: () => [{ type: options.navigation || 'navigate' }] } });
  if (options.unsupported) delete window.Element.prototype.animate;
  const context = { window, document, Element: window.Element, performance: window.performance, location: { hash: options.hash || '' },
    setTimeout(fn, ms) { const id = ++timerID; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, Promise };
  vm.runInNewContext(boot, context);
  return { window, document, media, root, pieces, effects, timers,
    load() { vm.runInNewContext(main, context); document.fire('DOMContentLoaded'); },
    expire() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } } };
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
for (const options of [{ reduced: true }, { hidden: true }, { unsupported: true }, { navigation: 'back_forward' }, { hash: '#faq' }, { arm: 'current' }]) {
  const h = harness(options); h.load();
  assert.equal(h.root.getAttribute('data-landing-entry'), null);
  assert.equal(h.effects.length, 0);
}
{
  const h = harness(); assert.equal(h.root.getAttribute('data-landing-entry'), 'pending');
  h.expire(); h.load();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, 'Missing/late module cannot keep home hidden');
  assert.equal(h.effects.length, 0); assert.equal(h.window.count(), 0);
}
{
  const h = harness(); h.load();
  assert.equal(h.root.getAttribute('data-landing-entry'), 'playing');
  assert.equal(h.effects.length, 8, 'Only visible first-screen pieces animate');
  const effect = role => h.effects.find(a => a.node.role === role);
  assert(effect('camera-a').timing.delay < effect('camera-b').timing.delay);
  assert(effect('camera-b').timing.delay < effect('primary').timing.delay);
  assert.equal(effect('topic').frames.at(-1).opacity, 1, 'Initial carousel fade cannot leave topic transparent');
  assert.equal(effect('decision').frames.at(-1).transform, 'matrix(1, 0, 0, 1, 20, 0)', 'Existing layout transforms are preserved');
  assert(h.effects.every(a => a.timing.duration + a.timing.delay < 1500));
  h.document.fire('DOMContentLoaded'); assert.equal(h.effects.length, 8, 'No replay on repeated setup');
  h.effects.forEach(a => a.resolve()); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null);
  assert(h.effects.every(a => a.cancelled)); assert.equal(h.timers.size, 0);
  assert.equal(h.window.count(), 0); assert.equal(h.media.count(), 0); assert.equal(h.document.count(), 0);
}
for (const name of ['pointerdown', 'keydown', 'focusin', 'pagehide', 'resize']) {
  const h = harness(); h.load(); h.window.fire(name); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, name + ' reveals all content immediately');
  assert(h.effects.every(a => a.cancelled));
}
{
  const h = harness(); h.window.fire('keydown'); h.load();
  assert.equal(h.effects.length, 0, 'Interaction during preparation skips the entrance');
}
{
  const h = harness(); h.load(); h.media.matches = true; h.media.fire('change'); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, 'Reduced motion changing mid-entry cancels effects');
}
{
  const h = harness(); h.load(); h.window.fire('pageshow', { persisted: false });
  assert.equal(h.root.getAttribute('data-landing-entry'), 'playing');
  h.window.fire('pageshow', { persisted: true }); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, 'Back-forward cache never restores hidden pieces');
}
{
  const h = harness(); h.load(); h.document.hidden = true; h.window.fire('visibilitychange'); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null);
}
{
  const h = harness(); h.window.scrollY = 100; h.load();
  assert.equal(h.effects.length, 0, 'Restored scroll positions skip entrance');
}
{
  const h = harness({ throwOnAnimate: true }); h.load();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, 'Animation errors leave the page visible');
}
{
  const h = harness(); h.load(); h.expire(); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null, 'Unsettled effects have a bounded recovery');
}
{
  const h = harness({ throwAfter: 1 }); h.load(); await tick();
  assert.equal(h.root.getAttribute('data-landing-entry'), null);
  assert(h.effects[0].cancelled, 'Partial setup cancels earlier effects safely');
}
{
  const h = harness({ mobile: true }); h.load();
  const effect = role => h.effects.find(a => a.node.role === role);
  assert(effect('mobile-primary').timing.delay < effect('board').timing.delay);
  assert(effect('board').timing.delay < effect('mobile-ai').timing.delay, 'Mobile follows the actual card order');
  h.expire(); await tick();
}
console.log('Landing entry: ordered pieces, mobile/hidden exclusions, transient carousel opacity, layout transforms, reduced motion, interaction, history and failure recovery passed.');
