import { test, expect } from '@playwright/test';
import { offlineSite, readApp } from '../helpers/offline-site.mjs';
import { charterDoc } from '../../app/netlify/functions/lib/judge-charter.mjs';

for (const width of [390,834,1180]) test(`walkthrough layouts at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:820});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('da-theme','light'));
  const f=await offlineSite(page,{api:u=>u.pathname==='/api/judge/charter'?{json:charterDoc(Date.now())}:undefined});
  await page.goto('https://debatable.test/');
  const toggle=page.locator('#landing-more-toggle');if(await toggle.isVisible())await toggle.click();
  await page.locator('#debate-types').scrollIntoViewIfNeeded();
  const colors=await page.locator('.dt-card').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  expect(new Set(colors).size).toBe(4);await expect(page.locator('.dt-card img')).toHaveCount(0);
  await page.locator('#faq').scrollIntoViewIfNeeded();await expect(page.locator('.faq-stack-row[open] .faq-answer-image')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.goto('https://debatable.test/judge-integrity');
  await expect(page.locator('#criteria')).toBeVisible();await expect(page.locator('#rubric')).toHaveCount(1);
  await expect(page.locator('#rubric')).not.toContainText('Loading');
  await expect(page.locator('#decision')).not.toHaveAttribute('open','');
  await page.locator('#decision>summary').click();await expect(page.locator('#decision .council-steps')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(f.errors).toEqual([]);
});

test('saved age is reused, unknown age never becomes adult',async({page})=>{
  const f=await offlineSite(page,{api:u=>u.pathname==='/api/age-band'?{json:{band:'minor'}}:undefined});
  await page.goto('https://debatable.test/404');
  await page.evaluate(()=>{window.firebase={auth:()=>({currentUser:{uid:'one',getIdToken:async()=>'fixture'}})};localStorage.setItem('da-age-band','adult');});
  await page.addScriptTag({content:readApp('js/age-gate.js')});
  expect(await page.evaluate(()=>new Promise(resolve=>daAskAgeBand(resolve)))).toBe('minor');
  await expect(page.locator('#daAgeGate')).toHaveCount(0);expect(f.requests.filter(r=>r.path==='/api/age-band'&&r.method==='POST')).toHaveLength(0);
  await page.route('**/api/age-band',route=>route.fulfill({json:{band:null}}));
  await page.evaluate(()=>{window.firebase={auth:()=>({currentUser:{uid:'two',getIdToken:async()=>'fixture'}})};daAskAgeBand(()=>{});});
  await expect(page.locator('#daAgeGate')).toBeVisible();expect(await page.evaluate(()=>daAgeBand())).toBe('');
  expect(await page.evaluate(()=>daAgeAskDue())).toBe(false);
  await page.route('**/api/age-band',route=>route.fulfill({json:{band:'minor'}}));
  expect(await page.evaluate(()=>{window.firebase={auth:()=>({currentUser:{uid:'one',getIdToken:async()=>'fixture'}})};return new Promise(resolve=>daAskAgeBand(resolve));})).toBe('minor');
  await expect(page.locator('#daAgeGate')).toHaveCount(0);
});

test('identity waits for the saved alias and remembers a prompt per account',async({page})=>{
  await offlineSite(page);await page.goto('https://debatable.test/404');
  await page.evaluate(()=>{window.saved={displayNameOverride:'Lucas'};window.writes=[];window.person={uid:'one',isAnonymous:false};window.firebase={auth:()=>({currentUser:person}),firestore:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>saved}),set:async data=>writes.push(data)})})})};});
  await page.addScriptTag({content:readApp('js/public-identity.js')});
  expect(await page.evaluate(async()=>{await DBIdentity.hydrate(person);return DBIdentity.forUser(person).name;})).toBe('Lucas');
  expect(await page.evaluate(()=>DBIdentity.needsName(person))).toBe(false);
  await page.evaluate(()=>DBIdentity.markNameAsked(person));
  expect(await page.evaluate(()=>DBIdentity.nameAsked(person))).toBe(true);
  expect(await page.evaluate(()=>DBIdentity.nameAsked({uid:'two'}))).toBe(false);
  expect(await page.evaluate(()=>writes)).toContainEqual({namePromptCompleted:true});
});

for(const configured of [false,true]) test(`round feedback ${configured?'configured':'unconfigured'}`,async({page})=>{
  await offlineSite(page,{api:u=>u.pathname==='/api/round-feedback-form'?{json:{url:configured?'https://docs.google.com/forms/d/e/fixture/viewform':null}}:undefined});
  await page.goto('https://debatable.test/round-feedback?round=example-round');
  await expect(page.locator('#roundId')).toHaveText('example-round');
  if(configured)await expect(page.locator('#googleForm')).toBeVisible();
  else {await expect(page.locator('#googleForm')).toBeHidden();await expect(page.locator('#formStatus')).toContainText('not available yet');}
});

test('invitation rotates only its opponent; reduced motion remains static',async({page})=>{
  await page.setViewportSize({width:1180,height:820});await page.clock.install();
  await page.addInitScript(()=>{let seed=314159;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
  const f=await offlineSite(page);await page.goto('https://debatable.test/');
  await page.clock.runFor(11000);
  await expect(page.locator('#fsNameB')).toHaveText('You');
  const a=await page.locator('#fsNameA').innerText(),b=await page.locator('#fsFaceB').getAttribute('src'),motion=await page.locator('#fsMotion').innerText();
  await page.clock.runFor(3000);
  await expect(page.locator('#fsNameA')).not.toHaveText(a);await expect(page.locator('#fsNameB')).toHaveText('You');
  await expect(page.locator('#fsFaceB')).toHaveAttribute('src',b);await expect(page.locator('#fsMotion')).toHaveText(motion);expect(f.errors).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  const still=await page.locator('#fsFaceA').getAttribute('src');await page.clock.runFor(20000);await expect(page.locator('#fsFaceA')).toHaveAttribute('src',still);
});

test('Good chat example has no invented winner or score',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});const f=await offlineSite(page);await page.goto('https://debatable.test/');
  let found=false;
  for(let i=0;i<200;i++){
    if(await page.locator('#fsWinner').innerText()==='Good chat'){found=true;break;}
    await page.getByRole('button',{name:'Next example round',exact:true}).click({force:true});
  }
  expect(found).toBe(true);await expect(page.locator('#fsScore')).toHaveText('No decision');await expect(page.locator('#fsCard')).not.toContainText('wins');expect(f.errors).toEqual([]);
});

test('public standings show chosen viewpoint and an explicit profile link',async({page})=>{
  await offlineSite(page,{api:u=>u.pathname==='/api/leaderboard-top'?{json:{rows:[{uid:'fixtureaccount00000000001',name:'Lucas',kind:'rating',rank:1,rating:1620,games:6,publicIdeology:'Socialist'},{uid:'fixtureaccount00000000002',name:'Sam',kind:'rating',rank:2,rating:1600,games:6}],total:2}}:undefined});
  await page.goto('https://debatable.test/');await page.locator('#ranked-band').scrollIntoViewIfNeeded();
  await expect(page.locator('.rb-ideology').first()).toHaveText('Socialist');await expect(page.locator('.rb-ideology').nth(1)).toHaveText('Not given');
  await expect(page.locator('.rb-profile-link').first()).toHaveAttribute('href','/users?uid=fixtureaccount00000000001');
});

function componentHead(source){return (source.slice(0,source.indexOf('</head>')).replace(/<!--[\s\S]*?-->/g,'').match(/<style\b[^>]*>[\s\S]*?<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)||[]).join('\n');}
function sourceBetween(source,a,b){const start=source.indexOf(a),end=source.indexOf(b,start);if(start<0||end<0)throw Error('Missing component source');return source.slice(start,end);}
for(const width of [390,834,1180])test(`queue and account settings components at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  let doc='';const f=await offlineSite(page,{document:()=>doc});
  const spar=readApp('spar.html');
  const shell=sourceBetween(spar,'  function renderSearching(){',"    document.getElementById('cancelBtn').addEventListener")+'\n}';
  const rail=sourceBetween(spar,'  function mountWaitRail(){','  function positionFriendChallenge(){');
  const host=sourceBetween(spar,'  function roomHost(){','  function mountSparRoom(');
  const room=sourceBetween(spar,"    var room = document.createElement('aside');",'    host.appendChild(room);')+'host.appendChild(room);';
  doc='<!doctype html><html data-theme="light"><head>'+componentHead(spar)+'</head><body><main class="wrap"><div id="shell" class="shell"></div></main></body></html>';
  await page.goto('https://debatable.test/spar');
  await page.addScriptTag({content:'var shell=document.getElementById("shell"),state={},formatParam="casual";function alertsCtaHtml(){return "";}function friendChallengeHtml(){return "";}function renderWaitlist(){return "";}function removeWaitRail(){}function syncPresenceBackground(){}function positionFriendChallenge(){}function updatePingedLine(){}'+shell+rail+host+'renderSearching();mountWaitRail();var host=roomHost();'+room});
  expect(f.errors).toEqual([]);
  const bounds=await page.locator('#sparRoom').boundingBox();expect(bounds.width).toBeGreaterThan(280);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  if(width>=900)expect(bounds.y).toBeLessThan(150);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const profile=readApp('profile.html');doc='<!doctype html><html data-theme="light"><head>'+componentHead(profile)+'</head><body class="profile-page social-profile"><main id="fixture" style="max-width:850px;margin:auto"></main></body></html>';
  await page.goto('https://debatable.test/profile');
  await page.addScriptTag({content:sourceBetween(profile,'function renderSettings(','function wireSettings(')+'function escapeHtml(s){return String(s).replace(/[<>&"]/g,"");}document.getElementById("fixture").innerHTML=renderSettings({uid:"fixture"},{displayNameOverride:"Lucas",transcriptCapture:false,corpusAgeAttested:true,contributeToCorpus:false});document.getElementById("settings").open=true;'});
  await expect(page.locator('#setName')).toHaveValue('Lucas');await expect(page.locator('#setCapture')).not.toBeChecked();await expect(page.locator('#setCorpusAge')).toBeHidden();
  await expect(page.getByText('Always save my future rounds',{exact:true})).toBeVisible();
  const label=await page.locator('.capture-choice>label:last-child').boundingBox(),hint=await page.locator('.capture-choice+.hint').boundingBox();expect(label.y+label.height).toBeLessThanOrEqual(hint.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.errors).toEqual([]);
});

test('queue config speeds the active globe without changing the shared default',async({page})=>{
  await offlineSite(page);await page.goto('https://debatable.test/404');
  await page.evaluate(()=>{document.body.innerHTML='<div id="fixtureGlobe"></div>';window.GlobalDebateMap={mount:(host,opts)=>{window.mapOptions=opts;return{stop(){}};}};});
  await page.addScriptTag({content:'var globalMapHandle=null,presenceLive=null;function renderLiveNote(){}'+sourceBetween(readApp('spar.html'),'  function mountGlobalMap(','  fetchPresenceLive();')+'mountGlobalMap("fixtureGlobe");'});
  expect(await page.evaluate(()=>mapOptions.rotateSec)).toBe(120);
});
