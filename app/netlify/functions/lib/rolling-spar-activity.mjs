const DAY_MS = 86400000;
export const ACTIVITY_KEEP_MS = 8 * DAY_MS;

// Preserve existing aggregates while timestamped ticks take over. New attempts
// expire individually after 168 hours. Old daily buckets have no event times,
// so only wholly included dates can contribute their untimed remainder.
export function rollingSevenDays(stored = {}, now = new Date()) {
  const end = now.getTime();
  const cutoff = end - 7 * DAY_MS;
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthKey = new Date(monthStart).toISOString().slice(0, 7);
  const timedByDay = {};
  let count = 0;
  let beforeMonth = 0;
  for (const [key, value] of Object.entries(stored.by_time || {})) {
    const time = Number(key);
    if (!Number.isFinite(time) || !Number.isSafeInteger(value) || value < 0 || time > end) continue;
    const day = new Date(time).toISOString().slice(0, 10);
    timedByDay[day] = (timedByDay[day] || 0) + value;
    if (time < cutoff) continue;
    count += value;
    if (time < monthStart) beforeMonth += value;
  }
  for (const [key, value] of Object.entries(stored.by_day || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isSafeInteger(value) || value < 0) continue;
    const date = Date.parse(key + 'T00:00:00Z');
    if (!Number.isFinite(date) || date < cutoff || date > end) continue;
    const untimed = Math.max(0, value - (timedByDay[key] || 0));
    count += untimed;
    if (date < monthStart) beforeMonth += untimed;
  }
  // Bucketing began partway through 2026-09-02. Preserve earlier attempts
  // from the month total while that entire month lies inside the window.
  // Never substitute a current-week counter or an expired month.
  if (monthStart >= cutoff && stored.month_key === monthKey &&
      Number.isSafeInteger(stored.month_count) && stored.month_count >= 0) {
    count = Math.max(count, beforeMonth + stored.month_count);
  }
  return { count, window: 7, from: cutoff, through: end };
}
