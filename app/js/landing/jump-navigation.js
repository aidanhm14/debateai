
  // Hide the landing side-nav when the user is scrolling DOWN (so it stops
  // covering content like the Markets cards). Reappears as soon as they
  // scroll up. Threshold of 120px keeps it visible over the hero where the
  // nav is most useful.
  (function(){
    var nav = null;
    var lastY = 0;
    var ticking = false;
    function onScroll(){
      if (!nav) nav = document.querySelector('.landing-jumpnav');
      if (!nav) return;
      var y = window.scrollY || window.pageYOffset || 0;
      if (y < 120) {
        nav.classList.remove('is-hidden');
      } else if (y > lastY + 4) {
        nav.classList.add('is-hidden');
      } else if (y < lastY - 4) {
        nav.classList.remove('is-hidden');
      }
      lastY = y;
      ticking = false;
    }
    window.addEventListener('scroll', function(){
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
  })();

  // Scroll-spy: highlight the jump-nav link for the section currently in
  // view, so the light TOC reads as a real table of contents. Only the
  // in-page (#anchor) links participate; off-page links (/live, etc.) are
  // left alone. (2026-06-15)
  (function(){
    var links = null, targets = null, sticking = false;
    function collect(){
      var nav = document.querySelector('.landing-jumpnav');
      if (!nav) return false;
      links = []; targets = [];
      nav.querySelectorAll('a[href^="#"]').forEach(function(a){
        var id = a.getAttribute('href').slice(1);
        if (!id) return;
        var sec = document.getElementById(id);
        // Skip deprecated/hidden sections (landing keeps retired hero arms
        // behind display:none — e.g. #debate-ai). A display:none element has
        // offsetParent===null and collapses to the y-position of whatever
        // follows it, which used to tie with #faq and steal the active state
        // ("Voice AI" stuck on as you scrolled). Only spy on real, laid-out
        // sections so the active marker tracks the section you can actually see.
        if (sec && sec.offsetParent !== null && sec.getClientRects().length){
          links.push(a); targets.push(sec);
        }
      });
      return links.length > 0;
    }
    function spy(){
      if (!links && !collect()) { sticking = false; return; }
      var line = (window.scrollY || 0) + window.innerHeight * 0.34;
      var bestI = -1, bestTop = -Infinity;
      for (var i = 0; i < targets.length; i++){
        var top = targets[i].getBoundingClientRect().top + (window.scrollY || 0);
        if (top <= line && top > bestTop){ bestTop = top; bestI = i; }
      }
      for (var j = 0; j < links.length; j++){
        links[j].classList.toggle('is-active', j === bestI);
      }
      sticking = false;
    }
    // Coalesce layout reads into one painted frame. Calling spy() directly
    // and again through rAF forced two getBoundingClientRect passes for
    // every scroll event and fought the browser's own scrolling work.
    window.addEventListener('scroll', function(){
      if (!sticking){ requestAnimationFrame(spy); sticking = true; }
    }, { passive: true });
    window.addEventListener('load', spy);
    window.addEventListener('resize', spy, { passive: true });
  })();
