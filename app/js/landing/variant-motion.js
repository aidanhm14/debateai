
(function(){
  if (document.documentElement.getAttribute('data-landing-variant') !== 'B') return;

  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

  function $id(id){ return document.getElementById(id); }

  function init(){
    var layer        = document.querySelector('.sf-travel-layer');
    var figure       = layer && layer.querySelector('.sf-travel-figure');
    var slot         = $id('founderFigureSlot');
    var slotInner    = slot && slot.querySelector('.figure-slot-inner');
    var sourceLeft   = document.querySelector('.standby-figures .sf-left');
    var sourceRight  = document.querySelector('.standby-figures .sf-right');
    if (!layer || !figure || !slot || !slotInner) return;

    // Reduced-motion shortcut: park the figure statically inside the slot
    // and stop. Right podium stays visible; source left podium stays
    // visible. No scroll engine attached.
    if (reduced){
      figure.style.position = 'absolute';
      figure.style.left = '0';
      figure.style.top  = '0';
      figure.style.transform = 'none';
      slotInner.appendChild(figure);
      layer.setAttribute('data-state','landed');
      layer.style.position = 'static';
      return;
    }

    var raf = 0;
    function clamp(n, lo, hi){ return n < lo ? lo : (n > hi ? hi : n); }
    function easeInOutCubic(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

    function tick(){
      raf = 0;
      if (!sourceLeft || !slot || !figure) return;

      var srcRect  = sourceLeft.getBoundingClientRect();
      var slotRect = slotInner.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;

      // Narrow-viewport fallback. The source podium silhouettes hide
      // under 760px, so a "travel" arc has no visible origin. Park the
      // figure statically inside the slot and skip the rAF math.
      if (srcRect.width === 0 || srcRect.height === 0){
        if (layer.getAttribute('data-state') !== 'landed'){
          figure.style.transform = '';
          figure.style.position = 'absolute';
          figure.style.left = '0';
          figure.style.top  = '0';
          if (figure.parentElement !== slotInner) slotInner.appendChild(figure);
          layer.setAttribute('data-state','landed');
          layer.style.position = 'static';
        }
        return;
      }

      // Wake when the slot enters the bottom 85% of the viewport;
      // land when the slot crosses the 32% mark.
      var wake = vh * 0.85;
      var land = vh * 0.32;
      var p = clamp((wake - slotRect.top) / (wake - land), 0, 1);
      var eased = easeInOutCubic(p);

      var figureW = figure.offsetWidth  || 200;
      var figureH = figure.offsetHeight || 460;

      var startX = srcRect.left;
      var startY = srcRect.top;
      // Land the figure horizontally centered in the slot, base at
      // the slot's bottom edge.
      var endX   = slotRect.left + (slotRect.width  - figureW) / 2;
      var endY   = slotRect.top  + (slotRect.height - figureH);

      // Quadratic Bezier control point — dropped below the linear path
      // for a smooth downward arc. Magnitude scales with travel distance.
      var dx = endX - startX;
      var dy = endY - startY;
      var dist = Math.sqrt(dx*dx + dy*dy);
      var arc = clamp(dist * 0.18, 40, 160);
      var cpX = (startX + endX) / 2;
      var cpY = Math.max(startY, endY) + arc;

      var t = eased;
      var mt = 1 - t;
      var x = mt*mt*startX + 2*mt*t*cpX + t*t*endX;
      var y = mt*mt*startY + 2*mt*t*cpY + t*t*endY;

      // Slight 0 → -4deg → 0 wobble, peaks at p=0.5.
      var rot = -4 * Math.sin(Math.PI * p);
      var scale = 1 - p * 0.08;

      // Set the full transform string inline. The HTML div wrapper
      // takes the transform reliably (SVG roots ignored it in testing).
      figure.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' +
        ' rotate(' + rot.toFixed(2) + 'deg)' +
        ' scale(' + scale.toFixed(3) + ')';

      if (sourceRight){
        sourceRight.style.setProperty('--sfr-opacity', String(1 - p));
        sourceRight.style.setProperty('--sfr-blur',    (p * 6).toFixed(2) + 'px');
        sourceRight.style.setProperty('--sfr-scale',   String(1 - p * 0.06));
      }
      if (sourceLeft){
        var srcFade = clamp(p * 3, 0, 1);
        sourceLeft.style.setProperty('--sfl-opacity', String(1 - srcFade));
      }

      var state = 'flying';
      if (p <= 0.001) state = 'pre';
      else if (p >= 0.999) state = 'landed';
      if (layer.getAttribute('data-state') !== state){
        layer.setAttribute('data-state', state);
      }
    }

    function schedule(){
      if (raf) return;
      raf = window.requestAnimationFrame(tick);
    }

    schedule();

    window.addEventListener('scroll', schedule, { passive:true });
    window.addEventListener('resize', schedule, { passive:true });
    window.addEventListener('load', schedule, { once:true });
    if (document.fonts && document.fonts.ready){
      try { document.fonts.ready.then(schedule).catch(function(){}); } catch(e){}
    }

    // GA event the first time the user actually triggers the transition,
    // so we can attribute drop-off per arm.
    var firedEntry = false;
    function entryWatcher(){
      if (firedEntry || !slot) return;
      var r = slot.getBoundingClientRect();
      var vh2 = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < vh2 * 0.85){
        firedEntry = true;
        try { if (window.gtag) window.gtag('event', 'landing_founder_scroll_view', { variant: 'B' }); } catch(e){}
        window.removeEventListener('scroll', entryWatcher);
      }
    }
    window.addEventListener('scroll', entryWatcher, { passive:true });
    entryWatcher();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
