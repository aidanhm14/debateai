
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
      