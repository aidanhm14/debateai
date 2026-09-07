# ASTRA security brief for Debatable (itsdebatable.com)

> You are Astra, running on GPT-6. This is the second half of a security
> sweep. The first half was audited and shipped by Claude on 2026-09-07 and
> is recorded in the soul.md decision log under that date. Read `AGENTS.md`,
> `soul.md`, then `ASTRA_SWEEP_INSTRUCTIONS.md` (section 0 posture and the
> three action tiers apply here unchanged), then this file. Written
> 2026-09-07.

## 0. Posture

Same as the sweep brief: prove every claim with a reproducible command,
ship small verified diffs through the worktree flow, never `--no-verify`,
never from the local checkout. Two extra rules for security work:

- **Never probe a mutating endpoint against production without a token
  you own and a cleanup plan.** An unauthenticated POST to `/api/log-reaction`
  on 2026-09-07 wrote a stray `voice_rounds/x` document that had to be
  deleted by hand. Test against the Rules test API, a throwaway account,
  or the worktree's local functions (`cd app && npx netlify dev`).
- **A finding is not fixed until it is fixed at every layer.** The admin
  flag was closed server-side (24 inline copies plus the shared helper),
  in `firestore.rules`, and in three admin HTML hints. Reading the diff of
  one layer tells you nothing about the other two.

## 1. What is already done (do not redo)

Shipped 2026-09-07, all verified live:

| Checklist item | State | Where |
|---|---|---|
| Hide API keys / purge secrets | **Done for the one live leak.** The Firestore service-account private key was served at `/netlify/functions/lib/_firestore-creds.mjs` (200, base64 PEM, since 2026-05-17). Forced `/netlify/*` 404 is the FIRST redirect in both toml mirrors. The exposed key `e136b879…` was rotated to `ee9ed5d3…` and deleted from IAM. | `app/netlify.toml`, `netlify.toml`, `scripts/test-netlify-source-not-served.mjs` (pre-commit) |
| Git history | **Clean.** No real secret was ever committed; the leak was a build artefact, not a commit. Verified across all refs with `-S` and `-G` sweeps (commands in the 2026-09-07 log entry). | |
| Expose only the public DB key | **Confirmed.** Firebase web keys, App Check site key, PostHog token, VAPID public key are public by design. No server key in any client file. | |
| Row-level security / lock record access / block field tampering | **Four holes closed and deployed** (28 Rules test cases, 13 of which were open on the old ruleset): `user_profiles` entitlement keys server-only; `live_challenge_contacts` accept path bound to the public accept; `teams` and `team_members` reads owner-only, writes server-only; `dm_threads.participants` frozen; `live_debates.participants` self-diff only. | `app/firestore.rules` |
| Enforce server-side auth | **Admin flag moved** from owner-writable `user_profiles.isAdmin` to server-only `users/{uid}.isAdmin` in `lib/admin-auth.mjs` and 24 inline copies. `/api/compute-game-score` and `/api/log-reaction` now require a Firebase token, validate ids, meter per uid and IP, and refuse to create rounds. | `app/netlify/functions/` |
| Rate limit | `/api/recordings` view counter per IP; `/api/report-user` per reporter and per IP on the write itself; `async-upload` reads Netlify's IP header before `x-forwarded-for`. | |
| Trim API responses | Ten keyless endpoints no longer echo raw Firestore or provider error text (`'getDb: ' + err.message` is now `'unavailable'`). | |
| Security headers / force HTTPS | **Already in place before the sweep:** HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors` CSP, http and www 301 to the https apex. | `app/_headers` |
| Scan dependencies | Lockfile patched: protobufjs (critical), grpc-js and form-data (high), qs, gaxios. Verified with `npm ci --omit=dev` in isolation. | `app/package-lock.json` |
| Bot protection | App Check hard-enforced (`APP_CHECK_REQUIRED=true`), Turnstile wired for audience cameras (keys unset, so that feature is off by design). | |
| Hash passwords / parameterize queries / secure cookies | **Not applicable and verified:** Firebase Auth hashes; there is no SQL; the server sets no cookies. | |
| Pre-commit secret guard | `scripts/check-staged-secrets.mjs` blocks staged server-secret shapes; `.gitignore` covers `*.p8`, `*.p12`, `*.keystore`, `*.jks`, `*.mobileprovision`, `google-services.json`. | |

## 2. Your job, in order

Each item names the tier from the sweep brief. Ship-tier items get one
commit each with the verification stated in the message.

### 2.1 SHIP: `payoutAccount` off the profile doc

`payout-account.mjs:117-125` writes `payoutAccount.{stripeAccountId,
payoutsEnabled, detailsSubmitted}` into `user_profiles/{uid}`, and
`lib/send-payout.mjs:66` plus `lib/payout.mjs:72` read it back as the KYC
gate and the Stripe transfer destination. The rules now refuse a client
write to that key, which closes the exploit, but the record still lives on
a doc whose other keys the owner controls. Move it to a server-only
collection (`payout_accounts/{uid}`, no rules entry so default deny
covers it, owner read if the page needs it) and read from there in both
libs. Migrate existing docs with one script. Verify with a throwaway
account through `/payouts` onboarding, then delete the account.

### 2.2 SHIP: `role:'stage'` on `create-daily-room`

`create-daily-room.mjs:144-147,191` accepts `role:'stage'` from any body
and skips the `LIVE_VIDEO_PROVIDERS` Google gate for it. Bind the stage
role to the same admission the stage page actually has (the `stage.mjs`
claim record, or an admin token), never a body field. Verify: a plain
signed-in email account POSTing `role:'stage'` gets the Google-only
refusal.

### 2.3 SHIP: remaining per-isolate `Map` limiters on money paths

36 files still keep a module-scope `Map` counter. Netlify runs each
concurrent invocation in its own isolate, so those caps are per instance
and reset on cold start. Move the money ones to `lib/rate-limit.mjs`
`checkLayers` with `lib/caller.mjs` identity, in this order: `deepseek`,
`gemini`, `grok`, `openai-chat`, `openlab` (paid-plan gated, so lower
risk), `coach-session`, `room-judge-session`, `team-messages`,
`video-moderate`. Then put the Stripe and Razorpay endpoints, which have
NO limiter (`bounty-checkout`, `cash-round-checkout`, `entry-checkout`,
`tokens-checkout`, `tokens-portal`, `billing-portal`, `payout-account`,
`razorpay-order`, `cancel-subscription`), on a per-uid layer sized for a
human (10/hour is generous). List the rest in the report.

### 2.4 SHIP: shared `safeId()` at every body-derived Firestore path

About 55 functions read an id from the body and pass it to `.doc()`
without a regex; a `/` in the id changes the path. Good pattern already
exists in `room-topic.mjs:124` (`/^[a-zA-Z0-9-]{1,120}$/`) and
`notify-dm.mjs:171`. Export one `safeId()` from `lib/` and apply it at
each read. Start with the unauthenticated one:
`submit-audience-question.mjs:37-52` (no token, raw `roundId`, writes
under `voice_rounds/*`). Add a token requirement there too.

### 2.5 SHIP: prompt fence on the server ballot

`live-round.html:13080` carries a TRANSCRIPT INTEGRITY block for the
client-built ballot; `live-judge.mjs:400-460` and `lib/adjudication.mjs`
do not. A speaker can address the server judge inline. Move the fence into
`lib/adjudication.mjs` so every juror gets it, and add an assertion to
`scripts/test-judge-integrity.mjs` that the string survives. This touches
the judge, so the fence text must be copied verbatim from the client, not
rewritten, and the rubric and calendar must not change. If anything else
in that lib needs to move, stop and report instead.

### 2.6 SHIP: `postMessage` origin checks

`practice.html:6531`, `voice-debate.html` (~4590) and `linter.html:823`
accept any `chrome-extension://` origin. In voice-debate that path can
trigger `getUserMedia` and start a round. Compare `ev.origin` to the
published extension ids. Verify with a second extension id in the browser
harness.

### 2.7 SHIP: Netlify build-time secrets scanner back on

`SECRETS_SCAN_ENABLED="false"` and `NETLIFY_SKIP_SECRETS_CHECK="true"` in
both toml mirrors. The omit keys for the baked creds file and the
`GOOGLE_SERVICE_ACCOUNT` value are already configured. Flip both flags,
push, and watch the build log. If it fails on the Firebase web key in
`debate-chat.html` (the 2026-05-24 failure), delete that page's Firebase
block instead of widening the omit list: `/debate-chat` has 301'd to
`/spar` since 2026-05-26 and the page initialises a second, unmaintained
Firebase project.

### 2.8 SHIP: the rest of the rules audit (needs the founder's yes first)

These change what a client may write, so post the exact rule and blast
radius in the report and ship only on his reply:

- `leaderboard_entries`: `score`/`won` are owner-forgeable on a public
  board. Interim rule: `score is number && score >= 0 && score <= 100 &&
  won is bool`. Real fix is a `/api/leaderboard-post` function.
- `shared_cases.voteScore/voteCount` and `forum_posts.*Count`: delta-pin
  to ±1/±2 like `live_rounds/topics` does.
- `matchmaking_queue`: `list` is open to anonymous sessions and the doc
  carries `ageBand`. Make `get` owner-only, `list` named-only, and stop
  writing `ageBand` on the queue (the server enforces from `age_bands`).
- `live_rounds.ballot` is client-written and feeds the Glicko ladder.
  This is the standing open hole (memory: live-round judge integrity).
  It needs the ballot written server-side before a rule can close it.
  Report only.
- `feedback.screenshots` items have no size cap.
- `atlas_*` and `user_fingerprints` have no rules and their client
  writes fail silently. Needs a decision on who may write.

### 2.9 SHIP: Firestore SDK major bump

Six moderates remain (`uuid`, `teeny-request`, `retry-request`,
`google-gax`) and all need `@google-cloud/firestore@9`. Bump in a
worktree, run `npm ci --omit=dev` in an isolated copy, import every lib
that touches Firestore, run every `scripts/test-*.mjs` the hook runs,
then deploy and watch `/api/spar-queue`, `/api/watch-live`, one authed
write, and one transaction (`spar-pair`) for ten minutes. `preferRest:
true` in `lib/firestore.mjs` is the setting most likely to change
behaviour across the major.

### 2.10 PROPOSE: script-src CSP

`app/_headers` deliberately has no `script-src`. Ship it as
`Content-Security-Policy-Report-Only` first with a report endpoint,
collect a week of violations across the top 20 pages, then propose the
enforcing policy. Inline scripts on the React pages mean nonces or hashes;
do not propose `'unsafe-inline'` as the end state.

### 2.11 REPORT ONLY

- `live-now.mjs:56` returns queue uids and display names keylessly; per
  the identity rule the name must be the alias and the uid is unneeded.
- `/api/ai-rating` accepts `body.winner` as a self-declared verdict.
- `save-profile.mjs:40-58` stores untyped nested objects on the caller's
  own profile (self-harm only; cap and type it when convenient).
- `practice.html:6376` keeps the BYOK Anthropic key in localStorage;
  `index.html` uses sessionStorage. Align to sessionStorage.
- Second user-managed key `0bc839df…` (2026-04-02) on the Firestore
  service account has no known consumer. It was NOT deleted because it
  was never baked into a public file. Ask Aidan whether anything uses it
  (a local script, the iOS build), then delete it.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` are still unset, so every
  `lib/rate-limit.mjs` caller runs the in-memory fallback. Setting the
  two env vars is the single highest-leverage limiter fix and needs no
  deploy. Aidan's action, not yours.

## 3. Report shape

One markdown file, `ASTRA_SECURITY_REPORT_<date>.md` at the repo root:
shipped (commit, verification command, live result), proposed (rule or
diff plus blast radius), refused (what and why). Every live probe you cite
must be a GET or a request on an account you created and deleted. Do not
quote any key material, even partial, in the report.

## 4. Ground truth from the sweep

- The block on `/netlify/*` is load-bearing. A test in the pre-commit
  hook asserts it stays first and forced in both mirrors. If you ever
  move the functions directory outside `app/`, that is the better fix and
  the rule becomes redundant; until then do not touch it.
- `users/{uid}` is the only place the admin flag may live. Never accept
  `user_profiles.isAdmin` anywhere again, including in a new inline copy.
  Prefer `requireAdmin` from `lib/admin-auth.mjs` over a new inline gate.
- Deployed rules are verified byte-identical to `origin/main` before
  every rules deploy, and deployed from a worktree, never the local
  checkout (memory: a 3-hour outage on 2026-08-10).
- Rules changes ship with a Rules test API suite that includes cases
  proven to FAIL on the old ruleset. A suite that passes on its first
  run has not shown it tests anything.
