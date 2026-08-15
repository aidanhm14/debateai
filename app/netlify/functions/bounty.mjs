// ─────────────────────────────────────────────────────────────
// /api/bounty — read and mutate a bounty.
//
//   GET  ?id=                 one bounty, public projection
//   GET  ?feed=open|claimed|done|mine
//   POST { action, ... }      create | claim | withdraw | cancel
//
// There are no Firestore rules for `bounties`, the same posture as
// `challenges` and `tournaments`: every read and write goes through the
// admin SDK here. For a collection holding a money pot that is not a
// convenience, it is the point. A client that can write a field can
// write `potCents`.
//
// `complete` is deliberately NOT an action a browser can call. Completing
// a bounty is what makes the pot owed to two people, so it belongs to
// /api/bounty-admin behind an admin check, next to the refund and payout
// controls. See the money-decisions comment in lib/bounty.mjs.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, deleteCachedShared } from './lib/admin-cache.mjs';
import {
  validateBountyInput, makeBountyData, publicBounty, canClaim, canTransition,
  isExpired, DEBATERS_NEEDED, FUNDABLE_STATUSES,
} from './lib/bounty.mjs';

const FEEDS = new Set(['open', 'claimed', 'done']);
const FEED_TTL_MS = 45 * 1000;
const MAX_LIMIT = 40;

const feedKey = (f) => `bounty-feed-${f}`;
const invalidateFeeds = () => Promise.all(
  [...FEEDS].map((f) => deleteCachedShared(feedKey(f)).catch(() => {})),
).catch(() => {});

const STATUS_FOR_FEED = {
  open: ['funding'],
  claimed: ['claimed'],
  done: ['completed'],
};

// Matches shortenName in challenge.mjs so a person is called the same
// thing on the bounty board as on the challenge board.
function shortenName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} ${(parts[parts.length - 1][0] || '').toUpperCase()}.`.slice(0, 60);
  }
  return (parts[0] || '').slice(0, 60);
}

async function authed(request) {
  const token = extractBearerToken(request);
  if (!token) return null;
  try { return await verifyIdToken(token); } catch { return null; }
}

// Anonymous Firebase accounts are free and unlimited to mint, and this
// endpoint attaches people to money, so every write here needs a real
// provider. Same gate as /api/brain and the audience-camera token.
function isNamed(decoded) {
  const p = decoded && decoded.firebase && decoded.firebase.sign_in_provider;
  return !!decoded && p && p !== 'anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    const decoded = await authed(request);
    const viewerUid = decoded ? decoded.sub : null;

    if (id) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid id', 400, request);
      const snap = await withDeadline(db.collection('bounties').doc(id).get(), 3000);
      if (!snap.exists) return errorResponse('No such bounty', 404, request);
      return jsonResponse({ bounty: publicBounty(snap.id, snap.data(), viewerUid) }, 200, request);
    }

    const feed = (url.searchParams.get('feed') || 'open').trim();

    // "mine" is per-user, so it is never shared-cached and never served
    // to a signed-out caller.
    if (feed === 'mine') {
      if (!viewerUid) return errorResponse('Sign in to see your bounties', 401, request);
      const [created, taken] = await Promise.all([
        db.collection('bounties').where('creatorUid', '==', viewerUid).limit(MAX_LIMIT).get(),
        db.collection('bounties').where('debaterUids', 'array-contains', viewerUid).limit(MAX_LIMIT).get(),
      ]);
      const seen = new Set();
      const rows = [];
      for (const s of [created, taken]) {
        s.forEach((doc) => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          rows.push(publicBounty(doc.id, doc.data(), viewerUid));
        });
      }
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return jsonResponse({ bounties: rows }, 200, request);
    }

    if (!FEEDS.has(feed)) return errorResponse('Unknown feed', 400, request);

    // The cached payload is the SIGNED-OUT projection. A viewer block is
    // per-person, so it is recomputed below rather than cached, which is
    // why the cache stores raw docs instead of finished rows.
    let raw = await getCachedShared(feedKey(feed));
    if (!raw) {
      const snap = await withDeadline(
        db.collection('bounties')
          .where('status', 'in', STATUS_FOR_FEED[feed])
          .limit(MAX_LIMIT).get(), 3500,
      );
      raw = [];
      snap.forEach((doc) => raw.push({ id: doc.id, d: doc.data() }));
      await setCachedShared(feedKey(feed), raw, FEED_TTL_MS);
    }
    const bounties = raw
      .map((r) => publicBounty(r.id, r.d, viewerUid))
      .filter(Boolean)
      // An expired bounty is not an open bounty even if the sweep has
      // not flipped its status yet, so the board never advertises one.
      .filter((b) => (feed !== 'open' ? true : !b.expired))
      .sort((a, b) => (b.potCents - a.potCents) || ((b.createdAt || 0) - (a.createdAt || 0)));
    return jsonResponse({ bounties }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const decoded = await authed(request);
  if (!decoded) return errorResponse('Sign in first', 401, request);
  if (!isNamed(decoded)) {
    return jsonResponse({
      error: 'NAMED_ACCOUNT_REQUIRED',
      message: 'Bounties need a real account. Sign in with Google or an email address.',
    }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const action = String(body.action || '').trim();
  const uid = decoded.sub;
  const myName = shortenName(decoded.name || decoded.email || 'Someone') || 'Someone';

  // ── create ────────────────────────────────────────────────────────
  if (action === 'create') {
    const v = validateBountyInput(body);
    if (!v.ok) {
      return jsonResponse({ error: 'INVALID', field: v.field, message: v.reason }, 400, request);
    }
    const data = makeBountyData(v.value, { uid, name: myName }, Date.now());
    // Denormalised so the "mine" feed can query taken bounties without a
    // composite index over an array of objects.
    data.debaterUids = [];
    const ref = await db.collection('bounties').add(data);
    await invalidateFeeds();
    return jsonResponse({ id: ref.id, bounty: publicBounty(ref.id, data, uid) }, 200, request);
  }

  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid id', 400, request);
  const ref = db.collection('bounties').doc(id);

  // ── claim / withdraw / cancel ─────────────────────────────────────
  // All three run in a transaction. Two people taking the last seat at
  // the same moment is the exact race that would otherwise seat three
  // debaters on a two-way split.
  if (action === 'claim' || action === 'withdraw' || action === 'cancel') {
    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: 'NOT_FOUND', message: 'No such bounty.' };
        const d = snap.data();

        if (action === 'claim') {
          const gate = canClaim(d, uid);
          if (!gate.ok) return { error: 'CANNOT_CLAIM', message: gate.reason };
          const debaters = (d.debaters || []).concat([{ uid, name: myName, acceptedAt: Date.now() }]);
          const patch = {
            debaters,
            debaterUids: debaters.map((x) => x.uid),
            updatedAt: Date.now(),
          };
          // A named target accepting is recorded on the target too, so
          // the card can show which of the named people have said yes.
          if (Array.isArray(d.targets) && d.targets.some((t) => t.uid === uid)) {
            patch.targets = d.targets.map((t) => (t.uid === uid ? { ...t, accepted: true } : t));
          }
          if (debaters.length >= DEBATERS_NEEDED && canTransition(d.status, 'claimed')) {
            patch.status = 'claimed';
          }
          tx.update(ref, patch);
          return { ok: true, seats: debaters.length };
        }

        if (action === 'withdraw') {
          const debaters = (d.debaters || []).filter((x) => x.uid !== uid);
          if (debaters.length === (d.debaters || []).length) {
            return { error: 'NOT_A_DEBATER', message: 'You have not taken this bounty.' };
          }
          if (d.status === 'completed') {
            return { error: 'ALREADY_DONE', message: 'This round already happened.' };
          }
          const patch = {
            debaters,
            debaterUids: debaters.map((x) => x.uid),
            updatedAt: Date.now(),
          };
          if (Array.isArray(d.targets)) {
            patch.targets = d.targets.map((t) => (t.uid === uid ? { ...t, accepted: false } : t));
          }
          // Dropping below two seats reopens it rather than leaving a
          // half-claimed bounty nobody else can take.
          if (d.status === 'claimed' && canTransition('claimed', 'funding')) patch.status = 'funding';
          tx.update(ref, patch);
          return { ok: true, seats: debaters.length };
        }

        // cancel
        if (d.creatorUid !== uid) {
          return { error: 'NOT_YOURS', message: 'Only the person who posted it can cancel it.' };
        }
        if (!canTransition(d.status, 'cancelled')) {
          return { error: 'CANNOT_CANCEL', message: 'This bounty can no longer be cancelled.' };
        }
        const pot = Number(d.potCents) || 0;
        tx.update(ref, {
          status: 'cancelled',
          // Cancelling a funded bounty does not keep the money. It marks
          // every contribution owed back, including contributions from
          // people who are not the canceller.
          refund: { status: pot > 0 ? 'due' : 'none', doneAt: null },
          updatedAt: Date.now(),
        });
        return { ok: true, refundDue: pot > 0 };
      });
    } catch (err) {
      console.error('[bounty] transaction failed', err && err.message);
      return errorResponse('Could not update that bounty. Try again.', 500, request);
    }

    if (result.error) {
      return jsonResponse(result, result.error === 'NOT_FOUND' ? 404 : 409, request);
    }
    await invalidateFeeds();
    const fresh = await ref.get();
    return jsonResponse({ ...result, bounty: publicBounty(fresh.id, fresh.data(), uid) }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/bounty' };
