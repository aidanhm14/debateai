/* find-users.mjs  ·  GET /api/find-users?q=<text>
 *
 * 2026-09-01, the founder: "have a find users feature and it goes to
 * profiles on leaderboard or those signed up so ppl can make connections
 * on the app". The people directory behind the Find people box on
 * /friends.
 *
 * WHO IS FINDABLE, and why it is exactly these two sets:
 *   1. public_profiles that are not `visibility:'private'`. The client
 *      cannot list that collection (rules: `allow list: if false`), which
 *      is what stops scraping, so the search runs here with the admin SDK
 *      and honours the same visibility flag the profile page honours.
 *   2. Anyone with a real leaderboard_entries row (not a seed). Those
 *      names are already public on /leaderboard, so listing them here
 *      reveals nothing new.
 *   NOT user_profiles.displayName: a public name is ALWAYS the alias,
 *   never the account name (AGENTS.md), and this endpoint must not be
 *   the place that rule breaks.
 *
 * Named accounts only, because the results carry Add friend and the
 * friend graph is named-only. Empty q returns the recent leaderboard
 * people, so the box has something to browse before anyone types.
 */

import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

const MAX_RESULTS = 20;
const PROFILE_SCAN = 1500;
const BOARD_SCAN = 600;
const BROWSE_CACHE_KEY = 'find-users-browse-v1';
const BROWSE_TTL_MS = 60 * 1000;

function clean(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function safePhoto(u) {
  const s = String(u || '');
  return /^https:\/\/lh\d\.googleusercontent\.com\//.test(s) ? s.slice(0, 400) : null;
}
function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }

// The Anonymous alias (and the generic fallbacks) name nobody: a row
// wearing one cannot be found, friended or messaged as a person.
function anonName(name) { return /^(anonymous|a debater|guest|someone)$/i.test(String(name || '').trim()); }

function matches(row, q) {
  if (!q) return true;
  const hay = norm(row.name + ' ' + (row.handle || ''));
  return hay.indexOf(q) >= 0;
}

async function loadPeople(db) {
  const byUid = new Map();
  // 1. Public profiles.
  try {
    const snap = await withDeadline(db.collection('public_profiles').limit(PROFILE_SCAN).get(), 3500);
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.visibility === 'private') return;
      const name = clean(d.name, 60);
      if (!name || anonName(name)) return;
      byUid.set(doc.id, {
        uid: doc.id,
        name,
        handle: clean(d.handle, 40).toLowerCase() || null,
        photo: safePhoto(d.photo),
        bio: clean(d.bio, 120),
        source: 'profile',
      });
    });
  } catch (e) { console.warn('[find-users] profiles read failed', e && e.message); }
  // 2. People on the board (real rows only), most recent first.
  try {
    const snap = await withDeadline(db.collection('leaderboard_entries')
      .orderBy('completedAt', 'desc').limit(BOARD_SCAN).get(), 3500);
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.seed === true) return;
      const uid = typeof d.uid === 'string' && d.uid.length >= 8 ? d.uid : null;
      if (!uid) return;
      const name = clean(d.displayName, 40);
      if (!name || anonName(name)) return;
      const have = byUid.get(uid);
      if (have) { have.onBoard = true; if (!have.photo) have.photo = safePhoto(d.photoURL); return; }
      byUid.set(uid, { uid, name, handle: null, photo: safePhoto(d.photoURL), bio: '', source: 'board', onBoard: true });
    });
  } catch (e) { console.warn('[find-users] board read failed', e && e.message); }
  return Array.from(byUid.values());
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  // Named accounts only: the results carry friend actions, and the friend
  // graph is named-only. An anonymous uid is free to mint, so it is not a
  // door into a people directory.
  let decoded = null;
  try {
    const tok = extractBearerToken(request);
    if (tok) decoded = await verifyIdToken(tok);
  } catch { decoded = null; }
  if (!decoded || !isNamedAccount(decoded)) {
    return jsonResponse({ error: 'SIGN_IN_REQUIRED', message: 'Sign in to find people.' }, 401, request);
  }
  const rl = await checkLayers('findusers', 'uid_' + decoded.sub, [
    { window: 60_000, max: 30, label: 'min' },
    { window: 3_600_000, max: 300, label: 'hour' },
  ]);
  if (!rl.ok) return jsonResponse({ error: 'RATE_LIMITED', message: 'Slow down a little.' }, 429, request);

  const url = new URL(request.url);
  const q = norm(clean(url.searchParams.get('q'), 40));
  const me = decoded.sub;

  let db;
  try { db = getDb(); } catch (e) { return jsonResponse({ people: [], q }, 200, request); }

  // Browse mode (no query) is one shared list for everyone; cache it.
  let people = null;
  if (!q) {
    const cached = await getCachedShared(BROWSE_CACHE_KEY);
    if (cached && Array.isArray(cached.people)) people = cached.people;
  }
  if (!people) {
    people = await loadPeople(db);
    if (!q) await setCachedShared(BROWSE_CACHE_KEY, { people }, BROWSE_TTL_MS).catch(() => {});
  }

  const out = people
    .filter((p) => p.uid !== me && matches(p, q))
    .sort((a, b) => {
      // Prefix matches first, then people on the board, then profiles.
      if (q) {
        const ap = norm(a.name).startsWith(q) ? 0 : 1;
        const bp = norm(b.name).startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      if (!!a.onBoard !== !!b.onBoard) return a.onBoard ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_RESULTS);

  return jsonResponse({ q, people: out, total: out.length }, 200, request);
};

export const config = { path: '/api/find-users' };
