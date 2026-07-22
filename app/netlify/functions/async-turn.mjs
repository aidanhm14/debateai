// /api/async/turn — finalize an uploaded recording into a round turn.
//
// POST, auth required. Body:
//   { uploadId, partCount, mime, kind: 'video'|'audio', durationSec,
//     turn: 1|2|3,
//     motion?, format?, visibility?   (turn 1 — creates the round)
//     roundId?                        (turns 2 and 3) }
//
// Submission stays fast and dumb on purpose: media is verified and the
// round doc advances, but transcription and the ballot belong to the
// scheduled sweep (async-sweep.mjs). Netlify caps sync functions at 26s;
// whisper on a 2-minute video does not reliably fit, a cron does.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { deleteCachedShared } from './lib/admin-cache.mjs';
import {
  mediaStore, normMime, feedKeyFor, sendEmail,
  ALLOWED_MIME, MAX_PARTS, MAX_TOTAL_BYTES, MAX_OPEN_PER_USER,
  TURN_SPEC, ANSWER_WINDOW_MS, REPLY_WINDOW_MS, FORMATS, FEED_CACHE_KEY,
} from './lib/async-rounds.mjs';

const SITE = process.env.SITE_ORIGIN || 'https://itsdebatable.com';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to record a round.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed. Sign in again.', 401, request); }
  const uid = decoded.sub;
  const name = String(decoded.name || (decoded.email ? decoded.email.split('@')[0] : '') || 'A debater').slice(0, 60);
  const photo = typeof decoded.picture === 'string' ? decoded.picture.slice(0, 300) : '';
  const email = typeof decoded.email === 'string' ? decoded.email.slice(0, 200) : '';

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const turnN = body.turn === 1 || body.turn === 2 || body.turn === 3 ? body.turn : 0;
  if (!turnN) return errorResponse('Bad turn number', 400, request);
  const spec = TURN_SPEC[turnN];

  const uploadId = typeof body.uploadId === 'string' ? body.uploadId : '';
  if (!uploadId.startsWith(uid + ':')) return errorResponse('Upload does not belong to this account.', 403, request);
  const partCount = parseInt(body.partCount, 10);
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > MAX_PARTS) return errorResponse('Bad part count', 400, request);
  const mime = normMime(body.mime);
  if (!ALLOWED_MIME.has(mime)) return errorResponse('Unsupported recording format', 400, request);
  const kind = body.kind === 'video' ? 'video' : 'audio';
  const durationSec = Math.max(1, Math.min(spec.capSec + 10, Math.round(Number(body.durationSec) || 0)));

  // Verify every part actually landed, and total size is sane.
  const store = mediaStore();
  let totalBytes = 0;
  for (let i = 0; i < partCount; i++) {
    const meta = await store.getMetadata(`m/${uploadId}/p${i}`);
    if (!meta) return errorResponse(`Missing upload part ${i}. Re-record and try again.`, 400, request);
  }
  // Blob metadata does not expose size portably across store backends;
  // trust the per-part cap enforced at upload and the declared total.
  totalBytes = Math.min(Number(body.bytes) || 0, MAX_TOTAL_BYTES + 1);
  if (totalBytes > MAX_TOTAL_BYTES) return errorResponse('Recording too large. Use audio mode or record shorter.', 413, request);
  await store.setJSON(`m/${uploadId}/meta`, { mime, bytes: totalBytes, partCount, uid });

  const db = getDb();
  const now = Date.now();
  const turnEntry = {
    n: turnN, uid, ai: false, kind, mediaId: uploadId, durationSec,
    transcript: null, name, photo, createdAt: now,
  };

  try {
    if (turnN === 1) {
      const motion = String(body.motion || '').trim().replace(/\s+/g, ' ').slice(0, 200);
      if (motion.length < 8) return errorResponse('Give the motion at least a full sentence.', 400, request);
      const format = FORMATS.has(body.format) ? body.format : 'quick';
      const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';

      const openSnap = await db.collection('async_rounds')
        .where('prop.uid', '==', uid).where('state', '==', 'open').limit(MAX_OPEN_PER_USER + 1).get();
      if (openSnap.size >= MAX_OPEN_PER_USER) {
        return errorResponse(`You already have ${MAX_OPEN_PER_USER} open challenges. Let one resolve first.`, 409, request);
      }

      const ref = db.collection('async_rounds').doc();
      const doc = {
        state: 'open', visibility, hidden: false,
        feedKey: feedKeyFor('open', visibility, false),
        motion, format,
        prop: { uid, name, photo }, opp: null, aiOpp: false,
        turns: [turnEntry],
        replyWaived: false,
        createdAt: now, deadlineAt: now + ANSWER_WINDOW_MS, completedAt: 0,
        // sweep transcribes turn 1 soon; the deadline itself re-arms later
        sweepAt: now,
        ballot: null, votes: { prop: 0, opp: 0 }, reports: 0,
      };
      await ref.set(doc);
      await ref.collection('private').doc('notify').set({ propEmail: email, oppEmail: '' });
      await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
      return jsonResponse({ ok: true, roundId: ref.id, state: 'open' }, 200, request);
    }

    // Turns 2 and 3 mutate an existing round under a transaction.
    const roundId = String(body.roundId || '');
    if (!roundId) return errorResponse('Missing round', 400, request);
    const ref = db.collection('async_rounds').doc(roundId);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('That round no longer exists.');
      const d = snap.data();
      if (d.hidden) throw new Error('That round is under review.');

      if (turnN === 2) {
        if (d.state !== 'open') throw new Error('That challenge was already answered.');
        if (d.prop && d.prop.uid === uid) throw new Error('You cannot answer your own challenge.');
        tx.update(ref, {
          state: 'awaiting_reply',
          feedKey: feedKeyFor('awaiting_reply', d.visibility, false),
          opp: { uid, name, photo }, aiOpp: false,
          turns: [...(d.turns || []), turnEntry],
          answeredAt: now, deadlineAt: now + REPLY_WINDOW_MS, sweepAt: now,
        });
        return { state: 'awaiting_reply', propUid: d.prop && d.prop.uid, motion: d.motion };
      }

      // turn 3 — prop's reply
      if (d.state !== 'awaiting_reply') throw new Error('This round is not waiting on a reply.');
      if (!d.prop || d.prop.uid !== uid) throw new Error('Only the opener records the reply.');
      tx.update(ref, {
        state: 'judging',
        feedKey: feedKeyFor('judging', d.visibility, false),
        turns: [...(d.turns || []), turnEntry],
        sweepAt: now,
      });
      return { state: 'judging' };
    });

    await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});

    if (turnN === 2) {
      // Stash the answerer's email + tell the opener their reply window opened.
      await ref.collection('private').doc('notify').set({ oppEmail: email }, { merge: true }).catch(() => {});
      try {
        const priv = await ref.collection('private').doc('notify').get();
        const propEmail = priv.exists ? priv.data().propEmail : '';
        if (propEmail) {
          await sendEmail(propEmail, 'Your challenge was answered. Record your reply.',
            `<p>${name} answered your async round${result.motion ? ' on “' + result.motion + '”' : ''}.</p>` +
            `<p>You have 24 hours to record a 60-second reply, then the ballot comes back.</p>` +
            `<p><a href="${SITE}/rounds?r=${roundId}">Watch their answer and reply</a></p>`);
        }
      } catch { /* notification is best-effort */ }
    }

    return jsonResponse({ ok: true, roundId, state: result.state }, 200, request);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Could not save the turn.';
    const expected = /round|challenge|answer|reply|review|own|open challenges/i.test(msg);
    if (!expected) console.error('[async-turn]', err);
    return errorResponse(msg, expected ? 409 : 500, request);
  }
};

export const config = { path: '/api/async/turn' };
