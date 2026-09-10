import {verifyIdToken, extractBearerToken} from './lib/auth.mjs';
import {getDb} from './lib/firestore.mjs';
import {corsResponse, errorResponse, jsonResponse} from './lib/response.mjs';
import {checkLayers} from './lib/rate-limit.mjs';
import {changeTeamSeat, projectTeamRoom, assertTeamSeatsMutable, REQUEST_MS} from './lib/team-seats.mjs';

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (!['GET','POST'].includes(request.method)) return errorResponse('Method not allowed',405,request);
  let who;
  try {who = await verifyIdToken(extractBearerToken(request));}
  catch {return errorResponse('Sign in to use team seats.',401,request);}
  if (!['google.com','apple.com','password'].includes(who.firebase?.sign_in_provider)) return errorResponse('Sign in with Google, Apple, or email to use team seats.',403,request);
  const uid = who.uid || who.sub;
  let body = {};
  if (request.method === 'POST') {try {body=await request.json();} catch {return errorResponse('Invalid request.',400,request);}}
  const room = String(body.room || new URL(request.url).searchParams.get('room') || '');
  if (!/^[a-zA-Z0-9-]{3,80}$/.test(room)) return errorResponse('Invalid room.',400,request);
  try {
    const limit = await checkLayers('team-seats',uid,[{window:60000,max:60,label:'minute'}]);
    if (!limit.ok) return errorResponse('Wait a moment before trying again.',429,request);
    const db=getDb(), ref=db.collection('live_rounds').doc(room);
    let round;
    if (body.action==='enable') {
      const before=await ref.get();
      if(!before.exists)return errorResponse('Round not found.',404,request);
      if(projectTeamRoom(before.data(),uid).hostUid!==uid)return errorResponse('Only the host can open team seats.',403,request);
      assertTeamSeatsMutable(before.data());
      // Secure an existing call before opening its seats. A room that has
      // not been created yet is created private by create-daily-room.
      if(!process.env.DAILY_API_KEY)throw new Error('Video service unavailable');
      const secured=await fetch('https://api.daily.co/v1/rooms/'+encodeURIComponent(room),{
        method:'POST',headers:{Authorization:'Bearer '+process.env.DAILY_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({privacy:'private'}),
      });
      if(!secured.ok&&secured.status!==404)throw new Error('Could not secure the team video room');
    }
    if (request.method === 'POST') ({round}=await changeTeamSeat(db,room,uid,body));
    else {const snap=await ref.get();if(!snap.exists)return errorResponse('Round not found.',404,request);round=snap.data();}
    const result=projectTeamRoom(round,uid);
    const own=await ref.collection('teamSeatRequests').doc(uid).get();
    const project = s => {const d=s.data();return {uid:s.id,key:d.key,name:d.name,status:d.status,requestedAt:d.requestedAt};};
    result.request=own.exists?project(own):null;
    result.requests=[];
    if (result.enabled && result.hostUid===uid && !result.locked) {
      const pending=await ref.collection('teamSeatRequests').where('requestedAt','>',Date.now()-REQUEST_MS).orderBy('requestedAt','desc').limit(100).get();
      result.requests=pending.docs.map(project).filter(r=>r.status==='pending');
    }
    const response=jsonResponse({ok:true,...result},200,request);
    response.headers.set('Cache-Control','no-store');
    return response;
  } catch(e) {
    if(e.code && e.status) return jsonResponse({error:e.message,code:e.code},e.status,request);
    console.error('[team-seats]',e.message);
    return errorResponse('Could not update team seats. Try again.',503,request);
  }
}
export const config={path:'/api/team-seats'};
