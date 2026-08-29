import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import { standings } from './lib/tournament.mjs';
import { publicTournamentMotionDraft, tournamentRegistrationOpen } from './lib/tournament-motion-pool.mjs';
import { tournamentRatings } from './lib/tournament-rating.mjs';

// ── Tournament, participant and spectator side ─────────────────────
//
// GET  /api/tournament                 public tournaments
// GET  /api/tournament?t=slug-or-id    one tournament: draw, tab, bracket
// POST /api/tournament                 register / withdraw / check-in
//
// Reads are public and unauthenticated. A tournament draw is a
// spectator surface, and requiring a token to look at a bracket would
// break every link a host posts in a Discord.
//
// Costs are kept flat rather than per-viewer: the whole draw for a
// round is one document (see tournament-admin.mjs for why), and the
// assembled response is shared-cached for a few seconds so a hundred
// people refreshing between rounds is a handful of reads, not
// hundreds. The 2026-07-28 load audit is the reason that is a design
// requirement here rather than an optimization for later.

const CACHE_TTL_MS = 8000;
const cache = new Map();
// Public tournament matchmaking is part of a running drop-in event. Keep an
// explicit emergency stop, but do not make a missing deploy setting silently
// remove the Ready button from everybody at the event.
const PUBLIC_PAIRING_ENABLED = process.env.TOURNAMENT_PUBLIC_PAIRING_ENABLED !== '0';

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) {
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }
}

// What an entry is called when nobody told us: the bare defaults this
// file used to write, plus the 'Debater ABCD' shape it writes now and
// daPublicName() falls back to on the page. The generated shape has to
// be in here or the fix below becomes its own trap, which is what a
// live re-register proved: an entry healed from 'Entry' to
// 'Debater J793' could never then take the real name, because only the
// bare strings were recognised.
const PLACEHOLDER_NAMES = new Set(['Entry', 'Team', 'Debater']);
const GENERATED_NAME_RE = /^Debater [A-Z0-9]{4}$/;
function isPlaceholderName(value) {
  const v = String(value || '').trim();
  return !v || PLACEHOLDER_NAMES.has(v) || GENERATED_NAME_RE.test(v);
}

function cleanText(s, max) {
  return String(s || '')
    .replace(/[ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function publicTournament(id, d) {
  const registrationOpen = tournamentRegistrationOpen(d);
  return {
    tid: id,
    slug: d.slug || id,
    name: d.name || 'Tournament',
    // Missing format means a historical event created under the old
    // APDA default. New events always store `quick` explicitly.
    format: d.format || 'apda',
    teamSize: Number(d.teamSize) || 1,
    status: d.status || 'draft',
    prelimRounds: Number(d.prelimRounds) || 4,
    breakSize: Number(d.breakSize) || 0,
    currentRound: Number(d.currentRound) || 0,
    currentKind: d.currentKind || 'prelim',
    // Drop-in defaults ON: /tournaments promises "turn up whenever" and
    // a host who wants strict synchronous rounds opts OUT explicitly.
    // Absent means true, so existing tournament docs need no migration.
    dropIn: d.dropIn !== false,
    publicPairingEnabled: PUBLIC_PAIRING_ENABLED && d.dropIn !== false,
    // A rating event has no fixed round ceiling or elimination cut. Every
    // completed tournament ballot moves this event's own 1500-point ladder.
    ratingCompetition: d.ratingCompetition === true,
    // Editorial promotion only. Public pages may put this already-public
    // live room first; recording and main-broadcast permission remain
    // separate server-derived decisions.
    spotlightRoom: String(d.spotlightRoom || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120),
    spotlightPairingId: String(d.spotlightPairingId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120),
    spotlightRoundKey: String(d.spotlightRoundKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24),
    description: d.description || '',
    startsAt: d.startsAt || '',
    hostName: d.hostName || '',
    hostUid: d.hostUid || '',
    entryCount: Number(d.entryCount) || 0,
    champion: d.champion || null,
    isPublic: !!d.isPublic,
    // Missing means true for tournaments created before this field was
    // stamped. Casual live rooms keep their separate opt-in policy.
    recordingRequired: true,
    // Public spectating and participant entry are separate permissions.
    // The event stays listed after the roster closes, while every entry
    // surface reads this one server-derived boolean.
    registrationOpen,
    // Opaque deep link into the participant-only group. Firestore rules
    // still gate the thread and its messages to members of that group.
    chatThreadId: String(d.chatThreadId || '').trim().replace(/\//g, '').slice(0, 150),
    motionDraft: publicTournamentMotionDraft(d),
    // Prize-bracket fields (entry-checkout.mjs / stripe-webhook.mjs).
    // Fee lives on the doc so pricing is a data decision, not a deploy;
    // 0 or missing means the tournament is free-only.
    entryFeeCents: Number(d.entryFeeCents) || 0,
    currency: d.currency || 'usd',
    prizePoolCents: Number(d.prizePoolCents) || 0,
    paidEntries: Number(d.paidEntries) || 0,
    // Payout ladder in cents, first place first. The public page renders
    // the prize amounts from THIS, so an event that has not declared a
    // split shows no prize figures rather than an invented one. Same
    // reason entryFeeCents lives on the doc: money is data, not code.
    prizeSplit: Array.isArray(d.prizeSplit)
      ? d.prizeSplit.map((n) => Number(n) || 0).filter((n) => n > 0).slice(0, 5)
      : [],
    // Machine-readable start, alongside the human `startsAt` string.
    // The countdown needs a real instant; a display string like
    // "Sat Aug 29, 10:00 AM ET" is not parseable across browsers.
    startsAtISO: typeof d.startsAtISO === 'string' ? d.startsAtISO : '',
  };
}

// An entry as everyone else sees it. Member uids are included because
// a participant's client needs to recognise its own entry and its own
// room; no email, no contact detail, and nothing that isn't already
// on a public leaderboard.
function publicEntry(e) {
  return {
    entryId: e.entryId,
    name: e.name || 'Team',
    members: Array.isArray(e.members) ? e.members : [],
    memberNames: Array.isArray(e.memberNames) ? e.memberNames : [],
    status: e.status || 'registered',
    // Public pairing ids already appear on the round. Mirroring the
    // active one here lets the participant desk distinguish a room the
    // person still owes from an old unresolved card that was released.
    inPairing: String(e.inPairing || ''),
    // Who the entry debates for. Optional, and free text on purpose:
    // this is a school, a club, a Discord, or a country, and a fixed
    // list would exclude exactly the informal communities we are
    // trying to reach.
    affiliation: cleanText(e.affiliation, 60),
    wins: Number(e.wins || 0),
    losses: Number(e.losses || 0),
    speaks: Number(e.speaks || 0),
    byes: Number(e.byes || 0),
    sideCount: e.sideCount || { gov: 0, opp: 0 },
    opponents: Array.isArray(e.opponents) ? e.opponents : [],
  };
}

// A round that has not been released shows as scheduled and nothing
// else. A draw is confidential until the director publishes it: teams
// prepping against a pairing they were not supposed to see yet is the
// oldest way to lose trust in a tab.
function publicRound(id, d) {
  // A drop-in round has no staged state to protect: it is created at
  // the moment two entrants are seated, so it is released the instant
  // it exists. `kind` is checked as well as `status` so a round written
  // by the queue before it started stamping `status` still renders,
  // rather than showing a live round with no pairings in it forever.
  const released = d.status === 'released' || d.status === 'complete' || d.kind === 'dropin';
  return {
    key: id,
    roundNo: Number(d.roundNo) || 0,
    kind: d.kind || 'prelim',
    label: d.label || '',
    status: d.status || 'pending',
    released,
    motion: released ? (d.motion || '') : '',
    pairings: released ? (d.pairings || []) : [],
    bye: released ? (d.bye || null) : null,
    breaking: released ? (d.breaking || []) : [],
    pullUps: Number(d.pullUps) || 0,
    rematches: Number(d.rematches) || 0,
  };
}

async function readTournament(db, key) {
  // Accept either the document id or the slug, since a host will
  // share whichever one the address bar showed them.
  const byId = await db.collection('tournaments').doc(key).get();
  if (byId.exists) return { id: byId.id, data: byId.data() };
  const bySlug = await db.collection('tournaments').where('slug', '==', key).limit(1).get();
  if (!bySlug.empty) return { id: bySlug.docs[0].id, data: bySlug.docs[0].data() };
  return null;
}

// Registration stays open during prelims, so an activated tournament chat
// has to grow with the roster. Failure to update chat must not roll back a
// valid tournament registration; the next idempotent register or host
// activation heals it.
async function addMembersToTournamentChat(db, t, members, names) {
  const threadId = String(t?.data?.chatThreadId || '').trim().replace(/\//g, '').slice(0, 150);
  if (!threadId) return;
  const ref = db.collection('dm_threads').doc(threadId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const old = snap.data() || {};
    const participants = Array.isArray(old.participants) ? old.participants.slice() : [];
    const participantInfo = { ...(old.participantInfo || {}) };
    const unread = { ...(old.unread || {}) };
    (Array.isArray(members) ? members : []).forEach((rawUid, i) => {
      const uid = String(rawUid || '').trim();
      if (!uid) return;
      if (!participants.includes(uid)) participants.push(uid);
      participantInfo[uid] = {
        name: cleanText((Array.isArray(names) ? names[i] : '') || 'Participant', 48),
        photo: participantInfo[uid]?.photo || '',
      };
      if (unread[uid] == null) unread[uid] = 1;
    });
    tx.set(ref, { participants, participantInfo, unread }, { merge: true });
  });
}

// ── `me`: the caller's own entry receipt ────────────────────────────
// Tournament registration is one shared field. Cash eligibility is
// verified only if a payout is due, so this payload does not divide the
// roster by an age or prize-eligibility flag.
//
// Unauthenticated callers get no `me` key at all, and a bad or expired
// token is treated as absent rather than an error: this is a public
// page that happens to know you, so a stale token should degrade to the
// signed-out view, never 401 the whole tournament.
async function withMine(db, payload, request) {
  const token = extractBearerToken(request);
  if (!token) return payload;
  let uid;
  try { uid = (await verifyIdToken(token)).sub; } catch { return payload; }
  if (!uid) return payload;
  try {
    const snap = await db.collection('tournaments').doc(payload.tournament.tid)
      .collection('entries').where('members', 'array-contains', uid).limit(1).get();
    if (snap.empty) return { ...payload, me: null };
    const d = snap.docs[0];
    const e = d.data() || {};
    return { ...payload, me: {
      entryId: d.id,
      name: e.name || '',
      status: e.status || 'registered',
      checkedIn: e.status === 'checked_in',
    } };
  } catch { return payload; }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  // ── Reads ───────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const key = String(url.searchParams.get('t') || '').trim();

    if (!key) {
      const cached = cacheGet('list');
      if (cached) return jsonResponse(cached, 200, request);
      // Public tournaments only. A draft or a private club event
      // stays off this list until an admin publishes it.
      const snap = await db.collection('tournaments')
        .where('isPublic', '==', true)
        .limit(40)
        .get();
      const tournaments = snap.docs
        .map((d) => publicTournament(d.id, d.data()))
        .filter((t) => t.status !== 'draft' && t.status !== 'cancelled')
        .sort((a, b) => {
          // Live first, then upcoming, then finished.
          const rank = (s) => (s === 'running' || s === 'elims' || s === 'break') ? 0
            : (s === 'registration' ? 1 : 2);
          return rank(a.status) - rank(b.status) || String(a.name).localeCompare(String(b.name));
        });
      const payload = { ok: true, tournaments };
      cacheSet('list', payload);
      return jsonResponse(payload, 200, request);
    }

    const cached = cacheGet('t:' + key);
    if (cached) return jsonResponse(await withMine(db, cached, request), 200, request);

    const t = await readTournament(db, key);
    if (!t) return errorResponse('No such tournament', 404, request);

    const ref = db.collection('tournaments').doc(t.id);
    const [entrySnap, roundSnap] = await Promise.all([
      ref.collection('entries').get(),
      ref.collection('rounds').get(),
    ]);
    const entries = entrySnap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
    // standings() runs entries through the pairing module's own
    // normaliser, which keeps only what pairing needs. Join the label
    // back on here rather than widening a pure module the draw depends
    // on.
    const affById = new Map(entries.map((e) => [e.entryId, cleanText(e.affiliation, 60)]));
    const rounds = roundSnap.docs
      .map((d) => publicRound(d.id, d.data()))
      .sort((a, b) => (a.kind === b.kind ? a.roundNo - b.roundNo : (a.kind === 'prelim' ? -1 : 1)));

    const tournament = publicTournament(t.id, t.data);
    const eventRatings = tournamentRatings(entries, roundSnap.docs.map((doc) => ({
      key: doc.id,
      ...(doc.data() || {}),
    })));
    const table = standings(entries).map((e) => {
      const eventRating = eventRatings.get(String(e.entryId)) || { rating: 1500, games: 0 };
      return {
        entryId: e.entryId,
        name: e.name || 'Team',
        affiliation: affById.get(e.entryId) || '',
        wins: e.wins,
        losses: Number(e.losses || 0),
        speaks: e.speaks,
        rating: Math.round(eventRating.rating),
        ratingGames: eventRating.games,
      };
    });
    if (tournament.ratingCompetition) {
      table.sort((a, b) => b.rating - a.rating
        || b.wins - a.wins
        || b.speaks - a.speaks
        || a.name.localeCompare(b.name));
    }
    table.forEach((row, i) => { row.rank = i + 1; });

    const payload = {
      ok: true,
      tournament,
      entries: entries.map(publicEntry),
      // The tab. Computed from the same function the pairing engine
      // uses, so what a team sees is exactly what the next draw will
      // be built from.
      standings: table,
      rounds,
    };
    cacheSet('t:' + key, payload);
    // withMine runs AFTER cacheSet on purpose. `me` is per-caller, and
    // this cache is shared across every visitor for this tournament, so
    // folding it into the cached object would serve one entrant's
    // payment status to everyone who loads the page next.
    return jsonResponse(await withMine(db, payload, request), 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // ── Participant actions ─────────────────────────────────────────
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to register.', 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const myUid = decoded.sub;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || '').trim();
  const t = await readTournament(db, String(body?.tid || '').trim());
  if (!t) return errorResponse('No such tournament', 404, request);
  const ref = db.collection('tournaments').doc(t.id);
  const entries = ref.collection('entries');

  // One entry per person, whichever team they are on. Checked on
  // every registration because the alternative is a debater appearing
  // twice in the same draw, which invalidates the round they are not
  // physically in.
  async function existingEntryFor(uid) {
    const snap = await entries.where('members', 'array-contains', uid).limit(1).get();
    return snap.empty ? null : snap.docs[0];
  }

  // ── register ────────────────────────────────────────────────────
  //
  // Registration remains open through prelims unless the tournament carries
  // an explicit registrationClosed stamp. A late entrant joins a later draw;
  // no registration action changes a draw that has already been released.
  if (action === 'register') {
    // Named accounts only, found by the 2026-08-22 dry run: this action
    // accepted an anonymous token and even granted it prizeEligible on a
    // client-sent flag, while tournament-dropin refused the same token
    // one door later. Anonymous uids are free and unlimited to mint (the
    // 2026-07-28 lesson), so an ungated register is an unbounded way to
    // stuff entryCount, which the hero renders as "N debaters have
    // signed up", and the cash-eligibility list. The client never sends
    // this (withUser gates on a real sign-in), which is exactly why the
    // hole was invisible: enforcement has to live here, not there.
    if (decoded.firebase?.sign_in_provider === 'anonymous') {
      return errorResponse('Create an account to enter a tournament.', 403, request);
    }
    if (body?.recordingAccepted !== true || body?.adultOrGuardianApproved !== true) {
      return errorResponse('Tournament rounds are recorded. Confirm the recording terms to register.', 400, request);
    }
    // Existing entrants can still update a placeholder name through this
    // idempotent action. The closed door applies to creating a new entry,
    // not to maintaining one already on the roster.
    const already = await existingEntryFor(myUid);
    if (!already && !tournamentRegistrationOpen(t.data)) {
      return errorResponse('Registration is not open for this tournament.', 409, request);
    }

    // The age selector is retired. Everyone competes in one field, and
    // cached clients that still submit an age or bracket value are ignored.

    async function applyEntryUpdate(snap) {
      const already = snap.data?.() || {};
      const patch = {};

      // A placeholder yields to a real name. Register is idempotent and
      // people may press it again, so this
      // is the recovery path for an entry that landed as 'Entry' before
      // its owner had a display name. It only ever replaces a
      // placeholder, never a name somebody chose.
      const incoming = cleanText(body?.name, 48);
      if (incoming && isPlaceholderName(already.name)) {
        patch.name = incoming;
        patch.memberNames = [incoming, ...(Array.isArray(already.memberNames) ? already.memberNames.slice(1) : [])];
      }

      if (body?.recordingAccepted === true) {
        patch.recordingAcceptances = {
          ...(already.recordingAcceptances || {}),
          [myUid]: {
            accepted: true,
            adultOrGuardianApproved: true,
            version: 'tournament-recording-v1-2026-08-28',
            acceptedAtMs: Date.now(),
          },
        };
      }

      if (Object.keys(patch).length) await snap.ref.update(patch);
      return {};
    }

    if (already) {
      const applied = await applyEntryUpdate(already);
      const latest = { ...(already.data() || {}) };
      const incoming = cleanText(body?.name, 48);
      const latestNames = Array.isArray(latest.memberNames) ? latest.memberNames.slice() : [];
      if (incoming && isPlaceholderName(latest.name)) latestNames[0] = incoming;
      await addMembersToTournamentChat(db, t, latest.members, latestNames)
        .catch((err) => console.error('[tournament-chat] could not refresh entrant', err.message));
      cache.clear();
      return jsonResponse({ ok: true, already: true, entryId: already.id, ...applied }, 200, request);
    }

    const teamSize = Number(t.data.teamSize) || 1;
    let members = [myUid];
    // The body is not the only place a name exists, and until 2026-08-25
    // it was treated as though it were: a register call without one
    // wrote the entry as literally 'Entry' with a member called
    // 'Debater', and that is what the public tab, the standings, the
    // pairing card and the live room then showed. One real entrant in
    // the Open is in that state. A password account that never set a
    // display name can still resolve to nothing on the client.
    //
    // Every caller here arrived with a VERIFIED ID token, so the name
    // is read from that before any placeholder. The placeholder is the
    // same string daPublicName() falls back to on the page, so the two
    // surfaces cannot print different names for one person. The email
    // is deliberately NOT used: the tab is public, and a local-part is
    // half of someone's address.
    const fallbackName = cleanText(decoded.name, 48)
      || ('Debater ' + String(myUid).slice(-4).toUpperCase());
    const sentName = cleanText(body?.name, 48);
    let memberNames = [sentName || fallbackName];
    let entryName = sentName || fallbackName;

    if (teamSize === 2) {
      // A 2v2 tournament registers a formed duo, not a lone debater.
      // The duo already exists as a `duo_teams` doc, which is also
      // where the partnership was agreed, so there is no second
      // consent step to invent here.
      const teamId = String(body?.teamId || '').trim();
      if (!teamId) return errorResponse('This tournament is 2v2. Form a partnership first, then register it.', 400, request);
      const team = await db.collection('duo_teams').doc(teamId).get();
      if (!team.exists) return errorResponse('That team does not exist.', 404, request);
      const td = team.data();
      const tm = Array.isArray(td.members) ? td.members : [];
      if (!tm.includes(myUid)) return errorResponse('You are not on that team.', 403, request);
      if (tm.length < 2) return errorResponse('Your team still needs a second debater.', 400, request);
      if (td.status === 'disbanded') return errorResponse('That team has disbanded.', 409, request);

      // Neither partner may already be entered, under any team.
      for (const uid of tm) {
        const clash = await existingEntryFor(uid);
        if (clash) return errorResponse('One of you is already registered in this tournament.', 409, request);
      }
      members = tm;
      memberNames = tm.map((uid) => td.memberInfo?.[uid]?.name || 'Debater');
      entryName = cleanText(td.name, 48) || memberNames.join(' & ');
    }

    const entryRef = entries.doc();
    await entryRef.set({
      name: entryName,
      members,
      memberNames,
      teamId: teamSize === 2 ? String(body?.teamId || '') : '',
      affiliation: cleanText(body?.affiliation, 60),
      status: 'registered',
      // `paidEntry` means money moved, and the signed Stripe webhook is
      // still the only code that can flip it true. It is now only ever
      // true of a tip, which buys nothing, so nothing downstream may
      // read it as a competitive fact.
      paidEntry: false,
      entryKind: 'free',
      wins: 0,
      losses: 0,
      speaks: 0,
      byes: 0,
      sideCount: { gov: 0, opp: 0 },
      opponents: [],
      recordingAcceptances: {
        [myUid]: {
          accepted: true,
          adultOrGuardianApproved: true,
          version: 'tournament-recording-v1-2026-08-28',
          acceptedAtMs: Date.now(),
        },
      },
      registeredAt: FieldValue.serverTimestamp(),
    });
    await ref.update({ entryCount: FieldValue.increment(1) }).catch(() => {});
    await addMembersToTournamentChat(db, t, members, memberNames)
      .catch((err) => console.error('[tournament-chat] could not add entrant', err.message));
    cache.clear();
    return jsonResponse({
      ok: true,
      entryId: entryRef.id,
    }, 200, request);
  }

  // ── check-in ────────────────────────────────────────────────────
  // Registering weeks early and actually turning up are different
  // claims, and only the second one should be pairable. A director
  // who pairs on registrations debates a lot of empty rooms.
  if (action === 'check-in') {
    const mine = await existingEntryFor(myUid);
    if (!mine) return errorResponse('You are not registered for this tournament.', 404, request);
    if (body?.recordingAccepted !== true || body?.adultOrGuardianApproved !== true) {
      return errorResponse('Tournament rounds are recorded. Confirm the recording terms to check in.', 400, request);
    }
    const mineData = mine.data() || {};
    await mine.ref.update({
      status: 'checked_in',
      checkedInAt: FieldValue.serverTimestamp(),
      recordingAcceptances: {
        ...(mineData.recordingAcceptances || {}),
        [myUid]: {
          accepted: true,
          adultOrGuardianApproved: true,
          version: 'tournament-recording-v1-2026-08-28',
          acceptedAtMs: Date.now(),
        },
      },
    });
    cache.clear();
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── affiliation ─────────────────────────────────────────────────
  // Editable after the fact, deliberately. Someone registers on their
  // own and their coach asks to be represented a week later, which is
  // exactly the conversation the outreach is trying to start, so this
  // cannot be a set-once field buried in the registration form.
  if (action === 'affiliation') {
    const mine = await existingEntryFor(myUid);
    if (!mine) return errorResponse('You are not registered for this tournament.', 404, request);
    await mine.ref.update({ affiliation: cleanText(body?.affiliation, 60) });
    cache.clear();
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── withdraw ────────────────────────────────────────────────────
  if (action === 'withdraw') {
    const mine = await existingEntryFor(myUid);
    if (!mine) return jsonResponse({ ok: true, already: true }, 200, request);
    await mine.ref.update({ status: 'withdrawn', withdrawnAt: FieldValue.serverTimestamp() });
    await ref.update({ entryCount: FieldValue.increment(-1) }).catch(() => {});
    cache.clear();
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/tournament' };
