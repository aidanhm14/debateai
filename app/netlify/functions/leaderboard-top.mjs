// /api/leaderboard-top → GET. Public top-of-the-leaderboard teaser for the
// landing page, which deliberately doesn't ship firebase-firestore-compat
// (dropped 2026-05-26 for ~100KB gzipped).
//
// Uses the same real account ladder, placement order and lifetime XP as
// the full board. Sample score entries never fill ranked positions.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { fetchStandingsSnapshot } from './lib/standings-snapshot.mjs';
import { composeTopRows } from './lib/rating-board.mjs';

const ROWS = 8;

// A debater's own face, and nothing else. Two fields reach the landing
// band and both are things the person chose for themselves: the Google
// photo already on their account, or the avatar they built in the
// designer. Neither is a stand-in. The standing rule on a row that
// carries somebody's name and score is that a portrait must BE them or
// not be there, so anything that fails these checks resolves to null and
// the row falls back to initials.
//
// photoURL is host-pinned to Google or Debatable's own upload endpoint,
// matching the check /leaderboard applies before rendering client-side. An
// arbitrary URL here would let a stored value point the homepage at any
// host on the internet.
function safePhoto(value) {
  const raw = String(value || '');
  if (raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const google = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
    const uploaded = (host === 'itsdebatable.com' || host === 'www.itsdebatable.com')
      && url.pathname === '/api/profile-photo' && /^[A-Za-z0-9_-]{8,128}$/.test(url.searchParams.get('uid') || '');
    if (!google && !uploaded) return null;
    return url.href;
  } catch { return null; }
}

// avatarIdentity is rendered by DBAvatar.publicSvg on the client, which
// reads only these keys. Passing the stored object through whole would
// forward whatever else a client happened to write into the doc, so the
// shape is rebuilt here from an allow-list rather than filtered.
import { safeIdentity } from './lib/public-avatar.mjs';

function emptyPayload(error) {
  const out = { rows: [], total: 0, at: Date.now() };
  if (error) out.error = String(error).slice(0, 200);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  let db;
  try { db = getDb(); }
  catch (err) { return jsonResponse(emptyPayload('unavailable'), 200, request); }

  try {
    // Identical pool, order, names and XP to the full human standings.
    // A thin board stays thin: sample score rows are not ranked people.
    const { rows: ladder, at, revision } = await fetchStandingsSnapshot(db);
    const ratingRows = ladder.map((r) => ({
      ...r, kind: 'rating', score: null, rounds: r.games,
      completedAt: r.lastEventAt || null,
      photoURL: safePhoto(r.photoURL),
      avatarIdentity: safeIdentity(r.avatarIdentity),
    }));
    const rows = composeTopRows(ratingRows, [], ROWS);
    const payload = {
      rows, realRows: rows, total: ladder.length,
      placed: ladder.filter((r) => r.placed).length, at, revision,
    };
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[leaderboard-top] query failed', err && err.message);
    const payload = emptyPayload('unavailable');
    return jsonResponse(payload, 200, request);
  }
};

export const config = { path: '/api/leaderboard-top' };
