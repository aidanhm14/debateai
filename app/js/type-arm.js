/* type-arm.js — a per-browser type stack you can walk the whole site in.
   QA only. Nobody sees it unless they opt in.

   `?type=newspaper` on any topbar page turns it on and remembers it in
   localStorage (`da-type`), so every page after that renders in the
   stack until `?type=off`. Nothing here is a sitewide change: the tokens
   and the 147 hardcoded font stacks across 36 files are untouched, and
   topbar.js only injects this file when the key or the query is present.

   It is the whole newspaper look, not only the type (2026-09-04, second
   pass, Aidan: "i dont see the typewriter or square elements at all"):
   corners go to 2px, shadows go, cards and panels get a 1px rule, the nav
   pills become text links, the constellation canvas is hidden, and any
   element whose own text is a bare number is set in the mono face. The
   one thing that stays round is a person: a square tile that holds an
   image or SVG is read as an avatar and keeps its circle.

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

  // The static half of the look. Selectors here are the ones measured on
  // the live first screen; everything else is handled per element below.
  if (!document.getElementById('da-type-arm-css')) {
    var css = document.createElement('style');
    css.id = 'da-type-arm-css';
    css.textContent = [
      'html[data-type="newspaper"]{--da-rule:rgba(127,127,127,.42)}',
      // The constellation is the generator tell. Paper has no particles.
      'html[data-type="newspaper"] #uiNeuralCanvas,html[data-type="newspaper"] .ui-neural-canvas,html[data-type="newspaper"] [data-lightweb]{display:none!important}',
      // Nav: text, not pills.
      'html[data-type="newspaper"] .ui-topbar-link,html[data-type="newspaper"] .ui-topbar-howbtn,html[data-type="newspaper"] .ui-topbar-more-btn{background:transparent!important;border-color:transparent!important;box-shadow:none!important;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}',
      // Cards and panels: one hairline rule, no float.
      'html[data-type="newspaper"] .fs-board,html[data-type="newspaper"] .fs-chats,html[data-type="newspaper"] .mh-card{border:1px solid var(--da-rule)!important;box-shadow:none!important}',
      'html[data-type="newspaper"] .fs-cta,html[data-type="newspaper"] .ui-btn,html[data-type="newspaper"] .fs-signin-btn{box-shadow:none!important;text-shadow:none!important}',
      // Secondary buttons: outlined blocks.
      'html[data-type="newspaper"] .fs-cta--ghost,html[data-type="newspaper"] .fs-signin-btn,html[data-type="newspaper"] .ui-btn-ghost,html[data-type="newspaper"] .fs-chats-cta{border:1px solid currentColor!important;box-shadow:none!important}',
      // Photos square with a rule.
      'html[data-type="newspaper"] .fs-board img,html[data-type="newspaper"] .fs-board video{outline:1px solid var(--da-rule);outline-offset:-1px}'
    ].join('\n');
    document.head.appendChild(css);
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
  var MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var NUMERIC = /^\d[\d:.,%\s\/x-]*$/;
  var MEDIA_TAG = /^(IMG|VIDEO|SVG|CANVAS|PICTURE)$/;

  // A person stays round. A square box that holds a picture is an avatar.
  function isPortrait(el, rect){
    if (Math.abs(rect.width - rect.height) > 2 || rect.width > 120) return false;
    if (MEDIA_TAG.test(el.tagName)) return true;
    return !!el.querySelector('img,svg,video');
  }
  function ownText(el){
    var t = '';
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  }

  // READ everything about an element first; WRITE later. Interleaving the
  // two forces a reflow per element, which on the 14k-line landing is the
  // difference between 40ms and a visible hang.
  function read(el){
    if (el.nodeType !== 1 || SKIP_TAG.test(el.tagName)) return null;
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var rec = { el: el, font: null, tag: null, radius: false, shadow: false, mono: false };
    var fam = cs.fontFamily || '';
    if (el.closest(KEEP_SEL)) {
      if (MAST_SANS.test(fam)) { rec.font = MAST; rec.tag = 'mast'; }
    } else if (MAST_SANS.test(fam)) {
      if (readable(el)) { rec.font = READ; rec.tag = 'read'; }
      else if (SANS.test(fam)) { rec.font = UI; rec.tag = ''; }
    }
    // Shape. Dots and hairlines are left alone (a 6px dot squared is a
    // pixel); portraits keep their circle; everything else squares off.
    var r = parseFloat(cs.borderRadius) || 0;
    if (r > 2 && rect.width > 16 && rect.height > 16 && !MEDIA_TAG.test(el.tagName) && !isPortrait(el, rect)) rec.radius = true;
    if (cs.boxShadow && cs.boxShadow !== 'none' && !isPortrait(el, rect)) rec.shadow = true;
    // Numbers: a clock, a score, a rating, a count.
    if (!MEDIA_TAG.test(el.tagName) && rect.width > 0) {
      var t = ownText(el);
      if (t && t.length <= 12 && NUMERIC.test(t) && !/mono/i.test(fam)) rec.mono = true;
    }
    if (!rec.font && !rec.radius && !rec.shadow && !rec.mono) return null;
    return rec;
  }
  function write(rec){
    var st = rec.el.style;
    if (rec.font) { st.fontFamily = rec.font; rec.el.setAttribute('data-type-arm', rec.tag); }
    if (rec.mono) { st.setProperty('font-family', MONO, 'important'); st.setProperty('font-variant-numeric', 'tabular-nums'); rec.el.setAttribute('data-type-arm', 'mono'); }
    if (rec.radius) st.setProperty('border-radius', '2px', 'important');
    if (rec.shadow) st.setProperty('box-shadow', 'none', 'important');
  }

  function sweep(scope){
    var cap = 20000;
    var all = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
    var recs = [];
    var r0 = read(scope); if (r0) recs.push(r0);
    for (var i = 0; i < all.length && i < cap; i++) { var r = read(all[i]); if (r) recs.push(r); }
    for (var j = 0; j < recs.length; j++) write(recs[j]);
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
