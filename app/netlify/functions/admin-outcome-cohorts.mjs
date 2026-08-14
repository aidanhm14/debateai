// /api/admin/outcome-cohorts → retention split by whether the round
// was WON or LOST.
//
// The three numbers from the 2026-08-14 strategy notes are verdict
// stability, after-loss D30, and judge liquidity. This is number 2.
// The question in its original form: what does the median user do in
// the 10 minutes after a loss, and are they back on day 30.
//
// DERIVED, NOT INSTRUMENTED. `judgments` already records who won every
// round (lib/judgment.mjs, idempotent, one doc per round) and `events`
// is already the activity index the signup cohort grid runs on. So this
// works on the entire back catalogue and adds no write to the judging
// path. The pure half lives in lib/outcome-cohorts.mjs.
//
// TIMING. The Debatable Open runs 2026-08-29 and will produce the
// largest batch of losses this product has generated. Cohort membership
// is derived from records that already exist, so nothing is lost if
// this ships after the bracket, but the D30 clock on those losses
// starts the day they are judged either way.
//
// READ COST. One bounded judgments scan plus one small events query per
// participating uid. Rounds are the scarce thing here, so the uid set
// is small by construction; MAX_JUDGMENTS and MAX_UIDS clamp the tail.
// Cached at TTL_HEAVY (4h) via admin-cache, same as the other analytics
// panels; ?fresh=1 bypasses it.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';
import { getExcludedUids } from './lib/founder-exclude.mjs';
import {
  outcomeRows, measureRow, summarize, lossPenalty, readingGuide, DAY_MS, toMs,
} from './lib/outcome-cohorts.mjs';

const DEFAULT_DAYS = 120;
const MAX_DAYS = 400;
const MAX_JUDGMENTS = 2_000;
// A uid that appears in more rounds than this is a load test or the
// house account, not a retention data point.
const MAX_UIDS = 400;
const MAX_EVENTS_PER_UID = 120;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const days = Math.max(7, Math.min(MAX_DAYS, parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10)));

  const cacheKey = 'outcome-cohorts:v1:' + days;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const now = Date.now();
    const cutoff = now - days * DAY_MS;
    const excluded = await getExcludedUids(db);

    // ── 1. Judgments in the window ───────────────────────────────
    // judgedAt is written as epoch ms by lib/judgment.mjs, so this is a
    // single-field range and needs no composite index. The fallback
    // exists because the earliest judgments predate that guarantee.
    const jSnap = await db.collection('judgments')
      .where('judgedAt', '>=', cutoff)
      .orderBy('judgedAt', 'desc')
      .limit(MAX_JUDGMENTS)
      .get()
      .catch(async (err) => {
        console.warn('[outcome-cohorts] judgments range query failed, scanning:', err.message);
        return db.collection('judgments').limit(MAX_JUDGMENTS).get();
      });

    let rows = [];
    for (const doc of jSnap.docs) {
      const d = doc.data();
      if (toMs(d.judgedAt) < cutoff) continue;
      rows.push(...outcomeRows(d));
    }
    rows = rows.filter((r) => !excluded.has(r.uid));

    // Deterministic ids, so a judgment counted twice collapses here
    // rather than doubling a cohort.
    const byId = new Map();
    for (const r of rows) byId.set(r.id, r);
    rows = [...byId.values()];

    // ── 2. Activity per participant ──────────────────────────────
    const uids = [...new Set(rows.map((r) => r.uid))].slice(0, MAX_UIDS);
    const earliest = new Map(); // uid → earliest verdict, so we never read further back than needed
    for (const r of rows) {
      if (!earliest.has(r.uid) || r.at < earliest.get(r.uid)) earliest.set(r.uid, r.at);
    }

    const activity = new Map(); // uid → [{ at, event }]
    await Promise.all(uids.map(async (uid) => {
      const since = new Date(earliest.get(uid) || cutoff);
      const snap = await db.collection('events')
        .where('uid', '==', uid)
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .limit(MAX_EVENTS_PER_UID)
        .get()
        .catch(async (err) => {
          // Same graceful degradation admin-feedback-cohort uses: an
          // index that has not finished building should narrow the
          // panel, not 500 the dashboard.
          if (/FAILED_PRECONDITION|index/i.test(err.message || '')) {
            console.warn('[outcome-cohorts] events index missing for uid', uid);
            return db.collection('events').where('uid', '==', uid).limit(MAX_EVENTS_PER_UID).get();
          }
          throw err;
        })
        .catch((err) => {
          console.warn('[outcome-cohorts] events scan failed for uid', uid, err.message);
          return { docs: [] };
        });
      activity.set(uid, snap.docs.map((d) => {
        const e = d.data();
        return { at: toMs(e.createdAt), event: e.event || '' };
      }));
    }));

    // ── 3. Measure + slice ───────────────────────────────────────
    const measured = rows
      .filter((r) => activity.has(r.uid))
      .map((r) => measureRow(r, activity.get(r.uid), now));

    const losses = measured.filter((r) => r.outcome === 'loss');
    const wins = measured.filter((r) => r.outcome === 'win');
    const lossSummary = summarize(losses);
    const winSummary = summarize(wins);

    const payload = {
      windowDays: days,
      generatedAt: now,
      judgmentsScanned: jSnap.docs.length,
      rounds: new Set(measured.map((r) => r.source + '_' + r.eventId)).size,
      truncated: jSnap.docs.length >= MAX_JUDGMENTS || uids.length >= MAX_UIDS,
      loss: lossSummary,
      win: winSummary,
      // The headline. Loss retention on its own is unreadable without
      // the winner's number next to it: a low figure could be the loss
      // or could be the product.
      lossPenalty: lossPenalty(lossSummary, winSummary),
      // Losing to the AI still churns people even though the ladder
      // does not rate those rounds, so it gets its own split rather
      // than being folded in or dropped.
      vsHuman: {
        loss: summarize(losses.filter((r) => !r.aiOpponent)),
        win: summarize(wins.filter((r) => !r.aiOpponent)),
      },
      vsAi: {
        loss: summarize(losses.filter((r) => r.aiOpponent)),
        win: summarize(wins.filter((r) => r.aiOpponent)),
      },
      reading: readingGuide(lossSummary),
      // Stated in the payload so it travels with any screenshot: an
      // absence of events is an absence of LOGGED events. A user who
      // returns with an ad blocker eating /api/log-event reads as gone.
      caveat: 'Activity means a logged event. Blocked or failed event writes read as absence, so treat these rates as a floor.',
    };

    await setCachedShared(cacheKey, payload, TTL_HEAVY);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.error('[outcome-cohorts] failed', err);
    return errorResponse('Failed to build outcome cohorts', 500, request);
  }
};

export const config = {
  path: '/api/admin/outcome-cohorts',
};
