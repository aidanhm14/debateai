import { createHash } from 'node:crypto';
import Teams from '../../../js/room-teams.js';

// Select a seat's own saved words. Never attribute a shared TALK container
// to its clock owner or let the caller supply an opponent's alleged quote.
export function factCheckInput(round, uid, { side, speechIdx } = {}) {
  if (!Teams.seats(round).some(s => s.uid === uid)) throw Object.assign(new Error('Participants only.'), {status:403});
  const open = ['open','conversation'].includes(round.format);
  let text = '', seat, idx = Number(speechIdx);
  if (open) {
    seat = Teams.seats(round).find(s => s.key === side && s.uid);
    if (!seat) throw Object.assign(new Error('Invalid speaker.'), {status:400});
    text = Teams.conversationRows(round).filter(r => r.key === seat.key).map(r => r.text).join(' ');
    idx = 0;
  } else {
    if (!Number.isInteger(idx) || idx < 0 || idx > 30) throw Object.assign(new Error('Invalid speech.'), {status:400});
    const speech = round.speeches?.[idx];
    const live = round.currentTranscript;
    const current = idx === Number(round.speechIdx);
    const role = speech?.side || (current && ['quick','casual'].includes(round.format) ? (idx % 2 ? 'con' : 'pro') : '');
    if (!role) return {text:'',seat:'',speechIdx:idx};
    const first = ['pro','gov','aff','prop','og','cg'].includes(role);
    seat = Teams.seats(round).find(s => s.key === (first ? 'pro' : 'con'));
    text = speech?.text || (current && live?.speechIdx === idx ? live.text : '') || '';
  }
  // Tail coverage follows new speech instead of checking the same prefix.
  text = String(text).slice(-6000).trim();
  return {motion:String(round.motion || round.topic || '').slice(0,500), format:'Casual 1v1',
    speaker:seat?.name || 'Speaker', side:seat?.side === 'pro' ? 'For' : 'Against', seat:seat?.key || '',
    speechIdx:idx, text, checked:(round.factChecks || []).map(f => f.claim).slice(-12)};
}

export async function reserveFactCheck(db, room, input, now = Date.now()) {
  const ref = db.collection('fact_check_runs').doc(room);
  const hash = createHash('sha256').update(input.seat + ':' + input.speechIdx + ':' + input.text).digest('hex');
  return db.runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const counts = d.counts || {};
    if ((d.hashes || []).includes(hash)) return 'already_checked';
    if ((d.busyUntil?.[input.seat] || 0) > now) return 'checking';
    if ((counts[input.seat] || 0) >= 16 || (d.total || 0) >= 48) return 'limit';
    tx.set(ref, {hashes:[...(d.hashes || []),hash].slice(-48), counts:{...counts,[input.seat]:(counts[input.seat] || 0)+1},
      total:(d.total || 0)+1, busyUntil:{...(d.busyUntil || {}),[input.seat]:now+55000}, updatedAt:now});
    return 'reserved';
  });
}
