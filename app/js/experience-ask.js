/* ──────────────────────────────────────────────────────────────────
   "Do you already debate?" — asked once, on arrival, site-wide.

   Aidan, 2026-08-22: "when entering site ask ppl if they already
   debate or dont and are new (no worries if your not!)".

   The answer already had plumbing and no front door. `audience-mode.js`
   has read localStorage `debateos-experience` since 2026-08-18, stamps
   it on <html> as data-debate-experience, swaps every [data-plain]
   string on the page, and feeds /practice's own register fork. What
   nothing did was ASK. The only prompt was a quiet line docked beside
   the Full tour button, below the fold on one page, which almost
   nobody reaches, and the post-signup onboarding card, which by
   definition arrives too late to change the copy a stranger read on
   the way in.

   Why a corner card and not the first screen. The chooser shipped
   overlaying the foot of #first-screen on 2026-08-18 and Aidan moved
   it down the same day, asking for a clean first screen. That call
   stands. So this does not touch the hero, does not stack another
   strip under the Open ribbon, and is not a modal: a modal in front
   of a stranger who has seen nothing yet is a toll booth, and the one
   thing the answer is for is making the page behind it easier to read.
   It waits for the visitor to look at the page first, then asks from
   the corner, once, and never again either way.

   Answering is not a commitment: /settings carries the same control,
   and the card says so.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__daExperienceAsk) return;
  window.__daExperienceAsk = true;

  var KEY = 'debateos-experience';
  var ASKED = 'debateos-experience-asked';
  var VALID = { competitive: 1, new: 1, unsure: 1 };

  /* Pages where the question is an interruption rather than a
     shortcut. Two kinds: a round in progress or about to be (asking
     someone mid-speech what kind of debater they are is worse than
     never asking), and pages that own the same decision already
     (/settings has the control, onboarding.js asks signed-in users the
     same question with four more behind it). Prefix match, so
     /live-round/anything is covered. */
  var SKIP = [
    '/live-round', '/voice-debate', '/newvoice', '/practice', '/casual-room',
    '/room-judge', '/voice-rfd', '/coach', '/exhibition', '/open', '/spar',
    '/debate-chat', '/live', '/settings', '/admin', '/onboarding', '/watch',
    '/pricing', '/pricing.html',
  ];

  function skipped() {
    var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    for (var i = 0; i < SKIP.length; i++) {
      if (path === SKIP[i] || path.indexOf(SKIP[i] + '/') === 0) return true;
    }
    return false;
  }

  function read(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function answered() { return !!VALID[read(KEY)] || read(ASKED) === '1'; }

  function track(name, params) {
    try { if (window.dosTrack) window.dosTrack(name, params); } catch (e) {}
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {}
  }

  function choose(value) {
    write(ASKED, '1');
    if (window.DebatableAudience && window.DebatableAudience.set) {
      window.DebatableAudience.set(value);
    } else {
      // audience-mode.js is injected by the same topbar file, so it is
      // normally already up. If it is not, do its two visible jobs
      // rather than dropping the answer: persist it and stamp the
      // attribute, and the swap runs when the module lands.
      write(KEY, value);
      document.documentElement.setAttribute('data-debate-experience', value);
    }
  }

  function mount() {
    if (answered() || skipped()) return;
    // A page that asks inline owns the question. /how-it-works puts the
    // fork in the reading order because the answer changes that page
    // more than any other, and two asks on one screen reads as nagging.
    if (document.querySelector('[data-exp]')) return;

    var css = document.createElement('style');
    css.textContent = [
      // Sits ABOVE the .fb-floating feedback button, which is 44px square at
      // left:18px bottom:18px on every topbar page. At bottom:16px this card
      // covered it completely, so the one control a confused visitor reaches
      // for was hidden by the thing asking whether they were confused.
      // 2026-08-24: this card was built for the old dark-default site and
      // drew its fill from var(--bg-card). On the light-default site
      // (2026-08-22) that token is a 3% surface TINT meant to sit on a card
      // already on the page, not an opaque standalone card, so the card
      // went invisible and its text floated over the creator wall and the
      // bounty picker behind it ("glitching look"). The palette is now
      // explicit and theme-split, so background and text can never
      // disagree on any surface: light base, dark override for the themed
      // pages. The red hover accent is theme-agnostic.
      '#daExpAsk{position:fixed;left:16px;bottom:76px;z-index:99990;width:min(340px,calc(100vw - 32px));',
        'padding:16px 18px 14px;border-radius:14px;',
        'background:#ffffff;color:#1a1a1f;',
        'border:1px solid rgba(0,0,0,.13);',
        'box-shadow:0 18px 48px -20px rgba(0,0,0,.32);',
        'font-family:Archivo,"DM Sans",system-ui,sans-serif;',
        'animation:daExpIn .22s ease-out}',
      ':root:not([data-theme="light"]) #daExpAsk{background:#15151a;color:#f5efe7;',
        'border-color:rgba(255,255,255,.16);box-shadow:0 18px 48px -18px rgba(0,0,0,.55)}',
      '@keyframes daExpIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){#daExpAsk{animation:none}}',
      '#daExpAsk .dea-q{margin:0 0 3px;font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1.3}',
      '#daExpAsk .dea-s{margin:0 0 12px;font-size:12.5px;line-height:1.45;color:rgba(26,26,31,.66)}',
      ':root:not([data-theme="light"]) #daExpAsk .dea-s{color:rgba(245,239,231,.66)}',
      '#daExpAsk .dea-row{display:flex;gap:8px;flex-wrap:wrap}',
      '#daExpAsk button.dea-b{flex:1 1 0;min-width:118px;padding:9px 12px;border-radius:999px;cursor:pointer;',
        'font:inherit;font-size:13px;font-weight:750;line-height:1.2;',
        'border:1px solid rgba(0,0,0,.22);background:transparent;color:#1a1a1f;',
        'transition:border-color .15s,background .15s,color .15s}',
      ':root:not([data-theme="light"]) #daExpAsk button.dea-b{border-color:rgba(255,255,255,.3);color:#f5efe7}',
      '#daExpAsk button.dea-b:hover{border-color:#ef4444;color:#ef4444;background:rgba(239,68,68,.10)}',
      '#daExpAsk .dea-x{position:absolute;top:8px;right:9px;width:26px;height:26px;border:0;background:none;cursor:pointer;',
        'font:inherit;font-size:17px;line-height:1;color:rgba(26,26,31,.5)}',
      ':root:not([data-theme="light"]) #daExpAsk .dea-x{color:rgba(245,239,231,.55)}',
      '#daExpAsk .dea-x:hover{color:#1a1a1f}',
      ':root:not([data-theme="light"]) #daExpAsk .dea-x:hover{color:#f5efe7}',
      '#daExpAsk .dea-note{margin:10px 0 0;font-size:11px;line-height:1.4;color:rgba(26,26,31,.5)}',
      ':root:not([data-theme="light"]) #daExpAsk .dea-note{color:rgba(245,239,231,.5)}',
      '@media (max-width:640px){#daExpAsk{left:12px;right:12px;bottom:72px;width:auto}}',
    ].join('');
    document.head.appendChild(css);

    var box = document.createElement('div');
    box.id = 'daExpAsk';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Tell us your debate experience');
    box.style.position = 'fixed';
    box.innerHTML =
      '<button type="button" class="dea-x" aria-label="Not now">&times;</button>' +
      '<p class="dea-q">Do you already debate?</p>' +
      '<p class="dea-s">No worries if you do not. It just changes how much jargon we use.</p>' +
      '<div class="dea-row">' +
        '<button type="button" class="dea-b" data-exp="competitive">Yes, I compete</button>' +
        '<button type="button" class="dea-b" data-exp="new">No, I am new</button>' +
      '</div>' +
      '<p class="dea-note">You can change this any time in settings.</p>';

    box.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.dea-x')) {
        // A dismiss is an answer to "may we ask", not to the question.
        // Nothing is stored under the experience key, so the copy stays
        // as authored and /settings still has an unanswered control.
        write(ASKED, '1');
        track('audience_choice', { value: 'dismissed', surface: 'entry_card' });
        box.remove();
        return;
      }
      var btn = t.closest('[data-exp]');
      if (!btn) return;
      var v = btn.getAttribute('data-exp');
      choose(v);
      track('audience_choice', { value: v, surface: 'entry_card' });
      box.innerHTML = '<p class="dea-q">' +
        (v === 'competitive' ? 'Good. We will keep the debate vocabulary.'
                             : 'Got it. We will keep it in plain English.') +
        '</p><p class="dea-s" style="margin:0">Change it any time in settings.</p>';
      setTimeout(function () { box.remove(); }, 2600);
    });

    document.body.appendChild(box);
    track('audience_ask_shown', { surface: 'entry_card' });
  }

  /* A short wait, on purpose. The question is easy to answer once you
     have seen what the site is, and unanswerable in the first 200ms
     when it is still a headline. Also lets the Open strip and the
     topbar settle so nothing lands on top of a moving layout. */
  function start() { setTimeout(mount, 2200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
