// Public coach directory endpoint. Reads the same `coach_directory`
// collection the admin panel manages (admin-coaches.mjs), but open to
// everyone: anyone can browse + contact, and any signed-in user can add.
//
// GET  /api/coaches   → public list, newest-first (no auth)
// POST /api/coaches   → add one, requires a Firebase ID token (any user),
//                       rate-limited per uid. Fields: { name, program,
//                       location, role, contact, contactKind, note }
//
// Writes use the admin SDK, so the collection stays locked at the rules
// level and all abuse control lives here (sign-in required + per-uid
// hourly cap). Admin can delete public entries from the /admin panel.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const COLLECTION = 'coach_directory';
const CONTACT_KINDS = ['email', 'phone', 'link'];
const OUTREACH_URL = 'https://debateit-outreach-desk.netlify.app';
const MAX_PER_UID_PER_HOUR = 8; // anti-spam: a signed-in user can add a few, not flood

function clip(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function contactHref(kind, raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (kind === 'email') return 'mailto:' + v;
  if (kind === 'phone') return 'tel:' + v.replace(/[^\d+]/g, '');
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://' + v.replace(/^\/+/, '');
}

// Loose sanity check so an "email" kind actually looks like an email and a
// "link" isn't a javascript: URL. Not exhaustive; the display side escapes.
function contactLooksValid(kind, v) {
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (kind === 'phone') return /[\d]{6,}/.test(v.replace(/[^\d]/g, ''));
  // link: reject dangerous schemes
  return !/^\s*(javascript|data|vbscript):/i.test(v);
}

function shape(id, data) {
  return {
    id,
    name: data.name || '',
    program: data.program || '',
    location: data.location || '',
    role: data.role || '',
    contact: data.contact || '',
    contactKind: data.contactKind || 'email',
    contactHref: contactHref(data.contactKind || 'email', data.contact || ''),
    note: data.note || '',
    addedByName: data.addedByName || '',
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  // ── GET: public list ─────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(2000).get();
      const coaches = snap.docs.map((d) => {
        const c = shape(d.id, d.data() || {});
        let createdAt = null;
        const raw = (d.data() || {}).createdAt;
        try {
          if (raw?.toDate) createdAt = raw.toDate().toISOString();
          else if (raw instanceof Date) createdAt = raw.toISOString();
          else if (typeof raw === 'string') createdAt = raw;
        } catch (e) { /* leave null */ }
        return { ...c, createdAt };
      });
      return jsonResponse({ count: coaches.length, coaches, outreachUrl: OUTREACH_URL }, 200, request);
    } catch (err) {
      console.error('coaches list error:', err);
      return errorResponse('Failed to load coaches: ' + (err.message || err), 500, request);
    }
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // ── POST: add (any signed-in user) ───────────────────────────────
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to add a coach', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Sign-in expired. Please sign in again.', 401, request);
  }
  const uid = decoded.sub;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const name = clip(body.name, 120);
  const contact = clip(body.contact, 200);
  let contactKind = clip(body.contactKind, 12).toLowerCase();
  if (!CONTACT_KINDS.includes(contactKind)) contactKind = 'email';
  if (!name) return errorResponse('Name is required', 400, request);
  if (!contact) return errorResponse('A contact (email, phone, or link) is required', 400, request);
  if (!contactLooksValid(contactKind, contact)) {
    return errorResponse('That contact does not look like a valid ' + contactKind, 400, request);
  }

  // Per-uid hourly cap. Single-field equality query (no composite index),
  // count within the window in-process.
  try {
    const mine = await db.collection(COLLECTION).where('addedByUid', '==', uid).limit(50).get();
    const cutoff = Date.now() - 3600_000;
    let recent = 0;
    mine.forEach((doc) => {
      const raw = doc.data().createdAt;
      let ms = 0;
      try {
        if (raw?.toDate) ms = raw.toDate().getTime();
        else if (raw instanceof Date) ms = raw.getTime();
      } catch (e) { /* ignore */ }
      if (ms >= cutoff) recent++;
    });
    if (recent >= MAX_PER_UID_PER_HOUR) {
      return errorResponse('You have added a lot recently. Please try again later.', 429, request);
    }
  } catch (err) {
    console.error('coaches rate-check error (allowing):', err.message);
  }

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
    source: 'public',
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    const ref = await db.collection(COLLECTION).add(doc);
    return jsonResponse({
      ok: true,
      coach: { ...shape(ref.id, doc), createdAt: new Date().toISOString() },
    }, 200, request);
  } catch (err) {
    console.error('coaches add error:', err);
    return errorResponse('Failed to add coach: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/coaches',
};
