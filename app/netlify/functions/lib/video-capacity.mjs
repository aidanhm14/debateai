import { createHash, randomInt } from 'node:crypto';

const MAX_SHARDS = 256;
function integer(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : fallback;
}
export function videoCapacity(env = process.env) {
  return {
    hourlyAdmissions: integer(env.DAILY_ROOM_HOURLY_CAP, 6000, 50, 1_000_000),
    maxParticipants: integer(env.DAILY_ROOM_MAX_PARTICIPANTS, 200, 8, 1000),
  };
}
export function videoRoomProperties(env = process.env) {
  const { maxParticipants } = videoCapacity(env);
  return {
    max_participants: maxParticipants,
    enable_mesh_sfu: true,
    enable_hidden_participants: true,
    enable_terse_logging: maxParticipants > 200,
    enable_adaptive_simulcast: true,
    enable_multiparty_adaptive_simulcast: true,
  };
}

// Fixed-window counters shared across cold starts. Caller and site checks
// use separate, short transactions so a crowded global partition cannot
// hold a person's document while waiting for another budget document.
export async function admitVideoRequest(db, caller, { now = Date.now(),
  hourlyCap = videoCapacity().hourlyAdmissions, random = randomInt } = {}) {
  const collection = db.collection('video_admission'); // server-only
  const id = createHash('sha256').update(String(caller)).digest('hex');
  const person = collection.doc('caller:' + id);
  const minute = Math.floor(now / 60_000), hour = Math.floor(now / 3_600_000);
  const personal = await db.runTransaction(async tx => {
    const p = (await tx.get(person)).data() || {};
    const minCount = p.minute === minute ? p.minCount || 0 : 0;
    const hourCount = p.hour === hour ? p.hourCount || 0 : 0;
    if (minCount >= 12) return { ok: false, layer: 'min' };
    if (hourCount >= 90) return { ok: false, layer: 'hour' };
    // Refused global admissions count here too, so retries against an
    // exhausted site budget still encounter the per-caller limit.
    tx.set(person, { minute, hour, minCount: minCount + 1, hourCount: hourCount + 1, updatedAt: now });
    return { ok: true };
  });
  if (!personal.ok) return personal;
  const size = Math.min(MAX_SHARDS, hourlyCap);
  const refs = Array.from({length:size}, (_,i) => collection.doc('site:' + i));
  const cap = i => Math.floor(hourlyCap / size) + (i < hourlyCap % size ? 1 : 0);
  let index = random(size);
  for (let attempt = 0; attempt < 8; attempt++) {
    const admitted = await db.runTransaction(async tx => {
      const d = (await tx.get(refs[index])).data() || {};
      const count = d.hour === hour ? d.count || 0 : 0;
      if (count >= cap(index)) return false;
      tx.set(refs[index], { hour, count: count + 1 });
      return true;
    });
    if (admitted) return { ok: true };
    // Full partitions are rare until close to the site ceiling. Read
    // availability outside the transaction: never lock every partition.
    const snapshots = await db.getAll(...refs);
    const available = snapshots.flatMap((snap,i) => {
      const d = snap.data() || {};
      return (d.hour === hour ? d.count || 0 : 0) < cap(i) ? [i] : [];
    });
    if (!available.length) break;
    index = available[random(available.length)];
  }
  return { ok: false, layer: 'site_hour' };
}
