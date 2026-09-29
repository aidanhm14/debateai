import {test,expect} from '@playwright/test';
import {roomDesign} from '../helpers/room-design.mjs';
for(const width of [390,1280]) test(`source checks remain visible above notes at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const fixture=await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=waiting');
  await expect(page.locator('#factChecks')).toBeVisible();
  await expect(page.locator('#fcSub')).toContainText('Listening for checkable claims');
  expect(await page.locator('#factChecks').evaluate(node=>!!(node.compareDocumentPosition(document.querySelector('#roundNotes'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.locator('#fcOffBtn').click();
  await expect(page.locator('#fcSub')).toContainText('Off for you');
  await page.locator('#fcOffBtn').click();
  await expect(page.locator('#fcSub')).toContainText('Listening');
  await page.goto('https://debatable.test/live-round?design=speaking');
  await expect(page.locator('#factChecks')).toBeVisible();
  await expect(page.locator('#fcList')).toContainText('Source check');
  expect(fixture.errors).toEqual([]);
});
