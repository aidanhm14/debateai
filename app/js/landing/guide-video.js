
(function(){
  var modal = document.getElementById('guideVideoModal');
  var vid   = document.getElementById('guideVideoEl');
  if (!modal || !vid) return;
  var lastFocus = null;

  function open(trigger){
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var p = vid.play();
    if (p && p.catch) p.catch(function(){});   /* autoplay refusal: controls are right there */
    var x = modal.querySelector('[data-guide-close]');
    if (x) x.focus();
    if (window.gtag) window.gtag('event', 'guide_video_open');
  }
  function close(){
    modal.hidden = true;
    document.documentElement.style.overflow = '';
    vid.pause();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('[data-guide-open]');
    if (t) { e.preventDefault(); open(t); return; }
    if (e.target.closest && e.target.closest('[data-guide-close]')) { e.preventDefault(); close(); return; }
    /* Backdrop, but not the card itself. */
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !modal.hidden) close();
  });
})();
