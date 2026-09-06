function millis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis()
    : value instanceof Date ? value.getTime()
    : typeof value === 'number' ? value
    : Number(value && (value.seconds ?? value._seconds)) * 1000 || 0;
}

export function roomShotPublic(d, now = Date.now()) {
  if (!d || d.isPrivate === true || !['round', 'ballot'].includes(d.status)) return false;
  if (!d.proUid || !d.conUid || d.proUid === d.conUid) return false;
  if (d.draft && d.draft.phase !== 'done' && !d.draftResolvedAt) return false;
  return [d.proUid, d.conUid].every(uid => {
    const seen = millis(d.seatSeen?.[uid]), left = millis(d.seatLeft?.[uid]);
    return seen > 0 && now - seen < 100000 && !(left && left >= seen);
  });
}
