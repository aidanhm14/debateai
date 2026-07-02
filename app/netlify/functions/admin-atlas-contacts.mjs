// /api/admin/atlas-contacts
//
// Admin-only read of the private Atlas email map. The browser Atlas page
// uses this instead of reading atlas_contacts directly from Firestore so
// email-allowlisted admins work even before their user_profiles.isAdmin
// flag exists.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  try {
    const doc = await db.collection('atlas_contacts').doc('emails').get();
    return jsonResponse({ emails: doc.exists ? (doc.data() || {}) : {} }, 200, request);
  } catch (err) {
    console.error('admin-atlas-contacts error:', err.message);
    return errorResponse('Failed to load Atlas contacts: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/atlas-contacts',
};
