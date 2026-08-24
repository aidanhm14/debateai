import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import { sendToUser } from './lib/webpush.mjs';
import { cleanAvatarIdentity } from './lib/avatar-design.mjs';

// Server-side pair-matcher for /spar.
//
// The bug we're fixing: pairing was a client-side Firestore transaction
// that updated BOTH the caller's queue doc AND the peer's queue doc in
// one atomic write. Firestore security rules don't allow user A to
// write user B's doc, so the transaction silently failed for the
// cross-user update — even after the polling query had found a valid
// peer. User saw "1 other debater in your queue" forever, then the AI
// fallback kicked in at 60s.
//
// Fix: move the pair operation to a Netlify function with admin SDK
// credentials. Admin writes bypass Firestore rules so the function can
// update both queue docs atomically. Both clients' onSnapshot
// listeners on their own queue doc still fire on the update; the
// existing client-side navigation flow (subscribeMyDoc → location.href
// /live-round) is unchanged.
//
// Auth: requires a signed-in Firebase ID token (the caller's). We
// trust the caller's uid from the verified token, NOT from the body.
// Body only supplies peerUid + format (for format-mismatch defense).
//
// CONSENT HANDSHAKE (2026-06-12) / READY-CHECK (2026-08-10). EVERY
// foreground pair lands in a two-phase state instead of matching
// instantly, and both sides must affirmatively accept before a room
// opens. Two jobs share the one gate:
//   - PRESENCE. Proving a human is actually at the keyboard before a
//     round doc goes live. This is the 2026-08-10 addition and it is
//     why the gate is now unconditional; see the measurement in the
//     needsConsent block below.
//   - CONSENT. A judge-paradigm note (`paradigm` on the queue doc: how
//     the AI judge should weigh the round) only ever reaches the judge
//     with BOTH debaters' eyes on it, and a cross-format pair never
//     silently forces one side into the other's format.
// Phases:
//   phase 1 (action 'pair', default): both docs get status 'consent'
//     with every matched-shape field already in place (room, sides,
//     names, pairedFormat) plus `paradigms` (note per uid), `consents`
//     (per-uid booleans, BOTH starting false), and `readyCheck` (true
//     when there is nothing to review, so the client renders a plain
//     "are you there" card instead of a review card). Clients render
//     off their own doc snapshot.
//   phase 2 (action 'consent'): accept flips my consent flag; when
//     both are true the docs flip to status 'matched' and the agreed
//     notes collapse into `pairedParadigm` (name-attributed, what
//     /live-round feeds the ballot). Pass/timeout reverts both docs
//     to 'waiting' with a mutual `skipUids` entry so the queue doesn't
//     immediately re-propose the same pair.
// Background-matched sessions (js/notifications.js "Spar live") have
// no consent surface — those pairs complete instantly and any notes
// stay OUT of the round rather than ride along unconsented.

const VALID_FORMATS = new Set([
  'quick','apda','bp','worlds','asian','ld','pf','policy','congress','casual',
]);

// Judge-paradigm note hygiene: single line, hard cap, control chars
// out. The cap plus the consent gate (the opponent reads the exact
// note before the round exists) are the injection defense; live-round
// adds its own "a note never names a winner" guard on the judge side.
const PARADIGM_MAX = 240;
function cleanParadigm(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PARADIGM_MAX);
}

// Queue docs are user-writable. Copy only the compact, enumerated avatar
// fields needed by a peer's match card. Camera frames and account-only look
// names never pass through matchmaking.
// Rebuilt from the shared allow-list in lib/avatar-design.mjs. This used
// to be a local copy of those keys, which fell behind the designer and
// rewrote people's saved avatars to the defaults.

// The agreed-paradigm string /live-round passes into the ballot
// prompt. Name-attributed so the judge can tell whose lens is whose
// when both sides filed one.
function buildPairedParadigm(paradigms, doc) {
  const notes = [];
  const proNote = cleanParadigm(paradigms?.[doc.proUid]);
  const conNote = cleanParadigm(paradigms?.[doc.conUid]);
  if (proNote) notes.push((doc.proName || 'Pro') + ': ' + proNote);
  if (conNote) notes.push((doc.conName || 'Con') + ': ' + conNote);
  return notes.join(' | ');
}

// Per-key throttle so a misbehaving client can't fan out pair attempts.
// Pair polling and consent clicks get SEPARATE keys: the client polls
// pair attempts every ~2s, and sharing one 600ms window meant a human's
// Accept click landing within 600ms of a poll POST got eaten by a 429
// (the card sat dead until a timer unwound the whole proposal). Consent
// is a one-shot human action — its window only needs to stop a spammer.
const pairAttempts = new Map();
const PAIR_THROTTLE_MS = 600;    // pair polling: one attempt every ~0.6s
const CONSENT_THROTTLE_MS = 250; // consent clicks: stop a runaway loop, never a human

function isThrottled(key, windowMs = PAIR_THROTTLE_MS) {
  const now = Date.now();
  const last = pairAttempts.get(key) || 0;
  if (now - last < windowMs) return true;
  pairAttempts.set(key, now);
  return false;
}

// Garbage-collect the throttle map every 5 min.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [uid, t] of pairAttempts) {
    if (t < cutoff) pairAttempts.delete(uid);
  }
}, 5 * 60 * 1000);

// Stale-doc thresholds. iOS Safari often doesn't fire `pagehide` when
// the user backgrounds the tab, so phone sessions leave ghost
// `status: 'waiting'` docs in the queue. The client polls oldest-first
// (joinedAt ASC), so without a stale filter the user's pair attempts
// would always target a ghost while the real peer sits behind it in
// the queue. STALE_PEER_MS is the per-call peer-doc skip; REAPER_MS
// is the broader sweep cutoff (more permissive — those docs are
// definitely abandoned).
const STALE_PEER_MS = 3 * 60 * 1000;   // 3 min: well past the 60s AI fallback
// Passed-proposal skips EXPIRE. A skip exists so a declined pair isn't
// re-proposed in a loop, not to permanently blind two debaters to each
// other; at ~10 DAU a permanent mutual skip deadlocks the whole queue
// ("1 in queue" forever, no spawn). 5 min is long enough to not nag
// within a sitting, short enough to self-heal.
// 2026-08-24 (Aidan): 5 min was long enough that a misclick cost you the
// only other person awake. Two minutes, but a SECOND pass on the same
// person stops expiring: once is a slip, twice is an answer.
const SKIP_TTL_MS = 2 * 60 * 1000;
const SKIP_HARD_COUNT = 2;
// A match that actually opened a room blocks re-offering for a round's
// length. Without this the pair you just entered a room with is still
// eligible, sorts to the front by joinedAt, and gets proposed back to you
// while you are literally in the room with them.
const MATCH_SKIP_TTL_MS = 30 * 60 * 1000;
const REAPER_MS     = 6 * 60 * 1000;   // 6 min: anything older is obviously dead
const REAPER_THROTTLE_MS = 60 * 1000;  // run the sweep at most once a minute
let lastReaperAt = 0;

// Returns the queue doc's joinedAt in epoch-ms. CRITICAL: an
// unresolved/missing timestamp means "just written" (Firestore
// serverTimestamp() lands as null on the local write and resolves a
// beat later on the server), NOT "epoch 0". Returning 0 here was the
// pairing bug: peerAgeMs = Date.now() - 0 ≈ 57 years > STALE_PEER_MS,
// so a freshly-queued peer got judged a ghost and force-cancelled the
// instant two users joined within ~1s of each other. Default to "now"
// (age ≈ 0 = fresh) so we never cancel a peer we can't age. The reaper
// query (joinedAt < cutoff) skips unresolved-timestamp docs anyway.
function tsMs(t) {
  if (!t) return Date.now();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t._seconds != null) return t._seconds * 1000;
  if (t.seconds != null) return t.seconds * 1000;
  return Date.now();
}
function skipActive(data, uid) {
  const skips = Array.isArray(data?.skipUids) ? data.skipUids : [];
  if (!skips.includes(uid)) return false;
  // Passed on twice: permanent, never re-proposed.
  const passes = Number(data?.skipCount && data.skipCount[uid]) || 0;
  if (passes >= SKIP_HARD_COUNT) return true;
  // Currently in a room together.
  const matchAt = data?.matchSkipAt && data.matchSkipAt[uid];
  if (matchAt && (Date.now() - tsMs(matchAt)) <= MATCH_SKIP_TTL_MS) return true;
  const at = data?.skipAt && data.skipAt[uid];
  const t = tsMs(at);
  if (!t) return false;              // no stamp (legacy doc) = expired
  return (Date.now() - t) <= SKIP_TTL_MS;
}

function blocked(data, uid) {
  const list = Array.isArray(data?.blockedUids) ? data.blockedUids : [];
  return list.includes(uid);
}

// ── Age bands (2026-08-22, hardened same day) ───────────────────────
// Live pairing separates attested minors from adults. The band is a
// one-time self-attestation collected at the queue door
// (js/age-gate.js) and recorded SERVER-SIDE, write-once, in
// age_bands/{uid} via /api/age-band. The localStorage copy and the
// queue doc's `ageBand` field survive only as paint hints and
// client-side pre-filters; nothing here reads either.
//
// The first version of this gate (earlier the same day) read the band
// off the queue doc and argued that "both forgery directions reduce to
// lying about your age, which no storage location fixes." That was
// wrong in the one direction that matters: with a client-written
// field, an adult never has to lie at all — they attest adult on their
// account and flip `ageBand:'minor'` on the queue doc from devtools,
// per round, with no record anywhere. With a server record the
// question is answered once, permanently, on the account: an adult who
// wants into the teen pool must band their WHOLE account as a minor
// (which also locks them out of adult rounds), and the false
// attestation is on the record for any later safety review. The
// founder chose the hardening on exactly that reasoning.
//
// Both sides must have a record before any pair is proposed. The
// caller without one gets 403 AGE_BAND_REQUIRED (new clients self-heal
// by re-POSTing their stored answer; the modal covers a genuinely
// unanswered account). A peer without one is skipPeer'd — their own
// next pair attempt heals them. Attestation is still the ceiling of
// what a site can know without ID checks, and a fresh account can
// still lie at the door; /safety says so in as many words.
//
// Bands are write-once at the endpoint, which is what makes this
// warm-instance cache safe: a value that cannot change cannot go
// stale. A missing band is never cached, so attesting takes effect on
// the next attempt.
//
// Failure posture is the REVERSE of the guest lane's. Guest reads fail
// open because undercounting costs one free round; an age read fails
// CLOSED (refuse this attempt, client polls on) because pairing across
// the band line is the one outcome this layer exists to prevent.
const AGE_BANDS = new Set(['minor', 'adult']);
const bandCache = new Map();

async function getAgeBand(db, uid) {
  if (bandCache.has(uid)) return bandCache.get(uid);
  const snap = await db.collection('age_bands').doc(uid).get();
  const band = snap.exists ? String(snap.data()?.band || '') : '';
  if (!AGE_BANDS.has(band)) return null;
  if (bandCache.size > 5000) bandCache.clear();
  bandCache.set(uid, band);
  return band;
}

function joinedAtMs(data) {
  return data ? tsMs(data.joinedAt) : Date.now();
}

// ── The guest lane ────────────────────────────────────────────────
//
// 2026-08-23 (the founder, FIFTH flip on this gate: "actually require
// google or gmail sign in to use the live omegle debating feature ... we
// need conversion to be much better"): the guest allowance is ZERO. Live
// pairing requires a named account again, which restores the 2026-08-18
// posture and closes the 2026-08-19 two-round trial. The call is about
// sign-ups: a guest who plays two rounds and bounces leaves nothing — no
// account, no way to reach them, no record they can come back to. The
// gate shows who is waiting live (see /api/spar-queue) so the ask is
// "sign in and meet them", not a wall in front of an empty room, and the
// /spar client now pops the sign-in chooser on arrival.
//
// The metering machinery below is deliberately KEPT, not deleted: setting
// GUEST_FREE_ROUNDS=2 in the Netlify env re-opens the trial with no deploy,
// and guest_rounds/ keeps its history. With the allowance at 0 a guest is
// refused before any Firestore read (see the handler), so the lane costs
// nothing while it is off.
//
// Metered here rather than in the client because the client cannot hold a
// limit: localStorage clears, and the counter it used to keep was the same
// counter /practice's free round used to keep, which is why that one moved
// server-side (e874e61e). The identity metered is the anonymous Firebase
// uid, which survives a storage clear, and linking it to a real account on
// sign-in KEEPS the uid, so a guest who converts keeps their record.
const GUEST_FREE_ROUNDS = Number(process.env.GUEST_FREE_ROUNDS || 0);

// One doc per guest uid: { anonymous, rounds, firstSeenAt, lastRoundAt }.
// `anonymous` is written from the VERIFIED token, never from the queue doc,
// which is client-written and therefore forgeable. That matters because the
// side that finalizes a match has to charge the other side too, and the only
// thing it can trust about them is what the server itself recorded on one of
// their own authenticated calls. Every guest makes such a call before a room
// can open: the consent handshake is mandatory (needsConsent is true for all
// pairs), so both sides POST here with their own token before anyone walks
// into a round.
const GUEST_COLLECTION = 'guest_rounds';

function guestRef(db, uid) {
  return db.collection(GUEST_COLLECTION).doc(uid);
}

// Rounds this uid has spent as a guest. Returns 0 for a uid with no doc,
// which is every named account and every guest who has not matched yet.
// Fails OPEN (0): if Firestore is unreachable the pair should still happen.
// Undercounting a guest costs us one round; refusing on a read error costs
// us the visitor.
async function guestRoundsUsed(db, uid) {
  if (!uid) return 0;
  try {
    const snap = await guestRef(db, uid).get();
    if (!snap.exists) return 0;
    return Number(snap.data()?.rounds || 0);
  } catch (err) {
    console.warn('[spar-pair] guest read failed:', err?.message || err);
    return 0;
  }
}

// Record that this uid is a guest, so the peer side can find that out later
// without trusting a client-written field.
//
// AWAITED, deliberately. The first version fired this off unawaited on the
// reasoning that it only had to land before the round opened, and the consent
// handshake is several round-trips long. That reasoning is wrong on Lambda:
// the execution context is frozen when the handler returns, so an unawaited
// write is not deferred, it is abandoned. Observed on the first production
// guest match, where the doc showed up only because a LATER request happened
// to rewrite it. A missed mark is a peer that chargeMatchedGuests cannot
// identify as a guest, which is a free uncharged round.
//
// The Set keeps the cost at one write per guest per warm instance rather than
// one per POST. A cold start re-marks once; the write is a merge, so a repeat
// is harmless.
const markedGuests = new Set();

async function markGuest(db, uid) {
  if (markedGuests.has(uid)) return;
  try {
    await guestRef(db, uid).set({
      anonymous: true,
      firstSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    markedGuests.add(uid);
    if (markedGuests.size > 5000) markedGuests.clear();
  } catch (err) {
    // Fails open: not being able to record the mark must not refuse a round.
    console.warn('[spar-pair] guest mark failed:', err?.message || err);
  }
}

// Charge one round. Called only when a room actually opens, never when a
// proposal is merely accepted: a guest who accepts and then gets stood up by
// a no-show peer has not had their round, and burning the allowance on that
// would spend both free rounds without the guest ever meeting anybody.
function chargeGuestRound(db, uid) {
  return guestRef(db, uid).set({
    anonymous: true,
    rounds: FieldValue.increment(1),
    lastRoundAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(function (err) {
    console.warn('[spar-pair] guest charge failed:', err?.message || err);
  });
}

// Charge both sides of a match that just opened a room. My own side is known
// from the verified token. The peer's side is read from the server's own
// record, written by markGuest on one of THEIR authenticated calls — never
// from their queue doc, whose `anonymous` field the client writes and could
// therefore lie about to buy extra rounds.
async function chargeMatchedGuests(db, myUid, iAmGuest, peerUid) {
  const jobs = [];
  if (iAmGuest) jobs.push(chargeGuestRound(db, myUid));
  try {
    const snap = await guestRef(db, peerUid).get();
    if (snap.exists && snap.data()?.anonymous) jobs.push(chargeGuestRound(db, peerUid));
  } catch (err) {
    console.warn('[spar-pair] peer charge lookup failed:', err?.message || err);
  }
  await Promise.allSettled(jobs);
}

// True when the server has recorded this uid as a guest AND their allowance
// is gone. Used on the PEER side, so it must read the server's own record
// rather than the peer's queue doc.
async function guestSpent(db, uid) {
  if (!uid) return false;
  try {
    const snap = await guestRef(db, uid).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    return !!data.anonymous && Number(data.rounds || 0) >= GUEST_FREE_ROUNDS;
  } catch (err) {
    console.warn('[spar-pair] guest peer read failed:', err?.message || err);
    return false;
  }
}

// Dead-tab detection inside a consent handshake. The DECIDING side's
// client auto-passes at 20s; if a proposal is older than this and the
// peer still hasn't acted, their tab is gone (tab close no longer
// deletes the queue doc — the queue follows users across the app — so
// consent proposals against ghosts are a routine case, not an edge).
// Must stay above the 20s deciding window plus network slop, and below
// the waiting side's 30s client timer that triggers the check.
const GHOST_CONSENT_MS = 25 * 1000;

// One-shot reaper sweep. Marks any waiting doc older than REAPER_MS
// as cancelled so the next polling cycle stops seeing it. Throttled
// to once per minute across the whole function instance — multiple
// concurrent pair attempts share the rate-limit. Fails open (logs +
// continues) so a reaper hiccup never blocks a real pair.
async function reapStaleDocs(db) {
  const now = Date.now();
  if (now - lastReaperAt < REAPER_THROTTLE_MS) return;
  lastReaperAt = now;
  try {
    const cutoffDate = new Date(now - REAPER_MS);
    // Firestore Timestamp comparison: pass a JS Date and the SDK
    // coerces both sides. limit(40) caps the burst so we don't
    // accidentally write hundreds of docs on a cold queue. The second
    // query sweeps 'consent' docs whose BOTH clients died mid-handshake
    // (live clients unwind a stalled proposal themselves within ~45s);
    // same (status, joinedAt) composite index serves both.
    const [waitSnap, consentSnap] = await Promise.all([
      db.collection('matchmaking_queue')
        .where('status', '==', 'waiting')
        .where('joinedAt', '<', cutoffDate)
        .limit(40)
        .get(),
      db.collection('matchmaking_queue')
        .where('status', '==', 'consent')
        .where('joinedAt', '<', cutoffDate)
        .limit(40)
        .get(),
    ]);
    const docs = [...waitSnap.docs, ...consentSnap.docs];
    if (!docs.length) return;
    const batch = db.batch();
    docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancelReason: 'stale_reaper',
      });
    });
    await batch.commit();
    console.log('[spar-pair] reaped', docs.length, 'stale queue docs');
  } catch (err) {
    // Most likely cause if this fails: missing composite index on
    // (status, joinedAt). Log clearly so the build owner can add it.
    console.warn('[spar-pair] reaper failed (likely missing composite index status+joinedAt):', err?.message || err);
  }
}

function shortName(profile) {
  const full = String(profile?.displayName || profile?.name || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
  }
  return parts[0] || 'Anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('[spar-pair] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const myUid = decoded.sub;
  if (!myUid) return errorResponse('Invalid token subject', 401, request);

  const db = getDb();
  const iAmGuest = decoded.firebase?.sign_in_provider === 'anonymous';

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || 'pair');
  const peerUid = String(body?.peerUid || '').trim();
  const format = String(body?.format || '').trim().toLowerCase();
  // Separate throttle lanes — see the isThrottled comment. A consent
  // click must never 429 because the queue poller POSTed recently.
  if (action === 'consent') {
    if (isThrottled(myUid + ':consent', CONSENT_THROTTLE_MS)) {
      return errorResponse('Consent attempts throttled. Wait a moment.', 429, request);
    }
  } else if (isThrottled(myUid)) {
    return errorResponse('Pair attempts throttled. Wait a moment.', 429, request);
  }

  if (!peerUid || peerUid === myUid) {
    return errorResponse('Invalid peerUid', 400, request);
  }

  // The guest lane (see GUEST_FREE_ROUNDS above). Replaces the flat 403 that
  // stood here from 2026-08-18 to 2026-08-19. A guest is metered, not
  // refused, until the allowance is gone; then the refusal is a 403 the
  // client turns into the sign-in card, tagged so the wall's conversion rate
  // is measured rather than assumed.
  //
  // Placed BELOW the throttle on purpose: this is the one check in the
  // function that costs a Firestore read, and above the throttle a POST loop
  // would buy one read per request from an identity that is free to mint.
  //
  // 403 and not 429 for the same reason /api/claude's wall is 401 and not
  // 429: waiting does not clear it. Nothing about tomorrow gives this uid
  // another free round, so the response has to say "make an account" rather
  // than imply patience.
  if (iAmGuest) {
    // Allowance 0 (the 2026-08-23 default): refuse before the Firestore
    // read, so a guest POST loop costs the throttle and nothing else.
    const used = GUEST_FREE_ROUNDS > 0 ? await guestRoundsUsed(db, myUid) : 0;
    if (used >= GUEST_FREE_ROUNDS) {
      return jsonResponse({
        error: 'Live rounds need an account. Sign in to join the queue.',
        code: 'SIGN_IN_REQUIRED',
        guestRoundsUsed: used,
        guestFreeRounds: GUEST_FREE_ROUNDS,
      }, 403, request);
    }
    await markGuest(db, myUid);
  }
  if (action === 'pair' && !VALID_FORMATS.has(format)) {
    return errorResponse('Invalid format', 400, request);
  }

  const queue = db.collection('matchmaking_queue');
  const myRef = queue.doc(myUid);
  const peerRef = queue.doc(peerUid);

  // ── action: 'consent' — phase 2 of the handshake ───────────────
  if (action === 'consent') {
    const accept = !!body?.accept;
    // True when a client TIMER fired this decline (auto-pass nets),
    // false for a human clicking Pass/Withdraw. Timers feed the
    // ghost-cancel heuristic below; human passes never do.
    const auto = !!body?.auto;
    // Everything a revert needs to put a doc back in the plain
    // 'waiting' shape. joinedAt refreshes so neither side gets
    // stale-skipped for time burned inside the consent window.
    const revert = {
      status: 'waiting',
      joinedAt: FieldValue.serverTimestamp(),
      room: FieldValue.delete(),
      proposedAt: FieldValue.delete(),
      proUid: FieldValue.delete(),
      conUid: FieldValue.delete(),
      proName: FieldValue.delete(),
      conName: FieldValue.delete(),
      pairedMotion: FieldValue.delete(),
      pairedFormat: FieldValue.delete(),
      pairedParadigm: FieldValue.delete(),
      paradigms: FieldValue.delete(),
      consents: FieldValue.delete(),
      readyCheck: FieldValue.delete(),
      matchedWith: FieldValue.delete(),
      matchedWithName: FieldValue.delete(),
      matchedWithPhoto: FieldValue.delete(),
      matchedWithAvatar: FieldValue.delete(),
      lastPassBy: FieldValue.delete(),
      lastPassAt: FieldValue.delete(),
    };
    try {
      const result = await db.runTransaction(async (tx) => {
        const [mineSnap, theirsSnap] = await Promise.all([
          tx.get(myRef),
          tx.get(peerRef),
        ]);
        if (!mineSnap.exists) return { ok: false, reason: 'consent_state_gone' };
        const mine = mineSnap.data();
        const theirs = theirsSnap.exists ? theirsSnap.data() : null;
        if (mine.status !== 'consent' || mine.matchedWith !== peerUid) {
          return { ok: false, reason: 'consent_state_gone' };
        }
        // Peer evaporated mid-handshake (tab close deletes the queue
        // doc; pagehide fires for live navigations too). Free MYSELF
        // unilaterally — there is no proposal left to act on.
        if (!theirs || theirs.status !== 'consent' || theirs.matchedWith !== myUid) {
          tx.update(myRef, { ...revert, skipUids: FieldValue.arrayUnion(peerUid), ['skipAt.' + peerUid]: FieldValue.serverTimestamp() });
          return { ok: true, freed: true };
        }
        if (!accept) {
          // Ghost detection: my idle timer fired, the peer never acted
          // on a proposal older than the deciding window, so their tab
          // is dead (a live deciding client auto-passes at 20s). Cancel
          // the ghost instead of reverting it to 'waiting' with a FRESH
          // joinedAt — that revert would dress a corpse up as the
          // youngest doc in the queue and feed it to the next pairer.
          // If the "ghost" is actually alive with a stalled snapshot
          // stream, its client sees cancelReason 'consent_ghost' and
          // the system-cancel path re-queues it with a clean doc.
          const proposalAge = Date.now() - tsMs(mine.proposedAt);
          const peerNeverActed = !(mine.consents && mine.consents[peerUid]);
          if (auto && peerNeverActed && proposalAge > GHOST_CONSENT_MS) {
            tx.update(myRef, { ...revert, skipUids: FieldValue.arrayUnion(peerUid), ['skipAt.' + peerUid]: FieldValue.serverTimestamp() });
            tx.update(peerRef, {
              status: 'cancelled',
              cancelledAt: FieldValue.serverTimestamp(),
              cancelReason: 'consent_ghost',
            });
            return { ok: true, declined: true, ghosted: true };
          }
          // Mutual skip so polling doesn't re-propose the same pair in
          // a loop. lastPassBy on the PEER doc tells their client who
          // walked, for the "still searching" note.
          // A timer-fired decline is nobody's decision. Reverting with a
          // mutual skip used to deadlock the two real humans most likely
          // to match ("1 in queue", green dot, no spawn, forever). Only a
          // HUMAN pass earns a skip, and even that expires (SKIP_TTL_MS).
          if (auto) {
            tx.update(myRef, revert);
            tx.update(peerRef, revert);
            return { ok: true, declined: true, autoReverted: true };
          }
          tx.update(myRef, {
            ...revert,
            skipUids: FieldValue.arrayUnion(peerUid),
            ['skipAt.' + peerUid]: FieldValue.serverTimestamp(),
            ['skipCount.' + peerUid]: FieldValue.increment(1),
          });
          tx.update(peerRef, {
            ...revert,
            skipUids: FieldValue.arrayUnion(myUid),
            ['skipAt.' + myUid]: FieldValue.serverTimestamp(),
            ['skipCount.' + myUid]: FieldValue.increment(1),
            lastPassBy: shortName(mine),
            lastPassAt: FieldValue.serverTimestamp(),
          });
          return { ok: true, declined: true };
        }
        const consents = { ...(mine.consents || {}) };
        consents[myUid] = true;
        if (!consents[peerUid]) {
          // I'm in; the peer still has my note to read. Mirror the flag
          // onto both docs so both clients can render progress.
          tx.update(myRef, { consents });
          tx.update(peerRef, { consents });
          return { ok: true, pending: 'peer' };
        }
        // Both sides in — finalize. Every matched-shape field was
        // already written in phase 1; this flip is what subscribeMyDoc
        // navigates on.
        const finals = {
          status: 'matched',
          matchedAt: FieldValue.serverTimestamp(),
          consents,
          pairedParadigm: buildPairedParadigm(mine.paradigms, mine),
        };
        // Per-side, not in `finals`: each doc skips the OTHER uid. This is
        // what stops the matcher handing you back the person you are in a
        // room with the moment either side requeues.
        tx.update(myRef, {
          ...finals,
          skipUids: FieldValue.arrayUnion(peerUid),
          ['matchSkipAt.' + peerUid]: FieldValue.serverTimestamp(),
        });
        tx.update(peerRef, {
          ...finals,
          skipUids: FieldValue.arrayUnion(myUid),
          ['matchSkipAt.' + myUid]: FieldValue.serverTimestamp(),
        });
        return { ok: true, matched: true, room: mine.room };
      });
      // The room just opened, so this is where guest rounds are spent — one
      // per guest side, charged once. Only the second acceptor's request
      // reaches this line (the first got pending:'peer' above, and a re-POST
      // after the flip fails the status guard inside the transaction), so
      // there is exactly one charge per side per match.
      if (result?.matched) await chargeMatchedGuests(db, myUid, iAmGuest, peerUid);
      return jsonResponse(result, 200, request);
    } catch (err) {
      console.error('[spar-pair] consent transaction error:', err?.message || err);
      return errorResponse('Consent transaction failed: ' + (err?.message || 'unknown'), 500, request);
    }
  }

  // Room name: lex-sorted UID pair PLUS a per-match suffix. Both
  // clients read the room off their own queue doc (the server is the
  // only author; no client computes this name), so the suffix cannot
  // break convergence. The suffix is the fix for the rematch trap
  // (2026-08-23): a purely deterministic pair name meant the same two
  // people always landed back in the SAME live_rounds doc, so a
  // rematch a day later opened onto the old completed round with the
  // old ballot instead of a fresh round. Repeat 'pair' POSTs are safe:
  // the transaction only writes the room while BOTH docs are still
  // 'waiting' (anything else returns lost_race), so an in-flight
  // consent pair never gets its room renamed underneath it.
  // Don't propose to a guest whose allowance is gone. Their client should
  // have stopped queueing, but a doc can outlive the tab that wrote it, and
  // the cost of not checking is a real debater spending a 20-second consent
  // window on somebody who cannot be let into a room. `skipPeer` rather than
  // an error: this is a bad peer, not a bad request, and the caller's polling
  // loop should move to the next one.
  if (await guestSpent(db, peerUid)) {
    return jsonResponse({ ok: false, reason: 'peer_ineligible', skipPeer: peerUid }, 200, request);
  }

  // Age-band gate (see the block above the handler). Both sides need a
  // server-recorded band, and the bands must match, before a pair can
  // even be proposed. Checked from age_bands/{uid}, never the queue doc.
  let myBand, peerBand;
  try {
    [myBand, peerBand] = await Promise.all([
      getAgeBand(db, myUid),
      getAgeBand(db, peerUid),
    ]);
  } catch (err) {
    // Fail CLOSED: refuse this attempt, not the visitor. Soft reason so
    // the client's polling loop retries rather than surfacing a banner.
    console.warn('[spar-pair] age band read failed:', err?.message || err);
    return jsonResponse({ ok: false, reason: 'age_check_failed' }, 200, request);
  }
  if (!myBand) {
    // 403 not 429: waiting does not clear it. New clients self-heal by
    // POSTing their stored answer to /api/age-band and retrying; a
    // genuinely unanswered account gets the js/age-gate.js modal.
    return jsonResponse({
      error: 'One-time age check needed before live rounds.',
      code: 'AGE_BAND_REQUIRED',
    }, 403, request);
  }
  if (!peerBand) {
    // The peer's account has no recorded answer (a stale client, or a
    // doc written around the door). Their own next pair attempt heals
    // them; skip and poll on.
    return jsonResponse({ ok: false, reason: 'peer_ineligible', skipPeer: peerUid }, 200, request);
  }
  if (myBand !== peerBand) {
    // Stamp a skip on MY doc so the own-doc mirror stops tryMatch from
    // re-POSTing at the same cross-band peer every 2 seconds (skips
    // expire on SKIP_TTL_MS, costing one refused POST per 5 minutes).
    // Best effort: the refusal below is the enforcement, the stamp is
    // only the efficiency. Clients also pre-filter on the advisory
    // queue-doc band, so this mostly catches hint-less docs.
    try {
      await myRef.update({
        skipUids: FieldValue.arrayUnion(peerUid),
        ['skipAt.' + peerUid]: FieldValue.serverTimestamp(),
      });
    } catch (e) { /* never let the optimization block the refusal */ }
    return jsonResponse({ ok: false, reason: 'age_mismatch', skipPeer: peerUid }, 200, request);
  }

  const pair = [myUid, peerUid].sort();
  const room = 'SparMatch-' + pair[0].slice(0, 8) + '-' + pair[1].slice(0, 8)
    + '-' + Date.now().toString(36);
  const proUid = pair[0];
  const conUid = pair[1];

  // Fire the stale-doc reaper on the side. We don't await because the
  // user's polling loop will pick the cleaner queue on its next tick
  // anyway, and we'd rather not stack reaper latency on top of the
  // pair transaction's own round-trip.
  reapStaleDocs(db);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [mineSnap, theirsSnap] = await Promise.all([
        tx.get(myRef),
        tx.get(peerRef),
      ]);

      if (!mineSnap.exists || !theirsSnap.exists) {
        return { ok: false, reason: 'queue_doc_missing' };
      }
      const mine = mineSnap.data();
      const theirs = theirsSnap.data();
      if (mine.status !== 'waiting' || theirs.status !== 'waiting') {
        return { ok: false, reason: 'lost_race' };
      }
      // Stale-peer skip. The client's polling sorts oldest-first, so
      // without this filter every pair attempt would target the oldest
      // ghost in the queue (likely an iOS Safari session that didn't
      // fire pagehide) while the real live peer sits behind it. Mark
      // the ghost as cancelled and ask the client to retry; on the
      // next tick its polling will sort to a fresher peer.
      const peerAgeMs = Date.now() - joinedAtMs(theirs);
      if (peerAgeMs > STALE_PEER_MS) {
        tx.update(peerRef, {
          status: 'cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: 'stale_peer_skip',
        });
        return { ok: false, reason: 'stale_peer' };
      }
      // Format preferences are proposals, not matching filters. If the
      // two queued formats differ, route the pair through the consent
      // handshake so the proposed format is accepted before the round.
      const formatMatches = mine.format === theirs.format;
      // Mutual-skip defense: a passed proposal earlier in this queue
      // session means these two don't get re-proposed to each other.
      if (skipActive(mine, peerUid) || skipActive(theirs, myUid)) {
        return { ok: false, reason: 'skipped_peer' };
      }
      if (blocked(mine, peerUid) || blocked(theirs, myUid)) {
        return { ok: false, reason: 'blocked_peer' };
      }
      // Age separation is enforced BEFORE this transaction, from the
      // server's own age_bands records (see the gate above). The queue
      // docs' ageBand fields are client-written hints and are
      // deliberately not consulted here: a forged hint must never be
      // able to refuse or permit what the recorded answer decides.

      const myShort = shortName(mine);
      const peerShort = shortName(theirs);
      // Opponent avatar for the match card. Queue docs carry the
      // signed-in user's photoURL (anon guests have ''). Each side is
      // written the OTHER side's photo so the "vs {name}" card can show
      // who they're about to debate.
      const myPhoto = String(mine.photoURL || '');
      const peerPhoto = String(theirs.photoURL || '');
      const myAvatar = cleanAvatarIdentity(mine.avatarIdentity);
      const peerAvatar = cleanAvatarIdentity(theirs.avatarIdentity);
      // Older joiner's motion wins (theirs is older because the
      // poller sorted oldest-first). Both clients read pairedMotion
      // from their now-matched queue doc so the casual-room banner
      // shows the SAME motion on both sides. Falls back to the new
      // joiner's motion if the older joiner didn't supply one, then
      // empty string for non-casual pairings that don't pass a
      // motion at all (/spar). Capped to 280 chars to match the
      // client-side write cap.
      const pairedMotion = String(theirs.motion || mine.motion || '').slice(0, 280);
      // Older joiner's format wins for cross-format proposal pairs (same
      // rule as pairedMotion) so both clients spawn /live-round with the
      // SAME speech structure + judge rules instead of each side using
      // its own local format preference.
      const theirFormat = String(theirs.format || '').toLowerCase();
      const myFormat = String(mine.format || '').toLowerCase();
      const pairedFormat = VALID_FORMATS.has(theirFormat) ? theirFormat : format;
      // Cross-format pair: the two debaters proposed different styles.
      // We don't silently force the older joiner's format on the newer
      // one. crossFormat routes the pair through the same consent
      // handshake as judge-paradigm notes, with a "they prefer X, OK?"
      // card on both sides.
      const crossFormat = !formatMatches;
      const common = {
        room,
        proUid,
        conUid,
        proName: proUid === myUid ? myShort : peerShort,
        conName: conUid === myUid ? myShort : peerShort,
        pairedMotion,
        pairedFormat,
        crossFormat,
      };

      // Judge-paradigm notes ride through the same gate: a note only
      // ever reaches the judge with both debaters' eyes on it.
      const myParadigm = cleanParadigm(mine.paradigm);
      const theirParadigm = cleanParadigm(theirs.paradigm);
      // READY-CHECK (2026-08-10): the gate fires for EVERY pair, not
      // just ones carrying a judge note or a format conflict.
      //
      // Measured on 411 live rounds: only ~85 ever had both people
      // actually present, 215 had exactly one, and 390 never completed a
      // single speech (median room lifetime 1.5 min). Names are written
      // at match time, not arrival, so the round doc looked complete
      // while one side had never walked in. The product was not losing
      // people mid-round or at the ballot: past speech one, ~43% of
      // rounds finish. It was matching them against nobody.
      //
      // So presence has to be proven before a room opens.
      //
      // BACKGROUND SESSIONS NO LONGER SKIP THE GATE (2026-08-12). The
      // original exemption said js/notifications.js had "no consent
      // surface to render", which was not true: it has always shown a
      // 20-second accept/decline overlay. It simply was not wired into
      // the handshake, so the pair flipped straight to 'matched' and
      // the FOREGROUND side navigated into the room ~0.9s later while
      // the background side still had an un-clicked popup. When that
      // popup timed out, the foreground debater had already been alone
      // in the room for 19 seconds. That is the empty-room bug the
      // ready-check was built to stop, arriving through the one door
      // the ready-check left open.
      //
      // Measured before this change: 27 of 60 live queue docs carried
      // background:true, so roughly 70% of pairs included at least one
      // and bypassed the gate entirely. Post-ready-check rounds where
      // both debaters actually arrived: 17.1%, against 23.4% before it
      // — i.e. the gate was not reaching the pairs that needed it.
      //
      // Every caller must now handle status 'consent'. spar.html always
      // did; js/notifications.js and debate-chat.html were taught to in
      // the same commit as this line. A caller that cannot render the
      // card leaves its users spinning until the reaper sweeps them,
      // which is exactly what /debate-chat did from 2026-08-10 until
      // this commit.
      const readyCheck = !(myParadigm || theirParadigm) && !crossFormat;
      const needsConsent = true;

      if (needsConsent) {
        const proposal = {
          ...common,
          status: 'consent',
          proposedAt: FieldValue.serverTimestamp(),
          // Re-stamp joinedAt so the reaper's consent sweep measures
          // from the PROPOSAL, not each side's original queue join —
          // otherwise a long-waiting joiner could get swept mid-
          // handshake while their fresh peer survives, splitting the
          // pair into two half-states.
          joinedAt: FieldValue.serverTimestamp(),
          paradigms: { [myUid]: myParadigm, [peerUid]: theirParadigm },
          readyCheck,
          // BOTH sides start false, always. The old rule auto-yessed the
          // side with nothing to review, which is exactly the side that
          // could be an empty chair: a debater who filed no note was
          // consented into a room without ever proving they were there.
          // Presence is the thing being checked now, so having nothing
          // to read no longer answers it.
          consents: { [myUid]: false, [peerUid]: false },
        };
        tx.update(myRef, {
          ...proposal,
          matchedWith: peerUid,
          matchedWithName: peerShort,
          matchedWithPhoto: peerPhoto,
          matchedWithAvatar: peerAvatar,
          myFormatPref: myFormat,
          peerFormat: theirFormat,
        });
        tx.update(peerRef, {
          ...proposal,
          matchedWith: myUid,
          matchedWithName: myShort,
          matchedWithPhoto: myPhoto,
          matchedWithAvatar: myAvatar,
          myFormatPref: theirFormat,
          peerFormat: myFormat,
        });
        return { ok: true, pending: 'consent', room, pairedFormat };
      }

      const matched = {
        ...common,
        status: 'matched',
        matchedAt: FieldValue.serverTimestamp(),
        pairedParadigm: '',
      };
      tx.update(myRef, {
        ...matched,
        matchedWith: peerUid,
        matchedWithName: peerShort,
        matchedWithPhoto: peerPhoto,
        matchedWithAvatar: peerAvatar,
        skipUids: FieldValue.arrayUnion(peerUid),
        ['matchSkipAt.' + peerUid]: FieldValue.serverTimestamp(),
      });
      tx.update(peerRef, {
        ...matched,
        skipUids: FieldValue.arrayUnion(myUid),
        ['matchSkipAt.' + myUid]: FieldValue.serverTimestamp(),
        matchedWith: myUid,
        matchedWithName: myShort,
        matchedWithPhoto: myPhoto,
        matchedWithAvatar: myAvatar,
      });

      return {
        ok: true,
        room,
        proUid,
        conUid,
        proName: common.proName,
        conName: common.conName,
        matchedWithName: peerShort,
        matchedWithPhoto: peerPhoto,
        matchedWithAvatar: peerAvatar,
        pairedFormat,
      };
    });

    // Same charge as the consent finalize above. needsConsent is currently
    // true for every pair so this path is unreachable today, but it is the
    // branch that opens a room without a second POST, so it has to charge or
    // the lane leaks the day that flag changes.
    if (result?.ok && !result.pending) await chargeMatchedGuests(db, myUid, iAmGuest, peerUid);

    // Web Push on a completed direct (background "Spar live") match. This is
    // exactly the away/closed case: a debater went available and walked off,
    // so a system push pulls them back. Server-side here = trusted, no client
    // relationship-check needed. Best-effort + awaited so the Lambda doesn't
    // freeze mid-send; sendToUser no-ops when VAPID isn't configured yet.
    if (result && result.ok && !result.pending && result.proUid && result.conUid) {
      try {
        const payload = { title: 'Match found', body: 'A debater is ready. Tap to accept.', url: '/spar', tag: 'da-spar-match' };
        await Promise.allSettled([ sendToUser(result.proUid, payload), sendToUser(result.conUid, payload) ]);
      } catch (e) { /* push is best-effort; never fail the pair on it */ }
    }

    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('[spar-pair] transaction error:', err?.message || err);
    return errorResponse('Pair transaction failed: ' + (err?.message || 'unknown'), 500, request);
  }
};
