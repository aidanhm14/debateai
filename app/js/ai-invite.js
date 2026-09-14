/* A silent moving line inside the homepage AI buttons. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var links = Array.from(document.querySelectorAll('[data-ai-invite]'));
  if (!links.length) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var raf = 0, previousFrame = 0;
  var canvases = links.map(function (link) {
    var canvas = document.createElement('canvas');
    canvas.className = 'ai-invite-wave';
    canvas.setAttribute('aria-hidden', 'true');
    link.prepend(canvas);
    return { link: link, canvas: canvas, ctx: canvas.getContext('2d'), onScreen: false };
  });

  function draw(now) {
    raf = 0;
    if (document.hidden) return;
    var shown = canvases.filter(function (item) { return item.onScreen; });
    if (!shown.length) return;
    if (!reduced.matches) raf = requestAnimationFrame(draw);
    if (!reduced.matches && now - previousFrame < 33) return;
    previousFrame = now;
    shown.forEach(function (item) {
      var c = item.canvas, cx = item.ctx, w = item.link.clientWidth, h = item.link.clientHeight;
      if (!cx || !w || !h) return;
      var dpr = Math.min(devicePixelRatio || 1, 2);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
      var light = document.documentElement.dataset.theme === 'light';
      var gradient = cx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, light ? '#73737b' : '#d5d5de');
      gradient.addColorStop(0.5, '#f87171'); gradient.addColorStop(1, '#dc2626');
      var t = reduced.matches ? 0 : now / 1000;
      var engaged = item.link.matches(':hover,:focus-visible');
      var amp = reduced.matches ? 3 : (engaged ? 9 : 6) + Math.sin(t * 0.8) * 1.5;
      [6, 2.5, 1.2].forEach(function (width, pass) {
        cx.beginPath();
        for (var x = 0; x <= w; x += 3) {
          var envelope = 0.3 + 0.7 * Math.sin(Math.PI * x / w);
          var y = h / 2 + envelope * (Math.sin(x * 0.038 - t * 3.7) * amp + Math.sin(x * 0.019 + t * 2.2) * amp * 0.45);
          if (!x) cx.moveTo(x, y); else cx.lineTo(x, y);
        }
        cx.strokeStyle = gradient; cx.lineWidth = width;
        cx.globalAlpha = [0.08, 0.22, 0.72][pass]; cx.stroke();
      });
      cx.globalAlpha = 1;
    });
  }
  function animate() { if (!raf && !document.hidden) raf = requestAnimationFrame(draw); }
  function pause() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        canvases.forEach(function (item) { if (item.link === entry.target) item.onScreen = entry.isIntersecting; });
      });
      animate();
    });
    canvases.forEach(function (item) { observer.observe(item.link); });
  } else {
    canvases.forEach(function (item) { item.onScreen = true; });
    animate();
  }
  links.forEach(function (link) {
    link.addEventListener('pointerenter', animate);
    link.addEventListener('pointerleave', animate);
    link.addEventListener('focus', animate);
    link.addEventListener('blur', animate);
  });
  if (reduced.addEventListener) reduced.addEventListener('change', animate);
  if ('ResizeObserver' in window) {
    var sizeObserver = new ResizeObserver(animate);
    links.forEach(function (link) { sizeObserver.observe(link); });
  }
  if ('MutationObserver' in window) {
    new MutationObserver(animate).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.addEventListener('resize', animate);
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else animate(); });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', animate);
})();
