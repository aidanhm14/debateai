import assert from 'node:assert/strict';
import { joinChallengeRoom } from '../app/netlify/functions/lib/challenge-room.mjs';

const initial = {
  mode:'live', challengedUid:'guest', creator:{uid:'host', name:'Host alias'},
  accepted:[{uid:'host',name:'Host alias',side:'b'},{uid:'guest',name:'Guest alias',side:'a'}],
  claim:'Cities should make public transit free.', status:'accepted', visibility:'public',
};
function fixture(challenge = initial) {
  const rows = new Map([
    ['challenges/one', structuredClone(challenge)],
    ['age_bands/host',{band:'adult'}], ['age_bands/guest',{band:'adult'}],
  ]);
  const writes = [];
  let queue = Promise.resolve();
  const db = {
    collection:name => ({doc:id => ({id,path:name+'/'+id})}),
    runTransaction:fn => {
      const run = queue.then(async () => {
        const pending = [];
        const result = await fn({
          get:async ref => {
            assert.equal(pending.length,0,'Firestore transactions read before writing');
            return {exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))};
          },
          set:(ref,data) => pending.push([ref.path, structuredClone(data)]),
        });
        pending.forEach(([path,data]) => {rows.set(path,data); writes.push(path);});
        return result;
      });
      queue = run.catch(()=>{});
      return run;
    }
  };
  return {db,ref:db.collection('challenges').doc('one'),rows,writes};
}
const f = fixture();
const [host,guest] = await Promise.all([
  joinChallengeRoom(f.db,f.ref,'host'),joinChallengeRoom(f.db,f.ref,'guest')
]);
assert.equal(host.url,guest.url,'both people get the same room and agreed seats');
assert.equal(f.writes.length,1,'simultaneous joins create exactly one round');
const url = new URL(host.url,'https://itsdebatable.com');
assert.equal(url.pathname,'/live-round');
assert.equal(url.searchParams.get('proUid'),'guest');
assert.equal(url.searchParams.get('conUid'),'host');
assert.equal(url.searchParams.get('motion'),initial.claim);
assert.equal(url.searchParams.has('mySide'),false,'identity, not a client hint, decides a seat');
const live = f.rows.get('live_rounds/Challenge-one');
live.motion = 'Public libraries should stop charging late fees.';
live.speechIdx = 3;
live.proUid = 'host'; live.conUid = 'guest';
live.proName = 'Host alias'; live.conName = 'Guest alias';
live.isPrivate = true;
const rejoin = new URL((await joinChallengeRoom(f.db,f.ref,'host')).url,'https://itsdebatable.com');
assert.equal(rejoin.searchParams.get('motion'),live.motion,'rejoin preserves the current topic');
assert.equal(rejoin.searchParams.get('proUid'),'host','rejoin preserves an agreed side swap');
assert.equal(rejoin.searchParams.get('private'),'1');
assert.equal(live.speechIdx,3);
assert.equal(f.writes.length,1,'rejoin never rewrites a running round');
await assert.rejects(joinChallengeRoom(f.db,f.ref,'stranger'),/Only the two/);
for (const status of ['open','cancelled','completed']) {
  const closed = fixture({...initial,status});
  await assert.rejects(joinChallengeRoom(closed.db,closed.ref,'host'));
  assert.equal(closed.writes.length,0);
}
for (const status of ['done','ballot','forfeit']) {
  const ended = fixture();
  ended.rows.set('live_rounds/Challenge-one',{status,ballot:status==='ballot'?{winner:'pro'}:null});
  await assert.rejects(joinChallengeRoom(ended.db,ended.ref,'host'),/ended/);
}
const bands = fixture();
bands.rows.set('age_bands/guest',{band:'minor'});
await assert.rejects(joinChallengeRoom(bands.db,bands.ref,'guest'),/same age group/);
bands.rows.delete('age_bands/guest');
await assert.rejects(joinChallengeRoom(bands.db,bands.ref,'guest'),/Confirm your age/);
await assert.rejects(joinChallengeRoom(bands.db,bands.ref,'host'),/other person/);
const hidden = fixture({...initial,moderation:{state:'hidden'}});
await assert.rejects(joinChallengeRoom(hidden.db,hidden.ref,'host'),/under review/);
const collision = fixture();
collision.rows.set('live_rounds/Challenge-one',{challengeId:'one',proUid:'host',conUid:'stranger'});
await assert.rejects(joinChallengeRoom(collision.db,collision.ref,'host'),/could not be verified/);
assert.equal(collision.writes.length,0,'never adopt or overwrite an unrelated room');
const unsafe = fixture({...initial,claim:'Abortion should be banned.'});
await assert.rejects(joinChallengeRoom(unsafe.db,unsafe.ref,'host'));
const fresh = fixture();
fresh.ref = fresh.db.collection('challenges').doc('two');
fresh.rows.set('challenges/two',structuredClone(initial));
assert.notEqual((await joinChallengeRoom(fresh.db,fresh.ref,'host')).room,host.room,'a new challenge between the same people gets a fresh room');
console.log('challenge room: convergence, retries, topic/side preservation, completed rounds, participant admission, age groups and content checks passed');
