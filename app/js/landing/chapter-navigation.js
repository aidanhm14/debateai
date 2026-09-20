
(function(){
  // Icon set for the hover/focus preview popover, one per chapter.
  // Simple stroke-based glyphs (not literal screenshots): this page's
  // copy is edited weekly per the decision log, so a pixel screenshot
  // would go stale within days. currentColor picks up --accent via the
  // .tpp-icon wrapper.
  var TOC_PREVIEWS = {
    'how-it-works': { note: 'Five steps, ladder to featured to paid brackets.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="4" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="20" cy="12" r="2.2"/><path d="M6.4 12h3.2M14.4 12h3.2"/></svg>' },
    'live-now': { note: 'Watch a round happening right now.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="10" opacity=".45"/></svg>' },
    'live-proof': { note: 'A real decision, real reasoning, no cherry-picking.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3" width="15" height="18" rx="2.2"/><path d="M8 12l3 3 5-6.5"/></svg>' },
    'creator-sweepstakes': { note: 'Top of the board debates streamers, live.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v3M9 20h6M10 17h4v3h-4z"/></svg>' },
    'why-this-exists': { note: 'The case for practicing out loud.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2.2h5.2c0-1 .4-1.7 1-2.2A6 6 0 0 0 12 3Z"/></svg>' },
    'mode-select': { note: 'Pick human, AI, or both.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-7"/><path d="M12 13 6 6"/><path d="M12 13l6-7"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/></svg>' },
    'credential-path': { note: "Who built this and why it's built this way.",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5"/></svg>' },
    'reviews': { note: 'What people say after a round.',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 4.5l2.2 4.6 5 .6-3.7 3.4.9 5-4.4-2.5-4.4 2.5.9-5-3.7-3.4 5-.6z"/></svg>' },
    'faq': { note: 'Answers to the obvious questions.',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 3.6 6.7L4 20l1-3.6A8 8 0 0 1 4 12Z"/><path d="M10 9.6a2 2 0 1 1 3 1.7c-.8.5-1 1-1 1.8"/><circle cx="12" cy="16" r=".2" fill="currentColor"/></svg>' }
  };

  var previewPop = null;
  var previewHideTimer = null;
  function ensurePreviewPop(){
    if (previewPop) return previewPop;
    previewPop = document.createElement('div');
    previewPop.className = 'toc-preview-pop';
    previewPop.setAttribute('aria-hidden', 'true');
    previewPop.innerHTML = '<span class="tpp-icon"></span><p class="tpp-label"></p><p class="tpp-note"></p>';
    document.body.appendChild(previewPop);
    return previewPop;
  }
  function showPreview(a, sectionId){
    var data = TOC_PREVIEWS[sectionId];
    if (!data) return;
    if (previewHideTimer){ clearTimeout(previewHideTimer); previewHideTimer = null; }
    var pop = ensurePreviewPop();
    // .page-toc-list links wrap their text in .lab; the mirrored
    // .chapter-nav links append it as a bare text node after .num, so
    // textContent alone would read "12Join". Strip the num prefix.
    var lab = a.querySelector('.lab');
    var num = a.querySelector('.num');
    var label = lab ? lab.textContent : (num ? a.textContent.slice(num.textContent.length) : a.textContent);
    pop.querySelector('.tpp-icon').innerHTML = data.icon;
    pop.querySelector('.tpp-label').textContent = label;
    pop.querySelector('.tpp-note').textContent = data.note;
    // Position above the pill, centered, clamped to the viewport so a
    // pill near the left/right edge doesn't push the card off-screen.
    var r = a.getBoundingClientRect();
    var popW = 172; // matches the CSS width
    var left = r.left + r.width / 2 - popW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    var top = r.top - 10;
    var showBelow = top < 100; // near top of viewport (e.g. sticky strip): flip below
    pop.style.left = left + 'px';
    pop.classList.toggle('is-below', showBelow);
    pop.style.top = showBelow ? (r.bottom + 10) + 'px' : 'auto';
    pop.style.bottom = showBelow ? 'auto' : (window.innerHeight - top) + 'px';
    pop.classList.add('is-shown');
  }
  function hidePreview(){
    if (!previewPop) return;
    previewHideTimer = setTimeout(function(){
      previewPop.classList.remove('is-shown');
    }, 60);
  }
  function wireTocPreviews(items, links, stripLinks){
    if (!window.matchMedia || !window.matchMedia('(hover:hover)').matches) return;
    function attach(a, sectionId){
      if (!TOC_PREVIEWS[sectionId]) return;
      a.addEventListener('mouseenter', function(){ showPreview(a, sectionId); });
      a.addEventListener('mouseleave', hidePreview);
      a.addEventListener('focus', function(){ showPreview(a, sectionId); });
      a.addEventListener('blur', hidePreview);
    }
    items.forEach(function(it, i){
      if (links[i]) attach(links[i], it.sec.id);
      if (stripLinks[i]) attach(stripLinks[i], it.sec.id);
    });
  }

  function init(){
    var toc = document.querySelector('.page-toc');
    if (!toc) return;
    // Pair each link with its section and drop pairs whose target is
    // missing. Filtering the two lists separately (what this used to do)
    // let them fall out of step the moment one anchor did not resolve,
    // so the rail could highlight the wrong row by an off-by-one.
    var items = Array.prototype.slice.call(toc.querySelectorAll('a')).map(function(a){
      var sec = null;
      try { sec = document.querySelector(a.getAttribute('href')); } catch(e){}
      return sec ? { a:a, sec:sec } : null;
    }).filter(Boolean);
    // A section that is not laid out at all gets its rail row hidden too,
    // so the rail never advertises a destination that does not exist.
    // Exception: the progressive "See more" gate intentionally hides every
    // chapter after .landing-more-shell on first load. Those chapters are
    // deferred, not missing. Keep them in both TOCs now so opening the full
    // page does not leave a broken two-item "Live / Judged" strip behind.
    var landingGate = document.querySelector('.landing-more-shell');
    var gateCollapsed = document.body.classList.contains('landing-more-ready') &&
      !document.body.classList.contains('landing-more-open');
    // Chapters gated by the one-pager collapse (see the hide list after
    // #first-screen). Since 2026-08-11 the shell is authored ABOVE all of
    // them, so the compareDocumentPosition check below already catches
    // every one and this map is a belt-and-braces duplicate. It stays
    // because the shell has moved twice now and position is the fragile
    // half of the test. Only the `onepager` arm hides them; in `full`
    // they render, so the map must stay empty there or a genuinely
    // missing section would keep its pill.
    var onepagerArm = document.documentElement.getAttribute('data-onepager') === 'onepager';
    var gatedBeforeShell = onepagerArm ? {
      'how-it-works':1, 'live-now':1, 'live-proof':1,
      'creator-sweepstakes':1
    } : {};
    // PARKED chapters (see the display:none rule in the gate shell) are
    // hidden even when the gate is open. Their rows must drop, or the
    // pills advertise destinations that scroll nowhere.
    var parked = {
      'stream-it':1, 'floor-band':1, 'community-band':1, 'engine-select':1,
      'credential-path':1,
      'creator-sweepstakes':1, 'why-this-exists':1, 'mode-select':1
    };
    items = items.filter(function(it){
      if (it.sec.offsetParent || it.sec.offsetHeight > 0) return true;
      var deferredByGate = gateCollapsed && landingGate &&
        parked[it.sec.id] !== 1 &&
        (((landingGate.compareDocumentPosition(it.sec) & 4) !== 0) ||
          gatedBeforeShell[it.sec.id] === 1);
      if (deferredByGate) return true;
      var row = it.a.closest ? it.a.closest('li') : it.a.parentNode;
      if (row) row.style.display = 'none';
      return false;
    });
    // Renumber what actually survived. The numbers are authored in the
    // markup, so dropping a hidden chapter would otherwise leave the
    // rail reading "04, 06" with a hole where 05 used to be.
    items.forEach(function(it, i){
      var n = it.a.querySelector('.num');
      if (n) n.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
    });
    var links = items.map(function(it){ return it.a; });
    var sections = items.map(function(it){ return it.sec; });

    // Mirror the rail into the tablet/phone chapter strip. Built from
    // the same `items`, so it inherits the hidden-section filtering and
    // can never list a destination the rail does not.
    var strip = document.querySelector('.chapter-nav');
    var stripLinks = [];
    if (strip && items.length){
      // Grouped tour index (2026-08-12). Eleven bare labels read as a
      // spreadsheet: a first-time visitor has no idea what "Credential
      // + vision" or "Choose a path" hold. Each card now carries the
      // TOC_PREVIEWS icon + note inline (the hover popover used to be
      // the only place the note showed), and cards cluster under four
      // visitor questions instead of raw page order. stripLinks stays
      // index-aligned with `items` (the scrollspy maps links[i] ->
      // stripLinks[i]); only the DOM placement is grouped, and the
      // .num values keep the on-page section order so a card still
      // says where in the tour it lands.
      var TOUR_GROUP_TITLES = ['Watch it work', 'People + rankings', 'Why it exists', 'Get started'];
      var TOUR_GROUP_OF = {
        'how-it-works': 0, 'live-now': 0, 'live-proof': 0, 'stream-it': 0,
        'creator-sweepstakes': 1, 'reviews': 1,
        'community-band': 1, 'floor-band': 1,
        'why-this-exists': 2, 'credential-path': 2,
        'mode-select': 3, 'engine-select': 3, 'faq': 3
      };
      var groupsWrap = document.createElement('div');
      groupsWrap.className = 'cn-groups';
      var groupOls = [];
      function groupOl(gi){
        if (groupOls[gi]) return groupOls[gi];
        var block = document.createElement('div');
        block.className = 'cn-group';
        block.setAttribute('data-gi', gi);
        var head = document.createElement('p');
        head.className = 'cn-group-head';
        head.textContent = TOUR_GROUP_TITLES[gi];
        var ol = document.createElement('ol');
        block.appendChild(head);
        block.appendChild(ol);
        // Keep blocks in group order even if a later group fills first
        // (hidden sections drop out of `items`, so arrival order varies).
        var placed = false;
        for (var j = 0; j < groupsWrap.children.length; j++){
          if (Number(groupsWrap.children[j].getAttribute('data-gi')) > gi){
            groupsWrap.insertBefore(block, groupsWrap.children[j]);
            placed = true;
            break;
          }
        }
        if (!placed) groupsWrap.appendChild(block);
        groupOls[gi] = ol;
        return ol;
      }
      items.forEach(function(it, i){
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = it.a.getAttribute('href');
        var preview = TOC_PREVIEWS[it.sec.id];
        if (preview && preview.icon){
          var ico = document.createElement('span');
          ico.className = 'cn-ico';
          ico.setAttribute('aria-hidden', 'true');
          ico.innerHTML = preview.icon;
          a.appendChild(ico);
        }
        var body = document.createElement('span');
        body.className = 'cn-body';
        var top = document.createElement('span');
        top.className = 'cn-top';
        var num = it.a.querySelector('.num');
        var lab = it.a.querySelector('.lab');
        if (num){
          var n = document.createElement('span');
          n.className = 'num';
          n.textContent = num.textContent;
          top.appendChild(n);
        }
        top.appendChild(document.createTextNode(lab ? lab.textContent : it.a.textContent));
        body.appendChild(top);
        if (preview && preview.note){
          var note = document.createElement('span');
          note.className = 'cn-note';
          note.textContent = preview.note;
          body.appendChild(note);
        }
        if (i === 0){
          var chip = document.createElement('span');
          chip.className = 'cn-start';
          chip.textContent = 'Start here';
          body.appendChild(chip);
        }
        a.appendChild(body);
        // Carry the size tier from the authored <li data-size> onto the
        // mirrored <a>, since .chapter-nav has no <li> styling hook.
        var srcLi = it.a.closest('li');
        var size = srcLi && srcLi.getAttribute('data-size');
        if (size) a.setAttribute('data-size', size);
        a.addEventListener('click', function(){
          if (typeof gtag === 'function') {
            gtag('event', 'toc_click', { toc_target: a.getAttribute('href') });
          }
        });
        li.appendChild(a);
        var gi = TOUR_GROUP_OF.hasOwnProperty(it.sec.id) ? TOUR_GROUP_OF[it.sec.id] : TOUR_GROUP_TITLES.length - 1;
        groupOl(gi).appendChild(li);
        stripLinks.push(a);
      });
      strip.appendChild(groupsWrap);
      strip.hidden = false;
    }

    // GA4: tag TOC usage so the rail's value shows up in analytics.
    links.forEach(function(a){
      a.addEventListener('click', function(){
        if (typeof gtag === 'function') {
          gtag('event', 'toc_click', { toc_target: a.getAttribute('href') });
        }
      });
    });

    // Hover/focus preview popovers, shared across both the vertical
    // rail (links) only. The strip's cards carry the note + icon
    // inline as of the 2026-08-12 grouped-index redesign, so a hover
    // popover there would repeat what the card already says.
    wireTocPreviews(items, links, []);

    // Direct-style fade so we don't depend on a cascade-level CSS
    // transition. Earlier testing found the implicit CSSTransition
    // could park itself in playState:'idle' on first paint and pin
    // opacity at 0; setting opacity + transition inline beats that.
    // Set transition AFTER the first paint so the initial opacity:0
    // state doesn't kick off a frozen transition.
    requestAnimationFrame(function(){
      toc.style.transition = 'opacity .3s ease';
    });

    var visible = false;
    function setVisible(next){
      if (next === visible) return;
      visible = next;
      toc.classList.toggle('is-visible', next);
      toc.style.opacity = next ? '1' : '0';
      toc.style.pointerEvents = next ? 'auto' : 'none';
    }
    // The TOC has two layered conditions for being visible:
    //   1. The user is in the valid scroll range (past the hero, not
    //      yet at the footer).
    //   2. The user has scrolled within the last IDLE_MS milliseconds.
    // Both must be true. The point: a sitting-still reader doesn't
    // need a persistent nav rail floating to their left — it should
    // tuck away and only come back when they're actively moving
    // through the page. Hovering directly over the rail also keeps it
    // open so a click target doesn't disappear under the cursor.
    var IDLE_MS = 2500;
    var inRange = false;
    var hovering = false;
    var idleTimer = null;
    function applyVisibility(active){
      setVisible(inRange && (active || hovering));
    }
    function poke(){
      applyVisibility(true);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function(){
        applyVisibility(false);
      }, IDLE_MS);
    }
    function updateRange(){
      var y = window.scrollY || window.pageYOffset;
      var h = window.innerHeight;
      var doc = document.documentElement.scrollHeight;
      var nearTop = y < h * 0.55;
      var nearBottom = (y + h) > (doc - 240);
      // Width gate: MUST match the CSS breakpoint above (1679px) and
      // the .chapter-nav gate. 1680 is the width at which a 1180px
      // centred column clears the fixed 206px rail; below it the rail
      // overlapped the content instead of sitting beside it.
      var roomForRail = window.innerWidth >= 1680;
      inRange = !nearTop && !nearBottom && roomForRail;
    }
    function onScroll(){
      updateRange();
      poke();
    }
    var rangeFrame = 0;
    function queueRangeUpdate(){
      if (rangeFrame) return;
      rangeFrame = requestAnimationFrame(function(){
        rangeFrame = 0;
        onScroll();
      });
    }
    window.addEventListener('scroll', queueRangeUpdate, { passive:true });
    window.addEventListener('resize', queueRangeUpdate, { passive:true });
    window.addEventListener('landingmorechange', queueRangeUpdate);
    toc.addEventListener('mouseenter', function(){
      hovering = true;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      applyVisibility(true);
    });
    toc.addEventListener('mouseleave', function(){
      hovering = false;
      poke();
    });
    updateRange();
    // Don't auto-show on load — the first scroll wakes it up.
    setVisible(false);

    // ── Scrollspy (2026-07-22 rewrite) ─────────────────────────────
    // Was an IntersectionObserver with rootMargin '-35% 0px -55% 0px'.
    // Two failure modes, both visible on the live page:
    //   1. The 10% band only fires when a section EDGE crosses it. A
    //      section taller than the band (the credential cards, The
    //      Floor) can own the whole viewport without ever re-triggering,
    //      so the rail kept highlighting whichever neighbour last
    //      clipped the band. That is why "Certificate" lit up during The
    //      Floor and "Community" lit up while the cards still filled the
    //      screen.
    //   2. Callbacks arrive per-entry and each one unconditionally
    //      claimed the active state, so with two sections crossing in
    //      one frame the winner was whichever entry the browser happened
    //      to list last.
    // Deterministic replacement: one focal line down the viewport, and
    // the active item is the LAST anchor whose section top has crossed
    // it. Monotonic in scroll position, so it cannot flicker between two
    // sections, and section height is irrelevant.
    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var FOCAL = 0.36;          // 36% down the visible page
    var TOPBAR = 52;           // fixed .ui-topbar eats the top of the viewport
    var activeLink = null;
    function syncActive(){
      var focalY = window.scrollY + TOPBAR + (window.innerHeight - TOPBAR) * FOCAL;
      var winner = null;
      for (var i = 0; i < sections.length; i++){
        var sec = sections[i];
        // Skip anything not actually laid out; a hidden element reports
        // top 0, which would read as "already crossed" and swallow the
        // active state at the top of the page.
        if (!sec.offsetParent && sec.offsetHeight === 0) continue;
        var top = sec.getBoundingClientRect().top + window.scrollY;
        if (top <= focalY) winner = links[i];
        else break;            // sections are in document order; past the line, stop
      }
      // Above the first section, keep the first item lit rather than
      // leaving the rail with nothing active.
      if (!winner) winner = links[0];
      if (winner === activeLink) return;
      if (activeLink){
        activeLink.classList.remove('is-active');
        activeLink.removeAttribute('aria-current');
      }
      winner.classList.add('is-active');
      winner.setAttribute('aria-current', 'location');
      activeLink = winner;

      // Same state on the horizontal strip, plus keep the live pill in
      // view. scrollIntoView on the pill itself would also scroll the
      // PAGE, so nudge the strip's own scrollLeft instead.
      var idx = links.indexOf(winner);
      var pill = stripLinks[idx];
      if (pill){
        stripLinks.forEach(function(p){
          p.classList.remove('is-active');
          p.removeAttribute('aria-current');
        });
        pill.classList.add('is-active');
        pill.setAttribute('aria-current', 'location');
        var row = pill.parentNode.parentNode;   // a → li → ol
        /* The in-panel index is static, not a sticky scrollspy. Leave its
           horizontal position under the reader's control on phones so it
           always opens at section 01 instead of jumping to a hidden gated
           chapter while the tour is collapsed. */
        if (row && row.scrollWidth > row.clientWidth && !row.closest('.lm-wl-row')){
          var target = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2;
          var max = row.scrollWidth - row.clientWidth;
          row.scrollTo({
            left: Math.max(0, Math.min(max, target)),
            behavior: reduceMotion ? 'auto' : 'smooth'
          });
        }
      }
    }
    // rAF-throttled: at most one recompute per painted frame.
    var spyRaf = 0;
    function queueSync(){
      if (spyRaf) return;
      spyRaf = requestAnimationFrame(function(){ spyRaf = 0; syncActive(); });
    }
    window.addEventListener('scroll', queueSync, { passive:true });
    window.addEventListener('resize', queueSync, { passive:true });
    window.addEventListener('hashchange', queueSync);
    window.addEventListener('landingmorechange', queueSync);
    // Images and fonts landing late move every section top, so re-sync
    // once the page has finished settling.
    window.addEventListener('load', queueSync);
    // A background tab pauses rAF, so a scroll that lands while hidden
    // leaves the request parked and the rail frozen on a stale row.
    // Coming back into view, drop the parked frame and recompute now.
    document.addEventListener('visibilitychange', function(){
      if (document.hidden) return;
      if (spyRaf){ cancelAnimationFrame(spyRaf); spyRaf = 0; }
      syncActive();
    });
    syncActive();

    // 2026-05-24: scroll-progress fill on the TOC track. Grows top-down
    // as the reader moves from the first to the last TOC section. Uses
    // the section list's y-range as the progress window; pinned to 0
    // above and 100% below. Throttled via rAF so it stays smooth.
    var trackFill = toc.querySelector('.page-toc-track-fill');
    if (trackFill && sections.length) {
      var rafPending = false;
      function computeFill(){
        rafPending = false;
        var first = sections[0];
        var last = sections[sections.length - 1];
        if (!first || !last) return;
        var startY = first.getBoundingClientRect().top + window.scrollY;
        var endRect = last.getBoundingClientRect();
        var endY = endRect.top + window.scrollY + endRect.height;
        var midY = (window.scrollY || window.pageYOffset) + window.innerHeight * 0.5;
        var ratio = (midY - startY) / Math.max(1, (endY - startY));
        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;
        // The track is positioned absolute inside .page-toc with
        // top:0/bottom:0 so its full height === toc clientHeight.
        var trackHeight = toc.clientHeight;
        trackFill.style.height = Math.round(trackHeight * ratio) + 'px';
      }
      function queueFill(){
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(computeFill);
      }
      window.addEventListener('scroll', queueFill, { passive:true });
      window.addEventListener('resize', queueFill, { passive:true });
      window.addEventListener('landingmorechange', queueFill);
      queueFill();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
