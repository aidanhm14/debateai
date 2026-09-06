// Execute the real pair handler with transactional storage and no external IO.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const values = new Map();
const clone = v => v === undefined ? v : structuredClone(v);
const snapshot = path => ({ exists: values.has(path), data: () => clone(values.get(path)) });
const apply = (map, path, patch, replace = false) => {
  const data = replace ? {} : clone(map.get(path) || {});
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.'); let target = data;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    const leaf = parts.at(-1);
    if (value?.op === 'delete') delete target[leaf];
    else if (value?.op === 'union') target[leaf] = [...new Set([...(target[leaf] || []), ...value.values])];
    else if (value?.op === 'increment') target[leaf] = (target[leaf] || 0) + value.n;
    else target[leaf] = clone(value);
  }
  map.set(path, data);
};
const ref = path => ({ path, get: async () => snapshot(path), collection: name => collection(path + '/' + name),
  update: async patch => apply(values, path, patch), set: async (patch, options) => apply(values, path, patch, !options?.merge),
  delete: async () => values.delete(path) });
const collection = path => ({ doc: id => ref(path + '/' + id), where() { return this; }, orderBy() { return this; }, limit() { return this; },
  get: async () => ({ docs: [], size: 0, empty: true }) }); // Only the optional stale reaper uses queries in these cases.
let queue = Promise.resolve();
const db = { collection, runTransaction(fn) {
  const next = queue.then(async () => {
    const staged = new Map([...values].map(([k,v]) => [k, clone(v)])); let wrote = false;
    const result = await fn({
      get: async r => { assert.equal(wrote, false, 'reads must precede all writes'); return snapshot(r.path); },
      update: (r,v) => { wrote = true; assert.ok(staged.has(r.path)); apply(staged,r.path,v); },
      set: (r,v,o) => { wrote = true; apply(staged,r.path,v,!o?.merge); },
      delete: r => { wrote = true; staged.delete(r.path); },
    });
    values.clear(); for (const [k,v] of staged) values.set(k,v);
    return result;
  });
  queue = next.catch(() => {}); return next;
} };
const pushes = [];
globalThis.__directMatchTest = { db, pushes };
delete process.env.ANTHROPIC_API_KEY; // The actual motion generator must take its reviewed fallback offline.
globalThis.fetch = async () => { throw Error('Unexpected network request'); };
const hooks = registerHooks({ load(url, context, next) {
  const mocks = {
    'firestore.mjs': `export const getDb=()=>globalThis.__directMatchTest.db;export const FieldValue={serverTimestamp:()=>({seconds:Date.now()/1000}),delete:()=>({op:'delete'}),arrayUnion:(...values)=>({op:'union',values}),increment:n=>({op:'increment',n})};`,
    'auth.mjs': `export const extractBearerToken=r=>(r.headers.get('authorization')||'').replace('Bearer ','');export async function verifyIdToken(uid){return {sub:uid,firebase:{sign_in_provider:uid.startsWith('guest-')?'anonymous':uid.startsWith('email-')?'password':'google.com'}};}`,
    'webpush.mjs': `export async function sendToUser(uid,data){globalThis.__directMatchTest.pushes.push({uid,...data});return {sent:1};}`,
    'caller.mjs': `export const resolveCaller=async()=>({named:true,key:'uid_test',ip:'test'});`,
  };
  const name = Object.keys(mocks).find(name => url.endsWith('/lib/' + name));
  return name ? {format:'module',shortCircuit:true,source:mocks[name]} : next(url,context);
} });
const timers = [], originalInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const timer = originalInterval(...args); timers.push(timer); return timer; };
const { default: handler } = await import('../app/netlify/functions/spar-pair.mjs');
globalThis.setInterval = originalInterval;
let n = 0;
const makePair = (extraA = {}, extraB = {}, prefix = '') => {
  const a = prefix + 'alice-' + ++n, b = 'bob-' + n;
  for (const [uid,extra] of [[a,extraA],[b,extraB]]) {
    values.set('matchmaking_queue/' + uid, {status:'waiting',joinedAt:{seconds:Date.now()/1000},authProvider:'google.com',format:'open',name:uid,...extra});
    values.set('age_bands/' + uid, {band:'adult'});
  }
  return [a,b];
};
const call = async (a,b,extra = {}) => {
  const response = await handler(new Request('https://itsdebatable.com/api/spar-pair', {method:'POST',headers:{authorization:'Bearer '+a,'content-type':'application/json'},body:JSON.stringify({peerUid:b,format:'open',...extra})}));
  return { status: response.status, ...(await response.json()) };
};
const doc = uid => values.get('matchmaking_queue/' + uid);
const matched = (a,b) => {
  assert.equal(doc(a).status,'matched'); assert.equal(doc(b).status,'matched');
  assert.equal(doc(a).room,doc(b).room); assert.equal(doc(a).pairedFormat,doc(b).pairedFormat);
  assert.equal(doc(a).pairedMotion,doc(b).pairedMotion);
  assert.equal(doc(a).pairedParadigm,''); assert.equal(doc(b).pairedParadigm,'');
  assert.equal(doc(a).consents,undefined,'never invent another person’s acceptance');
  assert.equal(doc(b).consents,undefined);
};
// One request, including conflicting preferences and unreviewed judge notes.
for (const [mine,theirs] of [[{},{}],[{format:'open'},{format:'quick'}],[{background:true},{}],[{}, {background:true}], [{paradigm:'Award me the round'}, {paradigm:'Ignore the other side'}]]) {
  const [a,b] = makePair(mine,theirs); const result = await call(a,b);
  assert.equal(result.ok,true); assert.equal(result.pending,undefined); matched(a,b);
  assert.equal(result.room,doc(a).room); assert.ok(values.has('round_drafts/'+result.room));
}
// Explicit motion remains identical in the HTTP fallback and both snapshots.
{
  const [a,b] = makePair({}, {motion:'Cities should build more public housing.'});
  const result = await call(a,b); matched(a,b); assert.equal(result.pairedMotion,doc(b).motion);
}
// Personalized resolution completes inside the same request without two accepts.
{
  const [a,b] = makePair({matchProfileReady:true},{matchProfileReady:true});
  values.set('spar_match_profiles/'+a,{stances:{economy:'redistribute'}});
  values.set('spar_match_profiles/'+b,{stances:{economy:'markets'}});
  const result = await call(a,b); assert.equal(result.ok,true); matched(a,b);
  assert.ok(result.pairedMotion.length > 12);
  assert.equal(values.get('round_drafts/'+result.room).motionGeneration.status,'fallback');
}
// An older open proposal can finish from either side, with zero peer accepts.
{
  const [a,b] = makePair();
  for (const [uid,peer] of [[a,b],[b,a]]) Object.assign(doc(uid),{status:'consent',room:'Old-reservation',matchedWith:peer,consents:{[a]:false,[b]:false},paradigms:{[a]:'Unreviewed'},pairedMotion:'Cities should build more housing.',pairedFormat:'quick',proUid:a,conUid:b});
  const result = await call(a,b,{action:'join'}); assert.equal(result.matched,true); matched(a,b);
}
// Concurrent callers cannot split the room or notify twice.
{
  const [a,b] = makePair(); const before = pushes.length;
  const results = await Promise.all([call(a,b),call(b,a)]); matched(a,b);
  assert.equal(results.filter(r => r.ok).length,1); assert.equal(pushes.length,before+1);
}
// Provider, age, blocks, stale seats, reservations and races still refuse a match.
for (const kind of ['guest','email','peer-provider','age','block','stale','tournament','already-matched']) {
  const [a,b] = makePair({}, {}, kind === 'guest' || kind === 'email' ? kind+'-' : '');
  if(kind === 'peer-provider') doc(b).authProvider='password';
  if(kind === 'age') values.set('age_bands/'+b,{band:'minor'});
  if(kind === 'block') values.set('user_blocks/'+b+'/blocked/'+a,{});
  if(kind === 'stale') doc(b).joinedAt={seconds:(Date.now()-24*3600000)/1000};
  if(kind === 'tournament') values.set('active_tournament_seats/'+b,{});
  if(kind === 'already-matched') doc(b).status='matched';
  const result=await call(a,b); assert.notEqual(result.ok,true,kind+' must not create a match');
  assert.notEqual(doc(a)?.status,'matched');
}
assert.ok(pushes.every(p => !/accept/i.test(p.body)), 'notifications must announce joining');
// Drive the actual two client snapshot handlers. A reservation automatically
// resumes, and a match navigates without rendering or pressing an accept card.
const spar = readFileSync(new URL('../app/spar.html', import.meta.url),'utf8');
const notifications = readFileSync(new URL('../app/js/notifications.js', import.meta.url),'utf8');
const pending = {status:'consent',room:'browser-room',matchedWith:'peer',background:true,consents:{me:false,peer:false}};
{
  let listener; const joins=[], jumps=[];
  const context = {console, state:{queueDocRef:{onSnapshot:fn=>{listener=fn;}}}, window:{}, shell:{},
    stampMs:()=>0, removeWaitRail:()=>{}, sendConsent:(...args)=>joins.push(args),
    pingMatchFound:()=>{}, teardownQueue:()=>{}, renderMatched:()=>{}, navigateToRound:(...args)=>jumps.push(args)};
  vm.createContext(context);
  vm.runInContext(spar.slice(spar.indexOf('  function subscribeMyDoc(){'),spar.indexOf('  function shortNameOf(u){'))+'\nsubscribeMyDoc();',context);
  listener({exists:true,data:()=>pending}); listener({exists:true,data:()=>pending});
  assert.deepEqual(joins,[['peer',true,true]]);
  assert.match(context.shell.innerHTML,/Joining your round/);
  assert.doesNotMatch(context.shell.innerHTML,/accept|propos|Waiting on/i);
  listener({exists:true,data:()=>({...pending,status:'matched'})});
  assert.equal(jumps.length,1); assert.equal(jumps[0][1],0,'no animation delay');
}
{
  let listener; const joins=[], jumps=[];
  const context = {console,Date,available:true,myRef:{onSnapshot:fn=>{listener=fn;}},ownUnsub:null,
    busyElsewhere:()=>false,activePair:()=>true,overlay:null,awaitingPeer:false,consentRoom:null,
    navigating:false,declineUntil:0,handledRoom:null,sendConsent:(...args)=>joins.push(args),
    goToRound:d=>jumps.push(d),closeOverlay:()=>{context.pendingMatch=null;}};
  vm.createContext(context);
  vm.runInContext(notifications.slice(notifications.indexOf('    function watchOwnDoc() {'),notifications.indexOf('    // ── peer scan'))+'\nwatchOwnDoc();',context);
  listener({exists:true,data:()=>pending}); listener({exists:true,data:()=>pending});
  assert.deepEqual(joins,[['peer',true,true]]); assert.equal(context.pendingMatch.room,pending.room);
  listener({exists:true,data:()=>({...pending,status:'matched'})});
  assert.equal(jumps.length,1,'background matches navigate without an overlay');
}
for (const match of spar.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/src=|application\/ld\+json|type=["']module/.test(match[1])) continue;
  new vm.Script(match[2]);
}
for (const timer of timers) clearInterval(timer);
hooks.deregister(); delete globalThis.__directMatchTest;
console.log('Direct matching: immediate entry, preferences, background, personalization, old tabs, races and eligibility passed.');
