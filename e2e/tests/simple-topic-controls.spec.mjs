import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL('../../app/'+name,import.meta.url),'utf8');
const live=read('live-round.html'), voice=read('newvoice.html');
const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));

test('one topic entry opens three choices and hands keyboard focus to the selected dialog',async({page})=>{
 await page.setContent('<main style="width:290px">'+slice(live,'            <details class="rmb-tools"','          </div>\n          <div class="speech-primary">')+'</main><dialog id="chosen"><button>Close</button></dialog>');
 await page.addStyleTag({content:[...live.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')});
 await page.addScriptTag({content:`var $=id=>document.getElementById(id);
 ${slice(live,"    var rmbTools = $('rmbTools')",'    function syncMotionChangeBtns(){')}
 rmbTools.hidden=false;
 document.querySelectorAll('#rmbTools button').forEach(b=>b.addEventListener('click',()=>document.getElementById('chosen').showModal()));
 document.querySelector('#chosen button').onclick=()=>document.getElementById('chosen').close();`});
 await expect(page.locator('#rmbToolsLabel')).toHaveText('Debate something else');
 for(const id of ['rmbRollBtn','rmbTalkBtn','rmbDraftBtn']){
  await expect(page.locator('#'+id)).toBeHidden();
  await page.locator('#rmbToolsLabel').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#rmbTools button:visible')).toHaveCount(3);
  await page.locator('#'+id).click();
  await expect(page.locator('#chosen')).toBeVisible();await expect(page.locator('#chosen button')).toBeFocused();
  await page.locator('#chosen button').click();await expect(page.locator('#rmbToolsLabel')).toBeFocused();
  await expect(page.locator('#'+id)).toBeHidden();
 }
});

test('AI setup steps stay aligned on phones and support keyboard navigation',async({page})=>{
 const markup=slice(voice,'      <ol class="wiz-progress"','    </div>\n\n    <!-- 1');
 await page.setContent('<section id="setup" class="on" style="width:100%">'+markup+'<div class="wiz-step" data-step="1"></div><div class="wiz-step" data-step="2"></div><div id="wizClaimEcho"></div></section>');
 await page.addStyleTag({content:[...voice.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')});
 await page.addScriptTag({content:`var $=id=>document.getElementById(id), talkItOut=false, wizStep=1, claimInput={value:''};function sanitizeTopic(s){return s;}function paintVoiceGrid(){}function paintWizSummary(){}
 ${slice(voice,'function goStep(n){','function paintWizSummary(){')}
 ${slice(voice,"document.addEventListener('click', (e) => {\n  const t = e.target", "$('voiceBackBtn').addEventListener")}`});
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  const rects=await page.locator('#wizProgress button').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,x:r.x,right:r.right,height:r.height,over:e.scrollWidth>e.clientWidth};}));
  expect(rects.every(r=>r.y===rects[0].y&&r.x>=0&&r.right<=width&&!r.over)).toBe(true);
  if(width<720)expect(rects.every(r=>r.height>=44)).toBe(true);
 }
 await page.locator('#wizProgress button').nth(1).focus();await page.keyboard.press('Enter');
 await expect(page.locator('#wizProgress button').nth(1)).toHaveAttribute('aria-current','step');
 await expect(page.locator('.wiz-step[data-step="2"]')).toHaveClass(/on/);
});
