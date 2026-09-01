import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import {
  pairPrelimRound, standings, breakField, elimPairings, elimLabel,
  advanceElim, resultPatch, byePatch,
} from './lib/tournament.mjs';
import { tournamentRoomSetup } from './lib/tournament-motion-pool.mjs';
import { checkContent } from './lib/content-guard.mjs';
import { applyRoundRating, reverseRoundRating } from './lib/rating-apply.mjs';

// ── Tournament control room ────────────────────────────────────────
//
// Everything a director does between "we're running a tournament" and
// "here is the champion": create it, open and close registration,
// generate each draw, release it, take results, break to elims, and
// close the books.
//
// Authority is two-tier. Site admins can touch any tournament; the
// HOST of a tournament can run their own and nothing else. That split
// is what makes hosting available to a coach without handing them the
// rest of the platform.
//
// ── Storage shape, and why ─────────────────────────────────────────
//
//   tournaments/{tid}                    the tournament
//   tournaments/{tid}/entries/{entryId}  one per team (or solo debater)
//   tournaments/{tid}/rounds/{roundKey}  one per round, PAIRINGS INLINE
//
// Pairings live as an array on the round document rather than as
// their own collection. A round is at most a couple of dozen
// pairings, so the whole draw fits comfortably in one document, and
// every surface that shows a draw (the public page, the director's
// sheet, a participant checking which room they are in) then costs
// ONE read instead of one per pairing. The read cost of a tournament
// page is the thing that scales with spectators, and the 2026-07-28
// load audit is the standing evidence that a quadratic read pattern
// on a live surface is the failure that actually shows up at venue
// scale.
//
// The trade is that reporting a result rewrites the round document.
// Results arrive one at a time from one director, so contention is
// not a real concern; the write runs in a transaction anyway.
//
// ── What this does NOT do yet ──────────────────────────────────────
//
// Results are entered by the director. The AI judge already writes a
// ballot at the end of every /live-round, so the obvious next step is
// for a tournament round to post its own result back here and have
// the director confirm rather than type. That wants the ballot to
// carry the tournament and pairing ids through the round doc, and it
// wants a human confirmation step regardless, because a tab that
// silently accepts machine results has no answer when one is
// contested. Deliberately left for after a real tournament has run.

const VALID_FORMATS = new Set(['quick']);

const NAME_MAX = 80;
const DESC_MAX = 600;
const MOTION_MAX = 280;

function cleanText(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function checkedMotion(raw) {
  const motion = cleanText(raw, MOTION_MAX);
  const guard = checkContent({ text: motion, kind: 'motion', minLength: 0 });
  return guard.ok ? { ok: true, motion } : { ok: false, error: guard.reason };
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tournament';
}

function roundKey(kind, roundNo) {
  // 'd' is drop-in, and its number is the pairing SEQUENCE rather than
  // a round number: drop-in play has no rounds, so each seating gets
  // its own doc. Sharing this function is what lets recordResult below
  // report a drop-in result through the same path as a paired round.
  if (kind === 'dropin') return 'd' + roundNo;
  return (kind === 'elim' ? 'e' : 'r') + roundNo;
}

// Room ids are derived, never random, so a director who reloads the
// page mid-round hands out the same link they handed out before.
function roomFor(tid, key, index) {
  return 'Debatable-' + String(tid).slice(0, 12) + '-' + key + '-' + (index + 1);
}

function ratingSeat(entry, fallbackName) {
  const members = Array.isArray(entry && entry.members) ? entry.members.filter(Boolean) : [];
  if (members.length !== 1) return null;
  return {
    uid: String(members[0]),
    name: cleanText((entry.memberNames || [])[0] || entry.name || fallbackName, NAME_MAX),
  };
}

function directorRatingPayload(
  pairing, round, govEntry, oppEntry, winner, amended, previousRevision, reportedBy,
) {
  const gov = ratingSeat(govEntry, 'Government');
  const opp = ratingSeat(oppEntry, 'Opposition');
  const room = String((pairing && pairing.room) || '');
  if (!gov || !opp || gov.uid === opp.uid || !room || !['gov', 'opp'].includes(winner)) return null;
  const prevRev = Math.max(0, Math.trunc(Number(previousRevision) || 0));
  return {
    room,
    gov,
    opp,
    motion: cleanText(round && round.motion, MOTION_MAX),
    winner,
    amended: !!amended,
    previousRevision: prevRev,
    revision: amended ? prevRev + 1 : prevRev,
    verdictSource: reportedBy === 'ai-judge' ? 'server' : 'tournament-director',
  };
}

function compactRatingChanges(rated) {
  if (!rated || !Array.isArray(rated.changes) || !rated.changes.length) return null;
  const out = {};
  for (const change of rated.changes) {
    if (!change || !change.uid) continue;
    out[change.uid] = {
      delta: Number(change.delta) || 0,
      after: Math.round(Number(change.after && change.after.rating) || 0),
      result: String(change.result || ''),
    };
  }
  return Object.keys(out).length ? out : null;
}

async function applyDirectorRating(db, payload) {
  if (!payload) return null;
  if (payload.amended) {
    await reverseRoundRating(db, {
      source: 'live',
      eventId: payload.room,
      uids: [payload.gov.uid, payload.opp.uid],
      rev: payload.previousRevision,
      reason: 'Tournament director amended the result.',
    });
  }
  const rated = await applyRoundRating(db, {
    source: 'live',
    eventId: payload.room,
    rev: payload.revision,
    verdictSourceOverride: payload.verdictSource,
    roundData: {
      proUid: payload.gov.uid,
      conUid: payload.opp.uid,
      proName: payload.gov.name,
      conName: payload.opp.name,
      motion: payload.motion,
      ballot: { winner: payload.winner === 'gov' ? 'pro' : 'con' },
      leaderboardConsent: { [payload.gov.uid]: true, [payload.opp.uid]: true },
    },
  });
  const changes = compactRatingChanges(rated);
  if (changes) {
    await db.collection('live_rounds').doc(payload.room).update({ ratingChanges: changes })
      .catch((err) => console.error('[tournament-admin] ratingChanges write failed', payload.room, err.message));
  }
  return rated;
}

async function loadTournament(db, tid) {
  const ref = db.collection('tournaments').doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() };
}

async function loadEntries(db, tid) {
  const snap = await db.collection('tournaments').doc(tid).collection('entries').get();
  return snap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
}

// One durable group per tournament. The host can activate it once and every
// current or late entrant lands in the same thread, with the ordinary chat
// inbox, unread badge and live notifications doing the distribution work.
// The deterministic id and welcome message make this safe to retry during a
// live event without creating duplicate groups or announcements.
async function ensureTournamentChat(db, tid, t) {
  const all = await loadEntries(db, tid);
  const active = all.filter((e) => String(e.status || 'registered') !== 'withdrawn');
  const participants = [];
  const participantInfo = {};

  for (const entry of active) {
    const members = Array.isArray(entry.members) ? entry.members : [];
    const names = Array.isArray(entry.memberNames) ? entry.memberNames : [];
    members.forEach((uid, i) => {
      uid = String(uid || '').trim();
      if (!uid || participants.includes(uid)) return;
      participants.push(uid);
      participantInfo[uid] = {
        name: cleanText(names[i] || (members.length === 1 ? entry.name : '') || 'Participant', 48),
        photo: '',
      };
    });
  }

  const hostUid = String(t.data.hostUid || '').trim();
  if (hostUid && !participants.includes(hostUid)) {
    participants.push(hostUid);
    participantInfo[hostUid] = { name: 'Host', photo: '' };
  }
  if (!participants.length) throw new Error('The tournament chat needs at least one participant.');

  const safeTid = String(tid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  const threadId = String(t.data.chatThreadId || '').trim().replace(/\//g, '').slice(0, 150)
    || ('tournament_' + safeTid);
  const ref = db.collection('dm_threads').doc(threadId);
  const welcomeRef = ref.collection('messages').doc('welcome');
  const authorUid = hostUid || participants[0];
  const roundNo = Number(t.data.currentRound) || 0;
  const welcome = (roundNo > 0 ? ('Round ' + roundNo + ' is live.') : 'The tournament is live.')
    + ' Use this chat for check-in, technical help, and tournament updates. Post here if you are waiting or cannot enter your room.';
  let memberCount = participants.length;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const welcomeSnap = await tx.get(welcomeRef);
    const old = snap.exists ? (snap.data() || {}) : {};
    const merged = Array.from(new Set([...(Array.isArray(old.participants) ? old.participants : []), ...participants]));
    const info = { ...(old.participantInfo || {}) };
    Object.entries(participantInfo).forEach(([uid, value]) => {
      info[uid] = { ...value, photo: info[uid]?.photo || '' };
    });
    const unread = { ...(old.unread || {}) };
    merged.forEach((uid) => {
      if (unread[uid] == null) unread[uid] = uid === authorUid ? 0 : 1;
    });

    const thread = {
      isGroup: true,
      groupName: cleanText((t.data.name || 'Tournament') + ' chat', 80),
      participants: merged,
      participantInfo: info,
      unread,
      tournamentChat: true,
      tournamentId: tid,
    };
    if (!snap.exists) {
      Object.assign(thread, {
        createdBy: authorUid,
        createdAt: FieldValue.serverTimestamp(),
        lastMessage: welcome,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastMessageFrom: authorUid,
      });
    }
    tx.set(ref, thread, { merge: true });
    if (!welcomeSnap.exists) {
      tx.set(welcomeRef, {
        fromUid: authorUid,
        fromName: 'Debatable',
        text: welcome,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(t.ref, { chatThreadId: threadId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    memberCount = merged.length;
  });
  return { chatThreadId: threadId, memberCount };
}

async function announceTournamentChat(db, t, messageId, text) {
  const threadId = String(t.data.chatThreadId || '').trim().replace(/\//g, '').slice(0, 150);
  if (!threadId) return;
  const ref = db.collection('dm_threads').doc(threadId);
  const messageRef = ref.collection('messages').doc(messageId);
  const authorUid = String(t.data.hostUid || '').trim();
  await db.runTransaction(async (tx) => {
    const threadSnap = await tx.get(ref);
    const messageSnap = await tx.get(messageRef);
    if (!threadSnap.exists || messageSnap.exists) return;
    const thread = threadSnap.data() || {};
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const unread = { ...(thread.unread || {}) };
    participants.forEach((uid) => {
      unread[uid] = uid === authorUid ? 0 : Math.max(0, Number(unread[uid]) || 0) + 1;
    });
    tx.set(messageRef, {
      fromUid: authorUid || participants[0],
      fromName: 'Debatable',
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref, {
      lastMessage: text,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageFrom: authorUid || participants[0],
      unread,
    }, { merge: true });
  });
}

// ── Seating: a paired entry is not in the drop-in queue ────────────
//
// `inPairing` is what stops one person owing two opponents a round at
// once. Until 2026-08-26 ONLY the drop-in queue wrote it, and only
// report-result cleared it, so the two engines were blind to each
// other: a debater the director had just paired into Round 1 could
// press "ready" and be seated a second time, in a second room, against
// a different opponent. Both rooms auto-post a result, so one entrant
// banks two results for the same slot and their off-draw opponent gets
// a result that appears in no released draw.
//
// It is not a hypothetical race. `release-round` sets the tournament to
// `running`, and `running` is the exact status that opens the queue, so
// publishing a synchronous draw is what opens the door.
//
// So every draw now seats its entries and every redraw releases the one
// it replaced. report-result already clears `inPairing` unconditionally
// (and says why), so a finished round hands people back either way.
//
// Bounded by the draw: one transaction over at most a few dozen entries,
// user reservations, and stale general-queue docs. The pairing ids are
// already the value the queue's loadPairing parses ('r1-1' splits to the
// round key 'r1', same as 'd7-1').
async function applySeating(db, tid, tournament, pairings, prevPairings, entries) {
  const entriesRef = db.collection('tournaments').doc(tid).collection('entries');
  const byId = new Map((entries || []).map((entry) => [String(entry.entryId), entry]));
  const seated = new Map();
  const seatedUsers = new Map();
  for (const p of pairings || []) {
    if (p.govEntry) seated.set(p.govEntry, p.pairingId || '');
    if (p.oppEntry) seated.set(p.oppEntry, p.pairingId || '');
    for (const entryId of [p.govEntry, p.oppEntry]) {
      const entry = byId.get(String(entryId || '')) || {};
      for (const rawUid of Array.isArray(entry.members) ? entry.members : []) {
        const uid = String(rawUid || '').trim();
        if (!uid) continue;
        seatedUsers.set(uid, {
          uid,
          tid,
          entryId: String(entryId || ''),
          pairingId: String(p.pairingId || ''),
          room: String(p.room || ''),
          roundKey: String(p.pairingId || '').split('-')[0],
        });
      }
    }
  }
  // A redraw must release anyone the new draw does not seat, or the
  // discarded draw locks them out of the queue with a pairing id that
  // no longer resolves.
  const released = [];
  const releasedUsers = new Map();
  for (const p of prevPairings || []) {
    for (const id of [p.govEntry, p.oppEntry]) {
      if (id && !seated.has(id)) {
        released.push(id);
        const entry = byId.get(String(id)) || {};
        for (const rawUid of Array.isArray(entry.members) ? entry.members : []) {
          const uid = String(rawUid || '').trim();
          if (!uid || seatedUsers.has(uid)) continue;
          const ids = releasedUsers.get(uid) || new Set();
          ids.add(String(p.pairingId || ''));
          releasedUsers.set(uid, ids);
        }
      }
    }
  }
  if (!seated.size && !released.length && !seatedUsers.size) return;

  // The entry-level inPairing flag keeps the two tournament draw engines
  // from seating somebody twice. The user-level reservation below closes
  // the other door: the sitewide Spar pool is a separate collection and
  // used to keep advertising an assigned tournament entrant as available.
  // Write the reservation and delete any general queue doc atomically so a
  // second tab or device cannot win the gap between those two operations.
  await db.runTransaction(async (tx) => {
    const releaseUids = Array.from(releasedUsers.keys());
    const releaseSnaps = await Promise.all(releaseUids.map((uid) =>
      tx.get(db.collection('active_tournament_seats').doc(uid))));
    const releaseReads = releaseUids.map((uid, i) => [uid, releaseSnaps[i]]);

    for (const [id, pairingId] of seated) tx.update(entriesRef.doc(id), { inPairing: pairingId });
    for (const id of new Set(released)) tx.update(entriesRef.doc(id), { inPairing: '' });

    for (const [uid, seat] of seatedUsers) {
      const deskKey = String(tournament?.slug || tid);
      tx.set(db.collection('active_tournament_seats').doc(uid), {
        ...seat,
        tournamentName: String(tournament?.name || 'Tournament').slice(0, 100),
        tournamentSlug: String(tournament?.slug || '').slice(0, 100),
        deskUrl: tournament?.slug === 'the-debatable-open'
          ? '/open'
          : '/tournament?t=' + encodeURIComponent(deskKey),
        assignedAt: FieldValue.serverTimestamp(),
      });
      tx.delete(db.collection('matchmaking_queue').doc(uid));
    }

    // A redraw may release an old seat. Delete only the reservation that
    // belongs to that discarded draw, never a newer seat another tournament
    // may have written for the same account in the meantime.
    for (const [uid, snap] of releaseReads) {
      const old = snap.exists ? (snap.data() || {}) : {};
      if (old.tid === tid && releasedUsers.get(uid)?.has(String(old.pairingId || ''))) {
        tx.delete(snap.ref);
      }
    }
  });
}

// Every tournament room is publicly watchable but roster-controlled for
// camera and microphone access. A motion draft stamp is added when the event
// publishes a pool; an admission stamp is added for every tournament.
async function stampTournamentRooms(db, tid, tournament, pairings, entries, seedPrefix) {
  const byId = new Map((entries || []).map((e) => [String(e.entryId), e]));
  const batch = db.batch();
  let writes = 0;
  for (const p of pairings || []) {
    const setup = tournamentRoomSetup(
      tid,
      tournament,
      p,
      byId,
      String(seedPrefix || tid) + '|' + String(p.pairingId || p.room),
    );
    if (!setup) continue;
    batch.set(db.collection('room_admissions').doc(p.room), {
      ...setup.admission,
      createdAt: FieldValue.serverTimestamp(),
    });
    writes += 1;
    if (setup.draft) {
      batch.set(db.collection('round_drafts').doc(p.room), {
        ...setup.draft,
        createdAt: FieldValue.serverTimestamp(),
      });
      writes += 1;
    }
  }
  if (writes) await batch.commit();
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
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const myUid = decoded.sub;
  const myEmail = String(decoded.email || '');
  const siteAdmin = isAdminEmail(myEmail) || myUid === process.env.ADMIN_UID;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || '').trim();
  const db = getDb();

  // ── create ──────────────────────────────────────────────────────
  // Open to any signed-in user: hosting is the point, and a
  // tournament nobody registers for costs nothing. Public listing is
  // a separate flag that only a site admin can raise, so an untested
  // host can run a real event without it appearing on the front page
  // before anyone has checked it.
  if (action === 'create') {
    const name = cleanText(body?.name, NAME_MAX);
    if (!name) return errorResponse('Give the tournament a name.', 400, request);
    const format = String(body?.format || 'quick').toLowerCase();
    if (!VALID_FORMATS.has(format)) return errorResponse('Unknown format', 400, request);

    const teamSize = 1;
    const prelimRounds = Math.max(1, Math.min(9, Number(body?.prelimRounds) || 4));
    const breakSize = Math.max(0, Math.min(32, Number(body?.breakSize) || 4));

    // Slug collisions get a numeric suffix rather than an error; a
    // host naming their event the same thing as last season is normal.
    const base = slugify(name);
    let slug = base;
    for (let i = 2; i <= 20; i += 1) {
      const taken = await db.collection('tournaments').where('slug', '==', slug).limit(1).get();
      if (taken.empty) break;
      slug = base + '-' + i;
    }

    const ref = db.collection('tournaments').doc();
    await ref.set({
      slug,
      name,
      format,
      teamSize,
      prelimRounds,
      breakSize,
      description: cleanText(body?.description, DESC_MAX),
      startsAt: cleanText(body?.startsAt, 40),
      hostUid: myUid,
      hostName: cleanText(decoded.name || decoded.email || 'Host', NAME_MAX),
      status: 'draft',
      currentRound: 0,
      isPublic: false,
      // All tournament rounds are recorded. This is a product rule, not
      // a host toggle, so the creator cannot advertise one policy while
      // the room enforces another.
      recordingRequired: true,
      entryCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return jsonResponse({ ok: true, tid: ref.id, slug }, 200, request);
  }

  // Every remaining action targets one tournament.
  const tid = String(body?.tid || '').trim();
  if (!tid) return errorResponse('Missing tid', 400, request);
  const t = await loadTournament(db, tid);
  if (!t) return errorResponse('No such tournament', 404, request);
  const isHost = t.data.hostUid === myUid;
  if (!isHost && !siteAdmin) return errorResponse('Only the host can run this tournament.', 403, request);

  // ── update ──────────────────────────────────────────────────────
  if (action === 'update') {
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name != null) patch.name = cleanText(body.name, NAME_MAX) || t.data.name;
    if (body.description != null) patch.description = cleanText(body.description, DESC_MAX);
    if (body.startsAt != null) patch.startsAt = cleanText(body.startsAt, 40);
    if (body.format != null && VALID_FORMATS.has(String(body.format).toLowerCase())) {
      patch.format = String(body.format).toLowerCase();
    }
    if (body.prelimRounds != null) patch.prelimRounds = Math.max(1, Math.min(9, Number(body.prelimRounds) || 4));
    if (body.breakSize != null) patch.breakSize = Math.max(0, Math.min(32, Number(body.breakSize) || 0));
    // Only a site admin can put a tournament on the public list.
    if (body.isPublic != null && siteAdmin) patch.isPublic = !!body.isPublic;
    // The entry fee is data, not code (see entry-checkout.mjs), but until
    // now nothing could write it, so changing a price meant a raw
    // Firestore edit. Site-admin only, and clamped: 0 turns the paid door
    // off entirely, and the ceiling stops a fat finger from turning a $5
    // door into a $500 one. Never touches prizePoolCents, which the
    // webhook owns.
    if (body.entryFeeCents != null && siteAdmin) {
      patch.entryFeeCents = Math.max(0, Math.min(50000, Math.round(Number(body.entryFeeCents) || 0)));
    }
    // Whether the drop-in queue runs at all. Nothing could write this
    // before 2026-08-26, so a director who wanted a SYNCHRONOUS day —
    // one draw, every room starting together, a real gap between rounds
    // to talk into — had no way to close the queue except a raw
    // Firestore edit. The two models want opposite things from the same
    // field and the choice belongs to whoever is running the day.
    if (body.dropIn != null) patch.dropIn = !!body.dropIn;
    // ── Drop-in queue tuning (see queueTuning in tournament-dropin.mjs) ──
    //
    // Both defaults were sized for a long format on one undivided
    // field, and a short-format drop-in day is neither. The rematch
    // hold in particular is all-or-nothing per bracket, so on a small
    // bracket that has run out of fresh opponents it stalls EVERY pair
    // for its full duration. These are the dial for that, and they are
    // here rather than in code because the moment you need to turn one
    // is the middle of a live event.
    //
    // Clamped at both ends: a window under 2 minutes ages out a person
    // reading their ballot, and one over 30 keeps pairing a closed
    // laptop. Patience above the window is meaningless (the engine
    // clamps it to window - 60s anyway).
    if (body.dropinWindowMs != null) {
      patch.dropinWindowMs = Math.max(120000, Math.min(1800000, Math.round(Number(body.dropinWindowMs) || 0)));
    }
    if (body.dropinPatienceMs != null) {
      patch.dropinPatienceMs = Math.max(0, Math.min(1800000, Math.round(Number(body.dropinPatienceMs) || 0)));
    }
    // Changing team size after entries exist would invalidate every
    // registration, so it is settled at creation.
    await t.ref.update(patch);
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── status transitions ──────────────────────────────────────────
  if (action === 'set-status') {
    const next = String(body?.status || '').trim();
    const allowed = new Set(['draft', 'registration', 'running', 'break', 'elims', 'complete', 'cancelled']);
    if (!allowed.has(next)) return errorResponse('Unknown status', 400, request);
    // An all-day rating ladder has no break or elimination phase. Keep this
    // server-side so an old cached host page cannot cut the field after the
    // event has switched to continuous pairing.
    if (t.data.ratingCompetition === true && ['draft', 'registration', 'break', 'elims'].includes(next)) {
      return errorResponse('Rating rounds stay open. This event has no fixed-round or elimination phase.', 409, request);
    }
    // Starting the day also opens the shared operations channel. Build it
    // first so a chat failure never leaves the event half-started.
    const chat = next === 'running' ? await ensureTournamentChat(db, tid, t) : null;
    await t.ref.update({ status: next, updatedAt: FieldValue.serverTimestamp() });
    return jsonResponse({ ok: true, status: next, ...(chat || {}) }, 200, request);
  }

  // Existing running events use this idempotent action to turn the same
  // channel on without changing tournament status or touching the draw.
  if (action === 'activate-chat') {
    const chat = await ensureTournamentChat(db, tid, t);
    return jsonResponse({ ok: true, ...chat }, 200, request);
  }

  // ── feature-pool (2026-08-31) ───────────────────────────────────
  // The content pool: entrants who gave standing consent at
  // registration to be clipped and featured on Watch and Debatable's
  // own social accounts. Host/site-admin read only — featureConsents
  // never rides the public list route's publicEntry projection, so a
  // person's publicity preference is not published to strangers.
  // Purely a read: it never changes standing, pairing, or the consents
  // themselves.
  if (action === 'feature-pool') {
    const entries = await loadEntries(db, tid);
    const pool = [];
    for (const e of entries) {
      const consents = e.featureConsents || {};
      const uids = Object.keys(consents).filter((uid) => consents[uid]?.ok === true);
      if (!uids.length) continue;
      pool.push({
        entryId: e.entryId,
        name: e.name || 'Entry',
        uids,
        consentedAtMs: Math.max(...uids.map((uid) => Number(consents[uid]?.atMs || 0))),
        wins: Number(e.wins || 0),
        losses: Number(e.losses || 0),
      });
    }
    pool.sort((a, b) => b.consentedAtMs - a.consentedAtMs);
    return jsonResponse({ ok: true, total: entries.length, consented: pool.length, pool }, 200, request);
  }

  // Idempotent recovery for a live day that was paired before user-level
  // tournament reservations existed. It rebuilds reservations only for
  // pairings the entry docs still say are active, and is also useful after
  // an interrupted draw write. The control-room button gives the director a
  // safe operational repair without redrawing or changing any room.
  if (action === 'sync-seating') {
    const entries = await loadEntries(db, tid);
    const byId = new Map(entries.map((entry) => [String(entry.entryId), entry]));
    const rounds = await t.ref.collection('rounds').get();
    const pairings = [];
    for (const roundDoc of rounds.docs) {
      for (const p of Array.isArray(roundDoc.data().pairings) ? roundDoc.data().pairings : []) {
        if (!p || p.status === 'complete') continue;
        const gov = byId.get(String(p.govEntry || ''));
        const opp = byId.get(String(p.oppEntry || ''));
        if ((gov && gov.inPairing === p.pairingId) || (opp && opp.inPairing === p.pairingId)) {
          pairings.push(p);
        }
      }
    }
    await applySeating(db, tid, t.data, pairings, [], entries);
    const people = new Set();
    pairings.forEach((p) => {
      [p.govEntry, p.oppEntry].forEach((entryId) => {
        const entry = byId.get(String(entryId || '')) || {};
        (Array.isArray(entry.members) ? entry.members : []).forEach((uid) => people.add(String(uid)));
      });
    });
    return jsonResponse({ ok: true, pairings: pairings.length, people: people.size }, 200, request);
  }

  // Switch a live day from stalled fixed rooms into the continuous queue.
  // Completed pairings and their results stay untouched. Only unresolved
  // fixed pairings that still own an entry's active seat are released, so
  // pressing Ready can give that present person a new opponent.
  if (action === 'release-fixed-seating' || action === 'open-rating-ladder') {
    const openingRatingLadder = action === 'open-rating-ladder';
    const entries = await loadEntries(db, tid);
    const byId = new Map(entries.map((entry) => [String(entry.entryId), entry]));
    const rounds = await t.ref.collection('rounds').get();
    const pairings = [];
    for (const roundDoc of rounds.docs) {
      for (const p of Array.isArray(roundDoc.data().pairings) ? roundDoc.data().pairings : []) {
        if (!p || p.kind === 'dropin' || p.status === 'complete') continue;
        const gov = byId.get(String(p.govEntry || ''));
        const opp = byId.get(String(p.oppEntry || ''));
        if ((gov && gov.inPairing === p.pairingId) || (opp && opp.inPairing === p.pairingId)) {
          pairings.push(p);
        }
      }
    }
    await applySeating(db, tid, t.data, [], pairings, entries);
    // A bracket cut may have marked checked-in people eliminated. Reopening
    // as an all-day ladder restores those present entries, while registered
    // arrivals still have to check themselves in and withdrawn people stay
    // out. New registration is explicitly reopened as part of the same door.
    if (openingRatingLadder) {
      const batch = db.batch();
      entries.filter((entry) => entry.status === 'eliminated').forEach((entry) => {
        batch.update(t.ref.collection('entries').doc(entry.entryId), { status: 'checked_in' });
      });
      await batch.commit();
    }
    await t.ref.update({
      status: 'running',
      dropIn: true,
      ...(openingRatingLadder ? {
        ratingCompetition: true,
        registrationClosed: false,
        breakSize: 0,
        dropinPatienceMs: 45000,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const people = new Set();
    pairings.forEach((p) => {
      [p.govEntry, p.oppEntry].forEach((entryId) => {
        const entry = byId.get(String(entryId || '')) || {};
        (Array.isArray(entry.members) ? entry.members : []).forEach((uid) => people.add(String(uid)));
      });
    });
    return jsonResponse({
      ok: true,
      ratingCompetition: openingRatingLadder,
      releasedPairings: pairings.length,
      releasedPeople: people.size,
      restoredEntries: openingRatingLadder
        ? entries.filter((entry) => entry.status === 'eliminated').length
        : 0,
    }, 200, request);
  }

  // ── pair-round ──────────────────────────────────────────────────
  // Generate the next prelim draw. Written as 'pending' so the
  // director can look at it before anyone else can: a draw is not
  // real until it is released, and being able to regenerate one that
  // came out badly (a broken bracket, a missing team who just showed
  // up) without anyone having seen it is the difference between a tab
  // and a spreadsheet.
  if (action === 'pair-round') {
    if (t.data.ratingCompetition === true) {
      return errorResponse('This event uses the live rating queue. Checked-in people spawn rounds by pressing Ready.', 409, request);
    }
    const all = await loadEntries(db, tid);
    // Check-in gates the draw. The page tells every registrant "check
    // in or you will be left out of the draw," and until 2026-08-10
    // the engine quietly paired 'registered' entries anyway, which is
    // how a director ends up debating empty rooms. When at least two
    // entries have checked in, only checked-in entries are paired;
    // a tournament whose director skipped check-in entirely (zero
    // checked in) still pairs everyone, so the old workflow keeps
    // working. Pass includeUnchecked to override for one draw.
    const checkedIn = all.filter((e) => String(e.status || '') === 'checked_in');
    const gateOnCheckIn = checkedIn.length >= 2 && !body?.includeUnchecked;
    const entries = gateOnCheckIn ? checkedIn : all;
    const leftOut = gateOnCheckIn
      ? all.filter((e) => String(e.status || 'registered') === 'registered').length
      : 0;
    const roundNo = Number(body?.roundNo) || (Number(t.data.currentRound) || 0) + 1;
    if (roundNo > Number(t.data.prelimRounds || 4)) {
      return errorResponse('That is past the last prelim round. Break to elims instead.', 400, request);
    }
    const key = roundKey('prelim', roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);
    const existing = await roundRef.get();
    if (existing.exists && existing.data().status !== 'pending' && !body?.force) {
      return errorResponse('Round ' + roundNo + ' is already released. Pass force to redraw it.', 409, request);
    }

    // A pairing is opponent history the moment it is released, not only
    // after its result lands. During a live day the next draw is often made
    // while a council is still writing the previous ballot; relying only on
    // entries[].opponents in that window can hand the same two people to each
    // other again. Fold every already-drawn room into the input, including
    // the current draw when force-redrawing it, so "new opponent" is true at
    // the moment the room spawns.
    const drawnRounds = await t.ref.collection('rounds').get();
    const pairedBefore = new Map();
    for (const drawnRound of drawnRounds.docs) {
      for (const p of Array.isArray(drawnRound.data().pairings) ? drawnRound.data().pairings : []) {
        if (!p?.govEntry || !p?.oppEntry) continue;
        if (!pairedBefore.has(p.govEntry)) pairedBefore.set(p.govEntry, new Set());
        if (!pairedBefore.has(p.oppEntry)) pairedBefore.set(p.oppEntry, new Set());
        pairedBefore.get(p.govEntry).add(p.oppEntry);
        pairedBefore.get(p.oppEntry).add(p.govEntry);
      }
    }
    const drawEntries = entries.map((entry) => ({
      ...entry,
      opponents: Array.from(new Set([
        ...(Array.isArray(entry.opponents) ? entry.opponents : []),
        ...Array.from(pairedBefore.get(entry.entryId) || []),
      ])),
    }));

    const draw = pairPrelimRound(drawEntries, roundNo, {
      tid,
      // A redraw must differ from the draw it replaces, or "regenerate"
      // silently does nothing and looks broken.
      seed: body?.reseed ? Math.floor(Math.random() * 0xffffffff) : undefined,
    });
    if (draw.error) return errorResponse(draw.error, 400, request);

    const pairings = draw.pairings.map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));
    const checked = checkedMotion(body?.motion);
    if (!checked.ok) return errorResponse(checked.error, 400, request);
    await roundRef.set({
      roundNo,
      kind: 'prelim',
      label: 'Round ' + roundNo,
      motion: checked.motion,
      status: 'pending',
      pairings,
      bye: draw.bye || null,
      seed: draw.seed,
      pullUps: draw.pullUps || 0,
      rematches: draw.rematches || 0,
      searchExhausted: !!draw.searchExhausted,
      checkedInOnly: gateOnCheckIn,
      leftOut,
      pairedAt: FieldValue.serverTimestamp(),
    });
    // Seat the new draw and release whatever a redraw just discarded.
    await applySeating(db, tid, t.data, pairings, existing.exists ? (existing.data().pairings || []) : [], all);
    await stampTournamentRooms(db, tid, t.data, pairings, entries, key);
    return jsonResponse({
      ok: true,
      round: { roundNo, key, pairings, bye: draw.bye || null,
        pullUps: draw.pullUps, rematches: draw.rematches,
        checkedInOnly: gateOnCheckIn, leftOut },
    }, 200, request);
  }

  // ── release-round ───────────────────────────────────────────────
  // Publish the draw and the motion. Participants see rooms only now.
  if (action === 'release-round') {
    const roundNo = Number(body?.roundNo) || Number(t.data.currentRound) || 1;
    const kind = String(body?.kind || 'prelim');
    const key = roundKey(kind, roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);
    const snap = await roundRef.get();
    if (!snap.exists) return errorResponse('That round has not been paired yet.', 404, request);

    const patch = {
      status: 'released',
      releasedAt: FieldValue.serverTimestamp(),
    };
    if (body.motion != null) {
      const checked = checkedMotion(body.motion);
      if (!checked.ok) return errorResponse(checked.error, 400, request);
      patch.motion = checked.motion;
    }
    await roundRef.update(patch);
    await t.ref.update({
      currentRound: roundNo,
      currentKind: kind,
      status: kind === 'elim' ? 'elims' : 'running',
      updatedAt: FieldValue.serverTimestamp(),
    });
    const round = snap.data() || {};
    const roundLabel = cleanText(round.label, 80) || (kind === 'elim' ? 'Elimination round' : ('Round ' + roundNo));
    await announceTournamentChat(
      db,
      t,
      'rooms_' + kind + '_' + roundNo,
      roundLabel + ' rooms are open. Check the tournament page for your side and opponent, then enter your room now.',
    );
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── report-result ───────────────────────────────────────────────
  // One pairing's outcome. Folded into the entries' records in the
  // same transaction that marks the pairing complete, so a result can
  // never be counted twice by a double click or a retried request:
  // the pairing's own status is the guard.
  if (action === 'report-result') {
    const roundNo = Number(body?.roundNo);
    const kind = String(body?.kind || 'prelim');
    const pairingId = String(body?.pairingId || '');
    const winner = String(body?.winner || '');
    if (!['gov', 'opp'].includes(winner)) return errorResponse('Winner must be gov or opp.', 400, request);
    const govSpeaks = Number(body?.govSpeaks || 0);
    const oppSpeaks = Number(body?.oppSpeaks || 0);

    const key = roundKey(kind, roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);

    try {
      const out = await db.runTransaction(async (tx) => {
        const rSnap = await tx.get(roundRef);
        if (!rSnap.exists) return { ok: false, reason: 'no_round' };
        const round = rSnap.data();
        const pairings = Array.isArray(round.pairings) ? round.pairings.slice() : [];
        const idx = pairings.findIndex((p) => p.pairingId === pairingId);
        if (idx === -1) return { ok: false, reason: 'no_pairing' };
        const p = pairings[idx];
        const amended = p.status === 'complete' && !!body?.amend;
        const previousRevision = Math.max(0, Math.trunc(Number(p.resultRevision) || 0));

        const govRef = t.ref.collection('entries').doc(p.govEntry);
        const oppRef = t.ref.collection('entries').doc(p.oppEntry);
        const [govSnap, oppSnap] = await Promise.all([tx.get(govRef), tx.get(oppRef)]);
        if (!govSnap.exists || !oppSnap.exists) return { ok: false, reason: 'entry_missing' };
        const govEntry = { entryId: p.govEntry, ...govSnap.data() };
        const oppEntry = { entryId: p.oppEntry, ...oppSnap.data() };
        const seatUids = Array.from(new Set([
          ...(Array.isArray(govEntry.members) ? govEntry.members : []),
          ...(Array.isArray(oppEntry.members) ? oppEntry.members : []),
        ].map((uid) => String(uid || '').trim()).filter(Boolean)));
        const seatSnaps = await Promise.all(seatUids.map((uid) =>
          tx.get(db.collection('active_tournament_seats').doc(uid))));
        const releaseSeats = () => {
          seatSnaps.forEach((seatSnap) => {
            const seat = seatSnap.exists ? (seatSnap.data() || {}) : {};
            if (seat.tid === tid && (seat.pairingId === pairingId || seat.room === p.room)) {
              tx.delete(seatSnap.ref);
            }
          });
        };

        // Retried manual reports are idempotent and also repair a rating
        // write if the standings transaction committed just before a
        // provider or Firestore interruption.
        if (p.status === 'complete' && !body?.amend) {
          releaseSeats();
          return {
            ok: true,
            already: true,
            eliminated: kind === 'elim' ? (p.winner === 'gov' ? p.oppEntry : p.govEntry) : null,
            rating: directorRatingPayload(
              p, round, govEntry, oppEntry, p.winner, false, previousRevision, p.reportedBy,
            ),
          };
        }

        // An amendment reverses the previous result before applying
        // the new one, so correcting a mistyped ballot doesn't leave
        // both teams credited with a win.
        let govBase = govEntry;
        let oppBase = oppEntry;
        if (amended) {
          govBase = reverseResult(govBase, p, 'gov');
          oppBase = reverseResult(oppBase, p, 'opp');
        }

        const govPatch = resultPatch(govBase, {
          won: winner === 'gov', speaks: govSpeaks, side: 'gov', opponentEntryId: p.oppEntry,
        });
        const oppPatch = resultPatch(oppBase, {
          won: winner === 'opp', speaks: oppSpeaks, side: 'opp', opponentEntryId: p.govEntry,
        });
        // A rematch would double an opponent id on an amend; keep the
        // list a set so head-to-head stays meaningful.
        govPatch.opponents = Array.from(new Set(govPatch.opponents));
        oppPatch.opponents = Array.from(new Set(oppPatch.opponents));

        // Releasing both sides back into the drop-in pool is the half
        // of the loop that makes "play as many rounds as you like"
        // true. Cleared unconditionally: on a paired round it is a
        // no-op, and leaving it set on a drop-in pairing would lock
        // that entrant out of the queue permanently the moment their
        // round ended. They are released to IDLE, not re-queued, so
        // rejoining stays a deliberate act by someone still at the
        // keyboard rather than an automatic re-entry that could seat a
        // person who has already walked away.
        govPatch.inPairing = '';
        oppPatch.inPairing = '';

        tx.update(govRef, govPatch);
        tx.update(oppRef, oppPatch);
        releaseSeats();

        pairings[idx] = {
          ...p,
          status: 'complete',
          winner,
          govSpeaks,
          oppSpeaks,
          reportedBy: myUid,
          resultRevision: amended ? previousRevision + 1 : previousRevision,
        };
        tx.update(roundRef, { pairings });
        return {
          ok: true,
          eliminated: kind === 'elim' ? (winner === 'gov' ? p.oppEntry : p.govEntry) : null,
          rating: directorRatingPayload(
            p, round, govEntry, oppEntry, winner, amended, previousRevision, myUid,
          ),
        };
      });

      if (!out.ok) {
        const msg = {
          no_round: 'That round does not exist.',
          no_pairing: 'That pairing is not in this round.',
          already_reported: 'That result is already in. Pass amend to correct it.',
          entry_missing: 'One of those teams is no longer registered.',
        }[out.reason] || 'Could not record that result.';
        return errorResponse(msg, 409, request);
      }
      // Elim losers stop being active so they drop out of later draws.
      if (out.eliminated) {
        await t.ref.collection('entries').doc(out.eliminated)
          .update({ status: 'eliminated' }).catch(() => {});
      }
      let rated = null;
      try {
        rated = await applyDirectorRating(db, out.rating);
      } catch (err) {
        // The tournament result is authoritative and already committed.
        // A ladder outage must not make the director re-enter the tab.
        console.error('[tournament-admin] rating apply failed', out.rating && out.rating.room, err?.message || err);
      }
      return jsonResponse({
        ok: true,
        ...(out.already ? { already: true } : {}),
        rated: !!(rated && (rated.applied || rated.reason === 'already_applied')),
        ...(rated && !rated.applied ? { ratedReason: rated.reason } : {}),
      }, 200, request);
    } catch (err) {
      console.error('[tournament-admin] report-result:', err?.message || err);
      return errorResponse('Could not record that result.', 500, request);
    }
  }

  // ── record-bye ──────────────────────────────────────────────────
  if (action === 'record-bye') {
    const roundNo = Number(body?.roundNo);
    const key = roundKey('prelim', roundNo);
    const snap = await t.ref.collection('rounds').doc(key).get();
    if (!snap.exists || !snap.data().bye) return errorResponse('That round has no bye.', 404, request);
    const bye = snap.data().bye;
    if (snap.data().byeRecorded) return jsonResponse({ ok: true, already: true }, 200, request);
    const eRef = t.ref.collection('entries').doc(bye.entryId);
    const eSnap = await eRef.get();
    if (!eSnap.exists) return errorResponse('That team is no longer registered.', 404, request);
    await eRef.update(byePatch({ entryId: bye.entryId, ...eSnap.data() }));
    await t.ref.collection('rounds').doc(key).update({ byeRecorded: true });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── break ───────────────────────────────────────────────────────
  // Cut the field and build the first elim bracket.
  if (action === 'break') {
    if (t.data.ratingCompetition === true) {
      return errorResponse('This event is a continuous rating ladder and cannot break to eliminations.', 409, request);
    }
    const entries = await loadEntries(db, tid);
    const want = Number(body?.breakSize) || Number(t.data.breakSize) || 4;
    const br = breakField(entries, want);
    if (br.error) return errorResponse(br.error, 400, request);
    if (br.size < 2) return errorResponse('Not enough entries to run an elimination round.', 400, request);

    const label = elimLabel(br.size);
    const key = roundKey('elim', 1);
    const pairings = elimPairings(br.breaking, label, 1)
      .map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));
    const checked = checkedMotion(body?.motion);
    if (!checked.ok) return errorResponse(checked.error, 400, request);

    await t.ref.collection('rounds').doc(key).set({
      roundNo: 1,
      kind: 'elim',
      label,
      motion: checked.motion,
      status: 'pending',
      pairings,
      breaking: br.breaking,
      tieOnLine: !!br.tieOnLine,
      pairedAt: FieldValue.serverTimestamp(),
    });
    // Everyone who didn't break is done. Marking them explicitly is
    // what keeps them out of later elim draws and off the active list.
    const breakingIds = new Set(br.breaking.map((b) => b.entryId));
    const batch = db.batch();
    entries.forEach((e) => {
      if (!breakingIds.has(e.entryId) && e.status !== 'withdrawn') {
        batch.update(t.ref.collection('entries').doc(e.entryId), { status: 'eliminated' });
      }
    });
    await batch.commit();
    await applySeating(db, tid, t.data, pairings, [], entries);
    await stampTournamentRooms(db, tid, t.data, pairings, entries, key);
    await t.ref.update({ status: 'break', breakSize: br.size, updatedAt: FieldValue.serverTimestamp() });

    return jsonResponse({ ok: true, size: br.size, label, breaking: br.breaking, tieOnLine: !!br.tieOnLine }, 200, request);
  }

  // ── advance-elim ────────────────────────────────────────────────
  if (action === 'advance-elim') {
    if (t.data.ratingCompetition === true) {
      return errorResponse('This event is a continuous rating ladder and has no elimination rounds.', 409, request);
    }
    const fromRound = Number(body?.roundNo) || 1;
    const fromKey = roundKey('elim', fromRound);
    const snap = await t.ref.collection('rounds').doc(fromKey).get();
    if (!snap.exists) return errorResponse('That elimination round does not exist.', 404, request);
    const pairings = snap.data().pairings || [];
    const undecided = pairings.filter((p) => p.status !== 'complete').length;
    if (undecided) return errorResponse(undecided + ' result(s) still outstanding in that round.', 409, request);

    const winners = advanceElim(pairings);
    if (winners.length <= 1) {
      await t.ref.update({
        status: 'complete',
        champion: winners[0] || null,
        completedAt: FieldValue.serverTimestamp(),
      });
      return jsonResponse({ ok: true, complete: true, champion: winners[0] || null }, 200, request);
    }

    const nextRound = fromRound + 1;
    const key = roundKey('elim', nextRound);
    const label = elimLabel(winners.length);
    const next = elimPairings(winners, label, nextRound)
      .map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));
    const checked = checkedMotion(body?.motion);
    if (!checked.ok) return errorResponse(checked.error, 400, request);
    await t.ref.collection('rounds').doc(key).set({
      roundNo: nextRound,
      kind: 'elim',
      label,
      motion: checked.motion,
      status: 'pending',
      pairings: next,
      pairedAt: FieldValue.serverTimestamp(),
    });
    const allEntries = await loadEntries(db, tid);
    await applySeating(db, tid, t.data, next, [], allEntries);
    await stampTournamentRooms(db, tid, t.data, next, allEntries, key);
    return jsonResponse({ ok: true, label, pairings: next }, 200, request);
  }

  // ── entry admin ─────────────────────────────────────────────────
  // A director needs to be able to drop a no-show and re-add a team
  // that turned up late, without the team having to do anything.
  if (action === 'set-entry-status') {
    const entryId = String(body?.entryId || '');
    const next = String(body?.status || '');
    const allowed = new Set(['registered', 'checked_in', 'withdrawn', 'dropped', 'eliminated']);
    if (!entryId || !allowed.has(next)) return errorResponse('Bad entry status', 400, request);
    await t.ref.collection('entries').doc(entryId).update({ status: next });
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

// Undo a previously applied result so an amendment doesn't double
// count. Mirrors resultPatch exactly; if one changes, so must this.
function reverseResult(entry, pairing, side) {
  const wasWinner = pairing.winner === side;
  const speaks = Number(side === 'gov' ? pairing.govSpeaks : pairing.oppSpeaks) || 0;
  const opponentId = side === 'gov' ? pairing.oppEntry : pairing.govEntry;
  return {
    ...entry,
    wins: Math.max(0, Number(entry.wins || 0) - (wasWinner ? 1 : 0)),
    losses: Math.max(0, Number(entry.losses || 0) - (wasWinner ? 0 : 1)),
    speaks: Math.max(0, Number(entry.speaks || 0) - speaks),
    sideCount: {
      gov: Math.max(0, Number(entry.sideCount?.gov || 0) - (side === 'gov' ? 1 : 0)),
      opp: Math.max(0, Number(entry.sideCount?.opp || 0) - (side === 'opp' ? 1 : 0)),
    },
    opponents: (Array.isArray(entry.opponents) ? entry.opponents : []).filter((o) => o !== opponentId),
  };
}

export const config = { path: '/api/tournament-admin' };
