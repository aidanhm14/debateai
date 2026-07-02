import { Firestore, FieldValue } from '@google-cloud/firestore';
import { PROJECT_ID as BAKED_PROJECT_ID, CLIENT_EMAIL as BAKED_CLIENT_EMAIL, PRIVATE_KEY_B64 as BAKED_PRIVATE_KEY_B64 } from './_firestore-creds.mjs';

let db = null;

export function getDb() {
  if (db) return db;

  // Preferred path: build-baked credentials. scripts/bake-firestore-creds.mjs
  // reads GOOGLE_SERVICE_ACCOUNT at build time, extracts the 3 fields, writes
  // them to _firestore-creds.mjs, esbuild inlines into the bundle. This lets
  // GOOGLE_SERVICE_ACCOUNT be scoped to "Builds" only in the Netlify dashboard
  // (out of the Lambda env block) so we stay under the AWS 4KB cap.
  if (BAKED_PROJECT_ID && BAKED_CLIENT_EMAIL && BAKED_PRIVATE_KEY_B64) {
    const privateKey = Buffer.from(BAKED_PRIVATE_KEY_B64, 'base64').toString('utf-8');
    db = new Firestore({
    preferRest: true, // REST transport: no gRPC channel setup, cuts Lambda cold-start by seconds
      projectId: BAKED_PROJECT_ID,
      credentials: { client_email: BAKED_CLIENT_EMAIL, private_key: privateKey },
    });
    return db;
  }

  // Split-vars fallback (GOOGLE_PROJECT_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY).
  // Same size win as the bake without bundling secrets, but requires three
  // separate dashboard env vars instead of one scope change.
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (projectId && clientEmail && rawKey) {
    // Netlify dashboard turns literal newlines into `\n` on save — normalize.
    const privateKey = rawKey.replace(/\\n/g, '\n');
    db = new Firestore({
    preferRest: true, // REST transport: no gRPC channel setup, cuts Lambda cold-start by seconds
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });
    return db;
  }

  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error('Firestore credentials not configured. Set GOOGLE_PROJECT_ID + GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (preferred) or GOOGLE_SERVICE_ACCOUNT (legacy).');
  }

  let creds;
  try {
    creds = JSON.parse(serviceAccount);
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT JSON parse failed. First 50 chars:', serviceAccount.slice(0, 50), '... Last 50 chars:', serviceAccount.slice(-50));
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not valid JSON. Re-paste the service account key.');
  }

  if (!creds.project_id || !creds.client_email || !creds.private_key) {
    console.error('GOOGLE_SERVICE_ACCOUNT missing fields. Keys found:', Object.keys(creds).join(', '));
    throw new Error('GOOGLE_SERVICE_ACCOUNT is missing required fields (project_id, client_email, or private_key).');
  }

  db = new Firestore({
    preferRest: true, // REST transport: no gRPC channel setup, cuts Lambda cold-start by seconds
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
  trial:  { requests: 3,    members: 3,  priceMonthly: 0 },
  byok:       { requests: 9999, members: 1,  priceMonthly: 100 },
  individual: { requests: 250,  members: 1,  priceMonthly: 500 },
  lifetime:   { requests: 250,  members: 3,  priceMonthly: 0 },
  team:       { requests: 1500, members: 50, priceMonthly: 3000 },
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
