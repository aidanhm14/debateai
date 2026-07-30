import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Founding-cohort signup capture. Anonymous-allowed POST (no Firebase
// token required) so visitors who haven't signed in yet can still
// register interest — most of the funnel arrives via /credentials and
// /verify URLs where the visitor is NOT signed in.
//
// Writes one doc per email to `early_cohort_signups/{emailHash}` so the
// same email signing up twice updates the existing doc rather than
// piling up duplicates. The collection is admin-read-only via Firestore
// rules; the GET path below returns just the count (no PII) so the
// public signup page can show a live "N people on the list" counter.
//
// Rate limit: 4 signups per IP per hour. A real visitor signs up once.

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 4;
const rateLimits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(k);
  }
}, 10 * 60 * 1000);

function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

// FNV-1a 32-bit hex hash. Stable email → doc id mapping without
// importing crypto; we just need dedup, not cryptographic strength.
function emailHash(email) {
  const s = String(email || '').trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Source slugs double as Firestore map keys on the _meta counter, so they
// have to be safe field names. Anything else collapses to 'other' rather
// than being rejected: a mistyped source should not cost a real signup.
const SOURCE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ALLOWED_FORMATS = new Set([
  'apda', 'bp', 'wsdc', 'policy', 'ld', 'pf',
  'asian_parli', 'congress', 'mun', 'world_schools',
  'quick_clash', 'impromptu', 'any',
]);
const ALLOWED_SKILL = new Set(['novice', 'intermediate', 'circuit', 'champion']);

function clamp(s, n) {
  return typeof s === 'string' ? s.slice(0, n) : '';
}

// Counter doc lives at early_cohort_signups/_meta so reading the count
// costs exactly 1 doc read instead of an aggregation query (which has
// the same 1-read cost but requires a newer SDK). Increment-on-write
// keeps it in sync; if the meta doc is missing we try count() as fallback.
const META_ID = '_meta';

// Returns { count, sources }. `sources` is a per-surface tally (landing
// waitlist vs prize waitlist vs /early) so a signup drive on one page is
// measurable without exporting the list. Numbers only, never PII.
async function readCount(db) {
  const metaRef = db.collection('early_cohort_signups').doc(META_ID);
  const meta = await metaRef.get();
  if (meta.exists && typeof meta.data().count === 'number') {
    return { count: meta.data().count, sources: meta.data().sources || {} };
  }
  // _meta not seeded yet — use count() aggregation to bootstrap it and
  // store the result so future GETs read just the one counter doc.
  try {
    const snap = await db.collection('early_cohort_signups').count().get();
    const n = snap.data().count;
    // Best-effort seed (subtract 1 for the _meta doc itself which count() includes).
    try { await metaRef.set({ count: Math.max(0, n - 1), seededAt: FieldValue.serverTimestamp() }); } catch (e) {}
    return { count: Math.max(0, n - 1), sources: {} };
  } catch (e) {
    return null;
  }
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method === 'GET') {
    try {
      const db = getDb();
      const totals = await readCount(db);
      return jsonResponse(
        { count: totals ? totals.count : null, sources: totals ? totals.sources : {} },
        200, request, { 'cache-control': 'public, max-age=300' }
      );
    } catch (e) {
      console.warn('[early-signup] count read failed:', e && e.message);
      return jsonResponse({ count: null, sources: {} }, 200, request);
    }
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return errorResponse('Too many signups from this address. Try again later.', 429, request);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse('Invalid JSON body', 400, request);
  }

  const email = clamp(body.email, 200).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return errorResponse('Enter a valid email address', 400, request);
  }

  const skill = clamp(body.skill, 24).trim().toLowerCase();
  if (skill && !ALLOWED_SKILL.has(skill)) {
    return errorResponse('Pick a skill level from the list', 400, request);
  }

  const format = clamp(body.format, 24).trim().toLowerCase();
  if (format && !ALLOWED_FORMATS.has(format)) {
    return errorResponse('Pick a format from the list', 400, request);
  }

  const timezone = clamp(body.timezone, 64).trim();
  const displayName = clamp(body.displayName, 80).trim();

  // 2026-07-30: `source` used to be written ONLY on a brand new doc, so
  // somebody already on the landing waitlist who then joined the prize
  // waitlist left no trace of the second intent: the response said
  // "returning" and the doc still read source:'landing-waitlist'. That
  // made a prize signup drive unmeasurable and, worse, meant we could
  // not tell who had actually asked about prize events. `interests` is
  // an arrayUnion written on EVERY signup, new or returning, so each
  // surface a person opts in from is recorded once. `source` keeps its
  // original meaning (first touch) and is untouched.
  const rawSource = clamp(body.source, 32).trim().toLowerCase();
  const source = SOURCE_RE.test(rawSource) ? rawSource : (rawSource ? 'other' : 'early-page');

  try {
    const db = getDb();
    const id = emailHash(email);
    const doc = {
      email,
      displayName: displayName || null,
      skill: skill || null,
      format: format || null,
      timezone: timezone || null,
      ip,
      userAgent: clamp(request.headers.get('user-agent') || '', 200),
      updatedAt: FieldValue.serverTimestamp(),
      interests: FieldValue.arrayUnion(source),
    };
    const ref = db.collection('early_cohort_signups').doc(id);

    // Existence check is best-effort: if the read quota is exhausted we
    // still want the write to land. On failure we treat the doc as new
    // (adds createdAt); merge: true makes double-writes safe either way.
    let existing = null;
    try { existing = await ref.get(); } catch (e) {
      console.warn('[early-signup] existence check failed (quota?):', e && e.message);
    }
    const isNew = !existing || !existing.exists;
    if (isNew) {
      doc.createdAt = FieldValue.serverTimestamp();
      doc.source = source;
    }
    // Did this email already opt in from THIS surface? If the existence
    // read failed above (quota), treat the interest as new: an extra
    // count is a better failure than a lost one, and arrayUnion keeps
    // the doc itself correct either way.
    const priorInterests = (existing && existing.exists && Array.isArray(existing.data().interests))
      ? existing.data().interests
      : [];
    const isNewInterest = !priorInterests.includes(source);

    await ref.set(doc, { merge: true });

    // Counter doc: `count` is unique emails, `sources.<slug>` is unique
    // emails per surface. They deliberately do not sum to each other,
    // since one person can join from two surfaces.
    if (isNew || isNewInterest) {
      const patch = {};
      if (isNew) patch.count = FieldValue.increment(1);
      if (isNewInterest) patch.sources = { [source]: FieldValue.increment(1) };
      try {
        await db.collection('early_cohort_signups').doc(META_ID).set(patch, { merge: true });
      } catch (e) {
        console.warn('[early-signup] counter increment failed:', e && e.message);
      }
    }

    let totals = null;
    try { totals = await readCount(db); } catch (e) {}

    return jsonResponse({
      ok: true,
      returning: !isNew,
      // A returning email joining a NEW surface is not "nothing to do":
      // the prize page needs to confirm the prize opt-in landed.
      newInterest: isNewInterest,
      count: totals ? totals.count : null,
    }, 200, request);
  } catch (e) {
    console.error('[early-signup] write failed:', e);
    return errorResponse('Could not save your signup. Try again in a moment.', 500, request);
  }
}

export const config = { path: '/api/early-signup' };
