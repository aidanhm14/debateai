import Teams from '../../../js/room-teams.js';

export const FINISH_REQUEST_MS = 60_000;
function fail(message, code = 'FINISH_NOT_READY', status = 409) {
  throw Object.assign(new Error(message), {code, status});
}
export function publicFinish(f) {
  if (!f) return null;
  return {id:f.id, revision:f.revision, phase:f.phase, by:f.by,
    expiresAt:f.expiresAt, acceptedAt:f.acceptedAt || 0,
    ready:{pro:!!f.ready?.pro, con:!!f.ready?.con}};
}
// Receipts are server-only. The room field is a UI projection, never
// authorization for judging. A cancelled/expired request cannot be used
// to jump past a missing person's consent or final transcript upload.
export function conversationFinishBlocksJudging(receipt) {
  return !!receipt && receipt.phase !== 'completed';
}
function elapsedAt(round, now) {
  const t = round.currentTimer || {};
  const stamp = Teams.millis(t.updatedAtServer);
  const offset = stamp && t.updatedAtMs ? stamp - t.updatedAtMs : 0;
  const started = Number(t.startMs) || 0;
  return Math.max(0, (Number(t.accumulatedMs) || 0)
    + (t.state === 'running' && started ? now - (started + offset) : 0));
}
function finalSpeech(round, f) {
  const rows = Teams.conversationRows({...round, openSegs:f.captures});
  const merged = [];
  for (const row of rows) {
    const last = merged.at(-1);
    if (last?.key === row.key) last.text += ' ' + row.text;
    else merged.push({...row});
  }
  return {code:'TALK', name:'Open conversation', side:'pro', open:true,
    speakerName:(round.proName || 'For') + ' and ' + (round.conName || 'Against'),
    speakerUid:'', text:merged.map(r => `${r.name} (${r.side === 'pro' ? 'For' : 'Against'}): ${r.text}`).join('\n\n') || '(no transcript)',
    durationSec:Math.round(f.elapsedMs / 1000), targetSec:3600, overSec:0, overran:false, skipped:false};
}
export async function changeConversationFinish(db, room, uid, body, now = Date.now()) {
  const ref = db.collection('live_rounds').doc(room);
  const receiptRef = db.collection('round_finishes').doc(room);
  return db.runTransaction(async tx => {
    const [snap, receipt] = await Promise.all([tx.get(ref), tx.get(receiptRef)]);
    if (!snap.exists) fail('Round not found.', 'NOT_FOUND', 404);
    const round = snap.data();
    const side = uid === round.proUid ? 'pro' : uid === round.conUid ? 'con' : '';
    if (!uid || !side) fail('Only the two people in this round can finish it.', 'NOT_SEATED', 403);
    if (!round.proUid || !round.conUid || round.proUid === round.conUid || Teams.enabled(round)
        || !['open','conversation'].includes(round.format)) fail('This finish request is for a 1v1 conversation.', 'WRONG_MODE');
    const action = body.action;
    if (!['request','accept','cancel','ready'].includes(action)) fail('Unknown finish action.', 'BAD_REQUEST', 400);
    let f = receipt.exists ? receipt.data() : null;
    if (f && (f.proUid !== round.proUid || f.conUid !== round.conUid)) fail('The seats changed. Reload this round.', 'SEATS_CHANGED');
    if (f?.phase === 'completed') return {ok:true, finish:publicFinish(f)};
    if (round.ballot || round.ballotUnresolved || round.ballotPending || Number(round.speechIdx) > 0
        || ['forfeit','cancelled','done','completed'].includes(round.status)) fail('This round has already ended.', 'ROUND_ENDED');
    if (action === 'request') {
      if (f?.phase === 'flushing' || (f?.phase === 'requested' && now < f.expiresAt)) return {ok:true, finish:publicFinish(f)};
      if (!Teams.started(round)) fail('Start the conversation before asking to finish it.', 'NOT_STARTED');
      const revision = (f?.revision || 0) + 1;
      f = {id:`${now}-${revision}`, revision, phase:'requested', by:uid,
        proUid:round.proUid, conUid:round.conUid, uids:[round.proUid,round.conUid], expiresAt:now + FINISH_REQUEST_MS, ready:{}, captures:{}};
    } else {
      if (!f || body.id !== f.id) fail('That finish request changed. Try again.', 'STALE_REQUEST');
      if (action === 'cancel') {
        if (f.phase !== 'requested') fail('Both people already agreed to finish. Save the remaining transcript.', 'ALREADY_ACCEPTED');
        f = {...f, phase:'cancelled', revision:f.revision + 1};
      } else if (action === 'accept') {
        if (f.phase === 'flushing') return {ok:true, finish:publicFinish(f)};
        if (f.phase !== 'requested' || now >= f.expiresAt) fail('That request expired. Keep talking or ask again.', 'REQUEST_EXPIRED');
        if (uid === f.by) fail('The other person needs to agree too.', 'NEEDS_PEER');
        f = {...f, phase:'flushing', acceptedAt:now, elapsedMs:elapsedAt(round, now), revision:f.revision + 1};
      } else {
        if (f.phase !== 'flushing') fail('Both people must agree before saving the final transcript.', 'NEEDS_CONSENT');
        if (!f.ready[side]) {
          // Read only this caller's durable stream. Freeze it in the
          // receipt so a later room write cannot erase a saved tail.
          const rows = Teams.conversationRows(round).filter(r => r.key === side);
          const segments = rows.map(r => ({at:r.at, clock:'server', speakerUid:uid, text:r.text}));
          f = {...f, ready:{...f.ready,[side]:true}, captures:{...f.captures,[side]:segments}, revision:f.revision + 1};
        }
        if (f.ready.pro && f.ready.con) f = {...f, phase:'completed'};
      }
    }
    const projection = publicFinish(f);
    const patch = {conversationFinish:projection};
    if (f.phase === 'completed') Object.assign(patch, {
      speeches:[finalSpeech(round, f)], speechIdx:1, status:'ballot', ballotPending:true,
      ballotPendingAt:new Date(now), currentTimer:{speechIdx:0, state:'ended', accumulatedMs:f.elapsedMs, startMs:0},
    });
    // The saved round now owns the transcript. Keep only the small
    // completion receipt once its temporary upload copies are no longer needed.
    tx.set(receiptRef, f.phase === 'completed' ? {...f,captures:{}} : f);
    tx.update(ref, patch);
    return {ok:true, finish:projection};
  });
}
