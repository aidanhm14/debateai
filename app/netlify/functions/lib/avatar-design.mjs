/* The avatar option keys, in one place.
 *
 * WHY THIS FILE EXISTS. The same five lists were written out four times:
 * in the designer (js/cam-avatar.js DESIGN_OPTIONS), in the renderer
 * (js/avatar.js LIVE_*), in the account sync (js/avatar-account.js), and
 * in every server function that copies an avatar onto a public document.
 * Three of those four fell behind when the designer grew a second row of
 * options, and because every copy is a SANITISER with a fallback, falling
 * behind does not throw. It silently rewrites somebody's choice.
 *
 * Measured on the founder's own account, 2026-08-24: picking the Oni mask,
 * Gold, and the Neon scene and pressing Save wrote arena / crimson / blade
 * back into local storage inside two seconds, and pushed the same three
 * fallbacks to Firestore. The report was "it's not saving my profile
 * picture when I change it", and that is exactly what a stale allow-list
 * looks like from the outside: the picture you chose, replaced by the
 * default, by the layer whose job was to protect it.
 *
 * So the keys live here, the two server functions import them, and
 * scripts/test-avatar-design.mjs asserts the two client copies still agree
 * with the designer. Adding an option to the designer means adding it
 * here, or the guard fails the commit.
 */

export const AVATAR_DESIGN_OPTIONS = {
  scene:  ['arena', 'skyline', 'library', 'studio', 'orbit', 'forest', 'chamber', 'neon', 'void'],
  accent: ['crimson', 'electric', 'violet', 'teal', 'rose', 'silver', 'gold', 'lime', 'ice'],
  outfit: ['ink', 'navy', 'plum', 'pine', 'slate', 'rust', 'bone', 'royal'],
  mask:   ['blade', 'classic', 'visor', 'wing', 'oni', 'plate', 'slim'],
  eyes:   ['focus', 'sharp', 'open', 'calm', 'round', 'keen', 'hooded'],
};

/* What an unrecognised value resolves to. These are deliberately the FIRST
 * entry of each list, so the fallback is the designer's own default rather
 * than a second opinion about what a default is. */
export const AVATAR_DESIGN_FALLBACK = {
  scene: 'arena', accent: 'crimson', outfit: 'ink', mask: 'blade', eyes: 'focus',
};

/* Portrait avatars are numeric indices into the renderer's part banks, so
 * they need a range rather than an allow-list. The cap matches every other
 * copy of this check. */
export const AVATAR_PORTRAIT_KEYS = [
  'skin', 'hair', 'top', 'eyes', 'brows', 'mouth', 'facial',
  'glasses', 'accessory', 'bg', 'outfit', 'iris', 'detail',
];
const PORTRAIT_MAX = 20;

const SETS = Object.fromEntries(
  Object.keys(AVATAR_DESIGN_OPTIONS).map((k) => [k, new Set(AVATAR_DESIGN_OPTIONS[k])]),
);

export function cleanLiveDesign(input) {
  const d = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const group of Object.keys(AVATAR_DESIGN_OPTIONS)) {
    out[group] = SETS[group].has(d[group]) ? d[group] : AVATAR_DESIGN_FALLBACK[group];
  }
  return out;
}

export function cleanPortraitConfig(input) {
  const c = input && typeof input === 'object' ? input : {};
  const safe = {};
  for (const key of AVATAR_PORTRAIT_KEYS) {
    const n = Number(c[key]);
    if (Number.isFinite(n)) safe[key] = Math.max(0, Math.min(PORTRAIT_MAX, Math.floor(n)));
  }
  return safe;
}

/* The compact, enumerated identity that may ride a public document (a
 * matchmaking queue entry, an async round turn). Client-written input, so
 * the shape is REBUILT from the allow-list rather than filtered: passing a
 * caller's object through whole would forward whatever else they wrote
 * into it. */
export function cleanAvatarIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'live') return { kind: 'live', design: cleanLiveDesign(value.design) };
  if (value.kind === 'portrait' && value.config && typeof value.config === 'object') {
    return { kind: 'portrait', config: cleanPortraitConfig(value.config) };
  }
  return null;
}
