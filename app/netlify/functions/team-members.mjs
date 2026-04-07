import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  // Authenticate
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('team-members auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const result = await getUserTeam(uid);
  if (!result) return errorResponse('You do not belong to a team', 404, request);

  const { team, membership } = result;
  const db = getDb();

  // GET — list members
  if (request.method === 'GET') {
    const membersSnap = await db.collection('team_members')
      .where('teamId', '==', team.id)
      .get();

    const members = membersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      joinedAt: doc.data().joinedAt?.toDate?.()?.toISOString() || null,
    }));

    return jsonResponse({ members }, 200, request);
  }

  // POST — invite member (owner only)
  if (request.method === 'POST') {
    if (membership.role !== 'owner') {
      return errorResponse('Only the team owner can invite members', 403, request);
    }

    if (team.memberCount >= team.maxMembers) {
      return errorResponse(
        `Team is at capacity (${team.maxMembers} members). Upgrade your plan to add more.`,
        403,
        request
      );
    }

    const body = await request.json();
    const inviteEmail = (body.email || '').trim().toLowerCase();
    if (!inviteEmail) return errorResponse('Email is required', 400, request);

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      return errorResponse('Invalid email address', 400, request);
    }

    // Check if user already on this team
    const existingMember = await db.collection('team_members')
      .where('teamId', '==', team.id)
      .where('email', '==', inviteEmail)
      .limit(1)
      .get();

    if (!existingMember.empty) {
      return errorResponse('This user is already on your team', 409, request);
    }

    // Check if invited user exists and has no team
    const profileSnap = await db.collection('user_profiles')
      .where('email', '==', inviteEmail)
      .limit(1)
      .get();

    if (!profileSnap.empty) {
      const profile = profileSnap.docs[0];
      if (profile.data().teamId) {
        return errorResponse('This user already belongs to another team', 409, request);
      }

      // Add them directly
      await db.collection('team_members').add({
        teamId: team.id,
        userId: profile.id,
        email: inviteEmail,
        displayName: profile.data().displayName || '',
        role: 'member',
        joinedAt: FieldValue.serverTimestamp(),
      });

      // Update their profile
      await db.collection('user_profiles').doc(profile.id).update({
        teamId: team.id,
      });

      // Increment member count
      await db.collection('teams').doc(team.id).update({
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return jsonResponse({ message: `${inviteEmail} added to team` }, 201, request);
    }

    // User doesn't exist yet — store pending invite
    await db.collection('teams').doc(team.id)
      .collection('invites').add({
        email: inviteEmail,
        invitedBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    return jsonResponse({
      message: `Invite saved. ${inviteEmail} will be added when they sign up.`,
    }, 201, request);
  }

  // DELETE — remove member (owner only)
  if (request.method === 'DELETE') {
    if (membership.role !== 'owner') {
      return errorResponse('Only the team owner can remove members', 403, request);
    }

    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');
    if (!memberId) return errorResponse('memberId query parameter is required', 400, request);

    const memberDoc = await db.collection('team_members').doc(memberId).get();
    if (!memberDoc.exists || memberDoc.data().teamId !== team.id) {
      return errorResponse('Member not found', 404, request);
    }

    if (memberDoc.data().role === 'owner') {
      return errorResponse('Cannot remove the team owner', 400, request);
    }

    // Remove membership
    await db.collection('team_members').doc(memberId).delete();

    // Clear their team reference
    if (memberDoc.data().userId) {
      await db.collection('user_profiles').doc(memberDoc.data().userId).update({
        teamId: null,
      });
    }

    // Decrement member count
    await db.collection('teams').doc(team.id).update({
      memberCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return jsonResponse({ message: 'Member removed' }, 200, request);
  }

  return errorResponse('Method not allowed', 405, request);
};

export const config = {
  path: '/api/teams/members',
};
