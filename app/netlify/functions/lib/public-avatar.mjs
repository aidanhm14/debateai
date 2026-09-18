// Shared public avatar projection. Never forward the complete stored profile.
const IDENTITY_STR = (v) => (typeof v === 'string' && v.length <= 24 ? v : undefined);
const IDENTITY_NUM = (v) => (typeof v === 'number' && v >= 0 && v < 64 ? v : undefined);
export function safeIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  if (!value.kind) {
    if (value.pref === 'photo' && Number.isSafeInteger(value.photoVersion) && value.photoVersion > 0) {
      return { kind: 'photo', v: value.photoVersion };
    }
    if (value.pref === 'pfp' && value.pfpId) return safeIdentity({ kind:'pfp', id:value.pfpId });
    if (value.pref === 'portrait' && value.portraitConfig) return safeIdentity({ kind:'portrait', config:value.portraitConfig });
    if (Number.isSafeInteger(value.photoVersion) && value.photoVersion > 0) return { kind:'photo', v:value.photoVersion };
    if (value.portraitConfig) return safeIdentity({ kind:'portrait', config:value.portraitConfig });
    if (value.pfpId) return safeIdentity({ kind:'pfp', id:value.pfpId });
  }
  if (value.kind === 'photo' && Number.isSafeInteger(value.v) && value.v > 0) {
    return { kind: 'photo', v: value.v };
  }
  if (value.kind === 'live' && value.design && typeof value.design === 'object') {
    const d = value.design;
    return { kind: 'live', design: {
      style: IDENTITY_STR(d.style), scene: IDENTITY_STR(d.scene), accent: IDENTITY_STR(d.accent),
      outfit: IDENTITY_STR(d.outfit), mask: IDENTITY_STR(d.mask), eyes: IDENTITY_STR(d.eyes),
    } };
  }
  // A picked tile from the drawn set (js/pfp-set.js). Shape-checked here,
  // membership-checked on the client: the set is a client asset, and
  // DBAvatar returns null for an id it does not carry, so the row falls
  // back to its stand-in rather than rendering an empty tile.
  if (value.kind === 'pfp' && typeof value.id === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(value.id)) {
    return { kind: 'pfp', id: value.id };
  }
  if (value.kind === 'portrait' && value.config && typeof value.config === 'object') {
    const c = value.config, out = {};
    for (const k of ['face','skin','hair','top','eyes','brows','mouth','facial','glasses','accessory','iris','detail','bg','outfit']) {
      const n = IDENTITY_NUM(c[k]);
      if (n !== undefined) out[k] = n;
    }
    return Object.keys(out).length ? { kind: 'portrait', config: out } : null;
  }
  return null;
}
