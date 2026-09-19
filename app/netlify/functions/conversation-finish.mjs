import {verifyIdToken, extractBearerToken} from './lib/auth.mjs';
import {getDb} from './lib/firestore.mjs';
import {corsResponse, errorResponse, jsonResponse} from './lib/response.mjs';
import {checkLayers} from './lib/rate-limit.mjs';
import {changeConversationFinish} from './lib/conversation-finish.mjs';

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed',405,request);
  let who, body;
  try {who = await verifyIdToken(extractBearerToken(request));}
  catch {return errorResponse('Sign in to finish this conversation.',401,request);}
  try {body = await request.json();}
  catch {return errorResponse('Invalid request.',400,request);}
  const room = String(body.room || '');
  if (!/^[a-zA-Z0-9-]{3,80}$/.test(room)) return errorResponse('Invalid room.',400,request);
  const uid = who.uid || who.sub;
  try {
    const limit = await checkLayers('conversation-finish',uid,[{window:60000,max:30,label:'minute'}]);
    if (!limit.ok) return errorResponse('Wait a moment before trying again.',429,request);
    const result = await changeConversationFinish(getDb(),room,uid,body);
    const response = jsonResponse(result,200,request);
    response.headers.set('Cache-Control','no-store');
    return response;
  } catch (e) {
    if (e.code && e.status) return jsonResponse({error:e.message,code:e.code},e.status,request);
    console.error('[conversation-finish]',e.message);
    return errorResponse('Could not update the finish request. Try again.',503,request);
  }
}
export const config = {path:'/api/conversation-finish'};
