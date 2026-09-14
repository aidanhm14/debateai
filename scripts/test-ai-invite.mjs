import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/js/ai-invite.js', import.meta.url), 'utf8');
const frames = new Map(), events = {}, windowEvents = {};
let id = 0, intersection, reducedChange, themeChange, currentPath = [], draws = [];
const context2d = {
  setTransform() {}, clearRect() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  beginPath: () => { currentPath = []; },
  moveTo: (x, y) => currentPath.push([x, y]),
  lineTo: (x, y) => currentPath.push([x, y]),
  stroke: () => draws.push(currentPath),
};
const link = {
  clientWidth: 520, clientHeight: 60, handlers: {},
  matches: () => false, prepend: canvas => { link.canvas = canvas; },
  addEventListener: (name, fn) => { link.handlers[name] = fn; },
};
const reduced = { matches: false, addEventListener: (_, fn) => { reducedChange = fn; } };
const document = {
  hidden: false, documentElement: { dataset: { theme: 'light' } },
  querySelectorAll: () => [link],
  createElement: tag => {
    assert.equal(tag, 'canvas', 'Only the line is added, with no audio or overlay');
    return { width: 0, height: 0, setAttribute(name, value) { this[name] = value; }, getContext: () => context2d };
  },
  addEventListener: (name, fn) => { events[name] = fn; },
};
const IntersectionObserver = function (callback) { intersection = callback; this.observe = () => {}; };
const MutationObserver = function (callback) { themeChange = callback; this.observe = () => {}; };
const window = { IntersectionObserver, MutationObserver, addEventListener: (name, fn) => { windowEvents[name] = fn; } };
const context = {
  document, window, IntersectionObserver, MutationObserver, matchMedia: () => reduced, devicePixelRatio: 2,
  requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
  cancelAnimationFrame: id => frames.delete(id),
  Audio: function () { assert.fail('The button must not create audio'); },
  fetch: () => assert.fail('The animation does not need network activity'),
};
const tick = now => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); };
vm.runInNewContext(source, context);
assert.equal(link.canvas['aria-hidden'], 'true');
assert.equal(link.handlers.click, undefined, 'The original link handles navigation');
intersection([{ target: link, isIntersecting: true }]);
tick(1000);
assert.equal(draws.length, 3, 'The line draws before any hover or audio');
const initial = draws.at(-1);
tick(1100);
assert.notDeepEqual(draws.at(-1), initial, 'The idle line moves');
assert.equal(link.canvas.width, 1040);
assert.equal(link.canvas.height, 120);
intersection([{ target: link, isIntersecting: false }]);
tick(1200);
assert.equal(frames.size, 0, 'Offscreen buttons stop requesting frames');
intersection([{ target: link, isIntersecting: true }]);
reduced.matches = true; reducedChange(); tick(1300);
const still = draws.at(-1);
assert.equal(frames.size, 0, 'Reduced motion draws one still line');
link.handlers.focus(); tick(1400);
assert.deepEqual(draws.at(-1), still, 'Focus does not animate reduced motion');
document.documentElement.dataset.theme = 'dark'; themeChange(); tick(1500);
assert.equal(frames.size, 0, 'A theme change repaints without starting a loop');
reduced.matches = false; reducedChange(); tick(1600);
document.hidden = true; events.visibilitychange();
assert.equal(frames.size, 0, 'Hidden tabs stop rendering');
document.hidden = false; events.visibilitychange(); tick(1700);
assert.equal(frames.size, 1, 'Returning to the tab resumes the line');
windowEvents.pagehide();
assert.equal(frames.size, 0);
const css = fs.readFileSync(new URL('../app/css/ai-invite.css', import.meta.url), 'utf8');
assert.equal(css, fs.readFileSync(new URL('../css/ai-invite.css', import.meta.url), 'utf8'));
assert.doesNotMatch(css, /ai-invite-caption/);
console.log('AI button: silent idle animation, unchanged navigation, no overlay or network calls, reduced motion and visibility lifecycle passed.');
