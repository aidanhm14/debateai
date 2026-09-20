import {verifyIdToken,extractBearerToken} from './lib/auth.mjs';
import {getDb} from './lib/firestore.mjs';
import {corsResponse,errorResponse,jsonResponse} from './lib/response.mjs';
import {checkLayers} from './lib/rate-limit.mjs';
import {privateInvite} from './lib/private-invite.mjs';

export default async request=>{
  if(request.method==='OPTIONS')return corsResponse(request);
  if(request.method!=='POST')return errorResponse('Method not allowed',405,request);
  let who;
  try{who=await verifyIdToken(extractBearerToken(request));}
  catch{return errorResponse('Sign in to open this private round.',401,request);}
  if(!['google.com','apple.com','password'].includes(who.firebase?.sign_in_provider))return errorResponse('Sign in with Google, Apple, or email to open a private round.',403,request);
  let body;
  try{body=await request.json();}catch{return errorResponse('Invalid request.',400,request);}
  const uid=who.sub;
  try{
    const limit=await checkLayers('private-invite','uid_'+uid,[{window:60000,max:20,label:'minute'},{window:3600000,max:120,label:'hour'}]);
    if(!limit.ok)return errorResponse('Wait a moment before trying again.',429,request);
    const result=await privateInvite(getDb(),uid,body);
    const response=jsonResponse(result,200,request);response.headers.set('Cache-Control','no-store');
    return response;
  }catch(e){
    if(e.status)return errorResponse(e.message,e.status,request);
    console.error('[private-invite]',e.message);
    return errorResponse('Could not open this private round. Try again.',503,request);
  }
};
export const config={path:'/api/private-invite'};
