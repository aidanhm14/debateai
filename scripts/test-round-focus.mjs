import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app/live-round.html','utf8');
const start=source.indexOf('  var roundFocusSelected =');
const end=source.indexOf('  function updatePlayPauseBtn(){',start);
assert.ok(start>0 && end>start);
const classes=new Set(), events={}, attrs={};
let spectator=false, bodyObserver, mediaChange;
const button={hidden:true,textContent:'Camera view',setAttribute(k,v){attrs[k]=v;},addEventListener(k,fn){events[k]=fn;},focus(){}};
const state={phase:'round',room:'controlled-room',speechIdx:0,timerState:'ready',timerElapsed:0};
const phone={matches:true,addEventListener(k,fn){mediaChange=fn;}};
const ctx={state,isSpectator:()=>spectator,$:()=>button,
 window:{matchMedia:()=>phone,scrollY:240,scrollTo(){}},
 document:{body:{classList:{contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}}},addEventListener(k,fn){events[k]=fn;}},
 MutationObserver:class{constructor(fn){bodyObserver=fn;}observe(){}}
};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
ctx.updateRoundFocus();assert.equal(button.hidden,true,'No camera-only option before a speech starts');
state.timerState='running';ctx.updateRoundFocus();assert.equal(button.hidden,false);assert.equal(attrs['aria-pressed'],'false','Speech start offers focus without forcing it');
events.click();assert.equal(attrs['aria-pressed'],'true');assert.ok(classes.has('lr-camera-focus'));assert.equal(button.textContent,'Show details');
state.timerState='paused';ctx.updateRoundFocus();assert.equal(attrs['aria-pressed'],'true','Pausing preserves the chosen view');
state.timerState='ready';state.speechIdx=1;ctx.updateRoundFocus();assert.equal(attrs['aria-pressed'],'true','The next speaker retains the view and real start control');
events.keydown({key:'Escape'});assert.equal(attrs['aria-pressed'],'false');
events.click();state.phase='ballot';ctx.updateRoundFocus();assert.equal(button.hidden,true);assert.equal(attrs['aria-pressed'],'false','The decision restores details');
state.phase='round';state.timerState='running';ctx.updateRoundFocus();events.click();classes.add('lr-mini');bodyObserver();assert.equal(attrs['aria-pressed'],'false','Docking restores details without touching the call');
classes.delete('lr-mini');ctx.updateRoundFocus();events.click();phone.matches=false;mediaChange();assert.equal(attrs['aria-pressed'],'false');assert.equal(button.hidden,true);
phone.matches=true;spectator=true;ctx.updateRoundFocus();assert.equal(button.hidden,true,'Spectator controls are unchanged');
spectator=false;state.room='new-room';state.speechIdx=0;state.timerState='ready';ctx.updateRoundFocus();assert.equal(button.hidden,true,'A new room does not inherit a prior speech');
console.log('Round camera view: opt-in, pause, next speech, Escape, decision, docking, resize, spectator and new-room transitions passed.');
