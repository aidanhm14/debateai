// Optional self-reported segmentation for the opinion panel.
// POST /api/stance-segments   { experience?, circuit?, region?, ageBand? }
// GET  /api/stance-segments   -> what this panelist has already given
//
// WHY THIS EXISTS
// A pile of opinions with no attributes attached is worth a fraction of the
// same opinions cross-tabbed. "62% disagree" is a fact; "62% disagree, and
// it is 71% among university-circuit debaters with five years in and 48%
// among first-years" is a finding. Segments are what turn the panel from a
// tally into an instrument.
//
// WHY IT IS DELIBERATELY COARSE
// Bands, never values. No date of birth, no city, no school. This platform
// has school-age users on it, and fine-grained demographics on minors is a
// liability that buys nothing a band does not: no cross-tab needs to know
// someone is 16 rather than in the under-18 band. The under-18 band is also
// load-bearing rather than descriptive, since log-stance reads it and
// refuses to mark those rows licensable whatever the profile toggle says.
//
// Every field is independently optional. A panelist can give region and
// nothing else, and clearing is a first-class action rather than something
// they have to email about.

import { createHash } from 'node:crypto';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { anonAuthorId } from './lib/pii-scrub.mjs';
import { SEGMENTS, isValidSegment } from './lib/stance-bank.mjs';
import { CONSENT_POLICY_VERSION } from './lib/consent.mjs';

function devicePanelistId(deviceId) {
  const salt = process.env.CORPUS_HASH_SALT || 'debatable-corpus-v1';
  return 'd_' + createHash('sha256').update(salt + ':dev:' + deviceId).digest('hex').slice(0, 16);
}

async function identify(request, deviceId) {
  const token = extractBearerToken(request);
  let uid = '';
  let signedIn = false;
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.sub;
      signedIn = decoded.firebase?.sign_in_provider !== 'anonymous';
    } catch {
      return { error: 'auth' };
    }
  }
  if (uid && signedIn) return { panelistId: anonAuthorId(uid), uid, signedIn };
  if (typeof deviceId === 'string' && /^[a-f0-9]{16,64}$/i.test(deviceId)) {
    return { panelistId: devicePanelistId(deviceId), uid: '', signedIn: false };
  }
  return { error: 'identity' };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const db = getDb();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const who = await identify(request, url.searchParams.get('deviceId') || '');
    if (who.error) {
      // A read with no identity is not an error worth surfacing; the widget
      // just gets an empty set and asks.
      return jsonResponse({ segments: {}, options: SEGMENTS }, 200, request);
    }
    const snap = await db.collection('stance_panelists').doc(who.panelistId).get();
    return jsonResponse({
      segments: (snap.exists && snap.data().segments) || {},
      options: SEGMENTS,
    }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const who = await identify(request, (body && body.deviceId) || '');
  if (who.error === 'auth') return errorResponse('Auth failed', 401, request);
  if (who.error) return errorResponse('deviceId required when signed out', 400, request);

  const rl = await checkLayers('stance-seg', who.panelistId, [
    { label: 'hour', window: 3_600_000, max: 20 },
  ]);
  if (!rl.ok) return errorResponse('Slow down a moment.', 429, request);

  try {
    const clear = body.clear === true;
    const segments = {};
    if (!clear) {
      for (const key of Object.keys(SEGMENTS)) {
        const v = body[key];
        if (v === undefined || v === null || v === '') continue;
        if (!isValidSegment(key, v)) {
          return errorResponse('Invalid value for ' + key, 400, request);
        }
        segments[key] = v;
      }
      if (!Object.keys(segments).length) {
        return errorResponse('Nothing to save', 400, request);
      }
    }

    await db.collection('stance_panelists').doc(who.panelistId).set({
      uid: who.uid || null,
      segments: clear ? FieldValue.delete() : segments,
      segmentsAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Ledger entry, same append-only collection every other consent action
    // writes to. Segments are volunteered personal attributes that end up in
    // a licensed export, so "when did they give this, on what surface, under
    // which policy text" has to be answerable later.
    await db.collection('consent_events').add({
      uid: who.uid || null,
      panelistId: who.panelistId,
      event: clear ? 'segments_cleared' : 'segments_given',
      surface: 'panel',
      policyVersion: CONSENT_POLICY_VERSION,
      fields: clear ? [] : Object.keys(segments),
      createdAt: FieldValue.serverTimestamp(),
    }).catch(err => {
      // A ledger failure must not silently lose the user's action, but it
      // also must not fail their save. Log loudly and continue.
      console.error('[stance-segments] ledger write failed:', err.message);
    });

    return jsonResponse({ ok: true, segments: clear ? {} : segments }, 200, request);
  } catch (err) {
    console.error('[stance-segments]', err.message);
    return errorResponse('Failed to save', 500, request);
  }
};

export const config = { path: '/api/stance-segments' };
