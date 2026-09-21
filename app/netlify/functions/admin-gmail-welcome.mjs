import { requireAdmin } from './lib/admin-auth.mjs';
import { getAuthUserByUid } from './lib/auth-admin.mjs';
import { sendCampaignWelcome, validCampaignId } from './lib/gmail-campaign.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';

// Only sends a single member of a separately approved, server-only manifest.
// This endpoint cannot create campaigns, expand cohorts, or accept addresses.
export default async request => {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }
  if (!validCampaignId(body.campaignId) || typeof body.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.uid)) {
    return errorResponse('Invalid campaign or account', 400, request);
  }
  try {
    const user = await getAuthUserByUid(body.uid);
    if (!user) return jsonResponse({ sent: false, reason: 'no_user' }, 200, request);
    return jsonResponse(await sendCampaignWelcome(gate.db, user, body.campaignId), 200, request);
  } catch {
    console.error('[admin-gmail-welcome] delivery operation failed; inspect the delivery record before retrying');
    return errorResponse('Delivery needs review', 502, request);
  }
};

export const config = { path: '/api/admin/gmail-welcome' };
