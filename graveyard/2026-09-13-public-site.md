# Public site simplification, 2026-09-13

Aidan: "srsly reduce the AI wording across the website. simplify sites." The homepage now leads with live debate, watching and rankings. Repeated pitches, company theses, provider selectors and the hidden long tour were removed. Restore only after a new product decision. Exact removed sections follow.

## Homepage section {'class': 'founder-line-band', 'aria-label': 'Who built this'}

````html
<section class="founder-line-band" aria-label="Who built this">
  <style>
    .founder-line-band{padding:34px var(--mid-gutter);text-align:center}
    body.landing-more-ready:not(.landing-more-open) .founder-line-band{display:none}
    .founder-line{margin:0;font-size:.92rem;letter-spacing:.01em;color:var(--text-dim)}
    .founder-line b{font-weight:800;color:var(--text)}
  </style>
  <p class="founder-line">The judge works from <a href="/judge-integrity">published scoring rules</a>, and either side can appeal to a person.</p>
</section>
````

## Homepage section {'id': 'engine-select', 'class': 'engine-select', 'aria-label': 'Choose the AI that argues against you'}

````html
<section id="engine-select" class="engine-select" aria-label="Choose the AI that argues against you">
  <style>
    .engine-select{padding:var(--mid-pad-block) var(--mid-gutter);display:flex;justify-content:center}
    .es-wrap{width:100%;max-width:1300px}
    .es-head{display:flex;align-items:flex-end;justify-content:space-between;gap:26px;flex-wrap:wrap;margin:0 0 20px}
    .es-title{margin:0;font-family:var(--font-display);font-size:clamp(1.7rem,3.2vw,2.4rem);font-weight:700;letter-spacing:-.02em;line-height:1.08;color:#1a1a1f}
    .es-title em{font-style:normal;color:#dc2626}
    .es-sub{margin:9px 0 0;max-width:64ch;font-size:.92rem;line-height:1.55;color:rgba(26,26,31,.72)}
    /* Dark themes (2026-08-10 revival): head ink sits directly on the
       page background; the engine cards are self-painted paper. */
    :root:not([data-theme="light"]) .es-title{color:#f5efe7}
    :root:not([data-theme="light"]) .es-sub{color:rgba(245,239,231,.68)}
    .es-all{flex:0 0 auto;font-size:.82rem;font-weight:800;color:#c01326;text-decoration:none;border-bottom:1px solid rgba(192,19,38,.3);padding-bottom:2px}
    .es-all:hover{border-bottom-color:#c01326}

    .es-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}
    .es-card{
      position:relative;text-align:left;display:flex;flex-direction:column;gap:5px;
      min-height:132px;padding:15px 16px;font:inherit;cursor:pointer;
      border:1px solid rgba(29,25,21,.10);border-radius:16px;
      background:linear-gradient(#c01326,#c01326) 0 0/100% 3px no-repeat,rgba(255,253,247,.94);
      box-shadow:0 10px 30px rgba(29,25,21,.06);
      color:#1a1a1f;
      transition:transform .3s cubic-bezier(.22,.68,.24,1),box-shadow .3s ease,border-color .26s ease;
    }
    .es-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(29,25,21,.10);border-color:rgba(192,19,38,.28)}
    .es-card:focus-visible{outline:2px solid #c01326;outline-offset:3px}
    .es-card[aria-checked="true"]{border-color:rgba(192,19,38,.45);box-shadow:0 16px 40px rgba(192,19,38,.14),inset 0 0 0 1px rgba(192,19,38,.16)}
    /* Selection legible without colour. */
    .es-card[aria-checked="true"]::after{content:"✓";position:absolute;top:12px;right:14px;font-weight:800;color:#c01326}
    .es-name{font-family:var(--font-display);font-size:1.12rem;font-weight:700;letter-spacing:-.01em;line-height:1.15;padding-right:20px}
    .es-vendor{font-size:.62rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:rgba(26,26,31,.64)}
    .es-role{margin:2px 0 0;font-size:.82rem;line-height:1.45;color:rgba(26,26,31,.74)}
    .es-tags{margin-top:auto;padding-top:10px;display:flex;flex-wrap:wrap;gap:6px}
    .es-tag{font-size:.6rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgba(26,26,31,.64);border:1px solid rgba(29,25,21,.14);border-radius:999px;padding:3px 8px;white-space:nowrap}
    .es-tag--open{color:#15803d;border-color:rgba(21,128,61,.3)}

    .es-bar{margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:14px 18px;border:1px solid rgba(29,25,21,.10);border-radius:16px;background:rgba(255,253,247,.94)}
    .es-read{font-size:.9rem;line-height:1.5;color:rgba(26,26,31,.74)}
    .es-read strong{color:#1a1a1f;font-weight:800}
    .es-go{flex:0 0 auto;display:inline-block;padding:12px 24px;border-radius:999px;background:#c01326;color:#fff;text-decoration:none;font-size:.94rem;font-weight:800;transition:background .2s ease,transform .2s ease}
    .es-go:hover{background:#a10f1f;transform:translateY(-1px)}
    .es-houses{margin:14px 0 0;font-size:.84rem;line-height:1.6;color:rgba(26,26,31,.64)}
    .es-houses b{color:rgba(26,26,31,.8);font-weight:800}
    @media(max-width:620px){
      .es-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
      .es-bar{flex-direction:column;align-items:stretch}
      .es-go{width:100%;text-align:center}
    }
  </style>
  <div class="es-wrap">
    <div class="es-head">
      <div>
        <h2 class="es-title">Then choose <em>who argues back</em>.</h2>
        <p class="es-sub">Six houses. Pick one and it takes the other side of your next round.</p>
      </div>
      <a class="es-all" href="/engines">See every engine and its licence →</a>
    </div>

    <div class="es-grid" id="esGrid" role="radiogroup" aria-label="Open-weight engines">
      <button type="button" class="es-card" role="radio" aria-checked="true" data-es="moonshotai/kimi-k3" data-es-name="Kimi K3">
        <span class="es-name">Kimi K3</span>
        <span class="es-vendor">Moonshot AI</span>
        <p class="es-role">The heavyweight. Longest reach on a dense motion, and it does not hedge.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">Open weights</span><span class="es-tag">1M context</span></span>
      </button>
      <button type="button" class="es-card" role="radio" aria-checked="false" data-es="z-ai/glm-5.2" data-es-name="GLM-5.2">
        <span class="es-name">GLM-5.2</span>
        <span class="es-vendor">Zhipu AI</span>
        <p class="es-role">Frontier reasoning at a fraction of frontier cost. The value pick.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">MIT</span><span class="es-tag">1M context</span></span>
      </button>
      <button type="button" class="es-card" role="radio" aria-checked="false" data-es="deepseek/deepseek-v4-pro" data-es-name="DeepSeek V4 Pro">
        <span class="es-name">DeepSeek V4 Pro</span>
        <span class="es-vendor">DeepSeek</span>
        <p class="es-role">Cold and technical. Least likely to be charmed by a pretty argument.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">MIT</span><span class="es-tag">1M context</span></span>
      </button>
      <button type="button" class="es-card" role="radio" aria-checked="false" data-es="minimax/minimax-m3" data-es-name="MiniMax M3">
        <span class="es-name">MiniMax M3</span>
        <span class="es-vendor">MiniMax</span>
        <p class="es-role">Long-context specialist. Holds a full tournament transcript without losing the thread.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">Open weights</span><span class="es-tag">1M context</span></span>
      </button>
      <button type="button" class="es-card" role="radio" aria-checked="false" data-es="nousresearch/hermes-4-405b" data-es-name="Hermes 4 405B">
        <span class="es-name">Hermes 4 405B</span>
        <span class="es-vendor">Nous Research</span>
        <p class="es-role">Human voice. Argues a hard motion without a disclaimer first.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">Open weights</span><span class="es-tag">405B</span></span>
      </button>
      <button type="button" class="es-card" role="radio" aria-checked="false" data-es="allenai/olmo-3-32b-think" data-es-name="OLMo 3 32B">
        <span class="es-name">OLMo 3 32B</span>
        <span class="es-vendor">Allen Institute for AI</span>
        <p class="es-role">Open all the way down: weights, data, and training recipe.</p>
        <span class="es-tags"><span class="es-tag es-tag--open">Apache 2.0</span><span class="es-tag">Reproducible</span></span>
      </button>
    </div>

    <div class="es-bar">
      <p class="es-read" id="esRead"><strong>Kimi K3</strong> will argue against you. Change it any time, mid season.</p>
      <a class="es-go" id="esGo" href="/practice">Debate Kimi K3</a>
    </div>
    <p class="es-houses"><b>Claude</b>, <b>GPT</b>, <b>Gemini</b>, <b>Grok</b>, <b>DeepSeek</b>, and the <b>open bench</b>. Judging is separate, so you cannot pick your judge. <a href="/judge-integrity" style="color:#c01326;font-weight:700">How that works</a>.</p>
  </div>
  <script>
    (function(){
      var grid = document.getElementById('esGrid');
      if (!grid) return;
      var read = document.getElementById('esRead');
      var go = document.getElementById('esGo');
      var KEY = 'debateos-open-engine';

      function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

      function paint(card, persist){
        if (!card) return;
        grid.querySelectorAll('.es-card').forEach(function(c){
          c.setAttribute('aria-checked', c === card ? 'true' : 'false');
        });
        var name = card.getAttribute('data-es-name') || 'this model';
        if (read) read.innerHTML = '<strong>' + esc(name) + '</strong> will argue against you. Change it any time, mid season.';
        if (go) go.textContent = 'Debate ' + name;
        if (persist){
          try { localStorage.setItem(KEY, card.getAttribute('data-es') || ''); } catch(e){}
          try { if (window.dosTrack) dosTrack('engine_pick_landing', { engine: card.getAttribute('data-es') }); } catch(e){}
        }
      }

      // Restore an earlier pick (made here or on /engines) so the band
      // shows what rounds are actually running rather than resetting to
      // the first card on every visit.
      try {
        var saved = localStorage.getItem(KEY);
        if (saved){
          var match = grid.querySelector('.es-card[data-es="' + saved.replace(/"/g,'') + '"]');
          if (match) paint(match, false);
        }
      } catch(e){}

      grid.addEventListener('click', function(ev){
        var card = ev.target.closest ? ev.target.closest('.es-card') : null;
        if (card) paint(card, true);
      });
      // Arrow keys, matching the option-select behaviour on the app
      // surfaces. Roving focus does not select; Enter and click do.
      grid.addEventListener('keydown', function(ev){
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.es-card'));
        var i = cards.indexOf(document.activeElement);
        if (i < 0) return;
        var next = null;
        if (ev.key === 'ArrowRight') next = i + 1;
        else if (ev.key === 'ArrowLeft') next = i - 1;
        else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); paint(cards[i], true); return; }
        else return;
        ev.preventDefault();
        cards[((next % cards.length) + cards.length) % cards.length].focus();
      });

      // Enhance from the live roster so this band cannot claim an engine
      // the server will not call. Static markup above is the fallback and
      // stays if the request fails or JS never runs.
      function refresh(){
        fetch('/api/engines').then(function(r){ return r.ok ? r.json() : null; }).then(function(data){
          if (!data || !data.open || !data.open.length) return;
          var live = data.open.filter(function(e){ return e.available; }).slice(0, 6);
          if (live.length < 3) return; // not worth a repaint over
          var chosen = grid.querySelector('.es-card[aria-checked="true"]');
          var chosenSlug = chosen ? chosen.getAttribute('data-es') : '';
          grid.innerHTML = live.map(function(e){
            var lic = e.licenseKnown ? e.license : 'Open weights';
            var ctx = e.context >= 1000000 ? '1M context' : Math.round(e.context / 1024) + 'K context';
            return '<button type="button" class="es-card" role="radio" aria-checked="'
              + (e.slug === chosenSlug ? 'true' : 'false') + '" data-es="' + esc(e.slug)
              + '" data-es-name="' + esc(e.label) + '">'
              + '<span class="es-name">' + esc(e.label) + '</span>'
              + '<span class="es-vendor">' + esc(e.vendor) + '</span>'
              + '<p class="es-role">' + esc(e.role) + '</p>'
              + '<span class="es-tags"><span class="es-tag es-tag--open">' + esc(lic) + '</span>'
              + '<span class="es-tag">' + esc(ctx) + '</span></span>'
              + '</button>';
          }).join('');
          if (!grid.querySelector('.es-card[aria-checked="true"]')) paint(grid.querySelector('.es-card'), false);
        }).catch(function(){});
      }
      // Deferred to idle: this band is below the fold and the landing has
      // a first-paint budget worth protecting.
      if ('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout: 4000 });
      else setTimeout(refresh, 2500);
    })();
  </script>
</section>
````

## Homepage section {'id': 'mode-select', 'class': 'mode-select', 'aria-label': 'Pick your mode'}

````html
<section id="mode-select" class="mode-select" aria-label="Pick your mode">
  <style>
    /* Wall of doors (2026-07-22). Was a 3x2 tile grid; now six equal
       vertical doors in one row that expand on hover/focus via flex-grow.
       `.ms-tile` survives on the anchors purely as the click-tracking
       hook at the bottom of this section, it carries no styles now. */
    html[data-mode-menu="off"] .mode-select{display:none}
    /* Extra top air (2026-07-22): the Floor's pot card ends flush and the
       doors started right under it. Doubling the block padding on this
       edge gives the two bands a real seam. */
    .mode-select{padding:calc(var(--mid-pad-block) * 2.2) var(--mid-gutter) var(--mid-pad-block);display:flex;justify-content:center}
    /* This six-card wall needs a little more reading width than the
       shared 1180px chapters. The extra 120px buys each door roughly
       20px without turning the row into an edge-to-edge banner. */
    .mode-select-wrap{width:100%;max-width:1300px}
    .ms-title{margin:0 0 22px;font-family:var(--font-display);font-size:clamp(1.7rem,3.2vw,2.4rem);font-weight:700;letter-spacing:-.02em;line-height:1.08;color:#1a1a1f}
    .ms-title em{font-style:normal;color:#dc2626}
    /* Dark themes (2026-08-10 revival): the title sits directly on the
       page background; the doors are self-painted paper and stay put. */
    :root:not([data-theme="light"]) .ms-title{color:#f5efe7}

    .ms-wall{display:flex;align-items:stretch;gap:12px}
    /* Dark by default (2026-08-10): the door wall used to stay a
       fixed near-white card wall regardless of site theme.
       [data-theme="light"] pins the original paper-white doors back. */
    .ms-door{
      --ms-a:#c01326;--ms-a-rgb:192,19,38;
      position:relative;overflow:hidden;flex:1 1 0;min-width:0;
      display:flex;flex-direction:column;
      min-height:clamp(296px,24vw,352px);
      padding:16px 26px 16px 18px;
      border:1px solid rgba(245,239,231,.12);border-radius:16px;
      background:linear-gradient(var(--ms-a),var(--ms-a)) 0 0/100% 3px no-repeat,#221f1e;
      box-shadow:0 10px 30px rgba(0,0,0,.3);
      color:#f5efe7;text-decoration:none;
      transition:flex-grow .34s cubic-bezier(.22,.68,.24,1),transform .34s cubic-bezier(.22,.68,.24,1),box-shadow .34s ease,border-color .28s ease;
    }
    [data-theme="light"] .ms-door{
      border-color:rgba(29,25,21,.10);
      background:linear-gradient(var(--ms-a),var(--ms-a)) 0 0/100% 3px no-repeat,rgba(255,253,247,.94);
      box-shadow:0 10px 30px rgba(29,25,21,.06);
      color:#1a1a1f;
    }
    .ms-door>*{position:relative;z-index:1}
    /* inset door panel */
    .ms-door::before{content:'';position:absolute;inset:9px;border-radius:9px;border:1px solid rgba(var(--ms-a-rgb),.15);pointer-events:none;transition:border-color .3s ease}
    /* inner glow, capped low so text keeps AA contrast over it */
    .ms-door::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(130% 52% at 50% 118%,rgba(var(--ms-a-rgb),.15),rgba(var(--ms-a-rgb),.04) 48%,transparent 74%);opacity:.55;transition:opacity .34s ease}
    .ms-num{font-family:var(--font-body);font-size:2.2rem;font-weight:700;line-height:1;letter-spacing:-.02em;color:rgba(var(--ms-a-rgb),.4);transition:color .3s ease}
    [data-theme="light"] .ms-num{color:rgba(var(--ms-a-rgb),.28)}
    .ms-tag{position:absolute;top:15px;right:14px;z-index:2;display:inline-flex;align-items:center;gap:7px;font-size:.62rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#fca5a5;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.12);border-radius:999px;padding:4px 9px}
    [data-theme="light"] .ms-tag{color:#c81e1e;border-color:rgba(200,30,30,.16);background:rgba(239,68,68,.06)}
    .ms-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;animation:msDot 1.8s ease-in-out infinite}
    @keyframes msDot{0%,100%{opacity:1}50%{opacity:.4}}
    .ms-door h3{margin:14px 0 0;font-family:var(--font-display);font-size:clamp(1.06rem,1.12vw,1.26rem);font-weight:700;letter-spacing:-.01em;line-height:1.18;color:#f5efe7}
    [data-theme="light"] .ms-door h3{color:#1a1a1f}
    .ms-door p{margin:9px 0 0;font-size:.83rem;line-height:1.5;color:rgba(245,239,231,.78);opacity:.86;transform:translateY(6px);transition:opacity .34s ease,transform .34s cubic-bezier(.22,.68,.24,1)}
    [data-theme="light"] .ms-door p{color:rgba(26,26,31,.78)}
    /* the rail line turns the blank middle into a door panel */
    .ms-go{margin-top:auto;padding-top:13px;border-top:1px solid rgba(var(--ms-a-rgb),.16);display:block;font-size:.8rem;font-weight:800;color:rgba(245,239,231,.75);opacity:.9;transform:translateY(8px);transition:color .3s ease,border-color .3s ease,opacity .34s ease,transform .34s cubic-bezier(.22,.68,.24,1)}
    [data-theme="light"] .ms-go{color:rgba(26,26,31,.72)}
    .ms-arrow{display:inline-block;transition:transform .34s cubic-bezier(.22,.68,.24,1)}
    /* handle */
    .ms-knob{position:absolute;right:12px;bottom:56px;z-index:2;width:10px;height:10px;border-radius:50%;background:rgba(var(--ms-a-rgb),.5);box-shadow:0 0 0 4px rgba(var(--ms-a-rgb),.09);transition:background-color .3s ease,box-shadow .3s ease}

    .ms-door[data-mode="live"]{--ms-a:#c01326;--ms-a-rgb:192,19,38}
    .ms-door[data-mode="voice"]{--ms-a:#b4470f;--ms-a-rgb:180,71,15}
    .ms-door[data-mode="judge"]{--ms-a:#7d2a63;--ms-a-rgb:125,42,99}
    .ms-door[data-mode="prep"]{--ms-a:#0f6b64;--ms-a-rgb:15,107,100}
    .ms-door[data-mode="learn"]{--ms-a:#1f4fb5;--ms-a-rgb:31,79,181}
    .ms-door[data-mode="schedule"]{--ms-a:#6b3ab8;--ms-a-rgb:107,58,184}
    /* Purple through violet is taken, so the stream door takes the
       Twitch-adjacent indigo rather than repeating the live door's red. */
    .ms-door[data-mode="stream"]{--ms-a:#4b3fa8;--ms-a-rgb:75,63,168}

    /* open by keyboard. :has() keeps siblings from compressing when the
       pointer sits in a gap; without :has() the door still expands. */
    .ms-wall:has(.ms-door:focus-visible) .ms-door:not(:focus-visible){flex-grow:.88}
    .ms-door:focus-visible{flex-grow:2.2;transform:translateY(-6px);border-color:rgba(var(--ms-a-rgb),.42);box-shadow:0 22px 46px rgba(var(--ms-a-rgb),.16);outline:2px solid var(--ms-a);outline-offset:3px}
    .ms-door:focus-visible::after{opacity:1}
    .ms-door:focus-visible::before{border-color:rgba(var(--ms-a-rgb),.3)}
    .ms-door:focus-visible .ms-num{color:rgba(var(--ms-a-rgb),.5)}
    .ms-door:focus-visible p{opacity:1;transform:none}
    .ms-door:focus-visible .ms-go{color:var(--ms-a);border-top-color:rgba(var(--ms-a-rgb),.34);opacity:1;transform:none}
    .ms-door:focus-visible .ms-arrow{transform:translateX(5px)}
    .ms-door:focus-visible .ms-knob{background:var(--ms-a);box-shadow:0 0 0 6px rgba(var(--ms-a-rgb),.14)}

    /* open by pointer */
    @media (hover:hover) and (pointer:fine){
      .ms-wall:has(.ms-door:hover) .ms-door:not(:hover){flex-grow:.88}
      .ms-door:hover{flex-grow:2.2;transform:translateY(-6px);border-color:rgba(var(--ms-a-rgb),.42);box-shadow:0 22px 46px rgba(var(--ms-a-rgb),.16)}
      .ms-door:hover::after{opacity:1}
      .ms-door:hover::before{border-color:rgba(var(--ms-a-rgb),.3)}
      .ms-door:hover .ms-num{color:rgba(var(--ms-a-rgb),.5)}
      .ms-door:hover p{opacity:1;transform:none}
      .ms-door:hover .ms-go{color:var(--ms-a);border-top-color:rgba(var(--ms-a-rgb),.34);opacity:1;transform:none}
      .ms-door:hover .ms-arrow{transform:translateX(5px)}
      .ms-door:hover .ms-knob{background:var(--ms-a);box-shadow:0 0 0 6px rgba(var(--ms-a-rgb),.14)}
    }

    /* under 1100 the wall becomes a scroll-snap rail, same left-to-right
       order, every door fully open, next one peeking. */
    @media(max-width:1099px){
      .ms-wall{overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding:6px 0 12px}
      .ms-door{flex:0 0 79vw;scroll-snap-align:start;min-height:clamp(272px,46vw,320px);box-shadow:0 6px 18px rgba(29,25,21,.06)}
      .ms-door::after{opacity:1}
      .ms-door p{opacity:1;transform:none}
      .ms-door .ms-go{color:var(--ms-a);border-top-color:rgba(var(--ms-a-rgb),.34);opacity:1;transform:none}
      .ms-num{color:rgba(var(--ms-a-rgb),.4)}
      .ms-knob{bottom:50px}
    }
    /* phones keep the full 79vw door; past ~700px that width stretches a
       door into a squat banner, so cap it and show more of the wall. */
    @media(min-width:700px) and (max-width:1099px){
      .ms-door{max-width:452px}
    }

    /* Under 1100 the rail above turns six doors into 79vw slides you swipe
       through, which reads as a slide deck rather than a set of choices: you
       cannot see how many there are, and five of the six are off-screen. This
       block overrides it into a single menu, one tappable row per door, all
       six visible at once. Placed after the rail rules on purpose, since it
       has to win on source order at equal specificity. */
    @media(max-width:1099px){
      /* Dark by default (2026-08-10), same fix as the desktop door wall
         above: this mobile stacked-list variant stayed cream regardless
         of theme. [data-theme="light"] pins the original back. */
      .ms-wall{
        display:block;overflow:hidden;padding:0;gap:0;
        scroll-snap-type:none;overscroll-behavior-x:auto;
        border:1px solid rgba(245,239,231,.14);border-radius:14px;
        background:#221f1e;
        box-shadow:0 10px 30px rgba(0,0,0,.3);
      }
      [data-theme="light"] .ms-wall{
        border-color:rgba(29,25,21,.12);
        background:rgba(255,253,247,.94);
        box-shadow:0 10px 30px rgba(29,25,21,.06);
      }
      .ms-door{
        display:grid;grid-template-columns:auto 1fr auto;
        grid-template-rows:auto auto auto;
        align-items:center;column-gap:14px;
        flex:none;max-width:none;min-height:0;
        padding:14px 15px;
        border:0;border-bottom:1px solid rgba(245,239,231,.12);border-radius:0;
        box-shadow:none;background:none;
        scroll-snap-align:none;transition:background-color .18s ease;
      }
      [data-theme="light"] .ms-door{border-bottom-color:rgba(29,25,21,.1)}
      .ms-door:last-child{border-bottom:0}
      .ms-door:active{background:rgba(var(--ms-a-rgb),.06)}
      /* the card chrome is what made each row look like its own slide */
      .ms-door::before{display:none}
      .ms-door::after{opacity:0}
      .ms-knob{display:none}
      .ms-num{
        grid-column:1;grid-row:1 / 4;
        font-size:1.1rem;color:rgba(var(--ms-a-rgb),.6);
        font-variant-numeric:tabular-nums;
      }
      .ms-tag{
        position:static;grid-column:2;grid-row:1;
        justify-self:start;margin-bottom:5px;padding:3px 7px;font-size:.55rem;
      }
      .ms-door h3{grid-column:2;grid-row:2;margin:0;font-size:1rem}
      .ms-door p{
        grid-column:2;grid-row:3;margin:3px 0 0;font-size:.8rem;line-height:1.45;
        opacity:1;transform:none;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      }
      /* the CTA collapses to its arrow; the whole row is the link */
      .ms-go{
        grid-column:3;grid-row:1 / 4;
        margin:0;padding:0;border-top:0;
        font-size:0;opacity:1;transform:none;
      }
      .ms-arrow{font-size:1.15rem;color:rgba(var(--ms-a-rgb),.75)}
    }

    .ms-alts{margin:16px 0 0;text-align:center;font-size:.84rem;line-height:1.55;color:var(--text-dim)}
    .ms-alts a{color:var(--text);font-weight:700;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(239,68,68,.4)}
    .ms-alts a:hover{color:#ef4444;text-decoration-color:#ef4444}
    @media(prefers-reduced-motion:reduce){
      .ms-door,.ms-door::before,.ms-door::after,.ms-door p,.ms-go,.ms-arrow,.ms-num,.ms-knob{transition:none!important}
      .ms-door{flex-grow:1!important}
      .ms-door,.ms-door p,.ms-door .ms-go,.ms-arrow{transform:none!important}
      .ms-door p,.ms-door .ms-go{opacity:1}
    }
  </style>
  <div class="mode-select-wrap">
    <h2 class="ms-title">What are you here to <em>do</em>?</h2>
    <div class="ms-wall">
      <a class="ms-tile ms-door" href="/spar" data-mode="live">
        <span class="ms-num">01</span>
        <span class="ms-tag"><span class="ms-dot" aria-hidden="true"></span>Live</span>
        <h3>Debate a person</h3>
        <p>Match with a real opponent on a real clock. The AI judge decides who won.</p>
        <span class="ms-go" aria-hidden="true">Find an opponent <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <!-- The one public AI door. It opens /newvoice on the setup screen, where
           the resolution is editable; the room's spoken topic is a sanitized
           literal (see lib/topic-isolation). -->
      <a class="ms-tile ms-door" href="/newvoice?handoff=landing-mode" data-mode="voice">
        <span class="ms-num">02</span>
        <h3>Debate the AI</h3>
        <p>Run a casual one-on-one round against an AI opponent that interrupts and argues back. Finish with a score out of 100 and a written decision on who won and why.</p>
        <span class="ms-go" aria-hidden="true">Open Debatable <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <a class="ms-tile ms-door" href="/judge" data-mode="judge">
        <span class="ms-num">03</span>
        <h3>Get judged</h3>
        <p data-audience-competitive="Share an argument. See who won, scores out of 100, why, and what to improve." data-audience-plain="Share an argument. See who won, scores out of 100, why, and what to improve.">Share an argument. See who won, scores out of 100, why, and what to improve.</p>
        <span class="ms-go" aria-hidden="true">Get a decision <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <a class="ms-tile ms-door" href="/topics" data-mode="prep">
        <span class="ms-num">04</span>
        <h3>Pick a question</h3>
        <p>Find something worth arguing about, from everyday life to technology and culture.</p>
        <span class="ms-go" aria-hidden="true">Browse topics <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <a class="ms-tile ms-door" href="/learn" data-mode="learn">
        <span class="ms-num">05</span>
        <h3>Learn the craft</h3>
        <p>Clear claims, direct rebuttals, and comparisons that decide a round.</p>
        <span class="ms-go" aria-hidden="true">Start a drill <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <a class="ms-tile ms-door" href="/live" data-mode="schedule">
        <span class="ms-num">06</span>
        <h3>Schedule or spectate</h3>
        <p>Book a round for later, or watch one that is already running.</p>
        <span class="ms-go" aria-hidden="true">See the schedule <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
      <a class="ms-tile ms-door" href="/room-judge" data-mode="stream">
        <span class="ms-num">07</span>
        <h3>Stream it</h3>
        <p>Run the AI judge over your broadcast. Chat argues with the decision.</p>
        <span class="ms-go" aria-hidden="true">Open the stream judge <span class="ms-arrow">→</span></span>
        <span class="ms-knob" aria-hidden="true"></span>
      </a>
    </div>
    <p class="ms-alts">Prefer to type? <a href="/practice" data-mode-alt="trainer">Open typed practice</a>.</p>
  </div>
  <script>
    (function(){
      document.querySelectorAll('#mode-select .ms-tile').forEach(function(t){
        t.addEventListener('click',function(){
          try{ if(window.dosTrack) dosTrack('mode_menu_click',{mode:t.getAttribute('data-mode')}); }catch(e){}
        });
      });
    })();
  </script>
</section>
````

## Homepage section {'id': 'reviews', 'class': 'sec', 'aria-label': 'What people say'}

````html
<section id="reviews" class="sec" aria-label="What people say">
  <style>
    #reviews.sec{padding-top:clamp(46px,4vw,62px) !important}
    [data-theme="light"] #reviews{
      border-top:1px solid rgba(53,43,36,.12);
      background:linear-gradient(180deg,#eae6de 0%,#f3f0e9 18%,#f7f5ef 100%)
    }
    #reviews .rv-head{text-align:center;margin-bottom:24px}
    #reviews .rv-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
    #reviews .rv-title{font-family:var(--font-body);font-size:clamp(1.65rem,2.8vw,2.35rem);font-weight:600;letter-spacing:-.01em;color:var(--text);margin:9px 0 0}
    #reviews > .wrap{max-width:1320px !important;padding-left:clamp(20px,3vw,40px) !important;padding-right:clamp(20px,3vw,40px) !important}
    #reviews .rv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;width:100%;max-width:1240px;margin:0 auto;align-items:stretch}
    #reviews .rv-card{position:relative;display:flex;min-width:0;flex-direction:column;gap:14px;padding:22px 22px 20px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.018));overflow:hidden}
    #reviews .rv-card::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--accent),transparent 76%);opacity:.86}
    #reviews .rv-card:first-child{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.34fr);gap:30px;align-items:end;min-height:260px;padding:34px 38px 32px;border-radius:28px;background:radial-gradient(circle at 12% 0,rgba(239,68,68,.12),transparent 34%),linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:0 24px 70px rgba(0,0,0,.18)}
    [data-theme="light"] #reviews .rv-eyebrow{color:#b91c1c}
    [data-theme="light"] #reviews .rv-title{color:#17171a}
    [data-theme="light"] #reviews .rv-card{background:#fff;border-color:rgba(53,43,36,.14);box-shadow:0 20px 54px -28px rgba(57,40,29,.34)}
    [data-theme="light"] #reviews .rv-card:first-child{background:radial-gradient(circle at 12% 0,rgba(220,38,38,.12),transparent 34%),linear-gradient(135deg,#fff,#fbfaf6);box-shadow:0 28px 72px -34px rgba(80,42,28,.42),0 1px 0 rgba(0,0,0,.04)}
    #reviews .rv-quote{font-family:var(--font-judge);font-size:clamp(1rem,1.1vw,1.12rem);line-height:1.47;color:var(--text);margin:0}
    #reviews .rv-card:first-child .rv-quote{font-size:clamp(1.45rem,2.45vw,2.18rem);line-height:1.18;letter-spacing:-.018em;max-width:820px}
    #reviews .rv-hl{color:var(--accent);font-weight:650}
    #reviews .rv-attr{margin-top:auto;display:flex;flex-direction:column;gap:2px;padding-top:15px;border-top:1px solid var(--border)}
    #reviews .rv-card:first-child .rv-attr{margin-top:0;padding:0 0 0 22px;border-top:0;border-left:1px solid var(--border)}
    #reviews .rv-name{font-size:.84rem;font-weight:800;color:var(--text)}
    #reviews .rv-card:first-child .rv-name{font-family:var(--font-body);font-size:1.05rem;letter-spacing:-.01em}
    #reviews .rv-cred{font-size:.75rem;line-height:1.4;color:var(--text-dim)}
    [data-theme="light"] #reviews .rv-cred{color:rgba(26,26,31,.7)}
    @media(max-width:900px){#reviews .rv-grid{grid-template-columns:minmax(0,1fr);max-width:720px}#reviews .rv-card:first-child{grid-column:auto;display:flex;min-height:0;padding:28px;border-radius:22px}#reviews .rv-card:first-child .rv-quote{font-size:clamp(1.22rem,4.4vw,1.62rem);line-height:1.26}#reviews .rv-card:first-child .rv-attr{padding-top:16px;border-top:1px solid var(--border);border-left:0}}
    @media(max-width:640px){#reviews .rv-head{text-align:left;margin-bottom:20px}#reviews .rv-grid{gap:12px}#reviews .rv-card{padding:19px;border-radius:16px}#reviews .rv-card:first-child{padding:22px;border-radius:18px}}
  </style>
  <div class="wrap" style="max-width:1320px">
    <div class="rv-head">
      <span class="rv-eyebrow">Reviews</span>
      <h2 class="rv-title">From the circuit</h2>
    </div>
    <div class="rv-grid" role="list">
      <figure class="rv-card" role="listitem">
        <blockquote class="rv-quote">The real gap between circuits isn't talent, it's <span class="rv-hl">access to quality practice</span>. Debatable closes it. The AI argues back at full strength, and the ballot tells you exactly where the round was won or lost.</blockquote>
        <figcaption class="rv-attr">
          <span class="rv-name">Mukudzeiishe Madzivire</span>
          <span class="rv-cred">Captain, Zimbabwe World Schools Team · Columbia University</span>
        </figcaption>
      </figure>
      <figure class="rv-card" role="listitem">
        <blockquote class="rv-quote">Proof that <span class="rv-hl">AI can sharpen critical thinking rather than replace it</span>. You can tell how much thought went into every layer, from case generation to the objectivity of the judging.</blockquote>
        <figcaption class="rv-attr">
          <span class="rv-name">2025 Public Forum National Champion</span>
          <span class="rv-cred">NSDA Nationals</span>
        </figcaption>
      </figure>
      <figure class="rv-card" role="listitem">
        <blockquote class="rv-quote">In four years of British Parliamentary, I'd never seen a tool able to <span class="rv-hl">summarize, refute, and analyze high-level argumentation</span> until I used Debatable. It would have made a real difference in my prep for international majors.</blockquote>
        <figcaption class="rv-attr">
          <span class="rv-name">Arjun Raman</span>
          <span class="rv-cred">WUDC Octofinalist · Princeton IV finalist</span>
        </figcaption>
      </figure>
      <figure class="rv-card" role="listitem">
        <blockquote class="rv-quote">In a world where we can outsource our thinking to AI, we need more tools to keep us sharp. Debatable is <span class="rv-hl">the chess.com of debate</span>.</blockquote>
        <figcaption class="rv-attr">
          <span class="rv-name">Pratyush Sharma</span>
          <span class="rv-cred">Debatable member</span>
        </figcaption>
      </figure>
    </div>
  </div>
</section>
````

## Homepage section {'id': 'community-band', 'class': 'community-band', 'aria-label': 'The Debatable community'}

````html
<section id="community-band" class="community-band" aria-label="The Debatable community">
  <style>
    /* 2026-07-25: restored the community band to chapter scale. The two
       choices are core product paths, so their type, portraits and
       controls should read without visitors leaning into the page. */
    .community-band{padding:clamp(64px,7vw,104px) clamp(18px,3vw,44px);display:flex;justify-content:center}
    .cb-wrap{width:100%;max-width:1480px;text-align:center}
    .cb-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.72rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.6));margin-bottom:11px}
    .cb-title{font-family:var(--font-display);font-size:clamp(2.15rem,3.7vw,3.35rem);font-weight:700;letter-spacing:-.025em;line-height:1.04;margin:0 0 14px;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-title{color:#1a1a1f}
    .cb-title em{font-style:normal;color:#ef4444}
    .cb-sub{font-size:clamp(1rem,1.3vw,1.16rem);line-height:1.55;color:var(--text-dim,rgba(255,255,255,.7));max-width:850px;margin:0 auto 16px}
    [data-theme="light"] .cb-sub{color:rgba(0,0,0,.66)}
    /* Live strip: real signals only, whole strip hidden until one lands. */
    .cb-live{display:none;justify-content:center;flex-wrap:wrap;gap:10px;margin:0 0 36px}
    .cb-pill{display:none;align-items:center;gap:8px;max-width:100%;padding:9px 16px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.04);font-size:.86rem;color:var(--text-dim,rgba(255,255,255,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    [data-theme="light"] .cb-pill{border-color:rgba(0,0,0,.12);background:rgba(0,0,0,.04);color:rgba(0,0,0,.64)}
    .cb-pill b{color:var(--text,#f4f4f2);font-weight:800}
    [data-theme="light"] .cb-pill b{color:#1a1a1f}
    .cb-pill .dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;animation:lnDot 1.8s ease-in-out infinite;flex:none}
    /* ── The week (2026-07-22 redesign) ──────────────────────────
       Was three equal cards each carrying a fake UI miniature: a
       calendar with invented Sat/Sun rounds, a mock chat, a mock doc
       stack. On a page that is card grids from #05 through #08, a
       third grid of fabricated screenshots was the weakest band, and
       it never mentioned the two community facts that are actually
       true: Wednesday Spar Night and the always-on async board. This
       is the one form no other band uses: the week itself. Wednesday
       carries the real computed event; real scheduled rounds pin to
       their day when the API has them; nothing is invented. */
    .cb-week{margin:0 0 14px;background:var(--bg-card,rgba(255,255,255,.03));border:1px solid var(--border,rgba(255,255,255,.12));border-radius:16px;padding:16px 16px 0;text-align:left}
    [data-theme="light"] .cb-week{background:#fff;border-color:rgba(29,25,21,.11);box-shadow:0 10px 30px rgba(29,25,21,.05)}
    .cb-days{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
    .cb-day{min-height:96px;border-radius:11px;border:1px dashed var(--border,rgba(255,255,255,.14));padding:9px 10px;display:flex;flex-direction:column;gap:6px}
    [data-theme="light"] .cb-day{border-color:rgba(29,25,21,.13)}
    .cb-day b{font-size:.6rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.45))}
    [data-theme="light"] .cb-day b{color:rgba(29,25,21,.64)}
    .cb-day.today{border-style:solid}
    .cb-day.today b{color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-day.today b{color:#1a1a1f}
    .cb-day--wed{border:1.5px solid rgba(220,38,38,.5);border-radius:11px;background:rgba(220,38,38,.05);text-decoration:none;transition:transform .15s,box-shadow .15s}
    .cb-day--wed:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(220,38,38,.16)}
    .cb-day--wed b{color:#dc2626;display:inline-flex;align-items:center;gap:6px}
    .cb-day--wed b i{width:6px;height:6px;border-radius:50%;background:#dc2626;animation:lnDot 1.6s ease-in-out infinite}
    .cb-wed-name{font-family:var(--font-display);font-size:1.06rem;font-weight:800;letter-spacing:-.01em;line-height:1.1;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-wed-name{color:#1a1a1f}
    .cb-wed-when{font-size:.74rem;font-weight:700;color:#dc2626}
    .cb-wed-local{font-size:.66rem;color:var(--text-dim,rgba(255,255,255,.5))}
    [data-theme="light"] .cb-wed-local{color:rgba(29,25,21,.64)}
    .cb-sched{margin-top:auto;font-size:.64rem;font-weight:700;line-height:1.35;color:var(--text-dim,rgba(255,255,255,.6));border-left:2px solid rgba(220,38,38,.5);padding-left:6px}
    [data-theme="light"] .cb-sched{color:rgba(29,25,21,.64)}
    /* async rail: the always-on lane under the seven days */
    .cb-rail{display:flex;align-items:center;gap:12px;margin:12px -16px 0;padding:11px 16px;border-top:1px solid var(--border,rgba(255,255,255,.1));text-decoration:none;border-radius:0 0 16px 16px;transition:background .15s}
    [data-theme="light"] .cb-rail{border-top-color:rgba(29,25,21,.09)}
    .cb-rail:hover{background:rgba(220,38,38,.04)}
    .cb-rail .lane{flex:1;height:2px;border-radius:2px;background:repeating-linear-gradient(90deg,rgba(220,38,38,.55) 0 9px,transparent 9px 16px)}
    .cb-rail span{flex:none;font-size:.74rem;font-weight:800;color:var(--text-dim,rgba(255,255,255,.66))}
    [data-theme="light"] .cb-rail span{color:rgba(29,25,21,.64)}
    .cb-rail b{color:#dc2626;font-weight:800;white-space:nowrap}
    /* The rail carries a miniature of the /rounds flow diagram, so the
       one surface that works without simultaneity gets shown rather
       than described. Horizontal on purpose: it sits under the seven
       day columns and reads as running across them. Phones drop the
       figure and keep the line; the full diagram lives on /rounds. */
    .cb-rail{flex-direction:column;gap:10px}
    .cb-rail .cb-railtop{display:flex;align-items:center;gap:12px;width:100%}
    .cb-asyncfig{display:block;width:100%;max-width:780px;margin:0 auto 2px}
    .cbf-you{fill:rgba(220,38,38,.13);stroke:rgba(220,38,38,.5);stroke-width:1.5}
    .cbf-them{fill:rgba(61,107,140,.2);stroke:rgba(61,107,140,.6);stroke-width:1.5}
    .cbf-end{fill:var(--bg-card,rgba(255,255,255,.05));stroke:var(--border,rgba(255,255,255,.2));stroke-width:1.5}
    .cbf-t{font-size:19px;font-weight:800;fill:var(--text,#fff);text-anchor:middle}
    /* --text-dim, not --text-ghost: ghost lands near 2.7:1 on this card
       and these labels render at ~14px. */
    .cbf-s{font-size:16px;font-weight:600;fill:var(--text-dim,rgba(255,255,255,.85));text-anchor:middle}
    .cbf-c{fill:none;stroke:var(--text-ghost,rgba(255,255,255,.55));stroke-width:2;stroke-dasharray:5 5;opacity:.85}
    .cbf-h{fill:var(--text-dim,rgba(255,255,255,.85))}
    .cbf-gap{font-size:15px;font-weight:800;fill:var(--text-dim,rgba(255,255,255,.85));text-anchor:middle}
    @media(max-width:700px){ .cb-asyncfig{display:none} .cb-rail{gap:0} }
    @media(max-width:760px){
      .cb-days{grid-template-columns:repeat(7,1fr);gap:5px}
      .cb-day{min-height:0;padding:7px 0;align-items:center}
      .cb-day span,.cb-day .cb-sched{display:none}
      .cb-day--wed{grid-column:1 / -1;order:9;flex-direction:column;align-items:flex-start;padding:12px 14px;min-height:0}
      .cb-day--wed span{display:block}
      .cb-days{display:flex;flex-wrap:wrap}
      .cb-day{flex:1 1 0}
      .cb-day--wed{flex:1 1 100%}
    }

    /* 2026-07-25: the async board is the primary, full-width story.
       Spar Night sits below it as a second wide lane, so neither path is
       squeezed into a dashboard column. */
    .cb-paths{display:grid;grid-template-columns:1fr;gap:18px;margin:34px 0 20px;text-align:left}
    .cb-path{min-width:0;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:24px;background:var(--bg-card,rgba(255,255,255,.03));overflow:hidden}
    [data-theme="light"] .cb-path{background:#fff;border-color:rgba(29,25,21,.11);box-shadow:0 14px 38px rgba(29,25,21,.06)}
    .cb-path--async{padding:clamp(26px,3vw,40px)}
    .cb-path-k{display:inline-flex;align-items:center;gap:8px;margin:0 0 9px;font-size:.7rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#dc2626}
    .cb-path-k i{width:8px;height:8px;border-radius:50%;background:#dc2626;box-shadow:0 0 8px rgba(220,38,38,.45)}
    .cb-path-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
    .cb-path-head>div{max-width:880px}
    .cb-path h3{font-family:var(--font-display);font-size:clamp(1.8rem,2.4vw,2.35rem);font-weight:800;letter-spacing:-.02em;line-height:1.06;margin:0;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-path h3{color:#1a1a1f}
    .cb-path-copy{font-size:1rem;line-height:1.55;color:var(--text-dim,rgba(255,255,255,.67));margin:11px 0 0}
    [data-theme="light"] .cb-path-copy{color:rgba(29,25,21,.64)}
    .cb-anytime{flex:none;max-width:300px;padding:11px 16px;border-radius:999px;background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.2);font-size:.8rem;font-weight:800;line-height:1.25;text-align:center;color:#dc2626}
    .cb-board{margin:27px 0 0}
    .cb-board-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 11px}
    .cb-board-label b{font-size:.78rem;font-weight:900;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-board-label b{color:#1a1a1f}
    .cb-board-label span{font-size:.72rem;color:var(--text-dim,rgba(255,255,255,.55))}
    [data-theme="light"] .cb-board-label span{color:rgba(29,25,21,.64)}
    .cb-opponents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .cb-opponent{min-width:0;padding:18px;border:1px solid var(--border,rgba(255,255,255,.11));border-radius:16px;background:rgba(255,255,255,.025)}
    [data-theme="light"] .cb-opponent{background:#faf9f5;border-color:rgba(29,25,21,.09)}
    .cb-op-top{display:flex;align-items:center;gap:11px;min-width:0}
    .cb-op-avatar{width:62px;height:46px;flex:none;border-radius:11px;overflow:hidden;background:linear-gradient(135deg,#dc2626,#7f1d1d);display:grid;place-items:center;color:#fff;font-size:.76rem;font-weight:900}
    .cb-op-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .cb-op-id{min-width:0}
    .cb-op-id b{display:block;font-size:.86rem;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-op-id b{color:#1a1a1f}
    .cb-op-id span{display:block;margin-top:2px;font-size:.67rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-dim,rgba(255,255,255,.5))}
    [data-theme="light"] .cb-op-id span{color:rgba(29,25,21,.64)}
    .cb-claim{margin:14px 0 0;font-family:var(--font-display);font-size:clamp(1.02rem,1.25vw,1.2rem);font-weight:700;line-height:1.25;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-claim{color:#28231f}
    .cb-claim-by{display:block;margin-top:10px;font-size:.63rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:#dc2626}
    .cb-flow-head{display:flex;align-items:center;gap:12px;margin:28px 0 12px}
    .cb-flow-head::before,.cb-flow-head::after{content:"";height:1px;flex:1;background:var(--border,rgba(255,255,255,.1))}
    .cb-flow-head span{flex:none;font-size:.7rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.55))}
    [data-theme="light"] .cb-flow-head span{color:rgba(29,25,21,.64)}
    .cb-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch;gap:12px}
    .cb-step{position:relative;min-width:0;border:1px solid var(--border,rgba(255,255,255,.11));border-radius:16px;padding:18px;background:rgba(255,255,255,.025)}
    [data-theme="light"] .cb-step{background:#faf9f5;border-color:rgba(29,25,21,.09)}
    .cb-step:last-child{background:rgba(220,38,38,.06);border-color:rgba(220,38,38,.2)}
    .cb-step:not(:last-child)::after{content:"→";position:absolute;z-index:2;right:-18px;top:50%;width:24px;height:24px;display:grid;place-items:center;transform:translateY(-50%);border-radius:50%;background:var(--bg-card,#171719);color:#dc2626;font-size:.82rem;font-weight:900}
    [data-theme="light"] .cb-step:not(:last-child)::after{background:#fff}
    .cb-step-top{display:flex;align-items:center;gap:10px}
    .cb-step-no,.cb-step-avatar{width:38px;height:38px;flex:none;border-radius:11px}
    .cb-step-no{display:grid;place-items:center;background:#dc2626;color:#fff;font-size:.7rem;font-weight:900}
    .cb-step-avatar{object-fit:cover}
    .cb-step b{display:block;font-size:.86rem;font-weight:900;line-height:1.2;color:var(--text,#f4f4f2)}
    [data-theme="light"] .cb-step b{color:#1a1a1f}
    .cb-step p{margin:10px 0 0;font-size:.74rem;line-height:1.42;color:var(--text-dim,rgba(255,255,255,.53))}
    [data-theme="light"] .cb-step p{color:rgba(29,25,21,.64)}
    .cb-path-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:22px}
    .cb-path-cta{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:12px 22px;border-radius:999px;background:#dc2626;color:#fff;font-size:.88rem;font-weight:900;text-decoration:none;transition:transform .15s,background .15s}
    .cb-path-cta:hover{background:#b91c1c;transform:translateY(-1px)}
    .cb-cta-copy--claim{display:none}
    :root[data-community-cta="claim"] .cb-cta-copy--opponents{display:none}
    :root[data-community-cta="claim"] .cb-cta-copy--claim{display:inline}
    .cb-path-note{font-size:.74rem;color:var(--text-dim,rgba(255,255,255,.5))}
    [data-theme="light"] .cb-path-note{color:rgba(29,25,21,.64)}
    .cb-path--spar{display:grid;grid-template-columns:minmax(290px,.9fr) minmax(420px,1.35fr) minmax(290px,.8fr);grid-template-rows:1fr auto;align-items:stretch}
    .cb-spar-copy{grid-column:1;grid-row:1 / span 2;display:flex;flex-direction:column;justify-content:center;padding:34px}
    .cb-spar-visual{grid-column:2;grid-row:1 / span 2;position:relative;display:grid;grid-template-columns:1fr 1fr;gap:2px;min-height:300px;overflow:hidden;background:#111827}
    .cb-spar-visual img{min-width:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;filter:saturate(.92) brightness(.9)}
    .cb-spar-visual::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,12,.04),rgba(8,8,12,.68))}
    .cb-spar-live{position:absolute;z-index:1;left:16px;right:16px;bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#fff}
    .cb-spar-live span{font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
    .cb-spar-live b{font-size:.82rem;font-weight:900}
    .cb-spar-date{grid-column:3;grid-row:1;padding:34px 32px 12px;border-left:1px solid var(--border,rgba(255,255,255,.1));align-self:end}
    .cb-spar-date-label{display:block;margin:0 0 8px;font-size:.66rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.5))}
    [data-theme="light"] .cb-spar-date-label{color:rgba(29,25,21,.64)}
    .cb-spar-date b{display:block;font-size:1.1rem;font-weight:900;color:#dc2626}
    .cb-spar-date span:not(.cb-spar-date-label){display:block;margin-top:4px;font-size:.78rem;color:var(--text-dim,rgba(255,255,255,.52))}
    [data-theme="light"] .cb-spar-date span{color:rgba(29,25,21,.64)}
    .cb-spar-actions{grid-column:3;grid-row:2;display:grid;grid-template-columns:1fr;gap:9px;padding:12px 32px 34px;border-left:1px solid var(--border,rgba(255,255,255,.1))}
    .cb-spar-actions a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:11px 12px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.14));font-size:.82rem;font-weight:900;text-align:center;text-decoration:none;color:var(--text-dim,rgba(255,255,255,.66))}
    [data-theme="light"] .cb-spar-actions a{color:rgba(29,25,21,.64);border-color:rgba(29,25,21,.13)}
    .cb-spar-actions a:first-child{background:#dc2626;color:#fff;border-color:#dc2626}
    .cb-spar-actions a:hover{border-color:#dc2626}
    .cb-links{margin-top:16px}
    @media(max-width:1080px){.cb-path--spar{grid-template-columns:minmax(0,1fr) minmax(360px,1.1fr)}.cb-spar-copy{grid-column:1;grid-row:1;padding:28px 28px 16px}.cb-spar-visual{grid-column:2;grid-row:1 / span 3;min-height:0}.cb-spar-date{grid-column:1;grid-row:2;padding:14px 28px 8px;border-left:0}.cb-spar-actions{grid-column:1;grid-row:3;padding:10px 28px 28px;border-left:0}}
    @media(max-width:820px){.cb-flow{grid-template-columns:repeat(2,minmax(0,1fr))}.cb-step:nth-child(2)::after{display:none}}
    @media(max-width:700px){.community-band{padding-left:18px;padding-right:18px}.cb-path--async{padding:20px}.cb-path-head{display:block}.cb-anytime{display:inline-flex;max-width:none;margin-top:12px}.cb-opponents{grid-template-columns:1fr}.cb-op-avatar{width:74px;height:52px}.cb-flow{grid-template-columns:1fr}.cb-step:not(:last-child)::after{content:"↓";right:auto;left:50%;top:auto;bottom:-18px;transform:translateX(-50%)}.cb-step:nth-child(2)::after{display:grid}.cb-path--spar{display:flex;flex-direction:column}.cb-spar-visual{min-height:0;aspect-ratio:16/9}.cb-spar-copy{padding:22px 20px 17px}.cb-spar-date{padding:16px 20px 0;border-left:0}.cb-spar-actions{padding:16px 20px 22px;border-left:0}}

    /* quiet destination links replacing the old three cards */
    .cb-links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin:16px 0 20px}
    .cb-links a{font-size:.82rem;font-weight:800;color:var(--text-dim,rgba(255,255,255,.66));text-decoration:none;transition:color .15s}
    .cb-links a:hover{color:#ef4444}
    [data-theme="light"] .cb-links a{color:rgba(29,25,21,.64)}
    [data-theme="light"] .cb-links a:hover{color:#dc2626}
    /* 2026-07-22: single quiet CTA became a loud pair per the founder (far
       bigger / obvious): join + the group chat at the same scale. */
    .cb-cta-row{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:14px 18px;
      margin:clamp(26px,3.4vw,44px) 0 clamp(34px,4.2vw,56px)}
    .cb-cta{display:inline-flex;align-items:center;gap:11px;padding:19px 42px;border-radius:999px;background:var(--accent,#ef4444);color:#fff;font-weight:800;font-size:1.22rem;text-decoration:none;transition:transform .15s,background .15s,box-shadow .15s;box-shadow:0 14px 40px rgba(239,68,68,.34)}
    .cb-cta:hover{background:#dc2626;transform:translateY(-2px);box-shadow:0 18px 48px rgba(239,68,68,.42)}
    .cb-cta svg{width:21px;height:21px;flex:none}
    .cb-cta--chat{padding:17px 40px;background:rgba(239,68,68,.08);color:#ef4444;border:2px solid rgba(239,68,68,.6);box-shadow:none}
    .cb-cta--chat:hover{background:#dc2626;color:#fff;border-color:#dc2626;box-shadow:0 14px 40px rgba(239,68,68,.3)}
    [data-theme="light"] .cb-cta--chat{background:#fff;color:#dc2626;border-color:rgba(220,38,38,.55)}
    [data-theme="light"] .cb-cta--chat:hover{background:#dc2626;color:#fff;border-color:#dc2626}
    a.cb-pill{text-decoration:none;cursor:pointer;transition:border-color .15s}
    a.cb-pill:hover{border-color:rgba(239,68,68,.7)}
    @media(max-width:560px){.cb-cta{width:100%;justify-content:center;padding:16px 26px;font-size:1.08rem}.cb-cta--chat{padding:14px 26px}}
  </style>
  <div class="cb-wrap">
    <div class="cb-eyebrow">The community</div>
    <h2 class="cb-title">Debate on your own time. <em>Meet live three times a day.</em></h2>
    <p class="cb-sub">Answer an open claim whenever you are ready, or join the community at the same hour for Clash Hour, three times every day.</p>
    <div class="cb-live" id="cbLive" aria-label="Live community activity">
      <span class="cb-pill" id="cbOnline"></span>
      <span class="cb-pill" id="cbNext"></span>
      <a class="cb-pill" id="cbChat" href="/community#live" data-cb="chatpill"></a>
    </div>
    <div class="cb-paths">
      <article class="cb-path cb-path--async">
        <div class="cb-path-head">
          <div>
            <span class="cb-path-k"><i></i>On your own time</span>
            <h3>Choose an available opponent</h3>
            <p class="cb-path-copy">Pick a claim. Record your side whenever you like. Your opponent answers when they are free.</p>
          </div>
          <span class="cb-anytime">No lobby. No need to be online together.</span>
        </div>
        <div class="cb-board">
          <div class="cb-board-label"><b>Example open claims</b><span>Choose someone to start</span></div>
          <div class="cb-opponents" aria-label="Example available opponents and claims">
            <div class="cb-opponent">
              <div class="cb-op-top">
                <span class="cb-op-avatar"><img src="/img/round/faces/face13.jpg" alt="" loading="lazy" decoding="async"></span>
                <span class="cb-op-id"><b>Amara</b><span>Casual 1v1 · usually replies within a day</span></span>
              </div>
              <p class="cb-claim">“Schools should ban phones during class.”</p>
              <span class="cb-claim-by">Claim posted by Amara</span>
            </div>
            <div class="cb-opponent">
              <div class="cb-op-top">
                <span class="cb-op-avatar"><img src="/img/round/faces/face25.jpg" alt="" loading="lazy" decoding="async"></span>
                <span class="cb-op-id"><b>Mei</b><span>Casual 1v1 · usually replies in a few hours</span></span>
              </div>
              <p class="cb-claim">“Cities should make public transit free.”</p>
              <span class="cb-claim-by">Claim posted by Mei</span>
            </div>
            <div class="cb-opponent">
              <div class="cb-op-top">
                <span class="cb-op-avatar">AI</span>
                <span class="cb-op-id"><b>AI topic pick</b><span>Ready whenever you are</span></span>
              </div>
              <p class="cb-claim">“AI art should qualify for copyright.”</p>
              <span class="cb-claim-by">Suggested for you</span>
            </div>
          </div>
        </div>
        <div class="cb-flow-head"><span>What happens after you choose</span></div>
        <div class="cb-flow" aria-label="Pick an open claim, record your opening, wait for your opponent to answer, then reply and receive feedback.">
          <div class="cb-step">
            <div class="cb-step-top"><span class="cb-step-no">1</span><b>Pick an open claim</b></div>
            <p>Choose someone, or use the AI topic pick.</p>
          </div>
          <div class="cb-step">
            <div class="cb-step-top"><span class="cb-step-no">2</span><b>Record your opening</b></div>
            <p>Speak for 90 seconds whenever you are ready.</p>
          </div>
          <div class="cb-step">
            <div class="cb-step-top"><span class="cb-step-no">3</span><img class="cb-step-avatar" src="/img/round/faces/face13.jpg" alt="" loading="lazy" decoding="async"><b>They answer later</b></div>
            <p>You are notified when their response arrives.</p>
          </div>
          <div class="cb-step">
            <div class="cb-step-top"><span class="cb-step-no">4</span><b>Reply, then get feedback</b></div>
            <p>Answer back. The AI judges both sides.</p>
          </div>
        </div>
        <div class="cb-path-actions" data-ab-impression="community_cta_v1">
          <a class="cb-path-cta" href="/rounds" data-cb="async" data-ab-test="community_cta_v1" data-ab-target="async_rounds">
            <span class="cb-cta-copy--opponents">See available opponents →</span>
            <span class="cb-cta-copy--claim">Find a claim to answer →</span>
          </a>
          <span class="cb-path-note">Debates on your own time stay open all week.</span>
        </div>
      </article>
      <article class="cb-path cb-path--spar">
        <div class="cb-spar-copy">
          <span class="cb-path-k"><i></i>Live together · three times a day</span>
          <h3>Meet live at Clash Hour</h3>
          <p class="cb-path-copy">Everyone joins at the same time. Three sessions every day, one per side of the world: 9 PM New York, 9 PM Berlin and 9 PM Sydney, each in local time. Enter the queue, get matched, debate live, and receive an AI result when the round ends.</p>
        </div>
        <div class="cb-spar-visual" role="img" aria-label="Two Debatable speakers facing each other in a live online round">
          <img src="/img/round/faces/face02.jpg" alt="" loading="lazy" decoding="async" width="440" height="245">
          <img src="/img/round/faces/face07.jpg" alt="" loading="lazy" decoding="async" width="440" height="245">
          <div class="cb-spar-live"><span>Live video room</span><b>Both online now</b></div>
        </div>
        <div class="cb-spar-date">
          <span class="cb-spar-date-label" id="cbWedWhat">Next live session</span>
          <b id="cbWedWhen">9 PM New York, Berlin &amp; Sydney</b>
          <span id="cbWedLocal"></span>
        </div>
        <div class="cb-spar-actions">
          <a href="/spar" data-cb="sparnight">See Clash Hour →</a>
          <!-- href is repainted by paintWeek() to the session the card is
               showing, so someone in Sydney adding it gets the 9 PM
               session rather than a US hour they were never going to
               make. The static value is the US night, which is what a
               JS-off visitor gets. -->
          <a id="cbWedCal" href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Clash%20Hour%20New%20York&amp;dates=20260908T210000%2F20260908T223000&amp;ctz=America%2FNew_York&amp;recur=RRULE%3AFREQ%3DDAILY" target="_blank" rel="noopener" data-cb="sparcalendar">Add to calendar</a>
        </div>
      </article>
    </div>
    <div class="cb-links">
      <a href="/community" data-community-join data-cb="cta">Join the community</a>
      <a href="/chat" data-cb="groupchat">Open the group chat</a>
    </div>
  </div>
</section>
````

## Homepage section {'id': 'credential-path', 'class': 'credential-path', 'aria-label': 'Debatable certificate and company philosophy'}

````html
<section id="credential-path" class="credential-path" aria-label="Debatable certificate and company philosophy">
  <style>
    .credential-path{
      /* 2026-07-22 (fourth pass): this chapter carries three cards, not
         two, so it runs wider than the shared 1180 column and on a
         tighter gutter. Three 4-wide cards at the page cap left each
         column too narrow for the certificate art and the translation
         stack; the extra width buys back the reading measure. */
      padding:var(--mid-pad-block) clamp(18px,5vw,44px);
      display:flex;flex-direction:column;align-items:center;
    }
    /* 2026-07-22 (second pass): 5/7 -> 6/6 per the founder ("mold / blend
       together better"). The asymmetric split read as two unrelated
       cards; equal columns make the pair read as one spread, and the
       narrower vision column pulls the row height down, which is what
       kept the certificate cover from ballooning. Grid stretch keeps
       both cards the same height without a JS measure. */
    .credential-path-wrap{
      width:100%;max-width:1420px;
      display:grid;grid-template-columns:repeat(12,minmax(0,1fr));
      gap:clamp(14px,1.6vw,20px);
    }
    /* 2026-07-22 (third pass): the standalone cross-language section was
       folded in here as a third card, so the credential, the vision and
       the live-translation demo read as one chapter instead of three
       separate bands. 6/6 becomes 4/4/4. */
    .credential-path-wrap > .credential-card--cert{grid-column:span 4}
    .credential-path-wrap > .credential-card--future{grid-column:span 4}
    .credential-path-wrap > .credential-card--xlang{grid-column:span 4}
    .credential-card{
      position:relative;overflow:hidden;
      border:1px solid rgba(29,25,21,.10);
      border-radius:18px;
      background:rgba(255,253,247,.92);
      box-shadow:0 18px 52px rgba(29,25,21,.08);
      padding:22px;
      min-height:230px;
      display:flex;flex-direction:column;gap:11px;
      color:#1a1a1f;
      text-decoration:none;
    }
    .credential-card--link{
      cursor:pointer;
      transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
    }
    .credential-card--link:hover{
      transform:translateY(-3px);
      border-color:rgba(239,68,68,.34);
      box-shadow:0 26px 62px rgba(239,68,68,.14);
    }
    /* 2026-07-22: was a two-column grid (copy | 214px cover). At the new
       5-column width that left the headline wrapping to three lines
       beside a small thumbnail, and because the vision card is taller,
       the cert card stretched to match and opened ~370px of dead space
       under its CTA. Stacked instead: copy, then the cover art growing
       into whatever slack the row has, then the CTA pinned at the
       bottom. The card fills its own height at any row height. */
    .credential-card--cert{
      display:flex;
      flex-direction:column;
      gap:14px;
    }
    .credential-cert-copy{
      position:relative;z-index:1;
      display:flex;flex-direction:column;gap:14px;
      min-width:0;
    }
    .credential-card::after{
      content:"";position:absolute;inset:auto -12% -42% auto;
      width:260px;height:260px;border-radius:50%;
      background:radial-gradient(circle,rgba(239,68,68,.16),transparent 66%);
      pointer-events:none;
    }
    .credential-eyebrow{
      position:relative;z-index:1;
      width:max-content;
      font-size:.6rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;
      color:#c81e1e;
      border:1px solid rgba(200,30,30,.18);
      background:rgba(239,68,68,.07);
      border-radius:999px;
      padding:5px 9px;
    }
    /* 2026-07-22: was clamp(1.8rem,3.1vw,2.6rem) capped at 12ch, which
       broke both headings onto four or five lines and left a column of
       dead space beside them. A step down and a wider measure lets each
       heading sit on two lines and gives the cards their space back. */
    .credential-card h2{
      position:relative;z-index:1;
      margin:0;
      font-family:var(--font-display);
      font-size:clamp(1.5rem,2.15vw,2.02rem);
      line-height:1.06;
      letter-spacing:-.022em;
      color:#151519;
      max-width:19ch;
    }
    .credential-card p{
      position:relative;z-index:1;
      margin:0;
      font-size:1.02rem;
      line-height:1.45;
      color:rgba(29,25,21,.66);
      max-width:34ch;
    }
    .credential-card--future{
      background:linear-gradient(180deg,rgba(255,253,247,.94),rgba(255,246,237,.9));
      border-color:rgba(200,50,50,.18);
    }
    .credential-proof{
      position:relative;z-index:1;
      display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
      gap:9px;
      margin-top:2px;
    }
    .credential-proof span{
      min-height:34px;
      display:flex;align-items:center;justify-content:center;
      border:1px solid rgba(29,25,21,.10);
      border-radius:999px;
      background:#fff;
      padding:8px 12px;
      font-size:.7rem;
      font-weight:850;
      line-height:1;
      color:rgba(29,25,21,.64);
      text-align:center;
      white-space:nowrap;
    }
    .credential-cover-thumb{
      position:relative;z-index:1;
      display:block;
      /* Grows into the row's spare height instead of holding a fixed
         page ratio and leaving the rest of the card empty.
         flex-basis MUST be 0, not auto: at auto the cover claims the
         sample image's full 1275x1650 intrinsic height (~545px here),
         which made this card the tall one and drove the whole row. At 0
         it contributes only min-height to the natural size, the vision
         card sets the row height, and the cover takes the remainder. */
      flex:1 1 0;
      min-height:170px;
      /* 2026-07-22 (second pass): capped. Uncapped, the taller vision
         card drove this to ~470px of cropped certificate, which
         dominated the whole spread. 360px keeps it a document, not a
         wall; margin-block:auto is inert while the cover is growing
         (no free space) and splits any slack evenly above and below
         once the cap is hit, so a shorter cover still sits centered
         between the pills and the CTA instead of leaving one hole. */
      max-height:360px;
      margin-block:auto;
      border-radius:12px;
      padding:8px;
      background:#fff;
      border:1px solid rgba(29,25,21,.12);
      box-shadow:0 18px 42px rgba(29,25,21,.16);
      transform:rotate(.6deg);
      overflow:hidden;
    }
    .credential-cover-thumb img{
      display:block;width:100%;height:100%;object-fit:cover;
      /* Top-anchored: a certificate reads from its header down, so any
         crop should take from the foot, never the title. */
      object-position:50% 0;
      border-radius:6px;
    }
    .credential-cover-caption{
      position:absolute;left:14px;right:14px;bottom:14px;
      display:flex;justify-content:center;
      pointer-events:none;
    }
    .credential-cover-caption span{
      display:inline-flex;align-items:center;justify-content:center;
      border-radius:999px;background:#b91c1c;color:#fff;
      padding:7px 11px;font-size:.64rem;font-weight:900;
      letter-spacing:.08em;text-transform:uppercase;
      box-shadow:0 10px 22px rgba(239,68,68,.28);
    }
    .credential-actions{
      position:relative;z-index:1;
      display:flex;flex-wrap:wrap;gap:10px;
      margin-top:auto;
    }
    .credential-btn{
      display:inline-flex;align-items:center;gap:8px;
      border-radius:999px;
      padding:10px 16px;
      font-size:.88rem;
      font-weight:850;
      text-decoration:none;
      background:#ef4444;
      color:#fff;
      box-shadow:0 14px 32px rgba(239,68,68,.26);
      transition:transform .18s ease, background .18s ease, box-shadow .18s ease;
    }
    .credential-btn:hover{
      transform:translateY(-2px);
      background:#dc2626;
      box-shadow:0 20px 40px rgba(239,68,68,.34);
    }
    .credential-btn--ghost{
      background:#fff;
      color:#1a1a1f;
      border:1px solid rgba(29,25,21,.12);
      box-shadow:none;
    }
    .credential-btn--ghost:hover{
      background:#fff;
      border-color:rgba(29,25,21,.26);
      box-shadow:0 14px 28px rgba(29,25,21,.08);
    }
    /* 2026-07-22: replaced a fake S-curve. It had an axis, plot dots and
       four category labels that corresponded to no data, so it read as a
       chart while carrying none. The card's argument is a split, not a
       trend: one column of work AI absorbs, one line of work it can't.
       Drawing the split directly says the same thing honestly, and it
       absorbs the duplicate pill row that used to sit under the chart. */
    /* 2026-07-22: was a bordered box holding two padded rows, four pill
       chips and a tinted panel. Same contrast, told in two lines: the
       muted list of what AI already handles, then the one thing it does
       not, carrying the weight on type alone. */
    .cred-split{position:relative;z-index:1;margin-top:4px;
      padding-top:14px;border-top:1px solid rgba(29,25,21,.12)}
    [data-theme="dark"] .cred-split,
    [data-theme="crimson"] .cred-split,
    [data-theme="grey"] .cred-split,
    [data-theme="stone"] .cred-split{border-top-color:rgba(245,239,231,.15)}
    [data-theme="dark"] .cred-split .cred-split-has,
    [data-theme="crimson"] .cred-split .cred-split-has,
    [data-theme="grey"] .cred-split .cred-split-has,
    [data-theme="stone"] .cred-split .cred-split-has{color:rgba(245,239,231,.68)}
    [data-theme="dark"] .cred-split .cred-split-line b,
    [data-theme="crimson"] .cred-split .cred-split-line b,
    [data-theme="grey"] .cred-split .cred-split-line b,
    [data-theme="stone"] .cred-split .cred-split-line b{color:#fca5a5}
    .cred-split-tag{
      display:block;margin-bottom:4px;
      font-size:.62rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;
      color:rgba(29,25,21,.64);
    }
    .cred-split .cred-split-has{
      margin:0 0 13px;font-size:.95rem;line-height:1.5;color:rgba(29,25,21,.64);
    }
    /* The one line that matters gets the weight: serif, a full type step
       above the line it is contrasted with. */
    .cred-split .cred-split-line{
      margin:0;
      font-family:var(--font-display);
      font-size:clamp(1.05rem,1.5vw,1.26rem);font-weight:700;line-height:1.3;
      letter-spacing:-.01em;color:#1a1a1f;
    }
    .cred-split .cred-split-line b{font-weight:700;color:#b91c1c}
    .credential-btn--wide{
      width:100%;
      justify-content:space-between;
      padding-left:18px;
      padding-right:18px;
    }
    /* 2026-07-22: the company-vision card argued that speaking to a real
       room is the skill AI cannot do for you, and showed nothing. This
       is that room. Wide editorial media band rather than a thumbnail,
       because the claim is the picture: one person on their feet, an
       audience in the same room listening.
       object-position sits high so the speaker stays in frame as the
       band's aspect ratio shortens on narrow columns. The warm scrim
       pulls the photo into the cream/red system instead of letting a
       cool JPEG sit on top of it. */
    .cred-media{
      position:relative;z-index:1;
      margin:2px 0 0;
      border-radius:var(--mid-radius-sm);
      overflow:hidden;
      border:1px solid rgba(29,25,21,.10);
      background:#e7ded2;
      /* 16/6 -> 16/5.4 (2026-07-22 second pass): a step shorter so the
         vision card's stack converges on the cert card's height at the
         new equal-width split. */
      aspect-ratio:16/5.4;
    }
    .cred-media img{
      display:block;width:100%;height:100%;
      object-fit:cover;object-position:50% 34%;
    }
    .cred-media::after{
      content:"";position:absolute;inset:0;pointer-events:none;
      background:
        linear-gradient(180deg,rgba(255,246,237,.10) 0%,transparent 42%,rgba(60,26,20,.30) 100%),
        linear-gradient(90deg,rgba(200,50,50,.10),transparent 58%);
      mix-blend-mode:multiply;
    }
    .cred-media figcaption{
      position:absolute;left:12px;right:12px;bottom:11px;
      margin:0;
      font-family:var(--font-body);
      font-size:.62rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;
      color:rgba(255,253,247,.94);
      text-shadow:0 1px 10px rgba(0,0,0,.6);
    }
    [data-theme="dark"] .cred-media,
    [data-theme="crimson"] .cred-media,
    [data-theme="grey"] .cred-media,
    [data-theme="stone"] .cred-media{border-color:rgba(245,239,231,.13)}
    [data-theme="dark"] .credential-card,
    [data-theme="crimson"] .credential-card,
    [data-theme="grey"] .credential-card,
    [data-theme="stone"] .credential-card{
      background:linear-gradient(180deg,rgba(42,31,28,.88),rgba(30,24,23,.80));
      color:#f5efe7;
      border-color:rgba(245,239,231,.13);
      box-shadow:0 18px 54px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05);
    }
    [data-theme="dark"] .credential-card--future,
    [data-theme="crimson"] .credential-card--future,
    [data-theme="grey"] .credential-card--future,
    [data-theme="stone"] .credential-card--future{
      background:radial-gradient(circle at 88% 20%,rgba(239,68,68,.14),transparent 40%),linear-gradient(180deg,rgba(48,32,29,.90),rgba(29,24,23,.82));
      border-color:rgba(239,68,68,.24);
    }
    [data-theme="dark"] .credential-card h2,
    [data-theme="crimson"] .credential-card h2,
    [data-theme="grey"] .credential-card h2,
    [data-theme="stone"] .credential-card h2{
      color:#f5efe7;
    }
    [data-theme="dark"] .credential-card p,
    [data-theme="crimson"] .credential-card p,
    [data-theme="grey"] .credential-card p,
    [data-theme="stone"] .credential-card p{
      color:rgba(245,239,231,.70);
    }
    [data-theme="dark"] .credential-proof span,
    [data-theme="crimson"] .credential-proof span,
    [data-theme="grey"] .credential-proof span,
    [data-theme="stone"] .credential-proof span{
      color:rgba(245,239,231,.68);
      border-color:rgba(245,239,231,.13);
      background:rgba(255,255,255,.04);
    }
    [data-theme="dark"] .cred-split-tag,
    [data-theme="crimson"] .cred-split-tag,
    [data-theme="grey"] .cred-split-tag,
    [data-theme="stone"] .cred-split-tag{color:rgba(245,239,231,.68)}
    [data-theme="dark"] .cred-split .cred-split-line,
    [data-theme="crimson"] .cred-split .cred-split-line,
    [data-theme="grey"] .cred-split .cred-split-line,
    [data-theme="stone"] .cred-split .cred-split-line{color:#f5efe7}
    /* 2026-08-10: was rgba(255,255,255,.9) — a "dark theme override"
       that kept this frame effectively white, the same lit-paper-island
       bug as the other cards fixed on this pass. A dark mat still reads
       as a framed document; it doesn't need to be a white mat to do that. */
    [data-theme="dark"] .credential-cover-thumb,
    [data-theme="crimson"] .credential-cover-thumb,
    [data-theme="grey"] .credential-cover-thumb,
    [data-theme="stone"] .credential-cover-thumb{
      background:#221f1e;
      border-color:rgba(245,239,231,.18);
      box-shadow:0 18px 46px rgba(0,0,0,.34);
    }
    [data-theme="dark"] .credential-btn--ghost,
    [data-theme="crimson"] .credential-btn--ghost,
    [data-theme="grey"] .credential-btn--ghost,
    [data-theme="stone"] .credential-btn--ghost{
      color:#f5efe7;
      background:rgba(255,255,255,.04);
      border-color:rgba(245,239,231,.14);
    }
    /* ── Live-translation card ───────────────────────────────────────
       Two seats side by side with their captions. Deliberately NOT the
       old black caption bubbles: they sit on the page's own cream with a
       hairline, and only the translated line takes brand red, so the
       colour carries the meaning instead of decorating it. */
    /* Transcript rows, not photo overlays: at a third of the row's width
       a 4:3 tile with an absolutely-positioned caption overflowed its
       own frame. A speaker thumbnail beside its caption holds any
       caption length and any script (Devanagari and CJK included). */
    .xl-call{
      position:relative;z-index:1;
      display:flex;flex-direction:column;gap:12px;
    }
    .xl-row{
      margin:0;display:grid;grid-template-columns:52px minmax(0,1fr);gap:11px;align-items:start;
    }
    .xl-row img{
      display:block;width:52px;height:52px;border-radius:11px;object-fit:cover;object-position:50% 22%;
      background:#efe9e0;
    }
    .xl-row figcaption{min-width:0}
    .xl-name{
      display:block;margin-bottom:5px;
      font-family:var(--font-body);
      font-size:.56rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
      color:var(--text-ghost,rgba(29,25,21,.5));
    }
    .xl-name b{color:#c81e1e;font-weight:800;transition:opacity .2s ease}
    .credential-card--xlang .xl-cap{
      margin:0;max-width:none;padding:9px 12px;border-radius:11px;
      background:#2a2723;border:1px solid rgba(245,239,231,.14);
      font-family:var(--font-body);font-size:.85rem;line-height:1.34;color:#f0ece5;
      transition:opacity .2s ease;
    }
    [data-theme="light"] .credential-card--xlang .xl-cap{
      background:#fffdf7;border-color:rgba(29,25,21,.10);color:#1a1a1f;
    }
    .credential-card--xlang .xl-cap--live{background:#dc2626;border-color:#dc2626;color:#fff}
    /* Swap fade driven by the rotator script. */
    .credential-card--xlang.xl-swap .xl-cap,
    .credential-card--xlang.xl-swap .xl-name b{opacity:0}
    @media(prefers-reduced-motion:reduce){
      .credential-card--xlang .xl-cap,.xl-name b{transition:none}
    }
    @media(max-width:860px){
      /* Stack. Both spans go full width, so the 5/7 split only exists
         where there is room for two real columns. No max-width of its
         own: a 680px cap here left this chapter visibly narrower than
         the ones above and below it once they all shared a gutter. */
      .credential-path-wrap{grid-template-columns:1fr;margin:0 auto}
      .credential-path-wrap > .credential-card--cert,
      .credential-path-wrap > .credential-card--future,
      .credential-path-wrap > .credential-card--xlang{grid-column:1 / -1}
      .credential-card{min-height:0}
      .credential-card h2{max-width:24ch}
      /* Stacked: the photo leads the card, so the room is the first
         thing read and the argument follows it. */
      .cred-media{order:-1;aspect-ratio:16/6.5}
    }
    @media(max-width:640px){
      /* Stacked cards have no spare height for the cover to grow into,
         so it goes back to holding a page ratio at a readable size.
         The desktop cap comes off so the ratio owns the height. */
      .credential-cover-thumb{flex:none;aspect-ratio:8.5/9;min-height:0;max-height:none}
    }
    @media(max-width:560px){
      /* Padding comes from --mid-pad-block / --mid-gutter now. */
      .credential-card{padding:22px;border-radius:var(--mid-radius-sm)}
      /* These three are decorative tags naming the proof chain (live
         round, AI ballot, verify URL), not actions. Stacked 1-per-row
         they became three full-width empty pills — two words each in a
         351px bar, which is the "everything is a slab" read the rest of
         this pass is undoing. They are short enough to sit in a row. */
      .credential-proof{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}
      .credential-proof span{padding:7px 13px;min-height:0}
      .credential-actions{flex-direction:column}
      .credential-btn{justify-content:center;width:100%}
      .cred-media{aspect-ratio:3/2}
      .cred-media img{object-position:50% 30%}
    }
  </style>
  <div class="credential-path-wrap">
    <a class="credential-card credential-card--cert credential-card--link" href="/credentials" data-cta="landing-certificate" aria-label="Open the Debatable credential program">
      <div class="credential-cert-copy">
        <span class="credential-eyebrow">Free certificate</span>
        <h2>Turn a judged round into a credential.</h2>
        <p>One judged voice round becomes a public score, a percentile, and a link anyone can check. Free.</p>
        <div class="credential-proof" aria-hidden="true">
          <span>Live round</span>
          <span>AI decision</span>
          <span>Verify URL</span>
        </div>
      </div>
      <div class="credential-cover-thumb" aria-hidden="true">
        <img src="/assets/credential-sample-cover.png" alt="" width="1275" height="1650" loading="lazy">
        <div class="credential-cover-caption"><span>View sample</span></div>
      </div>
      <div class="credential-actions">
        <span class="credential-btn">Earn a credential <span aria-hidden="true">&rarr;</span></span>
      </div>
    </a>
    <article class="credential-card credential-card--future">
      <span class="credential-eyebrow">Company vision</span>
      <h2>Verbal reasoning matters more every year.</h2>
      <figure class="cred-media">
        <img src="/img/ambassadors/round.jpg"
             alt="A debater speaking to a classroom audience during an in-person round."
             width="1400" height="1050" loading="lazy" decoding="async">
        <figcaption>An in-person round</figcaption>
      </figure>
      <p>AI can polish anyone's essay. It cannot show you understood it. Answering a real person, on the clock, is the skill left.</p>
      <div class="cred-split">
        <p class="cred-split-has"><span class="cred-split-tag">AI already does this for you</span>Essays, applications, cover letters, research memos.</p>
        <p class="cred-split-line"><b>It cannot</b> hold your case out loud, against someone pushing back, on the clock.</p>
      </div>
      <div class="credential-actions">
        <a class="credential-btn credential-btn--wide" href="/future" data-cta="landing-company-philosophy">Company vision and philosophy <span aria-hidden="true">&rarr;</span></a>
      </div>
    </article>

    <!-- Live translation, folded in from the old standalone
         #cross-language section 2026-07-22. The two seats rotate through
         language pairs so the card shows people arguing in different
         languages rather than asserting it in copy. Captions sit on the
         page's own cream (the old black bubbles were dropped per the founder);
         the translated line takes the brand red so it still reads as the
         one being converted. -->
    <article class="credential-card credential-card--xlang">
      <span class="credential-eyebrow">Live translation</span>
      <h2>Argue past the language barrier.</h2>
      <div class="xl-call" aria-label="A live round between speakers of two languages">
        <figure class="xl-row">
          <img src="/img/round/seat-opp.jpg" alt="Your opponent arguing on camera in their own language" loading="lazy" decoding="async">
          <figcaption>
            <span class="xl-name">They speak &middot; <b data-xl="from">Español</b></span>
            <p class="xl-cap" data-xl="src">La carga de la prueba sigue siendo suya, y no han dado ni un solo mecanismo.</p>
          </figcaption>
        </figure>
        <figure class="xl-row xl-row--you">
          <img src="/img/round/seat-you.jpg" alt="You on camera reading the translated caption" loading="lazy" decoding="async">
          <figcaption>
            <span class="xl-name">You read &middot; <b>English</b></span>
            <p class="xl-cap xl-cap--live" data-xl="dst">The burden of proof is still theirs, and they have not given a single mechanism.</p>
          </figcaption>
        </figure>
        <figure class="xl-row">
          <img src="/img/round/faces/face21.jpg" alt="A third debater speaking on camera in another language" loading="lazy" decoding="async">
          <figcaption>
            <span class="xl-name">They speak &middot; <b data-xl="from2">中文</b></span>
            <p class="xl-cap" data-xl="src2">你说会有伤害，但没有说明它怎么发生。请给出机制。</p>
          </figcaption>
        </figure>
        <figure class="xl-row xl-row--you">
          <img src="/img/round/seat-you.jpg" alt="You on camera reading the translated caption" loading="lazy" decoding="async">
          <figcaption>
            <span class="xl-name">You read &middot; <b>English</b></span>
            <p class="xl-cap xl-cap--live" data-xl="dst2">You claim harm but never show how it happens. Give me the mechanism.</p>
          </figcaption>
        </figure>
      </div>
      <p>They argue in their language. You read yours. Translated live, both ways, in 20 languages.</p>
      <div class="credential-actions">
        <a class="credential-btn credential-btn--wide" href="/spar" data-cta="xlang-match">Match across languages <span aria-hidden="true">&rarr;</span></a>
      </div>
    </article>
  </div>
</section>
````

## Homepage section {'id': 'why-this-exists', 'class': 'whyx', 'aria-label': 'Our company philosophy'}

````html
<section id="why-this-exists" class="whyx" aria-label="Our company philosophy">
  <style>
    .whyx{padding:var(--mid-pad-block) var(--mid-gutter)}
    .whyx-wrap{max-width:var(--mid-w);margin:0 auto}
    .whyx-top{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);
      gap:clamp(24px,3.4vw,52px);align-items:center}
    .whyx-eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-body);
      font-size:.62rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent,#dc2626);margin-bottom:10px}
    .whyx-eyebrow i{width:6px;height:6px;border-radius:50%;background:currentColor}
    .whyx-title{font-family:var(--font-display);font-size:clamp(1.8rem,3.1vw,2.7rem);
      font-weight:700;letter-spacing:-.03em;line-height:1.03;margin:0 0 12px;color:var(--text,#1a1a1f)}
    .whyx-title b{font-weight:700;color:var(--accent,#dc2626)}
    .whyx-lede{margin:0 0 16px;font-size:.98rem;line-height:1.55;max-width:56ch;color:var(--text-dim,rgba(0,0,0,.68))}
    /* 2026-07-22: the Atlas was a full-width card with a dotted world map
       here. Cut per the founder; it survives as this inline link. */
    .whyx-inline{color:var(--accent,#dc2626);font-weight:700;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
    .whyx-inline:hover{text-decoration-thickness:2px}
    .whyx-lede b{font-weight:700;color:var(--text,#1a1a1f)}


    /* Culture-war room + persuasion signal. These are static editorial
       images so this chapter stays outside the landing's animation stack. */
    .whyx-crowd{position:relative;min-width:0;margin:0}
    .whyx-visual{position:relative;max-width:520px;margin-left:auto;padding:0 0 54px 34px}
    .whyx-stage{
      position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:18px;
      background:#141010;box-shadow:0 24px 56px rgba(26,18,18,.24)
    }
    .whyx-stage:after{
      content:"";position:absolute;inset:0;
      background:linear-gradient(180deg,transparent 58%,rgba(10,8,8,.64) 100%);
      pointer-events:none
    }
    .whyx-stage img,.whyx-signal img{display:block;width:100%;height:100%;object-fit:cover}
    .whyx-stage-copy{
      position:absolute;z-index:1;left:18px;right:18px;top:17px;display:flex;
      align-items:flex-start;justify-content:space-between;gap:18px;color:#fff
    }
    .whyx-stage-copy b{
      max-width:12ch;font-family:var(--font-display);
      font-size:clamp(1.2rem,2vw,1.65rem);line-height:.96;letter-spacing:-.025em;
      text-shadow:0 2px 14px rgba(0,0,0,.72)
    }
    .whyx-stage-copy span{
      flex:none;padding:6px 8px;border:1px solid rgba(255,255,255,.34);border-radius:999px;
      background:rgba(10,8,8,.42);font-family:var(--font-body);
      font-size:.52rem;font-weight:850;letter-spacing:.11em;text-transform:uppercase
    }
    .whyx-signal{
      position:absolute;left:0;bottom:0;width:60%;height:118px;overflow:hidden;
      border:5px solid var(--bg,#fafafa);border-radius:14px;background:#141010;
      box-shadow:0 14px 32px rgba(26,18,18,.26)
    }
    .whyx-signal:after{
      content:"";position:absolute;inset:0;
      background:linear-gradient(90deg,rgba(8,7,7,.9) 0%,rgba(8,7,7,.18) 78%);
      pointer-events:none
    }
    .whyx-signal-copy{
      position:absolute;z-index:1;left:13px;top:50%;transform:translateY(-50%);
      display:flex;flex-direction:column;gap:3px;color:#fff
    }
    .whyx-signal-copy b{
      font-family:var(--font-body);font-size:.52rem;
      font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#fca5a5
    }
    .whyx-signal-copy span{
      max-width:17ch;font-family:var(--font-display);
      font-size:1rem;font-weight:700;line-height:1.05
    }
    /* Legacy crowd SVG stays in the document for a no-image fallback, but
       the photographic collage is the visible visual. */
    .wc-svg,.wc-tally{display:none}
    .wc-svg{width:100%;max-width:440px;height:auto;display:block;overflow:visible;margin-left:auto}
    .wc-p{fill:var(--text,#1a1a1f);opacity:.14;animation:wc-decide 9s cubic-bezier(.4,0,.2,1) var(--d,0s) infinite}
    .wc-a{--wc-side:var(--accent,#dc2626)}
    .wc-b{--wc-side:var(--text,#1a1a1f)}
    @keyframes wc-decide{
      0%,6%{fill:var(--text,#1a1a1f);opacity:.14}
      18%,72%{fill:var(--wc-side);opacity:.92}
      86%,100%{fill:var(--text,#1a1a1f);opacity:.14}
    }
    .wc-tally{display:flex;gap:4px;margin:12px 0 0 auto;height:4px;max-width:440px}
    .wc-bar{height:100%;border-radius:99px;width:0;animation:wc-fill 9s cubic-bezier(.4,0,.2,1) 1.15s infinite}
    .wc-bar-a{background:var(--accent,#dc2626);--wc-w:60%}
    .wc-bar-b{background:var(--text,#1a1a1f);opacity:.28;--wc-w:40%}
    @keyframes wc-fill{0%,6%{width:0} 18%,72%{width:var(--wc-w)} 86%,100%{width:0}}
    .wc-cap{max-width:520px;margin:10px 0 0 auto;font-family:var(--font-body);font-size:.6rem;
      font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--text-ghost,rgba(0,0,0,.42));text-align:right}
    .whyx-crowd .wc-svg,.whyx-crowd .wc-tally{display:none}

    @media (max-width:900px){
      .whyx-top{grid-template-columns:1fr;gap:26px}
      .whyx-visual,.wc-cap{margin-left:0;margin-right:auto;text-align:left}
    }
    @media (max-width:560px){
      .whyx-visual{padding-left:0;padding-bottom:64px}
      .whyx-signal{left:12px;width:76%;height:108px}
      .whyx-stage-copy{align-items:flex-start;flex-direction:column;gap:8px}
      .whyx-stage-copy b{max-width:14ch}
    }
    @media (prefers-reduced-motion:reduce){
      .wc-p{animation:none;fill:var(--wc-side);opacity:.92}
      .wc-bar{animation:none;width:var(--wc-w)}
    }
  </style>

  <div class="whyx-wrap">
    <div class="whyx-top">
      <div class="whyx-intro">
        <span class="whyx-eyebrow"><i aria-hidden="true"></i>Our company philosophy</span>
        <h2 class="whyx-title">Measure what <b>persuades people.</b></h2>
        <p class="whyx-lede">The AI judge explains who won and why. Then the room votes, before and after the verdict. Over many rounds that shows which arguments actually move people. <b>Platform feedback, not a public poll.</b> See where rounds happen in <a class="whyx-inline" href="/atlas" data-cta="whyx-atlas">the Debate Atlas</a>.</p>
        <!-- 2026-08-22: honesty line. The site experiments in the open and the
             copy should say so rather than pretend the surface is settled. -->
        <p class="whyx-lede"><b>A lot of this site is experimental, on purpose.</b> Live rounds with strangers, an AI judge with published scoring rules, rankings built from spoken argument: nobody has settled how any of this should work yet, so we build in the open and change things most days. If a corner looks unfinished, it probably shipped this week.</p>
        <!-- 2026-07-22: CTA pair removed per the founder. The section argues the
             philosophy; the hero above already carries both actions. -->
      </div>

      <figure class="whyx-crowd">
        <div class="whyx-visual">
          <div class="whyx-stage">
            <img src="/img/landing/culture-war-arena.jpg"
              alt="Editorial image of a packed debate room with speakers on stage and audience members raising side cards"
              loading="lazy" decoding="async">
            <div class="whyx-stage-copy">
              <b>Everyone has an opinion.</b>
              <span>A round puts it to the test</span>
            </div>
          </div>
          <div class="whyx-signal">
            <img src="/img/landing/persuasion-signal.jpg" alt="" loading="lazy" decoding="async">
            <div class="whyx-signal-copy">
              <b>Audience voting · live</b>
              <span>Which side persuaded you?</span>
            </div>
          </div>
        </div>
        <svg class="wc-svg" viewBox="0 0 374 182" role="img"
           aria-label="A room of people watching a round and splitting on who won">
        <defs>
          <g id="wcFig">
            <circle cx="7" cy="5.4" r="5.4"/>
            <path d="M0 21.5c0-4.6 3.1-8 7-8s7 3.4 7 8z"/>
          </g>
        </defs>
        <use href="#wcFig" x="14" y="12" class="wc-p wc-a" style="--d:0.041s"/><use href="#wcFig" x="44" y="12" class="wc-p wc-b" style="--d:0.117s"/><use href="#wcFig" x="74" y="12" class="wc-p wc-a" style="--d:0.191s"/><use href="#wcFig" x="104" y="12" class="wc-p wc-b" style="--d:0.311s"/><use href="#wcFig" x="134" y="12" class="wc-p wc-b" style="--d:0.389s"/><use href="#wcFig" x="164" y="12" class="wc-p wc-b" style="--d:0.442s"/><use href="#wcFig" x="194" y="12" class="wc-p wc-a" style="--d:0.55s"/><use href="#wcFig" x="224" y="12" class="wc-p wc-a" style="--d:0.632s"/><use href="#wcFig" x="254" y="12" class="wc-p wc-a" style="--d:0.741s"/><use href="#wcFig" x="284" y="12" class="wc-p wc-a" style="--d:0.816s"/><use href="#wcFig" x="314" y="12" class="wc-p wc-a" style="--d:0.87s"/><use href="#wcFig" x="344" y="12" class="wc-p wc-a" style="--d:1.004s"/>
        <use href="#wcFig" x="14" y="46" class="wc-p wc-a" style="--d:0.058s"/><use href="#wcFig" x="44" y="46" class="wc-p wc-a" style="--d:0.164s"/><use href="#wcFig" x="74" y="46" class="wc-p wc-b" style="--d:0.273s"/><use href="#wcFig" x="104" y="46" class="wc-p wc-b" style="--d:0.316s"/><use href="#wcFig" x="134" y="46" class="wc-p wc-a" style="--d:0.424s"/><use href="#wcFig" x="164" y="46" class="wc-p wc-b" style="--d:0.478s"/><use href="#wcFig" x="194" y="46" class="wc-p wc-a" style="--d:0.607s"/><use href="#wcFig" x="224" y="46" class="wc-p wc-b" style="--d:0.699s"/><use href="#wcFig" x="254" y="46" class="wc-p wc-a" style="--d:0.77s"/><use href="#wcFig" x="284" y="46" class="wc-p wc-a" style="--d:0.876s"/><use href="#wcFig" x="314" y="46" class="wc-p wc-a" style="--d:0.922s"/><use href="#wcFig" x="344" y="46" class="wc-p wc-b" style="--d:1.034s"/>
        <use href="#wcFig" x="14" y="80" class="wc-p wc-b" style="--d:0.142s"/><use href="#wcFig" x="44" y="80" class="wc-p wc-b" style="--d:0.226s"/><use href="#wcFig" x="74" y="80" class="wc-p wc-b" style="--d:0.302s"/><use href="#wcFig" x="104" y="80" class="wc-p wc-b" style="--d:0.414s"/><use href="#wcFig" x="134" y="80" class="wc-p wc-a" style="--d:0.506s"/><use href="#wcFig" x="164" y="80" class="wc-p wc-a" style="--d:0.558s"/><use href="#wcFig" x="194" y="80" class="wc-p wc-b" style="--d:0.656s"/><use href="#wcFig" x="224" y="80" class="wc-p wc-a" style="--d:0.699s"/><use href="#wcFig" x="254" y="80" class="wc-p wc-b" style="--d:0.829s"/><use href="#wcFig" x="284" y="80" class="wc-p wc-b" style="--d:0.91s"/><use href="#wcFig" x="314" y="80" class="wc-p wc-a" style="--d:1.02s"/><use href="#wcFig" x="344" y="80" class="wc-p wc-a" style="--d:1.093s"/>
        <use href="#wcFig" x="14" y="114" class="wc-p wc-b" style="--d:0.17s"/><use href="#wcFig" x="44" y="114" class="wc-p wc-b" style="--d:0.262s"/><use href="#wcFig" x="74" y="114" class="wc-p wc-a" style="--d:0.367s"/><use href="#wcFig" x="104" y="114" class="wc-p wc-b" style="--d:0.407s"/><use href="#wcFig" x="134" y="114" class="wc-p wc-a" style="--d:0.522s"/><use href="#wcFig" x="164" y="114" class="wc-p wc-b" style="--d:0.587s"/><use href="#wcFig" x="194" y="114" class="wc-p wc-a" style="--d:0.668s"/><use href="#wcFig" x="224" y="114" class="wc-p wc-a" style="--d:0.749s"/><use href="#wcFig" x="254" y="114" class="wc-p wc-a" style="--d:0.884s"/><use href="#wcFig" x="284" y="114" class="wc-p wc-a" style="--d:0.924s"/><use href="#wcFig" x="314" y="114" class="wc-p wc-a" style="--d:1.017s"/><use href="#wcFig" x="344" y="114" class="wc-p wc-a" style="--d:1.112s"/>
        <use href="#wcFig" x="14" y="148" class="wc-p wc-b" style="--d:0.261s"/><use href="#wcFig" x="44" y="148" class="wc-p wc-b" style="--d:0.291s"/><use href="#wcFig" x="74" y="148" class="wc-p wc-a" style="--d:0.401s"/><use href="#wcFig" x="104" y="148" class="wc-p wc-a" style="--d:0.493s"/><use href="#wcFig" x="134" y="148" class="wc-p wc-a" style="--d:0.602s"/><use href="#wcFig" x="164" y="148" class="wc-p wc-b" style="--d:0.682s"/><use href="#wcFig" x="194" y="148" class="wc-p wc-a" style="--d:0.77s"/><use href="#wcFig" x="224" y="148" class="wc-p wc-a" style="--d:0.814s"/><use href="#wcFig" x="254" y="148" class="wc-p wc-b" style="--d:0.909s"/><use href="#wcFig" x="284" y="148" class="wc-p wc-a" style="--d:0.99s"/><use href="#wcFig" x="314" y="148" class="wc-p wc-a" style="--d:1.112s"/><use href="#wcFig" x="344" y="148" class="wc-p wc-a" style="--d:1.202s"/>
      </svg>
        <div class="wc-tally" aria-hidden="true"><span class="wc-bar wc-bar-a"></span><span class="wc-bar wc-bar-b"></span></div>
        <figcaption class="wc-cap">Today: AI judge. Next: audience vote. The vote reflects Debatable participants, not the wider public.</figcaption>
      </figure>
    </div>


  </div>
</section>
````

## Homepage section {'id': 'stream-it', 'class': 'streamit', 'aria-label': 'Stream a debate with the AI judge'}

````html
<section id="stream-it" class="streamit" aria-label="Stream a debate with the AI judge">
  <style>
    .streamit{padding:var(--mid-pad-block) var(--mid-gutter)}
    .si-wrap{
      width:100%;max-width:var(--mid-w,1180px);margin:0 auto;
      display:grid;grid-template-columns:minmax(0,.94fr) minmax(340px,1.06fr);
      gap:clamp(28px,4.6vw,64px);align-items:center
    }
    #stream-it .si-eyebrow{
      display:inline-flex;align-items:center;gap:8px;margin:0 0 12px;
      font-family:var(--font-body);font-size:.64rem;
      font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#c53030
    }
    #stream-it .si-eyebrow i{
      width:7px;height:7px;border-radius:50%;background:#ef4444;
      box-shadow:0 0 0 5px rgba(239,68,68,.15)
    }
    #stream-it .si-title{
      margin:0 0 14px;font-family:var(--font-display);
      font-size:clamp(2rem,3.6vw,3.15rem);font-weight:730;
      letter-spacing:-.032em;line-height:1.0;color:#1a1a1f
    }
    #stream-it .si-title em{font-style:normal;color:#ef4444}
    #stream-it .si-lede{
      margin:0 0 22px;font-size:clamp(1rem,1.3vw,1.11rem);line-height:1.56;
      color:rgba(26,26,31,.7);max-width:52ch
    }
    #stream-it .si-lede b{color:#1a1a1f;font-weight:700}

    /* Three steps as a numbered ladder rather than cards: it is a
       sequence, and three boxes side by side read as three choices. */
    #stream-it .si-steps{list-style:none;margin:0 0 22px;padding:0;display:grid;gap:2px}
    #stream-it .si-steps li{
      display:grid;grid-template-columns:30px minmax(0,1fr);gap:14px;
      align-items:start;padding:11px 0;
      border-top:1px solid rgba(29,25,21,.11)
    }
    #stream-it .si-steps li:last-child{border-bottom:1px solid rgba(29,25,21,.11)}
    #stream-it .si-steps b{
      font-family:var(--font-body);font-size:.7rem;
      font-weight:900;letter-spacing:.06em;color:#ef4444;
      padding-top:3px;font-variant-numeric:tabular-nums
    }
    #stream-it .si-steps strong{display:block;font-size:.97rem;font-weight:750;color:#1a1a1f;margin-bottom:2px}
    #stream-it .si-steps span{display:block;font-size:.89rem;line-height:1.5;color:rgba(26,26,31,.64)}

    .si-plats{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 20px}
    #stream-it .si-plat{
      display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;
      font-family:var(--font-body);font-size:.75rem;font-weight:700;
      color:#1a1a1f;text-decoration:none;
      border:1px solid rgba(29,25,21,.16);background:rgba(255,253,247,.9);
      transition:border-color .16s ease,background-color .16s ease
    }
    #stream-it .si-plat svg{width:14px;height:14px;flex:none;fill:currentColor}
    #stream-it .si-plat .si-yt{width:16px}
    #stream-it .si-plat:hover{border-color:rgba(239,68,68,.5);background:#fff}

    .si-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 16px}
    .si-cta{
      display:inline-flex;align-items:center;gap:9px;padding:13px 22px;border-radius:999px;
      font-family:var(--font-body);font-size:.9rem;font-weight:800;
      text-decoration:none;transition:transform .16s ease,box-shadow .16s ease
    }
    .si-cta--primary{
      background:#b91c1c;color:#fff;box-shadow:0 10px 26px rgba(239,68,68,.28)
    }
    .si-cta--primary:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(239,68,68,.34)}
    #stream-it .si-cta--ghost{color:#1a1a1f;border:1px solid rgba(29,25,21,.2)}
    #stream-it .si-cta--ghost:hover{border-color:rgba(29,25,21,.42)}
    #stream-it .si-note{
      margin:0;font-size:.83rem;line-height:1.55;color:rgba(26,26,31,.64);max-width:50ch
    }
    #stream-it .si-note a{color:#c53030;text-decoration:none;border-bottom:1px solid rgba(197,48,48,.32)}
    #stream-it .si-note a:hover{border-bottom-color:#c53030}

    /* Example overlay. A mock, and labelled as one: the point is showing a
       broadcaster where the judge sits on their own layout. */
    .si-demo{display:grid;gap:10px}
    .si-frame{
      position:relative;border-radius:16px;overflow:hidden;
      aspect-ratio:16/9;min-height:250px;
      background:radial-gradient(120% 100% at 22% 8%,#2b2f3a 0%,#171a21 58%,#101218 100%);
      border:1px solid rgba(255,255,255,.1);
      box-shadow:0 18px 42px rgba(16,18,24,.3)
    }
    .si-frame-top{
      position:absolute;top:11px;left:12px;right:12px;z-index:3;
      display:flex;align-items:center;gap:8px;flex-wrap:wrap
    }
    .si-live{
      display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
      font-family:var(--font-body);font-size:.6rem;font-weight:900;
      letter-spacing:.12em;text-transform:uppercase;color:#fff;background:#dc2626
    }
    .si-live i{width:5px;height:5px;border-radius:50%;background:#fff;animation:siPulse 1.9s ease-in-out infinite}
    @keyframes siPulse{0%,100%{opacity:1}50%{opacity:.28}}
    .si-mock{
      margin-left:auto;padding:4px 10px;border-radius:999px;
      font-family:var(--font-body);font-size:.58rem;font-weight:800;
      letter-spacing:.11em;text-transform:uppercase;
      color:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.22);
      background:rgba(0,0,0,.32)
    }
    /* Two speaker plates, sized off the frame so they hold their
       proportion at every width instead of snapping at a breakpoint. */
    /* The frame's left half was empty black. The motion is what a viewer
       actually reads on a broadcast, so it fills the void with product
       information rather than decoration. */
    #stream-it .si-motion{
      position:absolute;top:46px;left:12px;z-index:2;width:min(52%,268px);
      font-family:var(--font-display);
      font-size:clamp(.95rem,1.5vw,1.16rem);line-height:1.26;color:#fff
    }
    #stream-it .si-motion b{
      display:block;margin-bottom:6px;
      font-family:var(--font-body);font-size:.55rem;
      font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.68)
    }
    .si-seats{
      position:absolute;inset:auto 12px 12px;z-index:2;
      display:grid;grid-template-columns:1fr 1fr;gap:8px
    }
    .si-seat{
      padding:9px 11px;border-radius:10px;
      background:rgba(10,12,16,.58);border:1px solid rgba(255,255,255,.13);
      backdrop-filter:blur(3px)
    }
    .si-seat-k{
      display:block;font-family:var(--font-body);
      font-size:.55rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
      color:rgba(255,255,255,.68);margin-bottom:3px
    }
    .si-seat-n{
      display:flex;align-items:center;gap:6px;
      font-family:var(--font-body);
      font-size:.84rem;font-weight:750;color:#fff
    }
    .si-seat--speaking .si-seat-n::before{
      content:"";width:6px;height:6px;border-radius:50%;background:#ef4444;flex:none;
      box-shadow:0 0 0 4px rgba(239,68,68,.22)
    }
    /* The judge card. Deliberately the brightest object in the frame:
       it is the thing a broadcaster is deciding whether to put on air. */
    .si-judge{
      position:absolute;top:44px;right:12px;z-index:3;width:min(58%,244px);
      padding:12px 13px 13px;border-radius:12px;
      background:linear-gradient(180deg,#fffdf8,#fdf6ef);
      border:1px solid rgba(29,25,21,.16);
      box-shadow:0 14px 32px rgba(10,12,16,.42)
    }
    #stream-it .si-judge-k{
      display:flex;align-items:center;gap:6px;margin:0 0 7px;
      font-family:var(--font-body);font-size:.55rem;
      font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#c53030
    }
    #stream-it .si-judge-k svg{width:11px;height:11px;fill:currentColor;flex:none}
    #stream-it .si-judge-read{
      margin:0 0 10px;font-family:var(--font-display);
      font-size:.9rem;line-height:1.4;color:#1a1a1f
    }
    .si-judge-pts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .si-pt{
      padding:6px 7px;border-radius:8px;text-align:center;
      border:1px solid rgba(34,197,94,.3);background:#e9fbef
    }
    /* Same hue-rotated pair as the ballot cards below: identical
       lightness and saturation, red only carries the loss. */
    .si-pt--loss{border-color:rgba(239,68,68,.3);background:#fbe9e9}
    .si-pt b{
      display:block;font-family:var(--font-body);
      font-size:.52rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;
      color:rgba(26,26,31,.64);margin-bottom:1px
    }
    .si-pt span{
      display:block;font-family:var(--font-display);
      font-size:1.05rem;font-weight:800;color:#1a1a1f;
      line-height:1;font-variant-numeric:tabular-nums
    }
    /* Chat reacts. No invented handles: the messages carry the point and
       a fabricated username roster would read as a fake audience. */
    .si-chat{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    #stream-it .si-msg{
      padding:6px 11px;border-radius:999px;
      font-family:var(--font-body);font-size:.76rem;font-weight:600;
      color:rgba(26,26,31,.78);
      border:1px solid rgba(29,25,21,.13);background:rgba(255,253,247,.92)
    }
    #stream-it .si-chat-cap{
      width:100%;margin:2px 0 0;font-size:.76rem;line-height:1.5;
      color:rgba(26,26,31,.64)
    }

    @media(max-width:980px){
      .si-wrap{grid-template-columns:minmax(0,1fr);gap:26px}
      .si-demo{order:-1}
      #stream-it .si-title{font-size:clamp(1.85rem,7vw,2.4rem)}
      .si-judge{width:min(64%,214px);top:40px}
      #stream-it .si-judge-read{font-size:.82rem}
    }
    /* Phones: a 16/9 frame is too short to hold an overlay, so the frame
       stops being a video still and becomes a stacked card. Every child
       drops out of absolute positioning into flow order (status, motion,
       judge, plates). Un-absoluting them while the frame kept its
       aspect-ratio was the bug: they piled up on each other inside a box
       that could not grow. */
    @media(max-width:520px){
      .si-frame{
        aspect-ratio:auto;min-height:0;padding:12px;
        display:flex;flex-direction:column;gap:10px
      }
      .si-frame-top,.si-motion,.si-judge,.si-seats{
        position:static;inset:auto;width:auto;margin:0
      }
      #stream-it .si-motion{font-size:1.02rem}
      .si-judge{box-shadow:none}
      #stream-it .si-judge-read{font-size:.86rem}
      .si-seats{grid-template-columns:1fr 1fr;gap:6px}
      .si-demo{gap:8px}
    }
    @media(prefers-reduced-motion:reduce){
      .si-live i{animation:none}
      .si-cta{transition:none}
    }

    /* Dark and tinted themes: the band inherits the page surface, so only
       the text colours that were pinned for the light editorial surface
       need lifting back off it. */
    /* #c53030 on near-black is about 3:1, too dim for small uppercase.
       The dark themes take the lighter red the rest of the page uses for
       text on dark surfaces. */
    [data-theme="dark"] #stream-it .si-eyebrow,[data-theme="crimson"] #stream-it .si-eyebrow,
    [data-theme="grey"] #stream-it .si-eyebrow,[data-theme="stone"] #stream-it .si-eyebrow{color:#f87171}
    [data-theme="dark"] #stream-it .si-title,[data-theme="crimson"] #stream-it .si-title,
    [data-theme="grey"] #stream-it .si-title,[data-theme="stone"] #stream-it .si-title{color:var(--text,#f4f4f2)}
    [data-theme="dark"] #stream-it .si-lede,[data-theme="crimson"] #stream-it .si-lede,
    [data-theme="grey"] #stream-it .si-lede,[data-theme="stone"] #stream-it .si-lede{color:var(--text-dim,rgba(255,255,255,.7))}
    [data-theme="dark"] #stream-it .si-lede b,[data-theme="crimson"] #stream-it .si-lede b,
    [data-theme="grey"] #stream-it .si-lede b,[data-theme="stone"] #stream-it .si-lede b{color:var(--text,#f4f4f2)}
    [data-theme="dark"] #stream-it .si-steps strong,[data-theme="crimson"] #stream-it .si-steps strong,
    [data-theme="grey"] #stream-it .si-steps strong,[data-theme="stone"] #stream-it .si-steps strong{color:var(--text,#f4f4f2)}
    [data-theme="dark"] #stream-it .si-steps span,[data-theme="crimson"] #stream-it .si-steps span,
    [data-theme="grey"] #stream-it .si-steps span,[data-theme="stone"] #stream-it .si-steps span{color:var(--text-dim,rgba(255,255,255,.66))}
    [data-theme="dark"] #stream-it .si-steps li,[data-theme="crimson"] #stream-it .si-steps li,
    [data-theme="grey"] #stream-it .si-steps li,[data-theme="stone"] #stream-it .si-steps li{border-top-color:rgba(255,255,255,.14)}
    [data-theme="dark"] #stream-it .si-steps li:last-child,[data-theme="crimson"] #stream-it .si-steps li:last-child,
    [data-theme="grey"] #stream-it .si-steps li:last-child,[data-theme="stone"] #stream-it .si-steps li:last-child{border-bottom-color:rgba(255,255,255,.14)}
    [data-theme="dark"] #stream-it .si-plat,[data-theme="crimson"] #stream-it .si-plat,
    [data-theme="grey"] #stream-it .si-plat,[data-theme="stone"] #stream-it .si-plat{
      color:var(--text,#f4f4f2);border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.05)
    }
    [data-theme="dark"] #stream-it .si-cta--ghost,[data-theme="crimson"] #stream-it .si-cta--ghost,
    [data-theme="grey"] #stream-it .si-cta--ghost,[data-theme="stone"] #stream-it .si-cta--ghost{
      color:var(--text,#f4f4f2);border-color:rgba(255,255,255,.24)
    }
    [data-theme="dark"] #stream-it .si-note,[data-theme="crimson"] #stream-it .si-note,
    [data-theme="grey"] #stream-it .si-note,[data-theme="stone"] #stream-it .si-note{color:var(--text-dim,rgba(255,255,255,.6))}
    [data-theme="dark"] #stream-it .si-note a,[data-theme="crimson"] #stream-it .si-note a,
    [data-theme="grey"] #stream-it .si-note a,[data-theme="stone"] #stream-it .si-note a{color:#f87171;border-bottom-color:rgba(248,113,113,.34)}
    [data-theme="dark"] #stream-it .si-msg,[data-theme="crimson"] #stream-it .si-msg,
    [data-theme="grey"] #stream-it .si-msg,[data-theme="stone"] #stream-it .si-msg{
      color:var(--text-dim,rgba(255,255,255,.76));border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.05)
    }
    [data-theme="dark"] #stream-it .si-chat-cap,[data-theme="crimson"] #stream-it .si-chat-cap,
    [data-theme="grey"] #stream-it .si-chat-cap,[data-theme="stone"] #stream-it .si-chat-cap{color:var(--text-dim,rgba(255,255,255,.56))}
  </style>
  <div class="si-wrap">
    <div class="si-copy">
      <p class="si-eyebrow"><i aria-hidden="true"></i>For streamers and creators</p>
      <h2 class="si-title">Your chat already argues. <em>Give it a verdict.</em></h2>
      <p class="si-lede">Point the room judge at your stream. It delivers a real decision when the round ends. <b>Half your chat will disagree.</b></p>
      <ol class="si-steps">
        <li><b>01</b><div><strong>Open the judge in a tab</strong><span>Pick Twitch, YouTube, or anywhere else you broadcast. Nothing to install.</span></div></li>
        <li><b>02</b><div><strong>Share that tab, with audio</strong><span>Browser capture feeds the judge the round. Ask it for a live read whenever the debate turns.</span></div></li>
        <li><b>03</b><div><strong>Put the decision on screen</strong><span>Winner, scores out of 100, and a written reason your chat can spend the next ten minutes fighting about.</span></div></li>
      </ol>
      <div class="si-plats">
        <a class="si-plat" href="/plugins/twitch" data-si="twitch"><svg viewBox="0 0 2400 2800" aria-hidden="true" fill-rule="evenodd"><path d="M500 0L0 500v1800h600v500l500-500h400l900-900V0H500zm1700 1300l-400 400h-400l-350 350v-350H600V200h1600v1100zM1700 550h200v600h-200zM1150 550h200v600h-200z"/></svg>Twitch panel</a>
        <a class="si-plat" href="/room-judge?platform=youtube&amp;source=screen" data-si="youtube"><svg class="si-yt" viewBox="0 0 576 512" aria-hidden="true"><path d="M549.7 124.1c-6.3-23.7-24.8-42.3-48.3-48.6C458.8 64 288 64 288 64S117.2 64 74.6 75.5c-23.5 6.3-42 24.9-48.3 48.6C15 167 15 256 15 256s0 89 11.3 131.9c6.3 23.7 24.8 41.5 48.3 47.8C117.2 448 288 448 288 448s170.8 0 213.4-11.5c23.5-6.3 42-24.1 48.3-47.8C561 345 561 256 561 256s0-89-11.3-131.9zM232.1 337.6V174.4L377.2 256l-145.1 81.6z"/></svg>YouTube</a>
        <a class="si-plat" href="/room-judge" data-si="any">Anywhere else</a>
      </div>
      <div class="si-actions">
        <a class="si-cta si-cta--primary" href="/room-judge" data-si="setup" data-cta="stream-band-setup">Set up the stream judge <span aria-hidden="true">&rarr;</span></a>
        <a class="si-cta si-cta--ghost" href="/plugins/twitch" data-si="howto" data-cta="stream-band-howto">Twitch setup</a>
        <a class="si-cta si-cta--ghost" href="/watch" data-si="watch" data-cta="stream-band-watch">Watch streams and replays</a>
      </div>
      <p class="si-note">Chat tells the judge where the room was persuaded or lost. <span data-plain="It never decides who won; the verdict comes from the arguments alone.">It never decides who won; the decision comes from the arguments.</span> Runs as a panel or overlay URL today. Want a bracket instead? <a href="#creator-sweepstakes">Creator tournaments</a>.</p>
    </div>

    <div class="si-demo">
      <div class="si-frame">
        <div class="si-frame-top">
          <span class="si-live"><i aria-hidden="true"></i>Live</span>
          <span class="si-mock">Example overlay</span>
        </div>
        <p class="si-motion"><b>The motion</b>Social media has done more harm than good.</p>
        <aside class="si-judge">
          <p class="si-judge-k"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.6 3.6L17 7l-3.4 1.4L12 12l-1.6-3.6L7 7l3.4-1.4L12 2zm7 9l1 2.2 2.2 1-2.2 1L19 22l-1-2.2-2.2-1 2.2-1L19 11zM5 13l1 2.2L8.2 16 6 17l-1 2.2L4 17l-2.2-1L4 15.2 5 13z"/></svg>AI judge</p>
          <p class="si-judge-read">Con conceded the structural framing and never came back to it. That is the round.</p>
          <div class="si-judge-pts">
            <div class="si-pt"><b>Pro</b><span>28</span></div>
            <div class="si-pt si-pt--loss"><b>Con</b><span>26</span></div>
          </div>
        </aside>
        <div class="si-seats">
          <div class="si-seat si-seat--speaking"><span class="si-seat-k">Speaking</span><span class="si-seat-n">Pro</span></div>
          <div class="si-seat"><span class="si-seat-k">Next</span><span class="si-seat-n">Con</span></div>
        </div>
      </div>
      <div class="si-chat">
        <span class="si-msg">judge is cooked</span>
        <span class="si-msg">that extension was clean though</span>
        <span class="si-msg">read the flow again</span>
        <p class="si-chat-cap">The disagreement is the point. Chat argues with the decision, not with you.</p>
      </div>
    </div>
  </div>
  <script>
    (function(){
      document.querySelectorAll('#stream-it [data-si]').forEach(function(a){
        a.addEventListener('click', function(){
          try{ if(window.dosTrack) dosTrack('stream_band_click',{target:a.getAttribute('data-si')}); }catch(e){}
        });
      });
    })();
  </script>
</section>
````

## Homepage section {'id': 'creator-sweepstakes', 'class': 'creator-sweep', 'aria-label': 'Streamer tournaments'}

````html
<section id="creator-sweepstakes" class="creator-sweep" aria-label="Streamer tournaments">
  <style>
    /* Dark by default (2026-08-10): this whole promotion used to force
       the cream/white "editorial" palette regardless of site theme —
       the "Streamers versus everyone" island that broke dark mode into
       a patchwork. Base rules below now paint the warm-dark palette the
       rest of the page uses in dark/grey/crimson/stone; a single
       [data-theme="light"] block near the end of this style tag pins
       every value back to the original cream treatment so light-theme
       visitors see zero change. */
    .creator-sweep{
      padding:clamp(42px,5.5vw,78px) var(--mid-gutter,20px) clamp(36px,3.5vw,54px);
      background:
        radial-gradient(760px 360px at 91% 8%,rgba(239,68,68,.16),transparent 66%),
        linear-gradient(180deg,#1c1a19 0%,#161413 100%);
      color:#f5efe7;overflow:hidden
    }
    .cs-wrap{
      width:100%;max-width:var(--mid-w,1180px);margin:0 auto;
      display:grid;grid-template-columns:minmax(0,.92fr) minmax(360px,1.08fr);
      gap:clamp(32px,6vw,86px);align-items:center
    }
    .cs-eyebrow{
      display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;
      font-family:var(--font-body);font-size:.64rem;
      font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#fca5a5
    }
    .cs-eyebrow i{width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 5px rgba(239,68,68,.15)}
    .cs-title{
      margin:0;font-family:var(--font-display);
      font-size:clamp(2.35rem,4.5vw,4.35rem);font-weight:750;
      letter-spacing:-.045em;line-height:.94;color:#f5efe7
    }
    .cs-title em{display:block;font-style:normal;color:#ef4444}
    .cs-lede{
      max-width:50ch;margin:18px 0 0;font-size:clamp(.98rem,1.2vw,1.08rem);
      line-height:1.58;color:rgba(245,239,231,.72)
    }
    .cs-lede b{color:#f5efe7;font-weight:750}
    .cs-points{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0;padding:0;list-style:none}
    .cs-points li{
      padding:7px 11px;border:1px solid rgba(245,239,231,.16);border-radius:999px;
      background:rgba(245,239,231,.07);font-family:var(--font-body);
      font-size:.69rem;font-weight:750;color:rgba(245,239,231,.78)
    }
    .cs-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:24px}
    .cs-cta{
      display:inline-flex;align-items:center;gap:10px;padding:13px 20px;border-radius:10px;
      background:#dc2626;color:#fff;font-family:var(--font-body);
      font-size:.86rem;font-weight:850;text-decoration:none;
      box-shadow:0 12px 30px rgba(239,68,68,.24);transition:transform .16s,background .16s
    }
    .cs-cta:hover{background:#b91c1c;transform:translateY(-2px)}
    .cs-legal{
      display:block;max-width:54ch;margin-top:13px;font-family:var(--font-body);
      font-size:.64rem;line-height:1.5;color:rgba(245,239,231,.68)
    }
    .cs-poster{
      position:relative;min-height:390px;padding:24px;border:1px solid rgba(245,239,231,.13);
      border-radius:24px;background:
        radial-gradient(520px 260px at 100% 0,rgba(239,68,68,.1),transparent 68%),
        #221f1e;
      box-shadow:0 26px 70px rgba(0,0,0,.45);isolation:isolate
    }
    .cs-poster:before{
      content:"";position:absolute;inset:12px;border:1px solid rgba(245,239,231,.08);
      border-radius:17px;pointer-events:none
    }
    .cs-world{
      position:relative;z-index:1;height:clamp(190px,22vw,250px);margin:-24px -24px 22px;
      overflow:hidden;border-radius:24px 24px 14px 14px;background:#141010
    }
    .cs-world:after{
      content:"";position:absolute;inset:0;
      background:linear-gradient(180deg,rgba(10,8,8,.04) 25%,rgba(10,8,8,.9) 100%);
      pointer-events:none
    }
    .cs-world img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 34%}
    .cs-world figcaption{
      position:absolute;z-index:1;left:20px;right:20px;bottom:17px;display:flex;
      align-items:flex-end;justify-content:space-between;gap:16px;color:#fff
    }
    .cs-world figcaption span{
      font-family:var(--font-body);font-size:.54rem;font-weight:900;
      letter-spacing:.13em;text-transform:uppercase;color:#fca5a5
    }
    .cs-world figcaption b{
      max-width:13ch;text-align:right;font-family:var(--font-display);
      font-size:1.2rem;line-height:1.02;letter-spacing:-.015em
    }
    .cs-poster-top{
      position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;
      gap:12px;font-family:var(--font-body)
    }
    .cs-live{
      display:inline-flex;align-items:center;gap:7px;font-size:.62rem;font-weight:900;
      letter-spacing:.12em;text-transform:uppercase;color:#f5efe7
    }
    .cs-live i{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:csPulse 1.6s ease-in-out infinite}
    @keyframes csPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(239,68,68,.45)}50%{opacity:.65;box-shadow:0 0 0 6px rgba(239,68,68,0)}}
    .cs-drop{font-size:.62rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:rgba(245,239,231,.68)}
    .cs-match{
      position:relative;z-index:1;display:grid;grid-template-columns:1fr 48px 1fr;
      gap:12px;align-items:center;margin:34px 0 0
    }
    .cs-seat{
      min-height:250px;padding:18px;border:1px solid rgba(245,239,231,.13);border-radius:16px;
      background:#282523;display:flex;flex-direction:column;justify-content:space-between
    }
    .cs-seat--creator{background:linear-gradient(155deg,#282523,#221f1e)}
    .cs-seat--you{border-color:rgba(239,68,68,.42);background:linear-gradient(155deg,#2a201e,#221f1e 66%)}
    .cs-seat-k{font-family:var(--font-body);font-size:.58rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:rgba(245,239,231,.68)}
    /* 2x2 since the fourth creator (2026-08-12). The column here is only ~215px, so 4-up gave 48px cells holding 88px avatars: images overflowed their cell and every label truncated. */
    .cs-creators{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 7px;margin:13px -8px 10px}
    .cs-creator{min-width:0;color:#f5efe7;text-align:center;text-decoration:none}
    .cs-creator img{
      display:block;width:82px;height:82px;margin:0 auto 8px;border-radius:50%;
      object-fit:cover;border:3px solid #2e2b29;outline:1px solid rgba(245,239,231,.14);
      box-shadow:0 7px 18px rgba(0,0,0,.35);transition:transform .16s,box-shadow .16s
    }
    .cs-creator--hasan img{object-position:50% 28%}
    .cs-creator--xqc img{object-position:50% 30%}
    .cs-creator--poki img{object-position:50% 20%}
    .cs-creator--candace img{object-position:50% 18%}
    .cs-creator span{display:block;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-body);font-size:.58rem;font-weight:800;white-space:nowrap}
    .cs-creator:hover img{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.45)}
    .cs-avatar{
      width:74px;height:74px;border-radius:50%;display:grid;place-items:center;margin:12px auto;
      border:1px solid rgba(245,239,231,.16);background:rgba(245,239,231,.06);color:#f5efe7;
      font-family:var(--font-body);font-size:2rem;font-weight:800
    }
    .cs-seat--you .cs-avatar{border-color:#ef4444;color:#f87171;background:rgba(239,68,68,.1)}
    .cs-seat-name{text-align:center;font-family:var(--font-body);font-size:1.13rem;font-weight:750;color:#f5efe7}
    .cs-seat-sub{text-align:center;margin-top:4px;font-family:var(--font-body);font-size:.64rem;font-weight:650;color:rgba(245,239,231,.68)}
    .cs-vs{font-family:var(--font-body);font-size:1.05rem;font-weight:800;color:#f87171;text-align:center}
    .cs-unconfirmed{
      position:relative;z-index:1;margin:16px 0 0;text-align:center;
      font-family:var(--font-body);font-size:.58rem;
      font-weight:650;line-height:1.45;color:rgba(245,239,231,.68)
    }
    .cs-poster-foot{
      position:relative;z-index:1;display:flex;justify-content:space-between;gap:16px;
      margin-top:16px;padding-top:16px;border-top:1px solid rgba(245,239,231,.14);
      font-family:var(--font-body);font-size:.67rem;font-weight:750;
      color:rgba(245,239,231,.68)
    }
    .cs-poster-foot b{color:#f5efe7}
    .cs-photo-credit{
      position:relative;z-index:1;margin:11px 0 0;text-align:center;
      font-family:var(--font-body);font-size:.52rem;
      line-height:1.45;color:rgba(245,239,231,.68)
    }
    .cs-photo-credit a{color:inherit;text-underline-offset:2px}
    /* The full watchlist (2026-08-24, "celebrity / streamers filled in"): the
       matchup card above shows one example draw; this strip shows everyone the
       board could aim a round at. Every portrait is Creative Commons or public
       domain, credited below and in /img/creator-watchlist/README.md. Same bar
       as the four in the card: labeled speculative, never captioned with a
       record, a score, or a scheduled round. */
    .cs-watchlist{width:100%;max-width:var(--mid-w,1180px);margin:clamp(30px,4vw,52px) auto 0}
    .cs-watch-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin-bottom:4px}
    .cs-watch-k{font-family:var(--font-body);font-size:.62rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#fca5a5}
    .cs-watch-head p{margin:0;font-family:var(--font-body);font-size:.8rem;font-weight:600;line-height:1.4;color:rgba(245,239,231,.72)}
    .cs-watch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:16px 10px;margin:16px 0 12px;padding:0;list-style:none;align-items:start}
    .cs-watch-face{min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;color:#f5efe7}
    .cs-watch-face img{width:72px;height:72px;border-radius:50%;object-fit:cover;object-position:50% 26%;border:3px solid #2e2b29;outline:1px solid rgba(245,239,231,.14);box-shadow:0 7px 18px rgba(0,0,0,.32)}
    .cs-watch-face span{max-width:100%;font-family:var(--font-body);font-size:.6rem;font-weight:800;line-height:1.18;text-align:center;overflow-wrap:break-word}
    .cs-watch-credit{margin:2px 0 0;font-family:var(--font-body);font-size:.52rem;line-height:1.45;color:rgba(245,239,231,.58)}
    [data-theme="light"] .cs-watch-k{color:#b91c1c}
    [data-theme="light"] .cs-watch-head p{color:#4b5563}
    [data-theme="light"] .cs-watch-face{color:#1a1a1f}
    [data-theme="light"] .cs-watch-face img{border-color:#fff;outline-color:rgba(0,0,0,.12)}
    [data-theme="light"] .cs-watch-credit{color:#6b7280}
    .cs-motion-strip{
      width:100%;max-width:var(--mid-w,1180px);margin:clamp(34px,4.5vw,58px) auto 0;
      padding-top:20px;border-top:1px solid rgba(245,239,231,.14)
    }
    .cs-motion-head{
      display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:12px;
      font-family:var(--font-body)
    }
    .cs-motion-head-copy{min-width:0}
    .cs-motion-head h3{
      margin:0;font-size:.72rem;font-weight:900;letter-spacing:.15em;
      text-transform:uppercase;color:#fca5a5
    }
    .cs-motion-head p{
      margin:5px 0 0;font-size:.72rem;font-weight:600;line-height:1.4;
      color:rgba(245,239,231,.68)
    }
    .cs-motion-head a{font-size:.7rem;font-weight:750;color:rgba(245,239,231,.68);text-underline-offset:3px}
    .cs-motions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .cs-motion{
      min-width:0;min-height:286px;overflow:hidden;border:1px solid rgba(245,239,231,.12);
      border-radius:17px;background:#221f1e;display:flex;flex-direction:column;
      box-shadow:0 14px 34px -28px rgba(0,0,0,.6);
      transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease
    }
    .cs-motion:hover{
      transform:translateY(-3px);border-color:rgba(239,68,68,.32);
      box-shadow:0 22px 46px -28px rgba(0,0,0,.7)
    }
    .cs-motion-media{
      position:relative;height:138px;flex:none;overflow:hidden;margin:0;background:#2e2a27
    }
    .cs-motion-media:after{
      content:"";position:absolute;inset:0;
      background:linear-gradient(180deg,rgba(15,12,11,.04) 35%,rgba(15,12,11,.52) 100%);
      pointer-events:none
    }
    .cs-motion-media img{
      display:block;width:100%;height:100%;object-fit:cover;
      filter:saturate(.9) contrast(1.03);transition:transform .45s cubic-bezier(.2,.75,.2,1)
    }
    .cs-motion:hover .cs-motion-media img{transform:scale(1.045)}
    .cs-motion--schools .cs-motion-media img{object-position:50% 59%}
    .cs-motion--universities .cs-motion-media img{object-position:50% 50%;filter:contrast(1.08)}
    .cs-motion--speech .cs-motion-media img{object-position:50% 28%}
    .cs-motion--memory .cs-motion-media img{object-position:50% 48%}
    .cs-motion--rights .cs-motion-media img{object-position:50% 48%;filter:grayscale(.12) contrast(1.06)}
    .cs-motion--youth .cs-motion-media img{object-position:50% 43%}
    .cs-motion-copy{
      display:flex;flex:1;flex-direction:column;padding:15px 16px 16px
    }
    .cs-motion-k{
      position:absolute;z-index:1;left:11px;top:11px;display:inline-flex;margin:0;padding:7px 9px;
      border:1px solid rgba(255,255,255,.26);border-radius:999px;background:rgba(18,15,14,.74);
      backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      font-family:var(--font-body);font-size:.52rem;font-weight:900;
      letter-spacing:.12em;text-transform:uppercase;color:#fff
    }
    .cs-motion q{
      display:block;font-family:var(--font-body);font-size:1rem;font-weight:720;
      line-height:1.23;color:#f5efe7
    }
    .cs-motion q:before,.cs-motion q:after{color:#ef4444}
    .cs-motion i{
      display:block;margin-top:auto;padding-top:11px;font-family:var(--font-body);
      font-size:.59rem;font-weight:650;font-style:normal;line-height:1.35;color:rgba(245,239,231,.68)
    }
    .cs-motion i b{
      margin-right:5px;font-size:.5rem;font-weight:900;letter-spacing:.1em;
      text-transform:uppercase;color:#f87171
    }
    .cs-motion-credits{
      margin-top:15px;font-family:var(--font-body);
      font-size:.56rem;line-height:1.55;color:rgba(245,239,231,.68)
    }
    .cs-motion-credits summary{
      width:max-content;cursor:pointer;font-weight:750;text-decoration:underline;
      text-decoration-thickness:1px;text-underline-offset:3px
    }
    .cs-motion-credits p{max-width:112ch;margin:7px 0 0}
    .cs-motion-credits a{color:inherit;text-underline-offset:2px}
    .cs-motion-credits a:hover{color:#fca5a5}

    /* [data-theme="light"] pin-back: restores the original cream/white
       "editorial promo" treatment exactly as authored, unchanged for
       anyone on the light theme. */
    [data-theme="light"] .creator-sweep{
      background:
        radial-gradient(760px 360px at 91% 8%,rgba(239,68,68,.13),transparent 66%),
        linear-gradient(180deg,#fbf8f2 0%,#f5efe6 100%);
      color:#1a1a1f
    }
    [data-theme="light"] .cs-eyebrow{color:#c53030}
    [data-theme="light"] .cs-title,
    [data-theme="light"] .creator-sweep .cs-title{color:#1a1a1f}
    [data-theme="light"] .cs-title em,
    [data-theme="light"] .creator-sweep .cs-title em{color:#ef4444}
    [data-theme="light"] .cs-lede,
    [data-theme="light"] .creator-sweep .cs-lede{color:rgba(26,26,31,.68)}
    [data-theme="light"] .cs-lede b,
    [data-theme="light"] .creator-sweep .cs-lede b,
    [data-theme="light"] .creator-sweep .cs-lede strong{color:#1a1a1f}
    [data-theme="light"] .cs-points li{background:rgba(255,255,255,.66);color:rgba(26,26,31,.72);border-color:rgba(26,26,31,.13)}
    [data-theme="light"] .cs-legal,
    [data-theme="light"] .creator-sweep .cs-legal{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-poster{
      border-color:rgba(26,26,31,.11);
      background:radial-gradient(520px 260px at 100% 0,rgba(239,68,68,.09),transparent 68%),#fffdf9;
      box-shadow:0 26px 70px rgba(80,42,28,.14)
    }
    [data-theme="light"] .cs-poster:before{border-color:rgba(26,26,31,.065)}
    [data-theme="light"] .cs-live{color:#1a1a1f}
    [data-theme="light"] .cs-drop{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-seat{background:#fff;border-color:rgba(26,26,31,.11)}
    [data-theme="light"] .cs-seat--creator{background:linear-gradient(155deg,#fff,#f9f3eb)}
    [data-theme="light"] .cs-seat--you{background:linear-gradient(155deg,#fff8f6,#fff 66%)}
    [data-theme="light"] .cs-seat-k{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-creator{color:#1a1a1f}
    [data-theme="light"] .cs-creator img{border-color:#fff;outline-color:rgba(26,26,31,.13);box-shadow:0 7px 18px rgba(26,26,31,.14)}
    [data-theme="light"] .cs-creator:hover img{box-shadow:0 10px 22px rgba(26,26,31,.2)}
    [data-theme="light"] .cs-avatar{border-color:rgba(26,26,31,.12);background:#f7f2eb;color:#1a1a1f}
    [data-theme="light"] .cs-seat--you .cs-avatar{border-color:#ef4444;color:#ef4444;background:rgba(239,68,68,.08)}
    [data-theme="light"] .cs-seat-name{color:#1a1a1f}
    [data-theme="light"] .cs-seat-sub{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-vs{color:#dc2626}
    [data-theme="light"] .cs-unconfirmed{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-poster-foot{border-top-color:rgba(26,26,31,.1);color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-poster-foot b{color:#1a1a1f}
    [data-theme="light"] .cs-photo-credit{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-motion-strip{border-top-color:rgba(26,26,31,.11)}
    [data-theme="light"] .cs-motion-head h3{color:#c53030}
    [data-theme="light"] .cs-motion-head p{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-motion-head a{color:rgba(26,26,31,.68)}
    [data-theme="light"] .cs-motion{background:#fff;border-color:rgba(26,26,31,.1);box-shadow:0 14px 34px -28px rgba(56,36,24,.52)}
    [data-theme="light"] .cs-motion:hover{border-color:rgba(239,68,68,.28);box-shadow:0 22px 46px -28px rgba(56,36,24,.58)}
    [data-theme="light"] .cs-motion-media{background:#e6dfd6}
    [data-theme="light"] .cs-motion q{color:#1a1a1f}
    [data-theme="light"] .cs-motion i{color:rgba(26,26,31,.64)}
    [data-theme="light"] .cs-motion i b{color:#dc2626}
    [data-theme="light"] .cs-motion-credits{color:rgba(26,26,31,.72)}
    [data-theme="light"] .cs-motion-credits a:hover{color:#b91c1c}
    @media(prefers-reduced-motion:reduce){
      .cs-motion,.cs-motion-media img{transition:none}
      .cs-motion:hover{transform:none}
    }
    @media(max-width:880px){
      .cs-wrap{grid-template-columns:1fr;max-width:680px}
      .cs-poster{min-height:0}
      .cs-motion-strip{max-width:680px}
      .cs-motions{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:520px){
      .creator-sweep{padding-left:18px;padding-right:18px}
      .cs-title{font-size:clamp(2.35rem,13vw,3.25rem)}
      .cs-poster{padding:18px}
      .cs-world{height:190px;margin:-18px -18px 20px}
      .cs-world figcaption{left:15px;right:15px;bottom:14px}
      .cs-match{grid-template-columns:1fr;gap:10px;margin-top:28px}
      .cs-seat{min-height:204px;padding:14px 12px}
      .cs-creators{margin-left:0;margin-right:0}
      .cs-creator img{width:72px;height:72px}
      .cs-vs{line-height:1}
      .cs-avatar{width:58px;height:58px;font-size:1.55rem}
      .cs-poster-foot{flex-direction:column;gap:5px}
      .cs-motion-head{align-items:flex-start;flex-direction:column;gap:8px}
      .cs-motions{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
      .cs-motion{flex:0 0 86%;min-height:298px;scroll-snap-align:start}
      .cs-motion-media{height:148px}
    }
    @media(prefers-reduced-motion:reduce){.cs-live i{animation:none}.cs-cta,.cs-creator img{transition:none}}
  </style>
  <div class="cs-wrap">
    <div class="cs-copy">
      <span class="cs-eyebrow"><i aria-hidden="true"></i>Creator tournaments · online</span>
      <h2 class="cs-title">Streamers versus <em>everyone.</em></h2>
      <p class="cs-lede">Creators bring the audience. <b>You bring the case.</b> Clear the prelims, earn the live matchup.</p>
      <ul class="cs-points" aria-label="Tournament features">
        <li>Open community entry</li>
        <li>AI-seeded prelims</li>
        <li>Human elimination rounds</li>
      </ul>
      <div class="cs-actions">
        <a class="cs-cta" href="/tournaments#creator-sweepstakes">See tournament drops <span aria-hidden="true">→</span></a>
      </div>
      <small class="cs-legal">No purchase necessary. Eligibility, prizes, entry periods, and official rules vary by event. Void where prohibited.</small>
    </div>
    <div class="cs-poster">
      <figure class="cs-world">
        <img src="/img/landing/streamers-and-everyone.jpg"
          alt="A large crowd fills the TwitchCon 2019 convention floor"
          loading="lazy" decoding="async">
        <figcaption>
          <span>The creator seeds it</span>
          <b>Everyone else makes it matter.</b>
        </figcaption>
      </figure>
      <div class="cs-poster-top">
        <span class="cs-live"><i></i>Live tournaments</span>
        <span class="cs-drop">Dream matchup board</span>
      </div>
      <div class="cs-match">
        <div class="cs-seat cs-seat--creator">
          <span class="cs-seat-k">Dream creator draw</span>
          <div class="cs-creators" aria-label="Example creator matchups">
            <a class="cs-creator cs-creator--hasan" href="https://www.twitch.tv/hasanabi" target="_blank" rel="noopener noreferrer">
              <img src="/img/creator-watchlist/hasanabi.jpg" alt="HasanAbi" loading="lazy" decoding="async">
              <span>HasanAbi</span>
            </a>
            <a class="cs-creator cs-creator--xqc" href="https://www.twitch.tv/xqc" target="_blank" rel="noopener noreferrer">
              <img src="/img/creator-watchlist/xqc.jpg" alt="xQc" loading="lazy" decoding="async">
              <span>xQc</span>
            </a>
            <a class="cs-creator cs-creator--poki" href="https://www.twitch.tv/pokimane" target="_blank" rel="noopener noreferrer">
              <img src="/img/creator-watchlist/pokimane.jpg" alt="Pokimane" loading="lazy" decoding="async">
              <span>Pokimane</span>
            </a>
            <a class="cs-creator cs-creator--candace" href="https://www.youtube.com/@RealCandaceO" target="_blank" rel="noopener noreferrer">
              <img src="/img/creator-watchlist/candaceowens.jpg" alt="Candace Owens" loading="lazy" decoding="async">
              <span>Candace Owens</span>
            </a>
          </div>
          <span class="cs-seat-name">Who should take the seat?</span>
          <span class="cs-seat-sub">Creator side</span>
        </div>
        <span class="cs-vs">vs.</span>
        <div class="cs-seat cs-seat--you">
          <span class="cs-seat-k">Open seat</span>
          <span class="cs-avatar">?</span>
          <span class="cs-seat-name">You, maybe</span>
          <span class="cs-seat-sub">Community side</span>
        </div>
      </div>
      <p class="cs-unconfirmed">Dream matchups only. No creator pictured is confirmed, affiliated, or endorsing this tournament.</p>
      <div class="cs-poster-foot">
        <span><b>One bracket.</b> Anyone can enter.</span>
        <span>Final streamed live.</span>
      </div>
      <p class="cs-photo-credit">
        Photos:
        <a href="https://commons.wikimedia.org/wiki/File:TwitchCon_(48824079248).jpg" target="_blank" rel="noopener noreferrer">TwitchCon 2019, Dale Cruse, CC BY 2.0</a>;
        <a href="https://commons.wikimedia.org/wiki/File:HasanStLouis-20260501-234558761_(cropped).jpg" target="_blank" rel="noopener noreferrer">HasanAbi, Poisonwithahawkseye, CC BY 4.0</a>;
        <a href="https://commons.wikimedia.org/wiki/File:XQc_July_4_2023.jpg" target="_blank" rel="noopener noreferrer">xQc, Esfand, CC BY 3.0</a>;
        <a href="https://commons.wikimedia.org/wiki/File:Pokimane_at_the_Creator_Economy_Caucus_launch,_2025.jpg" target="_blank" rel="noopener noreferrer">Pokimane, U.S. Congress, public domain</a>.
      </p>
    </div>
  </div>
  <div class="cs-watchlist">
    <div class="cs-watch-head">
      <span class="cs-watch-k">The watchlist</span>
      <p>Everyone the board could aim a round at. None confirmed, none affiliated, none endorsing.</p>
    </div>
    <ul class="cs-watch-grid" aria-label="Creator watchlist">
      <li class="cs-watch-face"><img src="/img/creator-watchlist/mrbeast.jpg" alt="MrBeast" loading="lazy" decoding="async"><span>MrBeast</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/ishowspeed.jpg" alt="IShowSpeed" loading="lazy" decoding="async"><span>IShowSpeed</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/kaicenat.jpg" alt="Kai Cenat" loading="lazy" decoding="async"><span>Kai Cenat</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/hasanabi.jpg" alt="HasanAbi" loading="lazy" decoding="async"><span>HasanAbi</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/xqc.jpg" alt="xQc" loading="lazy" decoding="async"><span>xQc</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/pokimane.jpg" alt="Pokimane" loading="lazy" decoding="async"><span>Pokimane</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/ludwig.jpg" alt="Ludwig" loading="lazy" decoding="async"><span>Ludwig</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/asmongold.jpg" alt="Asmongold" loading="lazy" decoding="async"><span>Asmongold</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/destiny.jpg" alt="Destiny" loading="lazy" decoding="async"><span>Destiny</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/joerogan.jpg" alt="Joe Rogan" loading="lazy" decoding="async"><span>Joe Rogan</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/lexfridman.jpg" alt="Lex Fridman" loading="lazy" decoding="async"><span>Lex Fridman</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/jordanpeterson.jpg" alt="Jordan Peterson" loading="lazy" decoding="async"><span>Jordan Peterson</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/benshapiro.jpg" alt="Ben Shapiro" loading="lazy" decoding="async"><span>Ben Shapiro</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/candaceowens.jpg" alt="Candace Owens" loading="lazy" decoding="async"><span>Candace Owens</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/anakasparian.jpg" alt="Ana Kasparian" loading="lazy" decoding="async"><span>Ana Kasparian</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/mehdihasan.jpg" alt="Mehdi Hasan" loading="lazy" decoding="async"><span>Mehdi Hasan</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/contrapoints.jpg" alt="ContraPoints" loading="lazy" decoding="async"><span>ContraPoints</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/douglasmurray.jpg" alt="Douglas Murray" loading="lazy" decoding="async"><span>Douglas Murray</span></li>
      <li class="cs-watch-face"><img src="/img/creator-watchlist/konstantinkisin.jpg" alt="Konstantin Kisin" loading="lazy" decoding="async"><span>Konstantin Kisin</span></li>
    </ul>
    <p class="cs-watch-credit">Portraits, all Creative Commons or public domain via Wikimedia Commons: MrBeast (Steven Khan, CC BY 4.0); IShowSpeed (Diego Serrano, CC BY 2.0); Kai Cenat (Million Dollaz Worth of Game, CC BY 3.0); HasanAbi (Poisonwithahawkseye, CC BY 4.0); xQc (Esfand, CC BY 3.0); Pokimane (U.S. Congress, public domain); Ludwig (State Farm, CC BY 2.0); Asmongold (Esfand, CC BY 3.0); Destiny (Brittany Simon, CC BY 3.0); Joe Rogan (The White House, public domain); Lex Fridman (lexfridman, CC0); Jordan Peterson (Gage Skidmore, CC BY-SA 3.0); Ben Shapiro (Gage Skidmore, CC BY-SA 2.0); Candace Owens (Gage Skidmore, CC BY-SA 2.0); Ana Kasparian (Gage Skidmore, CC BY-SA 2.0); Mehdi Hasan (Policy Exchange, CC BY 2.0); ContraPoints (Natalie Wynn, CC BY-SA 4.0); Douglas Murray (AndyCNgo, CC BY-SA 4.0); Konstantin Kisin (Triggernometrypod, CC BY-SA 4.0).</p>
  </div>
  <section class="cs-motion-strip" aria-labelledby="hot-debate-topics">
    <div class="cs-motion-head">
      <div class="cs-motion-head-copy">
        <h3 id="hot-debate-topics">Hot debate topics</h3>
        <p>Current motions across education, free speech, technology, rights, and public life.</p>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:flex-end">
        <a href="/topics/">Explore 150+ current debate topics →</a>
        <a href="/debate-topic-generator">Generate a topic →</a>
      </div>
    </div>
    <div class="cs-motions">
      <article class="cs-motion cs-motion--schools">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/schools.jpg"
            alt="An empty high-school classroom with desks, computers, and a whiteboard"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Schools</span>
        </figure>
        <div class="cs-motion-copy">
          <!-- 2026-09-09: the motion in this slot asked a room to decide how a
               school should treat one group of children. That is the shape the
               08-19 exclusion rules out, contested rather than targeted, and it
               was the FIRST card in the strip. Replaced with a schools motion
               that keeps the category, the photograph and the real disagreement.
               The same motion was removed from the dormant hero bank above. -->
          <q>Schools should replace homework with supervised practice in class.</q>
          <i><b>Core clash</b> Equity vs. independence</i>
        </div>
      </article>
      <article class="cs-motion cs-motion--universities">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/universities.jpg"
            alt="Students gathered at a university protest over administrative policy"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Universities</span>
        </figure>
        <div class="cs-motion-copy">
          <q>Universities should remain neutral on political controversies.</q>
          <i><b>Core clash</b> Public trust vs. moral leadership</i>
        </div>
      </article>
      <article class="cs-motion cs-motion--speech">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/online-speech.jpg"
            alt="A smartphone home screen showing social media apps"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Online speech</span>
        </figure>
        <div class="cs-motion-copy">
          <q>Social platforms should ban anonymous political accounts.</q>
          <i><b>Core clash</b> Accountability vs. dissent</i>
        </div>
      </article>
      <!-- 2026-08-10, per the founder: "or post your own claim here" in the
           center of the topics strip. Full-row band between the two
           motion rows; routes to the async challenge board (/rounds),
           where "Start a challenge" is the composer. -->
      <style>
        .cs-claim{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          text-align:center;padding:clamp(26px,3.5vw,46px) 20px;
          border:1px dashed rgba(245,239,231,.28);border-radius:18px;background:rgba(245,239,231,.05)}
        [data-theme="light"] .cs-claim{border-color:rgba(26,26,31,.3);background:rgba(255,255,255,.55)}
        .cs-claim q{quotes:"\201C" "\201D";font-family:var(--font-display);
          font-size:clamp(1.5rem,2.5vw,2.2rem);font-weight:750;letter-spacing:-.02em;line-height:1.12;color:#f5efe7}
        [data-theme="light"] .cs-claim q{color:#1a1a1f}
        .cs-claim q:after{content:no-close-quote}
        .cs-claim q b{color:#f87171;font-weight:750}
        [data-theme="light"] .cs-claim q b{color:#dc2626}
        .cs-claim p{margin:10px 0 0;max-width:54ch;font-family:var(--font-body);
          font-size:.8rem;line-height:1.55;color:rgba(245,239,231,.68)}
        [data-theme="light"] .cs-claim p{color:rgba(26,26,31,.64)}
        .cs-claim .cs-cta{margin-top:18px}
      </style>
      <div class="cs-claim">
        <q>Or post <b>your own claim</b> here.</q>
        <p>Say it out loud, take a side, and a stranger takes the other one. The judge scores it like any round, and it lands on the open-challenge board until someone answers.</p>
        <a class="cs-cta" href="/rounds" data-cta="motions-post-claim">Post a claim <span aria-hidden="true">→</span></a>
      </div>
      <article class="cs-motion cs-motion--memory">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/public-memory.jpg"
            alt="Museum officials examining artifacts being returned to an Iraqi museum"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Public memory</span>
        </figure>
        <div class="cs-motion-copy">
          <q>Museums should return artifacts acquired under colonial rule.</q>
          <i><b>Core clash</b> Restitution vs. stewardship</i>
        </div>
      </article>
      <article class="cs-motion cs-motion--rights">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/online-speech.jpg"
            alt="A smartphone home screen showing modern technology apps"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Right to repair</span>
        </figure>
        <div class="cs-motion-copy">
          <q>Manufacturers should provide replacement parts and repair manuals.</q>
          <i><b>Core clash</b> Ownership vs. product safety</i>
        </div>
      </article>
      <article class="cs-motion cs-motion--youth">
        <figure class="cs-motion-media">
          <img src="/img/landing/topics/youth-technology.jpg"
            alt="A child using a smartphone at close range"
            loading="lazy" decoding="async">
          <span class="cs-motion-k">Youth and technology</span>
        </figure>
        <div class="cs-motion-copy">
          <q>Governments should ban social media for children under sixteen.</q>
          <i><b>Core clash</b> Child safety vs. family choice</i>
        </div>
      </article>
    </div>
    <details class="cs-motion-credits">
      <summary>Photo credits and licenses</summary>
      <p>
        <a href="https://commons.wikimedia.org/wiki/File:A_public_school,_high_school_classroom_in_the_United_States_01.jpg" target="_blank" rel="noopener noreferrer">Classroom, Harrison Keely, CC BY 4.0</a>;
        <a href="https://commons.wikimedia.org/wiki/File:Student_protest_UC_Berkeley.jpg" target="_blank" rel="noopener noreferrer">UC Berkeley protest, Dick Wheeler / The Daily Californian archives, MIT License</a>;
        <a href="https://commons.wikimedia.org/wiki/File:Social_media_apps.jpg" target="_blank" rel="noopener noreferrer">Social media apps, Theresepersonne, CC BY-SA 4.0</a>;
        <a href="https://commons.wikimedia.org/wiki/File:Ancient_artifacts_returned_to_Iraqis_DVIDS14820.jpg" target="_blank" rel="noopener noreferrer">Returned artifacts, Spc. Barbara Ospina / U.S. Army, public domain</a>;
        <a href="https://commons.wikimedia.org/wiki/File:Boysmartphone.jpg" target="_blank" rel="noopener noreferrer">Child with smartphone, Andi Graf, CC0</a>.
        Images are cropped for display.
      </p>
    </details>
  </section>
</section>
````

## Homepage section {'id': 'live-proof', 'class': 'live-proof', 'aria-label': 'Live round with an AI judge'}

````html
<section id="live-proof" class="live-proof" aria-label="Live round with an AI judge">
  <div class="live-proof-wrap">
    <div class="live-proof-header">
      <span class="live-proof-eyebrow"><span class="dot" aria-hidden="true"></span>Live round · AI judge</span>
      <!-- 2026-08-11: the headline now says out loud that the judge is a
           model, and the sub hands off to the trust strip below the
           ballot instead of asserting an audience vote this surface has
           no path for (see the 2026-07-20 truth boundary in soul.md). -->
      <h2 class="live-proof-headline" data-plain="An AI judge scores the whole round in seconds.">An AI judge decides the round in seconds.</h2>
      <p class="live-proof-sub" data-plain="Who won, a score out of 100 for each side, and the reasons, citing what was actually said. It is a model and not a person, so the four things below are how you check its work.">Who won, a score out of 100 for each side, and the reason for decision, citing what was actually said. It is a model and not a person, so the four things below are how you check its work.</p>
    </div>

    <div class="live-proof-frame">
      <a class="live-proof-video" href="/spar" aria-label="Open Live Debates and match with a real opponent">
        <span class="live-proof-badge">Live · 2 people</span>
        <!-- Real /live-round screenshot, cropped to the video panel.
             585x571 source; covers the panel and hides the CSS mockup
             behind it. If the asset ever 404s the onerror handler
             hides the img and the mockup shows through.
             2026-08-31: briefly recut to a spectated Lars Sawyer vs Ace
             round, then RESTORED the same evening to this original
             bookshelf-debater screenshot per the founder ("bring it
             back to what it was originally", soul.md decision log).
             The asset on disk IS the original; do not re-swap it on
             the strength of a stale recut note. -->

        <img src="/landing-shot-live.jpg" alt="Two people on a Debatable live round video call" loading="lazy" decoding="async" onerror="this.style.display='none'">
        <div class="lpv-mock" aria-hidden="true">
          <div class="lpv-topbar">
            <span class="lpv-brand"><span class="db-wordmark notranslate" translate="no" role="img" aria-label="Debatable"><span class="db-wordmark-base">Debat</span><span class="db-wordmark-accent">able</span></span> <span>· Live Round</span></span>
            <span class="lpv-ballotin">Decision in <span class="d1"></span><span class="d2"></span><span class="d3"></span></span>
          </div>
          <div class="lpv-pip">
            <div class="lpv-pip-avatar">AH</div>
            <div class="lpv-pip-name">You · Pro</div>
          </div>
          <div class="lpv-main">
            <div class="lpv-main-avatar">TC</div>
            <div class="lpv-main-name">Guest · Con</div>
          </div>
          <div class="lpv-controls">
            <span class="lpv-ctl">Mute</span>
            <span class="lpv-ctl">Cam</span>
            <span class="lpv-ctl lpv-ctl-leave">Leave</span>
          </div>
        </div>
      </a>

      <div class="live-proof-ballot">
        <div class="lpb-strip">
          <span class="lpb-strip-dots"><span class="d1"></span><span class="d2"></span><span class="d3"></span></span>
          <span>AI judge · Decision · Round 1</span>
          <span class="lpb-strip-back">← Back to board</span>
        </div>
        <div class="lpb-body">
          <div class="lpb-winner">
            <div class="lpb-winner-name">Pro wins</div>
            <div class="lpb-winner-sub">Social media has done more harm than good</div>
          </div>
          <div class="lpb-scores">
            <div class="lpb-score">
              <div class="lpb-score-name">Pro · You</div>
              <div class="lpb-score-num">88</div>
              <div class="lpb-score-lbl">Score out of 100</div>
            </div>
            <div class="lpb-score lpb-score--loss">
              <div class="lpb-score-name">Con · Guest</div>
              <div class="lpb-score-num">62</div>
              <div class="lpb-score-lbl">Score out of 100</div>
            </div>
          </div>
          <div class="lpb-rfd-h" data-audience-competitive="Reason for Decision" data-audience-plain="Why the judge decided this way">Reason for Decision</div>
          <div class="lpb-rfd">
            <p>The round turns on the contest between Pro's structural-harm framing and Con's network-value defense. Pro establishes three harms: measurable declines in adolescent mental health (NIH longitudinal data), algorithmic amplification of misinformation during election cycles, and the erosion of local community institutions as attention moves to platform feeds.</p>
            <p>Con responds with the network case: crisis coordination in Ukraine, Iran, and Hong Kong; cross-border reach for diaspora and minority communities; small-business marketing access that traditional media never offered to anyone without a budget.</p>
            <p>The judge weighs on three axes: reach, persistence, and counterfactual access. On reach, both sides land hits. On persistence, Pro wins clearly. Once attention infrastructure is captured, it doesn't return to local institutions. On counterfactual access, Con makes the strongest move of the round: the benefits have no real substitute (no print equivalent for a Tehran protestor), while many of the harms have substitutes (regulation, design changes, age-gating).</p>
            <p>Pro wins because the mitigations Con leans on don't exist yet and the harms compound while we wait. The verdict is narrow. Pro's framing of 'structural' was largely conceded by Con, which is the only reason this isn't closer.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- WHY TRUST IT (2026-08-11). The section said "AI judge" and then
         moved straight on, so the obvious next question went unanswered
         on the one screen where a visitor is looking at a verdict. Every
         claim here is a real, checkable property of the judge, not a
         reassurance: the panel, the rubric hash, the human appeal route
         and the fee policy all come from lib/judge-charter.mjs and are
         served live at /api/judge/charter. If any of those change, this
         copy is wrong and has to change with them. Full explainer lives
         at /judge-integrity; this is the four-line version. -->
    <div class="lp-trust">
      <p class="lp-trust-head">Why trust it</p>
      <div class="lp-trust-grid">
        <article class="lp-trust-card">
          <h3>Three models, not one.</h3>
          <p>Claude, GPT, and Gemini each judge the round separately. Two agreeing carries the round. An even split records no winner at all, because any rule for breaking a tie would be our rule.</p>
        </article>
        <article class="lp-trust-card">
          <h3>The scoring rules are published before you speak.</h3>
          <p>Every decision stamps a fingerprint of the exact criteria it was made under, so nobody gets judged by rules that were edited after the round.</p>
        </article>
        <article class="lp-trust-card">
          <h3>A person hears the appeal.</h3>
          <p>Either side can appeal within 72 hours on six stated grounds. A human reviewer decides it, never the model that made the call.</p>
        </article>
        <article class="lp-trust-card">
          <h3>We earn the same whoever wins.</h3>
          <p>No fee, no cut, no stake in the result. Nothing about what we make moves with a verdict, and the test suite blocks any commit that adds one.</p>
        </article>
      </div>
      <!-- 2026-08-22: the critique invitation, advertised rather than
           buried. The promise it links to (send a critique, the strong
           ones get the probe treatment and are published either way)
           lives at /judge-integrity#critiques; keep the two in step. -->
      <p class="lp-trust-critique">
        <b>Open to critiques.</b>
        <span>If you can build a round where the judge rewards the worse argument, we want it. The strongest critiques get run against the live panel, and the results are published whether they hold or not.</span>
        <a href="/judge-integrity#critiques" data-cta="trust-critiques">Try to break the judge</a>
      </p>
      <p class="lp-trust-foot">
        <span class="lp-trust-foot-links">
          <a href="/judge-integrity">Read the full criteria</a>
          <a href="/api/judge/charter">See the raw charter</a>
          <button type="button" class="lp-trust-foot-link" data-guide-open data-cta="trust-guide">Watch the walkthrough · 3 min</button>
        </span>
        <span class="lp-trust-foot-note">The criteria and charter are public and need no account. You can check for yourself that the criteria that judged a round are the ones on this page.</span>
      </p>
    </div>

    <!-- 2026-07-19: the redundant /live-round speech-panel screenshot
         was removed. The split panel above already carries the round. -->

    <!-- Explicit "where to actually do this" footer. The split panel above
         shows what a round looks like; this row tells the visitor that the
         board is live and lets them open it in one tap. Mirrors the
         primary/ghost pair on the /live hero so the on-ramp pattern is
         consistent across the two surfaces. -->
    <div class="live-proof-cta">
      <div class="live-proof-cta-row">
        <a class="live-proof-cta-btn" href="/spar">
          Match with a real opponent <span aria-hidden="true">→</span>
        </a>
        <a class="live-proof-cta-ghost" href="/live">
          Scheduled rounds <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  </div>
</section>
````

## Homepage section {'class': 'hero'}

````html
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-grain"></div>

  <div class="hero-content">


    <!-- ════════════════════════════════════════════════════════════════
         HERO A/B VARIANT — illustrated "global debate" scene (2026-05-26)
         ════════════════════════════════════════════════════════════════
         Sibling of .editorial-hero. The early-paint script in <head>
         sets html[data-hero-ab="illustrated"|"editorial"]; CSS toggles
         which arm renders. This block is the live arm: a layered
         live-debate-room scene with mode cards, an AI judge panel, and a two-seat room mock,
         with mouse parallax for depth. The status row below keeps
         real signals only. The editorial-hero block below stays
         intact for the control arm and for any returning visitor
         still pinned to it. -->
    <div class="hero-illustrated" data-hero-variant="illustrated">
      <div class="hi-head">
        <!-- 2026-07-22: the .hi-money currency field that floated around
             this slogan was removed per the founder; the words carry it now. -->
        <!-- 2026-07-18: site slogan per the founder.
             2026-07-22: "Take a side. / Speak live. Get judged." cut per
             the founder. The slogan carries the <h1> so the page keeps exactly
             one top-level heading. Kept through the ambassador restore:
             that revert was about the ambassador surfaces, not this. -->
        <!-- 2026-07-22: h1 -> p. The always-visible #first-screen band now
             carries the page's single h1 (.fs-h1); this slogan lives in an
             A/B hero arm, and two extra h1s in the HTML read as duplicate
             top-level headings to crawlers. Class selectors carry all the
             styling, so the tag swap is invisible. -->
        <!-- 2026-07-28: "Bet on your words" -> "Back your words" per the founder.
             Same cadence and same claim (put conviction behind what you
             argued); drops the one verb that made an investor read the
             whole page as a gambling product rather than a prediction
             layer over judged rounds. Swept together with the currency
             marks below, which were the other half of that read. -->
        <p class="hi-slogan">Back your words</p>
                <!-- One short line states the core loop. The product cards below
             carry the detail. -->
        <!-- 2026-07-22: "A ballot lands at the end" -> "Get a verdict at
             the end" per the founder. Plainer; "ballot" is debate jargon a
             first-time visitor has to decode. -->
        <p class="hi-subhead">Debate real people. Get a verdict at the end.</p>
        <!-- 2026-06-14: the "pick a motion → ... → read your ballot"
             steps line removed per the founder (the arrows row). The subhead
             above + the live-room mock below carry the how-it-works. -->
        <!-- Honest proof strip (2026-06-12). Both numbers hydrate from
             /api/public-join-history via the IIFE next to the (hidden)
             editorial-hero bookmark note; the static "78" fallback
             matches the live Firebase Auth count so a failed fetch
             never overclaims. The weekly clause renders ONLY from live
             data — no static fallback, hidden at zero, so it can't go
             stale. NOTE: this is the LIVE hero arm; the editorial-hero
             bookmark note carrying the same numbers is display:none. -->
      </div>

      <!-- 2026-06-01: big "where to go" buttons, ABOVE the illustration so
           they're the prominent above-the-fold framework per the founder
           ("bring back the big buttons to each area: live debates, prep").
           Replaced the rotating primary CTA + 4 small text links. -->
      <style>
        /* 2026-07-06: simplified first screen. Three clear doors: live people,
           the AI orb, and student ambassadorships. */
        @media(min-width:900px){.hero-illustrated{zoom:.97;max-width:1500px}}
        /* 2026-07-07: three cards rebuilt as ONE uniform selector so the
           choice is obvious. Identical skeleton per card: equal-height
           visual band -> kind label -> title -> one line -> chips ->
           full-width CTA on a shared baseline. Left-aligned across all
           three (the AI card no longer centers), DOM order carries the
           layout (live -> AI -> ambassadors), so no order overrides. */
        .hero-illustrated .hi-choose{display:block;text-align:center;font-size:.82rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--hi-ink-soft,#7a6f66);margin:36px auto 4px}
        /* 2026-07-18: site slogan eyebrow above the rotating H1. Same
           small-caps register as .hi-choose but brand red + rule marks
           so it reads as the slogan, not another nav label. */
        /* Gap scales with the headline. A flat 10px under a ~68px display
           face glued the eyebrow to it; this keeps the label reading as a
           separate tier at every width. */
        /* 2026-07-22: sized as a heading, not an eyebrow. It became the
           <h1> when "Take a side. / Speak live. Get judged." was cut, but
           kept its .76rem caption size, so the page's top-level heading
           rendered SMALLER (15.2px) than the paragraph under it (20px) —
           inverted hierarchy, and it read as a label stranded under the
           topbar. Now clamps to 24px at desktop, above the 20px subhead.
           Tracking drops .26em -> .14em because letter-spacing tuned for
           a 15px caption stretches badly at 24px. Size and rule marks are
           viewport-relative so the line never outgrows a phone: at .85rem
           with short rules it still fits inside 390px. Margin-bottom
           tightens 19px -> ~12px so the slogan and subhead group as one
           block, sitting closer to each other than to the cards. */
        /* 2026-07-22 (third pass): money glyphs cut, so the slogan carries
           the hero alone — sized up to a real display line (~38px at
           desktop, still one line at 390px). Tracking eases as size grows;
           rule marks scale with it. */
        .hero-illustrated .hi-slogan{display:flex;align-items:center;justify-content:center;gap:clamp(12px,1.6vw,22px);margin:0 0 clamp(8px,.9vw,12px);font-size:clamp(1.3rem,3.3vw,2.4rem);font-weight:900;letter-spacing:.1em;line-height:1.08;text-transform:uppercase;color:var(--hi-red,#b91c1c)}
        .hero-illustrated .hi-slogan::before,.hero-illustrated .hi-slogan::after{content:"";width:clamp(26px,4.2vw,62px);height:1px;flex:none;background:currentColor;opacity:.45}
        .hero-illustrated .hi-triptych{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;width:100%;max-width:1260px;margin:14px auto 0;align-items:stretch}
        /* 2026-07-07: let the unified doors break out of the hero's inner
           column without swallowing the first screen. Desktop only; mobile
           keeps the stacked single column. */
        @media(min-width:981px){.hero-illustrated .hi-doors--unified{width:min(1260px,calc(100vw - 72px));max-width:none}}
        .hero-illustrated .hi-path-card{position:relative;display:flex;width:100%;min-width:0;box-sizing:border-box;height:100%;min-height:448px;flex-direction:column;justify-content:flex-start;gap:13px;padding:20px;border-radius:20px;text-align:left;text-decoration:none;color:var(--hi-chip-ink);background:linear-gradient(180deg,rgba(255,254,250,.97),rgba(255,250,243,.93));border:1px solid rgba(29,25,21,.1);box-shadow:0 22px 58px rgba(29,25,21,.11),inset 0 1px 0 rgba(255,255,255,.65);overflow:hidden;transition:transform .2s cubic-bezier(.2,.8,.2,1),border-color .2s ease,box-shadow .2s ease}
        .hero-illustrated .hi-triptych .hi-path-card{--hi-ink:#1a1a1f;--hi-ink-soft:#5f5650;--hi-chip-ink:#1a1a1f}
        .hero-illustrated .hi-path-card:hover{transform:translateY(-6px);border-color:rgba(200,50,50,.5);box-shadow:0 34px 78px rgba(29,25,21,.18),inset 0 1px 0 rgba(255,255,255,.7)}
        .hero-illustrated .hi-path-card:focus-visible{outline:3px solid rgba(200,50,50,.6);outline-offset:3px}
        .hero-illustrated .hi-path-visual{position:relative;width:100%;height:176px;min-height:0;border-radius:14px;overflow:hidden;flex:0 0 auto}
        .hero-illustrated .hi-path-eyebrow{display:flex;align-items:center;gap:8px;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--hi-red)}
        .hero-illustrated .hi-path-eyebrow i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.9}
        .hero-illustrated .hi-path-card h2{font-family:var(--font-display);font-size:clamp(1.48rem,1.86vw,1.96rem);line-height:1.03;letter-spacing:-.02em;color:var(--hi-ink);margin:0;text-transform:none}
        .hero-illustrated .hi-path-copy{font-size:.92rem;line-height:1.45;color:var(--hi-ink-soft);margin:0}
        .hero-illustrated .hi-path-foot{margin-top:auto;display:flex;flex-direction:column;gap:12px;padding-top:8px}
        .hero-illustrated .hi-path-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:13px 16px;border-radius:12px;background:var(--hi-red);color:#fff;font-size:.86rem;font-weight:800;letter-spacing:.01em;box-shadow:0 11px 26px rgba(200,50,50,.26)}
        .hero-illustrated .hi-path-card:hover .hi-path-cta{box-shadow:0 14px 34px rgba(200,50,50,.36)}
        .hero-illustrated .hi-path-meta{display:flex;flex-wrap:wrap;gap:6px}
        .hero-illustrated .hi-path-meta span{font-size:.63rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--hi-ink-soft);border:1px solid rgba(29,25,21,.12);background:rgba(255,255,255,.5);border-radius:999px;padding:4px 9px}
        .hero-illustrated .hi-live-tiles{display:grid;width:100%;min-width:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:6px;height:100%;min-height:0;overflow:hidden}
        .hero-illustrated .hi-live-tiles img{display:block;width:100%;min-width:0;height:100%;min-height:0;object-fit:cover;border-radius:8px;filter:saturate(.95);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
        .hero-illustrated .hi-live-tiles img:first-child{grid-row:span 2}
        .hero-illustrated .hi-live-pill{position:absolute;z-index:2;top:10px;right:10px;display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;background:rgba(255,253,247,.92);border:1px solid rgba(34,197,94,.4);color:#15803d;font-size:.6rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;box-shadow:0 4px 12px rgba(29,25,21,.14)}
        .hero-illustrated .hi-live-pill i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.8)}
        .hero-illustrated .hi-path-card--ai{border-color:rgba(200,50,50,.24)}
        .hero-illustrated .hi-path-visual--ai{display:grid;place-items:center;background:radial-gradient(circle at 50% 44%,rgba(239,68,68,.14),rgba(255,246,240,.5) 72%);border:1px solid rgba(200,50,50,.12)}
        .hero-illustrated .hi-ai-core{position:relative;width:154px;aspect-ratio:1;margin:0 auto;display:grid;place-items:center;isolation:isolate}
        .hero-illustrated .hi-ai-core::before{content:"";position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(circle,rgba(239,68,68,.20),transparent 58%);filter:blur(16px);opacity:.78}
        .hero-illustrated .hi-ai-ring{position:absolute;border-radius:50%;border:1px solid rgba(200,50,50,.26);box-shadow:0 0 0 1px rgba(255,255,255,.42) inset}
        .hero-illustrated .hi-ai-ring--outer{inset:4%;background:conic-gradient(from 150deg,transparent 0 16%,rgba(239,68,68,.62) 17% 23%,transparent 24% 54%,rgba(184,138,78,.28) 55% 61%,transparent 62%);animation:hiAiSpin 14s linear infinite}
        .hero-illustrated .hi-ai-ring--mid{inset:17%;border-style:dashed;border-color:rgba(200,50,50,.22);animation:hiAiSpin 18s linear infinite reverse}
        .hero-illustrated .hi-ai-disc{position:absolute;inset:28%;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(200,50,50,.22);background:radial-gradient(circle at 33% 25%,rgba(255,255,255,.98) 0 12%,rgba(255,255,255,.54) 13% 23%,transparent 24%),radial-gradient(circle at 66% 72%,rgba(239,68,68,.34),transparent 44%),linear-gradient(145deg,rgba(255,252,246,.98),rgba(255,231,222,.94) 55%,rgba(244,196,173,.88));box-shadow:inset 10px 12px 22px rgba(255,255,255,.62),inset -12px -14px 24px rgba(168,80,55,.20),0 18px 45px rgba(200,50,50,.14),0 0 38px rgba(239,68,68,.18)}
        .hero-illustrated .hi-ai-disc::after{content:"";position:absolute;inset:18%;border-radius:50%;border:1px solid rgba(200,50,50,.20);background:radial-gradient(circle,rgba(239,68,68,.32),rgba(239,68,68,.08) 44%,transparent 47%);animation:hiAiBeat 2.8s ease-in-out infinite}
        .hero-illustrated .hi-ai-bars{position:relative;z-index:2;display:flex;align-items:center;gap:3px;height:28px}
        .hero-illustrated .hi-ai-bars i{display:block;width:4px;height:12px;border-radius:999px;background:#b72a2a;box-shadow:0 0 12px rgba(239,68,68,.26);animation:hiAiWave 1.15s ease-in-out infinite}
        .hero-illustrated .hi-ai-bars i:nth-child(2){height:20px;animation-delay:-.18s}
        .hero-illustrated .hi-ai-bars i:nth-child(3){height:26px;background:#ef4444;animation-delay:-.34s}
        .hero-illustrated .hi-ai-bars i:nth-child(4){height:18px;animation-delay:-.5s}
        .hero-illustrated .hi-ai-bars i:nth-child(5){height:11px;animation-delay:-.66s}
        .hero-illustrated .hi-ai-node{position:absolute;width:9px;height:9px;border-radius:50%;background:#ef4444;box-shadow:0 0 18px rgba(239,68,68,.75);z-index:2}
        .hero-illustrated .hi-ai-node--one{top:14%;right:28%;animation:hiAiNode 3.4s ease-in-out infinite}
        .hero-illustrated .hi-ai-node--two{right:9%;bottom:34%;animation:hiAiNode 3.4s ease-in-out -.9s infinite}
        .hero-illustrated .hi-ai-node--three{left:18%;bottom:19%;background:#b7865b;box-shadow:0 0 14px rgba(183,134,91,.36);animation:hiAiNode 3.4s ease-in-out -1.8s infinite}
        .hero-illustrated .hi-ai-label{position:absolute;left:50%;bottom:2%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(255,253,247,.9);border:1px solid rgba(200,50,50,.18);color:#7f1d1d;font-size:.6rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;box-shadow:0 8px 20px rgba(200,50,50,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .hero-illustrated .hi-ai-label i{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.85)}
        @keyframes hiAiSpin{to{transform:rotate(360deg)}}
        @keyframes hiAiBeat{0%,100%{transform:scale(.88);opacity:.54}50%{transform:scale(1.08);opacity:1}}
        @keyframes hiAiWave{0%,100%{transform:scaleY(.55);opacity:.65}50%{transform:scaleY(1);opacity:1}}
        @keyframes hiAiNode{0%,100%{transform:scale(.78);opacity:.48}50%{transform:scale(1.08);opacity:1}}
        .hero-illustrated .hi-amb-photo{position:relative;width:100%;min-width:0;height:100%;min-height:0;overflow:hidden;background:#221a14}
        .hero-illustrated .hi-amb-photo img{width:100%;height:100%;min-height:0;object-fit:cover;display:block;filter:saturate(.92) contrast(.96)}
        .hero-illustrated .hi-amb-photo::after{content:"Founding class";position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.94);color:#a4201d;font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
        /* Put account value above the three product doors. Guest use stays
           open, while saved ballots and the style profile get a real pitch. */
        /* The .hi-free-strip sign-in card ("Keep every ballot", Continue
           with Google) was removed 2026-08-12 at the founder's request, along
           with its base rules, its two band-row overrides, its 700px
           stack and its dark-theme block. Sign-in still reaches every
           visitor via the topbar, the post-2-generations nudge and the
           feature paywalls (soul.md section 4: advised, not required). */

        /* 2026-08-24: with the three-card cluster removed (see the markup
           note below), this section's only visible content is gone and
           what is left is padding around nothing: a ~104px blank band
           between the first screen and #how-it-works. Collapsed here
           rather than by deleting <section class="hero">, which still
           carries the .hi-head arm, both ?doors= QA arms and two scripts
           that other code reaches for. The QA arms are keyed off
           html[data-doors-ab], not off having children (both arms carry
           markup at all times and are display:none), so the collapse is
           excluded on ?doors=unified and ?doors=classic and those debug
           views keep their padding. Putting any block back into this
           section means dropping this rule. */
        :root[data-hero-ab="illustrated"]:not([data-doors-ab="unified"]):not([data-doors-ab="classic"]) section.hero{
          padding-top:0 !important;padding-bottom:0 !important;min-height:0}

        /* The band row (2026-07-22, rewritten 2026-08-12).
           Was Ambassador + sign-in side by side. The ambassador card
           left for .hi-pair-row (2026-08-01) and the founder removed the
           sign-in strip (2026-08-12), so this row carries Open Spar
           Night alone. Column by default; the row rules below turn on
           at >=901px and now have a single card to place. */
        /* 2026-08-01 (the founder): "Debate the AI" + the Ambassador Fund as a
           two-up row under the live card. Same rail as .hi-doors--livefirst
           above so the three cards line up on one left edge. Stacks below
           901px, matching every other pair on this page. */
        .hero-illustrated .hi-pair-row{
          width:100%;max-width:min(1340px,calc(100vw - 96px));
          margin:14px auto 0;display:grid;grid-template-columns:minmax(0,1fr);
          gap:14px;align-items:stretch;
        }
        @media(min-width:901px){
          .hero-illustrated .hi-pair-row{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px}
        }
        /* Inside the pair the banner is a half-rail card, not a wide strip:
           drop its own centering/width and stack copy over the CTA so the
           button pins to the bottom and lines up with "Start a voice round"
           in the card beside it. Mirrors the .hi-band-row treatment. */
        .hero-illustrated .hi-pair-row > .hi-ambassador-banner{
          width:auto;max-width:none;margin:0;
          /* auto 1fr auto: copy takes what it needs, the PHOTO absorbs the
             leftover height so this card matches the taller one beside it,
             CTA pins to the bottom. Before the photo existed the copy row
             was the 1fr and the slack rendered as a large empty middle. */
          grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr auto;
          align-items:start;gap:14px;
        }
        /* min-height, not aspect-ratio: the row is already sized by the
           grid, and an aspect-ratio here would fight it and reintroduce
           the gap at some widths. object-fit keeps the crop sane at
           whatever height the grid lands on. Scoped to the banner rather
           than to the pair row, so the photo still renders correctly if
           the card is ever placed somewhere else. */
        .hero-illustrated .hi-ambassador-banner .hi-amb-shot{
          position:relative;z-index:1;display:block;align-self:stretch;
          min-height:150px;border-radius:14px;overflow:hidden;
          border:1px solid rgba(200,50,50,.20);
          background:rgba(29,25,21,.06);
        }
        .hero-illustrated .hi-ambassador-banner .hi-amb-shot img{
          width:100%;height:100%;object-fit:cover;display:block;
          /* Nudged toward the page's warm palette so a raw photo does not
             read as a foreign object dropped into the card. */
          filter:saturate(.92) contrast(.98);
        }
        .hero-illustrated .hi-pair-row .hi-ambassador-cta{
          width:100%;box-sizing:border-box;justify-content:center;
          white-space:normal;text-align:center;
        }
        /* grid-area:amb named the old doors grid; nothing names it here. */
        .hero-illustrated .hi-pair-row > .hi-lf-amb{grid-area:auto;height:100%;min-height:0}
        @media(max-width:900px){
          .hero-illustrated .hi-pair-row{max-width:560px}
          .hero-illustrated .hi-pair-row > .hi-ambassador-banner{width:100%}
        }
        @media(max-width:560px){
          .hero-illustrated .hi-pair-row{max-width:100%;padding:0 14px;box-sizing:border-box}
        }
        .hero-illustrated .hi-band-row{display:flex;flex-direction:column;align-items:center}
        /* Spar-night banner rides the same rail as the two strips above
           so the three read as one cluster: same width, 14px gap, and
           the card's own centering/margins stand down inside the slot. */
        .hero-illustrated .hi-spar-slot{width:min(1180px,100%);margin:6px auto 8px}
        .hero-illustrated .hi-spar-slot .sn-card--banner{max-width:none;margin:0}
        @media(min-width:901px){
          .hero-illustrated .hi-band-row{
            flex-direction:row;align-items:stretch;gap:14px;
            /* 2026-07-22: 1180 -> 1155 so this row RENDERS on the same 1120
               rail as the livenow chips/stage below (they were ~25px apart
               per side, which read as misalignment, not hierarchy).
               .hero-illustrated carries zoom:.97, so layout 1155 x .97 =
               1120 rendered; if that zoom ever goes, drop this to 1120. The
               wide door cards above stay as the deliberate dominant tier. */
            width:min(1155px,100%);margin:18px auto 8px;
          }
          .hero-illustrated .hi-band-row > .hi-ambassador-banner{
            flex:1 1 0;min-width:0;width:auto;max-width:none;margin:0;
            /* Stack copy over CTA. Side by side, each panel is ~580px
               and "Apply for the founding class" next to three lines of
               copy is too tight to read. grid-template-rows 1fr auto
               pins both CTAs to the bottom so they line up across the
               two panels regardless of copy length. */
            grid-template-columns:minmax(0,1fr);grid-template-rows:1fr auto;
            align-items:start;gap:14px;
          }
          .hero-illustrated .hi-band-row .hi-ambassador-cta{
            width:100%;box-sizing:border-box;justify-content:center;
          }
          /* Spar night joins the row (2026-07-22, second pass). Between
             901 and 1079 it wraps onto its own line under the pair: three
             ~290px columns cannot hold "Every Wednesday at 8:00 PM ET"
             plus a countdown plus two buttons. wrap + width:100% is what
             makes that fall out for free. */
          .hero-illustrated .hi-band-row{flex-wrap:wrap}
          .hero-illustrated .hi-band-row > .hi-spar-slot{
            width:100%;margin:0;
          }
        }
        @media(min-width:1080px){
          /* Three across, equal columns. grid-auto-flow:column (not three
             declared tracks) keeps the signed-in case working: when
             the row holds one card, that card makes one track and
             fills the rail, instead of leaving two empty thirds. */
          .hero-illustrated .hi-band-row{
            display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);
            align-items:stretch;
          }
          .hero-illustrated .hi-band-row > .hi-spar-slot{width:auto;min-width:0}
          /* Equal thirds are narrower than "Apply for the founding class"
             on one line, so the two nowrap CTAs are allowed to wrap here.
             Without this their min-content pins those cards wider than
             their track and the button overflows the card. */
          .hero-illustrated .hi-band-row .hi-ambassador-cta{
            white-space:normal;text-align:center;padding-left:12px;padding-right:12px;
          }
          /* Both of these carry less copy than the spar card, so with the
             CTA pinned to the bottom the leftover height collected as one
             dead block under the text. Centering the copy in its track
             splits that space above and below, where it reads as padding.
             The schoolhouse stays where it is: .hi-ambassador-copy carries
             a 118px right padding tuned to clear it at 106px wide, and
             growing or moving the illustration spends that clearance. */
          .hero-illustrated .hi-band-row .hi-ambassador-copy{align-self:center}
          /* The banner's own 3-column grid (tile | copy | timer+actions,
             with a 350px floor on the last track) does not fit a third of
             the rail, so inside the row it stacks: tile beside the copy,
             timer and buttons on a full-width row under a hairline. Same
             shape its own <=820px breakpoint uses. */
          .hero-illustrated .hi-band-row .sn-card--banner{
            height:100%;box-sizing:border-box;
            grid-template-columns:auto minmax(0,1fr);gap:16px;padding:20px 22px;
          }
          .hero-illustrated .hi-band-row .sn-card--banner .sn-sub{max-width:none}
          /* 2026-07-22 (fit pass): the timer sat on its own line above two
             stacked buttons, which made this card ~90px taller than the
             other two and left a dead gap under their copy. Countdown and
             buttons share a line now, so all three land within ~40px. */
          .hero-illustrated .hi-band-row .sn-card--banner .sn-right{
            grid-column:1 / -1;grid-template-columns:minmax(0,1fr) minmax(148px,auto);
            align-content:end;align-items:center;
            gap:14px;padding:14px 0 0;border-left:0;border-top:1px solid rgba(29,25,21,.12);
          }
          .hero-illustrated .hi-band-row .sn-card--banner .sn-title{
            font-size:1.24rem;margin:5px 0 4px;
          }
          .hero-illustrated .hi-band-row .sn-card--banner .sn-count{font-size:1.5rem}
          .hero-illustrated .hi-band-row .sn-card--banner .sn-cta{
            min-height:40px;padding:8px 12px;white-space:normal;
          }
          .hero-illustrated .hi-band-row .sn-card--banner .sn-actions{min-width:0}
        }
        /* 2026-07-22: was a near-black slab (linear-gradient #211817 ->
           #35201e) dropped into a warm cream page. It read as a foreign
           object between the door cards and the section below. Restyled
           onto the house panel language the door cards already use: warm
           blush paper, hairline red border, soft red-tinted shadow, dark
           ink text. The solid red CTA now carries the contrast instead of
           the whole band shouting. A low-opacity radial adds depth at the
           right edge so it is not a flat fill, kept subtle so it stays
           texture. */
        .hero-illustrated .hi-ambassador-banner{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:24px;width:min(1000px,100%);box-sizing:border-box;margin:18px auto 0;padding:17px 18px 17px 21px;border:1px solid rgba(200,50,50,.22);border-radius:18px;background:linear-gradient(135deg,#fffaf7 0%,#fff0ea 54%,#fce2d8 100%);box-shadow:0 14px 34px rgba(200,50,50,.10),0 2px 6px rgba(29,25,21,.05);color:var(--hi-ink,#1a1a1f);text-align:left;text-decoration:none;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
        .hero-illustrated .hi-ambassador-banner::after{content:"";position:absolute;right:-60px;top:50%;width:340px;height:340px;transform:translateY(-50%);border-radius:50%;background:radial-gradient(circle,rgba(200,50,50,.09) 0%,rgba(200,50,50,0) 70%);pointer-events:none}
        /* Schoolhouse. Sits in the card's top-right on the existing red
           glow, which now reads as light behind the building. Muted on
           purpose: it is texture supporting the headline, not a logo.
           z-index 1 puts it above the ::after glow but the copy also
           sits at z-index 1 and comes later in the DOM, so text always
           wins if they ever meet. */
        .hero-illustrated .hi-amb-school{position:absolute;z-index:1;right:16px;top:12px;width:106px;height:auto;pointer-events:none;overflow:visible}
        .hero-illustrated .hi-amb-school .sch-ground{stroke:rgba(29,25,21,.20);stroke-width:2;stroke-linecap:round;fill:none}
        .hero-illustrated .hi-amb-school .sch-body{fill:rgba(29,25,21,.11)}
        .hero-illustrated .hi-amb-school .sch-tower{fill:rgba(29,25,21,.15)}
        .hero-illustrated .hi-amb-school .sch-roof{fill:rgba(200,50,50,.55)}
        .hero-illustrated .hi-amb-school .sch-door{fill:rgba(200,50,50,.42)}
        .hero-illustrated .hi-amb-school .sch-flag{fill:rgba(200,50,50,.70)}
        .hero-illustrated .hi-amb-school .sch-pole{stroke:rgba(29,25,21,.35);stroke-width:1.6;stroke-linecap:round;fill:none}
        .hero-illustrated .hi-amb-school .sch-win rect{fill:#fffdfa;stroke:rgba(200,50,50,.34);stroke-width:1.4}
        .hero-illustrated .hi-amb-school .sch-mullion path{stroke:rgba(200,50,50,.30);stroke-width:1.2;fill:none}
        /* Keeps the three copy lines clear of the building. */
        .hero-illustrated .hi-ambassador-banner .hi-ambassador-copy{padding-right:118px}
        @media(max-width:700px){
          .hero-illustrated .hi-amb-school{width:78px;right:10px;top:10px}
          .hero-illustrated .hi-ambassador-banner .hi-ambassador-copy{padding-right:86px}
        }
        .hero-illustrated .hi-ambassador-banner:hover{transform:translateY(-2px);border-color:rgba(200,50,50,.42);box-shadow:0 20px 44px rgba(200,50,50,.16),0 3px 8px rgba(29,25,21,.06)}
        .hero-illustrated .hi-ambassador-copy{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:3px}
        /* Copy sits above the corner glow. */
        .hero-illustrated .hi-ambassador-copy,
        .hero-illustrated .hi-ambassador-cta{position:relative;z-index:1}
        .hero-illustrated .hi-ambassador-kicker{color:#b91c1c;font-size:.65rem;font-weight:900;letter-spacing:.12em;line-height:1.2;text-transform:uppercase}
        .hero-illustrated .hi-ambassador-title{color:var(--hi-ink,#1a1a1f);font-family:var(--font-body);font-size:1.3rem;font-weight:800;line-height:1.12}
        .hero-illustrated .hi-ambassador-detail{color:rgba(29,25,21,.64);font-family:var(--font-body);font-size:.9rem;font-weight:500;line-height:1.35}
        .hero-illustrated .hi-ambassador-cta{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border-radius:12px;background:var(--hi-red);box-shadow:0 10px 22px rgba(200,50,50,.28);color:#fff;font-size:.9rem;font-weight:900;white-space:nowrap}
        /* Dark themes: a warm ember panel, not the old near-black. Keeps
           the same shape and the same red CTA, just inverted ink.
           DORMANT TODAY: DARK_MODE_ENABLED is false in the head script,
           which pins this page to data-theme="light", so these never
           match on the live site. They exist so the banner does not go
           back to being a black slab the day that flag is flipped on.
           Don't debug them by hand-setting data-theme on <html>: the
           disabled theme system fights it and you get a half-applied
           mix that looks like a specificity bug and isn't. */
        [data-theme="grey"] .hero-illustrated .hi-ambassador-banner,
        [data-theme="crimson"] .hero-illustrated .hi-ambassador-banner,
        [data-theme="stone"] .hero-illustrated .hi-ambassador-banner,
        [data-theme="dark"] .hero-illustrated .hi-ambassador-banner{
          background:linear-gradient(135deg,rgba(96,38,32,.55) 0%,rgba(64,29,26,.5) 60%,rgba(48,24,22,.5) 100%);
          border-color:rgba(248,113,113,.30);
          box-shadow:0 16px 38px rgba(0,0,0,.32);
          color:#f5efe7;
        }
        [data-theme="grey"] .hero-illustrated .hi-ambassador-title,
        [data-theme="crimson"] .hero-illustrated .hi-ambassador-title,
        [data-theme="stone"] .hero-illustrated .hi-ambassador-title,
        [data-theme="dark"] .hero-illustrated .hi-ambassador-title{color:#fff}
        [data-theme="grey"] .hero-illustrated .hi-ambassador-kicker,
        [data-theme="crimson"] .hero-illustrated .hi-ambassador-kicker,
        [data-theme="stone"] .hero-illustrated .hi-ambassador-kicker,
        [data-theme="dark"] .hero-illustrated .hi-ambassador-kicker{color:#fca5a5}
        [data-theme="grey"] .hero-illustrated .hi-ambassador-detail,
        [data-theme="crimson"] .hero-illustrated .hi-ambassador-detail,
        [data-theme="stone"] .hero-illustrated .hi-ambassador-detail,
        [data-theme="dark"] .hero-illustrated .hi-ambassador-detail{color:rgba(255,255,255,.72)}
        @media(max-width:700px){
          .hero-illustrated .hi-ambassador-banner{grid-template-columns:1fr;gap:14px;width:100%;max-width:560px;padding:17px;text-align:center}
          .hero-illustrated .hi-ambassador-copy{align-items:center}
          .hero-illustrated .hi-ambassador-cta{width:100%;box-sizing:border-box}
        }
        [data-theme="dark"] .hero-illustrated .hi-path-card,
        [data-theme="crimson"] .hero-illustrated .hi-path-card,
        [data-theme="grey"] .hero-illustrated .hi-path-card,
        [data-theme="stone"] .hero-illustrated .hi-path-card{
          --hi-ink:#f5efe7;
          --hi-ink-soft:rgba(245,239,231,.70);
          --hi-chip-ink:#f5efe7;
          background:linear-gradient(180deg,rgba(42,31,28,.88),rgba(30,24,23,.80));
          border-color:rgba(245,239,231,.13);
          box-shadow:0 18px 54px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05);
        }
        [data-theme="dark"] .hero-illustrated .hi-path-card--ai,
        [data-theme="crimson"] .hero-illustrated .hi-path-card--ai,
        [data-theme="grey"] .hero-illustrated .hi-path-card--ai,
        [data-theme="stone"] .hero-illustrated .hi-path-card--ai{border-color:rgba(239,68,68,.26)}
        [data-theme="dark"] .hero-illustrated .hi-path-visual--ai,
        [data-theme="crimson"] .hero-illustrated .hi-path-visual--ai,
        [data-theme="grey"] .hero-illustrated .hi-path-visual--ai,
        [data-theme="stone"] .hero-illustrated .hi-path-visual--ai{
          background:radial-gradient(circle at 50% 42%,rgba(239,68,68,.22),rgba(38,27,25,.6) 72%);
          border-color:rgba(239,68,68,.22);
        }
        [data-theme="dark"] .hero-illustrated .hi-path-meta span,
        [data-theme="crimson"] .hero-illustrated .hi-path-meta span,
        [data-theme="grey"] .hero-illustrated .hi-path-meta span,
        [data-theme="stone"] .hero-illustrated .hi-path-meta span{
          color:rgba(245,239,231,.68);
          border-color:rgba(245,239,231,.13);
          background:rgba(255,255,255,.04);
        }
        [data-theme="dark"] .hero-illustrated .hi-live-pill,
        [data-theme="crimson"] .hero-illustrated .hi-live-pill,
        [data-theme="grey"] .hero-illustrated .hi-live-pill,
        [data-theme="stone"] .hero-illustrated .hi-live-pill{
          color:#bbf7d0;
          background:rgba(34,197,94,.10);
          border-color:rgba(34,197,94,.28);
        }
        [data-theme="dark"] .hero-illustrated .hi-ai-label,
        [data-theme="crimson"] .hero-illustrated .hi-ai-label,
        [data-theme="grey"] .hero-illustrated .hi-ai-label,
        [data-theme="stone"] .hero-illustrated .hi-ai-label{
          color:#fef2f2;
          background:rgba(30,24,23,.76);
          border-color:rgba(239,68,68,.26);
        }
        @media(max-width:980px){.hero-illustrated .hi-triptych{grid-template-columns:minmax(0,1fr);max-width:560px;gap:18px}.hero-illustrated .hi-path-card{height:auto;min-height:0}.hero-illustrated .hi-path-visual{height:204px}}
        @media(max-width:560px){html,body{overflow-x:hidden}:root[data-hero-ab="illustrated"] section.hero{padding-left:0 !important;padding-right:0 !important}:root[data-hero-ab="illustrated"] .hero-content{width:100vw !important;max-width:100vw !important;margin:0 !important;text-align:center !important}:root[data-hero-ab="illustrated"] .hero-illustrated{width:100vw;max-width:100vw;padding-left:20px;padding-right:20px;box-sizing:border-box}.hero-illustrated .hi-head{width:100%;max-width:calc(100vw - 40px)}section.hero .hero-illustrated h1.hi-headline{white-space:normal !important;font-size:clamp(2rem,10vw,2.55rem) !important;max-width:calc(100vw - 40px);margin-left:auto !important;margin-right:auto !important}.hero-illustrated .hi-headline-lead,.hero-illustrated .hi-headline-accent{display:block}.hero-illustrated .hi-subhead{max-width:calc(100vw - 48px);font-size:.9rem}.hero-illustrated .hi-subhead strong,.hero-illustrated .hi-sub-tail{display:block}.hero-illustrated .hi-triptych{width:100%;max-width:calc(100vw - 40px);gap:12px;margin-top:18px}.hero-illustrated .hi-path-card{min-height:auto;padding:17px}.hero-illustrated .hi-ai-core{width:136px}.hero-illustrated .hi-path-visual{height:172px}}
        @media(prefers-reduced-motion:reduce){.hero-illustrated .hi-ai-ring,.hero-illustrated .hi-ai-disc::after,.hero-illustrated .hi-ai-bars i,.hero-illustrated .hi-ai-node{animation:none}}

        /* ===== DOORS A/B (2026-07-07) =====
           One arm shows at a time. Fail-open to the unified selector when
           the attribute is absent/unrecognized: classic is display:none by
           default and only revealed under html[data-doors-ab="classic"]. */
        .hero-illustrated .hi-doors--classic{display:none}
        html[data-doors-ab="classic"] .hero-illustrated .hi-doors--unified{display:none}
        html[data-doors-ab="classic"] .hero-illustrated .hi-doors--classic{display:block}

        /* Classic (control) arm: the exact pre-2026-07-07 triptych, every
           layout class namespaced hio-* so it never collides with the
           unified hi-* rules above. The orb INTERNALS (hi-ai-ring / disc /
           bars / node / label) and keyframes are shared and reused as-is;
           only the orb container (hio-ai-core) is namespaced for its size. */
        .hero-illustrated .hio-triptych{display:grid;grid-template-columns:minmax(350px,1fr) minmax(380px,1.05fr) minmax(350px,1fr);gap:20px;width:100%;max-width:1420px;margin:22px auto 0;align-items:start}
        .hero-illustrated .hio-path-card--live{order:1}
        .hero-illustrated .hio-path-card--ambassadors{order:2}
        .hero-illustrated .hio-path-card--ai{order:3}
        .hero-illustrated .hio-path-card{position:relative;display:flex;width:100%;min-width:0;box-sizing:border-box;height:430px;min-height:0;flex-direction:column;justify-content:flex-start;gap:14px;padding:18px;border-radius:18px;text-decoration:none;color:var(--hi-chip-ink);background:rgba(255,253,247,.9);border:1px solid rgba(29,25,21,.12);box-shadow:0 18px 48px rgba(29,25,21,.10);overflow:hidden;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
        .hero-illustrated .hio-triptych .hio-path-card{--hi-ink:#1a1a1f;--hi-ink-soft:#5f5650;--hi-chip-ink:#1a1a1f}
        .hero-illustrated .hio-path-card:hover{transform:translateY(-3px);border-color:rgba(200,50,50,.55);box-shadow:0 24px 70px rgba(29,25,21,.16)}
        .hero-illustrated .hio-path-card:focus-visible{outline:3px solid rgba(200,50,50,.6);outline-offset:3px}
        .hero-illustrated .hio-path-eyebrow{font-size:.66rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--hi-red)}
        .hero-illustrated .hio-path-card h2{font-family:var(--font-display);font-size:clamp(1.36rem,1.7vw,1.72rem);line-height:1.04;letter-spacing:-.018em;color:var(--hi-ink);margin:0;text-transform:none}
        .hero-illustrated .hio-path-copy{font-size:.86rem;line-height:1.4;color:var(--hi-ink-soft);margin:0;max-width:34ch}
        .hero-illustrated .hio-path-cta{display:inline-flex;align-items:center;gap:8px;width:max-content;margin-top:auto;padding:10px 14px;border-radius:999px;background:var(--hi-red);color:#fff;font-size:.78rem;font-weight:800;letter-spacing:.01em;box-shadow:0 9px 24px rgba(200,50,50,.24)}
        .hero-illustrated .hio-path-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
        .hero-illustrated .hio-path-meta span{font-size:.63rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--hi-ink-soft);border:1px solid rgba(29,25,21,.12);background:rgba(255,255,255,.45);border-radius:999px;padding:4px 7px}
        .hero-illustrated .hio-live-tiles{display:grid;width:100%;min-width:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px;height:142px;min-height:0;overflow:hidden}
        .hero-illustrated .hio-live-tiles img{display:block;width:100%;min-width:0;height:100%;min-height:0;object-fit:cover;border-radius:10px;filter:saturate(.95);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
        .hero-illustrated .hio-live-tiles img:first-child{grid-row:span 2}
        .hero-illustrated .hio-live-pill{position:absolute;top:16px;right:16px;display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.34);color:#15803d;font-size:.62rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
        .hero-illustrated .hio-live-pill i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.8)}
        .hero-illustrated .hio-path-card--ai{align-items:center;text-align:center;padding:18px;background:linear-gradient(180deg,rgba(255,253,247,.98),rgba(255,248,238,.9));border-color:rgba(200,50,50,.28)}
        .hero-illustrated .hio-path-card--ai::before{content:"";position:absolute;inset:12px;border-radius:15px;background:radial-gradient(circle at 50% 26%,rgba(239,68,68,.10),transparent 37%),linear-gradient(135deg,rgba(255,255,255,.48),transparent 42%,rgba(239,68,68,.045));pointer-events:none}
        .hero-illustrated .hio-path-card--ai > *{position:relative;z-index:1}
        .hero-illustrated .hio-path-card--ai .hio-path-copy{margin:0 auto;max-width:34ch}
        .hero-illustrated .hio-path-card--ai .hio-path-cta{margin-left:auto;margin-right:auto}
        .hero-illustrated .hio-ai-core{position:relative;width:min(184px,54vw);aspect-ratio:1;margin:0 auto -2px;display:grid;place-items:center;isolation:isolate}
        .hero-illustrated .hio-ai-core::before{content:"";position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(circle,rgba(239,68,68,.20),transparent 58%);filter:blur(16px);opacity:.78}
        .hero-illustrated .hio-amb-photo{position:relative;width:100%;min-width:0;height:142px;min-height:0;border-radius:12px;overflow:hidden;background:#221a14;border:1px solid rgba(255,255,255,.16)}
        .hero-illustrated .hio-amb-photo img{width:100%;height:100%;min-height:0;object-fit:cover;display:block;filter:saturate(.92) contrast(.96)}
        .hero-illustrated .hio-amb-photo::after{content:"Founding class";position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.94);color:#a4201d;font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
        [data-theme="dark"] .hero-illustrated .hio-path-card,
        [data-theme="crimson"] .hero-illustrated .hio-path-card,
        [data-theme="grey"] .hero-illustrated .hio-path-card,
        [data-theme="stone"] .hero-illustrated .hio-path-card{
          --hi-ink:#f5efe7;
          --hi-ink-soft:rgba(245,239,231,.70);
          --hi-chip-ink:#f5efe7;
          background:linear-gradient(180deg,rgba(42,31,28,.88),rgba(30,24,23,.80));
          border-color:rgba(245,239,231,.13);
          box-shadow:0 18px 54px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05);
        }
        [data-theme="dark"] .hero-illustrated .hio-path-card--ai,
        [data-theme="crimson"] .hero-illustrated .hio-path-card--ai,
        [data-theme="grey"] .hero-illustrated .hio-path-card--ai,
        [data-theme="stone"] .hero-illustrated .hio-path-card--ai{
          background:radial-gradient(circle at 50% 18%,rgba(239,68,68,.16),transparent 44%),linear-gradient(180deg,rgba(48,32,29,.90),rgba(29,24,23,.82));
          border-color:rgba(239,68,68,.26);
        }
        [data-theme="dark"] .hero-illustrated .hio-path-meta span,
        [data-theme="crimson"] .hero-illustrated .hio-path-meta span,
        [data-theme="grey"] .hero-illustrated .hio-path-meta span,
        [data-theme="stone"] .hero-illustrated .hio-path-meta span{
          color:rgba(245,239,231,.68);
          border-color:rgba(245,239,231,.13);
          background:rgba(255,255,255,.04);
        }
        [data-theme="dark"] .hero-illustrated .hio-live-pill,
        [data-theme="crimson"] .hero-illustrated .hio-live-pill,
        [data-theme="grey"] .hero-illustrated .hio-live-pill,
        [data-theme="stone"] .hero-illustrated .hio-live-pill{
          color:#bbf7d0;
          background:rgba(34,197,94,.10);
          border-color:rgba(34,197,94,.28);
        }
        @media(max-width:980px){.hero-illustrated .hio-triptych{grid-template-columns:minmax(0,1fr);max-width:560px}.hero-illustrated .hio-path-card{height:auto;min-height:300px}.hero-illustrated .hio-live-tiles{height:150px}}
        @media(max-width:560px){.hero-illustrated .hio-triptych{width:100%;max-width:calc(100vw - 40px);gap:12px;margin-top:18px}.hero-illustrated .hio-path-card{min-height:auto;padding:18px}.hero-illustrated .hio-ai-core{width:min(198px,70vw)}.hero-illustrated .hio-live-tiles,.hero-illustrated .hio-amb-photo{height:120px}}

        /* ═══════════════════════════════════════════════════════════════
           LIVE-FIRST hero (2026-07-08) — NEW DEFAULT door layout.
           Fix: the three equal cards gave the AI orb too much visual
           gravity (brightest, most symmetric object). Now the live room
           is the hero (left, ~62%), founding-class applications are the
           second door (right, ~38%), and the AI orb is demoted to a slim
           always-available fallback strip below. Reuses .hi-path-card for
           card chrome + full dark/light theming, and the shared hi-ai-*
           orb internals at a smaller size. Rollback to the equal triptych
           with ?doors=unified (or the classic arm with ?doors=classic). */
        .hero-illustrated .hi-doors--livefirst{display:block}
        .hero-illustrated .hi-doors--unified{display:none}
        html[data-doors-ab="unified"] .hero-illustrated .hi-doors--livefirst{display:none}
        html[data-doors-ab="unified"] .hero-illustrated .hi-doors--unified{display:block}
        html[data-doors-ab="classic"] .hero-illustrated .hi-doors--livefirst{display:none}

        /* 2026-07-18: the old ≥981px breakout (left:50% + translateX(-50%)
           + 100vw width) mixed parent-relative and viewport-relative math;
           any ancestor transform or iPad Safari viewport quirk shifted the
           whole strip off the left edge. Plain in-flow centering inside the
           already-centered .hero-content is stable everywhere. */
        .hero-illustrated .hi-doors--livefirst{width:100%;max-width:min(1340px,calc(100vw - 96px));margin:10px auto 0}
        /* Ink is left to the theme system: light-theme root gives dark ink
           (readable on the light card), the [data-theme=dark] .hi-path-card
           override gives light ink. Do NOT re-pin --hi-ink here — an override
           at equal specificity lands after the dark rule and wins, which
           turns the headline/motion/judge text near-black on the dark card. */
        /* 2026-08-01: the voice card moved out to .hi-pair-row, so this
           grid is one full-rail column. Kept as a grid (not a bare div)
           because the live card's own rules lean on grid-area:live. */
        .hero-illustrated .hi-lf-grid{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"live";grid-template-rows:auto;column-gap:18px;row-gap:14px;align-items:stretch}
        .hero-illustrated .hi-lf-live{grid-area:live}
        /* .hi-path-card carries min-height:448px for the equal-triptych arm.
           Here the grid row owns the height, so remove that inherited floor. */
        .hero-illustrated .hi-lf-live,.hero-illustrated .hi-lf-amb{height:100%;min-height:0}
        /* shared eyebrow + CTA */
        .hero-illustrated .hi-lf-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.68rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--hi-red)}
        .hero-illustrated .hi-lf-eyebrow i{width:7px;height:7px;border-radius:50%;background:currentColor}
        .hero-illustrated .hi-lf-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:12px;font-size:.98rem;font-weight:800;letter-spacing:.01em;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease,background .15s ease,border-color .15s ease,color .15s ease}
        .hero-illustrated .hi-lf-cta--primary{background:var(--hi-red);color:#fff;box-shadow:0 11px 26px rgba(200,50,50,.26)}
        .hero-illustrated .hi-lf-cta--primary:hover{transform:translateY(-1px);box-shadow:0 15px 34px rgba(200,50,50,.36)}
        .hero-illustrated .hi-lf-cta--ghost{background:transparent;color:var(--hi-ink);border:1px solid var(--hi-card-line,rgba(29,25,21,.22))}
        .hero-illustrated .hi-lf-cta--ghost:hover{border-color:var(--hi-red);color:var(--hi-red)}
        .hero-illustrated .hi-lf-cta--full{width:100%;box-sizing:border-box}
        /* LEFT — live room (mini product interface) */
        /* space-evenly, paired with dropping margin-top:auto on the foot.
           With 16/9 tiles the card no longer fills the row on its own, and
           auto-margin dumped every spare pixel into one 76px void above the
           buttons. Even rhythm reads deliberate; a single gap reads broken. */
        .hero-illustrated .hi-lf-live{padding:0;overflow:hidden;display:flex;flex-direction:column;gap:0;justify-content:space-evenly}
        .hero-illustrated .hi-lf-live-hit{position:absolute;inset:0;z-index:2;border-radius:inherit;text-decoration:none}
        .hero-illustrated .hi-lf-live-hit:focus-visible{outline:3px solid rgba(200,50,50,.64);outline-offset:-5px}
        .hero-illustrated .hi-lf-roombar{display:flex;align-items:center;gap:9px;padding:11px 18px;border-bottom:1px solid var(--hi-card-line,rgba(29,25,21,.12));font-size:.65rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hi-ink-soft)}
        .hero-illustrated .hi-lf-roombar-spacer{flex:1}
        .hero-illustrated .hi-lf-liveflag{display:inline-flex;align-items:center;gap:6px;color:#dc2626}
        .hero-illustrated .hi-lf-liveflag i{width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 9px rgba(239,68,68,.85);animation:hiAiBeat 2s ease-in-out infinite}
        .hero-illustrated .hi-lf-judged b{color:var(--hi-red);font-weight:900}
        .hero-illustrated .hi-lf-stage{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:10px 18px 0;flex:0 0 auto;min-height:0}
        /* 16/9 so a tile reads as a screen. Was a fixed 390px grid row with
           the stage flexing into whatever remained, which squashed both
           tiles into slivers. Card height now comes from the tiles. */
        .hero-illustrated .hi-lf-tile{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;min-height:0;background:#1c1512;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
        /* .42s to match the slowed fadeMs in the rotator below; at .24s the
           tiles cut rather than dissolved. */
        .hero-illustrated .hi-lf-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .42s ease,transform .42s ease}
        .hero-illustrated .hi-lf-tile img.is-swapping{opacity:0;transform:scale(1.018)}
        .hero-illustrated .hi-lf-tile--speaking{box-shadow:inset 0 0 0 2px #ef4444}
        .hero-illustrated .hi-lf-timer{position:absolute;top:8px;right:8px;padding:3px 7px;border-radius:7px;background:rgba(18,13,11,.78);color:#fff;font-size:.62rem;font-weight:900;font-variant-numeric:tabular-nums}
        .hero-illustrated .hi-lf-motion{margin:9px 18px 0;padding:8px 13px;border-radius:11px;background:rgba(200,50,50,.06);border:1px solid var(--hi-card-line,rgba(29,25,21,.12));font-size:1.02rem;font-weight:600;line-height:1.22;color:var(--hi-ink);font-family:var(--font-body)}
        .hero-illustrated .hi-lf-motion-k{display:block;font-family:inherit;font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--hi-red);margin-bottom:2px}
        .hero-illustrated .hi-lf-judge{display:flex;align-items:center;gap:9px;margin:9px 18px 0;font-size:.7rem;color:var(--hi-ink-soft)}
        .hero-illustrated .hi-lf-judge-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 10px rgba(239,68,68,.7);flex:0 0 auto;animation:hiAiBeat 2.4s ease-in-out infinite}
        .hero-illustrated .hi-lf-judge-t{flex:1;min-width:0}
        .hero-illustrated .hi-lf-judge-t b{color:var(--hi-ink);font-weight:800}
        /* ── Prediction-market layer (2026-07-22) ──────────────────────
           "Bet on your words" was only words: nothing on the first
           screen looked like a market. Two instruments fix that, both
           inside the live card so the bet reads as part of the round:
           (1) a ticker of other rounds circulating under the roombar
           with names, odds, and pooled money; (2) the motion box
           becomes the featured market: price line, per-side odds with
           the debaters' names, and the pot. Illustrative, same status
           as the face tiles; markup carries full static defaults so
           the reduced-motion path still renders a complete market. */
        .hero-illustrated .hi-lf-ticker{display:flex;overflow:hidden;padding:6px 0;border-bottom:1px solid var(--hi-card-line,rgba(29,25,21,.12));background:rgba(200,50,50,.045);white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
        .hero-illustrated .hi-lf-ticker-track{display:inline-flex;flex:0 0 auto;animation:hiTicker 38s linear infinite}
        .hero-illustrated .hi-lf-ticker-group{display:inline-flex;gap:30px;padding-right:30px}
        .hero-illustrated .hi-lf-ticker-group>span{display:inline-flex;align-items:baseline;gap:5px;font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--hi-ink-soft);font-variant-numeric:tabular-nums}
        .hero-illustrated .hi-lf-ticker-group em{font-style:normal;font-weight:900;color:var(--hi-ink)}
        .hero-illustrated .hi-lf-ticker-group b{font-weight:900;color:var(--hi-red)}
        .hero-illustrated .hi-lf-ticker-group .up{color:#15803d;font-style:normal}
        .hero-illustrated .hi-lf-ticker-group .dn{color:#b91c1c;font-style:normal}
        @keyframes hiTicker{to{transform:translateX(-50%)}}
        @media(prefers-reduced-motion:reduce){.hero-illustrated .hi-lf-ticker-track{animation:none}}
        .hero-illustrated .hi-lf-mkt-head{display:flex;align-items:baseline;gap:10px}
        .hero-illustrated .hi-lf-mkt-vol{margin-left:auto;font-size:.64rem;font-weight:700;letter-spacing:.02em;text-transform:none;color:var(--hi-ink-soft);font-variant-numeric:tabular-nums;white-space:nowrap}
        .hero-illustrated .hi-lf-mkt-vol b{color:var(--hi-ink);font-weight:900}
        .hero-illustrated .hi-lf-mkt-chart{position:relative;height:44px;margin-top:8px}
        .hero-illustrated .hi-lf-mkt-chart svg{display:block;width:100%;height:100%}
        .hero-illustrated .hi-lf-mkt-grid{stroke:rgba(29,25,21,.09);stroke-width:1}
        .hero-illustrated .hi-lf-mkt-area{fill:rgba(200,50,50,.10)}
        .hero-illustrated .hi-lf-mkt-line{fill:none;stroke:var(--hi-red,#c83232);stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
        /* HTML overlay dot, not an SVG circle: preserveAspectRatio="none"
           scales x ~6x more than y, which would stretch a circle into a
           smear. top is set as a % of chart height (static default and
           by the JS below). */
        .hero-illustrated .hi-lf-mkt-dot{position:absolute;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--hi-red,#c83232);transform:translateY(-50%);box-shadow:0 0 8px rgba(200,50,50,.6)}
        .hero-illustrated .hi-lf-mkt-dot::after{content:"";position:absolute;inset:-2px;border-radius:50%;background:rgba(200,50,50,.35);animation:hiMktHalo 1.8s ease-out infinite}
        @keyframes hiMktHalo{0%{transform:scale(.6);opacity:.9}70%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}
        .hero-illustrated .hi-lf-mkt-rows{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        .hero-illustrated .hi-lf-mkt-side{position:relative;overflow:hidden;display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:9px;border:1px solid rgba(200,50,50,.3);background:#fff}
        .hero-illustrated .hi-lf-mkt-side--con{border-color:rgba(29,25,21,.18)}
        .hero-illustrated .hi-lf-mkt-fill{position:absolute;left:0;top:0;bottom:0;display:block;background:rgba(200,50,50,.12);transition:width .6s cubic-bezier(.2,.8,.2,1)}
        .hero-illustrated .hi-lf-mkt-side--con .hi-lf-mkt-fill{background:rgba(29,25,21,.07)}
        .hero-illustrated .hi-lf-mkt-tag{position:relative;font-size:.54rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--hi-red);border:1px solid rgba(200,50,50,.34);border-radius:5px;padding:2px 5px;background:rgba(255,255,255,.72)}
        .hero-illustrated .hi-lf-mkt-side--con .hi-lf-mkt-tag{color:var(--hi-ink-soft);border-color:rgba(29,25,21,.22)}
        .hero-illustrated .hi-lf-mkt-name{position:relative;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-body);font-size:.76rem;font-weight:700;color:var(--hi-ink)}
        .hero-illustrated .hi-lf-mkt-pct{position:relative;font-size:1rem;font-weight:900;color:var(--hi-ink);font-variant-numeric:tabular-nums}
        .hero-illustrated .hi-lf-mkt-side--pro .hi-lf-mkt-pct{color:var(--hi-red)}
        [data-theme="dark"] .hero-illustrated .hi-lf-ticker,
        [data-theme="crimson"] .hero-illustrated .hi-lf-ticker,
        [data-theme="grey"] .hero-illustrated .hi-lf-ticker,
        [data-theme="stone"] .hero-illustrated .hi-lf-ticker{background:rgba(239,68,68,.07);border-color:rgba(245,239,231,.12)}
        [data-theme="dark"] .hero-illustrated .hi-lf-mkt-side,
        [data-theme="crimson"] .hero-illustrated .hi-lf-mkt-side,
        [data-theme="grey"] .hero-illustrated .hi-lf-mkt-side,
        [data-theme="stone"] .hero-illustrated .hi-lf-mkt-side{background:rgba(255,255,255,.05);border-color:rgba(239,68,68,.28)}
        [data-theme="dark"] .hero-illustrated .hi-lf-mkt-side--con,
        [data-theme="crimson"] .hero-illustrated .hi-lf-mkt-side--con,
        [data-theme="grey"] .hero-illustrated .hi-lf-mkt-side--con,
        [data-theme="stone"] .hero-illustrated .hi-lf-mkt-side--con{border-color:rgba(245,239,231,.16)}
        [data-theme="dark"] .hero-illustrated .hi-lf-mkt-tag,
        [data-theme="crimson"] .hero-illustrated .hi-lf-mkt-tag,
        [data-theme="grey"] .hero-illustrated .hi-lf-mkt-tag,
        [data-theme="stone"] .hero-illustrated .hi-lf-mkt-tag{background:rgba(255,255,255,.06)}
        .hero-illustrated .hi-lf-live-foot{padding:11px 18px 14px;display:flex;flex-direction:column;gap:8px}
        .hero-illustrated .hi-lf-cta-row{position:relative;z-index:3;display:flex;gap:10px;flex-wrap:wrap}
        .hero-illustrated .hi-lf-cta-row .hi-lf-cta--primary{flex:1;min-width:160px}
        /* RIGHT — Voice AI */
        .hero-illustrated .hi-lf-amb{display:flex;flex-direction:column;gap:5px;padding:13px;text-decoration:none}
        /* A shallow visual keeps the voice card the same height as the live
           product interface beside it. */
        .hero-illustrated .hi-lf-amb-photo{position:relative;border-radius:13px;overflow:hidden;aspect-ratio:16/6.5;background:#221a14;border:1px solid rgba(255,255,255,.14)}
        .hero-illustrated .hi-lf-amb-photo img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.94) contrast(.97)}
        .hero-illustrated .hi-lf-amb-badge{position:absolute;left:10px;bottom:10px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.95);color:#a4201d;font-size:.65rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
        .hero-illustrated .hi-lf-amb-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .hero-illustrated .hi-lf-amb-top .hi-lf-eyebrow{min-width:0}
        /* 2026-07-18: was a second red button (.hi-lf-founder-mini) in a card
           that already carries the big red apply CTA — two red buttons in one
           small card read as template chrome. Now a quiet text link. */
        .hero-illustrated .hi-lf-founder-quiet{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;text-decoration:none;font-size:.7rem;font-weight:700;color:var(--hi-ink-soft);border-bottom:1px dashed currentColor;padding-bottom:1px;transition:color .15s ease}
        .hero-illustrated .hi-lf-founder-quiet:hover{color:var(--hi-red)}
        .hero-illustrated .hi-lf-amb h2{font-family:var(--font-display);font-size:clamp(1.5rem,2.45vw,1.9rem);line-height:1.02;letter-spacing:-.02em;color:var(--hi-ink);margin:0}
        .hero-illustrated .hi-lf-amb-copy{font-size:1.02rem;line-height:1.4;color:var(--hi-ink-soft);margin:0}
        .hero-illustrated .hi-lf-amb-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:0}
        /* Chips stay on ONE compact line (they wrapped to two once the card
           narrowed and the type went up). */
        .hero-illustrated .hi-lf-amb .hi-path-meta{flex-wrap:nowrap;gap:8px}
        .hero-illustrated .hi-lf-amb .hi-path-meta span{font-size:.65rem;padding:4px 10px}
        .hero-illustrated .hi-lf-amb-wl{align-self:center;font-size:.7rem;font-weight:700;color:var(--hi-ink-dim,var(--text-dim));text-decoration:none;border-bottom:1px dashed currentColor;padding-bottom:1px;opacity:.85}
        .hero-illustrated .hi-lf-amb-wl:hover{color:var(--hi-red);opacity:1}
        .hero-illustrated .hi-lf-amb .hi-lf-cta{white-space:nowrap}
        /* BELOW LEFT — Voice AI sits with the live product path, not between columns. */
        /* Founding-card photo rotator: two real shots crossfade on a 10s
           cycle with a slow zoom. First frame lands mid-fade-in (negative
           delay) so there is no blank flash on load. */
        .hero-illustrated .hi-lf-amb-photo--live img{position:absolute;inset:0;opacity:0;animation:hiAmbFade 10s linear infinite,hiAmbKen 10s linear infinite}
        .hero-illustrated .hi-lf-amb-photo--live img:nth-child(1){animation-delay:-1s,-1s}
        .hero-illustrated .hi-lf-amb-photo--live img:nth-child(2){animation-delay:4s,4s}
        @keyframes hiAmbFade{0%{opacity:0}10%{opacity:1}50%{opacity:1}60%{opacity:0}100%{opacity:0}}
        @keyframes hiAmbKen{0%{transform:scale(1.02)}60%{transform:scale(1.1)}100%{transform:scale(1.1)}}
        @media (prefers-reduced-motion: reduce){
          .hero-illustrated .hi-lf-amb-photo--live img{animation:none !important;opacity:0}
          .hero-illustrated .hi-lf-amb-photo--live img:first-child{opacity:1}
        }
        .hero-illustrated .hi-lf-aistrip{display:flex;align-items:center;justify-content:center;gap:16px;width:100%;min-height:104px;margin:0;padding:9px 18px;border-radius:14px;text-decoration:none;background:rgba(255,253,248,.9);border:1px solid var(--hi-card-line,rgba(29,25,21,.15));box-shadow:0 14px 34px rgba(29,25,21,.07);box-sizing:border-box;transition:border-color .15s ease,background .15s ease,transform .15s ease}
        .hero-illustrated .hi-lf-aistrip:hover{border-color:rgba(200,50,50,.5);background:#fff;transform:translateY(-2px);box-shadow:0 18px 44px rgba(200,50,50,.14)}
        .hero-illustrated .va-stage{flex:0 0 auto;width:74px;height:74px;border-radius:15px;display:grid;place-items:center;position:relative;overflow:hidden;background:radial-gradient(120% 90% at 50% 10%,rgba(255,255,255,.9),transparent 60%),linear-gradient(180deg,#fff3f0,#fbe2dc);border:1px solid rgba(200,50,50,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 10px 24px rgba(29,25,21,.10)}
        .hero-illustrated .hi-lf-amb-photo--voice{display:grid;place-items:center;background:radial-gradient(circle at 50% 12%,rgba(255,255,255,.96),rgba(255,241,237,.94) 48%,rgba(243,211,203,.92));border-color:rgba(200,50,50,.2)}
        .hero-illustrated .hi-lf-amb-photo--voice .va-stage{width:112px;height:112px;border-radius:999px}
        /* Her still fills the panel. --her only applies once the image
           actually loads; the onerror handler drops the class so the orb
           and gradient come back rather than leaving an empty frame. */
        /* Taller than the 16/6.5 the other ambient panels use, and the
           crop biased up: the source is 3:2 with Theodore's head near the
           top, so the shared letterbox ratio cut his face off. 16/8.6
           keeps ~80% of the frame height and 12% pulls the window up to
           clear his hair while holding the desk in shot. */
        .hero-illustrated .hi-lf-amb-photo--her{position:relative;overflow:hidden;background:#1a0d0a;aspect-ratio:16/8.6}
        .hero-illustrated .hi-lf-her-still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;display:block}
        .hero-illustrated .hi-lf-amb-photo--her .va-stage{display:none}
        .hero-illustrated .hi-lf-her-credit{position:absolute;right:9px;bottom:8px;z-index:2;
          font-size:.55rem;font-weight:600;letter-spacing:.02em;color:rgba(255,255,255,.82);
          text-shadow:0 1px 3px rgba(0,0,0,.6)}
        .hero-illustrated .hi-lf-amb-photo--her .hi-lf-amb-badge{z-index:2}
        .hero-illustrated .va-stage::after{content:"";position:absolute;left:14%;right:14%;bottom:9px;height:1px;background:linear-gradient(90deg,transparent,rgba(200,50,50,.45),transparent)}
        .hero-illustrated .va-eq{display:flex;align-items:flex-end;gap:4px;height:34px}
        .hero-illustrated .va-eq i{display:block;width:5px;border-radius:999px;background:linear-gradient(180deg,#e05a4a,#c83232);box-shadow:0 1px 3px rgba(200,50,50,.28);transform-origin:bottom;animation:vaEq 1.05s ease-in-out infinite}
        .hero-illustrated .va-eq i:nth-child(1){height:12px}
        .hero-illustrated .va-eq i:nth-child(2){height:20px;animation-delay:-.15s}
        .hero-illustrated .va-eq i:nth-child(3){height:28px;animation-delay:-.3s}
        .hero-illustrated .va-eq i:nth-child(4){height:34px;animation-delay:-.45s}
        .hero-illustrated .va-eq i:nth-child(5){height:26px;animation-delay:-.6s}
        .hero-illustrated .va-eq i:nth-child(6){height:18px;animation-delay:-.75s}
        .hero-illustrated .va-eq i:nth-child(7){height:11px;animation-delay:-.9s}
        @keyframes vaEq{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}
        .hero-illustrated .hi-lf-aistrip:hover .va-eq i{animation-duration:.55s}
        .hero-illustrated .va-kicker{font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--hi-red);margin-bottom:1px}
        .hero-illustrated .hi-lf-aistrip-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
        .hero-illustrated .hi-lf-aistrip-txt b{font-size:1.35rem;font-weight:800;color:var(--hi-ink);font-family:var(--font-body);line-height:1.08}
        .hero-illustrated .hi-lf-aistrip-txt span{font-size:.98rem;line-height:1.28;color:var(--hi-ink-soft)}
        /* The kicker IS a span, and the rule above sits later in source at
           equal specificity — without re-stating the size here it inherits
           the body size and the label renders as big as the description. */
        .hero-illustrated .hi-lf-aistrip-txt .va-kicker{font-size:.65rem;line-height:1.25}
        .hero-illustrated .hi-lf-aistrip-cta{flex:0 0 auto}
        @media(prefers-reduced-motion:reduce){.hero-illustrated .va-eq i{animation:none}}
        /* stacking: tablet + mobile */
        @media(max-width:900px){.hero-illustrated .hi-lf-grid{max-width:560px;margin:0 auto}.hero-illustrated .hi-lf-live{min-height:0}.hero-illustrated .hi-lf-amb .hi-lf-cta{white-space:normal}}
        @media(max-width:420px){.hero-illustrated .hi-lf-amb-top{align-items:flex-start;flex-direction:column;gap:8px}}
        @media(max-width:560px){
          .hero-illustrated .hi-doors--livefirst{width:100%;max-width:100%;padding:0 14px;box-sizing:border-box;overflow:hidden}
          .hero-illustrated .hi-lf-grid{width:100%;max-width:100%;gap:14px}
          .hero-illustrated .hi-lf-live,.hero-illustrated .hi-lf-amb,.hero-illustrated .hi-lf-aistrip{max-width:100%;box-sizing:border-box}
          .hero-illustrated .hi-lf-roombar{gap:6px;padding:11px 12px;font-size:.56rem;white-space:nowrap}
          .hero-illustrated .hi-lf-roombar .hi-lf-speeches{display:none}
          .hero-illustrated .hi-lf-roombar .hi-lf-roombar-spacer,
          .hero-illustrated .hi-lf-roombar .hi-lf-judged{display:none}
          .hero-illustrated .hi-lf-stage{gap:7px;padding:10px 12px 0}
          .hero-illustrated .hi-lf-tile{border-radius:10px;min-width:0}
          .hero-illustrated .hi-lf-motion{margin:8px 12px 0;padding:7px 10px;font-size:.8rem}
          .hero-illustrated .hi-lf-ticker-group{gap:20px;padding-right:20px}
          /* 2026-07-22: the head is a baseline flex row, and on a phone
             there is not room for "Motion · live market" AND the pot line
             beside it, so the label broke mid-phrase into "MOTION · LIVE /
             MARKET" and ran under the pot figure. Stack them: each gets
             its own line and neither wraps. */
          .hero-illustrated .hi-lf-mkt-head{flex-direction:column;align-items:flex-start;gap:2px}
          .hero-illustrated .hi-lf-mkt-vol{font-size:.58rem;margin-left:0}
          .hero-illustrated .hi-lf-mkt-chart{height:34px;margin-top:6px}
          .hero-illustrated .hi-lf-mkt-rows{gap:6px;margin-top:6px}
          .hero-illustrated .hi-lf-mkt-side{padding:6px 8px;gap:5px}
          .hero-illustrated .hi-lf-mkt-name{font-size:.66rem}
          .hero-illustrated .hi-lf-mkt-pct{font-size:.86rem}
          .hero-illustrated .hi-lf-judge{align-items:flex-start;margin:8px 12px 0;font-size:.64rem;line-height:1.28}
          .hero-illustrated .hi-lf-live-foot{padding:10px 12px 12px}
          .hero-illustrated .hi-lf-cta-row{display:grid;grid-template-columns:1fr;gap:8px}
          .hero-illustrated .hi-lf-cta-row .hi-lf-cta--primary{min-width:0}
          .hero-illustrated .hi-lf-aistrip{align-items:flex-start;justify-content:flex-start;flex-wrap:wrap;gap:10px;padding:12px}
          .hero-illustrated .va-stage{width:54px;height:54px;border-radius:12px}
          .hero-illustrated .hi-lf-amb-photo--voice .va-stage{width:78px;height:78px;border-radius:999px}
          .hero-illustrated .va-eq{height:22px;gap:3px}
          .hero-illustrated .va-eq i{width:4px}
          .hero-illustrated .hi-lf-aistrip-cta{width:100%;min-height:42px}
        }
      </style>
      <!-- 2026-08-01 (the founder): the hero live-room card was removed at his
           request. The .hi-doors--livefirst arm is gone, so the default
           doors slot renders nothing and the hero hands straight to the
           two standing offers below. ?doors=unified and ?doors=classic
           still resolve to their own markup for QA. -->
      <!-- 2026-08-24 per the founder: the whole three-card cluster under
           the hero is REMOVED. That was .hi-pair-row ("Debate the AI" and
           the Ambassador Fund side by side) plus .hi-band-row (the Open
           Spar Night banner at full width). He pointed at the three of
           them together on the rendered page, which is also why the
           image-only pass earlier the same day was the wrong read of the
           same screenshot.
           Nothing here was the only path to its destination: /newvoice is
           reached from the tour row's "Debate the AI" card and the
           Explore menu, /ambassadors from the footer and the More menu,
           and Open Spar Night still renders on /spar, which is where the
           queue actually is. js/spar-night.js scans for
           [data-spar-night] slots and returns early when there are none,
           so dropping the only slot on this page is a no-op rather than
           an error. The .hi-pair-row / .hi-band-row / .hi-spar-slot CSS
           is left in the style block above: restoring the cluster is
           markup only. -->
      <script>
        (function(){
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          var speaker = document.querySelector('.hi-lf-stage img[data-live-face-slot="speaker"]');
          var opponent = document.querySelector('.hi-lf-stage img[data-live-face-slot="opponent"]');
          if (!speaker || !opponent) return;
          var motion = document.querySelector('[data-live-motion-text]');
          var judge = document.querySelector('.hi-lf-judge-t');
          var motionTests = [
            { motion: 'Schools should ban phones during class.', clash: 'privacy vs distraction' },
            { motion: 'Cities should make public transit free.', clash: 'access vs cost' },
            { motion: 'AI art should be eligible for copyright.', clash: 'authorship vs innovation' },
            { motion: 'College admissions should end legacy preference.', clash: 'fairness vs alumni funding' },
            { motion: 'Social media platforms should verify all users.', clash: 'safety vs anonymity' },
            { motion: 'National service should be required after high school.', clash: 'civic duty vs freedom' },
            { motion: 'Schools should replace homework with supervised practice.', clash: 'equity vs independence' },
            /* 2026-09-09: a motion was removed from this bank rather than
               reworded. It asked a room to decide how a school should treat
               one group of children, which is the exact shape the 08-19
               exclusion rules out: contested is the goal, targeted is not.
               This bank is dormant (the hero live card was removed on
               08-01, so the rotator returns early and none of these have
               rendered since), and it is still a hardcoded motion bank on
               the highest-traffic page, so it is held to the same bar as
               the board. */
            { motion: 'Universities should remain neutral on political controversies.', clash: 'public trust vs moral leadership' },
            { motion: 'Social platforms should ban anonymous political accounts.', clash: 'accountability vs dissent' },
            { motion: 'Museums should return artifacts acquired under colonial rule.', clash: 'restitution vs stewardship' },
            { motion: 'Governments should ban social media for children under sixteen.', clash: 'child safety vs family choice' }
          ];
          try {
            var motionIdx = parseInt(localStorage.getItem('dit-live-motion-idx') || '-1', 10);
            motionIdx = (isNaN(motionIdx) ? -1 : motionIdx) + 1;
            motionIdx = motionIdx % motionTests.length;
            localStorage.setItem('dit-live-motion-idx', String(motionIdx));
            if (motion) motion.textContent = motionTests[motionIdx].motion;
            if (judge) judge.innerHTML = '<b>AI judge</b> flowing the round &middot; clash: ' + motionTests[motionIdx].clash + ' &middot; the verdict settles every call';
          } catch(e){}
          /* ── Market engine (2026-07-22) ─────────────────────────────
             Drives the featured-market card: a drifting Pro price with
             a 28-point history line, per-side fills, and a pot that
             ticks up. Names follow the face pairs; a new market seeds
             on every round swap. Pure illustration — no wallet, no
             endpoint. Reduced-motion never reaches this (the IIFE
             returns above), so those visitors keep the static market
             baked into the markup. */
          var mktLine = document.querySelector('[data-mkt-line]');
          var mktArea = document.querySelector('[data-mkt-area]');
          var mktDot = document.querySelector('[data-mkt-dot]');
          var mktProPct = document.querySelector('[data-mkt-pct="pro"]');
          var mktConPct = document.querySelector('[data-mkt-pct="con"]');
          var mktProFill = document.querySelector('[data-mkt-fill="pro"]');
          var mktConFill = document.querySelector('[data-mkt-fill="con"]');
          var mktProName = document.querySelector('[data-mkt-name="pro"]');
          var mktConName = document.querySelector('[data-mkt-name="con"]');
          var mktVol = document.querySelector('[data-mkt-vol]');
          var mktBackers = document.querySelector('[data-mkt-backers]');
          var mktNames = [
            ['Maya','Jake'],
            ['Priya','Sam'],
            ['Arjun','Leah'],
            ['Dana','Ines'],
            ['Theo','Zara']
          ];
          var mktPro = 62, mktVolN = 1284, mktBackersN = 37, mktWatchN = 214, mktHist = [];
          var mktWatchEl = document.querySelector('[data-live-watching]');
          function mktClamp(v){ return Math.max(12, Math.min(88, v)); }
          function renderMkt(){
            if (!mktLine) return;
            /* y-scale hugs the history's own range (with padding) so the
               line always fills the chart like a real price chart —
               a fixed 0-100 scale flattens a 45-55 drift to a hairline. */
            var lo = Math.min.apply(null, mktHist), hi = Math.max.apply(null, mktHist);
            var pad = Math.max(3, (hi - lo) * .15);
            lo -= pad; hi += pad;
            function yy(p){ return 37 - (p - lo) / (hi - lo) * 34; }
            var pts = [], n = mktHist.length, i;
            for (i = 0; i < n; i++) pts.push((i * (100 / (n - 1))).toFixed(2) + ',' + yy(mktHist[i]).toFixed(2));
            mktLine.setAttribute('points', pts.join(' '));
            if (mktArea) mktArea.setAttribute('d', 'M0,40 L' + pts.join(' L') + ' L100,40 Z');
            if (mktDot) mktDot.style.top = (yy(mktPro) / 40 * 100).toFixed(1) + '%';
            var p = Math.round(mktPro), c = 100 - p;
            if (mktProPct) mktProPct.textContent = p + '%';
            if (mktConPct) mktConPct.textContent = c + '%';
            if (mktProFill) mktProFill.style.width = p + '%';
            if (mktConFill) mktConFill.style.width = c + '%';
            if (mktVol) mktVol.textContent = mktVolN.toLocaleString('en-US');
            if (mktBackers) mktBackers.textContent = String(mktBackersN);
            if (mktWatchEl) mktWatchEl.textContent = String(mktWatchN);
          }
          function newMarket(pairIdx){
            if (!mktLine) return;
            var nm = mktNames[pairIdx % mktNames.length];
            if (mktProName) mktProName.textContent = nm[0];
            if (mktConName) mktConName.textContent = nm[1];
            mktHist = [];
            var v = 42 + Math.random() * 16;
            for (var i = 0; i < 28; i++) { v = mktClamp(v + (Math.random() * 11 - 5)); mktHist.push(v); }
            mktPro = mktHist[mktHist.length - 1];
            mktVolN = 600 + Math.floor(Math.random() * 1800);
            mktBackersN = 18 + Math.floor(Math.random() * 40);
            mktWatchN = 120 + Math.floor(Math.random() * 260);
            renderMkt();
          }
          function tickMkt(){
            if (document.hidden || !mktLine) return;
            mktPro = mktClamp(mktPro + (Math.random() * 7 - 3.5));
            mktHist.push(mktPro);
            if (mktHist.length > 28) mktHist.shift();
            mktVolN += 2 + Math.floor(Math.random() * 13);
            if (Math.random() < .4) mktBackersN += 1;
            if (Math.random() < .5) mktWatchN += Math.round(Math.random() * 6 - 2.6);
            renderMkt();
          }
          newMarket(0);
          setInterval(tickMkt, 1700);
          var pairs = [
            ['/img/round/faces/face02.jpg','/img/round/faces/face07.jpg'],
            ['/img/round/faces/face10.jpg','/img/round/faces/face11.jpg'],
            ['/img/round/faces/face16.jpg','/img/round/faces/face19.jpg'],
            ['/img/round/faces/face24.jpg','/img/round/faces/face28.jpg'],
            ['/img/round/faces/face33.jpg','/img/round/faces/face41.jpg']
          ];
          pairs.forEach(function(pair){
            pair.forEach(function(src){
              var img = new Image();
              img.src = src;
            });
          });
          var idx = 0;
          // 2026-07-22: slowed per the founder. The tiles are meant to read as a
          // room you glance into, not a slideshow; at a 12s cycle with a
          // 230ms cut the pair visibly flicked while you were still reading
          // the motion under them.
          var fadeMs = 420;
          var staggerMs = 7000;
          var cycleMs = 21000;
          function swapFace(img, src){
            if (!img || !src || img.getAttribute('src') === src) return;
            img.classList.add('is-swapping');
            setTimeout(function(){
              img.src = src;
              img.classList.remove('is-swapping');
            }, fadeMs);
          }
          function swapRound(){
            if (document.hidden) return;
            idx = (idx + 1) % pairs.length;
            var next = pairs[idx];
            newMarket(idx);
            swapFace(speaker, next[0]);
            setTimeout(function(){
              if (document.hidden) return;
              swapFace(opponent, next[1]);
            }, staggerMs);
          }
          setTimeout(function(){
            swapRound();
            setInterval(swapRound, cycleMs);
          }, 4200);
        })();
      </script>

      <div class="hi-doors hi-doors--unified">
      <p class="hi-choose">Pick how you start</p>
      <div class="hi-triptych" aria-label="Choose how to start">
        <a href="/spar" class="hi-path-card hi-path-card--live" data-cta="hero-triptych-live">
          <div class="hi-path-visual" aria-hidden="true">
            <span class="hi-live-pill"><i aria-hidden="true"></i>Live</span>
            <div class="hi-live-tiles">
              <img src="/img/round/faces/face03.jpg" alt="" loading="lazy" decoding="async" /><img src="/img/round/faces/face08.jpg" alt="" loading="lazy" decoding="async" /><img src="/img/round/faces/face12.jpg" alt="" loading="lazy" decoding="async" />
            </div>
          </div>
          <span class="hi-path-eyebrow"><i aria-hidden="true"></i>With people</span>
          <h2>Debate real people.</h2>
          <p class="hi-path-copy">Post a motion, take a challenge, and get the AI judge's decision when the round ends.</p>
          <div class="hi-path-foot">
            <div class="hi-path-meta"><span>1v1</span><span>Live</span><span>Casual</span></div>
            <span class="hi-path-cta">Find a live round <span aria-hidden="true">&rarr;</span></span>
          </div>
        </a>
        <a href="/newvoice?handoff=landing-ai" class="hi-path-card hi-path-card--ai" data-cta="hero-triptych-ai">
          <div class="hi-path-visual hi-path-visual--ai" aria-hidden="true">
            <div class="hi-ai-core">
              <span class="hi-ai-ring hi-ai-ring--outer"></span>
              <span class="hi-ai-ring hi-ai-ring--mid"></span>
              <span class="hi-ai-node hi-ai-node--one"></span>
              <span class="hi-ai-node hi-ai-node--two"></span>
              <span class="hi-ai-node hi-ai-node--three"></span>
              <span class="hi-ai-disc"><span class="hi-ai-bars"><i></i><i></i><i></i><i></i><i></i></span></span>
              <span class="hi-ai-label"><i></i>AI ready</span>
            </div>
          </div>
          <span class="hi-path-eyebrow"><i aria-hidden="true"></i>With the AI</span>
          <h2>Take on the AI.</h2>
          <p class="hi-path-copy">The Samantha from Her, except it argues back. Speak out loud, get argued with, get a decision.</p>
          <div class="hi-path-foot">
            <div class="hi-path-meta"><span>Instant</span><span>Voice</span><span>Casual 1v1</span></div>
            <span class="hi-path-cta">Start a voice round <span aria-hidden="true">&rarr;</span></span>
          </div>
        </a>
        <a href="/ambassadors" class="hi-path-card hi-path-card--ambassadors" data-cta="hero-triptych-ambassadors">
          <div class="hi-path-visual" aria-hidden="true">
            <div class="hi-amb-photo"><img src="/img/ambassadors/clubnight.jpg" alt="" loading="lazy" decoding="async" /></div>
          </div>
          <span class="hi-path-eyebrow"><i aria-hidden="true"></i>With us</span>
          <h2>Bring it to your school.</h2>
          <p class="hi-path-copy">Run rounds, onboard your school, help the next one start. Paid, part-time.</p>
          <div class="hi-path-foot">
            <div class="hi-path-meta"><span>Paid</span><span>Remote</span><span>2026-27</span></div>
            <span class="hi-path-cta">Apply for a seat <span aria-hidden="true">&rarr;</span></span>
          </div>
        </a>
      </div>
      </div><!-- /.hi-doors--unified -->

      <!-- Classic (control) arm. Exact pre-2026-07-07 triptych. Namespaced
           hio-* layout classes; orb internals reuse the shared hi-ai-* set.
           Hidden unless html[data-doors-ab="classic"]. -->
      <div class="hi-doors hi-doors--classic">
      <div class="hio-triptych" aria-label="Choose how to start">
        <a href="/spar" class="hio-path-card hio-path-card--live" data-cta="hero-triptych-live">
          <span class="hio-live-pill"><i aria-hidden="true"></i>Live</span>
          <div class="hio-live-tiles" aria-hidden="true">
            <img src="/img/round/faces/face03.jpg" alt="" loading="lazy" decoding="async" /><img src="/img/round/faces/face08.jpg" alt="" loading="lazy" decoding="async" /><img src="/img/round/faces/face12.jpg" alt="" loading="lazy" decoding="async" />
          </div>
          <div>
            <span class="hio-path-eyebrow">Live debates</span>
            <h2>Debate real people.</h2>
            <p class="hio-path-copy">Post a motion, accept a challenge, and get the AI judge's decision when the round ends.</p>
          </div>
          <div class="hio-path-meta"><span>1v1</span><span>Live</span><span>Casual</span></div>
          <span class="hio-path-cta">Open live debates <span aria-hidden="true">&rarr;</span></span>
        </a>
        <a href="/newvoice?handoff=landing-ai" class="hio-path-card hio-path-card--ai" data-cta="hero-triptych-ai">
          <div class="hio-ai-core" aria-hidden="true">
            <span class="hi-ai-ring hi-ai-ring--outer"></span>
            <span class="hi-ai-ring hi-ai-ring--mid"></span>
            <span class="hi-ai-node hi-ai-node--one"></span>
            <span class="hi-ai-node hi-ai-node--two"></span>
            <span class="hi-ai-node hi-ai-node--three"></span>
            <span class="hi-ai-disc"><span class="hi-ai-bars"><i></i><i></i><i></i><i></i><i></i></span></span>
            <span class="hi-ai-label"><i></i>AI ready</span>
          </div>
          <div>
            <span class="hio-path-eyebrow">Debate the AI</span>
            <h2>Tap the orb. Take a side.</h2>
            <p class="hio-path-copy">Speak against an AI opponent in a timed voice round. It pushes back, tracks clash, and decides who won.</p>
          </div>
          <span class="hio-path-cta">Start AI debate <span aria-hidden="true">&rarr;</span></span>
        </a>
        <a href="/ambassadors" class="hio-path-card hio-path-card--ambassadors" data-cta="hero-triptych-ambassadors">
          <div class="hio-amb-photo" aria-hidden="true"><img src="/img/ambassadors/clubnight.jpg" alt="" loading="lazy" decoding="async" /></div>
          <div>
            <span class="hio-path-eyebrow">Ambassadorships</span>
            <h2>Bring Debatable to your community.</h2>
            <p class="hio-path-copy">Founding student ambassadors run rounds, onboard schools, and help the next program start. Paid, part-time.</p>
          </div>
          <div class="hio-path-meta"><span>2026-27</span><span>Remote</span><span>Paid</span></div>
          <span class="hio-path-cta">Apply for the founding class <span aria-hidden="true">&rarr;</span></span>
        </a>
      </div>
      </div><!-- /.hi-doors--classic -->
      <!-- 2026-05-26: headline + primary-CTA rotators. The H1 cycles
           through four short taglines so the hero reads as a moving
           statement rather than a single locked claim; the primary
           button rotates across the four strongest "do something now"
           destinations (voice solo, human spar, AI exhibition, public
           room) so the surface advertises the whole product, not one
           entry. Honors prefers-reduced-motion; no-JS visitors keep
           the static first slot (canonical SEO copy). NOTE: this script
           tag sits ABOVE the .hi-cta-primary anchor in the document, so
           the init must defer to DOMContentLoaded — otherwise the
           querySelector for the CTA fires before the anchor is parsed
           and returns null, while the headline (which IS above this
           script) is found just fine. Found the asymmetry the hard way. -->
      <script>
        (function(){
          if (typeof window === 'undefined') return;
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

          // Headline pool. Each entry = [lead text, italic-red accent].
          // First entry MUST match the static markup so the initial
          // paint is stable; rotation starts from index 1.
          //
          // 2026-05-27 hard reset on phrasing: dropped "Argue with
          // anyone" (too buddy-coded) and "Find a round" (queue-feature
          // weak). Each headline now distills a different facet of the
          // craft — claim, cognition, practice, rhetorical job,
          // structural commitment. Debate is speech on top of strategic
          // articulation, thinking, and analysis. The headlines should
          // honor that, not gamify it.
          var HEADLINES = [
            ['Practice under', 'pressure.'],    // the wedge
            ['Everything is',  'debatable.'],   // the claim
            ['Sharpen every',  'argument.'],    // the practice
            ['Make the',       'case.'],        // the rhetorical job
            ['Defend a',       'position.']     // the structural commitment
          ];

          // CTA pool. label + href + GA cta tag. First entry MUST match
          // the static <a> so SSR + no-JS clicks still land somewhere
          // sensible. Rotation starts from index 1.
          //
          // 2026-05-27: tightened "Watch AI debate AI" → "Watch an
          // exhibition round" (the route name is /exhibition; the
          // craft term is "exhibition" or "demonstration round";
          // "AI debate AI" read as a sideshow rather than a study
          // surface). "Join the next round" → "Step into a live
          // round" — same destination, more deliberate verb.
          // 2026-06-01 pro-spar reset per the founder "too much, needs to be
          // pro spar more." Pool reordered + trimmed 5 → 3:
          //   - "Spar with a human" → /spar is index 0 (matches the
          //     pinned static markup above; rotation cycles around it)
          //   - "Start a live round" → /newvoice is the AI entry
          //   - "Watch an exhibition round" → /exhibition kept as the
          //     "show me what a round looks like" entry
          //   - DROPPED: "Step into a live round" → /live duplicated
          //     /spar after the 2026-05-27 reroute, so cycling both
          //     read as repetition
          //   - DROPPED: "Get a certificate in argumentation skills"
          //     → /credentials is still in the topbar and footer;
          //     pulling it from the hero rotation reduces visual
          //     noise without hiding the surface
          var CTAS = [
            ['Spar with a human',          '/spar',         'hero-illustrated-primary'],
            ['Start a live round',         '/newvoice?handoff=landing-illustrated', 'hero-illustrated-voice'],
            ['Pick a topic',                '/topics',       'hero-illustrated-practice']
          ];

          function init(){
            var headline = document.querySelector('.hero-illustrated .hi-headline[data-hi-rotates="headline"]');
            var cta      = document.querySelector('.hero-illustrated .hi-cta-primary[data-hi-rotates="cta"]');
            var ctaLabel = cta && cta.querySelector('.hi-cta-primary-label');
            if (!headline && !cta) return;

            var headlineIdx = 0;
            var ctaIdx = 0;

            // Two-phase slide-up swap. CSS @keyframes own the timing;
            // JS just toggles classes and waits for the keyframe
            // duration (.36s + a tick) before swapping content and
            // starting the entry animation. forwards fill on both
            // keyframes means we can keep the class on through the
            // hold phase without flicker.
            function animSwap(target, apply){
              target.classList.add('hi-rotating-out');
              setTimeout(function(){
                apply();
                target.classList.remove('hi-rotating-out');
                target.classList.add('hi-rotating-in');
                setTimeout(function(){
                  target.classList.remove('hi-rotating-in');
                }, 380);
              }, 380);
            }

            function swapHeadline(){
              if (document.hidden) return; // skip DOM work in a backgrounded tab
              if (!headline) return;
              headlineIdx = (headlineIdx + 1) % HEADLINES.length;
              var next = HEADLINES[headlineIdx];
              animSwap(headline, function(){
                var lead = headline.querySelector('.hi-headline-lead');
                var accent = headline.querySelector('.hi-headline-accent');
                if (lead)   lead.textContent   = next[0] + ' ';
                if (accent) accent.textContent = next[1];
              });
            }

            function swapCta(){
              if (document.hidden) return; // skip DOM work in a backgrounded tab
              if (!cta || !ctaLabel) return;
              ctaIdx = (ctaIdx + 1) % CTAS.length;
              var next = CTAS[ctaIdx];
              /* Animate the label span (transform on inline-block);
                 href + data-cta attrs swap on the parent anchor in the
                 same frame so the click target reflects the visible
                 label at all times. */
              animSwap(ctaLabel, function(){
                ctaLabel.textContent = next[0];
                cta.setAttribute('href', next[1]);
                cta.setAttribute('data-cta', next[2]);
              });
            }

            // Headline cycles every 5.4s; CTA every 6.8s — different
            // periods so they rarely swap on the same tick.
            // 2026-05-27 perf: intervals now held in an array so the
            // IntersectionObserver below can clear them when the
            // hero scrolls off-screen. The rotation is purely
            // decorative; ticking it while the user is reading the
            // FAQ ~7000px down is wasted main-thread work.
            var rotatorTimers = [];
            rotatorTimers.push(setInterval(swapHeadline, 5400));
            rotatorTimers.push(setInterval(swapCta,      6800));

            // Creed rotator. Voice-of-the-builder anchor sitting
            // between the stage and the CTA row. Canonical first
            // entry is the "antagonist and tool, not the Messiah"
            // stance per decision-log 2026-05-19 / 2026-05-23 — it
            // stays index 0 so the static markup matches and the
            // first paint is stable. The rest of the pool shares
            // the same shape (short, "what this is vs what it isn't",
            // honors the craft) but each lands a different facet of
            // the same stance: training signal, objective function,
            // medium, the inversion.
            //
            // <b> wrap is the emphasis hook the CSS upgrades from
            // italic-faded to upright-ink. Used sparingly.
            var CREEDS = [
              'AI as antagonist and tool. <b>Not the Messiah</b>, nor an arbitrary enemy.',
              'An assistant smooths it over. <b>An opponent finds the weakest joint.</b>',
              'Helpful is one objective function. <b>Adversarial is another.</b>',
              'We’re building the <b>opposite of the yes-machine.</b>',
              'Voice is not a UI layer. <b>It’s the medium.</b>'
            ];
            var creed = document.querySelector('.hero-illustrated .hi-creed');
            if (creed) {
              var creedIdx = 0;
              function swapCreed(){
                if (document.hidden) return; // skip DOM work in a backgrounded tab
                creedIdx = (creedIdx + 1) % CREEDS.length;
                creed.classList.add('is-fading');
                setTimeout(function(){
                  creed.innerHTML = CREEDS[creedIdx];
                  creed.classList.remove('is-fading');
                }, 440);
              }
              // 9.4s cadence — slower than headline/CTA so the
              // creed reads as an anchor, not a marquee. Different
              // period from both other rotators so triple-tick
              // swaps are rare.
              rotatorTimers.push(setInterval(swapCreed, 9400));
            }

            // Pause rotators + CSS animations on the illustrated stage
            // when the hero scrolls out of the viewport. Cheap perf
            // win on Chrome (the SVG keyframes were ticking under the
            // compositor even when the user was 4000px down). Restart
            // intervals when the hero re-enters so a scroll-up keeps
            // the rotation alive.
            var heroRoot = document.querySelector('.hero-illustrated');
            if (heroRoot && 'IntersectionObserver' in window) {
              var io = new IntersectionObserver(function(entries){
                entries.forEach(function(e){
                  if (e.isIntersecting) {
                    heroRoot.classList.remove('hi-paused');
                    if (rotatorTimers.length === 0) {
                      rotatorTimers.push(setInterval(swapHeadline, 5400));
                      rotatorTimers.push(setInterval(swapCta,      6800));
                      if (creed) rotatorTimers.push(setInterval(swapCreed, 9400));
                    }
                  } else {
                    heroRoot.classList.add('hi-paused');
                    rotatorTimers.forEach(function(t){clearInterval(t);});
                    rotatorTimers = [];
                  }
                });
              }, { threshold: 0, rootMargin: '120px 0px' });
              io.observe(heroRoot);
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
          } else {
            init();
          }
        })();
      </script>


      <!-- Primary CTA + three secondary destinations. The pill rail in
           the editorial arm scattered eight pills; the brief explicitly
           asks for one primary + a tight secondary row.
           2026-05-26: the primary CTA itself rotates across the four
           strongest "do something now" destinations — voice round, human
           sparring, AI exhibition, public room — so the button reflects
           the full surface area of the product rather than locking on a
           single entry. Rotation pool + interval live in the script
           further down; the static markup is the first slot. -->
      <!-- The #heroIllusGoogle delegate IIFE was removed 2026-08-12 with
           the sign-in strip it served. The hidden #googleSignupBtn it
           delegated to is still live and still used by the topbar and
           nudge paths. -->
      <!-- Status row removed 2026-06-12 (declutter pass): the proof
           note under the subhead carries real numbers and the room mock
           carries the LIVE signal; three more pulsing dots was noise. -->
    </div>

    <!-- ── 2026-05-11 editorial redesign ──
         New centerpiece: editorial headline, two CTAs, large user / AI /
         judge rebuttal card. The OLD orb + chat-split layout still
         lives below in the DOM (hidden by CSS) so the auth IIFE that
         hooks #googleSignupBtn / heroBetaChat* doesn't lose its
         targets — the typing animation IDs are read by the script
         further down and reused as data nodes for the new rebuttal
         demo. Don't reorder these. -->
    <div class="editorial-hero">
      <!-- 2026-05-18: the "Public beta · Updating daily · 10 formats"
           eyebrow was reading as crowded chrome above the headline.
           Removed per user feedback; beta state still surfaces in the
           pricing FAQ and the floating upgrade-cta. -->
      <!-- 2026-05-20: hero headline rotates per page load across three
           taglines. The static markup keeps the canonical "Debate an AI
           opponent / out loud." copy as the SEO + no-JS fallback (it is
           also one of the three rotation variants, so nothing contradicts).
           The inline script below runs synchronously right after the <h1>
           so the swap lands before first paint, the same flash-free pattern
           as the early-paint theme script. Each load fires a
           hero_headline_view GA event so the variants stay segmentable
           (which tagline a converting session saw). Per-load random, NOT
           sticky per-visitor: the ask is rotation on every load. -->
      <!-- 2026-05-26 (rev11): explainer eyebrow removed per user. The
           headline + mantra carry the surface; the four-word eyebrow
           was a redundant SEO restatement that the hero doesn't need.
           CSS rules for .hero-explainer-eyebrow left in the stylesheet
           as dead weight that the next sweep can prune. -->
      <!-- <p class="hero-explainer-eyebrow">Voice-first AI debate practice.</p> -->
      <!-- 2026-05-26 (rev5): collapsed the triple-chant mantra to a
           single "Debatable." Reason: the repetition read as accidental
           duplication, not intentional rhythm — the rest of the page
           was already pulling toward editorial restraint, and the triple
           was the loudest violation of that direction. The brand verb
           still dominates (mantra slot left in the rotation with the
           single word so it remains the weighted variant); other
           variants stay in the pool so the page still rotates. -->
      <!-- 2026-07-22: h1 -> p (same reason as .hi-slogan above: .fs-h1 is
           the page's one h1; this arm is A/B chrome). The standalone
           .hero-headline selector carries the full style block. -->
      <p class="hero-headline" id="heroHeadline">
        Debatable.
      </p>
      <!-- 2026-05-26 (rev12): RE-ADDED hero-subhead — parallel commits
           removed the <p class="hero-subhead"> sibling that explained
           the product under the mantra. Without it, the chant has no
           context (rhythm without meaning). Per the founder's prior
           direction "edit the description to sound more like the founder"
           the line is: three short clauses, parallel rhythm, debater-
           register, no buzzwords. -->
      <p class="hero-subhead">Debate an AI or a real person in timed rounds. An AI judge decides who won, and says why.</p>
      <script>
        (function(){
          // 2026-05-26 (rev5): mantra variant weighted 3x so the "Debate
          // it." word is the modal first-paint headline, but the accent
          // span is now empty so the headline lands as a single,
          // confident verb instead of a chant.
          var VARIANTS=[
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'debatable_mantra', lead:'Debatable.', accent:''},
            {key:'out_loud', lead:'Debate an AI opponent', accent:'out loud.'},
            {key:'rethink',  lead:'Rethink',               accent:'argumentation.'},
            // 'filling' carries no accent: .hh-accent is display:block, which
            // on a ~375px screen forced "gap." onto its own line with an ugly
            // gap above two short words. As one flowing string it wraps
            // naturally instead.
            {key:'filling',  lead:'Filling the gap.',      accent:''},
            // 'omegle' renamed 2026-05-26: the /debate-chat page that
            // owned the "Omegle of debate" framing was retired and now
            // 301s to /spar. The headline rotation keeps the slot but
            // points at the matchmaker's actual job: spawning live
            // human-vs-human rounds on demand. Key kept for GA event
            // continuity.
            // 2026-05-26 (rev15): "Live spawn / into debates." -> "Live
            // debates." per the founder "live debates (correct to this)." Spawn
            // verb was meta-developer-speak; the page already has a
            // mantra elsewhere — this variant should just name the thing.
            // Key kept for GA event continuity.
            {key:'omegle',   lead:'Live debates.',          accent:''},
            {key:'trust_ai', lead:'Trust AI over',         accent:'human judgment?'},
            // 'debatable' (added 2026-05-26): the personality word from the
            // three-word brand system (product = Debatable · personality =
            // Debatable · CTA = Debatable). Keeps the "Debatable" identity
            // surfaced as one of the rotating headlines without making it
            // the canonical product name.
            {key:'debatable', lead:'Everything is',        accent:'debatable.'}
          ];
          try{
            var h=document.getElementById('heroHeadline');
            if(!h)return;
            var v=VARIANTS[Math.floor(Math.random()*VARIANTS.length)];
            // textContent (not innerHTML) keeps this injection-proof. When a
            // variant has an accent, it's rebuilt as a .hh-accent span so the
            // display:block line break + Fraunces styling carry over; variants
            // with no accent render as a single flowing headline.
            h.textContent = v.accent ? v.lead+' ' : v.lead;
            if(v.accent){
              var span=document.createElement('span');
              span.className='hh-accent';
              span.textContent=v.accent;
              h.appendChild(span);
            }
            window.__heroHeadline=v.key;
            if(window.dosTrack)window.dosTrack('hero_headline_view',{variant:v.key});
          }catch(e){}
        })();
      </script>
      <!-- 2026-05-24: removed leftover messianic creed paragraph
           ("AI as antagonist and tool. Not the Messiah, nor an arbitrary enemy.")
           that survived the 2026-05-19 hero rewrite. The rewrite swapped
           the h1 + creed for the more physical "Debate an AI opponent
           out loud." headline + the three-trust-block below, but the
           .hero-creed <p> got missed in the diff. Killing it now so the
           hero reads as the headline → CTA pair the rewrite intended,
           not headline → leftover creed → CTAs. -->
      <div class="hero-ctas">
        <!-- 2026-05-24: "Debatable" primary CTA removed per user.
             The pill rail below carries Prep / Adaptive voice / Live
             debates / Find a partner at equal weight; the orb card
             on the right is itself a clickable entry to /voice-debate
             (its own "Start a voice round" CTA still lives there).
             The account chooser remains as the single hero button so
             returning users have a one-tap path back to their rounds. -->
        <!-- Sign in or create account. Reuses the existing landing Firebase flow:
             #heroGoogleSignup is already wired (see the DOMContentLoaded
             handler below) to delegate to the hidden #googleSignupBtn that
             the Firebase IIFE binds to triggerGoogleSignIn() (popup, with
             signInWithRedirect fallback, GA-tracked, lands on /app#chat).
             No new auth logic; .btn-editorial-google styling already exists.
             Hidden for already-signed-in users by the onAuthStateChanged
             handler in the Firebase IIFE so the hero doesn't show a
             redundant sign-in CTA. -->
        <button id="heroGoogleSignup" type="button" class="btn-editorial btn-editorial-google" data-cta="hero-signin">
          Sign in or create account
        </button>
      </div>


      <!-- Pill rail: three peer CTAs at equal weight. Per user direction
           2026-05-19, the rail is Prep / Adaptive voice / Find an
           online partner or opponent — no "Still being built" tail.
           "Adaptive voice" replaces the prior "Voice" so the label
           describes what the feature does (the AI adapts to your
           style across rounds) instead of just naming a modality.
           2026-05-19 PM: a small "New" chip is reattached to the
           Adaptive voice pill to flag it as the recently-shipped
           feature, since users testing the page weren't noticing it
           as different from the typed product. -->
      <!-- 2026-05-26 (rev2): pill rail split into primary + secondary
           tiers. Old single rail was flat — five pills at equal weight
           reading as "feature soup" with no clear hero action. New
           split: PRIMARY row (Adaptive voice + Debate Omegle, both =
           the two live-spawning entry points) sits prominent. SECONDARY
           row (Prep / Scheduled / Credential, the supporting paths)
           sits below in a quieter treatment. Reads as a hierarchy, not
           a menu. -->
      <p class="hero-building-note">still building. updating website every day.</p>
      <!-- 2026-07-01: removed the hero live-usage counters — heroOnlineCount
           ("N online in the last 5 minutes") and heroBookmarkCount ("N signed
           in with Google so far ... goal is many thousands"). A live-debate
           product whose hero advertises tiny real-time counts reads as a
           cold-start signal to the exact people we most want to convince.
           The presence-heartbeat IIFE that fed them is disabled below. -->

      <!-- Founding-cohort CTA. Reveals to signed-out visitors only;
           body.signed-in hides it via CSS. Click delegates to the
           hidden #googleSignupBtn (the existing Firebase IIFE wires
           its real handler; signInWithPopup → redirect fallback).
           Falls back to /app#chat if the button isn't on the page. -->
      <button type="button" id="heroFoundingCohortCta" class="hero-founding-cta" data-gtag="hero_founding_cohort">
        <!-- 2026-05-26 (rev17): the parallel agent had shipped "Sign in.
             50 free rounds a month." here; my 50->10 cap revert (commit
             a7afb0e) added the corrected "10 free rounds" span without
             removing the original, leaving TWO sibling <span>s rendering
             side-by-side as "Sign in. 50 free rounds a month. Sign in.
             10 free rounds. No card." on mobile. Removed the stale 50/mo
             span. Single CTA reads "Sign in. 10 free rounds. No card." -->
        <span>Sign in. <span class="hfc-em">10 free rounds</span> to start.</span>
        <svg class="hfc-arrow" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
          <path d="M2 7 L11 7 M7 3 L11 7 L7 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <!-- 2026-05-26 (rev6): "No card." dropped from the CTA; the
           original messianic creed restored beneath it as a thesis-
           line. This is the same creed the 2026-05-23 soul.md note
           said was kept "by design" — it slipped out of the hero in
           the 2026-05-24 sweep (see comment block above); user
           explicitly asked to frame the sign-in with it instead of
           the meter-y "No card." microcopy. Italic Fraunces, quiet
           dim-text color, sits as a quote, not a CTA. -->
      <script>
        (function(){
          var btn = document.getElementById('heroFoundingCohortCta');
          if (!btn) return;
          btn.addEventListener('click', function(e){
            e.preventDefault();
            try {
              if (window.gtag) window.gtag('event', 'hero_founding_cohort_click');
            } catch(_){}
            var realBtn = document.getElementById('googleSignupBtn');
            if (realBtn) { realBtn.click(); return; }
            window.location.href = '/practice';
          });
        })();
      </script>
      <div class="hero-pill-rail hero-pill-rail--primary" role="navigation" aria-label="Primary actions">
        <a href="/newvoice?handoff=landing-voice-pill" class="hero-pill hero-pill--primary" data-voice-cta-on>Voice debate</a>
        <a href="/practice" class="hero-pill hero-pill--primary" data-voice-cta-off hidden style="display:none">
          Voice at capacity
        </a>
        <!-- 2026-05-25: collapsed the prior two pills ("Find an online
             partner or opponent" + "Debate Omegle") into one. /spar is
             the canonical human-matchmaking spawning page (queue +
             waitlist marketplace). /debate-chat still exists as its
             own page; reachable via footer. -->
        <a href="/spar" class="hero-pill hero-pill--primary" data-cta="hero-online-video-debates">Online video debates</a>
      </div>
      <div class="hero-pill-rail hero-pill-rail--secondary" role="navigation" aria-label="Other ways to debate">
        <a href="/practice" class="hero-pill hero-pill--secondary">Practice</a>
        <span class="hero-pill-sep" aria-hidden="true">·</span>
        <a href="/live" class="hero-pill hero-pill--secondary hero-pill-live"><span class="hero-pill-live-dot" aria-hidden="true"></span>Scheduled debates</a>
        <span class="hero-pill-sep" aria-hidden="true">·</span>
        <a href="https://discord.gg/WMHZW9BKvJ" target="_blank" rel="noopener noreferrer" class="hero-pill hero-pill--secondary" data-cta="hero-discord">Discord times + forums</a>
        <span class="hero-pill-sep" aria-hidden="true">·</span>
        <a href="/credentials" class="hero-pill hero-pill--secondary" data-cta="hero-credentials">Earn a credential</a>
        <span class="hero-pill-sep" aria-hidden="true">·</span>
        <a href="/pricing" class="hero-pill hero-pill--secondary" data-cta="hero-free-vs-paid">Free vs Paid</a>
        <!-- 2026-05-24: rail trimmed 8 → 6 per "too many" feedback.
             Cut: Debate online + Debate an AI (SEO hub pages, still
             reachable via the footer; they bloat
             the hero without being primary user paths). -->
        <!-- 2026-07-05: Free vs Paid pill added when its topbar tab came
             off the bar the same day ("advertise this somehow else").
             One pill, data-cta tagged, so its pull is measurable. -->
      </div>
      <script>
        // 2026-08-31: the #heroBookmarkCount / #heroSparWeekNote IIFE
        // that used to sit here was DELETED. Both target elements left
        // the markup on 2026-07-01, so it had been a dead fetch, and it
        // carried a 2x presentation multiplier on liveSearchesWeek,
        // which the founder's real-numbers sweep retires. The live
        // sign-up transparency line now renders under the globe from
        // the same /api/public-join-history payload, unmultiplied.

      </script>

      <!-- 2026-05-24: small cue toward the founder story. 2026-07-06:
           the founder strip moved off the landing to /story, so the
           in-page scroll anchor became a page link. Sits in its own
           "founder" grid area on desktop, flows naturally on mobile. -->
      <a href="/story" class="hero-founder-cue" data-cta="hero-founder-cue" aria-label="Read the founding story and team">
        <span class="hfc-label">Founding story + community</span>
        <svg class="hfc-arrow" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2 L7 11 M3 8 L7 12 L11 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>

      <!-- Right column of the editorial hero: voice orb card. -->
      <div class="hero-card-stack">
        <!-- 2026-05-24: orb card converted from <div> to <a> pointing
             at /voice-debate.html so clicking the orb starts a voice
             round. Per user: put more weight on Voice AI. A "LIVE
             VOICE" pulse pill rides at the top of the card and a
             "Start a voice round" pill sits under the caption, both
             reinforcing the interaction without competing with the
             headline. -->
        <a class="hero-orb-card" href="/spar" aria-label="Find a live opponent in Spar" data-gtag="hero_orb_spar">
          <span class="hero-orb-live" aria-hidden="true">Live online</span>
          <!-- 2026-05-24: silhouette debaters flank the orb so the landing
               scene matches the voice-debate setup screen — left = you
               (green head), right = AI (red head). Behind the canvas at
               z-index -1; hidden under 760px. -->
          <div class="standby-figures" aria-hidden="true">
            <!-- 2026-05-26 (rev2): sf-left restored. Per user feedback
                 the hero composition needed both debaters flanking the
                 orb to read as a live room rather than a one-sided
                 scene. The original removal was because the green head
                 clashed with the red brand world; now sf-left uses a
                 dusty crimson palette (see CSS) so both figures live
                 inside the brand color family while staying visually
                 distinct as two different speakers. -->
            <!-- 2026-05-27 redesign: editorial line-drawing debaters.
                 Both figures now carry their own non-mirrored geometry —
                 LEFT leans subtly forward with a raised gesture arm at
                 chest; RIGHT is more upright with both hands resting at
                 the podium. Heads are contour-only (no filled accent);
                 podiums are architectural rectangles, not cartoon
                 trapezoids; tie is a thin red sliver; throat + mic
                 carry slow speaking-pulses. -->
            <svg class="stage-debater sf-left" viewBox="0 0 200 460" role="presentation" focusable="false">
              <defs>
                <!-- soft head halation: gaussian-blurred so the circle reads
                     as ambient spotlight, not a hard shape. -->
                <filter id="halL" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5"/>
                </filter>
              </defs>
              <!-- architectural ground line shared with .sf-right's twin so
                   the two figures stand on the same plane. -->
              <path class="deb-ground" d="M-30 418 L230 418"/>
              <!-- soft floor shadow (grounds the figure, no red glow) -->
              <ellipse class="deb-shadow" cx="100" cy="436" rx="66" ry="3.2"/>
              <!-- architectural podium: tall slender rectangle with subtle perspective -->
              <path class="deb-stroke" d="M46 408 L56 308 L144 308 L154 408 Z"/>
              <!-- top plate edge: thin shadow line beneath top to imply depth -->
              <path class="deb-stroke deb-stroke-soft" d="M58 316 L142 316"/>
              <!-- subtle vertical seam, off-center for organic asymmetry -->
              <path class="deb-stroke deb-stroke-soft" d="M91 322 L91 402"/>
              <!-- mic: slim curved stem rising from podium top, with pulse glow + head -->
              <path class="deb-stroke" d="M126 312 Q116 290 104 274"/>
              <circle class="deb-mic-pulse" cx="104" cy="270" r="9"/>
              <circle class="deb-mic-head" cx="104" cy="270" r="3.4"/>
              <!-- body: elongated silhouette, slim suit -->
              <path class="deb-stroke" d="M62 154 Q82 138 100 134 Q120 138 140 154"/>
              <path class="deb-stroke" d="M62 154 Q56 218 64 274 Q70 296 78 308"/>
              <path class="deb-stroke" d="M140 154 Q146 218 138 274 Q132 296 124 308"/>
              <!-- single diagonal lapel left + right, meeting at sternum (no V) -->
              <path class="deb-stroke" d="M88 152 L100 198"/>
              <path class="deb-stroke" d="M114 152 L100 198"/>
              <!-- collar inner notch — soft second pass -->
              <path class="deb-stroke-soft" d="M94 148 L100 170 L108 148"/>
              <!-- tie: tapered fashion-sketch shape (knot at top, point at bottom) -->
              <path class="deb-tie" d="M96.4 170 L103.6 170 L101.2 226 L100 244 L98.8 226 Z"/>
              <!-- right arm: at side, hand resting near podium top -->
              <path class="deb-stroke" d="M139 158 Q150 200 144 252 Q140 282 132 304"/>
              <ellipse class="deb-hand" cx="132" cy="306" rx="5.6" ry="3.6"/>
              <!-- left arm: subtle forward gesture, hand near chest -->
              <g class="deb-arm">
                <path class="deb-stroke" d="M62 158 Q50 200 58 232 Q66 256 84 246"/>
                <ellipse class="deb-hand" cx="84" cy="248" rx="5.2" ry="3.4"/>
              </g>
              <!-- neck: two slim parallel lines -->
              <path class="deb-stroke" d="M92 116 L92 134"/>
              <path class="deb-stroke" d="M108 116 L108 134"/>
              <!-- soft halation behind the head (under the contour) -->
              <circle class="deb-halation" cx="100" cy="76" r="30" filter="url(#halL)"/>
              <!-- head: tall sculpted ovoid, contour only, with a doubled ghost
                   pass behind the primary stroke for hand-drawn doubled-line feel -->
              <g class="deb-head">
                <path class="deb-stroke-ghost" d="M82.4 70.5 Q81.4 48.5 100 46.4 Q118.4 48.5 117.4 70.5 Q117.4 92 111.4 105 Q105.4 112.4 100 112.4 Q94.6 112.4 88.6 105 Q82.4 92 82.4 70.5 Z"/>
                <path class="deb-stroke" d="M83 70 Q82 48 100 46 Q118 48 117 70 Q117 92 111 105 Q105 112 100 112 Q95 112 89 105 Q83 92 83 70 Z"/>
                <!-- minimal jaw indication -->
                <path class="deb-stroke-soft" d="M89 102 Q100 110 111 102"/>
                <!-- subtle hair contour at crown -->
                <path class="deb-stroke-soft" d="M88 55 Q100 50 112 55"/>
                <!-- faint ear arc on figure-left side -->
                <path class="deb-stroke-soft" d="M83 80 Q79 86 84 92"/>
              </g>
              <!-- speaking pulse at throat (slow breathing red glow) -->
              <circle class="deb-speak-pulse" cx="100" cy="128" r="4"/>
            </svg>
            <svg class="stage-debater sf-right" viewBox="0 0 200 460" role="presentation" focusable="false">
              <defs>
                <filter id="halR" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5"/>
                </filter>
              </defs>
              <path class="deb-ground" d="M-30 418 L230 418"/>
              <ellipse class="deb-shadow" cx="100" cy="436" rx="66" ry="3.2"/>
              <!-- podium (same architecture; seam mirrored for asymmetry) -->
              <path class="deb-stroke" d="M46 408 L56 308 L144 308 L154 408 Z"/>
              <path class="deb-stroke deb-stroke-soft" d="M58 316 L142 316"/>
              <path class="deb-stroke deb-stroke-soft" d="M109 322 L109 402"/>
              <!-- mic on the opposite side (LEFT-of-figure stem) so the
                   two debaters read as facing each other across the orb -->
              <path class="deb-stroke" d="M74 312 Q84 290 96 274"/>
              <circle class="deb-mic-pulse" cx="96" cy="270" r="9"/>
              <circle class="deb-mic-head" cx="96" cy="270" r="3.4"/>
              <!-- body: slightly more upright posture — squarer shoulder line,
                   less torso taper -->
              <path class="deb-stroke" d="M60 152 Q80 137 100 133 Q120 137 140 152"/>
              <path class="deb-stroke" d="M60 152 Q54 218 62 274 Q68 296 76 308"/>
              <path class="deb-stroke" d="M140 152 Q146 218 138 274 Q132 296 124 308"/>
              <path class="deb-stroke" d="M88 150 L100 196"/>
              <path class="deb-stroke" d="M114 150 L100 196"/>
              <path class="deb-stroke-soft" d="M94 146 L100 168 L108 146"/>
              <!-- tapered tie (knot to point) -->
              <path class="deb-tie" d="M96.4 168 L103.6 168 L101.2 222 L100 240 L98.8 222 Z"/>
              <!-- both hands resting at podium edge (calm/reflective posture) -->
              <path class="deb-stroke" d="M60 156 Q48 200 56 252 Q60 286 70 306"/>
              <ellipse class="deb-hand" cx="70" cy="307" rx="5.4" ry="3.4"/>
              <path class="deb-stroke" d="M140 156 Q152 200 144 252 Q140 286 130 306"/>
              <ellipse class="deb-hand" cx="130" cy="307" rx="5.4" ry="3.4"/>
              <!-- neck slightly offset to imply a small head turn -->
              <path class="deb-stroke" d="M93 116 L93 134"/>
              <path class="deb-stroke" d="M109 116 L109 134"/>
              <!-- soft halation behind the head -->
              <circle class="deb-halation" cx="100" cy="74" r="30" filter="url(#halR)"/>
              <!-- head: subtly different ovoid so it doesn't read as mirror,
                   with doubled ghost contour pass behind the primary stroke -->
              <g class="deb-head">
                <path class="deb-stroke-ghost" d="M83.4 68.5 Q83.4 46.5 100 44.4 Q118.4 46.5 118.4 70.5 Q118.4 92 112.4 104 Q106.4 112.4 101 112.4 Q95.6 112.4 89.6 104 Q83.4 92 83.4 68.5 Z"/>
                <path class="deb-stroke" d="M84 68 Q84 46 100 44 Q118 46 118 70 Q118 92 112 104 Q106 112 101 112 Q96 112 90 104 Q84 92 84 68 Z"/>
                <path class="deb-stroke-soft" d="M90 100 Q101 109 112 100"/>
                <path class="deb-stroke-soft" d="M89 53 Q101 48 113 53"/>
                <!-- ear arc on the opposite (right) side -->
                <path class="deb-stroke-soft" d="M118 80 Q122 86 117 92"/>
              </g>
              <circle class="deb-speak-pulse" cx="100" cy="128" r="4"/>
            </svg>
          </div>
          <!-- 2026-05-26 rev4: faint connection paths from the orb
               center to each debater's head. Sits BEHIND the canvas
               (z-index:1, canvas is z-index:3 in the surrounding rules)
               so the orb dominates but the relationship between orb
               and debaters is visible. Two cubic Bezier curves with
               animated stroke-dashoffset for a slow signal-pulse. -->
          <svg class="hero-connect-paths" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
            <path class="hcp-left"  d="M 75 240 C 180 220, 240 210, 300 200"/>
            <path class="hcp-right" d="M 525 240 C 420 220, 360 210, 300 200"/>
          </svg>
          <!-- 2026-05-26 rev5: env-signal chips removed. They were
               three absolutely-positioned chips floating around the
               orb (top-left "online now," top-right "signed in,"
               bottom-left "214 ms voice"). Critique: "still feel
               randomly attached." Replaced with one compact status
               row sitting beneath the climax CTA, below — a single
               horizontal strip is one composition element, not three
               floaters with no anchor. -->
          <!-- hero-env-signals removed; hesActive / hesRooms IDs now
               live on the hero-status-row span elements below so the
               heartbeat script continues to update them. -->
          <!-- hesLatency intentionally dropped from the new status row
               — the number had no real source (it was decoration) and
               three chips read busier than two grounded metrics. -->
          <span hidden aria-hidden="true"><span id="hesLatency">214</span></span>
          <canvas class="hero-orb-canvas" id="heroOrbCanvas" aria-hidden="true"></canvas>
          <div class="hero-orb-standby">
            <span class="hero-orb-standby-dot" aria-hidden="true"></span>
            <span>AI · Ready</span>
          </div>
          <!-- 2026-05-26 (rev12): "Ready when you are..." sub + inner
               "Start a voice round" pill both removed. The
               .hero-explainer-eyebrow at the top of the hero already
               explains what the product is, and the .hero-stage-cta
               "Debatable" below the orb is the climax CTA pointing at
               the same /voice-debate destination — no duplicate copy
               or stacked CTAs inside the orb card. -->
        </a>
      </div>

      <!-- 2026-05-26 rev5: REAL online count, backed by Firestore.
           Two endpoints work together:
             /api/presence-ping    POST. Heartbeat. Writes/updates a
                                   single doc in the `presence`
                                   collection per uid (signed-in) or
                                   per `pid` (anon, sessionStorage).
             /api/online-count     GET. Returns count of docs whose
                                   lastPing was within the last 5 min.
                                   Server-cached 30s.
           Drift script REMOVED — hesActive is now the real count,
           hesRooms shows the subset of online users currently in
           voice (signedIn == true ≈ in product, approx), hesLatency
           stays as light decoration (no good source for real voice
           latency on landing). Honest framing in the labels:
           "online now" / "in voice". If only one person is online
           it renders 1 — no inflation. -->
      <script>
        (function(){
          // Stable per-tab pid for anon heartbeats. Sessions die when
          // the tab closes, so the presence doc TTLs out of the 5-min
          // window naturally. localStorage would over-count revisits.
          var pid;
          try {
            pid = sessionStorage.getItem('da-pid');
            if (!pid) {
              pid = (crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'').slice(0,16)
                                                  : (Date.now().toString(36) + Math.random().toString(36).slice(2,10)));
              sessionStorage.setItem('da-pid', pid);
            }
          } catch (_) {
            // Some embedded browsers throw on sessionStorage. Skip the
            // heartbeat entirely in that case; the count just won't
            // include this visitor.
            return;
          }

          function ping(){
            // Skip while the tab is hidden (Page Visibility API). No
            // point counting a backgrounded tab as "online."
            if (document.visibilityState === 'hidden') return;
            // Include the Firebase ID token if the user is signed in
            // so the server can key by uid (one presence row per
            // signed-in user, even across tabs). Falls through to
            // anon pid keying if the token isn't available.
            var headers = { 'Content-Type': 'application/json' };
            try {
              var u = window.firebase && firebase.auth && firebase.auth().currentUser;
              if (u && u.getIdToken) {
                u.getIdToken().then(function(token){
                  headers.Authorization = 'Bearer ' + token;
                  postPing(headers);
                }).catch(function(){ postPing(headers); });
                return;
              }
            } catch (_) {}
            postPing(headers);
          }
          function postPing(headers){
            try {
              fetch('/api/presence-ping', {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify({ pid: pid })
              }).catch(function(){ /* network errors silent */ });
            } catch (_) {}
          }

          function refreshCount(){
            // Don't poll the count in a backgrounded tab; the
            // visibilitychange handler below re-fetches on return.
            if (document.visibilityState === 'hidden') return;
            fetch('/api/online-count', { credentials: 'omit' })
              .then(function(r){ return r.ok ? r.json() : null; })
              .then(function(j){
                if (!j || typeof j.online !== 'number') return;
                // Floor at 1 — the viewer themselves is on the page, so
                // 0 is a lie. The server response can be 0 if the cache
                // is warm but our own heartbeat hasn't landed yet, or
                // if the presence write silently failed (env vars,
                // permissions, cold start). Showing "0 online" while
                // you're literally reading the page is worse than
                // showing "1 online" honestly. signedIn count gets
                // floored at 1 only if the viewer is actually signed
                // in (window.firebase auth).
                var online = Math.max(j.online | 0, 1);
                var signedIn = j.signedIn | 0;
                try {
                  var u = window.firebase && firebase.auth && firebase.auth().currentUser;
                  if (u) signedIn = Math.max(signedIn, 1);
                } catch(_){}
                var a = document.getElementById('hesActive');
                var r = document.getElementById('hesRooms');
                if (a) a.textContent = String(online);
                if (r) r.textContent = String(signedIn);
                var b = document.getElementById('heroOnlineCount');
                if (b) b.textContent = String(online);
              })
              .catch(function(){ /* keep last value */ });
          }

          // 2026-07-01: the hero live-usage counters this heartbeat fed
          // were removed, so it no longer runs. Leaving it active would keep
          // spending /api/presence-ping + /api/online-count invocations every
          // 30-60s per visitor for UI that no longer exists.
          return;
          // Re-ping + refresh when the tab returns from background, so
          // a returning visitor immediately re-shows as online.
          document.addEventListener('visibilitychange', function(){
            if (document.visibilityState === 'visible') {
              ping();
              setTimeout(refreshCount, 350);
            }
          });
        })();
      </script>

      <!-- 2026-05-26 (rev3): single bold climax CTA under the stage.
           Triangular composition needed ONE obvious primary action;
           the orb card above is itself clickable but reads as part
           of the visual, not as a button. This pill is the one
           confident action. It opens the stable voice room. -->
      <!-- The visual resolves into one direct action. -->
      <a href="/newvoice?handoff=landing-stage" class="hero-stage-cta" data-gtag="hero_stage_enter">
        Start debating
        <span class="hero-stage-cta-arrow" aria-hidden="true">→</span>
      </a>

      <!-- 2026-05-26 rev5: consolidated status row. Replaced the three
           floating env-signal chips that used to circle the orb. The
           row sits directly under the climax CTA so the eye lands on
           it as the proof-line after the action, not as decoration
           around the visual. IDs hesActive + hesRooms preserved so
           the heartbeat script in the orb-card block continues to
           update them. Single line, light dot dividers, no chips. -->
      <!-- 2026-07-01: swapped the live "N online now / N signed in" counts
           (cold-start tells) for durable proof that doesn't expose room size. -->
      <div class="hero-status-row" role="status">
        <span class="hsr-dot hsr-dot-live" aria-hidden="true"></span>
        <span class="hsr-item">Live beta</span>
        <span class="hsr-sep" aria-hidden="true">·</span>
        <span class="hsr-item">Real opponents</span>
        <span class="hsr-sep" aria-hidden="true">·</span>
        <span class="hsr-item" data-plain="AI feedback on every round">AI decision on every round</span>
      </div>

      <!-- Legacy #editorialSignInLink kept off-canvas as a screenreader +
           DOMContentLoaded-wiring fallback. The hero CTA row above is the
           visible entry point; the "Free to start. No card / Sign up keeps
           your rounds..." microcopy that lived here was filler and was
           removed 2026-05-13 to keep the hero crisp. -->
      <a href="#" id="editorialSignInLink" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">Sign in or create account</a>

      <!-- Builder credit block removed 2026-05-13. Hero stays
           product-first; founder context lives in #story below. -->
    </div>
<!-- Hidden Firebase sign-in stub. The legacy hero subtree was deleted
     2026-05-26; this element survives so the auth IIFE's
     getElementById('googleSignupBtn') / 'googleSignupBtnText' calls
     still resolve. Every visible sign-in CTA on the page click()s this
     button to trigger the Firebase popup.

     2026-05-26 (rev2 — auth-safety hardening per the founder: "make sure
     firebase sign in works effectively"): dropped the `hidden`
     attribute. `hidden` applies display:none, and while
     element.click() programmatically fires addEventListener-based
     handlers on display:none elements in modern Chrome/Safari, some
     browsers (older Firefox, headless test runners, certain a11y
     overlays) suppress the synthetic event on display:none. Pure
     CSS-clip + offscreen-position is the safer visual-hide that
     keeps the element layout-rendered but invisible, so .click()
     reliably reaches the Firebase IIFE on every browser. -->
<button id="googleSignupBtn" type="button" aria-hidden="true" tabindex="-1" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);pointer-events:none">
  <span id="googleSignupBtnText">Sign in or create account. Saves your rounds and results. Never used to train GPT or Claude.</span>
</button>
</div>
</section>
````

## Homepage section {'id': 'how-it-works', 'class': 'hiw', 'aria-label': 'How Debatable works'}

````html
<section id="how-it-works" class="hiw" aria-label="How Debatable works">
  <style>
    /* Palette. Light-first: white paper matching the rest of the page.
       The whole section themes through these variables; .hiw--dark
       (user opt-in via the Dark toggle, persisted) restores the
       near-black data-terminal slab. */
    .hiw{
      --hiw-bg:#fdfbf6;
      --hiw-panel:#ffffff;
      --hiw-panel2:#faf6ef;
      --hiw-line:rgba(29,25,21,.10);
      --hiw-line2:rgba(29,25,21,.18);
      --hiw-ink:#1a1a1f;
      --hiw-dim:rgba(26,26,31,.66);
      --hiw-faint:rgba(26,26,31,.44);
      --hiw-strong:#1a1a1f;
      --hiw-fill:rgba(29,25,21,.09);
      --hiw-fill2:rgba(29,25,21,.03);
      --hiw-dotbg:rgba(29,25,21,.16);
      --hiw-shadow:0 18px 50px rgba(29,25,21,.10);
      --hiw-navbg:rgba(255,255,255,.92);
      --hiw-navbg-h:#fff6f4;
      --hiw-glow:rgba(239,68,68,.04);
      --hiw-live:#dc2626;
      --hiw-purple-ink:#7c3aed;
      --hiw-redseat-ink:#dc2626;
      --hiw-red:#ef4444;
      --hiw-red-deep:#dc2626;
      --hiw-green:#16a34a;
      padding:clamp(24px,3.5vh,42px) 0 clamp(40px,5vh,64px);
      background:
        radial-gradient(1100px 420px at 85% -4%,var(--hiw-glow),transparent 62%),
        linear-gradient(180deg,#fdfbf6,#faf7f1);
      color:var(--hiw-ink);
      overflow:hidden;
    }
    /* Dark opt-in: the original near-black slab, one class flip. */
    .hiw.hiw--dark{
      --hiw-bg:#0e1116;
      --hiw-panel:#161b23;
      --hiw-panel2:#1c2330;
      --hiw-line:rgba(255,255,255,.08);
      --hiw-line2:rgba(255,255,255,.14);
      --hiw-ink:#e8eaed;
      --hiw-dim:rgba(232,234,237,.6);
      --hiw-faint:rgba(232,234,237,.38);
      --hiw-strong:#ffffff;
      --hiw-fill:rgba(255,255,255,.09);
      --hiw-fill2:rgba(255,255,255,.02);
      --hiw-dotbg:rgba(255,255,255,.16);
      --hiw-shadow:0 24px 70px rgba(0,0,0,.45);
      --hiw-navbg:rgba(14,17,22,.82);
      --hiw-navbg-h:rgba(30,16,16,.9);
      --hiw-glow:rgba(239,68,68,.07);
      --hiw-live:#f87171;
      --hiw-purple-ink:#c9a6ff;
      --hiw-redseat-ink:#f87171;
      --hiw-green:#22c55e;
      background:
        radial-gradient(1100px 420px at 85% -4%,var(--hiw-glow),transparent 62%),
        var(--hiw-bg);
    }
    .hiw-wrap{width:100%;margin:0}
    .hiw-head{text-align:center;max-width:900px;margin:0 auto clamp(20px,3vh,34px);padding:0 20px}
    .hiw-eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--font-body);
      font-size:.64rem;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--hiw-dim);margin-bottom:14px}
    .hiw-eyebrow:before,.hiw-eyebrow:after{content:"";width:34px;height:1px;background:var(--hiw-line2)}
    .hiw-title{font-family:var(--font-display);font-size:clamp(2.3rem,4.4vw,3.9rem);
      font-weight:700;letter-spacing:-.025em;line-height:1.02;margin:0 0 14px;color:var(--hiw-strong)}
    .hiw-title em{font-style:normal;color:var(--hiw-red)}
    .hiw-sub{font-size:clamp(1rem,1.3vw,1.14rem);line-height:1.55;color:var(--hiw-dim);margin:0;max-width:66ch;margin-inline:auto}
    /* Deck: full-bleed, viewport-scaled slides. 2026-08-12: the numbered
       step chips above the deck were cut per the founder; the arrows below are
       the primary control now, so they carry real weight. */
    .hiw-deck{position:relative}
    .hiw-viewport{overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch}
    .hiw-viewport::-webkit-scrollbar{display:none}
    .hiw-track{display:flex}
    .hiw-card{flex:none;width:100%;scroll-snap-align:center;scroll-snap-stop:always;box-sizing:border-box;
      min-height:clamp(520px,74vh,820px);
      display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);
      gap:clamp(28px,4.5vw,84px);align-items:center;
      padding:clamp(24px,4vh,48px) clamp(22px,6vw,110px)}
    @media(max-width:900px){.hiw-card{grid-template-columns:minmax(0,1fr);gap:24px;min-height:0;padding:18px 20px 30px;align-content:start}}
    .hiw-step-k{display:flex;align-items:baseline;gap:12px;margin:0 0 14px;font-family:var(--font-body)}
    .hiw-step-num{font-family:var(--font-body);font-size:clamp(2.4rem,3.4vw,3.4rem);font-weight:800;line-height:1;color:var(--hiw-red);font-variant-numeric:tabular-nums}
    .hiw-step-of{font-size:.64rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--hiw-faint)}
    .hiw-card-title{font-family:var(--font-display);font-size:clamp(1.8rem,3.1vw,2.9rem);font-weight:700;letter-spacing:-.02em;line-height:1.05;margin:0 0 14px;color:var(--hiw-strong)}
    .hiw-card-body{font-size:clamp(.98rem,1.2vw,1.12rem);line-height:1.65;color:var(--hiw-dim);margin:0;max-width:56ch}
    .hiw-card-body b{color:var(--hiw-ink);font-weight:700}
    /* Mechanics list under the body copy */
    .hiw-mech{margin:18px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:0;
      border-top:1px solid var(--hiw-line);max-width:56ch;font-family:var(--font-body)}
    .hiw-mech li{display:flex;align-items:baseline;justify-content:space-between;gap:18px;
      padding:9px 2px;border-bottom:1px solid var(--hiw-line);font-size:.82rem;color:var(--hiw-dim)}
    .hiw-mech li b{flex:none;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--hiw-faint)}
    .hiw-mech li span{text-align:right;color:var(--hiw-ink);font-weight:600}
    .hiw-go{display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:12px 20px;border-radius:8px;
      font-family:var(--font-body);font-size:.82rem;font-weight:800;
      color:#fff;background:var(--hiw-red-deep);text-decoration:none;transition:background .15s,transform .15s}
    .hiw-go:hover{background:#b91c1c;transform:translateY(-1px)}
    /* 2026-08-11: secondary sibling for the judge-integrity link on the
       verdict card. Same shape, no fill, so it reads as the quieter of
       the two actions rather than competing with the ballot CTA. */
    .hiw-go--quiet{margin-left:8px;background:transparent;border:1px solid var(--hiw-line);color:var(--hiw-ink)}
    .hiw-go--quiet:hover{background:rgba(255,255,255,.06);border-color:var(--hiw-red-deep)}
    @media (max-width:560px){.hiw-go--quiet{margin-left:0}}
    .hiw-fine{margin:14px 0 0;font-family:var(--font-body);font-size:.64rem;line-height:1.55;color:var(--hiw-faint);max-width:56ch}
    /* Data panels (right column) */
    .hiw-viz{min-width:0}
    .hiw-panel{width:100%;max-width:640px;margin:0 auto;border:1px solid var(--hiw-line);border-radius:12px;
      background:var(--hiw-panel);box-shadow:var(--hiw-shadow);
      font-family:var(--font-body);overflow:hidden}
    .hiw-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:13px 18px;border-bottom:1px solid var(--hiw-line);
      font-size:.62rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--hiw-dim)}
    .hiw-panel-body{padding:18px}
    .hiw-live{display:inline-flex;align-items:center;gap:7px;color:var(--hiw-live)}
    .hiw-live i{width:6px;height:6px;border-radius:50%;background:var(--hiw-red);animation:hiwPulse 1.6s ease-in-out infinite}
    @keyframes hiwPulse{0%,100%{opacity:1}50%{opacity:.45}}
    @media(prefers-reduced-motion:reduce){.hiw-live i{animation:none}}
    /* 1 · match ticket */
    .hiw-motion{font-family:var(--font-body);font-size:1.28rem;font-weight:700;line-height:1.25;color:var(--hiw-strong);margin:0 0 16px}
    .hiw-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;margin:0 0 16px}
    .hiw-vs-seat{display:flex;align-items:center;gap:12px;min-width:0}
    .hiw-vs-seat--r{flex-direction:row-reverse;text-align:right}
    .hiw-vs-seat img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:1px solid var(--hiw-line2);flex:none}
    .hiw-vs-nm{display:block;font-size:.9rem;font-weight:700;color:var(--hiw-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hiw-vs-side{display:block;margin-top:2px;font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--hiw-faint)}
    .hiw-vs-mid{font-size:.66rem;font-weight:800;letter-spacing:.12em;color:var(--hiw-faint)}
    .hiw-ticket-row{display:flex;justify-content:space-between;gap:12px;padding:10px 2px;border-top:1px solid var(--hiw-line);
      font-size:.78rem;color:var(--hiw-dim)}
    .hiw-ticket-row b{font-variant-numeric:tabular-nums;font-weight:800;color:var(--hiw-strong)}
    /* 2 · ballot */
    .hiw-verdict{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin:0 0 14px}
    .hiw-verdict-win{font-family:var(--font-body);font-size:1.6rem;font-weight:750;color:var(--hiw-strong)}
    .hiw-verdict-win i{font-style:normal;color:var(--hiw-green)}
    .hiw-verdict-pts{font-size:.9rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--hiw-ink)}
    .hiw-axis{margin:0 0 10px}
    .hiw-axis-top{display:flex;justify-content:space-between;gap:12px;font-size:.72rem;color:var(--hiw-dim);margin-bottom:5px}
    .hiw-axis-top b{font-variant-numeric:tabular-nums;color:var(--hiw-strong)}
    .hiw-bar{height:4px;border-radius:2px;background:var(--hiw-fill);overflow:hidden}
    .hiw-bar i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,#f87171,var(--hiw-red))}
    .hiw-rfd{margin:14px 0 0;padding:12px 14px;border:1px solid var(--hiw-line);border-radius:8px;background:var(--hiw-fill2)}
    .hiw-rfd-k{font-size:.58rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--hiw-faint);margin:0 0 8px}
    .hiw-rfd p{margin:0;font-size:.8rem;line-height:1.55;color:var(--hiw-dim)}
    /* 3 · board table */
    .hiw-table{width:100%;border-collapse:collapse;font-size:.82rem}
    .hiw-table th{padding:8px 10px;text-align:left;font-size:.58rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--hiw-faint);border-bottom:1px solid var(--hiw-line2)}
    .hiw-table td{padding:11px 10px;border-bottom:1px solid var(--hiw-line);color:var(--hiw-dim);white-space:nowrap}
    .hiw-table td:first-child{font-variant-numeric:tabular-nums;font-weight:800;color:var(--hiw-faint);width:36px}
    .hiw-table .nm{display:flex;align-items:center;gap:10px;color:var(--hiw-strong);font-weight:700}
    .hiw-table .nm img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--hiw-line)}
    .hiw-table .pts{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;color:var(--hiw-strong)}
    .hiw-table tr.top td{background:rgba(239,68,68,.07)}
    .hiw-table tr.top td:first-child{color:var(--hiw-red)}
    .hiw-table tr:last-child td{border-bottom:0}
    .hiw-table .fmt{font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    /* 4 · stream stage */
    .hiw-stage-body{padding:22px 18px 18px}
    .hiw-show-entry{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 14px;
      padding:10px 12px;border:1px solid rgba(239,68,68,.3);border-radius:8px;background:rgba(239,68,68,.07)}
    .hiw-show-entry b{display:inline-flex;align-items:center;gap:8px;font-size:.72rem;color:var(--hiw-strong)}
    .hiw-show-entry b i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--hiw-red);color:#fff;
      font-size:.64rem;font-style:normal;font-variant-numeric:tabular-nums}
    .hiw-show-entry span{font-size:.65rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hiw-redseat-ink)}
    .hiw-stage-seats{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;margin:0 0 18px}
    .hiw-seat{border:1px solid var(--hiw-line);border-radius:10px;padding:16px 12px;text-align:center;background:var(--hiw-panel2)}
    .hiw-seat--challenger{border-color:rgba(239,68,68,.42);background:linear-gradient(155deg,rgba(239,68,68,.10),var(--hiw-panel2) 72%)}
    .hiw-seat-photo{display:block;width:62px;height:62px;margin:0 auto 10px;border-radius:50%;object-fit:cover;
      border:2px solid var(--hiw-line2);box-shadow:0 8px 20px rgba(0,0,0,.16)}
    .hiw-seat--challenger .hiw-seat-photo{border-color:rgba(239,68,68,.62)}
    .hiw-seat-disc{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;margin:0 auto 10px;
      font-family:var(--font-body);font-size:1.3rem;font-weight:800}
    .hiw-seat-disc--creator{background:rgba(145,70,255,.14);border:2px solid rgba(145,70,255,.55);color:var(--hiw-purple-ink)}
    .hiw-seat-disc--ladder{background:rgba(239,68,68,.12);border:2px solid rgba(239,68,68,.55);color:var(--hiw-redseat-ink)}
    .hiw-seat b{display:block;font-size:.86rem;font-weight:750;color:var(--hiw-strong)}
    .hiw-seat span{display:block;margin-top:3px;font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--hiw-faint)}
    .hiw-ballot-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:11px 14px;border:1px solid var(--hiw-line);border-radius:8px;background:var(--hiw-fill2);
      font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--hiw-dim)}
    .hiw-plat{display:inline-flex;align-items:center;gap:12px}
    .hiw-plat svg{width:15px;height:15px;fill:var(--hiw-dim)}
    .hiw-show-result{display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:stretch}
    .hiw-show-result > span{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:10px 11px;
      border:1px solid var(--hiw-line);border-radius:8px;background:var(--hiw-fill2)}
    .hiw-show-result > span:first-child{border:0;background:transparent;padding-left:2px;
      font-size:.58rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--hiw-faint)}
    .hiw-show-result b{font-size:.72rem;color:var(--hiw-strong)}
    .hiw-show-result small{display:block;margin-top:2px;font-size:.61rem;line-height:1.3;color:var(--hiw-dim)}
    @media(max-width:520px){
      .hiw-show-entry{align-items:flex-start;flex-direction:column;gap:5px}
      .hiw-stage-seats{gap:8px}.hiw-seat{padding:13px 8px}.hiw-seat-photo{width:52px;height:52px}
      .hiw-show-result{grid-template-columns:1fr 1fr}.hiw-show-result > span:first-child{grid-column:1/-1;padding-bottom:0}
    }
    /* 5 · pool */
    .hiw-pool-row{display:flex;justify-content:space-between;gap:12px;padding:11px 2px;border-bottom:1px solid var(--hiw-line);font-size:.82rem;color:var(--hiw-dim)}
    .hiw-pool-row b{font-variant-numeric:tabular-nums;font-weight:800;color:var(--hiw-strong)}
    .hiw-pool-row.total b{color:var(--hiw-red)}
    .hiw-pool-note{margin:12px 0 0;font-size:.62rem;line-height:1.5;color:var(--hiw-faint)}
    /* Arrows + dots. The controls live in the navigation gutter below
       the viewport on every width. Side-mounted arrows overlapped the
       verdict copy anywhere the card padding was narrower than 96px. */
    .hiw-nav{position:absolute;top:auto;bottom:0;transform:none;z-index:2;width:56px;height:56px;border-radius:50%;cursor:pointer;
      display:grid;place-items:center;border:2px solid rgba(239,68,68,.45);background:var(--hiw-navbg);color:var(--hiw-red);
      box-shadow:0 12px 32px rgba(29,25,21,.16);
      backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .15s,background .15s,color .15s,box-shadow .15s}
    .hiw-nav svg{width:23px;height:23px}
    .hiw-nav:hover{border-color:#ef4444;background:#ef4444;color:#fff;box-shadow:0 16px 38px rgba(239,68,68,.34)}
    .hiw-nav--prev{left:clamp(8px,2vw,28px)}.hiw-nav--next{right:clamp(8px,2vw,28px)}
    .hiw-nav[disabled]{opacity:.28;cursor:default;box-shadow:none}
    /* Phones keep the same collision-free gutter with slightly smaller
       controls and tighter edge offsets. */
    @media(max-width:900px){
      .hiw-nav{width:52px;height:52px}
      .hiw-nav svg{width:22px;height:22px}
      .hiw-nav--prev{left:14px}.hiw-nav--next{right:14px}
      .hiw-dots{min-height:52px;align-items:center}
    }
    .hiw-dots{display:flex;justify-content:center;align-items:center;gap:9px;min-height:56px;
      padding-inline:84px;margin-top:clamp(10px,2vh,20px)}
    .hiw-dot{width:26px;height:4px;border-radius:2px;border:0;padding:0;cursor:pointer;background:var(--hiw-dotbg);transition:background .15s}
    .hiw-dot[aria-current="true"]{background:var(--hiw-red)}
    /* Ink guarantees. The section themes through --hiw-* variables
       (light by default, .hiw--dark opt-in), but the light theme
       carries broad [data-theme="light"] text rules whose specificity
       beats a bare class (measured live: the h2 came out #1a1a1f and
       table cells came out red on the dark panel). The id prefix
       outranks them all without !important, and the variables resolve
       to the right ink in either mode. */
    #how-it-works .hiw-title,
    #how-it-works .hiw-card-title,
    #how-it-works .hiw-motion,
    #how-it-works .hiw-verdict-win,
    #how-it-works .hiw-table .nm,
    #how-it-works .hiw-table .pts,
    #how-it-works .hiw-seat b{color:var(--hiw-strong)}
    #how-it-works .hiw-title em{color:var(--hiw-red)}
    #how-it-works .hiw-sub,
    #how-it-works .hiw-card-body,
    #how-it-works .hiw-rfd p,
    #how-it-works .hiw-pool-row,
    #how-it-works .hiw-ticket-row,
    #how-it-works .hiw-table td{color:var(--hiw-dim)}
    #how-it-works .hiw-card-body b{color:var(--hiw-ink)}
    #how-it-works .hiw-ticket-row b,
    #how-it-works .hiw-pool-row b,
    #how-it-works .hiw-axis-top b{color:var(--hiw-strong)}
    #how-it-works .hiw-pool-row.total b{color:var(--hiw-red)}
    #how-it-works .hiw-table td:first-child{color:var(--hiw-faint)}
    #how-it-works .hiw-table tr.top td:first-child{color:var(--hiw-red)}
    #how-it-works .hiw-table th{color:var(--hiw-faint)}
    #how-it-works .hiw-go{color:#fff}
    /* The unfilled sibling has no red behind it, so it takes section
       ink instead. Has to sit after the rule above, which matches it
       too and would otherwise paint it white on white. */
    #how-it-works .hiw-go--quiet{color:var(--hiw-ink)}
    #how-it-works .hiw-step-num{color:var(--hiw-red)}
  
    /* Hover system (2026-08-10 v3, per the founder: "highlight and increase
       size when hovering type situation"). Data surfaces lift and
       scale, rows tint red, controls pop. Off under reduced motion. */
    .hiw-panel{transition:transform .28s cubic-bezier(.2,.7,.2,1),box-shadow .28s,border-color .28s}
    .hiw-panel:hover{transform:translateY(-5px) scale(1.02);border-color:rgba(239,68,68,.35);box-shadow:0 26px 60px rgba(29,25,21,.16)}
    .hiw-mech li{transition:background .15s}
    .hiw-mech li:hover{background:rgba(239,68,68,.05)}
    .hiw-table tbody tr td{transition:background .15s}
    .hiw-table tbody tr:hover td{background:rgba(239,68,68,.05)}
    .hiw-ticket-row,.hiw-pool-row{transition:background .15s}
    .hiw-ticket-row:hover,.hiw-pool-row:hover{background:rgba(239,68,68,.04)}
    .hiw-seat{transition:transform .2s,border-color .2s,box-shadow .2s}
    .hiw-seat:hover{transform:translateY(-3px) scale(1.03);border-color:rgba(239,68,68,.3);box-shadow:0 10px 26px rgba(29,25,21,.10)}
    .hiw-go:hover{background:#b91c1c;transform:translateY(-2px) scale(1.03);box-shadow:0 12px 28px rgba(239,68,68,.28)}
    @media(min-width:901px){.hiw-nav:hover{transform:translateY(-50%) scale(1.08)}}
    .hiw-dot{transition:background .15s,transform .15s}
    .hiw-dot:hover{transform:scaleY(1.6)}
    @media(prefers-reduced-motion:reduce){
      .hiw-panel:hover,.hiw-seat:hover,.hiw-go:hover,.hiw-dot:hover{transform:none}
    }
  </style>
  <div class="hiw-wrap">
    <div class="hiw-deck">
      <button type="button" class="hiw-nav hiw-nav--prev" id="hiwPrev" aria-label="Previous step">
        <svg viewBox="0 0 14 14" width="26" height="26" aria-hidden="true"><path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="hiw-nav hiw-nav--next" id="hiwNext" aria-label="Next step">
        <svg viewBox="0 0 14 14" width="26" height="26" aria-hidden="true"><path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="hiw-viewport" id="hiwViewport" tabindex="0" aria-label="How it works, steps 1 to 5. Use arrow keys or swipe.">
        <div class="hiw-track" id="hiwTrack">

          <article class="hiw-card" data-hiw-step="match">
            <div>
              <p class="hiw-step-k"><span class="hiw-step-num">1</span><span class="hiw-step-of">Match</span></p>
              <h3 class="hiw-card-title">Match with a real person.</h3>
              <p class="hiw-card-body">One tap pairs you with a stranger who takes the other side. The topic appears, you both get a few timed minutes to think, and if nobody is waiting an AI takes the seat.</p>
              <ul class="hiw-mech" aria-label="Round mechanics">
                <li><b>Round type</b><span>Casual 1v1, every time</span></li>
                <li><b>Thinking time</b><span>A few timed minutes, both sides at once</span></li>
                <li><b>Turns</b><span>Make your points, answer theirs</span></li>
                <li><b>One person per side</b><span>AI can fill the other seat</span></li>
              </ul>
              <a class="hiw-go" href="/spar" data-cta="hiw-step1-match">Match me with a stranger</a>
            </div>
            <div class="hiw-viz">
              <div class="hiw-panel">
                <div class="hiw-panel-head"><span class="hiw-live"><i></i>Live round</span><span>Casual 1v1</span></div>
                <div class="hiw-panel-body">
                  <p class="hiw-motion">Should dating apps reveal how they rank people?</p>
                  <div class="hiw-vs">
                    <div class="hiw-vs-seat"><img src="/img/round/faces/face25.jpg" alt="" loading="lazy" decoding="async"><span><span class="hiw-vs-nm">You</span><span class="hiw-vs-side">Pro</span></span></div>
                    <span class="hiw-vs-mid">VS</span>
                    <div class="hiw-vs-seat hiw-vs-seat--r"><img src="/img/round/faces/face11.jpg" alt="" loading="lazy" decoding="async"><span><span class="hiw-vs-nm">A stranger</span><span class="hiw-vs-side">Con</span></span></div>
                  </div>
                  <div class="hiw-ticket-row"><span>Turn</span><b>2 of 4</b></div>
                  <div class="hiw-ticket-row"><span>On the clock</span><b>03:47</b></div>
                  <div class="hiw-ticket-row"><span>Interruptions</span><b>Open</b></div>
                </div>
              </div>
            </div>
          </article>

          <article class="hiw-card" data-hiw-step="verdict">
            <div>
              <p class="hiw-step-k"><span class="hiw-step-num">2</span><span class="hiw-step-of">Verdict</span></p>
              <h3 class="hiw-card-title" data-plain="The AI judge explains who won.">The AI judge decides who won.</h3>
              <p class="hiw-card-body">The round ends, the AI judge delivers its decision in seconds: <b>winner, scores out of 100, and the reasons</b>, citing what was actually said. The scoring rules are public, so you can check every call.</p>
              <ul class="hiw-mech" aria-label="Decision contents">
                <li><b>Decided on</b><span data-plain="The arguments made, never the topic">The flow, never the topic</span></li>
                <li><b>Scoring rules</b><span>Published before the round</span></li>
                <li><b>Turnaround</b><span>Seconds after the last speech</span></li>
              </ul>
              <a class="hiw-go" href="#live-proof" data-cta="hiw-step2-verdict" data-plain="See real judge feedback">See a real decision</a>
              <!-- 2026-08-11: the card says "AI judge" and "the rubric's
                   public"; this is the link that lets someone act on
                   that instead of taking it on faith. -->
              <a class="hiw-go hiw-go--quiet" href="/judge-integrity" data-cta="hiw-step2-trust">Why you can trust it</a>
            </div>
            <div class="hiw-viz">
              <div class="hiw-panel">
                <div class="hiw-panel-head"><span>Decision · Round 1</span><span>AI judge · published rules</span></div>
                <div class="hiw-panel-body">
                  <div class="hiw-verdict"><span class="hiw-verdict-win"><i>Pro wins</i></span><span class="hiw-verdict-pts">88 &ndash; 62 points</span></div>
                  <div class="hiw-axis"><div class="hiw-axis-top"><span>The argument</span><b>42 / 50</b></div><div class="hiw-bar"><i style="width:84%"></i></div></div>
                  <div class="hiw-axis"><div class="hiw-axis-top"><span>Responses to the other case</span><b>31 / 35</b></div><div class="hiw-bar"><i style="width:89%"></i></div></div>
                  <div class="hiw-axis"><div class="hiw-axis-top"><span>Structure and clarity</span><b>15 / 15</b></div><div class="hiw-bar"><i style="width:100%"></i></div></div>
                  <div class="hiw-rfd">
                    <p class="hiw-rfd-k">Reason for decision</p>
                    <p>The round turns on whether the harm Pro describes outweighs the benefit Con defends. Pro names three concrete harms and shows why each is likely, not just serious; Con's best point goes unanswered until the final speech, which is too late to&hellip;</p>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article class="hiw-card" data-hiw-step="leaderboard">
            <div>
              <p class="hiw-step-k"><span class="hiw-step-num">3</span><span class="hiw-step-of">Leaderboard</span></p>
              <h3 class="hiw-card-title">Your score goes on the board.</h3>
              <p class="hiw-card-body">Every judged round uses the same <b>100-point scale</b>, so your score means the same thing every time. Best entry per person, live and AI rounds marked apart.</p>
              <ul class="hiw-mech" aria-label="Board rules">
                <li><b>Scale</b><span>Argument score out of 100</span></li>
                <li><b>Entry</b><span>Best per person</span></li>
                <li><b>Visibility</b><span>Public, no account needed</span></li>
              </ul>
              <a class="hiw-go" href="/leaderboard" data-cta="hiw-step3-board">See the leaderboard</a>
            </div>
            <div class="hiw-viz">
              <div class="hiw-panel">
                <div class="hiw-panel-head"><span>Casual 1v1 board</span><span>Best score / 100</span></div>
                <table class="hiw-table" aria-label="Sample leaderboard rows">
                  <thead><tr><th>#</th><th>Name</th><th>Round</th><th style="text-align:right">Score</th></tr></thead>
                  <tbody>
                    <tr class="top"><td>1</td><td><span class="nm"><img src="/img/round/faces/face15.jpg" alt="" loading="lazy" decoding="async">Priya S.</span></td><td class="fmt">1v1 · Live</td><td class="pts">98</td></tr>
                    <tr><td>2</td><td><span class="nm"><img src="/img/round/faces/face22.jpg" alt="" loading="lazy" decoding="async">Marcus T.</span></td><td class="fmt">1v1 · Live</td><td class="pts">97</td></tr>
                    <tr><td>3</td><td><span class="nm"><img src="/img/round/faces/face31.jpg" alt="" loading="lazy" decoding="async">Elena V.</span></td><td class="fmt">1v1 · AI</td><td class="pts">96</td></tr>
                    <tr><td>4</td><td><span class="nm"><img src="/img/round/faces/face08.jpg" alt="" loading="lazy" decoding="async">Dhruv M.</span></td><td class="fmt">1v1 · Live</td><td class="pts">95</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <article class="hiw-card" data-hiw-step="show">
            <div>
              <p class="hiw-step-k"><span class="hiw-step-num">4</span><span class="hiw-step-of">The show</span></p>
              <h3 class="hiw-card-title">Climb the board. Get considered for a creator debate.</h3>
              <p class="hiw-card-body">The leaderboard is the qualifier. Strong finishes can put you in the challenger pool for a <b>streamer or creator</b> matchup. When the topic and availability line up, someone from the board takes the seat.</p>
              <ul class="hiw-mech" aria-label="Show mechanics">
                <li><b>Qualify</b><span>Rise to the top of the board</span></li>
                <li><b>Select</b><span>Rank, topic, and availability</span></li>
                <li><b>Live result</b><span>Judge decision + how the room moved</span></li>
              </ul>
              <a class="hiw-go" href="#creator-sweepstakes" data-cta="hiw-step4-show">See creator matchups</a>
            </div>
            <div class="hiw-viz">
              <div class="hiw-panel" aria-label="Example creator match broadcast">
                <div class="hiw-panel-head"><span class="hiw-live"><i></i>Creator match</span><span>Live on the creator's channel</span></div>
                <div class="hiw-stage-body">
                  <div class="hiw-show-entry"><b><i>#1</i>Leaderboard finish</b><span>Enters the challenger pool</span></div>
                  <div class="hiw-stage-seats">
                    <div class="hiw-seat"><img class="hiw-seat-photo" src="/img/round/faces/face37.jpg" alt="" loading="lazy" decoding="async"><b>Creator</b><span>Hosts the live audience</span></div>
                    <span class="hiw-vs-mid">VS</span>
                    <div class="hiw-seat hiw-seat--challenger"><img class="hiw-seat-photo" src="/img/round/faces/face15.jpg" alt="" loading="lazy" decoding="async"><b>Ranked challenger</b><span>Selected from the board</span></div>
                  </div>
                  <div class="hiw-show-result" aria-label="What appears when the round ends">
                    <span>When the round ends</span>
                    <span><b>Judge decision</b><small>Winner and reasons</small></span>
                    <span><b>Crowd swing</b><small>Who moved the room</small></span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article class="hiw-card" data-hiw-step="creator-chance">
            <div>
              <p class="hiw-step-k"><span class="hiw-step-num">5</span><span class="hiw-step-of">Your shot</span></p>
              <h3 class="hiw-card-title">Have a chance to debate streamers and influencers.</h3>
              <p class="hiw-card-body"><b>Leaderboard success is how you get considered.</b> Keep posting strong judged rounds and climbing the board. When a creator matchup fits your topic and availability, selected players get the challenger seat.</p>
              <ul class="hiw-mech" aria-label="Creator challenge path">
                <li><b>Rank</b><span>Rise on the public leaderboard</span></li>
                <li><b>Fit</b><span>Topic + availability line up</span></li>
                <li><b>Invite</b><span>Selected challengers go live</span></li>
              </ul>
              <a class="hiw-go" href="/leaderboard" data-cta="hiw-step5-creator-chance">Climb the leaderboard</a>
              <p class="hiw-fine">A leaderboard finish does not guarantee an invitation. Matchups depend on creator participation, topic, availability, and event selection.</p>
            </div>
            <div class="hiw-viz">
              <div class="hiw-panel">
                <div class="hiw-panel-head"><span>Creator challenge</span><span>From leaderboard to live</span></div>
                <div class="hiw-panel-body">
                  <div class="hiw-pool-row"><span>Leaderboard success</span><b>Puts you in consideration</b></div>
                  <div class="hiw-pool-row"><span>Style fit</span><b>The way you argue suits the show</b></div>
                  <div class="hiw-pool-row"><span>Availability</span><b>Both sides can make the live slot</b></div>
                  <div class="hiw-pool-row total"><span>Invitation</span><b>Selected challengers get the seat</b></div>
                  <div class="hiw-pool-row"><span>Broadcast</span><b>Creator channel + live judging</b></div>
                  <p class="hiw-pool-note">A high finish creates the opportunity, not a guaranteed matchup. Creator availability and event fit decide each invitation.</p>
                </div>
              </div>
            </div>
          </article>

        </div>
      </div>
      <div class="hiw-dots" id="hiwDots" role="tablist" aria-label="Step position">
        <button type="button" class="hiw-dot" data-hiw-dot="0" aria-current="true" aria-label="Step 1"></button>
        <button type="button" class="hiw-dot" data-hiw-dot="1" aria-label="Step 2"></button>
        <button type="button" class="hiw-dot" data-hiw-dot="2" aria-label="Step 3"></button>
        <button type="button" class="hiw-dot" data-hiw-dot="3" aria-label="Step 4"></button>
        <button type="button" class="hiw-dot" data-hiw-dot="4" aria-label="Step 5"></button>
      </div>
    </div>
  </div>
</section>
````

## Repeated homepage doors {'class': 'lm-quick', 'id': 'lmQuick', 'aria-label': 'Jump into the tour'}

````html
<nav class="lm-quick" id="lmQuick" aria-label="Jump into the tour">
    <!-- 2026-08-24 (the founder, on the live row): this card said "Watch past
         rounds" and scrolled to #live-proof, the AI-judge ballot chapter,
         which is a screenshot of one round rather than the replay
         library. It goes to /watch, the page that actually holds
         streams, replays and clips. Off-page, so it carries the
         arrow-right icon the "Debate the AI" card uses, not the
         chevron-down the in-page jumps use. -->
    <a class="lm-quick-btn" href="/watch" data-cta="landing-quick-watch">
      <span class="lm-quick-thumb">
        <!-- 2026-08-23, the founder: better images, and real ones. The old
             thumbnail was a cropped screenshot of a video call with the
             founder's own face in it, which is both an anonymity leak and
             the weakest of the three cards. It became the /watch round
             photograph, and then this: the product board itself, two
             tiles, a clock, a motion and the room's read on who is ahead.
             /watch keeps the photograph. -->
        <img src="/img/landing/live-round-board-800.jpg" width="800" height="450" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
        <span class="lm-quick-play" aria-hidden="true"><span><svg viewBox="0 0 16 16"><path d="M5 3.5v9l8-4.5z" fill="currentColor"/></svg></span></span>
      </span>
      <span class="lm-quick-label">Watch past rounds
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h10M10 5.5 14.5 10 10 14.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>
    <!-- 2026-09-01: the full leaderboard is already rendered directly below
         this row and linked across the site. Use the larger middle card for
         the community instead, with the entire visual opening Discord. -->
    <a class="lm-quick-btn lm-quick-btn--discord" href="https://discord.gg/WMHZW9BKvJ" target="_blank" rel="noopener" data-cta="landing-quick-discord">
      <span class="lm-quick-thumb">
        <!-- 2026-09-01, the founder: show the real Discord here. This is the
             supplied welcome-channel capture with the member rail and
             account controls cropped out before publication. -->
        <img src="/img/landing/discord-community-800.jpg" width="800" height="450" alt="Debatable's Discord welcome channel and community channels for finding and sharing rounds." loading="lazy" decoding="async" onerror="this.style.display='none'">
      </span>
      <span class="lm-quick-label"><span class="lm-quick-label-copy"><strong>Join the Discord</strong><small>Meet people, find rounds, and stay for what happens after.</small></span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h10M10 5.5 14.5 10 10 14.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>
    <!-- 2026-08-24 (the founder, on sight of the live row): RESTORES the
         "Debate the AI" card that a commit earlier the same day replaced
         with Tournaments on relayed outside feedback. His call, direct
         and on the rendered page: this slot is the AI round and the Her
         still is the image he wants on it. That outranks the relayed
         note, so the Tournaments card comes back out.
         The Open keeps its path: the sitewide topbar strip links it from
         every page, which is why losing this slot costs it nothing.
         The Her credit MUST travel with the image wherever it appears
         (same rule as .hi-lf-amb-photo--her below), so .lm-quick-credit
         is load-bearing here, not decoration. It points at /newvoice,
         the one public AI door. -->
    <a class="lm-quick-btn" href="/newvoice?handoff=landing-quick-ai" data-cta="landing-quick-ai">
      <span class="lm-quick-thumb">
        <img src="/img/landing/her-samantha-still-800.jpg" width="800" height="533" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
        <span class="lm-quick-credit">Her (Spike Jonze, 2013)</span>
      </span>
      <span class="lm-quick-label">Debate the AI
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h10M10 5.5 14.5 10 10 14.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>
  </nav>
````

## Long tour toggle {'class': 'landing-more', 'id': 'landing-more'}

````html
<div class="landing-more" id="landing-more">
    <div class="aud-choose" id="audChoose" hidden>
      <div class="aud-step" data-step="exp">
        <span class="aud-choose-q">Do you compete in debate?</span>
        <button type="button" class="aud-choose-btn" data-exp="competitive" data-cta="audience-competitive">I compete</button>
        <button type="button" class="aud-choose-btn" data-exp="new" data-cta="audience-new">I'm new to this</button>
      </div>
    </div>
    <script>
      (function(){
        var KEY='debateos-experience';
        var el=document.getElementById('audChoose');
        if(!el) return;
        // One question, then the row is gone. The "basics or argue"
        // follow-up came off 2026-09-07 (founder: "get rid of this");
        // onboarding.js still sets debateos-intent for anyone who
        // answers it there.
        function step(name){
          var rows=el.querySelectorAll('.aud-step');
          for(var i=0;i<rows.length;i++)rows[i].hidden=rows[i].getAttribute('data-step')!==name;
          el.hidden=false;
        }
        function get(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
        if(get(KEY)) return;
        step('exp');
        el.addEventListener('click',function(e){
          var btn=e.target.closest&&e.target.closest('[data-exp]');
          if(!btn) return;
          var v=btn.getAttribute('data-exp');
          if(window.DebatableAudience&&window.DebatableAudience.set){window.DebatableAudience.set(v);}
          else{
            try{localStorage.setItem(KEY,v)}catch(err){}
            document.documentElement.setAttribute('data-debate-experience',v);
          }
          if(window.dosTrack)dosTrack('audience_choice',{value:v,surface:'landing_tour_row'});
          el.hidden=true;
        });
      })();
    </script>
    <button class="landing-more-summary" id="landing-more-toggle" type="button" aria-expanded="false" data-ab-test="landing_cv_v1" data-ab-target="gate_toggle">
      <span class="lm-copy">
        <!-- 2026-09-01, founder: "just have it be 'explore more'". Title
             only; the one-line explainer came off with it. -->
        <strong class="lm-title"><span class="lm-closed">Explore more</span><span class="lm-open">Show less</span></strong>
      </span>
      <span class="lm-action" aria-hidden="true">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 7.25 5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </button>
  </div>
````

## Original homepage FAQ

````html
<section id="faq" class="sec" aria-labelledby="faq-title">
  <style>
    #faq{
      --faq-rule:color-mix(in srgb,var(--text) 18%,transparent);
      --faq-soft:color-mix(in srgb,var(--text) 4%,transparent);
      --faq-accent:var(--accent);
    }
    #faq > .wrap{max-width:1440px !important}
    #faq .faq-layout{
      display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr);
      gap:clamp(40px,6vw,96px);align-items:start;
      border-top:2px solid var(--text);padding-top:32px;
    }
    #faq .faq-intro{position:sticky;top:132px;min-width:0}
    #faq .faq-title{
      margin:0;max-width:18ch;font-size:clamp(1.75rem,2.2vw,2.25rem);
      font-weight:650;line-height:1.18;letter-spacing:-.025em;color:var(--text);
    }
    #faq .faq-sub{
      max-width:29ch;margin:22px 0 0;font-size:1rem;
      line-height:1.6;color:var(--text-dim);
    }
    #faq .faq-contact{margin-top:36px;padding-top:22px;border-top:1px solid var(--faq-rule);max-width:29ch}
    #faq .faq-contact p{margin:0 0 12px;font-size:.9375rem;color:var(--text-dim)}
    #faq .faq-feedback{
      display:inline-flex;align-items:center;gap:14px;padding:0 0 5px;
      border:0;border-bottom:1px solid var(--faq-accent);background:transparent;
      font:inherit;font-size:1rem;font-weight:600;color:var(--text);cursor:pointer;
    }
    #faq .faq-feedback span{color:var(--faq-accent)}
    #faq .faq-feedback:hover{color:var(--faq-accent)}
    #faq .faq-stack{min-width:0;display:block;margin:0}
    #faq .faq-group + .faq-group{margin-top:32px}
    #faq .faq-group-label{
      margin:0;padding:0 0 14px;border-bottom:1px solid var(--faq-rule);
      font-size:.875rem;font-weight:600;line-height:1.4;letter-spacing:.035em;
      color:var(--text-dim);text-transform:none;
    }
    #faq .faq-stack-row{border-bottom:1px solid var(--faq-rule)}
    #faq .faq-stack-q{
      display:grid;grid-template-columns:24px minmax(0,1fr) 28px;align-items:center;
      gap:16px;min-height:76px;padding:20px 0;
      list-style:none;cursor:pointer;color:var(--text);
      font-size:clamp(1.0625rem,1.45vw,1.25rem);font-weight:600;
      line-height:1.4;letter-spacing:-.02em;
    }
    #faq .faq-stack-q::-webkit-details-marker{display:none}
    #faq .faq-stack-q::marker{content:""}
    #faq .faq-stack-q:hover{color:var(--faq-accent)}
    #faq .faq-number{
      align-self:start;padding-top:.3em;font-size:.8125rem;line-height:1.4;
      font-weight:500;letter-spacing:0;font-variant-numeric:tabular-nums;color:var(--text-dim);
    }
    #faq .faq-toggle{
      position:relative;width:28px;height:28px;border:1px solid var(--faq-rule);
      border-radius:50%;background:var(--faq-soft);color:var(--text);
      transition:background .15s,color .15s;
    }
    #faq .faq-toggle::before,#faq .faq-toggle::after{
      content:"";position:absolute;left:8px;top:12px;width:10px;height:1px;background:currentColor;
    }
    #faq .faq-toggle::after{transform:rotate(90deg)}
    #faq .faq-stack-row[open] .faq-toggle{background:var(--faq-accent);border-color:transparent;color:#fff}
    #faq .faq-stack-row[open] .faq-toggle::after{display:none}
    #faq .faq-stack-row[open] .faq-number{color:var(--faq-accent)}
    /* Keep the answer serif from the September 4 type decision. */
    #faq .faq-stack-a{
      padding:0 44px 26px 40px;font-family:var(--font-judge),Georgia,serif;
      font-size:1.1875rem;line-height:1.65;color:var(--text-dim);overflow-wrap:anywhere;
    }
    #faq .faq-stack-a p{max-width:60ch;margin:0 0 12px}
    #faq .faq-stack-a p:last-child{margin-bottom:0}
    #faq .faq-stack-a strong{font-weight:600;color:var(--text)}
    #faq .faq-stack-a a{
      color:var(--text);text-decoration:underline;text-decoration-color:var(--faq-accent);
      text-decoration-thickness:1px;text-underline-offset:4px;
    }
    #faq .faq-stack-a a:hover{color:var(--faq-accent)}
    #faq :is(summary,button,a):focus-visible{outline:2px solid var(--faq-accent);outline-offset:5px;border-radius:2px}
    @media (min-width:1281px){
      #faq > .wrap{padding-left:120px !important}
    }
    @media (max-width:900px){
      #faq .faq-layout{grid-template-columns:1fr;gap:32px}
      #faq .faq-intro{position:static}
      #faq .faq-sub{max-width:42ch;margin-top:18px}
      #faq .faq-contact{max-width:none;margin-top:22px;padding-top:0;border-top:0}
      #faq .faq-contact p{display:inline;margin-right:12px}
    }
    @media (max-width:480px){
      #faq .faq-layout{padding-top:24px}
      #faq .faq-stack-q{grid-template-columns:20px minmax(0,1fr) 28px;gap:10px;padding:18px 0}
      #faq .faq-stack-a{padding:0 0 24px 30px;font-size:1.125rem}
      #faq .faq-contact p{display:block;margin-right:0}
    }
    @media (prefers-reduced-motion:reduce){
      #faq .faq-toggle{transition:none}
    }
  </style>
  <div class="wrap">
    <div class="faq-layout">
      <div class="faq-intro">
        <h2 class="faq-title" id="faq-title">Frequently asked questions</h2>
        <p class="faq-sub">What to expect before you meet the other side.</p>
        <div class="faq-contact">
          <p>Something else on your mind?</p>
          <button type="button" data-open-feedback="1" class="faq-feedback">Ask us <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div class="faq-stack">
      <div class="faq-group" role="group" aria-labelledby="faq-group-1">
        <h3 class="faq-group-label" id="faq-group-1">Getting started</h3>
        <details class="faq-stack-row" open>
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">01</span><span>What is Debatable?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>A place to meet someone with a different opinion, agree on one question, and argue it out one-on-one. Take a side and give the other person something to answer.</p><p><a href="/spar">Find a person to debate</a>, or <a href="/newvoice?handoff=landing-faq">try a voice round with the AI</a>.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">02</span><span>I've never debated. Can I still join?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. You need an opinion and a willingness to hear a response. You don't need a debate background or a speech prepared.</p><p>Make a claim, explain why you believe it, and answer the other person's point. If you want a few pointers first, <a href="/learn">start here</a>.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">03</span><span>Do I need an account?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. A live round with a real person needs sign-in with Google, Apple, or email first. Signing in keeps your profile and results together.</p><p>The AI voice page offers a short preview before asking you to create an account.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">04</span><span>What does it cost?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>There is a Free plan with usage limits. Paid plans offer more access, with different allowances for AI and voice.</p><p><a href="/pricing">Compare the current prices and limits</a> before choosing a plan.</p></div>
        </details>
      </div>

      <div class="faq-group" role="group" aria-labelledby="faq-group-2">
        <h3 class="faq-group-label" id="faq-group-2">In the room</h3>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">05</span><span>What happens when I find a match?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>You get a chance to accept or decline. Both people must accept before the room opens.</p><p>Once you're in, check the question together and choose how you want to talk. Joining the queue doesn't automatically put you on a call.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">06</span><span>Can we choose what to argue about?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. The room gives you a starting question. Before the round starts, <strong>Debate something else</strong> lets you spin a new suggestion, draft one, or ask the judge to help you find a question you both want to take on.</p><p>You can also browse <a href="/topics">Topics</a> for ideas before joining.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">07</span><span>Do we take turns, or just talk?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Choose <strong>Start conversation</strong> for an open exchange with both microphones on, or <strong>Start timed speeches</strong> to take turns. The shared clock keeps you both on the same page.</p><p>In a conversation, you can cut in and respond as you go. With timed speeches, give the other person their turn.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">08</span><span>Who decides who won?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>The AI judge weighs the arguments and responses captured in the round. Its written decision explains the result, scores each side out of 100, and points to what made the difference.</p><p>It can make mistakes. You can read the <a href="/judge-integrity">judging standards and appeal policy</a>, then compare its reasoning with what was actually said.</p></div>
        </details>
      </div>

      <div class="faq-group" role="group" aria-labelledby="faq-group-3">
        <h3 class="faq-group-label" id="faq-group-3">A little more</h3>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">09</span><span>Can I debate in another language?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. The AI voice experience supports multiple languages. Choose one from the language control, or start in the <a href="/languages/">language hub</a>.</p><p>For a live round, you'll need an opponent who speaks the same language.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">10</span><span>Can I use Debatable on my stream?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. <a href="/room-judge">Room Judge</a> listens to your broadcast through browser screen capture. Ask for a live read during the discussion, then a written decision at the end.</p><p>Its compact view can sit in your stream layout. The <a href="/plugins/twitch">Twitch setup guide</a> covers getting connected.</p></div>
        </details>
        <details class="faq-stack-row">
          <summary class="faq-stack-q"><span class="faq-number" aria-hidden="true">11</span><span>Can my school get access?</span><span class="faq-toggle" aria-hidden="true"></span></summary>
          <div class="faq-stack-a"><p>Yes. School programs use a season license that covers the whole roster.</p><p><a href="/schools">See program access and pricing</a> for the current offer and the contact path for your school.</p></div>
        </details>
      </div>
      </div>
    </div>
  </div>
</section>
````

## Homepage footer

````html
<footer class="footer">
  <div class="footer-row">
    <span><span class="db-wordmark notranslate" translate="no" role="img" aria-label="Debatable"><span class="db-wordmark-base">Debat</span><span class="db-wordmark-accent">able</span></span>.<sup style="font-size:.55em;opacity:.6;margin-left:2px">&trade;</sup><span style="opacity:.55;margin-left:12px;font-size:.9em;letter-spacing:.04em">Everyone has an opinion.</span></span>
    <!-- ── The visible rail, rebuilt 2026-08-22 ─────────────────────
         the founder, looking at it: "revise this to match what the site rlly
         should be - ai exhibition not needed for example."

         It had grown into a flat alphabet of 33 links where a doorway
         page written for one search query ("Omegle alternative") sat at
         the same weight as the product, an AI-versus-AI demo was listed
         as a feature on a site whose whole positioning is people
         arguing people, /practice was labelled "Debatable" as though it
         were the company, and the live cash tournament was not in the
         footer at all.

         So the visible rail is now the thing itself, in the order
         someone would want it: play, watch, understand, who it is for,
         who we are. Everything demoted is still one click away in the
         expander below and still reachable by a crawler, because the
         landing carries the most inbound equity on the site and
         dropping a page out of here entirely would orphan it. Nothing
         was deleted; things were ranked. ──────────────────────────── -->
    <div class="footer-links">
      <a href="/spar">Debate a stranger</a>
      <a href="/debate-online">Debate online</a>
      <a href="/political-debate">Political debate</a>
      <a href="/newvoice?handoff=landing-footer">Debate an AI</a>
      <a href="/watch">Watch rounds</a>
      <a href="/leaderboard">Leaderboard</a>
      <a href="/judge">Judge a round</a>
      <a href="/how-it-works">How it works</a>
      <a href="/learn">Learn</a>
      <a href="/topics/">Topics</a>
      <a href="/pricing">Pricing</a>
      <a href="/schools">Schools</a>
      <a href="/debatable">About Debatable</a>
      <a href="https://discord.gg/WMHZW9BKvJ" target="_blank" rel="noopener noreferrer">Discord</a>
      <a href="https://instagram.com/trydebatable" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
    </div>
  </div>
  <!-- Secondary rails collapsed behind a single toggle so the footer isn't
       an overwhelming wall of links. Native <details>: no JS, keeps all
       links in the DOM for crawlers even when visually collapsed. -->
  <details class="footer-more">
  <summary>More pages and guides</summary>
  <!-- Format-guide link rail. SEO: gives Google a discoverable path to
       every /topics/<format> page from the landing (the page with the
       most inbound link equity), so each format page accumulates rank
       on its own format-specific queries. The /india + /us geo pages
       stay in the sitemap; they're just no longer surfaced as loud
       accent CTAs here (global-framing pass, 2026-05-21). -->
  <!-- ── Demoted from the visible rail, 2026-08-22, and kept here on
       purpose. These are search doorways and audience pages: each one
       is written to answer one query and hand the reader into the
       product, which is a real job and not a top-level description of
       what Debatable is. Losing the footer link entirely would orphan
       them from the highest-equity page on the site, so they move down
       rather than out. -->
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Ways in:</span>
    <a href="/debate-strangers" style="color:var(--text-dim)">Debate people online</a>
    <a href="/omegle-alternative" style="color:var(--text-dim)">Omegle alternative</a>
    <a href="/argue-online" style="color:var(--text-dim)">Argue online</a>
    <a href="/practice" style="color:var(--text-dim)">Typed rounds</a>
    <a href="/high-school" style="color:var(--text-dim)">High school edition</a>
    <a href="/practice" style="color:var(--text-dim)">Practice</a>
    <a href="/languages/" style="color:var(--text-dim)">Languages</a>
    <a href="/debate-topic-generator" style="color:var(--text-dim)">Topic generator</a>
    <a href="/learn/education" style="color:var(--text-dim)">For educators</a>
  </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Your record:</span>
    <a href="/claim" style="color:var(--text-dim)">Claim your record</a>
    <a href="/debate-rating" style="color:var(--text-dim)">Debate Rating</a>
    <a href="/atlas" style="color:var(--text-dim)">Debate Atlas</a>
  </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">About us:</span>
    <a href="/why-debatable" style="color:var(--text-dim)">Why this is different</a>
    <a href="/ambassadors" style="color:var(--text-dim)">Ambassadors</a>
    <a href="/changelog" style="color:var(--text-dim)">Changelog</a>
    <a href="/report" style="color:var(--text-dim)">Report</a>
    <a href="/research" style="color:var(--text-dim)">Research</a>
  </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Casual 1v1:</span>
    <a href="/spar" style="color:var(--text-dim)">Debate a person</a>
    <a href="/newvoice?handoff=landing-footer" style="color:var(--text-dim)">Debate by voice</a>
    <a href="/newvoice?handoff=landing-footer" style="color:var(--text-dim)">Debate an AI</a>
    <a href="/judge" style="color:var(--text-dim)">Get a score out of 100</a>
    <a href="/topics" style="color:var(--text-dim)">Things to argue about</a>
  </div>
  <!-- Debate-dossier rail. Each /debate/<slug> page argues both sides of a
       high-search-volume question, with a clash map, sample round, judge
       ballot, and a one-tap handoff into a live voice round on that motion.
       Surfaced here so the landing (the page with the most link equity)
       gives Google a discoverable path to every dossier. -->
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)"><a href="/political-debate" style="color:var(--text-dim)">Political debate:</a></span>
    <a href="/political-debate-topics" style="color:var(--text-dim)">Political debate topics</a>
    <a href="/contested" style="color:var(--text-dim)">Political discussions today</a>
    <a href="/debate/should-the-electoral-college-be-abolished" style="color:var(--text-dim)">The Electoral College</a>
    <a href="/debate/should-the-minimum-wage-be-raised" style="color:var(--text-dim)">The minimum wage</a>
    <a href="/debate/should-the-us-ban-tiktok" style="color:var(--text-dim)">Ban TikTok?</a>
    <a href="/debate/should-the-government-provide-universal-healthcare" style="color:var(--text-dim)">Universal health care</a>
    <a href="/debate/should-the-government-monitor-citizens-online" style="color:var(--text-dim)">Government surveillance</a>
    <a href="/debate/is-nuclear-energy-worth-it" style="color:var(--text-dim)">Nuclear energy</a>
  </div>
  <!-- Career-destination rail (2026-05-19; retargeted 2026-05-20). Replaces
       the deleted #careers section. Same seven categories, condensed to one
       line of footer-rail links so the section's pitch still reaches the
       page tail without taking 600+ vertical pixels mid-scroll. Each link
       now deep-links to its own anchored section on /professionals, where
       the per-category detail lives (previously a shared #overview anchor
       on this page). -->
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">For professionals:</span>
    <a href="/professionals#pre-law" style="color:var(--text-dim)">Pre-law</a>
    <a href="/professionals#consulting" style="color:var(--text-dim)">Consulting</a>
    <a href="/professionals#politics-policy" style="color:var(--text-dim)">Politics &amp; policy</a>
    <a href="/professionals#banking-pe" style="color:var(--text-dim)">Banking &amp; PE</a>
    <a href="/professionals#tech-founders" style="color:var(--text-dim)">Tech founders</a>
    <a href="/professionals#journalism-academia" style="color:var(--text-dim)">Journalism &amp; academia</a>
    <a href="/professionals#oral-exam-prep" style="color:var(--text-dim)">Oral exam prep</a>
  </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">By region:</span>
    <a href="/india" style="color:var(--text-dim)">India</a>
    <a href="/us" style="color:var(--text-dim)">United States</a>
      </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">More:</span>
    <a href="/future" style="color:var(--text-dim)">Company philosophy</a>
    <a href="/story" style="color:var(--text-dim)">Our story</a>
    <a href="/team" style="color:var(--text-dim)">The team</a>
    <a href="/reviews" style="color:var(--text-dim)">Reviews</a>
    <a href="/community" style="color:var(--text-dim)">Community</a>
    <a href="/online-debate-camp" style="color:var(--text-dim)">Debate camp</a>
    <a href="/spar" style="color:var(--text-dim)">Debate live</a>
    <a href="/newvoice" style="color:var(--text-dim)">Voice round</a>
    <a href="/leaderboard" style="color:var(--text-dim)">Leaderboard</a>
    <a href="/early" style="color:var(--text-dim)">Early access</a>
    <a href="/newvoice?handoff=landing-footer" style="color:var(--text-dim)">Debate an AI</a>
    <a href="/online-debate-platforms" style="color:var(--text-dim)">Free online debate platforms</a>
    <a href="/newvoice?handoff=landing-footer" style="color:var(--text-dim)">Casual AI round</a>
    <a href="/credentials" style="color:var(--text-dim)">Credentials</a>
  </div>
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Room judge:</span>
    <a href="/room-judge" style="color:var(--text-dim)">Room Judge</a>
    <a href="/plugins/zoom" style="color:var(--text-dim)">Zoom plugin</a>
    <a href="/plugins/twitch" style="color:var(--text-dim)">Twitch plugin</a>
  </div>
  <!-- Experimental rail. Surfaces the rough-edged / prototype surfaces
       (prediction-market debate, the argument coach, the AI coach) at
       the very bottom so they're reachable without crowding the main nav.
       Labeled "experimental" so visitors know they're early. -->
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Experimental:</span>
    <!-- 2026-08-19: /predict link removed with the sitewide betting/points
         de-surfacing pass (the founder: "remove the betting / point system from
         website for now"). The page stays live for direct links. -->
    <!-- 2026-08-22: /exhibition moved here from the visible footer rail.
         the founder: "ai exhibition not needed for example". Two AI opponents
         arguing each other is a demo of the engine, and this site's
         stated positioning is people arguing people, so listing it
         beside the product overstated what it is. The page stays live. -->
    <a href="/practice" style="color:var(--text-dim)">Typed AI round</a>
    <a href="/argument-coach" style="color:var(--text-dim)">Argument coach</a>
    <a href="/coach" style="color:var(--text-dim)">AI coach</a>
  </div>
  <!-- Site index rail. Every public page not already linked in the rails
       above, so the footer is a complete map of the site: every page is
       one click from the landing for both visitors and crawlers. Admin
       and internal tool pages are deliberately excluded. -->
  <div class="footer-row" style="padding-top:18px;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-dim);justify-content:center;flex-wrap:wrap;gap:18px">
    <span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Site index:</span>
    <a href="/splash" style="color:var(--text-dim)">Intro</a>
    <a href="/spar" style="color:var(--text-dim)">Live debates</a>
    <a href="/live" style="color:var(--text-dim)">Scheduled debates</a>
    <a href="/newvoice?handoff=landing-footer" style="color:var(--text-dim)">Realtime Voice AI</a>
    <a href="/livedebates" style="color:var(--text-dim)">Live rounds board</a>
    <a href="/live-round" style="color:var(--text-dim)">Round room</a>
    <a href="/casual-room" style="color:var(--text-dim)">Casual room</a>
    <a href="/messages" style="color:var(--text-dim)">Messages</a>
    <a href="/profile" style="color:var(--text-dim)">Profile</a>
    <a href="/users" style="color:var(--text-dim)">People</a>
    <a href="/verify" style="color:var(--text-dim)">Verify a credential</a>
    <a href="/communication-profile" style="color:var(--text-dim)">Communication profile</a>
    <a href="/benchmark" style="color:var(--text-dim)">Benchmark</a>
    <a href="/float" style="color:var(--text-dim)">Float</a>
    <a href="/counter" style="color:var(--text-dim)">Counter extension</a>
    <a href="/oral-exam-prep" style="color:var(--text-dim)">Oral exam prep</a>
    <a href="/coaches" style="color:var(--text-dim)">For coaches</a>
    <a href="/today" style="color:var(--text-dim)">Today's topic</a>
    <a href="/champions" style="color:var(--text-dim)">Champions</a>
    <a href="/programs" style="color:var(--text-dim)">Programs</a>
    <a href="/learn/fundamentals" style="color:var(--text-dim)">Fundamentals</a>
    <a href="/learn" style="color:var(--text-dim)">Argument basics</a>
    <a href="/learn/glossary" style="color:var(--text-dim)">Glossary</a>
    <a href="/topics" style="color:var(--text-dim)">Casual topics</a>
    <a href="/compare/" style="color:var(--text-dim)">Compare</a>
    <a href="/compare" style="color:var(--text-dim)">Compare AI tools</a>
    <a href="/compare" style="color:var(--text-dim)">Best AI for debate</a>
  </div>
  </details>
  <div style="padding-top:14px;border-top:1px solid var(--border);font-size:.82rem;color:var(--text);line-height:1.6;max-width:720px;margin:0 auto;text-align:center">
    itsdebatable.com is built by a real human <span aria-hidden="true">:)</span>
  </div>
  <div class="footer-legal" style="padding-top:14px;font-size:.72rem;color:var(--text-dim);line-height:1.6;max-width:720px;margin:0 auto;text-align:center">
    &copy; 2026 Debatable. All rights reserved. &ldquo;Debatable&rdquo; and the Debatable logo are trademarks of Debatable. Unauthorized use, reproduction, scraping, or derivative training of this site's voice guidelines, prompts, or content is prohibited. Read the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.
  </div>
</footer>
````
