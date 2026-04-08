import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Hardcoded admin UID — the app owner's Firebase UID
const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

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

  try {
    // Run all collection counts in parallel
    const [
      usersSnap,
      casesSnap,
      sharedCasesSnap,
      forumPostsSnap,
      debatesSnap,
      marketClaimsSnap,
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
      db.collection('market_claims').count().get(),
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
    const totalMarketClaims = marketClaimsSnap.data().count;
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

    // Monthly breakdown — build stats for each month
    // We'll aggregate events by month for the last 12 months
    const monthlyData = [];
    const now = new Date();
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      const label = monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' });

      // Run monthly queries in parallel
      const [monthEvents, monthUsers, monthTeams] = await Promise.all([
        db.collection('events')
          .where('createdAt', '>=', monthStart)
          .where('createdAt', '<', monthEnd)
          .count().get()
          .catch(() => ({ data: () => ({ count: 0 }) })),
        db.collection('user_profiles')
          .where('createdAt', '>=', monthStart)
          .where('createdAt', '<', monthEnd)
          .count().get()
          .catch(() => ({ data: () => ({ count: 0 }) })),
        db.collection('teams')
          .where('createdAt', '>=', monthStart)
          .where('createdAt', '<', monthEnd)
          .count().get()
          .catch(() => ({ data: () => ({ count: 0 }) })),
      ]);

      monthlyData.push({
        month: label,
        monthStart: monthStart.toISOString(),
        events: monthEvents.data().count,
        newUsers: monthUsers.data().count,
        newTeams: monthTeams.data().count,
      });
    }

    // Event breakdown by type (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let eventBreakdown = {};
    try {
      const recentEvents = await db.collection('events')
        .where('createdAt', '>=', thirtyDaysAgo)
        .limit(5000)
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
      countersSnap.docs.forEach(doc => {
        const data = doc.data();
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === 'number' && key !== 'updatedAt') {
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

    // Recent feedback (last 5 entries)
    let recentFeedback = [];
    try {
      const fbSnap = await db.collection('feedback')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      recentFeedback = fbSnap.docs.map(d => {
        const data = d.data();
        return {
          category: data.category,
          description: (data.description || '').slice(0, 200),
          currentTab: data.currentTab,
          email: data.email,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      });
    } catch (err) {
      console.warn('Could not fetch recent feedback:', err.message);
    }

    return jsonResponse({
      // Totals
      totalUsers,
      totalCases,
      totalSharedCases,
      totalForumPosts,
      totalDebates,
      totalMarketClaims,
      totalTeams,
      activeTeams,
      paidTeams,
      totalReferrals,
      totalEvents,
      totalFeedback,
      recentSignups,

      // Monthly breakdown (last 12 months, newest first)
      monthly: monthlyData,

      // Event breakdown (last 30 days)
      eventBreakdown,

      // Top features
      topFeatures,

      // Recent feedback
      recentFeedback,

      timestamp: new Date().toISOString(),
    }, 200, request);
  } catch (err) {
    console.error('admin-analytics error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/analytics',
};
