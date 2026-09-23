import { DRAFT_MOTIONS } from './draft-motions.mjs';
import { checkContent } from './content-guard.mjs';
import { topicRoundOpen } from './room-topic.mjs';
import { matchDeskDraftConfig } from './spar-match-profile.mjs';

const normalized = value => String(value || '').trim().toLowerCase().replace(/[.!]+$/, '');
const safe = value => typeof value === 'string' && value.length >= 12 && value.length <= 200
  && checkContent({ text: value, kind: 'motion' }).ok;

// Pairing already built these suggestions from both people's saved answers.
// Read only that server-owned pool. Profiles, reasons and inferred sides
// never enter the response, round document or judging evidence.
export async function spinRoomTopic(db, uid, body, random = Math.random) {
  const [roomSnap, stampSnap] = await Promise.all([
    db.collection('live_rounds').doc(body.room).get(),
    db.collection('round_drafts').doc(body.room).get(),
  ]);
  const round = roomSnap.exists ? roomSnap.data() : null;
  const stamp = stampSnap.exists ? stampSnap.data() : null;
  if (!round || ![round.proUid, round.conUid].includes(uid)) {
    throw Object.assign(new Error('Only the two seated people can spin a topic.'), { status: 403 });
  }
  if (!topicRoundOpen(round) || (round.draft && round.draft.phase !== 'done')
      || (round.topicStrikes && !['done', 'cancelled'].includes(round.topicStrikes.phase))
      || stamp?.tournamentId || stamp?.draftConfig?.pool) {
    throw Object.assign(new Error('Choose a topic before the round starts.'), { status: 409 });
  }
  const current = normalized(round.motion);
  const recent = new Set((Array.isArray(body.avoid) ? body.avoid.slice(-16) : []).map(normalized));
  const available = pool => {
    const all = [...new Set(pool)].filter(value => safe(value) && normalized(value) !== current);
    const fresh = all.filter(value => !recent.has(normalized(value)));
    return fresh.length ? fresh : all;
  };
  const verifiedPair = stamp?.eligible === true && stamp.uids?.length === 2
    && stamp.uids[0] !== stamp.uids[1]
    && stamp.uids.every(id => [round.proUid, round.conUid].includes(id));
  const personal = available(verifiedPair && Array.isArray(stamp.draftConfig?.suggestions)
    ? stamp.draftConfig.suggestions : []);
  const broad = available(DRAFT_MOTIONS.casual);
  let differenceSuggestions = verifiedPair ? stamp.draftConfig?.differenceSuggestions : [];
  // Older matches predate this field. Only an explicit request for differences
  // reads their saved answers; the response still contains only a topic.
  if (body.mode === 'difference' && verifiedPair && !Array.isArray(differenceSuggestions)) {
    const profiles = await Promise.all(stamp.uids.map(id => db.collection('spar_match_profiles').doc(id).get()));
    differenceSuggestions = profiles.every(s => s.exists)
      ? matchDeskDraftConfig(profiles[0].data(), profiles[1].data(), body.room).differenceSuggestions : [];
  }
  const differences = available(differenceSuggestions || []);
  if (body.mode === 'difference' && !differences.length) {
    throw Object.assign(new Error('Your matching answers do not give us another clear difference yet. Spin a topic or propose one together.'), { status: 409 });
  }
  const pool = body.mode === 'difference' ? differences : personal.length && random() < 2 / 3 ? personal : broad;
  const motion = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return { motion, from: round.motion || '' };
}
