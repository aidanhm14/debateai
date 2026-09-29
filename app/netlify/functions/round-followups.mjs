import {getDb} from './lib/firestore.mjs';
import {verifyIdToken,extractBearerToken} from './lib/auth.mjs';
import {corsResponse,jsonResponse,errorResponse} from './lib/response.mjs';
import {checkLayers} from './lib/rate-limit.mjs';
import {followupPair} from './lib/round-followups.mjs';
export default async request=>{
  if(request.method==='OPTIONS')return corsResponse(request);
  if(request.method!=='POST')return errorResponse('POST only',405,request);
  let who,body;try{who=await verifyIdToken(extractBearerToken(request));}catch{return errorResponse('Sign in.',401,request);}
  try{body=await request.json();}catch{return errorResponse('Invalid request.',400,request);}
  const room=String(body.room || ''),uid=who.sub || who.uid;
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(room))return errorResponse('Invalid room.',400,request);
  if(!(await checkLayers('round-followups',uid,[{window:60000,max:8,label:'minute'}])).ok)return errorResponse('Wait a moment.',429,request);
  const db=getDb(),ref=db.collection('round_followups').doc(room),roundRef=db.collection('live_rounds').doc(room);
  const result=await db.runTransaction(async tx=>{
    const [saved,snap]=await Promise.all([tx.get(ref),tx.get(roundRef)]),round=snap.data();
    if(!round || ![round.proUid,round.conUid].includes(uid))return {error:'Participants only.'};
    if(saved.exists)return saved.data();
    if(round.ballotPending || round.ballot || round.ballotUnresolved)return {questions:[]};
    const questions=followupPair(round);if(!questions)return {questions:[]};
    const value={questions,createdAt:Date.now(),uids:[round.proUid,round.conUid]};
    tx.create(ref,value);return value;
  });
  return jsonResponse(result,result.error?403:200,request);
};
export const config={path:'/api/round-followups'};
