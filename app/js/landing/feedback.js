
  (function(){
    var modal = document.getElementById('feedbackModal');
    if (!modal) return;
    var close = document.getElementById('fbClose');
    var backdrop = document.getElementById('fbBackdrop');

    function open(){
      modal.hidden = false;
      modal.setAttribute('aria-hidden','false');
      requestAnimationFrame(function(){ modal.classList.add('is-open'); });
      try { window.dosTrack && window.dosTrack('feedback_open'); } catch(e){}
    }
    function dismiss(){
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden','true');
      setTimeout(function(){ modal.hidden = true; }, 320);
    }

    close.addEventListener('click', dismiss);
    backdrop.addEventListener('click', dismiss);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !modal.hidden) dismiss();
    });

    // Delegated open: any [data-open-feedback] in the page (or added
    // dynamically by topbar.js / other widgets) becomes a trigger.
    document.addEventListener('click', function(e){
      var el = e.target.closest && e.target.closest('[data-open-feedback]');
      if (!el) return;
      e.preventDefault();
      open();
    });

    window.openFeedback = open;
  })();
