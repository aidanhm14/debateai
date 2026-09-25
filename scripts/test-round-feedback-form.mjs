import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const config=JSON.parse(readFileSync(new URL('../app/round-feedback-config.json',import.meta.url),'utf8'));
assert.deepEqual(Object.keys(config),['url']);
const source=readFileSync(new URL('../app/js/round-feedback-page.js',import.meta.url),'utf8');
async function render(url){
  const elements=Object.fromEntries(['roundId','roundRef','formStatus','googleForm'].map(id=>[id,{hidden:true,textContent:'',href:''}]));
  vm.runInNewContext(source,{URL,URLSearchParams,AbortSignal,location:{search:''},document:{getElementById:id=>elements[id]},fetch:async path=>{assert.equal(path,'/api/round-feedback-form');return {ok:true,json:async()=>({url})};}});
  await new Promise(resolve=>setImmediate(resolve));
  return elements;
}
for(const url of ['', 'javascript:alert(1)','https://evil.test/form','https://docs.google.com.evil.test/forms/d/e/123/viewform','https://secret@docs.google.com/forms/d/e/123/viewform']){
 const e=await render(url);assert.equal(e.googleForm.hidden,true);assert.match(e.formStatus.textContent,/not available/);
}
for(const url of [config.url,'https://forms.gle/fixture']){
 const e=await render(url);assert.equal(e.googleForm.hidden,false);assert.equal(e.googleForm.href,url);
}
for(const name of ['netlify.toml','app/netlify.toml']){
 const routes=readFileSync(new URL('../'+name,import.meta.url),'utf8');
 assert.match(routes,/from = "\/api\/round-feedback-form"\s+to = "\/round-feedback-config.json"\s+status = 200/);
}
console.log('Round feedback: static route, public-only config, real client allowlist and invalid-URL fallback passed.');
