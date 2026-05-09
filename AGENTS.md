# AGENTS.md

> Operational manual for AI coding agents working on DebateAI (Codex,
> Claude Code, Cursor, etc.). Read this first, then read [soul.md](soul.md)
> for product/voice/decision context. If a change would contradict either
> file, fix the change or fix the doc — don't leave the contradiction.

## What this is

DebateAI is a voice-first adversarial-argument trainer at
**debateai.com** / debatethedevil.com. ~7K monthly active users as of
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
│   ├── devils-advocate.html   single-AI sparring mode
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
  "robust framework", "let's dive in", "let's unpack", "in today's
  world", "ladies and gentlemen", "I'm here to argue", "at the end of
  the day", "it's important to note".
- **BYOK is Anthropic-only.** Don't add OpenAI/Gemini BYOK. Cross-provider
  BYOK attempts must throw a labeled error.
- **APDA never goes in the Topics Hub.** It's impromptu — no rolling
  motion. Routes to the Motions tab.
- **No JSX** in `debate-ai.html` or `landing.html`. React-via-CDN means
  `el(tag, props, ...children)`. JSX in those files breaks the runtime.
- **Bump `CACHE_NAME` in BOTH `sw.js` files** when HTML/bundle changes.
- **Never precache `/` in the service worker** — it broke root routing.
- **Never skip git hooks** (`--no-verify`).
- **Pricing is locked**: Free $0, BYOK $1, Individual $5, Team $30.

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

- New pricing tier (locked: Free, BYOK $1, Individual $5, Team $30).
- Stripe webhook / Firestore rules / App Check token changes.
- New AI provider integration (currently 4 brains).
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
  bundle for hours until their cache expires.

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

## When in doubt

Read [soul.md](soul.md). It's 136 lines and worth every one.
