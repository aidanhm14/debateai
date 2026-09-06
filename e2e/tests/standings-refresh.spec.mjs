import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL('../../app/'+name,import.meta.url),'utf8');
const source=read('landing.html');
const scripts=[...source.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const feed=scripts.find(s=>s.includes('window.__lbTop = (function'));
const band=scripts.find(s=>s.includes('function boardPicturesReady()'));
const rail=scripts.find(s=>s.includes('function renderMobile(rows, total)'));
const boardSource=read('leaderboard.html');
const between=(a,b)=>boardSource.slice(boardSource.indexOf(a),boardSource.indexOf(b,boardSource.indexOf(a)));
const ladder=between('async function loadRatingLadder(){','// Standings for the head-to-head tab:');
const loaders=between('async function fetchView(view){','state.loadFailed = state.loadFailed || {};');
function payload(rating=1600,count=4){return {rows:Array.from({length:count},(_,i)=>({uid:String(i).repeat(28),name:'Person '+i,kind:'rating',rating:rating-i,rank:i+1,placed:true,games:5,wins:3,losses:2,draws:0,xp:150})),total:count};}

test('homepage card, rail and phone strip refresh together and preserve real rows on failure',async({page,context})=>{
 let data=payload(),requests=0;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{
  if(r.request().url().includes('/api/leaderboard-top')){requests++;return r.fulfill({json:data});}
  if(r.request().isNavigationRequest())return r.fulfill({contentType:'text/html',body:'<main><aside id="lbRail" hidden><div id="lbRailList"></div></aside><section id="ranked-band"><div id="rbBoard"></div></section><a id="mhBoard" hidden><span id="mhBoardRow"></span></a></main>' });
  return r.abort();
 });
 await page.goto('https://standings.test/');
 await page.evaluate(()=>{window.DBPfp={};delete window.IntersectionObserver;});
 await page.addScriptTag({content:read('js/standings-refresh.js')});
 for(const script of [feed,band,rail])await page.addScriptTag({content:script});
 expect(errors).toEqual([]);
 await expect(page.locator('#ranked-band .rb-metric-value').first()).toHaveText('1600');
 await expect(page.locator('#lbRail .lbr-sc').first()).toHaveText('1600');
 await expect(page.locator('#mhBoard .mh-sc').first()).toHaveText('1600 rating');
 expect(requests).toBe(1);
 const peer=await context.newPage();await peer.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<p>Finished round</p>'}));await peer.goto('https://standings.test/round');
 data=payload(1700);await peer.evaluate(()=>localStorage.setItem('da-standings-changed','new result'));
 await expect(page.locator('#ranked-band .rb-metric-value').first()).toHaveText('1700');
 await expect(page.locator('#lbRail .lbr-sc').first()).toHaveText('1700');
 await expect(page.locator('#mhBoard .mh-sc').first()).toHaveText('1700 rating');
 data={rows:[],error:'unavailable'};const before=requests;await page.evaluate(()=>DBStandings.changed());
 await expect.poll(()=>requests).toBeGreaterThan(before);
 await expect(page.locator('#ranked-band .rb-metric-value').first()).toHaveText('1700');
 data=payload(1800,0);await page.evaluate(()=>DBStandings.changed());
 await expect(page.locator('#lbRail')).toBeHidden();await expect(page.locator('#mhBoard')).toBeHidden();
 await expect(page.locator('#ranked-band .rb-metric-value')).toHaveCount(0);expect(errors).toEqual([]);
});

test('human standings render without Firestore and refresh independently of stalled activity',async({page})=>{
 let data=payload(),requests=0;
 await page.route('**/*',r=>{if(r.request().url().includes('/api/leaderboard-ratings')){requests++;return r.fulfill({json:data});}return r.fulfill({contentType:'text/html',body:'<output id="rating"></output>'});});
 await page.goto('https://standings.test/leaderboard');
 await page.addScriptTag({content:read('js/standings-refresh.js')});
 await page.addScriptTag({content:`var db=null;var state={view:'live',cache:{},ratingRows:null,loadSeq:{live:1}};
 function payloadSig(a,b){return JSON.stringify([a,b]);} function writePayload(){}
 function paintView(view,ratingRows,rows){state.ratingRows=ratingRows;state.cache[view]=rows;document.getElementById('rating').textContent=ratingRows[0]?.score||'Empty';}
 ${ladder}\n${loaders}
 window.startBoard=async()=>{const got=await fetchView('live');paintView('live',got.ratingRows,got.rows);loadLiveActivity();};`});
 await page.evaluate(()=>startBoard());await expect(page.locator('#rating')).toHaveText('1600');
 await page.evaluate(()=>{db={collection:()=>({where(){return this},orderBy(){return this},limit(){return this}})};window.loadWithFallback=()=>new Promise(()=>{});loadLiveActivity();});
 data=payload(1700);await page.evaluate(()=>DBStandings.changed());await expect(page.locator('#rating')).toHaveText('1700');
 const before=requests;data={rows:[],error:'offline'};await page.evaluate(()=>DBStandings.changed());
 await expect.poll(()=>requests).toBeGreaterThan(before);await expect(page.locator('#rating')).toHaveText('1700');
 data=payload(1800);await page.evaluate(()=>{const request=refreshStandings();state.loadSeq.live++;return request;});
 await expect(page.locator('#rating')).toHaveText('1700');
});

test('returning to a visible board refreshes and hidden tabs do not poll',async({page})=>{
 await page.clock.install();await page.goto('about:blank');
 await page.evaluate(()=>{window.isHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.isHidden});window.reads=0;});
 await page.addScriptTag({content:read('js/standings-refresh.js')});await page.evaluate(()=>DBStandings.watch(()=>window.reads++));
 await page.clock.runFor(45150);expect(await page.evaluate(()=>reads)).toBe(1);
 await page.evaluate(()=>window.isHidden=true);await page.clock.runFor(90000);expect(await page.evaluate(()=>reads)).toBe(1);
 await page.evaluate(()=>{window.isHidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
 await page.clock.runFor(150);expect(await page.evaluate(()=>reads)).toBe(2);
});
