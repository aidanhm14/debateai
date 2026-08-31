# AGENTS.md

> Operational manual for AI coding agents working on Debatable (Codex,
> Claude Code, Cursor, etc.). Read this first, then read [soul.md](soul.md)
> for product/voice/decision context. If a change would contradict either
> file, fix the change or fix the doc — don't leave the contradiction.

## First screen: stranger board for everyone (A/B called 2026-07-22)

The 2026-07-22 `ticker` vs `current` first-screen A/B was **called by
Aidan the same day, by fiat not by data**: the control screen (two
product cards plus the ambassador and sign-in strips) read too dense,
and the stranger board ("Debate a stranger right now.") is what a cold
visitor should see first. Everyone now gets `data-first-screen="ticker"`;
the control markup stays reachable at `?first=current` as a debug view.
The `da-first-screen2` sticky key is retired (no longer read or written),
so old control-arm visitors flip over on their next load. GA4 keeps
firing `first_screen_view` with `called:'ticker'` so the dashboard shows
the switch date. The hero surface is no longer frozen.

## What this is

Debatable is a voice-first adversarial-argument trainer at
**itsdebatable.com**. **Debatable is the only public product name.**
As of 2026-08-27, every public round is **casual 1v1**: one person on
each side, no teams, format picker, or tournament rulebook. Competitive
debate formats are not part of the site. Legacy format parsers, prompts,
and stored fields may remain dormant only to preserve old rounds and
migration compatibility. Do not expose them in setup, navigation,
marketing, metadata, or public guides. `/partners` and the old format
guide routes redirect into the casual product.
Do not put retired names in visible copy, accessibility labels,
structured-data aliases, social metadata, generated audio, or CTA copy.
Use plain actions such as "Start debating" and "Start a round."
Canonical URLs, og:url, sitemap, JSON-LD, and function site origins all
point at itsdebatable.com. The legacy
domains debateai.com, debateit.live, debatetable.com, and
debatethedevil.com stay as Netlify aliases that 301 to it (rules at
the top of both netlify.toml files); debateai.com also stays in the
CORS allowlists for the migration window — do not remove it. We still
own NEITHER debatable.com (1999 registrant, all transfer locks on)
NOR debateit.com, so never point code, docs, or copy at those two.
~7K monthly active users as of May 2026. Solo-built. Ships to
production many times per day.

The full product/voice/decisions doc is [soul.md](soul.md). Read it.

## Where things live

```
/                              repo root (Netlify publishes from /app)
├── soul.md                    product north star — read first
├── AGENTS.md                  this file
├── CLAUDE.md                  imports this file (Claude Code entry point)
├── app/
│   ├── practice.html          5500+ lines. Single-file React-via-CDN.
│   │                            EDIT SURGICALLY. NEVER rewrite. NEVER
│   │                            add JSX — uses `el(tag, props, ...kids)`
│   │                            aliased to React.createElement.
│   ├── landing.html           ~2700 lines, marketing entry. Same rules.
│   ├── live.html              live tournament rooms (Daily.co video)
│   ├── spar.html              live-human sparring matchmaking + AI fallback
│   ├── partners.html         retired 2v2 compatibility page. Public
│   │                            routing sends /partners to /spar.
│   ├── tournament.html       one tournament: register, draw, tab,
│   │                            bracket, plus a host-only control room.
│   │                            /tournaments (plural) is the separate
│   │                            public spectator lobby. Don't merge them.
│   ├── voice-debate.html      live voice debate via OpenAI Realtime
│   │                            (WebRTC, server-side VAD = interruption,
│   │                             5 modes, post-session RFD)
│   ├── learn.html, leaderboard.html, pricing.html, schools.html, etc.
│   ├── js/                    small standalone client modules
│   │                            (track.js, usage-banner.js, topbar.js,
│   │                             upgrade-cta.js, voice-guidelines.js — stub,
│   │                             type-stream.js, ui-neural.js, ...)
│   ├── netlify/
│   │   ├── netlify.toml
│   │   └── functions/
│   │       ├── claude.mjs, openai-chat.mjs, gemini.mjs, grok.mjs
│   │       │     AI brain proxies. Each prepends the right server-side
│   │       │     voice block resolved from `_voiceFeature` in the body.
│   │       ├── tts.mjs
│   │       │     TTS proxy. Routes to ElevenLabs (Pro default), Inworld
│   │       │     + Cartesia (Pro opt-in), or OpenAI gpt-4o-mini-tts with
│   │       │     per-persona `instructions` (free + fallback).
│   │       ├── realtime-session.mjs
│   │       │     OpenAI Realtime (gpt-realtime-2.1 default, falls back to
│   │       │     gpt-realtime) ephemeral-token minter for /voice-debate,
│   │       │     /newvoice (the landing's primary voice CTA), and the
│   │       │     coach/room-judge minters share the same model try-list.
│   │       │     App-Check gated, rate-limited (6/hour/IP). Browser
│   │       │     does direct WebRTC to OpenAI; server is never in the
│   │       │     audio path. See "OpenAI Realtime API reference"
│   │       │     section below for the canonical endpoint shapes.
│   │       │     Models/effort overridable via env: OPENAI_REALTIME_MODEL
│   │       │     (e.g. gpt-realtime-2.1-mini for cost), OPENAI_REALTIME_
│   │       │     TRANSCRIBE_MODEL, OPENAI_REALTIME_REASONING_EFFORT.
│   │       ├── lib/
│   │       │   ├── voice-guidelines.mjs   THE voice bank. Server-side so
│   │       │   │                            view-source can't scrape it.
│   │       │   ├── tts-humanize.mjs       strips stage directions, picks
│   │       │   │                            intensity, normalizes pauses.
│   │       │   └── appcheck.mjs           Firebase App Check verification.
│   │       ├── round-draft.mjs + lib/motion-draft.mjs + lib/draft-motions.mjs
│       │     The pre-round MOTION DRAFT, in the ROOM. Casual rounds use
│       │     five motions and two blind strikes each; a tournament may
│       │     stamp its own server-side pool and counts. A coin flip splits
│       │     the motion call from the side call. motion-draft.mjs is PURE and
│       │     owns every decision; round-draft runs it over the round
│       │     doc, spar-pair only STAMPS which pairs are eligible.
│       │     See the "Motion draft" section below before touching it.
│       ├── partner-match.mjs, duo-pair.mjs
│       │     2v2 matchmaking. partner-match forms the duo (invite code
│       │     or pool handshake); duo-pair matches two duos into one
│       │     four-seat room. The duo queue doc is keyed by TEAM, not
│       │     user — that is what keeps a 2v2 pairing a two-document
│       │     transaction instead of a four-way write that can strand
│       │     one person in a room their partner never entered.
│       ├── tournament.mjs, tournament-admin.mjs, lib/tournament.mjs
│       │     The tab. lib/tournament.mjs is PURE and deterministic
│       │     (seeded, so any draw can be reproduced during a dispute)
│       │     and pairs GLOBALLY over the ranked field, never per
│       │     win-bracket — see the 2026-07-28 decision log for why the
│       │     per-bracket version produced rematches. Change it only
│       │     with scripts/test-tournament-pairing.mjs passing.
│       ├── stripe-webhook.mjs, create-checkout.mjs,
│   │       │   billing-portal.mjs, cancel-subscription.mjs
│   │       └── admin-*, team-*, log-*, scheduled-* (analytics + ops)
│   ├── package.json           Vite dev server (rarely needed for HTML edits)
│   ├── netlify.toml           MUST stay in sync with /netlify.toml at root
│   └── sw.js                  bump CACHE_NAME with /sw.js when HTML changes
├── css/, app/css/             mirror each other
└── sw.js                      bump CACHE_NAME with app/sw.js together
```

## First-time setup (per clone)

```bash
# Install the SW auto-bump pre-commit hook. Touches a client file
# (HTML/JS/CSS under app/, excluding netlify/functions/)? The hook
# bumps CACHE_NAME in both sw.js files and re-stages them for you.
# One-off; idempotent if re-run.
bash scripts/install-hooks.sh
```

There are two hooks now. `scripts/hooks/pre-commit` bumps the cache;
`scripts/hooks/pre-push` refuses to push client changes that are still
sitting on the previous `CACHE_NAME`. That second one exists because
the bump is reliably lost to rebases: when `origin/main` has already
bumped to the same version, the rebase sees an identical hunk and drops
`sw.js` from your commit, so the push ships new HTML under a cache name
users already hold. It happened nine times on 2026-07-22 alone and was
caught by hand every time. The pre-push hook also blocks a 0-byte
`sw.js`, which reached production twice. Both are installed by
`scripts/install-hooks.sh`; re-run it once to pick up the new hook.

The canonical hooks live at `scripts/hooks/` so they travel
with the repo. The installer copies it into `.git/hooks/`. The hook
also runs `scripts/precompile-inline-babel.mjs` against any staged
HTML files containing `<script data-precompile="es5">` blocks before
the SW bump (see below). If you ever need to skip the auto-bump
intentionally (e.g., docs-only commit that somehow touched a client
file), stage `app/sw.js` or `sw.js` yourself in the same commit — the
hook trusts manual SW edits and won't double-bump.

The hook also runs `scripts/check-prices.mjs`, a **canonical-price
guard** that HARD-BLOCKS a commit staging an off-canonical price string
in a user-facing `.html` (superseded tiers like `$5/mo` / `$20/year` /
`$14.99`, or any `$N once` — the Lifetime tier was removed 2026-07-03).
Canonical is Free $0 / BYOK $1/mo / Individual $10/year / Team $50/year.
It exists because pricing drifts constantly here and outside agents have
tried to "correct" prices *backwards* to stale values. If it blocks you,
fix the price — don't `--no-verify`. Intentional *historical* price
prose belongs in `report.html` or a `.md` file (both excluded from the
scan).

It also runs `scripts/check-function-imports.mjs`, a **function-import
guard** that HARD-BLOCKS a commit staging a `.mjs` under
`app/netlify/functions/` that imports a name a sibling `./lib/*.mjs`
does not export, or imports a lib module that doesn't exist. The
recurring case is `import { json } from './lib/response.mjs'` — the
real exports are `corsResponse`, `jsonResponse`, `errorResponse`.
Seven functions shipped that exact typo across four commits on
2026-07-31. It matters more than a normal typo because it fails at
Netlify "Functions bundling" with exit code 2, which blocks **every**
deploy, not just the broken function; the site then serves a stale
build while unrelated commits queue behind it. Static parse, no npm
deps, ~80ms on the whole tree. Scan the whole deployed tree by hand
with `node scripts/check-function-imports.mjs --all`.

## The debate brain (/brain, per signed-in user)

Six questions on `/brain` (the arcade-flow engine) become the identity
the AI argues against. Storage and prompt injection:

```
app/brain.html                      the six-step build, red arcade surface
lib/brain-schema.mjs                PURE: field allow-list, sanitize, block text
lib/brain.mjs                       read/write user_profiles/{uid}.brain, applyBrain
brain.mjs                           GET/POST /api/brain (named accounts only)
scripts/test-brain.mjs              runs in the pre-commit hook
```

Four things that are easy to break by accident:

- **Values are ALLOW-LISTED, never sanitised strings.** Everything stored
  is concatenated into the system prompt of every future round that user
  runs, so a free-text field would be a persistent prompt-injection
  channel with a per-user blast radius. Unknown ids are DROPPED, not
  defaulted, because a default asserts something the user never chose.
- **The AI judge must never see the block.** `BRAIN_FEATURES` gates it to
  debate-generation features only. A ballot that knows one debater is a
  beginner, or is working on rebuttal, is a ballot with a thumb on the
  scale, and the judge charter forbids exactly that. The test asserts it.
- **The block carries two hard limits and they are load-bearing.** A model
  told "new to competitive debate" with no ceiling starts conceding, which
  turns the one thing this product sells into a yes-man. The prompt says
  do NOT go easier and do NOT decide substance from it; the test asserts
  both strings survive.
- **Anonymous accounts are not stored.** They are free and unlimited to
  mint (see the 2026-07-28 rate-limit entry), so `/api/brain` requires a
  named provider. Guests keep the brain in localStorage; it uploads on
  their first real sign-in.

Adding a step means editing three places: the step in `brain.html`, its
field in `brain-schema.mjs`, and its `da-brain-*` key in `SYNCED_KEYS`
(`js/prefs-sync.js`). Miss the third and that one answer never leaves the
device it was set on.

## Inline React scripts: `<script data-precompile="es5">`

Six pages (`index.html`, `practice.html`, `voice-debate.html`,
`learn.html`, `high-school.html`, `exhibition.html`) ship inline
React-via-CDN blocks (index.html alone is 14k+ lines). We
used to load `babel-standalone` in the browser to transpile that block
at runtime — which cost **~1GB of heap per tab** because Babel-standalone
builds a full AST of every inline script it processes.

Now we precompile at commit time:

- The inline script tag is `<script data-precompile="es5">…</script>`
  (no `type="text/babel"`, no babel-standalone CDN tag).
- The pre-commit hook runs `scripts/precompile-inline-babel.mjs`, which
  uses `@babel/plugin-transform-block-scoping` to convert `const`/`let`
  → `var`. This is the **only** transform — everything else stays
  modern. The conversion matches the loose hoisting semantics
  babel-standalone gave us at runtime, so existing forward-reference
  patterns (useEffect deps referencing a useCallback declared later,
  etc.) still work.
- After precompile, the inline JS is all `var`. Surgical edits still
  work; if you add a new `const`/`let`, the next commit retranspiles.
- The hook is idempotent — running on already-`var` output is a no-op.

If you ever need to run it manually:

```bash
node scripts/precompile-inline-babel.mjs                  # all six
node scripts/precompile-inline-babel.mjs app/index.html   # one file
```

Requires `npm install` in `app/` (Babel + esbuild ride as devDeps).
The runtime ships zero of this; it's all build-time.

## How to run / ship

```bash
# Dev (rare — most edits are HTML, just refresh the browser)
cd app && npm install && npm run dev

# Functions locally
cd app && npx netlify dev

# Ship to prod — do NOT blind-push the local tree; see "Deploy topology" below.
```

**Auto-deploy norm:** small commits ship straight to `main` (via the
worktree flow below). Don't ask permission to deploy on this repo. Verify
locally first; ship in batches of ~10 minutes of work, not big PRs.

## Deploy topology & safe-ship (READ THIS BEFORE YOU PUSH)

The one thing that bites every agent handed this repo. Get it right.

- **Git root is `/Users/aidanhm`** (not `app/`). The site lives at `app/*`.
- **Netlify deploys `origin/main`** (publish dir `app/`). What is on
  `origin/main` is what is live; pushing to `main` auto-builds in ~30s.
- **The local checkout is almost always STALE / diverged from
  `origin/main`** — it carries unpushed experiments and uncommitted edits
  (e.g. on 2026-06-25 local `main` was ~69 commits behind `origin/main`).
  So `git push origin HEAD:main` from the local tree **fails
  (non-fast-forward) or ships a stale tree.** Never `pull` / `reset` /
  `checkout` over the local `app/` either — it holds uncommitted work.
- **Safe ship = apply your change onto `origin/main` in a throwaway
  worktree, then push:**

```bash
cd /Users/aidanhm && git fetch origin
git worktree add -b ship/<slug> /tmp/ship-<slug> origin/main
# Re-apply your edit IN the worktree (its line numbers differ from local).
# For a NEW file, cp it in: cp app/<f> /tmp/ship-<slug>/app/<f>
cd /tmp/ship-<slug> && git add <files> && git commit -m "..."   # hook bumps SW cache
git fetch origin && git rev-list --left-right --count origin/main...HEAD   # expect "0	1"
git push origin HEAD:main          # clean fast-forward → Netlify builds
cd /Users/aidanhm && git worktree remove /tmp/ship-<slug> --force
```

- Editing + previewing in the local checkout is fine; it is only unsafe
  to *push from*. Preview by serving `app/` (a static server) and loading
  the page.
- **Never `--no-verify`** — the pre-commit hook bumps `CACHE_NAME` in both
  `sw.js` files and runs the inline-Babel precompile.

## Hard rules (see soul.md §4 for the full list)

- **The audience is ANYONE, so don't call the crowd "debaters"** (Aidan,
  2026-08-12; soul.md §2 rewritten to match). Say people. "Debater" is
  fine where it names a role inside a round ("either side can appeal")
  and in the founder's credential, which is a bio fact. **The credential
  carve-out was retired 2026-08-22 when the founder went anonymous: no
  name, no school, no title, no year, no photo on any public surface.
  See the soul.md decision log; do not restore it from a stale doc.** It is not fine
  in copy that tells a stranger who the site is for. The landing and
  `topbar.js` were swept; the rest of the site has NOT been. Don't
  "restore" the old framing from a stale doc.
- **First-screen rounds board faces: consented stills only** (updated
  2026-08-18). The 2026-08-12 "no faces should be circulating here"
  rule was partially reversed by Aidan himself: he supplied a batch of
  real webcam stills (face46-49 and face51-55, plus the face50 Anonymous
  avatar) and
  confirmed on record that everyone shown is 18+ and consented to
  appearing as example-round debaters. Those, and the pre-existing
  stock bank, may ride ROUNDS entries. The underlying bar is unchanged
  and absolute: never put an unlicensed photo of a real person on any
  surface; the creator-watchlist portraits are CC or public domain with
  attribution in `app/img/creator-watchlist/README.md`, and that is the
  bar. New board faces require the same explicit consent + 18+
  confirmation from Aidan before they ship.
  **2026-08-19:** Aidan asked for the real stills to circulate more, so
  they now also ride the shared `.rot-cam` pool (`window.__faceRotPool`)
  that drives the live-debates wall and the `#face-wall` mosaic, at five
  copies each against the generated bank's one. `face50` stays out of that
  pool: it is the illustrated Anonymous avatar, cast by hand on one motion.
  The batch is 8 men and 1 woman, so any push for more real faces on these
  surfaces tilts the cast male until more consented stills exist.
  Note that `#live-now` and `#face-wall` are the pool's only consumers and
  BOTH are `display:none` on the shipped hero arm, so the pool change is
  latent. The first-screen ROUNDS board is the one face surface a visitor
  actually sees; re-cast that if you want a visible change.
  **2026-08-22: the ROUNDS board is REAL STILLS ONLY** (Aidan: the
  generated faces "look ai"). Every seat in all 34 entries is one of the
  eight consented people plus the Anonymous avatar on its one motion;
  the generated bank is dormant in castFaces, not deleted. The visible
  cast is therefore all male until a new consented batch exists; do not
  fix that by reintroducing generated faces.
  **2026-08-25: the LEADERBOARD RAIL's stand-in pictures are the supplied
  photo batch, and that is a standing instruction.** Aidan, on the drawn
  set that replaced them: "bring back the real photos - never reverse
  this". `app/img/pfp/*` are cropped from phone screenshots of profile
  pictures from another app; the first-screen rail (`#lbRail`) draws them
  and nothing else. This overrides the "consented stills only" rule ABOVE
  for that one surface, knowingly and at his direction, so do not revert
  it on the strength of the paragraphs above it. Three things bound it and
  they are not his to waive on somebody else's behalf, so leave them
  alone: (1) the eleventh image in the batch is a photograph of a CHILD
  and is not in the repository, and must not be added if the batch is ever
  re-cropped; (2) the photos are the stand-in tier only, never offered in
  the avatar picker, so no account can come to be identified by a
  stranger's photograph (`DBPfp.canWear` is what enforces that, and the
  sanitiser in `avatar.js` calls it rather than `has`); (3) a real
  account's own avatar or photo still outranks them everywhere. The
  ROUNDS board above is a DIFFERENT surface and is unchanged: it still
  runs consented stills only, because those seats carry names and results
  and these tiles do not.
- **Social app, not ed-tech (2026-08-16).** JSON-LD applicationCategory is SocialNetworkingApplication, manifest is social/entertainment, copy leads with people-vs-people. Don't reintroduce Education* categories or prep/training-first framing on product surfaces. Counter (extension) is the one sanctioned education surface.
- **Live video is Google-only, with no anonymous preview** (2026-08-27).
  `/spar`, `spar-pair.mjs`, `matchmaking_queue` create rules, and the
  background "Spar live" pill must agree. Email/password remains a real
  account everywhere else, and anonymous AI rounds are unchanged. The
  signed-out `/spar` gate shows the REAL waiting count from
  `/api/spar-queue` and hides its pill at zero (2026-08-31, founder:
  "make them real numbers" — the earlier founder-called 12 floor is
  retired; do not restore a floor or pad on any public count). Its
  surrounding cast is the eight consented real stills plus the seven
  `fictional-*.jpg` screenshots named Sydney, Sofia, Kevin, Anna, Malik,
  Chloe, and Mike, which Aidan supplied and confirmed are fake on 2026-08-27.
  Those seven are atmosphere for this gate, not records of real rounds and
  not additions to the ROUNDS board cast.
- **No em-dashes in user-facing copy.** Periods, commas, semicolons only.
- **No abortion or highly triggering motions.** This is a site-wide content
  boundary, not a content-warning preference. Hardcoded banks, AI-picked
  motions, examples, public challenge forms, scheduled rounds, and custom
  motion endpoints must refuse abortion and reproductive-policy debates;
  sexual or domestic violence; suicide or self-harm; child abuse; torture,
  school or mass shootings, and other graphic violence; capital punishment
  or assisted dying; genocide or ethnic cleansing. Replace the motion with a
  safer civic, technology, culture, economics, or everyday-life clash. Do not
  solve this by adding a warning or an opt-out after the topic is shown.
- **Banned phrases** (these rot the brand): "Free during beta", "no
  sign-up required", "unlimited" on Free, "Pay nothing", "holistic",
  "robust framework", "let's dive in", "let's unpack", "let's break
  it down", "let me break this down", "let me explain", "hear me
  out", "stay with me", "bear with me", "in today's world", "ladies
  and gentlemen", "I'm here to argue", "at the end of the day",
  "it's important to note".
- **No-preface rule.** Never announce what you're about to say — say
  it. "Three reasons they're wrong, let's break it down" → just
  "Three reasons they're wrong. One: ... Two: ... Three: ..." The
  numbers ARE the structure; the preface is dead weight. Same for
  "Here's why this fails" → cut "Here's why," start with the reason.
- **BYOK is Anthropic-only.** Don't add OpenAI/Gemini BYOK. Cross-provider
  BYOK attempts must throw a labeled error.
- **APDA never goes in the Topics Hub.** It's impromptu — no rolling
  motion. Routes to the Motions tab.
- **No JSX** in `practice.html` or `landing.html`. React-via-CDN means
  `el(tag, props, ...children)`. JSX in those files breaks the runtime.
- **Bump `CACHE_NAME` in BOTH `sw.js` files** when HTML/bundle changes. The `scripts/hooks/pre-commit` hook (installed via `bash scripts/install-hooks.sh`) does this automatically on every commit that touches client-side files. Only relevant if you skipped the hook install — in which case bump manually.
- **Never precache `/` in the service worker** — it broke root routing.
- **Never skip git hooks** (`--no-verify`).
- **Pricing is locked** and **consumer billing is LIVE as of 2026-08-26** (`BETA_NO_CHARGE=false`, `BETA_PRO_UNLOCK=false`): Free $0, BYOK $1/mo, Individual $10/year, **Voice $12/mo**, Tokens $4.99/mo, Team $50/year, **Program $550/season**. Real cards are charged on every one of those except Free, so any copy claiming the product is free during beta is now a false claim, not stale wording. **A school roster is always the $550 season license, never a seat plan** — do not quote Team to a coach. Changing a price is three edits that land together: `lib/plans.mjs`, a NEW Stripe price object (never edit one in place), and the env var; `scripts/test-plans.mjs` and `scripts/check-prices.mjs` both run in the hook. **A new paid tier is not shipped until it is in `VOICE_PRO_PLANS` / `PAID_PLANS` / `requirePaidPlan` too** — Voice was advertised on /pricing for months while no gate had heard of it, so buying it granted nothing. (Lifetime was removed from pricing displays 2026-07-03; the backend entitlement stays. See soul.md §7 + decision log.)

## Motion draft (in the ROOM, pre-round)

The default is five motions with two BLIND strikes per side. A tournament
room may carry a server-stamped draft profile instead. The Debatable Open
draws three motions from its published pool of twenty and gives each side
one blind strike. The strikes reveal together, and a coin flip splits what
is left: one debater calls the motion (when more than one survived), the
other calls their side.

**It runs in /live-round, not on the /spar queue** (moved 2026-08-26, the
same day it shipped on the queue). It was gated on `draftOptIn` being on
BOTH queue docs and only /spar set it, so any pair including a background
"Spar live" peer or a /debate-chat peer silently ran on an unvetoed
motion. Every one of those surfaces lands in the room, so the room is
where the beat belongs.

```
lib/motion-draft.mjs      PURE: slate, coin flip, phase machine, resolution,
                            and publicDraft() — the blindness projection
lib/draft-motions.mjs     GENERATED pool. Regenerate, never hand-edit:
                            node scripts/gen-draft-motions.mjs
round-draft.mjs           POST /api/round-draft. Owns the state, in a
                            transaction over round_drafts/{room}
spar-pair.mjs             STAMPS eligibility only (round_drafts/{room}).
                            Still runs the AI-opponent draft for /spar solo
live-round.html           the board (search "MOTION DRAFT")
scripts/test-round-draft.mjs    runs in the pre-commit hook
scripts/test-motion-draft.mjs   runs in the pre-commit hook
```

Things that are easy to break by accident:

- **Survivors is not always one.** Two strikes each from five, blind, can
  OVERLAP, so the casual profile leaves 1, 2 or 3. One strike each from
  three leaves 1 or 2. Overlap happens often, so the motion-pick beat is a
  normal path, not an edge case. Any copy or layout you add has to read
  right for every server-stamped profile and survivor count.
- **`publicDraft()` IS the blindness. Treat it as security, not
  formatting.** Two queue docs used to give it away for free: each side
  could only hold its own strikes. One shared round doc has no field-level
  read rule, so the full draft lives in `round_drafts/{room}` (unlisted, so
  the rules' default deny covers it) and the round doc gets a REDACTED
  projection: during the strike beat, WHO has committed and never WHAT they
  struck. Leak a strike there and whoever strikes second reads the other's
  picks in devtools, which is the whole draft.
- **Never auto-fill the PEER's strikes.** A short set from the person who
  is actually here gets filled from the seed; a missing set from the person
  who is not gets no help at all, and the pair unwinds through the existing
  ghost path. Striking for an absent debater is how a room opens onto an
  empty chair, which is the 411-round finding. The pick beats are the
  opposite on purpose: both sides have proven presence by then, so either
  may expire the clock and the round survives a slow click.
- **Timeout resolution is seeded, never random at call time.** Both clients
  and the server derive it independently, so a `Math.random()` here lands
  two browsers on two different motions.
- **Eligibility and configuration are STAMPED by the server, never claimed
  by a client.** `spar-pair` writes `round_drafts/{room}` for every casual
  pair it makes. Tournament pairing writes the same eligibility stamp plus
  its public pool and three/one counts. `round-draft` refuses to open
  without that stamp and ignores client-supplied configuration. Clients
  cannot write there, so neither eligibility nor the tournament pool can be
  forged. Do NOT re-key this on a per-surface opt-in: that is the bug the
  move fixed.

- **Nothing may start a speech while a draft is pending.**
  `startSpeechTimer` refuses, ahead of the judge lock. Otherwise the round
  opens on a motion the strikes are about to overrule and both sides get
  rewritten mid-speech.
- **Never put visibility in the board's entrance animation.**
  `anim-governor.js` ships animations PAUSED on /live-round, so a keyframe
  carrying `opacity` with `fill-mode: both` freezes the cards at 0 forever:
  five motions in the DOM, nothing on screen, on the beat the round cannot
  continue without. Measured, not theoretical. Same page defines only
  `--bg`, `--text`, `--accent`; `--panel` and `--surface` do NOT exist here
  and fell back to a white card with white text in dark mode.

`?draftdemo=1` on /spar renders the old queue board against a synthetic pair
with every POST short-circuited (`&overlap=0` forces the clean split,
`&role=side` holds the side call). It still covers the beats and the copy.
The draft is a sequence of timed beats, so verify it in a browser: reading
the diff tells you nothing about the feel, and it hid two real defects.

## The AI judge integrity layer (READ BEFORE TOUCHING JUDGING)

The judge is the one component where a quiet change is a legal problem
rather than a bug, because credits, standing, and reputation settle off
its verdicts. Five promises are published at `/judge-integrity` and
served from `/api/judge/charter`, and `scripts/test-judge-integrity.mjs`
runs in the **pre-commit hook** and will block a commit that breaks any
of them. Do not work around it.

```
lib/judge-charter.mjs   the constitution: season calendar (pins rubric +
                          models per window), the published rubric, the
                          rubric hash, fee policy, appeal policy. PURE.
lib/judge-panel.mjs     ensemble maths: tally, medians, Fleiss' kappa,
                          reliability rollup. PURE.
lib/judge-jurors.mjs    provider dispatch (anthropic / openai / google).
lib/judge-audit.mjs     the immutable judge_audit record.
lib/judge-appeals.mjs   appeal eligibility + revision shapes. PURE.
judge-charter.mjs       GET /api/judge/charter      (public, keyless)
judge-reliability.mjs   GET /api/judge/reliability  (public, keyless)
judge-appeal.mjs        POST /api/judge/appeal      (debaters)
admin-appeals.mjs       /api/admin/appeals          (human reviewer)
```

The rules that are easy to break by accident:

- **Never edit a rubric version in place.** `RUBRICS` entries are
  immutable once a season referencing them has judged rounds. Changing
  the criteria means: add a new rubric version, add a new season pinning
  it, leave the old entries alone. The hash exists to make an in-place
  edit detectable, so an in-place edit is the one thing it catches.
- **Never tie-break an even panel split.** `tallyPanel` returns
  `winner: null` and `resolution:'unresolved'` on a tie, and every
  downstream caller must leave it that way. Any tie-break rule is a
  thumb on the scale and it is ours. **No winner is reserved for a
  complete tied panel.** A short panel, including a 1-1 vote with one
  missing judge, stays pending and retries; provider failure is not a
  result. A true no-winner voids its market, preserves both argument
  scores, and enters the ladder as a Glicko draw so both rating records
  still update without manufacturing a winner.
- **Never route an appeal to a model.** `admin-appeals.mjs` must contain
  no provider call and no `schedule` config. The test asserts both. A
  bigger model re-judging the round is the same circularity, and an
  auto-resolving cron is house control wearing a job scheduler.
- **Never add a rake, fee, or house account** to `credits.mjs` or
  `settle.mjs`. The operator's take cannot depend on who wins.
- **Money settles only on `verdictSource:'server'`** (`MONEY_VERDICT_SOURCES`
  in settle.mjs). Live-round ballots are written by a participant's own
  browser, so they cannot settle credits until that moves server-side.
  This is deliberate; do not "fix" it by widening the set.
- **The season calendar must stay contiguous** (each `from` equals the
  previous `to`, first starts at 0). A gap means a round judged under no
  declared configuration. Extend the calendar before the last `to`
  passes; the charter reports `calendarExpired` when it has.
- Panel degradation is fine and disclosed (stamped on the audit row,
  surfaced by the charter). Silent degradation is not. `JUDGE_PANEL_ENABLED=0`
  and `JUDGE_REQUIRE_PANEL=1` are the two env switches.
- **A streamed response must never go silent, or the edge kills it and you
  get a 200 with no ballot in it.** Measured 2026-08-12 from a real user
  report: a reasoning model opens a thinking block and sends nothing for
  seconds, and the proxied stream died at 13.6s with 639 bytes and no
  `message_stop`, while the identical request straight to Anthropic
  finished at 22.4s (Anthropic sends its own `ping` at 9s for exactly this
  reason). `claude.mjs` now emits a `: keepalive` SSE comment after 4s of
  silence, **only at an event boundary** since a comment spliced into a
  half-delivered event corrupts it. Do not remove it, and if you add a new
  streaming proxy, give it the same heartbeat. A client that receives a
  truncated stream must report it as a dropped connection, never as
  malformed output: `/judge` told a user to trim a five-line transcript
  for an hour because of that mislabel.
- **Reasoning models bill thinking against `max_tokens`, and a cap tuned
  before they existed reads as a parse bug forever.** This is not
  hypothetical: the panel's Anthropic seat was capped at 900 tokens, spent
  all of it reasoning on a real three-speech round, returned no closing
  brace, and recorded as a missing vote on every ballot. `BALLOT_MAX_TOKENS`
  in async-sweep is 3000 for that reason. Raise it, don't trim the prompt.
- **Verify a model id against the live provider before pinning it.** A pin
  is a published promise about what judged someone's round, so a seat
  nobody has actually run is a promise nobody has kept. `gpt-5.x` rejects
  `max_tokens` outright and needs `max_completion_tokens`; effort levels
  differ per family. Run the ballot prompt through the candidate first.
- **Effort is part of the pin, not a tuning knob.** It changes how a
  ballot is reached, so it lives in the season next to the model id and
  is stamped on the audit row. An undisclosed effort is the same quiet
  dial as an undisclosed model.

## Brain fleet health (/api/brain-health)

Six brains are advertised on `/judge`, `/pricing` and the landing. On
2026-08-11 **three of them were dead at once** and nothing reported it:
Gemini's billing was exhausted, the xAI key was invalid, and
`OPENROUTER_API_KEY` had never been set on Netlify. A signed-in user
picking Grok got an error after pasting a whole transcript.

```
lib/brain-health.mjs   PURE: the roster, the failure classifier, the
                         public redaction. Testable, no I/O.
brain-health.mjs       GET /api/brain-health (public, keyless)
scripts/test-brain-health.mjs   runs in the pre-commit hook
```

- **The roster must match `brains` in `js/judge-options.js` exactly.** A
  brain probed but not offered reports health for something nobody can
  select; one offered but not probed is the failure this exists to
  catch. The test asserts both directions.
- **The provider's raw error is never public.** "Your prepayment credits
  are depleted" names an account's billing state, so the public payload
  carries a reason CATEGORY and the raw text is added only for an
  authenticated admin. The test asserts the redaction and that it does
  not mutate the admin copy.
- **Classify on the body before the status.** Providers overload codes:
  xAI returns 400 for a bad key, Google returns 429 for exhausted
  prepaid credit rather than for rate. Reading status first sends
  whoever is on call to the wrong console.
- **No cron.** It probes lazily when a request finds the 15-minute cache
  cold, which is the 2026-05-18 credit-audit posture. Only an admin can
  force a re-probe, or any visitor could spend provider calls with a
  query parameter.
- **READ `generatedAt` BEFORE BELIEVING A READING.** The cache is shared
  and survives a deploy, so a fetch can be up to 15 minutes stale and
  looks identical to a live probe. On 2026-08-12 an agent reported two
  brains DOWN three times in a row off the same aged row, hours after
  they had actually been fixed. A probe is only evidence of right now if
  its age is near zero; otherwise say how old it is or wait for the TTL
  to lapse. **And a deploy does NOT reset it** — the cache is not
  per-isolate, which is the assumption that made the stale row look
  fresh.

## Voice rules for AI debater outputs

The voice bank lives **server-side** in
`app/netlify/functions/lib/voice-guidelines.mjs`. The client
`app/js/voice-guidelines.js` is an empty stub by design. Don't try to
edit voice from the client.

When editing format-specific voice (Policy spreads, PF citations, LD
framework, BP whip, APDA impromptu, Worlds POIs, Asian Parli, Congress,
MUN, Karl Popper, plus the Career trio: courtroom, negotiation, pitch
defense), **read the relevant format block first.** Don't generalize across
formats — formats genuinely differ on evidence rules, structure, and
register.

**Brand voice for AI debaters:** don't pretentiously name-drop
philosophers (Rawls, Kant, Mill, etc.) unless the motion actually calls
for ethical philosophy. Default register is "varsity debater on the
circuit," not "philosophy seminar."

## Debate case editorial standard

Case generation has one shared standard in
`app/netlify/functions/lib/prompts.mjs`, applied to `caseBase`,
`motionDesigner`, and both case-edit prompts. The live `/practice` engine
carries the same rules in `app/practice.html` and `CASE_CONSTRUCTION` in
`app/netlify/functions/lib/voice-guidelines.mjs`. Keep these distinctions
intact:

- **Fair architecture, committed advocacy.** Before writing for one side,
  the model must be able to identify at least two intuitive ballot paths for
  each side with comparable burdens. Then it writes the requested side with
  conviction. Fairness is not both-sides prose, and advocacy is not permission
  to rig definitions, caveats, or framework.
- **Never silently rewrite the motion.** Ordinary clarification is fine. A
  tight or incoherent motion is flagged in the Vulnerability Report with one
  explicitly labeled fairer version. It is never replaced inside the
  resolution or caveats without saying so.
- **Earn audience attention.** The opening makes the actor, decision, human
  consequence, and genuine disagreement legible to a cold listener. One
  editorial thesis holds the case together. Relevance beats recency, and
  significance beats novelty.
- **Run a fact desk, not a specificity quota.** Never require a recent event,
  exact number, thinker, or citation per argument. Use a named example only
  when it is real, accessible in the format, and probative. Never invent a
  person or anecdote to manufacture stakes.
- **Human voice comes from the warrant.** No prefab zingers, forced jokes,
  fake outrage, or identical rhetorical templates. Memorable lines summarize
  analysis already earned.

`scripts/test-case-editorial.mjs` runs in the pre-commit hook and blocks the
old rigged-framework, mandatory-name-drop, and killer-line instructions from
returning.

## TTS pipeline

16 personas, same keys across all providers:
Professor, Closer, Surgeon, Veteran, Firebrand, Diplomat, Debater,
Philosopher, Prosecutor, Storyteller, Statesman, Barrister, Upstart,
Heckler, Disruptor, Tactician.

| Tier | Provider | Model | Notes |
|---|---|---|---|
| Free + fallback | OpenAI | `gpt-4o-mini-tts` | Per-persona `instructions` steering. Env override `OPENAI_TTS_MODEL=tts-1` rolls back without redeploy. |
| Pro default | ElevenLabs | `eleven_turbo_v2_5` | Streaming, intensity-aware. |
| Pro opt-in | Inworld | `inworld-tts-1.5-max` | Sub-200ms. |
| Pro opt-in (A/B) | Cartesia | `sonic-2` | Faster/cheaper, flatter. |

Client passes `voice` (persona key), `intensity` (0-1), `premium`, and
optionally `provider` to `/api/tts`. `tts.mjs` handles routing and
provider-fallback.

## Page narration (retired 2026-08-12)

The sitewide "Listen" pill is retired. `topbar.js`, standalone pages, and
server-rendered pages must not load `app/js/read-aloud.js`. The old player,
builder, manifest, and narration files remain in the repository as dormant
history; do not wire them back into a user-facing page without an explicit
product decision.

## Editing playbook for the big single-file pages

`practice.html` and `landing.html` are huge single-file React apps.

- **Always use targeted Edit** with enough surrounding context to be
  unique. Never overwrite the whole file with Write.
- Navigate by section comments (`/* ── AI VOICES ─── */`, etc.).
- State is `useState`; `el(tag, props, ...children)` is the
  createElement alias; styles are inline objects.
- New section: mirror the existing pattern — small comment header, then
  `el(...)` tree.

## Mirrors that must stay in sync

These pairs duplicate intentionally; if you edit one, edit the other:
- `/sw.js` ↔ `/app/sw.js`
- `/netlify.toml` ↔ `/app/netlify.toml`
- `/css/` ↔ `/app/css/`

**Netlify functions are NOT mirrored. There is exactly one copy:
`app/netlify/functions/`.** The Netlify base directory is `app/`, so
`app/netlify.toml` is the active config and its `functions =
"netlify/functions"` resolves to `app/netlify/functions`. A second copy
used to sit at the repo root; it was never deployed, and by the time it
was deleted (2026-07-23) five of its 34 files had silently drifted from
their live twins because this list told people to edit both. If you find
a `netlify/functions/` directory at the repo root again, it is dead
weight, not a mirror.

## The graveyard (`graveyard/`)

Cut work that might come back. One markdown file per removed thing, holding the
exact markup and CSS plus restore notes; `graveyard/README.md` is the index and
the format. Nothing there is served (Netlify publishes `app/`).

Use it when a block comes out for taste or timing and the founder could ask for
it back. Git history holds every deletion anyway, but only if you remember it
happened and can name the commit; a file here is findable by reading the folder.
Dead code, bugs and superseded infrastructure still get deleted properly.

## Things to ask before doing

- New pricing tier (locked: Free, BYOK $1/mo, Individual $10/year, Voice $12/mo, Tokens $4.99/mo, Team $50/year, Program $550/season — consumer tiers still $0 in beta; the Lifetime tier was removed from pricing displays 2026-07-03, backend entitlement kept).
- Stripe webhook / Firestore rules / App Check token changes.
- New AI provider integration (currently 6 brains: Claude, GPT, Gemini, Grok, DeepSeek, Open Lab — last two added 2026-05-15: DeepSeek direct, Open Lab OpenRouter-backed pool).
- Mobile / TWA wrapping (path is Capacitor; deferred — see soul.md §9).
- Anything that breaks the single-file structure of practice.html.

## Common pitfalls

- Recreating `/netlify/functions/` at the repository root. The only live
  function tree is `app/netlify/functions/`; the root `netlify.toml` points
  there directly.
- Editing `css/` or `netlify.toml` at root without mirroring into `app/`.
- Running functions locally without env vars set: every endpoint 500s
  unless you have `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GEMINI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`,
  `STRIPE_SECRET_KEY`, Firebase admin creds, etc.
- **Assuming a page is tracked because it has the topbar.** `app/js/track.js`
  is the ONLY telemetry entry point (it drives both `/api/log-event` and the
  `/api/presence-live` beat), and `topbar.js` does not pull it. On 2026-08-14,
  60 of 114 public pages had no tag and reported nothing, `/index` among them.
  Every public page carries `<script defer src="/js/track.js"></script>` now;
  a NEW page needs it added by hand. Admin, og-image, offline and
  _more-preview are excluded on purpose. Grep per file, don't assume.
- **The Available pill needs a mount point, not just the script.**
  `js/notifications.js` (bell + Available pill + background matcher) IS
  pulled by `topbar.js` as of 2026-08-23, so topbar pages are covered.
  Pages with bespoke chrome are not: `placePill` looks for
  `.ui-topbar-right` / `.app-topbar-right` / `.bar-links`, and before
  falling back to a floating chip it honours an explicit
  `[data-da-pill-slot]` (`="end"` appends). **A new page with its own bar
  should load the script AND tag its slot** — floating over an existing
  bar is the /live-round mistake `placeBell` documents. Round surfaces
  are excluded by the `ON_ROUND` regex; add any new one there.
- **A public name is ALWAYS the alias, never `displayName` or the email.**
  `js/public-identity.js` exposes `DBIdentity.forUser(u)`, which already
  returns a generated alias when the user has chosen no name, so a guard
  like `if (id.chosen && id.name)` only ever downgrades to the real
  identity. **Never write `user.displayName` or `email.split('@')[0]`
  into anything another person reads** (matchmaking_queue, dm_threads,
  leaderboard_entries, live_challenges, shared_cases, tournament
  entries, channel messages, certs, a Daily `userName`). Pages that
  publish a name define `window.daPublicName(u)` and load the module
  themselves rather than relying on topbar.js's lazy load. Own-account
  surfaces (/profile's editor, the account panel) are the exception.
  Changing the FIRST/LAST array LENGTHS re-rolls every generated alias;
  ADJECTIVES/NOUNS are kept stable so handles do not churn.
- Skipping the SW cache bump after an HTML edit — users get the stale
  bundle for hours until their cache expires. The pre-commit hook
  (see "First-time setup" above) auto-bumps so this is only a footgun
  when the hook isn't installed on the current machine.

## Codex-specific (handoff: Codex edits this site too)

- **Install:** `npm install -g @openai/codex`. Config + auth already live
  at `~/.codex/` (set up previously); if `codex` is not on PATH, reinstall
  or fix PATH, then run `codex` from `/Users/aidanhm`.
- This file is auto-discovered by Codex from the repo root. **Read the
  "Deploy topology & safe-ship" section above first — it is the one thing
  that will break a handoff if you skip it (the local tree is stale; ship
  via a worktree off `origin/main`, never `git push origin HEAD:main` from
  local).**
- The user prefers small surgical patches over sprawling refactors. Match
  that tempo. Don't ask permission to deploy; just use the worktree flow.
- For long-running TTS / multi-file changes, prefer running in the Codex
  sandbox (`codex --workdir /tmp/...`) before applying.
- **The Floor (updated 2026-07-01; RETIRED 2026-08-22):** the betting
  cluster (/floor, /ladder, /bounties, /bet-on-your-words) 301s away —
  betting was removed per the founder, see the 2026-08-22 soul.md
  decision-log entry. **EXCEPTION since 2026-08-23: /predict is live
  again, points-only** ("bring back bet on who will win 'tokens for
  now'") with its cash-round section hidden and CASH_ROUNDS_LIVE still
  false. The notes below describe the dormant Floor code, not a live
  surface.
  Play-money prediction market at
  `/floor.html` (was surfaced on the landing + topbar, `noindex`). Server
  ledger = `app/firestore.rules` (`floor_*` collections) + Netlify fns
  `floor-bet` / `floor-state` / `floor-resolve` / `floor-seed`. The page
  IS wired to those endpoints (SERVER block in floor.html): board, balance
  and bets ride `/api/floor/state` + `/api/floor/bet` when reachable, with
  the localStorage demo engine as hard fallback. 2026-07-01 completed the
  last gap: the Leaderboard tab renders the shared `floor_users` ledger
  (names stamped at bet time by floor-bet), floor-state shared-caches the
  anonymous payload (~15s TTL, poll = 1 read not ~33), and the client
  polls every 30s skipping hidden tabs. Money model: free-to-play
  sweepstakes now, real-money downstream; one ledger, two-tier Play/Prize
  credits, minors never touch redeemable cash. Concept doc:
  `DEBATEIT_PREDICTION_MARKET.md`.
- **Current state (2026-06-26) — read before editing the landing.** Two
  structural things changed that will bite an agent who doesn't know them:
  - **`app/landing.html` now collapses everything below the hero +
    live-room screenshot into an accordion Table-of-Contents (`#lp-toc`).**
    Keeper sections are RELOCATED into the accordion panels by a small JS
    block at load — nodes are MOVED (`appendChild`), not retyped — and a
    few redundant sections are hidden. So every section still lives in the
    file at its ORIGINAL authored spot; edit it there and it will still
    land in its tab. The relocation map + the dropped list are in that JS
    block (search `data-slot`). The two judging sections were merged into
    one "judge lens" tab.
  - **A shared floating / picture-in-picture live player lives in
    `app/js/live-pip.js`**, wired into `voice-debate.html` (React portal)
    and `live-round.html` (DOM reparent). It adds Minimize (in-page mini),
    Pop out (Document PiP, Chrome/Edge only — falls back to mini), and a
    same-origin "site shell" iframe that keeps a live round running while
    the user browses. On expand it force-reveals content, fires `resize`
    (globe), and plays videos.
  - Same-day polish: light-theme treatments for the hardcoded-dark "slab"
    bands (live-proof, circuit-band, The Floor) so they don't read as
    black boxes on the light page (dark theme untouched); real debater
    names on the Floor matchup cards (persona archetypes only stay where
    the AI characters themselves are named); a real-round video in the
    `#trained` band; The Floor copy leaned money-forward (stake/odds/
    payout) with "Play credits only. No cash value." kept.
- **LANDING VERIFICATION GOTCHA (this will save you hours).** The landing
  runs a heavy animation system (60+ keyframes, many IntersectionObservers)
  plus a custom body scroller. In a headless/preview browser this means:
  (1) **screenshots of anything below the hero come back BLANK** — the
  capture grabs stale frames; verify with `eval` (computed styles) +
  `document.elementFromPoint(...)` hit-testing instead, not screenshots;
  (2) the **`grid-template-rows:0fr → 1fr` accordion-open trick resolves to
  0** here — use a JS-driven `max-height` animation instead; (3) collapsed
  content stays `opacity:0` (the observers never fire on it) unless you
  force the reveal class + fire `resize` on expand. None of these are real
  bugs in a normal browser — they're preview/headless artifacts.

## Claude Code-specific

- `CLAUDE.md` at the repo root imports this file with `@AGENTS.md`.
- The user's persistent memory at
  `~/.claude/projects/-Users-aidanhm/memory/` carries cross-session
  preferences (auto-deploy norm, debate tone, voice rules). The
  Obsidian vault at `~/Documents/Obsidian Vault/Projects/DebateAI — HQ.md`
  is the live project dashboard for forward-looking work — read it for
  current KPIs, priorities, and in-flight threads when planning.

## OpenAI Realtime API reference (verified May 2026; models refreshed 2026-07-09)

Confirmed against
https://developers.openai.com/api/docs/guides/realtime-webrtc — DON'T
re-guess this from training-set memory. The beta/preview API used
different endpoints and body shapes; the GA shape below is what works
today on `gpt-realtime-2.1` / `gpt-realtime-2.1-mini` (GA 2026-07-06:
~25% lower p95 latency, steadier interruption) and the older
`gpt-realtime` / `gpt-realtime-2`. Endpoints and body shape are
UNCHANGED across these models — 2.1 is a drop-in on the same mint +
SDP calls.

**Reasoning effort (gpt-realtime-2.1 family only).** 2.1 added a
configurable `reasoning: { effort }` on the session object — accepts
`minimal | low | medium | high | xhigh`, default `low`. Put it in the
mint body's `session` (sibling of `instructions` / `audio`) and/or push
it in a `session.update` after connect. Older models 400 on the field,
so only attach it when the negotiated model matches `^gpt-realtime-2\.1`.
Our minters gate it exactly this way and expose
`OPENAI_REALTIME_REASONING_EFFORT` for zero-redeploy tuning; the main
opponent nudges effort to `medium` on the top smartness tiers.

**Step 1 — server mints ephemeral token:**

```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer ${OPENAI_API_KEY}
Content-Type: application/json

{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2.1",
    "audio": { "output": { "voice": "marin" } },
    "instructions": "...",
    "reasoning": { "effort": "low" }
  }
}
```

(`reasoning` is optional and 2.1-only; drop it when minting an older model.)

Response: `{ "value": "EPHEMERAL_KEY", "expires_at": ..., "session": {...} }`.

**Step 2 — browser exchanges WebRTC SDP:**

```
POST https://api.openai.com/v1/realtime/calls
Authorization: Bearer ${EPHEMERAL_KEY}
Content-Type: application/sdp

<SDP offer body>
```

Response body is the SDP answer.

**Step 3 — push session config over the data channel** after the WebRTC
connection opens, with `{ type: "session.update", session: {...} }`.
This is where things like `turn_detection`, `input_audio_transcription`,
and `modalities` live in the GA API. Then send a
`{ type: "response.create", response: { ... } }` to kick off the AI's
opening turn (otherwise you sit silent until the user speaks first).

**Legacy beta API (still works for the older preview models):**

- Mint: `POST /v1/realtime/sessions` with `OpenAI-Beta: realtime=v1`,
  flat body containing `model`, `voice`, `instructions`,
  `turn_detection`, etc. Response wraps the secret in
  `client_secret: { value, expires_at }`.
- SDP: `POST /v1/realtime?model=...` with `OpenAI-Beta: realtime=v1`.
- Use this only when an account doesn't have GA Realtime access yet.

## When in doubt

Read [soul.md](soul.md). It's 136 lines and worth every one.
