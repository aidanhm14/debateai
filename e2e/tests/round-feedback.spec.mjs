import {test,expect} from '@playwright/test';
import {roomDesign} from '../helpers/room-design.mjs';
for(const width of [390,1280])test(`round feedback retries and stays linked at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});let attempts=0;
  const fixture=await roomDesign(page,{api:url=>url.pathname==='/api/log-generation'?{status:++attempts===1?503:200,json:{ok:attempts>1}}:null});
  await page.goto('https://debatable.test/live-round?design=ballot');
  await page.evaluate(()=>{window.getAppCheckToken=async()=>'fixture';const opts={host:document.getElementById('roundFeedback'),generationId:'test-generation',surface:'live_round',getToken:async()=>'fixture'};RoundFeedback.mount(opts);RoundFeedback.mount(opts);});
  const host=page.locator('#roundFeedback');await expect(host.locator('form')).toHaveCount(1);
  await host.getByLabel('How useful was this decision?').selectOption('3');
  await host.getByLabel('Anything we should improve?').selectOption('transcript');
  await host.getByLabel('Your feedback').fill('My final sentence was missing.');
  await host.getByRole('button',{name:'Send feedback'}).click();await expect(host.getByRole('status')).toContainText('Could not save');
  await host.getByRole('button',{name:'Send feedback'}).click();await expect(host.getByRole('status')).toContainText('Feedback saved');
  await expect(host.getByRole('button',{name:'Sent'})).toBeDisabled();
  const writes=fixture.requests.filter(x=>x.path==='/api/log-generation');expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[1].body)).toMatchObject({generationId:'test-generation',signal:'rate',value:3,meta:{issue:'transcript',notes:'My final sentence was missing.'}});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(fixture.errors).toEqual([]);
});

test('issue-only feedback survives late capture and a token timeout',async({page})=>{
  const fixture=await roomDesign(page,{api:url=>url.pathname==='/api/log-generation'?{json:{ok:true}}:null});
  await page.goto('https://debatable.test/live-round?design=ballot');
  await page.evaluate(()=>{window.getAppCheckToken=async()=>'fixture';const host=document.getElementById('roundFeedback');RoundFeedback.mount({host,roundId:'round_123',surface:'live_round',getToken:async()=>'fixture'});});
  const host=page.locator('#roundFeedback');
  await host.getByLabel('Anything we should improve?').selectOption('audio');
  await host.getByLabel('Your feedback').fill('The sound cut out.');
  await page.evaluate(()=>{const host=document.getElementById('roundFeedback');RoundFeedback.mount({host,roundId:'round_123',generationId:'saved_123',getToken:async()=>'fixture'});RoundFeedback.mount({host,roundId:'round_123',generationId:undefined});});
  await expect(host.getByLabel('Your feedback')).toHaveValue('The sound cut out.');
  await host.getByRole('button',{name:'Send feedback'}).click();await expect(host.getByRole('status')).toContainText('Feedback saved');
  expect(JSON.parse(fixture.requests.filter(x=>x.path==='/api/log-generation')[0].body)).toMatchObject({action:'round_feedback',roundId:'round_123',generationId:'saved_123',rating:null,issue:'audio'});
  await page.evaluate(()=>{RoundFeedback.mount({host:document.getElementById('roundFeedback'),roundId:'round_456',surface:'live_round',getToken:()=>new Promise(()=>{})});const set=window.setTimeout;window.setTimeout=(fn,ms)=>set(fn,ms===20000?5:ms);});
  await host.getByLabel('Anything we should improve?').selectOption('audio');await host.getByRole('button',{name:'Send feedback'}).click();
  await expect(host.getByRole('status')).toContainText('Saving took too long');await expect(host.getByRole('button',{name:'Send feedback'})).toBeEnabled();
});
