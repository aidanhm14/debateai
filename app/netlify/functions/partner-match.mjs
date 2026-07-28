import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// ── Partner matching for 2v2 rounds ────────────────────────────────
//
// A 2v2 round needs THREE things to exist before a room can open:
// a partner, an opposing team, and four people awake at the same
// time. This function owns the first: turning two solo debaters into
// a standing duo. /api/duo-pair owns the second (duo vs duo).
//
// Two ways to get a partner, both landing in the same `duo_teams` doc:
//
//   1. INVITE A SPECIFIC PERSON. `create-team` mints a team with one
//      member and a 6-character invite code; the partner posts that
//      code to `join-code`. This is the path for people who already
//      debate together and just want the platform to know it.
//
//   2. OPEN POOL. `partner_pool/{uid}` is the "looking for a partner"
//      board. Clients poll it, POST `propose` against a candidate,
//      and the server lands BOTH docs in a mutual-accept handshake.
//      Both accept → a duo_teams doc is created and both pool docs
//      flip to 'teamed'. Either declines → both revert to 'looking'
//      with a mutual, EXPIRING skip.
//
// Everything that touches two users' docs runs in an admin-SDK
// transaction here, never client-side. That is the same lesson
// spar-pair.mjs was built on: Firestore rules can't express "user A
// may write user B's doc only as part of a legitimate match," so the
// client transaction silently half-committed and the loser sat
// waiting forever. Rules deny cross-user writes; this function
// bypasses them with server credentials and does both sides atomically.
//
// The handshake shape (propose → mutual accept → commit, with an
// expiring skip on decline) is deliberately the same as /spar's
// consent gate. Debaters have already learned that interaction there,
// and the failure modes are known: ghost tabs, dead peers, races.

// Formats a 2v2 makes sense in. Asian Parli and WSDC are 3v3 in the
// wild but run 2v2 here (live-round seats two per bench); BP/Worlds
// are 2-per-team by definition. LD, Policy, and the Career trio are
// 1v1 by construction and never reach this surface.
const TEAM_FORMATS = new Set(['quick', 'apda', 'bp', 'worlds', 'asian']);

const NOTE_MAX = 160;
const NAME_MAX = 48;

function cleanText(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Invite codes are read aloud and typed by hand across a room, so the
// alphabet drops every glyph pair that survives being misheard or
// misread: no O/0, no I/1/L, no S/5, no B/8.
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY2346789';
function makeInviteCode() {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function shortName(profile) {
  const full = String(profile?.displayName || profile?.name || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
  }
  return parts[0] || 'Anonymous';
}

// Default team name from two short names. "Hollinger & Rao" reads
// like a real team on a draw sheet; the host can rename it later.
function defaultTeamName(a, b) {
  const left = String(a || 'Team').split(' ')[0];
  const right = String(b || 'Partner').split(' ')[0];
  return cleanText(left + ' & ' + right, NAME_MAX);
}

// Same tsMs contract as spar-pair: an unresolved serverTimestamp means
// "written a beat ago," NOT epoch 0. Returning 0 for a fresh doc is
// what made spar-pair cancel live peers as ghosts; don't reintroduce it.
function tsMs(t) {
  if (!t) return Date.now();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t._seconds != null) return t._seconds * 1000;
  if (t.seconds != null) return t.seconds * 1000;
  return Date.now();
}

// A pool entry is a person sitting at a screen. Three minutes past
// their last heartbeat they are gone, and proposing to them just
// burns the live debater's patience.
const STALE_POOL_MS = 3 * 60 * 1000;
// Declining someone shouldn't blind you to them forever — at this
// user volume a permanent mutual skip deadlocks a two-person pool.
const SKIP_TTL_MS = 5 * 60 * 1000;
// A proposal the peer never answered. Their client auto-declines at
// 20s, so past this they aren't there.
const GHOST_PROPOSAL_MS = 25 * 1000;
const REAPER_MS = 6 * 60 * 1000;
const REAPER_THROTTLE_MS = 60 * 1000;

const attempts = new Map();
const THROTTLE_MS = 600;
const RESPOND_THROTTLE_MS = 250;
function isThrottled(key, windowMs = THROTTLE_MS) {
  const now = Date.now();
  const last = attempts.get(key) || 0;
  if (now - last < windowMs) return true;
  attempts.set(key, now);
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, t] of attempts) if (t < cutoff) attempts.delete(k);
}, 5 * 60 * 1000);

function skipActive(data, uid) {
  const skips = Array.isArray(data?.skipUids) ? data.skipUids : [];
  if (!skips.includes(uid)) return false;
  const at = data?.skipAt && data.skipAt[uid];
  return (Date.now() - tsMs(at)) <= SKIP_TTL_MS;
}

let lastReaperAt = 0;
async function reapStalePool(db) {
  const now = Date.now();
  if (now - lastReaperAt < REAPER_THROTTLE_MS) return;
  lastReaperAt = now;
  try {
    const cutoff = new Date(now - REAPER_MS);
    const [looking, proposed] = await Promise.all([
      db.collection('partner_pool').where('status', '==', 'looking')
        .where('joinedAt', '<', cutoff).limit(40).get(),
      db.collection('partner_pool').where('status', '==', 'proposed')
        .where('joinedAt', '<', cutoff).limit(40).get(),
    ]);
    const docs = [...looking.docs, ...proposed.docs];
    if (!docs.length) return;
    const batch = db.batch();
    docs.forEach((d) => batch.update(d.ref, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: 'stale_reaper',
    }));
    await batch.commit();
  } catch (err) {
    console.warn('[partner-match] reaper failed (likely missing index status+joinedAt):', err?.message || err);
  }
}

// Fields a pool doc must shed to go back to a clean 'looking' state.
function revertShape() {
  return {
    status: 'looking',
    joinedAt: FieldValue.serverTimestamp(),
    proposedTo: FieldValue.delete(),
    proposedToName: FieldValue.delete(),
    proposedToPhoto: FieldValue.delete(),
    proposedAt: FieldValue.delete(),
    accepts: FieldValue.delete(),
    proposedFormat: FieldValue.delete(),
    teamId: FieldValue.delete(),
  };
}

// Team membership is one-at-a-time. A debater who is already on a
// ready duo can't also be in the pool or accept a second proposal —
// otherwise two duos queue the same person into two 2v2 rooms.
async function activeTeamOf(db, uid) {
  const snap = await db.collection('duo_teams')
    .where('members', 'array-contains', uid)
    .where('status', 'in', ['forming', 'ready'])
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

function teamPublic(doc) {
  const d = doc.data();
  return {
    teamId: doc.id,
    name: d.name || '',
    members: d.members || [],
    memberInfo: d.memberInfo || {},
    format: d.format || 'quick',
    status: d.status || 'forming',
    inviteCode: d.inviteCode || '',
    record: d.record || { wins: 0, losses: 0 },
    createdBy: d.createdBy || '',
  };
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
    console.error('[partner-match] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const myUid = decoded.sub;
  if (!myUid) return errorResponse('Invalid token subject', 401, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || '').trim();
  const db = getDb();
  const pool = db.collection('partner_pool');
  const teams = db.collection('duo_teams');

  const throttleKey = (action === 'respond' || action === 'join-code')
    ? myUid + ':' + action
    : myUid;
  const throttleWindow = action === 'respond' ? RESPOND_THROTTLE_MS : THROTTLE_MS;
  if (isThrottled(throttleKey, throttleWindow)) {
    return errorResponse('Slow down a moment and try again.', 429, request);
  }

  // ── create-team ─────────────────────────────────────────────────
  // Mint a duo with me in it plus an invite code to hand a partner.
  // Idempotent: if I already have a live team, return that one rather
  // than stranding the first team with an orphaned invite code.
  if (action === 'create-team') {
    const format = String(body?.format || 'quick').toLowerCase();
    if (!TEAM_FORMATS.has(format)) return errorResponse('Invalid format', 400, request);
    const existing = await activeTeamOf(db, myUid);
    if (existing) return jsonResponse({ ok: true, existing: true, team: teamPublic(existing) }, 200, request);

    const me = {
      name: shortName(body?.profile),
      username: cleanText(body?.profile?.username, 32),
      photoURL: String(body?.profile?.photoURL || '').slice(0, 400),
    };
    const ref = teams.doc();
    const doc = {
      name: cleanText(body?.name, NAME_MAX) || (me.name + "'s team"),
      members: [myUid],
      memberInfo: { [myUid]: me },
      format,
      status: 'forming',
      inviteCode: makeInviteCode(),
      createdBy: myUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      record: { wins: 0, losses: 0 },
    };
    await ref.set(doc);
    // Leaving the pool is best-effort: a stale 'looking' doc is
    // harmless (the reaper sweeps it, and proposals against a teamed
    // user are rejected in the transaction below).
    await pool.doc(myUid).set({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    return jsonResponse({ ok: true, team: teamPublic(await ref.get()) }, 200, request);
  }

  // ── join-code ───────────────────────────────────────────────────
  // Redeem a partner's invite code. Runs in a transaction because two
  // people can race the same code and a duo has exactly two seats.
  if (action === 'join-code') {
    const code = String(body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) return errorResponse('That code does not look right. Six characters.', 400, request);

    const mine = await activeTeamOf(db, myUid);
    if (mine) return errorResponse('You are already on a team. Leave it before joining another.', 409, request);

    const snap = await teams.where('inviteCode', '==', code).where('status', '==', 'forming').limit(1).get();
    if (snap.empty) return errorResponse('No open team with that code. Check the code, or ask for a new one.', 404, request);

    const ref = snap.docs[0].ref;
    const me = {
      name: shortName(body?.profile),
      username: cleanText(body?.profile?.username, 32),
      photoURL: String(body?.profile?.photoURL || '').slice(0, 400),
    };
    try {
      const result = await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists) return { ok: false, reason: 'team_gone' };
        const d = cur.data();
        if (d.status !== 'forming') return { ok: false, reason: 'team_full' };
        const members = Array.isArray(d.members) ? d.members : [];
        if (members.includes(myUid)) return { ok: true, already: true };
        if (members.length >= 2) return { ok: false, reason: 'team_full' };
        const partnerUid = members[0];
        const partnerName = d.memberInfo?.[partnerUid]?.name || 'Partner';
        tx.update(ref, {
          members: [...members, myUid],
          ['memberInfo.' + myUid]: me,
          status: 'ready',
          // Auto-name only if the creator never set one. A team that
          // named itself keeps its name.
          name: (!d.name || d.name.endsWith("'s team")) ? defaultTeamName(partnerName, me.name) : d.name,
          // The code stops working the moment the second seat fills.
          inviteCode: FieldValue.delete(),
          readyAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { ok: true };
      });
      if (!result.ok) {
        const msg = result.reason === 'team_full'
          ? 'That team already has two debaters.'
          : 'That team is no longer open.';
        return errorResponse(msg, 409, request);
      }
      await pool.doc(myUid).set({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      return jsonResponse({ ok: true, team: teamPublic(await ref.get()) }, 200, request);
    } catch (err) {
      console.error('[partner-match] join-code error:', err?.message || err);
      return errorResponse('Could not join that team. Try again.', 500, request);
    }
  }

  // ── leave-team ──────────────────────────────────────────────────
  // Leaving a two-person team ends it. There is no such thing as a
  // 2v2 duo with one member sitting in a queue, so the doc is
  // disbanded outright and the remaining partner is freed to re-pool
  // rather than left holding a ghost team.
  if (action === 'leave-team') {
    const mine = await activeTeamOf(db, myUid);
    if (!mine) return jsonResponse({ ok: true, already: true }, 200, request);
    await mine.ref.update({
      status: 'disbanded',
      disbandedBy: myUid,
      disbandedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Pull the team out of the 2v2 queue if it was sitting in one.
    await db.collection('duo_queue').doc(mine.id)
      .set({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelReason: 'team_disbanded' }, { merge: true })
      .catch(() => {});
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── my-team ─────────────────────────────────────────────────────
  if (action === 'my-team') {
    const mine = await activeTeamOf(db, myUid);
    return jsonResponse({ ok: true, team: mine ? teamPublic(mine) : null }, 200, request);
  }

  // ── propose ─────────────────────────────────────────────────────
  // Phase 1 of the open-pool handshake: land both pool docs in a
  // mutual-accept state. Nobody is teamed until both sides say yes —
  // a partner is a bigger commitment than an opponent, so unlike a
  // plain spar match this NEVER auto-completes.
  if (action === 'propose') {
    const peerUid = String(body?.peerUid || '').trim();
    if (!peerUid || peerUid === myUid) return errorResponse('Invalid peerUid', 400, request);

    reapStalePool(db);
    const myRef = pool.doc(myUid);
    const peerRef = pool.doc(peerUid);

    try {
      const result = await db.runTransaction(async (tx) => {
        const [mineSnap, theirsSnap] = await Promise.all([tx.get(myRef), tx.get(peerRef)]);
        if (!mineSnap.exists || !theirsSnap.exists) return { ok: false, reason: 'pool_doc_missing' };
        const mine = mineSnap.data();
        const theirs = theirsSnap.data();
        if (mine.status !== 'looking' || theirs.status !== 'looking') return { ok: false, reason: 'lost_race' };

        const peerAge = Date.now() - tsMs(theirs.joinedAt);
        if (peerAge > STALE_POOL_MS) {
          tx.update(peerRef, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelReason: 'stale_peer_skip',
          });
          return { ok: false, reason: 'stale_peer' };
        }
        if (skipActive(mine, peerUid) || skipActive(theirs, myUid)) return { ok: false, reason: 'skipped_peer' };

        const myShort = shortName(mine);
        const peerShort = shortName(theirs);
        // Older joiner's format wins, same rule spar-pair uses for
        // cross-format pairs: whoever has been waiting longer set the
        // expectation first.
        const proposedFormat = TEAM_FORMATS.has(String(theirs.format || '')) ? theirs.format : (mine.format || 'quick');
        const base = {
          status: 'proposed',
          proposedAt: FieldValue.serverTimestamp(),
          joinedAt: FieldValue.serverTimestamp(),
          proposedFormat,
          // Both sides answer explicitly. The proposer's own yes is
          // implied by the act of proposing.
          accepts: { [myUid]: true, [peerUid]: false },
        };
        tx.update(myRef, {
          ...base,
          proposedTo: peerUid,
          proposedToName: peerShort,
          proposedToPhoto: String(theirs.photoURL || ''),
        });
        tx.update(peerRef, {
          ...base,
          proposedTo: myUid,
          proposedToName: myShort,
          proposedToPhoto: String(mine.photoURL || ''),
        });
        return { ok: true, pending: 'accept', proposedFormat };
      });
      return jsonResponse(result, 200, request);
    } catch (err) {
      console.error('[partner-match] propose error:', err?.message || err);
      return errorResponse('Proposal failed: ' + (err?.message || 'unknown'), 500, request);
    }
  }

  // ── respond ─────────────────────────────────────────────────────
  // Phase 2. Accept flips my flag; both flags true creates the duo.
  // Decline (or an auto-decline timer) reverts both docs with a
  // mutual expiring skip.
  if (action === 'respond') {
    const peerUid = String(body?.peerUid || '').trim();
    const accept = !!body?.accept;
    const auto = !!body?.auto;
    if (!peerUid || peerUid === myUid) return errorResponse('Invalid peerUid', 400, request);

    const myRef = pool.doc(myUid);
    const peerRef = pool.doc(peerUid);
    const newTeamRef = teams.doc();

    try {
      const result = await db.runTransaction(async (tx) => {
        const [mineSnap, theirsSnap] = await Promise.all([tx.get(myRef), tx.get(peerRef)]);
        if (!mineSnap.exists) return { ok: false, reason: 'proposal_gone' };
        const mine = mineSnap.data();
        const theirs = theirsSnap.exists ? theirsSnap.data() : null;
        if (mine.status !== 'proposed' || mine.proposedTo !== peerUid) return { ok: false, reason: 'proposal_gone' };

        // Peer evaporated mid-handshake. Free myself; there is no
        // proposal left to answer.
        if (!theirs || theirs.status !== 'proposed' || theirs.proposedTo !== myUid) {
          tx.update(myRef, {
            ...revertShape(),
            skipUids: FieldValue.arrayUnion(peerUid),
            ['skipAt.' + peerUid]: FieldValue.serverTimestamp(),
          });
          return { ok: true, freed: true };
        }

        if (!accept) {
          // Ghost detection, same reasoning as spar-pair: if MY timer
          // fired and the peer never touched their side of a proposal
          // this old, their tab is dead. Cancel it instead of
          // reverting it to 'looking' with a fresh joinedAt — that
          // revert would dress a corpse up as the newest doc in the
          // pool and feed it straight back to the next proposer.
          const age = Date.now() - tsMs(mine.proposedAt);
          const peerNeverActed = !(theirs.accepts && theirs.accepts[peerUid]);
          if (auto && peerNeverActed && age > GHOST_PROPOSAL_MS) {
            tx.update(peerRef, {
              status: 'cancelled',
              cancelledAt: FieldValue.serverTimestamp(),
              cancelReason: 'proposal_ghost',
            });
          } else {
            tx.update(peerRef, {
              ...revertShape(),
              skipUids: FieldValue.arrayUnion(myUid),
              ['skipAt.' + myUid]: FieldValue.serverTimestamp(),
              lastPassBy: myUid,
              lastPassAt: FieldValue.serverTimestamp(),
            });
          }
          tx.update(myRef, {
            ...revertShape(),
            skipUids: FieldValue.arrayUnion(peerUid),
            ['skipAt.' + peerUid]: FieldValue.serverTimestamp(),
          });
          return { ok: true, declined: true };
        }

        const bothIn = !!(theirs.accepts && theirs.accepts[peerUid]);
        if (!bothIn) {
          tx.update(myRef, { ['accepts.' + myUid]: true });
          tx.update(peerRef, { ['accepts.' + myUid]: true });
          return { ok: true, pending: 'peer' };
        }

        // Both yes. Create the duo and retire both pool docs.
        const myShort = shortName(mine);
        const peerShort = shortName(theirs);
        const format = TEAM_FORMATS.has(String(mine.proposedFormat || '')) ? mine.proposedFormat : 'quick';
        tx.set(newTeamRef, {
          name: defaultTeamName(peerShort, myShort),
          members: [peerUid, myUid],
          memberInfo: {
            [peerUid]: { name: peerShort, username: cleanText(theirs.username, 32), photoURL: String(theirs.photoURL || '') },
            [myUid]: { name: myShort, username: cleanText(mine.username, 32), photoURL: String(mine.photoURL || '') },
          },
          format,
          status: 'ready',
          createdBy: peerUid,
          source: 'pool',
          createdAt: FieldValue.serverTimestamp(),
          readyAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          record: { wins: 0, losses: 0 },
        });
        const teamed = {
          status: 'teamed',
          teamId: newTeamRef.id,
          teamedAt: FieldValue.serverTimestamp(),
        };
        tx.update(myRef, teamed);
        tx.update(peerRef, teamed);
        return { ok: true, teamId: newTeamRef.id, format };
      });

      if (result.ok && result.teamId) {
        const teamDoc = await newTeamRef.get();
        return jsonResponse({ ...result, team: teamPublic(teamDoc) }, 200, request);
      }
      return jsonResponse(result, 200, request);
    } catch (err) {
      console.error('[partner-match] respond error:', err?.message || err);
      return errorResponse('Response failed: ' + (err?.message || 'unknown'), 500, request);
    }
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/partner-match' };
