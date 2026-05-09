import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Per-user activity timeline endpoint. Reads the events/ collection
// (populated by /js/track.js — page_view, session_*, app_event, plus
// the per-feature events like generate / battle_started / conversion)
// scoped to a single uid and returns a chronological feed for the
// /admin dashboard's user-activity panel.
//
// Same admin gate as admin-analytics: hardcoded ADMIN_UID env var or
// user_profiles/{uid}.isAdmin === true.

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const MAX_EVENTS = 500;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-user-activity auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const callerUid = decoded.sub;
  const db = getDb();

  let isAdmin = callerUid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(callerUid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) {
        isAdmin = true;
      }
    } catch (err) {
      console.error('admin-user-activity profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

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
    for (const e of events) {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
      if (!lastSeen || e.ts > lastSeen) lastSeen = e.ts;
      if (!firstSeen || e.ts < firstSeen) firstSeen = e.ts;
      if (e.event === 'page_view') pageViews++;
      if (e.event === 'session_start') sessions++;
      if (e.event === 'case_generated') generations++;
      if (e.event === 'conversion') conversions++;
    }

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
      },
      events,
    }, 200, request);
  } catch (err) {
    console.error('admin-user-activity error:', err);
    return errorResponse('Failed to fetch activity: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = {
  path: '/api/admin/user-activity',
};
