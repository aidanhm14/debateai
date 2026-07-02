// Admin endpoint: the coach directory. A growable, hand-curated list of
// debate coaches + programs the admin can contact directly, surfaced on
// the /admin dashboard next to Subscribers / Prospects. Distinct from
// those two: subscribers = "notify me" signups, prospects = soft leads
// captured at a wall, coaches = an outbound contact list Aidan builds by
// hand (paired with the coach Outreach Desk at debateit-outreach-desk).
//
// GET    /api/admin/coaches       → list, newest-first
// POST   /api/admin/coaches       → add one { name, program, location,
//                                     role, contact, contactKind, note }
// DELETE /api/admin/coaches?id=x  → remove one
//
// Gate pattern mirrors admin-prospects.mjs. Writes use the admin SDK, so
// no Firestore rules change is needed — the `coach_directory` collection
// is only ever touched through this admin-gated function.
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const COLLECTION = 'coach_directory';
const CONTACT_KINDS = ['email', 'phone', 'link'];

function clip(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Build a direct-contact href from the raw value + kind, so the client
// can render "contact directly" links without re-deriving the scheme.
function contactHref(kind, raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (kind === 'email') return 'mailto:' + v;
  if (kind === 'phone') return 'tel:' + v.replace(/[^\d+]/g, '');
  // link: pass through http(s), otherwise assume https.
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://' + v.replace(/^\/+/, '');
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-coaches auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Admin gate: ADMIN_UID env var OR isAdmin profile flag.
  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-coaches profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  // ── POST: add a coach ────────────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch { return errorResponse('Invalid JSON body', 400, request); }

    const name = clip(body.name, 120);
    const contact = clip(body.contact, 200);
    let contactKind = clip(body.contactKind, 12).toLowerCase();
    if (!CONTACT_KINDS.includes(contactKind)) contactKind = 'email';
    if (!name) return errorResponse('Name is required', 400, request);
    if (!contact) return errorResponse('A contact (email, phone, or link) is required', 400, request);

    const doc = {
      name,
      program: clip(body.program, 160),
      location: clip(body.location, 120),
      role: clip(body.role, 120),
      contact,
      contactKind,
      note: clip(body.note, 400),
      addedByUid: uid,
      addedByName: clip(decoded.name || decoded.email || '', 120),
      createdAt: FieldValue.serverTimestamp(),
    };

    try {
      const ref = await db.collection(COLLECTION).add(doc);
      return jsonResponse({
        ok: true,
        coach: { id: ref.id, ...doc, createdAt: new Date().toISOString(), contactHref: contactHref(contactKind, contact) },
      }, 200, request);
    } catch (err) {
      console.error('admin-coaches add error:', err);
      return errorResponse('Failed to add coach: ' + (err.message || err), 500, request);
    }
  }

  // ── DELETE: remove a coach by id ─────────────────────────────────
  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return errorResponse('Missing id', 400, request);
    try {
      await db.collection(COLLECTION).doc(id).delete();
      return jsonResponse({ ok: true, id }, 200, request);
    } catch (err) {
      console.error('admin-coaches delete error:', err);
      return errorResponse('Failed to remove coach: ' + (err.message || err), 500, request);
    }
  }

  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  // ── GET: list, newest-first ──────────────────────────────────────
  try {
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(2000).get();
    const coaches = snap.docs.map((d) => {
      const data = d.data() || {};
      let createdAt = null;
      try {
        if (data.createdAt?.toDate) createdAt = data.createdAt.toDate().toISOString();
        else if (data.createdAt instanceof Date) createdAt = data.createdAt.toISOString();
        else if (typeof data.createdAt === 'string') createdAt = data.createdAt;
      } catch (e) { /* leave null */ }
      return {
        id: d.id,
        name: data.name || '',
        program: data.program || '',
        location: data.location || '',
        role: data.role || '',
        contact: data.contact || '',
        contactKind: data.contactKind || 'email',
        contactHref: contactHref(data.contactKind || 'email', data.contact || ''),
        note: data.note || '',
        addedByName: data.addedByName || '',
        createdAt,
      };
    });
    return jsonResponse({
      count: coaches.length,
      coaches,
      outreachUrl: 'https://debateit-outreach-desk.netlify.app',
      timestamp: new Date().toISOString(),
    }, 200, request);
  } catch (err) {
    console.error('admin-coaches fetch error:', err);
    return errorResponse('Failed to load coaches: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/admin/coaches',
};
