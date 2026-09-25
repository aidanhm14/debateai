// Honor provider bounces/complaints and audience unsubscribes before a bulk send.
export async function campaignSuppressions(fetcher = fetch) {
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
