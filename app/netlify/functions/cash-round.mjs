import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkWagerEligibility } from './lib/wager-eligibility.mjs';
import {
  validateRoundInput, makeRoundData, publicRound, canJoin, isExpired,
  quote, formatCents, SEATS, BUY_IN_PRESETS, DEFAULT_BUY_IN_CENTS, FEE_BPS,
} from './lib/cash-round.mjs';

// /api/cash-round — the board of paid rounds.
//
//   POST { action:'list' }            open rounds, plus mine
//   POST { action:'get', id }         one round
//   POST { action:'create', ... }     post a round at a buy-in
//   POST { action:'join', id }        take the empty seat
//   POST { action:'leave', id }       give the seat back before paying
//
// A cash round is a CONTEST, not a wager: the two people paying are the
// two people arguing, and the outcome turns on which of them argues
// better. Every rule that keeps that true lives in lib/cash-round.mjs
// and is asserted by scripts/test-cash-round.mjs.
//
// Taking a seat does NOT charge anybody. Joining reserves the seat and
// the buy-in is a separate, explicit Stripe checkout
// (cash-round-checkout.mjs), so nobody is charged by a click that was
// really about looking at a motion. The round only becomes playable
// when BOTH seats have paid, which the webhook decides, never a client.
//
// Named accounts only, and 18+, on both sides. An anonymous Firebase
// uid is free and unlimited to mint (2026-07-28), so an anonymous
// entrant in a money contest is an unaccountable counterparty holding
// someone else's stake.

const MAX_LIST = 40;

async function requireEntrant(request) {
  const token = extractBearerToken(request);
  if (!token) return { error: errorResponse('Sign in to play a cash round', 401, request) };
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('cash-round auth error:', err.message);
    return { error: errorResponse('Authentication failed. Please sign in again.', 401, request) };
  }
  if (!isNamedAccount(decoded)) {
    return {
      error: jsonResponse({
        error: 'NAMED_ACCOUNT_REQUIRED',
        message: 'A cash round needs a real account. Sign in with Google or an email address.',
      }, 403, request),
    };
  }
  return { decoded };
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const action = String(body.action || 'list').trim();
  const db = getDb();

  try {
    return await handle(action, body, request, context, db);
  } catch (err) {
    // A thrown handler returns no body at all, and Netlify surfaces
    // that as "error decoding lambda response", which reads as an
    // outage rather than as our bug. Log it and answer in JSON.
    console.error('cash-round ' + action + ' error:', err && err.message, err && err.stack);
    return errorResponse('Something went wrong on the board. Try again.', 500, request);
  }
};

async function handle(action, body, request, context, db) {

  // ── list: the public board ────────────────────────────────────────
  // Readable signed out, because a stranger deciding whether this is
  // worth an account should be able to see what is actually on offer.
  if (action === 'list') {
    let mine = null;
    const token = extractBearerToken(request);
    if (token) {
      try { mine = (await verifyIdToken(token)).sub; } catch { mine = null; }
    }
    // Single-field filter, sorted in memory on purpose. An `in` filter
    // plus an orderBy on a different field needs a composite index, and
    // a missing index throws FAILED_PRECONDITION at query time rather
    // than at deploy time, which is how the first version of this
    // shipped as a 500 that read as "error decoding lambda response".
    // The board is capped at MAX_LIST anyway, so the sort is free.
    const snap = await db.collection('cash_rounds')
      .where('status', 'in', ['open', 'funded'])
      .limit(MAX_LIST)
      .get();
    const now = Date.now();
    const rounds = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((r) => !isExpired(r.data, now))
      .sort((a, b) => (Number(b.data.createdAt) || 0) - (Number(a.data.createdAt) || 0))
      .map((r) => publicRound(r.id, r.data));
    return jsonResponse({
      rounds,
      mine: mine ? rounds.filter((r) => r.entrants.some((e) => e.uid === mine)) : [],
      presets: BUY_IN_PRESETS.map((c) => ({ cents: c, ...quote(c) })),
      defaultBuyInCents: DEFAULT_BUY_IN_CENTS,
      feeBps: FEE_BPS,
    }, 200, request);
  }

  if (action === 'get') {
    const id = String(body.id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid round id', 400, request);
    const snap = await db.collection('cash_rounds').doc(id).get();
    if (!snap.exists) return errorResponse('No such round', 404, request);
    return jsonResponse({ round: publicRound(snap.id, snap.data()) }, 200, request);
  }

  // Everything past here spends or reserves money, so it needs a real
  // person behind it.
  const gate = await requireEntrant(request);
  if (gate.error) return gate.error;
  const { decoded } = gate;
  const uid = decoded.sub;
  const name = String(body.name || decoded.name || '').trim().slice(0, 60);

  // 18+ and jurisdiction, resolved server-side from the Netlify edge.
  // A minor cannot attest past this, by design.
  if (action === 'create' || action === 'join') {
    const elig = await checkWagerEligibility(db, uid, request, context);
    if (!elig.ok) {
      return jsonResponse({
        error: 'NOT_ELIGIBLE',
        reason: elig.reason,
        message: elig.message || 'Cash rounds are not available to you.',
      }, 403, request);
    }
  }

  // ── create ────────────────────────────────────────────────────────
  if (action === 'create') {
    const check = validateRoundInput(body);
    if (!check.ok) {
      return jsonResponse({ error: 'INVALID', field: check.field, message: check.reason }, 400, request);
    }
    const data = makeRoundData({ input: check.value, creator: { uid, name }, nowMs: Date.now() });
    const ref = await db.collection('cash_rounds').add(data);
    const q = quote(check.value.buyInCents);
    console.log(`cash round posted: ${ref.id} at ${formatCents(check.value.buyInCents)} by ${uid}`);
    return jsonResponse({
      round: publicRound(ref.id, data),
      quote: q,
      // The client's next step is checkout. Say so rather than letting
      // it guess: a round nobody paid into is not a round.
      next: 'checkout',
    }, 200, request);
  }

  // ── join / leave ──────────────────────────────────────────────────
  // Both run in a transaction because two people can tap the last seat
  // in the same second, and the loser of that race must be told, not
  // quietly seated into a round that already has two people.
  if (action === 'join' || action === 'leave') {
    const id = String(body.id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid round id', 400, request);
    const ref = db.collection('cash_rounds').doc(id);

    try {
      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('NOT_FOUND');
        const d = snap.data();

        if (action === 'join') {
          const allowed = canJoin(d, uid);
          if (!allowed.ok) throw new Error('REFUSED:' + allowed.reason);
          const entrants = (Array.isArray(d.entrants) ? d.entrants : []).concat([{
            uid,
            name,
            side: 'con',
            joinedAt: Date.now(),
            paid: false,
            paidCents: 0,
          }]);
          tx.update(ref, { entrants, updatedAt: Date.now() });
          return { ...d, entrants };
        }

        // leave: only before paying. Once money is in, the way out is a
        // void and a refund, which is an operator action with a record,
        // not a button that empties a seat someone paid to sit opposite.
        const entrants = (Array.isArray(d.entrants) ? d.entrants : []);
        const me = entrants.find((e) => e && e.uid === uid);
        if (!me) throw new Error('REFUSED:You are not in this round.');
        if (me.paid) throw new Error('REFUSED:You have already paid in. Ask for a void instead.');
        if (d.creatorUid === uid) throw new Error('REFUSED:You posted this round. Cancel it instead.');
        const left = entrants.filter((e) => e && e.uid !== uid);
        tx.update(ref, { entrants: left, updatedAt: Date.now() });
        return { ...d, entrants: left };
      });

      return jsonResponse({
        round: publicRound(id, out),
        quote: quote(Number(out.buyInCents) || 0),
        next: action === 'join' ? 'checkout' : 'board',
      }, 200, request);
    } catch (err) {
      const msg = String(err.message || '');
      if (msg === 'NOT_FOUND') return errorResponse('No such round', 404, request);
      if (msg.startsWith('REFUSED:')) {
        return jsonResponse({ error: 'REFUSED', message: msg.slice(8) }, 409, request);
      }
      console.error('cash-round ' + action + ' failed:', msg);
      return errorResponse('Could not update that round. Try again.', 500, request);
    }
  }

  // ── cancel (creator, before any money lands) ──────────────────────
  if (action === 'cancel') {
    const id = String(body.id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid round id', 400, request);
    const ref = db.collection('cash_rounds').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('No such round', 404, request);
    const d = snap.data();
    if (d.creatorUid !== uid) return errorResponse('That is not your round', 403, request);
    if (d.status !== 'open') {
      return jsonResponse({ error: 'REFUSED', message: 'This round is past cancelling.' }, 409, request);
    }
    // Any money already in means this is a refund, and refunds are an
    // operator action with a paper trail.
    const paid = (Array.isArray(d.entrants) ? d.entrants : []).some((e) => e && e.paid);
    if (paid) {
      await ref.update({ status: 'void', voidReason: 'creator_cancelled', updatedAt: Date.now() });
      return jsonResponse({ ok: true, voided: true, message: 'Buy-ins already paid are being refunded in full.' }, 200, request);
    }
    await ref.update({ status: 'void', voidReason: 'creator_cancelled', voidedAt: FieldValue.serverTimestamp(), updatedAt: Date.now() });
    return jsonResponse({ ok: true, voided: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
}

export const config = {
  path: '/api/cash-round',
};
