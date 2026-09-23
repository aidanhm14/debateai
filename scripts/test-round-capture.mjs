import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {ownSpeeches}=createRequire(import.meta.url)('../app/js/round-capture.js');
const speech={code:'TALK',open:true,side:'pro',text:'Sam (For): Buses help.\nMore routes.\n\nSam (Against): Trains help.\nSam (For): Buses cost less.'};
assert.deepEqual(ownSpeeches([speech],'pro',true),[{code:'TALK',text:'Buses help.\nMore routes.\n\nBuses cost less.'}]);
assert.deepEqual(ownSpeeches([speech],'con',true),[{code:'TALK',text:'Trains help.'}]);
assert.deepEqual(ownSpeeches([{...speech,text:'Unattributed words'}],'pro',true),[]);
assert.deepEqual(ownSpeeches([{...speech,skipped:true}],'con',true),[]);
assert.deepEqual(ownSpeeches([{code:'P1',side:'gov',text:'Own speech'},{code:'O1',side:'opp',text:'Peer speech'}],'pro',false),[{code:'P1',text:'Own speech'}]);
assert.deepEqual(ownSpeeches([speech],'spectator',true),[]);
console.log('Consented capture: both seats, identical names, continuation lines, unknown labels, skipped and timed speeches passed.');

assert.deepEqual(ownSpeeches([{open:true,text:'Sam (Pour): Oui.\nSam (Contre): Non.'}],'con',true,{pro:'Pour',con:'Contre'}),[{code:'TALK',text:'Non.'}]);
