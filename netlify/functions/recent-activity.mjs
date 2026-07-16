// /api/recent-activity → public, anonymized feed of recent site
// activity for the notification-bell dropdown on every page. Goal:
// make the site look alive to anon visitors so they see other people
// using it and stick around / sign in.
//
// Two sources, both already public-by-design:
//   - live_challenges   → posted open debate challenges on /live
//                          (poster + side + format + motion)
//   - waitlist_posts    → "open to a round, DM me" pings on /spar
//                          (poster + format + optional note)
//
// Response shape (intentionally tiny — public surface, no PII leak.
// firstName only, no uid / email / photo URL beyond what each
// collection already exposes to signed-in users on its own page):
//
//   {
//     at: 'ISO',
//     items: [
//       {
//         kind: 'challenge' | 'waitlist',
//         name:    'Aaditya',                   // first name only
//         photo:   'https://...' | '',
//         format:  'apda' | 'pf' | ...,
//         label:   'posted a BP challenge',
//         motion:  'THBT the means justify the ends' | '',
//         href:    '/live#challenge-{id}' | '/spar',
//         when:    1716750000000               // ms since epoch
//       },
//       ...
//     ]
//   }
//
// Cached 30 seconds — fresh enough to feel live, narrow enough to
// keep Firestore reads bounded on a busy day.

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

const CACHE_KEY = 'recent-activity';
const CACHE_TTL = 5 * 60 * 1000;        // 5 min: near-static feed, keep quota burn low

// Cap each source at a generous N then merge + truncate to 12. Pulling
// more than we render makes the merge stable when one source is bursty.
const PER_SOURCE_LIMIT = 12;
const MAX_ITEMS        = 12;

// Items older than this are dropped on the way out. The original 48h
// cutoff went empty most days at the current ~50-rounds/30d engagement
// level (per soul.md §8) — the bell would show "Quiet right now" to
// every visitor and the social-proof play didn't fire. 14 days surfaces
// a healthy window of real signal without dragging in genuinely stale
// challenges. waitlist_posts still 24h-TTL'd client-side on /spar, so
// stale invites only appear in the bell, not in the marketplace UI.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const FORMAT_LABELS = {
  any:      'open',
  quick:    'Quick Clash',
  apda:     'APDA',
  bp:       'BP',
  worlds:   'Worlds',
  asian:    'Asian Parli',
  ld:       'LD',
  pf:       'PF',
  policy:   'Policy',
  congress: 'Congress',
  mun:      'MUN',
};
function fmtLabel(f){
  const k = String(f || '').toLowerCase();
  return FORMAT_LABELS[k] || (k ? k.toUpperCase() : 'open');
}
function firstName(s){
  const t = String(s || '').trim();
  if (!t) return 'A debater';
  // Split on the first whitespace; trim trailing punctuation. Caps
  // at 24 chars so a runaway display name can't blow up the row.
  return t.split(/\s+/)[0].replace(/[^\wÀ-ɏ-]/g, '').slice(0, 24) || 'A debater';
}
function motionPreview(s){
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > 90 ? t.slice(0, 87) + '…' : t;
}
function tsToMs(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  if (typeof ts === 'number') return ts;
  return 0;
}

function emptyPayload(error){
  const out = { at: new Date().toISOString(), items: [] };
  if (error) out.error = String(error).slice(0, 400);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) {
    console.error('recent-activity getDb failed:', err.message);
    return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request);
  }

  const items = [];
  const now = Date.now();

  // ── 1. live_challenges (posted open debates) ───────────────────
  // Doc shape from /live.html publishChallenge():
  //   { motion, side, format, handle, posterUid, posterName,
  //     posterPhoto, scheduledAt?, createdAt }
  try {
    const snap = await db.collection('live_challenges')
      .orderBy('createdAt', 'desc')
      .limit(PER_SOURCE_LIMIT)
      .get();
    snap.forEach(d => {
      const data = d.data() || {};
      const when = tsToMs(data.createdAt);
      if (!when || (now - when) > MAX_AGE_MS) return;
      const fmt = fmtLabel(data.format);
      items.push({
        kind:   'challenge',
        name:   firstName(data.posterName || data.handle),
        photo:  '',  // explicit drop: photos can be cached avatars that 404 / leak refs
        format: String(data.format || '').toLowerCase(),
        label:  'posted a ' + fmt + ' challenge',
        motion: motionPreview(data.motion),
        href:   '/live#challenge-' + encodeURIComponent(d.id),
        when:   when,
      });
    });
  } catch (err) {
    console.warn('recent-activity live_challenges read failed:', err.message);
  }

  // ── 2. waitlist_posts (open invites on /spar) ──────────────────
  // Doc shape from /spar.html post composer:
  //   { uid, displayName, photoURL, format, note, createdAt }
  try {
    const snap = await db.collection('waitlist_posts')
      .orderBy('createdAt', 'desc')
      .limit(PER_SOURCE_LIMIT)
      .get();
    snap.forEach(d => {
      const data = d.data() || {};
      const when = tsToMs(data.createdAt);
      if (!when || (now - when) > MAX_AGE_MS) return;
      const fmt = fmtLabel(data.format);
      items.push({
        kind:   'waitlist',
        name:   firstName(data.displayName),
        photo:  '',
        format: String(data.format || '').toLowerCase(),
        label:  'is open to a ' + fmt + ' round',
        motion: motionPreview(data.note),
        href:   '/spar',
        when:   when,
      });
    });
  } catch (err) {
    console.warn('recent-activity waitlist_posts read failed:', err.message);
  }

  // Merge + sort desc + truncate.
  items.sort((a, b) => b.when - a.when);
  const out = {
    at:    new Date().toISOString(),
    items: items.slice(0, MAX_ITEMS),
  };
  await setCachedShared(CACHE_KEY, out, CACHE_TTL);
  return jsonResponse(out, 200, request);
};

export const config = { path: '/api/recent-activity' };
