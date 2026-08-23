/* wip-veil.js — the frosted glass over a page that is still being built.
   ------------------------------------------------------------------
   Drop this on a page whose CONTENT is written but whose PRODUCT is not
   there yet (the Masterclass describes an eight week course nobody can
   enrol in). The page keeps its markup, its structured data and its
   crawlability; a visitor gets a blurred read of it instead of a
   promise they cannot act on.

     <script defer src="/js/wip-veil.js" data-wip-label="Masterclass"></script>

   Rules the shape of this follows:

   - SCROLLING STAYS. The veil is a fixed pane with pointer-events:none,
     so the wheel and touch scroll fall straight through to the document
     and the blur re-rasterises over whatever is passing under it. That
     is the whole effect: shapes move, nothing resolves.
   - CLICKING DOES NOT. Page content goes pointer-events:none while the
     veil is up, because a link you cannot read is a link you cannot
     mean to click. The topbar, the mobile sheet and the veil's own
     badge are exempted by name so leaving is always one tap.
   - THE VEIL SITS UNDER THE TOPBAR (z-index 900 against the bar's
     1000), so navigation stays sharp and legible. backdrop-filter only
     blurs what is painted BEHIND the element, so anything stacked above
     it is untouched for free.
   - ESCAPE HATCH: ?unblur=1 lifts it for the rest of the tab, same
     convention as ?sparnight=off. For checking the page underneath
     without ripping the tag out.

   Turning a page off is deleting its one script tag. */
(function () {
  'use strict';
  if (window.__wipVeil) return;
  window.__wipVeil = true;

  var tag = document.currentScript;
  var label = (tag && tag.getAttribute('data-wip-label')) || '';
  var note  = (tag && tag.getAttribute('data-wip-note'))  || 'Being built right now. The page is here, the product is not, so it is behind glass until it works.';
  var backHref  = (tag && tag.getAttribute('data-wip-href'))  || '/how-it-works';
  var backLabel = (tag && tag.getAttribute('data-wip-cta'))   || 'See what is live';

  // QA lift. sessionStorage so a reload during a check does not need the
  // query string re-typed, and so it never persists past the tab.
  try {
    if (/[?&]unblur=1/.test(location.search)) sessionStorage.setItem('wipv-off', '1');
    if (sessionStorage.getItem('wipv-off') === '1') return;
  } catch (e) {}

  if (!label) {
    // Fall back to the page's own name: everything before the first
    // separator in the title, which on this site is the page label.
    label = (document.title || '').split('·')[0].trim();
  }

  var css = [
    /* The glass. saturate() alongside the blur keeps the smear coloured
       rather than grey, which is what makes it read as a page under
       frost instead of a loading state. */
    '.wipv{position:fixed;inset:0;z-index:900;pointer-events:none;',
      'backdrop-filter:blur(14px) saturate(1.25);',
      '-webkit-backdrop-filter:blur(14px) saturate(1.25);',
      'contain:strict}',

    /* Scrim: a touch of the page background so text under the blur
       loses its last bit of contrast, plus a vignette so the middle
       stays the brightest thing and the eye lands on the badge.
       color-mix against --bg means this tracks every theme. */
    '.wipv-scrim{position:absolute;inset:0;',
      'background:radial-gradient(120% 90% at 50% 42%,',
        'color-mix(in srgb,var(--bg,#faf9f5) 42%,transparent) 0%,',
        'color-mix(in srgb,var(--bg,#faf9f5) 72%,transparent) 62%,',
        'color-mix(in srgb,var(--bg,#faf9f5) 88%,transparent) 100%)}',

    /* Slow diagonal sheen. One pass every 14s, low alpha: it should
       register as the light moving rather than as an animation. */
    '.wipv-sheen{position:absolute;inset:-40%;opacity:.5;',
      'background:linear-gradient(115deg,transparent 38%,',
        'color-mix(in srgb,var(--accent-solid,#b91c1c) 9%,transparent) 48%,',
        'rgba(255,255,255,.14) 52%,transparent 62%);',
      'animation:wipv-drift 14s linear infinite}',
    '@keyframes wipv-drift{0%{transform:translate3d(-22%,-12%,0)}100%{transform:translate3d(22%,12%,0)}}',

    /* Grain. An SVG turbulence tile at low opacity stops the blur from
       looking like a cheap CSS filter and hides banding on wide
       gradients. */
    '.wipv-grain{position:absolute;inset:0;opacity:.16;mix-blend-mode:overlay;',
      'background-image:url("data:image/svg+xml;utf8,',
        '%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E',
        '%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22/%3E%3C/filter%3E',
        '%3Crect width=%22160%22 height=%22160%22 filter=%22url(%23n%29%22 opacity=%220.55%22/%3E%3C/svg%3E");',
      'background-size:160px 160px}',

    /* The badge. The only sharp thing on the page besides the bar, and
       the only thing here that takes a click. */
    '.wipv-badge{position:fixed;z-index:901;left:50%;top:50%;',
      'transform:translate(-50%,-50%);pointer-events:auto;',
      'width:min(92vw,430px);text-align:center;',
      'padding:26px 26px 22px;border-radius:18px;',
      'background:color-mix(in srgb,var(--bg,#faf9f5) 82%,transparent);',
      'border:1px solid var(--border,rgba(0,0,0,.12));',
      'box-shadow:0 24px 60px -20px rgba(0,0,0,.35);',
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
      'font-family:var(--font-body,system-ui,sans-serif);color:var(--text,#111)}',
    '.wipv-eyebrow{display:inline-flex;align-items:center;gap:7px;',
      'font-size:.66rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;',
      'color:var(--accent-solid,#b91c1c);margin:0 0 12px}',
    '.wipv-dot{width:7px;height:7px;border-radius:50%;',
      'background:var(--accent-solid,#b91c1c);animation:wipv-pulse 2.4s ease-in-out infinite}',
    '@keyframes wipv-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.72)}}',
    '.wipv-title{font-family:var(--font-display,var(--font-body,system-ui));',
      'font-size:clamp(1.5rem,4vw,2rem);font-weight:800;line-height:1.1;margin:0 0 10px}',
    '.wipv-note{font-size:.9rem;line-height:1.5;margin:0;',
      'color:color-mix(in srgb,var(--text,#111) 68%,transparent)}',
    '.wipv-cta{display:inline-block;margin-top:16px;font-size:.84rem;font-weight:700;',
      'color:var(--accent-solid,#b91c1c);text-decoration:none;',
      'border-bottom:1.5px solid color-mix(in srgb,var(--accent-solid,#b91c1c) 35%,transparent);',
      'padding-bottom:1px}',
    '.wipv-cta:hover{border-bottom-color:var(--accent-solid,#b91c1c)}',

    /* Content is inert while the veil is up. Named exemptions keep every
       way OUT of the page working: the bar, its menus and sheets, the
       floating widgets that live above the sheet, and the badge. */
    'html.wipv-on body{pointer-events:none;user-select:none;-webkit-user-select:none}',
    'html.wipv-on .ui-topbar,html.wipv-on .ui-topbar *,',
    'html.wipv-on .ui-beta-strip,html.wipv-on .ui-beta-strip *,',
    'html.wipv-on .ui-open-strip,html.wipv-on .ui-open-strip *,',
    'html.wipv-on [class*="ui-sheet"],html.wipv-on [class*="ui-sheet"] *,',
    'html.wipv-on [class*="ui-menu"],html.wipv-on [class*="ui-menu"] *,',
    'html.wipv-on [class*="ui-drawer"],html.wipv-on [class*="ui-drawer"] *,',
    'html.wipv-on .wipv-badge,html.wipv-on .wipv-badge *',
      '{pointer-events:auto;user-select:auto;-webkit-user-select:auto}',

    /* Anything that opts out stays sharp and live. Nothing uses this
       today; it is here so a page can keep one working control. */
    'html.wipv-on [data-wip-keep]{position:relative;z-index:902;pointer-events:auto}',

    /* Sitewide prompts stand down here. A page you cannot read is not a
       page to ask someone how much jargon they want, or to sell them an
       upgrade on. The veil's badge is the only thing talking. */
    'html.wipv-on #daExpAsk,html.wipv-on .ob-card,html.wipv-on .ob-backdrop,',
    'html.wipv-on #da-upgrade-cta,html.wipv-on #da-usage-banner,',
    'html.wipv-on .signup-nudge,html.wipv-on .signup-pill{display:none !important}',

    '@media (prefers-reduced-motion:reduce){',
      '.wipv-sheen{animation:none}.wipv-dot{animation:none}}',

    /* Safari on iOS renders backdrop-filter, but a browser without it
       would show the page unblurred, which defeats the point. Paint a
       solid-enough scrim in that case: less pretty, still unreadable. */
    '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){',
      '.wipv-scrim{background:color-mix(in srgb,var(--bg,#faf9f5) 92%,transparent)}}'
  ].join('');

  function mount() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var veil = document.createElement('div');
    veil.className = 'wipv';
    veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = '<div class="wipv-scrim"></div><div class="wipv-sheen"></div><div class="wipv-grain"></div>';

    var badge = document.createElement('div');
    badge.className = 'wipv-badge';
    badge.setAttribute('role', 'status');
    var esc = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    badge.innerHTML =
      '<p class="wipv-eyebrow"><span class="wipv-dot"></span>In progress</p>' +
      '<h2 class="wipv-title">' + esc(label) + '</h2>' +
      '<p class="wipv-note">' + esc(note) + '</p>' +
      '<a class="wipv-cta" href="' + esc(backHref) + '">' + esc(backLabel) + ' &rarr;</a>';

    document.body.appendChild(veil);
    document.body.appendChild(badge);
    document.documentElement.classList.add('wipv-on');

    try {
      if (window.gtag) window.gtag('event', 'wip_veil_view', { page: location.pathname });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
