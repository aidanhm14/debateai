/* Site-wide Coach FAB.
   Floating action button bottom-right on every page that loads
   topbar.js (which auto-injects this file the same way it auto-
   injects sfx.js). Clicking opens a small slide-up drawer with
   a voice picker + Start. Both Start and "Open full session"
   navigate to /coach — the actual WebRTC session lives there,
   not in the drawer. This keeps the drawer code tiny and the
   full-page experience the single source of truth.

   The picked voice persists to localStorage under the same key
   coach.html reads (debateai-coach-gender), so the drawer's
   picker and the /coach page's picker stay in sync.

   Hides itself on /coach (would be redundant) and inside the
   /tools/copy-edit.html iframe shell. */
(function(){
  var here = (location.pathname || '/').replace(/\/$/, '') || '/';
  if (here === '/coach' || here.indexOf('/coach') === 0) return;
  if (here.indexOf('/tools/copy-edit') !== -1) return;
  // 2026-06-23: skip the floating coach orb on phones per Aidan ("get rid
  // of coach orb in mobile for now"). It crowded the bottom-right corner
  // against the Feedback pill on small screens. Mount-time guard so the
  // orb + drawer + backdrop + session iframe never get created on mobile;
  // Coach is still reachable from the topbar hamburger ("Coach" link).
  // Drop this block to bring the mobile orb back.
  try {
    if (window.matchMedia && window.matchMedia('(max-width:560px)').matches) return;
  } catch (e) {}
  // Marketing home: the page is wall-to-wall CTAs already, and the Feedback
  // pill + sign-in nudge own the bottom-right corner. A third floating button
  // there just collides with them, so the Coach FAB sits this page out.
  if (here === '/' || /\/(landing|index)(\.html)?$/.test(here.toLowerCase())) return;
  if (window.top !== window) return; // never render inside an iframe

  var STORAGE_KEY = 'debateai-coach-gender';

  function loadGender(){
    try { var v = localStorage.getItem(STORAGE_KEY); if (v === 'male' || v === 'female') return v; } catch(e){}
    return 'female';
  }
  function setGender(g){ try { localStorage.setItem(STORAGE_KEY, g); } catch(e){} }

  // ── CSS ────────────────────────────────────────────────────
  var css = [
    // The coach is a presence that follows you across the app: a small
    // red orb (same sphere language as the /coach live orb) parked bottom
    // right. Glow pulse + expanding rings read as "alive"; a hover tooltip
    // names it. Click opens the drawer.
    '.dafab-orb{position:fixed;right:20px;bottom:20px;z-index:9000;',
      'width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;padding:0;',
      'background:radial-gradient(circle at 38% 32%, rgba(255,255,255,.45), transparent 42%),',
      'radial-gradient(circle at 50% 50%, #ef4444 0%, #b91c1c 58%, #7f1d1d 100%);',
      'animation:dafab-glow 3s ease-in-out infinite;',
      'transition:transform .15s,box-shadow .15s;}',
    '.dafab-orb:hover{transform:scale(1.07);',
      'box-shadow:0 14px 36px rgba(239,68,68,.5),0 3px 10px rgba(0,0,0,.32),inset 0 -5px 14px rgba(0,0,0,.4);}',
    '.dafab-orb:focus-visible{outline:2px solid #fff;outline-offset:3px;}',
    '@keyframes dafab-glow{0%,100%{box-shadow:0 8px 24px rgba(239,68,68,.34),inset 0 -5px 14px rgba(0,0,0,.4)}',
      '50%{box-shadow:0 10px 32px rgba(239,68,68,.52),inset 0 -5px 14px rgba(0,0,0,.4)}}',
    '.dafab-orb::before,.dafab-orb::after{content:"";position:absolute;inset:-5px;border-radius:50%;',
      'border:1.5px solid rgba(239,68,68,.45);opacity:0;animation:dafab-ring 3s ease-out infinite;pointer-events:none;}',
    '.dafab-orb::after{animation-delay:1.5s;}',
    '@keyframes dafab-ring{0%{transform:scale(.88);opacity:.5}100%{transform:scale(1.5);opacity:0}}',
    '@media(prefers-reduced-motion:reduce){.dafab-orb{animation:none}.dafab-orb::before,.dafab-orb::after{animation:none}}',
    '.dafab-tip{position:fixed;right:90px;bottom:34px;z-index:9000;pointer-events:none;',
      'background:#11111c;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:9px;',
      'padding:7px 12px;font-size:.74rem;font-weight:700;',
      'font-family:Crimson Pro,Inter,system-ui,-apple-system,sans-serif;white-space:nowrap;',
      'opacity:0;transform:translateX(8px);transition:opacity .15s,transform .15s;',
      'box-shadow:0 8px 22px rgba(0,0,0,.4);}',
    '.dafab-tip.on{opacity:1;transform:translateX(0);}',

    '.dafab-backdrop{position:fixed;inset:0;z-index:8998;',
      'background:rgba(0,0,0,.52);opacity:0;pointer-events:none;',
      'transition:opacity .18s;}',
    '.dafab-backdrop.on{opacity:1;pointer-events:auto;}',

    '.dafab-drawer{position:fixed;right:18px;bottom:18px;z-index:9001;',
      'width:min(360px,calc(100vw - 36px));',
      'background:#11111c;color:rgba(255,255,255,.92);',
      'border:1px solid rgba(255,255,255,.12);border-radius:18px;',
      'padding:20px 20px 16px;',
      'box-shadow:0 20px 60px rgba(0,0,0,.45);',
      'font-family:Crimson Pro,Inter,system-ui,-apple-system,sans-serif;',
      'transform:translateY(14px) scale(.96);opacity:0;pointer-events:none;',
      'transform-origin:bottom right;transition:transform .18s,opacity .18s;}',
    '.dafab-drawer.on{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}',
    '.dafab-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
    '.dafab-h-l{font-family:Crimson Pro,Inter,system-ui,-apple-system,sans-serif;font-size:1.05rem;font-weight:700;letter-spacing:-.01em;}',
    '.dafab-x{background:transparent;border:none;color:rgba(255,255,255,.5);cursor:pointer;',
      'font-size:1rem;padding:4px 6px;border-radius:6px;line-height:1;}',
    '.dafab-x:hover{color:rgba(255,255,255,.9);background:rgba(255,255,255,.06);}',
    '.dafab-sub{color:rgba(255,255,255,.62);font-size:.78rem;line-height:1.5;margin:0 0 14px;}',

    '.dafab-drills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}',
    '.dafab-chip{font-size:.72rem;font-weight:700;color:rgba(255,255,255,.82);text-decoration:none;',
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);',
      'border-radius:999px;padding:6px 11px;transition:.15s;cursor:pointer;}',
    '.dafab-chip:hover{border-color:#ef4444;color:#fff;background:rgba(239,68,68,.14);}',
    '.dafab-lbl{font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;',
      'color:rgba(255,255,255,.4);margin:0 0 8px;}',

    '.dafab-pick{display:flex;gap:8px;margin-bottom:14px;}',
    '.dafab-opt{flex:1;cursor:pointer;background:transparent;',
      'border:1px solid rgba(255,255,255,.12);border-radius:10px;',
      'padding:10px 12px;font-size:.78rem;color:rgba(255,255,255,.78);',
      'text-align:center;transition:.15s;font-family:inherit;font-weight:600;}',
    '.dafab-opt:hover{border-color:rgba(239,68,68,.4);color:#fff;}',
    '.dafab-opt.on{border-color:#ef4444;background:rgba(239,68,68,.14);color:#fff;}',

    '.dafab-start{display:block;width:100%;text-align:center;text-decoration:none;',
      'background:#ef4444;color:#fff;font-family:inherit;font-size:.86rem;',
      'font-weight:700;padding:11px 14px;border-radius:10px;border:none;',
      'cursor:pointer;transition:.15s;}',
    '.dafab-start:hover{background:#dc2626;}',
    '.dafab-open{display:block;text-align:center;margin-top:10px;',
      'font-size:.72rem;color:rgba(255,255,255,.55);text-decoration:none;}',
    '.dafab-open:hover{color:rgba(255,255,255,.9);}',

    '@media (max-width:480px){.dafab-orb{right:14px;bottom:14px;}',
      '.dafab-drawer{right:14px;bottom:14px;}.dafab-tip{display:none;}}',

    // ── Light theme overrides ────────────────────────────────
    '[data-theme="light"] .dafab-tip{background:#fff;color:rgba(0,0,0,.88);',
      'border-color:rgba(0,0,0,.12);box-shadow:0 6px 18px rgba(0,0,0,.12);}',
    '[data-theme="light"] .dafab-backdrop{background:rgba(0,0,0,.28);}',
    '[data-theme="light"] .dafab-drawer{background:#fff;color:rgba(0,0,0,.88);',
      'border-color:rgba(0,0,0,.10);box-shadow:0 16px 48px rgba(0,0,0,.14);}',
    '[data-theme="light"] .dafab-h-l{color:rgba(0,0,0,.92);}',
    '[data-theme="light"] .dafab-x{color:rgba(0,0,0,.4);}',
    '[data-theme="light"] .dafab-x:hover{color:rgba(0,0,0,.8);background:rgba(0,0,0,.05);}',
    '[data-theme="light"] .dafab-sub{color:rgba(0,0,0,.55);}',
    '[data-theme="light"] .dafab-lbl{color:rgba(0,0,0,.42);}',
    '[data-theme="light"] .dafab-chip{color:rgba(0,0,0,.72);background:rgba(0,0,0,.04);',
      'border-color:rgba(0,0,0,.12);}',
    '[data-theme="light"] .dafab-chip:hover{border-color:#ef4444;color:#b91c1c;background:rgba(239,68,68,.08);}',
    '[data-theme="light"] .dafab-opt{color:rgba(0,0,0,.64);border-color:rgba(0,0,0,.14);}',
    '[data-theme="light"] .dafab-opt:hover{border-color:rgba(239,68,68,.4);color:rgba(0,0,0,.88);}',
    '[data-theme="light"] .dafab-opt.on{border-color:#ef4444;background:rgba(239,68,68,.08);color:#b91c1c;}',
    '[data-theme="light"] .dafab-open{color:rgba(0,0,0,.48);}',
    '[data-theme="light"] .dafab-open:hover{color:rgba(0,0,0,.82);}',

    // ── Live-session mode: the drawer expands to host the /coach
    //    iframe so the session runs IN the popup (on any page), not on a
    //    separate page. The iframe stays mounted while the drawer is
    //    closed, so the session keeps running as you move around the app.
    '.dafab-drawer.in-session{width:min(460px,calc(100vw - 24px));height:min(700px,calc(100vh - 84px));padding:0;overflow:hidden;display:flex;flex-direction:column;}',
    '.dafab-drawer.in-session .dafab-h{padding:11px 14px;margin:0;border-bottom:1px solid rgba(255,255,255,.1);}',
    '.dafab-drawer.in-session .dafab-launch{display:none;}',
    '.dafab-launch{display:block;}',
    '.dafab-session{display:none;flex:1;min-height:0;}',
    '.dafab-drawer.in-session .dafab-session{display:flex;}',
    '.dafab-session iframe{flex:1;width:100%;height:100%;border:none;background:#0a0509;display:block;}',
    '.dafab-h-r{display:flex;align-items:center;gap:5px;}',
    '.dafab-end{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.42);color:#fca5a5;font-size:.6rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;border-radius:8px;padding:4px 9px;cursor:pointer;font-family:inherit;line-height:1;}',
    '.dafab-end:hover{background:rgba(239,68,68,.3);color:#fff;}',
    // Orb turns green while a session is live, so you can see it running
    // even with the popup closed.
    '.dafab-orb.live{background:radial-gradient(circle at 38% 32%, rgba(255,255,255,.5), transparent 42%),radial-gradient(circle at 50% 50%, #22c55e 0%, #15803d 58%, #14532d 100%);animation:dafab-glow-live 2.2s ease-in-out infinite;}',
    '@keyframes dafab-glow-live{0%,100%{box-shadow:0 8px 24px rgba(34,197,94,.4),inset 0 -5px 14px rgba(0,0,0,.4)}50%{box-shadow:0 10px 34px rgba(34,197,94,.62),inset 0 -5px 14px rgba(0,0,0,.4)}}',
  ].join('');

  var style = document.createElement('style');
  style.setAttribute('data-coach-fab', '');
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM ────────────────────────────────────────────────────
  var backdrop = document.createElement('div');
  backdrop.className = 'dafab-backdrop';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dafab-orb';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Open your coach');
  btn.innerHTML = '';

  var tip = document.createElement('div');
  tip.className = 'dafab-tip';
  tip.textContent = 'Your coach';

  var drawer = document.createElement('div');
  drawer.className = 'dafab-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Start a coach session');
  drawer.innerHTML = ''
    + '<div class="dafab-h">'
    +   '<div class="dafab-h-l" id="dafabTitle">Your coach</div>'
    +   '<div class="dafab-h-r">'
    +     '<button class="dafab-end" type="button" hidden>End</button>'
    +     '<button class="dafab-x" type="button" aria-label="Close">✕</button>'
    +   '</div>'
    + '</div>'
    + '<div class="dafab-launch">'
    +   '<p class="dafab-sub">Runs right here in this popup. Start a drill, then keep moving around the app — the coach stays live in this panel, no separate page.</p>'
    +   '<p class="dafab-lbl">Jump into a drill</p>'
    +   '<div class="dafab-drills">'
    +     '<button class="dafab-chip" type="button" data-drill="poi">POI gauntlet</button>'
    +     '<button class="dafab-chip" type="button" data-drill="rebuttal">Rebuttal sprint</button>'
    +     '<button class="dafab-chip" type="button" data-drill="impact">Impact weighing</button>'
    +     '<button class="dafab-chip" type="button" data-drill="crossex">Cross-ex</button>'
    +   '</div>'
    +   '<p class="dafab-lbl">Coach voice</p>'
    +   '<div class="dafab-pick" role="radiogroup" aria-label="Coach voice">'
    +     '<button class="dafab-opt" type="button" data-g="female">Female</button>'
    +     '<button class="dafab-opt" type="button" data-g="male">Male</button>'
    +   '</div>'
    +   '<button class="dafab-start" type="button" data-action="start">Start a session</button>'
    +   '<a class="dafab-open" href="/coach" target="_blank" rel="noopener">or open the full page →</a>'
    + '</div>'
    + '<div class="dafab-session"></div>';

  document.body.appendChild(backdrop);
  document.body.appendChild(btn);
  document.body.appendChild(tip);
  document.body.appendChild(drawer);

  // Hover tooltip (named presence). Hidden while the drawer is open.
  btn.addEventListener('mouseenter', function(){ if (!drawer.classList.contains('on')) tip.classList.add('on'); });
  btn.addEventListener('mouseleave', function(){ tip.classList.remove('on'); });
  btn.addEventListener('focus', function(){ if (!drawer.classList.contains('on')) tip.classList.add('on'); });
  btn.addEventListener('blur', function(){ tip.classList.remove('on'); });

  // ── Wire ───────────────────────────────────────────────────
  function paintPicker(){
    var g = loadGender();
    Array.prototype.forEach.call(drawer.querySelectorAll('.dafab-opt'), function(o){
      o.classList.toggle('on', o.getAttribute('data-g') === g);
    });
  }
  paintPicker();

  Array.prototype.forEach.call(drawer.querySelectorAll('.dafab-opt'), function(o){
    o.addEventListener('click', function(){
      setGender(o.getAttribute('data-g'));
      paintPicker();
    });
  });

  function open(){
    drawer.classList.add('on');
    backdrop.classList.add('on');
    tip.classList.remove('on');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close(){
    drawer.classList.remove('on');
    backdrop.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
  }
  btn.addEventListener('click', function(){
    if (drawer.classList.contains('on')) close(); else open();
  });
  backdrop.addEventListener('click', close);
  drawer.querySelector('.dafab-x').addEventListener('click', close);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && drawer.classList.contains('on')) close();
  });

  // GA pings — non-fatal if gtag isn't loaded yet.
  btn.addEventListener('click', function(){
    try { window.gtag && gtag('event', 'coach_fab_open', { path: here }); } catch(e){}
  });

  // ── Session in the popup ─────────────────────────────────────
  // Start a drill -> load /coach?embed=1 in an iframe INSIDE the drawer.
  // The iframe stays mounted while the drawer is closed (the .on class
  // only transforms/fades the drawer, it doesn't unmount), so on the SPA
  // (/app) the WebRTC session keeps running as you switch tools. End it
  // explicitly with the End button.
  var sessionEl = drawer.querySelector('.dafab-session');
  var endBtn    = drawer.querySelector('.dafab-end');
  var titleEl   = drawer.querySelector('#dafabTitle');
  var sessIframe = null;

  function startSession(drill){
    var src = '/coach?embed=1';
    if (drill) src += '&drill=' + encodeURIComponent(drill);
    if (!sessIframe){
      sessIframe = document.createElement('iframe');
      sessIframe.setAttribute('allow', 'microphone; autoplay');
      sessIframe.setAttribute('title', 'AI debate coach');
      sessionEl.appendChild(sessIframe);
    }
    // Picked voice rides through shared localStorage (same origin), so the
    // embedded /coach reads the same debateai-coach-gender the drawer set.
    sessIframe.src = src;
    drawer.classList.add('in-session');
    if (endBtn) endBtn.hidden = false;
    if (titleEl) titleEl.textContent = 'Coach · live';
    btn.classList.add('live');
    open();
    try { window.gtag && gtag('event', 'coach_fab_start', { gender: loadGender(), drill: drill || '', path: here }); } catch(e){}
  }
  function endSession(){
    if (sessIframe){ try { sessIframe.src = 'about:blank'; } catch(e){} try { sessionEl.removeChild(sessIframe); } catch(e){} sessIframe = null; }
    drawer.classList.remove('in-session');
    if (endBtn) endBtn.hidden = true;
    if (titleEl) titleEl.textContent = 'Your coach';
    btn.classList.remove('live');
  }
  if (endBtn) endBtn.addEventListener('click', endSession);

  var startBtnEl = drawer.querySelector('[data-action="start"]');
  if (startBtnEl) startBtnEl.addEventListener('click', function(){ startSession(''); });
  Array.prototype.forEach.call(drawer.querySelectorAll('.dafab-chip'), function(c){
    c.addEventListener('click', function(){ startSession(c.getAttribute('data-drill')); });
  });
})();
