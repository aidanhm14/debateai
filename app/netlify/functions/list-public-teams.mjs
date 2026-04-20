// Public teams directory. Returns teams that have opted in via isPublic=true.
// Auth is optional — this endpoint is deliberately readable without signing in
// so landing-page visitors can see that real teams use the product.
//
// Returned fields are curated: never expose billing, usage, emails, or UIDs.
// Only {id, name, bio, memberCount, ownerDisplayName, createdAt, plan}.
// plan is included so "Individual" vs "Team" badges can be shown, but usage
// numbers and Stripe IDs are omitted.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  try {
    const db = getDb();
    // Cap at 100 public teams for now. If this grows we'll add pagination.
    const snap = await db.collection('teams')
      .where('isPublic', '==', true)
      .limit(100)
      .get();

    // Collect member-count lookups in parallel. memberCount is already stored
    // on the team doc from create-team / join-team, so prefer that. Fall back
    // to a count query only if the field is missing (older docs).
    const teams = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data() || {};
      let memberCount = typeof data.memberCount === 'number' ? data.memberCount : null;
      if (memberCount == null) {
        try {
          const memberSnap = await db.collection('team_members')
            .where('teamId', '==', doc.id)
            .get();
          memberCount = memberSnap.size;
        } catch (e) { memberCount = 0; }
      }

      // Owner display name. Pull from team_members where role=owner.
      let ownerDisplayName = '';
      try {
        const ownerSnap = await db.collection('team_members')
          .where('teamId', '==', doc.id)
          .where('role', '==', 'owner')
          .limit(1)
          .get();
        if (!ownerSnap.empty) {
          const om = ownerSnap.docs[0].data() || {};
          // Only show first name for privacy — no full name or email.
          ownerDisplayName = (om.displayName || '').split(' ')[0] || '';
        }
      } catch (e) { /* leave blank */ }

      let createdAt = null;
      try {
        if (data.createdAt?.toDate) createdAt = data.createdAt.toDate().toISOString();
        else if (data.createdAt instanceof Date) createdAt = data.createdAt.toISOString();
        else if (typeof data.createdAt === 'string') createdAt = data.createdAt;
      } catch (e) { /* null ok */ }

      return {
        id: doc.id,
        name: data.name || '',
        bio: data.bio || '',
        memberCount,
        ownerDisplayName,
        createdAt,
        plan: data.plan || 'trial',
      };
    }));

    // Sort newest-first by default.
    teams.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });

    return jsonResponse({
      count: teams.length,
      teams,
      timestamp: new Date().toISOString(),
    }, 200, request);
  } catch (err) {
    console.error('list-public-teams error:', err);
    return errorResponse('Failed to load public teams: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/teams/public',
};
