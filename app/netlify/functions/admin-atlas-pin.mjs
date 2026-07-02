// /api/admin/atlas-pin
//
// Admin-only delete helper for Atlas community/member pins. Regular users
// can still delete their own pins directly through Firestore rules.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ALLOWED_COLLECTIONS = new Set(['atlas_submissions', 'atlas_members']);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'DELETE') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  const url = new URL(request.url);
  const collection = url.searchParams.get('collection') || '';
  const id = url.searchParams.get('id') || '';
  if (!ALLOWED_COLLECTIONS.has(collection)) return errorResponse('Invalid Atlas collection', 400, request);
  if (!id || id.length > 160 || /[/?#]/.test(id)) return errorResponse('Invalid Atlas pin id', 400, request);

  try {
    await db.collection(collection).doc(id).delete();
    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    console.error('admin-atlas-pin delete error:', err.message);
    return errorResponse('Failed to delete Atlas pin: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/atlas-pin',
};
