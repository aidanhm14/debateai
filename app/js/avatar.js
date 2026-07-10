/* DebateIt avatars. A procedural portrait engine shared by user avatars,
   One module powers both surfaces: the user builds their own avatar,
   and the AI debaters get matched-set faces from the same generator.

   Art direction: young, dimensional, and composed. Faces fill the frame;
   restrained light, depth, and orbital lines make them feel native to the
   DebateIt brain system. Built for HS-through-college debaters, not a
   boardroom or a sticker pack.

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
  // eye color — naturals first (randomizer favors the first two)
  var IRIS = ['#5b4130', '#2a2320', '#4f7046', '#3e6a8e', '#7a6a44', '#5c6672'];

  // number of shape options per field (used by builder + randomizer)
  var N_TOP = 12, N_EYES = 4, N_BROWS = 3, N_MOUTH = 5, N_FACIAL = 4, N_GLASSES = 3, N_ACC = 5, N_DETAIL = 3;

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
    return { skin: 1, hair: 1, top: 1, eyes: 1, brows: 0, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 0, outfit: 0, iris: 0, detail: 0 };
  }
  function norm(c) {
    c = c || {};
    return {
      skin: clamp(c.skin, SKIN.length), hair: clamp(c.hair, HAIR.length),
      top: clamp(c.top, N_TOP), eyes: clamp(c.eyes, N_EYES), brows: clamp(c.brows, N_BROWS),
      mouth: clamp(c.mouth, N_MOUTH), facial: clamp(c.facial, N_FACIAL),
      glasses: clamp(c.glasses, N_GLASSES), accessory: clamp(c.accessory, N_ACC),
      iris: clamp(c.iris, IRIS.length), detail: clamp(c.detail, N_DETAIL),
      bg: clamp(c.bg, BG.length), outfit: clamp(c.outfit, OUTFIT.length)
    };
  }

  // ---- feature geometry -------------------------------------------------
  // Head: ellipse cx50 cy45 rx21.5 ry22.5. Eyes y45 at x40/x60.
  // Brows y38. Mouth y56. Ears cy47.
  function hairPaths(top, hairCol) {
    // returns { back:'', front:'' }. Geometry envelope (matches the large
    // dimensional head, crown apex ~y19): outer arc M26.5 43 C30 9.5 70 9.5
    // 73.5 43 (apex ~y18), hairline scoop through (50, ~28.5). Every style:
    // dark under-layer, main mass, top-left highlight (the scene light).
    var d = shade(hairCol, -0.22), d2 = shade(hairCol, -0.12);
    var hl = shade(hairCol, 0.22), hl2 = shade(hairCol, 0.12);
    var CAP = 'M26.5 43 C30 9.5 70 9.5 73.5 43 C70 31 61 28.5 50 28.5 C39 28.5 30 31 26.5 43 Z';
    var CAP_UNDER = 'M26.5 44.4 C30 11 70 11 73.5 44.4 C70 32.4 61 29.9 50 29.9 C39 29.9 30 32.4 26.5 44.4 Z';
    function cap() {
      return '<path d="' + CAP_UNDER + '" fill="' + d + '"/>' +
             '<path d="' + CAP + '" fill="' + hairCol + '"/>';
    }
    var HLARC = '<path d="M33 24.5 Q40.5 16 51 15.6" stroke="' + hl + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
                '<path d="M55 15.9 Q63 17.2 67.6 22.5" stroke="' + hl2 + '" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>';
    switch (top) {
      case 0: // shaved — a deliberate buzz shadow, not a missing asset
        return { back: '', front: '<path d="' + CAP + '" fill="' + hairCol + '" opacity=".18"/>' };
      case 1: // textured crop
        return { back: '', front: cap() + HLARC +
          '<path d="M39 20.5 l2.4 5 M48 18.6 l.8 5.4 M57 19.2 l-1 5.2 M64 22.4 l-2.4 4.6" stroke="' + hl2 + '" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>' };
      case 2: // fade — crisp part, clean sides
        return { back: '', front: cap() + HLARC +
          '<path d="M42 28.9 Q54 27.2 64 30.5" stroke="' + d + '" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".65"/>' };
      case 3: // curls / afro — big soft cloud over the crown
        return { back: '', front:
          '<path d="M27 42 a8.5 8.5 0 1 1 4.4 -15.2 a9 9 0 0 1 8 -9.4 a9.5 9.5 0 0 1 21.2 0 a9 9 0 0 1 8 9.4 a8.5 8.5 0 0 1 4.4 15.2 a7 7 0 0 1 -3.4 5.4 C71 33.5 62 28.5 50 28.5 C38 28.5 29 33.5 30.4 47.4 a7 7 0 0 1 -3.4 -5.4 Z" fill="' + hairCol + '"/>' +
          '<circle cx="33.5" cy="27.5" r="3.8" fill="' + d + '" opacity=".5"/><circle cx="44" cy="19.5" r="4" fill="' + d + '" opacity=".42"/><circle cx="57" cy="20" r="3.8" fill="' + d + '" opacity=".5"/><circle cx="66.5" cy="27.5" r="3.4" fill="' + d + '" opacity=".45"/>' +
          '<circle cx="38.5" cy="21.6" r="1.6" fill="' + hl + '" opacity=".9"/><circle cx="50" cy="17" r="1.5" fill="' + hl + '" opacity=".85"/><circle cx="61.5" cy="21" r="1.4" fill="' + hl2 + '" opacity=".85"/>' };
      case 4: // long straight
        return {
          back: '<path d="M25.5 40 C20.5 66 24.5 86 30 90 L36 88 C31.5 73 32.5 56 33.5 45 Z M74.5 40 C79.5 66 75.5 86 70 90 L64 88 C68.5 73 67.5 56 66.5 45 Z" fill="' + d + '"/>' +
                '<path d="M29.5 54 Q28.5 70 31 84 M70.5 54 Q71.5 70 69 84" stroke="' + d2 + '" stroke-width="1.2" fill="none" opacity=".7"/>',
          front: cap() + HLARC };
      case 5: // top-knot / bun
        return {
          back: '<circle cx="50" cy="12.5" r="7.8" fill="' + d2 + '"/>' +
                '<path d="M44.4 9.8 A7.8 7.8 0 0 1 55 9.4" stroke="' + hl + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
                '<circle cx="50" cy="12.5" r="7.8" fill="none" stroke="' + d + '" stroke-width=".8" opacity=".5"/>',
          front: cap() +
                 '<path d="M42.5 20 Q50 14.5 57.5 20" stroke="' + d + '" stroke-width="1.4" fill="none" opacity=".7"/>' +
                 '<path d="M34 26 Q42 18.6 50 18.2" stroke="' + hl2 + '" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".85"/>' };
      case 6: // double buns
        return {
          back: '<circle cx="31.5" cy="17.5" r="7" fill="' + d2 + '"/><circle cx="68.5" cy="17.5" r="7" fill="' + d2 + '"/>' +
                '<path d="M26.8 14.6 A7 7 0 0 1 34.8 11.4" stroke="' + hl + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
                '<path d="M63.8 14.6 A7 7 0 0 1 71.8 11.6" stroke="' + hl2 + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
          front: cap() +
                 '<path d="M50 28.7 L50 18.4" stroke="' + d + '" stroke-width="1.1" opacity=".6"/>' + HLARC };
      case 7: // side-swept — deep asymmetric sweep across the brow
        return {
          back: '',
          front: '<path d="M26.5 43 C30 9.5 70 9.5 73.5 43 C71.5 30 64 26.5 54 27.5 C60 30.5 64 33.5 65.5 38.5 C58 32.5 47 30.5 39.5 32.5 C33.5 34.2 29.5 38 26.5 43 Z" fill="' + hairCol + '"/>' +
                 '<path d="M39.5 32.5 C47 30.5 58 32.5 65.5 38.5" fill="none" stroke="' + d + '" stroke-width="1.1" opacity=".55"/>' +
                 HLARC };
      case 8: // box braids
        return {
          back: '<path d="M27.5 42 C25 54 25.6 64 27 70 L32.6 69 C31.2 60.5 31.6 51 32.8 44 Z" fill="' + d2 + '"/>' +
                '<path d="M72.5 42 C75 54 74.4 64 73 70 L67.4 69 C68.8 60.5 68.4 51 67.2 44 Z" fill="' + d2 + '"/>' +
                '<ellipse cx="30.4" cy="48" rx="2.8" ry="3.6" fill="' + hairCol + '"/><ellipse cx="30" cy="55" rx="2.7" ry="3.5" fill="' + d + '"/><ellipse cx="29.8" cy="61.8" rx="2.6" ry="3.3" fill="' + hairCol + '"/><ellipse cx="30" cy="68" rx="2.4" ry="3" fill="' + d + '"/>' +
                '<ellipse cx="69.6" cy="48" rx="2.8" ry="3.6" fill="' + hairCol + '"/><ellipse cx="70" cy="55" rx="2.7" ry="3.5" fill="' + d + '"/><ellipse cx="70.2" cy="61.8" rx="2.6" ry="3.3" fill="' + hairCol + '"/><ellipse cx="70" cy="68" rx="2.4" ry="3" fill="' + d + '"/>' +
                '<circle cx="30" cy="72" r="1.4" fill="#f0c14b"/><circle cx="70" cy="72" r="1.4" fill="#f0c14b"/>',
          front: cap() +
                 '<path d="M50 28.6 L50 17.6 M42 29.4 L39.6 19 M58 29.4 L60.4 19 M34.5 32 L31 24 M65.5 32 L69 24" stroke="' + d + '" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>' +
                 '<path d="M35 22.8 Q42 17.4 50 16.8" stroke="' + hl + '" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".9"/>' };
      case 9: // ponytail — slicked crown, tail attached at the crown edge
        return {
          back: '<path d="M66 21 C76 24 81 33 80.5 44 C80 53 76 60 71.5 63.5 L67.5 60 C72 55.5 75 49 75 42.5 C75 34 70.5 27 63.5 24.5 Z" fill="' + d2 + '"/>' +
                '<path d="M70.5 27.5 C75.5 32.5 77.5 39.5 76 47" fill="none" stroke="' + hl2 + '" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>' +
                '<path d="M64.5 21.5 C67 22.4 69.2 23.8 71 25.6" stroke="' + shade(hairCol, -0.34) + '" stroke-width="3.6" stroke-linecap="round" fill="none"/>',
          front: cap() + HLARC +
                 '<path d="M40 28.9 Q52 27 63 30.6" stroke="' + d + '" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".55"/>' };
      case 10: // curtain waves — middle part, real face-framing curtains
        return {
          back: '<path d="M26.5 40 C22.5 58 24 73 27.5 79 L33.5 77 C30.5 67 31 54 32.2 45 Z" fill="' + d + '"/>' +
                '<path d="M73.5 40 C77.5 58 76 73 72.5 79 L66.5 77 C69.5 67 69 54 67.8 45 Z" fill="' + d + '"/>',
          front: '<path d="M26.5 45 C25 10.5 75 10.5 73.5 45 C72 31 64.5 27.6 56.5 28.4 C53 28.8 51 30.2 50 32 C49 30.2 47 28.8 43.5 28.4 C35.5 27.6 28 31 26.5 45 Z" fill="' + hairCol + '"/>' +
                 '<path d="M28.8 42 C27.6 50 28.2 57 30.4 62 C33 57.6 33 49 32.2 43.2 Z" fill="' + hairCol + '"/>' +
                 '<path d="M71.2 42 C72.4 50 71.8 57 69.6 62 C67 57.6 67 49 67.8 43.2 Z" fill="' + hairCol + '"/>' +
                 '<path d="M50 31.8 L50 16.4" stroke="' + d + '" stroke-width="1.2" opacity=".7"/>' +
                 '<path d="M33.5 22.5 Q41 16.6 48 17.2" stroke="' + hl + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
                 '<path d="M30.6 45 Q30 53 31.4 59 M69.4 45 Q70 53 68.6 59" stroke="' + hl2 + '" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".7"/>' };
      case 11: // short coils — cover the whole crown
        return { back: '', front:
          '<path d="' + CAP + '" fill="' + d2 + '"/>' +
          '<circle cx="31" cy="31" r="4" fill="' + hairCol + '"/><circle cx="36" cy="24" r="4.2" fill="' + d + '"/><circle cx="43" cy="19.5" r="4.4" fill="' + hairCol + '"/><circle cx="50.5" cy="18" r="4.5" fill="' + d + '"/><circle cx="58" cy="19.8" r="4.3" fill="' + hairCol + '"/><circle cx="64.5" cy="24.5" r="4.1" fill="' + d + '"/><circle cx="69.5" cy="31" r="3.8" fill="' + hairCol + '"/>' +
          '<circle cx="33.5" cy="27.4" r="3.4" fill="' + d + '"/><circle cx="39.5" cy="22" r="3.5" fill="' + hairCol + '"/><circle cx="46.6" cy="18.6" r="3.6" fill="' + d2 + '"/><circle cx="54.4" cy="18.8" r="3.5" fill="' + hairCol + '"/><circle cx="61.4" cy="21.8" r="3.4" fill="' + d2 + '"/><circle cx="67" cy="27" r="3.2" fill="' + hairCol + '"/>' +
          '<circle cx="37.5" cy="22.6" r="1.3" fill="' + hl + '" opacity=".9"/><circle cx="46" cy="17.6" r="1.3" fill="' + hl + '" opacity=".85"/><circle cx="55.5" cy="17.8" r="1.2" fill="' + hl2 + '" opacity=".85"/><circle cx="63.5" cy="22" r="1.1" fill="' + hl2 + '" opacity=".8"/>' };
    }
    return { back: '', front: '' };
  }

  function eyesPath(kind, irisCol) {
    var L = 40, R = 60, y = 45, ink = '#2a2320';
    irisCol = irisCol || IRIS[0];
    var irisDark = shade(irisCol, -0.25);
    function orb(cx, rIris, rPupil) {
      return '<circle cx="' + cx + '" cy="' + (y + 0.4) + '" r="' + rIris + '" fill="' + irisCol + '"/>' +
             '<circle cx="' + cx + '" cy="' + (y + 0.4) + '" r="' + rIris + '" fill="none" stroke="' + irisDark + '" stroke-width=".55"/>' +
             '<circle cx="' + cx + '" cy="' + (y + 0.5) + '" r="' + rPupil + '" fill="' + ink + '"/>' +
             '<circle cx="' + (cx - 0.9) + '" cy="' + (y - 0.9) + '" r=".8" fill="#fff"/>' +
             '<circle cx="' + (cx + 1.1) + '" cy="' + (y + 1.3) + '" r=".4" fill="#fff" opacity=".7"/>';
    }
    switch (kind) {
      case 0: // chill — small, but still colored
        return '<circle cx="' + L + '" cy="' + y + '" r="2.6" fill="' + irisDark + '"/><circle cx="' + R + '" cy="' + y + '" r="2.6" fill="' + irisDark + '"/>' +
               '<circle cx="' + (L - 0.8) + '" cy="' + (y - 0.8) + '" r=".6" fill="#fff" opacity=".9"/><circle cx="' + (R - 0.8) + '" cy="' + (y - 0.8) + '" r=".6" fill="#fff" opacity=".9"/>';
      case 1: // big and bright (young default)
        return '<ellipse cx="' + L + '" cy="' + y + '" rx="3.4" ry="4" fill="#fff"/><ellipse cx="' + R + '" cy="' + y + '" rx="3.4" ry="4" fill="#fff"/>' +
               orb(L, 2.3, 1.25) + orb(R, 2.3, 1.25) +
               '<path d="M36.6 42.2 Q40 40.6 43.4 42.2" stroke="' + ink + '" stroke-width="1" fill="none" stroke-linecap="round" opacity=".55"/>' +
               '<path d="M56.6 42.2 Q60 40.6 63.4 42.2" stroke="' + ink + '" stroke-width="1" fill="none" stroke-linecap="round" opacity=".55"/>';
      case 2: // relaxed half-lids
        return '<path d="M36.5 45 Q40 47.8 43.5 45" stroke="' + ink + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>' +
               '<path d="M56.5 45 Q60 47.8 63.5 45" stroke="' + ink + '" stroke-width="1.9" fill="none" stroke-linecap="round"/>';
      case 3: // sharp / locked-in
        return '<circle cx="' + L + '" cy="' + y + '" r="3.2" fill="#fff"/><circle cx="' + R + '" cy="' + y + '" r="3.2" fill="#fff"/>' +
               orb(L, 2.05, 1.15) + orb(R, 2.05, 1.15) +
               '<path d="M36.4 43 L43.6 44.4" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>' +
               '<path d="M63.6 43 L56.4 44.4" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>';
    }
    return '';
  }

  function browsPath(kind, browCol) {
    var ink = browCol || '#3a2c22';
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

  // Skin details — cheap charm. 0 none / 1 blush / 2 freckles.
  function detailPath(kind, skinCol) {
    if (kind === 1) {
      return '<ellipse cx="37" cy="52.4" rx="4.6" ry="2.3" fill="#e2574c" opacity=".17"/>' +
             '<ellipse cx="63" cy="52.4" rx="4.6" ry="2.3" fill="#e2574c" opacity=".17"/>';
    }
    if (kind === 2) {
      var f = shade(skinCol, -0.32);
      return '<g fill="' + f + '" opacity=".55">' +
             '<circle cx="36.6" cy="51" r=".65"/><circle cx="39.6" cy="52.6" r=".6"/><circle cx="42.4" cy="50.6" r=".55"/>' +
             '<circle cx="57.6" cy="50.6" r=".55"/><circle cx="60.4" cy="52.6" r=".6"/><circle cx="63.4" cy="51" r=".65"/>' +
             '<circle cx="48.4" cy="53.6" r=".5"/><circle cx="51.6" cy="53.6" r=".5"/></g>';
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
    var irisCol = IRIS[c.iris];
    var browCol = shade(hairCol, c.hair >= 4 ? -0.38 : -0.2); // light/dyed hair still needs readable brows
    var id = 'dbav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : size;
    var earring = (c.accessory === 3)
      ? '<circle cx="29" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/><circle cx="71" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/>'
      : '';

    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="avatar" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="28%" cy="18%" r="92%"><stop offset="0%" stop-color="' + shade(bgCol, 0.34) + '"/><stop offset="48%" stop-color="' + bgCol + '"/><stop offset="100%" stop-color="' + shade(bgCol, -0.24) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'skin" cx="31%" cy="19%" r="82%"><stop offset="0%" stop-color="' + shade(skinCol, 0.30) + '"/><stop offset="52%" stop-color="' + skinCol + '"/><stop offset="100%" stop-color="' + shade(skinCol, -0.18) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".72"/><stop offset="42%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#111827" stop-opacity=".20"/></linearGradient>' +
      '<filter id="' + id + 'shadow" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#201713" flood-opacity=".28"/></filter></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'g)"/>' +
      '<path d="M-8 74 C18 28 59 8 111 30" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M-2 82 C23 57 62 49 108 65" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.2"/>' +
      '<circle cx="82" cy="22" r="2" fill="#fff" opacity=".55"/><circle cx="16" cy="66" r="1.2" fill="#fff" opacity=".35"/>' +
      '<g transform="translate(50 50) scale(1.10) translate(-50 -50)">' +
      hair.back +
      // hoodie
      '<ellipse cx="50" cy="80" rx="29" ry="7" fill="#211713" opacity=".18"/>' +
      '<path d="M12 102 C13 77 30 69 50 69 C70 69 87 77 88 102 Z" fill="' + outCol + '"/>' +
      '<path d="M18 96 C25 79 35 74 50 74 C65 74 75 79 82 96" fill="none" stroke="' + shade(outCol, 0.16) + '" stroke-width="1.2" opacity=".52"/>' +
      '<path d="M38 72 Q50 80 62 72 L63 76 Q50 84 37 76 Z" fill="' + shade(outCol, -0.16) + '"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/>' +
      // neck
      '<path d="M43 60 h14 v9 q-7 5 -14 0 Z" fill="' + skinShade + '"/>' +
      // head
      '<g filter="url(#' + id + 'shadow)"><ellipse cx="50" cy="44" rx="23.5" ry="25" fill="url(#' + id + 'skin)"/>' +
      '<ellipse cx="50" cy="44" rx="22.9" ry="24.4" fill="url(#' + id + 'rim)" opacity=".42"/></g>' +
      // ears
      '<circle cx="27" cy="47" r="4.1" fill="' + skinCol + '"/><circle cx="73" cy="47" r="4.1" fill="' + skinCol + '"/>' +
      earring +
      facialPath(c.facial, hairCol) +
      '<ellipse cx="38" cy="51.5" rx="5" ry="2.5" fill="#fff" opacity=".10"/><ellipse cx="62" cy="51.5" rx="5" ry="2.5" fill="#fff" opacity=".10"/>' +
      // nose
      '<path d="M50 47 Q52.2 51.4 49 52.2" stroke="' + skinShade + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      detailPath(c.detail, skinCol) +
      browsPath(c.brows, browCol) +
      eyesPath(c.eyes, irisCol) +
      mouthPath(c.mouth) +
      hair.front +
      glassesPath(c.glasses) +
      accessoryOver(c.accessory, outCol) +
      '</g>' +
      '<circle cx="50" cy="50" r="48.8" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width=".8"/>' +
      '</g></svg>';
  }

  // ---- Talking avatar (live lip-sync + expressions) --------------------
  // Same face as svg(), but eyes / brows / mouth live in addressable
  // groups (.ta-eyes / .ta-brows / .ta-mouth) inside a .ta-face group so a
  // controller can animate them from live audio + coach state.
  // "SVG now, video later": the controller interface is backend-agnostic
  // (setState / setEmotion / setAmplitude / attachAudio / destroy), so a
  // photoreal video head can implement the same shape and drop in later.

  function talkingMouth(open, emotion, shape) {
    var lip = '#b65b4f', cav = '#5f241f', tongue = '#d88478', cy = 56;
    var corner = emotion === 'encouraging' ? -1.7 : (emotion === 'pushing' ? 1.5 : 0);
    open = open < 0 ? 0 : open > 1 ? 1 : open;
    shape = shape == null ? 0.5 : (shape < 0 ? 0 : shape > 1 ? 1 : shape);
    if (open < 0.06) {
      return '<path d="M43.6 ' + (cy - corner * 0.15).toFixed(2) + ' C47.2 ' + (cy + corner).toFixed(2) + ' 52.8 ' + (cy + corner).toFixed(2) + ' 56.4 ' + (cy - corner * 0.15).toFixed(2) + '" stroke="' + lip + '" stroke-width="2.15" fill="none" stroke-linecap="round"/>';
    }
    // Shape follows spectral character: rounded vowels stay narrow, brighter
    // consonants pull the corners wider. Open follows actual waveform energy.
    var rx = 4.5 + shape * 3.1 + open * 1.8, ry = 1.0 + open * 6.1;
    var teeth = open > 0.34
      ? '<path d="M' + (50 - rx + 1).toFixed(2) + ' ' + (cy - ry + 1.1).toFixed(2) + ' Q50 ' + (cy - ry - 0.2).toFixed(2) + ' ' + (50 + rx - 1).toFixed(2) + ' ' + (cy - ry + 1.1).toFixed(2) + '" stroke="#fff" stroke-width="1.6" fill="none" opacity=".92"/>'
      : '';
    var tonguePath = open > 0.58
      ? '<path d="M' + (50 - rx * 0.46).toFixed(2) + ' ' + (cy + ry * 0.2).toFixed(2) + ' Q50 ' + (cy + ry * 0.95).toFixed(2) + ' ' + (50 + rx * 0.46).toFixed(2) + ' ' + (cy + ry * 0.2).toFixed(2) + '" fill="' + tongue + '" opacity=".82"/>'
      : '';
    return '<ellipse cx="50" cy="' + cy + '" rx="' + rx.toFixed(2) + '" ry="' + ry.toFixed(2) + '" fill="' + cav + '"/>' + tonguePath + teeth +
      '<path d="M' + (50 - rx - 1).toFixed(2) + ' ' + cy + ' Q50 ' + (cy - ry - 1.4 + corner).toFixed(2) + ' ' + (50 + rx + 1).toFixed(2) + ' ' + cy + '" stroke="' + lip + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + (50 - rx - 1).toFixed(2) + ' ' + cy + ' Q50 ' + (cy + ry + 1.8).toFixed(2) + ' ' + (50 + rx + 1).toFixed(2) + ' ' + cy + '" stroke="' + lip + '" stroke-width="2.05" fill="none" stroke-linecap="round"/>';
  }

  function talkingEyes(openFrac, gx, gy, irisCol) {
    var L = 40, R = 60, y = 45, ink = '#2a2320';
    gx = gx || 0; gy = gy || 0;
    irisCol = irisCol || IRIS[0];
    var irisDark = shade(irisCol, -0.25);
    if (openFrac < 0.12) {
      return '<path d="M36.6 ' + y + ' Q40 ' + (y + 0.7) + ' 43.4 ' + y + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
             '<path d="M56.6 ' + y + ' Q60 ' + (y + 0.7) + ' 63.4 ' + y + '" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    }
    var ry = (3.9 * openFrac + 0.3).toFixed(2);
    function orb(cx) {
      return '<circle cx="' + (cx + gx).toFixed(2) + '" cy="' + (y + 0.4 + gy).toFixed(2) + '" r="2.15" fill="' + irisCol + '"/>' +
             '<circle cx="' + (cx + gx).toFixed(2) + '" cy="' + (y + 0.4 + gy).toFixed(2) + '" r="2.15" fill="none" stroke="' + irisDark + '" stroke-width=".5"/>' +
             '<circle cx="' + (cx + gx).toFixed(2) + '" cy="' + (y + 0.5 + gy).toFixed(2) + '" r="1.2" fill="' + ink + '"/>' +
             '<circle cx="' + (cx + gx - 0.85).toFixed(2) + '" cy="' + (y - 0.9 + gy).toFixed(2) + '" r=".75" fill="#fff"/>';
    }
    return '<ellipse cx="' + L + '" cy="' + y + '" rx="3.35" ry="' + ry + '" fill="#fff"/>' +
           '<ellipse cx="' + R + '" cy="' + y + '" rx="3.35" ry="' + ry + '" fill="#fff"/>' +
           orb(L) + orb(R);
  }

  function talkingBrows(raise, angle, browCol) {
    var ink = browCol || '#3a2c22', base = 38.6 - raise;
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
    var irisCol = IRIS[c.iris];
    var browCol = shade(hairCol, c.hair >= 4 ? -0.38 : -0.2); // light/dyed hair still needs readable brows
    var id = 'tav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : (size || 200);
    var earring = (c.accessory === 3)
      ? '<circle cx="29" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/><circle cx="71" cy="52.5" r="2.3" fill="none" stroke="#f0c14b" stroke-width="1.5"/>'
      : '';
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="talking avatar" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="32%" cy="24%" r="82%"><stop offset="0%" stop-color="' + shade(bgCol, 0.28) + '"/><stop offset="62%" stop-color="' + bgCol + '"/><stop offset="100%" stop-color="' + shade(bgCol, -0.10) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'skin" cx="34%" cy="22%" r="78%"><stop offset="0%" stop-color="' + shade(skinCol, 0.26) + '"/><stop offset="58%" stop-color="' + skinCol + '"/><stop offset="100%" stop-color="' + shade(skinCol, -0.16) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'gloss" cx="30%" cy="18%" r="54%"><stop offset="0%" stop-color="#fff" stop-opacity=".58"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'g)"/>' +
      '<path d="M9 69 C24 31 58 9 91 28" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M12 76 C34 52 57 45 90 58" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2" stroke-linecap="round"/>' +
      hair.back +
      '<ellipse cx="50" cy="76" rx="31" ry="8" fill="#1a1412" opacity=".14"/>' +
      '<path d="M13 104 C13 78 30 69 50 69 C70 69 87 78 87 104 Z" fill="' + outCol + '"/>' +
      '<path d="M37 70 Q50 81 63 70 L64 75 Q50 85 36 75 Z" fill="' + shade(outCol, -0.16) + '"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.2) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.2) + '"/>' +
      '<g class="ta-face">' +
      '<path d="M43 60 h14 v9 q-7 5 -14 0 Z" fill="' + skinShade + '"/>' +
      '<ellipse cx="50" cy="45" rx="21.5" ry="22.5" fill="url(#' + id + 'skin)"/>' +
      '<ellipse cx="42" cy="37" rx="12" ry="15" fill="url(#' + id + 'gloss)" opacity=".62"/>' +
      '<circle cx="28.5" cy="47" r="3.9" fill="' + skinCol + '"/><circle cx="71.5" cy="47" r="3.9" fill="' + skinCol + '"/>' +
      earring +
      facialPath(c.facial, hairCol) +
      '<ellipse cx="38.5" cy="52.2" rx="4.2" ry="2.1" fill="#fff" opacity=".10"/><ellipse cx="61.5" cy="52.2" rx="4.2" ry="2.1" fill="#fff" opacity=".10"/>' +
      detailPath(c.detail, skinCol) +
      '<path d="M50 47 Q52.2 51.4 49 52.2" stroke="' + skinShade + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<g class="ta-brows">' + talkingBrows(0, 0, browCol) + '</g>' +
      '<g class="ta-eyes">' + talkingEyes(1, 0, 0, irisCol) + '</g>' +
      '<g class="ta-mouth">' + talkingMouth(0, 'neutral', 0.5) + '</g>' +
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
    var mcfg = norm(config);
    var mIris = IRIS[mcfg.iris];
    var mBrow = shade(HAIR[mcfg.hair], mcfg.hair >= 4 ? -0.38 : -0.2);
    container.innerHTML = talkingSvg(config, opts.size || '100%');
    var svgEl = container.querySelector('svg');
    var faceEl = container.querySelector('.ta-face');
    var browsEl = container.querySelector('.ta-brows');
    var eyesEl = container.querySelector('.ta-eyes');
    var mouthEl = container.querySelector('.ta-mouth');
    if (!faceEl) return null;

    var state = 'idle', emoOverride = null;
    var faceScale = opts.faceScale || 1.34;
    var manualAmp = null, manualShape = null, amp = 0, smoothAmp = 0, mouthShape = 0.5;
    var analyser = null, audioCtx = null, srcNode = null, freqBuf = null, timeBuf = null, ownCtx = false;
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
      var raw = 0, shapeNow = manualShape == null ? 0.5 : manualShape;
      if (analyser) {
        analyser.getByteTimeDomainData(timeBuf);
        analyser.getByteFrequencyData(freqBuf);
        var sq = 0;
        for (var i = 0; i < timeBuf.length; i++) { var sample = (timeBuf[i] - 128) / 128; sq += sample * sample; }
        var rms = Math.sqrt(sq / Math.max(1, timeBuf.length));
        raw = Math.max(0, Math.min(1, (rms - 0.012) / 0.15));
        var low = 0, mid = 0, high = 0, lc = 0, mc = 0, hc = 0;
        for (var j = 2; j < freqBuf.length; j++) {
          if (j < 14) { low += freqBuf[j]; lc++; }
          else if (j < 42) { mid += freqBuf[j]; mc++; }
          else { high += freqBuf[j]; hc++; }
        }
        low /= Math.max(1, lc); mid /= Math.max(1, mc); high /= Math.max(1, hc);
        shapeNow = Math.max(0.08, Math.min(0.96, (mid * 0.58 + high * 1.2) / Math.max(18, low + mid + high)));
      } else if (manualAmp != null) { raw = manualAmp; }
      smoothAmp += (raw - smoothAmp) * (raw > smoothAmp ? 0.62 : 0.28);
      mouthShape += (shapeNow - mouthShape) * 0.34;
      var goal = (state === 'talking') ? smoothAmp : 0;
      amp += (goal - amp) * (goal > amp ? 0.58 : 0.30);

      var mo = (state === 'talking') ? Math.max(0, Math.min(1, Math.pow(amp, 0.68) * 1.12)) : 0;
      var emo = effEmotion();
      var mk = Math.round(mo * 48) + '|' + Math.round(mouthShape * 18) + '|' + emo;
      if (mk !== lastMouth) { mouthEl.innerHTML = talkingMouth(mo, emo, mouthShape); lastMouth = mk; }

      var eyeOpen = 1;
      if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
      if (blinkStart >= 0) {
        var bt = (now - blinkStart) / 120;
        if (bt >= 1) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 3800; eyeOpen = 1; }
        else eyeOpen = bt < 0.5 ? 1 - bt * 2 : (bt - 0.5) * 2;
      }
      var g = gaze();
      var ek = Math.round(eyeOpen * 10) + '|' + g.x + '|' + g.y;
      if (ek !== lastEyes) { eyesEl.innerHTML = talkingEyes(eyeOpen, g.x, g.y, mIris); lastEyes = ek; }

      var bp = browParams();
      var bk = bp.raise + '|' + bp.angle;
      if (bk !== lastBrows) { browsEl.innerHTML = talkingBrows(bp.raise, bp.angle, mBrow); lastBrows = bk; }

      var breathe = reduce ? 0 : Math.sin(t * 1.15) * 0.5;
      var bob = reduce ? 0 : (state === 'talking' ? -amp * 2.25 : Math.sin(t * 1.7) * 0.24);
      var tx = reduce ? 0 : (state === 'listening' ? 0.6 + Math.sin(t * 1.3) * 0.18 : (state === 'thinking' ? -0.6 : Math.sin(t * 1.1) * 0.14));
      var rot = reduce ? 0 : (state === 'thinking' ? -2.4 : (state === 'listening' ? 1.4 : (state === 'talking' ? Math.sin(t * 5.4) * 1.05 : Math.sin(t * 1.2) * 0.45)));
      faceEl.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + (breathe + bob).toFixed(2) + ') rotate(' + rot.toFixed(2) + ' 50 60) translate(50 60) scale(' + faceScale.toFixed(2) + ') translate(-50 -60)');

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    var ctrl = {
      el: svgEl,
      setState: function (s) { state = s; return this; },
      getState: function () { return state; },
      setEmotion: function (e) { emoOverride = e || null; return this; },
      setAmplitude: function (v, shape) { manualAmp = (v == null ? null : (v < 0 ? 0 : v > 1 ? 1 : v)); manualShape = shape == null ? null : (shape < 0 ? 0 : shape > 1 ? 1 : shape); return this; },
      setConfig: function (cfg) {
        mcfg = norm(cfg);
        mIris = IRIS[mcfg.iris];
        mBrow = shade(HAIR[mcfg.hair], mcfg.hair >= 4 ? -0.38 : -0.2);
        container.innerHTML = talkingSvg(cfg, opts.size || '100%');
        svgEl = container.querySelector('svg'); faceEl = container.querySelector('.ta-face');
        browsEl = container.querySelector('.ta-brows'); eyesEl = container.querySelector('.ta-eyes'); mouthEl = container.querySelector('.ta-mouth');
        lastMouth = lastEyes = lastBrows = '';
        return this;
      },
      attachAnalyser: function (a) { analyser = a || null; if (a) { freqBuf = new Uint8Array(a.frequencyBinCount); timeBuf = new Uint8Array(a.fftSize); } return this; },
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
    verse:    { skin: 1, hair: 2, top: 1,  eyes: 1, brows: 0, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 0, outfit: 1, iris: 0, detail: 1 }, // All-Rounder
    ash:      { skin: 2, hair: 0, top: 2,  eyes: 3, brows: 2, mouth: 3, facial: 1, glasses: 2, accessory: 0, bg: 0, outfit: 0, iris: 1, detail: 0 }, // Prosecutor
    coral:    { skin: 2, hair: 0, top: 8,  eyes: 1, brows: 1, mouth: 1, facial: 0, glasses: 0, accessory: 3, bg: 6, outfit: 5, iris: 4, detail: 2 }, // Quick Wit (braids, freckles)
    sage:     { skin: 1, hair: 1, top: 3,  eyes: 2, brows: 0, mouth: 0, facial: 1, glasses: 1, accessory: 0, bg: 5, outfit: 3, iris: 2, detail: 0 }, // Philosopher
    ballad:   { skin: 3, hair: 2, top: 10, eyes: 1, brows: 0, mouth: 1, facial: 0, glasses: 0, accessory: 0, bg: 2, outfit: 6, iris: 0, detail: 1 }, // Storyteller (waves)
    shimmer:  { skin: 3, hair: 0, top: 9,  eyes: 1, brows: 1, mouth: 2, facial: 0, glasses: 0, accessory: 3, bg: 4, outfit: 4, iris: 0, detail: 0 }, // Diplomat (ponytail)
    echo:     { skin: 1, hair: 0, top: 5,  eyes: 3, brows: 2, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 3, outfit: 0, iris: 5, detail: 0 }, // Closer
    alloy:    { skin: 2, hair: 2, top: 11, eyes: 0, brows: 0, mouth: 0, facial: 0, glasses: 2, accessory: 1, bg: 7, outfit: 2, iris: 3, detail: 0 }, // Strategist (coils + headphones)
    examiner: { skin: 3, hair: 1, top: 2,  eyes: 2, brows: 2, mouth: 0, facial: 3, glasses: 2, accessory: 0, bg: 5, outfit: 7, iris: 1, detail: 0 }  // Examiner
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
      iris: (rnd() < 0.6 ? p(2) : p(IRIS.length)),        // naturals dominate
      detail: (rnd() < 0.72 ? 0 : 1 + p(N_DETAIL - 1)),   // details are a garnish
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
    { key: 'detail', label: 'Details', n: N_DETAIL },
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
    { key: 'iris', label: 'Eye color', pal: IRIS },
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
    box.style.cssText = 'width:min(720px,96vw);max-height:92vh;overflow:auto;background:' + surf + ';color:' + txt + ';border:1px solid ' + bd + ';border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.42);font-family:inherit';
    back.appendChild(box);

    // header with live preview
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:20px;padding:20px 26px;position:sticky;top:0;background:' + surf + ';z-index:2;border-bottom:1px solid ' + bd;
    var prev = document.createElement('div');
    prev.style.cssText = 'width:112px;height:112px;border-radius:34px 48px 38px 44px;overflow:hidden;flex-shrink:0;box-shadow:0 18px 42px rgba(0,0,0,.24);transform:rotate(-2deg)';
    var htxt = document.createElement('div');
    htxt.style.cssText = 'flex:1;min-width:0';
    htxt.innerHTML = '<div style="font-size:.66rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#dc2626;margin-bottom:5px">Live identity</div>' +
      '<div style="font-size:1.28rem;font-weight:800;letter-spacing:-.01em">Build your avatar</div>' +
      '<div style="font-size:.86rem;color:' + dim + ';margin-top:4px;line-height:1.35">The same face appears in your debate brain, coach sessions, and live rooms.</div>';
    head.appendChild(prev); head.appendChild(htxt);
    box.appendChild(head);

    var body = document.createElement('div');
    body.style.cssText = 'padding:8px 26px 4px';
    box.appendChild(body);

    function renderPreview() { prev.innerHTML = svg(cfg, '100%'); }

    function rowWrap(label) {
      var w = document.createElement('div');
      w.style.cssText = 'padding:14px 0;border-bottom:1px solid ' + bd;
      var l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:' + dim + ';margin-bottom:9px';
      w.appendChild(l);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
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
        b.style.cssText = 'width:34px;height:34px;border-radius:50%;border:1px solid ' + bd + ';cursor:pointer;padding:0;background:' + col + ';box-shadow:inset 0 1px 0 rgba(255,255,255,.38)';
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
          b.style.cssText = 'width:58px;height:58px;border-radius:16px;border:1.5px solid ' + bd + ';cursor:pointer;padding:4px;overflow:hidden;transition:transform .14s,border-color .12s,background .12s;box-shadow:0 5px 14px rgba(0,0,0,.06)';
          b.addEventListener('mouseenter', function () { b.style.transform = 'translateY(-2px) scale(1.04)'; });
          b.addEventListener('mouseleave', function () { b.style.transform = ''; });
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
    foot.style.cssText = 'display:flex;gap:10px;align-items:center;padding:16px 26px 20px;position:sticky;bottom:0;background:' + surf + ';border-top:1px solid ' + bd;
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

  // ════════════════════════════════════════════════════════════════════
  // CAMEO — the premium avatar set. Editorial profile busts.
  //
  // Design system (keep every rule when adding avatars — see extend notes
  // at the bottom of this block):
  //   · Profile bust facing RIGHT, bust fills ~76% of the circle.
  //   · Light source top-right: bg radial sits at (68%, 20%), the face
  //     edge carries a warm rim light, shadow pools at nape + under jaw.
  //   · Backgrounds are deep tonal duotones — NO particles, orbits,
  //     rings, or texture. The portrait is the whole event.
  //   · Anatomy is human (brow / nose / lips / chin / jaw / clavicle),
  //     the eye is abstracted to a lash line + iris hint. No stare.
  //   · Identity = hair silhouette + palette + garment + one accessory.
  //     Never two accessories. Matte finish everywhere — no gloss.
  // ════════════════════════════════════════════════════════════════════

  // Head geometry. Three nose profiles + shared skull/jaw/neck chain.
  var CAM_NOSE = [
    'C68.9 36.6 70.6 39.8 70.2 41.7 C69.7 43.3 67.6 43.6 66.3 44.0',   // 0 straight
    'C69.4 36.2 71.3 39.5 70.7 41.8 C70.0 43.4 67.7 43.7 66.3 44.0',   // 1 aquiline
    'C68.4 36.8 69.9 39.9 69.4 41.4 C69.0 43.0 67.4 43.5 66.3 44.0'    // 2 soft / upturned
  ];
  function camHead(nose) {
    return 'M46.5 15.8 C55.5 14.2 63.2 18.6 65 25.2 C65.9 28.4 65.4 30.6 66.8 33.2 ' +
      CAM_NOSE[nose || 0] +
      ' C67.9 45.2 68.3 46.6 67.5 47.8 C68.5 49.0 68.3 50.8 66.6 51.8 C67.6 53.0 67.3 54.9 65.1 56.0 ' +
      'C61.7 58.7 56.3 60.1 52.5 60.3 C52.3 63.0 52.7 65.4 53.8 67.8 L38.8 67.8 ' +
      'C39.9 63.6 39.7 60.0 38.5 56.3 C35.7 50.6 34.5 43.5 35.3 36.4 C36.1 26.4 40.1 17.7 46.5 15.8 Z';
  }
  // The front profile edge, re-stroked for the rim light.
  function camRim(nose) {
    return 'M65 25.2 C65.9 28.4 65.4 30.6 66.8 33.2 ' + CAM_NOSE[nose || 0] +
      ' C67.9 45.2 68.3 46.6 67.5 47.8 C68.5 49.0 68.3 50.8 66.6 51.8 C67.6 53.0 67.3 54.9 65.1 56.0';
  }

  // Garment collars, drawn over the shoulder mass. c = main, c2 = under/tee.
  var CAM_GARB = {
    turtleneck: function (c) {
      return '<path d="M40.4 70.5 C40.4 62.5 55.6 62.5 55.6 70.5 L55.6 74 L40.4 74 Z" fill="' + shade(c, 0.10) + '"/>' +
             '<path d="M40.4 66.4 L55.6 66.4 M40.4 68.8 L55.6 68.8" stroke="' + shade(c, -0.12) + '" stroke-width=".8" opacity=".7"/>';
    },
    crew: function (c) {
      return '<path d="M41 68.5 C45 71.5 51 71.5 55 68.5 L55.6 71 C51 74 45 74 40.4 71 Z" fill="' + shade(c, 0.14) + '"/>';
    },
    blazer: function (c, c2) {
      return '<path d="M43 69 L49 76 L44 88 L37 74 Z" fill="' + shade(c, -0.14) + '"/>' +
             '<path d="M53 69 L48.6 76 L53 88 L60 74 Z" fill="' + shade(c, -0.20) + '"/>' +
             '<path d="M44.6 69.5 L51.4 69.5 L50 80 L46 80 Z" fill="' + c2 + '"/>';
    },
    hoodie: function (c) {
      return '<path d="M38 72 C38 64.5 58 64.5 58 72 C58 75.5 54 77.5 48 77.5 C42 77.5 38 75.5 38 72 Z" fill="' + shade(c, 0.12) + '"/>' +
             '<path d="M45.4 76.8 L44.8 86 M50.6 76.8 L51.2 86" stroke="' + shade(c, 0.22) + '" stroke-width="1.4" stroke-linecap="round"/>';
    },
    puffer: function (c) {
      return '<path d="M39.5 71 C39.5 63.5 56.5 63.5 56.5 71 L56.5 75.5 L39.5 75.5 Z" fill="' + shade(c, 0.10) + '"/>' +
             '<path d="M39.5 71.8 L56.5 71.8" stroke="' + shade(c, -0.16) + '" stroke-width="1" opacity=".8"/>' +
             '<path d="M48 64 L48 75.5" stroke="' + shade(c, -0.16) + '" stroke-width="1" opacity=".8"/>';
    },
    zip: function (c) {
      return '<path d="M41 68.5 C45 71.5 51 71.5 55 68.5 L55.6 71.4 C51 74.4 45 74.4 40.4 71.4 Z" fill="' + shade(c, 0.16) + '"/>' +
             '<path d="M48 71.8 L48 92" stroke="' + shade(c, 0.3) + '" stroke-width="1.1"/>';
    }
  };

  // Accessories. One per avatar, max.
  var CAM_ACC = {
    none: function () { return ''; },
    hoop: function () {
      return '<circle cx="52.4" cy="48.8" r="2.4" fill="none" stroke="#e7b54c" stroke-width="1.25"/>';
    },
    stud: function () {
      return '<circle cx="52.4" cy="47.4" r="1.15" fill="#e7b54c"/>';
    },
    glasses: function () {
      // profile lens: one rounded lens + temple arm back to the ear
      return '<path d="M56.8 33.2 L68.8 32.6" stroke="#20242c" stroke-width="1.4" stroke-linecap="round"/>' +
             '<path d="M58.2 33.2 C58.2 37.6 62.4 38.9 65.2 37.4 C67 36.4 67.8 34.6 67.8 32.7" fill="rgba(255,255,255,.08)" stroke="#20242c" stroke-width="1.3"/>' +
             '<path d="M56.8 33.2 L53 38.6" stroke="#20242c" stroke-width="1.3" stroke-linecap="round"/>';
    },
    headphones: function () {
      return '<path d="M37.4 30 C39.4 20 49.8 15 58 18.8" fill="none" stroke="#1b1e26" stroke-width="3.2" stroke-linecap="round"/>' +
             '<rect x="48.2" y="38.2" width="7.8" height="10.8" rx="3.8" fill="#1b1e26"/>' +
             '<rect x="51" y="41.2" width="2.4" height="4.8" rx="1.2" fill="#ef4444" opacity=".9"/>';
    },
    earcuff: function () {
      return '<path d="M55.9 40.6 A4.6 4.6 0 0 1 56.4 44.6" fill="none" stroke="#cdd3dd" stroke-width="1.5" stroke-linecap="round"/>';
    }
  };

  // The 12. Each: name, head nose variant, skin, hair color, bg duo,
  // garment [kind, color, (tee)], acc, and a hair renderer index.
  // Hair renderers live in CAM_HAIR below — the silhouette IS the identity.
  var CAMEOS = [
    { name: 'Nova',  nose: 0, skin: '#8d5c38', hair: '#15100c', bg: ['#3b2a20', '#241811'], garb: ['turtleneck', '#16161a'], acc: 'hoop',      hs: 0  },
    { name: 'Rhea',  nose: 2, skin: '#f0d4bb', hair: '#6b4423', bg: ['#1d2b45', '#101a2e'], garb: ['crew', '#c8a878'],       acc: 'none',      hs: 1  },
    { name: 'Kai',   nose: 0, skin: '#e2b48c', hair: '#241a12', bg: ['#39424e', '#232a34'], garb: ['crew', '#30343c'],       acc: 'glasses',   hs: 2  },
    { name: 'Zadie', nose: 2, skin: '#6d4527', hair: '#100c09', bg: ['#4a1f24', '#2e1215'], garb: ['turtleneck', '#e8e0d2'], acc: 'none',      hs: 3  },
    { name: 'Emre',  nose: 1, skin: '#c99a6b', hair: '#1c1611', bg: ['#25382c', '#16241b'], garb: ['zip', '#191c22'],        acc: 'none',      hs: 4  },
    { name: 'Ines',  nose: 0, skin: '#d9a97e', hair: '#2a1c12', bg: ['#3a2440', '#241329'], garb: ['blazer', '#23242b', '#f2ede4'], acc: 'hoop', hs: 5 },
    { name: 'Jun',   nose: 2, skin: '#edc9a4', hair: '#17120e', bg: ['#173a3a', '#0d2424'], garb: ['turtleneck', '#3c4650'], acc: 'stud',      hs: 6  },
    { name: 'Amara', nose: 0, skin: '#a06a40', hair: '#000000', bg: ['#41432e', '#28291c'], garb: ['crew', '#5c4a5e'],       acc: 'none',      hs: 7, hideEar: true },
    { name: 'Theo',  nose: 1, skin: '#7a4e2e', hair: '#14100c', bg: ['#45222c', '#2b141b'], garb: ['crew', '#28303a'],       acc: 'headphones', hs: 8 },
    { name: 'Mars',  nose: 1, skin: '#f3ddc8', hair: '#c2c8d4', bg: ['#2b2b31', '#1a1a1f'], garb: ['turtleneck', '#101014'], acc: 'earcuff',   hs: 9  },
    { name: 'Suri',  nose: 2, skin: '#c78d5d', hair: '#221510', bg: ['#1f3050', '#122036'], garb: ['zip', '#872731'],        acc: 'stud',      hs: 10 },
    { name: 'Dre',   nose: 0, skin: '#5d3a22', hair: '#0e0b08', bg: ['#4a443c', '#2d2924'], garb: ['hoodie', '#a83232'],     acc: 'none',      hs: 11 }
  ];

  // Hair silhouettes (front = over crown/forehead; back = behind bust).
  // Coordinates assume the shared head: crown apex ~ (46,15.8), forehead
  // edge ~ (65,25), nape ~ (36,50). Each returns { back, front }.
  var CAM_HAIR = [
    function (h) { // 0 Nova — sculpted high-top fade
      var d = shade(h, 0.25);
      return { back: '', front:
        '<path d="M38.6 13 L63 12.4 C64.6 16.2 65.4 21 65.2 25.4 C56 20.4 45.4 20.6 38.2 24.8 C37.4 20.4 37.6 16.2 38.6 13 Z" fill="' + h + '"/>' +
        '<path d="M38.2 24.8 C36.6 29.8 36.2 35.6 37.4 41 L39.8 40.4 C38.8 35.6 39 30.4 40.4 26.2 Z" fill="' + h + '" opacity=".5"/>' +
        '<path d="M41 14.6 L61 14.2" stroke="' + d + '" stroke-width="1.1" opacity=".6"/>' };
    },
    function (h) { // 1 Rhea — long editorial waves, swept back
      var d = shade(h, -0.22), hl = shade(h, 0.25);
      return {
        back: '<path d="M36 22 C26 34 24.5 56 30 74 C33.5 84 40 89 46 90 L47.5 85 C40 80 36 70 36.3 58 C36.5 47 38.5 36 43 28 Z" fill="' + d + '"/>' +
              '<path d="M31.8 46 C31 58 33 70 38.5 79" fill="none" stroke="' + shade(h, -0.34) + '" stroke-width="1.2" opacity=".7"/>',
        front: '<path d="M43.5 14.6 C55 12.2 64 18.4 65.6 26.6 C65.9 28.4 65.6 30.2 66.4 32.2 C61.5 27.2 56.5 25.4 52 26.4 C55 23 55.5 20 54.5 17.6 C50 24.4 42 26.2 38.2 33 C36 37.4 35.6 42.6 36.4 47.4 L33.2 44 C30.6 34 34 19 43.5 14.6 Z" fill="' + h + '"/>' +
               '<path d="M45.5 17.4 C51.5 15.6 58 17.8 61.6 22.6" fill="none" stroke="' + hl + '" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' };
    },
    function (h) { // 2 Kai — messy quiff crop
      var hl = shade(h, 0.3);
      return { back: '', front:
        '<path d="M37.6 26 C36.4 18.4 42 13 49.5 12.6 C57.5 12.2 64.2 17 65.4 24.2 C65.7 26.4 65.4 28.2 66.2 30.6 C62 26.8 58.5 25.8 55.5 26.6 C57.8 23.4 58.2 20.6 57 18.4 C54.4 23.2 48.8 25.4 44 25 C41.6 24.8 39.4 25.2 37.6 26 Z" fill="' + h + '"/>' +
        '<path d="M44 15.2 C47.5 13.6 52.5 13.6 56 15.6 M40 19 C42.5 16.8 45.5 15.6 48 15.4" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 3 Zadie — box braids, gathered back, beads
      var d = shade(h, 0.28);
      return {
        back: '<path d="M36.5 20 C28 30 26 48 29.5 62 L34.5 61 C32 49 33 36 38.5 27 Z" fill="' + h + '"/>' +
              '<ellipse cx="31" cy="52" rx="2.5" ry="4" fill="' + shade(h, 0.16) + '"/><ellipse cx="30.6" cy="60.5" rx="2.4" ry="3.8" fill="' + h + '"/><ellipse cx="31.4" cy="68.5" rx="2.3" ry="3.6" fill="' + shade(h, 0.16) + '"/>' +
              '<circle cx="31.8" cy="73.4" r="1.5" fill="#e7b54c"/>' +
              '<ellipse cx="36.6" cy="56" rx="2.3" ry="3.8" fill="' + h + '"/><ellipse cx="37" cy="64" rx="2.2" ry="3.6" fill="' + shade(h, 0.16) + '"/>' +
              '<circle cx="37.3" cy="69" r="1.4" fill="#e7b54c"/>',
        front: '<path d="M44 14.8 C54.5 12.6 63.6 18 65.2 25.6 C65.7 28 65.4 30 66.4 32.6 C60.5 26.6 52 24.6 45 27.6 C41 29.4 38 32.6 36.6 36.6 L34.4 33.4 C33.6 24.4 37.5 16.6 44 14.8 Z" fill="' + h + '"/>' +
               '<path d="M46 16.4 L43 26.4 M51.5 15.6 L50.5 25 M57 16.4 L57.5 24.4 M62 19.4 L63.6 26.4" stroke="' + d + '" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' };
    },
    function (h) { // 4 Emre — tight buzz + beard shadow
      return { back: '', front:
        '<path d="M38 27.5 C37.4 19.4 43 13.8 50 13.4 C57.6 13 64.2 17.8 65.2 24.6 C65.5 26.8 65.3 28.4 66 30.6 C60 25.2 50 24 43.5 27.4 C41.4 28.4 39.5 28.2 38 27.5 Z" fill="' + h + '" opacity=".92"/>' +
        '<path d="M66 51.6 C67 53 66.9 54.9 65.1 56.0 C61.7 58.7 56.3 60.1 52.5 60.3 L52.5 58.4 C56.6 58.2 61.4 56.6 64.2 54.2 C65.2 53.4 65.7 52.5 66 51.6 Z" fill="' + h + '" opacity=".42"/>' };
    },
    function (h) { // 5 Ines — sleek low bun
      var hl = shade(h, 0.3);
      return {
        back: '<circle cx="34.5" cy="53" r="6.8" fill="' + shade(h, -0.1) + '"/>' +
              '<path d="M30.4 49.5 A6.8 6.8 0 0 1 37.5 46.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>',
        front: '<path d="M43.8 14.8 C54.5 12.4 63.8 18.2 65.3 25.8 C65.7 28 65.4 30 66.3 32.4 C60 25.8 51 24.4 44.5 28.4 C39.8 31.4 37 37 36.8 44 L34 41.5 C32.4 30.5 36 17.5 43.8 14.8 Z" fill="' + h + '"/>' +
               '<path d="M44.5 17.6 C50.5 15.2 57.5 16.4 62 20.6" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 6 Jun — curtain bob with blunt bangs
      var d = shade(h, -0.2);
      return {
        back: '<path d="M35 24 C29 32 28 48 31 60 C32.8 66.5 36 70.5 39.8 72 L42 67.5 C38 64 36 57 36.2 48 Z" fill="' + d + '"/>',
        front: '<path d="M42.8 14.6 C53.5 12 63.8 17.6 65.5 25.8 C66 28.4 65.6 30.4 66.5 33 L64 32.4 C63.4 29.2 62.2 26.8 60.4 24.6 C60.9 27.4 60.6 29.8 59.6 31.6 C57.8 27.6 54.6 25 51 24.4 C52.2 26.8 52.4 29 51.6 30.8 C48.6 26.6 44.4 25 40.4 26.6 C37.6 27.8 35.8 30.4 35.2 34 C33 27 36.2 16.4 42.8 14.6 Z" fill="' + h + '"/>' +
               '<path d="M35.2 34 C34.4 43 35.4 53 38.2 60.8 L41.2 59.4 C38.6 52 37.8 43 38.4 35.4 Z" fill="' + h + '"/>' };
    },
    function (h) { // 7 Amara — draped hijab (the hair-mass IS the drape)
      var c = '#b98499', d = shade(c, -0.22), hl = shade(c, 0.14);
      return {
        back: '<path d="M33 46 C31 58 33 70 38 77 L44 74 C40 67 38.6 57 39.6 48 Z" fill="' + d + '"/>',
        front: '<path d="M43 13.4 C56 10.4 66.5 17.6 67.6 27.4 C67.9 29.8 67.4 31.6 68.2 33.8 L66 33.4 C64.9 30.4 64.6 27.8 62.6 25.2 C55.6 22.6 48 23.4 43 27.4 C38.6 31 36.4 36.6 36.6 43.4 C36.8 52.8 40.4 62.6 46.6 68.6 L42.4 71.6 C34 64.6 29.8 51.6 31.6 39 C33 28 36.6 16.4 43 13.4 Z" fill="' + c + '"/>' +
               '<path d="M39.8 68 C43.6 71.8 49 74 54.6 74 L54.6 78.6 C47.6 78.8 41 76 36.6 71 Z" fill="' + hl + '"/>' +
               '<path d="M44.5 16.8 C52 14 60.5 16.6 64.4 22.6" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>' };
    },
    function (h) { // 8 Theo — short coils
      var d = shade(h, 0.24);
      return { back: '', front:
        '<path d="M37.8 27 C36.6 18.6 42.6 13 50 12.8 C58 12.6 64.6 17.6 65.4 24.8 C65.7 27 65.4 28.6 66.2 30.8 C60.5 25.4 50.5 24.2 44 27.6 C41.8 28.8 39.6 28.4 37.8 27 Z" fill="' + h + '"/>' +
        '<circle cx="42" cy="18.6" r="2.1" fill="' + d + '" opacity=".7"/><circle cx="48" cy="15.4" r="2.2" fill="' + d + '" opacity=".6"/><circle cx="55" cy="15" r="2.1" fill="' + d + '" opacity=".7"/><circle cx="61" cy="18" r="2" fill="' + d + '" opacity=".6"/>' };
    },
    function (h) { // 9 Mars — platinum micro-buzz, sharp hairline
      var d = shade(h, -0.3);
      return { back: '', front:
        '<path d="M38.2 26.6 C37.6 18.8 43.4 13.4 50.2 13.2 C57.6 13 64 17.8 65.1 24.4 C65.4 26.6 65.2 28.2 65.9 30.2 C59.5 25 49.5 24 43.4 27.2 C41.5 28.2 39.7 27.8 38.2 26.6 Z" fill="' + h + '" opacity=".95"/>' +
        '<path d="M42 27.2 C48.5 24.4 57 24.8 63 28.6" fill="none" stroke="' + d + '" stroke-width=".9" opacity=".8"/>' };
    },
    function (h) { // 10 Suri — high whipped ponytail
      var d = shade(h, -0.18), hl = shade(h, 0.28);
      return {
        back: '<path d="M40 16 C30 12 20.5 15 16.5 24 C13.5 31 15 40 20 46 L24.5 42.5 C20.5 37.5 19.5 30.5 22.5 25.5 C26 19.6 33 18 39.5 21 Z" fill="' + d + '"/>' +
              '<path d="M20.5 24.5 C17.8 29.5 18.2 36 21.6 41" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>',
        front: '<path d="M43.5 14.8 C54.5 12.4 64 18.2 65.4 26 C65.8 28.2 65.5 30 66.4 32.4 C60.5 26.2 52 24.6 45.5 28 C40.5 30.8 37.6 36.2 37.2 42.6 L34.6 40 C33.2 29.4 36.6 17 43.5 14.8 Z" fill="' + h + '"/>' +
               '<path d="M41.5 19.5 C38.5 18.2 41 15.6 43.6 15 L44.6 18.4 Z" fill="' + d + '"/>' +
               '<path d="M46 17.2 C52 14.8 59 16.4 63.2 20.8" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 11 Dre — locs, tied half-up
      var d = shade(h, 0.22);
      return {
        back: '<path d="M35.5 26 C30 34 28.5 48 31.5 60 L36.5 58.6 C34.2 48.4 35.2 37.4 39.5 30 Z" fill="' + h + '"/>' +
              '<path d="M32.5 40 L30.8 55 M36.5 34 L34.5 50" stroke="' + d + '" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>' +
              '<path d="M31.2 58 C30.8 63.5 31.4 69 33 73.5" stroke="' + h + '" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
              '<path d="M35.8 56.5 C35.6 62 36.4 67.5 38.2 72" stroke="' + shade(h, 0.12) + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>',
        front: '<path d="M42 14.2 C53.5 11.4 64 17.2 65.5 25.6 C65.9 28 65.6 30 66.5 32.6 C60 26 51 24.4 44.4 28 C40 30.4 37.4 35 36.8 40.6 L33.8 37.6 C32.6 27.6 35.8 16.4 42 14.2 Z" fill="' + h + '"/>' +
               '<path d="M40 15 C38.4 12 42.4 9.6 45.4 10.4 C48.4 11.2 49 14.6 46.6 15.8 L43.2 16.8 Z" fill="' + d + '"/>' +
               '<path d="M44 17 L41.5 27 M49.5 15.6 L48 25.4 M55.5 15.8 L55.5 24.6 M61 18.6 L62.8 26.2" stroke="' + d + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>' };
    }
  ];

  function cameoSvg(idx, size) {
    var A = CAMEOS[((idx % CAMEOS.length) + CAMEOS.length) % CAMEOS.length];
    var id = 'cam' + (++uid);
    var sz = (size === '100%') ? '100%' : (size || 96);
    var skin = A.skin, skinD = shade(skin, -0.16), skinDD = shade(skin, -0.3);
    var hair = CAM_HAIR[A.hs](A.hair);
    var garbC = A.garb[1];
    var garb = CAM_GARB[A.garb[0]](garbC, A.garb[2] || '#f2ede4');
    var browC = shade(A.hair === '#c2c8d4' ? '#7d838e' : A.hair, 0.06);
    var lip = shade(skin, -0.28);
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="' + A.name + '" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<radialGradient id="' + id + 'bg" cx="68%" cy="20%" r="95%"><stop offset="0%" stop-color="' + A.bg[0] + '"/><stop offset="100%" stop-color="' + A.bg[1] + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'sk" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + shade(skin, 0.10) + '"/><stop offset="55%" stop-color="' + skin + '"/><stop offset="100%" stop-color="' + skinD + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + shade(garbC, 0.08) + '"/><stop offset="100%" stop-color="' + shade(garbC, -0.14) + '"/></linearGradient></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      hair.back +
      // shoulders
      '<path d="M24 100 C25 81 34.5 71.5 48 70 C62 71.5 71.5 81 72.5 100 Z" fill="url(#' + id + 'gb)"/>' +
      garb +
      // neck (behind jaw) + head
      '<path d="M39.5 55 L53.5 55 L53.8 68.5 L38.8 68.5 Z" fill="' + skinD + '"/>' +
      '<path d="' + camHead(A.nose) + '" fill="url(#' + id + 'sk)"/>' +
      // jaw / neck shadow pool
      '<path d="M52.5 60.3 C56.3 60.1 61.7 58.7 65.1 56.0 C61 60.4 56 61.8 52.6 61.6 Z" fill="' + skinDD + '" opacity=".38"/>' +
      '<path d="M39 56.5 C41.5 59.5 46 61 50.5 61 L50.5 63.5 C45.5 63.5 41 61.5 38.6 58.6 Z" fill="' + skinDD + '" opacity=".22"/>' +
      // ear (hidden for head coverings)
      (A.hideEar ? '' :
        '<path d="M51.4 39.3 C55 37.4 57.1 40 56 43.2 C55.1 45.9 52.8 47.6 51.2 46.9 C49.9 46.3 50.1 42.8 51.4 39.3 Z" fill="' + skin + '"/>' +
        '<path d="M52.6 40.8 C54.2 40 55.4 41.4 54.7 43.2" fill="none" stroke="' + skinDD + '" stroke-width=".9" stroke-linecap="round" opacity=".7"/>') +
      // brow, lash line, iris hint
      '<path d="M58.4 31.2 Q62.4 29.6 65.8 31.8" fill="none" stroke="' + browC + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M59.2 35.4 Q62 34.2 64.6 35.2" fill="none" stroke="#1d1712" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M60.6 36.4 A1.6 1.6 0 0 0 63.4 36.2 L60.8 35.9 Z" fill="#241a12" opacity=".85"/>' +
      // nostril + lip seam + lip tone
      '<path d="M67 42.7 A1 1 0 1 0 67.1 42.6" fill="' + skinDD + '" opacity=".65"/>' +
      '<path d="M66.2 48.4 L68.1 48.2" stroke="' + lip + '" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="M66.6 49.5 C67.6 49.9 68.2 49.6 68.3 49.1" fill="none" stroke="' + shade(lip, 0.14) + '" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>' +
      // cheek structure
      '<path d="M58 44.5 C60 46.5 62.5 47.3 64.8 47" fill="none" stroke="' + skinDD + '" stroke-width="1" stroke-linecap="round" opacity=".18"/>' +
      // rim light on the profile edge
      '<path d="' + camRim(A.nose) + '" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".32"/>' +
      hair.front +
      CAM_ACC[A.acc]() +
      '</g></svg>';
  }
  // persona key → cameo index (identity-matched to the voice cast)
  var CAMEO_MAP = { verse: 2, ash: 9, coral: 3, sage: 8, ballad: 1, shimmer: 5, echo: 0, alloy: 10, examiner: 4 };
  function cameo(key, size) {
    var i = (typeof key === 'number') ? key : (CAMEO_MAP[key] != null ? CAMEO_MAP[key] : 0);
    return cameoSvg(i, size);
  }
  // ── Extending the set ────────────────────────────────────────────────
  // Add an entry to CAMEOS + a hair renderer to CAM_HAIR. Hold the rules:
  // same head paths (pick a nose variant), bg = deep tonal duo (never a
  // bright), ONE accessory max, garment from CAM_GARB (add a collar there
  // if needed), hair silhouette must read at 32px (test before shipping),
  // light stays top-right. If it needs a new gradient direction, particle,
  // or outline style — it doesn't belong in this set.

  global.DBAvatar = {
    svg: svg, persona: persona, PRESETS: PRESETS,
    getUser: getUser, setUser: setUser, clearUser: clearUser,
    randomConfig: randomConfig, openBuilder: openBuilder, mountWelcome: mountWelcome,
    talkingSvg: talkingSvg, mountTalking: mountTalking,
    cameo: cameo, cameoSvg: cameoSvg, CAMEOS: CAMEOS, CAMEO_MAP: CAMEO_MAP,
    SKIN: SKIN, HAIR: HAIR, BG: BG, OUTFIT: OUTFIT, EVENT: EVT
  };
})(window);
