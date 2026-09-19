/* Assemble the existing home once on arrival. WAAPI keeps this finite entrance
   independent of the governor that pauses decorative CSS animations. */
(function () {
  'use strict';
  var state = window.__dbLandingEntry;
  if (!state || state.cancelled) return;
  var root = document.documentElement;
  var animations = [];
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var started = false;
  // delay, horizontal offset, vertical offset, tilt, starting scale
  var pieces = {
    live: [50, 0, 12, 0, 1],
    board: [80, 0, 38, 0, .975],
    'camera-a': [150, -24, 22, -1.2, .96],
    'camera-b': [220, 24, 22, 1.2, .96],
    topic: [280, 0, 22, 0, 1],
    decision: [340, 20, 0, 0, .98],
    primary: [400, 0, 32, 0, .975],
    watch: [470, -16, 24, -.4, .98],
    ai: [530, 16, 24, .4, .98],
    help: [440, 26, 12, 0, .98],
    chat: [530, 30, 18, 0, .98],
    signin: [580, 0, 16, 0, 1],
    standings: [620, 0, 26, 0, .985],
    'mobile-primary': [70, 0, 30, -.5, .965],
    'mobile-ai': [190, -18, 22, -.8, .97],
    'mobile-watch': [270, 18, 22, .8, .97],
    'mobile-signin': [350, 0, 18, 0, 1],
    'mobile-links': [410, 0, 14, 0, 1]
  };

  // On phones the existing board sits between Meet someone and the two
  // smaller doors, so assemble in that same reading order.
  if (window.matchMedia('(max-width: 720px)').matches) {
    pieces.board = [170, 0, 26, 0, .98];
    pieces['camera-a'] = [240, -16, 16, -.8, .97];
    pieces['camera-b'] = [300, 16, 16, .8, .97];
    pieces.topic = [350, 0, 18, 0, 1];
    pieces.decision = [390, 12, 0, 0, .98];
    pieces['mobile-ai'][0] = 450;
    pieces['mobile-watch'][0] = 510;
    pieces['mobile-signin'][0] = 570;
    pieces['mobile-links'][0] = 620;
  }

  state.finish = function () {
    document.removeEventListener('DOMContentLoaded', start);
    window.removeEventListener('resize', state.stop);
    if (motion.removeEventListener) motion.removeEventListener('change', state.stop);
    animations.forEach(function (animation) { animation.cancel(); });
    animations = [];
  };
  window.addEventListener('resize', state.stop, { once: true });
  if (motion.addEventListener) motion.addEventListener('change', state.stop, { once: true });

  function place(node, values, header) {
    var rect = node.getBoundingClientRect();
    // Offscreen and responsive alternatives stay in their ordinary state.
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
    var style = window.getComputedStyle(node);
    if (style.visibility === 'hidden') return;
    var base = style.transform === 'none' ? '' : ' ' + style.transform;
    // The carousel starts its own short fade on the topic during setup.
    // A snapshot of that transient zero must not become our final opacity.
    var opacity = header ? style.opacity : 1;
    var delay = values[0], x = values[1], y = values[2], tilt = values[3], scale = values[4];
    var animation = node.animate([
      { opacity: 0, transform: 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + tilt + 'deg) scale(' + scale + ')' + base,
        offset: 0, easing: 'cubic-bezier(.2,.8,.2,1)' },
      { opacity: opacity, transform: 'translate3d(' + (-x * .035) + 'px,' + (-y * .035) + 'px,0) rotate(' + (-tilt * .04) + 'deg) scale(1.002)' + base,
        offset: .8, easing: 'ease-out' },
      { opacity: opacity, transform: style.transform, offset: 1 }
    ], { duration: header ? 480 : 620, delay: delay, fill: 'backwards' });
    // A later element can fail to animate; cancelling earlier effects must
    // still have a rejection handler before the aggregate promise exists.
    animation.finished.catch(function () {});
    animations.push(animation);
  }

  function start() {
    if (started || state.cancelled) return;
    started = true;
    if (motion.matches || document.hidden || window.scrollY > 8) { state.stop(); return; }
    // Read real final styles, then attach all effects in this same task. Nothing
    // flashes between clearing the preparation rule and WAAPI taking over.
    root.setAttribute('data-landing-entry', 'playing');
    try {
      var brand = document.querySelector('#daTopbar .ui-topbar-left');
      if (brand) place(brand, [0, -12, -14, 0, .98], true);
      var nav = document.querySelectorAll('#daTopbar .ui-topbar-right > *');
      var visibleIndex = 0;
      nav.forEach(function (node) {
        if (!node.getBoundingClientRect().width) return;
        place(node, [40 + Math.min(visibleIndex++, 7) * 30, 0, -18, 0, .96], true);
      });
      document.querySelectorAll('[data-landing-piece]').forEach(function (node) {
        var values = pieces[node.getAttribute('data-landing-piece')];
        if (values) place(node, values, false);
      });
      if (!animations.length) { state.stop(); return; }
      clearTimeout(state.timer);
      state.timer = setTimeout(state.stop, 1600);
      Promise.all(animations.map(function (animation) { return animation.finished; })).then(state.stop, state.stop);
    } catch (_) { state.stop(); }
  }

  // This head script is deferred; wait for the later topbar defer and the
  // carousel's parse-time setup, without waiting for images or network data.
  if (document.readyState === 'complete') start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
