
(function(){
  var rail = document.getElementById('lbRail');
  var list = rail && document.getElementById('lbRailList');
  if (!rail || !list) return;
  // Retired 2026-09-08; see window.__lbRailOn where it is declared. The
  // aside ships hidden and body.lbr-on is what reveals it, so returning
  // here leaves nothing on screen and starts no work.
  if (!window.__lbRailOn) return;
  /* No width test here any more. Under 1101px the rail is display:none
     and the fetch has not started, so this script simply waits: the
     subscription below fires if and when the viewport is wide enough,
     which is what lets a window that was resized wider pick the rail up
     instead of staying blank for the rest of the session. */

  var ROWS = 6;
  var A = window.__rbAva || {};
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function anon(name){
    if (typeof A.anon === 'function') return A.anon(name);
    var t = String(name || '').trim();
    return !t || /^(anonymous|a debater|guest)$/i.test(t);
  }
  function score(n){
    if (typeof A.fmtScore === 'function') return A.fmtScore(n);
    return typeof n === 'number' ? String(Math.round(n)) : '';
  }
  /* Third tier: what a rail tile wears when the person has not set
     anything themselves. Their own built avatar and account photo still
     outrank it. The stand-in tier is exclusive to this unlabeled rail. */
  /* Falls back to the board's own emblem rather than to nothing: an empty
     circle on the edge of the screen is the one outcome this rail must
     never produce, and the emblem is what every other surface degrades to. */
  function pfpArt(seed, taken, name){
    var art = typeof A.pfp === 'function' ? A.pfp(seed, taken) : '';
    if (art) return art;
    return typeof A.emblem === 'function' ? A.emblem(seed, name, anon(name), {}) : '';
  }
  var wantsEngine = false;
  // The picture a row wears, shared by the desktop rail tile and the
  // phone strip tile: built avatar (engine swaps it in), else account
  // photo over a set picture, else the set picture.
  function faceInner(r, i, taken){
    var seed = (r && r.uid) || (r && r.name) || ('row' + i);
    var inner = '', attrs = '';
    if (r && r.avatarIdentity){
      // The avatar they built in the designer. Paints a set picture first
      // and the engine swaps their real one in when it lands, so a
      // blocked script costs likeness rather than leaving a hole.
      var payload = '';
      try { payload = JSON.stringify(r.avatarIdentity); } catch (e) { payload = ''; }
      if (payload){
        wantsEngine = true;
        attrs = ' data-lbr-own="' + esc(payload) + '" data-lbr-uid="' + esc(seed) + '"';
      }
      inner = pfpArt(seed, taken, r && r.name);
    } else if (r && r.photoURL){
      // Their own account photo, over a set picture. onerror is
      // load-bearing: googleusercontent URLs go stale when an account
      // changes its picture, and a dead one would leave an empty tile on
      // the edge of the screen. Dropping the <img> reveals what is behind.
      inner = '<img src="' + esc(r.photoURL) + '" alt="" loading="lazy" decoding="async"'
        + ' referrerpolicy="no-referrer" onerror="this.parentNode.removeChild(this)">'
        + pfpArt(seed, taken, r && r.name);
    } else {
      inner = pfpArt(seed, taken, r && r.name);
    }
    return { inner: inner, attrs: attrs };
  }
  function face(r, i, taken){
    var f = faceInner(r, i, taken);
    return '<span class="lbr-pic"><span class="lbr-ava"' + f.attrs + '>' + f.inner + '</span>'
      + '<span class="lbr-rk">' + (r.rank || '·') + '</span></span>';
  }
  /* The phone strip (#mhBoard in the mobile home). Same rows, same
     three-real-rows floor, same picture tiers; five tiles in a row that
     scrolls sideways. */
  var PHONE_ROWS = 5;
  function renderMobile(rows, total){
    var board = document.getElementById('mhBoard');
    var row = board && document.getElementById('mhBoardRow');
    if (!board || !row) return false;
    if (!rows || rows.length < 3) { board.hidden = true; row.innerHTML = ""; return false; }
    var n = Math.min(rows.length, PHONE_ROWS);
    var taken = {};
    var html = '';
    for (var i = 0; i < n; i++){
      var r = rows[i] || {};
      var rated = r.kind === 'rating' && typeof r.rating === 'number';
      var num = rated ? String(Math.round(r.rating)) : score(r.score);
      var name = anon(r.name) ? 'Anonymous' : esc(r.name);
      var f = faceInner(r, i, taken);
      html += '<span class="mh-tile">'
        + '<span class="mh-ava"' + f.attrs + '>' + f.inner + '<b class="mh-rk">' + (r.rank || '·') + '</b></span>'
        + '<span class="mh-nm">' + name + '</span>'
        + '<span class="mh-sc">' + esc(num) + ' rating</span>'
        + (r.rank ? '' : '<span class="mh-sc">In placement</span>')
        + '</span>';
    }
    row.innerHTML = html;
    if (wantsEngine){ try { upgradeAvatars(row); } catch (e) {} }
    var tot = board.querySelector('[data-mh-total]');
    if (tot && typeof total === 'number' && total > n) tot.textContent = 'View the full board';
    board.hidden = false;
    return true;
  }
  /* Only a row carrying a REAL built identity needs the avatar engine, so
     it loads after the rail has painted and only when there is one to
     draw. ~27KB gzipped on the highest-traffic page on the site is not
     something a column of set pictures should be paying. Shares the
     ranked band's script tag and ready event so the two never fetch it
     twice. */
  function upgradeAvatars(host){
    var cells = host.querySelectorAll('[data-lbr-own]');
    if (!cells.length) return;
    function paint(){
      if (!window.DBAvatar || !DBAvatar.publicSvg) return;
      Array.prototype.forEach.call(cells, function(cell){
        var markup;
        try { markup = DBAvatar.publicSvg(JSON.parse(cell.getAttribute('data-lbr-own')), '100%', { uid:cell.getAttribute('data-lbr-uid') }); }
        catch (e) { return; }
        if (markup) cell.innerHTML = markup;
      });
    }
    if (window.DBAvatar) { paint(); return; }
    if (document.querySelector('script[data-rb-avatar]')) {
      document.addEventListener('dbav-ready', paint, { once: true });
      return;
    }
    var tag = document.createElement('script');
    tag.src = '/js/avatar.js';
    tag.defer = true;
    tag.setAttribute('data-rb-avatar', '1');
    tag.onload = function(){ paint(); try { document.dispatchEvent(new Event('dbav-ready')); } catch (e) {} };
    document.head.appendChild(tag);
  }

  function render(rows, total){
    // Three real rows is the floor. Below it the rail stays hidden
    // rather than borrowing the board's sample names: a labelled sample
    // works inside a card that can carry the label, and a face hanging
    // off the edge of the window cannot.
    if (!rows || rows.length < 3) { rail.hidden = true; list.innerHTML = ""; return false; }
    var n = Math.min(rows.length, ROWS);
    var taken = {};  // set pictures spent on this rail
    var html = '';
    for (var i = 0; i < n; i++){
      var r = rows[i] || {};
      var rated = r.kind === 'rating' && typeof r.rating === 'number';
      var num = rated ? String(Math.round(r.rating)) : score(r.score);
      var lab = r.rank ? 'Rating' : 'Placement rating';
      var name = anon(r.name) ? 'Anonymous' : esc(r.name);
      html += '<a class="lbr-item" href="/leaderboard" data-lbr="row' + (i + 1) + '" style="--i:' + (i + 1) + '">'
        + '<span class="lbr-card" aria-hidden="true">'
        + '<span class="lbr-nm">' + name + '</span>'
        + '<span class="lbr-meta"><b class="lbr-sc">' + esc(num) + '</b>'
        + '<span class="lbr-fmt">' + esc(lab) + '</span></span>'
        + '</span>'
        + face(r, i, taken)
        + '<span class="lbr-sr">' + (r.rank ? 'Rank ' + r.rank : 'In placement') + '. ' + name + '</span>'
        + '</a>';
    }
    list.innerHTML = html;
    if (wantsEngine){ try { upgradeAvatars(list); } catch (e) {} }
    var more = rail.querySelector('.lbr-more');
    if (more && typeof total === 'number' && total > n){
      var lab = more.querySelector('[data-lbr-total]');
      if (lab) lab.textContent = 'View the full board';
      more.style.setProperty('--i', n + 1);
      more.hidden = false;
    }
    rail.hidden = false;
    return true;
  }

  /* The rail belongs to the first screen. Past it the page has its own
     chapters (the full board among them) and a floating dock would be
     competing with them.

     Deliberately a throttled scroll read rather than an
     IntersectionObserver: this page scrolls the BODY (overflow:auto), so
     an observer against the implicit root is the wrong instrument and
     never fired once in testing. The listener is bound with capture on
     the document because a scroll event on the body element does not
     bubble to window. The class goes on first and comes off later, so a
     browser that never sends a scroll event still shows the rail. */
  function watch(){
    document.body.classList.add('lbr-on');
    var hero = document.getElementById('first-screen');
    if (!hero) return;
    var last = 0;
    function sync(){
      last = Date.now();
      var r = hero.getBoundingClientRect();
      document.body.classList.toggle('lbr-on', r.bottom > 140);
    }
    function onMove(){ if (Date.now() - last > 90) sync(); }
    document.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove, { passive: true });
  }

  /* The picture set arrives on a DEFERRED script, and the board data
     arrives on a fetch that was kicked off at the top of the page. Those
     two race, and on a fast connection the fetch wins: a 5-minute-cached
     endpoint can answer in tens of milliseconds while there are still
     thousands of lines of this document left to parse. When it won, every
     tile that needed a drawn picture rendered EMPTY and nothing repainted
     it, which is what "missing images on the leaderboard pop out" was.

     So the rail waits for both. The timeout is the important half: a
     blocked or failed /js/pfp-set.js must cost texture, never the rail,
     so at 3 seconds it paints anyway and the tiles fall back to the
     board's emblem. */
  function setReady(){
    if (window.DBPfp) return Promise.resolve();
    return new Promise(function(resolve){
      var done = false;
      function go(){ if (!done){ done = true; resolve(); } }
      var tag = document.querySelector('script[src="/js/pfp-set.js"]');
      if (tag){
        tag.addEventListener('load', go);
        tag.addEventListener('error', go);
      }
      setTimeout(go, 3000);
    });
  }
  var painted = false;
  var phone = false;
  try { phone = !!(window.matchMedia && window.matchMedia('(max-width:720px)').matches); } catch (e) {}
  function paint(j){
    if (!j || j.error || !Array.isArray(j.rows)) return;
    // Keep both layouts current so resizing does not reveal an old board.
    renderMobile(j.rows, j.total);
    var shown = render(j.rows, j.total);
    if (!painted && shown){
      painted = true;
      watch();
      try { if (window.gtag) gtag('event', phone ? 'mhome_board_view' : 'lb_rail_view'); } catch (e) {}
    }
  }
  function paintWhenReady(j){ setReady().then(function(){ paint(j); }); }
  if (window.__lbTop && window.__lbTop.subscribe) window.__lbTop.subscribe(paintWhenReady);
  else if (window.__lbTopReq) window.__lbTopReq.then(paintWhenReady).catch(function(){});
  // On a phone nothing else asks for the board, so the strip asks. Off the
  // first paint on purpose: the mobile home is one screen and this sits
  // below the two cards, so a beat of delay costs nothing anyone sees.
  if (phone && window.__lbTop && window.__lbTop.start && document.getElementById('mhBoard')){
    var kick = function(){ try { window.__lbTop.start(true); } catch (e) {} };
    if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 1500 }); else setTimeout(kick, 700);
  }
  // Layout QA hook: lets a browser with no API paint the strip from rows.
  window.__mhBoardRender = renderMobile;

  rail.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('[data-lbr]') : null;
    if (!a) return;
    try { if (window.gtag) gtag('event', 'lb_rail_click', { door: a.getAttribute('data-lbr') }); } catch (err) {}
  });
})();
