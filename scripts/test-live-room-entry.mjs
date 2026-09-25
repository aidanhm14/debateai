import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matchedEntry } = require('../app/js/live-room-entry.js');
const search = '?source=spar-bg&room=fixture&proUid=one&conUid=two';
assert.equal(matchedEntry(search), true);
for (const query of ['', '?room=manual', search + '&design=ready', search + '&spectate=1', search + '&stage=1', '?source=spar&room=fixture&proUid=one']) {
  assert.equal(matchedEntry(query), false, 'Manual, preview and audience entry keep their own authorized flow');
}
const classes = new Set(), nodes = new Map();
for (const id of ['roundView','roomEntryStatus','roomEntryMessage','rmbMotion','callSub','phaseLabel']) {
  nodes.set(id, { hidden: id === 'roomEntryStatus', textContent: '', attrs: {},
    setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];} });
}
const document = { documentElement: {classList: {add:c=>classes.add(c),remove:c=>classes.delete(c)}}, getElementById:id=>nodes.get(id) };
const window = {document, location:{search}};
const context = vm.createContext({window, URLSearchParams});
vm.runInContext(fs.readFileSync(new URL('../app/js/live-room-entry.js', import.meta.url),'utf8'), context);
assert.equal(classes.has('lr-room-loading'), true, 'Select final room shell before body parsing');
window.DBRoomEntry.prepare();
assert.equal(nodes.get('roundView').inert, true, 'Unhydrated controls cannot be activated');
assert.equal(nodes.get('roundView').attrs['aria-busy'], 'true');
assert.equal(nodes.get('roomEntryStatus').hidden, false);
assert.equal(nodes.get('rmbMotion').textContent, 'Your debate room', 'URL motion is not trusted over saved round state');
window.DBRoomEntry.status('Sign in to join this round.');
assert.equal(nodes.get('roomEntryMessage').textContent, 'Sign in to join this round.');
assert.equal(nodes.get('roundView').inert, true, 'Auth failure never enables round actions');
window.DBRoomEntry.finish();
assert.equal(classes.has('lr-room-loading'), false);
assert.equal(nodes.get('roundView').inert, false);
assert.equal(nodes.get('roomEntryStatus').hidden, true);
nodes.get('rmbMotion').textContent = 'The saved resolution';
window.DBRoomEntry.prepare();
window.DBRoomEntry.status('A late response');
assert.equal(nodes.get('rmbMotion').textContent, 'The saved resolution', 'Late entry callbacks cannot reset an active round');
const html = fs.readFileSync(new URL('../app/live-round.html',import.meta.url),'utf8');
const body = html.slice(html.indexOf('<body'));
assert.doesNotMatch(body, /<style\b|<link\b[^>]*rel="stylesheet"/, 'No delayed body styles can replace the initial room layout');
assert.ok(html.indexOf('/js/live-room-entry.js') < html.indexOf('firebase-app-compat.js'));
assert.ok(html.indexOf('DBRoomEntry.prepare()') < html.indexOf('<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"'), 'Identity SDK loading cannot hold the initial room markup behind it');
assert.ok(html.indexOf('id="roomEntryStatus"') < html.indexOf('id="roundView"'), 'Reconnect stays outside inert controls');
// Legacy/terminal documents may carry a ballot without status:'ballot', so
// they bypass setup-to-round and land directly in the result branch.
const guideSource = html.match(/  function updateRoundGuide\([^)]*\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(guideSource);
const ballotSource = html.slice(html.indexOf('    // Ballot landing, show it on both screens'), html.indexOf('    // Full ballot (long-form RFD)'));
for (const savedStatus of [undefined, 'done', 'ended']) {
  const views = new Map();
  for (const id of ['setupView','roundView','ballotView','ballotLoading','phaseLabel']) {
    const hidden = new Set(id === 'setupView' ? [] : ['hidden']);
    views.set(id, { classList:{add:c=>hidden.add(c),remove:c=>hidden.delete(c),contains:c=>hidden.has(c)} });
  }
  let finishes = 0, rendered = null;
  const legacy = {state:{phase:'setup'},d:{status:savedStatus,ballot:{winner:'pro'}},$:id=>views.get(id),
    window:{DBRoomEntry:{finish(){
      assert.equal(views.get('setupView').classList.contains('hidden'),true,'setup must be hidden before loading finishes');
      finishes++;
    }}},stopTimer(){},setMicActive(){},openSegStop(){},clearBallotRecovery(){},showJudgeAtTop(){},stopBallotWaitCue(){},svOnBallot(){},
    renderBallot:ballot=>{rendered=ballot;}};
  vm.createContext(legacy);vm.runInContext(guideSource + ballotSource, legacy);
  assert.equal(legacy.state.phase,'ballot-rendered');
  assert.equal(finishes,1);
  assert.equal(rendered,legacy.d.ballot);
  assert.equal(views.get('setupView').classList.contains('hidden'),true);
  assert.equal(views.get('ballotView').classList.contains('hidden'),false);
}
console.log('Room entry: prepaint selection, inert loading, auth recovery, saved/legacy decision handoff and stylesheet ordering passed.');
