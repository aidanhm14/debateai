/* DebateIt avatars — a tiny procedural flat-vector avatar engine.
   One module powers both surfaces: the user builds their own avatar,
   and the AI debaters get matched-set faces from the same generator.

   Art direction: young, modern, a little cool. Big expressive eyes,
   rounded heads, contemporary hair (fades, curls, top-knots, buns,
   vibrant colors), hoodies over blazers, and optional gear like
   over-ear headphones or a beanie. Built for HS-through-college
   debaters, not a boardroom.

   Public API (window.DBAvatar):
     svg(config, size)      -> SVG markup string for a config
     persona(key, size)     -> SVG for an AI persona preset
     getUser()              -> saved user config or null
     setUser(config)        -> persist + broadcast 'debateit-avatar-change'
     clearUser()
     randomConfig(seed)     -> a fresh config (deterministic if seed given)
     openBuilder({onSave})  -> the build-your-own modal
     mountWelcome(node,user)-> render the welcome-home card into a node

   No build step. Plain browser JS, loaded via <script defer>. Every
   avatar is inline SVG, so there are no image requests and it themes
   with the page. Colors are literal so a persona reads the same on
   light and dark. No em-dashes in any user-facing string here. */
(function (global) {
  'use strict';

  var STORE_KEY = 'debateit-avatar';
  var EVT = 'debateit-avatar-change';

  // ---- palettes ---------------------------------------------------------
  var SKIN = ['#f8ddc3', '#f0c6a2', '#dba172', '#bd7c4c', '#96603a', '#654227'];
  // natural + a couple of cool dye options (platinum, ash-blue, pink)
  var HAIR = ['#141210', '#3a2418', '#6b4423', '#a5713f', '#e7c979', '#cfd3db', '#7c86ff', '#ff77c8'];
  var BG   = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#a855f7', '#fb7185', '#64748b', '#0ea5e9', '#10b981'];
  // hoodie colors — brighter than a blazer set
  var OUTFIT = ['#1f2937', '#ef4444', '#2563eb', '#7c3aed', '#0d9488', '#db2777', '#f59e0b', '#334155'];

  // number of shape options per field (used by builder + randomizer)
  var N_TOP = 8, N_EYES = 4, N_BROWS = 3, N_MOUTH = 5, N_FACIAL = 4, N_GLASSES = 3, N_ACC = 5;

  function clamp(i, n) { i = i | 0; return i < 0 ? 0 : i >= n ? n - 1 : i; }
  function shade(hex, amt) {
    // lighten (amt>0) / darken (amt<0) a #rrggbb by amt in [-1,1]
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = amt < 0 ? 0 : 255, t = Math.abs(amt);
    r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function defaults() {
    return { skin: 1, hair: 1, top: 1, eyes: 1, brows: 0, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 0, outfit: 0 };
  }
  function norm(c) {
    c = c || {};
    return {
      skin: clamp(c.skin, SKIN.length), hair: clamp(c.hair, HAIR.length),
      top: clamp(c.top, N_TOP), eyes: clamp(c.eyes, N_EYES), brows: clamp(c.brows, N_BROWS),
      mouth: clamp(c.mouth, N_MOUTH), facial: clamp(c.facial, N_FACIAL),
      glasses: clamp(c.glasses, N_GLASSES), accessory: clamp(c.accessory, N_ACC),
      bg: clamp(c.bg, BG.length), outfit: clamp(c.outfit, OUTFIT.length)
    };
  }

  // ---- feature geometry -------------------------------------------------
  // Head: ellipse cx50 cy45 rx21.5 ry22.5. Eyes y45 at x40/x60.
  // Brows y38. Mouth y56. Ears cy47.
  function hairPaths(top, hairCol) {
    // returns { back:'', front:'' }
    var d = shade(hairCol, -0.14), hl = shade(hairCol, 0.16);
    switch (top) {
      case 0: return { back: '', front: '' }; // shaved / none
      case 1: // textured crop
        return { back: '', front: '<path d="M28 41 C28 22 72 22 72 42 C69 33 63 30 58 31 C55 28 45 28 42 31 C37 30 31 33 28 41 Z" fill="' + hairCol + '"/><path d="M40 27 l2 5 M50 25 l0 6 M60 27 l-2 5" stroke="' + hl + '" stroke-width="1.4" stroke-linecap="round"/>' };
      case 2: // fade (fuller top, tight sides, part line)
        return { back: '', front: '<path d="M29 42 C30 24 70 24 71 42 C68 31 60 27 50 27 C40 27 32 31 29 42 Z" fill="' + hairCol + '"/><path d="M45 29 Q52 27 60 30" stroke="' + hl + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' };
      case 3: // curly top / afro
        return { back: '', front: '<path d="M27 41 a7.5 7.5 0 1 1 5 -13 a8 8 0 0 1 13 -5 a8 8 0 0 1 13 5 a7.5 7.5 0 0 1 5 13 a6 6 0 0 1 -3 5 C71 34 62 29 50 29 C38 29 29 34 30 46 a6 6 0 0 1 -3 -5 Z" fill="' + hairCol + '"/>' };
      case 4: // long straight
        return {
          back: '<path d="M26 42 C22 66 26 84 31 88 L36 86 C32 72 33 56 34 46 Z M74 42 C78 66 74 84 69 88 L64 86 C68 72 67 56 66 46 Z" fill="' + d + '"/>',
          front: '<path d="M27 44 C25 22 75 22 73 44 C70 31 61 27 50 27 C39 27 30 31 27 44 Z" fill="' + hairCol + '"/>'
        };
      case 5: // top-knot / man-bun (undercut sides)
        return {
          back: '<circle cx="50" cy="18" r="7.5" fill="' + d + '"/>',
          front: '<path d="M30 42 C30 27 70 27 70 42 C67 33 59 29 50 29 C41 29 33 33 30 42 Z" fill="' + hairCol + '"/><path d="M43 28 Q50 22 57 28" stroke="' + hl + '" stroke-width="1.3" fill="none"/>'
        };
      case 6: // double buns
        return {
          back: '<circle cx="34" cy="24" r="6.5" fill="' + d + '"/><circle cx="66" cy="24" r="6.5" fill="' + d + '"/>',
          front: '<path d="M30 42 C30 28 70 28 70 42 C67 33 59 30 50 30 C41 30 33 33 30 42 Z" fill="' + hairCol + '"/>'
        };
      case 7: // side-swept / undercut
        return {
          back: '',
          front: '<path d="M28 43 C27 24 72 22 73 41 C71 32 61 28 47 29 C41 29 35 31 34 40 C38 34 44 32 49 33 C43 36 34 39 28 43 Z" fill="' + hairCol + '"/>'
        };
    }
    return { back: '', front: '' };
  }

  function eyesPath(kind) {
    var L = 40, R = 60, y = 45, ink = '#2a2320';
    switch (kind) {
      case 0: // chill dots
        return '<circle cx="' + L + '" cy="' + y + '" r="2.6" fill="' + ink + '"/><circle cx="' + R + '" cy="' + y + '" r="2.6" fill="' + ink + '"/>';
      case 1: // big and bright (young default)
        return '<ellipse cx="' + L + '" cy="' + y + '" rx="3.3" ry="3.9" fill="#fff"/><ellipse cx="' + R + '" cy="' + y + '" rx="3.3" ry="3.9" fill="#fff"/>' +
               '<circle cx="' + L + '" cy="' + (y + 0.4) + '" r="2.1" fill="' + ink + '"/><circle cx="' + R + '" cy="' + (y + 0.4) + '" r="2.1" fill="' + ink + '"/>' +
               '<circle cx="' + (L + 1.1) + '" cy="' + (y - 1.1) + '" r=".85" fill="#fff"/><circle cx="' + (R + 1.1) + '" cy="' + (y - 1.1) + '" r=".85" fill="#fff"/>';
      case 2: // relaxed half-lids
        return '<path d="M36.5 45 Q40 47.8 43.5 45" stroke="' + ink + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>' +
               '<path d="M56.5 45 Q60 47.8 63.5 45" stroke="' + ink + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>';
      case 3: // sharp / locked-in
        return '<circle cx="' + L + '" cy="' + y + '" r="3.2" fill="#fff"/><circle cx="' + R + '" cy="' + y + '" r="3.2" fill="#fff"/>' +
               '<circle cx="' + L + '" cy="' + y + '" r="1.9" fill="' + ink + '"/><circle cx="' + R + '" cy="' + y + '" r="1.9" fill="' + ink + '"/>' +
               '<path d="M36.4 43 L43.6 44.4" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>' +
               '<path d="M63.6 43 L56.4 44.4" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>';
    }
    return '';
  }

  function browsPath(kind) {
    var ink = '#3a2c22';
    switch (kind) {
      case 0: // soft
        return '<path d="M35.5 38.6 Q40 36.8 44.5 38.6" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
               '<path d="M55.5 38.6 Q60 36.8 64.5 38.6" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>';
      case 1: // raised
        return '<path d="M35.5 37 Q40 34.2 44.5 37" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
               '<path d="M55.5 37 Q60 34.2 64.5 37" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>';
      case 2: // sharp
        return '<path d="M35.5 37.6 L44.5 39.4" stroke="' + ink + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
               '<path d="M64.5 37.6 L55.5 39.4" stroke="' + ink + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
    }
    return '';
  }

  function mouthPath(kind) {
    var lip = '#c26b5e';
    switch (kind) {
      case 0: return '<path d="M45.5 56 L54.5 56" stroke="' + lip + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>'; // neutral
      case 1: return '<path d="M44 55 Q50 61.5 56 55" stroke="' + lip + '" stroke-width="2" fill="none" stroke-linecap="round"/>'; // smile
      case 2: return '<path d="M44.5 56.6 Q49 58.2 55.5 54.8" stroke="' + lip + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>'; // smirk
      case 3: return '<path d="M44.5 57.6 Q50 54 55.5 57.6" stroke="' + lip + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>'; // serious
      case 4: return '<ellipse cx="50" cy="56.5" rx="3.6" ry="2.8" fill="#8a3f38"/><path d="M46.6 55.4 Q50 54.2 53.4 55.4" stroke="#fff" stroke-width="1" fill="none"/>'; // open
    }
    return '';
  }

  function facialPath(kind, hairCol) {
    switch (kind) {
      case 0: return '';
      case 1: // light stubble
        return '<path d="M32 51 C32 67 42 73 50 73 C58 73 68 67 68 51 C65 63 58 67 50 67 C42 67 35 63 32 51 Z" fill="' + shade(hairCol, -0.08) + '" opacity=".2"/>';
      case 2: // mustache
        return '<path d="M43 53 Q50 50.5 57 53 Q52 56 50 55.4 Q48 56 43 53 Z" fill="' + shade(hairCol, -0.04) + '"/>';
      case 3: // short beard (trim, young)
        return '<path d="M33 50 C33 66 42 74 50 74 C58 74 67 66 67 50 C64 60 60 62 60 57 C56 61 44 61 40 57 C40 62 36 60 33 50 Z" fill="' + hairCol + '"/>' +
               '<path d="M43 53 Q50 51 57 53 Q52 55.4 50 55 Q48 55.4 43 53 Z" fill="' + shade(hairCol, -0.06) + '"/>';
    }
    return '';
  }

  function glassesPath(kind) {
    var c = '#22242c';
    switch (kind) {
      case 0: return '';
      case 1: // thin round
        return '<g fill="none" stroke="' + c + '" stroke-width="1.5"><circle cx="40" cy="45" r="5.6"/><circle cx="60" cy="45" r="5.6"/><path d="M45.6 44.4 Q50 43.2 54.4 44.4"/><path d="M34.4 44 L30 43" stroke-linecap="round"/><path d="M65.6 44 L70 43" stroke-linecap="round"/></g>';
      case 2: // bold square
        return '<g fill="none" stroke="' + c + '" stroke-width="2"><rect x="33.5" y="40" width="11.5" height="9.5" rx="2.4"/><rect x="55" y="40" width="11.5" height="9.5" rx="2.4"/><path d="M45 43.8 Q50 42.6 55 43.8"/><path d="M33.5 42.8 L29 41.6" stroke-linecap="round"/><path d="M66.5 42.8 L71 41.6" stroke-linecap="round"/></g>';
    }
    return '';
  }

  // gear drawn OVER hair/face. Earrings render near the ears.
  function accessoryOver(kind, outCol) {
    switch (kind) {
      case 1: // over-ear headphones
        return '<path d="M26 42 Q50 12 74 42" fill="none" stroke="#20242e" stroke-width="4.2" stroke-linecap="round"/>' +
               '<rect x="21.5" y="41" width="9.5" height="16" rx="4.5" fill="#20242e"/><rect x="69" y="41" width="9.5" height="16" rx="4.5" fill="#20242e"/>' +
               '<rect x="24" y="45" width="4.5" height="8" rx="2.2" fill="#ef4444"/><rect x="71.5" y="45" width="4.5" height="8" rx="2.2" fill="#ef4444"/>';
      case 2: // beanie
        return '<path d="M26 42 C26 19 74 19 74 42 C67 32 59 29 50 29 C41 29 33 32 26 42 Z" fill="' + outCol + '"/>' +
               '<rect x="24" y="38.5" width="52" height="8" rx="4" fill="' + shade(outCol, 0.16) + '"/>' +
               '<circle cx="50" cy="17.5" r="4.2" fill="' + shade(outCol, 0.16) + '"/>' +
               '<path d="M35 40 v5 M44 39 v6 M53 39 v6 M62 40 v5" stroke="' + shade(outCol, -0.14) + '" stroke-width="1.2" opacity=".6"/>';
      case 4: // snapback cap
        return '<path d="M29 41 C29 24 71 24 71 40 Q50 33 29 41 Z" fill="' + outCol + '"/>' +
               '<path d="M29 40.5 Q19 41 15 45 L41 45 Q37 41 29 40.5 Z" fill="' + shade(outCol, -0.16) + '"/>' +
               '<circle cx="50" cy="26.5" r="1.8" fill="' + shade(outCol, 0.2) + '"/>';
    }
    return '';
  }

  var uid = 0;
  function svg(config, size) {
    var c = norm(config);
    size = size || 96;
    var skinCol = SKIN[c.skin], hairCol = HAIR[c.hair], bgCol = BG[c.bg], outCol = OUTFIT[c.outfit];
    var skinShade = shade(skinCol, -0.13);
    var id = 'dbav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : size;
    var earring = (c.accessory === 3)
      ? '<circle cx="29" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/><circle cx="71" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/>'
      : '';

    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="avatar" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="32%" cy="24%" r="82%"><stop offset="0%" stop-color="' + shade(bgCol, 0.24) + '"/><stop offset="100%" stop-color="' + shade(bgCol, -0.06) + '"/></radialGradient></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'g)"/>' +
      hair.back +
      // hoodie
      '<path d="M15 100 C15 79 30 71 50 71 C70 71 85 79 85 100 Z" fill="' + outCol + '"/>' +
      '<path d="M38 72 Q50 80 62 72 L63 76 Q50 84 37 76 Z" fill="' + shade(outCol, -0.16) + '"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/>' +
      // neck
      '<path d="M43 60 h14 v9 q-7 5 -14 0 Z" fill="' + skinShade + '"/>' +
      // head
      '<ellipse cx="50" cy="45" rx="21.5" ry="22.5" fill="' + skinCol + '"/>' +
      // ears
      '<circle cx="28.5" cy="47" r="3.9" fill="' + skinCol + '"/><circle cx="71.5" cy="47" r="3.9" fill="' + skinCol + '"/>' +
      earring +
      facialPath(c.facial, hairCol) +
      // nose
      '<path d="M50 47 Q52.2 51.4 49 52.2" stroke="' + skinShade + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      browsPath(c.brows) +
      eyesPath(c.eyes) +
      mouthPath(c.mouth) +
      hair.front +
      glassesPath(c.glasses) +
      accessoryOver(c.accessory, outCol) +
      '</g></svg>';
  }

  // ---- Talking avatar (live lip-sync + expressions) --------------------
  // Same face as svg(), but eyes / brows / mouth live in addressable
  // groups (.ta-eyes / .ta-brows / .ta-mouth) inside a .ta-face group so a
  // controller can animate them from live audio + coach state.
  // "SVG now, video later": the controller interface is backend-agnostic
  // (setState / setEmotion / setAmplitude / attachAudio / destroy), so a
  // photoreal video head can implement the same shape and drop in later.

  function talkingMouth(open, emotion) {
    var lip = '#c26b5e', cav = '#7a2f2a', cy = 56;
    var corner = emotion === 'encouraging' ? -1.7 : (emotion === 'pushing' ? 1.5 : 0);
    open = open < 0 ? 0 : open > 1 ? 1 : open;
    if (open < 0.06) {
      return '<path d="M44.3 ' + (cy - corner * 0.15).toFixed(2) + ' Q50 ' + (cy + corner).toFixed(2) + ' 55.7 ' + (cy - corner * 0.15).toFixed(2) + '" stroke="' + lip + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>';
    }
    var rx = 4.3 + open * 1.7, ry = 0.9 + open * 5.1;
    var teeth = open > 0.34
      ? '<path d="M' + (50 - rx + 1).toFixed(2) + ' ' + (cy - ry + 1.2).toFixed(2) + ' Q50 ' + (cy - ry + 0.2).toFixed(2) + ' ' + (50 + rx - 1).toFixed(2) + ' ' + (cy - ry + 1.2).toFixed(2) + '" stroke="#fff" stroke-width="1.3" fill="none" opacity=".9"/>'
      : '';
    return '<ellipse cx="50" cy="' + cy + '" rx="' + rx.toFixed(2) + '" ry="' + ry.toFixed(2) + '" fill="' + cav + '"/>' + teeth +
      '<path d="M' + (50 - rx - 1).toFixed(2) + ' ' + cy + ' Q50 ' + (cy - ry - 1.4 + corner).toFixed(2) + ' ' + (50 + rx + 1).toFixed(2) + ' ' + cy + '" stroke="' + lip + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + (50 - rx - 1).toFixed(2) + ' ' + cy + ' Q50 ' + (cy + ry + 1.7).toFixed(2) + ' ' + (50 + rx + 1).toFixed(2) + ' ' + cy + '" stroke="' + lip + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>';
  }

  function talkingEyes(openFrac, gx, gy) {
    var L = 40, R = 60, y = 45, ink = '#2a2320';
    gx = gx || 0; gy = gy || 0;
    if (openFrac < 0.12) {
      return '<path d="M36.6 ' + y + ' Q40 ' + (y + 0.7) + ' 43.4 ' + y + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
             '<path d="M56.6 ' + y + ' Q60 ' + (y + 0.7) + ' 63.4 ' + y + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    }
    var ry = (3.9 * openFrac + 0.3).toFixed(2);
    return '<ellipse cx="' + L + '" cy="' + y + '" rx="3.3" ry="' + ry + '" fill="#fff"/>' +
           '<ellipse cx="' + R + '" cy="' + y + '" rx="3.3" ry="' + ry + '" fill="#fff"/>' +
           '<circle cx="' + (L + gx).toFixed(2) + '" cy="' + (y + 0.4 + gy).toFixed(2) + '" r="2" fill="' + ink + '"/>' +
           '<circle cx="' + (R + gx).toFixed(2) + '" cy="' + (y + 0.4 + gy).toFixed(2) + '" r="2" fill="' + ink + '"/>' +
           '<circle cx="' + (L + gx + 1).toFixed(2) + '" cy="' + (y - 1 + gy).toFixed(2) + '" r=".8" fill="#fff"/>' +
           '<circle cx="' + (R + gx + 1).toFixed(2) + '" cy="' + (y - 1 + gy).toFixed(2) + '" r=".8" fill="#fff"/>';
  }

  function talkingBrows(raise, angle) {
    var ink = '#3a2c22', base = 38.6 - raise;
    var innerL = base + angle, innerR = base + angle;
    var outerL = base - raise * 0.25, outerR = base - raise * 0.25;
    return '<path d="M35.5 ' + outerL.toFixed(2) + ' Q40 ' + (base - 1.7).toFixed(2) + ' 44.5 ' + innerL.toFixed(2) + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
           '<path d="M64.5 ' + outerR.toFixed(2) + ' Q60 ' + (base - 1.7).toFixed(2) + ' 55.5 ' + innerR.toFixed(2) + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  }

  // A near-copy of svg() with the animatable parts in named groups and the
  // head-and-up wrapped in .ta-face (so head bob / tilt transforms apply).
  function talkingSvg(config, size) {
    var c = norm(config);
    var skinCol = SKIN[c.skin], hairCol = HAIR[c.hair], bgCol = BG[c.bg], outCol = OUTFIT[c.outfit];
    var skinShade = shade(skinCol, -0.13);
    var id = 'tav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : (size || 200);
    var earring = (c.accessory === 3)
      ? '<circle cx="29" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/><circle cx="71" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/>'
      : '';
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="talking avatar" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="32%" cy="24%" r="82%"><stop offset="0%" stop-color="' + shade(bgCol, 0.24) + '"/><stop offset="100%" stop-color="' + shade(bgCol, -0.06) + '"/></radialGradient></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'g)"/>' +
      hair.back +
      '<path d="M15 100 C15 79 30 71 50 71 C70 71 85 79 85 100 Z" fill="' + outCol + '"/>' +
      '<path d="M38 72 Q50 80 62 72 L63 76 Q50 84 37 76 Z" fill="' + shade(outCol, -0.16) + '"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/>' +
      '<g class="ta-face">' +
      '<path d="M43 60 h14 v9 q-7 5 -14 0 Z" fill="' + skinShade + '"/>' +
      '<ellipse cx="50" cy="45" rx="21.5" ry="22.5" fill="' + skinCol + '"/>' +
      '<circle cx="28.5" cy="47" r="3.9" fill="' + skinCol + '"/><circle cx="71.5" cy="47" r="3.9" fill="' + skinCol + '"/>' +
      earring +
      facialPath(c.facial, hairCol) +
      '<path d="M50 47 Q52.2 51.4 49 52.2" stroke="' + skinShade + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<g class="ta-brows">' + talkingBrows(0, 0) + '</g>' +
      '<g class="ta-eyes">' + talkingEyes(1, 0, 0) + '</g>' +
      '<g class="ta-mouth">' + talkingMouth(0, 'neutral') + '</g>' +
      hair.front +
      glassesPath(c.glasses) +
      accessoryOver(c.accessory, outCol) +
      '</g>' +
      '</g></svg>';
  }

  function tnow() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  // mountTalking(container, config, opts) -> controller
  function mountTalking(container, config, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return null;
    container.innerHTML = talkingSvg(config, opts.size || '100%');
    var svgEl = container.querySelector('svg');
    var faceEl = container.querySelector('.ta-face');
    var browsEl = container.querySelector('.ta-brows');
    var eyesEl = container.querySelector('.ta-eyes');
    var mouthEl = container.querySelector('.ta-mouth');
    if (!faceEl) return null;

    var state = 'idle', emoOverride = null;
    var manualAmp = null, amp = 0, smoothAmp = 0;
    var analyser = null, audioCtx = null, srcNode = null, freqBuf = null, ownCtx = false;
    var running = true, raf = 0;
    // Respect reduced-motion: keep the functional lip-sync + blink, drop the
    // decorative idle breathing / head bob / tilt.
    var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var t0 = tnow();
    var nextBlink = t0 + 1500 + Math.random() * 2500, blinkStart = -1;
    var lastMouth = '', lastEyes = '', lastBrows = '';

    function effEmotion() {
      if (emoOverride) return emoOverride;
      if (state === 'talking') return smoothAmp > 0.5 ? 'pushing' : 'neutral';
      if (state === 'listening') return 'encouraging';
      return 'neutral';
    }
    function gaze() {
      if (state === 'thinking') return { x: 1.3, y: -1.7 };
      if (state === 'listening') return { x: 0, y: 0.4 };
      return { x: 0, y: 0 };
    }
    function browParams() {
      var e = effEmotion();
      if (e === 'encouraging') return { raise: 1.3, angle: 0 };
      if (e === 'pushing') return { raise: 0, angle: 1.7 };
      if (state === 'thinking') return { raise: 0.3, angle: 0.9 };
      return { raise: 0, angle: 0 };
    }

    function frame() {
      if (!running) return;
      var now = tnow(), t = (now - t0) / 1000;
      var raw = 0;
      if (analyser) {
        analyser.getByteFrequencyData(freqBuf);
        var sum = 0; for (var i = 0; i < freqBuf.length; i++) sum += freqBuf[i];
        raw = Math.min(1, (sum / freqBuf.length) / 78);
      } else if (manualAmp != null) { raw = manualAmp; }
      smoothAmp += (raw - smoothAmp) * 0.5;
      var goal = (state === 'talking') ? smoothAmp : 0;
      amp += (goal - amp) * 0.4;

      var mo = (state === 'talking') ? amp : 0;
      var emo = effEmotion();
      var mk = Math.round(mo * 20) + emo;
      if (mk !== lastMouth) { mouthEl.innerHTML = talkingMouth(mo, emo); lastMouth = mk; }

      var eyeOpen = 1;
      if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
      if (blinkStart >= 0) {
        var bt = (now - blinkStart) / 120;
        if (bt >= 1) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 3800; eyeOpen = 1; }
        else eyeOpen = bt < 0.5 ? 1 - bt * 2 : (bt - 0.5) * 2;
      }
      var g = gaze();
      var ek = Math.round(eyeOpen * 10) + '|' + g.x + '|' + g.y;
      if (ek !== lastEyes) { eyesEl.innerHTML = talkingEyes(eyeOpen, g.x, g.y); lastEyes = ek; }

      var bp = browParams();
      var bk = bp.raise + '|' + bp.angle;
      if (bk !== lastBrows) { browsEl.innerHTML = talkingBrows(bp.raise, bp.angle); lastBrows = bk; }

      var breathe = reduce ? 0 : Math.sin(t * 1.15) * 0.5;
      var bob = (reduce || state !== 'talking') ? 0 : -amp * 1.3;
      var tx = reduce ? 0 : (state === 'listening' ? 0.6 : (state === 'thinking' ? -0.6 : 0));
      var rot = reduce ? 0 : (state === 'thinking' ? -2.4 : (state === 'listening' ? 1.4 : 0));
      faceEl.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + (breathe + bob).toFixed(2) + ') rotate(' + rot.toFixed(2) + ' 50 60)');

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    var ctrl = {
      el: svgEl,
      setState: function (s) { state = s; return this; },
      getState: function () { return state; },
      setEmotion: function (e) { emoOverride = e || null; return this; },
      setAmplitude: function (v) { manualAmp = (v == null ? null : (v < 0 ? 0 : v > 1 ? 1 : v)); return this; },
      setConfig: function (cfg) {
        container.innerHTML = talkingSvg(cfg, opts.size || '100%');
        svgEl = container.querySelector('svg'); faceEl = container.querySelector('.ta-face');
        browsEl = container.querySelector('.ta-brows'); eyesEl = container.querySelector('.ta-eyes'); mouthEl = container.querySelector('.ta-mouth');
        lastMouth = lastEyes = lastBrows = '';
        return this;
      },
      attachAnalyser: function (a) { analyser = a || null; if (a) freqBuf = new Uint8Array(a.frequencyBinCount); return this; },
      attachAudio: function (src) {
        try {
          var AC = global.AudioContext || global.webkitAudioContext; if (!AC) return false;
          audioCtx = new AC(); ownCtx = true;
          var stream = (src instanceof MediaStream) ? src : (src && src.srcObject instanceof MediaStream ? src.srcObject : null);
          if (stream) srcNode = audioCtx.createMediaStreamSource(stream);
          else if (src && src.tagName) { srcNode = audioCtx.createMediaElementSource(src); srcNode.connect(audioCtx.destination); }
          else return false;
          var a = audioCtx.createAnalyser(); a.fftSize = 256; a.smoothingTimeConstant = 0.75;
          srcNode.connect(a); this.attachAnalyser(a);
          if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
          return true;
        } catch (e) { return false; }
      },
      detachAudio: function () { analyser = null; if (ownCtx && audioCtx) { try { audioCtx.close(); } catch (e) {} } audioCtx = null; srcNode = null; ownCtx = false; return this; },
      destroy: function () { running = false; if (raf) cancelAnimationFrame(raf); this.detachAudio(); if (container) container.innerHTML = ''; }
    };
    return ctrl;
  }

  // ---- AI persona presets ----------------------------------------------
  // Faces tuned to each debater's identity, kept young. bg matches the
  // persona's existing accent so the visual bond carries over.
  var PRESETS = {
    verse:    { skin: 1, hair: 2, top: 1, eyes: 1, brows: 0, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 0, outfit: 1 }, // All-Rounder
    ash:      { skin: 2, hair: 0, top: 2, eyes: 3, brows: 2, mouth: 3, facial: 1, glasses: 2, accessory: 0, bg: 0, outfit: 0 }, // Prosecutor
    coral:    { skin: 2, hair: 0, top: 4, eyes: 1, brows: 1, mouth: 1, facial: 0, glasses: 0, accessory: 3, bg: 6, outfit: 5 }, // Quick Wit
    sage:     { skin: 1, hair: 1, top: 3, eyes: 2, brows: 0, mouth: 0, facial: 1, glasses: 1, accessory: 0, bg: 5, outfit: 3 }, // Philosopher
    ballad:   { skin: 3, hair: 2, top: 7, eyes: 1, brows: 0, mouth: 1, facial: 0, glasses: 0, accessory: 0, bg: 2, outfit: 6 }, // Storyteller
    shimmer:  { skin: 3, hair: 0, top: 2, eyes: 1, brows: 1, mouth: 2, facial: 0, glasses: 0, accessory: 3, bg: 4, outfit: 4 }, // Diplomat
    echo:     { skin: 1, hair: 0, top: 5, eyes: 3, brows: 2, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 3, outfit: 0 }, // Closer
    alloy:    { skin: 2, hair: 2, top: 1, eyes: 0, brows: 0, mouth: 0, facial: 0, glasses: 2, accessory: 1, bg: 7, outfit: 2 }, // Strategist (headphones)
    examiner: { skin: 3, hair: 1, top: 2, eyes: 2, brows: 2, mouth: 0, facial: 3, glasses: 2, accessory: 0, bg: 5, outfit: 7 }  // Examiner
  };
  function persona(key, size) {
    return svg(PRESETS[key] || PRESETS.verse, size || 42);
  }

  // ---- persistence ------------------------------------------------------
  function getUser() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      return raw ? norm(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function setUser(config) {
    var c = norm(config);
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(EVT, { detail: c })); } catch (e) {}
    return c;
  }
  function clearUser() {
    try { global.localStorage.removeItem(STORE_KEY); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(EVT, { detail: null })); } catch (e) {}
  }

  // ---- deterministic randomizer ----------------------------------------
  function hashStr(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function randomConfig(seed) {
    var rnd = (seed != null)
      ? (function () { var a = hashStr(seed); return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })()
      : Math.random;
    function p(n) { return Math.floor(rnd() * n); }
    return norm({
      skin: p(SKIN.length), hair: p(HAIR.length), top: p(N_TOP), eyes: p(N_EYES),
      brows: p(N_BROWS), mouth: p(N_MOUTH),
      facial: (rnd() < 0.6 ? 0 : p(N_FACIAL)),          // young: mostly clean
      glasses: (rnd() < 0.55 ? 0 : p(N_GLASSES)),
      accessory: (rnd() < 0.62 ? 0 : p(N_ACC)),          // gear is a highlight, not the norm
      bg: p(BG.length), outfit: p(OUTFIT.length)
    });
  }

  // ---- theme helper -----------------------------------------------------
  function isLight() {
    var el = document.documentElement;
    return el.getAttribute('data-lighting') === 'light' || el.getAttribute('data-theme') === 'light';
  }

  // ---- builder modal ----------------------------------------------------
  var SHAPE_FIELDS = [
    { key: 'top', label: 'Hair', n: N_TOP },
    { key: 'eyes', label: 'Eyes', n: N_EYES },
    { key: 'brows', label: 'Brows', n: N_BROWS },
    { key: 'mouth', label: 'Mouth', n: N_MOUTH },
    { key: 'facial', label: 'Facial hair', n: N_FACIAL },
    { key: 'glasses', label: 'Glasses', n: N_GLASSES },
    { key: 'accessory', label: 'Gear', n: N_ACC }
  ];
  var COLOR_FIELDS = [
    { key: 'skin', label: 'Skin', pal: SKIN },
    { key: 'hair', label: 'Hair color', pal: HAIR },
    { key: 'bg', label: 'Background', pal: BG },
    { key: 'outfit', label: 'Hoodie', pal: OUTFIT }
  ];

  function openBuilder(opts) {
    opts = opts || {};
    var light = isLight();
    var surf = light ? '#ffffff' : '#16161c';
    var surf2 = light ? '#f5f4ef' : '#1e1e26';
    var txt = light ? '#1a1a1e' : '#f2f2f5';
    var dim = light ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.55)';
    var bd = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)';
    var sel = '#ef4444';

    var cfg = getUser() || randomConfig();

    var back = document.createElement('div');
    back.setAttribute('data-dbav-modal', '1');
    back.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,6,10,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';

    var box = document.createElement('div');
    box.style.cssText = 'width:min(560px,96vw);max-height:92vh;overflow:auto;background:' + surf + ';color:' + txt + ';border:1px solid ' + bd + ';border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.5);font-family:inherit';
    back.appendChild(box);

    // header with live preview
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:16px;padding:20px 22px 14px;position:sticky;top:0;background:' + surf + ';z-index:2;border-bottom:1px solid ' + bd;
    var prev = document.createElement('div');
    prev.style.cssText = 'width:76px;height:76px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    var htxt = document.createElement('div');
    htxt.style.cssText = 'flex:1;min-width:0';
    htxt.innerHTML = '<div style="font-size:1.05rem;font-weight:800;letter-spacing:-.01em">Build your avatar</div>' +
      '<div style="font-size:.78rem;color:' + dim + ';margin-top:2px">It follows you across DebateIt and greets you when you come home.</div>';
    head.appendChild(prev); head.appendChild(htxt);
    box.appendChild(head);

    var body = document.createElement('div');
    body.style.cssText = 'padding:8px 22px 4px';
    box.appendChild(body);

    function renderPreview() { prev.innerHTML = svg(cfg, '100%'); }

    function rowWrap(label) {
      var w = document.createElement('div');
      w.style.cssText = 'padding:12px 0;border-bottom:1px solid ' + bd;
      var l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:' + dim + ';margin-bottom:9px';
      w.appendChild(l);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      w.appendChild(row);
      body.appendChild(w);
      return row;
    }

    var swatchEls = []; // {key, i, node}
    var shapeEls = [];

    function refreshSelected() {
      swatchEls.forEach(function (o) {
        o.node.style.outline = (cfg[o.key] === o.i) ? '2.5px solid ' + sel : '2.5px solid transparent';
        o.node.style.outlineOffset = '2px';
      });
      shapeEls.forEach(function (o) {
        var on = cfg[o.key] === o.i;
        o.node.style.borderColor = on ? sel : bd;
        o.node.style.background = on ? (light ? 'rgba(239,68,68,.08)' : 'rgba(239,68,68,.14)') : 'transparent';
      });
      renderPreview();
    }

    // color rows (swatches)
    COLOR_FIELDS.forEach(function (f) {
      var row = rowWrap(f.label);
      f.pal.forEach(function (col, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.title = f.label + ' ' + (i + 1);
        b.style.cssText = 'width:30px;height:30px;border-radius:50%;border:1px solid ' + bd + ';cursor:pointer;padding:0;background:' + col;
        b.addEventListener('click', function () { cfg[f.key] = i; refreshSelected(); refreshShapeThumbs(); });
        row.appendChild(b);
        swatchEls.push({ key: f.key, i: i, node: b });
      });
    });

    // shape rows (mini avatar previews varying only that field)
    SHAPE_FIELDS.forEach(function (f) {
      var row = rowWrap(f.label);
      for (var i = 0; i < f.n; i++) {
        (function (i) {
          var variant = norm(cfg); variant[f.key] = i;
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('data-shape', f.key + i);
          b.style.cssText = 'width:46px;height:46px;border-radius:12px;border:1.5px solid ' + bd + ';cursor:pointer;padding:3px;overflow:hidden;transition:border-color .12s,background .12s';
          b.innerHTML = svg(variant, '100%');
          b.addEventListener('click', function () { cfg[f.key] = i; refreshSelected(); refreshShapeThumbs(); });
          row.appendChild(b);
          shapeEls.push({ key: f.key, i: i, node: b });
        })(i);
      }
    });

    // shape thumbnails depend on other fields, so re-render them on change
    function refreshShapeThumbs() {
      shapeEls.forEach(function (o) {
        var variant = norm(cfg); variant[o.key] = o.i;
        o.node.innerHTML = svg(variant, '100%');
      });
    }

    // footer
    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:10px;align-items:center;padding:16px 22px 20px;position:sticky;bottom:0;background:' + surf + ';border-top:1px solid ' + bd;
    var rand = document.createElement('button');
    rand.type = 'button';
    rand.textContent = 'Surprise me';
    rand.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:600;color:' + txt + ';background:' + surf2 + ';border:1px solid ' + bd + ';border-radius:999px;padding:10px 16px;cursor:pointer';
    rand.addEventListener('click', function () { cfg = randomConfig(); refreshSelected(); refreshShapeThumbs(); });
    var spacer = document.createElement('div'); spacer.style.flex = '1';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:600;color:' + dim + ';background:transparent;border:none;cursor:pointer;padding:10px 12px';
    var save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save avatar';
    save.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:700;color:#fff;background:' + sel + ';border:none;border-radius:999px;padding:10px 20px;cursor:pointer;box-shadow:0 6px 20px rgba(239,68,68,.35)';
    foot.appendChild(rand); foot.appendChild(spacer); foot.appendChild(cancel); foot.appendChild(save);
    box.appendChild(foot);

    function close() { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    cancel.addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    save.addEventListener('click', function () {
      var saved = setUser(cfg);
      if (typeof opts.onSave === 'function') { try { opts.onSave(saved); } catch (e) {} }
      close();
    });

    document.body.appendChild(back);
    refreshSelected();
  }

  // ---- welcome-home card -----------------------------------------------
  // Self-contained: fills `node` and re-renders itself when the avatar
  // changes, so it stays correct regardless of the host framework.
  function mountWelcome(node, user) {
    if (!node) return;
    if (node.__dbavHandler) { global.removeEventListener(EVT, node.__dbavHandler); }
    var first = ((user && (user.displayName || user.email)) || '').split(/\s+/)[0] || '';

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
    function render() {
      var cfg = getUser();
      var has = !!cfg;
      var av = has
        ? '<div style="width:64px;height:64px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.22)">' + svg(cfg, '100%') + '</div>'
        : '<div style="width:64px;height:64px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;background:var(--c-surface2,rgba(127,127,127,.12));border:1px dashed var(--c-border2,rgba(127,127,127,.3));font-size:1.5rem">🙂</div>';
      var title = has
        ? (first ? 'Welcome back, ' + esc(first) + '.' : 'Welcome back.')
        : 'Make your debater.';
      var sub = has
        ? 'Your avatar is in your corner. Warm it up before the next round.'
        : 'Build an avatar that is yours. It greets you here every time you come home.';
      var btn = has ? 'Customize' : 'Create your avatar';

      node.innerHTML =
        '<div style="margin-top:24px;padding:16px 18px;background:var(--c-surface,rgba(127,127,127,.05));border:1px solid var(--c-border2,rgba(127,127,127,.2));border-radius:14px;display:flex;align-items:center;gap:16px;text-align:left">' +
          av +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:1.02rem;font-weight:800;color:var(--c-bright,inherit);letter-spacing:-.01em">' + title + '</div>' +
            '<div style="font-size:.8rem;color:var(--c-text3,rgba(127,127,127,.75));margin-top:3px">' + sub + '</div>' +
          '</div>' +
          '<button type="button" data-dbav-edit style="flex-shrink:0;font-family:inherit;font-size:.78rem;font-weight:700;color:#fff;background:#ef4444;border:none;border-radius:999px;padding:9px 16px;cursor:pointer;box-shadow:0 4px 16px rgba(239,68,68,.3)">' + btn + '</button>' +
        '</div>';
      var b = node.querySelector('[data-dbav-edit]');
      if (b) b.addEventListener('click', function () { openBuilder({ onSave: render }); });
    }

    node.__dbavHandler = function () { render(); };
    global.addEventListener(EVT, node.__dbavHandler);
    render();
  }

  global.DBAvatar = {
    svg: svg, persona: persona, PRESETS: PRESETS,
    getUser: getUser, setUser: setUser, clearUser: clearUser,
    randomConfig: randomConfig, openBuilder: openBuilder, mountWelcome: mountWelcome,
    talkingSvg: talkingSvg, mountTalking: mountTalking,
    SKIN: SKIN, HAIR: HAIR, BG: BG, OUTFIT: OUTFIT, EVENT: EVT
  };
})(window);
