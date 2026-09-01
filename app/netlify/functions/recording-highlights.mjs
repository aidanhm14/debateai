// AI highlight generation for one published recording.
//
//   GET /api/recording-highlights?id=<recordingId>
//     → { status: 'done'|'none', highlights, firstWordSec }
//
// Same posture as /api/recording-thumb: a public GET whose expensive work
// happens AT MOST ONCE per recording, so nudging it is safe from anywhere
// (the recordings sync warms it for each newly published round, and an
// admin or a card render can poke it for a backfill). Bounded three ways:
//   - only PUBLISHED, non-stream recordings ever reach the model;
//   - stored results (done / none) return without any model call;
//   - failures cap at MAX_ATTEMPTS, then the doc answers 'none' forever,
//     so a broken round cannot be farmed for model calls.
// A per-IP rate limit backstops the remaining window.
//
// The model call rides lib/cheap.mjs (internal call nobody chose).
// Sonnet by default: highlight titles are front-of-store marketing copy
// and the lifetime call count is one per published recording, so this is
// quality-per-dollar, not drain. HIGHLIGHTS_MODEL re-points it with no
// deploy. All parsing/validation is pure lib/highlights.mjs, guarded in
// the pre-commit hook — including the quote gate that drops any moment
// the transcript cannot prove.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { callModel, textOf } from './lib/cheap.mjs';
import {
  buildTimeline, highlightPrompt, parseModelMoments, validateMoments,
  publicHighlights,
} from './lib/highlights.mjs';

const RECORDING_ID = /^[a-z0-9][a-z0-9-]{7,79}$/i;
const MAX_ATTEMPTS = 3;
const MODEL = process.env.HIGHLIGHTS_MODEL || 'claude-sonnet-4-6';
const FALLBACK = 'claude-sonnet-4-6';

function shape(d){
  return {
    status: d.highlightsStatus || 'none',
    highlights: publicHighlights(d.highlights),
    firstWordSec: Number(d.firstWordSec) || 0,
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'GET') return errorResponse('GET only', 405, req);

  const url = new URL(req.url);
  const id = String(url.searchParams.get('id') || '');
  if (!RECORDING_ID.test(id)) return errorResponse('id required', 400, req);

  const db = getDb();
  const ref = db.collection('recordings').doc(id);
  const snap = await ref.get();
  const rec = snap.exists ? (snap.data() || {}) : null;
  if (!rec || rec.published !== true) return errorResponse('Not found', 404, req);

  // Already answered, either way. This is the path every repeat request
  // takes, and it never reaches the limiter or the model.
  if (rec.highlightsStatus === 'done' || rec.highlightsStatus === 'none'){
    return jsonResponse(shape(rec), 200, req);
  }

  // Streams have no speech transcript to cut against.
  if (rec.isStream === true || !rec.roomName){
    await ref.set({ highlightsStatus: 'none', highlightsReason: 'no_round' }, { merge: true });
    return jsonResponse({ status: 'none', highlights: [], firstWordSec: 0 }, 200, req);
  }

  const attempts = Number(rec.highlightsAttempts) || 0;
  if (attempts >= MAX_ATTEMPTS){
    await ref.set({ highlightsStatus: 'none', highlightsReason: 'attempts_exhausted' }, { merge: true });
    return jsonResponse({ status: 'none', highlights: [], firstWordSec: Number(rec.firstWordSec) || 0 }, 200, req);
  }

  const ip = callerIp(req);
  const rl = await checkLayers('rechl', 'ip_' + ip, [
    { window: 3600 * 1000, max: 30, label: 'hour' },
    { window: 24 * 3600 * 1000, max: 60, label: 'day' },
  ]);
  if (!rl.ok) return errorResponse('Try again later', 429, req);

  const roundSnap = await db.collection('live_rounds').doc(String(rec.roomName)).get();
  const round = roundSnap.exists ? (roundSnap.data() || {}) : null;
  const timeline = round ? buildTimeline(round, rec) : null;
  if (!timeline){
    // Nothing aligned: no transcript, an unstarted round, or a reused
    // room whose speeches map outside the video. Recorded as a final
    // answer so this recording never costs another lookup.
    await ref.set({ highlightsStatus: 'none', highlightsReason: 'no_timeline' }, { merge: true });
    return jsonResponse({ status: 'none', highlights: [], firstWordSec: 0 }, 200, req);
  }

  // The attempt is claimed BEFORE the model call, so a crash mid-call
  // still burns one of the three.
  await ref.set({ highlightsAttempts: FieldValue.increment(1) }, { merge: true });

  const ballot = round.ballot || {};
  const { system, user } = highlightPrompt({
    motion: rec.motion || round.motion || '',
    title: rec.title || '',
    proName: rec.proName || round.proName || '',
    conName: rec.conName || round.conName || '',
    rfd: typeof ballot.rfd === 'string' ? ballot.rfd : '',
  }, timeline);

  let highlights = [];
  try {
    const data = await callModel({
      model: MODEL,
      fallback: FALLBACK,
      timeoutMs: 20000,
      label: 'highlights',
      body: {
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: 'user', content: user }],
      },
    });
    highlights = validateMoments(parseModelMoments(textOf(data)), timeline, rec.duration);
  } catch (e) {
    console.warn('[recording-highlights] model failed for', id, e?.message || e);
    // firstWordSec is real either way: the skip-the-setup seek should not
    // wait on a model retry.
    await ref.set({ firstWordSec: timeline.firstWordSec }, { merge: true });
    return errorResponse('Highlight generation failed, it will retry', 502, req);
  }

  const update = {
    highlights,
    firstWordSec: timeline.firstWordSec,
    highlightsStatus: highlights.length ? 'done' : 'none',
    highlightsReason: highlights.length ? '' : 'no_moment_survived',
    highlightsModel: MODEL,
    highlightsAt: FieldValue.serverTimestamp(),
  };
  await ref.set(update, { merge: true });
  console.log('[recording-highlights]', id, update.highlightsStatus, highlights.length + ' moments');
  return jsonResponse({
    status: update.highlightsStatus,
    highlights: publicHighlights(highlights),
    firstWordSec: timeline.firstWordSec,
  }, 200, req);
};

export const config = { path: '/api/recording-highlights' };
