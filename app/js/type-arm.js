/* type-arm.js — a per-browser type stack you can walk the whole site in.
   QA only. Nobody sees it unless they opt in.

   `?type=newspaper` on any topbar page turns it on and remembers it in
   localStorage (`da-type`), so every page after that renders in the
   stack until `?type=off`. Nothing here is a sitewide change: the tokens
   and the 147 hardcoded font stacks across 36 files are untouched, and
   topbar.js only injects this file when the key or the query is present.

   The newspaper stack (2026-09-04, chosen off the specimen sheet):
     display   Instrument Serif   already on the site, left alone
     UI        Libre Franklin     replaces Inter / DM Sans / Archivo
     reading   Source Serif 4     long paragraphs only (the FAQ answers,
                                  rules, ballots), already loaded sitewide
     numbers   Geist Mono         left alone

   Why a computed-style pass and not a CSS override: 147 rules hardcode
   `font-family: Inter,...` and 94 hardcode a mono stack, so a blunt
   `* { font-family: X !important }` would put the round clock in a
   newspaper sans. Reading the computed family per element and replacing
   ONLY the sans families is exact: mono stays mono, the serif motion stays
   serif, emoji and icon fonts stay what they are. A MutationObserver covers
   React surfaces that render after load.

   If this graduates to a real sweep, the sweep is: the three tokens in
   ui.css plus a sed over the hardcoded Inter stacks, and this file goes. */
(function(){
  if (window.__daTypeArmLoaded) return;
  window.__daTypeArmLoaded = true;

  var KEY = 'da-type';
  var q = null;
  try { q = new URLSearchParams(location.search).get('type'); } catch (e) {}
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}

  if (q === 'off' || q === 'default') {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return;
  }
  var arm = (q === 'newspaper') ? 'newspaper' : stored;
  if (arm !== 'newspaper') return;
  if (q) { try { localStorage.setItem(KEY, arm); } catch (e) {} }

  var root = document.documentElement;
  root.setAttribute('data-type', arm);

  var UI   = '"Libre Franklin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var READ = '"Source Serif 4", Georgia, "Times New Roman", serif';

  // Token users flip for free; the pass below catches the hardcoded rest.
  root.style.setProperty('--font-display', UI);
  root.style.setProperty('--font-body', UI);
  root.style.setProperty('--font-judge', READ);

  if (!document.querySelector('link[href*="Libre+Franklin"]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Instrument+Serif&display=swap';
    document.head.appendChild(link);
  }

  // The sans families the site actually uses. Anything else (mono, serif,
  // emoji, icon fonts, system-ui) is left exactly as it is.
  var SANS = /^\s*["']?(inter|dm sans|archivo)\b/i;
  var SKIP_TAG = /^(SCRIPT|STYLE|SVG|PATH|G|USE|CANVAS|VIDEO|AUDIO|IFRAME|CODE|PRE|KBD|SAMP|NOSCRIPT|TEMPLATE)$/;
  // The wordmark keeps its own face; a newspaper masthead is not set in
  // the body sans.
  var KEEP_SEL = '.ui-topbar-logo,.logo,.brand,[class*="wordmark"],[class*="brandmark"],[class*="brand-mark"]';
  var MAST = '"Archivo", "Libre Franklin", system-ui, sans-serif';
  // Reading text: real paragraphs of real length, not labels, not buttons.
  var READ_TAG = /^(P|LI|DD|BLOCKQUOTE|FIGCAPTION)$/;
  var NO_READ_ANCESTOR = 'nav,button,a,label,summary,th,[role="button"],[role="tab"],[class*="mono"],[class*="timer"],[class*="clock"]';

  function readable(el){
    if (!READ_TAG.test(el.tagName)) return false;
    if (el.closest(NO_READ_ANCESTOR)) return false;
    var t = (el.textContent || '').trim();
    if (t.length < 120) return false;
    var fs = parseFloat(getComputedStyle(el).fontSize) || 0;
    return fs >= 15;
  }

  // The wordmark reads the display token, so the token flip would have
  // put the masthead in the body sans. Pin it back to Archivo.
  var MAST_SANS = /^\s*["']?(inter|dm sans|archivo|libre franklin)\b/i;
  function apply(el){
    if (el.nodeType !== 1 || SKIP_TAG.test(el.tagName)) return;
    var fam = getComputedStyle(el).fontFamily || '';
    if (el.closest(KEEP_SEL)) {
      if (MAST_SANS.test(fam)) { el.style.fontFamily = MAST; el.setAttribute('data-type-arm', 'mast'); }
      return;
    }
    // Token users are already Franklin by the time this runs; the reading
    // serif still has to be applied to them, so test the wider set here.
    if (!MAST_SANS.test(fam)) return;
    if (readable(el)) { el.style.fontFamily = READ; el.setAttribute('data-type-arm', 'read'); return; }
    if (!SANS.test(fam)) return;
    el.style.fontFamily = UI;
    el.setAttribute('data-type-arm', '');
  }

  function sweep(scope){
    var cap = 20000;
    apply(scope);
    var all = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
    for (var i = 0; i < all.length && i < cap; i++) apply(all[i]);
  }

  function start(){
    sweep(document.body);
    var pending = [];
    var scheduled = false;
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) if (added[j].nodeType === 1) pending.push(added[j]);
      }
      if (scheduled || !pending.length) return;
      scheduled = true;
      requestAnimationFrame(function(){
        scheduled = false;
        var batch = pending; pending = [];
        for (var k = 0; k < batch.length; k++) if (batch[k].isConnected) sweep(batch[k]);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // Fonts arrive after the pass; nothing to redo, the families are set.
    if (window.console && console.info) console.info('[type-arm] newspaper stack on for this browser. ?type=off turns it off.');
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  window.daTypeArm = {
    off: function(){ try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }
  };
})();
