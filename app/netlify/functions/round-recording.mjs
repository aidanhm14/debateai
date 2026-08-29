// Full-round Daily cloud recording.
//
// POST /api/round-recording
//   { action: 'consent', room, consent: true, adultOrGuardianApproved: true }
//   { action: 'consent', room, consent: false }
//   { action: 'publish-consent', room, consent: true|false }
//   { action: 'finish', room }
//
// Ordinary rooms are off by default and start only after every seated
// participant opts in. Tournament rooms are recorded as a condition of
// participation: every seat acknowledges the disclosed recording terms
// before capture starts, and there is no in-room opt-out that would let a
// competitive round proceed off the record.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const CONSENT_VERSION = 'round-recording-v3-2026-08-28';
const CONSENT_SCOPE = 'Store this round\'s video, audio, display names, and motion; publish the full replay on Watch so signed-in users can make and share clips.';
const TOURNAMENT_SCOPE = 'Tournament participation requires this round\'s video, audio, display names, motion, and ballot reveal to be recorded and stored by Debatable. Preliminary capture is not public by default; elimination-round broadcast follows the published tournament rules.';

function safeRoomName(value){
  return String(value || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

function participantUids(round){
  return [...new Set([
    round.proUid,
    round.proUid2,
    round.conUid,
    round.conUid2,
  ].filter(uid => typeof uid === 'string' && uid.length > 0))];
}

function publicState(round, participants){
  const consents = round.recordingConsents || {};
  const publishConsents = round.recordingPublishConsents || {};
  return {
    status: round.recordingStatus || 'idle',
    participants,
    consented: participants.filter(uid => consents[uid] === true).length,
    required: participants.length,
    publishAllowed: round.recordingPublishAllowed === true,
    publishConsented: participants.filter(uid => publishConsents[uid] === true).length,
    recordingRequired: round.recordingMode === 'tournament_required',
  };
}

// The motion, trimmed to something that fits one line across a 1280x720
// frame. Control characters out (this is rendered by VCS, not by us, and
// a stray newline is a layout nobody can see until the replay exists),
// and a hard cap, because a long motion set at overlay size wraps into
// the faces it is meant to caption.
function overlayMotion(value){
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 92 ? text.slice(0, 89).trimEnd() + '...' : text;
}

async function dailyRecording(room, action, motion){
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey || process.env.DAILY_RECORD === '0'){
    return { ok: false, status: 503, detail: 'Recording is not configured.' };
  }
  const path = DAILY_API + '/rooms/' + encodeURIComponent(room) + '/recordings/' + action;
  // `layout.max_cam_streams` USED TO RIDE HERE AND DAILY DOES NOT ACCEPT
  // IT: every start returned 400 `"layout.max_cam_streams" is not allowed`,
  // before Daily even looked at the room. Same class of bug as the
  // `allow_streaming_from_bucket` room property fixed alongside it, so the
  // same rule applies: verify a property against the live API before
  // adding it, because one bad key kills the whole feature and the error
  // it produces points at the room rather than at the request.
  //
  // The layout is composed HERE, by Daily, and not by a debater's
  // browser. From 2026-08-18 to 2026-08-24 a client published the round
  // board as a canvas SCREEN SHARE and this layout recorded whatever
  // share was up. It worked and it cost too much: the room announced
  // "X is screen sharing" for the whole round, the board took the main
  // stage as a share tile, and since Daily gives a participant one
  // screen track, the real Share screen button was disabled for the
  // length of every recorded round. A recording layout is a property of
  // the recording, so it belongs in the recording request.
  //
  // `mode: 'grid'` is right for both shapes this room takes: with two
  // debaters Daily's grid IS side by side, and a 2v2 fills four cells.
  // Spectators hold hidden-presence tokens (2026-08-18) so they never
  // occupy one. `showParticipantLabels` puts the names on the tiles the
  // board used to draw by hand, and the text overlay carries the motion,
  // which is the one piece of context a replay cannot recover from the
  // video. `preferScreenshare` stays on so a debater sharing real
  // evidence, and the verdict reel at the end, still reach the file.
  //
  // VERIFIED against the live API on a throwaway room 2026-08-24: this
  // body passes param validation and fails only on "not hosting a
  // call", while a max_cam_streams control still 400s as "not allowed".
  // BUT KNOW THE LIMIT OF THAT PROOF, because it is narrower than it
  // looks: Daily validates the top-level `layout` keys and passes
  // `composition_params` STRAIGHT THROUGH to VCS. A bogus key and a
  // bogus `mode` value both returned the same "not hosting a call" as
  // the real body. So a typo in here does not 400, it silently records
  // the wrong composition, and the only way to know is to watch a real
  // recording. Change these keys with that in mind. If Daily rejects it at
  // start time anyway (plan without VCS), retry once on the default
  // preset so a layout problem can never cost the recording itself.
  // videoBitrate caps the file so a replay can actually stream. Measured
  // 2026-08-22 on a real recording: with no cap, Daily encoded an 11:54
  // round at 277MB, which is 3.1 Mbps sustained. A viewer needs at least
  // that much bandwidth for the whole length of the round or the player
  // never leaves the spinner, and it does not fail, it just buffers
  // forever with no error to report. At 1200 kbps the same round lands
  // near 110MB, about 1.3 Mbps with audio, which streams with headroom
  // on an ordinary connection. The content is a near-static board with
  // two webcam tiles, so this is not a quality trade anyone will see:
  // measured SSIM against the uncapped original is 0.994 on a quiet
  // round and 0.985 with both cameras live, and 1500 kbps scored 0.985
  // on that same busy round, so 1200 is already on the flat part of the
  // curve. Recordings made BEFORE this cap are fixed separately with
  // scripts/rehost-replay.mjs, which also repairs their seeking.
  // Validated against the live Daily API on a throwaway room: this body
  // passes param validation and fails only on "not hosting a call",
  // while a max_cam_streams control still 400s as "not allowed".
  const startBody = (layout) => ({
    type: 'cloud',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrate: 1200,
    minIdleTimeOut: 120,
    maxDuration: 10800,
    layout,
  });
  const params = {
    mode: 'grid',
    'videoSettings.showParticipantLabels': true,
    'videoSettings.preferScreenshare': true,
  };
  const motionText = overlayMotion(motion);
  if (motionText){
    params.showTextOverlay = true;
    params['text.content'] = motionText;
    params['text.align_horizontal'] = 'center';
    params['text.align_vertical'] = 'top';
  }
  const boardLayout = { preset: 'custom', composition_params: params };
  const send = async (body) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    return { response, data };
  };
  try {
    let { response, data } = await send(action === 'start' ? startBody(boardLayout) : { type: 'cloud' });
    if (action === 'start' && response.status === 400){
      console.warn('[round-recording] custom layout rejected, retrying with default preset:', String(data?.info || data?.error || '').slice(0, 240));
      ({ response, data } = await send(startBody({ preset: 'default' })));
    }
    // A duplicate stop returns 400. Treat it as complete so two clients
    // finishing together cannot turn a successful stop into a UI error.
    if (action === 'stop' && response.status === 400){
      return { ok: true, status: response.status, data };
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      detail: response.ok ? '' : String(data?.info || data?.error || 'Daily recording request failed').slice(0, 240),
    };
  } catch (error) {
    return { ok: false, status: 502, detail: String(error?.message || error).slice(0, 240) };
  }
}

// Exported for the reaper: an abandoned room's capture has to be stopped
// by something other than the tab that walked away.
export async function stopIfStarted(room){
  const stopped = await dailyRecording(room, 'stop');
  if (!stopped.ok) console.warn('[round-recording] cleanup stop failed:', stopped.status, stopped.detail);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('POST only', 405, req);

  const bearer = extractBearerToken(req);
  if (!bearer) return errorResponse('Sign in to choose recording', 401, req);
  let decoded;
  try { decoded = await verifyIdToken(bearer); }
  catch { return errorResponse('Sign in again to choose recording', 401, req); }

  let body;
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON', 400, req); }

  const action = String(body.action || 'consent');
  const room = safeRoomName(body.room);
  if (!room || room !== String(body.room || '')) return errorResponse('Invalid room', 400, req);
  if (!['consent', 'publish-consent', 'finish'].includes(action)) return errorResponse('Unknown action', 400, req);
  if (action === 'consent' && typeof body.consent !== 'boolean') return errorResponse('consent must be true or false', 400, req);
  if (action === 'publish-consent' && typeof body.consent !== 'boolean') return errorResponse('consent must be true or false', 400, req);
  if (action === 'consent' && body.consent && body.adultOrGuardianApproved !== true){
    return errorResponse('Adult or guardian approval is required to record', 400, req);
  }

  const db = getDb();
  const ref = db.collection('live_rounds').doc(room);
  let admission = null;
  try {
    const admissionSnap = await db.collection('room_admissions').doc(room).get();
    admission = admissionSnap.exists ? (admissionSnap.data() || {}) : null;
  } catch { /* A missing casual-room admission keeps the optional path. */ }
  const tournamentRequired = !!(admission
    && admission.kind === 'tournament'
    && admission.room === room);
  if (tournamentRequired && action === 'consent' && body.consent !== true) {
    return errorResponse('Tournament rounds are recorded. Leave the room or withdraw from the tournament if you cannot be recorded.', 409, req);
  }

  let result;
  try {
    result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: 'Round not found', status: 404 };
      const round = snap.data() || {};
      const participants = participantUids(round);
      if (participants.length < 2) return { error: 'Recording needs at least two identified debaters', status: 409 };
      if (!participants.includes(decoded.sub)) return { error: 'Only seated debaters can choose recording', status: 403 };
      if (tournamentRequired) {
        const admitted = Array.isArray(admission?.uids) ? admission.uids.map(String) : [];
        if (!admitted.includes(decoded.sub) || !participants.every(uid => admitted.includes(uid))) {
          return { error: 'Tournament recording could not verify the assigned seats', status: 403 };
        }
      }

      // Tournament capture and public replay are separate permissions. A
      // participant may grant or withdraw Watch publication even after the
      // ballot, and the replay becomes public only when every recorded seat
      // has independently agreed. Elimination broadcast permission remains
      // the event-level exception already stamped on the admission.
      if (action === 'publish-consent') {
        if (!tournamentRequired) return { error: 'Use the recording choice for an ordinary round.', status: 409 };
        const now = Date.now();
        const publishConsents = { ...(round.recordingPublishConsents || {}) };
        publishConsents[decoded.sub] = body.consent;
        const allPublishAgreed = participants.every(uid => publishConsents[uid] === true);
        const publishAllowed = admission?.broadcastAllowed === true || allPublishAgreed;
        tx.set(ref, {
          recordingPublishConsents: publishConsents,
          recordingPublishAllowed: publishAllowed,
          recordingPublishUpdatedAt: FieldValue.serverTimestamp(),
          recordingPublishUpdatedAtMs: now,
        }, { merge: true });
        tx.set(db.collection('recording_consents').doc(room + '_' + decoded.sub + '_publish_' + now), {
          room,
          uid: decoded.sub,
          consent: body.consent,
          decidedAtMs: now,
          decidedAt: FieldValue.serverTimestamp(),
          version: CONSENT_VERSION,
          scope: 'Publish this full tournament replay on Watch so signed-in people can play it and make shareable clips.',
          kind: 'public_replay',
          requiredByTournament: false,
        });
        return {
          effect: 'none',
          participants,
          round: {
            ...round,
            recordingPublishConsents: publishConsents,
            recordingPublishAllowed: publishAllowed,
          },
        };
      }

      const now = Date.now();
      const consents = { ...(round.recordingConsents || {}) };
      const publishConsents = { ...(round.recordingPublishConsents || {}) };
      let effect = 'none';
      const update = {
        recordingConsentVersion: CONSENT_VERSION,
        recordingParticipants: participants,
        recordingMode: tournamentRequired ? 'tournament_required' : 'optional',
        recordingUpdatedAt: FieldValue.serverTimestamp(),
        recordingUpdatedAtMs: now,
      };

      if (action === 'finish'){
        if (['starting', 'recording', 'stopping', 'stop_failed'].includes(round.recordingStatus)) effect = 'stop';
        update.recordingStatus = effect === 'stop' ? 'processing' : (round.recordingStatus || 'idle');
        update.recordingClosed = true;
        update.recordingStopReason = 'round_complete';
        update.recordingStoppedAtMs = now;
        // Consent-first recording means this is normally true whenever a
        // recorder exists. Keep the deletion guard for a legacy capture or
        // a withdrawal that raced the finish request.
        if (!tournamentRequired && round.recordingPublishAllowed !== true && effect === 'stop'){
          update.recordingDeleteRequested = true;
        }
      } else {
        consents[decoded.sub] = body.consent;
        if (tournamentRequired && typeof body.publishConsent === 'boolean') {
          publishConsents[decoded.sub] = body.publishConsent;
          update.recordingPublishConsents = publishConsents;
        }
        const receipt = {
          room,
          uid: decoded.sub,
          consent: body.consent,
          decidedAtMs: now,
          decidedAt: FieldValue.serverTimestamp(),
          version: CONSENT_VERSION,
          scope: tournamentRequired ? TOURNAMENT_SCOPE : CONSENT_SCOPE,
          requiredByTournament: tournamentRequired,
          adultOrGuardianApproved: body.consent ? true : false,
          publishOnWatchApproved: tournamentRequired ? publishConsents[decoded.sub] === true : body.consent,
        };
        update.recordingConsents = consents;
        // The round doc is publicly readable for spectators, so the full
        // legal receipt belongs in a server-only collection. The public
        // round state carries only the booleans needed to paint the UI.
        tx.set(db.collection('recording_consents').doc(room + '_' + decoded.sub + '_' + now), receipt);

        const allAgreed = participants.every(uid => consents[uid] === true);
        const tournamentPublishAllowed = tournamentRequired && (
          admission?.broadcastAllowed === true
          || participants.every(uid => publishConsents[uid] === true)
        );
        if (!body.consent){
          update.recordingPublishAllowed = false;
          update.recordingStatus = ['starting', 'recording'].includes(round.recordingStatus) ? 'stopping' : 'declined';
          if (['starting', 'recording'].includes(round.recordingStatus)){
            effect = 'stop';
            update.recordingClosed = true;
            update.recordingStopReason = 'consent_withdrawn';
            update.recordingStoppedBy = decoded.sub;
            update.recordingStoppedAtMs = now;
            // Capture may have been running before this person was asked,
            // so withholding publication is not enough: the file itself
            // goes. The sync job destroys it at Daily the next time it
            // sees it, because that is the only place the recording id is
            // known. Unpublished-but-stored is not what "no" means.
            update.recordingDeleteRequested = true;
          }
        } else if (allAgreed && !round.recordingClosed && ['starting', 'recording'].includes(round.recordingStatus)){
          // A legacy client may have left the round in a starting state.
          // Even there, publication remains locked until every current
          // participant has independently agreed.
          update.recordingPublishAllowed = tournamentRequired ? tournamentPublishAllowed : true;
          update.recordingConsentCompleteAtMs = now;
        } else if (allAgreed && !round.recordingClosed && !['starting', 'recording', 'processing'].includes(round.recordingStatus)){
          if (round.status === 'ballot' || round.ballot){
            update.recordingStatus = 'closed';
            update.recordingClosed = true;
          } else {
            effect = 'start';
            update.recordingStatus = 'starting';
            update.recordingPublishAllowed = tournamentRequired ? tournamentPublishAllowed : true;
            update.recordingConsentCompleteAtMs = now;
          }
        } else if (!allAgreed && !['starting', 'recording'].includes(round.recordingStatus)){
          update.recordingStatus = 'awaiting_consent';
          update.recordingPublishAllowed = false;
        }
      }

      tx.set(ref, update, { merge: true });
      return { effect, participants, round: { ...round, ...update } };
    });
  } catch (error) {
    console.error('[round-recording] transaction failed:', error);
    return errorResponse('Could not save recording choice', 503, req);
  }

  if (result.error) return errorResponse(result.error, result.status, req);

  if (result.effect === 'start'){
    const started = await dailyRecording(room, 'start', result.round && result.round.motion);
    if (!started.ok){
      await ref.set({
        recordingStatus: 'failed',
        recordingPublishAllowed: false,
        recordingErrorCode: started.status || 502,
        recordingUpdatedAt: FieldValue.serverTimestamp(),
        recordingUpdatedAtMs: Date.now(),
      }, { merge: true });
      console.warn('[round-recording] start failed for', room, started.status, started.detail);
      // Each failure gets the message that is actually true of it, checked
      // against the live API rather than assumed:
      //   503  we never called Daily (no key, or DAILY_RECORD=0)
      //   404  "room does not seem to be hosting a call currently" — nobody
      //        has connected to the video yet, so this is genuinely worth
      //        retrying once the call is up
      //   400  Daily rejected OUR request body. A code bug, not anything
      //        the debaters did or can fix by pressing again.
      // An earlier version of this branch called 400 "the room was not set
      // up for recording", which pointed at the room while the real fault
      // was an invalid property in the request above. A wrong diagnosis is
      // worse than a vague one: it sends whoever reads it somewhere else.
      const status = started.status;
      let message = 'Everyone agreed, but recording could not start. Try again.';
      let code = 502;
      if (status === 503){
        message = 'Everyone agreed, but recording is not available on this site right now.';
        code = 409;
      } else if (status === 404){
        message = 'Everyone agreed. Recording starts once the video call is connected, so try again in a moment.';
        code = 409;
      } else if (status === 400){
        message = 'Everyone agreed, but recording was refused. This one is on us and it is logged.';
        code = 502;
      }
      return errorResponse(message, code, req);
    }

    // A finish/withdraw can race the Daily start request. Re-check the
    // round before announcing that capture is live; if it closed while
    // Daily was starting, immediately issue a second stop.
    let live = false;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const round = snap.data() || {};
      const permitted = round.recordingPublishAllowed === true;
      const requiredCapture = round.recordingMode === 'tournament_required';
      if (round.recordingStatus === 'starting' && (permitted || requiredCapture) && !round.recordingClosed){
        live = true;
        tx.set(ref, {
          recordingStatus: 'recording',
          recordingStartedAt: FieldValue.serverTimestamp(),
          recordingStartedAtMs: Date.now(),
          recordingErrorCode: FieldValue.delete(),
        }, { merge: true });
      }
    });
    if (!live) await stopIfStarted(room);
  }

  if (result.effect === 'stop'){
    const stopped = await dailyRecording(room, 'stop');
    if (!stopped.ok){
      await ref.set({
        recordingStatus: 'stop_failed',
        recordingPublishAllowed: false,
        recordingErrorCode: stopped.status || 502,
        recordingUpdatedAt: FieldValue.serverTimestamp(),
        recordingUpdatedAtMs: Date.now(),
      }, { merge: true });
      return errorResponse('Could not confirm recording stopped. Try again.', 502, req);
    }
    const keepCapture = result.round.recordingPublishAllowed === true
      || result.round.recordingMode === 'tournament_required';
    const finalStatus = action === 'finish' && keepCapture ? 'processing' : 'stopped';
    await ref.set({
      recordingStatus: finalStatus,
      recordingStoppedAt: FieldValue.serverTimestamp(),
      recordingStoppedAtMs: Date.now(),
      recordingErrorCode: FieldValue.delete(),
    }, { merge: true });
  }

  const fresh = await ref.get();
  return jsonResponse(publicState(fresh.data() || {}, result.participants), 200, req);
};

export const config = { path: '/api/round-recording' };
