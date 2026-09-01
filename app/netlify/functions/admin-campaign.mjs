// /api/admin/campaign?campaign=search-sep&days=14
//
// One paid campaign, judged on ROUNDS, never on clicks.
//
// Built for the 2026-09 Google Search test ($150 over 7 days, landing on
// /debate-online, UTM `search-sep`, pass bar = 5 rounds started). The
// question the founder will ask every morning of that week is "how many
// rounds did the ads produce", and Google Ads can only answer "how many
// clicks", which is the number this endpoint exists to refuse to be
// judged on.
//
// How attribution works, and where it stops:
//   js/track.js stashes utm_source / utm_campaign ONCE per tab session
//   (sessionStorage) and rides both on EVERY event that session sends,
//   so a queue join on /spar or a speech start on /live-round three pages
//   after the ad click still carries `metadata.utm_campaign`. That is the
//   primary join: one equality query, no per-session reconstruction.
//   Verified live 2026-09-01: a tagged /debate-online visit wrote ten
//   rows to `events`, every one carrying the campaign, and the stash
//   survived the click into /spar.
//
//   The stash is per TAB. Someone who signs in, closes the tab, and comes
//   back tomorrow in a fresh tab has no UTM any more, but they still have
//   the same durable anon device id (`_da_aid`) or, once signed in, the
//   same uid. So the second pass pulls the window's round starts through
//   the existing (metadata.name, createdAt) and (event, createdAt)
//   indexes and keeps any whose uid was seen on a campaign row. Those are
//   reported separately as `via: 'device'` so the two are never mixed
//   without saying so.
//
//   What it cannot see: a person who arrives on the ad in Safari with
//   storage blocked (per-tab uid, no device id) and returns later. That
//   is an undercount, which is the honest direction for a pass/fail
//   number that decides whether more money is spent.
//
// A "round started" is one of three things, and the report keeps them
// apart because they are not worth the same:
//   human   live_round_start     a speech clock actually started in a
//                                room with another person (the product)
//   voice   voice_session_start  a Realtime voice round connected
//   typed   battle_started       the server-logged /practice start
//           (round_start is the gtag mirror of the same moment; the two
//           are collapsed per session-minute so one round is one round)
//
// Read cost: one equality query capped at CAMPAIGN_CAP rows plus three
// indexed range queries capped at START_CAP each, behind the shared admin
// cache at a short TTL because the whole point is checking it daily.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, wantsFresh } from './lib/admin-cache.mjs';

const DEFAULT_CAMPAIGN = 'search-sep';
const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const CAMPAIGN_CAP = 6000;
const START_CAP = 1500;
const RECENT_CAP = 60;
const TTL_MS = 5 * 60 * 1000;

// Pass bar is data, not code: ?bar=5 overrides for a future campaign.
const DEFAULT_PASS_BAR = 5;

export const START_EVENTS = {
  live_round_start: 'human',
  voice_session_start: 'voice',
  battle_started: 'typed',
  round_start: 'typed',
};
export const COMPLETE_EVENTS = {
  live_round_ballot: 'human',
  voice_rfd_handoff: 'voice',
  round_complete: 'typed',
};

function eventName(d) {
  if (d.event === 'app_event') return String((d.metadata && d.metadata.name) || '');
  return String(d.event || '');
}
function tsMs(d) {
  const c = d.createdAt;
  if (!c) return 0;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c === 'number') return c;
  const t = Date.parse(c);
  return Number.isFinite(t) ? t : 0;
}
function bump(map, key) { if (key) map[key] = (map[key] || 0) + 1; }

// Pure. `rows` are plain {uid, event, anon, metadata, createdAt} objects
// carrying the campaign; `extraStarts` are round-start rows from the
// window scan (may overlap rows; deduped by id).
export function summarizeCampaign(rows, extraStarts, opts = {}) {
  const sinceMs = opts.sinceMs || 0;
  const passBar = opts.passBar || DEFAULT_PASS_BAR;

  const sessions = new Set();
  const uids = new Set();
  const signedInUids = new Set();
  const engagedSessions = new Set();
  const sparSessions = new Set();
  const pageViews = { total: 0, byPath: {} };
  const events = {};
  const contentSplit = {};
  const seenIds = new Set();
  const startKeys = new Set();
  const starts = [];
  const completes = [];
  let firstMs = 0;
  let lastMs = 0;

  function noteStart(d, via, id) {
    const name = eventName(d);
    const kind = START_EVENTS[name];
    if (!kind) return;
    const t = tsMs(d);
    const m = d.metadata || {};
    // battle_started and round_start describe the same /practice moment;
    // one session cannot start two typed rounds in the same minute.
    const key = kind === 'typed'
      ? 'typed:' + (m.session_id || d.uid) + ':' + Math.floor(t / 60000)
      : name + ':' + (m.session_id || d.uid) + ':' + Math.floor(t / 1000);
    if (startKeys.has(key)) return;
    startKeys.add(key);
    starts.push({
      id,
      kind,
      event: name,
      ts: t ? new Date(t).toISOString() : null,
      uid: d.uid ? String(d.uid).slice(0, 12) : '',
      anon: Boolean(d.anon),
      format: m.format ? String(m.format).slice(0, 40) : '',
      path: m.path ? String(m.path).slice(0, 80) : '',
      via,
    });
  }

  for (const row of rows) {
    const d = row.data || row;
    const id = row.id || '';
    const t = tsMs(d);
    if (sinceMs && t && t < sinceMs) continue;
    if (id) seenIds.add(id);
    const m = d.metadata || {};
    const name = eventName(d);
    if (t) {
      if (!firstMs || t < firstMs) firstMs = t;
      if (t > lastMs) lastMs = t;
    }
    if (m.session_id) sessions.add(m.session_id);
    if (d.uid) {
      uids.add(d.uid);
      if (!d.anon && !String(d.uid).startsWith('anon:')) signedInUids.add(d.uid);
    }
    bump(events, name);
    if (m.utm_content) bump(contentSplit, String(m.utm_content).slice(0, 60));
    if (name === 'page_view') {
      pageViews.total += 1;
      bump(pageViews.byPath, String(m.path || '/').slice(0, 80));
      if (String(m.path || '') === '/spar' && m.session_id) sparSessions.add(m.session_id);
    }
    if (name === 'session_end' && m.engaged === true && m.session_id) engagedSessions.add(m.session_id);
    if (START_EVENTS[name]) noteStart(d, 'session', id);
    if (COMPLETE_EVENTS[name]) {
      completes.push({ kind: COMPLETE_EVENTS[name], ts: t ? new Date(t).toISOString() : null, uid: d.uid ? String(d.uid).slice(0, 12) : '' });
    }
  }

  // Second pass: starts in the window whose subject was seen on a
  // campaign row but whose own row lost the UTM (new tab, later day).
  let deviceStarts = 0;
  for (const row of extraStarts || []) {
    const d = row.data || row;
    const id = row.id || '';
    if (id && seenIds.has(id)) continue;
    const t = tsMs(d);
    if (sinceMs && t && t < sinceMs) continue;
    if (!d.uid || !uids.has(d.uid)) continue;
    const before = starts.length;
    noteStart(d, 'device', id);
    if (starts.length > before) deviceStarts += 1;
  }

  starts.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  const byKind = {};
  for (const s of starts) bump(byKind, s.kind);
  const viaSession = starts.filter((s) => s.via === 'session').length;
  const distinctStarters = new Set(starts.map((s) => s.uid)).size;

  const pick = (n) => events[n] || 0;
  return {
    passBar,
    passed: starts.length >= passBar,
    rounds: {
      started: starts.length,
      viaSession,
      viaDevice: deviceStarts,
      byKind,
      distinctStarters,
      completed: completes.length,
      recent: starts.slice(0, RECENT_CAP),
    },
    funnel: {
      sessions: sessions.size,
      subjects: uids.size,
      pageViews: pageViews.total,
      engagedSessions: engagedSessions.size,
      reachedSpar: sparSessions.size,
      sparGateViews: pick('spar_gate_view'),
      signedIn: signedInUids.size,
      signupCompleted: pick('signup_completed'),
      queueJoins: pick('spar_queue_join'),
      matched: pick('spar_match_found') + pick('spar_match_made'),
      aiFallbacks: pick('spar_ai_fallback'),
      voiceAnonGate: pick('voice_anon_gate'),
      abandoned: pick('round_abandoned'),
    },
    pageViewsByPath: pageViews.byPath,
    byContent: contentSplit,
    firstSeen: firstMs ? new Date(firstMs).toISOString() : null,
    lastSeen: lastMs ? new Date(lastMs).toISOString() : null,
    rowsScanned: rows.length,
  };
}

async function campaignRows(db, campaign, since) {
  // Preferred shape needs the composite index
  // events(metadata.utm_campaign ASC, createdAt DESC) declared in
  // app/firestore.indexes.json. Until it has built, fall back to the
  // auto single-field index: equality only, time filtered in memory.
  try {
    const snap = await db.collection('events')
      .where('metadata.utm_campaign', '==', campaign)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(CAMPAIGN_CAP)
      .get();
    return { docs: snap.docs, indexed: true };
  } catch (err) {
    console.warn('admin-campaign indexed query failed, falling back:', err.message);
    const snap = await db.collection('events')
      .where('metadata.utm_campaign', '==', campaign)
      .limit(CAMPAIGN_CAP)
      .get();
    return { docs: snap.docs, indexed: false };
  }
}

async function windowStarts(db, since) {
  const q = (field, value) => db.collection('events')
    .where(field, '==', value)
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .limit(START_CAP)
    .get()
    .then((s) => s.docs)
    .catch((err) => { console.warn('admin-campaign start scan failed', value, err.message); return []; });
  const parts = await Promise.all([
    q('metadata.name', 'live_round_start'),
    q('metadata.name', 'voice_session_start'),
    q('event', 'battle_started'),
  ]);
  return parts.flat();
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const db = gate.db;

  const url = new URL(request.url);
  const campaign = String(url.searchParams.get('campaign') || DEFAULT_CAMPAIGN).slice(0, 60).replace(/[^a-z0-9_-]/gi, '');
  if (!campaign) return errorResponse('campaign is required', 400, request);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || DEFAULT_DAYS));
  const passBar = Math.max(1, Number(url.searchParams.get('bar')) || DEFAULT_PASS_BAR);
  const cacheKey = `campaign:v1:${campaign}:${days}:${passBar}`;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [{ docs, indexed }, starts] = await Promise.all([
      campaignRows(db, campaign, since),
      windowStarts(db, since),
    ]);
    const rows = docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    const extra = starts.map((doc) => ({ id: doc.id, data: doc.data() }));
    const summary = summarizeCampaign(rows, extra, { sinceMs: since.getTime(), passBar });
    const payload = {
      campaign,
      windowDays: days,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      indexed,
      truncated: docs.length >= CAMPAIGN_CAP,
      ...summary,
    };
    await setCachedShared(cacheKey, payload, TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.error('admin-campaign failed:', err.message);
    return errorResponse('Campaign report failed: ' + err.message, 500, request);
  }
};

export const config = {
  path: '/api/admin/campaign',
};
