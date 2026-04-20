import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Team-to-team direct messaging with OpenAI Moderation on every send.
//
// Storage model: one flat `team_messages` collection. Each message has a
// deterministic `threadId` built from the two team IDs sorted + joined
// with '|' so a pair of teams always share the same thread regardless of
// who DMs first. Participants can query messages with
//   where('threadId', '==', ...) order by createdAt desc
// Which is a single Firestore index.
//
// Moderation: every outgoing text is checked by /v1/moderations before
// the write. If flagged for any category, the message is rejected with
// a structured error — we never write flagged content to Firestore.
// Additionally keep a last-resort wordlist fallback in case the OpenAI
// call fails (we don't want moderation outages to silently let abuse
// through; we'd rather reject everything until it's healthy).

const BAD_WORDS = [
  // Short, non-exhaustive list — just enough to catch obvious slurs if
  // the moderation API is down. The real signal is OpenAI's response.
  'retard', 'faggot', 'tranny', 'nigger', 'chink', 'spic', 'kike',
];

const MAX_LEN = 2000;
const MAX_PER_MIN = 10; // per team, anti-spam
const rateMap = new Map();

function rateLimit(teamId) {
  const now = Date.now();
  const e = rateMap.get(teamId);
  if (!e || now - e.start > 60_000) {
    rateMap.set(teamId, { start: now, count: 1 });
    return true;
  }
  e.count += 1;
  return e.count <= MAX_PER_MIN;
}

function containsBadWord(text) {
  const lower = (text || '').toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}

function threadIdOf(a, b) {
  return [a, b].sort().join('|');
}

// Call OpenAI moderation. Returns { flagged: bool, categories?: [] }
// Fails closed — if the API errors, treat as flagged so we don't leak abuse.
async function moderate(text) {
  const key = process.env.OPENAI_API_KEY;
  // No API key set — fall back to bad-word check. Don't block the whole
  // messaging feature in dev environments without OpenAI configured.
  if (!key) return { flagged: containsBadWord(text), source: 'wordlist' };

  try {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'text-moderation-latest', input: text.slice(0, 4000) }),
    });
    if (!r.ok) return { flagged: true, source: 'api_error', err: r.status };
    const data = await r.json();
    const result = data.results && data.results[0];
    if (!result) return { flagged: true, source: 'empty_response' };
    const flaggedCats = Object.entries(result.categories || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    return {
      flagged: !!result.flagged || containsBadWord(text),
      categories: flaggedCats,
      source: result.flagged ? 'openai' : (containsBadWord(text) ? 'wordlist' : 'clean'),
    };
  } catch {
    return { flagged: containsBadWord(text), source: 'wordlist_fallback' };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to message teams', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed. Please sign in again.', 401, request); }

  const callerUid = decoded.sub;
  const myTeam = await getUserTeam(callerUid);
  if (!myTeam) return errorResponse('You need a team to message other teams.', 404, request);

  const db = getDb();

  // ── GET: list a thread's messages ──────────────────────────────────
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const withTeam = url.searchParams.get('with');
    if (!withTeam) return errorResponse('Missing ?with=<teamId>', 400, request);

    const threadId = threadIdOf(myTeam.team.id, withTeam);
    try {
      const snap = await db.collection('team_messages')
        .where('threadId', '==', threadId)
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get();
      const messages = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          fromTeamId: data.fromTeamId,
          fromUid: data.fromUid,
          fromName: data.fromName,
          text: data.text,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      });
      return jsonResponse({ messages, threadId }, 200, request);
    } catch (err) {
      console.error('team-messages GET error:', err.message);
      return errorResponse('Could not load messages', 500, request);
    }
  }

  // ── POST: send a new message ───────────────────────────────────────
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  if (!rateLimit(myTeam.team.id)) {
    return errorResponse('Slow down — too many messages in a short window.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }

  const toTeamId = (body.toTeamId || '').trim();
  const text = (body.text || '').trim();
  if (!toTeamId) return errorResponse('Missing toTeamId', 400, request);
  if (!text) return errorResponse('Message cannot be empty', 400, request);
  if (text.length > MAX_LEN) return errorResponse('Message too long (' + MAX_LEN + ' chars max)', 400, request);
  if (toTeamId === myTeam.team.id) return errorResponse('Cannot message your own team', 400, request);

  // Moderation — runs before any write so flagged content never touches
  // Firestore. If the moderation service is down, we fail closed.
  const modResult = await moderate(text);
  if (modResult.flagged) {
    console.warn('[team-messages] blocked flagged message from', callerUid, 'categories:', modResult.categories);
    return errorResponse(
      'Message blocked: our moderation system flagged this as potentially ' +
      'offensive or abusive. Rephrase and try again.',
      422,
      request,
    );
  }

  // Verify the destination team exists (basic integrity check).
  const toTeamDoc = await db.collection('teams').doc(toTeamId).get();
  if (!toTeamDoc.exists) return errorResponse('Team not found', 404, request);

  const threadId = threadIdOf(myTeam.team.id, toTeamId);
  try {
    const fromName = (decoded.name || decoded.email || 'Anonymous').slice(0, 80);
    const ref = await db.collection('team_messages').add({
      threadId,
      fromTeamId: myTeam.team.id,
      toTeamId,
      fromUid: callerUid,
      fromName,
      text: text.slice(0, MAX_LEN),
      moderationSource: modResult.source || 'unknown',
      createdAt: FieldValue.serverTimestamp(),
    });

    // Denormalize the last message onto a thread-summary doc so the inbox
    // view can list threads without scanning every message. Upsert by
    // threadId so both teams see the same preview.
    await db.collection('team_threads').doc(threadId).set({
      threadId,
      participantTeamIds: threadId.split('|'),
      lastMessage: text.slice(0, 140),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastFromTeamId: myTeam.team.id,
    }, { merge: true });

    return jsonResponse({ ok: true, id: ref.id, threadId }, 200, request);
  } catch (err) {
    console.error('team-messages POST error:', err.message);
    return errorResponse('Could not send message', 500, request);
  }
};

export const config = {
  path: '/api/teams/messages',
};
