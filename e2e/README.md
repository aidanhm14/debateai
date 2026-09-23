# e2e: browser smoke against production

Real Chromium against the live site. Page tests stub waiting-person reads
so real queue traffic cannot cover navigation controls with invitations;
the API contract checks still read the real public endpoints.
`tests/smoke.spec.mjs` runs after every
push to `main` (`.github/workflows/e2e-smoke.yml`) once the Netlify deploy is
live, and fails loudly if a promise the site makes to a stranger stops being
true: the first screen's two debate doors and top-menu Watch (including returning visitors
from the retired claim experiment), `/spar` optional topic/people choices followed by sign-in before matching, `/watch` static copy, `/practice` mounting, retired
routes redirecting, `sw.js` parsing with a `CACHE_NAME`, `/api/claude`
refusing a tokenless call, the public read endpoints, and the judge season
calendar not having expired.

```bash
npm ci --prefix app --omit=dev --ignore-scripts
cd e2e && npm ci && npx playwright install chromium
npm test                       # against https://itsdebatable.com
BASE_URL=https://deploy-preview-123--debateos1.netlify.app npm test
npm run report                 # open the last HTML report
```

Run the first command from the repository root. The offline draft tests
import server modules from `app/`, so their runtime dependencies must be
installed there as well. `--ignore-scripts` skips the unused ffmpeg download;
these tests do not need server credentials or a live database.

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

`auth-completion.spec.mjs` drives the complete shared sign-in dialog with
Firebase replaced at the SDK boundary: persistence, password retries,
anonymous-to-existing Google recovery, cleanup and destination handoff.
`conversation-completion.spec.mjs` connects the shipped finish controller and
room controls to the real server transaction engine in memory. Both people
must agree and save their final words; failed or delayed uploads cannot open
judging. `live-room-views.spec.mjs` loads the full page in its existing design
mode to check the rendered winner, scores and explanation on desktop and phone.
`practice-access.spec.mjs` renders the shipped React plan card and exercises
the admission helper for free, paid, failed-payment, paused and legacy grants.
These are isolated browser checks, not live OAuth, media transport or payment
provider integration tests. Every network request is intercepted.

`live-room-modules.spec.mjs` loads the extracted controllers directly. It
checks blocked-microphone retry, renderer audio fallback, call retry,
receive-only spectators, network recovery and departure/bfcache presence.
Devices, Daily and Firestore are controlled fixtures, not live services.

`live-room-playback.spec.mjs` renders the shipped media controller, tiles and
styles with real browser MediaStreams. It covers transient interruptions,
audience focus, phone seat order, screen sharing and explicit media removal.
Daily participant states are fixtures; this is not a live network-quality test.

`live-room-messages.spec.mjs` checks private messaging from audience and
participant side cards on phone and desktop, separate recipient drafts,
side swaps, failed sends, existing threads and signed-out controls. Firebase
and notification requests are intercepted; tests never message real accounts.

`tests/match-invitations.spec.mjs` is an offline two-person browser suite.
It uses the shipped matching code with an in-memory queue and pairing
endpoints. It covers mutual acceptance before room entry, existing matches, concurrent
page loads, acceptance retries, and Voice AI opt-outs that leave the
queue without touching real accounts.

`tests/round-draft-sync.spec.mjs` uses the shipped topic chooser and actual
server transaction logic with an in-memory store. Two browsers receive no
subscription snapshots, exercising HTTP updates, call wake-ups, catch-up
reads, and stale-message ordering without entering a live room.

One promise per test. Assert what a visitor would see, not what the DOM
happens to contain. Prefer ids the page already owns (`#signInBtn`,
`#first-screen`, `#root`) over text, and collect `pageerror` so an uncaught
exception fails the test even when the pixels look right.

## Demo videos (`demo/`)

The product walkthrough on the landing lightbox and `/how-it-works`
(`app/assets/video/how-debatable-works.mp4`) and the vertical clips for
social are recorded from the live site by `demo/record.mjs`, not by a
person with a screen recorder. Every segment is one fresh context and one
webm under `demo/out/raw/` (gitignored):

```bash
cd e2e && npm ci
node demo/cards.mjs                 # title, end card, captions (Helvetica Neue) as PNGs
node demo/record.mjs desktop        # every segment at 1920x1080
node demo/record.mjs phone          # every segment at 1080x1920
node demo/record.mjs phone landing  # one segment
node demo/probe.mjs master-desktop  # tile the in/out frame of every cut
node demo/assemble.mjs              # cut + caption + concat every output in timeline.json
```

What is real and what is staged, because the video is a public claim:

- `/` , the Match Desk on `/spar`, `/newvoice` setup, `/leaderboard` and
  `/watch` are driven for real, signed out, with the same UA and
  `channel: 'chromium'` posture as the smoke tests (the edge filter 204s
  headless clients). Analytics, presence, the live popup and the queue
  count are route-blocked so a recording never counts as a visit or pulls
  a real waiting person onto the screen.
- The room beats are the page's own `?design=` fixtures (Sam vs Jordan on
  face49 and face47, both consented stills), because a live room needs two
  signed-in humans. The clock is ticked by the recorder; the watching pill
  and the Commons rail (real people's posts) are hidden.
- The AI round is setup only. The signed-out preview mints through App
  Check, which refuses an automated browser (403, headed or headless), so
  `demo/record-ai.mjs` records the setup and stops at "Test it out".
- Captions come from `demo/cards.json`: plain words, For/Against, "the
  decision", no em-dashes. `demo/timeline.json` holds every cut; a segment
  logs `MARK` lines with its own cut times when re-recorded.

Re-record after the surfaces change; `probe.mjs` is how you check a cut
without watching the whole thing.
