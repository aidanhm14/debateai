# Handover

For the engineer taking over Debatable. Written 2026-08-02.

This is the joining document. It covers what will break production on
your first day, what you need access to, what state the product is
actually in, and what is quietly wrong right now. It does not repeat
the two docs that already exist:

| Read | For |
|---|---|
| **[AGENTS.md](AGENTS.md)** | How to work in this codebase. Deploy topology, hooks, per-subsystem rules. Written for AI agents; every word applies to you. |
| **[soul.md](soul.md)** | What the product is, who it is for, how copy sounds, and a dated decision log explaining why things are the way they are. |
| this file | Everything those two assume you already know. |

Read AGENTS.md first, then this, then soul.md when you need the why
behind a decision.

---

## 1. The three things that break production

### 1.1 The local checkout is not the source of truth

As of this writing the working copy on the founder's machine is **1100
commits behind `origin/main`, 5 ahead, with 239 uncommitted files, on a
branch called `relaunch/arena-v1`, alongside 21 git worktrees.**

That is not neglect, it is how this repo is used: experiments live in
the tree indefinitely. The consequence is absolute:

> **Never `git push` from the working tree. Never `pull`, `reset`, or
> `checkout` over it either. It holds work nobody has copied anywhere.**

Ship by branching off `origin/main` in a throwaway worktree, re-applying
your change there, and pushing that. The exact commands are in
AGENTS.md under "Deploy topology & safe-ship". Read that section before
your first push, not after.

Netlify deploys `origin/main` with publish dir `app/`. Pushing to main
is deploying. There is no staging environment.

### 1.2 The git hooks are load-bearing, not lint

`bash scripts/install-hooks.sh` once per clone. Do it before your first
commit. The pre-commit hook runs five things, and each exists because
something reached production without it:

| Guard | Blocks |
|---|---|
| SW cache bump | HTML shipped under a `CACHE_NAME` users already hold, so they keep the stale bundle |
| `precompile-inline-babel.mjs` | Six huge pages ship precompiled inline React; skipping this ships broken JS |
| `check-prices.mjs` | Off-canonical price strings. Outside contributors have "corrected" prices *backwards* to stale values |
| `check-function-imports.mjs` | An import a sibling lib does not export. This fails Netlify's bundling step, which blocks **every** deploy, not just the broken function |
| `test-judge-integrity.mjs` + `test-brain.mjs` | Published promises about the AI judge, and the prompt-injection boundary on stored user data |

There is also a **pre-push** hook that refuses to push client changes
still sitting on the previous cache name, because rebasing onto a moved
`origin/main` silently drops the bump (identical hunks dedupe). That
happened nine times in one day before the hook existed.

**Never `--no-verify`.** If a guard blocks you, it is right and you are
wrong; fix the input.

### 1.3 The two big pages are edited surgically, never rewritten

`app/index.html` is 18,242 lines. `app/landing.html` is 18,160.
`app/practice.html` is 12,511. They are single-file React-via-CDN apps
using `el(tag, props, ...children)`, not JSX. Adding JSX breaks them at
runtime. Rewriting them loses undocumented behaviour nobody has
inventoried.

**The landing has a specific trap that has cost multiple sessions:** it
keeps deprecated hero arms in the DOM behind `display:none`, and hides
most sections behind a "See more" gate
(`body.landing-more-ready:not(.landing-more-open)`). An element can be
present in the HTML, match your grep, and render at 0x0 for every real
visitor. **Verify in a browser with computed styles, not with grep.**
Headless screenshots of anything below the hero come back stale or
blank; measure with `getBoundingClientRect` instead.

---

## 2. Access you need (the founder must transfer these)

Nothing here can be handed over from inside the repo. Chase each one.

| Service | Holds | Notes |
|---|---|---|
| **GitHub** | the code | Repo `aidanhm14/debateai` |
| **Netlify** | hosting, functions, all env vars, DNS aliases | Site `debateos1`. 39 env keys set |
| **Firebase / GCP** | Auth, Firestore, Storage | Project `debateos-78ac5`. Firestore rules live in `app/firestore.rules` and deploy via the Firebase CLI |
| **GoDaddy** | `itsdebatable.com` | Registered through 2034. DNS points at Netlify. **Domain Forwarding must stay OFF** (it caused an outage 2026-07-01) |
| **Stripe** | billing | Currently inert, see §4 |
| **Resend** | transactional + lifecycle email | |
| **Daily.co** | live-round video | |
| **Apple Developer** | the iOS app | |
| Provider accounts | OpenAI, Anthropic, Google (Gemini), xAI, DeepSeek, OpenRouter, ElevenLabs, Inworld, Cartesia, Perplexity | Every one is a live billing relationship |

**Do not put secrets in this repo.** All keys live in Netlify env. The
build has secret-scanning configured (`SECRETS_SCAN_*` keys) because
that boundary has been tested.

---

## 3. Known problems, worst first

### 3.1 `/api/realtime-session` mints billable tokens to anyone

Verified live on 2026-08-02: an unauthenticated `POST` with an empty
JSON body returns a real OpenAI Realtime `client_secret`. Anyone who
finds the endpoint can mint sessions against the OpenAI key.

Two layers were supposed to stop this and neither does:

- **Firebase App Check is not enforcing.** The site key was never filled
  in, so the check passes trivially.
- **The rate limiter is effectively per-isolate.** `lib/rate-limit.mjs`
  is Upstash-backed with an in-memory fallback, and
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are **not set**.
  So each Netlify isolate keeps its own counter and a cold start wipes
  it. Under light traffic it reads as a working limit; it is not one.

Cheapest real fix: set the two Upstash env vars (the code already reads
them, nothing to write) and fill in the App Check site key. Until then
this is an open cost tap. Same limiter weakness applies to
`claude.mjs`'s anonymous caps.

### 3.2 The leaderboard is seeded, and the seeds are not labelled

48 documents in `leaderboard_entries` carry `seed: true, seedV: 2`,
written 2026-07-18. They render on `/leaderboard` and in the landing's
ranked band with no "sample data" marker. That was a deliberate founder
call, and you should know it before you quote the board to anyone.

Delete the whole pool with one query when real activity outgrows it:
`leaderboard_entries.where('seed','==',true)`.

### 3.3 The product has almost no throughput

Be careful not to mistake the surface area for traction:

- `/api/judge/reliability` reports **0 judged rounds** in the current
  season. The three-model judge panel shipped 2026-07-30 and has not
  decided a single live round.
- `/api/online-count` regularly reports **0**.
- Organic search is near zero. The last real traffic was a ~$660 ad push
  in April 2026 that did not retain.

soul.md §8 has the detail. Retention, not features, is the constraint.
There is a large amount of built-but-unused surface here; resist adding
more before you understand why the existing surfaces are empty.

### 3.4 Smaller open items

- **Live human rounds cannot settle credits.** Their ballot is written
  by a participant's own browser, and `MONEY_VERDICT_SOURCES` in
  `lib/settle.mjs` only accepts `verdictSource:'server'`. This is
  deliberate. Do not "fix" it by widening the set; move the ballot
  server-side instead.
- **Stripe webhook URL** still points at the pre-cutover domain. Harmless
  while billing is off; breaks the day it is switched on.
- **`/brain` is unverified end to end.** The six-step identity builder
  and its prompt injection shipped 2026-08-02 and nobody has run a
  signed-in round through it.
- **A root `netlify/functions/` directory has reappeared and is a trap.**
  It holds 13 `.mjs` files. Both `netlify.toml` files resolve the
  functions dir to `app/netlify/functions`, so **nothing in the root copy
  deploys**. All 13 are byte-identical to their live twins today, so
  there is no bug yet, only a loaded one: last time this directory
  existed, five of its files silently drifted from the deployed versions
  because people edited the copy they found first. Delete it, or check
  every time. `css/` and both `sw.js` files *are* real mirrors and must
  stay in sync.

---

## 4. What is switched off

The product looks like it sells things. It does not, currently.

- **All pricing is display copy.** `create-checkout.mjs` is gated by
  `BETA_NO_CHARGE` (defaults true). No card is collected. Canonical
  tiers: Free $0, BYOK $1/mo, Individual $10/year, Team $50/year, and
  `check-prices.mjs` enforces those strings in HTML.
- **`BETA_PRO_UNLOCK`** in `index.html` unlocks pro features for
  everyone.
- Paid conversions to date: **0**. Expected, but it also means the
  Stripe path has never been exercised by a real customer.

---

## 5. The map

```
/                     git root (NOT app/)
├── AGENTS.md         how to work here
├── soul.md           what this is + decision log
├── HANDOVER.md       this file
├── app/              Netlify publish dir (both netlify.toml files
│                     resolve functions to app/netlify/functions)
│   ├── *.html        106 pages at top level, 125 counting subdirs
│   ├── js/           73 standalone client modules
│   ├── css/          mirrors /css
│   ├── firestore.rules
│   ├── netlify.toml  mirrors /netlify.toml. ~200 redirect rules
│   ├── sw.js         mirrors /sw.js. Bump CACHE_NAME together
│   └── netlify/functions/   180 functions + 58 lib modules
├── scripts/          38 scripts: 12 test suites, the hooks, builders
└── mobile/           Capacitor iOS wrapper
```

**Surfaces worth knowing by name:** `/practice` (AI round), `/spar`
(human matchmaking), `/live-round` (the live room), `/newvoice` and
`/voice-debate` (realtime voice), `/judge` (standalone judge),
`/brain` (per-user debate identity), `/arena` and `/tournaments`
(lobbies), `/admin` (mission control), `/floor` (play-money market).

**Eight cron functions** run on schedules declared in the function files
(`scheduled-distill`, `-winback`, `-wau-digest`, `-spar-night`,
`-kickoff-reminder`, `-spar-reaper`, `-user-fingerprint`,
`-corpus-stats`). Several are dry-run behind an env flag; check before
assuming a job is live.

### The one architectural idea to absorb

Every AI call goes through a proxy function that assembles a layered
system prompt server-side, so the voice bank cannot be scraped from
view-source:

```
[reference rounds] + [learned patterns] + [this debater] + base system + [voice guidelines]
      exemplars.mjs      distillations.mjs     brain.mjs                  voice-guidelines.mjs
```

Voice guidelines come last so they win conflicts. `voice-guidelines.mjs`
is roughly 60K characters of per-format debate knowledge and is the
actual product moat. Read the relevant format block before touching
format behaviour; formats genuinely differ and generalising across them
is the standard way to make this worse.

---

## 6. Rules that are not stylistic

Breaking these has consequences beyond a bad diff.

**The AI judge.** Five promises are published at `/judge-integrity` and
served from a keyless public endpoint, so they are quotable in a
dispute. Never edit a rubric version in place, never tie-break an even
panel split, never route an appeal to a model, never add a rake to the
credit ledger. `test-judge-integrity.mjs` blocks commits that break any
of them. AGENTS.md has the full list.

**Stored user data reaching a prompt.** Anything persisted and later
concatenated into a system prompt is a prompt-injection channel with a
per-user blast radius. The `/brain` fields are allow-listed ids, never
free text, and `test-brain.mjs` enforces it. Apply the same rule to
anything new.

**Claims.** No traction number goes on a public surface without a source.
The old "~7K MAU" figure is an ad-spike artifact and is banned. There is
no audience voting feature, so nothing may promise crowd verdicts in the
present tense. The founder's credential is "APDA Pro-Ams champion, 2025"
and no stronger phrasing.

**Copy.** No em-dashes in user-facing text. There is a banned-phrase list
in soul.md §5 that exists because each entry rotted something. Skim it
once; it will save you a review cycle.

---

## 7. First week

1. Get access to everything in §2. Nothing else matters until this is done.
2. Clone, `bash scripts/install-hooks.sh`, and read AGENTS.md end to end.
3. Ship one trivial copy change through the worktree flow, so the deploy
   path is muscle memory before you need it under pressure.
4. Fix §3.1. It is small, it is currently costing money, and it is the
   only item here with an active adversary.
5. Run a real round end to end as a signed-in user. It exercises auth,
   the prompt stack, the judge, and `/brain` at once, and it will teach
   you more about this codebase than reading it will.
6. Only then pick up feature work.

## 8. Asking the founder

Some things are decisions, not code. Ask before changing:

pricing tiers, Firestore rules, App Check tokens, the Stripe webhook, a
new AI provider, anything that alters what the judge does, anything that
would put a number or a credential on a public page, and anything that
breaks the single-file structure of the big pages.
