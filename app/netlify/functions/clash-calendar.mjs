// Stable links for emails; Google opens the next daily occurrence at click time.
import schedule from '../../js/clash-schedule.js';
export default async request => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
  const id = new URL(request.url).searchParams.get('session');
  const session = schedule.SESSIONS.find(s => s.id === id);
  if (!session) return new Response('Unknown Clash Hour', {status:404});
  return new Response(null, {status:302, headers:{Location:schedule.calendarUrl(schedule.nextFor(session, Date.now())), 'Cache-Control':'no-store'}});
};
export const config = {path:'/api/clash-calendar'};
