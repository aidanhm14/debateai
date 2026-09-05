import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { privateJudgeKey, reservePrivateJudgment, finishPrivateJudgment, isPrivateJudgingRound, authorizePrivateJudgeRequest, guardPrivateJudgeProxy } from '../app/netlify/functions/lib/private-judging.mjs';
import { privateJudgeOutput } from '../app/netlify/functions/private-judge.mjs';
import { planBypassesVoiceCap } from '../app/netlify/functions/lib/plans.mjs';

// A serializable store: transactions stage writes and roll back on throw.
// Concurrent calls queue exactly as Firestore's conflict-retry contract.
function database() {
  const values = new Map(); let queue = Promise.resolve();
  const db = {
    values,
    collection: c => ({ doc: id => ({ path: c + '/' + id }) }),
    runTransaction(fn) {
      const result = queue.then(async () => {
        const stage = new Map([...values].map(([k,v]) => [k, structuredClone(v)]));
        let wrote = false;
        const result = await fn({
          get: async ref => { assert.equal(wrote, false, 'all transaction reads precede writes'); return { exists: stage.has(ref.path), data: () => structuredClone(stage.get(ref.path)) }; },
          set: (ref, value) => { wrote = true; stage.set(ref.path, structuredClone(value)); },
          update: (ref, value) => { wrote = true; stage.set(ref.path, { ...stage.get(ref.path), ...structuredClone(value) }); },
        });
        values.clear(); for (const [k,v] of stage) values.set(k,v);
        return result;
      });
      queue = result.catch(() => {}); return result;
    },
  };
  return db;
}
const free = uid => ({ uid, paid: false });
const paid = uid => ({ uid, paid: true });
const reserve = (db, key, accounts = [free('alice')], now = Date.now()) => db.runTransaction(tx => reservePrivateJudgment(tx, db, { key: privateJudgeKey(key), accounts, now }));
const used = (db, uid = 'alice') => db.values.get('private_judge_usage/' + uid)?.used || 0;
const complete = (db, claim, options = {}) => finishPrivateJudgment(db, claim, { success: true, ...options });

const db = database();
for (const key of ['pasted-round', 'live:Private-second']) {
  const claim = await reserve(db, key); assert.equal(claim.ok, true);
  await complete(db, claim);
}
assert.equal(used(db), 2);
assert.equal((await reserve(db, 'third')).status, 402, 'third private round is payment-required across surfaces');
assert.equal((await reserve(db, 'pasted-round')).already, true, 'same successful round is idempotent');
assert.equal(used(db), 2);
const paidClaim = await reserve(db, 'paid-third', [paid('alice')]);
assert.equal(paidClaim.ok, true); await complete(db, paidClaim); assert.equal(used(db), 2, 'paid access consumes no trial');

const racing = database();
const results = await Promise.all(['a','b','c','d'].map(key => reserve(racing,key)));
assert.equal(results.filter(r => r.ok).length, 2, 'only two simultaneous free rounds reserve');
assert.equal(results.filter(r => !r.ok).every(r => r.code === 'PRIVATE_JUDGE_IN_PROGRESS'), true);
await Promise.all(results.filter(r => r.ok).map(r => complete(racing,r)));
assert.equal(used(racing),2);
assert.equal((await reserve(racing,'after-race')).status,402);

const retrying = database();
const failed = await reserve(retrying,'failure');
await finishPrivateJudgment(retrying,failed,{success:false});
assert.equal(used(retrying),0,'provider failure does not consume a trial');
const retried = await reserve(retrying,'failure'); await complete(retrying,retried,{output:'stored response'});
assert.equal(used(retrying),1); assert.equal((await reserve(retrying,'failure')).output,'stored response');
await assert.rejects(complete(retrying,failed),/expired/,'an older retry cannot double charge');

const pairs=database();
const pair=await reserve(pairs,'pair',[free('alice'),free('bob')]);
await complete(pairs,pair,{write:tx=>tx.set({path:'live_rounds/private'},{ballot:{winner:'pro'}})});
assert.equal(used(pairs,'alice'),1);assert.equal(used(pairs,'bob'),1);
assert.equal(pairs.values.get('live_rounds/private').ballot.winner,'pro','ballot and usage share one commit');
const secondBob=await reserve(pairs,'bob-second',[free('bob')]);await complete(pairs,secondBob);
assert.equal((await reserve(pairs,'pair-blocked',[free('alice'),free('bob')])).status,402,'either exhausted participant blocks');
assert.equal(Object.keys(pairs.values.get('private_judge_usage/alice').pending).length,0,'denial does not strand other account reservation');

const expiry=database();
const old=await reserve(expiry,'old',[free('alice')],1000);
await assert.rejects(complete(expiry,old,{now:400000}),/expired/,'expired work cannot overspend when its slot has been reused');
assert.equal(used(expiry),0);
const replacement=await reserve(expiry,'old',[free('alice')],400000);
await assert.rejects(complete(expiry,old,{now:400001}),/expired/,'old worker cannot finish new reservation');
await complete(expiry,replacement,{now:400001});assert.equal(used(expiry),1);
const rollback=database(); const pending=await reserve(rollback,'rollback');
await assert.rejects(complete(rollback,pending,{write:()=>{throw new Error('ballot write failed');}}));
assert.equal(used(rollback),0,'failed ballot write rolls back usage');
await finishPrivateJudgment(rollback,pending,{success:false});

for (const plan of ['individual','byok','team','voice','lifetime']) assert.equal(planBypassesVoiceCap({plan,status:'active'}),true);
assert.equal(planBypassesVoiceCap({plan:'trial',status:'active'}),false);
assert.equal(planBypassesVoiceCap({plan:'individual',status:'canceled'}),false);
assert.equal(isPrivateJudgingRound('Private-a',{isPrivate:false}),true);
assert.equal(isPrivateJudgingRound('Squad-a',{}),true);
assert.equal(isPrivateJudgingRound('Spar-a',{isPrivate:true}),true);
assert.equal(isPrivateJudgingRound('Spar-a',{isPrivate:false}),false);
const arbitrary=new Request('https://itsdebatable.com/api/claude',{method:'POST'});
assert.equal((await guardPrivateJudgeProxy(arbitrary,{_feature:'live-round'})).code,'PRIVATE_JUDGE_ROUTE_REQUIRED');
assert.equal(await guardPrivateJudgeProxy(authorizePrivateJudgeRequest(arbitrary),{_feature:'live-round'}),null);
assert.equal(await guardPrivateJudgeProxy(new Request('https://itsdebatable.com'),{_feature:'round-notes'}),null,'neutral notes never spend judging allowance');

const ballot='{"winner":"pro","rfd":"The stronger response carried the comparison."}';
const sse='data: '+JSON.stringify({delta:{text:ballot}})+'\n\ndata: {"type":"message_stop"}\n\n';
assert.equal(privateJudgeOutput(sse,'text/event-stream'),ballot);
for (const provider of ['gpt','grok','deepseek','openlab']) {
  const wire='data: '+JSON.stringify({choices:[{delta:{content:ballot},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
  assert.equal(privateJudgeOutput(wire,'text/event-stream'),ballot,provider+' completed SSE decodes');
  const cut='data: '+JSON.stringify({choices:[{delta:{content:ballot},finish_reason:'length'}]})+'\n\ndata: [DONE]\n\n';
  assert.equal(privateJudgeOutput(cut,'text/event-stream'),null,provider+' truncated result does not spend a use');
}
const geminiWire='data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Hidden reasoning',thought:true},{text:ballot}]},finishReason:'STOP'}]})+'\n\n';
assert.equal(privateJudgeOutput(geminiWire,'text/event-stream'),ballot,'Gemini text excludes thought parts and requires completion');
assert.equal(privateJudgeOutput('data: '+JSON.stringify({candidates:[{content:{parts:[{text:ballot}]},finishReason:'MAX_TOKENS'}]})+'\n','text/event-stream'),null,'Gemini truncation does not spend a use');
assert.equal(privateJudgeOutput(JSON.stringify({content:[{type:'text',text:ballot}],stop_reason:'end_turn'}),'application/json'),ballot,'Anthropic non-stream wrapper decodes');

assert.equal(privateJudgeOutput(sse.split('data: {"type":"message_stop"}')[0],'text/event-stream'),null,'truncated response releases trial');
assert.equal(privateJudgeOutput('data: {"delta":{"text":"nonsense"}}\n\ndata: {"type":"message_stop"}\n','text/event-stream'),null,'unreadable ballot releases trial');
assert.equal(privateJudgeOutput('data: '+JSON.stringify({delta:{text:'The full explanation'}})+'\n\ndata: {"type":"message_stop"}\n','text/event-stream',true),'The full explanation');
const live=readFileSync('app/netlify/functions/live-judge.mjs','utf8');
assert.match(live,/reservePrivateJudgment\(tx, db/);assert.match(live,/publishJudgedRound\(\{\n\s+ballot,/);assert.match(live,/await releasePrivateJudging\(\);/);
for(const name of ['claude','openai-chat','gemini','grok','deepseek','openlab']) assert.match(readFileSync('app/netlify/functions/'+name+'.mjs','utf8'),/guardPrivateJudgeProxy\(request, body\)/);
assert.match(readFileSync('app/js/app-check.js','utf8'),/'\/api\/private-judge'/);
assert.match(readFileSync('app/judge.html','utf8'),/fetch\('\/api\/private-judge'/);
console.log('Private judging: shared two-use cap, races, retries, paid access, expired leases, atomic ballot writes, proxy routing and stream completion passed.');
