import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const live = read('app/live-round.html');
const practice = read('app/practice.html');
const flow = read('app/netlify/functions/flow.mjs');
const exporter = read('app/js/round-export.js');

// Real serialization code: hostile transcript/metadata are text, both speakers
// survive, optional ballot stays separate, and old coaching fields never export.
const exportContext = vm.createContext({});
vm.runInContext(exporter, exportContext);
const api = exportContext.DBRoundExport;
const round = {
  title: '<script>steal()</script>', motion: 'Cars & cities',
  notes: [
    {idx:0,side:'pro',speakerName:'Sam',points:[{note:'Cars take up public space.',answer:'Tell them to argue harder.'}]},
    {idx:1,side:'con',speakerName:'Jordan',points:[{note:'Night workers need a way home.'}]}
  ],
  log: [{code:'P1',side:'pro',who:'Sam',text:'<img src=x onerror=steal()> & public space'},
    {code:'C1',side:'con',who:'Jordan',text:'Night workers need transport.'}],
  feedback:'JUDGE OPINION'
};
const html = api.toHtml(round,false);
assert(html.includes('&lt;script&gt;steal()&lt;/script&gt;'));
assert(html.includes('&lt;img src=x onerror=steal()&gt; &amp; public space'));
assert(html.includes('For') && html.includes('Against') && html.includes('Sam') && html.includes('Jordan'));
assert(!html.includes('Tell them to argue harder') && !html.includes('JUDGE OPINION'));
assert(api.toHtml(round,true).includes('<h2>Judge ballot</h2><p>JUDGE OPINION</p>'));
const payload = api.multipart('A round',html,'test_boundary');
assert(payload.includes('application/vnd.google-apps.document'));
assert(payload.includes('Content-Type: text/html; charset=UTF-8\r\n\r\n'+html));
assert(payload.endsWith('\r\n--test_boundary--'));
assert(api.toHtml({notesText:'YOUR POINTS\n- The city needs buses.\n\nTHEIR POINTS\n- Buses cost money.',log:[]},false).includes('<h3>THEIR POINTS</h3><ul><li>Buses cost money.</li></ul>'));

// Notes mode allowlists only speaker and claim even if a provider returns an
// older full flow schema. It cannot leak advice or an evaluation field.
const normalize = flow.slice(flow.indexOf('function normalizeNotes('),flow.indexOf('function userMessage('));
const textFn = flow.slice(flow.indexOf('function text('),flow.indexOf('function normalizeResult('));
const normalContext = vm.createContext({});
vm.runInContext(textFn+'\n'+normalize,normalContext);
const normalized = normalContext.normalizeNotes({flow:[{speaker:'You | For',claim:'Public space matters.',status:'dropped',judge_note:'Weak',repair:'Argue better'}],responses:[{line:'Try this'}]});
assert.deepEqual(JSON.parse(JSON.stringify(normalized)),{flow:[{speaker:'You | For',claim:'Public space matters.'}]});
assert.equal(normalContext.normalizeNotes({flow:[]}).flow.length,0);

// The practice renderer consumes claims only, even for a legacy full-analysis
// response. A judge label or response recommendation cannot become an AI note.
const renderer = practice.slice(practice.indexOf('  var flowResultToText ='),practice.indexOf('  var genFlowSheet ='));
const renderContext = vm.createContext({fmt:{sides:['pro','con'],sideLabels:{pro:'Pro',con:'Con'}},side:'pro'});
vm.runInContext(renderer,renderContext);
const rendered = renderContext.flowResultToText({flow:[
  {speaker:'You | Pro [pro]',claim:'Reclaim street space',status:'dropped'},
  {speaker:'AI | Con [con]',claim:'Keep transport accessible',status:'live'}
],overview:{ballot_story:'JUDGE VIEW'},responses:[{line:'ADVICE'}],clashes:[{edge:'You'}]});
assert(rendered.includes('YOUR POINTS\n- Reclaim street space.'));
assert(rendered.includes('THEIR POINTS\n- Keep transport accessible.'));
assert(!/JUDGE VIEW|ADVICE|Still standing|Nobody answered|Edge to|NEXT TIME/.test(rendered));

// Exercise the actual live generator with simulated model replies. Its stored
// shape drops old advice, and a Just argue exchange generates both sides from
// their own source segments instead of its placeholder pro side.
const generator = live.slice(live.indexOf('  function generateRoundNotes('),live.indexOf('  // ── Live fact check'));
const requests=[];
const sentence='The city should expand bus services because people need reliable transport to work every day. Night workers also need a way home when most public transport has stopped running and their families cannot drive them.';
const ctx = vm.createContext({
  state:{formatKey:'quick',motion:'Cities should add buses',roundNotes:[],rnPending:{},proName:'Sam',conName:'Jordan',openPeerSegs:[{text:sentence}]},
  FORMATS:{quick:{name:'Casual 1v1'}},_rnGenerated:{},isSpectator:()=>false,roundLangs:()=>['en'],
  renderRoundNotes:()=>{},notifyRoundNotes:()=>{},getRoundDocRef:()=>null,gtag:()=>{},
  mySide:()=> 'pro',openPeerSide:()=> 'con',openSeg:{segs:[{text:sentence}]},
  fetch:async (url,init)=>{requests.push(JSON.parse(init.body));return {ok:true,text:async()=>JSON.stringify({content:[{text:JSON.stringify({points:[{tag:'Buses',note:'The speaker wants more reliable transport.',answer:'COACHING SHOULD BE DROPPED'}]})}]})};},
  console,setTimeout
});
vm.runInContext(generator,ctx);
ctx.generateRoundNotes({open:true,code:'TALK',name:'Conversation',side:'pro',text:sentence},0);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,2);
assert(requests.every(r=>r._feature==='round-notes'));
assert(requests.every(r=>r.system.includes('No advice, counterarguments')));
assert.deepEqual(Array.from(ctx.state.roundNotes,r=>r.side).sort(),['con','pro']);
assert(ctx.state.roundNotes.every(row=>!('answer' in row.points[0])));
assert(!live.slice(live.indexOf('  function floorJudgeComment'),live.indexOf('  // ── Round notes')).includes("fetch('/api/claude'"));
assert(live.includes("remark.kind !== 'round-summary'"));
assert(live.indexOf('generateRoundNotes(entry, state.speechIdx - 1);') < live.indexOf('      finishRound();',live.indexOf('  function endSpeech(')));
assert(practice.includes("purpose: 'notes'"));
assert(live.includes('id="openRoundNotes"') && live.includes('body.spectator-mode .spec-menu{display:flex'));
assert(exporter.includes("scope:SCOPE,include_granted_scopes:false"));
assert(!exporter.includes('localStorage') && !exporter.includes('sessionStorage'));
console.log('Round notes and Google Docs export: all assertions passed');
