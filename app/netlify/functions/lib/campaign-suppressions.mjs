// Honor provider bounces/complaints and audience unsubscribes before a bulk send.
export function reviewedSuppressions(record, now = Date.now()) {
  if (!record?.complete || !Number.isFinite(record.reviewedAt) || record.reviewedAt > now
      || now - record.reviewedAt > 60 * 60 * 1000
      || !Array.isArray(record.suppressed) || !Array.isArray(record.unsubscribed)
      || record.suppressed.length !== record.suppressionCount
      || record.unsubscribed.length !== record.unsubscribedCount) return null;
  return new Set([...record.suppressed, ...record.unsubscribed].map(email => String(email).trim().toLowerCase()));
}
export async function campaignSuppressions(db, campaign, fetcher = fetch) {
  // Sending-only keys cannot read the provider's lists. A complete dashboard
  // review may be stored server-side for this campaign and used for one hour.
  // There is no client write route or request-body override for this record.
  const review = reviewedSuppressions((await db.doc('campaign_suppressions/' + campaign).get()).data());
  if (review) return review;
  const blocked = new Set();
  for (const path of ['suppressions','contacts']) {
    let after = '', pages = 0;
    do {
      const response = await fetcher('https://api.resend.com/' + path + '?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), {
        headers:{Authorization:'Bearer ' + process.env.RESEND_API_KEY}, signal:AbortSignal.timeout(8000)
      });
      const list = await response.json();
      if (!response.ok || !Array.isArray(list.data)) throw new Error('Cannot verify email suppressions: ' + path + ' ' + response.status);
      for (const person of list.data) if (person.email && (path === 'suppressions' || person.unsubscribed)) blocked.add(person.email.trim().toLowerCase());
      after = list.has_more ? list.data.at(-1)?.id : '';
      if (list.has_more && !after || ++pages > 100) throw new Error('Incomplete email suppression list');
      // Shared account API rate limit is two requests per second.
      await new Promise(resolve => setTimeout(resolve,600));
    } while (after);
  }
  return blocked;
}
