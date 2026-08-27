// Netlify Web Analytics counts successful HTML responses at the CDN, before
// any page JavaScript runs. Refuse only self-identifying headless/test clients
// at that boundary so they cannot become pageviews or city bubbles. Search
// crawlers and link-preview agents are intentionally not in this list.
const OBVIOUS_AUTOMATION = /(?:headlesschrome|chrome-lighthouse|lighthouse|pagespeed|playwright|puppeteer|selenium|phantomjs|rendertron|prerender|python-requests|python-urllib|\bcurl\/|\bwget\/|go-http-client|node-fetch|\bundici\b)/i;
const STATIC_EXTENSION = /\.[a-z0-9]{1,10}$/i;

export function isObviousAutomatedDocument(request) {
  if (!request || !['GET', 'HEAD'].includes(request.method)) return false;

  const url = new URL(request.url);
  const path = url.pathname;
  if (
    path === '/api' || path.startsWith('/api/') ||
    path === '/.netlify' || path.startsWith('/.netlify/') ||
    path === '/.well-known' || path.startsWith('/.well-known/')
  ) return false;

  const leaf = path.split('/').pop() || '';
  if (STATIC_EXTENSION.test(leaf) && !/\.html?$/i.test(leaf)) return false;

  const userAgent = request.headers.get('user-agent') || '';
  const clientHints = request.headers.get('sec-ch-ua') || '';
  if (!OBVIOUS_AUTOMATION.test(userAgent + ' ' + clientHints)) return false;

  const destination = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const accept = (request.headers.get('accept') || '').toLowerCase();
  return destination === 'document' || accept.includes('text/html') ||
    /\.html?$/i.test(leaf) || !STATIC_EXTENSION.test(leaf);
}

export default function trafficQuality(request) {
  if (!isObviousAutomatedDocument(request)) return;

  // Netlify Web Analytics counts text/html responses with 200, 201, or 304.
  // A bodyless 204 is deliberately outside that pageview definition.
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-debatable-traffic-filter': 'obvious-automation',
    },
  });
}

export const config = {
  path: '/*',
  // Netlify's Edge Functions manifest currently accepts GET but not HEAD.
  // HEAD responses are not HTML pageviews, so only GET needs this boundary.
  method: 'GET',
};
