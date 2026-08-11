// Opinion-panel read path.  GET /api/stance-panel
//
// Two jobs:
//   1. Decide which proposition to put in front of this panelist next.
//   2. Hand back the room's split on a proposition they have answered, so
//      the widget can show it. That reciprocity is not decoration: an
//      unanswered survey question is a chore, and a question that pays out
//      "62% of debaters disagree with you" is a reason to answer the next
//      one. Response rate is the whole ballgame for panel data.
//
// SELECTION ORDER, and why it is this order
//   a. Due re-asks first. A second answer to a stem the panelist met months
//      ago is worth far more than a first answer to a fresh one, because it
//      is the only thing that produces a drift measurement.
//   b. Then unanswered propositions, rotated by topic so a panelist does not
//      get eight climate stems in a row and conclude the panel has an axe
//      to grind.
//   c. Then nothing. A panelist who has answered everything and has no
//      re-asks due gets `exhausted`, and the widget stays hidden rather
//      than recycling a stem early and polluting the series.
//
// The whole decision runs off ONE document read (the panelist doc carries
// an `answered` map), plus one read for the aggregate when asked. That
// bound matters: this widget can appear on high-traffic pages, and the
// 2026-05-18 credit-burn audit is the standing reminder that a cheap-looking
// read on a busy surface is not cheap.

import { createHash } from 'node:crypto';
import { getDb } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { anonAuthorId } from './lib/pii-scrub.mjs';
import {
  PROPOSITIONS,
  getProposition,
  isValidProposition,
  summariseAggregate,
  REASK_AFTER_DAYS,
  STANCE_SCALE,
} from './lib/stance-bank.mjs';

const REASK_MS = REASK_AFTER_DAYS * 24 * 60 * 60 * 1000;

// How many propositions the public board shows, and the floor below which
// a split is not shown at all. Twelve fills a page without turning one
// request into a scan of the whole bank.
const BOARD_LIMIT = 12;
const MIN_PUBLIC_N = 12;

function devicePanelistId(deviceId) {
  const salt = process.env.CORPUS_HASH_SALT || 'debatable-corpus-v1';
  return 'd_' + createHash('sha256').update(salt + ':dev:' + deviceId).digest('hex').slice(0, 16);
}

// Deterministic per-panelist ordering. A fixed PROPOSITIONS order would
// hand every panelist the same first stem, which makes the first-wave
// aggregate on that one proposition huge and every other one thin. Hashing
// the panelist into the sort spreads first answers across the bank while
// keeping any given panelist's sequence stable across page loads.
function panelistOrder(panelistId, items) {
  return items
    .map(p => ({
      p,
      k: createHash('sha256').update(panelistId + ':' + p.id).digest('hex').slice(0, 8),
    }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map(x => x.p);
}

function publicProposition(p) {
  return { id: p.id, text: p.text, topic: p.topic, tags: p.tags };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('GET only', 405, request);

  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId') || '';
  const wantResults = url.searchParams.get('results') || '';
  const topicFilter = url.searchParams.get('topic') || '';

  // Identity is optional here. A caller with neither a token nor a device id
  // still gets a proposition to render (the widget can show a question to a
  // brand-new visitor before it has minted an id); it just gets no
  // personalised rotation.
  const token = extractBearerToken(request);
  let uid = '';
  let signedIn = false;
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.sub;
      signedIn = decoded.firebase?.sign_in_provider !== 'anonymous';
    } catch {
      // A bad token on a read path is not worth a 401. Fall through as anon.
    }
  }

  let panelistId = '';
  if (uid && signedIn) panelistId = anonAuthorId(uid);
  else if (/^[a-f0-9]{16,64}$/i.test(deviceId)) panelistId = devicePanelistId(deviceId);

  try {
    const db = getDb();

    // Board mode: the busiest propositions with their splits, for the
    // public results page.
    //
    // CDN-cached rather than read per visitor. This is a public page and
    // the payload is identical for everyone, so an uncached version would
    // do BOARD_LIMIT Firestore reads per pageview forever. The 2026-05-18
    // credit-burn audit is the standing reminder that a read which looks
    // small on a busy surface is not small.
    if (url.searchParams.get('board')) {
      const snap = await db.collection('stance_aggregates')
        .orderBy('n', 'desc')
        .limit(BOARD_LIMIT)
        .get();
      const board = snap.docs
        .map(d => {
          const p = getProposition(d.id);
          if (!p) return null; // a retired proposition keeps its counters but leaves the board
          return {
            proposition: publicProposition(p),
            aggregate: summariseAggregate(d.data()),
          };
        })
        .filter(Boolean)
        // A split built on a handful of answers is noise, and publishing
        // noise as a finding is how the whole panel stops being credible.
        .filter(x => x.aggregate.n >= MIN_PUBLIC_N);

      return new Response(JSON.stringify({ board, minN: MIN_PUBLIC_N }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=300',
        },
      });
    }

    // Results-only mode: the widget asking for the split on a proposition
    // the visitor just answered, or on one it wants to preview.
    if (wantResults) {
      if (!isValidProposition(wantResults)) {
        return errorResponse('Unknown proposition', 400, request);
      }
      const snap = await db.collection('stance_aggregates').doc(wantResults).get();
      return jsonResponse({
        proposition: publicProposition(getProposition(wantResults)),
        aggregate: summariseAggregate(snap.exists ? snap.data() : {}),
        scale: STANCE_SCALE,
      }, 200, request);
    }

    let answered = {};
    if (panelistId) {
      const snap = await db.collection('stance_panelists').doc(panelistId).get();
      if (snap.exists) answered = snap.data().answered || {};
    }

    const pool = topicFilter
      ? PROPOSITIONS.filter(p => p.topic === topicFilter)
      : PROPOSITIONS;
    if (!pool.length) return errorResponse('Unknown topic', 400, request);

    const ordered = panelistOrder(panelistId || 'anon', pool);
    const now = Date.now();

    const due = ordered.find(p => {
      const a = answered[p.id];
      return a && a.at && (now - a.at) > REASK_MS;
    });
    const fresh = ordered.find(p => !answered[p.id]);

    const next = due || fresh || null;
    if (!next) {
      return jsonResponse({
        exhausted: true,
        answeredCount: Object.keys(answered).length,
        total: PROPOSITIONS.length,
      }, 200, request);
    }

    const isReask = !!due;
    return jsonResponse({
      proposition: publicProposition(next),
      // The widget frames a re-ask differently ("You answered this in
      // March. Where are you now?"), which is both more honest and a
      // better prompt than pretending it is a new question. It never
      // receives the prior POSITION, deliberately: showing someone their
      // old answer anchors the new one and destroys the drift measurement.
      reask: isReask,
      priorAskedAt: isReask ? (answered[next.id].at || null) : null,
      wave: isReask ? (answered[next.id].wave || 1) + 1 : 1,
      answeredCount: Object.keys(answered).length,
      total: PROPOSITIONS.length,
      scale: STANCE_SCALE,
      identified: !!panelistId,
    }, 200, request);
  } catch (err) {
    console.error('[stance-panel]', err.message);
    return errorResponse('Failed to load panel', 500, request);
  }
};

export const config = { path: '/api/stance-panel' };
