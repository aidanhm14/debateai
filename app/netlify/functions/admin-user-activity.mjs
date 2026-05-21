import { requireAdmin, parseUA, normalizePath } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Per-user activity timeline endpoint. Reads the events/ collection
// (populated by /js/track.js — page_view, session_*, app_event, plus
// the per-feature events like generate / battle_started / conversion)
// scoped to a single uid and returns:
//   - chronological feed for the /admin per-user panel
//   - sessions[] grouped by metadata.session_id with each session's
//     path-by-path journey, duration, action density, device/browser
//   - aggregate engagement counts
//
// Same admin gate as the rest of /api/admin/*.

const MAX_EVENTS = 800;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  // Target uid — either passed via ?uid= or ?email= (we look up the
  // email in user_profiles and translate). Email lookup is convenient
  // for support-case debugging where you have the user's email but
  // not their Firebase UID.
  const url = new URL(request.url);
  let targetUid = url.searchParams.get('uid');
  const targetEmail = url.searchParams.get('email');

  if (!targetUid && targetEmail) {
    try {
      const lookupSnap = await db.collection('user_profiles')
        .where('email', '==', targetEmail.toLowerCase().trim())
        .limit(1)
        .get();
      if (!lookupSnap.empty) {
        targetUid = lookupSnap.docs[0].id;
      } else {
        return errorResponse('No user found with that email', 404, request);
      }
    } catch (err) {
      console.warn('admin-user-activity email lookup failed:', err.message);
      return errorResponse('Email lookup failed', 500, request);
    }
  }

  if (!targetUid) return errorResponse('Missing uid or email query param', 400, request);

  try {
    // Pull the user's profile (signup date, plan, name, email).
    const [profileSnap, teamMembersSnap] = await Promise.all([
      db.collection('user_profiles').doc(targetUid).get(),
      db.collection('team_members').where('uid', '==', targetUid).limit(5).get().catch(() => ({ docs: [] })),
    ]);

    const profile = profileSnap.exists ? profileSnap.data() : null;
    const teamMemberships = teamMembersSnap.docs.map(d => ({
      teamId: d.data().teamId || null,
      role: d.data().role || 'member',
    }));

    // Pull team plan info if the user belongs to one. Just first team
    // for now — most users have exactly one.
    let teamInfo = null;
    if (teamMemberships.length > 0 && teamMemberships[0].teamId) {
      try {
        const teamSnap = await db.collection('teams').doc(teamMemberships[0].teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data();
          teamInfo = {
            teamId: teamMemberships[0].teamId,
            role: teamMemberships[0].role,
            name: t.name || '',
            plan: t.plan || 'trial',
            status: t.status || 'active',
            usageThisPeriod: t.usageThisPeriod || 0,
            usageLimit: t.usageLimit || 0,
          };
        }
      } catch (err) {
        console.warn('admin-user-activity team fetch failed:', err.message);
      }
    }

    // Events — most recent first, capped at MAX_EVENTS.
    const eventsSnap = await db.collection('events')
      .where('uid', '==', targetUid)
      .orderBy('createdAt', 'desc')
      .limit(MAX_EVENTS)
      .get()
      .catch(async err => {
        // Fallback if (uid, createdAt) composite index isn't built yet.
        // Pull where-only and sort client-side.
        if (/FAILED_PRECONDITION|index/i.test(err.message || '')) {
          console.warn('admin-user-activity composite index missing; falling back to where-only query');
          const fallback = await db.collection('events')
            .where('uid', '==', targetUid)
            .limit(MAX_EVENTS)
            .get();
          return fallback;
        }
        throw err;
      });

    const events = eventsSnap.docs.map(d => {
      const data = d.data();
      const ts = data.createdAt && data.createdAt.toMillis
        ? data.createdAt.toMillis()
        : (data.createdAt && data.createdAt.seconds ? data.createdAt.seconds * 1000 : 0);
      return {
        id: d.id,
        event: data.event || '',
        metadata: data.metadata || {},
        ts,
      };
    });
    events.sort((a, b) => b.ts - a.ts);

    // Aggregate counts so the dashboard can render summary stats
    // without re-iterating the timeline.
    const eventCounts = {};
    let firstSeen = null, lastSeen = null;
    let pageViews = 0, sessions = 0, generations = 0, conversions = 0;
    let rounds = 0, completes = 0;
    for (const e of events) {
      const evName = e.event === 'app_event' && e.metadata && e.metadata.name ? e.metadata.name : e.event;
      eventCounts[evName] = (eventCounts[evName] || 0) + 1;
      if (!lastSeen || e.ts > lastSeen) lastSeen = e.ts;
      if (!firstSeen || e.ts < firstSeen) firstSeen = e.ts;
      if (e.event === 'page_view') pageViews++;
      if (e.event === 'session_start') sessions++;
      if (e.event === 'case_generated') generations++;
      if (e.event === 'conversion') conversions++;
      if (e.event === 'battle_started' || evName === 'round_start') rounds++;
      if (evName === 'round_complete') completes++;
    }

    // ── Build session-grouped journey view ────────────────────────
    // Events fired by /js/track.js carry metadata.session_id (per-tab,
    // survives SPA nav). Group by that. Within each session preserve
    // chronological order and collapse consecutive duplicate paths so
    // the "journey" reads as a path-by-path flow rather than a noisy
    // event firehose.
    const sessionMap = new Map();
    // Reverse so events are oldest→newest inside each session.
    const chrono = [...events].sort((a, b) => a.ts - b.ts);
    for (const e of chrono) {
      const meta = e.metadata || {};
      const sid = meta.session_id || ('no-sid-' + e.id);
      let row = sessionMap.get(sid);
      if (!row) {
        row = {
          sessionId: sid,
          startTs: e.ts,
          endTs: e.ts,
          events: 0,
          pageViews: 0,
          actions: 0,
          journey: [],
          path: [],
          actionMix: {},
          device: null,
          browser: null,
          os: null,
          surface: null,
          referrer: '',
          entryPath: '',
          exitPath: '',
        };
        sessionMap.set(sid, row);
      }
      row.events++;
      if (e.ts < row.startTs) row.startTs = e.ts;
      if (e.ts > row.endTs) row.endTs = e.ts;

      if (e.event === 'session_start' && meta.user_agent) {
        const ua = parseUA(meta.user_agent);
        row.device = ua.device;
        row.browser = ua.browser;
        row.os = ua.os;
        row.surface = ua.surface;
      }
      if (e.event === 'page_view') {
        row.pageViews++;
        const path = normalizePath(meta.path);
        const last = row.journey[row.journey.length - 1];
        if (!last || last.path !== path) {
          row.journey.push({ ts: e.ts, type: 'page', label: path, path });
        }
        row.path.push(path);
        if (!row.entryPath) row.entryPath = path;
        row.exitPath = path;
        if (meta.referrer && !row.referrer) {
          try { row.referrer = new URL(meta.referrer).hostname || meta.referrer; }
          catch { row.referrer = meta.referrer; }
        }
      } else if (e.event === 'session_start' || e.event === 'session_heartbeat' || e.event === 'session_end') {
        // session lifecycle markers — implicit in start/end timestamps
      } else {
        // Real action — surface in journey + count in mix.
        const name = e.event === 'app_event' && meta.name ? meta.name : e.event;
        row.actions++;
        row.actionMix[name] = (row.actionMix[name] || 0) + 1;
        row.journey.push({
          ts: e.ts,
          type: 'action',
          label: name,
          path: normalizePath(meta.path || ''),
          meta: pickAtomic(meta),
        });
      }
    }

    const sessionsList = [...sessionMap.values()]
      .sort((a, b) => b.endTs - a.endTs)
      .map(s => ({
        sessionId: s.sessionId,
        startTs: s.startTs,
        endTs: s.endTs,
        durationMs: Math.max(0, s.endTs - s.startTs),
        events: s.events,
        pageViews: s.pageViews,
        actions: s.actions,
        entryPath: s.entryPath || (s.path[0] || ''),
        exitPath: s.exitPath || (s.path[s.path.length - 1] || ''),
        pathCount: s.path.length,
        uniqueLandings: [...new Set(s.path)].length,
        device: s.device,
        browser: s.browser,
        os: s.os,
        surface: s.surface,
        referrer: s.referrer,
        journey: s.journey,
        actionMix: Object.entries(s.actionMix).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: k, count: v })),
      }));

    return jsonResponse({
      uid: targetUid,
      profile: profile ? {
        email: profile.email || '',
        displayName: profile.displayName || '',
        photoURL: profile.photoURL || '',
        createdAt: profile.createdAt && profile.createdAt.toMillis ? profile.createdAt.toMillis() : null,
        lastLoginAt: profile.lastLoginAt && profile.lastLoginAt.toMillis ? profile.lastLoginAt.toMillis() : null,
        isAdmin: !!profile.isAdmin,
      } : null,
      team: teamInfo,
      summary: {
        totalEvents: events.length,
        eventCounts,
        firstSeen,
        lastSeen,
        pageViews,
        sessions,
        generations,
        conversions,
        rounds,
        completes,
        sessionCount: sessionsList.length,
      },
      sessions: sessionsList,
      events,
    }, 200, request);
  } catch (err) {
    console.error('admin-user-activity error:', err);
    return errorResponse('Failed to fetch activity: ' + (err.message || 'unknown'), 500, request);
  }
};

// Strip metadata down to atomic value fields, dropping the structural
// ones the journey view shouldn't surface (session_id, ua, path —
// already represented by their own UI element).
function pickAtomic(meta) {
  const out = {};
  const skip = new Set(['session_id', 'path', 'user_agent', 'screen', 'lang', 'referrer', 'title']);
  for (const k of Object.keys(meta || {})) {
    if (skip.has(k)) continue;
    const v = meta[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = typeof v === 'string' ? v.slice(0, 80) : v;
    }
  }
  return out;
}

export const config = {
  path: '/api/admin/user-activity',
};
