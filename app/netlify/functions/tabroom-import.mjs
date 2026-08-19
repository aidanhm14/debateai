// /api/tabroom-import — pull a competitor's record for one tournament
// off Tabroom and store it on their Debatable profile.
//
//   POST { url }  → { ok: true, tabroom: {...} }   (Firebase bearer token)
//
// AUTH IS REQUIRED AND MUST BE A NAMED ACCOUNT. Anonymous Firebase
// accounts are free and unlimited to mint, and this endpoint spends a
// real outbound fetch plus a profile write per call. Same guard as
// brain.mjs and tournament-dropin.mjs.
//
// ── Why this reads Tabroom's JSON API, never the pasted page ─────────
//
// Tabroom login-walled its results HTML in 2026 ("Because of the
// prevalance of ineffecient AI spiders ... you must now log in to
// access that area" on /index/tourn/results/*, and "Please login to
// view results data" on entry_record.mhtml — both verified live
// 2026-08-19). An anonymous server-side fetch of any results PAGE gets
// the login wall, full stop. What is still public, and is Tabroom's own
// sanctioned bulk surface (the outreach tooling has used it for
// months), is the per-tournament JSON export:
//
//   https://www.tabroom.com/api/download_data.mhtml?tourn_id=N
//
// So the pasted URL is used for exactly two things: proving the link
// is really tabroom.com, and carrying tourn_id / entry_id in its query
// string. The only URL this function ever FETCHES is the API URL it
// builds itself from a parsed positive integer, on a fixed host and
// path, with redirects refused outright. User input never chooses a
// host, a path, or a scheme, which is the whole SSRF surface closed
// rather than filtered.
//
// One import = one tournament (the public API is per-tournament, and a
// competitor's cross-tournament history page is exactly what got login
// walled). Imports MERGE into user_profiles/{uid}.tabroom.entries keyed
// by (tournId, entryId): re-importing the same tournament replaces that
// row, different tournaments accumulate, capped at MAX_ENTRIES.
//
// Writes go through the ADMIN SDK, so no firestore.rules change:
// user_profiles is already owner-read (rule at "match /user_profiles"),
// which is how /profile renders the record client-side.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';

const TABROOM_HOSTS = new Set(['tabroom.com', 'www.tabroom.com']);
const TABROOM_API = 'https://www.tabroom.com/api/download_data.mhtml?tourn_id=';

const MAX_ENTRIES = 50;        // stored rows on the profile
const MAX_RESULT_LINES = 4;    // placements kept per tournament row
const MAX_BODY_BYTES = 30 * 1024 * 1024; // biggest observed export ~10MB
const FETCH_TIMEOUT_MS = 20000;          // inside Netlify's ~26s budget

const S = (v, cap) => String(v == null ? '' : v).trim().slice(0, cap);

// ── URL validation ───────────────────────────────────────────────────
// The pasted link must be a real https tabroom.com URL. We read ids out
// of its query string and throw the rest away.
export function parseTabroomUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); }
  catch { return { error: 'That does not look like a link. Paste a full tabroom.com URL.' }; }
  if (u.protocol !== 'https:') {
    return { error: 'Paste an https tabroom.com link.' };
  }
  if (!TABROOM_HOSTS.has(u.hostname.toLowerCase())) {
    return { error: 'Only tabroom.com links can be imported.' };
  }
  const id = (name) => {
    const n = parseInt(u.searchParams.get(name) || '', 10);
    return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
  };
  return {
    tournId: id('tourn_id'),
    entryId: id('entry_id'),
    studentId: id('student_id'),
  };
}

// ── Record extraction from the download_data payload ─────────────────
// Shapes verified against a real export (tourn 34000, entry 6125022):
//   schools[].entries[] → { id, name, event, students[{first,last}] }
//   categories[].events[] → { id, name, abbr, type,
//     rounds[{ name, type, sections[{ ballots[{ entry, scores[{tag,value}] }] }] }],
//     result_sets[{ label, published, results[{ entry, rank, place }] }] }
function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractRecord(data, { entryId, matchName }) {
  const schools = Array.isArray(data?.schools) ? data.schools : [];

  // Find the entry: by id when the link carried one, else by matching
  // the caller's account name against the entry's student names. The
  // name match is a convenience, not a security boundary: this is the
  // caller's own public record and they choose what lands on their
  // profile.
  let entry = null;
  let school = null;
  const nameWanted = normName(matchName);
  const nameMatches = [];
  for (const sch of schools) {
    // entry.students is an array of student-id STRINGS; the name
    // objects live at school.students. Map ids to names once per
    // school, and tolerate the object form in case an export inlines
    // them.
    const roster = new Map();
    for (const st of (Array.isArray(sch?.students) ? sch.students : [])) {
      roster.set(String(st?.id), `${st?.first || ''} ${st?.last || ''}`);
    }
    for (const e of (Array.isArray(sch?.entries) ? sch.entries : [])) {
      const eid = parseInt(e?.id, 10);
      if (entryId && eid === entryId) { entry = e; school = sch; break; }
      if (!entryId && nameWanted) {
        const students = Array.isArray(e?.students) ? e.students : [];
        const hit = students.some(st => {
          const full = (st && typeof st === 'object')
            ? `${st.first || ''} ${st.last || ''}`
            : (roster.get(String(st)) || '');
          return normName(full) === nameWanted;
        });
        if (hit) nameMatches.push({ e, sch });
      }
    }
    if (entry) break;
  }
  if (!entry && !entryId && nameMatches.length === 1) {
    entry = nameMatches[0].e;
    school = nameMatches[0].sch;
  }
  if (!entry) {
    return {
      error: entryId
        ? 'That entry was not found in this tournament\'s public data. Check the link and try again.'
        : (nameMatches.length > 1
          ? 'More than one entry at this tournament matches your name. Paste the link to your own entry page instead.'
          : 'Could not find your entry at this tournament. Paste a Tabroom link that includes your entry (open your results for the tournament and copy that page\'s link).'),
    };
  }

  const foundEntryId = parseInt(entry.id, 10);
  const eventId = parseInt(entry.event, 10);

  // Event, ballots, and published placements for this entry.
  let eventName = '';
  let prelimW = 0, prelimL = 0, elimW = 0, elimL = 0, sawWinloss = false;
  const results = [];
  const cats = Array.isArray(data?.categories) ? data.categories : [];
  for (const cat of cats) {
    for (const ev of (Array.isArray(cat?.events) ? cat.events : [])) {
      const isOurs = parseInt(ev?.id, 10) === eventId;
      // Ballots can only belong to the entry's own event, but scan by
      // entry id rather than trusting the event pointer, so a payload
      // quirk drops data instead of misfiling it.
      for (const round of (Array.isArray(ev?.rounds) ? ev.rounds : [])) {
        // One round = many ballots (panels). Majority of winloss values
        // decides the round; a round with no winloss scores (speech
        // events, unballoted rounds) contributes nothing.
        let w = 0, l = 0;
        for (const sec of (Array.isArray(round?.sections) ? round.sections : [])) {
          for (const b of (Array.isArray(sec?.ballots) ? sec.ballots : [])) {
            if (parseInt(b?.entry, 10) !== foundEntryId) continue;
            for (const sc of (Array.isArray(b?.scores) ? b.scores : [])) {
              if (sc?.tag !== 'winloss') continue;
              sawWinloss = true;
              if (Number(sc.value) === 1) w++; else l++;
            }
          }
        }
        if (w === l && w === 0) continue;
        const won = w > l;
        if (String(round?.type || '') === 'elim') { won ? elimW++ : elimL++; }
        else { won ? prelimW++ : prelimL++; }
      }
      if (isOurs) eventName = S(ev?.name || ev?.abbr, 80);
      for (const rs of (Array.isArray(ev?.result_sets) ? ev.result_sets : [])) {
        for (const res of (Array.isArray(rs?.results) ? rs.results : [])) {
          if (parseInt(res?.entry, 10) !== foundEntryId) continue;
          const label = S(rs?.label, 40);
          // Prefer a numeric place; Tabroom uses strings like 'Prelim'
          // for non-breaking entries, where the rank is the real number.
          const placeRaw = res?.place != null ? String(res.place).trim() : '';
          const rankRaw = res?.rank != null ? String(res.rank).trim() : '';
          const spot = /^\d/.test(placeRaw) ? placeRaw : (rankRaw || placeRaw);
          if (!label || !spot || results.length >= MAX_RESULT_LINES) continue;
          const line = S(`${label}: ${spot}`, 90);
          if (!results.includes(line)) results.push(line);
        }
      }
    }
  }

  const recordParts = [];
  if (sawWinloss) {
    recordParts.push(`Prelims ${prelimW}-${prelimL}`);
    if (elimW + elimL > 0) recordParts.push(`Elims ${elimW}-${elimL}`);
  }

  const startISO = S(data?.start, 10); // 'YYYY-MM-DD hh:mm:ss' → date part
  return {
    entry: {
      tournId: parseInt(data?.id, 10) || 0,
      entryId: foundEntryId,
      tourn: S(data?.name, 120),
      date: startISO,
      year: startISO.slice(0, 4),
      event: eventName,
      record: recordParts.join(' · '),
      results,
    },
    name: S(entry?.name, 80),
    school: S(school?.name, 80),
  };
}

// ── Handler ──────────────────────────────────────────────────────────
function isNamed(payload) {
  const p = payload && payload.firebase && payload.firebase.sign_in_provider;
  return !!p && p !== 'anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let payload;
  try {
    payload = await verifyIdToken(extractBearerToken(request));
  } catch {
    return errorResponse('Sign in to import your Tabroom record.', 401, request);
  }
  if (!isNamed(payload)) {
    return errorResponse('Create an account to import your Tabroom record.', 403, request);
  }
  const uid = payload.sub;

  // Each import is an outbound fetch of a payload that can run to
  // megabytes plus a profile write; 6/hour is plenty for a person
  // building out their record and nothing for a loop.
  const limited = await checkLayers('tabroom', uid, [
    { window: 60 * 60 * 1000, max: 6, label: 'hour' },
    { window: 24 * 60 * 60 * 1000, max: 20, label: 'day' },
  ]);
  if (!limited.ok) {
    return errorResponse('Import limit reached. Try again in a bit.', 429, request);
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Bad request', 400, request); }

  const parsed = parseTabroomUrl(body?.url);
  if (parsed.error) return errorResponse(parsed.error, 400, request);
  if (!parsed.tournId) {
    return errorResponse(
      parsed.studentId
        ? 'Student pages sit behind Tabroom login. Paste a link from one tournament instead (your entry page, or any page for that tournament).'
        : 'That link does not name a tournament. Paste a tabroom.com link that includes tourn_id in it.',
      400, request,
    );
  }

  // The ONLY outbound fetch: our own fixed API URL with a parsed
  // integer. Redirects are refused; a redirect here means Tabroom
  // changed shape and we want to fail loudly, never follow.
  let text;
  try {
    const resp = await fetch(TABROOM_API + parsed.tournId, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Debatable/1.0 (profile import; itsdebatable.com)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  } catch (err) {
    console.warn('[tabroom-import] fetch failed:', err?.message);
    return errorResponse('Could not reach Tabroom right now. Try again in a minute.', 502, request);
  }
  if (text.length > MAX_BODY_BYTES) {
    return errorResponse('That tournament\'s data is too large to import.', 413, request);
  }

  let data;
  try { data = JSON.parse(text); }
  catch { return errorResponse('Tabroom did not return readable data for that tournament.', 502, request); }

  const extracted = extractRecord(data, {
    entryId: parsed.entryId,
    matchName: payload.name || '',
  });
  if (extracted.error) return errorResponse(extracted.error, 422, request);

  // Merge into the stored record: same tournament + entry replaces its
  // old row, everything else keeps its place, newest first, capped.
  const db = getDb();
  const ref = db.collection('user_profiles').doc(uid);
  let tabroom;
  try {
    const snap = await ref.get();
    const prev = (snap.exists && snap.data()?.tabroom) || {};
    const kept = (Array.isArray(prev.entries) ? prev.entries : []).filter(e =>
      !(e && e.tournId === extracted.entry.tournId && e.entryId === extracted.entry.entryId));
    const entries = [extracted.entry, ...kept]
      .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
      .slice(0, MAX_ENTRIES);
    tabroom = {
      url: S(body.url, 300),
      importedAt: new Date().toISOString(),
      name: extracted.name || S(prev.name, 80),
      school: extracted.school || S(prev.school, 80),
      entries,
    };
    await ref.set({ tabroom }, { merge: true });
  } catch (err) {
    console.warn('[tabroom-import] write failed:', err?.message);
    return errorResponse('Could not save right now.', 503, request);
  }

  return jsonResponse({ ok: true, tabroom }, 200, request);
};

export const config = { path: '/api/tabroom-import' };
