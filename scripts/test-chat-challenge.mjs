import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window:{} };
vm.runInNewContext(fs.readFileSync(new URL('../app/js/chat-challenge.js', import.meta.url), 'utf8'), context);
const people = context.window.DBChatChallenge.people;
const group = { participants:['me', 'jonas', 'sam'], participantInfo:{jonas:{name:'Jonas'},sam:{name:'Sam'}} };
const recent = [{data:{participants:['me','jonas'],participantInfo:{jonas:{name:'Older name'}}}},
  {data:{participants:['me','alex'],participantInfo:{alex:{name:'Alex'}}}}];
const found = JSON.parse(JSON.stringify(people('me', group, recent)));
assert.deepEqual(found.map(p => p.uid), ['jonas','sam','alex'], 'Current participants come first, without self or duplicates');
assert.equal(found[0].name, 'Jonas', 'Current conversation identity outranks an older thread');
assert.deepEqual(JSON.parse(JSON.stringify(people('me',null,[]))), []);
assert.equal(people('me',{participants:['me','__proto__'],participantInfo:{}},[])[0].uid, '__proto__', 'UIDs cannot collide with object prototype keys');
console.log('chat challenge: recipient selection passed');
