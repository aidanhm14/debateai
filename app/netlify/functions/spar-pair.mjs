import identity from '../../js/public-identity.js';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import { sendToUser } from './lib/webpush.mjs';
import { cleanAvatarIdentity } from './lib/avatar-design.mjs';
import { resolveCaller } from './lib/caller.mjs';
import { buildMatchMotionContext, ensurePairMotion } from './lib/spar-motion-generation.mjs';
import { motionForPairArrival, draftConfigForPairMotion } from './lib/spar-motion-arrival.mjs';
import {
  cleanSparMatchProfile,
  hasPoliticalSignal,
  rankPoliticalCandidates,
  matchDeskDraftConfig,
} from './lib/spar-match-profile.mjs';
import {
  draftSeed, createDraft, advance as advanceDraft,
  applyOffer, applyResponse, applySidePick, autoResolve, draftResult, publicDraft,
} from './lib/motion-draft.mjs';

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
  'open','quick','apda','bp','worlds','asian','ld','pf','policy','congress','casual',
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

// ── motion draft ────────────────────────────────────────────────────
// THE DRAFT NO LONGER RUNS HERE. It ran on the queue docs for one day and
// the per-surface rollout was the bug: it needed draftOptIn on BOTH docs,
// only /spar set it, so any pair that included a background "Spar live"
// peer or a /debate-chat peer silently skipped the strike beat. Measured
// 2026-08-26, hours after it shipped: one round drafted, the next ran on
// an unvetoed motion, and nothing on either screen said why.
//
// Every one of those surfaces lands in /live-round, so the draft moved
// into the room (round-draft.mjs) where the entry surface stops mattering
// and no beat is racing a page navigation. This function's remaining job
// is the STAMP: it is the only party that knows a pair was matched off a
// random motion rather than one a human chose, and round-draft refuses to
// open a draft without it. Clients cannot write round_drafts, so the
// stamp cannot be claimed by a round that should keep its own motion.
const DRAFT_ENABLED = process.env.SPAR_DRAFT_ENABLED !== '0';

// Grace on the server's own clock check. The client runs the visible
// countdown, so its zero and ours are never the same instant; without slack
// an honest expire POST lands a second early and gets refused, and the round
// stalls on a beat both people already watched run out.
const DRAFT_EXPIRE_GRACE_MS = 1500;

// The only fields a resolved draft changes on the match. Side assignment
// stops being the lex-sorted uid pair from phase 1 and becomes the thing one
// debater actually chose, so proUid/conUid and their names are rewritten
// together. Returns null on an unfinished draft, which is what keeps a room
// from opening on a motion nobody settled.
function draftFinals(draft, mine, theirs, myUid, peerUid) {
  const res = draftResult(draft, myUid, peerUid);
  if (!res) return null;
  const myShort = shortName(mine);
  const peerShort = shortName(theirs);
  const nameOf = (uid) => (String(uid) === String(myUid) ? myShort : peerShort);
  return {
    pairedMotion: res.motion,
    proUid: res.proUid,
    conUid: res.conUid,
    proName: nameOf(res.proUid),
    conName: nameOf(res.conUid),
  };
}

function phaseAtMs(doc) {
  const at = doc && doc.draftPhaseAt;
  if (!at) return 0;
  if (typeof at.toMillis === 'function') return at.toMillis();
  if (at.seconds != null) return at.seconds * 1000;
  return 0;
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
// ("1 in queue" forever, no spawn). It has come down twice for the same
// reason: 5 min, then 2 min on 2026-08-24 because a misclick cost you the
// only other person awake, then 30s on 2026-09-08 (Aidan: "offer rematch
// with declined matches after 30 secodns actually not 2 mins").
//
// SKIP_HARD_COUNT IS WHAT MAKES 30s SAFE, so do not touch one without the
// other. A short TTL on its own would be a nag loop: pass, wait half a
// minute, meet the same person again, forever. The second pass on the
// same person never expires, so the loop can run exactly once. Once is a
// slip and the queue recovers from it in 30 seconds; twice is an answer
// and it is permanent.
const SKIP_TTL_MS = 30 * 1000;
const SKIP_HARD_COUNT = 2;
// A GHOST skip is not a decision anybody made: the peer's tab went quiet
// for a minute. 45s is long enough that a genuinely dead tab has been
// cancelled and swept before we look at it again, short enough that
// someone who was slow, asleep, or on a stalled snapshot stream can be
// met inside the same sitting. Stamped in its own map so a ghost can
// never be mistaken for a pass, or vice versa.
//
// NOTE, since 2026-09-08 this is LONGER than a human pass (45s vs 30s),
// which reads backwards and is deliberate. This number is not a penalty,
// it is the time it takes for a dead tab to be cancelled and swept; retry
// sooner and we just re-target the same ghost. The pass TTL is a product
// call about people, this one is a property of the reaper.
const GHOST_SKIP_TTL_MS = 45 * 1000;
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
  // A live ghost block wins; an EXPIRED one falls through rather than
  // returning, because the same pair may also carry a real human pass
  // that has not run out yet.
  const ghostAt = data?.ghostAt && data.ghostAt[uid];
  if (ghostAt && (Date.now() - tsMs(ghostAt)) <= GHOST_SKIP_TTL_MS) return true;
  const at = data?.skipAt && data.skipAt[uid];
  // Test the FIELD, not tsMs's return. tsMs defaults a missing stamp to
  // Date.now() on purpose (an unresolved serverTimestamp means "just
  // written", and reading it as epoch 0 is the bug that once cancelled
  // freshly-queued peers as ghosts). That default makes the old
  // `if (!t) return false` line unreachable, so a uid in skipUids with
  // no skipAt read as a permanently fresh skip — the exact opposite of
  // the comment that stood here. Latent before, reachable now: the
  // ghost path deliberately stamps ghostAt and no skipAt, so every
  // expired ghost would have fallen straight into it and hidden that
  // peer for good.
  if (!at) return false;             // no pass stamp at all = nothing blocking
  const t = tsMs(at);
  if (!t) return false;
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

// Providers that may hold a SEAT in a live video round. Keep in sync with
// create-daily-room.mjs and isLiveVideoAccount() in firestore.rules.
const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'apple.com', 'password']);

// New human matches require an account (2026-09-11). Guest history is
// retained in storage but never used to reject an account that has linked
// its old anonymous uid. The verified token and queue provider are the gate.

// Dead-tab detection inside a consent handshake. The DECIDING side's
// client auto-passes at 20s; if a proposal is older than this and the
// peer still hasn't acted, their tab is gone (tab close no longer
// deletes the queue doc — the queue follows users across the app — so
// consent proposals against ghosts are a routine case, not an edge).
// Must stay above the 20s deciding window plus network slop, and below
// the waiting side's 30s client timer that triggers the check.
// 2026-08-26: 25s -> 55s, following the decide window from 15s to 45s on
// both clients. The ordering is the whole contract and it is easy to
// break by tuning one number: decide (45s, /spar CONSENT_DECIDE_SEC and
// notifications.js COUNTDOWN_S) < ghost (55s, here) < the waiting side's
// net (75s). Drop this below the decide window and a live peer who is
// simply reading the card gets cancelled out of the queue as a corpse.
const GHOST_CONSENT_MS = 55 * 1000;
// 2026-09-04: when the proposal push actually reached the peer's device
// (push had never delivered before that day, see soul.md), the peer may be
// on a lock screen a minute away from the tab, and a 45s decide window
// cancels the match before they can get back. Both docs are stamped
// pinged:true after the send, and every window stretches together:
// decide 120s (client) < ghost 130s (here) < the waiting side's net 150s.
const GHOST_CONSENT_PINGED_MS = 130 * 1000;

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
  return identity.cleanName(profile?.displayName || profile?.name) || 'Anonymous';
}

const PRIVATE_CANDIDATE_LIMIT = 8;

function candidateUids(raw, myUid, fallbackUid) {
  const out = [];
  const seen = new Set([String(myUid || '')]);
  const add = (value) => {
    const uid = String(value || '').trim().slice(0, 160);
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push(uid);
  };
  for (const value of (Array.isArray(raw) ? raw : [])) {
    add(value);
    if (out.length >= PRIVATE_CANDIDATE_LIMIT) break;
  }
  add(fallbackUid);
  return out.slice(0, PRIVATE_CANDIDATE_LIMIT);
}

// Pick the best viewpoint match without returning anybody's political data
// to the browser. Queue docs contribute only a yes/no marker saying their
// private profile synced for THIS search. If sync failed, an old stored
// profile cannot silently keep steering new matches.
async function choosePrivateProfilePeer(db, myUid, fallbackUid, rawCandidates) {
  const uids = candidateUids(rawCandidates, myUid, fallbackUid);
  if (uids.length < 2) return String(fallbackUid || '');
  try {
    const queue = db.collection('matchmaking_queue');
    const profiles = db.collection('spar_match_profiles');
    const reads = await Promise.all([
      queue.doc(myUid).get(),
      profiles.doc(myUid).get(),
      ...uids.flatMap((uid) => [queue.doc(uid).get(), profiles.doc(uid).get()]),
    ]);
    const myQueue = reads[0].exists ? (reads[0].data() || {}) : {};
    const myProfile = reads[1].exists ? cleanSparMatchProfile(reads[1].data()) : null;
    if (myQueue.status !== 'waiting' || myQueue.matchProfileReady !== true
        || !myProfile || myProfile.matchMode !== 'viewpoint' || !hasPoliticalSignal(myProfile)) {
      return String(fallbackUid || '');
    }

    const candidates = [];
    for (let i = 0; i < uids.length; i++) {
      const queueSnap = reads[2 + i * 2];
      const profileSnap = reads[3 + i * 2];
      const queued = queueSnap.exists ? (queueSnap.data() || {}) : {};
      if (queued.status !== 'waiting' || queued.matchProfileReady !== true || !profileSnap.exists) continue;
      candidates.push({ uid: uids[i], profile: cleanSparMatchProfile(profileSnap.data()) });
    }
    const ranked = rankPoliticalCandidates(myProfile, candidates);
    return ranked.length ? ranked[0].uid : String(fallbackUid || '');
  } catch (err) {
    console.warn('[spar-pair] private profile ordering failed:', err?.message || err);
    return String(fallbackUid || '');
  }
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
  let peerUid = String(body?.peerUid || '').trim();
  const format = String(body?.format || '').trim().toLowerCase();
  // Separate throttle lanes — see the isThrottled comment. A consent
  // click must never 429 because the queue poller POSTed recently.
  if (action === 'consent' || action === 'solo') {
    // Draft moves share the consent lane, not the pair lane: both are human
    // clicks on a clock, and a 429 on either one strands a live handshake.
    if (isThrottled(myUid + ':consent', CONSENT_THROTTLE_MS)) {
      return errorResponse('Consent attempts throttled. Wait a moment.', 429, request);
    }
  } else if (isThrottled(myUid)) {
    return errorResponse('Pair attempts throttled. Wait a moment.', 429, request);
  }

  // ── action: 'solo' — the draft against the AI fallback ──────────────
  //
  // Stateless: no Firestore, no queue doc, no room. The queue timing out is
  // already the disappointing half of that moment, so the draft ritual stays
  // identical rather than degrading into a motion the machine picked.
  //
  // Two calls, and the split is the fairness argument. The first returns the
  // slate and a seed and NOT the AI's strikes, because a slate that arrived
  // with the opponent's picks attached is a blind phase in name only. The
  // second takes the human's committed strikes and only then computes the
  // AI's from the same seed. The seed is namespaced to this uid and checked,
  // so it cannot be used to fish for somebody else's slate.
  //
  // Placed ABOVE the guest gate on purpose: this opens no room with a real
  // person in it, so it must not spend a guest's live-round allowance.
  // The AI opponent's version of the negotiation, and it is deliberately
  // the HUMAN'S HALF of it. The AI always offers and the human always
  // responds: the response is the beat with the real choice in it (take,
  // send back, counter), and a coin flip that sometimes handed the
  // interesting move to a machine would make the fallback a worse ritual
  // half the time for no gain. Stateless — the draft is rebuilt from the
  // seed on every call rather than stored, so there is nothing to keep
  // between the two round trips.
  //
  // Pool cards only: a hand-written motion has to clear the site's content
  // boundary, and that guard lives in round-draft.mjs where the human draft
  // runs. Offering an unguarded text field here would be the one place a
  // heavy subject could enter a round.
  if (action === 'solo') {
    if (!DRAFT_ENABLED) return jsonResponse({ ok: false, reason: 'draft_off' }, 200, request);
    const AI_UID = 'ai';
    const fmt = VALID_FORMATS.has(format) ? format : 'quick';
    const rawSeed = String(body?.seed || '');
    const seedPrefix = 'solo:' + myUid + ':';

    // The AI holds the offer and every beat the human does not; force the
    // roles rather than taking the coin flip, and drive the AI's beats with
    // the same seeded autoResolve the human draft uses on a timeout.
    const buildSolo = (seed) => {
      const base = createDraft(seed, fmt, myUid, AI_UID);
      return advanceDraft(Object.assign({}, base, { offerUid: AI_UID, respondUid: myUid }));
    };
    const runAi = (d) => {
      let out = d;
      // Bounded, not while(true): an autoResolve that failed to move the
      // phase would otherwise spin until the function times out.
      for (let i = 0; i < 8; i++) {
        if (out.phase === 'done') break;
        const actor = out.phase === 'respond' ? myUid
          : (out.phase === 'offer' || out.phase === 'choose') ? out.offerUid
          : out.phase === 'counter' ? out.respondUid
          : out.sideUid;
        if (String(actor) !== String(AI_UID)) break;
        out = advanceDraft(autoResolve(out));
      }
      return out;
    };

    // The human's moves are replayed from scratch on every call, so the
    // whole draft is a pure function of (seed, moves) and there is no state
    // to keep between round trips. An invalid move is SKIPPED rather than
    // refused, and the beat it was for resolves on its seed instead: the
    // client auto-submits at zero, and a hard refusal there would kill the
    // round over a slow reader who was sitting right there.
    const replay = (seed, moves) => {
      let d = runAi(buildSolo(seed));
      for (const raw of (Array.isArray(moves) ? moves : []).slice(0, 6)) {
        const mv = raw && typeof raw === 'object' ? raw : {};
        const a = String(mv.a || '');
        let res = { ok: false };
        if (a === 'respond') res = applyResponse(d, myUid, mv.choice);
        else if (a === 'offer') res = applyOffer(d, myUid, { poolId: String(mv.poolId || '') });
        else if (a === 'side') res = applySidePick(d, myUid, mv.side);
        d = advanceDraft(res.ok ? res.draft : autoResolve(d));
        d = runAi(d);
      }
      return d;
    };

    if (!body?.moves) {
      const seed = seedPrefix + Date.now().toString(36);
      const draft = runAi(buildSolo(seed));
      return jsonResponse({ ok: true, seed, aiUid: AI_UID, draft: publicDraft(draft, Date.now()) }, 200, request);
    }

    if (!rawSeed.startsWith(seedPrefix)) {
      return jsonResponse({ ok: false, reason: 'bad_seed' }, 200, request);
    }
    const draft = replay(rawSeed, body.moves);
    return jsonResponse({
      ok: true, aiUid: AI_UID, seed: rawSeed,
      draft: publicDraft(draft, Date.now()),
      result: draftResult(draft, myUid, AI_UID),
    }, 200, request);
  }

  // The AI-only draft above seats no stranger. Human pairing requires
  // a verified account even when an older client still writes guest docs.
  if (!LIVE_VIDEO_PROVIDERS.has(decoded.firebase?.sign_in_provider)) {
    return jsonResponse({
      error: 'Sign in with Google, Apple, or email to join a live video round.',
      code: iAmGuest ? 'SIGN_IN_REQUIRED' : 'GOOGLE_SIGN_IN_REQUIRED',
    }, 403, request);
  }

  if (!peerUid || peerUid === myUid) {
    return errorResponse('Invalid peerUid', 400, request);
  }

  if (action === 'pair' && Array.isArray(body?.candidateUids)) {
    peerUid = await choosePrivateProfilePeer(db, myUid, peerUid, body.candidateUids);
  }
  if (action === 'pair' && !VALID_FORMATS.has(format)) {
    return errorResponse('Invalid format', 400, request);
  }

  const queue = db.collection('matchmaking_queue');
  const myRef = queue.doc(myUid);
  const peerRef = queue.doc(peerUid);
  const seats = db.collection('active_tournament_seats');
  const myTournamentSeatRef = seats.doc(myUid);
  const peerTournamentSeatRef = seats.doc(peerUid);

  // Tournament assignments are exclusive. The client also listens to its
  // own reservation so the pill tells the truth, but this server check is
  // the authority across stale tabs, old bundles, and other devices.
  try {
    const [mySeat, peerSeat] = await Promise.all([
      myTournamentSeatRef.get(),
      peerTournamentSeatRef.get(),
    ]);
    if (mySeat.exists) {
      await myRef.delete().catch(() => {});
      return jsonResponse({ ok: false, reason: 'tournament_seat_active' }, 200, request);
    }
    if (peerSeat.exists) {
      await Promise.all([myRef.delete().catch(() => {}), peerRef.delete().catch(() => {})]);
      return jsonResponse({ ok: false, reason: 'peer_ineligible', skipPeer: peerUid }, 200, request);
    }
  } catch (err) {
    // Fail closed. Availability is not worth risking two rooms for one
    // person when the server cannot verify the reservation collection.
    console.warn('[spar-pair] tournament seat read failed:', err?.message || err);
    return jsonResponse({ ok: false, reason: 'availability_check_failed' }, 200, request);
  }

  // ── action: 'consent' — phase 2 of the handshake ───────────────
  if (action === 'consent') {
    const accept = !!body?.accept;
    // True when a client TIMER fired this decline (auto-pass nets),
    // false for a human clicking Pass/Withdraw. Timers feed the
    // ghost-cancel heuristic below; human passes never do.
    const auto = !!body?.auto;
    // Prepare once outside the transaction: Firestore may retry its callback.
    // No provider spend on Pass, an explicit queued motion, or a stale pair.
    // Both accept requests share the private room stamp and its deadline.
    let preparedRoom = null;
    let preparedMotionRef = null;
    if (accept) {
      try {
        const [mineSnap, theirsSnap] = await Promise.all([myRef.get(), peerRef.get()]);
        const mine = mineSnap.exists ? mineSnap.data() : null;
        const theirs = theirsSnap.exists ? theirsSnap.data() : null;
        if (mine?.status === 'consent' && theirs?.status === 'consent'
            && mine.matchedWith === peerUid && theirs.matchedWith === myUid
            && mine.room && mine.room === theirs.room && !mine.motion && !theirs.motion) {
          preparedRoom = mine.room;
          preparedMotionRef = db.collection('round_drafts').doc(preparedRoom);
          const caller = await resolveCaller(request);
          await ensurePairMotion(db, preparedRoom, myUid, {
            callerKey: caller.named ? caller.key : 'ip_' + caller.ip,
            ip: caller.ip,
          });
        }
      } catch (err) {
        // The reviewed arrival fallback was already stamped with the proposal.
        // A failed generator cannot consume either person's acceptance.
        console.warn('[spar-pair] motion preparation unavailable');
      }
    }
    // Everything a revert needs to put a doc back in the plain
    // 'waiting' shape. joinedAt refreshes so neither side gets
    // stale-skipped for time burned inside the consent window.
    const revert = {
      status: 'waiting',
      joinedAt: FieldValue.serverTimestamp(),
      room: FieldValue.delete(),
      proposedAt: FieldValue.delete(),
      pinged: FieldValue.delete(),
      pingedAt: FieldValue.delete(),
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
      draft: FieldValue.delete(),
      draftPhaseAt: FieldValue.delete(),
      matchedWith: FieldValue.delete(),
      matchedWithName: FieldValue.delete(),
      matchedWithPhoto: FieldValue.delete(),
      matchedWithAvatar: FieldValue.delete(),
      lastPassBy: FieldValue.delete(),
      lastPassAt: FieldValue.delete(),
    };
    try {
      const result = await db.runTransaction(async (tx) => {
        const [mineSnap, theirsSnap, mySeatSnap, peerSeatSnap, motionSnap] = await Promise.all([
          tx.get(myRef),
          tx.get(peerRef),
          tx.get(myTournamentSeatRef),
          tx.get(peerTournamentSeatRef),
          preparedMotionRef ? tx.get(preparedMotionRef) : Promise.resolve(null),
        ]);
        if (mySeatSnap.exists) {
          if (mineSnap.exists) tx.delete(myRef);
          return { ok: false, reason: 'tournament_seat_active' };
        }
        if (peerSeatSnap.exists) {
          if (mineSnap.exists) tx.delete(myRef);
          if (theirsSnap.exists) tx.delete(peerRef);
          return { ok: false, reason: 'peer_ineligible', skipPeer: peerUid };
        }
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
        if (accept && (!LIVE_VIDEO_PROVIDERS.has(mine.authProvider) || !LIVE_VIDEO_PROVIDERS.has(theirs.authProvider))) {
          tx.update(myRef, { ...revert });
          tx.update(peerRef, { ...revert });
          return { ok: false, reason: 'peer_ineligible', skipPeer: peerUid };
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
          const ghostAfter = mine.pinged ? GHOST_CONSENT_PINGED_MS : GHOST_CONSENT_MS;
          if (auto && peerNeverActed && proposalAge > ghostAfter) {
            // ghostAt, not skipAt: see GHOST_SKIP_TTL_MS. Nobody decided
            // anything here, so the block expires in 45s rather than two
            // minutes, and it never counts toward the permanent
            // twice-passed rule.
            tx.update(myRef, { ...revert, skipUids: FieldValue.arrayUnion(peerUid), ['ghostAt.' + peerUid]: FieldValue.serverTimestamp() });
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

        // The motion negotiation does not live here. It runs in the room
        // (round-draft.mjs) against the eligibility stamp this function
        // writes, so accepting is a plain consent again and the queue doc
        // carries no draft state at all.

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
        const motionStamp = motionSnap?.exists ? motionSnap.data() : null;
        const generatedMotion = motionForPairArrival(
          motionStamp, mine, theirs, preparedRoom, myUid, peerUid,
        );
        if (generatedMotion) {
          finals.pairedMotion = generatedMotion;
          tx.update(preparedMotionRef, {
            draftConfig: draftConfigForPairMotion(motionStamp.draftConfig, generatedMotion),
          });
        }
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
      return jsonResponse(result, 200, request);
    } catch (err) {
      console.error('[spar-pair] consent transaction error:', err?.message || err);
      return errorResponse('Consent transaction failed: ' + (err?.message || 'unknown'), 500, request);
    }
  }

  // The queue-doc draft is GONE. It moved into the room on 2026-08-26
  // (round-draft.mjs), and `const draft = null` below means this function
  // has not written one since; the action that resolved its beats sat here
  // answering 'no_draft' to anybody who found it. Deleted rather than left
  // as a second phase machine to keep in step with the pure module.

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
  // A report with Block writes this server-owned relationship. Queue-doc
  // blockedUids remains a fast client hint, but it cannot be the authority:
  // clearing app storage or changing devices must not restore a blocked
  // pairing. Read both directions in the same transaction as the queue docs.
  const myBlockRef = db.collection('user_blocks').doc(myUid).collection('blocked').doc(peerUid);
  const peerBlockRef = db.collection('user_blocks').doc(peerUid).collection('blocked').doc(myUid);
  const myMatchProfileRef = db.collection('spar_match_profiles').doc(myUid);
  const peerMatchProfileRef = db.collection('spar_match_profiles').doc(peerUid);

  // Fire the stale-doc reaper on the side. We don't await because the
  // user's polling loop will pick the cleaner queue on its next tick
  // anyway, and we'd rather not stack reaper latency on top of the
  // pair transaction's own round-trip.
  reapStaleDocs(db);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [mineSnap, theirsSnap, myBlockSnap, peerBlockSnap, mySeatSnap, peerSeatSnap,
        myMatchProfileSnap, peerMatchProfileSnap] = await Promise.all([
        tx.get(myRef),
        tx.get(peerRef),
        tx.get(myBlockRef),
        tx.get(peerBlockRef),
        tx.get(myTournamentSeatRef),
        tx.get(peerTournamentSeatRef),
        tx.get(myMatchProfileRef),
        tx.get(peerMatchProfileRef),
      ]);

      if (mySeatSnap.exists) {
        if (mineSnap.exists) tx.delete(myRef);
        return { ok: false, reason: 'tournament_seat_active' };
      }
      if (peerSeatSnap.exists) {
        if (mineSnap.exists) tx.delete(myRef);
        if (theirsSnap.exists) tx.delete(peerRef);
        return { ok: false, reason: 'peer_ineligible', skipPeer: peerUid };
      }

      if (!mineSnap.exists || !theirsSnap.exists) {
        // 'mine' is the caller's own doc gone mid-search. Until 2026-09-07
        // the client could not tell the two apart and polled on forever
        // with no doc to be proposed to. Older bundles ignore the field.
        return { ok: false, reason: 'queue_doc_missing', missing: mineSnap.exists ? 'peer' : 'mine' };
      }
      const mine = mineSnap.data();
      const theirs = theirsSnap.data();
      if (mine.status !== 'waiting' || theirs.status !== 'waiting') {
        return { ok: false, reason: 'lost_race' };
      }
      // The peer has no token on this request. Firestore binds their
      // queue provider marker to their verified account; require it on
      // both seats so stale guest entries cannot become passive peers.
      const seatOk = (p) => LIVE_VIDEO_PROVIDERS.has(p);
      if (!seatOk(mine.authProvider)) {
        return { ok: false, reason: 'queue_auth_stale' };
      }
      if (!seatOk(theirs.authProvider)) {
        tx.update(peerRef, {
          status: 'cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: 'google_sign_in_required',
        });
        return { ok: false, reason: 'peer_ineligible', skipPeer: peerUid };
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
      if (myBlockSnap.exists || peerBlockSnap.exists || blocked(mine, peerUid) || blocked(theirs, myUid)) {
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

      // Political answers never leave the private collection. The only
      // public artifact is a motion. An anonymous disagreement also feeds
      // the generator from the private room stamp, and
      // only when both queue docs prove the profiles synced for this search.
      // The judge sees the settled motion, never why it was suggested.
      let privateDraftConfig = {};
      let motionContext = null;
      if (mine.matchProfileReady === true && theirs.matchProfileReady === true
          && myMatchProfileSnap.exists && peerMatchProfileSnap.exists) {
        privateDraftConfig = matchDeskDraftConfig(
          myMatchProfileSnap.data(),
          peerMatchProfileSnap.data(),
          draftSeed(myUid, peerUid, room),
        );
        if (!pairedMotion) motionContext = buildMatchMotionContext(
          myMatchProfileSnap.data(), peerMatchProfileSnap.data(), draftSeed(myUid, peerUid, room),
        );
      }
      // Negotiation is optional. Give both people the pertinent resolution
      // as a timeout fallback. Fresh generation replaces it at final consent.
      // A motion someone deliberately queued with still takes precedence.
      if (!pairedMotion && privateDraftConfig.recommendedMotion) {
        common.pairedMotion = privateDraftConfig.recommendedMotion;
      }

      // The motion draft. Both docs must have opted in: a client that
      // cannot render a draft must never be handed one, or it sits on a card
      // it does not understand until the reaper sweeps it. The slate is
      // seeded off the sorted uid pair plus the room, so both sides could
      // derive the same five motions independently and a rematch later in
      // the session draws a fresh five.
      // The stamp. Written for EVERY pair this function makes, because
      // every one of them was matched onto a motion nobody chose, and
      // deliberately NOT keyed on draftOptIn any more: which page the peer
      // happened to be standing on is not a reason for one debater to lose
      // their veto. round_drafts is unlisted in firestore.rules, so the
      // default deny makes this server-only in both directions — no client
      // can forge it and no client can read the strikes it will hold.
      if (DRAFT_ENABLED) {
        tx.set(db.collection('round_drafts').doc(room), {
          eligible: true,
          uids: [myUid, peerUid],
          format: pairedFormat,
          seed: draftSeed(myUid, peerUid, room),
          names: { [myUid]: myShort, [peerUid]: peerShort },
          ...(motionContext && privateDraftConfig.recommendedMotion ? {
            motionGeneration: {
              status: 'ready', context: motionContext,
              fallback: privateDraftConfig.recommendedMotion,
            },
          } : {}),
          ...(privateDraftConfig.suggestions?.length >= 2
            ? { draftConfig: privateDraftConfig }
            : {}),
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      const draft = null;

      if (needsConsent) {
        const proposal = {
          ...common,
          status: 'consent',
          proposedAt: FieldValue.serverTimestamp(),
          // A fresh proposal starts unpinged; the stamp is written only
          // after this transaction commits and the push is accepted.
          pinged: false,
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
          // A drafting pair carries no motion until the draft names one.
          // `common.pairedMotion` is whatever either side queued with, and
          // showing it here would put a motion on screen that the strikes
          // are about to overrule.
          ...(draft ? { draft, draftPhaseAt: FieldValue.serverTimestamp(), pairedMotion: '' } : {}),
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
        return { ok: true, pending: 'consent', room, pairedFormat, notifyUid: peerUid, notifyFrom: myShort };
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

    // Web Push, on the PROPOSAL. This used to be gated on
    // `result.ok && !result.pending` — the instant-match branch — and the
    // comment three lines above that gate already conceded the branch is
    // unreachable, because needsConsent is unconditionally true. So the
    // one mechanism built to pull an away debater back to a live match
    // has never fired for anybody. It belongs here anyway: the moment
    // that needs a human is the proposal, where a card with a countdown
    // on it dies unanswered if nobody looks.
    //
    // Sent to the PEER only. The caller just POSTed from a live client,
    // so they are demonstrably at a keyboard; the peer is the one who may
    // be on another tab, another app, or a locked phone. Best-effort and
    // awaited (Lambda freezes the context on return, so an unawaited send
    // is abandoned rather than deferred), and sendToUser no-ops for
    // anyone without a subscription.
    if (result && result.ok && result.notifyUid) {
      try {
        const from = result.notifyFrom ? String(result.notifyFrom) : 'A debater';
        const pushed = await sendToUser(result.notifyUid, {
          title: 'Match found',
          body: from + ' is ready to debate. You have 2 minutes to accept.',
          url: '/spar',
          tag: 'da-spar-match',
        });
        // Only a push the service ACCEPTED earns the longer door; a peer
        // with no working device gets the ordinary 45s, and the waiting
        // side is told which one it is.
        if (pushed && pushed.sent > 0) {
          const stamp = { pinged: true, pingedAt: FieldValue.serverTimestamp() };
          await Promise.all([
            db.collection('matchmaking_queue').doc(myUid).set(stamp, { merge: true }).catch(() => {}),
            db.collection('matchmaking_queue').doc(result.notifyUid).set(stamp, { merge: true }).catch(() => {}),
          ]);
        }
      } catch (e) { /* push is best-effort; never fail the pair on it */ }
    }

    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('[spar-pair] transaction error:', err?.message || err);
    return errorResponse('Pair transaction failed: ' + (err?.message || 'unknown'), 500, request);
  }
};
