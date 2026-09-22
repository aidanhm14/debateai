import { test, expect } from '@playwright/test';
import { roomDesign } from '../helpers/room-design.mjs';

async function fixture(page, scene='speaking') {
  const result = await roomDesign(page, {document:html=>html.replace('  var openSeg =', '  window.__roundUiTest = {notes:renderRoundNotes,notify:notifyRoundNotes,flow:flowMapHtml,paint:paintConversationFlow};\n  var openSeg =')});
  await page.goto('https://debatable.test/live-round?design='+scene+'&controls=1&mySide=con');
  await expect(page.locator('#authGate')).toBeHidden();
  await expect(page.locator('#roundView')).toBeVisible();
  return result;
}

for (const width of [320,390,430]) {
  test(`phone controls have no overlapping buttons at ${width}px`,async({page},info)=>{
    await page.setViewportSize({width,height:844});
    const result=await fixture(page);
    await page.evaluate(()=>{document.getElementById('forfeitNextBtn').style.display='inline-flex';});
    await page.locator('#roomTranscript>summary').click();
    await page.locator('#roomChatBtn').scrollIntoViewIfNeeded();
    const geometry=await page.evaluate(()=>{
      const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      const ids=['playPauseBtn','endSpeechBtn','roomChatBtn','roundFocusBtn','forfeitNextBtn'];
      return {dock:rect('roundActionDock'),buttons:ids.map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.dock.h).toBeLessThan(175);
    expect(geometry.dock.bottom).toBeLessThanOrEqual(844);
    for(let i=0;i<geometry.buttons.length;i++){
      const a=geometry.buttons[i]; expect(a.x).toBeGreaterThanOrEqual(0); expect(a.right).toBeLessThanOrEqual(width);
      expect(a.h).toBeGreaterThanOrEqual(44);
      for(const b of geometry.buttons.slice(i+1)) expect(a.x<b.right && a.right>b.x && a.y<b.bottom && a.bottom>b.y).toBe(false);
    }
    await page.locator('#roomChatBtn').click();
    await expect(page.locator('#audPanel')).toBeVisible();
    await page.locator('#audClose').click();
    await page.locator('#roundFocusBtn').click();
    await expect(page.locator('body')).toHaveClass(/lr-camera-focus/);
    await expect(page.locator('#endSpeechBtn')).toBeInViewport();
    await page.locator('#roundFocusBtn').click();
    await page.locator('#conversationNotes').scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('phone-notes.png')});
    expect(result.errors).toEqual([]);
  });
}

test('transcript groups adjacent chunks only, preserves raw capture, and avoids unchanged DOM work',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const result=await fixture(page);
  const original=await page.evaluate(()=>{
    const engine=window.__lrOpen;
    engine.seg.segs=[{at:1000,text:'Parents should support adult children'},{at:3000,text:'if they can afford it.'},{at:8000,text:'That still depends on their income.'},{at:60000,text:'A separate later point.'}];
    engine.setPeer([{at:5000,text:'What about the cost to parents?',clock:'server'}]);
    window.__roundUiTest.paint();
    return JSON.stringify(engine.seg.segs);
  });
  await expect(page.locator('#conversationFlow .conversation-line')).toHaveCount(0);
  await page.locator('#roomTranscript>summary').click();
  await expect(page.locator('#conversationFlow .conversation-line')).toHaveCount(4);
  await expect(page.locator('#conversationFlow .conversation-line').first()).toHaveText('JordanParents should support adult children if they can afford it.');
  const unchanged=await page.evaluate(()=>{
    const first=document.querySelector('#conversationFlow .conversation-line');
    window.__roundUiTest.paint();
    return {same:first===document.querySelector('#conversationFlow .conversation-line'),raw:JSON.stringify(window.__lrOpen.seg.segs)};
  });
  expect(unchanged).toEqual({same:true,raw:original});
  // Same-side teammates with the same display name must remain separate.
  await page.evaluate(()=>{
    const state=window.__lrOpen.state;
    Object.assign(state,{isDuo:true,proUid:'p1',proUid2:'p2',conUid:'c1',conUid2:'c2',proName:'Sam',proName2:'Sam',teamOpenSegs:{pro:[{at:1,text:'First teammate'}],pro2:[{at:2,text:'Second teammate'}]}});
    window.__roundUiTest.paint();
  });
  await expect(page.locator('#conversationFlow .conversation-line')).toHaveCount(2);
  expect(result.errors).toEqual([]);
});

test('notes updates stay inline, show each name once and omit empty argument groups',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const result=await fixture(page);
  await page.evaluate(()=>{
    window.__notePopups=[];window.daNotify=n=>window.__notePopups.push(n);
    const state=window.__lrOpen.state;
    const note=(idx,side,name,points)=>({idx,side,speakerName:name,code:'Conversation',atMs:idx,points:points.map(note=>({tag:'Point',note}))});
    state.roundNotes=[note(1000,'pro','Sam',['Children learn independence.']),note(1001,'con','Jordan',[]),note(1002,'pro','Sam',['Household costs matter.']),note(1003,'pro','Sam',['Circumstances vary.']),note(1004,'con','Jordan',['Parents can offer support.'])];
    window.__roundUiTest.notes();
    window.__roundUiTest.notify(state.roundNotes);
    window.__roundUiTest.notify(state.roundNotes);
    window.__notesBefore=JSON.stringify(state.roundNotes);
  });
  await expect(page.locator('#openRoundNotes')).toHaveText('Round notes · Updated');
  expect(await page.evaluate(()=>window.__notePopups)).toEqual([]);
  await page.locator('#openRoundNotes').click();
  await expect(page.locator('#openRoundNotes')).toHaveText('Round notes');
  await expect(page.locator('#rnList .rn-speech')).toHaveCount(0);
  await expect(page.locator('#rnList h3')).toHaveText(['For · Sam','Against · Jordan']);
  await expect(page.locator('#roundNotes [data-round-flow]')).toHaveCount(0);
  const map=await page.evaluate(()=>{
    const div=document.createElement('div'); div.innerHTML=window.__roundUiTest.flow();
    return {headers:[...div.querySelectorAll('.fm-speech')].map(n=>n.textContent),rows:div.querySelectorAll('.fm-row').length,rawUnchanged:JSON.stringify(window.__lrOpen.state.roundNotes)===window.__notesBefore};
  });
  expect(map).toEqual({headers:['For · Sam','For · Sam','Against · Jordan'],rows:4,rawUnchanged:true});
  await page.screenshot({path:info.outputPath('shared-notes.png')});
  expect(result.errors).toEqual([]);
});


test('post-round chat stays beside reference controls and the notes fallback is labeled accurately',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const result=await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=ballot');
  await expect(page.locator('#audFab')).toBeHidden();
  await page.locator('#ballotChatBtn').click();
  await expect(page.locator('#audPanel')).toBeVisible();
  await page.locator('#audClose').click();
  await expect(page.locator('#flowOfferBtn')).toHaveText('See round notes');
  await page.locator('#flowOfferBtn').click();
  await expect(page.locator('#flowMap')).toBeVisible();
  await expect(page.locator('#flowOfferBtn')).toHaveText('Hide round notes');
  await page.screenshot({path:info.outputPath('post-round-notes.png')});
  expect(result.errors).toEqual([]);
});
