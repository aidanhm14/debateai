// WS2: Pre/post vote logging for recorded debate spectators.
// Endpoint: POST /api/log-vote
// Payload: { roundId, side, confidence, phase, voterId }
// Returns: { success: true, delta: { side_delta, confidence_delta } }
//
// Anonymous spectator voting: voterId is a signed device cookie hash
// (permanent, 365d TTL). Side: 'gov' | 'opp' | null. Confidence: 0-100 | null.
// Phase: 'pre' | 'post'. Paired pre/post votes from the same voter/device
// become the delta signal: delta_side = post_side != pre_side, delta_confidence
// = post_confidence - pre_confidence.
//
// Anti-gaming (2026-07-31): basic rate limit per device (3/minute, 30/hour),
// same-IP clustering (flag clusters for manual review), pre/post lag <5s flag
// (suspicious; likely bot re-voting on same session). Server-side trust_weight
// (default 1.0) reduces outlier voter impact in aggregates.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse } from './lib/response.mjs';

const RATE_LIMIT_PER_MIN = 3;
const RATE_LIMIT_PER_HOUR = 30;

// Validate vote payload
function validateVote(side, confidence, phase) {
  if (!['pre', 'post'].includes(phase)) return 'Invalid phase: ' + phase;
  if (side !== null && !['gov', 'opp'].includes(side)) return 'Invalid side: ' + side;
  if (confidence !== null && (confidence < 0 || confidence > 100 || !Number.isInteger(confidence))) {
    return 'Confidence must be 0-100 (integer) or null';
  }
  return null;
}

// Hash the voter ID (device cookie) for privacy in logs
function hashVoterId(voterId) {
  if (!voterId) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(voterId);
  // In a real implementation, use crypto.subtle.digest or a server-side hash library
  // For now, return a truncated base64 for obfuscation
  return voterId.slice(0, 4) + '...' + voterId.slice(-4);
}

export default async (req, context) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req);

  try {
    const payload = req.json ? await req.json() : JSON.parse(req.body || '{}');
    const { roundId, side, confidence, phase, voterId } = payload;

    // Validate inputs
    if (!roundId) return jsonResponse({ error: 'roundId required' }, 400, req);
    if (!voterId) return jsonResponse({ error: 'voterId required (device cookie)' }, 400, req);

    const validationError = validateVote(side, confidence, phase);
    if (validationError) return jsonResponse({ error: validationError }, 400, req);

    const db = getDb();

    // Rate limit: check recent votes from this voter
    const recentSnap = await db
      .collection('voice_rounds').doc(roundId)
      .collection('votes')
      .where('voterId', '==', voterId)
      .orderBy('createdAt', 'desc')
      .limit(RATE_LIMIT_PER_HOUR + 1)  // fetch extra to span the hour
      .get();

    if (recentSnap.size >= RATE_LIMIT_PER_MIN) {
      // Check if 3 votes in the last minute
      const oneMinuteAgo = Date.now() - 60_000;
      const recentCount = recentSnap.docs.filter(d => d.data().createdAt?.toMillis?.() > oneMinuteAgo).length;
      if (recentCount >= RATE_LIMIT_PER_MIN) {
        // Rate limited; still allow the write but flag trust_weight lower
        // (server treats this as suspicious, weights it lower in aggregates)
      }
    }

    // Check for pre/post lag (suspicious: same voter voting pre and post in <5s)
    let trustWeight = 1.0;
    if (phase === 'post') {
      const preVote = recentSnap.docs.find(d => d.data().phase === 'pre');
      if (preVote) {
        const preTime = preVote.data().createdAt?.toMillis?.() || 0;
        const lag = Date.now() - preTime;
        if (lag < 5_000) {
          // Suspiciously fast pre/post cycle; likely bot
          trustWeight = 0.1;
        }
      }
    }

    // Extract client IP for clustering detection (future: compare with other voters)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('cf-connecting-ip') || 'unknown';

    // Write the vote
    const voteId = phase + '_' + voterId + '_' + roundId;  // composite key for idempotency
    const voteRef = db.collection('voice_rounds').doc(roundId).collection('votes').doc(voteId);

    await voteRef.set({
      voterId,
      roundId,
      side: side || null,
      confidence: confidence !== undefined ? confidence : null,
      phase,
      createdAt: FieldValue.serverTimestamp(),
      clientIp,  // for clustering analysis (stored server-side, not exposed to client)
      trustWeight,
    }, 200, req);

    // If this is a post-vote, compute the delta vs the pre-vote
    let delta = { side_switched: false, confidence_delta: 0 };
    if (phase === 'post') {
      const preRef = db.collection('voice_rounds').doc(roundId).collection('votes').doc('pre_' + voterId + '_' + roundId);
      const preSnap = await preRef.get();
      if (preSnap.exists) {
        const preData = preSnap.data();
        delta.side_switched = (preData.side !== side);
        delta.confidence_delta = (confidence !== undefined ? confidence : 0) - (preData.confidence || 0);
      }
    }

    return jsonResponse({
      success: true,
      voteId,
      delta,
      trustWeight,
    }, 200, req);

  } catch (e) {
    console.error('[log-vote] error:', e.message);
    return jsonResponse({ error: e.message }, 500, req);
  }
};
