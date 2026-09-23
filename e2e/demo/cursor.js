// Injected into every recorded page (addInitScript). Playwright's screencast
// never paints the OS pointer, so a demo recording shows clicks landing on
// nothing. This draws one: an arrow that follows the synthetic mouse and a
// red ripple on mousedown. Pointer-events: none, top frame only, highest
// z-index, and it never touches the page's own DOM beyond appending itself.
(function () {
  if (window.top !== window) return;
  function mount() {
    if (document.getElementById('__dcur')) return;
    var style = document.createElement('style');
    style.textContent =
      '#__dcur{position:fixed;left:0;top:0;width:24px;height:32px;z-index:2147483647;pointer-events:none;' +
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));transform:translate(-9999px,-9999px);will-change:transform}' +
      '#__drip{position:fixed;left:0;top:0;width:46px;height:46px;border-radius:50%;border:3px solid #e11d48;' +
      'z-index:2147483646;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.3)}' +
      '#__drip.go{animation:__dripA .55s ease-out forwards}' +
      '@keyframes __dripA{0%{opacity:.95;transform:translate(-50%,-50%) scale(.35)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.4)}}';
    var cur = document.createElement('div');
    cur.id = '__dcur';
    cur.innerHTML =
      '<svg viewBox="0 0 24 32" width="24" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 2 L3 24 L8.5 18.8 L12.2 27.5 L16.4 25.7 L12.8 17.2 L20 17.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    var rip = document.createElement('div');
    rip.id = '__drip';
    if (window.__demoTouch) cur.style.display = 'none';
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(cur);
    document.documentElement.appendChild(rip);
    var lastX = -9999, lastY = -9999;
    document.addEventListener('mousemove', function (e) {
      lastX = e.clientX; lastY = e.clientY;
      cur.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)';
    }, { capture: true, passive: true });
    document.addEventListener('mousedown', function (e) {
      rip.style.left = e.clientX + 'px';
      rip.style.top = e.clientY + 'px';
      rip.classList.remove('go');
      void rip.offsetWidth;
      rip.classList.add('go');
    }, { capture: true, passive: true });
    // Touch taps (mobile recordings) get the ripple too.
    document.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return;
      rip.style.left = t.clientX + 'px'; rip.style.top = t.clientY + 'px';
      rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
    }, { capture: true, passive: true });
    window.__demoCursorHide = function (h) { cur.style.opacity = h ? '0' : '1'; };
  }
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
