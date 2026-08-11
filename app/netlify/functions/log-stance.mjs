// Opinion-panel write path.  POST /api/log-stance
//
// WHAT THIS COLLECTS AND WHY IT IS A DIFFERENT ASSET FROM `generations`
// The generations corpus is argument text: what people said. This is belief
// state: what people actually think, on a fixed instrument, measured more
// than once. Two things make it worth more than an ordinary poll panel:
//
//   1. Re-asks. The same panelist meets the same proposition months apart,
//      so every second answer is a drift measurement rather than a snapshot.
//   2. Attribution. When the trigger is `post_round`, the response carries
//      the round that preceded it and, optionally, the argument the
//      respondent says moved them. Belief change with a stated cause is the
//      thing static pollsters structurally cannot produce.
//
// IDENTITY
// Panelists are pseudonymous. Signed-in users key off anonAuthorId(uid) —
// a salted, non-reversible hash — so a longitudinal series can be assembled
// without the export ever carrying a real account id. The raw uid is stored
// on the panelist doc only, never on the response rows, so a deletion
// request can still find and purge the series. Signed-out respondents key
// off a device id; their answers count toward public aggregates and are
// never marked contributable, matching privacy.html §7.
//
// CONSENT
// Storing an answer and licensing an answer are separate questions. Every
// respondent's answer is stored (it drives the aggregate they get shown
// back, which is the whole reason they answered). Only rows from signed-in
// accounts carrying BOTH contributeToCorpus and corpusAgeAttested are
// stamped contributable, using the same fail-closed re-check log-generation
// runs. Under-18 bands never qualify regardless of the toggle.

import { createHash } from 'node:crypto';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { anonAuthorId } from './lib/pii-scrub.mjs';
import {
  getProposition,
  isValidProposition,
  summariseAggregate,
  bucketKey,
  STANCE_TRIGGERS,
  STANCE_SCALE,
  MAX_WAVES,
} from './lib/stance-bank.mjs';

const MAX_REASON_CHARS = 600;
const MAX_ATTRIBUTION_CHARS = 600;

// Same 5-minute fail-closed consent cache as log-generation. Duplicated
// rather than shared because the two endpoints scale independently and a
// shared module-level cache would couple their invalidation.
const consentCache = new Map();
const CONSENT_CACHE_MS = 5 * 60 * 1000;

async function verifyCorpusConsent(db, uid) {
  const now = Date.now();
  const hit = consentCache.get(uid);
  if (hit && now - hit.at < CONSENT_CACHE_MS) return hit.ok;
  let ok = false;
  try {
    const snap = await db.collection('user_profiles').doc(uid).get();
    const d = snap.exists ? snap.data() : null;
    ok = !!(d && d.contributeToCorpus === true && d.corpusAgeAttested === true);
  } catch (err) {
    console.warn('[log-stance] consent check failed, treating as no:', err.message);
    ok = false;
  }
  if (consentCache.size > 5000) consentCache.clear();
  consentCache.set(uid, { ok, at: now });
  return ok;
}

function devicePanelistId(deviceId) {
  const salt = process.env.CORPUS_HASH_SALT || 'debatable-corpus-v1';
  return 'd_' + createHash('sha256').update(salt + ':dev:' + deviceId).digest('hex').slice(0, 16);
}

function clampText(s, n) {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return t.length > n ? t.slice(0, n) : t;
}

function validPosition(v) {
  return Number.isInteger(v) && v >= STANCE_SCALE.min && v <= STANCE_SCALE.max;
}

function validConfidence(v) {
  return v === null || (Number.isInteger(v) && v >= 0 && v <= 100);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const {
    propositionId,
    position,
    confidence = null,
    reason = '',
    trigger = 'panel',
    surface = '',
    roundId = '',
    attribution = '',
    deviceId = '',
  } = body || {};

  // ── validate ────────────────────────────────────────────────────
  if (!isValidProposition(propositionId)) {
    return errorResponse('Unknown proposition', 400, request);
  }
  if (!validPosition(position)) {
    return errorResponse('position must be an integer from -3 to 3', 400, request);
  }
  if (!validConfidence(confidence)) {
    return errorResponse('confidence must be an integer 0-100 or null', 400, request);
  }
  if (!STANCE_TRIGGERS.has(trigger)) {
    return errorResponse('Unknown trigger', 400, request);
  }

  // ── identity ────────────────────────────────────────────────────
  const token = extractBearerToken(request);
  let uid = '';
  let signedIn = false;
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.sub;
      signedIn = decoded.firebase?.sign_in_provider !== 'anonymous';
    } catch {
      return errorResponse('Auth failed', 401, request);
    }
  }

  let panelistId;
  if (uid && signedIn) {
    panelistId = anonAuthorId(uid);
  } else if (typeof deviceId === 'string' && /^[a-f0-9]{16,64}$/i.test(deviceId)) {
    panelistId = devicePanelistId(deviceId);
  } else {
    // No stable identity means no longitudinal series and no way to stop
    // one caller stuffing an aggregate. Refuse rather than write junk.
    return errorResponse('deviceId required when signed out', 400, request);
  }

  // ── rate limit ──────────────────────────────────────────────────
  // Keyed on the panelist first (the thing we actually want to bound) with
  // an IP layer behind it so rotating device ids cannot stuff an aggregate.
  const ip = callerIp(request);
  const rl = await checkLayers('stance', panelistId, [
    { label: 'min', window: 60_000, max: 12 },
    { label: 'hour', window: 3_600_000, max: 80 },
  ]);
  if (!rl.ok) return errorResponse('Slow down a moment.', 429, request);
  const ipRl = await checkLayers('stance-ip', ip, [
    { label: 'hour', window: 3_600_000, max: 300 },
  ]);
  if (!ipRl.ok) return errorResponse('Slow down a moment.', 429, request);

  try {
    const db = getDb();
    const prop = getProposition(propositionId);

    const panelistRef = db.collection('stance_panelists').doc(panelistId);
    const snap = await panelistRef.get();
    const panelist = snap.exists ? snap.data() : null;
    const answered = (panelist && panelist.answered) || {};
    const prior = answered[propositionId] || null;

    // Wave 1 is the first time this panelist met this stem; every later
    // answer increments. `priorPosition` on the row is what turns a series
    // of answers into a drift measurement without a join at read time.
    const wave = prior ? Math.min((prior.wave || 1) + 1, MAX_WAVES + 1) : 1;
    const priorPosition = prior ? prior.position : null;
    const priorConfidence = prior ? (prior.confidence ?? null) : null;
    const shift = priorPosition === null ? null : position - priorPosition;

    // An under-18 self-report disqualifies the row from licensing even if
    // the profile toggle says otherwise. The band is voluntary, so its
    // absence is not disqualifying on its own; the profile attestation is
    // still the binding gate.
    const declaredMinor = panelist && panelist.segments && panelist.segments.ageBand === 'under-18';
    const contributable = !!uid && signedIn && !declaredMinor
      && await verifyCorpusConsent(db, uid);

    const row = {
      panelistId,
      propositionId,
      topic: prop.topic,
      position,
      confidence: confidence ?? null,
      reason: clampText(reason, MAX_REASON_CHARS),
      trigger,
      surface: clampText(surface, 80),
      wave,
      priorPosition,
      priorConfidence,
      shift,
      // Attribution only means anything when a round preceded the answer.
      roundId: trigger === 'post_round' ? clampText(roundId, 120) : '',
      attribution: trigger === 'post_round' ? clampText(attribution, MAX_ATTRIBUTION_CHARS) : '',
      signedIn,
      contributable,
      createdAt: FieldValue.serverTimestamp(),
    };

    const responseRef = await db.collection('stance_responses').add(row);

    // Panelist state. `answered` is a map rather than a subcollection so the
    // serve path can decide what to ask next in a single document read.
    const historyEntry = { position, confidence: confidence ?? null, wave };
    const priorHistory = Array.isArray(prior?.history) ? prior.history : [];
    await panelistRef.set({
      // Kept so a deletion request can find the series. Never exported.
      uid: uid || null,
      lastSeenAt: FieldValue.serverTimestamp(),
      responseCount: FieldValue.increment(1),
      ...(snap.exists ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
      answered: {
        ...answered,
        [propositionId]: {
          position,
          confidence: confidence ?? null,
          wave,
          at: Date.now(),
          history: [...priorHistory, historyEntry].slice(-MAX_WAVES),
        },
      },
    }, { merge: true });

    // Aggregates. Denormalised counters so the widget can show the room's
    // split back to the respondent without a collection scan. The bucket
    // key is the raw Likert point; mean and agree-share are derived at read.
    const aggRef = db.collection('stance_aggregates').doc(propositionId);
    const aggUpdate = {
      propositionId,
      topic: prop.topic,
      n: FieldValue.increment(1),
      sum: FieldValue.increment(position),
      [`buckets.${bucketKey(position)}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (confidence !== null) {
      aggUpdate.confidenceSum = FieldValue.increment(confidence);
      aggUpdate.confidenceN = FieldValue.increment(1);
    }
    // Only first answers feed the headline split. Without this a panelist
    // who re-answers three times counts three times and the aggregate
    // drifts toward whoever returns most, not whoever believes what.
    if (wave === 1) {
      aggUpdate.uniqueN = FieldValue.increment(1);
      aggUpdate.uniqueSum = FieldValue.increment(position);
    }
    if (shift !== null) {
      aggUpdate.shiftN = FieldValue.increment(1);
      aggUpdate.shiftSum = FieldValue.increment(shift);
      if (shift !== 0) aggUpdate.changedMindN = FieldValue.increment(1);
    }
    await aggRef.set(aggUpdate, { merge: true });

    const agg = await aggRef.get();
    const a = agg.exists ? agg.data() : {};

    return jsonResponse({
      ok: true,
      id: responseRef.id,
      wave,
      shift,
      contributable,
      aggregate: summariseAggregate(a),
    }, 200, request);
  } catch (err) {
    console.error('[log-stance]', err.message);
    return errorResponse('Failed to record response', 500, request);
  }
};

export const config = { path: '/api/log-stance' };
