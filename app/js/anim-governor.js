/* anim-governor.js — decorative CSS animation costs a compositor layer and
   a repaint every frame, forever, whether or not anyone is looking at it.
   The landing page alone runs ~120 infinite animations; on a phone that is
   a measurable share of the battery and the frame budget for nothing.

   Two gates, both free to reverse:
     1. tab hidden          → pause every animation on the document
     2. element off-screen  → pause animations inside that section

   animation-play-state resumes exactly where it paused, so nothing jumps
   or restarts when it comes back into view. Sections un-pause 300px before
   they reach the viewport, so an entrance animation still plays in full.
   No-ops on browsers without IntersectionObserver. */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var d = document;
  var root = d.documentElement;

  var css = d.createElement('style');
  css.textContent =
    'html.anim-hidden *,html.anim-hidden *::before,html.anim-hidden *::after{animation-play-state:paused!important}' +
    '.anim-idle,.anim-idle::before,.anim-idle::after,' +
    '.anim-idle *,.anim-idle *::before,.anim-idle *::after{animation-play-state:paused!important}';
  (d.head || root).appendChild(css);

  /* Gate 1: backgrounded tab. rAF already stops on its own; CSS keyframes
     do not, and a phone with six tabs open pays for all six. */
  function syncHidden() { root.classList.toggle('anim-hidden', d.hidden); }
  d.addEventListener('visibilitychange', syncHidden);
  syncHidden();

  /* Gate 2: off-screen sections. */
  if (!('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      entries[i].target.classList.toggle('anim-idle', !entries[i].isIntersecting);
    }
  }, { rootMargin: '300px 0px' });

  function scan() {
    /* Sections and footers are the page's natural animation scopes. The
       topbar and any fixed chrome are deliberately not observed: they are
       always on screen, so observing them buys nothing. */
    var scopes = d.querySelectorAll('section,footer,[data-anim-scope]');
    for (var i = 0; i < scopes.length; i++) io.observe(scopes[i]);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
