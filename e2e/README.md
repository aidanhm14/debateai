# e2e: browser smoke against production

Real Chromium, real site, no mocks. `tests/smoke.spec.mjs` runs after every
push to `main` (`.github/workflows/e2e-smoke.yml`) once the Netlify deploy is
live, and fails loudly if a promise the site makes to a stranger stops being
true: the first screen and its Debate door, the signed-out `/spar` gate with
no auto-popped chooser, `/watch` static copy, `/practice` mounting, retired
routes redirecting, `sw.js` parsing with a `CACHE_NAME`, `/api/claude`
refusing a tokenless call, the public read endpoints, and the judge season
calendar not having expired.

```bash
cd e2e && npm ci && npx playwright install chromium
npm test                       # against https://itsdebatable.com
BASE_URL=https://deploy-preview-123--debateos1.netlify.app npm test
npm run report                 # open the last HTML report
```

## Why it runs against production

The functions 500 locally without ~20 provider keys and App Check is
hard-enforced, so a local run would only test the static HTML. Every test
is read-only or stops at a gate that refuses before spending anything. No
AI round is started. `/practice` does mint one anonymous Firebase user per
run; anonymous uids are never counted as signups (soul.md section 8).

## Two things that will bite you

- **The edge filter.** `app/netlify/edge-functions/traffic-quality.js`
  answers 204 to any document request whose UA or `sec-ch-ua` says
  HeadlessChrome or Playwright. The config overrides the UA AND uses
  `channel: 'chromium'` (full build, new headless). The default headless
  shell fails every page test with `net::ERR_ABORTED`. Do not remove either.
- **`/spar` is a live queue with people in it.** Loading it signed in is
  not a read-only act. The two-person test in `spar-match.spec.mjs` skips
  itself while anyone real is waiting, and it needs two saved throwaway
  Google sessions (`npm run save-auth -- a`, then `b`). Those files live in
  `auth/`, which is gitignored because the repo is public and a storage
  state is a signed-in account.

## Adding a test

One promise per test. Assert what a visitor would see, not what the DOM
happens to contain. Prefer ids the page already owns (`#signInBtn`,
`#first-screen`, `#root`) over text, and collect `pageerror` so an uncaught
exception fails the test even when the pixels look right.
