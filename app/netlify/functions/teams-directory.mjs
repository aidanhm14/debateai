import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Public team directory — lists teams that have opted in via isPublic: true.
// Auth-required (signed-in only) so we can filter out the caller's own team
// and keep this from being a scrape target. Returns a slim payload: name,
// member count, created date, a teamId the caller can use to start a DM.
export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to browse teams', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed. Please sign in again.', 401, request); }

  const callerUid = decoded.sub;
  const db = getDb();

  try {
    // Pull signed-in caller's team so we can exclude it from the directory.
    const myMembership = await db.collection('team_members')
      .where('userId', '==', callerUid).limit(1).get();
    const myTeamId = myMembership.empty ? null : myMembership.docs[0].data().teamId;

    // Fetch public teams. We keep the query client-side simple on purpose:
    // this is an early-stage feature; if it grows beyond a few hundred
    // public teams, swap to pagination + composite index on createdAt.
    const snap = await db.collection('teams')
      .where('isPublic', '==', true)
      .limit(100)
      .get();

    const teams = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || 'Unnamed team',
          memberCount: data.memberCount || 1,
          plan: data.plan === 'trial' ? 'free' : (data.plan || 'free'),
          context: (data.context || '').slice(0, 140),
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      })
      .filter(t => t.id !== myTeamId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return jsonResponse({ teams }, 200, request);
  } catch (err) {
    console.error('teams-directory error:', err.message);
    return errorResponse('Could not load team directory', 500, request);
  }
};

export const config = {
  path: '/api/teams/directory',
};
