// All-party consent gate for full-round Daily cloud recording.
//
// POST /api/round-recording
//   { action: 'consent', room, consent: true, adultOrGuardianApproved: true }
//   { action: 'consent', room, consent: false }
//   { action: 'finish', room }
//
// Recording is off by default. The server starts it only after every
// seated participant has independently opted in for this round. Consent
// is stamped onto live_rounds/{room} before Daily is called, and any
// participant can withdraw to stop future capture immediately.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const CONSENT_VERSION = 'round-recording-v1-2026-08-10';
const CONSENT_SCOPE = 'Store this round\'s video, audio, display names, and motion; publish the full replay on Watch so signed-in users can make and share clips.';

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
  return {
    status: round.recordingStatus || 'idle',
    participants,
    consented: participants.filter(uid => consents[uid] === true).length,
    required: participants.length,
    publishAllowed: round.recordingPublishAllowed === true,
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
  if (!['consent', 'finish', 'autostart'].includes(action)) return errorResponse('Unknown action', 400, req);
  if (action === 'consent' && typeof body.consent !== 'boolean') return errorResponse('consent must be true or false', 400, req);
  if (action === 'consent' && body.consent && body.adultOrGuardianApproved !== true){
    return errorResponse('Adult or guardian approval is required to record', 400, req);
  }

  const db = getDb();
  const ref = db.collection('live_rounds').doc(room);
  let result;
  try {
    result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: 'Round not found', status: 404 };
      const round = snap.data() || {};
      const participants = participantUids(round);
      if (participants.length < 2) return { error: 'Recording needs at least two identified debaters', status: 409 };
      if (!participants.includes(decoded.sub)) return { error: 'Only seated debaters can choose recording', status: 403 };

      const now = Date.now();
      const consents = { ...(round.recordingConsents || {}) };
      let effect = 'none';
      const update = {
        recordingConsentVersion: CONSENT_VERSION,
        recordingParticipants: participants,
        recordingUpdatedAt: FieldValue.serverTimestamp(),
        recordingUpdatedAtMs: now,
      };

      // ── autostart ─────────────────────────────────────────────
      // Capture begins when two debaters are seated, before anyone has
      // agreed to anything, because a replay that was never captured
      // cannot be published later no matter who consents. PUBLICATION is
      // untouched by this: recordingPublishAllowed stays false until
      // every seated debater says yes, which is the gate
      // recordings-admin reads before anything reaches Watch.
      //
      // A `false` already on the consent map blocks this outright. That
      // is the whole point of the rule that a no is asked again next
      // round rather than assumed: within THIS round a no is final, and
      // auto-start must never be the thing that overrides it.
      if (action === 'autostart'){
        const declined = participants.some(uid => consents[uid] === false);
        const busy = ['starting', 'recording', 'stopping', 'processing', 'stop_failed'].includes(round.recordingStatus);
        const late = round.status === 'ballot' || !!round.ballot;
        if (declined || busy || late || round.recordingClosed){
          update.recordingStatus = round.recordingStatus || 'idle';
        } else {
          effect = 'start';
          update.recordingStatus = 'starting';
          update.recordingAutoStarted = true;
          // Explicitly false, not absent. Every publish gate reads this
          // field, and an auto-started capture has earned no permission.
          update.recordingPublishAllowed = false;
        }
      } else if (action === 'finish'){
        if (['starting', 'recording', 'stopping', 'stop_failed'].includes(round.recordingStatus)) effect = 'stop';
        update.recordingStatus = effect === 'stop' ? 'processing' : (round.recordingStatus || 'idle');
        update.recordingClosed = true;
        update.recordingStopReason = 'round_complete';
        update.recordingStoppedAtMs = now;
        // The round ended and the yeses never came in. Silence is not a
        // no, but it is not a yes either, and an auto-started capture of
        // someone who never agreed does not get to sit in storage on the
        // strength of never having been published. It goes with the same
        // deletion the explicit no triggers.
        if (round.recordingPublishAllowed !== true && (round.recordingAutoStarted === true || effect === 'stop')){
          update.recordingDeleteRequested = true;
        }
      } else {
        consents[decoded.sub] = body.consent;
        const receipt = {
          room,
          uid: decoded.sub,
          consent: body.consent,
          decidedAtMs: now,
          decidedAt: FieldValue.serverTimestamp(),
          version: CONSENT_VERSION,
          scope: CONSENT_SCOPE,
          adultOrGuardianApproved: body.consent ? true : false,
        };
        update.recordingConsents = consents;
        // The round doc is publicly readable for spectators, so the full
        // legal receipt belongs in a server-only collection. The public
        // round state carries only the booleans needed to paint the UI.
        tx.set(db.collection('recording_consents').doc(room + '_' + decoded.sub + '_' + now), receipt);

        const allAgreed = participants.every(uid => consents[uid] === true);
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
          // Capture is already rolling from the auto-start. The last yes
          // does not start anything, it unlocks publication of what is
          // being captured.
          update.recordingPublishAllowed = true;
          update.recordingConsentCompleteAtMs = now;
        } else if (allAgreed && !round.recordingClosed && !['starting', 'recording', 'processing'].includes(round.recordingStatus)){
          if (round.status === 'ballot' || round.ballot){
            update.recordingStatus = 'closed';
            update.recordingClosed = true;
          } else {
            effect = 'start';
            update.recordingStatus = 'starting';
            update.recordingPublishAllowed = true;
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
      const permitted = round.recordingPublishAllowed === true || round.recordingAutoStarted === true;
      if (round.recordingStatus === 'starting' && permitted && !round.recordingClosed){
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
    const finalStatus = action === 'finish' && result.round.recordingPublishAllowed === true ? 'processing' : 'stopped';
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
