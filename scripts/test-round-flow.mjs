import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/js/round-flow.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const api = ctx.DBRoundFlow;
const plain = value => JSON.parse(JSON.stringify(value));
const round = {
  room:'round-one', owner:'user-one', names:{pro:'Sam',con:'Jordan'}, mySide:'con',
  index:2, running:true, finished:false,
  speeches:[{side:'pro',name:'Opening'},{side:'con',name:'Opening and response'},{side:'pro',name:'Closing'},{side:'con',name:'Closing'}],
  log:[{side:'pro',text:'Public transport may not serve night workers.'},{side:'con',text:'<img src=x onerror=steal()>'}],
  notes:[{idx:1,side:'con',points:[{tag:'Transport',note:'Buses may not run at night.',answer:'ADVICE',status:'dropped',judge_note:'WINNER'}]},
    {idx:0,side:'pro',points:[{tag:'Space',note:'Fewer cars leave more public space.'}]}]
};
const rows = api.columns(round);
assert.deepEqual(plain(rows.map(r=>[r.title,r.side,r.who])),[
  ['Speech 1','pro','Sam'],['Speech 2','con','Jordan'],['Speech 3','pro','Sam'],['Speech 4','con','Jordan']
]);
assert.equal(rows[1].points[0].note,'Buses may not run at night.');
assert.equal(rows[2].status,'Speaking now');
assert.equal(rows[3].status,'Upcoming');
assert.equal(rows[1].transcript,'<img src=x onerror=steal()>');
const html = api.toHtml(round,{'speech-1':'</textarea><script>steal()</script>'});
assert(html.includes('Jordan <small>(you)</small>'));
assert(html.includes('aria-label="Your private notes for Speech 2 by Jordan, Against"'));
assert(html.includes('&lt;img src=x onerror=steal()&gt;'));
assert(html.includes('&lt;/textarea&gt;&lt;script&gt;steal()&lt;/script&gt;'));
assert(!/ADVICE|WINNER|dropped/.test(html));
assert(!html.includes('<script>'));
assert.equal(api.columns({...round,notes:[],pending:{0:'working',1:'failed'}})[0].status,'Writing notes…');
assert.equal(api.columns({...round,notes:[],pending:{1:'failed'}})[1].status,'Notes unavailable');
assert.equal(api.columns({...round,notes:[],log:[{side:'pro',skipped:true,text:'(skipped)'}]})[0].transcript,'');
assert.equal(api.columns({...round,notes:[],log:[{side:'pro',skipped:true,text:'(skipped)'}]})[0].status,'Speech skipped');
assert.equal(api.columns({...round,finished:true})[2].active,false);
assert.equal(api.columns({...round,finished:true})[3].status,'No shared notes for this speech');

// Conversation notes arrive independently from each person. Preserve their
// attribution and receipt order; final summaries are never numbered speeches.
const conversation={...round,open:true,notes:[
  {idx:1000,atMs:20,side:'pro',points:[{tag:'Space',note:'More room for people.'}]},
  {idx:1001,atMs:10,side:'con',points:[{tag:'Night buses',note:'Night workers need transport.'}]},
  {idx:0,atMs:40,side:'con',points:[{tag:'Summary',note:'Access remains a concern.'}]}
]};
const talk=api.columns(conversation);
assert.deepEqual(plain(talk.map(r=>r.side)),['con','pro','pro','con']);
assert.deepEqual(plain(talk.map(r=>r.title)),['Excerpt 1','Excerpt 2','Round notes','Round notes']);
assert.equal(talk[3].points[0].note,'Access remains a concern.');
assert.equal(talk[3].key,api.columns({...conversation,notes:[]})[1].key,'personal notes survive the first excerpt and the final summary');
assert.equal(talk[0].transcript,'','an excerpt never pretends to quote an entire side transcript');
assert.notEqual(api.keyFor(round),api.keyFor({...round,room:'round-two'}));
assert.notEqual(api.keyFor(round),api.keyFor({...round,owner:'user-two'}));
assert.notEqual(api.keyFor(round),api.keyFor(conversation));
assert.equal(api.keyFor({...round,room:''}),'');
assert.equal(fs.readFileSync(new URL('../app/css/round-flow.css',import.meta.url),'utf8'),fs.readFileSync(new URL('../css/round-flow.css',import.meta.url),'utf8'));
console.log('Round flow: speech attribution, states, transcript safety, private note isolation, conversation order and stable note keys passed.');
