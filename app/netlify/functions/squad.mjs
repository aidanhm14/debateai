/* squad.mjs  —  /api/squad
 *
 * Coach-side roster management, and the private rounds a coach sets for
 * the roster. This is NOT the billing `teams` collection: that one owns
 * Stripe customers, seats and usage caps, and creating one mints a Stripe
 * customer. A coach building a roster should not have to open a billing
 * object to do it, and a debater should be able to sit on a school squad
 * and a club squad at once, which `getUserTeam`'s one-team-per-user rule
 * forbids. So squads are their own thing, and they carry no money.
 *
 * Everything here is admin-SDK. The three collections are left under
 * firestore.rules' terminal default-deny and no client ever reads or
 * writes them directly, which is the posture spar-pair was rebuilt onto
 * (2026-08-18): a cross-user write a client could forge is the one
 * failure a roster cannot absorb, since a forged membership row reads as
 * a coach's own student.
 *
 * Routes
 *   GET  /api/squad                → { squads: [...] } every squad the caller is in
 *   GET  /api/squad?id=<squadId>   → { squad, members, assignments, me }
 *   POST /api/squad  { action, ... }
 *     create   { name, program? }          → open a squad, caller is the coach
 *     join     { code }                    → join by 6-character code
 *     leave    { squadId }                 → a member removes themselves
 *     close    { squadId }                 → coach deletes the squad
 *     rename   { squadId, name, program? } → coach only
 *     code     { squadId }                 → coach rolls a new join code
 *     remove   { squadId, uid }            → coach drops a member
 *     role     { squadId, uid, role }      → head coach promotes to assistant
 *     assign   { squadId, aUid, bUid, motion, format, aSide?, note?, dueAt? }
 *     unassign { squadId, id }             → coach cancels an unplayed round
 *
 * Collections
 *   squads/{squadId}
 *     { name, program, coachUid, coachName, joinCode, memberCount,
 *       createdAt, updatedAt }
 *   squad_members/{squadId}__{uid}          deterministic id, so a double
 *     { squadId, uid, name, email, role, joinedAt }   join is a no-op merge
 *   squad_assignments/{assignmentId}
 *     { squadId, room, motion, format, note, aUid, aName, bUid, bName,
 *       aSide, createdBy, createdAt, dueAt, canceledAt }
 *
 * Named accounts only, on the 2026-08-18 reasoning: anonymous Firebase
 * uids are free and unlimited to mint, and a roster whose rows can be an
 * unaccountable throwaway is a roster a coach cannot trust.
 * `isNamedAccount` reads the sign-in provider off the verified token, so
 * it cannot be claimed by a client.
 */

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';

const SQUADS = 'squads';
const MEMBERS = 'squad_members';
const ASSIGNMENTS = 'squad_assignments';

// Ceilings. None of these are product decisions, they are blast-radius
// caps: one runaway account should not be able to fill a collection.
const MAX_COACHED = 8;          // squads one account may run
const MAX_JOINED = 12;          // squads one account may sit on
const MAX_MEMBERS = 80;         // roster size (a big HS program is ~50)
const MAX_ASSIGNMENTS = 60;     // open rounds returned / kept per squad
const NAME_MAX = 60;
const PROGRAM_MAX = 80;
const MOTION_MAX = 300;
const NOTE_MAX = 240;

// Two-bench formats plus the four-team ones /spar already offers. The
// judge prompt (JUDGE_RULES in live-round.html) covers exactly this set.
const FORMATS = ['quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy'];

// No I, O, 0, 1 — a join code gets read off a whiteboard.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

const WRITE_LAYERS = [
  { window: 60_000, max: 20, label: 'min' },
  { window: 3_600_000, max: 120, label: 'hour' },
];

const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

function clip(v, max) {
  return String(v == null ? '' : v).replace(CONTROL_CHARS, ' ').trim().slice(0, max);
}

function randomCode() {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function randomRoom() {
  const s = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += s[Math.floor(Math.random() * s.length)];
  return 'Squad-' + out;
}

function memberId(squadId, uid) {
  return squadId + '__' + uid;
}

function iso(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return null;
}

/** A join code has to be unique to be typeable. Try a few, then give up
 *  loudly rather than handing two squads the same code. */
async function mintCode(db) {
  for (let i = 0; i < 6; i++) {
    const code = randomCode();
    const hit = await db.collection(SQUADS).where('joinCode', '==', code).limit(1).get();
    if (hit.empty) return code;
  }
  throw new Error('code_exhausted');
}

async function membershipsFor(db, uid) {
  const snap = await db.collection(MEMBERS)
    .where('uid', '==', uid)
    .limit(MAX_JOINED + MAX_COACHED)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function requireMembership(db, squadId, uid) {
  if (!squadId) return null;
  const doc = await db.collection(MEMBERS).doc(memberId(squadId, uid)).get();
  if (!doc.exists) return null;
  return { id: doc.id, ref: doc.ref, ...doc.data() };
}

function isCoachRole(m) {
  return !!m && (m.role === 'coach' || m.role === 'assistant');
}

/** Per-member round history, read off `leaderboard_entries` (uid + score +
 *  completedAt, written by every judged round). Chunked at 10 because that
 *  is Firestore's ceiling on an `in` filter, and left unordered so the
 *  query rides the automatic single-field index instead of needing a
 *  composite one deployed before this endpoint can answer. */
async function statsFor(db, uids) {
  const out = {};
  uids.forEach((u) => { out[u] = { rounds: 0, best: null, last: null, scale: 100 }; });
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    let snap;
    try {
      snap = await withDeadline(
        db.collection('leaderboard_entries').where('uid', 'in', chunk).limit(300).get(),
        3000,
      );
    } catch (err) {
      console.warn('[squad] stats chunk failed', err && err.message);
      continue;
    }
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const row = out[d.uid];
      if (!row) return;
      row.rounds += 1;
      const score = typeof d.score === 'number' ? d.score : null;
      // A pre-migration entry is on the 30-point scale (see the 2026-08-18
      // speaker-point decision). Report the scale beside the number rather
      // than converting, so the roster never prints a 27 next to an 88 as
      // though they measured the same thing.
      const scale = (d.scoreScale === 100 || (score != null && score > 30)) ? 100 : 30;
      if (score != null && (row.best == null || score > row.best)) {
        row.best = score;
        row.scale = scale;
      }
      const at = iso(d.completedAt) || iso(d.createdAt);
      if (at && (!row.last || at > row.last)) row.last = at;
    });
  }
  return out;
}

/** Assignments carry a room id, and the round itself lives in `live_rounds`.
 *  Read those docs so the board can say "played" without the coach having
 *  to ask. Bounded by MAX_ASSIGNMENTS, one get per row. */
async function roundStateFor(db, rooms) {
  const out = {};
  await Promise.all(rooms.map(async (room) => {
    try {
      const doc = await withDeadline(db.collection('live_rounds').doc(room).get(), 2500);
      if (!doc.exists) { out[room] = { state: 'open' }; return; }
      const d = doc.data() || {};
      const speeches = Array.isArray(d.speeches) ? d.speeches.length : 0;
      const decided = !!(d.completedAt || d.ballot || d.winner);
      out[room] = {
        state: decided ? 'judged' : ((speeches > 0 || d.status === 'round') ? 'live' : 'open'),
        speeches,
        winner: d.winner || (d.ballot && d.ballot.winner) || null,
        completedAt: iso(d.completedAt) || null,
      };
    } catch (err) {
      out[room] = { state: 'open' };
    }
  }));
  return out;
}

function squadRow(doc, membership) {
  const d = doc.data() || {};
  const coach = isCoachRole(membership);
  return {
    id: doc.id,
    name: d.name || 'Squad',
    program: d.program || '',
    coachName: d.coachName || '',
    memberCount: d.memberCount || 1,
    role: membership ? membership.role : 'debater',
    // The join code is the credential that opens the roster, so only
    // someone who can already manage the roster is shown it.
    joinCode: coach ? (d.joinCode || '') : null,
    createdAt: iso(d.createdAt),
  };
}

// ── GET ────────────────────────────────────────────────────────────────

async function handleList(db, uid) {
  const mine = await membershipsFor(db, uid);
  if (!mine.length) return { squads: [] };
  const docs = await db.getAll(...mine.map((m) => db.collection(SQUADS).doc(m.squadId)));
  const byId = {};
  mine.forEach((m) => { byId[m.squadId] = m; });
  const squads = docs
    .filter((d) => d.exists)
    .map((d) => squadRow(d, byId[d.id]))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { squads };
}

async function handleDetail(db, uid, squadId) {
  const membership = await requireMembership(db, squadId, uid);
  if (!membership) return { error: 'You are not on this squad.', status: 403 };

  const doc = await db.collection(SQUADS).doc(squadId).get();
  if (!doc.exists) return { error: 'Squad not found.', status: 404 };

  const memberSnap = await db.collection(MEMBERS)
    .where('squadId', '==', squadId)
    .limit(MAX_MEMBERS + 5)
    .get();
  const members = memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const uids = members.map((m) => m.uid).filter(Boolean);
  const coach = isCoachRole(membership);

  const asnSnap = await db.collection(ASSIGNMENTS)
    .where('squadId', '==', squadId)
    .limit(MAX_ASSIGNMENTS * 3)
    .get();
  let assignments = asnSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => !a.canceledAt)
    .sort((a, b) => String(iso(b.createdAt) || '').localeCompare(String(iso(a.createdAt) || '')))
    .slice(0, MAX_ASSIGNMENTS);

  // A debater sees the rounds they are actually in. A coach sees the board.
  if (!coach) assignments = assignments.filter((a) => a.aUid === uid || a.bUid === uid);

  const [stats, rounds] = await Promise.all([
    uids.length ? statsFor(db, uids) : Promise.resolve({}),
    assignments.length ? roundStateFor(db, assignments.map((a) => a.room)) : Promise.resolve({}),
  ]);

  return {
    squad: squadRow(doc, membership),
    me: { uid, role: membership.role, canManage: coach },
    members: members
      .map((m) => ({
        uid: m.uid,
        name: m.name || 'Debater',
        // Emails are roster PII. A coach who invited the roster can see
        // them; a peer on the same squad has no reason to.
        email: coach ? (m.email || '') : '',
        role: m.role || 'debater',
        joinedAt: iso(m.joinedAt),
        stats: stats[m.uid] || { rounds: 0, best: null, last: null, scale: 100 },
      }))
      .sort((a, b) => {
        const rank = (r) => (r === 'coach' ? 0 : r === 'assistant' ? 1 : 2);
        return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name);
      }),
    assignments: assignments.map((a) => ({
      id: a.id,
      room: a.room,
      motion: a.motion || '',
      format: a.format || 'quick',
      note: a.note || '',
      aUid: a.aUid, aName: a.aName, aSide: a.aSide || 'pro',
      bUid: a.bUid, bName: a.bName,
      createdByName: a.createdByName || '',
      createdAt: iso(a.createdAt),
      dueAt: iso(a.dueAt),
      round: rounds[a.room] || { state: 'open' },
    })),
  };
}

// ── POST ───────────────────────────────────────────────────────────────

async function actCreate(db, user, body) {
  const name = clip(body.name, NAME_MAX);
  if (!name) return { error: 'Give the squad a name.', status: 400 };

  const mine = await membershipsFor(db, user.uid);
  if (mine.filter((m) => m.role === 'coach').length >= MAX_COACHED) {
    return { error: 'You already run ' + MAX_COACHED + ' squads.', status: 409 };
  }

  const joinCode = await mintCode(db);
  const ref = db.collection(SQUADS).doc();
  await ref.set({
    name,
    program: clip(body.program, PROGRAM_MAX),
    coachUid: user.uid,
    coachName: user.name,
    joinCode,
    memberCount: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection(MEMBERS).doc(memberId(ref.id, user.uid)).set({
    squadId: ref.id,
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: 'coach',
    joinedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, squadId: ref.id, joinCode };
}

async function actJoin(db, user, body) {
  const code = clip(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LEN) return { error: 'That code does not look right.', status: 400 };

  const snap = await db.collection(SQUADS).where('joinCode', '==', code).limit(1).get();
  if (snap.empty) return { error: 'No squad uses that code.', status: 404 };
  const doc = snap.docs[0];
  const squadId = doc.id;

  const already = await requireMembership(db, squadId, user.uid);
  if (already) return { ok: true, squadId, already: true, name: doc.data().name || 'Squad' };

  const mine = await membershipsFor(db, user.uid);
  if (mine.length >= MAX_JOINED) return { error: 'You are on too many squads.', status: 409 };
  if ((doc.data().memberCount || 0) >= MAX_MEMBERS) {
    return { error: 'That squad is full. Ask the coach to remove someone.', status: 409 };
  }

  await db.collection(MEMBERS).doc(memberId(squadId, user.uid)).set({
    squadId,
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: 'debater',
    joinedAt: FieldValue.serverTimestamp(),
  });
  await doc.ref.update({
    memberCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, squadId, name: doc.data().name || 'Squad' };
}

async function actLeave(db, user, body) {
  const squadId = clip(body.squadId, 60);
  const membership = await requireMembership(db, squadId, user.uid);
  if (!membership) return { ok: true };
  // The coach owns the squad. Letting them walk out would strand a roster
  // nobody can manage, so that is a close, not a leave.
  if (membership.role === 'coach') {
    return { error: 'You run this squad. Close it instead of leaving.', status: 409 };
  }
  await membership.ref.delete();
  await db.collection(SQUADS).doc(squadId).update({
    memberCount: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  return { ok: true };
}

async function actClose(db, user, body) {
  const squadId = clip(body.squadId, 60);
  const membership = await requireMembership(db, squadId, user.uid);
  if (!membership || membership.role !== 'coach') {
    return { error: 'Only the coach can close a squad.', status: 403 };
  }
  const memberSnap = await db.collection(MEMBERS)
    .where('squadId', '==', squadId)
    .limit(MAX_MEMBERS + 5)
    .get();
  const batch = db.batch();
  memberSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection(SQUADS).doc(squadId));
  await batch.commit();
  // Assignments are left in place on purpose: each one points at a real
  // round that may already carry a ballot, and deleting the pointer would
  // orphan a record two debaters can still open by link.
  return { ok: true, closed: true };
}

async function actManage(db, user, body, action) {
  const squadId = clip(body.squadId, 60);
  const membership = await requireMembership(db, squadId, user.uid);
  if (!isCoachRole(membership)) return { error: 'Coaches only.', status: 403 };
  const ref = db.collection(SQUADS).doc(squadId);

  if (action === 'rename') {
    const name = clip(body.name, NAME_MAX);
    if (!name) return { error: 'Give the squad a name.', status: 400 };
    await ref.update({
      name,
      program: clip(body.program, PROGRAM_MAX),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, name };
  }

  if (action === 'code') {
    const joinCode = await mintCode(db);
    await ref.update({ joinCode, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, joinCode };
  }

  if (action === 'remove') {
    const target = clip(body.uid, 128);
    if (target === user.uid) return { error: 'Use Leave to remove yourself.', status: 400 };
    const doc = await db.collection(MEMBERS).doc(memberId(squadId, target)).get();
    if (!doc.exists) return { ok: true };
    if (doc.data().role === 'coach') return { error: 'The coach cannot be removed.', status: 403 };
    await doc.ref.delete();
    await ref.update({
      memberCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    return { ok: true };
  }

  if (action === 'role') {
    // Only the head coach hands out the assistant seat. An assistant who
    // could promote would be able to hand the roster to anyone.
    if (membership.role !== 'coach') return { error: 'Only the head coach can change roles.', status: 403 };
    const target = clip(body.uid, 128);
    const role = body.role === 'assistant' ? 'assistant' : 'debater';
    const doc = await db.collection(MEMBERS).doc(memberId(squadId, target)).get();
    if (!doc.exists) return { error: 'Not on this squad.', status: 404 };
    if (doc.data().role === 'coach') return { error: 'The coach role cannot be changed.', status: 403 };
    await doc.ref.update({ role });
    return { ok: true, role };
  }

  if (action === 'unassign') {
    const id = clip(body.id, 60);
    const doc = await db.collection(ASSIGNMENTS).doc(id).get();
    if (!doc.exists || doc.data().squadId !== squadId) return { error: 'Not found.', status: 404 };
    await doc.ref.update({ canceledAt: FieldValue.serverTimestamp(), canceledBy: user.uid });
    return { ok: true };
  }

  return { error: 'Unknown action.', status: 400 };
}

async function actAssign(db, user, body) {
  const squadId = clip(body.squadId, 60);
  const membership = await requireMembership(db, squadId, user.uid);
  if (!isCoachRole(membership)) return { error: 'Coaches only.', status: 403 };

  const aUid = clip(body.aUid, 128);
  const bUid = clip(body.bUid, 128);
  if (!aUid || !bUid) return { error: 'Pick both debaters.', status: 400 };
  if (aUid === bUid) return { error: 'Pick two different debaters.', status: 400 };

  const [aDoc, bDoc] = await db.getAll(
    db.collection(MEMBERS).doc(memberId(squadId, aUid)),
    db.collection(MEMBERS).doc(memberId(squadId, bUid)),
  );
  if (!aDoc.exists || !bDoc.exists) {
    return { error: 'Both debaters have to be on this squad.', status: 400 };
  }

  const format = FORMATS.indexOf(body.format) >= 0 ? body.format : 'quick';
  const motion = clip(body.motion, MOTION_MAX);
  if (!motion) return { error: 'Set a motion.', status: 400 };
  const aSide = body.aSide === 'con' ? 'con' : 'pro';

  let dueAt = null;
  const due = Number(body.dueAt);
  if (Number.isFinite(due) && due > Date.now() - 86_400_000 && due < Date.now() + 180 * 86_400_000) {
    dueAt = new Date(due);
  }

  const open = await db.collection(ASSIGNMENTS)
    .where('squadId', '==', squadId)
    .limit(MAX_ASSIGNMENTS * 3)
    .get();
  if (open.docs.filter((d) => !d.data().canceledAt).length >= MAX_ASSIGNMENTS) {
    return { error: 'This squad has too many open rounds. Clear some first.', status: 409 };
  }

  const room = randomRoom();
  const ref = db.collection(ASSIGNMENTS).doc();
  await ref.set({
    squadId,
    room,
    motion,
    format,
    note: clip(body.note, NOTE_MAX),
    aUid, aName: aDoc.data().name || 'Debater', aSide,
    bUid, bName: bDoc.data().name || 'Debater',
    createdBy: user.uid,
    createdByName: user.name,
    createdAt: FieldValue.serverTimestamp(),
    dueAt,
  });
  return { ok: true, id: ref.id, room };
}

// ── handler ────────────────────────────────────────────────────────────

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to use squads.', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Sign in again.', 401, request);
  }
  if (!isNamedAccount(decoded)) {
    return errorResponse('A squad needs a real account. Sign in with Google, Apple, or email.', 403, request);
  }

  const user = {
    uid: decoded.sub,
    name: clip(decoded.name || String(decoded.email || '').split('@')[0] || 'Debater', NAME_MAX),
    email: clip(decoded.email || '', 200),
  };
  const db = getDb();

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const id = clip(url.searchParams.get('id'), 60);
      const out = id ? await handleDetail(db, user.uid, id) : await handleList(db, user.uid);
      if (out.error) return errorResponse(out.error, out.status || 400, request);
      return jsonResponse(out, 200, request);
    }

    if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

    const gate = await checkLayers('squad', 'uid_' + user.uid, WRITE_LAYERS);
    if (!gate.ok) return errorResponse('Slow down for a moment.', 429, request);

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid body', 400, request); }
    const action = String(body.action || '');

    let out;
    if (action === 'create') out = await actCreate(db, user, body);
    else if (action === 'join') out = await actJoin(db, user, body);
    else if (action === 'leave') out = await actLeave(db, user, body);
    else if (action === 'close') out = await actClose(db, user, body);
    else if (action === 'assign') out = await actAssign(db, user, body);
    else if (['rename', 'code', 'remove', 'role', 'unassign'].indexOf(action) >= 0) {
      out = await actManage(db, user, body, action);
    } else out = { error: 'Unknown action.', status: 400 };

    if (out.error) return errorResponse(out.error, out.status || 400, request);
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.error('[squad]', err);
    if (err && err.message === 'code_exhausted') {
      return errorResponse('Could not mint a join code. Try again.', 503, request);
    }
    return errorResponse('Something went wrong.', 500, request);
  }
};

export const config = {
  path: '/api/squad',
};
