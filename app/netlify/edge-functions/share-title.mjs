// Share-title v2: social-preview crawlers get a sticky three-way Open Graph
// title. App-generated links carry ?share_title= so the preview and the
// recipient's GA4 share_title_view agree. End the test by keeping the
// winning static title and removing this function plus its tracking.
const COOKIE_NAME = 'debatable_share_title_v2';
const QUERY_NAME = 'share_title';
const COOKIE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export const TITLES = {
  bet: 'Debatable - Bet on your words',
  opinion: 'Debatable - Everyone has an opinion',
  streamers: 'Debatable - Strangers vs streamers',
};

function validVariant(value) {
  return Object.prototype.hasOwnProperty.call(TITLES, value) ? value : '';
}

export function selectVariant(url, storedVariant, random = Math.random) {
  const assigned = validVariant(url.searchParams.get(QUERY_NAME))
    || validVariant(storedVariant);
  if (assigned) return assigned;
  const variants = Object.keys(TITLES);
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))];
}

function replaceMetaContent(html, attribute, name, content) {
  const meta = new RegExp(
    `<meta\\b(?=[^>]*\\b${attribute}=["']${name}["'])[^>]*>`,
    'i',
  );
  return html.replace(meta, (tag) => (
    tag.replace(/\bcontent=(["'])[^"']*\1/i, 'content="' + content + '"')
  ));
}

export function renderVariant(html, variant) {
  const title = TITLES[variant] || TITLES.bet;
  let rendered = replaceMetaContent(html, 'property', 'og:title', title);
  rendered = replaceMetaContent(rendered, 'name', 'twitter:title', title);
  rendered = replaceMetaContent(rendered, 'name', 'debatable:share-title-variant', variant);
  return rendered;
}

export default async function handler(request, context) {
  const url = new URL(request.url);
  const variant = selectVariant(url, context.cookies.get(COOKIE_NAME));
  context.cookies.set({
    name: COOKIE_NAME,
    value: variant,
    path: '/',
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    expires: Date.now() + COOKIE_TTL_MS,
  });

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return response;

  const html = renderVariant(await response.text(), variant);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('x-debatable-share-title', variant);

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  path: ['/', '/landing', '/landing.html'],
  method: 'GET',
  header: {
    'netlify-agent-category': '^(page-preview|crawler;social)',
  },
  onError: 'bypass',
};
