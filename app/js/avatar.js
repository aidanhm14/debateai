/* Debatable avatars — the studio portrait engine.
   One renderer powers every face on the site: the avatar a debater builds,
   the AI personas, the coach's talking head, and the seeded faces on
   boards and chats.

   Art direction (the 2026-08-22 rebuild): editorial studio portraits.
   Frontal bust with natural human proportions, deep tonal duotone
   backdrops, one warm key light from the upper left with a soft rim on
   the lit side, quiet features, matte everything. No balloon heads, no
   orbital lines, no sticker-pack grins. The look is the CAMEO persona
   set, generalized into a parametric engine.

   Public API (window.DBAvatar) — unchanged from the previous engine, so
   every stored config, remote public identity, and preset upgrades in
   place:
     svg(config, size)      -> SVG markup string for a config
     persona(key, size)     -> SVG for an AI persona preset
     getUser()              -> saved user config or null
     setUser(config)        -> persist + broadcast 'debatable-avatar-change'
     clearUser()
     randomConfig(seed)     -> a fresh config (deterministic if seed given)
     openBuilder({onSave})  -> the build-your-own modal
     mountWelcome(node,user)-> render the welcome-home card into a node
     mountTalking(node,cfg) -> animated talking head controller
     publicSvg / identity / mountIdentity / maskSvg — as before

   No build step, no SVG filters (soft form is painted with two reusable
   radial "brush" gradients, so a leaderboard can draw dozens of these
   without CPU-side blur). Plain browser JS, loaded via <script defer>.
   Colors are literal so a portrait reads the same on light and dark.
   No em-dashes in any user-facing string here. */
(function (global) {
  'use strict';

  var STORE_KEY = 'debatable-avatar';
  var LEGACY_STORE_KEY = 'debate' + 'it-avatar';
  var EVT = 'debatable-avatar-change';
  var LIVE_STORE_KEY = 'debatable-live-avatar-v1';
  var LIVE_LOOKS_KEY = 'debatable-avatar-looks-v1';
  /* 2026-08-24: the drawn picture set (js/pfp-set.js) became a THIRD kind
     of identity a debater can choose, alongside the portrait they design
     here and the mask they build in the camera avatar. Two keys, because
     picking a picture must not destroy a portrait somebody already made:
     PFP_KEY holds the chosen picture id, PREF_KEY holds which of the three
     kinds they last chose. getPublicIdentity() reads the preference first
     and falls back to the old order, so an account that never touched the
     picker behaves exactly as it did. */
  var PFP_KEY = 'debatable-pfp-v1';
  var PREF_KEY = 'debatable-avatar-pref';
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
  var uid = 0;

  // ---- palettes ---------------------------------------------------------
  var SKIN = ['#f8ddc3', '#f0c6a2', '#dba172', '#bd7c4c', '#96603a', '#654227'];
  // natural + a couple of cool dye options (platinum, ash-blue, pink)
  var HAIR = ['#141210', '#3a2418', '#6b4423', '#a5713f', '#e7c979', '#cfd3db', '#7c86ff', '#ff77c8'];
  // Backdrops. The stored index still points into this bright palette for
  // back-compat, but the portrait renders each one as a deep tonal duotone
  // (see resolve()), so nobody stands in front of a traffic light.
  var BG   = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#a855f7', '#fb7185', '#64748b', '#0ea5e9', '#10b981'];
  // outfit color; the garment STYLE is derived per index in GARB_STYLE
  var OUTFIT = ['#39404c', '#7a3d46', '#20334d', '#392942', '#1f3a35', '#c8a878', '#e8e0d2', '#23242b'];
  // eye color — naturals first (randomizer favors the first two)
  var IRIS = ['#5b4130', '#2a2320', '#4f7046', '#3e6a8e', '#7a6a44', '#5c6672'];

  // number of shape options per field (used by builder + randomizer)
  var N_FACE = 3, N_TOP = 14, N_EYES = 4, N_BROWS = 3, N_MOUTH = 5, N_FACIAL = 4, N_GLASSES = 3, N_ACC = 5, N_DETAIL = 3;

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
    return { face: 0, skin: 1, hair: 1, top: 1, eyes: 0, brows: 0, mouth: 0, facial: 0, glasses: 0, accessory: 0, bg: 7, outfit: 0, iris: 0, detail: 0 };
  }
  function norm(c) {
    c = c || {};
    return {
      // face shape is new in the studio engine; configs saved before it
      // existed derive a stable one from fields they do have
      face: clamp(c.face == null ? (((c.top | 0) + (c.hair | 0)) % N_FACE) : c.face, N_FACE),
      skin: clamp(c.skin, SKIN.length), hair: clamp(c.hair, HAIR.length),
      top: clamp(c.top, N_TOP), eyes: clamp(c.eyes, N_EYES), brows: clamp(c.brows, N_BROWS),
      mouth: clamp(c.mouth, N_MOUTH), facial: clamp(c.facial, N_FACIAL),
      glasses: clamp(c.glasses, N_GLASSES), accessory: clamp(c.accessory, N_ACC),
      iris: clamp(c.iris, IRIS.length), detail: clamp(c.detail, N_DETAIL),
      bg: clamp(c.bg, BG.length), outfit: clamp(c.outfit, OUTFIT.length)
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // THE STUDIO RENDERER
  //
  // Design rules (hold every one when extending):
  //   · Frontal bust, natural human proportions (face ≈ 4:5). The whole
  //     figure is drawn in a 0-100 "studio space" and zoomed 1.3x about
  //     (50,40) so the head reads at chip sizes without balloon anatomy.
  //   · Light from the upper left: bg radial at (66%, 18%), soft rim on
  //     the lit side, gentle shadow under jaw and at the neck.
  //   · Backgrounds are deep tonal duotones. NO particles, orbits, rings.
  //   · Features are calm and real: almond eyes with iris color, subtle
  //     frontal nose (shadow + nostrils, never an outline), natural lips.
  //   · Soft form is painted with the hl/sh brush gradients. NO feGaussianBlur:
  //     filters blur on the CPU and a leaderboard paints dozens at once.
  // ════════════════════════════════════════════════════════════════════

  // Face variants: 0 soft/round jaw · 1 strong/square · 2 slim/tapered
  var FACES = [
    'M50 17.8 C59.6 17.8 65.4 24.4 65.7 33.8 C65.9 40.2 64.4 46.6 61.4 51 C58.7 55.1 54.7 57.8 50 57.8 C45.3 57.8 41.3 55.1 38.6 51 C35.6 46.6 34.1 40.2 34.3 33.8 C34.6 24.4 40.4 17.8 50 17.8 Z',
    'M50 17.6 C60 17.6 65.8 24 66 33.4 C66.2 40 65 46.8 62.2 51.4 C59.6 55.5 55 58 50 58 C45 58 40.4 55.5 37.8 51.4 C35 46.8 33.8 40 34 33.4 C34.2 24 40 17.6 50 17.6 Z',
    'M50 18 C59 18 64.8 24.6 65.1 33.9 C65.3 40.4 63.8 46.9 60.9 51.4 C58.3 55.6 54.4 58.2 50 58.2 C45.6 58.2 41.7 55.6 39.1 51.4 C36.2 46.9 34.7 40.4 34.9 33.9 C35.2 24.6 41 18 50 18 Z'
  ];
  // Rim light along the lit (right) side of the face.
  var RIM = 'M60.5 21.5 C63.8 24.6 65.5 28.8 65.7 33.8 C65.9 40.2 64.4 46.6 61.4 51';

  // Garment collars, centered on x50, drawn over the shoulder mass.
  var GARB = {
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
             '<path d="M47.4 70 L52.6 70 L51.7 80 L48.3 80 Z" fill="' + (c2 || '#f2ede4') + '"/>';
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
  // garment style per OUTFIT color index
  var GARB_STYLE = ['crew', 'hoodie', 'zip', 'crew', 'turtleneck', 'crew', 'turtleneck', 'blazer'];

  // Accessories — one per avatar, max. Index order is the config contract.
  var ACC_KEYS = ['none', 'headphones', 'stud', 'hoop', 'earcuff'];
  var ACC = {
    none: function () { return ''; },
    hoop: function () {
      return '<circle cx="33.6" cy="46.2" r="2.2" fill="none" stroke="#e7b54c" stroke-width="1.2"/>' +
             '<circle cx="66.4" cy="46.2" r="2.2" fill="none" stroke="#e7b54c" stroke-width="1.2"/>';
    },
    stud: function () {
      return '<circle cx="33.7" cy="44.6" r="1.05" fill="#e7b54c"/><circle cx="66.3" cy="44.6" r="1.05" fill="#e7b54c"/>';
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

  function glassesPath(kind) {
    if (kind === 1) { // round wireframes
      return '<g fill="rgba(255,255,255,.05)" stroke="#20242c" stroke-width="1.25">' +
             '<circle cx="43.7" cy="38.5" r="5.1"/><circle cx="56.3" cy="38.5" r="5.1"/></g>' +
             '<path d="M48.7 37.8 Q50 37 51.3 37.8 M38.7 37.6 L34.7 36.8 M61.3 37.6 L65.3 36.8" fill="none" stroke="#20242c" stroke-width="1.15" stroke-linecap="round"/>';
    }
    if (kind === 2) { // rectangular acetate
      return '<g fill="rgba(255,255,255,.06)" stroke="#20242c" stroke-width="1.3">' +
             '<rect x="37.6" y="34.4" width="10.6" height="8.2" rx="3.4"/>' +
             '<rect x="51.8" y="34.4" width="10.6" height="8.2" rx="3.4"/></g>' +
             '<path d="M48.2 37.6 Q50 36.8 51.8 37.6 M37.6 37.4 L34.6 36.6 M62.4 37.4 L65.4 36.6" fill="none" stroke="#20242c" stroke-width="1.2" stroke-linecap="round"/>';
    }
    return '';
  }

  // Hair silhouettes (frontal). back = behind the torso, front = over the
  // head. Head envelope: x34-66, crown y17.5, temples y26, ears y34-45.
  // Index order is the config contract (old `top` values map positionally).
  var HAIRSTYLES = [
    function (h) { // 0 — buzz: a deliberate shadow, not a missing asset
      return { back: '', front:
        '<path d="M34.4 31 C33.4 20 40.4 13.8 50 13.8 C59.6 13.8 66.6 20 65.6 31 C63.6 24 58.2 20.6 50 20.6 C41.8 20.6 36.4 24 34.4 31 Z" fill="' + h + '" opacity=".38"/>' +
        '<path d="M36.2 26.5 C38.4 22.6 43.6 20.2 50 20.2 C56.4 20.2 61.6 22.6 63.8 26.5" fill="none" stroke="' + h + '" stroke-width=".9" opacity=".5"/>' };
    },
    function (h) { // 1 — classic short crop
      var hl = shade(h, 0.24);
      return { back: '', front:
        '<path d="M34.4 31 C33.4 20 40.4 13.8 50 13.8 C59.6 13.8 66.6 20 65.6 31 C63.6 24 58.2 20.6 50 20.6 C41.8 20.6 36.4 24 34.4 31 Z" fill="' + h + '"/>' +
        '<path d="M40.4 17.6 C43.4 15.6 46.6 14.8 49.6 14.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 2 — tidy quiff crop
      var hl = shade(h, 0.3);
      return { back: '', front:
        '<path d="M34.6 30 C33.2 20.4 39.6 13.2 50 13.2 C60 13.2 66.6 19.8 65.4 29.4 C64.2 25 61.8 22.2 58.6 21 C59.8 23.8 59.8 26.4 58.8 28.4 C55.8 23.6 50.4 21.8 45.2 23.4 C40.8 24.8 37.4 27.4 36 31.4 Z" fill="' + h + '"/>' +
        '<path d="M42.5 16.8 C46 14.9 51.5 14.6 55.5 16.4 M38.6 20.4 C41 18 44 16.6 46.6 16.2" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 3 — full natural crown
      var d = shade(h, 0.18), dd = shade(h, -0.2);
      return { back: '', front:
        '<path d="M50 8.6 C42.2 8.6 36.6 12.2 34.4 17.8 C31.2 18.8 29.2 21.8 29.6 25.4 C29.9 28.8 32.2 31.3 35.3 32.2 C36.6 25.6 42.2 21.2 50 21.2 C57.8 21.2 63.4 25.6 64.7 32.2 C67.8 31.3 70.1 28.8 70.4 25.4 C70.8 21.8 68.8 18.8 65.6 17.8 C63.4 12.2 57.8 8.6 50 8.6 Z" fill="' + h + '"/>' +
        '<circle cx="38" cy="16.8" r="2.3" fill="' + d + '" opacity=".55"/><circle cx="45" cy="12.8" r="2.4" fill="' + dd + '" opacity=".5"/><circle cx="52.6" cy="12.2" r="2.3" fill="' + d + '" opacity=".5"/><circle cx="60" cy="14.6" r="2.2" fill="' + dd + '" opacity=".5"/><circle cx="65" cy="20" r="2.1" fill="' + d + '" opacity=".5"/><circle cx="33.8" cy="22.6" r="2.1" fill="' + dd + '" opacity=".5"/>' };
    },
    function (h) { // 4 — long soft waves
      var d = shade(h, -0.22), hl = shade(h, 0.25);
      return {
        back: '<path d="M31.5 30 C27.5 42 27 64 30.5 84 L38.5 84 C35.5 66 35.5 46 37.5 36 Z" fill="' + d + '"/>' +
              '<path d="M68.5 30 C72.5 42 73 64 69.5 84 L61.5 84 C64.5 66 64.5 46 62.5 36 Z" fill="' + d + '"/>' +
              '<path d="M31.8 44 C30.6 54 31 65 33.2 73 M68.2 44 C69.4 54 69 65 66.8 73" fill="none" stroke="' + shade(h, -0.34) + '" stroke-width="1.1" opacity=".7"/>',
        front: '<path d="M34 34.5 C32.6 22 40 14.4 50 14.4 C60 14.4 67.4 22 66 34.5 C64.8 27.6 61.4 23.6 56.6 22.4 C58 24.8 58.2 27.2 57.2 29.2 C55.2 25.2 52.8 23.4 50 23.4 C47.2 23.4 44.8 25.2 42.8 29.2 C41.8 27.2 42 24.8 43.4 22.4 C38.6 23.6 35.2 27.6 34 34.5 Z" fill="' + h + '"/>' +
               '<path d="M40 18.6 C45 15.9 53 15.6 58.2 18.2" fill="none" stroke="' + hl + '" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' };
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
        back: '<path d="M32.6 30 C30 42 30.2 55 33.4 66 L39.4 64 C37 54 36.8 41 38.6 33 Z" fill="' + d + '"/>' +
              '<path d="M67.4 30 C70 42 69.8 55 66.6 66 L60.6 64 C63 54 63.2 41 61.4 33 Z" fill="' + d + '"/>',
        front: '<path d="M33.8 33.6 C32.4 21 40 13.6 50 13.6 C60 13.6 67.6 21 66.2 33.6 L63.6 33.2 C63.2 30 62.4 27.4 61.2 25.4 C58 24 54 23.4 50 23.4 C46 23.4 42 24 38.8 25.4 C37.6 27.4 36.8 30 36.4 33.2 Z" fill="' + h + '"/>' +
               '<path d="M42 16.6 C46.6 14.8 53.4 14.8 58 16.6" fill="none" stroke="' + shade(h, 0.22) + '" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' };
    },
    function (h) { // 7 — short side part
      var hl = shade(h, 0.26);
      return { back: '', front:
        '<path d="M34.2 32 C33 20.6 40.2 14 50 14 C59.8 14 67 20.6 65.8 32 C64.6 25.4 61 22 55.8 21.4 C51 20.9 45 21.4 41.4 23.6 C37.6 25.8 35.2 28.4 34.2 32 Z" fill="' + h + '"/>' +
        '<path d="M42.4 22.8 C46.4 20.9 52 20.5 56.4 21.6" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 8 — neat braids
      var d = shade(h, 0.26);
      return {
        back: '<path d="M33 30 C29.5 40 29 54 31.5 66 L37.5 65 C35.5 54 36 42 38.5 34 Z" fill="' + h + '"/>' +
              '<path d="M67 30 C70.5 40 71 54 68.5 66 L62.5 65 C64.5 54 64 42 61.5 34 Z" fill="' + h + '"/>' +
              '<ellipse cx="33.6" cy="50" rx="2.1" ry="3.4" fill="' + d + '"/><ellipse cx="33.2" cy="57.5" rx="2" ry="3.2" fill="' + h + '"/><ellipse cx="33.6" cy="64.5" rx="1.9" ry="3" fill="' + d + '"/>' +
              '<ellipse cx="66.4" cy="50" rx="2.1" ry="3.4" fill="' + d + '"/><ellipse cx="66.8" cy="57.5" rx="2" ry="3.2" fill="' + h + '"/><ellipse cx="66.4" cy="64.5" rx="1.9" ry="3" fill="' + d + '"/>',
        front: '<path d="M34 33 C33 21.4 40 14 50 14 C60 14 67 21.4 66 33 C64.8 27 61.6 23.2 57.4 21.8 C54.8 21 52.4 20.8 50 20.8 C47.6 20.8 45.2 21 42.6 21.8 C38.4 23.2 35.2 27 34 33 Z" fill="' + h + '"/>' +
               '<path d="M39 22.6 L36.6 30.4 M44.4 20.8 L43 28.6 M50 20.4 L50 28 M55.6 20.8 L57 28.6 M61 22.6 L63.4 30.4" stroke="' + d + '" stroke-width="1.25" stroke-linecap="round" opacity=".8"/>' };
    },
    function (h) { // 9 — low ponytail
      var d = shade(h, -0.18), hl = shade(h, 0.26);
      return {
        back: '<path d="M60 46 C64 52 65 60 63.5 68 L58.5 67 C60 60 59.5 53 57 48 Z" fill="' + d + '"/>' +
              '<path d="M61.8 51 C63 56 63.2 61.5 62.2 66" fill="none" stroke="' + hl + '" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>',
        front: '<path d="M34.2 32.6 C33 21.2 40.2 14.2 50 14.2 C59.8 14.2 67 21.2 65.8 32.6 C64.4 26 60.4 22.4 54.8 21.7 L50 21.5 L45.2 21.7 C39.6 22.4 35.6 26 34.2 32.6 Z" fill="' + h + '"/>' +
               '<path d="M41 18.6 C44 16.4 47.2 15.4 50.2 15.4" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 10 — straight shoulder-length, side part
      var d = shade(h, -0.2), hl = shade(h, 0.24);
      return {
        back: '<path d="M32.6 30 C29.6 44 30 62 33.4 80 L39.4 78.5 C36.6 62 36.6 44 38.6 34 Z" fill="' + d + '"/>' +
              '<path d="M67.4 30 C70.4 44 70 62 66.6 80 L60.6 78.5 C63.4 62 63.4 44 61.4 34 Z" fill="' + d + '"/>',
        front: '<path d="M34 34 C32.8 21.6 40 14.4 50 14.4 C60 14.4 67.2 21.6 66 34 C64.8 27.2 61.2 23.2 56 22.2 C50.4 21.2 44.4 22.2 40.8 25.2 C37.4 28 35 30.8 34 34 Z" fill="' + h + '"/>' +
               '<path d="M43 23.4 C47.6 21.4 53.4 21.2 57.8 22.8" fill="none" stroke="' + hl + '" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' };
    },
    function (h) { // 11 — short coils
      var d = shade(h, 0.24);
      return { back: '', front:
        '<path d="M34.4 30 C33.6 20 40.6 13.4 50 13.4 C59.4 13.4 66.4 20 65.6 30 C63.6 23.8 58 20.4 50 20.4 C42 20.4 36.4 23.8 34.4 30 Z" fill="' + h + '"/>' +
        '<circle cx="38.6" cy="19.4" r="2.1" fill="' + d + '" opacity=".7"/><circle cx="44.4" cy="16" r="2.2" fill="' + d + '" opacity=".6"/><circle cx="50.6" cy="15.2" r="2.2" fill="' + d + '" opacity=".7"/><circle cx="56.6" cy="16.4" r="2.1" fill="' + d + '" opacity=".6"/><circle cx="61.8" cy="19.8" r="2" fill="' + d + '" opacity=".7"/>' };
    },
    function (h) { // 12 — short natural waves
      var d = shade(h, 0.2);
      return { back: '', front:
        '<path d="M34.4 30.6 C33.4 20 40.4 13.6 50 13.6 C59.6 13.6 66.6 20 65.6 30.6 C63.6 23.8 58.2 20.4 50 20.4 C41.8 20.4 36.4 23.8 34.4 30.6 Z" fill="' + h + '"/>' +
        '<path d="M38.6 23.2 Q41.6 20.4 45 19.6 M47.8 18.8 Q51.4 18.2 54.8 19.2 M57.6 20.2 Q60.6 21.8 62.4 24.2" fill="none" stroke="' + d + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>' };
    },
    function (h) { // 13 — hijab (ears covered)
      var c = '#b98499', d = shade(c, -0.22), hl = shade(c, 0.14);
      return {
        back: '<path d="M30 44 C29 58 32 70 38 77 L47 79 C39 71 35.6 58 36.6 46 Z" fill="' + d + '"/>' +
              '<path d="M70 44 C71 58 68 70 62 77 L53 79 C61 71 64.4 58 63.4 46 Z" fill="' + d + '"/>',
        front: '<path d="M50 11.5 C63 11.5 70 22 69.4 36 C69 44.6 66 53 61 58.6 L58.6 56 C62.8 50.4 64.8 42.6 64.6 35 C64.4 25.4 59 19.2 50 19.2 C41 19.2 35.6 25.4 35.4 35 C35.2 42.6 37.2 50.4 41.4 56 L39 58.6 C34 53 31 44.6 30.6 36 C30 22 37 11.5 50 11.5 Z" fill="' + c + '"/>' +
               '<path d="M39 58.4 C42 63.2 45.8 66 50 66 C54.2 66 58 63.2 61 58.4 L62.8 60.8 C59.6 66.2 55 69.2 50 69.2 C45 69.2 40.4 66.2 37.2 60.8 Z" fill="' + hl + '"/>' +
               '<path d="M40 16.4 C43 14.1 46.4 13 50 13 C53.6 13 57 14.1 60 16.4" fill="none" stroke="' + hl + '" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>' };
    }
  ];

  // ---- feature drawing --------------------------------------------------
  function eyePair(kind, irisCol, fine) {
    var h = kind === 1 ? 3.0 : kind === 2 ? 1.9 : kind === 3 ? 2.05 : 2.4;
    var ir = kind === 1 ? 2.0 : kind === 2 ? 1.7 : 1.85;
    var lashD = kind === 3 ? 1.6 : 2.5;
    function eye(cx) {
      var s = '<path d="M' + (cx - 3.4) + ' 38.3 Q' + cx + ' ' + (38.3 - h).toFixed(1) + ' ' + (cx + 3.4) + ' 38.3 Q' + cx + ' ' + (38.3 + h * 0.85).toFixed(1) + ' ' + (cx - 3.4) + ' 38.3 Z" fill="#fdfcf9"/>' +
        '<circle cx="' + cx + '" cy="38.4" r="' + ir + '" fill="' + irisCol + '"/>' +
        '<circle cx="' + cx + '" cy="38.4" r="' + (ir * 0.5).toFixed(2) + '" fill="#17120d"/>' +
        '<circle cx="' + (cx + 0.7) + '" cy="37.6" r=".55" fill="#fff"/>' +
        '<path d="M' + (cx - 3.6) + ' 37.9 Q' + cx + ' ' + (37.9 - lashD).toFixed(1) + ' ' + (cx + 3.6) + ' 37.9" fill="none" stroke="#1d1712" stroke-width="1.25" stroke-linecap="round"/>';
      if (kind === 2 && fine) s += '<path d="M' + (cx - 3.1) + ' 36.2 Q' + cx + ' 35.1 ' + (cx + 3.1) + ' 36.2" fill="none" stroke="#000" stroke-width=".7" stroke-linecap="round" opacity=".22"/>';
      return s;
    }
    return eye(44) + eye(56);
  }

  function browPair(kind, browC) {
    function brow(cx) {
      var s = cx < 50 ? 1 : -1; // inner end faces center
      if (kind === 1) return '<path d="M' + (cx - 4) + ' ' + (33.6 + (s < 0 ? -0.5 : 0)) + ' L' + (cx + 4) + ' ' + (33.6 + (s < 0 ? 0 : -0.5)) + '" stroke="' + browC + '" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>';
      if (kind === 2) return '<path d="M' + (cx - 4.2) + ' ' + (cx < 50 ? 34.2 : 33.4) + ' Q' + cx + ' 31.6 ' + (cx + 4.2) + ' ' + (cx < 50 ? 33.4 : 34.2) + '" fill="none" stroke="' + browC + '" stroke-width="1.9" stroke-linecap="round"/>';
      return '<path d="M' + (cx - 4) + ' 33.9 Q' + cx + ' 32.3 ' + (cx + 4) + ' 33.9" fill="none" stroke="' + browC + '" stroke-width="1.4" stroke-linecap="round"/>';
    }
    return brow(44) + brow(56);
  }

  function nosePath(skinDD, fine) {
    return '<path d="M48.9 40 C48.5 43 48.3 45.2 47.9 46.6" fill="none" stroke="' + skinDD + '" stroke-width="1" stroke-linecap="round" opacity=".28"/>' +
      '<path d="M47.6 47.9 Q50 49.4 52.4 47.9" fill="none" stroke="' + skinDD + '" stroke-width="1.1" stroke-linecap="round" opacity=".5"/>' +
      (fine ? '<circle cx="47.5" cy="47.4" r=".62" fill="' + skinDD + '" opacity=".55"/><circle cx="52.5" cy="47.4" r=".62" fill="' + skinDD + '" opacity=".55"/>' : '');
  }

  function mouthPath(kind, lip, fine) {
    if (kind === 1) { // warm smile
      return '<path d="M45.2 51.4 Q47.8 50.2 50 51.1 Q52.2 50.2 54.8 51.4 Q52.4 53.4 50 53.3 Q47.6 53.4 45.2 51.4 Z" fill="' + lip + '"/>' +
        '<path d="M45.9 52.6 Q50 55.8 54.1 52.6 Q52.2 55.3 50 55.3 Q47.8 55.3 45.9 52.6 Z" fill="' + shade(lip, 0.16) + '"/>' +
        (fine ? '<path d="M44.7 51.2 L45.6 51.9 M55.3 51.2 L54.4 51.9" stroke="' + lip + '" stroke-width=".7" stroke-linecap="round" opacity=".6"/>' : '');
    }
    if (kind === 2) { // neutral
      return '<path d="M45.8 52 Q47.9 51.2 50 51.7 Q52.1 51.2 54.2 52 Q52.1 53.3 50 53.2 Q47.9 53.3 45.8 52 Z" fill="' + lip + '"/>' +
        '<path d="M46.5 53 Q50 54.8 53.5 53 Q51.9 54.6 50 54.6 Q48.1 54.6 46.5 53 Z" fill="' + shade(lip, 0.16) + '"/>';
    }
    if (kind === 3) { // open smile, a sliver of teeth
      return '<path d="M45.3 51.5 Q50 50.3 54.7 51.5 Q53.5 55.7 50 55.7 Q46.5 55.7 45.3 51.5 Z" fill="' + shade(lip, -0.26) + '"/>' +
        '<path d="M46.4 51.8 Q50 51 53.6 51.8 L53.1 53.2 Q50 52.6 46.9 53.2 Z" fill="#f4efe5"/>' +
        '<path d="M46.6 54.9 Q50 56.2 53.4 54.9" fill="none" stroke="' + shade(lip, 0.2) + '" stroke-width="1" stroke-linecap="round" opacity=".8"/>';
    }
    if (kind === 4) { // focused
      return '<path d="M46.4 52.1 Q50 51.4 53.6 52.1 Q52 53.3 50 53.3 Q48 53.3 46.4 52.1 Z" fill="' + lip + '"/>' +
        '<path d="M47.1 53 Q50 54.3 52.9 53 Q51.7 54.1 50 54.1 Q48.3 54.1 47.1 53 Z" fill="' + shade(lip, 0.14) + '"/>';
    }
    // 0 — soft
    return '<path d="M45.6 51.8 Q47.8 50.6 50 51.5 Q52.2 50.6 54.4 51.8 Q52.2 53.2 50 53.1 Q47.8 53.2 45.6 51.8 Z" fill="' + lip + '"/>' +
      '<path d="M46.3 52.9 Q50 55.4 53.7 52.9 Q52 54.7 50 54.7 Q48 54.7 46.3 52.9 Z" fill="' + shade(lip, 0.16) + '"/>';
  }

  function facialPath(kind, hairC, skin, clipId) {
    if (!kind) return '';
    if (kind === 3) { // mustache
      return '<path d="M45.2 50.3 Q50 48.5 54.8 50.3 Q52.4 51.6 50 51.4 Q47.6 51.6 45.2 50.3 Z" fill="' + hairC + '" opacity=".92"/>';
    }
    if (kind === 2) { // short beard
      return '<g clip-path="url(#' + clipId + ')">' +
        '<path d="M34 42 C35 51 38.6 57.6 44 59.8 L56 59.8 C61.4 57.6 65 51 66 42 C66 52 60.5 58.8 50 58.8 C39.5 58.8 34 52 34 42 Z" fill="' + hairC + '"/>' +
        '<rect x="34" y="47.5" width="32" height="13" fill="' + hairC + '" opacity=".92"/></g>' +
        '<ellipse cx="50" cy="52.8" rx="6.6" ry="3.7" fill="' + skin + '"/>';
    }
    // 1 — stubble
    return '<g clip-path="url(#' + clipId + ')"><rect x="34" y="45.6" width="32" height="14" fill="' + hairC + '" opacity=".16"/></g>';
  }

  function detailPath(kind, skinDD) {
    if (kind === 1) { // freckles
      return '<g fill="' + skinDD + '" opacity=".5"><circle cx="42" cy="44.4" r=".5"/><circle cx="44.8" cy="45.6" r=".45"/><circle cx="39.8" cy="43.4" r=".45"/><circle cx="58" cy="44.4" r=".5"/><circle cx="55.2" cy="45.6" r=".45"/><circle cx="60.2" cy="43.4" r=".45"/><circle cx="48.4" cy="46.6" r=".4"/><circle cx="51.6" cy="46.6" r=".4"/></g>';
    }
    if (kind === 2) { // blush
      return '<ellipse cx="41.6" cy="44.8" rx="3.2" ry="1.8" fill="#e26d6d" opacity=".2"/><ellipse cx="58.4" cy="44.8" rx="3.2" ry="1.8" fill="#e26d6d" opacity=".2"/>';
    }
    return '';
  }

  // ---- config -> portrait params ----------------------------------------
  function resolve(config) {
    var c = norm(config);
    var skin = SKIN[c.skin], hairC = HAIR[c.hair], bg = BG[c.bg];
    return {
      face: c.face, skin: skin, hair: hairC, hs: c.top,
      bg: [shade(bg, -0.52), shade(bg, -0.72)],
      garbStyle: GARB_STYLE[c.outfit], garbC: OUTFIT[c.outfit],
      acc: ACC_KEYS[c.accessory], glasses: c.glasses,
      eyes: c.eyes, brows: c.brows, mouth: c.mouth,
      facial: c.facial, detail: c.detail,
      iris: IRIS[c.iris],
      browC: shade(hairC, c.hair >= 4 ? -0.42 : 0.06),
      lip: shade(skin, -0.3),
      hideEar: c.top === 13,
      label: 'avatar'
    };
  }

  /* portrait(P, size, opts) — the one renderer.
     opts.view    [x,y,w,h] viewBox crop (builder thumbnails). Drops the
                  circular clip + ring so crops read as clean rectangles.
     opts.talking wraps the head in .ta-face and the animated features in
                  .ta-brows / .ta-eyes / .ta-mouth for mountTalking. */
  function portrait(P, size, opts) {
    opts = opts || {};
    var sz = (size === '100%') ? '100%' : (size || 96);
    var fine = !(typeof sz === 'number' && sz <= 54);
    var id = 'dbp' + (++uid);
    var skin = P.skin, skinD = shade(skin, -0.16), skinDD = shade(skin, -0.3);
    var hair = HAIRSTYLES[P.hs](P.hair);
    var garb = GARB[P.garbStyle](P.garbC, P.garbC2);
    var talking = !!opts.talking;
    var view = opts.view ? opts.view.join(' ') : '0 0 100 100';

    var defs = '<clipPath id="' + id + 'fc"><path d="' + FACES[P.face] + '"/></clipPath>' +
      (opts.view ? '' : '<clipPath id="' + id + '"><circle cx="50" cy="50" r="50"/></clipPath>') +
      '<radialGradient id="' + id + 'bg" cx="66%" cy="18%" r="100%"><stop offset="0%" stop-color="' + shade(P.bg[0], 0.10) + '"/><stop offset="52%" stop-color="' + P.bg[0] + '"/><stop offset="100%" stop-color="' + shade(P.bg[1], -0.06) + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'sk" cx="44%" cy="24%" r="86%"><stop offset="0%" stop-color="' + shade(skin, 0.24) + '"/><stop offset="40%" stop-color="' + shade(skin, 0.06) + '"/><stop offset="66%" stop-color="' + skin + '"/><stop offset="88%" stop-color="' + skinD + '"/><stop offset="100%" stop-color="' + shade(skin, -0.24) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + shade(P.garbC, 0.14) + '"/><stop offset="55%" stop-color="' + P.garbC + '"/><stop offset="100%" stop-color="' + shade(P.garbC, -0.20) + '"/></linearGradient>' +
      // the two soft brushes: all volume below is painted with these, so
      // there is not a single SVG filter in the whole portrait
      '<radialGradient id="' + id + 'hl"><stop offset="0%" stop-color="#fff" stop-opacity=".85"/><stop offset="55%" stop-color="#fff" stop-opacity=".3"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'sh"><stop offset="0%" stop-color="#000" stop-opacity=".7"/><stop offset="55%" stop-color="#000" stop-opacity=".26"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      (opts.view ? '' : '<radialGradient id="' + id + 'vg" cx="50%" cy="42%" r="66%"><stop offset="58%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".3"/></radialGradient>');

    var ears = P.hideEar ? '' :
      '<ellipse cx="33.9" cy="39.4" rx="2.5" ry="4" fill="' + skinD + '"/>' +
      '<ellipse cx="66.1" cy="39.4" rx="2.5" ry="4" fill="' + skin + '"/>' +
      (fine ? '<path d="M33.5 37.6 C34.6 37.9 34.9 39.4 34.1 40.8 M66.5 37.6 C65.4 37.9 65.1 39.4 65.9 40.8" fill="none" stroke="' + skinDD + '" stroke-width=".8" stroke-linecap="round" opacity=".6"/>' : '');

    var browsSvg = browPair(P.brows, P.browC);
    var eyesSvg = eyePair(P.eyes, P.iris, fine);
    var mouthSvg = mouthPath(P.mouth, P.lip, fine);
    if (talking) {
      browsSvg = '<g class="ta-brows">' + browsSvg + '</g>';
      eyesSvg = '<g class="ta-eyes">' + eyesSvg + '</g>';
      mouthSvg = '<g class="ta-mouth">' + mouthSvg + '</g>';
    }

    var headBlock =
      // neck with the head's cast shadow (the big depth tell)
      '<path d="M44.6 52 L55.4 52 L55.8 69 L44.2 69 Z" fill="' + skinD + '"/>' +
      '<ellipse cx="50" cy="56.5" rx="7.4" ry="4.6" fill="url(#' + id + 'sh)" opacity=".55"/>' +
      ears +
      // head
      '<path d="' + FACES[P.face] + '" fill="url(#' + id + 'sk)"/>' +
      // volume: under-hair occlusion, socket shading, core shadow, key light
      '<ellipse cx="50" cy="24.5" rx="14.5" ry="4.4" fill="url(#' + id + 'sh)" opacity=".3"/>' +
      (fine ? '<ellipse cx="44" cy="37.4" rx="4.8" ry="2.8" fill="url(#' + id + 'sh)" opacity=".16"/>' +
              '<ellipse cx="56" cy="37.4" rx="4.8" ry="2.8" fill="url(#' + id + 'sh)" opacity=".16"/>' : '') +
      '<ellipse cx="38.6" cy="43" rx="4.6" ry="10.5" fill="url(#' + id + 'sh)" opacity=".26"/>' +
      (fine ? '<ellipse cx="53.5" cy="27.5" rx="8.6" ry="4.8" fill="url(#' + id + 'hl)" opacity=".22"/>' +
              '<ellipse cx="59.5" cy="42.5" rx="4.4" ry="3.4" fill="url(#' + id + 'hl)" opacity=".16"/>' +
              '<ellipse cx="50.8" cy="45.4" rx="1.8" ry="1.6" fill="url(#' + id + 'hl)" opacity=".22"/>' +
              '<ellipse cx="50.5" cy="55.6" rx="3" ry="1.6" fill="url(#' + id + 'hl)" opacity=".14"/>' : '') +
      facialPath(P.facial, P.hair, skin, id + 'fc') +
      detailPath(P.detail, skinDD) +
      browsSvg +
      eyesSvg +
      nosePath(skinDD, fine) +
      mouthSvg +
      // rim light down the lit side
      '<path d="' + RIM + '" fill="none" stroke="#fff" stroke-linecap="round" stroke-width=".9" opacity=".32"/>' +
      (fine ? '<path d="' + RIM + '" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="2.4" opacity=".1"/>' : '') +
      hair.front +
      // hair specular sweep
      (P.hs !== 0 && fine ? '<ellipse cx="55" cy="18.5" rx="9" ry="3" fill="url(#' + id + 'hl)" opacity=".18" transform="rotate(8 55 18.5)"/>' +
        '<ellipse cx="42" cy="17.5" rx="5" ry="2.2" fill="url(#' + id + 'hl)" opacity=".12"/>' : '') +
      glassesPath(P.glasses) +
      ACC[P.acc]();
    if (talking) headBlock = '<g class="ta-face">' + headBlock + '</g>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + view + '" width="' + sz + '" height="' + sz + '" role="img" aria-label="' + (P.label || 'avatar') + '"' + (talking ? ' data-av-id="' + id + '"' : '') + ' style="display:block">' +
      '<defs>' + defs + '</defs>' +
      (opts.view ? '<g>' : '<g clip-path="url(#' + id + ')">') +
      '<rect x="-12" y="-12" width="124" height="124" fill="url(#' + id + 'bg)"/>' +
      // studio depth: soft glow behind the bust
      '<ellipse cx="57" cy="34" rx="30" ry="27" fill="url(#' + id + 'hl)" opacity=".1"/>' +
      // the 1.3x studio zoom: heads read at chip size, anatomy stays human
      '<g transform="translate(50 40) scale(1.3) translate(-50 -40)">' +
      hair.back +
      // shoulders + fabric light
      '<path d="M26 100 C27 81 36.5 71.5 50 70 C63.5 71.5 73 81 74 100 Z" fill="url(#' + id + 'gb)"/>' +
      '<path d="M33 82 C37 75.5 43 71.6 50 71 C57 71.6 63 75.5 67 82" fill="none" stroke="' + shade(P.garbC, 0.26) + '" stroke-width="2" stroke-linecap="round" opacity=".35"/>' +
      garb +
      // chest occlusion under the jawline
      '<ellipse cx="50" cy="70.5" rx="11" ry="3" fill="url(#' + id + 'sh)" opacity=".3"/>' +
      headBlock +
      '</g>' +
      (opts.view ? '' : '<rect width="100" height="100" fill="url(#' + id + 'vg)"/>' +
        '<circle cx="50" cy="50" r="48.8" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width=".8"/>') +
      '</g></svg>';
  }

  function svg(config, size, opts) {
    return portrait(resolve(config), size, opts);
  }

  // ---- Talking avatar (live lip-sync + expressions) --------------------
  // Same portrait, with eyes / brows / mouth in addressable groups inside
  // .ta-face so a controller can animate them from live audio + coach
  // state. The dynamic feature renderers use flat colors only, so the
  // re-rendered groups never lose gradient references.

  function dynMouth(open, emotion, shape, lip) {
    var corner = emotion === 'encouraging' ? 0.8 : (emotion === 'pushing' ? -0.5 : 0);
    open = open < 0 ? 0 : open > 1 ? 1 : open;
    shape = shape == null ? 0.5 : (shape < 0 ? 0 : shape > 1 ? 1 : shape);
    if (open < 0.07) {
      // closed lips with a corner-lift for emotion
      var cU = (51.8 - corner).toFixed(2), cD = (52.9 - corner).toFixed(2);
      return '<path d="M45.6 ' + cU + ' Q47.8 50.6 50 51.5 Q52.2 50.6 54.4 ' + cU + ' Q52.2 53.2 50 53.1 Q47.8 53.2 45.6 ' + cU + ' Z" fill="' + lip + '"/>' +
        '<path d="M46.3 ' + cD + ' Q50 55.4 53.7 ' + cD + ' Q52 54.7 50 54.7 Q48 54.7 46.3 ' + cD + ' Z" fill="' + shade(lip, 0.16) + '"/>';
    }
    var w = (3.2 + shape * 2.3).toFixed(2);
    var up = (0.7 + open * 1.1 + corner).toFixed(2);
    var dn = (0.9 + open * 4.4).toFixed(2);
    var s = '<path d="M' + (50 - w) + ' 52 Q50 ' + (52 - up) + ' ' + (50 + (+w)) + ' 52 Q50 ' + (52 + (+dn)) + ' ' + (50 - w) + ' 52 Z" fill="#4b2426"/>';
    if (open > 0.24) {
      s += '<path d="M' + (50 - w + 0.8).toFixed(2) + ' 51.9 Q50 ' + (52 - up * 0.72).toFixed(2) + ' ' + (50 + (+w) - 0.8).toFixed(2) + ' 51.9 L' + (50 + (+w) - 1.2).toFixed(2) + ' 52.5 Q50 52.9 ' + (50 - w + 1.2).toFixed(2) + ' 52.5 Z" fill="#f3eee4"/>';
    }
    s += '<path d="M' + (50 - w) + ' 52.2 Q50 ' + (52 + (+dn) + 1.2).toFixed(2) + ' ' + (50 + (+w)) + ' 52.2" fill="none" stroke="' + shade(lip, 0.12) + '" stroke-width="1.1" stroke-linecap="round" opacity=".65"/>';
    return s;
  }

  function dynEyes(openFrac, gx, gy, irisCol) {
    openFrac = openFrac < 0 ? 0 : openFrac > 1 ? 1 : openFrac;
    gx = gx || 0; gy = gy || 0;
    function eye(cx) {
      if (openFrac < 0.18) {
        return '<path d="M' + (cx - 3.4) + ' 38.6 Q' + cx + ' 39.6 ' + (cx + 3.4) + ' 38.6" fill="none" stroke="#1d1712" stroke-width="1.3" stroke-linecap="round"/>';
      }
      var h = (2.5 * openFrac).toFixed(2);
      var ix = (cx + gx * 1.1).toFixed(2), iy = (38.4 + gy * 0.8).toFixed(2);
      return '<path d="M' + (cx - 3.4) + ' 38.3 Q' + cx + ' ' + (38.3 - h) + ' ' + (cx + 3.4) + ' 38.3 Q' + cx + ' ' + (38.3 + h * 0.85).toFixed(2) + ' ' + (cx - 3.4) + ' 38.3 Z" fill="#fdfcf9"/>' +
        '<circle cx="' + ix + '" cy="' + iy + '" r="1.85" fill="' + irisCol + '"/>' +
        '<circle cx="' + ix + '" cy="' + iy + '" r=".95" fill="#17120d"/>' +
        '<circle cx="' + (+ix + 0.7).toFixed(2) + '" cy="' + (+iy - 0.8).toFixed(2) + '" r=".5" fill="#fff"/>' +
        '<path d="M' + (cx - 3.6) + ' 37.9 Q' + cx + ' 35.4 ' + (cx + 3.6) + ' 37.9" fill="none" stroke="#1d1712" stroke-width="1.25" stroke-linecap="round"/>';
    }
    return eye(44) + eye(56);
  }

  function dynBrows(raise, angle, browC) {
    var r = raise || 0, a = angle || 0;
    function brow(cx) {
      var inner = cx < 50 ? cx + 4 : cx - 4;
      var outer = cx < 50 ? cx - 4 : cx + 4;
      return '<path d="M' + outer + ' ' + (33.9 - r).toFixed(2) + ' Q' + cx + ' ' + (32.3 - r).toFixed(2) + ' ' + inner + ' ' + (33.9 - r + a).toFixed(2) + '" fill="none" stroke="' + browC + '" stroke-width="1.5" stroke-linecap="round"/>';
    }
    return brow(44) + brow(56);
  }

  function talkingSvg(config, size) {
    var P = resolve(config);
    return portrait(P, size, { talking: true });
  }

  function tnow() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  // mountTalking(container, config, opts) -> controller
  function mountTalking(container, config, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return null;
    var P = resolve(config);
    container.innerHTML = talkingSvg(config, opts.size || '100%');
    var svgEl = container.querySelector('svg');
    var faceEl = container.querySelector('.ta-face');
    var browsEl = container.querySelector('.ta-brows');
    var eyesEl = container.querySelector('.ta-eyes');
    var mouthEl = container.querySelector('.ta-mouth');
    if (!faceEl) return null;

    var state = 'idle', emoOverride = null;
    var faceScale = opts.faceScale || 1;
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
      if (mk !== lastMouth) { mouthEl.innerHTML = dynMouth(mo, emo, mouthShape, P.lip); lastMouth = mk; }

      var eyeOpen = 1;
      if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
      if (blinkStart >= 0) {
        var bt = (now - blinkStart) / 120;
        if (bt >= 1) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 3800; eyeOpen = 1; }
        else eyeOpen = bt < 0.5 ? 1 - bt * 2 : (bt - 0.5) * 2;
      }
      var g = gaze();
      var ek = Math.round(eyeOpen * 10) + '|' + g.x + '|' + g.y;
      if (ek !== lastEyes) { eyesEl.innerHTML = dynEyes(eyeOpen, g.x, g.y, P.iris); lastEyes = ek; }

      var bp = browParams();
      var bk = bp.raise + '|' + bp.angle;
      if (bk !== lastBrows) { browsEl.innerHTML = dynBrows(bp.raise, bp.angle, P.browC); lastBrows = bk; }

      var breathe = reduce ? 0 : Math.sin(t * 1.15) * 0.4;
      var bob = reduce ? 0 : (state === 'talking' ? -amp * 1.6 : Math.sin(t * 1.7) * 0.2);
      var tx = reduce ? 0 : (state === 'listening' ? 0.5 + Math.sin(t * 1.3) * 0.16 : (state === 'thinking' ? -0.5 : Math.sin(t * 1.1) * 0.12));
      var rot = reduce ? 0 : (state === 'thinking' ? -2 : (state === 'listening' ? 1.2 : (state === 'talking' ? Math.sin(t * 5.4) * 0.9 : Math.sin(t * 1.2) * 0.4)));
      faceEl.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + (breathe + bob).toFixed(2) + ') rotate(' + rot.toFixed(2) + ' 50 42)' + (faceScale === 1 ? '' : ' translate(50 42) scale(' + faceScale.toFixed(2) + ') translate(-50 -42)'));

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
        P = resolve(cfg);
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
  // Configs tuned to each debater's identity; rendered by the studio
  // engine like everyone else, so the cast and the users share one look.
  var PRESETS = {
    verse:    { face: 1, skin: 1, hair: 2, top: 1,  eyes: 0, brows: 0, mouth: 0, facial: 0, glasses: 0, accessory: 0, bg: 7, outfit: 0, iris: 0, detail: 0 }, // All-Rounder
    ash:      { face: 1, skin: 2, hair: 0, top: 2,  eyes: 3, brows: 2, mouth: 4, facial: 1, glasses: 2, accessory: 0, bg: 0, outfit: 7, iris: 1, detail: 0 }, // Prosecutor
    coral:    { face: 2, skin: 2, hair: 0, top: 8,  eyes: 1, brows: 1, mouth: 1, facial: 0, glasses: 0, accessory: 3, bg: 6, outfit: 5, iris: 4, detail: 1 }, // Quick Wit (braids, freckles)
    sage:     { face: 0, skin: 1, hair: 1, top: 3,  eyes: 2, brows: 0, mouth: 0, facial: 1, glasses: 1, accessory: 0, bg: 5, outfit: 3, iris: 2, detail: 0 }, // Philosopher
    ballad:   { face: 2, skin: 3, hair: 2, top: 10, eyes: 0, brows: 0, mouth: 1, facial: 0, glasses: 0, accessory: 0, bg: 2, outfit: 6, iris: 0, detail: 0 }, // Storyteller
    shimmer:  { face: 2, skin: 3, hair: 0, top: 9,  eyes: 0, brows: 1, mouth: 0, facial: 0, glasses: 0, accessory: 2, bg: 4, outfit: 4, iris: 0, detail: 0 }, // Diplomat (ponytail)
    echo:     { face: 1, skin: 1, hair: 0, top: 5,  eyes: 3, brows: 2, mouth: 2, facial: 0, glasses: 0, accessory: 0, bg: 3, outfit: 0, iris: 5, detail: 0 }, // Closer
    alloy:    { face: 0, skin: 2, hair: 2, top: 11, eyes: 0, brows: 0, mouth: 2, facial: 0, glasses: 2, accessory: 1, bg: 8, outfit: 2, iris: 3, detail: 0 }, // Strategist (coils + headphones)
    examiner: { face: 1, skin: 3, hair: 1, top: 2,  eyes: 2, brows: 2, mouth: 2, facial: 3, glasses: 2, accessory: 0, bg: 5, outfit: 7, iris: 1, detail: 0 }  // Examiner
  };
  function persona(key, size) {
    return svg(PRESETS[key] || PRESETS.verse, size || 42);
  }

  // ---- CAMEO cast — the named persona portraits -------------------------
  // Kept as explicit param sets (they predate the parametric engine and
  // their exact looks are matched to the voice cast). They render through
  // the same portrait() as everyone else.
  var CAMEOS = [
    { name: 'Sam',   face: 1, skin: '#e8c19e', hair: '#3a2a1c', bg: ['#2e3644', '#1d232e'], garb: ['crew', '#39404c'],       acc: 'none',    glasses: 0, hs: 1  },
    { name: 'Claire',face: 2, skin: '#f0d4bb', hair: '#6b4423', bg: ['#1d2b45', '#101a2e'], garb: ['crew', '#c8a878'],       acc: 'none',    glasses: 0, hs: 4  },
    { name: 'Alex',  face: 0, skin: '#e2b48c', hair: '#241a12', bg: ['#39424e', '#232a34'], garb: ['crew', '#30343c'],       acc: 'none',    glasses: 2, hs: 2  },
    { name: 'Maya',  face: 2, skin: '#c78d5d', hair: '#17110c', bg: ['#4a2a2e', '#2e1a1d'], garb: ['turtleneck', '#e8e0d2'], acc: 'stud',    glasses: 0, hs: 8  },
    { name: 'Tom',   face: 1, skin: '#f3dcc4', hair: '#8a6842', bg: ['#25382c', '#16241b'], garb: ['zip', '#31363f'],        acc: 'none',    glasses: 0, hs: 7  },
    { name: 'Elena', face: 2, skin: '#d9a97e', hair: '#2a1c12', bg: ['#3a2440', '#241329'], garb: ['blazer', '#23242b', '#f2ede4'], acc: 'hoop', glasses: 0, hs: 5 },
    { name: 'Jun',   face: 0, skin: '#edc9a4', hair: '#17120e', bg: ['#173a3a', '#0d2424'], garb: ['turtleneck', '#3c4650'], acc: 'none',    glasses: 0, hs: 6  },
    { name: 'Amara', face: 0, skin: '#b97f52', hair: '#000000', bg: ['#41432e', '#28291c'], garb: ['crew', '#5c4a5e'],       acc: 'none',    glasses: 0, hs: 13 },
    { name: 'Marcus',face: 1, skin: '#7a4e2e', hair: '#14100c', bg: ['#432832', '#2a1820'], garb: ['crew', '#28303a'],       acc: 'none',    glasses: 0, hs: 11 },
    { name: 'Nina',  face: 2, skin: '#f3ddc8', hair: '#a5713f', bg: ['#2b2b31', '#1a1a1f'], garb: ['turtleneck', '#4a4e58'], acc: 'none',    glasses: 2, hs: 10 },
    { name: 'Priya', face: 0, skin: '#c99a6b', hair: '#221510', bg: ['#1f3050', '#122036'], garb: ['crew', '#7a3d46'],       acc: 'stud',    glasses: 0, hs: 9  },
    { name: 'David', face: 1, skin: '#9c6b40', hair: '#0e0b08', bg: ['#4a443c', '#2d2924'], garb: ['hoodie', '#3d4450'],     acc: 'none',    glasses: 0, hs: 12 }
  ];
  function cameoSvg(idx, size) {
    var A = CAMEOS[((idx % CAMEOS.length) + CAMEOS.length) % CAMEOS.length];
    return portrait({
      face: A.face, skin: A.skin, hair: A.hair, hs: A.hs,
      bg: A.bg, garbStyle: A.garb[0], garbC: A.garb[1], garbC2: A.garb[2],
      acc: A.acc, glasses: A.glasses || 0,
      eyes: 0, brows: A.face === 1 ? 1 : A.face === 2 ? 2 : 0, mouth: 0,
      facial: 0, detail: 0,
      iris: '#3b2a1c', browC: shade(A.hair === '#000000' ? '#2a2a2a' : A.hair, 0.06),
      lip: shade(A.skin, -0.3), hideEar: A.hs === 13, label: A.name
    }, size);
  }
  // persona key → cameo index (identity-matched to the voice cast)
  var CAMEO_MAP = { verse: 2, ash: 9, coral: 3, sage: 8, ballad: 1, shimmer: 5, echo: 0, alloy: 10, examiner: 4 };
  function cameo(key, size) {
    var i = (typeof key === 'number') ? key : (CAMEO_MAP[key] != null ? CAMEO_MAP[key] : 0);
    return cameoSvg(i, size);
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
  // ---- picture set -----------------------------------------------------
  /* The set itself lives in js/pfp-set.js so the landing can render it
     without pulling this 80KB engine in. Loaded on demand here: an account
     that never picked one never fetches it. */
  function pfpLib() { return global.DBPfp || null; }
  function loadPfpLib(cb) {
    if (pfpLib()) { cb(pfpLib()); return; }
    var tag = document.querySelector('script[data-db-pfp]');
    if (tag) { tag.addEventListener('load', function () { cb(pfpLib()); }); return; }
    tag = document.createElement('script');
    tag.src = '/js/pfp-set.js';
    tag.setAttribute('data-db-pfp', '1');
    tag.onload = function () { cb(pfpLib()); };
    tag.onerror = function () { cb(null); };
    document.head.appendChild(tag);
  }
  function getPfp() {
    try { return global.localStorage.getItem(PFP_KEY) || null; } catch (e) { return null; }
  }
  function setPfp(id) {
    try {
      global.localStorage.setItem(PFP_KEY, String(id));
      global.localStorage.setItem(PREF_KEY, 'pfp');
    } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(EVT, { detail: null })); } catch (e) {}
    return id;
  }
  function getPfpIdentity() {
    var id = getPfp();
    return id ? { kind:'pfp', id:id } : null;
  }
  function pref() {
    try { return global.localStorage.getItem(PREF_KEY) || ''; } catch (e) { return ''; }
  }
  function getPublicIdentity() {
    /* The kind they chose LAST wins, which is the only reading of "I picked
       this" that does not quietly overrule them. Everything below it is the
       pre-2026-08-24 order, so an account that never opened the picker is
       unaffected. */
    var p = pref();
    if (p === 'pfp') { var chosen = getPfpIdentity(); if (chosen) return chosen; }
    if (p === 'portrait') { var mine = getUser(); if (mine) return { kind:'portrait', config:mine }; }
    var live = getLiveIdentity();
    if (live) return live;
    var portrait = getUser();
    if (portrait) return { kind:'portrait', config:portrait };
    return getPfpIdentity();
  }
  function normPublicIdentity(value) {
    value = value || {};
    if (value.kind === 'live' && value.design) {
      return { kind:'live', name:String(value.name || 'Avatar').slice(0,32), lookId:String(value.lookId || '').slice(0,64), design:normLiveDesign(value.design) };
    }
    if (value.kind === 'portrait' && value.config) return { kind:'portrait', config:norm(value.config) };
    /* An id, checked against the set rather than trusted. The id is what
       gets stored on an account and passed through the API, so an unknown
       one (a renamed tile, a hand-edited record) resolves to null and the
       caller falls back rather than rendering an empty box. */
    if (value.kind === 'pfp' && typeof value.id === 'string') {
      var lib = pfpLib();
      if (!lib) return { kind:'pfp', id:value.id.slice(0, 32) };   // set not loaded yet
      return lib.has(value.id) ? { kind:'pfp', id:value.id } : null;
    }
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
    if (id && id.kind === 'pfp') {
      var lib = pfpLib();
      var art = lib && lib.svg(id.id, size);
      if (art) return art;
      // The set has not landed. Load it and let the live listeners repaint,
      // rather than drawing a stranger's face in the meantime.
      loadPfpLib(function () { try { global.dispatchEvent(new CustomEvent(EVT, { detail: null })); } catch (e) {} });
      return '';
    }
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
      face: p(N_FACE),
      skin: p(SKIN.length), hair: p(HAIR.length),
      top: p(N_TOP - 1),                                  // hijab is a deliberate choice, never assigned at random
      eyes: p(N_EYES), brows: p(N_BROWS), mouth: p(N_MOUTH),
      facial: (rnd() < 0.72 ? 0 : p(N_FACIAL)),           // mostly clean
      glasses: (rnd() < 0.6 ? 0 : p(N_GLASSES)),
      accessory: (rnd() < 0.68 ? 0 : p(N_ACC)),           // gear is a highlight, not the norm
      iris: (rnd() < 0.6 ? p(2) : p(IRIS.length)),        // naturals dominate
      detail: (rnd() < 0.78 ? 0 : 1 + p(N_DETAIL - 1)),   // details are a garnish
      bg: p(BG.length), outfit: p(OUTFIT.length)
    });
  }

  // ---- theme helper -----------------------------------------------------
  function isLight() {
    var el = document.documentElement;
    return el.getAttribute('data-lighting') === 'light' || el.getAttribute('data-theme') === 'light';
  }

  // ---- builder modal ----------------------------------------------------
  // Every option row renders a CROP of the live portrait zoomed on the
  // feature it changes, so a brow option shows brows, not five identical
  // whole faces. view = [x,y,w,h] in the portrait's final coordinates;
  // h = chip height in px (width follows the crop's aspect).
  var ROWS = [
    { group: 'Face' },
    { key: 'face', label: 'Face shape', n: N_FACE, view: [27, 4, 46, 62], h: 68 },
    { key: 'skin', label: 'Skin', pal: SKIN },
    { key: 'detail', label: 'Details', n: N_DETAIL, view: [30, 39, 40, 14], h: 34 },
    { group: 'Hair' },
    { key: 'top', label: 'Style', n: N_TOP, view: [16, -4, 68, 66], h: 62 },
    { key: 'hair', label: 'Color', pal: HAIR },
    { key: 'facial', label: 'Facial hair', n: N_FACIAL, view: [28, 44, 44, 24], h: 46 },
    { group: 'Expression' },
    { key: 'eyes', label: 'Eyes', n: N_EYES, view: [32, 31, 36, 13], h: 34 },
    { key: 'iris', label: 'Eye color', pal: IRIS },
    { key: 'brows', label: 'Brows', n: N_BROWS, view: [32, 26, 36, 12], h: 30 },
    { key: 'mouth', label: 'Mouth', n: N_MOUTH, view: [38, 50, 24, 14], h: 42 },
    { group: 'Style' },
    { key: 'glasses', label: 'Glasses', n: N_GLASSES, view: [28, 29, 44, 18], h: 38 },
    { key: 'accessory', label: 'Gear', n: N_ACC, view: [22, 10, 56, 42], h: 50 },
    { key: 'outfit', label: 'Outfit', n: OUTFIT.length, view: [18, 64, 64, 36], h: 50 },
    { key: 'bg', label: 'Backdrop', pal: BG, duo: true }
  ];

  function openBuilder(opts) {
    opts = opts || {};
    if (document.querySelector('[data-dbav-modal]')) return; // one at a time
    var light = isLight();
    var surf = light ? '#ffffff' : '#15151b';
    var surf2 = light ? '#f5f4ef' : '#1d1d25';
    var txt = light ? '#1a1a1e' : '#f2f2f5';
    var dim = light ? 'rgba(0,0,0,.52)' : 'rgba(255,255,255,.55)';
    var bd = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)';
    var sel = '#dc2626';

    var cfg = norm(getUser() || randomConfig());
    /* Which of the two things in this modal the debater is choosing. It
       starts on whatever they last chose, so reopening the builder shows
       them their own face rather than resetting to the designer. */
    var mode = (pref() === 'pfp' && getPfp()) ? 'pfp' : 'portrait';
    var pfpId = getPfp();
    var lastFocus = document.activeElement;
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the page must not scroll under the modal

    var back = document.createElement('div');
    back.setAttribute('data-dbav-modal', '1');
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-label', 'Design your avatar');
    // z-index sits above the onboarding card (2147483501). The builder is
    // opened FROM that card, so anything lower opens behind it.
    back.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,6,10,.66);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)';

    var box = document.createElement('div');
    box.style.cssText = 'width:min(780px,96vw);max-height:92vh;display:flex;flex-direction:column;background:' + surf + ';color:' + txt + ';border:1px solid ' + bd + ';border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.45);font-family:inherit;overflow:hidden';
    back.appendChild(box);

    // header with live preview
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:20px;padding:18px 24px;border-bottom:1px solid ' + bd + ';flex-shrink:0';
    var prev = document.createElement('div');
    prev.style.cssText = 'width:104px;height:104px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 14px 36px rgba(0,0,0,.28)';
    var htxt = document.createElement('div');
    htxt.style.cssText = 'flex:1;min-width:0';
    htxt.innerHTML = '<div style="font-size:.64rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:' + sel + ';margin-bottom:5px">Your identity</div>' +
      '<div style="font-size:1.24rem;font-weight:800;letter-spacing:-.01em">Design your avatar</div>' +
      '<div style="font-size:.84rem;color:' + dim + ';margin-top:4px;line-height:1.35">One face, everywhere you debate: your brain, coach sessions, and live rooms.</div>';
    head.appendChild(prev); head.appendChild(htxt);
    box.appendChild(head);

    var body = document.createElement('div');
    body.style.cssText = 'padding:4px 24px 12px;overflow:auto;flex:1;overscroll-behavior:contain';
    box.appendChild(body);

    function renderPreview() {
      var lib = pfpLib();
      prev.innerHTML = (mode === 'pfp' && pfpId && lib) ? lib.svg(pfpId, '100%') : svg(cfg, '100%');
    }

    var swatchEls = []; // { key, i, node }
    var shapeEls = [];  // { key, i, node, view }

    /* ── Pick a picture ───────────────────────────────────────────────
       2026-08-24, Aidan: "those should be options yea". The drawn set was
       already what a debater wore when they had not chosen anything; this
       makes choosing one a first-class option beside designing a portrait.
       It sits ABOVE the designer because it is the one-tap answer and the
       designer is the long one, and because most people want a picture,
       not a character sheet. */
    function mountPicker() {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'padding:14px 0 4px';
      var h = document.createElement('div');
      h.textContent = 'Pick a picture';
      h.style.cssText = 'font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:' + txt + ';margin:4px 0 2px;padding-bottom:6px;border-bottom:2px solid ' + sel;
      wrap.appendChild(h);
      var note = document.createElement('div');
      note.textContent = 'One tap. Or design your own further down.';
      note.style.cssText = 'font-size:.74rem;color:' + dim + ';margin:8px 0 10px';
      wrap.appendChild(note);
      var grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:8px';
      wrap.appendChild(grid);
      body.appendChild(wrap);

      loadPfpLib(function (lib) {
        if (!lib) { wrap.style.display = 'none'; return; }
        var tiles = [];
        lib.list.forEach(function (item) {
          var b = document.createElement('button');
          b.type = 'button';
          b.title = item.name;
          b.setAttribute('aria-label', item.name);
          b.style.cssText = 'width:100%;aspect-ratio:1;padding:0;border-radius:14px;overflow:hidden;cursor:pointer;background:none;border:2px solid transparent;transition:transform .12s,border-color .12s';
          b.innerHTML = lib.svg(item.id, '100%');
          b.addEventListener('click', function () {
            mode = 'pfp'; pfpId = item.id;
            paintTiles(); renderPreview();
          });
          grid.appendChild(b);
          tiles.push({ id: item.id, node: b });
        });
        function paintTiles() {
          tiles.forEach(function (t) {
            var on = (mode === 'pfp' && t.id === pfpId);
            t.node.style.borderColor = on ? sel : 'transparent';
            t.node.style.transform = on ? 'scale(1.06)' : 'none';
          });
        }
        pickerPaint = paintTiles;
        paintTiles();
        renderPreview();
      });
    }
    var pickerPaint = function () {};

    function groupHead(label) {
      var g = document.createElement('div');
      g.textContent = label;
      g.style.cssText = 'font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:' + txt + ';margin:18px 0 2px;padding-bottom:6px;border-bottom:2px solid ' + sel;
      body.appendChild(g);
    }
    function rowWrap(label) {
      var w = document.createElement('div');
      w.style.cssText = 'padding:11px 0 12px;border-bottom:1px solid ' + bd;
      var l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:' + dim + ';margin-bottom:8px';
      w.appendChild(l);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
      w.appendChild(row);
      body.appendChild(w);
      return row;
    }

    function refreshSelected() {
      swatchEls.forEach(function (o) {
        var on = cfg[o.key] === o.i;
        o.node.style.outline = on ? '2.5px solid ' + sel : '2.5px solid transparent';
        o.node.style.outlineOffset = '2px';
        o.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      shapeEls.forEach(function (o) {
        var on = cfg[o.key] === o.i;
        o.node.style.borderColor = on ? sel : bd;
        o.node.style.boxShadow = on ? '0 0 0 1px ' + sel : 'none';
        o.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      renderPreview();
    }

    // Shape thumbnails depend on every other field, so a change re-renders
    // them; batched into one animation frame so a click never re-renders
    // sixty SVGs more than once.
    var thumbRaf = 0;
    function refreshShapeThumbs() {
      if (thumbRaf) return;
      thumbRaf = requestAnimationFrame(function () {
        thumbRaf = 0;
        shapeEls.forEach(function (o) {
          var variant = norm(cfg); variant[o.key] = o.i;
          o.node.innerHTML = svg(variant, '100%', { view: o.view });
        });
      });
    }
    /* Touching any control down here IS choosing the designed portrait, so
       the mode follows the hand rather than needing its own toggle. */
    function pick(key, i) { cfg[key] = i; mode = 'portrait'; pickerPaint(); refreshSelected(); refreshShapeThumbs(); }

    mountPicker();
    ROWS.forEach(function (f) {
      if (f.group) { groupHead(f.group); return; }
      var row = rowWrap(f.label);
      if (f.pal) {
        f.pal.forEach(function (col, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', f.label + ' option ' + (i + 1));
          var fill = f.duo
            ? 'background:radial-gradient(circle at 34% 26%,' + shade(col, -0.44) + ',' + shade(col, -0.72) + ')'
            : 'background:' + col;
          b.style.cssText = 'width:32px;height:32px;border-radius:50%;border:1px solid ' + bd + ';cursor:pointer;padding:0;' + fill + ';box-shadow:inset 0 1px 0 rgba(255,255,255,.3)';
          b.addEventListener('click', function () { pick(f.key, i); });
          row.appendChild(b);
          swatchEls.push({ key: f.key, i: i, node: b });
        });
        return;
      }
      for (var i = 0; i < f.n; i++) {
        (function (i) {
          var variant = norm(cfg); variant[f.key] = i;
          var w = Math.round(Math.min(116, Math.max(44, f.h * f.view[2] / f.view[3])));
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', f.label + ' option ' + (i + 1));
          b.style.cssText = 'width:' + w + 'px;height:' + f.h + 'px;border-radius:12px;border:1.5px solid ' + bd + ';cursor:pointer;padding:0;overflow:hidden;background:transparent;transition:transform .13s,border-color .12s;display:block';
          b.addEventListener('mouseenter', function () { b.style.transform = 'translateY(-2px)'; });
          b.addEventListener('mouseleave', function () { b.style.transform = ''; });
          b.innerHTML = svg(variant, '100%', { view: f.view });
          b.addEventListener('click', function () { pick(f.key, i); });
          row.appendChild(b);
          shapeEls.push({ key: f.key, i: i, node: b, view: f.view });
        })(i);
      }
    });

    // footer
    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:10px;align-items:center;padding:14px 24px 16px;background:' + surf + ';border-top:1px solid ' + bd + ';flex-shrink:0';
    var rand = document.createElement('button');
    rand.type = 'button';
    rand.textContent = 'Surprise me';
    rand.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:600;color:' + txt + ';background:' + surf2 + ';border:1px solid ' + bd + ';border-radius:999px;padding:10px 16px;cursor:pointer';
    rand.addEventListener('click', function () {
      var lib = pfpLib();
      if (mode === 'pfp' && lib && lib.list.length) {
        pfpId = lib.list[Math.floor(Math.random() * lib.list.length)].id;
        pickerPaint(); renderPreview(); return;
      }
      cfg = randomConfig(); refreshSelected(); refreshShapeThumbs();
    });
    var spacer = document.createElement('div'); spacer.style.flex = '1';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:600;color:' + dim + ';background:transparent;border:none;cursor:pointer;padding:10px 12px';
    var save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save avatar';
    save.style.cssText = 'font-family:inherit;font-size:.82rem;font-weight:700;color:#fff;background:' + sel + ';border:none;border-radius:999px;padding:10px 20px;cursor:pointer;box-shadow:0 6px 20px rgba(220,38,38,.35)';
    foot.appendChild(rand); foot.appendChild(spacer); foot.appendChild(cancel); foot.appendChild(save);
    box.appendChild(foot);

    function close() {
      if (thumbRaf) cancelAnimationFrame(thumbRaf);
      if (back.parentNode) back.parentNode.removeChild(back);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    cancel.addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    save.addEventListener('click', function () {
      /* Both are kept. Saving a picture does not throw away a portrait
         somebody designed, and saving a portrait does not forget the
         picture they had; only the preference moves. */
      var saved;
      if (mode === 'pfp' && pfpId) {
        saved = { kind:'pfp', id:setPfp(pfpId) };
      } else {
        saved = setUser(cfg);
        try { global.localStorage.setItem(PREF_KEY, 'portrait'); } catch (e) {}
      }
      if (typeof opts.onSave === 'function') { try { opts.onSave(saved); } catch (e) {} }
      close();
    });

    document.body.appendChild(back);
    refreshSelected();
    save.focus();
  }

  // ---- welcome-home card -----------------------------------------------
  // Self-contained: fills `node` and re-renders itself when the avatar
  // changes, so it stays correct regardless of the host framework.
  function mountWelcome(node, user) {
    if (!node) return;
    if (node.__dbavHandler) { global.removeEventListener(EVT, node.__dbavHandler); global.removeEventListener(LIVE_EVT, node.__dbavHandler); }
    // Greet by the public alias when it is available, so a real first
    // name never appears beside an aliased portrait.
    var first = (function () {
      try {
        if (user && global.DBIdentity && global.DBIdentity.forUser) {
          var idw = global.DBIdentity.forUser(user);
          if (idw && idw.name) return idw.name.split(/\s+/)[0];
        }
      } catch (e) {}
      return '';
    })();

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
    function render() {
      var currentIdentity = getPublicIdentity();
      var has = !!currentIdentity;
      var av = has
        ? '<div style="width:64px;height:64px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.22)">' + publicSvg(currentIdentity, '100%') + '</div>'
        : '<div style="width:64px;height:64px;border-radius:50%;flex-shrink:0;overflow:hidden;opacity:.55">' + svg(randomConfig('preview'), '100%') + '</div>';
      var title = has
        ? (first ? 'Welcome back, ' + esc(first) + '.' : 'Welcome back.')
        : 'Make it yours.';
      var sub = has
        ? 'Your avatar is in your corner. Warm it up before the next round.'
        : 'Design the face that fronts your rounds. It greets you here every time you come home.';
      var btn = has ? 'Customize' : 'Create your avatar';

      node.innerHTML =
        '<div style="margin-top:24px;padding:16px 18px;background:var(--c-surface,rgba(127,127,127,.05));border:1px solid var(--c-border2,rgba(127,127,127,.2));border-radius:14px;display:flex;align-items:center;gap:16px;text-align:left">' +
          av +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:1.02rem;font-weight:800;color:var(--c-bright,inherit);letter-spacing:-.01em">' + title + '</div>' +
            '<div style="font-size:.8rem;color:var(--c-text3,rgba(127,127,127,.75));margin-top:3px">' + sub + '</div>' +
          '</div>' +
          '<button type="button" data-dbav-edit style="flex-shrink:0;font-family:inherit;font-size:.78rem;font-weight:700;color:#fff;background:#dc2626;border:none;border-radius:999px;padding:9px 16px;cursor:pointer;box-shadow:0 4px 16px rgba(220,38,38,.3)">' + btn + '</button>' +
        '</div>';
      var b = node.querySelector('[data-dbav-edit]');
      if (b) b.addEventListener('click', function () { openBuilder({ onSave: render }); });
    }

    node.__dbavHandler = function () { render(); };
    global.addEventListener(EVT, node.__dbavHandler);
    global.addEventListener(LIVE_EVT, node.__dbavHandler);
    render();
  }

  // ---- identity: one face per person, everywhere ------------------------
  // identity() is the single answer to "what do we draw for this person".
  // Order is deliberate:
  //   1. a published public identity — what they chose to show the room
  //   2. their live mask design     — a deliberate choice
  //   3. the avatar they built      — outranks anything inherited
  //   4. their Google photo         — a real face, better than a generated one
  //   5. a portrait seeded off uid  — randomConfig is deterministic when
  //                                   seeded, so this is stable forever, not
  //                                   a new stranger on every page load
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
    getPfp: getPfp, setPfp: setPfp, getPfpIdentity: getPfpIdentity,
    normPublicIdentity: normPublicIdentity, maskSvg: maskSvg, publicSvg: publicSvg,
    talkingSvg: talkingSvg, mountTalking: mountTalking,
    cameo: cameo, cameoSvg: cameoSvg, CAMEOS: CAMEOS, CAMEO_MAP: CAMEO_MAP,
    SKIN: SKIN, HAIR: HAIR, BG: BG, OUTFIT: OUTFIT, EVENT: EVT
  };
})(window);
