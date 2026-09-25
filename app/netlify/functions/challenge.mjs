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
import { sendToUser } from './lib/webpush.mjs';
import { sendSmsToUser } from './lib/sms.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, deleteCachedShared } from './lib/admin-cache.mjs';
import { joinChallengeRoom, syncChallengeRoom } from './lib/challenge-room.mjs';
import {
  validateChallengeInput, makeChallengeData, publicChallenge,
  canTransition, slugify, normalizeClaim, feedKeyFor, OPEN_STATUSES,
} from './lib/challenge.mjs';

import { publicIdentity } from './lib/public-identity.mjs';
import { displayRating } from './lib/rating.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { setChallengeFollow } from './lib/challenge-follow.mjs';
import { safeIdentity } from './lib/public-avatar.mjs';
// Live matching is ONE pool (2026-09-25, Aidan: "everyone for live
// matches, no age limit thing"). The age-band pairing rule is off here
// and in spar-pair.mjs, js/age-gate.js, challenge-room.mjs, team-seats.mjs
// and private-invite.mjs; flip every copy together to restore it.
const AGE_BAND_PAIRING = false;

const FEED_KEYS = new Set(['open-public', 'live-public', 'upcoming-public', 'done-public']);

const feedCacheKey = (feed) => `challenge-feed-v2-${feed}`;

// Any write can move a challenge between buckets (create lands it in open,
// accept moves it to upcoming, cancel takes it off the board), and which
// bucket it LEFT is not always knowable from here without another read. Four
// deletes is cheaper than that read and cheaper than being wrong, so a write
// clears all of them. Best-effort: a failed invalidation costs one stale
// minute and must never fail the write that succeeded.
function invalidateFeeds() {
  return Promise.all(
    [...FEED_KEYS].map((f) => deleteCachedShared(feedCacheKey(f)).catch(() => {})),
  ).catch(() => {});
}

const MAX_LIMIT = 40;
const FEED_CACHE_TTL_MS = 60 * 1000;
const MAX_APPLICANTS = 200;
const APPLY_NOTE_MAX = 240;

async function uidFrom(request) {
  const token = extractBearerToken(request);
  if (!token) return null;
  try { return (await verifyIdToken(token)).sub; } catch { return null; }
}

// Identity stamped onto the doc so a board render needs no join.
async function identityFrom(request, db) {
  const token = extractBearerToken(request);
  if (!token) return null;
  try {
    const d = await verifyIdToken(token);
    if (d.firebase?.sign_in_provider === 'anonymous') return null;
    const [profile, rating] = await Promise.all([
      withDeadline(db.collection('user_profiles').doc(d.sub).get(), 2500),
      withDeadline(db.collection('user_ratings').doc(d.sub).get(), 2500),
    ]);
    const p = profile.exists ? profile.data() : {};
    const identity = publicIdentity(d.sub, p);
    const ladder = rating.exists && rating.data().games > 0 ? displayRating(rating.data()) : null;
    return {
      uid: d.sub, name: identity.name, handle: identity.username,
      photo: typeof p.photoURL === 'string' && /^https:\/\//.test(p.photoURL) ? p.photoURL.slice(0, 500) : '',
      avatarIdentity: safeIdentity(p.avatarIdentity),
      rating: ladder?.rating ?? null, provisional: ladder?.provisional === true,
      provider: d.firebase?.sign_in_provider || '',
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

      // 2026-08-11: shared-cached, because the landing's callout strip reads
      // two of these feeds on every visit. Uncached that would be a Firestore
      // query per feed per homepage load, which is the drain shape the
      // 2026-05-18 credit audit exists to prevent.
      //
      // The cache is keyed by FEED ONLY and always holds the full page, with
      // the caller's limit applied on the way out. Keying by limit too would
      // give the landing (which asks for 6) and the board (40) separate
      // entries for the same query, so the cheap surface would never benefit
      // from the expensive one having just run.
      //
      // Writes invalidate rather than wait out the TTL: posting a challenge
      // and not finding it on the board reads as a failed post.
      const cacheKey = feedCacheKey(feed);
      const hit = await getCachedShared(cacheKey);
      if (hit) {
        return jsonResponse({ ...hit, challenges: (hit.challenges || []).slice(0, limit) }, 200, request);
      }
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
            .limit(MAX_LIMIT)
            .get(), 3000);
      } catch (err) {
        console.error('[challenge] feed query failed', feed, err.message);
        return jsonResponse({
          feed, challenges: [], degraded: true, at: Date.now(),
        }, 200, request);
      }
      const payload = {
        feed,
        challenges: snap.docs.map((d) => publicChallenge(d.id, d.data())),
        at: Date.now(),
      };
      // A degraded read is never cached (it returned above); a transient
      // index or deadline blip must not pin an empty board for a minute.
      await setCachedShared(cacheKey, payload, FEED_CACHE_TTL_MS);
      return jsonResponse({ ...payload, challenges: payload.challenges.slice(0, limit) }, 200, request);
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
    let data = doc.data();
    if (data.moderation && data.moderation.state === 'hidden') {
      const uid = await uidFrom(request);
      const isParty = uid && (data.creator?.uid === uid
        || (data.accepted || []).some((p) => p.uid === uid));
      if (!isParty) return errorResponse('This challenge is under review.', 410, request);
    }
    const synced = await syncChallengeRoom(db, doc.ref);
    data = synced.data;
    if (synced.changed) await invalidateFeeds();
    const challenge = publicChallenge(doc.id, data);
    const uid = await uidFrom(request);
    challenge.following = uid ? (await doc.ref.collection('followers').doc(uid).get()).exists : false;
    challenge.replayUrl = '';
    if (challenge.status === 'completed' && !challenge.roomPrivate && challenge.eventId) {
      try {
        const recordings = await withDeadline(db.collection('recordings').where('roomName', '==', challenge.eventId).limit(20).get(), 2500);
        const replay = recordings.docs.find(r => r.data().published === true);
        if (replay) challenge.replayUrl = '/watch?r=' + encodeURIComponent(replay.id);
      } catch { /* A replay outage must not hide the existing ballot. */ }
    }
    const response = jsonResponse({ challenge, at: Date.now() }, 200, request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // ── WRITE ─────────────────────────────────────────────────────────
  const me = await identityFrom(request, db);
  if (!me) return errorResponse('Sign in first.', 401, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid request body', 400, request); }

  const action = String(body.action || '');

  // create ───────────────────────────────────────────────────────────
  if (action === 'create') {
    const budget = await checkLayers('challenge-create', 'uid_' + me.uid, [
      { window: 3600000, max: 12, label: 'hour' },
    ]);
    if (!budget.ok) return errorResponse('You have posted several challenges. Try again in an hour.', 429, request);
    const v = validateChallengeInput(body);
    if (!v.ok) return errorResponse(v.reason, 400, request);

    const ref = db.collection('challenges').doc();
    const slug = slugify(v.value.claim, ref.id);
    const claimNorm = normalizeClaim(v.value.claim);

    // 2026-08-11: a DIRECTED challenge, which is what "Challenge them" on
    // the leaderboard creates. `makeChallengeData` and the accept guard
    // have always understood challengedUid; nothing ever passed one, so
    // calling a named person out was unreachable through the API. Read
    // from the body rather than trusting the client's own claim about
    // who it is: self-challenge is refused because the accept guard
    // would then be satisfiable only by the creator, who already holds a
    // seat, leaving a challenge nobody can ever take.
    let challengedUid = String(body.challengedUid || '').slice(0, 128).trim();
    const handle = String(body.opponentUsername || '').replace(/^@/, '').trim().toLowerCase();
    if (handle) {
      if (!/^[a-z0-9_-]{2,40}$/.test(handle)) return errorResponse('Enter a valid opponent username.', 400, request);
      const claimed = await db.collection('profile_handles').doc(handle).get();
      if (claimed.exists) challengedUid = claimed.data().uid || '';
      else {
        const matches = await db.collection('user_profiles').where('usernameOverride', '==', handle).limit(2).get();
        if (matches.size !== 1) return errorResponse('That username could not be uniquely found. Open their profile and use Challenge instead.', 400, request);
        challengedUid = matches.docs[0].id;
      }
      if (!challengedUid) return errorResponse('That username was not found.', 400, request);
    }
    if (challengedUid === me.uid) return errorResponse('Choose someone else or leave the opponent blank.', 400, request);

    // The NAME is resolved here, never taken from the body. A client-supplied
    // label would let anyone post "Aimed at <someone real>" at a uid that is
    // not theirs, which is impersonation on a public board. The uid is what
    // the accept guard enforces; the name is only what the board prints, so
    // it has to come from the same place the leaderboard's names come from.
    // Unresolvable means no name, not a guess.
    let challengedName = '';
    if (challengedUid) {
      try {
        const p = await withDeadline(
          db.collection('user_profiles').doc(challengedUid).get(), 2000);
        challengedName = publicIdentity(challengedUid, p.exists ? p.data() : {}).name;
      } catch (err) {
        console.warn('[challenge] challenged-name lookup failed', err.message);
      }
    }

    const data = makeChallengeData(v.value, me, {
      slug, claimId: claimNorm, challengedUid, challengedName,
    });

    // The creator holds side A unless they explicitly took B.
    data.accepted = [{
      uid: me.uid, name: me.name, photo: me.photo, avatarIdentity: me.avatarIdentity, rating: me.rating, provisional: me.provisional,
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

    // Push the person being called out (2026-08-23). Server-constructed
    // text, best-effort, no-ops until VAPID is configured. Without this
    // a directed challenge sat silently on a board the target had no
    // reason to be looking at.
    if (challengedUid) {
      // Awaited: Lambda freezes the context on return, so an unawaited
      // send is abandoned, not deferred (the markGuest lesson).
      const claimSnippet = String(v.value.claim || '').slice(0, 90);
      await Promise.all([
        sendToUser(challengedUid, {
          title: (me.name || 'A debater') + ' challenged you',
          body: claimSnippet ? '"' + claimSnippet + '" Tap to accept the round.' : 'Tap to accept the round.',
          url: '/challenge/' + encodeURIComponent(slug),
          tag: 'da-challenge-' + ref.id,
        }).catch(() => {}),
        // force:true skips quiet hours and nothing else. Someone calling
        // you out by name is the one alert worth a late buzz, and it is
        // singular rather than a fan-out, so it cannot become a stream.
        sendSmsToUser(challengedUid, {
          kind: 'challenge',
          force: true,
          body: `${me.name || 'Someone'} challenged you on Debatable${claimSnippet ? `: "${claimSnippet}"` : ''}. https://itsdebatable.com/challenge/${encodeURIComponent(slug)}\n\nReply STOP to stop.`,
        }).catch(() => {}),
      ]);
    }

    await invalidateFeeds();
    return jsonResponse({ challenge: publicChallenge(ref.id, data) }, 201, request);
  }

  const id = String(body.id || '');
  const slug = String(body.slug || '');
  if (!id && !slug) return errorResponse('Missing challenge', 400, request);
  const found = await loadBySlugOrId(db, { slug, id });
  if (!found) return errorResponse('Challenge not found', 404, request);
  const ref = found.ref;

  if (action === 'join') {
    if (!['google.com', 'apple.com', 'password'].includes(me.provider)) {
      return errorResponse('Sign in with Google, Apple, or email to enter the video room.', 403, request);
    }
    try {
      const room = await joinChallengeRoom(db, ref, me.uid);
      await invalidateFeeds();
      return jsonResponse(room, 200, request);
    } catch (e) {
      return errorResponse(e.message || 'Could not open this debate. Try again.', 409, request);
    }
  }

  if (action === 'sync') {
    const d = found.data();
    if (!(d.accepted || []).some(p => p.uid === me.uid)) return errorResponse('Only a participant can refresh this result.', 403, request);
    const result = await syncChallengeRoom(db, ref);
    if (result.changed) await invalidateFeeds();
    return jsonResponse({ challenge: publicChallenge(ref.id, result.data), completed: result.completed === true }, 200, request);
  }

  // accept ───────────────────────────────────────────────────────────
  // Transactional: two people tapping Accept within the same second must
  // not both land on side B.
  if (action === 'accept') {
    if (found.data().mode === 'live' && !['google.com', 'apple.com', 'password'].includes(me.provider)) {
      return errorResponse('Sign in with Google, Apple, or email to take a live side.', 403, request);
    }
    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.data();
        if (d.moderation?.state === 'hidden') throw new Error('This challenge is under review.');
        // A retry after a lost response is the same acceptance, not an error.
        const ownSeat = (d.accepted || []).find(p => p.uid === me.uid);
        if (ownSeat && ['accepted', 'live'].includes(d.status)) return { side: ownSeat.side };
        if (!OPEN_STATUSES.has(d.status)) throw new Error('This challenge is not open.');
        if (d.applicationMode === 'apply') throw new Error('This one takes applications. Apply instead.');
        if (d.challengedUid && d.challengedUid !== me.uid) throw new Error('This challenge is aimed at someone else.');
        const accepted = d.accepted || [];
        if (accepted.some((p) => p.uid === me.uid)) throw new Error('You are already in this one.');
        if (accepted.length >= 2) throw new Error('Both sides are taken.');

        const takenSides = new Set(accepted.map((p) => p.side));
        const side = takenSides.has('a') ? 'b' : 'a';
        if (d.mode === 'live' && AGE_BAND_PAIRING) {
          const bands = await Promise.all([me.uid, d.creator.uid].map(uid => tx.get(db.collection('age_bands').doc(uid))));
          const band = bands.map(s => s.exists ? s.data().band : '');
          if (!['minor', 'adult'].includes(band[0])) throw new Error('Confirm your age before accepting.');
          if (!['minor', 'adult'].includes(band[1])) throw new Error('The creator needs to confirm their age before this challenge can be accepted.');
          if (band[0] !== band[1]) throw new Error('Live debates pair people within the same age group.');
        }
        const next = accepted.concat([{ uid: me.uid, name: me.name, photo: me.photo, avatarIdentity: me.avatarIdentity, rating: me.rating, provisional: me.provisional, side, at: Date.now() }]);
        if (!canTransition(d.status, 'accepted')) throw new Error('Cannot accept from ' + d.status + '.');

        tx.update(ref, {
          accepted: next,
          status: 'accepted',
          feedKey: feedKeyFor('accepted', d.visibility, d.moderation?.state),
          updatedAt: Date.now(),
        });
        // The creator (side holder before this accept) gets pushed that
        // their round is on; uid read inside the transaction, sent after.
        const creator = accepted.length ? accepted[0].uid : '';
        return { side, notifyUid: creator && creator !== me.uid ? creator : '', claim: d.claim || '' };
      });
      await invalidateFeeds();
      if (result.notifyUid) {
        await Promise.all([
          sendToUser(result.notifyUid, {
            title: (me.name || 'Someone') + ' accepted your challenge',
            body: 'Your challenge was accepted. Tap to open it.',
            url: '/challenge/' + encodeURIComponent(found.data().slug || ref.id),
            tag: 'da-challenge-accept-' + ref.id,
          }).catch(() => {}),
          sendSmsToUser(result.notifyUid, {
            kind: 'challenge',
            force: true,
            body: `${me.name || 'Someone'} accepted your challenge on Debatable. https://itsdebatable.com/challenge/${encodeURIComponent(found.data().slug || ref.id)}\n\nReply STOP to stop.`,
          }).catch(() => {}),
        ]);
      }
      return jsonResponse({ ok: true, side: result.side }, 200, request);
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
    const result = await setChallengeFollow(db, ref, me.uid, body.following);
    await invalidateFeeds();
    return jsonResponse({ ok: true, ...result }, 200, request);
  }

  // cancel ───────────────────────────────────────────────────────────
  if (action === 'cancel') {
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.data();
        if (d.creator?.uid !== me.uid) throw new Error('Only the creator can cancel this.');
        if (d.mode === 'live' && ['accepted', 'live'].includes(d.status)) {
          throw new Error('This invite was already accepted. Open the debate to leave the round.');
        }
        if (!canTransition(d.status, 'cancelled')) throw new Error('A ' + d.status + ' challenge cannot be cancelled.');
        tx.update(ref, { status: 'cancelled', feedKey: 'quiet', updatedAt: Date.now() });
      });
    } catch (e) {
      return errorResponse(e.message || 'Could not cancel this challenge.', 409, request);
    }
    await invalidateFeeds();
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/challenge' };
