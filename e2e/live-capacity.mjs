// Manual provider transport check. Private expiring Daily rooms only; no
// public matchmaking, real accounts, camera permission or microphone access.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { videoRoomProperties } from '../app/netlify/functions/lib/video-capacity.mjs';
if (!process.argv.includes('--live') || !process.env.DAILY_API_KEY) throw new Error('Requires --live and DAILY_API_KEY');
const roomCount=Number(process.env.LOAD_ROOMS||2), viewers=Number(process.env.LOAD_VIEWERS||4);
const total=roomCount*2+viewers;
if(roomCount<1 || roomCount>50 || viewers<0 || viewers>198 || total>300) throw new Error('Bounded test limits exceeded');
const tokenExpiry=Math.floor(Date.now()/1000)+900;
let expiry=tokenExpiry;
const report={kind:'daily-synthetic-media',rooms:roomCount,speakers:roomCount*2,viewers,expiry,results:[],startedAt:new Date().toISOString(),
  conservativeCostCeilingUsd:Number((total*5*.004).toFixed(2)),mediaDescription:'synthetic 320x180 video at 5fps and synthetic audio; one local load generator'};
const created=[],pages=[],tokens=[],tokenJobs=[],prefix='scale-'+Date.now();
let browser,server,watchdog;
const key=process.env.DAILY_API_KEY;
async function api(path,body,method=body?'POST':'GET'){
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch('https://api.daily.co/v1'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(r.status===429 && attempt<2){await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;}
  if(!r.ok)throw new Error('Daily '+r.status+' '+(await r.text()).slice(0,220));return r.json();
 }
}
async function pooled(items,limit,fn){let n=0;await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(n<items.length){const i=n++;await fn(items[i],i);}}));}
try{
 // Room expiration bounds spend even if the generator or cleanup crashes.
 await pooled(Array.from({length:roomCount},(_,i)=>i),2,async i=>{
  const name=prefix+'-'+i;
  const room=await api('/rooms',{name,privacy:'private',properties:{...videoRoomProperties(),exp:expiry,eject_at_room_exp:true,start_audio_off:true,start_video_off:true}});
  created[i]=name;
  const roles=[false,false,...(i===0?Array(viewers).fill(true):[])];
  for(let j=0;j<roles.length;j++)tokenJobs.push({name,url:room.url,viewer:roles[j],uid:'load-'+i+'-'+j,room:i});
 });
 await pooled(tokenJobs,4,async props=>{
  const token=await api('/meeting-tokens',{properties:{room_name:props.name,user_id:props.uid,user_name:props.uid,exp:tokenExpiry,eject_at_token_exp:true,
   permissions:{hasPresence:!props.viewer,canSend:!props.viewer}}});
  tokens.push({...props,token:token.token});
  if(tokens.length%50===0)console.log('Daily tokens prepared:',tokens.length);
  await new Promise(r=>setTimeout(r,80));
 });
 // No call joins until every room has this five-minute spending ceiling.
 // Setup/token creation does not consume participant minutes.
 expiry=Math.floor(Date.now()/1000)+300;report.expiry=expiry;
 await pooled(created,4,name=>api('/rooms/'+name,{properties:{exp:expiry,eject_at_room_exp:true}}));
 const sdk=readFileSync(new URL('../app/vendor/daily-iframe-0.92.2.js',import.meta.url));
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/sdk.js'?'application/javascript':'text/html');res.end(req.url==='/sdk.js'?sdk:'<!doctype html><html><body><script src="/sdk.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,channel:'chromium',args:['--autoplay-policy=no-user-gesture-required']});
 watchdog=setTimeout(()=>browser.close().catch(()=>{}),210000);
 // Ten clients per page share renderer overhead. Their Daily call objects,
 // tokens and peer connections remain independent.
 for(let i=0;i<Math.ceil(total/10);i++){
  const page=await browser.newPage();await page.goto(origin);pages.push(page);
  await page.evaluate(()=>{window.calls=[];window.timings=[];
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
   const context=canvas.getContext('2d');let n=0;setInterval(()=>{context.fillStyle=n++%2?'#ee3344':'#224488';context.fillRect(0,0,320,180);context.fillStyle='white';context.fillText('Capacity test '+n,20,80);},200);
   window.video=canvas.captureStream(5).getVideoTracks()[0];
   const audio=new AudioContext();const oscillator=audio.createOscillator();const gain=audio.createGain();gain.gain.value=.01;
   const destination=audio.createMediaStreamDestination();oscillator.connect(gain);gain.connect(destination);oscillator.start();audio.resume();window.audio=destination.stream.getAudioTracks()[0];
  });
 }
 const byRole=[...tokens.filter(x=>!x.viewer),...tokens.filter(x=>x.viewer)].map((x,i)=>({...x,pageIndex:Math.floor(i/10),pageSlot:i%10}));
 // Start each browser group before filling it, rather than serializing
 // every group's initial signaling/ICE wait behind the previous group.
 byRole.sort((a,b)=>a.pageSlot-b.pageSlot || a.pageIndex-b.pageIndex);
 let joined=0, failed=0;
 await pooled(byRole,20,async (props,i)=>{
  if(failed>=5) return;
  const page=pages[props.pageIndex];
  try{
   const result=await page.evaluate(async props=>{
    const call=DailyIframe.createCallObject({allowMultipleCallInstances:true,subscribeToTracksAutomatically:true});calls.push(call);
    const t=performance.now();
    let deadline;
    try { await Promise.race([call.join({url:props.url,token:props.token,audioSource:props.viewer?false:audio.clone(),videoSource:props.viewer?false:video.clone()}),
      new Promise((resolve,reject)=>{deadline=setTimeout(()=>reject(new Error('Synthetic client join exceeded 60 seconds')),60000);})]); }
    catch(error){calls.splice(calls.indexOf(call),1);call.destroy().catch(()=>{});throw new Error(String(error?.errorMsg || error?.message || error?.type || error).replace(/https?:\/\/\S+/g,'[provider URL]').slice(0,250));}
    finally {clearTimeout(deadline);}
    if(!props.viewer){await call.setLocalAudio(true);await call.setLocalVideo(true);}
    return {uid:props.uid,viewer:props.viewer,room:props.room,joinMs:Math.round(performance.now()-t),joinedAt:Date.now()};
   },props);
   report.results.push({...result,ok:true});joined++;
  }catch(error){failed++;report.results.push({uid:props.uid,room:props.room,viewer:props.viewer,ok:false,error:String(error.message).slice(0,180)});}
  if((i+1)%5===0)console.log('Daily clients attempted:',i+1,'joined:',joined);
 });
 await new Promise(resolve=>setTimeout(resolve,15000));
 const media=[];
 for(const page of pages)media.push(...await page.evaluate(()=>calls.map(call=>({
  state:call.meetingState(),peers:Object.values(call.participants()).filter(p=>!p.local).map(p=>({audio:p.tracks?.audio?.state,video:p.tracks?.video?.state})),counts:call.participantCounts(),
 }))));
 report.joined=joined;report.media=media;report.passed=joined===total && media.every(x=>x.state==='joined-meeting' && x.peers.some(p=>p.video==='playable' && p.audio==='playable'));
 report.peakConnected=media.filter(x=>x.state==='joined-meeting').length;
 const times=report.results.filter(r=>r.ok).map(r=>r.joinMs).sort((a,b)=>a-b);
 report.p95JoinMs=times[Math.min(times.length-1,Math.floor(times.length*.95))]||null;
 const finished=Date.now();report.estimatedVideoCostUsd=Number((report.results.reduce((sum,r)=>sum+(r.ok?(finished-r.joinedAt)/60000:0),0)*.004).toFixed(4));
 console.log(JSON.stringify({joined,total,peak:report.peakConnected,p95JoinMs:report.p95JoinMs,passed:report.passed,estimatedVideoCostUsd:report.estimatedVideoCostUsd}));
}catch(error){report.passed=false;report.error=String(error.message).slice(0,400);console.error(report.error);process.exitCode=1;
}finally{
 report.joined=report.results.filter(r=>r.ok).length;report.attempted=report.results.length;
 const ended=Date.now();
 report.estimatedVideoCostUsd=Number((report.results.reduce((sum,r)=>sum+(r.ok?(ended-r.joinedAt)/60000:0),0)*.004).toFixed(4));
 clearTimeout(watchdog);if(browser)await browser.close().catch(()=>{});if(server)server.close();
 const failures=[];
 await pooled(created.filter(Boolean),3,async name=>{try{await api('/rooms/'+name,undefined,'DELETE');}catch{failures.push(name);}});
 report.cleanupFailures=failures;report.finishedAt=new Date().toISOString();
 if(process.env.LOAD_REPORT_PATH)writeFileSync(process.env.LOAD_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
 if(!report.passed)process.exitCode=1;
}
