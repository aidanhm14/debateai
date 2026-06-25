# DebateIt

A voice-first adversarial-argument trainer. You give a real speech against a clock, get pushback, take POIs, and get a judge ballot at the end. The AI is format-accurate across APDA, BP, Worlds, Asian Parli, Policy, LD, PF, Congress, and MUN.

Live at **[debateai.com](https://debateai.com)**.

---

## What it does

- **Voice round.** Sub-200ms turn-taking over WebRTC against OpenAI Realtime. Server-side VAD means the AI actually interrupts you. Five modes (cross-ex, full round, opening, closing, drill).
- **Typed round.** Case prep, opp attacks, rebuttals, judge RFD. Six AI brains: Claude, GPT, Gemini, Grok, DeepSeek, Open Lab.
- **Format-accurate.** Policy gets tagged-card delivery. LD gets value/criterion. BP gets extensions + whip structure. APDA stays impromptu with no fake citations. Each format has its own server-side voice block.
- **Sparring.** Match into a live human round in ~30 seconds. AI fallback if nobody pairs in 60.
- **Tournament rooms** with Daily.co video, judge slots, AI ballots.
- **Counter Chrome extension.** Viva/oral-exam mode in a side panel. Highlight study material, defend out loud.

## Numbers (as of May 2026)

| | |
|---|---|
| Monthly active users | ~7,000 |
| Countries (last 28d) | 115 |
| Blended CAC | $0.09 |
| Total year-1 spend | $877.60 |
| Active formats | 9 |
| AI brains | 6 |
| Voice personas | 16 |
| Lines in `app/debate-it.html` | 5,500+ |

## Stack

**Frontend.** React via CDN in single-file HTML pages. `el(tag, props, ...kids)` aliased to `React.createElement`. No JSX, no build step for the app pages. Vite is around for niche bundling but most edits land by refreshing a tab.

**Backend.** 60+ Netlify Functions (Node ESM). AI proxies (Claude, GPT, Gemini, Grok, DeepSeek direct, Open Lab via OpenRouter), TTS routing (ElevenLabs Turbo v2.5, Inworld 1.5 Max, Cartesia Sonic-2, OpenAI gpt-4o-mini-tts), Stripe checkout + webhooks, Firebase admin, ephemeral-token minting for OpenAI Realtime, scheduled distillation passes.

**Voice.** WebRTC direct from browser to OpenAI Realtime. The server mints a 60-second ephemeral token and never touches the audio path. Sub-200ms because the cloud function isn't in the loop.

**Data.** Firebase Auth (Google), Firestore for queue/rooms/style profiles, App Check on every endpoint, Netlify CDN for static.

**Learning loop.** Every typed turn and voice transcript writes to `generations`. A nightly Haiku pass distills top-rated rounds per format into a "patterns that work" block injected into future prompts. The AI on a given motion today is not the AI on that motion last month.

## What's interesting in the code

- **5,500-line single-file React-via-CDN** in [app/debate-it.html](app/debate-it.html). No JSX, no bundler, no shadow DOM. Edits are surgical. Hot-reload is the browser refresh button.
- **Format-specific voice bank** in [app/netlify/functions/lib/voice-guidelines.mjs](app/netlify/functions/lib/voice-guidelines.mjs). Server-side so view-source can't scrape it. Each format gets its own block: evidence rules, structure, register, banned phrases.
- **Exemplars + distillations** ([exemplars.mjs](app/netlify/functions/lib/exemplars.mjs), [scheduled-distill.mjs](app/netlify/functions/scheduled-distill.mjs)). Admin-weighted past rounds get prepended to system prompts at runtime. Nightly distillation extracts patterns from the top-rated outputs per format.
- **TTS humanizer** ([tts-humanize.mjs](app/netlify/functions/lib/tts-humanize.mjs)) strips stage directions, picks intensity, normalizes pauses across four TTS providers.
- **Spar globe** ([app/js/world-globe.js](app/js/world-globe.js)). Orthographic Canvas-2D globe, no WebGL, no libraries. Land dots, great-circle arcs with travelling pulses, expanding scan-sweep rings during matchmaking.

## Docs

The product north star and operating manual live in two files. Read them in order:

1. **[soul.md](soul.md).** What this product is, who it's for, how it sounds, and why the decisions were made the way they were.
2. **[AGENTS.md](AGENTS.md).** Operational manual for contributors (and AI coding agents).

## Status

In beta. Every tier is $0 today. Future pricing (Free, BYOK $1/mo, Individual $5/year, Lifetime $14.99 once, Team $20/year) is published for reference at [/pricing](https://debateai.com/pricing).

## Credits

Built solo by a national APDA champion at the University of Chicago. About 14 months in.
