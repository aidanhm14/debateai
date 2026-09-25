// An authenticated person may test only their own registered devices.
import {verifyIdToken, extractBearerToken} from './lib/auth.mjs';
import {corsResponse, jsonResponse, errorResponse} from './lib/response.mjs';
import {checkLayers} from './lib/rate-limit.mjs';
import {sendToUser} from './lib/webpush.mjs';
export function makeHandler({verify = verifyIdToken, rate = checkLayers, send = sendToUser} = {}) {
  return async request => {
    if (request.method === 'OPTIONS') return corsResponse(request);
    if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Sign in to test notifications.', 401, request);
    let user;
    try { user = await verify(token); } catch { return errorResponse('Sign in again to test notifications.', 401, request); }
    if (!user.sub || user.firebase?.sign_in_provider === 'anonymous') return errorResponse('Sign in to test notifications.', 401, request);
    if (!(await rate('push-test', 'uid_' + user.sub, [{window:60000,max:2,label:'minute'},{window:86400000,max:10,label:'day'}])).ok) {
      return errorResponse('Please wait before sending another test.', 429, request);
    }
    const result = await send(user.sub, {title:'Your Debatable notification test',body:'Match and message alerts can reach this device. Tap to open notification settings.',url:'/notifications',tag:'da-push-test'});
    return jsonResponse({sent:result.sent || 0, web:result.web?.sent || 0, native:result.native?.sent || 0,
      needsSetup:!!(result.web?.rejected || result.web?.error || result.native?.error)},200,request);
  };
}
export default makeHandler();
export const config = {path:'/api/push-test'};
