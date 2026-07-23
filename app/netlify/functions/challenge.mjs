// ─────────────────────────────────────────────────────────────
// /api/challenge — read and mutate a challenge.
//
// GET  ?slug= | ?id=        one challenge, public projection
// GET  ?feed=open-public    a page of the board (also: live-public,
//                           upcoming-public, done-public)
// POST { action, ... }      create | accept | apply | side | follow |
//                           cancel
//
// Every write lands here rather than in the client, because status is a
// state machine and the crowd counters feed a prediction market. See
// the firestore.rules comment on /challenges for why there are no
// field-level client writes on this collection.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import {
  validateChallengeInput, makeChallengeData, publicChallenge,
  canTransition, slugify, normalizeClaim, feedKeyFor, OPEN_STATUSES,
} from './lib/challenge.mjs';

const FEED_KEYS = new Set(['open-public', 'live-public', 'upcoming-public', 'done-public']);
const MAX_LIMIT = 40;
const MAX_APPLICANTS = 200;
const APPLY_NOTE_MAX = 240;

async function uidFrom(request) {
  const token = extractBearerToken(request);
  if (!token) return null;
  try { return (await verifyIdToken(token)).sub; } catch { return null; }
}

// Identity stamped onto the doc so a board render needs no join.
async function identityFrom(request) {
  const token = extractBearerToken(request);
  if (!token) return null;
  try {
    const d = await verifyIdToken(token);
    return {
      uid: d.sub,
      name: String(d.name || (d.email ? d.email.split('@')[0] : '') || '').slice(0, 60),
      photo: typeof d.picture === 'string' ? d.picture.slice(0, 300) : '',
    };
  } catch { return null; }
}

async function loadBySlugOrId(db, { slug, id }) {
  if (id) {
    const snap = await withDeadline(db.collection('challenges').doc(id).get(), 2500);
    return snap.exists ? snap : null;
  }
  const q = await withDeadline(
    db.collection('challenges').where('slug', '==', slug).limit(1).get(), 2500);
  return q.empty ? null : q.docs[0];
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  // ── READ ──────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const feed = url.searchParams.get('feed');

    if (feed) {
      if (!FEED_KEYS.has(feed)) return errorResponse('Unknown feed', 400, request);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      // Completed rounds read newest-first; everything still open reads
      // soonest-first, so the board leads with what is about to happen
      // rather than what was posted most recently.
      const byDate = feed === 'done-public'
        ? ['updatedAt', 'desc']
        : (feed === 'upcoming-public' ? ['scheduledAt', 'asc'] : ['createdAt', 'desc']);
      // A board query can fail for reasons that are not the visitor's
      // problem: a composite index still building after a deploy, a
      // cold-start deadline, a transient Firestore blip. The arena is
      // the homepage, so none of those may surface as a 502. Return an
      // empty feed with `degraded` set and let the client render its
      // empty state, which it needs anyway for a genuinely quiet board.
      let snap;
      try {
        snap = await withDeadline(
          db.collection('challenges')
            .where('feedKey', '==', feed)
            .orderBy(byDate[0], byDate[1])
            .limit(limit)
            .get(), 3000);
      } catch (err) {
        console.error('[challenge] feed query failed', feed, err.message);
        return jsonResponse({
          feed, challenges: [], degraded: true, at: Date.now(),
        }, 200, request);
      }
      return jsonResponse({
        feed,
        challenges: snap.docs.map((d) => publicChallenge(d.id, d.data())),
        at: Date.now(),
      }, 200, request);
    }

    const slug = (url.searchParams.get('slug') || '').slice(0, 120);
    const id = (url.searchParams.get('id') || '').slice(0, 60);
    if (!slug && !id) return errorResponse('Missing slug or id', 400, request);

    let doc;
    try {
      doc = await loadBySlugOrId(db, { slug, id });
    } catch (err) {
      console.error('[challenge] lookup failed', slug || id, err.message);
      return errorResponse('Could not load that challenge. Try again.', 503, request);
    }
    if (!doc) return errorResponse('Challenge not found', 404, request);
    const data = doc.data();
    if (data.moderation && data.moderation.state === 'hidden') {
      const uid = await uidFrom(request);
      const isParty = uid && (data.creator?.uid === uid
        || (data.accepted || []).some((p) => p.uid === uid));
      if (!isParty) return errorResponse('This challenge is under review.', 410, request);
    }
    return jsonResponse({ challenge: publicChallenge(doc.id, data), at: Date.now() }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // ── WRITE ─────────────────────────────────────────────────────────
  const me = await identityFrom(request);
  if (!me) return errorResponse('Sign in first.', 401, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid request body', 400, request); }

  const action = String(body.action || '');

  // create ───────────────────────────────────────────────────────────
  if (action === 'create') {
    const v = validateChallengeInput(body);
    if (!v.ok) return errorResponse(v.reason, 400, request);

    const ref = db.collection('challenges').doc();
    const slug = slugify(v.value.claim, ref.id);
    const claimNorm = normalizeClaim(v.value.claim);
    const data = makeChallengeData(v.value, me, { slug, claimId: claimNorm });

    // The creator holds side A unless they explicitly took B.
    data.accepted = [{
      uid: me.uid, name: me.name, photo: me.photo,
      side: body.side === 'b' ? 'b' : 'a', at: data.createdAt,
    }];

    await ref.set(data);

    // Claim aggregate: one doc per normalized claim, so every challenge
    // that ever argued this subject rolls up to one place. Best-effort;
    // a failed counter must never fail the create.
    if (claimNorm) {
      db.collection('claims').doc(encodeURIComponent(claimNorm).slice(0, 400)).set({
        norm: claimNorm,
        text: v.value.claim,
        topic: v.value.topic,
        challengeCount: FieldValue.increment(1),
        updatedAt: Date.now(),
      }, { merge: true }).catch(() => {});
    }

    return jsonResponse({ challenge: publicChallenge(ref.id, data) }, 201, request);
  }

  const id = String(body.id || '');
  const slug = String(body.slug || '');
  if (!id && !slug) return errorResponse('Missing challenge', 400, request);
  const found = await loadBySlugOrId(db, { slug, id });
  if (!found) return errorResponse('Challenge not found', 404, request);
  const ref = found.ref;

  // accept ───────────────────────────────────────────────────────────
  // Transactional: two people tapping Accept within the same second must
  // not both land on side B.
  if (action === 'accept') {
    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.data();
        if (!OPEN_STATUSES.has(d.status)) throw new Error('This challenge is not open.');
        if (d.applicationMode === 'apply') throw new Error('This one takes applications. Apply instead.');
        if (d.challengedUid && d.challengedUid !== me.uid) throw new Error('This challenge is aimed at someone else.');
        const accepted = d.accepted || [];
        if (accepted.some((p) => p.uid === me.uid)) throw new Error('You are already in this one.');
        if (accepted.length >= 2) throw new Error('Both sides are taken.');

        const takenSides = new Set(accepted.map((p) => p.side));
        const side = takenSides.has('a') ? 'b' : 'a';
        const next = accepted.concat([{ uid: me.uid, name: me.name, photo: me.photo, side, at: Date.now() }]);
        if (!canTransition(d.status, 'accepted')) throw new Error('Cannot accept from ' + d.status + '.');

        tx.update(ref, {
          accepted: next,
          status: 'accepted',
          feedKey: feedKeyFor('accepted', d.visibility, d.moderation?.state),
          updatedAt: Date.now(),
        });
        return side;
      });
      return jsonResponse({ ok: true, side: result }, 200, request);
    } catch (e) {
      return errorResponse(e.message || 'Could not accept.', 409, request);
    }
  }

  // apply ────────────────────────────────────────────────────────────
  if (action === 'apply') {
    const d = found.data();
    if (d.status !== 'applications_open') return errorResponse('Applications are closed.', 409, request);
    if ((d.applicants || []).some((p) => p.uid === me.uid)) {
      return errorResponse('You already applied.', 409, request);
    }
    if ((d.applicants || []).length >= MAX_APPLICANTS) {
      return errorResponse('This one has a full application list.', 409, request);
    }
    await ref.update({
      applicants: FieldValue.arrayUnion({
        uid: me.uid, name: me.name, photo: me.photo,
        side: body.side === 'b' ? 'b' : 'a',
        note: String(body.note || '').slice(0, APPLY_NOTE_MAX),
        at: Date.now(),
      }),
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true }, 200, request);
  }

  // side ─────────────────────────────────────────────────────────────
  // Which way the room leans. Auth-required on purpose: this number is
  // what a prediction market will price off, so an anonymous counter
  // would be trivially inflatable. A signed-out visitor still picks a
  // side in the UI; the pick is held client-side and claimed on sign-in.
  if (action === 'side') {
    const side = body.side === 'b' ? 'b' : (body.side === 'a' ? 'a' : null);
    if (!side) return errorResponse('Pick a side', 400, request);
    const pickRef = ref.collection('sides').doc(me.uid);
    try {
      await db.runTransaction(async (tx) => {
        const prev = await tx.get(pickRef);
        const had = prev.exists ? prev.data().side : null;
        if (had === side) return; // idempotent re-tap
        const delta = {};
        delta['crowd.support' + side.toUpperCase()] = FieldValue.increment(1);
        if (had) delta['crowd.support' + had.toUpperCase()] = FieldValue.increment(-1);
        delta.updatedAt = Date.now();
        tx.set(pickRef, { side, at: Date.now() }, { merge: true });
        tx.update(ref, delta);
      });
    } catch (e) {
      return errorResponse('Could not record your side.', 500, request);
    }
    return jsonResponse({ ok: true, side }, 200, request);
  }

  // follow ───────────────────────────────────────────────────────────
  if (action === 'follow') {
    const followRef = ref.collection('followers').doc(me.uid);
    const exists = (await followRef.get()).exists;
    if (exists) {
      await followRef.delete();
      await ref.update({ 'crowd.followers': FieldValue.increment(-1), updatedAt: Date.now() });
      return jsonResponse({ ok: true, following: false }, 200, request);
    }
    await followRef.set({ at: Date.now() });
    await ref.update({ 'crowd.followers': FieldValue.increment(1), updatedAt: Date.now() });
    return jsonResponse({ ok: true, following: true }, 200, request);
  }

  // cancel ───────────────────────────────────────────────────────────
  if (action === 'cancel') {
    const d = found.data();
    if (d.creator?.uid !== me.uid) return errorResponse('Only the creator can cancel this.', 403, request);
    if (!canTransition(d.status, 'cancelled')) {
      return errorResponse('A ' + d.status + ' challenge cannot be cancelled.', 409, request);
    }
    await ref.update({
      status: 'cancelled',
      feedKey: 'quiet',
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/challenge' };
