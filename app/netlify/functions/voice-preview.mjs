import { verifyAppCheckToken, extractAppCheckToken } from './lib/appcheck.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { reserveVoicePreview, createVoicePreview } from './lib/voice-preview.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export default async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let decoded;
  try {
    // This endpoint always requires real App Check verification, including
    // when older AI endpoints are configured to soft-pass it.
    await verifyAppCheckToken(extractAppCheckToken(request));
    decoded = await verifyIdToken(extractBearerToken(request));
  } catch { return json({ error: 'Reload the page to try voice.', code: 'PREVIEW_VERIFICATION_REQUIRED' }, 401); }
  if (isNamedAccount(decoded)) return json({ error: 'Start a signed-in voice round.', code: 'USE_VOICE_ROUND' }, 409);
  const ip = request.headers.get('x-nf-client-connection-ip');
  if (!ip) return json({ error: 'Preview unavailable on this connection.' }, 503);
  try {
    const body = await request.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json({ error: 'Voice preview unavailable.' }, 503);
    await reserveVoicePreview(getDb(), decoded.sub, ip);
    const preview = await createVoicePreview(body, {
      apiKey, secret: apiKey,
      enqueue: async job => {
        const queued = await fetch('https://itsdebatable.com/api/voice-preview-stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job), signal: AbortSignal.timeout(4000),
        });
        if (queued.status !== 202) throw new Error('Preview cleanup was not queued');
      },
    });
    return json(preview);
  } catch (error) {
    console.warn('[voice-preview]', error.code || 'preview_failed');
    return json({ error: error.status ? error.message : 'The preview could not connect. Create an account to start a round.', code: error.code || 'PREVIEW_UNAVAILABLE' }, error.status || 503);
  }
};
export const config = { path: '/api/voice-preview' };
