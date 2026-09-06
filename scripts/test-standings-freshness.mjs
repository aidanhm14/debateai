import assert from 'node:assert/strict';
import { applyRoundRating, reverseRoundRating } from '../app/netlify/functions/lib/rating-apply.mjs';
import { fetchStandingsSnapshot } from '../app/netlify/functions/lib/standings-snapshot.mjs';
import { STANDINGS_VERSION } from '../app/netlify/functions/lib/standings-version.mjs';

const docs = new Map(), cache = new Map();
let failCommit = false, rowReads = 0;
const clone = value => value === undefined ? undefined : structuredClone(value);
const snap = ref => ({ exists:docs.has(ref.path), data:()=>clone(docs.get(ref.path)) });
const db = {
  collection: name => ({ doc: id => { const ref={id,path:name+'/'+id,get:async()=>snap(ref)}; return ref; } }),
  runTransaction: async fn => {
    const writes=[];
    const result=await fn({get:async ref=>snap(ref),set:(ref,value,opts)=>writes.push({ref,value,opts})});
    if(failCommit) throw Error('commit failed');
    for(const {ref,value,opts} of writes) docs.set(ref.path,clone(opts?.merge?{...docs.get(ref.path),...value}:value));
    return result;
  },
};
const dependencies={
  readRows:async()=>{rowReads++; return [...docs].filter(([key])=>key.startsWith('user_ratings/')).map(([key,d])=>({uid:key.split('/')[1],rating:d.rating,wins:d.wins,losses:d.losses,draws:d.draws,games:d.games}));},
  readCache:async key=>clone(cache.get(key)), writeCache:async(key,value)=>cache.set(key,clone(value)), now:()=>1000,
};
const args={source:'live',eventId:'one',now:100,roundData:{proUid:'a',conUid:'b',ballot:{winner:'pro'}}};
const first=await fetchStandingsSnapshot(db,dependencies);
assert.deepEqual(first.rows,[]);
await fetchStandingsSnapshot(db,dependencies);assert.equal(rowReads,1,'Unchanged results share the expensive snapshot');
failCommit=true;
await assert.rejects(applyRoundRating(db,args),/commit failed/);
assert.equal(docs.size,0,'A failed transaction publishes neither rating nor refresh marker');
failCommit=false;
assert.equal((await applyRoundRating(db,args)).applied,true);
const changed=await fetchStandingsSnapshot(db,dependencies);
assert.notEqual(changed.revision,first.revision);
assert.equal(changed.rows.find(r=>r.uid==='a').wins,1);
assert.equal(changed.rows.find(r=>r.uid==='b').losses,1);
assert.equal(rowReads,2,'New result bypasses an unexpired warm cache');
assert.deepEqual(await fetchStandingsSnapshot(db,dependencies),changed);
assert.equal((await applyRoundRating(db,args)).reason,'already_applied');
assert.deepEqual(await fetchStandingsSnapshot(db,dependencies),changed,'Retry changes neither record nor revision');
assert.equal((await applyRoundRating(db,{...args,eventId:'private',roundData:{...args.roundData,leaderboardConsent:{a:false}}})).reason,'opted_out');
assert.deepEqual(await fetchStandingsSnapshot(db,dependencies),changed);
assert.equal((await reverseRoundRating(db,{source:'live',eventId:'one',uids:['a','b'],now:200})).reversed,true);
const reversed=await fetchStandingsSnapshot(db,dependencies);
assert.notEqual(reversed.revision,changed.revision);
assert.ok(reversed.rows.every(r=>r.games===0 && r.wins===0 && r.losses===0));
assert.equal((await reverseRoundRating(db,{source:'live',eventId:'one',uids:['a','b']})).reason,'already_reversed');
assert.deepEqual(await fetchStandingsSnapshot(db,dependencies),reversed);
// Hold an old computation while a result arrives, then release it last.
cache.clear();let release;const held=new Promise(resolve=>{release=resolve;});
let began;const ready=new Promise(resolve=>{began=resolve;});
const oldRequest=fetchStandingsSnapshot(db,{...dependencies,readRows:async()=>{const rows=await dependencies.readRows();began();await held;return rows;}});
await ready;
await applyRoundRating(db,{...args,eventId:'two',now:300});
const newest=await fetchStandingsSnapshot(db,dependencies);
release();await oldRequest;
assert.deepEqual(await fetchStandingsSnapshot(db,dependencies),newest,'Late old computation cannot overwrite the current revision');
assert.ok(newest.rows.every(r=>r.games===1));
const realGet=db.collection;
db.collection=()=>({doc:()=>({get:async()=>{throw Error('offline');}})});
await assert.rejects(fetchStandingsSnapshot(db,dependencies),/offline/,'Read errors must not return a successful empty ladder');
db.collection=realGet;
assert.ok(docs.has('admin_cache/'+STANDINGS_VERSION));
console.log('Standings freshness: atomic results, cache reuse, immediate invalidation, retries, opt-out, appeals, stale writes and read failures passed.');
