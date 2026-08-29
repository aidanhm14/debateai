// One-time server-side simulcast starter. The lead Studio holds a random
// start token, never an RTMP URL. Platform keys stay in Netlify env and are
// sent from this function straight to Daily's authenticated REST API.

import { createHash, timingSafeEqual } from 'node:crypto';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import { dailyEndpointPayload, publicPlatforms, streamTargets } from './lib/stream-targets.mjs';

const DAILY_API = 'https://api.daily.co/v1';

function tokenHash(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

function tokenMatches(value, expectedHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedHex || ''))) return false;
  const actual = tokenHash(value);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('POST only', 405, req);
  if (!process.env.DAILY_API_KEY) return errorResponse('Daily is not configured', 503, req);

  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, req); }
  const roomName = String(body.roomName || '').trim();
  const token = String(body.token || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(roomName) || token.length < 32) {
    return errorResponse('Invalid restream request', 400, req);
  }

  const ref = getDb().collection('site_stream').doc('current');
  let snap;
  try { snap = await ref.get(); } catch { return errorResponse('Stream state unavailable', 503, req); }
  const current = snap.exists ? (snap.data() || {}) : {};
  if (!current.live || current.roomName !== roomName || !tokenMatches(token, current.restreamTokenHash)) {
    return errorResponse('Restream authorization expired', 403, req);
  }
  if (current.restreamActive) {
    return jsonResponse({ ok: true, alreadyStarted: true, platforms: current.restreamPlatforms || [] }, 200, req);
  }

  const targets = streamTargets(process.env);
  if (!targets.length) return errorResponse('No simulcast targets are configured', 409, req);
  const resp = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(roomName) + '/live-streaming/start', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.DAILY_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoints: dailyEndpointPayload(targets),
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrate: 4000,
      audioBitrate: 128,
      maxDuration: 43200,
      layout: { preset: 'default' },
    }),
  });
  if (!resp.ok) {
    console.warn('[stream-restream] Daily start failed:', resp.status);
    return errorResponse('The simulcast provider refused to start', 502, req);
  }

  const platforms = publicPlatforms(targets);
  await ref.set({
    restreamActive: true,
    restreamPlatforms: platforms,
    restreamStartedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return jsonResponse({ ok: true, platforms }, 200, req);
};

export const config = { path: '/api/stream-restream' };
