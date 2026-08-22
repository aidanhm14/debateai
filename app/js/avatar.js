/* Debatable avatars. A procedural portrait engine shared by user avatars,
   One module powers both surfaces: the user builds their own avatar,
   and the AI debaters get matched-set faces from the same generator.

   Art direction: young, dimensional, and composed. Faces fill the frame;
   restrained light, depth, and orbital lines make them feel native to the
   Debatable brain system. Built for HS-through-college debaters, not a
   boardroom or a sticker pack.

   Public API (window.DBAvatar):
     svg(config, size)      -> SVG markup string for a config
     persona(key, size)     -> SVG for an AI persona preset
     getUser()              -> saved user config or null
     setUser(config)        -> persist + broadcast 'debatable-avatar-change'
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

  var STORE_KEY = 'debatable-avatar';
  var LEGACY_STORE_KEY = 'debate' + 'it-avatar';
  var EVT = 'debatable-avatar-change';
  var LIVE_STORE_KEY = 'debatable-live-avatar-v1';
  var LIVE_LOOKS_KEY = 'debatable-avatar-looks-v1';
  var LIVE_EVT = 'debatable-avatar-design';
  // These five lists MUST stay in step with DESIGN_OPTIONS in
  // js/cam-avatar.js. A key that exists there and not here is silently
  // normalized away, so a debater's chosen look would render one way on
  // their call tile and another way on every profile and ballot.
  var LIVE_SCENES = ['arena','skyline','library','studio','orbit','forest','chamber','neon','void'];
  var LIVE_ACCENTS = { crimson:'#dd2e2e', electric:'#4f7cff', violet:'#9b5de5', teal:'#17b6a4', rose:'#e44878', silver:'#b8c1cf', gold:'#e0a33a', lime:'#8fd14f', ice:'#6fd8ef' };
  var LIVE_OUTFITS = { ink:['#27272f','#09090b'], navy:['#20334d','#090e18'], plum:['#392942','#110b16'], pine:['#1f3a35','#08110f'], slate:['#414956','#101318'], rust:['#4a2a20','#150a07'], bone:['#b9b1a4','#4a453d'], royal:['#2c2a63','#0b0a1c'] };
  var LIVE_MASKS = ['blade','classic','visor','wing','oni','plate','slim'];
  var LIVE_EYES = { focus:[3.5,0], sharp:[2.8,7], open:[4.6,0], calm:[2.2,0], round:[4.8,0], keen:[3.0,-8], hooded:[2.4,4] };
  var maskSeq = 0;

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

  // ---- dimensional face plate -------------------------------------------
  // One light: a warm key from the upper left, a cool fill from the lower
  // right. Every soft shape below is painted with two reusable brush
  // gradients (a highlight brush and a shadow brush) in objectBoundingBox
  // space, so a whole face of soft form costs ZERO SVG filters. Filters
  // blur on the CPU and a leaderboard renders dozens of these at once.

  // Head silhouette. The cranium keeps the exact envelope every hair style
  // is drawn against (x 26.5..73.5 at the temples, apex ~y19); the lower
  // half is a real face: zygomatic width at y48, jaw angle at y56, chin at
  // y69.9. Do NOT reshape the top without redrawing all 12 hair styles.
  // Level of detail. A roster or a leaderboard paints dozens of these at
  // once, and none of the fine work (iris fibres, lid creases, ear helix,
  // strands, the head's drop shadow) survives a 34px render anyway. Below
  // ~54px those shapes are dropped: same face, roughly half the nodes and
  // no CPU-side blur. Set from svg()/talkingSvg() before any helper runs;
  // string building here is synchronous, so a module flag is safe.
  var FINE = true;
  function setLod(size) { FINE = !(typeof size === 'number' && size <= 54); return FINE; }

  var SKULL = 'M26.6 41.5 C26.6 26.4 35.8 18.8 50 18.8 C64.2 18.8 73.4 26.4 73.4 41.5 C73.4 47.8 72.4 52 70.6 56.2 C67.2 63.2 59.2 70.2 50 70.2 C40.8 70.2 32.8 63.2 29.4 56.2 C27.6 52 26.6 47.8 26.6 41.5 Z';

  function faceDefs(id, skin, bg, outfit, iris) {
    var deep = shade(skin, -0.62);
    return '<clipPath id="' + id + 'c"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<clipPath id="' + id + 'h"><path d="' + SKULL + '"/></clipPath>' +
      '<radialGradient id="' + id + 'bg" cx="26%" cy="14%" r="96%"><stop offset="0%" stop-color="' + shade(bg, 0.40) + '"/><stop offset="46%" stop-color="' + bg + '"/><stop offset="100%" stop-color="' + shade(bg, -0.34) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'sk" cx="34%" cy="20%" r="80%"><stop offset="0%" stop-color="' + shade(skin, 0.32) + '"/><stop offset="44%" stop-color="' + shade(skin, 0.09) + '"/><stop offset="74%" stop-color="' + skin + '"/><stop offset="100%" stop-color="' + shade(skin, -0.28) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'hl"><stop offset="0%" stop-color="#fff" stop-opacity=".85"/><stop offset="58%" stop-color="#fff" stop-opacity=".26"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'sh"><stop offset="0%" stop-color="' + deep + '" stop-opacity=".74"/><stop offset="56%" stop-color="' + deep + '" stop-opacity=".26"/><stop offset="100%" stop-color="' + deep + '" stop-opacity="0"/></radialGradient>' +
      (FINE ? '<linearGradient id="' + id + 'rim" x1="1" y1="0" x2="0" y2=".55"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="34%" stop-color="#fff" stop-opacity="0"/></linearGradient>' : '') +
      '<linearGradient id="' + id + 'ot" x1=".16" y1="0" x2=".92" y2="1"><stop offset="0%" stop-color="' + shade(outfit, 0.24) + '"/><stop offset="52%" stop-color="' + outfit + '"/><stop offset="100%" stop-color="' + shade(outfit, -0.28) + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'ir" cx="50%" cy="64%" r="64%"><stop offset="0%" stop-color="' + shade(iris, 0.44) + '"/><stop offset="50%" stop-color="' + iris + '"/><stop offset="100%" stop-color="' + shade(iris, -0.5) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a9988f"/><stop offset="34%" stop-color="#f6f1ed"/><stop offset="100%" stop-color="#dcd0c8"/></linearGradient>' +
      '<radialGradient id="' + id + 'vg" cx="50%" cy="46%" r="62%"><stop offset="58%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".30"/></radialGradient>' +
      (FINE ? '<filter id="' + id + 'ds" x="-32%" y="-32%" width="172%" height="182%"><feDropShadow dx="0" dy="3" stdDeviation="2.8" flood-color="#1b1210" flood-opacity=".34"/></filter>' : '');
  }

  // The planes of a face, painted as soft brushes and clipped to the skull.
  // Read top to bottom: key light, then the form shadow that turns the head,
  // then the local hollows that make it read as bone under skin.
  function faceForm(id) {
    if (!FINE) {
      return '<g clip-path="url(#' + id + 'h)">' +
        '<ellipse cx="40" cy="31" rx="15" ry="11" fill="url(#' + id + 'hl)" opacity=".28"/>' +
        '<ellipse cx="69.5" cy="45" rx="12.5" ry="24" fill="url(#' + id + 'sh)" opacity=".55"/>' +
        '<ellipse cx="50" cy="71" rx="18.5" ry="9.5" fill="url(#' + id + 'sh)" opacity=".6"/>' +
        '<ellipse cx="50" cy="28.6" rx="22" ry="7" fill="url(#' + id + 'sh)" opacity=".34"/>' +
        '</g>';
    }
    return '<g clip-path="url(#' + id + 'h)">' +
      '<ellipse cx="40" cy="30.5" rx="15" ry="11" fill="url(#' + id + 'hl)" opacity=".30"/>' +
      '<ellipse cx="37.4" cy="48.6" rx="7.6" ry="5" fill="url(#' + id + 'hl)" opacity=".26" transform="rotate(-14 37.4 48.6)"/>' +
      '<ellipse cx="50" cy="64.6" rx="5.4" ry="3.4" fill="url(#' + id + 'hl)" opacity=".24"/>' +
      '<ellipse cx="69.5" cy="45" rx="12.5" ry="24" fill="url(#' + id + 'sh)" opacity=".55"/>' +
      '<ellipse cx="30.4" cy="43" rx="5.4" ry="9" fill="url(#' + id + 'sh)" opacity=".32"/>' +
      '<ellipse cx="50" cy="71" rx="18.5" ry="9.5" fill="url(#' + id + 'sh)" opacity=".62"/>' +
      '<ellipse cx="62.8" cy="56.8" rx="7" ry="5.4" fill="url(#' + id + 'sh)" opacity=".34"/>' +
      '<ellipse cx="37.2" cy="57.2" rx="6.4" ry="5" fill="url(#' + id + 'sh)" opacity=".24"/>' +
      '<ellipse cx="40" cy="41.6" rx="7.6" ry="3.4" fill="url(#' + id + 'sh)" opacity=".32"/>' +
      '<ellipse cx="60" cy="41.6" rx="7.6" ry="3.4" fill="url(#' + id + 'sh)" opacity=".40"/>' +
      '<ellipse cx="54.4" cy="52.6" rx="3" ry="3.2" fill="url(#' + id + 'sh)" opacity=".3"/>' +
      '<ellipse cx="50" cy="28.6" rx="22" ry="7" fill="url(#' + id + 'sh)" opacity=".34"/>' +
      '</g>' +
      '<path d="' + SKULL + '" fill="url(#' + id + 'rim)" opacity=".5"/>';
  }

  // Ears: helix, concha, lobe. A circle reads as a bolt, not an ear.
  function earsPath(skin) {
    var deep = shade(skin, -0.42), lit = shade(skin, 0.14);
    function ear(x, s) {
      return '<g transform="translate(' + x + ' 0) scale(' + s + ' 1)">' +
        '<path d="M.4 42.2 C-4.2 41 -6.6 44.8 -5.8 49 C-5.1 52.8 -2.8 55.6 -.2 55 Z" fill="' + skin + '"/>' +
        (FINE ? '<path d="M-.6 43.8 C-4 43.6 -5.2 46.6 -4.6 49.4" stroke="' + lit + '" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".75"/>' +
        '<path d="M-1.2 46.4 C-3.4 47.4 -3.6 50.4 -2.2 52.2" stroke="' + deep + '" stroke-width="1" fill="none" stroke-linecap="round" opacity=".7"/>' +
        '<path d="M-3.4 52.4 C-3.9 54.2 -2.4 55.4 -.8 54.8" fill="' + deep + '" opacity=".22"/>' : '') +
        '</g>';
    }
    return ear(28.4, 1) + ear(71.6, -1);
  }

  // Nose: bridge highlight, shadow side, ball, wings, nostrils. It is the
  // one feature that carries depth on a front-facing head, so it gets five
  // shapes rather than the single stroke this used to be.
  function nosePath(skin) {
    var deep = shade(skin, -0.44), dark = shade(skin, -0.66);
    if (!FINE) {
      return '<ellipse cx="50" cy="52.4" rx="3.5" ry="2.6" fill="' + deep + '" opacity=".2"/>' +
        '<ellipse cx="47.9" cy="54" rx=".9" ry=".64" fill="' + dark + '" opacity=".6"/>' +
        '<ellipse cx="52.1" cy="54" rx=".9" ry=".64" fill="' + dark + '" opacity=".6"/>';
    }
    return '<path d="M49.1 45.6 C48.8 47.8 48.7 49.6 48.9 51.2" stroke="#fff" stroke-opacity=".12" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '<path d="M51.3 46 C51.9 48.2 52.6 50.2 53.2 51.6" stroke="' + deep + '" stroke-opacity=".34" stroke-width="1.15" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="52.4" rx="3.5" ry="2.6" fill="' + deep + '" opacity=".17"/>' +
      '<ellipse cx="49" cy="51.5" rx="1.7" ry="1.2" fill="#fff" opacity=".24"/>' +
      '<path d="M46.9 52.9 C46.5 54.1 47.5 54.8 48.7 54.6" stroke="' + deep + '" stroke-width="1.05" fill="none" stroke-linecap="round" opacity=".75"/>' +
      '<path d="M53.1 52.9 C53.5 54.1 52.5 54.8 51.3 54.6" stroke="' + deep + '" stroke-width="1.05" fill="none" stroke-linecap="round" opacity=".88"/>' +
      '<ellipse cx="47.9" cy="54" rx=".88" ry=".62" fill="' + dark + '" opacity=".55" transform="rotate(-18 47.9 54)"/>' +
      '<ellipse cx="52.1" cy="54" rx=".88" ry=".62" fill="' + dark + '" opacity=".55" transform="rotate(18 52.1 54)"/>';
  }

  // Hair finish that rides on top of any style: a specular band where the
  // key light lands, plus a couple of strands off the silhouette so the
  // mass does not read as a solid helmet. Shaved skips both.
  function hairFinish(id, top, hairCol) {
    if (top === 0) return '<ellipse cx="42" cy="26" rx="11" ry="6" fill="url(#' + id + 'hl)" opacity=".16"/>';
    var hl = shade(hairCol, 0.34);
    var sheen = '<ellipse cx="40.5" cy="25.5" rx="11.5" ry="5.4" fill="url(#' + id + 'hl)" opacity=".30" transform="rotate(-16 40.5 25.5)"/>' +
                '<ellipse cx="63" cy="27.5" rx="6" ry="3" fill="url(#' + id + 'hl)" opacity=".16" transform="rotate(22 63 27.5)"/>';
    var strands = '<path d="M31.5 30 C34.5 22.5 41 18.4 48 17.6 M69 31 C67 25 63 21.4 58 19.6" fill="none" stroke="' + hl + '" stroke-width=".7" stroke-linecap="round" opacity=".5"/>';
    return sheen + (FINE ? strands : '');
  }

  // ---- eyes -------------------------------------------------------------
  // Built as an eye, not a symbol: socket shadow, almond opening, an
  // eyeball that is a sphere (lid shadow across the top), an iris with
  // fibres and a limbal ring, a lash line that thickens toward the outer
  // corner, a lit lower lid, and a tear duct. One unit serves the static
  // face and the talking face, so they can never drift apart.
  var eyeSeq = 0;
  function eyeStyle(kind) {
    switch (kind) {
      case 0: return { open: 0.62, w: 4.0, tilt: 0, lash: 1.3 };   // chill
      case 2: return { open: 0.42, w: 4.2, tilt: 0, lash: 1.5 };   // relaxed
      case 3: return { open: 0.82, w: 4.5, tilt: 4, lash: 1.9 };   // locked in
      default: return { open: 1, w: 4.4, tilt: 0, lash: 1.5 };     // bright
    }
  }
  function eyeUnit(id, cx, st, irisCol, gx, gy) {
    var ink = '#241b18', y = 45, w = st.w, open = st.open;
    var inner = cx < 50 ? 1 : -1;           // +1 means the inner corner is to the right
    var upper = 3.0 * open + 0.25, lower = 1.5 + 1.0 * open;
    var xo = cx - w * inner, xi = cx + w * inner;   // outer / inner corner x
    var tilt = (st.tilt || 0) * (cx < 50 ? 1 : -1);
    var eid = id + 'e' + (++eyeSeq);
    var almond = 'M' + xo.toFixed(2) + ' ' + (y - tilt * 0.12).toFixed(2) +
      ' C' + (cx - w * 0.55 * inner).toFixed(2) + ' ' + (y - upper - 0.5 - tilt * 0.3).toFixed(2) +
      ' ' + (cx + w * 0.45 * inner).toFixed(2) + ' ' + (y - upper + 0.1).toFixed(2) +
      ' ' + xi.toFixed(2) + ' ' + (y + 0.35 + tilt * 0.1).toFixed(2) +
      ' C' + (cx + w * 0.45 * inner).toFixed(2) + ' ' + (y + lower).toFixed(2) +
      ' ' + (cx - w * 0.5 * inner).toFixed(2) + ' ' + (y + lower).toFixed(2) +
      ' ' + xo.toFixed(2) + ' ' + (y - tilt * 0.12).toFixed(2) + ' Z';
    if (open < 0.16) {
      return '<path d="M' + (cx - w + 0.4) + ' ' + y + ' Q' + cx + ' ' + (y + 1.5) + ' ' + (cx + w - 0.4) + ' ' + y + '" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
             '<path d="M' + (cx - w + 0.8) + ' ' + (y + 1.6) + ' Q' + cx + ' ' + (y + 2.6) + ' ' + (cx + w - 0.8) + ' ' + (y + 1.4) + '" stroke="#fff" stroke-opacity=".22" stroke-width=".7" fill="none"/>';
    }
    var ix = (cx + (gx || 0)).toFixed(2), iy = (y + 0.4 + (gy || 0)).toFixed(2);
    var fibres = '';
    for (var f = 0; FINE && f < 8; f++) {
      var a = f * Math.PI / 4 + 0.4;
      fibres += '<path d="M' + (Number(ix) + Math.cos(a) * 0.85).toFixed(2) + ' ' + (Number(iy) + Math.sin(a) * 0.85).toFixed(2) +
                'L' + (Number(ix) + Math.cos(a) * 2.15).toFixed(2) + ' ' + (Number(iy) + Math.sin(a) * 2.15).toFixed(2) + '"/>';
    }
    return '<g>' +
      '<defs><clipPath id="' + eid + '"><path d="' + almond + '"/></clipPath></defs>' +
      '<path d="' + almond + '" fill="url(#' + id + 'sc)"/>' +
      '<g clip-path="url(#' + eid + ')">' +
      '<circle cx="' + ix + '" cy="' + iy + '" r="2.45" fill="url(#' + id + 'ir)"/>' +
      '<g stroke="' + shade(irisCol, -0.42) + '" stroke-width=".26" opacity=".5" fill="none">' + fibres + '</g>' +
      '<circle cx="' + ix + '" cy="' + iy + '" r="2.45" fill="none" stroke="' + shade(irisCol, -0.66) + '" stroke-width=".6"/>' +
      '<circle cx="' + ix + '" cy="' + iy + '" r="1.08" fill="#140d0c"/>' +
      '<ellipse cx="' + (Number(ix) - 0.95).toFixed(2) + '" cy="' + (Number(iy) - 1.05).toFixed(2) + '" rx=".82" ry=".68" fill="#fff" opacity=".95" transform="rotate(-25 ' + (Number(ix) - 0.95).toFixed(2) + ' ' + (Number(iy) - 1.05).toFixed(2) + ')"/>' +
      '<circle cx="' + (Number(ix) + 1.05).toFixed(2) + '" cy="' + (Number(iy) + 1.2).toFixed(2) + '" r=".38" fill="#fff" opacity=".55"/>' +
      (FINE ? '<ellipse cx="' + cx + '" cy="' + (y - upper - 0.9).toFixed(2) + '" rx="' + (w + 0.6).toFixed(2) + '" ry="2.5" fill="#2b1f1a" opacity=".30"/>' +
      '<ellipse cx="' + (cx + 0.6 * inner).toFixed(2) + '" cy="' + (y + lower + 0.5).toFixed(2) + '" rx="' + (w * 0.8).toFixed(2) + '" ry="1.2" fill="#fff" opacity=".22"/>' : '') +
      '</g>' +
      '<path d="M' + xo.toFixed(2) + ' ' + (y - tilt * 0.12).toFixed(2) +
        ' C' + (cx - w * 0.55 * inner).toFixed(2) + ' ' + (y - upper - 0.5 - tilt * 0.3).toFixed(2) +
        ' ' + (cx + w * 0.45 * inner).toFixed(2) + ' ' + (y - upper + 0.1).toFixed(2) +
        ' ' + xi.toFixed(2) + ' ' + (y + 0.35 + tilt * 0.1).toFixed(2) +
        '" fill="none" stroke="' + ink + '" stroke-width="' + st.lash + '" stroke-linecap="round"/>' +
      (FINE ? '<path d="M' + (xo + 0.5 * inner).toFixed(2) + ' ' + (y - upper - 2.1).toFixed(2) +
        ' Q' + cx.toFixed(2) + ' ' + (y - upper - 3.1).toFixed(2) + ' ' + (xi - 0.7 * inner).toFixed(2) + ' ' + (y - upper - 1.3).toFixed(2) +
        '" fill="none" stroke="#4a3730" stroke-opacity=".34" stroke-width=".85" stroke-linecap="round"/>' +
      '<path d="M' + (cx - w * 0.55 * inner).toFixed(2) + ' ' + (y + lower + 0.25).toFixed(2) +
        ' Q' + (cx + w * 0.2 * inner).toFixed(2) + ' ' + (y + lower + 0.85).toFixed(2) + ' ' + (xi - 0.5 * inner).toFixed(2) + ' ' + (y + lower - 0.35).toFixed(2) +
        '" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width=".7" stroke-linecap="round"/>' +
      '<circle cx="' + (xi - 0.35 * inner).toFixed(2) + '" cy="' + (y + 0.9).toFixed(2) + '" r=".55" fill="#c2827a" opacity=".55"/>' : '') +
      '</g>';
  }
  function eyesPath(kind, irisCol, id) {
    var st = eyeStyle(kind);
    irisCol = irisCol || IRIS[0];
    id = id || 'dbav0';
    var socket = '<ellipse cx="40" cy="44.6" rx="7" ry="5" fill="url(#' + id + 'sh)" opacity=".30"/>' +
                 '<ellipse cx="60" cy="44.6" rx="7" ry="5" fill="url(#' + id + 'sh)" opacity=".36"/>';
    return socket + eyeUnit(id, 40, st, irisCol, 0, 0) + eyeUnit(id, 60, st, irisCol, 0, 0);
  }

  // Brows are a filled, tapered shape with a couple of hairs over the top.
  // A single stroked arc reads as a cartoon; the taper is what makes it a brow.
  function browsPath(kind, browCol) {
    var ink = browCol || '#3a2c22', lit = shade(ink, 0.28);
    var rise = kind === 1 ? 1.9 : 0, inner = kind === 2 ? 1.5 : 0;
    function brow(s) {
      var f = function (x) { return (50 + (x - 50) * s).toFixed(2); };
      return '<g>' +
        '<path d="M' + f(35.2) + ' ' + (40.2 - rise).toFixed(2) +
        ' C' + f(37.4) + ' ' + (36.9 - rise).toFixed(2) + ' ' + f(41.8) + ' ' + (35.8 - rise).toFixed(2) + ' ' + f(45.1) + ' ' + (37.6 - rise + inner).toFixed(2) +
        ' L' + f(44.7) + ' ' + (38.9 - rise + inner).toFixed(2) +
        ' C' + f(41.6) + ' ' + (37.6 - rise).toFixed(2) + ' ' + f(38.2) + ' ' + (38.6 - rise).toFixed(2) + ' ' + f(36.4) + ' ' + (41.1 - rise).toFixed(2) + ' Z" fill="' + ink + '"/>' +
        (FINE ? '<path d="M' + f(37.4) + ' ' + (38.6 - rise).toFixed(2) + ' L' + f(39.2) + ' ' + (37.5 - rise).toFixed(2) +
        ' M' + f(40.4) + ' ' + (37.4 - rise).toFixed(2) + ' L' + f(42.2) + ' ' + (36.8 - rise).toFixed(2) +
        '" stroke="' + lit + '" stroke-width=".6" stroke-linecap="round" opacity=".7"/>' : '') +
        '</g>';
    }
    return brow(1) + brow(-1);
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

  // ---- mouth ------------------------------------------------------------
  // Two lips, not one line: an upper lip that faces away from the light and
  // stays darker, a lower lip that catches it, a philtrum, corner shadows
  // and a shelf of shadow underneath. lipsUnit is shared with the talking
  // face so a live avatar and a still avatar have the same mouth.
  function lipsUnit(id, open, lift, asym, shape) {
    var cx = 50, y = 58, hw = 5.9 + (shape || 0) * 0.9;
    open = open || 0;
    lift = lift || 0;
    asym = asym || 0;
    var up = '#a35c53', low = '#c47a6d', lit = '#dda294', dark = '#6b2f2a';
    var lY = y - lift, rY = y - lift - asym;
    var drop = open * 4.4;
    var upperLip = 'M' + (cx - hw) + ' ' + lY.toFixed(2) +
      ' C' + (cx - 4.3) + ' ' + (y - 2.1 - open * 0.9).toFixed(2) + ' ' + (cx - 2.5) + ' ' + (y - 2.5 - open * 1.1).toFixed(2) + ' ' + (cx - 1.05) + ' ' + (y - 1.4 - open * 0.9).toFixed(2) +
      ' C' + (cx - 0.45) + ' ' + (y - 0.85 - open * 0.8).toFixed(2) + ' ' + (cx + 0.45) + ' ' + (y - 0.85 - open * 0.8).toFixed(2) + ' ' + (cx + 1.05) + ' ' + (y - 1.4 - open * 0.9).toFixed(2) +
      ' C' + (cx + 2.5) + ' ' + (y - 2.5 - open * 1.1).toFixed(2) + ' ' + (cx + 4.3) + ' ' + (y - 2.1 - open * 0.9).toFixed(2) + ' ' + (cx + hw) + ' ' + rY.toFixed(2) +
      ' C' + (cx + 3) + ' ' + (y + 0.2).toFixed(2) + ' ' + (cx - 3) + ' ' + (y + 0.2).toFixed(2) + ' ' + (cx - hw) + ' ' + lY.toFixed(2) + ' Z';
    var lowerLip = 'M' + (cx - hw) + ' ' + lY.toFixed(2) +
      ' C' + (cx - 3) + ' ' + (y + 0.5 + drop * 0.35).toFixed(2) + ' ' + (cx + 3) + ' ' + (y + 0.5 + drop * 0.35).toFixed(2) + ' ' + (cx + hw) + ' ' + rY.toFixed(2) +
      ' C' + (cx + 4.6) + ' ' + (y + 3.5 + drop).toFixed(2) + ' ' + (cx + 2.3) + ' ' + (y + 4.6 + drop).toFixed(2) + ' ' + cx + ' ' + (y + 4.6 + drop).toFixed(2) +
      ' C' + (cx - 2.3) + ' ' + (y + 4.6 + drop).toFixed(2) + ' ' + (cx - 4.6) + ' ' + (y + 3.5 + drop).toFixed(2) + ' ' + (cx - hw) + ' ' + lY.toFixed(2) + ' Z';
    var cavity = open > 0.05
      ? '<path d="M' + (cx - hw + 0.9) + ' ' + ((lY + rY) / 2).toFixed(2) +
        ' C' + (cx - 3) + ' ' + (y - 1.1 - open * 1.4).toFixed(2) + ' ' + (cx + 3) + ' ' + (y - 1.1 - open * 1.4).toFixed(2) + ' ' + (cx + hw - 0.9) + ' ' + ((lY + rY) / 2).toFixed(2) +
        ' C' + (cx + 3.4) + ' ' + (y + 1.4 + drop * 0.9).toFixed(2) + ' ' + (cx - 3.4) + ' ' + (y + 1.4 + drop * 0.9).toFixed(2) + ' ' + (cx - hw + 0.9) + ' ' + ((lY + rY) / 2).toFixed(2) + ' Z" fill="' + dark + '"/>' +
        (open > 0.3 ? '<path d="M' + (cx - hw + 1.6) + ' ' + (y - 0.9 - open * 1.1).toFixed(2) + ' Q' + cx + ' ' + (y - 1.9 - open * 1.3).toFixed(2) + ' ' + (cx + hw - 1.6) + ' ' + (y - 0.9 - open * 1.1).toFixed(2) + ' Z" fill="#f7f1ec" opacity=".95"/>' : '') +
        (open > 0.55 ? '<path d="M' + (cx - 2.6) + ' ' + (y + 1.2).toFixed(2) + ' Q' + cx + ' ' + (y + 2.4 + drop * 0.6).toFixed(2) + ' ' + (cx + 2.6) + ' ' + (y + 1.2).toFixed(2) + ' Z" fill="#c07268" opacity=".85"/>' : '')
      : '';
    return '<g>' +
      (FINE ? '<path d="M48.8 54.9 L48.5 56.4 M51.2 54.9 L51.5 56.4" stroke="#fff" stroke-opacity=".15" stroke-width=".8" stroke-linecap="round"/>' : '') +
      (FINE ? '<ellipse cx="50" cy="' + (y + 6.4 + drop * 0.8).toFixed(2) + '" rx="4.8" ry="1.7" fill="url(#' + id + 'sh)" opacity=".38"/>' : '') +
      '<path d="' + lowerLip + '" fill="' + low + '"/>' +
      (FINE ? '<path d="M' + (cx - 3.6) + ' ' + (y + 2 + drop * 0.5).toFixed(2) + ' Q' + cx + ' ' + (y + 3.4 + drop * 0.6).toFixed(2) + ' ' + (cx + 3.6) + ' ' + (y + 2 + drop * 0.5).toFixed(2) + '" fill="none" stroke="' + lit + '" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>' : '') +
      cavity +
      '<path d="' + upperLip + '" fill="' + up + '"/>' +
      '<path d="M' + (cx - hw) + ' ' + lY.toFixed(2) + ' C' + (cx - 3) + ' ' + (y + 0.35).toFixed(2) + ' ' + (cx + 3) + ' ' + (y + 0.35).toFixed(2) + ' ' + (cx + hw) + ' ' + rY.toFixed(2) + '" fill="none" stroke="' + dark + '" stroke-width=".8" stroke-linecap="round" opacity=".55"/>' +
      (FINE ? '<circle cx="' + (cx - hw) + '" cy="' + lY.toFixed(2) + '" r=".85" fill="' + dark + '" opacity=".45"/>' +
      '<circle cx="' + (cx + hw) + '" cy="' + rY.toFixed(2) + '" r=".85" fill="' + dark + '" opacity=".5"/>' : '') +
      '</g>';
  }
  function mouthPath(kind, id) {
    id = id || 'dbav0';
    switch (kind) {
      case 0: return lipsUnit(id, 0, 0, 0, 0);         // neutral
      case 1: return lipsUnit(id, 0.30, 1.5, 0, 0.7);  // smile
      case 2: return lipsUnit(id, 0.06, 0.2, 1.7, 0.2);// smirk
      case 3: return lipsUnit(id, 0, -0.9, 0, -0.2);   // set / serious
      case 4: return lipsUnit(id, 0.82, 0.4, 0, 0.3);  // open
    }
    return lipsUnit(id, 0, 0, 0, 0);
  }

  function facialPath(kind, hairCol) {
    // Follows the SKULL jawline: sides at x31.5/68.5 by y50, chin at y69.4.
    switch (kind) {
      case 0: return '';
      case 1: // light stubble
        return '<path d="M31.6 50 C31.6 62 39 69.4 50 69.4 C61 69.4 68.4 62 68.4 50 C65.4 60.4 58.4 64.6 50 64.6 C41.6 64.6 34.6 60.4 31.6 50 Z" fill="' + shade(hairCol, -0.08) + '" opacity=".22"/>' +
               '<path d="M44 55.6 Q50 53.6 56 55.6" stroke="' + shade(hairCol, -0.04) + '" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".3"/>';
      case 2: // mustache
        return '<path d="M43.4 55.8 Q50 53 56.6 55.8 Q52 58.4 50 57.8 Q48 58.4 43.4 55.8 Z" fill="' + shade(hairCol, -0.04) + '"/>' +
               '<path d="M45 55.4 Q50 53.9 55 55.4" stroke="' + shade(hairCol, 0.22) + '" stroke-width=".6" fill="none" opacity=".5"/>';
      case 3: // short beard (trim, young)
        return '<path d="M31.8 49 C31.8 62 39.4 70 50 70 C60.6 70 68.2 62 68.2 49 C65.6 59 61 61.4 60.4 57.6 C56.4 61.6 43.6 61.6 39.6 57.6 C39 61.4 34.4 59 31.8 49 Z" fill="' + hairCol + '"/>' +
               '<path d="M43.4 55.8 Q50 53.2 56.6 55.8 Q52 58 50 57.6 Q48 58 43.4 55.8 Z" fill="' + shade(hairCol, -0.1) + '"/>' +
               '<path d="M36.5 57 C38.5 63 43.5 66.4 50 66.4 C56.5 66.4 61.5 63 63.5 57" fill="none" stroke="' + shade(hairCol, 0.2) + '" stroke-width=".8" opacity=".35"/>';
    }
    return '';
  }

  function glassesPath(kind, id) {
    var c = '#22242c';
    id = id || 'dbav0';
    var gloss = '<path d="M35.4 49.4 L42.6 40.6 M56.4 49.4 L62 42.6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".22"/>';
    switch (kind) {
      case 0: return '';
      case 1: // thin round
        return '<g><ellipse cx="50" cy="51.4" rx="20" ry="2.6" fill="url(#' + id + 'sh)" opacity=".26"/>' +
          '<circle cx="40" cy="45" r="5.8" fill="#cfe0ef" opacity=".13"/><circle cx="60" cy="45" r="5.8" fill="#cfe0ef" opacity=".13"/>' + gloss +
          '<g fill="none" stroke="' + c + '" stroke-width="1.5"><circle cx="40" cy="45" r="5.8"/><circle cx="60" cy="45" r="5.8"/><path d="M45.8 44.4 Q50 43.2 54.2 44.4"/><path d="M34.2 44 L29.4 43" stroke-linecap="round"/><path d="M65.8 44 L70.6 43" stroke-linecap="round"/></g>' +
          '<circle cx="40" cy="45" r="5.8" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".5"/><circle cx="60" cy="45" r="5.8" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".5"/></g>';
      case 2: // bold square
        return '<g><ellipse cx="50" cy="52" rx="20" ry="2.6" fill="url(#' + id + 'sh)" opacity=".3"/>' +
          '<rect x="33.4" y="39.8" width="11.8" height="9.8" rx="2.5" fill="#cfe0ef" opacity=".13"/><rect x="54.8" y="39.8" width="11.8" height="9.8" rx="2.5" fill="#cfe0ef" opacity=".13"/>' + gloss +
          '<g fill="none" stroke="' + c + '" stroke-width="2"><rect x="33.4" y="39.8" width="11.8" height="9.8" rx="2.5"/><rect x="54.8" y="39.8" width="11.8" height="9.8" rx="2.5"/><path d="M45.2 43.6 Q50 42.4 54.8 43.6"/><path d="M33.4 42.6 L28.6 41.4" stroke-linecap="round"/><path d="M66.6 42.6 L71.4 41.4" stroke-linecap="round"/></g>' +
          '<path d="M33.4 40.4 h11.8 M54.8 40.4 h11.8" stroke="#fff" stroke-opacity=".26" stroke-width=".7" stroke-linecap="round"/></g>';
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
    setLod(size);
    var skinCol = SKIN[c.skin], hairCol = HAIR[c.hair], bgCol = BG[c.bg], outCol = OUTFIT[c.outfit];
    var skinShade = shade(skinCol, -0.24);
    var irisCol = IRIS[c.iris];
    var browCol = shade(hairCol, c.hair >= 4 ? -0.38 : -0.2); // light/dyed hair still needs readable brows
    var id = 'dbav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : size;
    var earring = (c.accessory === 3)
      ? '<g fill="none" stroke="#f0c14b" stroke-width="1.4"><circle cx="25.4" cy="55.4" r="2.2"/><circle cx="74.6" cy="55.4" r="2.2"/></g>' +
        '<circle cx="24.7" cy="54.7" r=".6" fill="#fff" opacity=".7"/><circle cx="73.9" cy="54.7" r=".6" fill="#fff" opacity=".7"/>'
      : '';

    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="avatar" style="display:block">' +
      '<defs>' + faceDefs(id, skinCol, bgCol, outCol, irisCol) + '</defs>' +
      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      '<path d="M-8 74 C18 28 59 8 111 30" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M-2 82 C23 57 62 49 108 65" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.2"/>' +
      '<circle cx="82" cy="22" r="2" fill="#fff" opacity=".5"/><circle cx="16" cy="66" r="1.2" fill="#fff" opacity=".32"/>' +
      '<g transform="translate(50 50) scale(1.10) translate(-50 -50)">' +
      hair.back +
      // torso: contact shadow, shaded hoodie, collar, the head's shadow on the chest
      '<ellipse cx="50" cy="79" rx="30" ry="7.5" fill="#170f0d" opacity=".24"/>' +
      '<path d="M11 103 C12 78 29.5 68.5 50 68.5 C70.5 68.5 88 78 89 103 Z" fill="url(#' + id + 'ot)"/>' +
      '<path d="M14 97 C17 79.5 31 71.5 50 71.5 C69 71.5 83 79.5 86 97" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.3"/>' +
      '<path d="M37.5 70 Q50 79.5 62.5 70 L64 74.6 Q50 85.5 36 74.6 Z" fill="' + shade(outCol, -0.3) + '"/>' +
      '<ellipse cx="50" cy="74.5" rx="14" ry="6.5" fill="url(#' + id + 'sh)" opacity=".5"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.26) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.26) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.26) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.26) + '"/>' +
      // neck: a cylinder with the jaw casting down onto it
      '<path d="M42.4 57 h15.2 v9.8 c0 6.2 -15.2 6.2 -15.2 0 Z" fill="' + skinShade + '"/>' +
      '<path d="M44.3 59.6 v7.4" stroke="#fff" stroke-opacity=".13" stroke-width="2.6" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="60.5" rx="9.5" ry="5" fill="url(#' + id + 'sh)" opacity=".7"/>' +
      // head
      (FINE ? '<g filter="url(#' + id + 'ds)">' : '<g>') + '<path d="' + SKULL + '" fill="url(#' + id + 'sk)"/></g>' +
      earsPath(skinCol) +
      earring +
      faceForm(id) +
      facialPath(c.facial, hairCol) +
      nosePath(skinCol) +
      detailPath(c.detail, skinCol) +
      browsPath(c.brows, browCol) +
      eyesPath(c.eyes, irisCol, id) +
      mouthPath(c.mouth, id) +
      hair.front +
      hairFinish(id, c.top, hairCol) +
      glassesPath(c.glasses, id) +
      accessoryOver(c.accessory, outCol) +
      '</g>' +
      '<rect width="100" height="100" fill="url(#' + id + 'vg)"/>' +
      '<circle cx="50" cy="50" r="48.8" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width=".8"/>' +
      '</g></svg>';
  }

  // ---- Talking avatar (live lip-sync + expressions) --------------------
  // Same face as svg(), but eyes / brows / mouth live in addressable
  // groups (.ta-eyes / .ta-brows / .ta-mouth) inside a .ta-face group so a
  // controller can animate them from live audio + coach state.
  // "SVG now, video later": the controller interface is backend-agnostic
  // (setState / setEmotion / setAmplitude / attachAudio / destroy), so a
  // photoreal video head can implement the same shape and drop in later.

  function talkingMouth(open, emotion, shape, id) {
    FINE = true; // the talking head is always rendered large
    var corner = emotion === 'encouraging' ? 1.5 : (emotion === 'pushing' ? -0.9 : 0);
    open = open < 0 ? 0 : open > 1 ? 1 : open;
    shape = shape == null ? 0.5 : (shape < 0 ? 0 : shape > 1 ? 1 : shape);
    // Shape follows spectral character: rounded vowels stay narrow, brighter
    // consonants pull the corners wider. Open follows actual waveform energy.
    return lipsUnit(id || 'tav0', open, corner, 0, (shape - 0.5) * 1.4);
  }

  function talkingEyes(openFrac, gx, gy, irisCol, id) {
    FINE = true; // the talking head is always rendered large
    id = id || 'tav0';
    var st = { open: openFrac, w: 4.4, tilt: 0, lash: 1.5 };
    irisCol = irisCol || IRIS[0];
    return '<ellipse cx="40" cy="44.6" rx="7" ry="5" fill="url(#' + id + 'sh)" opacity=".30"/>' +
           '<ellipse cx="60" cy="44.6" rx="7" ry="5" fill="url(#' + id + 'sh)" opacity=".36"/>' +
           eyeUnit(id, 40, st, irisCol, gx || 0, gy || 0) + eyeUnit(id, 60, st, irisCol, gx || 0, gy || 0);
  }

  function talkingBrows(raise, angle, browCol) {
    var ink = browCol || '#3a2c22', lit = shade(ink, 0.28);
    function brow(s) {
      var f = function (x) { return (50 + (x - 50) * s).toFixed(2); };
      var r = raise, a = angle;
      return '<g>' +
        '<path d="M' + f(35.2) + ' ' + (40.2 - r).toFixed(2) +
        ' C' + f(37.4) + ' ' + (36.9 - r).toFixed(2) + ' ' + f(41.8) + ' ' + (35.8 - r).toFixed(2) + ' ' + f(45.1) + ' ' + (37.6 - r + a).toFixed(2) +
        ' L' + f(44.7) + ' ' + (38.9 - r + a).toFixed(2) +
        ' C' + f(41.6) + ' ' + (37.6 - r).toFixed(2) + ' ' + f(38.2) + ' ' + (38.6 - r).toFixed(2) + ' ' + f(36.4) + ' ' + (41.1 - r).toFixed(2) + ' Z" fill="' + ink + '"/>' +
        '<path d="M' + f(37.4) + ' ' + (38.6 - r).toFixed(2) + ' L' + f(39.2) + ' ' + (37.5 - r).toFixed(2) +
        ' M' + f(40.4) + ' ' + (37.4 - r).toFixed(2) + ' L' + f(42.2) + ' ' + (36.8 - r).toFixed(2) +
        '" stroke="' + lit + '" stroke-width=".6" stroke-linecap="round" opacity=".7"/>' +
        '</g>';
    }
    return brow(1) + brow(-1);
  }

  // A near-copy of svg() with the animatable parts in named groups and the
  // head-and-up wrapped in .ta-face (so head bob / tilt transforms apply).
  function talkingSvg(config, size) {
    var c = norm(config);
    var skinCol = SKIN[c.skin], hairCol = HAIR[c.hair], bgCol = BG[c.bg], outCol = OUTFIT[c.outfit];
    var skinShade = shade(skinCol, -0.24);
    var irisCol = IRIS[c.iris];
    var browCol = shade(hairCol, c.hair >= 4 ? -0.38 : -0.2); // light/dyed hair still needs readable brows
    var id = 'tav' + (++uid);
    var hair = hairPaths(c.top, hairCol);
    var sz = (size === '100%') ? '100%' : (size || 200);
    setLod(sz);
    var earring = (c.accessory === 3)
      ? '<g fill="none" stroke="#f0c14b" stroke-width="1.4"><circle cx="25.4" cy="55.4" r="2.2"/><circle cx="74.6" cy="55.4" r="2.2"/></g>'
      : '';
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="talking avatar" data-av-id="' + id + '" style="display:block">' +
      '<defs>' + faceDefs(id, skinCol, bgCol, outCol, irisCol) + '</defs>' +
      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      '<path d="M9 69 C24 31 58 9 91 28" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M12 76 C34 52 57 45 90 58" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="2" stroke-linecap="round"/>' +
      hair.back +
      '<ellipse cx="50" cy="79" rx="31" ry="8" fill="#170f0d" opacity=".2"/>' +
      '<path d="M11 103 C12 78 29.5 68.5 50 68.5 C70.5 68.5 88 78 89 103 Z" fill="url(#' + id + 'ot)"/>' +
      '<path d="M14 97 C17 79.5 31 71.5 50 71.5 C69 71.5 83 79.5 86 97" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.3"/>' +
      '<path d="M37.5 70 Q50 79.5 62.5 70 L64 74.6 Q50 85.5 36 74.6 Z" fill="' + shade(outCol, -0.3) + '"/>' +
      '<ellipse cx="50" cy="74.5" rx="14" ry="6.5" fill="url(#' + id + 'sh)" opacity=".5"/>' +
      '<path d="M47 77 L46 90" stroke="' + shade(outCol, 0.26) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M53 77 L54 90" stroke="' + shade(outCol, 0.26) + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="46" cy="90.5" r="1.5" fill="' + shade(outCol, 0.26) + '"/><circle cx="54" cy="90.5" r="1.5" fill="' + shade(outCol, 0.26) + '"/>' +
      '<g class="ta-face">' +
      '<path d="M42.4 57 h15.2 v9.8 c0 6.2 -15.2 6.2 -15.2 0 Z" fill="' + skinShade + '"/>' +
      '<ellipse cx="50" cy="60.5" rx="9.5" ry="5" fill="url(#' + id + 'sh)" opacity=".7"/>' +
      (FINE ? '<g filter="url(#' + id + 'ds)">' : '<g>') + '<path d="' + SKULL + '" fill="url(#' + id + 'sk)"/></g>' +
      earsPath(skinCol) +
      earring +
      faceForm(id) +
      facialPath(c.facial, hairCol) +
      nosePath(skinCol) +
      detailPath(c.detail, skinCol) +
      '<g class="ta-brows">' + talkingBrows(0, 0, browCol) + '</g>' +
      '<g class="ta-eyes">' + talkingEyes(1, 0, 0, irisCol, id) + '</g>' +
      '<g class="ta-mouth">' + talkingMouth(0, 'neutral', 0.5, id) + '</g>' +
      hair.front +
      hairFinish(id, c.top, hairCol) +
      glassesPath(c.glasses, id) +
      accessoryOver(c.accessory, outCol) +
      '</g>' +
      '<rect width="100" height="100" fill="url(#' + id + 'vg)"/>' +
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
    // The gradient ids are minted per render, and the animated parts are
    // re-rendered by this controller, so it has to reuse the same ids or the
    // eyes and mouth lose every soft shadow the moment the face moves.
    var gid = (svgEl && svgEl.getAttribute('data-av-id')) || 'tav0';
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
      if (mk !== lastMouth) { mouthEl.innerHTML = talkingMouth(mo, emo, mouthShape, gid); lastMouth = mk; }

      var eyeOpen = 1;
      if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
      if (blinkStart >= 0) {
        var bt = (now - blinkStart) / 120;
        if (bt >= 1) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 3800; eyeOpen = 1; }
        else eyeOpen = bt < 0.5 ? 1 - bt * 2 : (bt - 0.5) * 2;
      }
      var g = gaze();
      var ek = Math.round(eyeOpen * 10) + '|' + g.x + '|' + g.y;
      if (ek !== lastEyes) { eyesEl.innerHTML = talkingEyes(eyeOpen, g.x, g.y, mIris, gid); lastEyes = ek; }

      var bp = browParams();
      var bk = bp.raise + '|' + bp.angle;
      if (bk !== lastBrows) { browsEl.innerHTML = talkingBrows(bp.raise, bp.angle, mBrow); lastBrows = bk; }

      var breathe = reduce ? 0 : Math.sin(t * 1.15) * 0.5;
      var bob = reduce ? 0 : (state === 'talking' ? -amp * 2.25 : Math.sin(t * 1.7) * 0.24);
      var tx = reduce ? 0 : (state === 'listening' ? 0.6 + Math.sin(t * 1.3) * 0.18 : (state === 'thinking' ? -0.6 : Math.sin(t * 1.1) * 0.14));
      var rot = reduce ? 0 : (state === 'thinking' ? -2.4 : (state === 'listening' ? 1.4 : (state === 'talking' ? Math.sin(t * 5.4) * 1.05 : Math.sin(t * 1.2) * 0.45)));
      faceEl.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + (breathe + bob).toFixed(2) + ') rotate(' + rot.toFixed(2) + ' 50 60) translate(50 60) scale(' + faceScale.toFixed(2) + ') translate(-50 -60)');

      // Park the chain while the tab is hidden or the avatar is offscreen;
      // onVis / the IntersectionObserver restart it. FFT + innerHTML writes
      // every frame are pure waste when nothing is painted.
      if (document.hidden || !inView) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    var inView = true;
    function wake() { if (running && !raf && !document.hidden && inView) raf = requestAnimationFrame(frame); }
    function onVis() { if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else wake(); }
    document.addEventListener('visibilitychange', onVis);
    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        inView = !!(entries[0] && entries[0].isIntersecting);
        if (!inView) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else wake();
      }, { rootMargin: '80px' });
      io.observe(container);
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
      destroy: function () { running = false; if (raf) cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); if (io) { try { io.disconnect(); } catch (e) {} } this.detachAudio(); if (container) container.innerHTML = ''; }
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
      if (!raw) {
        raw = global.localStorage.getItem(LEGACY_STORE_KEY);
        if (raw) {
          global.localStorage.setItem(STORE_KEY, raw);
          global.localStorage.removeItem(LEGACY_STORE_KEY);
        }
      }
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
    try { global.localStorage.removeItem(LEGACY_STORE_KEY); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(EVT, { detail: null })); } catch (e) {}
  }

  // ---- live identity ---------------------------------------------------
  // The camera avatar has a different renderer, but its compact design is
  // also the strongest public identity for profile, leaderboard, match,
  // ballot, and share surfaces. This SVG is deliberately static and tiny.
  // It contains no camera pixels or landmarks.
  function inList(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }
  function normLiveDesign(d) {
    d = d || {};
    return {
      scene: inList(d.scene, LIVE_SCENES, 'arena'),
      accent: Object.prototype.hasOwnProperty.call(LIVE_ACCENTS, d.accent) ? d.accent : 'crimson',
      outfit: Object.prototype.hasOwnProperty.call(LIVE_OUTFITS, d.outfit) ? d.outfit : 'ink',
      mask: inList(d.mask, LIVE_MASKS, 'blade'),
      eyes: Object.prototype.hasOwnProperty.call(LIVE_EYES, d.eyes) ? d.eyes : 'focus'
    };
  }
  function getLiveIdentity() {
    try {
      var raw = global.localStorage.getItem(LIVE_STORE_KEY);
      if (!raw) return null;
      var design = normLiveDesign(JSON.parse(raw));
      var lookName = 'My avatar';
      var lookId = '';
      try {
        var state = JSON.parse(global.localStorage.getItem(LIVE_LOOKS_KEY) || '{}');
        var looks = Array.isArray(state.looks) ? state.looks : [];
        var active = looks.filter(function (look) { return look && look.id === state.activeId; })[0];
        if (active) { lookName = String(active.name || lookName).slice(0, 32); lookId = String(active.id || '').slice(0, 64); }
      } catch (e) {}
      return { kind:'live', name:lookName, lookId:lookId, design:design };
    } catch (e) { return null; }
  }
  function getPublicIdentity() {
    var live = getLiveIdentity();
    if (live) return live;
    var portrait = getUser();
    return portrait ? { kind:'portrait', config:portrait } : null;
  }
  function normPublicIdentity(value) {
    value = value || {};
    if (value.kind === 'live' && value.design) {
      return { kind:'live', name:String(value.name || 'Avatar').slice(0,32), lookId:String(value.lookId || '').slice(0,64), design:normLiveDesign(value.design) };
    }
    if (value.kind === 'portrait' && value.config) return { kind:'portrait', config:norm(value.config) };
    return null;
  }
  // ---- live identity mask ----------------------------------------------
  // The compact, static twin of the camera mask (js/cam-avatar.js). It rides
  // profile, leaderboard, match and ballot surfaces, so it is the version of
  // a debater's identity most people actually see. It is lit exactly like
  // the canvas one: warm key upper left, accent rim down the shadow side,
  // and the same soft brushes for the planes of the head. Two reusable brush
  // gradients carry all of it, so there are no SVG filters here either.
  function maskScene(design, accent, id) {
    var sky = '<rect width="100" height="100" fill="url(#' + id + 'sky)"/>';
    var floor = '<ellipse cx="50" cy="92" rx="62" ry="26" fill="' + accent + '" opacity=".13"/>';
    if (design.scene === 'skyline') {
      return sky +
        '<g fill="#0a101d" opacity=".85"><path d="M0 62h9v38H0zM12 55h11v45H12zM26 66h8v34h-8zM38 49h13v51H38zM54 60h9v40h-9zM66 44h12v56H66zM81 58h8v42h-8zM92 51h8v49h-8z"/></g>' +
        '<g fill="#141d2e"><path d="M4 70h7v30H4zM17 64h9v36h-9zM41 58h9v42h-9zM69 54h8v46h-8zM94 60h6v40h-6z"/></g>' +
        '<g fill="' + accent + '" opacity=".55"><path d="M6 74h2.4v3H6zM19 68h2.4v3H19zM43 62h2.4v3H43zM47 70h2.4v3H47zM71 58h2.4v3H71zM71 66h2.4v3H71zM95 64h2.4v3H95zM29 72h2.4v3H29z"/></g>' +
        '<g fill="#f0ede6" opacity=".3"><path d="M14 60h2v2.4h-2zM57 66h2v2.4h-2zM84 63h2v2.4h-2z"/></g>' + floor;
    }
    if (design.scene === 'library') {
      return sky +
        '<g fill="#1a0f0b"><rect x="0" y="8" width="27" height="70"/><rect x="73" y="8" width="27" height="70"/></g>' +
        '<g fill="#5a3524"><rect x="0" y="27" width="27" height="2.6"/><rect x="0" y="48" width="27" height="2.6"/><rect x="0" y="69" width="27" height="2.6"/><rect x="73" y="27" width="27" height="2.6"/><rect x="73" y="48" width="27" height="2.6"/><rect x="73" y="69" width="27" height="2.6"/></g>' +
        '<g><rect x="3" y="16" width="3.4" height="11" fill="#6b3f2c"/><rect x="7.4" y="14" width="3" height="13" fill="' + accent + '" opacity=".6"/><rect x="11.4" y="17" width="3.6" height="10" fill="#2b3a40"/><rect x="16" y="15" width="3" height="12" fill="#6b3f2c"/><rect x="20" y="18" width="3.4" height="9" fill="#43302a"/>' +
        '<rect x="76" y="37" width="3.2" height="11" fill="#6b3f2c"/><rect x="80" y="39" width="3" height="9" fill="' + accent + '" opacity=".55"/><rect x="84" y="36" width="3.4" height="12" fill="#2b3a40"/><rect x="88.4" y="38" width="3" height="10" fill="#6b3f2c"/></g>' +
        '<ellipse cx="18" cy="30" rx="26" ry="24" fill="#ffd18f" opacity=".1"/>' + floor;
    }
    if (design.scene === 'studio') {
      return sky +
        '<g opacity=".5"><path d="M12 0 L34 100 H24 L6 0Z" fill="' + accent + '" opacity=".16"/><path d="M88 0 L66 100 H76 L94 0Z" fill="#b4dcff" opacity=".10"/></g>' +
        '<rect x="17" y="12" width="66" height="50" fill="none" stroke="' + accent + '" stroke-width="1.6" opacity=".38"/>' +
        '<g fill="#f0ede6" opacity=".07"><rect x="0" y="0" width="9" height="72"/><rect x="22" y="0" width="9" height="72"/><rect x="69" y="0" width="9" height="72"/><rect x="91" y="0" width="9" height="72"/></g>' + floor;
    }
    if (design.scene === 'orbit') {
      return sky +
        '<g fill="#f0ede6"><circle cx="12" cy="16" r="1.1" opacity=".8"/><circle cx="29" cy="8" r=".7" opacity=".5"/><circle cx="44" cy="20" r=".6" opacity=".45"/><circle cx="63" cy="12" r=".8" opacity=".6"/><circle cx="8" cy="38" r=".7" opacity=".45"/><circle cx="24" cy="30" r=".5" opacity=".4"/><circle cx="93" cy="34" r=".9" opacity=".55"/><circle cx="76" cy="6" r=".6" opacity=".45"/></g>' +
        '<circle cx="80" cy="20" r="13" fill="url(#' + id + 'pl)"/>' +
        '<ellipse cx="80" cy="20" rx="19" ry="5.4" fill="none" stroke="#f0ede6" stroke-width="1.1" opacity=".26" transform="rotate(-16 80 20)"/>' + floor;
    }
    if (design.scene === 'forest') {
      return sky +
        '<circle cx="79" cy="17" r="9.5" fill="#dbe7df" opacity=".22"/>' +
        '<g fill="#0a1a18"><path d="M-4 84l16-40 16 40zM20 88l17-46 17 46zM56 86l16-44 16 44zM78 90l15-38 15 38z"/></g>' +
        '<g fill="#061110"><path d="M6 92l12-30 12 30zM44 94l13-32 13 32zM86 92l12-28 12 28z"/></g>' + floor;
    }
    if (design.scene === 'chamber') {
      return sky +
        '<rect width="100" height="30" fill="#0a0604" opacity=".55"/>' +
        '<g fill="#301f13"><path d="M-6 44Q50 28 106 44v9Q50 37 -6 53Z"/><path d="M-6 58Q50 42 106 58v9Q50 51 -6 67Z"/><path d="M-6 72Q50 56 106 72v10Q50 65 -6 82Z"/></g>' +
        '<g fill="none" stroke="' + accent + '" stroke-width=".9" opacity=".22"><path d="M-6 44Q50 28 106 44M-6 58Q50 42 106 58M-6 72Q50 56 106 72"/></g>' +
        '<ellipse cx="50" cy="12" rx="40" ry="22" fill="#ffd696" opacity=".1"/>' + floor;
    }
    if (design.scene === 'neon') {
      return sky +
        '<g><rect x="7" y="8" width="1.8" height="18" fill="' + accent + '" opacity=".7"/><rect x="5" y="8" width="6" height="18" fill="' + accent + '" opacity=".14"/>' +
        '<rect x="90" y="16" width="1.8" height="14" fill="#78dcff" opacity=".6"/><rect x="88" y="16" width="6" height="14" fill="#78dcff" opacity=".12"/>' +
        '<rect x="17" y="30" width="1.6" height="11" fill="#78dcff" opacity=".5"/><rect x="80" y="6" width="1.6" height="13" fill="' + accent + '" opacity=".6"/></g>' +
        '<path d="M0 70h100" stroke="' + accent + '" stroke-width="1.4" opacity=".3"/>' +
        '<g opacity=".22"><rect x="12" y="76" width="24" height="2.6" fill="' + accent + '"/><rect x="62" y="84" width="26" height="2.6" fill="#78dcff"/><rect x="30" y="92" width="22" height="2.6" fill="' + accent + '"/></g>' + floor;
    }
    if (design.scene === 'void') {
      return sky + '<ellipse cx="50" cy="46" rx="46" ry="42" fill="' + accent + '" opacity=".07"/>' + floor;
    }
    return sky +
      '<g fill="none" stroke="' + accent + '" opacity=".2"><circle cx="50" cy="46" r="40"/><circle cx="50" cy="46" r="30"/></g>' +
      '<g fill="none" stroke="#f0ede6" opacity=".07"><path d="M0 82h100M10 100l40-18 40 18M28 100l22-16 22 16"/></g>' + floor;
  }
  function maskShape(design) {
    if (design.mask === 'classic') return 'M22 38C25 27 39 27 50 36c11-9 25-9 28 2-2 14-16 16-28 6-12 10-26 8-28-6Z';
    if (design.mask === 'visor') return 'M20 31Q50 23 80 31l-4 18q-16 7-26-2-10 9-26 2Z';
    if (design.mask === 'wing') return 'M14 26q16 10 27 10 5 0 9 4 4-4 9-4 11 0 27-10-3 20-11 24-8 4-16-4-4-4-9 1-5-5-9-1-8 8-16 4-8-4-11-24Z';
    if (design.mask === 'oni') return 'M21 37 27 6 34 33 50 40 66 33 73 6 79 37 74 52 55 47 50 44 45 47 26 52Z';
    if (design.mask === 'plate') return 'M18 32Q50 21 82 32q3 18-6 30-8-5-13-7-6 4-13 4t-13-4q-5 2-13 7-9-12-6-30Z';
    if (design.mask === 'slim') return 'M18 35Q50 30 82 35l-1 11Q50 51 19 46Z';
    return 'M23 37q10-16 26-5l1 3 1-3q16-11 26 5l-4 13q-12 7-22-3h-2q-10 10-22 3Z';
  }
  // Head with a jaw, matching the sculpted canvas mask. Cranium 28..72,
  // cheekbone at y44, jaw angle y58, chin y75.
  var MASK_HEAD = 'M50 14.2 C63.6 14.2 71.6 21.6 72 33.4 C72.4 43 71.6 49.6 69.6 55.6 C67.6 61.6 63.4 68.4 56.6 72.6 C54.2 74.1 52 74.6 50 74.6 C48 74.6 45.8 74.1 43.4 72.6 C36.6 68.4 32.4 61.6 30.4 55.6 C28.4 49.6 27.6 43 28 33.4 C28.4 21.6 36.4 14.2 50 14.2 Z';
  function maskSvg(input, size) {
    var design = normLiveDesign(input);
    var accent = LIVE_ACCENTS[design.accent];
    var outfit = LIVE_OUTFITS[design.outfit];
    var id = 'dbmask' + (++maskSeq);
    var eyeSpec = LIVE_EYES[design.eyes] || LIVE_EYES.focus;
    var eyeRy = eyeSpec[0];
    var eyeRot = eyeSpec[1];
    var sz = size == null ? 100 : size;
    var head = '#1b1b1f';
    var fine = !(typeof sz === 'number' && sz <= 54);
    function eye(cx, rot) {
      var lidY = 39 - eyeRy;
      return '<g transform="rotate(' + rot + ' ' + cx + ' 39)">' +
        '<ellipse cx="' + cx + '" cy="39" rx="8.4" ry="' + (eyeRy + 2.4) + '" fill="url(#' + id + 'sh)" opacity=".85"/>' +
        '<ellipse cx="' + cx + '" cy="39" rx="6.2" ry="' + eyeRy + '" fill="url(#' + id + 'sc)"/>' +
        '<circle cx="' + cx + '" cy="39.3" r="' + Math.min(3.1, eyeRy * 0.92) + '" fill="url(#' + id + 'ir)"/>' +
        '<circle cx="' + cx + '" cy="39.3" r="' + Math.min(1.5, eyeRy * 0.44) + '" fill="#0b0b0c"/>' +
        '<circle cx="' + (cx - 1.1) + '" cy="' + (39.3 - 1.1) + '" r=".95" fill="#fff" opacity=".95"/>' +
        (fine ? '<circle cx="' + (cx + 1.3) + '" cy="' + (39.3 + 1.2) + '" r=".45" fill="#fff" opacity=".5"/>' +
          '<path d="M' + (cx - 5.6) + ' ' + (lidY + 0.9) + ' Q' + cx + ' ' + (lidY - 1.5) + ' ' + (cx + 5.6) + ' ' + (lidY + 0.9) + '" fill="none" stroke="#0b0b0c" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>' +
          '<path d="M' + (cx - 4.4) + ' ' + (39 + eyeRy * 0.72) + ' Q' + cx + ' ' + (39 + eyeRy + 1.1) + ' ' + (cx + 4.4) + ' ' + (39 + eyeRy * 0.72) + '" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".3"/>' : '') +
        '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="avatar" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<clipPath id="' + id + 'hc"><path d="' + MASK_HEAD + '"/></clipPath>' +
      '<clipPath id="' + id + 'mc"><path d="' + maskShape(design) + '"/></clipPath>' +
      '<radialGradient id="' + id + 'sky" cx="34%" cy="20%" r="92%"><stop offset="0%" stop-color="' + shade(outfit[0], 0.16) + '"/><stop offset="52%" stop-color="' + outfit[1] + '"/><stop offset="100%" stop-color="#050508"/></radialGradient>' +
      '<linearGradient id="' + id + 'hd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + shade(head, 0.5) + '"/><stop offset="45%" stop-color="' + shade(head, 0.08) + '"/><stop offset="100%" stop-color="' + shade(head, -0.62) + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'hl"><stop offset="0%" stop-color="#fff8ee" stop-opacity=".8"/><stop offset="55%" stop-color="#fff8ee" stop-opacity=".26"/><stop offset="100%" stop-color="#fff8ee" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'sh"><stop offset="0%" stop-color="#000" stop-opacity=".72"/><stop offset="55%" stop-color="#000" stop-opacity=".28"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'rim" x1=".3" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + accent + '" stop-opacity="0"/><stop offset="46%" stop-color="' + accent + '" stop-opacity="0"/><stop offset="100%" stop-color="#fff" stop-opacity=".8"/></linearGradient>' +
      '<linearGradient id="' + id + 'm" x1="0" y1="0" x2=".85" y2="1"><stop offset="0%" stop-color="' + shade(accent, -0.36) + '"/><stop offset="34%" stop-color="' + shade(accent, 0.18) + '"/><stop offset="66%" stop-color="' + shade(accent, -0.04) + '"/><stop offset="100%" stop-color="' + shade(accent, -0.42) + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'ho" x1=".2" y1="0" x2=".9" y2="1"><stop offset="0%" stop-color="' + shade(outfit[0], 0.22) + '"/><stop offset="55%" stop-color="' + outfit[0] + '"/><stop offset="100%" stop-color="' + outfit[1] + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'ir" cx="50%" cy="66%" r="62%"><stop offset="0%" stop-color="' + shade(accent, 0.4) + '"/><stop offset="52%" stop-color="' + shade(accent, -0.3) + '"/><stop offset="100%" stop-color="#0b0b0c"/></radialGradient>' +
      '<linearGradient id="' + id + 'sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a49a92"/><stop offset="36%" stop-color="#f2ede8"/><stop offset="100%" stop-color="#d3cac2"/></linearGradient>' +
      '<radialGradient id="' + id + 'pl" cx="34%" cy="30%"><stop offset="0%" stop-color="' + shade(accent, 0.34) + '"/><stop offset="62%" stop-color="' + accent + '" stop-opacity=".8"/><stop offset="100%" stop-color="' + shade(accent, -0.6) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'vg" cx="50%" cy="44%" r="64%"><stop offset="56%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".34"/></radialGradient>' +
      '</defs>' +
      '<g clip-path="url(#' + id + ')">' + maskScene(design, accent, id) +
      // shoulders, then the head's shadow onto them
      '<path d="M2 108 Q8 72 33 68.5 L50 79 L67 68.5 Q92 72 98 108 Z" fill="url(#' + id + 'ho)"/>' +
      '<path d="M6 100 Q13 76 34 72 M94 100 Q87 76 66 72" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.2"/>' +
      '<ellipse cx="50" cy="76" rx="17" ry="7.5" fill="url(#' + id + 'sh)" opacity=".9"/>' +
      // hood
      '<path d="M22 70 Q13 33 30 14 q20 -19 40 0 17 19 8 56 l-10 8 H32 Z" fill="url(#' + id + 'ho)"/>' +
      '<path d="M22 70 Q13 33 30 14 q20 -19 40 0 17 19 8 56" fill="none" stroke="' + accent + '" stroke-width="1.5" opacity=".55"/>' +
      '<path d="M27 64 Q20 34 33 18" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.4"/>' +
      // neck, with the jaw casting onto it
      '<path d="M42.6 63 h14.8 v10 q-7.4 5.6 -14.8 0 Z" fill="' + shade(head, -0.32) + '"/>' +
      '<ellipse cx="50" cy="65.5" rx="10" ry="5.6" fill="url(#' + id + 'sh)" opacity=".9"/>' +
      // head
      '<path d="' + MASK_HEAD + '" fill="url(#' + id + 'hd)"/>' +
      '<g clip-path="url(#' + id + 'hc)">' +
      '<ellipse cx="40" cy="26" rx="16" ry="11" fill="url(#' + id + 'hl)" opacity=".22"/>' +
      '<ellipse cx="69" cy="42" rx="11" ry="24" fill="url(#' + id + 'sh)" opacity=".55"/>' +
      '<ellipse cx="50" cy="76" rx="18" ry="10" fill="url(#' + id + 'sh)" opacity=".7"/>' +
      (fine ? '<ellipse cx="30.5" cy="38" rx="5" ry="9" fill="url(#' + id + 'sh)" opacity=".4"/>' +
        '<ellipse cx="37.5" cy="49" rx="6.4" ry="4.4" fill="url(#' + id + 'hl)" opacity=".12"/>' +
        '<ellipse cx="63.5" cy="55" rx="7" ry="5.4" fill="url(#' + id + 'sh)" opacity=".38"/>' +
        '<ellipse cx="50" cy="70" rx="5.6" ry="3.6" fill="url(#' + id + 'hl)" opacity=".1"/>' : '') +
      '</g>' +
      // rim down the shadow side, the strongest depth cue on a head this dark
      '<g clip-path="url(#' + id + 'hc)"><path d="' + MASK_HEAD + '" transform="translate(-2.6 -1.6)" fill="none" stroke="url(#' + id + 'rim)" stroke-width="3.4"/></g>' +
      '<path d="' + MASK_HEAD + '" fill="none" stroke="' + accent + '" stroke-width="1.5" opacity=".62"/>' +
      // the mask casts onto the face it sits on
      '<g clip-path="url(#' + id + 'hc)"><ellipse cx="50" cy="55" rx="20" ry="7" fill="url(#' + id + 'sh)" opacity=".55"/></g>' +
      '<path d="' + maskShape(design) + '" fill="url(#' + id + 'm)"/>' +
      '<g clip-path="url(#' + id + 'mc)">' +
      '<ellipse cx="38" cy="30" rx="20" ry="7" fill="url(#' + id + 'hl)" opacity=".32"/>' +
      '<ellipse cx="50" cy="52" rx="26" ry="7" fill="url(#' + id + 'sh)" opacity=".4"/>' +
      '</g>' +
      '<path d="' + maskShape(design) + '" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width=".8"/>' +
      eye(38, -eyeRot) + eye(62, eyeRot) +
      // nose and lips: a lit lower lip instead of a single red scratch
      (fine ? '<g clip-path="url(#' + id + 'hc)"><ellipse cx="48.6" cy="55.5" rx="1.7" ry="4.6" fill="url(#' + id + 'hl)" opacity=".14"/>' +
        '<ellipse cx="52.4" cy="56.5" rx="1.9" ry="4.4" fill="url(#' + id + 'sh)" opacity=".4"/></g>' : '') +
      '<path d="M44.6 62.8 Q50 61.3 55.4 62.8 Q52.8 64 50 64 Q47.2 64 44.6 62.8 Z" fill="' + shade(accent, -0.5) + '"/>' +
      '<path d="M44.6 62.8 Q47.2 63.5 50 63.5 Q52.8 63.5 55.4 62.8 Q53.6 66.3 50 66.3 Q46.4 66.3 44.6 62.8 Z" fill="' + shade(accent, -0.16) + '"/>' +
      (fine ? '<path d="M47.2 64.4 Q50 65.3 52.8 64.4" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".3"/>' : '') +
      '<rect width="100" height="100" fill="url(#' + id + 'vg)"/>' +
      '<circle cx="50" cy="50" r="48.8" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".8"/>' +
      '</g></svg>';
  }
  function publicSvg(value, size, fallback) {
    var id = normPublicIdentity(value);
    if (id && id.kind === 'live') return maskSvg(id.design, size);
    if (id && id.kind === 'portrait') return svg(id.config, size);
    fallback = fallback || {};
    return svg(randomConfig(fallback.uid || fallback.name || 'anon'), size);
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
    if (node.__dbavHandler) { global.removeEventListener(EVT, node.__dbavHandler); global.removeEventListener(LIVE_EVT, node.__dbavHandler); }
    var first = ((user && (user.displayName || user.email)) || '').split(/\s+/)[0] || '';

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
    function render() {
      var currentIdentity = getPublicIdentity();
      var has = !!currentIdentity;
      var av = has
        ? '<div style="width:64px;height:64px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.22)">' + publicSvg(currentIdentity, '100%') + '</div>'
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
    global.addEventListener(LIVE_EVT, node.__dbavHandler);
    render();
  }

  // ════════════════════════════════════════════════════════════════════
  // CAMEO — the premium avatar set. Front-facing editorial portraits.
  //
  // Design system (hold every rule when adding avatars — extend notes at
  // the bottom of this block):
  //   · Frontal bust, natural human proportions (face ≈ 4:5, not the
  //     cartoon round-head). Bust fills ~72% of the circle.
  //   · Light top-right: bg radial at (68%, 20%), soft rim on the right
  //     cheek/temple, gentle shadow under jaw and at the neck.
  //   · Backgrounds are deep tonal duotones — NO particles, orbits,
  //     rings, or texture.
  //   · Features are calm and real: almond eyes with iris color, subtle
  //     frontal nose (shadow + nostrils, never an outline), natural
  //     lips. No cartoon grin, no dead stare, no hyperrealism.
  //   · Identity = hair silhouette + palette + garment + ONE accessory.
  //     Matte everything.
  // ════════════════════════════════════════════════════════════════════

  // Face variants: 0 soft/round jaw · 1 strong/square · 2 slim/tapered
  var CAM_FACE = [
    'M50 17.8 C59.6 17.8 65.4 24.4 65.7 33.8 C65.9 40.2 64.4 46.6 61.4 51 C58.7 55.1 54.7 57.8 50 57.8 C45.3 57.8 41.3 55.1 38.6 51 C35.6 46.6 34.1 40.2 34.3 33.8 C34.6 24.4 40.4 17.8 50 17.8 Z',
    'M50 17.6 C60 17.6 65.8 24 66 33.4 C66.2 40 65 46.8 62.2 51.4 C59.6 55.5 55 58 50 58 C45 58 40.4 55.5 37.8 51.4 C35 46.8 33.8 40 34 33.4 C34.2 24 40 17.6 50 17.6 Z',
    'M50 18 C59 18 64.8 24.6 65.1 33.9 C65.3 40.4 63.8 46.9 60.9 51.4 C58.3 55.6 54.4 58.2 50 58.2 C45.6 58.2 41.7 55.6 39.1 51.4 C36.2 46.9 34.7 40.4 34.9 33.9 C35.2 24.6 41 18 50 18 Z'
  ];
  // Rim light along the lit (right) side of the face.
  var CAM_RIM = 'M60.5 21.5 C63.8 24.6 65.5 28.8 65.7 33.8 C65.9 40.2 64.4 46.6 61.4 51';

  // Garment collars, centered on x50, drawn over the shoulder mass.
  var CAM_GARB = {
    turtleneck: function (c) {
      return '<path d="M42.4 71.5 C42.4 64 57.6 64 57.6 71.5 L57.6 75.5 L42.4 75.5 Z" fill="' + shade(c, 0.10) + '"/>' +
             '<path d="M42.4 67.6 L57.6 67.6 M42.4 70 L57.6 70" stroke="' + shade(c, -0.12) + '" stroke-width=".8" opacity=".7"/>';
    },
    crew: function (c) {
      return '<path d="M42.6 69.5 C46.5 72.6 53.5 72.6 57.4 69.5 L58 72.2 C53.4 75.4 46.6 75.4 42 72.2 Z" fill="' + shade(c, 0.14) + '"/>';
    },
    blazer: function (c, c2) {
      return '<path d="M44.6 69.5 L50 77 L44.6 89 L37.6 75 Z" fill="' + shade(c, -0.14) + '"/>' +
             '<path d="M55.4 69.5 L50 77 L55.4 89 L62.4 75 Z" fill="' + shade(c, -0.20) + '"/>' +
             '<path d="M46.2 70 L53.8 70 L52.2 81 L47.8 81 Z" fill="' + c2 + '"/>';
    },
    hoodie: function (c) {
      return '<path d="M39.5 73 C39.5 65 60.5 65 60.5 73 C60.5 77 55.5 79 50 79 C44.5 79 39.5 77 39.5 73 Z" fill="' + shade(c, 0.12) + '"/>' +
             '<path d="M47 78.2 L46.4 88 M53 78.2 L53.6 88" stroke="' + shade(c, 0.22) + '" stroke-width="1.4" stroke-linecap="round"/>';
    },
    puffer: function (c) {
      return '<path d="M41.5 72 C41.5 64.5 58.5 64.5 58.5 72 L58.5 76.5 L41.5 76.5 Z" fill="' + shade(c, 0.10) + '"/>' +
             '<path d="M41.5 72.8 L58.5 72.8" stroke="' + shade(c, -0.16) + '" stroke-width="1" opacity=".8"/>' +
             '<path d="M50 65 L50 76.5" stroke="' + shade(c, -0.16) + '" stroke-width="1" opacity=".8"/>';
    },
    zip: function (c) {
      return '<path d="M42.6 69.5 C46.5 72.6 53.5 72.6 57.4 69.5 L58 72.4 C53.4 75.6 46.6 75.6 42 72.4 Z" fill="' + shade(c, 0.16) + '"/>' +
             '<path d="M50 72.8 L50 93" stroke="' + shade(c, 0.3) + '" stroke-width="1.1"/>';
    }
  };

  // Accessories — one per avatar, max.
  var CAM_ACC = {
    none: function () { return ''; },
    hoop: function () {
      return '<circle cx="33.6" cy="46.2" r="2.2" fill="none" stroke="#e7b54c" stroke-width="1.2"/>' +
             '<circle cx="66.4" cy="46.2" r="2.2" fill="none" stroke="#e7b54c" stroke-width="1.2"/>';
    },
    stud: function () {
      return '<circle cx="33.7" cy="44.6" r="1.05" fill="#e7b54c"/><circle cx="66.3" cy="44.6" r="1.05" fill="#e7b54c"/>';
    },
    glasses: function () {
      return '<g fill="rgba(255,255,255,.06)" stroke="#20242c" stroke-width="1.3">' +
             '<rect x="37.6" y="34.4" width="10.6" height="8.2" rx="3.4"/>' +
             '<rect x="51.8" y="34.4" width="10.6" height="8.2" rx="3.4"/></g>' +
             '<path d="M48.2 37.6 Q50 36.8 51.8 37.6 M37.6 37.4 L34.6 36.6 M62.4 37.4 L65.4 36.6" fill="none" stroke="#20242c" stroke-width="1.2" stroke-linecap="round"/>';
    },
    headphones: function () {
      return '<path d="M34.2 34 C34.6 18.4 65.4 18.4 65.8 34" fill="none" stroke="#1b1e26" stroke-width="3.2" stroke-linecap="round"/>' +
             '<rect x="30.9" y="34.2" width="6.4" height="10.6" rx="3.1" fill="#1b1e26"/>' +
             '<rect x="62.7" y="34.2" width="6.4" height="10.6" rx="3.1" fill="#1b1e26"/>' +
             '<rect x="32.7" y="37.2" width="2.8" height="4.6" rx="1.4" fill="#ef4444" opacity=".9"/>' +
             '<rect x="64.5" y="37.2" width="2.8" height="4.6" rx="1.4" fill="#ef4444" opacity=".9"/>';
    },
    earcuff: function () {
      return '<path d="M65.9 37.4 A4.2 4.2 0 0 1 66.6 41.6" fill="none" stroke="#cdd3dd" stroke-width="1.4" stroke-linecap="round"/>';
    }
  };

  // The 12. name · face variant · skin · hair color · bg duo · garment ·
  // accessory · hair silhouette index (CAM_HAIR).
  var CAMEOS = [
    { name: 'Sam',   face: 1, skin: '#e8c19e', hair: '#3a2a1c', bg: ['#2e3644', '#1d232e'], garb: ['crew', '#39404c'],       acc: 'none',    hs: 0  },
    { name: 'Claire',face: 2, skin: '#f0d4bb', hair: '#6b4423', bg: ['#1d2b45', '#101a2e'], garb: ['crew', '#c8a878'],       acc: 'none',    hs: 1  },
    { name: 'Alex',  face: 0, skin: '#e2b48c', hair: '#241a12', bg: ['#39424e', '#232a34'], garb: ['crew', '#30343c'],       acc: 'glasses', hs: 2  },
    { name: 'Maya',  face: 2, skin: '#c78d5d', hair: '#17110c', bg: ['#4a2a2e', '#2e1a1d'], garb: ['turtleneck', '#e8e0d2'], acc: 'stud',    hs: 3  },
    { name: 'Tom',   face: 1, skin: '#f3dcc4', hair: '#8a6842', bg: ['#25382c', '#16241b'], garb: ['zip', '#31363f'],        acc: 'none',    hs: 4  },
    { name: 'Elena', face: 2, skin: '#d9a97e', hair: '#2a1c12', bg: ['#3a2440', '#241329'], garb: ['blazer', '#23242b', '#f2ede4'], acc: 'hoop', hs: 5 },
    { name: 'Jun',   face: 0, skin: '#edc9a4', hair: '#17120e', bg: ['#173a3a', '#0d2424'], garb: ['turtleneck', '#3c4650'], acc: 'none',    hs: 6  },
    { name: 'Amara', face: 0, skin: '#b97f52', hair: '#000000', bg: ['#41432e', '#28291c'], garb: ['crew', '#5c4a5e'],       acc: 'none',    hs: 7, hideEar: true },
    { name: 'Marcus',face: 1, skin: '#7a4e2e', hair: '#14100c', bg: ['#432832', '#2a1820'], garb: ['crew', '#28303a'],       acc: 'none',    hs: 8  },
    { name: 'Nina',  face: 2, skin: '#f3ddc8', hair: '#a5713f', bg: ['#2b2b31', '#1a1a1f'], garb: ['turtleneck', '#4a4e58'], acc: 'glasses', hs: 9  },
    { name: 'Priya', face: 0, skin: '#c99a6b', hair: '#221510', bg: ['#1f3050', '#122036'], garb: ['crew', '#7a3d46'],       acc: 'stud',    hs: 10 },
    { name: 'David', face: 1, skin: '#9c6b40', hair: '#0e0b08', bg: ['#4a443c', '#2d2924'], garb: ['hoodie', '#3d4450'],     acc: 'none',    hs: 11 }
  ];
  // Hair silhouettes (frontal). back = behind the head, front = over it.
  // Head envelope: x34–66, crown y17.5, temples y26, ears y34–45.
  var CAM_HAIR = [
    function (h) { // 0 — classic short crop
      var hl = shade(h, 0.24);
      return { back: '', front:
        '<path d="M34.4 31 C33.4 20 40.4 13.8 50 13.8 C59.6 13.8 66.6 20 65.6 31 C63.6 24 58.2 20.6 50 20.6 C41.8 20.6 36.4 24 34.4 31 Z" fill="' + h + '"/>' +
        '<path d="M40.4 17.6 C43.4 15.6 46.6 14.8 49.6 14.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 1 — long soft waves
      var d = shade(h, -0.22), hl = shade(h, 0.25);
      return {
        back: '<path d="M31.5 30 C27.5 42 27 60 30.5 76 L38.5 76 C35.5 62 35.5 46 37.5 36 Z" fill="' + d + '"/>' +
              '<path d="M68.5 30 C72.5 42 73 60 69.5 76 L61.5 76 C64.5 62 64.5 46 62.5 36 Z" fill="' + d + '"/>' +
              '<path d="M31.8 44 C30.6 54 31 65 33.2 73 M68.2 44 C69.4 54 69 65 66.8 73" fill="none" stroke="' + shade(h, -0.34) + '" stroke-width="1.1" opacity=".7"/>',
        front: '<path d="M34 34.5 C32.6 22 40 14.4 50 14.4 C60 14.4 67.4 22 66 34.5 C64.8 27.6 61.4 23.6 56.6 22.4 C58 24.8 58.2 27.2 57.2 29.2 C55.2 25.2 52.8 23.4 50 23.4 C47.2 23.4 44.8 25.2 42.8 29.2 C41.8 27.2 42 24.8 43.4 22.4 C38.6 23.6 35.2 27.6 34 34.5 Z" fill="' + h + '"/>' +
               '<path d="M40 18.6 C45 15.9 53 15.6 58.2 18.2" fill="none" stroke="' + hl + '" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' };
    },
    function (h) { // 2 — tidy quiff crop
      var hl = shade(h, 0.3);
      return { back: '', front:
        '<path d="M34.6 30 C33.2 20.4 39.6 13.2 50 13.2 C60 13.2 66.6 19.8 65.4 29.4 C64.2 25 61.8 22.2 58.6 21 C59.8 23.8 59.8 26.4 58.8 28.4 C55.8 23.6 50.4 21.8 45.2 23.4 C40.8 24.8 37.4 27.4 36 31.4 Z" fill="' + h + '"/>' +
        '<path d="M42.5 16.8 C46 14.9 51.5 14.6 55.5 16.4 M38.6 20.4 C41 18 44 16.6 46.6 16.2" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 3 — neat braids
      var d = shade(h, 0.26);
      return {
        back: '<path d="M33 30 C29.5 40 29 54 31.5 66 L37.5 65 C35.5 54 36 42 38.5 34 Z" fill="' + h + '"/>' +
              '<path d="M67 30 C70.5 40 71 54 68.5 66 L62.5 65 C64.5 54 64 42 61.5 34 Z" fill="' + h + '"/>' +
              '<ellipse cx="33.6" cy="50" rx="2.1" ry="3.4" fill="' + d + '"/><ellipse cx="33.2" cy="57.5" rx="2" ry="3.2" fill="' + h + '"/><ellipse cx="33.6" cy="64.5" rx="1.9" ry="3" fill="' + d + '"/>' +
              '<ellipse cx="66.4" cy="50" rx="2.1" ry="3.4" fill="' + d + '"/><ellipse cx="66.8" cy="57.5" rx="2" ry="3.2" fill="' + h + '"/><ellipse cx="66.4" cy="64.5" rx="1.9" ry="3" fill="' + d + '"/>' +
              '',
        front: '<path d="M34 33 C33 21.4 40 14 50 14 C60 14 67 21.4 66 33 C64.8 27 61.6 23.2 57.4 21.8 C54.8 21 52.4 20.8 50 20.8 C47.6 20.8 45.2 21 42.6 21.8 C38.4 23.2 35.2 27 34 33 Z" fill="' + h + '"/>' +
               '<path d="M39 22.6 L36.6 30.4 M44.4 20.8 L43 28.6 M50 20.4 L50 28 M55.6 20.8 L57 28.6 M61 22.6 L63.4 30.4" stroke="' + d + '" stroke-width="1.25" stroke-linecap="round" opacity=".8"/>' };
    },
    function (h) { // 4 — short side part
      var hl = shade(h, 0.26);
      return { back: '', front:
        '<path d="M34.2 32 C33 20.6 40.2 14 50 14 C59.8 14 67 20.6 65.8 32 C64.6 25.4 61 22 55.8 21.4 C51 20.9 45 21.4 41.4 23.6 C37.6 25.8 35.2 28.4 34.2 32 Z" fill="' + h + '"/>' +
        '<path d="M42.4 22.8 C46.4 20.9 52 20.5 56.4 21.6" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 5 — sleek center part, low bun
      var hl = shade(h, 0.3);
      return {
        back: '<path d="M33 34 C31.8 44 32.6 52 35 57 L39 54 C37 49 36.6 42 37.4 36 Z" fill="' + shade(h, -0.12) + '"/>' +
              '<path d="M67 34 C68.2 44 67.4 52 65 57 L61 54 C63 49 63.4 42 62.6 36 Z" fill="' + shade(h, -0.12) + '"/>',
        front: '<path d="M34 35 C32.4 22.4 40 14.8 50 14.8 C60 14.8 67.6 22.4 66 35 C64.6 27.6 61 23.4 55.8 22.4 L50 21.8 L44.2 22.4 C39 23.4 35.4 27.6 34 35 Z" fill="' + h + '"/>' +
               '<path d="M50 21.6 L50 15.6" stroke="' + shade(h, -0.25) + '" stroke-width="1.1" opacity=".7"/>' +
               '<path d="M41 18.8 C43.6 16.9 46.6 15.9 49.4 15.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 6 — bangs + chin bob
      var d = shade(h, -0.2);
      return {
        back: '<path d="M32.6 30 C30 40 30.2 51 33.4 59.5 L39.4 57.5 C37 50 36.8 40 38.6 33 Z" fill="' + d + '"/>' +
              '<path d="M67.4 30 C70 40 69.8 51 66.6 59.5 L60.6 57.5 C63 50 63.2 40 61.4 33 Z" fill="' + d + '"/>',
        front: '<path d="M33.8 33.6 C32.4 21 40 13.6 50 13.6 C60 13.6 67.6 21 66.2 33.6 L63.6 33.2 C63.2 30 62.4 27.4 61.2 25.4 C58 24 54 23.4 50 23.4 C46 23.4 42 24 38.8 25.4 C37.6 27.4 36.8 30 36.4 33.2 Z" fill="' + h + '"/>' +
               '<path d="M42 16.6 C46.6 14.8 53.4 14.8 58 16.6" fill="none" stroke="' + shade(h, 0.22) + '" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' };
    },
    function (h) { // 7 — hijab (ears covered)
      var c = '#b98499', d = shade(c, -0.22), hl = shade(c, 0.14);
      return {
        back: '<path d="M30 44 C29 58 32 70 38 77 L47 79 C39 71 35.6 58 36.6 46 Z" fill="' + d + '"/>' +
              '<path d="M70 44 C71 58 68 70 62 77 L53 79 C61 71 64.4 58 63.4 46 Z" fill="' + d + '"/>',
        front: '<path d="M50 11.5 C63 11.5 70 22 69.4 36 C69 44.6 66 53 61 58.6 L58.6 56 C62.8 50.4 64.8 42.6 64.6 35 C64.4 25.4 59 19.2 50 19.2 C41 19.2 35.6 25.4 35.4 35 C35.2 42.6 37.2 50.4 41.4 56 L39 58.6 C34 53 31 44.6 30.6 36 C30 22 37 11.5 50 11.5 Z" fill="' + c + '"/>' +
               '<path d="M39 58.4 C42 63.2 45.8 66 50 66 C54.2 66 58 63.2 61 58.4 L62.8 60.8 C59.6 66.2 55 69.2 50 69.2 C45 69.2 40.4 66.2 37.2 60.8 Z" fill="' + hl + '"/>' +
               '<path d="M40 16.4 C43 14.1 46.4 13 50 13 C53.6 13 57 14.1 60 16.4" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>' };
    },
    function (h) { // 8 — short coils
      var d = shade(h, 0.24);
      return { back: '', front:
        '<path d="M34.4 30 C33.6 20 40.6 13.4 50 13.4 C59.4 13.4 66.4 20 65.6 30 C63.6 23.8 58 20.4 50 20.4 C42 20.4 36.4 23.8 34.4 30 Z" fill="' + h + '"/>' +
        '<circle cx="38.6" cy="19.4" r="2.1" fill="' + d + '" opacity=".7"/><circle cx="44.4" cy="16" r="2.2" fill="' + d + '" opacity=".6"/><circle cx="50.6" cy="15.2" r="2.2" fill="' + d + '" opacity=".7"/><circle cx="56.6" cy="16.4" r="2.1" fill="' + d + '" opacity=".6"/><circle cx="61.8" cy="19.8" r="2" fill="' + d + '" opacity=".7"/>' };
    },
    function (h) { // 9 — straight shoulder-length, side part
      var d = shade(h, -0.2), hl = shade(h, 0.24);
      return {
        back: '<path d="M32.6 30 C29.6 42 30 56 33.4 66 L39.4 64.5 C36.6 55 36.6 43 38.6 34 Z" fill="' + d + '"/>' +
              '<path d="M67.4 30 C70.4 42 70 56 66.6 66 L60.6 64.5 C63.4 55 63.4 43 61.4 34 Z" fill="' + d + '"/>',
        front: '<path d="M34 34 C32.8 21.6 40 14.4 50 14.4 C60 14.4 67.2 21.6 66 34 C64.8 27.2 61.2 23.2 56 22.2 C50.4 21.2 44.4 22.2 40.8 25.2 C37.4 28 35 30.8 34 34 Z" fill="' + h + '"/>' +
               '<path d="M43 23.4 C47.6 21.4 53.4 21.2 57.8 22.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 10 — low ponytail
      var d = shade(h, -0.18), hl = shade(h, 0.26);
      return {
        back: '<path d="M60 46 C64 52 65 60 63.5 68 L58.5 67 C60 60 59.5 53 57 48 Z" fill="' + d + '"/>' +
              '<path d="M61.8 51 C63 56 63.2 61.5 62.2 66" fill="none" stroke="' + hl + '" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>',
        front: '<path d="M34.2 32.6 C33 21.2 40.2 14.2 50 14.2 C59.8 14.2 67 21.2 65.8 32.6 C64.4 26 60.4 22.4 54.8 21.7 L50 21.5 L45.2 21.7 C39.6 22.4 35.6 26 34.2 32.6 Z" fill="' + h + '"/>' +
               '<path d="M41 18.6 C44 16.4 47.2 15.4 50.2 15.4" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 11 — short natural waves
      var d = shade(h, 0.2);
      return { back: '', front:
        '<path d="M34.4 30.6 C33.4 20 40.4 13.6 50 13.6 C59.6 13.6 66.6 20 65.6 30.6 C63.6 23.8 58.2 20.4 50 20.4 C41.8 20.4 36.4 23.8 34.4 30.6 Z" fill="' + h + '"/>' +
        '<path d="M38.6 23.2 Q41.6 20.4 45 19.6 M47.8 18.8 Q51.4 18.2 54.8 19.2 M57.6 20.2 Q60.6 21.8 62.4 24.2" fill="none" stroke="' + d + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>' };
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
    var lip = shade(skin, -0.3);
    var iris = '#3b2a1c';
    function eye(cx) {
      return '<path d="M' + (cx - 3.4) + ' 38.3 Q' + cx + ' 35.9 ' + (cx + 3.4) + ' 38.3 Q' + cx + ' 40.5 ' + (cx - 3.4) + ' 38.3 Z" fill="#fff"/>' +
             '<circle cx="' + cx + '" cy="38.3" r="1.85" fill="' + iris + '"/>' +
             '<circle cx="' + cx + '" cy="38.3" r=".95" fill="#17120d"/>' +
             '<circle cx="' + (cx + 0.7) + '" cy="37.5" r=".55" fill="#fff"/>' +
             '<path d="M' + (cx - 3.6) + ' 37.9 Q' + cx + ' 35.4 ' + (cx + 3.6) + ' 37.9" fill="none" stroke="#1d1712" stroke-width="1.25" stroke-linecap="round"/>';
    }
    function brow(cx, k) {
      if (k === 1) return '<path d="M' + (cx - 4) + ' 33.6 L' + (cx + 4) + ' 33.1" stroke="' + browC + '" stroke-width="1.5" stroke-linecap="round" opacity=".88"/>';
      if (k === 2) return '<path d="M' + (cx - 4) + ' 34 Q' + cx + ' 31.8 ' + (cx + 4) + ' 33.6" fill="none" stroke="' + browC + '" stroke-width="1.4" stroke-linecap="round"/>';
      return '<path d="M' + (cx - 4) + ' 33.9 Q' + cx + ' 32.3 ' + (cx + 4) + ' 33.9" fill="none" stroke="' + browC + '" stroke-width="1.4" stroke-linecap="round"/>';
    }
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '" role="img" aria-label="' + A.name + '" style="display:block">' +
      '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>' +
      // soft-3D light rig: blur filters for volume passes
      '<filter id="' + id + 'b1" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.3"/></filter>' +
      '<filter id="' + id + 'b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
      '<filter id="' + id + 'b3" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4.5"/></filter>' +
      '<radialGradient id="' + id + 'bg" cx="66%" cy="18%" r="100%"><stop offset="0%" stop-color="' + shade(A.bg[0], 0.10) + '"/><stop offset="52%" stop-color="' + A.bg[0] + '"/><stop offset="100%" stop-color="' + shade(A.bg[1], -0.06) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'sk" cx="44%" cy="24%" r="86%"><stop offset="0%" stop-color="' + shade(skin, 0.24) + '"/><stop offset="40%" stop-color="' + shade(skin, 0.06) + '"/><stop offset="66%" stop-color="' + skin + '"/><stop offset="88%" stop-color="' + skinD + '"/><stop offset="100%" stop-color="' + shade(skin, -0.24) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + shade(garbC, 0.14) + '"/><stop offset="55%" stop-color="' + garbC + '"/><stop offset="100%" stop-color="' + shade(garbC, -0.20) + '"/></linearGradient></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      // studio depth: soft glow behind the bust + grounded vignette
      '<ellipse cx="56" cy="36" rx="26" ry="24" fill="#fff" opacity=".07" filter="url(#' + id + 'b3)"/>' +
      '<rect x="0" y="52" width="100" height="48" fill="#000" opacity=".16" filter="url(#' + id + 'b3)"/>' +
      hair.back +
      // shoulders + fabric light
      '<path d="M26 100 C27 81 36.5 71.5 50 70 C63.5 71.5 73 81 74 100 Z" fill="url(#' + id + 'gb)"/>' +
      '<path d="M33 82 C37 75.5 43 71.6 50 71 C57 71.6 63 75.5 67 82" fill="none" stroke="' + shade(garbC, 0.26) + '" stroke-width="2.4" stroke-linecap="round" opacity=".5" filter="url(#' + id + 'b2)"/>' +
      garb +
      // neck with the head's cast shadow (the big 3D tell)
      '<path d="M44.6 52 L55.4 52 L55.8 69 L44.2 69 Z" fill="' + skinD + '"/>' +
      '<ellipse cx="50" cy="56.5" rx="6.4" ry="4" fill="' + shade(skin, -0.42) + '" opacity=".5" filter="url(#' + id + 'b2)"/>' +
      // chest occlusion under the jawline
      '<ellipse cx="50" cy="70.5" rx="10" ry="2.6" fill="#000" opacity=".18" filter="url(#' + id + 'b2)"/>' +
      // ears
      (A.hideEar ? '' :
        '<ellipse cx="33.9" cy="39.4" rx="2.5" ry="4" fill="' + skinD + '"/>' +
        '<ellipse cx="66.1" cy="39.4" rx="2.5" ry="4" fill="' + skin + '"/>' +
        '<path d="M33.5 37.6 C34.6 37.9 34.9 39.4 34.1 40.8 M66.5 37.6 C65.4 37.9 65.1 39.4 65.9 40.8" fill="none" stroke="' + skinDD + '" stroke-width=".8" stroke-linecap="round" opacity=".6"/>') +
      // head
      '<path d="' + CAM_FACE[A.face] + '" fill="url(#' + id + 'sk)"/>' +
      // volumetric passes: under-hair occlusion, socket shading, core shadow
      '<ellipse cx="50" cy="24.5" rx="13.5" ry="3.6" fill="' + shade(skin, -0.36) + '" opacity=".3" filter="url(#' + id + 'b2)"/>' +
      '<ellipse cx="44" cy="37.4" rx="4.4" ry="2.4" fill="' + skinDD + '" opacity=".16" filter="url(#' + id + 'b1)"/>' +
      '<ellipse cx="56" cy="37.4" rx="4.4" ry="2.4" fill="' + skinDD + '" opacity=".16" filter="url(#' + id + 'b1)"/>' +
      '<ellipse cx="38.6" cy="43" rx="4" ry="9.5" fill="' + shade(skin, -0.34) + '" opacity=".26" filter="url(#' + id + 'b2)"/>' +
      // key-light highlights: forehead, lit cheek, nose tip, chin
      '<ellipse cx="53.5" cy="27.5" rx="8" ry="4.2" fill="#fff" opacity=".20" filter="url(#' + id + 'b2)"/>' +
      '<ellipse cx="59.5" cy="42.5" rx="4" ry="3" fill="#fff" opacity=".15" filter="url(#' + id + 'b2)"/>' +
      '<circle cx="50.8" cy="45.4" r="1.5" fill="#fff" opacity=".2" filter="url(#' + id + 'b1)"/>' +
      '<ellipse cx="50.5" cy="55.6" rx="2.8" ry="1.4" fill="#fff" opacity=".13" filter="url(#' + id + 'b1)"/>' +
      // features (crisp on top of the volume)
      brow(44, A.face) + brow(56, A.face) +
      eye(44) + eye(56) +
      '<path d="M48.9 40 C48.5 43 48.3 45.2 47.9 46.6" fill="none" stroke="' + skinDD + '" stroke-width="1" stroke-linecap="round" opacity=".28"/>' +
      '<path d="M47.6 47.9 Q50 49.4 52.4 47.9" fill="none" stroke="' + skinDD + '" stroke-width="1.1" stroke-linecap="round" opacity=".5"/>' +
      '<circle cx="47.5" cy="47.4" r=".62" fill="' + skinDD + '" opacity=".55"/><circle cx="52.5" cy="47.4" r=".62" fill="' + skinDD + '" opacity=".55"/>' +
      '<path d="M45.6 51.8 Q47.8 50.6 50 51.5 Q52.2 50.6 54.4 51.8 Q52.2 53.2 50 53.1 Q47.8 53.2 45.6 51.8 Z" fill="' + lip + '"/>' +
      '<path d="M46.3 52.9 Q50 55.4 53.7 52.9 Q52 54.7 50 54.7 Q48 54.7 46.3 52.9 Z" fill="' + shade(lip, 0.16) + '"/>' +
      '<ellipse cx="50" cy="54.1" rx="1.6" ry=".7" fill="#fff" opacity=".18" filter="url(#' + id + 'b1)"/>' +
      // rim light: crisp line + soft bloom
      '<path d="' + CAM_RIM + '" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".32"/>' +
      '<path d="' + CAM_RIM + '" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".14" filter="url(#' + id + 'b1)"/>' +
      hair.front +
      // hair gets its own specular sweep + root shadow
      '<ellipse cx="55" cy="18.5" rx="9" ry="3" fill="#fff" opacity=".16" filter="url(#' + id + 'b2)" transform="rotate(8 55 18.5)"/>' +
      '<ellipse cx="42" cy="17.5" rx="5" ry="2" fill="#fff" opacity=".10" filter="url(#' + id + 'b2)"/>' +
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
  // pick a face variant (0 soft / 1 strong / 2 slim), bg = deep tonal duo
  // (never a bright), ONE accessory max, garment from CAM_GARB, light
  // stays top-right, features stay quiet (no outlines on the nose, no
  // grins). The hair silhouette must read at 32px — test before shipping.
  // If it needs a new gradient direction, particle, or outline style,
  // it doesn't belong in this set.

  // ---- identity: one face per person, everywhere ------------------------
  // 2026-07-23. The builder has worked for a while, but what it built was
  // only ever drawn on /practice. The topbar, /profile, /spar and the
  // rest each did their own thing with the Google photoURL and fell back
  // to a bare letter, or on the topbar to nothing at all. So the avatar a
  // debater made was not their face anywhere it counted.
  //
  // identity() is the single answer to "what do we draw for this person".
  // Order is deliberate:
  //   1. the avatar they built    — a deliberate choice outranks anything
  //                                 inherited from Google
  //   2. their Google photo       — a real face, better than a generated one
  //   3. a portrait seeded off uid — randomConfig is deterministic when
  //                                 seeded, so this is stable forever, not
  //                                 a new stranger on every page load
  // The last rung is what makes the whole thing safe to rely on: there is
  // no case where a signed-in debater has no face.
  function identity(o) {
    o = o || {};
    var published = normPublicIdentity(o.publicIdentity);
    if (published) return published;
    if (!o.config) {
      var live = getLiveIdentity();
      if (live) return live;
    }
    var custom = o.config || getUser();
    if (custom) return { kind: 'custom', config: norm(custom), seed: o.uid || o.name || 'anon' };
    var seed = o.uid || o.name || 'anon';
    if (o.photo) return { kind: 'photo', photo: o.photo, config: randomConfig(seed), seed: seed };
    return { kind: 'generated', config: randomConfig(seed), seed: seed };
  }

  /* Paint an identity into `node`.

     opts: { uid, name, photo, size, config, live, alt }

     The generated portrait is painted first, as the node's own
     background, and a photo (when there is one) goes on top. That
     ordering is the point: the face is already there before the network
     is consulted, so a slow photo never shows a hole and a broken one
     just uncovers what was underneath. Three ways a Google photo fails,
     all covered — 403/404 (error), decodes to 0px (load + naturalWidth),
     and never fires either event (the portrait is already visible).

     With `live`, the node re-paints when the builder saves, so opening
     the builder from the topbar updates the topbar behind the modal. */
  function mountIdentity(node, opts) {
    if (!node) return node;
    var o = opts || {};
    var size = o.size || 32;

    function paint() {
      var id = identity(o);
      node.innerHTML = '';
      node.classList.add('db-identity');
      node.setAttribute('data-avatar-kind', id.kind);
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.borderRadius = '50%';
      node.style.overflow = 'hidden';
      node.style.flexShrink = '0';
      node.style.display = 'block';
      node.style.position = 'relative';
      node.innerHTML = id.kind === 'live' ? maskSvg(id.design, '100%') : svg(id.config, '100%');

      if (id.kind !== 'photo') return;
      var img = document.createElement('img');
      img.alt = o.alt || '';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
      var fail = function () { if (img.parentNode) img.parentNode.removeChild(img); };
      img.addEventListener('error', fail);
      img.addEventListener('load', function () { if (!img.naturalWidth) fail(); });
      img.src = id.photo;
      node.appendChild(img);
    }

    paint();
    if (o.live) {
      if (node.__dbIdentityHandler) {
        global.removeEventListener(EVT, node.__dbIdentityHandler);
        global.removeEventListener(LIVE_EVT, node.__dbIdentityHandler);
      }
      node.__dbIdentityHandler = function () { paint(); };
      global.addEventListener(EVT, node.__dbIdentityHandler);
      global.addEventListener(LIVE_EVT, node.__dbIdentityHandler);
    }
    return node;
  }

  global.DBAvatar = {
    svg: svg, persona: persona, PRESETS: PRESETS,
    getUser: getUser, setUser: setUser, clearUser: clearUser,
    randomConfig: randomConfig, openBuilder: openBuilder, mountWelcome: mountWelcome,
    identity: identity, mountIdentity: mountIdentity,
    getLiveIdentity: getLiveIdentity, getPublicIdentity: getPublicIdentity,
    normPublicIdentity: normPublicIdentity, maskSvg: maskSvg, publicSvg: publicSvg,
    talkingSvg: talkingSvg, mountTalking: mountTalking,
    cameo: cameo, cameoSvg: cameoSvg, CAMEOS: CAMEOS, CAMEO_MAP: CAMEO_MAP,
    SKIN: SKIN, HAIR: HAIR, BG: BG, OUTFIT: OUTFIT, EVENT: EVT
  };
})(window);
