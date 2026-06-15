import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, getCachedSharedStale, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

// Hardcoded admin UID — the app owner's Firebase UID
const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

const CACHE_KEY = 'analytics';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-analytics auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) {
        isAdmin = true;
      }
    } catch (err) {
      console.error('admin-analytics profile check error:', err.message);
    }
  }

  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  // Cache check — this endpoint runs ~210 count queries on a miss.
  // 5-min cache means an auto-refreshing /admin tab gets one real
  // pull per 5-min window, not one per 30s.
  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    // Run all collection counts in parallel
    const [
      usersSnap,
      casesSnap,
      sharedCasesSnap,
      forumPostsSnap,
      debatesSnap,
      teamsSnap,
      referralsSnap,
      eventsSnap,
      feedbackSnap,
    ] = await Promise.all([
      db.collection('user_profiles').count().get(),
      db.collection('user_cases').count().get(),
      db.collection('shared_cases').count().get(),
      db.collection('forum_posts').count().get(),
      db.collection('live_debates').count().get(),
      db.collection('teams').get(),
      db.collection('referral_credits').count().get(),
      db.collection('events').count().get(),
      db.collection('feedback').count().get().catch(() => ({ data: () => ({ count: 0 }) })),
    ]);

    const totalUsers = usersSnap.data().count;
    const totalCases = casesSnap.data().count;
    const totalSharedCases = sharedCasesSnap.data().count;
    const totalForumPosts = forumPostsSnap.data().count;
    const totalDebates = debatesSnap.data().count;
    const totalReferrals = referralsSnap.data().count;
    const totalEvents = eventsSnap.data().count;
    const totalFeedback = feedbackSnap.data().count;

    // Team metrics
    const teamDocs = teamsSnap.docs.map(d => d.data());
    const totalTeams = teamDocs.length;
    const activeTeams = teamDocs.filter(t => (t.usageThisPeriod || 0) > 0).length;
    const paidTeams = teamDocs.filter(t => t.plan && t.plan !== 'trial').length;

    // Recent signups (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let recentSignups = 0;
    try {
      const recentSnap = await db.collection('user_profiles')
        .where('createdAt', '>=', sevenDaysAgo)
        .count()
        .get();
      recentSignups = recentSnap.data().count;
    } catch (err) {
      console.warn('Could not count recent signups:', err.message);
    }

    // === TIME-SERIES DATA ===
    // Three granularities so charts look good at any zoom level:
    // 1. Daily: last 30 days (recent trends, fine grain)
    // 2. Weekly: last 26 weeks / 6 months (medium-term, clean graph)
    // 3. Monthly: last 24 months (long-term growth, compact)

    const now = new Date();
    const countQ = (col, start, end) =>
      db.collection(col)
        .where('createdAt', '>=', start)
        .where('createdAt', '<', end)
        .count().get()
        .then(s => s.data().count)
        .catch(() => 0);

    // 1. DAILY — last 30 days
    const dailyPromises = [];
    for (let d = 0; d < 30; d++) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d + 1);
      const label = dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyPromises.push(
        Promise.all([countQ('events', dayStart, dayEnd), countQ('user_profiles', dayStart, dayEnd)])
          .then(([events, newUsers]) => ({ date: label, dateISO: dayStart.toISOString().slice(0, 10), events, newUsers }))
      );
    }
    const daily = await Promise.all(dailyPromises);

    // 2. WEEKLY — last 26 weeks
    const weeklyPromises = [];
    for (let w = 0; w < 26; w++) {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w + 1) * 7);
      const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
      const label = 'W' + (26 - w) + ' ' + weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyPromises.push(
        Promise.all([countQ('events', weekStart, weekEnd), countQ('user_profiles', weekStart, weekEnd), countQ('teams', weekStart, weekEnd)])
          .then(([events, newUsers, newTeams]) => ({ week: label, weekStart: weekStart.toISOString().slice(0, 10), events, newUsers, newTeams }))
      );
    }
    const weekly = await Promise.all(weeklyPromises);

    // 3. MONTHLY — last 24 months
    const monthlyPromises = [];
    for (let m = 0; m < 24; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      const label = monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      monthlyPromises.push(
        Promise.all([countQ('events', monthStart, monthEnd), countQ('user_profiles', monthStart, monthEnd), countQ('teams', monthStart, monthEnd)])
          .then(([events, newUsers, newTeams]) => ({ month: label, monthStart: monthStart.toISOString().slice(0, 10), events, newUsers, newTeams }))
      );
    }
    const monthly = await Promise.all(monthlyPromises);

    // Event breakdown by type (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let eventBreakdown = {};
    try {
      const recentEvents = await db.collection('events')
        .where('createdAt', '>=', thirtyDaysAgo)
        .limit(2000) // 2026-06-15: 5000→2000 to shrink a cold-miss read burst under the Spark daily cap
        .get();
      recentEvents.docs.forEach(doc => {
        const ev = doc.data().event || 'unknown';
        eventBreakdown[ev] = (eventBreakdown[ev] || 0) + 1;
      });
    } catch (err) {
      console.warn('Could not aggregate events:', err.message);
    }

    // Top features from learning_counters
    let topFeatures = [];
    try {
      const countersSnap = await db.collection('learning_counters').limit(100).get();
      const featureTotals = {};
      // Skip metadata-ish numeric fields that aren't actual feature names.
      // Without this filter the dashboard surfaces a literal "count: 5" row.
      const SKIP_KEYS = new Set(['count','createdAt','updatedAt','uid','timestamp','lastUpdated','version','ts','id']);
      countersSnap.docs.forEach(doc => {
        const data = doc.data();
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === 'number' && !SKIP_KEYS.has(key)) {
            featureTotals[key] = (featureTotals[key] || 0) + val;
          }
        }
      });
      topFeatures = Object.entries(featureTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([feature, count]) => ({ feature, count }));
    } catch (err) {
      console.warn('Could not aggregate learning_counters:', err.message);
    }

    // Recent feedback (last 5 entries).
    // Older feedback docs predate the createdAt field — orderBy silently
    // drops them, so the dashboard showed FEEDBACK 7 but "No feedback yet."
    // Strategy: try ordered query first, fall back to plain limit if empty.
    let recentFeedback = [];
    const mapFb = d => {
      const data = d.data();
      return {
        category: data.category,
        description: (data.description || '').slice(0, 200),
        currentTab: data.currentTab,
        email: data.email,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    };
    try {
      const fbSnap = await db.collection('feedback')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      recentFeedback = fbSnap.docs.map(mapFb);
    } catch (err) {
      console.warn('Could not fetch ordered feedback:', err.message);
    }
    if (recentFeedback.length === 0) {
      try {
        const fbSnap = await db.collection('feedback').limit(10).get();
        recentFeedback = fbSnap.docs.map(mapFb);
      } catch (err) {
        console.warn('Could not fetch fallback feedback:', err.message);
      }
    }

    const result = {
      // Totals
      totalUsers,
      totalCases,
      totalSharedCases,
      totalForumPosts,
      totalDebates,
      totalTeams,
      activeTeams,
      paidTeams,
      totalReferrals,
      totalEvents,
      totalFeedback,
      recentSignups,

      // Time-series (newest first)
      daily: daily.reverse(),
      weekly: weekly.reverse(),
      monthly: monthly.reverse(),

      // Event breakdown (last 30 days)
      eventBreakdown,

      // Top features
      topFeatures,

      // Recent feedback
      recentFeedback,

      timestamp: new Date().toISOString(),
    };
    await setCachedShared(CACHE_KEY, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-analytics error:', err);
    // Quota blown / transient Firestore failure: serve the last cached
    // payload (expiry ignored) so the panel shows last-known numbers
    // instead of a 500. _stale lets the UI flag it.
    const stale = await getCachedSharedStale(CACHE_KEY);
    if (stale) return jsonResponse({ ...stale, _stale: true }, 200, request);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/analytics',
};
