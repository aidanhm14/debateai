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
const IDENTITY_STR = (v) => (typeof v === 'string' && v.length <= 24 ? v : undefined);
const IDENTITY_NUM = (v) => (typeof v === 'number' && v >= 0 && v < 64 ? v : undefined);
function safeIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  if (!value.kind) {
    if (value.pref === 'photo' && Number.isSafeInteger(value.photoVersion) && value.photoVersion > 0) {
      return { kind: 'photo', v: value.photoVersion };
    }
    if (value.pref === 'pfp' && value.pfpId) return safeIdentity({ kind:'pfp', id:value.pfpId });
    if (value.pref === 'portrait' && value.portraitConfig) return safeIdentity({ kind:'portrait', config:value.portraitConfig });
    if (Number.isSafeInteger(value.photoVersion) && value.photoVersion > 0) return { kind:'photo', v:value.photoVersion };
    if (value.portraitConfig) return safeIdentity({ kind:'portrait', config:value.portraitConfig });
    if (value.pfpId) return safeIdentity({ kind:'pfp', id:value.pfpId });
  }
  if (value.kind === 'photo' && Number.isSafeInteger(value.v) && value.v > 0) {
    return { kind: 'photo', v: value.v };
  }
  if (value.kind === 'live' && value.design && typeof value.design === 'object') {
    const d = value.design;
    return { kind: 'live', design: {
      style: IDENTITY_STR(d.style), scene: IDENTITY_STR(d.scene), accent: IDENTITY_STR(d.accent),
      outfit: IDENTITY_STR(d.outfit), mask: IDENTITY_STR(d.mask), eyes: IDENTITY_STR(d.eyes),
    } };
  }
  // A picked tile from the drawn set (js/pfp-set.js). Shape-checked here,
  // membership-checked on the client: the set is a client asset, and
  // DBAvatar returns null for an id it does not carry, so the row falls
  // back to its stand-in rather than rendering an empty tile.
  if (value.kind === 'pfp' && typeof value.id === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(value.id)) {
    return { kind: 'pfp', id: value.id };
  }
  if (value.kind === 'portrait' && value.config && typeof value.config === 'object') {
    const c = value.config, out = {};
    for (const k of ['face','skin','hair','top','eyes','brows','mouth','facial','glasses','accessory','iris','detail','bg','outfit']) {
      const n = IDENTITY_NUM(c[k]);
      if (n !== undefined) out[k] = n;
    }
    return Object.keys(out).length ? { kind: 'portrait', config: out } : null;
  }
  return null;
}

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
