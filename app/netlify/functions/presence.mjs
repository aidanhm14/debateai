import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// "Was here" presence board for the landing page. Honest social proof:
// each visitor can press once (deduped by a client-generated id), which
// records a debater codename + timestamp and bumps a real counter. GET
// returns the live total + the most recent presses. No fabricated numbers.
//
// Writes go through the admin SDK (getDb bypasses Firestore rules), so the
// `presence` collection needs no client-facing rules. Deduped per clientId;
// rate-limited per IP so a bot can't spray the counter.

const MAX_TITLE = 48;
const RECENT_N = 10;

// ── per-IP rate limit (anti-spray) ──────────────────────────────────
const ipHits = new Map();
const IP_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
function rateLimited(ip) {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.windowStart > WINDOW_MS) { ipHits.set(ip, { count: 1, windowStart: now }); return false; }
  e.count += 1;
  return e.count > IP_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipHits) if (now - v.windowStart > WINDOW_MS * 2) ipHits.delete(k);
}, 10 * 60 * 1000);

function clientId(s) {
  // accept only our generated ids: alnum + dashes, bounded length
  if (!s || typeof s !== 'string') return '';
  const v = s.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(v)) return '';
  return v;
}

async function readBoard(db) {
  const [meta, recentSnap] = await Promise.all([
    db.collection('presence_meta').doc('counter').get(),
    db.collection('presence').orderBy('ts', 'desc').limit(RECENT_N).get(),
  ]);
  const total = (meta.exists && meta.data().n) || 0;
  const recent = recentSnap.docs.map((d) => {
    const x = d.data();
    return { title: x.title || 'A debater', ts: x.ts ? x.ts.toMillis() : null };
  });
  return { total, recent };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const db = getDb();

  if (request.method === 'GET') {
    try { return jsonResponse(await readBoard(db), 200, request); }
    catch (err) { console.error('presence GET error:', err.message); return errorResponse('Failed to load', 500, request); }
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const cid = clientId(body.clientId);
  if (!cid) return errorResponse('Valid clientId required', 400, request);
  const title = String(body.title || 'A debater').trim().slice(0, MAX_TITLE) || 'A debater';

  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';
  if (rateLimited(ip)) return errorResponse('Too many presses, slow down', 429, request);

  try {
    const ref = db.collection('presence').doc(cid);
    const existing = await ref.get();
    if (existing.exists) {
      // already pressed on this device — return the board, don't double-count
      const board = await readBoard(db);
      return jsonResponse({ ok: true, alreadyHere: true, title: existing.data().title || title, ...board }, 200, request);
    }
    await ref.set({ title, ts: FieldValue.serverTimestamp(), ip, ua: String(body.ua || '').slice(0, 200) });
    await db.collection('presence_meta').doc('counter').set({ n: FieldValue.increment(1) }, { merge: true });
    const board = await readBoard(db);
    return jsonResponse({ ok: true, alreadyHere: false, title, ...board }, 200, request);
  } catch (err) {
    console.error('presence POST error:', err.message);
    return errorResponse('Failed to record', 500, request);
  }
};

export const config = {
  path: '/api/presence',
};
