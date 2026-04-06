import { Firestore, FieldValue } from '@google-cloud/firestore';

let db = null;

export function getDb() {
  if (db) return db;

  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('GOOGLE_SERVICE_ACCOUNT not configured');

  const creds = JSON.parse(serviceAccount);
  db = new Firestore({
    projectId: creds.project_id,
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
  });
  return db;
}

// Plan tier definitions
export const PLANS = {
  trial:  { requests: 5,    members: 3,  priceMonthly: 0 },
  individual: { requests: 300,  members: 1,  priceMonthly: 500 },
  team:       { requests: 2000, members: 50, priceMonthly: 3000 },
};

/**
 * Look up a user's team given their Firebase UID.
 * Returns { team, teamRef, membership } or null if no team.
 */
export async function getUserTeam(uid) {
  const db = getDb();

  // Find membership
  const memberships = await db.collection('team_members')
    .where('userId', '==', uid)
    .limit(1)
    .get();

  if (memberships.empty) return null;

  const membership = memberships.docs[0].data();
  const teamRef = db.collection('teams').doc(membership.teamId);
  const teamDoc = await teamRef.get();

  if (!teamDoc.exists) return null;

  return {
    team: { id: teamDoc.id, ...teamDoc.data() },
    teamRef,
    membership,
  };
}

/**
 * Increment usage counter for a team and log the request.
 */
export async function logUsage(teamId, userId, feature, inputTokens = 0, outputTokens = 0) {
  const db = getDb();

  // Atomic increment of the team usage counter
  await db.collection('teams').doc(teamId).update({
    usageThisPeriod: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Append detailed usage log
  await db.collection('usage_logs').add({
    teamId,
    userId,
    feature,
    inputTokens,
    outputTokens,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export { FieldValue };
