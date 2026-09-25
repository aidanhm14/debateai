// Pure definitions shared by the dashboard endpoints and regression fixtures.
export const DAY = 86_400_000;

export function namedAccounts(users) {
  return users.filter(u => (u.providerData || []).some(p => p.providerId && p.providerId !== 'anonymous'))
    .map(u => ({ uid: u.uid, createdAt: Date.parse(u.metadata?.creationTime) || 0 }));
}

export function countSignups(accounts, start, end = Infinity) {
  return accounts.filter(u => u.createdAt > 0 && u.createdAt >= +start && u.createdAt < +end).length;
}

export function eventMs(event) {
  return event.createdAt?.toMillis?.() || 0;
}

export function activityCoverage(events, { sinceMs, now, truncated }) {
  const times = events.map(eventMs).filter(t => t > 0 && t <= now);
  const oldest = times.length ? Math.min(...times) : null;
  // Other events can share the cutoff millisecond and sit beyond the cap.
  const coveredSince = truncated ? (oldest == null ? null : oldest + 1) : sinceMs;
  return {
    coveredSince,
    completeFrom: start => coveredSince != null && coveredSince <= start,
  };
}

export function activeMetrics(events, { now, coverage }) {
  const latest = new Map();
  for (const e of events) {
    const t = eventMs(e);
    if (e.uid && t > 0 && t <= now) latest.set(e.uid, Math.max(t, latest.get(e.uid) || 0));
  }
  const count = days => coverage.completeFrom(now - days * DAY)
    ? [...latest.values()].filter(t => t >= now - days * DAY).length : null;
  const dau = count(1), wau = count(7), mau = count(28);
  return { dau, wau, mau, stickinessPct: dau != null && mau > 0 ? +(100 * dau / mau).toFixed(1) : null };
}

export function isSigninFailure(record) {
  // Legacy records without an event name are accepted only with an actual auth code.
  return record.event === 'sign_in_error' || (!record.event && /^auth\//.test(record.code || ''));
}

export function experimentAssessment(variants, sampled) {
  // A live, repeatedly inspected and possibly truncated counter has no stopping
  // rule or statistical test. Report observations without selecting a winner.
  return {
    ready: false,
    leader: '',
    assessment: sampled ? 'Sampled data; no winner established'
      : variants.length < 2 ? 'Collecting variants'
        : variants.every(v => v.uniqueConversions === 0) ? 'No clicks yet; no winner established'
          : 'Observed CTR only; no winner established',
  };
}

export function exitCardMetrics(records, truncated = false) {
  const cards = new Map();
  let known = 0, legacyShown = 0, legacyAnswered = 0, legacySkipped = 0;
  for (const d of records) {
    const m = d.metadata || {};
    if (m.via !== 'card') {
      if (m.reason && !['shown', 'skipped'].includes(m.reason)) known++;
      continue;
    }
    if (!m.card_id) {
      if (m.reason === 'shown') legacyShown++;
      else if (m.reason === 'skipped') legacySkipped++;
      else if (m.reason) legacyAnswered++;
      continue;
    }
    const card = cards.get(m.card_id) || { shown: false, outcomes: new Set() };
    if (m.reason === 'shown') card.shown = true;
    else if (m.reason) card.outcomes.add(m.reason === 'skipped' ? 'skipped' : 'answered');
    cards.set(m.card_id, card);
  }
  let shown = 0, answered = 0, skipped = 0, unmatched = 0, conflicting = 0;
  for (const card of cards.values()) {
    if (!card.shown) { unmatched++; continue; }
    shown++;
    if (card.outcomes.size > 1) { conflicting++; continue; }
    if (card.outcomes.has('answered')) answered++;
    if (card.outcomes.has('skipped')) skipped++;
  }
  return {
    shown, answered, skipped, unmatched, conflicting, known,
    legacyShown, legacyAnswered, legacySkipped,
    // Never mix inferred button reasons, orphan responses or unpaired historical
    // events into a prompt conversion rate. Duplicate receipts count once.
    answerRate: shown && !truncated && !unmatched && !conflicting ? +(100 * answered / shown).toFixed(1) : null,
  };
}
