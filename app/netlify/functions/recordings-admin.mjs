// Recording pipeline, admin side (WS2 Phase 6). Daily cloud recordings
// land in Daily's storage; this endpoint pulls their index into the
// Firestore `recordings` collection, enriches each entry with round
// metadata from live_rounds/{roomName}, and manages publish state.
//
//   GET  /api/admin/recordings            → full list, newest first
//   POST /api/admin/recordings { action: 'sync' }
//        → pull Daily's recording list, upsert Firestore docs. Nothing
//          arrives public. A debate round becomes publish-eligible only
//          when the round doc proves every seated participant accepted
//          the current recording-consent scope; a stream waits for an
//          admin to press publish.
//   POST /api/admin/recordings { action: 'publish', id, published }
//        → toggle a recording's public visibility.
//   POST /api/admin/recordings { action: 'meta', id, title }
//        → set a display title (overrides the derived one).
//   POST /api/admin/recordings { action: 'thumb', id, image, t }
//        → set the card image to a frame the owner chose. `image` is a
//          data:image/jpeg the browser cut off the playing video; empty
//          clears it and hands the recording back to the auto-cut.
//   POST /api/admin/recordings { action: 'delete', id }
//        → destroy it: the mp4 in Daily's storage, every clip cut from
//          it, and the Firestore doc. A tombstone in `recordings_deleted`
//          keeps the next sync from pulling it straight back, which is
//          the failure mode a plain doc delete has (Daily is the source
//          of truth for the list, so an undeleted mp4 reappears).
//
// Doc shape (recordings/{dailyId}):
//   { roomName, startTs, duration, status, published, title,
//     motion, format, proName, conName, isStream, syncedAt }

import { getStore } from '@netlify/blobs';
import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const AUTO_PUBLISH_MIN_SEC = 45;
const SITE = 'https://itsdebatable.com';
// A 640-wide JPEG off the player lands around 40-80KB. 2MB is a wide
// ceiling that still refuses anything that is not a card image.
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

function dailyHeaders(){
  return { 'Authorization': 'Bearer ' + process.env.DAILY_API_KEY };
}

// Pull round metadata for a recording's room so the public card can say
// what the round was about, not just show a room slug.
async function roundMeta(db, roomName){
  try {
    const snap = await db.collection('live_rounds').doc(roomName).get();
    if (!snap.exists) return {};
    const d = snap.data() || {};
    const participants = [...new Set([
      d.proUid, d.proUid2, d.conUid, d.conUid2,
    ].filter(uid => typeof uid === 'string' && uid.length > 0))];
    const consents = d.recordingConsents || {};
    const recordingConsentComplete = participants.length >= 2
      && participants.every(uid => consents[uid] === true)
      && d.recordingPublishAllowed === true
      && /^round-recording-v1-/.test(d.recordingConsentVersion || '');
    return {
      // Read by the caller and stripped before the rest is written to the
      // recording doc. A round asks for this when a seated debater
      // declined, or when the round ended without the yeses ever landing.
      deleteRequested: d.recordingDeleteRequested === true,
      motion: d.motion || '',
      format: d.formatKey || d.format || '',
      proName: d.proName || (d.teamNames && d.teamNames.og) || '',
      conName: d.conName || (d.teamNames && d.teamNames.oo) || '',
      recordingConsentComplete,
      recordingConsentVersion: recordingConsentComplete ? d.recordingConsentVersion : '',
      recordingParticipants: recordingConsentComplete ? participants : [],
    };
  } catch {
    return {};
  }
}

// Ids an admin has deleted on purpose. One query per sync, not one read
// per item, so this stays cheap as the tombstone list grows.
async function deletedIds(db){
  try {
    const snap = await db.collection('recordings_deleted').select().limit(1000).get();
    return new Set(snap.docs.map(d => d.id));
  } catch {
    return new Set();
  }
}

export async function syncFromDaily(db, limit = 100){
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 100));
  const resp = await fetch(DAILY_API + '/recordings?limit=' + safeLimit, { headers: dailyHeaders() });
  if (!resp.ok){
    let detail = '';
    try { detail = await resp.text(); } catch {}
    throw new Error('Daily recordings list failed: ' + resp.status + ' ' + detail.slice(0, 300));
  }
  const data = await resp.json();
  const items = Array.isArray(data.data) ? data.data : [];
  const gone = await deletedIds(db);
  let created = 0, updated = 0, skipped = 0, purged = 0;
  for (const rec of items){
    if (!rec.id) continue;
    // Deleted on purpose. If the mp4 delete failed at Daily, this is the
    // only thing standing between the round and a resurrection.
    if (gone.has(rec.id)){ skipped++; continue; }
    const ref = db.collection('recordings').doc(rec.id);
    const existing = await ref.get();
    const isStream = /^debatable-live-/.test(rec.room_name || '');
    const { deleteRequested = false, ...meta } = isStream ? {} : await roundMeta(db, rec.room_name || '');
    // Capture now starts before anyone has agreed, so this is the arm
    // that makes a no mean something. The round flagged it; here is the
    // only place the Daily recording id is known, so here is where the
    // file dies. destroyRecording also tombstones the id, which stops the
    // next sync from re-indexing it.
    if (deleteRequested){
      try {
        await destroyRecording(db, rec.id);
        purged++;
        continue;
      } catch (e) {
        console.error('[recordings-sync] purge failed for', rec.id, e?.message || e);
      }
    }
    const finished = (rec.status === 'finished') && (rec.duration || 0) >= AUTO_PUBLISH_MIN_SEC;
    // Streams no longer auto-publish. They used to, which meant every
    // studio camera test over 45 seconds landed on the public watch page
    // and had to be deleted after the fact. A round publishes on a signal
    // that a human actually gave (every seated debater consented); a
    // stream had no equivalent, so it now waits for the publish press.
    const publishEligible = finished && !isStream && meta.recordingConsentComplete === true;
    const base = {
      roomName: rec.room_name || '',
      startTs: rec.start_ts || 0,          // unix seconds
      duration: rec.duration || 0,         // seconds
      status: rec.status || 'unknown',
      isStream,
      syncedAt: FieldValue.serverTimestamp(),
    };
    if (existing.exists){
      const old = existing.data() || {};
      const managed = old.publishManaged === true;
      await ref.set({
        ...base,
        ...meta,
        ...(managed && !old.publishOverridden ? {
          published: publishEligible,
          publishedAuto: publishEligible,
        } : {}),
      }, { merge: true });
      updated++;
      continue;
    }
    let title = '';
    if (isStream){
      // Recover the stream title from the site_stream history if this
      // was the most recent stream; otherwise a generic label.
      title = 'Tournament stream';
      try {
        const s = await db.collection('site_stream').doc('current').get();
        if (s.exists && (s.data() || {}).roomName === rec.room_name) title = (s.data() || {}).title || title;
      } catch {}
    } else if (meta.motion){
      title = meta.motion;
    } else {
      title = 'Round · ' + (rec.room_name || rec.id).slice(0, 40);
    }
    await ref.set({
      ...base,
      ...meta,
      title,
      published: publishEligible,
      publishedAuto: publishEligible,
      publishManaged: true,
      publishOverridden: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    created++;
  }
  return { total: items.length, created, updated, skipped, purged };
}

// Destroy a recording everywhere it exists. Order matters: the mp4 goes
// first (it is the thing that must not stay up), then the clips that
// point at it, then the index doc, then the tombstone.
async function destroyRecording(db, id){
  let dailyDeleted = false;
  let dailyError = '';
  if (!process.env.DAILY_API_KEY){
    dailyError = 'DAILY_API_KEY not configured, the video file was left in Daily';
  } else {
    try {
      const resp = await fetch(DAILY_API + '/recordings/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: dailyHeaders(),
      });
      // 404 means it is already gone, which is the state we wanted.
      dailyDeleted = resp.ok || resp.status === 404;
      if (!dailyDeleted){
        let detail = '';
        try { detail = await resp.text(); } catch {}
        dailyError = 'Daily returned ' + resp.status + ' ' + detail.slice(0, 200);
      }
    } catch (e) {
      dailyError = e.message || 'Daily delete failed';
    }
  }

  let clipsDeleted = 0;
  try {
    const clips = await db.collection('clips').where('recordingId', '==', id).limit(500).get();
    for (const doc of clips.docs){
      await doc.ref.delete();
      clipsDeleted++;
    }
  } catch (e) {
    console.error('recordings delete: clip sweep failed', e.message);
  }

  await db.collection('recordings').doc(id).delete();
  await db.collection('recordings_deleted').doc(id).set({
    deletedAt: FieldValue.serverTimestamp(),
    dailyDeleted,
  });
  return { dailyDeleted, dailyError, clipsDeleted };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const { db } = gate;

  if (req.method === 'GET'){
    // Cheap "am I an admin" probe. /watch asks this to decide whether to
    // render owner controls; answering it with the full list would be a
    // 100-doc read on every page view.
    const url = new URL(req.url);
    if (url.searchParams.get('probe')) return jsonResponse({ admin: true }, 200, req);
    const snap = await db.collection('recordings').orderBy('startTs', 'desc').limit(100).get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data(), syncedAt: undefined, createdAt: undefined }));
    return jsonResponse({ recordings: list }, 200, req);
  }

  if (req.method !== 'POST') return errorResponse('GET or POST', 405, req);

  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, req); }

  // Delete runs without a Daily key: pulling the round off the site is
  // the urgent half, and the response says plainly when the mp4 survived.
  if (body.action === 'delete'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    const result = await destroyRecording(db, id);
    return jsonResponse({ id, deleted: true, ...result }, 200, req);
  }

  // Choose the frame that represents a round.
  //
  // recording-thumb cuts one automatically at ~60% of the first 16MB,
  // which is a guess: it regularly lands on the connect screen, a head
  // turned away, or the half second somebody was adjusting a laptop.
  // This lets an owner play to the moment that IS the round and set it.
  //
  // The frame arrives already decoded, from the browser that is playing
  // the video: Daily's CDN serves the mp4 with Access-Control-Allow-
  // Origin: *, so /watch can read the <video> onto a canvas without
  // tainting it. Cutting it here instead would mean seeking a
  // fragmented mp4 by byte range, which is the exact cost the header of
  // recording-thumb explains is unaffordable (~27s and a 502).
  //
  // It is written to the SAME blob key recording-thumb serves, so the
  // cards, /w/{id}'s og:image and VideoObject.thumbnailUrl all follow
  // with no second code path. `thumbV` is what makes the change visible:
  // the served image is cached immutable for a year at the edge, so
  // without a version in the URL the old still would outlive the choice.
  //
  // Above the DAILY_API_KEY gate on purpose: nothing here touches Daily.
  if (body.action === 'thumb'){
    const id = String(body.id || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return errorResponse('id required', 400, req);
    const snap = await db.collection('recordings').doc(id).get();
    if (!snap.exists) return errorResponse('Not found', 404, req);
    const store = getStore('recording-thumbs');
    const raw = String(body.image || '');

    // Empty clears it: the blob goes, the doc fields go, and the next
    // card render re-runs the auto-cut. A chosen frame you regret has to
    // be undoable or nobody presses the button.
    if (!raw){
      await store.delete(id).catch(() => {});
      await db.collection('recordings').doc(id).set({
        thumbnailUrl: '', thumbV: 0, thumbAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return jsonResponse({ id, thumbV: 0, cleared: true }, 200, req);
    }

    const m = raw.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return errorResponse('Expected a data:image/jpeg', 400, req);
    let bytes;
    try { bytes = Buffer.from(m[1], 'base64'); } catch { return errorResponse('Bad image data', 400, req); }
    if (!bytes.length) return errorResponse('Empty image', 400, req);
    if (bytes.length > MAX_THUMB_BYTES) return errorResponse('Image too large', 413, req);
    // The declared mime is client copy; the magic bytes are the check.
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF){
      return errorResponse('Not a JPEG', 400, req);
    }

    const thumbV = Date.now();
    await store.set(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    await db.collection('recordings').doc(id).set({
      thumbnailUrl: SITE + '/api/recording-thumb?id=' + encodeURIComponent(id) + '&v=' + thumbV,
      thumbV,
      thumbAt: FieldValue.serverTimestamp(),
      // Recorded so a later look can tell which second of the round the
      // card is showing without opening the file.
      thumbSeek: Math.max(0, Math.round(Number(body.t) || 0)),
    }, { merge: true });
    return jsonResponse({ id, thumbV, bytes: bytes.length }, 200, req);
  }

  // Attach (or clear) the YouTube id for a recording that has also been
  // uploaded to the channel. Deliberately ABOVE the DAILY_API_KEY gate:
  // this touches nothing at Daily, and needing a Daily key to record the
  // fact that a video exists on YouTube would be a nonsense dependency.
  //
  // Setting this is what makes /w/{id} eligible for video rich results.
  // Google wants a thumbnail that represents the video and our fallback
  // is a brand card, but YouTube publishes a real still per video at a
  // stable URL, so an id here gives the page a genuine thumbnail plus an
  // embedUrl, and the watch time lands on the channel rather than being
  // split away from it.
  if (body.action === 'youtube'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    const raw = String(body.youtubeId || '').trim();
    // Accept a bare id or anything you would actually paste: a watch URL,
    // a youtu.be link, an /embed/ or /live/ URL, with or without query.
    let ytId = '';
    if (raw){
      const m = raw.match(/(?:youtu\.be\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{11})/)
        || raw.match(/^([A-Za-z0-9_-]{11})$/);
      if (!m) return errorResponse('Not a YouTube video id or URL', 400, req);
      ytId = m[1];
    }
    // Empty clears the field, which is the un-publish path: an id left
    // behind after a video is taken down would put a dead embed and a
    // 404 thumbnail into structured data.
    await db.collection('recordings').doc(id).set({ youtubeId: ytId }, { merge: true });
    return jsonResponse({ id, youtubeId: ytId }, 200, req);
  }

  if (!process.env.DAILY_API_KEY) return errorResponse('DAILY_API_KEY not configured', 503, req);

  if (body.action === 'sync'){
    try {
      const result = await syncFromDaily(db);
      return jsonResponse(result, 200, req);
    } catch (e) {
      return errorResponse(e.message, 502, req);
    }
  }

  if (body.action === 'publish'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    await db.collection('recordings').doc(id).set({
      published: body.published !== false,
      publishedAuto: false,
      publishManaged: false,
      publishOverridden: true,
    }, { merge: true });
    return jsonResponse({ id, published: body.published !== false }, 200, req);
  }

  if (body.action === 'meta'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    await db.collection('recordings').doc(id).set({
      title: String(body.title || '').slice(0, 200),
    }, { merge: true });
    return jsonResponse({ id }, 200, req);
  }

  return errorResponse('Unknown action (sync | publish | meta | thumb | youtube | delete)', 400, req);
};

export const config = {
  path: '/api/admin/recordings',
};
