#!/usr/bin/env node
/* Avatar option guard.
 *
 * The same five option lists (scene, accent, outfit, mask, eyes) are
 * written out in four places: the designer that offers them, the renderer
 * that draws them, the account sync that stores them, and the shared
 * server allow-list that copies them onto public documents. Every one of
 * the last three is a SANITISER WITH A FALLBACK, which is why drift here
 * does not throw: an option the designer offers and a sanitiser has not
 * heard of is quietly replaced by the default.
 *
 * That is not hypothetical. On 2026-08-24 the account sync and both server
 * copies were one release behind the designer, and the report was "it's
 * not saving my profile picture when I change it": picking the Oni mask,
 * Gold and the Neon scene wrote arena / crimson / blade back over local
 * storage within two seconds and pushed the same fallbacks to the account.
 *
 * So the designer's own table is the source of truth here, and this fails
 * the commit when anything else fails to offer exactly the same keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVATAR_DESIGN_OPTIONS, AVATAR_DESIGN_FALLBACK, cleanLiveDesign, cleanAvatarIdentity,
} from '../app/netlify/functions/lib/avatar-design.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; return; }
  failures.push(label);
}
function sameSet(a, b, label) {
  const A = [...a].sort(), B = [...b].sort();
  const missing = A.filter((k) => !B.includes(k));
  const extra = B.filter((k) => !A.includes(k));
  ok(!missing.length && !extra.length,
    `${label}: missing [${missing.join(', ')}] extra [${extra.join(', ')}]`);
}

const GROUPS = ['scene', 'accent', 'outfit', 'mask', 'eyes'];

// ── 1. The designer's table, parsed out of the file that owns it.
const cam = read('app/js/cam-avatar.js');
const camBlock = cam.slice(cam.indexOf('const DESIGN_OPTIONS'), cam.indexOf('function findOption'));
ok(camBlock.length > 200, 'cam-avatar.js: DESIGN_OPTIONS block not found (did the shape change?)');
const designer = {};
for (const group of GROUPS) {
  const m = camBlock.match(new RegExp(`\\n\\s{4}${group}:\\s*\\[([\\s\\S]*?)\\n\\s{4}\\]`));
  ok(!!m, `cam-avatar.js: no ${group} option list found`);
  designer[group] = m ? [...m[1].matchAll(/key:\s*'([^']+)'/g)].map((x) => x[1]) : [];
  ok(designer[group].length >= 3, `cam-avatar.js: ${group} parsed as ${designer[group].length} options`);
}

// ── 2. The shared server allow-list.
for (const group of GROUPS) {
  sameSet(designer[group], AVATAR_DESIGN_OPTIONS[group], `server lib ${group}`);
}
// The fallback must be an option the designer actually offers, and the
// first one, so it is the designer's default rather than a second opinion.
for (const group of GROUPS) {
  ok(AVATAR_DESIGN_FALLBACK[group] === designer[group][0],
    `server lib ${group} fallback is '${AVATAR_DESIGN_FALLBACK[group]}', designer default is '${designer[group][0]}'`);
}

// ── 3. The renderer.
const av = read('app/js/avatar.js');
const listOf = (name) => {
  const m = av.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};
const mapKeysOf = (name) => {
  const m = av.match(new RegExp(`var ${name} = \\{([\\s\\S]*?)\\};`));
  return m ? [...m[1].matchAll(/(?:^|[{,\s])([a-z]+)\s*:/g)].map((x) => x[1]) : null;
};
const renderer = {
  scene: listOf('LIVE_SCENES'),
  mask: listOf('LIVE_MASKS'),
  accent: mapKeysOf('LIVE_ACCENTS'),
  outfit: mapKeysOf('LIVE_OUTFITS'),
  eyes: mapKeysOf('LIVE_EYES'),
};
for (const group of GROUPS) {
  ok(!!renderer[group], `avatar.js: ${group} list not found`);
  if (renderer[group]) sameSet(designer[group], renderer[group], `renderer ${group}`);
}

// ── 4. The account sync.
const acct = read('app/js/avatar-account.js');
const acctList = (name) => {
  const m = acct.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};
const sync = {
  scene: acctList('SCENES'), accent: acctList('ACCENTS'), outfit: acctList('OUTFITS'),
  mask: acctList('MASKS'), eyes: acctList('EYES'),
};
for (const group of GROUPS) {
  ok(!!sync[group], `avatar-account.js: ${group} list not found`);
  if (sync[group]) sameSet(designer[group], sync[group], `account sync ${group}`);
}

// ── 5. Behaviour, not just lists. Every option the designer offers has to
// survive a round trip through the sanitiser untouched.
for (const group of GROUPS) {
  for (const key of designer[group]) {
    const out = cleanLiveDesign({ [group]: key });
    ok(out[group] === key, `cleanLiveDesign dropped ${group}='${key}' (got '${out[group]}')`);
  }
}
// And anything else still resolves to the default rather than through.
const junk = cleanLiveDesign({ scene: '../../etc', accent: 42, outfit: null, mask: {}, eyes: 'nope' });
for (const group of GROUPS) {
  ok(junk[group] === AVATAR_DESIGN_FALLBACK[group], `cleanLiveDesign let junk through on ${group}`);
}
// The identity wrapper rebuilds rather than filters: nothing a caller
// attaches to the object may ride along onto a public document.
const id = cleanAvatarIdentity({ kind: 'live', design: { scene: 'neon', evil: 1 }, evil: 2 });
ok(id && id.kind === 'live' && id.design.scene === 'neon', 'cleanAvatarIdentity lost a valid live design');
ok(id && !('evil' in id) && !('evil' in id.design), 'cleanAvatarIdentity forwarded an unknown field');
ok(cleanAvatarIdentity({ kind: 'nonsense' }) === null, 'cleanAvatarIdentity accepted an unknown kind');
const portrait = cleanAvatarIdentity({ kind: 'portrait', config: { skin: 999, hair: -4, junk: 3 } });
ok(portrait.config.skin === 20 && portrait.config.hair === 0 && !('junk' in portrait.config),
  'cleanAvatarIdentity portrait clamp/allow-list');

// ── 6. Nothing else may keep a private copy of these keys.
for (const file of ['app/netlify/functions/async-turn.mjs', 'app/netlify/functions/spar-pair.mjs']) {
  const src = read(file);
  ok(!/AVATAR_SCENES\s*=\s*new Set/.test(src),
    `${file} has its own copy of the scene list again; import lib/avatar-design.mjs instead`);
  ok(src.includes("from './lib/avatar-design.mjs'"), `${file} no longer imports the shared allow-list`);
}

// ── 7. The picked picture tile syncs with the account record (2026-09-01).
// avatar.js's setPfp() writes debatable-pfp-v1 + debatable-avatar-pref and
// fires the change event the account sync listens to, but the record it
// pushed carried neither, so a tile picked on a laptop rendered as a
// generated face on the phone. Behavioural, not a grep: the module runs
// against a stubbed window so a regression fails on what it DOES.
function freshWin() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    addEventListener: () => {},
    dispatchEvent: () => true,
    // The wearable set: 'frog' wears, 'pic-cash' is the photo tier (has()
    // but never canWear()), anything else is unknown.
    DBPfp: {
      list: [{ id: 'frog' }],
      has: (id) => id === 'frog' || id === 'pic-cash',
      canWear: (id) => id === 'frog',
      pick: () => 'frog',
    },
  };
}
function loadAccountSync(win) {
  const noop = () => 0;
  new Function('window', 'setTimeout', 'clearTimeout', read('app/js/avatar-account.js'))(win, noop, noop);
  return win.DBAvatarAccount;
}
{
  const win = freshWin();
  const sync = loadAccountSync(win);
  ok(!!(sync && sync.localRecord && sync.applyRecord), 'account sync failed to load in the stub window');
  // A local pick lands in the record, versioned.
  win.localStorage.setItem('debatable-pfp-v1', 'frog');
  win.localStorage.setItem('debatable-avatar-pref', 'pfp');
  let rec = sync.localRecord();
  ok(rec.version >= 3, `localRecord version is ${rec.version}, automatic pfp fields need v3+`);
  ok(rec.pfpId === 'frog' && rec.pref === 'pfp', 'localRecord dropped the picked tile');
  ok(sync.publicIdentity() && sync.publicIdentity().kind === 'pfp', 'publicIdentity ignored the pfp pick');
  // Drop, never default: a photo-tier id and an unknown id both clean to null.
  win.localStorage.setItem('debatable-pfp-v1', 'pic-cash');
  ok(sync.localRecord().pfpId === null, 'localRecord let a photo-tier (unwearable) id through');
  win.localStorage.setItem('debatable-pfp-v1', 'no-such-tile');
  ok(sync.localRecord().pfpId === null, 'localRecord let an unknown id through');
  // A v2 record writes and clears the two raw keys.
  sync.applyRecord({ version: 2, updatedAtMs: 5, pfpId: 'frog', pref: 'pfp' });
  ok(win.localStorage.getItem('debatable-pfp-v1') === 'frog'
    && win.localStorage.getItem('debatable-avatar-pref') === 'pfp',
    'applyRecord did not write the pfp keys from a v2 record');
  sync.applyRecord({ version: 2, updatedAtMs: 6, pfpId: null, pref: '' });
  ok(win.localStorage.getItem('debatable-pfp-v1') === null
    && win.localStorage.getItem('debatable-avatar-pref') === null,
    'applyRecord did not clear the pfp keys from a v2 record');
  // v3 is the first record that may say whether the pick was automatic.
  sync.applyRecord({ version: 3, updatedAtMs: 6, pfpId: 'frog', pref: 'pfp', pfpAuto: true });
  ok(win.localStorage.getItem('debatable-pfp-auto-v1') === '1' && sync.localRecord().pfpAuto === true,
    'applyRecord did not carry the v3 automatic-picture marker');
  // A v1 record makes no statement about the pick, so it must stand.
  win.localStorage.setItem('debatable-pfp-v1', 'frog');
  win.localStorage.setItem('debatable-avatar-pref', 'pfp');
  sync.applyRecord({ version: 1, updatedAtMs: 7, portraitConfig: { skin: 1 } });
  ok(win.localStorage.getItem('debatable-pfp-v1') === 'frog',
    'applyRecord cleared a local pick on a v1 record that never mentioned it');
  // A pfp-only record counts as an identity, or hydrate discards it.
  ok(sync.localRecord().pfpId === 'frog' && (() => {
    const src = read('app/js/avatar-account.js');
    return /hasIdentity[\s\S]{0,200}?pfpId/.test(src);
  })(), 'hasIdentity does not count a pfp-only record');
}

// A new uid gets one stable wearable picture immediately, marked as an
// automatic choice so the keep-or-change prompt can tell the truth.
{
  const win = freshWin();
  const sync = loadAccountSync(win);
  sync.hydrate({ uid: 'fresh-user', isAnonymous: true });
  const rec = sync.localRecord();
  ok(rec.pfpId === 'frog' && rec.pref === 'pfp' && rec.pfpAuto === true,
    'hydrate did not assign and prefer the stable default pfp');
}

// The real set keeps supplied non-person pictures wearable and the older
// identifiable stand-in bank unwearable.
{
  const win = {};
  new Function('window', read('app/js/pfp-set.js'))(win);
  ok(win.DBPfp.canWear('daybreak') && win.DBPfp.canWear('sea-cliff'),
    'safe supplied pictures are not wearable');
  ok(!win.DBPfp.canWear('pic-cash'), 'stand-in photo became wearable');
  ok(win.DBPfp.list.some((item) => item.id === 'raspberry' && item.wearable === true),
    'safe picture is missing its explicit wearable bit');
}

// Both queue producers publish the public identity, including the pfp
// fallback on /spar when the account bridge has not loaded yet.
{
  const notices = read('app/js/notifications.js');
  ok(/avatarIdentity:\s*avatarIdentity/.test(notices)
    && /avatarIdentity:\s*publicAvatarIdentity\(\)/.test(notices),
    'background queue writes do not both carry avatarIdentity');
  ok(/id\.kind === 'pfp' \? \{kind:'pfp',id:id\.id\}/.test(read('app/spar.html')),
    '/spar fallback drops pfp identities');
  ok(/DBAvatar\.setPfp\(faceChoice\.id\)/.test(read('app/js/onboarding.js')),
    'onboarding picture choice is not saved as a pfp');
}

if (failures.length) {
  console.error(`${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error('  x ' + f);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
