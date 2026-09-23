import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// post is an authenticated Firebase Rules API request. This evaluates synthetic
// requests against the proposed source and never changes rules or documents.
export async function testTopicChoiceRules(post, project) {
const initial={proUid:'a',conUid:'b',isPrivate:false,motion:'',status:'round',speechIdx:0};
const cases=[];
function test(name,old,patch,allow,uid='a',method='update',path='/databases/(default)/documents/live_rounds/topic-test'){
 const data={...old,...patch};
 cases.push({name,expectation:allow?'ALLOW':'DENY',request:{path,method,auth:{uid,token:{firebase:{sign_in_provider:'google.com'}}},resource:{data}},resource:{data:old}});
}
test('blank room initializes',initial,{},true,'a','create');
test('blank room cannot start',initial,{currentTimer:{state:'running'}},false);
test('topic can be proposed',initial,{motionProposal:{by:'a',text:'Cities should build more parks.'},motionProposalAccepts:{a:true}},true);
test('accept for another person refused',initial,{motionProposalAccepts:{b:true}},false);
test('chosen room can start',{...initial,motion:'Cities should build more parks.'},{currentTimer:{state:'running'}},true);
test('projection cannot be forged',initial,{topicStrikes:{phase:'done'}},false);
test('revision cannot be forged',initial,{topicStrikesRevision:7},false);
test('cannot forge on creation',initial,{topicStrikes:{phase:'done'}},false,'a','create');
for(const phase of ['offered','strike','motion','side']){
 const old={...initial,motion:'Existing topic.',topicStrikes:{phase},topicStrikesRevision:1};
 test(phase+' blocks topic replacement',old,{motion:'Another topic.'},false);
 test(phase+' blocks start',old,{currentTimer:{state:'running'}},false);
 test(phase+' allows heartbeat',old,{seatSeen:{a:123}},true);
 test(phase+' blocks swap',old,{proUid:'b',conUid:'a'},false);
}
test('finished allows new proposal',{...initial,topicStrikes:{phase:'done'}},{motionProposal:{text:'New proposal'}},true);
test('viewer cannot modify',initial,{motion:'Forged topic.'},false,'outsider');
test('private strikes unreadable',{}, {},false,'a','get','/databases/(default)/documents/room_topic_strikes/topic-test');
const source={files:[{name:'firestore.rules',content:readFileSync(new URL('../../app/firestore.rules',import.meta.url),'utf8')}]};
const result=await post('/projects/'+project+':test',{source,testSuite:{testCases:cases.map(({name,...x})=>x)}});
assert.ok(!result.issues?.some(x=>x.severity==='ERROR'),JSON.stringify(result.issues));
assert.equal(result.testResults?.length,cases.length);
result.testResults.forEach((r,i)=>assert.equal(r.state,'SUCCESS',cases[i].name+': '+JSON.stringify(r)));
return {passed:cases.length,warnings:result.issues?.filter(x=>x.severity==='WARNING').length||0};
}
