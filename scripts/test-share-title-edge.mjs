import assert from 'node:assert/strict';
import handler, {
  renderVariant,
  selectVariant,
  TITLES,
} from '../netlify/edge-functions/share-title.mjs';

const fixture = `<!doctype html><head>
<meta property="og:title" content="${TITLES.bet}" />
<meta name="twitter:title" content="${TITLES.bet}" />
<meta name="debatable:share-title-variant" content="bet" />
</head>`;

assert.equal(
  selectVariant(new URL('https://itsdebatable.com/?share_title=opinion'), 'bet', () => 0),
  'opinion',
  'query assignment must win over an existing cookie',
);
assert.equal(
  selectVariant(new URL('https://itsdebatable.com/'), 'opinion', () => 0),
  'opinion',
  'cookie assignment must stay sticky',
);
assert.equal(
  selectVariant(new URL('https://itsdebatable.com/'), '', () => 0.32),
  'bet',
  'first third of the random split must receive the bet variant',
);
assert.equal(
  selectVariant(new URL('https://itsdebatable.com/'), '', () => 0.34),
  'opinion',
  'middle third of the random split must receive the opinion variant',
);
assert.equal(
  selectVariant(new URL('https://itsdebatable.com/'), '', () => 0.67),
  'streamers',
  'final third of the random split must receive the streamers variant',
);

const rendered = renderVariant(fixture, 'streamers');
assert.match(rendered, /og:title" content="Debatable - Strangers vs streamers"/);
assert.match(rendered, /twitter:title" content="Debatable - Strangers vs streamers"/);
assert.match(rendered, /share-title-variant" content="streamers"/);

let cookie;
const response = await handler(
  new Request('https://itsdebatable.com/?share_title=streamers'),
  {
    cookies: {
      get: () => '',
      set: (value) => { cookie = value; },
    },
    next: async () => new Response(fixture, {
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'content-length': String(fixture.length),
        etag: '"old"',
      },
    }),
  },
);

assert.equal(cookie.value, 'streamers');
assert.equal(response.headers.get('x-debatable-share-title'), 'streamers');
assert.equal(response.headers.get('content-length'), null);
assert.equal(response.headers.get('etag'), null);
assert.match(await response.text(), /Debatable - Strangers vs streamers/);

console.log('share-title edge tests passed');
