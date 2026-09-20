
(function(){
  function isIndia(){
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata') return true;
    } catch(e){}
    try {
      var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language||'']);
      for (var i=0;i<langs.length;i++){
        var L = String(langs[i]||'').toLowerCase();
        if (/-in$/.test(L) || /^hi(\b|-)/.test(L)) return true;
      }
    } catch(e){}
    try {
      var locale = localStorage.getItem('debateos-locale') || '';
      if (locale === 'hi') return true;
    } catch(e){}
    return false;
  }
  if (!isIndia()) return;
  // ── Pricing swap: USD → INR ────────────────────────────────────
  function swapPrices(){
    var nodes = document.querySelectorAll('.da-price[data-inr]');
    for (var i=0;i<nodes.length;i++){
      var n = nodes[i];
      var inr = n.getAttribute('data-inr');
      if (inr) n.textContent = inr;
    }
  }
  // ── Hindi UI banner ────────────────────────────────────────────
  // One soft prompt, top-of-page, dismissable. Skipped if the user
  // already picked Hindi (or already dismissed) so we don't nag.
  function mountHindiBanner(){
    try {
      var locale = localStorage.getItem('debateos-locale') || '';
      var dismissed = localStorage.getItem('debateos-hindi-prompt-dismissed') === '1';
      if (locale === 'hi' || dismissed) return;
    } catch(e){}
    var bar = document.createElement('div');
    bar.setAttribute('role','dialog');
    bar.setAttribute('aria-label','Read the site in Hindi');
    // On phones the centered banner and the bottom-left Feedback pill share
    // the same row and overlap; lift it above the pill there. Desktop keeps 18px.
    var hbBottom = (window.matchMedia && window.matchMedia('(max-width:600px)').matches) ? '82px' : '18px';
    bar.style.cssText = 'position:fixed;left:50%;bottom:' + hbBottom + ';transform:translateX(-50%);' +
      'z-index:9998;display:flex;align-items:center;gap:10px;' +
      'padding:10px 14px 10px 16px;border-radius:999px;' +
      'background:rgba(20,10,18,.92);color:#fff;font-family:var(--font-body);' +
      'font-size:.82rem;line-height:1;backdrop-filter:blur(8px);' +
      'box-shadow:0 8px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);max-width:calc(100vw - 24px);';
    var msg = document.createElement('span');
    msg.style.cssText = 'opacity:.85';
    msg.textContent = 'हिन्दी में पढ़ें?  ·  Read in Hindi?';
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'हिन्दी';
    go.style.cssText = 'padding:6px 14px;border-radius:999px;border:none;cursor:pointer;' +
      'background:#b91c1c;color:#fff;font-weight:700;font-family:inherit;font-size:.78rem;letter-spacing:.02em;';
    go.addEventListener('click', function(){
      try { localStorage.setItem('debateos-hindi-prompt-dismissed','1'); } catch(e){}
      if (window.__setLang) window.__setLang('hi');
    });
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label','Dismiss');
    close.textContent = '×';
    close.style.cssText = 'padding:2px 8px;border:none;background:transparent;color:rgba(255,255,255,.68);cursor:pointer;font-size:1.1rem;line-height:1;font-family:inherit;';
    close.addEventListener('click', function(){
      try { localStorage.setItem('debateos-hindi-prompt-dismissed','1'); } catch(e){}
      bar.remove();
    });
    bar.appendChild(msg);
    bar.appendChild(go);
    bar.appendChild(close);
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ swapPrices(); mountHindiBanner(); });
  } else {
    swapPrices(); mountHindiBanner();
  }
})();
