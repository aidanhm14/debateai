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
  selectVariant(new URL('https://itsdebatable.com/'), '', () => 0.49),
  'bet',
  'lower half of the random split must receive the bet variant',
);
assert.equal(
  selectVariant(new URL('https://itsdebatable.com/'), '', () => 0.5),
  'opinion',
  'upper half of the random split must receive the opinion variant',
);

const rendered = renderVariant(fixture, 'opinion');
assert.match(rendered, /og:title" content="Debatable - Everyone has an opinion"/);
assert.match(rendered, /twitter:title" content="Debatable - Everyone has an opinion"/);
assert.match(rendered, /share-title-variant" content="opinion"/);

let cookie;
const response = await handler(
  new Request('https://itsdebatable.com/?share_title=opinion'),
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

assert.equal(cookie.value, 'opinion');
assert.equal(response.headers.get('x-debatable-share-title'), 'opinion');
assert.equal(response.headers.get('content-length'), null);
assert.equal(response.headers.get('etag'), null);
assert.match(await response.text(), /Debatable - Everyone has an opinion/);

console.log('share-title edge tests passed');
