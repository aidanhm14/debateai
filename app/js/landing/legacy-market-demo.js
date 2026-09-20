
/* Featured-market drift (2026-07-22). The band argues that a crowd's
   reads aggregate into a price, so the price has to actually move: a
   28-point history line, a probability that walks, both side fills, and
   a call count that ticks up. Pure illustration — no wallet, no
   endpoint, no live platform data, matching the mock cards it sits in.
   Reduced-motion returns before the interval so those visitors keep the
   static market baked into the markup. Every lookup is null-guarded so
   the IIFE is a no-op if the band is ever cut. */
(function(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var line = document.querySelector('[data-fb-line]');
  if (!line) return;
  var area = document.querySelector('[data-fb-area]');
  var dot = document.querySelector('[data-fb-dot]');
  var pctBig = document.querySelector('[data-fb-pct]');
  var proPct = document.querySelector('[data-fb-pro]');
  var conPct = document.querySelector('[data-fb-con]');
  var proFill = document.querySelector('[data-fb-fill-pro]');
  var conFill = document.querySelector('[data-fb-fill-con]');
  var calls = document.querySelector('[data-fb-calls]');
  var clock = document.querySelector('[data-fb-clock]');

  var pro = 62, callsN = 147, clockS = 102, hist = [];
  function clamp(v){ return Math.max(14, Math.min(86, v)); }
  /* Seed as a WALK, not 28 independent samples: each point derives from
     the one before it, with a gentle pull toward the current price. A
     per-point random draw looks like a seismograph, not a market. */
  var seed = 46;
  for (var i = 0; i < 28; i++) {
    seed = clamp(seed + (Math.random() * 5 - 2.5) + (pro - seed) * .06);
    hist.push(seed);
  }
  hist[hist.length - 1] = pro;

  function render(){
    /* y-scale hugs the history's own range so the line fills the box
       instead of flattening; same approach as the hero market card. */
    var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
    var pad = Math.max(3, (hi - lo) * .15);
    lo -= pad; hi += pad;
    function yy(p){ return 37 - (p - lo) / (hi - lo) * 34; }
    var pts = [], n = hist.length;
    for (var i = 0; i < n; i++) pts.push((i * (100 / (n - 1))).toFixed(2) + ',' + yy(hist[i]).toFixed(2));
    line.setAttribute('points', pts.join(' '));
    if (area) area.setAttribute('d', 'M0,40 L' + pts.join(' L') + ' L100,40 Z');
    if (dot) dot.style.top = (yy(pro) / 40 * 100).toFixed(1) + '%';
    var p = Math.round(pro), c = 100 - p;
    if (pctBig) pctBig.textContent = String(p);
    if (proPct) proPct.textContent = p + '%';
    if (conPct) conPct.textContent = c + '%';
    if (proFill) proFill.style.width = p + '%';
    if (conFill) conFill.style.width = c + '%';
    if (calls) calls.textContent = String(callsN);
    if (clock) {
      var m = Math.floor(clockS / 60), s = clockS % 60;
      clock.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }
  }

  function tick(){
    if (document.hidden) return;
    pro = clamp(pro + (Math.random() * 4.4 - 2.2));
    hist.push(pro);
    if (hist.length > 28) hist.shift();
    if (Math.random() < .55) callsN += 1;
    clockS = clockS > 0 ? clockS - 2 : 420;
    render();
  }

  render();
  /* Only run while the band is on screen; a market ticking in a section
     nobody is looking at is pure battery burn on mobile. */
  var timer = null;
  function start(){ if (!timer) timer = setInterval(tick, 2000); }
  function stop(){ if (timer) { clearInterval(timer); timer = null; } }
  var band = document.getElementById('floor-band');
  if (band && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(es){
      es.some(function(e){ return e.isIntersecting; }) ? start() : stop();
    }, { rootMargin: '160px 0px' }).observe(band);
  } else {
    start();
  }
})();
