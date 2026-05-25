# AGENTS.md

> Operational manual for AI coding agents working on Debatable (Codex,
> Claude Code, Cursor, etc.). Read this first, then read [soul.md](soul.md)
> for product/voice/decision context. If a change would contradict either
> file, fix the change or fix the doc — don't leave the contradiction.

## What this is

Debatable (renamed from DebateAI 2026-05-25 after the user acquired
debatable.com) is a voice-first adversarial-argument trainer at
**debateai.com**. The production domain is still debateai.com until a
separate DNS migration; the brand name in all user-facing copy is now
Debatable. ~7K monthly active users as of May 2026. Solo-built.
Ships to production many times per day.

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
│   │       │     OpenAI Realtime (gpt-realtime / gpt-realtime-2)
│   │       │     ephemeral-token minter for /voice-debate.html.
│   │       │     App-Check gated, rate-limited (6/hour/IP). Browser
│   │       │     does direct WebRTC to OpenAI; server is never in the
│   │       │     audio path. See "OpenAI Realtime API reference"
│   │       │     section below for the canonical endpoint shapes.
│   │       │     Models overridable via env:
│   │       │     OPENAI_REALTIME_MODEL, OPENAI_REALTIME_TRANSCRIBE_MODEL.
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

# Ship to prod
git push origin HEAD:main      # Netlify auto-builds in ~30s
```

**Auto-deploy norm:** small commits push straight to `main`. Don't ask
permission to deploy on this repo. Verify locally first; ship in batches
of ~10 minutes of work, not big PRs.

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
- **Pricing is locked**: Free $0, BYOK $1/mo, Individual $5/year, Lifetime $14.99 once, Team $20/year. Currently in beta — every tier is $0 today; the table above is the post-beta plan and lives as JSON-LD/copy across pricing.html, debate-ai.html, landing.html. (Lifetime added to canonical 2026-05-10; Individual + Team flipped to annual 2026-05-14.)

## Voice rules for AI debater outputs

The voice bank lives **server-side** in
`app/netlify/functions/lib/voice-guidelines.mjs`. The client
`app/js/voice-guidelines.js` is an empty stub by design. Don't try to
edit voice from the client.

When editing format-specific voice (Policy spreads, PF citations, LD
framework, BP whip, APDA impromptu, Worlds POIs, Asian Parli, Congress,
MUN), **read the relevant format block first.** Don't generalize across
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

- New pricing tier (locked: Free, BYOK $1/mo, Individual $5/year, Lifetime $14.99 once, Team $20/year — currently beta, all $0).
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

## Codex-specific

- Install: `npm install -g @openai/codex`
- This file is auto-discovered by Codex from the repo root.
- The user prefers small surgical patches over sprawling refactors.
  Match that tempo.
- Auto-deploy is on. Verify before committing — changes ship to prod
  within a build cycle.
- For long-running TTS / multi-file changes, prefer running in the
  Codex sandbox (`codex --workdir /tmp/...`) before applying.

## Claude Code-specific

- `CLAUDE.md` at the repo root imports this file with `@AGENTS.md`.
- The user's persistent memory at
  `~/.claude/projects/-Users-aidanhm/memory/` carries cross-session
  preferences (auto-deploy norm, debate tone, voice rules). The
  Obsidian vault at `~/Documents/Obsidian Vault/Projects/DebateAI — HQ.md`
  is the live project dashboard for forward-looking work — read it for
  current KPIs, priorities, and in-flight threads when planning.

## OpenAI Realtime API reference (verified May 2026)

Confirmed against
https://developers.openai.com/api/docs/guides/realtime-webrtc — DON'T
re-guess this from training-set memory. The beta/preview API used
different endpoints and body shapes; the GA shape below is what works
today on `gpt-realtime` / `gpt-realtime-2`.

**Step 1 — server mints ephemeral token:**

```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer ${OPENAI_API_KEY}
Content-Type: application/json

{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "audio": { "output": { "voice": "marin" } },
    "instructions": "..."
  }
}
```

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
