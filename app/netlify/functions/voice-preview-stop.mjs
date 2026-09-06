import { verifyPreviewStop, hangupPreview } from './lib/voice-preview.mjs';

export default async request => {
  if (request.method !== 'POST') return;
  let job;
  try { job = await request.json(); } catch { return; }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!verifyPreviewStop(apiKey, job)) return;
  const wait = Math.max(0, job.deadline - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  // Errors are deliberately thrown after bounded retries so Netlify retries
  // the background job too. Already-closed calls are successful no-ops.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await hangupPreview(apiKey, job.callId); return; }
    catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
};
export const config = { path: '/api/voice-preview-stop', background: true };
