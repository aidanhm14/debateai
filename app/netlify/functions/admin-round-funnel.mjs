// /api/admin/round-funnel?days=30  →  Did anyone actually turn up, and did
// the round finish?
//
// The 2026-08-11 audit found that 390 of 411 live rounds ever created never
// completed a single speech, because a round document was written at MATCH
// time and looked complete while one chair had been empty the whole time.
// The ready-check shipped the same day to stop rooms opening onto nobody.
// Nothing measured whether it worked, which is what this is for.
//
// Read straight off `live_rounds` rather than the `events` stream, because
// the question is about round DOCUMENTS and their seats, and the event
// stream has no notion of a chair being empty. Five stages:
//
//   created     the round doc exists at all (a match was made)
//   oneSeated   at least one debater's client wrote a presence beat
//   bothSeated  every named seat wrote one — both people really arrived
//   spoke       at least one speech landed in `speeches`
//   finished    a ballot exists / status == 'ballot'
//
// `seatSeen` is the load-bearing field: a per-uid map stamped by the seat
// heartbeat in live-round.html, so it is evidence of ARRIVAL, unlike
// proUid / conUid which are written at intent time and mean nothing about
// whether a human was there. That distinction is the whole point of the
// audit this endpoint exists to close the loop on.
//
// Everything is reported as a BEFORE / AFTER split around the ready-check
// ship date, because a single blended rate cannot answer "did the fix
// work" — the historical failures would drown the signal for months.
//
// Rounds with no named seats (legacy direct-link rounds that never wrote
// proUid/conUid) cannot have their arrival measured, so they are counted
// and reported separately rather than silently scored as failures.
//
// Cost: one collection scan bounded by MAX_DOCS, behind the shared 5-min
// admin cache, and the panel is lazy-loaded with its workspace.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const DEFAULT_DAYS = 30;
const MAX_DAYS = 400;
const MAX_DOCS = 1200;

// The ready-check ("a round room does not open until both debaters prove
// they are there") shipped 2026-08-11. Rounds created before this are the
// control cohort. Overridable without a redeploy in case the real cutover
// lands on a different day than the commit.
const READY_CHECK_MS = Number(process.env.READY_CHECK_AT_MS || Date.parse('2026-08-11T00:00:00Z'));

function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v._seconds) return v._seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

// Seats we expect to have arrived. 2v2 rounds carry partner uids on the
// same two benches; a partner who never showed still leaves the bench
// staffed, so a bench counts as seated when ANY of its uids beat once.
function benchesOf(d) {
  const benches = [];
  const pro = [d.proUid, d.proUid2].filter(Boolean);
  const con = [d.conUid, d.conUid2].filter(Boolean);
  if (pro.length) benches.push(pro);
  if (con.length) benches.push(con);
  return benches;
}

function classify(d) {
  const seen = d.seatSeen && typeof d.seatSeen === 'object' ? d.seatSeen : {};
  const benches = benchesOf(d);
  const seatedBenches = benches.filter((uids) => uids.some((u) => toMs(seen[u]) > 0)).length;
  const speeches = Array.isArray(d.speeches) ? d.speeches.length : 0;
  const finished = !!d.ballot || d.status === 'ballot' || !!d.completedAt;
  return {
    measurable: benches.length >= 2,
    seatedBenches,
    speeches,
    finished,
  };
}

function emptyBucket() {
  return {
    created: 0,
    oneSeated: 0,
    bothSeated: 0,
    spoke: 0,
    finished: 0,
    unmeasurable: 0,
    speechesTotal: 0,
  };
}

function rate(num, den) {
  return den > 0 ? +((num / den) * 100).toFixed(1) : null;
}

function summarize(b) {
  return {
    ...b,
    // Share of MEASURABLE rounds, so legacy seatless rounds cannot drag
    // a rate down for a reason that has nothing to do with turning up.
    measurable: b.created - b.unmeasurable,
    bothSeatedPct: rate(b.bothSeated, b.created - b.unmeasurable),
    spokePct: rate(b.spoke, b.created - b.unmeasurable),
    finishedPct: rate(b.finished, b.created - b.unmeasurable),
    // The number the audit singled out: once a round genuinely starts,
    // it finishes about 43% of the time. That was never the problem, and
    // keeping it visible stops a future reader re-diagnosing the round
    // itself when the failure is upstream at arrival.
    finishedOfSpokePct: rate(b.finished, b.spoke),
    avgSpeechesWhenSpoke: b.spoke > 0 ? +(b.speechesTotal / b.spoke).toFixed(1) : null,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-round-funnel auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-round-funnel profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') || '', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(MAX_DAYS, daysRaw)) : DEFAULT_DAYS;

  const cacheKey = 'roundfunnel:' + days;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    // `roundStartedAt` is a plain millisecond number written at round init,
    // so the automatic single-field index covers this and there is no
    // composite index to deploy. Rounds predating that field sort out of
    // the range query rather than being miscounted.
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const snap = await db.collection('live_rounds')
      .where('roundStartedAt', '>=', sinceMs)
      .orderBy('roundStartedAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    const before = emptyBucket();
    const after = emptyBucket();
    const recent = [];

    snap.docs.forEach((doc) => {
      const d = doc.data() || {};
      const startedMs = toMs(d.roundStartedAt);
      const c = classify(d);
      const b = startedMs >= READY_CHECK_MS ? after : before;

      b.created += 1;
      if (!c.measurable) b.unmeasurable += 1;
      if (c.seatedBenches >= 1) b.oneSeated += 1;
      if (c.measurable && c.seatedBenches >= 2) b.bothSeated += 1;
      if (c.speeches > 0) { b.spoke += 1; b.speechesTotal += c.speeches; }
      if (c.finished) b.finished += 1;

      if (recent.length < 25) {
        recent.push({
          room: doc.id,
          startedISO: startedMs ? new Date(startedMs).toISOString() : null,
          format: d.format || d.formatKey || '',
          seatedBenches: c.seatedBenches,
          benches: c.measurable ? 2 : benchesOf(d).length,
          speeches: c.speeches,
          finished: c.finished,
        });
      }
    });

    const result = {
      windowDays: days,
      sinceISO: new Date(sinceMs).toISOString(),
      readyCheckISO: new Date(READY_CHECK_MS).toISOString(),
      sampled: snap.size >= MAX_DOCS,
      total: snap.size,
      before: summarize(before),
      after: summarize(after),
      recent,
      timestamp: new Date().toISOString(),
    };

    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-round-funnel error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/round-funnel',
};
