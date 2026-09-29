import {randomUUID} from 'node:crypto';
import {getDb} from './lib/firestore.mjs';
import {verifyIdToken,extractBearerToken,isNamedAccount} from './lib/auth.mjs';
import {checkLayers,callerIp} from './lib/rate-limit.mjs';
import {corsResponse,jsonResponse,errorResponse} from './lib/response.mjs';
import {validateCase} from './lib/judge-attacks.mjs';
import {safeText} from './lib/synthetic-lab-core.mjs';
export default async request=>{
  if(request.method==='OPTIONS')return corsResponse(request);
  const db=getDb();
  if(request.method==='GET'){
    const badges=(await db.collection('judge_challenge_badges').where('public','==',true).limit(50).get()).docs.map(d=>{const b=d.data();return {id:d.id,alias:b.alias,summary:b.summary,verifiedAt:b.verifiedAt};});
    return jsonResponse({badges},200,request);
  }
  if(request.method!=='POST')return errorResponse('POST only',405,request);
  let who;try{who=await verifyIdToken(extractBearerToken(request));}catch{return errorResponse('Sign in to submit.',401,request);}
  if(!isNamedAccount(who))return errorResponse('Use a named account.',401,request);
  const uid=who.sub || who.uid;
  if(!(await checkLayers('judge-challenge','uid:'+uid,[{window:86400000,max:5,label:'day'}])).ok || !(await checkLayers('judge-challenge','ip:'+callerIp(request),[{window:86400000,max:15,label:'day'}])).ok)return errorResponse('Daily submission limit reached.',429,request);
  try{
    const raw=await request.text();if(raw.length>30000)return errorResponse('Submission too large.',413,request);
    const b=JSON.parse(raw);
    if(b.action==='withdraw'){
      if(!/^[a-f0-9-]{36}$/.test(String(b.id||'')))throw Error('Invalid submission.');
      const ref=db.collection('judge_challenge_submissions').doc(b.id);
      await db.runTransaction(async tx=>{const d=await tx.get(ref);if(d.data()?.uid!==uid)throw Error('Submission not found.');tx.update(ref,{publicConsent:false});tx.set(db.collection('judge_challenge_badges').doc(b.id),{public:false},{merge:true});});
      return jsonResponse({ok:true},200,request);
    }
    if(b.synthetic!==true)throw Error('Submit an invented test case you have the right to share. Do not paste another person’s private round.');
    const example=validateCase(b.example),description=String(b.description||'').trim(),alias=String(b.alias||'').trim();
    if(description.length<30||description.length>2000)throw Error('Explain the suspected failure in 30 to 2000 characters.');
    if(alias.length>50)throw Error('Keep your public alias under 50 characters.');
    safeText(description);if(alias)safeText(alias);
    const id=randomUUID();
    await db.collection('judge_challenge_submissions').doc(id).create({uid,example,description,alias:alias||'Anonymous',publicConsent:b.publicConsent===true,synthetic:true,createdAt:Date.now(),status:'pending'});
    return jsonResponse({ok:true,id,message:'Saved privately for human review. No rating changes or badge until a failure is reproduced and verified.'},201,request);
  }catch(e){return errorResponse(String(e.message||'Invalid submission.').slice(0,250),400,request);}
};
export const config={path:'/api/judge-challenge'};
