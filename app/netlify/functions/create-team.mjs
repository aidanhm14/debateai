import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, PLANS, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  try {
    // Authenticate
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Authorization required', 401, request);

    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (err) {
      console.error('create-team auth error:', err.message);
      return errorResponse('Authentication failed. Please sign in again.', 401, request);
    }

    const uid = decoded.sub;
    const email = decoded.email || '';
    const name = decoded.name || '';

    // Check user isn't already on a team
    const existing = await getUserTeam(uid);
    if (existing) return errorResponse('You already belong to a team', 409, request);

    const body = await request.json();
    const teamName = (body.name || '').trim().slice(0, 100);
    if (!teamName) return errorResponse('Team name is required', 400, request);

    // Create Stripe customer
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const customer = await stripe.customers.create({
      email,
      name: teamName,
      metadata: { firebaseUid: uid },
    });

    const db = getDb();
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); // 1 month from now

    // Create team document
    const teamRef = db.collection('teams').doc();
    const teamData = {
      name: teamName,
      ownerId: uid,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
      plan: 'trial',
      status: 'active',
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      usageThisPeriod: 0,
      usageLimit: PLANS.trial.requests,
      memberCount: 1,
      maxMembers: PLANS.trial.members,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await teamRef.set(teamData);

    // Create owner membership
    await db.collection('team_members').add({
      teamId: teamRef.id,
      userId: uid,
      email,
      displayName: name,
      role: 'owner',
      joinedAt: FieldValue.serverTimestamp(),
    });

    // Create/update user profile
    await db.collection('user_profiles').doc(uid).set({
      teamId: teamRef.id,
      email,
      displayName: name,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return jsonResponse({
      teamId: teamRef.id,
      teamName: teamName,
      plan: teamData.plan,
      status: teamData.status,
      role: 'owner',
      usageThisPeriod: 0,
      usageLimit: teamData.usageLimit,
      memberCount: 1,
      maxMembers: teamData.maxMembers,
      stripeSubscriptionId: null,
      currentPeriodEnd: periodEnd.toISOString(),
      trialEndsAt: null,
    }, 201, request);
  } catch (err) {
    console.error('create-team error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/teams',
};
