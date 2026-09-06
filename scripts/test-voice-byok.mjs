import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realtimeFunding, fundingSecret, byokVoiceUsage } from '../app/netlify/functions/lib/realtime-funding.mjs';
import { signContinuation, verifyContinuation } from '../app/netlify/functions/lib/realtime-tools.mjs';
const user={sub:'testuser',firebase:{sign_in_provider:'apple.com'}};
const key='sk-proj-'+'x'.repeat(40);
const deps={platformKey:'platform-key',membership:async()=>({team:{plan:'byok',status:'active'}})};
const body={openaiApiKey:key,motion:'Public transit should be free'};
assert.deepEqual(await realtimeFunding(body,user,deps),{byok:true,apiKey:key});
assert.equal(Object.hasOwn(body,'openaiApiKey'),false);
assert.equal(JSON.stringify(body).includes(key),false,'prompt body no longer contains credential');
assert.deepEqual(await realtimeFunding({},user,deps),{byok:false,apiKey:'platform-key'});
for(const supplied of ['',null,'sk-ant-'+ 'x'.repeat(25),'https://attacker.invalid']) {
 const bad={openaiApiKey:supplied};
 await assert.rejects(realtimeFunding(bad,user,deps),e=>e.code==='OPENAI_BYOK_INVALID'&&!e.message.includes(String(supplied||'never-echo')));
 assert.equal(Object.hasOwn(bad,'openaiApiKey'),false);
}
await assert.rejects(realtimeFunding({openaiApiKey:key},{sub:'anon',firebase:{sign_in_provider:'anonymous'}},deps),e=>e.status===401);
for(const team of [{plan:'free'}, {plan:'byok',status:'canceled'}, {plan:'voice',status:'unpaid'}]) {
 await assert.rejects(realtimeFunding({openaiApiKey:key},user,{...deps,membership:async()=>({team})}),e=>e.status===402);
}
await assert.rejects(realtimeFunding({openaiApiKey:key},user,{...deps,membership:async()=>{throw new Error(key);}}),e=>e.status===503&&!e.message.includes(key));
const now=Date.now(),secret='test-only-signing';
const token=signContinuation(fundingSecret(secret,true),user.sub,now);
assert.equal(verifyContinuation(fundingSecret(secret,true),token,user.sub,now).ok,true);
assert.equal(verifyContinuation(fundingSecret(secret,false),token,user.sub,now).ok,false,'BYOK continuation cannot bypass platform funding gate');
const usage=byokVoiceUsage();assert.equal(usage.limit,null);assert.equal(usage.tokensSpent,0);assert.equal(usage.sessionId,null);
const server=readFileSync('app/netlify/functions/realtime-session.mjs','utf8');
assert.match(server,/decoded && !byok/);assert.match(server,/signedInUid && !isPro && !byok/);assert.match(server,/tokenFunded && signedInUid && !continued && !byok/);
assert.match(server,/lastErrText = byok\s*\?/,'raw provider errors are suppressed for BYOK');
const client=readFileSync('app/newvoice.html','utf8');
assert.match(client,/roundCapMs = voiceByok \? Infinity/);
assert.match(client,/voiceByok \? \{ openaiApiKey: activeVoiceKey \} : \{\}/);
assert.doesNotMatch(client,/(?:localStorage|sessionStorage)\.setItem\([^\n]*(?:openaiVoiceKey|openaiApiKey|activeVoiceKey)/);
console.log('Voice BYOK: provider scope, paid-only, no fallback, no secret echo/storage, separate continuation funding and no platform minute/token charge passed.');
