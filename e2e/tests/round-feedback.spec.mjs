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
