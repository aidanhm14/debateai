import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, PLANS, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('join-team auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const email = decoded.email || '';
  const name = decoded.name || '';

  // Check if user already has a team
  const existing = await getUserTeam(uid);
  if (existing) return errorResponse('You already belong to a team', 409, request);

  const body = await request.json();
  const teamId = (body.teamId || '').trim();
  if (!teamId) return errorResponse('Team ID is required', 400, request);

  const db = getDb();

  try {
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) return errorResponse('Team not found', 404, request);

    const team = teamDoc.data();
    const planLimits = PLANS[team.plan] || PLANS.trial;

    // Check member limit
    if ((team.memberCount || 1) >= planLimits.members) {
      return errorResponse('Team is full. Ask the owner to upgrade the plan.', 403, request);
    }

    // Verify invite or open join
    let inviteDoc = null;
    if (!team.openJoin) {
      const inviteSnap = await db.collection('teams').doc(teamId)
        .collection('pendingInvites').where('email', '==', email).limit(1).get();
      if (inviteSnap.empty) {
        return errorResponse('Invitation required to join this team', 403, request);
      }
      inviteDoc = inviteSnap.docs[0];
    }

    // Add member
    await db.collection('team_members').add({
      teamId,
      userId: uid,
      email,
      displayName: name,
      role: 'member',
      joinedAt: FieldValue.serverTimestamp(),
    });

    // Update member count
    await db.collection('teams').doc(teamId).update({
      memberCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update user profile
    await db.collection('user_profiles').doc(uid).set({
      teamId,
      email,
      displayName: name,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Delete pending invite after successful join
    if (inviteDoc) {
      await inviteDoc.ref.delete();
    }

    return jsonResponse({ ok: true, teamName: team.name }, 200, request);
  } catch (err) {
    console.error('join-team error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/teams/join',
};
