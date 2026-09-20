
  (function(){
    var gate = document.getElementById('landing-more');
    var toggle = document.getElementById('landing-more-toggle');
    // Sections a deep link has to open the gate to reach. The first five
    // are arm-dependent: in `full` they are already on the page, and
    // listing them there would pop the gate open on a jump to a chapter
    // the visitor can already see.
    var armGated = document.documentElement.getAttribute('data-onepager') === 'onepager'
      ? ['#how-it-works', '#live-proof', '#creator-sweepstakes']
      : [];
    var extraSelector = armGated.concat([
      '.hero-founder-frame > .hero',
      '#why-this-exists', '#floor-band', '#mode-select', '#engine-select', '#credential-path',
      '#community-band',
      '#reviews', '#faq'
    ]).join(',');
    if (!gate || !toggle) return;

    function setOpen(open, track){
      document.body.classList.toggle('landing-more-open', open);
      gate.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      // The TOC is built while these chapters are still collapsed. Let its
      // scrollspy, visibility range and progress track recalculate after
      // the gate changes without coupling the two components directly.
      try {
        window.dispatchEvent(new CustomEvent('landingmorechange', {
          detail: { open: open }
        }));
      } catch (_) {}
      if (track) {
        try {
          gtag('event', 'landing_more_toggle', {
            state: open ? 'open' : 'closed',
            cv: document.documentElement.getAttribute('data-lpcv') || ''
          });
        } catch (_) {}
      }
    }

    // cv arm: a chapter that has never rendered sits at its
    // contain-intrinsic-size placeholder, so chapters above a deep-link
    // target can re-render after the jump and shift the landing.
    // Render everything above the target up front (founder-scroll
    // precedent); chapters at and below it keep containment.
    function forceRenderAbove(target){
      if (document.documentElement.getAttribute('data-lpcv') !== 'cv') return;
      var chapters = ['how-it-works','live-now','live-proof','creator-sweepstakes','stream-it','why-this-exists','floor-band','credential-path','community-band','reviews','mode-select','engine-select','faq'];
      for (var i = 0; i < chapters.length; i++){
        var el = document.getElementById(chapters[i]);
        if (!el) continue;
        if (el === target || el.contains(target)) break;
        el.style.contentVisibility = 'visible';
      }
    }

    function revealHashTarget(){
      var raw = (window.location.hash || '').slice(1);
      if (!raw) return;
      var id;
      try { id = decodeURIComponent(raw); } catch (_) { id = raw; }
      var target = document.getElementById(id);
      if (!target) return;
      var inChapters = !!target.closest(extraSelector);
      // #waitlist sits after the gated chapters but outside the gate, so
      // a jump to it while the gate is open crosses every contained
      // chapter and needs the same stabilization.
      var pastChapters = !inChapters && !!target.closest('#waitlist');
      if (!inChapters && !pastChapters) return;
      if (pastChapters && !document.body.classList.contains('landing-more-open')) return;
      if (inChapters) setOpen(true, false);
      forceRenderAbove(target);
      window.requestAnimationFrame(function(){
        target.scrollIntoView({ block: 'start' });
        // cv arm: land once more after real heights settle (same
        // pattern as the founder-call scroll above).
        if (document.documentElement.getAttribute('data-lpcv') === 'cv'){
          setTimeout(function(){ target.scrollIntoView({ block: 'start' }); }, 450);
        }
      });
    }

    toggle.addEventListener('click', function(){
      setOpen(!document.body.classList.contains('landing-more-open'), true);
    });
    window.addEventListener('hashchange', revealHashTarget);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', revealHashTarget, { once: true });
    } else {
      revealHashTarget();
    }
  })();
  