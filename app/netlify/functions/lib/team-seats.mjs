import Teams from '../../../js/room-teams.js';
import { publicIdentity } from './public-identity.mjs';

export const REQUEST_MS = 3 * 60 * 1000;
const EXTRA = ['pro2','con2'];
function fail(message, code = 'TEAM_SEAT_UNAVAILABLE', status = 409) {
  throw Object.assign(new Error(message), { code, status });
}
export function assertTeamSeatsMutable(round) {
  if (round.tournamentRound || round.tournamentId || round.recordingRequired) fail('Tournament seats are fixed.');
  if (!round.proUid || !round.conUid || round.proUid === round.conUid || [round.proUid,round.conUid].includes('ai')) fail('Both people need to join the room first.');
  if (Teams.started(round)) fail('Team seats are locked once the round starts.', 'TEAM_SEATS_LOCKED');
  if (round.recordingStatus === 'recording' || round.recordingStatus === 'starting') fail('Finish recording before changing the team seats.');
  if (round.draft && !['resolved','done','complete'].includes(round.draft.phase)) fail('Finish choosing the topic before opening team seats.');
}
const mutable = assertTeamSeatsMutable;
function sameAgeGroup(bands) {
  return !bands.includes('minor') || bands.every(b => b === 'minor');
}
export function projectTeamRoom(round, uid) {
  return { format:round.format, enabled:Teams.enabled(round), hostUid:Teams.host(round), locked:Teams.started(round),
    ending:round.teamEnding || null, finishedAt:round.teamFinishedAt || null,
    full:Teams.full(round), seats:Teams.seats(round), canEnable:Teams.host(round) === uid && !Teams.started(round)
      && !round.tournamentRound && !round.tournamentId && !!round.proUid && !!round.conUid };
}

// Approval, vacancy checks and roster updates share one transaction. A
// stale host tab cannot admit a fifth person or overwrite an occupied seat.
export async function changeTeamSeat(db, room, uid, body, now = Date.now()) {
  const ref = db.collection('live_rounds').doc(room);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('Round not found.', 'ROUND_NOT_FOUND', 404);
    const round = snap.data();
    const host = Teams.host(round), ownKey = Teams.keyForUid(round, uid);
    const action = body.action;
    if (action === 'finish' || action === 'finish-ready') {
      if (!ownKey || !Teams.full(round) || !round.teamLockedAt || round.format !== 'open') fail('Only a seated person can end this team conversation.', 'NOT_SEATED',403);
      if (round.teamFinishedAt) return {ok:true,round};
      if (round.ballot || round.ballotUnresolved || Number(round.speechIdx)>0) fail('This round has already ended.');
      const ending=round.teamEnding || {by:uid,at:now};
      const ready={...(round.teamFinished||{})};
      if (action==='finish-ready') {
        if (!round.teamEnding) fail('End the conversation before finishing its transcript.');
        ready[uid]=now;
      }
      const patch={teamEnding:ending,teamFinished:ready};
      if (Teams.seats(round).every(s=>ready[s.uid]) || now-ending.at>=20000) {
        const rows=Teams.conversationRows(round,'',null);
        const lines=[];
        rows.forEach(r=>{
          const last=lines.at(-1);
          if(last&&last.key===r.key)last.text+=' '+r.text;
          else lines.push({...r});
        });
        const timer=round.currentTimer||{};
        const timerStamp=Teams.millis(timer.updatedAtServer);
        const startAt=Teams.millis(timer.startMs)+(timerStamp&&timer.updatedAtMs?timerStamp-timer.updatedAtMs:0);
        const running=timer.state==='running'?Math.max(0,ending.at-startAt):0;
        const entry={code:'TALK',name:'Team conversation',side:'pro',open:true,
          speakerName:Teams.seats(round).map(s=>s.name).join(', '),
          text:lines.map(r=>r.name+' ('+(r.side==='pro'?'For':'Against')+'): '+r.text).join('\n\n')||'(no transcript)',
          durationSec:Math.round(((Number(timer.accumulatedMs)||0)+running)/1000),targetSec:3600,overSec:0,seq:1};
        Object.assign(patch,{speeches:[entry],speechIdx:1,teamFinishedAt:now,
          ballotPending:true,ballotPendingAt:new Date(now),currentTimer:{...timer,state:'ended'}});
      }
      tx.update(ref,patch);
      return {ok:true,round:{...round,...patch}};
    }
    if (action === 'start') {
      if (!Teams.enabled(round) || !ownKey) fail('Only a seated person can start this team round.', 'NOT_SEATED', 403);
      if (!Teams.full(round)) fail('Wait for all four team seats to fill.');
      const format = body.format || round.format;
      if (!['open','quick'].includes(format)) fail('Choose a conversation or timed speeches.');
      if (round.teamLockedAt) {
        if (format !== round.format) fail('The round has already started in another mode.');
        return { ok:true, round };
      }
      mutable(round);
      const absent = Teams.seats(round).some(s => now - Teams.millis((round.seatSeen || {})[s.uid]) > 90000 || !Teams.millis((round.seatSeen || {})[s.uid]));
      if (absent) fail('All four people need to be in the room before starting.');
      const patch = { teamLockedAt:now, format };
      tx.update(ref, patch);
      return { ok:true, round:{...round,...patch} };
    }
    mutable(round);
    if (action === 'enable') {
      if (uid !== host) fail('Only the host can open team seats.', 'HOST_ONLY', 403);
      if (Teams.enabled(round)) return { ok:true, round };
      const profiles = await Promise.all([round.proUid,round.conUid].map(id=>tx.get(db.collection('user_profiles').doc(id))));
      const patch = { teamSize:2, teamHostUid:uid, teamSeatsOpenedAt:now,
        proName:publicIdentity(round.proUid,profiles[0].exists?profiles[0].data():{}).name,
        conName:publicIdentity(round.conUid,profiles[1].exists?profiles[1].data():{}).name };
      tx.update(ref, patch);
      return { ok:true, round:{...round,...patch} };
    }
    if (!Teams.enabled(round)) fail('The host has not opened team seats.');
    if (action === 'disable') {
      if (uid !== host) fail('Only the host can close team seats.', 'HOST_ONLY', 403);
      if (round.proUid2 || round.conUid2) fail('Teammates must leave their seats before returning to 1v1.');
      const patch = { teamSize:1 };
      tx.update(ref, patch);
      return { ok:true, round:{...round,...patch} };
    }
    if (action === 'leave') {
      if (!EXTRA.includes(ownKey)) fail('Only an added teammate can leave a team seat.', 'NOT_TEAMMATE', 403);
      const patch = { [Teams.uidField(ownKey)]:'', [Teams.nameField(ownKey)]:'' };
      tx.update(ref, patch);
      tx.set(ref.collection('teamSeatRequests').doc(uid), {status:'withdrawn'}, {merge:true});
      return { ok:true, round:{...round,...patch} };
    }
    const target = ['approve','decline'].includes(action) ? String(body.uid || '') : uid;
    if (!target || target.includes('/') || target.length > 128) fail('Invalid seat request.', 'BAD_REQUEST', 400);
    const req = ref.collection('teamSeatRequests').doc(target);
    const requestSnap = await tx.get(req);
    const request = requestSnap.exists ? requestSnap.data() : {};
    if (action === 'withdraw') {
      tx.set(req, {status:'withdrawn'}, {merge:true});
      return {ok:true, round};
    }
    if (action === 'decline') {
      if (uid !== host) fail('Only the host can approve or decline team seats.', 'HOST_ONLY', 403);
      tx.set(req, {status:'rejected',resolvedAt:now}, {merge:true});
      return {ok:true, round};
    }
    if (!['request','approve'].includes(action)) fail('Unknown team-seat action.', 'BAD_REQUEST', 400);
    if (action === 'approve' && uid !== host) fail('Only the host can approve team seats.', 'HOST_ONLY', 403);
    if (action === 'approve' && (request.status !== 'pending' || now-request.requestedAt > REQUEST_MS)) fail('That request expired. Ask the viewer to request the seat again.');
    const key = action === 'approve' ? request.key : body.key;
    if (!EXTRA.includes(key)) fail('Choose an open team seat.', 'BAD_REQUEST', 400);
    if (Teams.keyForUid(round, target)) fail('This person already has a seat.');
    if (round[Teams.uidField(key)]) fail('That team seat has already been filled.');
    const uids = [...Teams.seats(round).map(s=>s.uid).filter(Boolean), target];
    const [profile, ...bands] = await Promise.all([
      tx.get(db.collection('user_profiles').doc(target)),
      ...uids.map(id=>tx.get(db.collection('age_bands').doc(id))),
    ]);
    const ageBands = bands.map(s=>s.exists?s.data().band:'');
    if (!['adult','minor'].includes(ageBands.at(-1))) fail('Confirm your age group before requesting a team seat.', 'AGE_BAND_REQUIRED');
    if (!sameAgeGroup(ageBands)) fail('Team seats are limited to people in the same age group.', 'AGE_BAND_MISMATCH');
    const name = publicIdentity(target, profile.exists ? profile.data() : {}).name;
    if (action === 'request') {
      tx.set(req, {uid:target,key,name,status:'pending',requestedAt:now});
      return {ok:true, round};
    }
    const patch = { [Teams.uidField(key)]:target, [Teams.nameField(key)]:name };
    tx.update(ref, patch);
    tx.update(req, {status:'accepted',resolvedAt:now});
    return {ok:true, round:{...round,...patch} };
  });
}
