function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function challengePreviewHtml(html, c) {
  const url = 'https://itsdebatable.com/challenge/' + encodeURIComponent(c.slug);
  const creator = c.creator || {};
  const seat = (c.accepted || []).find(p => p.uid === creator.uid);
  const side = c.sides?.[seat?.side] || 'For';
  const title = c.claim + ' · Debatable';
  const description = c.status === 'completed'
    ? 'The debate is complete. Read the ballot and see the result on Debatable.'
    : (creator.name || 'Someone') + ' is taking ' + side + '. Take the other side or watch the debate.';
  return html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escapeHtml(title) + '</title>')
    .replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + escapeHtml(url) + '">')
    .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*/g, (_, prefix) => prefix + escapeHtml(title))
    .replace(/(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*/g, (_, prefix) => prefix + escapeHtml(description))
    .replace(/(<meta property="og:url" content=")[^"]*/, (_, prefix) => prefix + escapeHtml(url));
}

export default async (request, context) => {
  const path = new URL(request.url).pathname;
  const match = /^\/(?:challenge|c)\/([a-z0-9-]+)\/?$/.exec(path);
  if (!match || match[1] === 'new' || request.method !== 'GET') return;
  const response = await context.next();
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  try {
    const data = await fetch(new URL('/api/challenge?slug=' + encodeURIComponent(match[1]), request.url), {
      signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' },
    });
    if (!data.ok) return response;
    const { challenge } = await data.json();
    if (!challenge) return response;
    const html = challengePreviewHtml(await response.text(), challenge);
    const headers = new Headers(response.headers);
    headers.delete('content-length'); headers.delete('etag');
    headers.set('cache-control', 'private, no-store');
    return new Response(html, { status: response.status, headers });
  } catch { return response; }
};

export const config = { path: ['/challenge/*', '/c/*'], method: 'GET' };
