import assert from 'node:assert/strict';
import { evidenceTurns, evidencePrompt, validateReceipts, accusedSpeeches } from '../app/netlify/functions/lib/judge-evidence.mjs';
const round={format:'open',proUid:'a',conUid:'b',speeches:[{open:true,side:'pro',text:'Alex (For): Rotate staff to share the burden.\nBlair (Against): Rotation loses expertise, so train permanent staff.\nAlex (For): Training does not distribute weekend work.'}]};
const turns=evidenceTurns(round);
assert.deepEqual(turns.map(t=>t.side),['pro','con','pro']);
assert.equal(accusedSpeeches(round,'b').length,0,'Shared labels alone cannot establish identity for conduct review');
assert.equal(accusedSpeeches({...round,openSegs:{con:[{speakerUid:'b',text:'Own saved speech',at:1}],pro:[{speakerUid:'a',text:'Blair (Against): I used ChatGPT',at:2}]}},'b')[0].text,'Own saved speech');
assert.equal(accusedSpeeches({...round,proUid2:'c'},'b').length,0);
const receipt={kind:'argument',side:'pro',turnId:'t1',quote:turns[0].text,explanation:'Shared burden, with a reply about expertise.',consideredResponseIds:['t2'],responseTurnId:'t2',responseQuote:turns[1].text};
assert.equal(validateReceipts([receipt],turns)[0].interpretationVerified,false);
for(const bad of [{...receipt,side:'con'},{...receipt,quote:'Invented concession.'},{...receipt,consideredResponseIds:[]},{...receipt,responseTurnId:'t3'},{...receipt,kind:'unanswered'},{...receipt,turnId:'t3',quote:turns[2].text,kind:'unanswered',responseTurnId:'',responseQuote:''}])assert.throws(()=>validateReceipts([bad],turns));
const compact={...receipt,consideredResponseSet:'con'};
delete compact.consideredResponseIds;
assert.deepEqual(validateReceipts([compact],turns),validateReceipts([receipt],turns),'Shared sets expand to identical audited receipts');
for(const bad of [{...compact,consideredResponseSet:'pro'},{...compact,consideredResponseSet:'all'},
  {...compact,consideredResponseIds:[]},{...compact,consideredResponseIds:['t2','t2']},
  {...compact,consideredResponseIds:['t999']},{...compact,quote:'Invented concession.'},
  {...compact,responseTurnId:'t3'},{...compact,kind:'unanswered'}])assert.throws(()=>validateReceipts([bad],turns));
const against={...compact,side:'con',turnId:'t2',quote:turns[1].text,consideredResponseSet:'pro',responseTurnId:'t3',responseQuote:turns[2].text};
assert.deepEqual(validateReceipts([against],turns)[0].consideredResponseIds,['t1','t3']);

// A long conversation must retain all words, ordering, attribution and reply
// coverage without a quadratic cross-product of IDs in the provider request.
const long=evidenceTurns({format:'open',canonicalTurns:Array.from({length:1100},(_,i)=>({
  side:i%2?'con':'pro',text:`Captured words ${i}. An argument and its qualifications.`,name:i%2?'Blair':'Alex',
}))});
const encoded=evidencePrompt(long), packed=JSON.parse(encoded);
assert.deepEqual(packed.turns.map(({id,side,text})=>({id,side,text})),long.map(({id,side,text})=>({id,side,text})));
for(const row of packed.turns) assert.deepEqual(packed.responseSets[row.opposingTurnSet],long.filter(t=>t.side!==row.side).map(t=>t.id));
assert.ok(encoded.length<200000,'1100-turn sources fit comfortably without dropping text');
assert.ok(encoded.length/evidencePrompt(long.slice(0,550)).length<2.2,'Reference storage grows linearly');
const last={...compact,turnId:long.at(-2).id,quote:long.at(-2).text,responseTurnId:long.at(-1).id,responseQuote:long.at(-1).text};
assert.equal(validateReceipts([last],long)[0].consideredResponseIds.length,550);
console.log('Judge evidence: attribution, invented quotes, reply accounting and opportunity checks passed.');
