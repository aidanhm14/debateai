// /api/admin/round-exits?days=14  →  WHY rounds die, in the users' own words.
//
// admin-round-funnel says WHERE a round died (created → seated → spoke →
// finished). This is the missing half: two first-class events shipped
// 2026-08-22 capture the why —
//
//   round_abandoned     passive pagehide beacon fired mid-round: surface
//                       (live / practice / voice / spar), stage, speech
//                       index, elapsed seconds, whether an AI generation
//                       was in flight, whether the stuck-speech watchdog
//                       had fired, whether the opponent ever arrived.
//   round_exit_reason   a human answered the one-tap "what happened?"
//                       card, or a bail button whose reason was knowable
//                       (opponent no-show, forfeit) recorded it for them.
//                       reason 'shown' / 'skipped' rows measure the
//                       card's own answer rate.
//
// The payload aggregates both and carries the last free-text notes
// verbatim, because a reason chip says "tech_problem" and the note says
// "mic died when my opponent joined" — the second one is the one you can
// fix. Rows are capped and the covered window is reported honestly when
// the cap truncates it.
//
// Read cost: two indexed range queries (events(event ASC, createdAt ASC)
// already exists), capped at EVENT_CAP docs each, behind the shared
// admin cache at TTL_HEAVY.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const EVENT_CAP = 800;
const NOTES_CAP = 30;
const RECENT_CAP = 40;

function bump(map, key) { if (key) map[key] = (map[key] || 0) + 1; }

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const db = gate.db;

  const url = new URL(request.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || DEFAULT_DAYS));
  const cacheKey = `round-exits:v1:${days}`;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [abandonSnap, reasonSnap] = await Promise.all([
      db.collection('events')
        .where('event', '==', 'round_abandoned')
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'asc')
        .limit(EVENT_CAP)
        .get(),
      db.collection('events')
        .where('event', '==', 'round_exit_reason')
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'asc')
        .limit(EVENT_CAP)
        .get(),
    ]);

    // ── Abandonments (silent closes) ───────────────────────────────────
    const abandoned = {
      total: abandonSnap.size,
      truncated: abandonSnap.size >= EVENT_CAP,
      bySurface: {},
      byStage: {},
      aiLoadingCount: 0,   // closed the tab WHILE an AI generation was in flight
      stuckShownCount: 0,  // the stuck-speech watchdog had already fired
      oppNeverSeen: 0,     // live rounds where the opponent never arrived
    };
    for (const doc of abandonSnap.docs) {
      const m = doc.data().metadata || {};
      bump(abandoned.bySurface, m.surface || 'unknown');
      bump(abandoned.byStage, `${m.surface || '?'}:${m.stage || '?'}`);
      if (m.ai_loading === true) abandoned.aiLoadingCount += 1;
      if (m.stuck_shown === true) abandoned.stuckShownCount += 1;
      if (m.opp_seen === false) abandoned.oppNeverSeen += 1;
    }

    // ── Answered reasons ───────────────────────────────────────────────
    const reasons = {
      total: 0,           // real answers, excluding shown/skipped bookkeeping
      shown: 0,
      skipped: 0,
      byReason: {},
      bySurface: {},
      truncated: reasonSnap.size >= EVENT_CAP,
    };
    const notes = [];
    const recent = [];
    for (const doc of reasonSnap.docs) {
      const d = doc.data();
      const m = d.metadata || {};
      const reason = m.reason || 'unknown';
      if (reason === 'shown') { reasons.shown += 1; continue; }
      if (reason === 'skipped') { reasons.skipped += 1; continue; }
      reasons.total += 1;
      bump(reasons.byReason, reason);
      bump(reasons.bySurface, m.surface || 'unknown');
      const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
      if (m.note) {
        notes.push({ ts, reason, surface: m.surface || '', note: String(m.note).slice(0, 240) });
      }
      recent.push({ ts, reason, surface: m.surface || '', stage: m.stage || '', via: m.via || '', anon: d.anon === true });
    }
    notes.sort((a, b) => b.ts - a.ts);
    recent.sort((a, b) => b.ts - a.ts);

    const result = {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      abandoned,
      reasons,
      answerRate: reasons.shown ? Math.round((reasons.total / reasons.shown) * 1000) / 10 : null,
      notes: notes.slice(0, NOTES_CAP),
      recent: recent.slice(0, RECENT_CAP),
    };

    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-round-exits error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/round-exits',
};
