import { getDb, getUserTeam } from './lib/firestore.mjs';
import { verifyToken } from './lib/auth.mjs';
import { cors, json, error } from './lib/response.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return error('Method not allowed', 405);

  try {
    const uid = await verifyToken(event);
    const result = await getUserTeam(uid);
    if (!result) return error('No team found', 404);

    const { team, teamRef, membership } = result;
    if (membership.role !== 'owner') return error('Only team owner can update', 403);

    const body = JSON.parse(event.body || '{}');
    const updates = {};

    if (body.name && typeof body.name === 'string') {
      updates.teamName = body.name.trim().slice(0, 100);
    }
    if (typeof body.context === 'string') {
      updates.context = body.context.trim().slice(0, 500);
    }

    if (Object.keys(updates).length === 0) return error('Nothing to update', 400);

    await teamRef.update(updates);

    return json({ ok: true, ...updates });
  } catch (e) {
    return error(e.message || 'Server error', 500);
  }
}
