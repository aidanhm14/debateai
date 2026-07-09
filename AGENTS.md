# AGENTS.md

> Operational manual for AI coding agents working on Debatable (Codex,
> Claude Code, Cursor, etc.). Read this first, then read [soul.md](soul.md)
> for product/voice/decision context. If a change would contradict either
> file, fix the change or fix the doc — don't leave the contradiction.

## What this is

DebateIt (renamed from Debate AI in user-facing copy on 2026-06-08) is
a voice-first adversarial-argument trainer at **debateai.com**. The
brand name in user-facing copy is DebateIt, but the owned production
domain, canonical URLs, email defaults, and deployed host remain
debateai.com. The user confirmed on 2026-06-25 that they do not own
debateit.com, so do not point code, docs, CORS allowlists, structured
data, or copy at that domain. The earlier 2026-05-25 "Debatable" rename
was reversed within 24h because the user never actually owned
debatable.com; see soul.md decision log. ~7K monthly active users as of
May 2026. Solo-built. Ships to production many times per day.

The full product/voice/decisions doc is [soul.md](soul.md). Read it.

## Where things live

```
/                              repo root (Netlify publishes from /app)
├── soul.md                    product north star — read first
├── AGENTS.md                  this file
├── CLAUDE.md                  imports this file (Claude Code entry point)
├── app/
│   ├── debate-ai.html         5500+ lines. Single-file React-via-CDN.
│   │                            EDIT SURGICALLY. NEVER rewrite. NEVER
│   │                            add JSX — uses `el(tag, props, ...kids)`
│   │                            aliased to React.createElement.
│   ├── landing.html           ~2700 lines, marketing entry. Same rules.
│   ├── live.html              live tournament rooms (Daily.co video)
│   ├── spar.html              live-human sparring matchmaking + AI fallback
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
│   │       ├── stripe-webhook.mjs, create-checkout.mjs,
│   │       │   billing-portal.mjs, cancel-subscription.mjs
│   │       └── admin-*, team-*, log-*, scheduled-* (analytics + ops)
│   ├── package.json           Vite dev server (rarely needed for HTML edits)
│   ├── netlify.toml           MUST stay in sync with /netlify.toml at root
│   └── sw.js                  bump CACHE_NAME with /sw.js when HTML changes
├── netlify/functions/         duplicates app/netlify/functions for bundling
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

The canonical hook lives at `scripts/hooks/pre-commit` so it travels
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

## Inline React scripts: `<script data-precompile="es5">`

Six pages (`index.html`, `debate-ai.html`, `voice-debate.html`,
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

- **No em-dashes in user-facing copy.** Periods, commas, semicolons only.
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
- **No JSX** in `debate-ai.html` or `landing.html`. React-via-CDN means
  `el(tag, props, ...children)`. JSX in those files breaks the runtime.
- **Bump `CACHE_NAME` in BOTH `sw.js` files** when HTML/bundle changes. The `scripts/hooks/pre-commit` hook (installed via `bash scripts/install-hooks.sh`) does this automatically on every commit that touches client-side files. Only relevant if you skipped the hook install — in which case bump manually.
- **Never precache `/` in the service worker** — it broke root routing.
- **Never skip git hooks** (`--no-verify`).
- **Pricing is locked**: Free $0, BYOK $1/mo, Individual $10/year, Team $50/year. Currently in beta — every tier is $0 today; the table above is the post-beta plan and lives as JSON-LD/copy across pricing.html, debate-it.html, landing.html. (Individual + Team flipped to annual 2026-05-14; Individual $5→$10 and Team $20→$50 on 2026-06-27 per the unit-economics audit. **The Lifetime tier was removed from all pricing displays 2026-07-03** — it is no longer offered; the backend `lifetime` plan entitlement stays intact for any existing grants. See soul.md decision log.)

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

## Editing playbook for the big single-file pages

`debate-ai.html` and `landing.html` are huge single-file React apps.

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
- `/netlify/functions/` ↔ `/app/netlify/functions/`
- `/css/` ↔ `/app/css/`

## Things to ask before doing

- New pricing tier (locked: Free, BYOK $1/mo, Individual $10/year, Team $50/year — currently beta, all $0; the Lifetime tier was removed from pricing displays 2026-07-03, backend entitlement kept).
- Stripe webhook / Firestore rules / App Check token changes.
- New AI provider integration (currently 6 brains: Claude, GPT, Gemini, Grok, DeepSeek, Open Lab — last two added 2026-05-15: DeepSeek direct, Open Lab OpenRouter-backed pool).
- Mobile / TWA wrapping (path is Capacitor; deferred — see soul.md §9).
- Anything that breaks the single-file structure of debate-ai.html.

## Common pitfalls

- Editing only `app/netlify/...` and forgetting `/netlify/...` (or
  vice versa). The build pulls from both; the active deploy uses
  `app/netlify/functions/`.
- Editing `css/` or `netlify.toml` at root without mirroring into `app/`.
- Running functions locally without env vars set: every endpoint 500s
  unless you have `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GEMINI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`,
  `STRIPE_SECRET_KEY`, Firebase admin creds, etc.
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
- **The Floor (updated 2026-07-01):** play-money prediction market at
  `/floor.html` (surfaced on the landing + topbar, `noindex`). Server
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
