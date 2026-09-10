import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import identity from '../app/js/public-identity.js';
import { publicIdentity, publicNames } from '../app/netlify/functions/lib/public-identity.mjs';

const source = fs.readFileSync('app/js/public-identity.js', 'utf8');
function browser(storage = new Map()) {
  const window = {
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    dispatchEvent() {}, fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(source, { window, CustomEvent: function () {} });
  return window;
}
const window = browser(), uid = 'private-account-'.padEnd(28, 'x');
const user = { uid, displayName: 'Google Real Name', email: 'real.person@example.com' };
for (let i = 0; i < 200; i++) {
  const id = 'account-' + i;
  assert.equal(window.DBIdentity.forUser({ uid: id, displayName: 'Real Name' }).name, publicIdentity(id).name);
  assert.equal(window.DBIdentity.forId(id).username, publicIdentity(id).username);
}
const generated = identity.forId(uid).name;
assert.equal(publicIdentity(uid, {displayName: user.displayName, name: 'Legacy name'}).name, generated);
assert.equal(publicIdentity(uid, {displayNameOverride: 'Night Owl'}).name, 'Night Owl');
await window.DBIdentity.setName('Night Owl', undefined, user);
assert.equal(window.DBIdentity.forUser(user).name, 'Night Owl');
assert.equal(window.DBIdentity.forUser({uid:'another-account'}).name, identity.forId('another-account').name);
await window.DBIdentity.clearName(user);
assert.equal(window.DBIdentity.forUser(user).name, generated);
const locked = browser();
locked.localStorage.getItem = () => { throw new Error('blocked'); };
assert.equal(locked.DBIdentity.forBrowser().name, locked.DBIdentity.forBrowser().name, 'Storage failure cannot reroll each render');
const db = { collection: () => ({doc: id => id}), getAll: async (...ids) => ids.map(id => ({id,exists:true,data:()=>({displayName:'Google Real Name',displayNameOverride:id===uid?'Night Owl':null})})) };
const names = await publicNames(db, [uid,'another-account']);
assert.equal(names.get(uid),'Night Owl');
assert.equal(names.get('another-account'),identity.forId('another-account').name);
db.getAll = async () => { throw new Error('offline'); };
assert.equal((await publicNames(db,[uid])).get(uid),generated);
const old = [{uid,displayName:'Google Real Name',score:100}, {ownerUid:uid,displayName:'Old name'}, {displayName:'No owner real name'}];
let projected = await window.DBIdentity.resolveRows(old);
assert.equal(projected[0].displayName,generated);
assert.equal(projected[1].displayName,generated);
assert.equal(projected[2].displayName,'Anonymous');
assert.equal(old[0].displayName,'Google Real Name','Read projection must not rewrite historical records');
window.fetch = async () => ({ok:true,json:async()=>({names:{[uid]:'Night Owl'}})});
projected = await window.DBIdentity.resolveRows(old);
assert.equal(projected[0].displayName,'Night Owl');
assert.equal(projected[1].displayName,'Night Owl');
assert.equal(projected[0].score,100);
assert.ok(!JSON.stringify(projected).includes('Real Name'));
const board = fs.readFileSync('app/netlify/functions/lib/rating-board.mjs','utf8');
assert.ok(!/getAuthDisplayNames|p\.displayName\s*\|\||p\.name\s*\|\|/.test(board));
assert.ok(!source.includes('Use your real name'));
assert.ok(source.includes("nameInput.autocomplete = 'nickname'"));
console.log('Public names: browser/server parity, nickname selection/reset, account isolation, blocked storage, legacy rows and offline privacy passed.');
