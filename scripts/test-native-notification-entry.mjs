import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/js/native-bridge.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  window.DBEnableAlerts = function'),source.indexOf('  function wireNativeDeepLinks'));
for(const saved of [true,false]){
 const context={window:{daEnableMessageAlerts:async()=>saved},location:{href:'/native'},Promise};vm.runInNewContext(code,context);
 const result=await context.window.DBEnableAlerts();assert.equal(result.registered,saved);assert.equal(result.receive,saved?'granted':'denied');
}
const home={window:{},location:{href:'/native'},Promise};vm.runInNewContext(code,home);
assert.equal((await home.window.DBEnableAlerts()).setupRequired,true);assert.equal(home.location.href,'/notifications');
console.log('Native home: no permission-only success; full registration or setup page required');
