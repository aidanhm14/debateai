/* whats-new.js
 *
 * Returning-visitor "What's new" rail. Pulls the last 3 entries from
 * /changelog (parsed out of the rendered HTML so the changelog stays
 * the single source of truth — no parallel JSON to keep in sync) and
 * floats them as a small dismissible card in the bottom-right.
 *
 * Show logic:
 *   - First time a visitor sees the rail: render it.
 *   - User clicks dismiss: store the latest entry's date in
 *     localStorage 'da-whats-new-seen'. Don't show again until a
 *     newer entry ships.
 *   - User has seen-date >= latest-date: stay hidden.
 *
 * Failure modes (network, parse, missing entries) all fall through
 * silently — this is decoration, not core flow.
 *
 * Mount: include with <script defer src="/js/whats-new.js"></script>
 * on any page where the rail should appear (landing, leaderboard).
 * Auto-mounts on DOMContentLoaded.
 */
(function(){
  'use strict';

  var STORAGE_KEY = 'da-whats-new-seen';
  var ENTRIES_TO_SHOW = 3;
  var FETCH_URL = '/changelog';

  function dismissedThrough(){
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch(e){ return ''; }
  }
  function markSeen(latestDate){
    try { localStorage.setItem(STORAGE_KEY, latestDate); } catch(e){}
  }

  // Parse the rendered changelog HTML. Each entry is an <article class="entry">
  // with .date / .title / .body. Returns at most `limit` entries, newest
  // first (matches the order in the source file).
  function parseEntries(html, limit){
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch(e){ return []; }
    var nodes = doc.querySelectorAll('article.entry');
    var out = [];
    for (var i = 0; i < nodes.length && out.length < limit; i++){
      var n = nodes[i];
      var dateEl = n.querySelector('.date');
      var titleEl = n.querySelector('.title');
      if (!dateEl || !titleEl) continue;
      out.push({
        date: dateEl.textContent.trim(),
        title: titleEl.textContent.trim(),
      });
    }
    return out;
  }

  function renderRail(entries){
    if (!entries.length) return;
    var latest = entries[0].date;
    if (dismissedThrough() >= latest) return;

    var card = document.createElement('aside');
    card.id = 'whats-new-rail';
    card.setAttribute('aria-label', 'Recent updates');
    card.innerHTML =
      '<button class="wn-close" type="button" aria-label="Dismiss">×</button>' +
      '<div class="wn-eyebrow">What\'s new</div>' +
      '<ol class="wn-list">' +
        entries.map(function(e){
          return '<li><span class="wn-date">' + escapeHtml(e.date) + '</span><span class="wn-title">' + escapeHtml(e.title) + '</span></li>';
        }).join('') +
      '</ol>' +
      '<a class="wn-link" href="/changelog">Full changelog &rarr;</a>';
    document.body.appendChild(card);

    card.querySelector('.wn-close').addEventListener('click', function(){
      markSeen(latest);
      card.classList.add('wn-leaving');
      setTimeout(function(){ card.remove(); }, 220);
    });
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // Inject styles. Kept inline so consumers don't need a separate
  // stylesheet drop. Subtle bottom-right card; theme-respecting via
  // the --bg-card / --border / --text tokens that the host pages
  // already define.
  function injectStyles(){
    if (document.getElementById('whats-new-styles')) return;
    var style = document.createElement('style');
    style.id = 'whats-new-styles';
    style.textContent = '' +
      '#whats-new-rail{' +
        'position:fixed;right:18px;bottom:18px;z-index:80;' +
        'width:300px;max-width:calc(100vw - 36px);' +
        'padding:14px 16px 12px;' +
        'background:var(--bg-card,#15151a);' +
        'border:1px solid var(--border-strong,rgba(255,255,255,.18));' +
        'border-radius:14px;' +
        'box-shadow:0 14px 40px rgba(0,0,0,.45);' +
        'font-family:Inter,system-ui,-apple-system,sans-serif;' +
        'color:var(--text,#fff);' +
        'opacity:0;transform:translateY(8px);' +
        'animation:wn-in .35s cubic-bezier(.2,.7,.2,1) .8s forwards;' +
      '}' +
      '@keyframes wn-in{to{opacity:1;transform:translateY(0)}}' +
      '#whats-new-rail.wn-leaving{opacity:0;transform:translateY(8px);transition:opacity .2s, transform .2s}' +
      '#whats-new-rail .wn-eyebrow{' +
        'font-size:.6rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;' +
        'color:var(--accent,#ef4444);margin-bottom:8px;' +
      '}' +
      '#whats-new-rail .wn-close{' +
        'position:absolute;top:8px;right:8px;width:22px;height:22px;' +
        'background:transparent;border:none;color:var(--text-dim,rgba(255,255,255,.55));' +
        'font-size:1rem;line-height:1;cursor:pointer;border-radius:6px;' +
        'transition:color .15s,background .15s;' +
      '}' +
      '#whats-new-rail .wn-close:hover{color:var(--text,#fff);background:rgba(255,255,255,.06)}' +
      '#whats-new-rail .wn-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}' +
      '#whats-new-rail .wn-list li{font-size:.78rem;line-height:1.4;display:flex;flex-direction:column;gap:2px}' +
      '#whats-new-rail .wn-date{' +
        'font-size:.62rem;font-weight:700;letter-spacing:.05em;font-variant-numeric:tabular-nums;' +
        'color:var(--text-ghost,rgba(255,255,255,.42));text-transform:uppercase;' +
      '}' +
      '#whats-new-rail .wn-title{font-weight:600;color:var(--text,#fff);letter-spacing:-.005em}' +
      '#whats-new-rail .wn-link{' +
        'display:inline-block;margin-top:10px;padding-top:10px;' +
        'border-top:1px solid var(--border,rgba(255,255,255,.08));' +
        'font-size:.7rem;font-weight:700;letter-spacing:.04em;color:var(--accent,#ef4444);' +
        'text-decoration:none;width:100%;' +
      '}' +
      '#whats-new-rail .wn-link:hover{text-decoration:underline}' +
      '@media(max-width:560px){' +
        '#whats-new-rail{right:10px;bottom:10px;width:calc(100vw - 20px);max-width:300px;padding:12px 14px 10px}' +
        '#whats-new-rail .wn-list li{font-size:.74rem}' +
      '}' +
      // Light-theme rebind. The default tokens fall through fine on
      // dark surfaces; light needs explicit reads since some pages
      // ship token gaps in light mode.
      '[data-theme="light"] #whats-new-rail{background:#fff;color:#1a1a1f;border-color:rgba(0,0,0,.12);box-shadow:0 14px 40px rgba(0,0,0,.10)}' +
      '[data-theme="light"] #whats-new-rail .wn-close{color:rgba(0,0,0,.45)}' +
      '[data-theme="light"] #whats-new-rail .wn-close:hover{color:#1a1a1f;background:rgba(0,0,0,.05)}' +
      '[data-theme="light"] #whats-new-rail .wn-date{color:rgba(0,0,0,.45)}' +
      '[data-theme="light"] #whats-new-rail .wn-title{color:#1a1a1f}' +
      '[data-theme="light"] #whats-new-rail .wn-link{border-top-color:rgba(0,0,0,.08)}' +
    '';
    document.head.appendChild(style);
  }

  function boot(){
    // Skip if user already dismissed something recent — but we don't
    // know what that is until we fetch. So we always fetch, then
    // check the dismiss-through date inside renderRail.
    fetch(FETCH_URL, { method:'GET', credentials:'omit' })
      .then(function(r){ return r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function(html){
        var entries = parseEntries(html, ENTRIES_TO_SHOW);
        if (!entries.length) return;
        injectStyles();
        renderRail(entries);
      })
      .catch(function(err){
        // Decoration-only — never block / never warn loudly. Console
        // info is enough for debugging.
        try { console.info('[whats-new] skipped:', err && err.message); } catch(e){}
      });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
