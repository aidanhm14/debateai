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
      'font-family:Geist,Inter,system-ui,-apple-system,sans-serif;white-space:nowrap;',
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
      'font-family:Geist,Inter,system-ui,-apple-system,sans-serif;',
      'transform:translateY(14px) scale(.96);opacity:0;pointer-events:none;',
      'transform-origin:bottom right;transition:transform .18s,opacity .18s;}',
    '.dafab-drawer.on{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}',
    '.dafab-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
    '.dafab-h-l{font-family:Geist,Inter,system-ui,-apple-system,sans-serif;font-size:1.05rem;font-weight:700;letter-spacing:-.01em;}',
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
    +   '<div class="dafab-h-l">Your coach</div>'
    +   '<button class="dafab-x" type="button" aria-label="Close">✕</button>'
    + '</div>'
    + '<p class="dafab-sub">Your coach follows you across DebateIt. Jump into a drill from any page; close it, navigate somewhere else, and the orb is still here.</p>'
    + '<p class="dafab-lbl">Jump into a drill</p>'
    + '<div class="dafab-drills">'
    +   '<a class="dafab-chip" href="/coach?drill=poi" data-drill="poi">POI gauntlet</a>'
    +   '<a class="dafab-chip" href="/coach?drill=rebuttal" data-drill="rebuttal">Rebuttal sprint</a>'
    +   '<a class="dafab-chip" href="/coach?drill=impact" data-drill="impact">Impact weighing</a>'
    +   '<a class="dafab-chip" href="/coach?drill=crossex" data-drill="crossex">Cross-ex</a>'
    + '</div>'
    + '<p class="dafab-lbl">Coach voice</p>'
    + '<div class="dafab-pick" role="radiogroup" aria-label="Coach voice">'
    +   '<button class="dafab-opt" type="button" data-g="female">Female</button>'
    +   '<button class="dafab-opt" type="button" data-g="male">Male</button>'
    + '</div>'
    + '<a class="dafab-start" href="/coach" data-action="start">Open spar</a>'
    + '<a class="dafab-open" href="/coach">or open the full coach →</a>';

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
  drawer.querySelector('[data-action="start"]').addEventListener('click', function(){
    try { window.gtag && gtag('event', 'coach_fab_start', { gender: loadGender(), path: here }); } catch(e){}
  });
  Array.prototype.forEach.call(drawer.querySelectorAll('.dafab-chip'), function(c){
    c.addEventListener('click', function(){
      try { window.gtag && gtag('event', 'coach_fab_drill', { drill: c.getAttribute('data-drill'), path: here }); } catch(e){}
    });
  });
})();
