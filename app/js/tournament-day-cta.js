/* Tournament-day home CTA.
 *
 * The regular announcement strip is easy to dismiss and is intentionally
 * compact. On the event day, a real signed-in account instead gets one large
 * action above the homepage first screen. It opens /open, the page that owns
 * check-in, queue state, room links, ballots, standings, and the bracket.
 */
(function () {
  'use strict';
  if (window.__daTournamentDayCta) return;
  window.__daTournamentDayCta = true;

  var path = (location.pathname || '/').replace(/\/$/, '') || '/';
  if (path !== '/' && path !== '/landing.html') return;

  var DAY_START = Date.parse('2026-08-29T00:00:00-07:00');
  var DAY_END = Date.parse('2026-08-29T23:59:59-07:00');
  var now = Date.now();
  if (now < DAY_START || now > DAY_END) return;

  function remove() {
    var old = document.getElementById('tournamentDayCta');
    if (old) old.remove();
  }

  function mount(user) {
    if (!user || user.isAnonymous) { remove(); return; }
    if (document.getElementById('tournamentDayCta')) return;
    var first = document.getElementById('first-screen');
    if (!first || !first.parentNode) return;

    var style = document.createElement('style');
    style.id = 'tournamentDayCtaStyle';
    style.textContent =
      '.tday-cta{position:relative;z-index:35;display:block;margin:0;padding:17px 22px;' +
      'background:linear-gradient(100deg,#991b1b,#dc2626 55%,#ef4444);color:#fff;text-decoration:none;' +
      'box-shadow:0 12px 30px rgba(127,29,29,.3);font-family:var(--font-body,system-ui,sans-serif)}' +
      '.tday-cta-in{width:min(1180px,calc(100% - 32px));margin:0 auto;display:flex;align-items:center;' +
      'justify-content:center;gap:18px;flex-wrap:wrap;text-align:center}' +
      '.tday-cta-k{font-size:.7rem;line-height:1;font-weight:900;letter-spacing:.16em;text-transform:uppercase;opacity:.82}' +
      '.tday-cta-main{font-size:clamp(1.05rem,2vw,1.35rem);line-height:1.15;font-weight:900}' +
      '.tday-cta-btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 17px;border-radius:10px;' +
      'background:#fff;color:#991b1b;font-size:.86rem;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.16)}' +
      '.tday-cta:hover .tday-cta-btn{transform:translateY(-1px)}' +
      '.tday-cta:focus-visible{outline:3px solid #fff;outline-offset:-5px}' +
      '@media(max-width:620px){.tday-cta{padding:14px 12px}.tday-cta-in{gap:8px}.tday-cta-k{width:100%}' +
      '.tday-cta-main{font-size:1rem}.tday-cta-btn{width:100%;max-width:280px}}' +
      '@media(prefers-reduced-motion:no-preference){.tday-cta-btn{transition:transform .16s ease}}';
    document.head.appendChild(style);

    var cta = document.createElement('a');
    cta.id = 'tournamentDayCta';
    cta.className = 'tday-cta';
    cta.href = '/open';
    cta.setAttribute('data-cta', 'tournament-day-home');
    cta.setAttribute('aria-label', 'Tournament day. Open your event page.');
    cta.innerHTML = '<span class="tday-cta-in">' +
      '<span class="tday-cta-k">Tournament day</span>' +
      '<span class="tday-cta-main">The Debatable Open starts at 7 AM Pacific</span>' +
      '<span class="tday-cta-btn">Open your event page &rarr;</span>' +
      '</span>';
    cta.addEventListener('click', function () {
      try {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'tournament_day_home_click', { destination: '/open' });
        }
      } catch (e) {}
    });
    first.parentNode.insertBefore(cta, first);
  }

  function attach() {
    try {
      window.firebase.auth().onAuthStateChanged(mount);
      return true;
    } catch (e) { return false; }
  }

  if (attach()) return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (attach() || tries > 80) clearInterval(timer);
  }, 100);
})();
