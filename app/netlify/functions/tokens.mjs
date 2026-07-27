// /api/tokens — your usage-token balance and subscription state.
//
// Tokens are paid usage allowance (a subscription refills them monthly).
// They are a separate economy from Play Points: no staking, no prize
// entry, no conversion. See lib/tokens.mjs for the firewall note.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { TOKENS, TOKENS_LIVE, defaultTokenAccount } from './lib/tokens.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to see your tokens.', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;

  const db = getDb();
  const snap = await withDeadline(db.collection('token_accounts').doc(uid).get(), 2500);
  const a = snap.exists ? snap.data() : defaultTokenAccount(uid, Date.now());

  return jsonResponse({
    tokens: a.tokens || 0,
    granted: a.granted || 0,
    spent: a.spent || 0,
    status: a.status || 'none',
    perCycle: TOKENS.PER_CYCLE,
    voiceRound: TOKENS.VOICE_ROUND,
    live: TOKENS_LIVE,
    disclaimer: 'Tokens are usage allowance for AI features. Not Play Points, not prize entries, never redeemable for money.',
  }, 200, request);
};

export const config = {
  path: '/api/tokens',
};
