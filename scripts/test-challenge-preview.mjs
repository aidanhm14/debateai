import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app/netlify/edge-functions/challenge-preview.js',import.meta.url),'utf8');
const {challengePreviewHtml,default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const template=fs.readFileSync(new URL('../app/challenges.html',import.meta.url),'utf8');
const c={slug:'pay-transparency-test',claim:'<script>alert("test")</script> $10 pay gap',creator:{uid:'me',name:'A & B'},accepted:[{uid:'me',side:'b'}],sides:{a:'For',b:'Against'},status:'open'};
const html=challengePreviewHtml(template,c);
assert.ok(html.includes('<title>&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; $10 pay gap · Debatable</title>'));
assert.ok(html.includes('https://itsdebatable.com/challenge/pay-transparency-test'));
assert.ok(html.includes('A &amp; B is taking Against.'));
assert.ok(!html.includes('<script>alert("test")</script>'));
assert.ok(challengePreviewHtml(template,{...c,status:'completed'}).includes('Read the ballot and see the result'));
let nextCalls=0;const context={next:async()=>{nextCalls++;return new Response(template,{headers:{'content-type':'text/html'}});}};
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>new Response(JSON.stringify({challenge:c}),{headers:{'content-type':'application/json'}});
 const result=await handler(new Request('https://itsdebatable.com/challenge/pay-transparency-test'),context);
 assert.equal(nextCalls,1);assert.equal(result.status,200);assert.ok((await result.text()).includes('A &amp; B is taking Against.'));
 assert.equal(await handler(new Request('https://itsdebatable.com/challenge/new'),context),undefined);
 globalThis.fetch=async()=>{throw new Error('offline');};
 assert.equal(await (await handler(new Request('https://itsdebatable.com/c/pay-transparency-test'),context)).text(),template,'preview outage retains functional page');
}finally{globalThis.fetch=originalFetch;}
console.log('Challenge link preview: canonical URL, side, result copy, escaping and outage fallback passed.');
