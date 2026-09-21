# Live capacity and recovery

Updated September 21, 2026. Target: 100 speakers in 50 rooms, with a 200-person total ceiling in a popular room. Aidan deferred the earlier 500-spectator target after the account limit was verified. This is a test target, not a supported concurrency claim.

## What changed

- The minute ballot schedule dispatches authenticated `ballot-recovery-background` jobs. Netlify reports that function's invocation mode as `background`. Paid judge calls no longer run inside the 30-second scheduled function. The existing judge continues to own evidence, season pins, verdicts and settlement.
- Recovery has three global worker slots by default, expiring dispatch reservations, durable retry delays (1–15 minutes), duplicate-delivery protection, and a rotating pending-room scan. `BALLOT_RECOVERY_CONCURRENCY` allows 1–10 slots; `BALLOT_SWEEP_MAX_PER_RUN` bounds dispatch. Do not increase these without measuring provider quotas and cost. At three dispatches per minute, an all-recovery backlog of 50 rooms takes at least 17 schedule ticks. The worker fix alone does not guarantee fast recovery of a site-wide outage.
- Matchmaking uses one bounded waiting query for the listener and fallback. Fresh listener snapshots are reused; overlapping match attempts are coalesced, notifications are debounced, and a stalled fallback read expires after ten seconds. Server pairing remains authoritative.
- One seated client refreshes the audience aggregate, with peer failover. `/api/room-watch-count` authenticates and verifies the seat before counting fresh watcher records. It returns a bounded count instead of downloading up to 1,001 documents to each participant. Failed counts preserve the previous display and do not stop presence. Private rounds return zero.
- Video admission uses server-only Firestore counters across function instances. The previous deployment had no shared Redis configuration, so in-memory counters could not enforce a site-wide ceiling. Per-person limits remain 12/minute and 90/hour. A partitioned site budget defaults to 6,000 admissions/hour; this counts joins and rejoins, not concurrent users. A missing budget fails closed with a retryable response; the endpoint stops waiting after six seconds.
- New Daily rooms default to 200 total participants, with mesh SFU, hidden viewers and adaptive simulcast enabled. Existing rooms retain their creation settings until they expire. The room ceiling remains configurable through `DAILY_ROOM_MAX_PARTICIPANTS`.

## Verified account limits

The live Daily API accepted a 200-person test room and rejected 550 with `property 'max_participants' cannot be set to that value with your current plan`. The isolated configuration test rooms were deleted. No deployed site or shared-account override was present for `DAILY_ROOM_HOURLY_CAP`.

The deferred 500-spectator room would also need its speakers and any approved audience-camera seats. Obtain Daily large-room enablement and billing/quota confirmation before setting a larger ceiling. A higher environment value alone will make room creation fail on the current account. Current token permission and private-room checks remain in place; increasing capacity never grants viewers sending permission.

## Measurements and limits

All provider tests used private expiring rooms, synthetic media/evidence, or isolated server-only database records. No real accounts, public queue entries, ratings or judge audits were created.

- Pure local checks: 600 admissions and 600 reconnects, exact shared quotas, retry/lease behavior, and 100-client matchmaking snapshots. These prove logic, not real throughput.
- Real Firestore: 600 admissions, 600 reconnects, 50 finish requests, 50 acceptances, 100 durable transcript receipts, 500 watcher writes and 10 aggregates all succeeded with **10 requests in flight**. Admission p95 was 4.1–4.3 seconds from the local generator; transcript-receipt p95 was 5.8 seconds. Fifty recovered rooms with duplicate delivery each invoked the stub judge exactly once.
- An earlier 600-in-flight Firestore burst failed with connection resets/timeouts. Counters were subsequently simplified and partitioned more widely, but the full 600-in-flight transport test has not passed. Do not describe the ten-in-flight test as 600 simultaneous users. Test regional distributed function workers before claiming launch capacity.
- Two attempted larger Daily runs (100 synthetic speakers across 50 rooms plus 100 viewers) stalled after 16 and 18 clients had joined. The local browser watchdog closed those runs; all temporary rooms were deleted. Neither run established provider capacity or an app-wide supported user count. The harness now bounds individual joins and stops scheduling after repeated failures.
- A one-room run with 198 intended viewers reached 40 joins before the local deadline. A final interleaved run targeting 100 speakers across 50 rooms plus 198 viewers reached 49 joins out of 298 intended clients (71 attempted), then failed its capacity check. All test rooms were deleted. These runs cannot isolate local generator, network or provider bottlenecks; distributed load testing is still required.
- The corrected small Daily transport test joined eight clients across two rooms, including four hidden viewers, and received audio and video on every client. It used 320×180 synthetic video at 5 fps. It does not represent real cameras, mobile devices or adverse networks.
- Three concurrent real judge panels produced all nine votes in 15.6, 17.5 and 23.2 seconds. Estimated token usage cost was $0.098. This is a small synthetic sample, not a 50-round verdict burst or a guaranteed latency.

The first real Firestore runner exited while BulkWriter cleanup was waiting on unreferenced timers. Measurements were recovered from its log and its exact test root was subsequently deleted. The runner now persists results before cleanup and keeps Node alive until cleanup finishes.

The deployed application regression run passed 147 browser checks, with one two-account live matchmaking check skipped because dedicated sign-in credentials were not configured. Judge integrity passed all 225 assertions. Conservative total test reservation: $22.28 of the authorized $25, including failed runs and database allowance. Actual billed usage was not reconciled.

## Reproduce deliberately

These scripts spend money and require explicit `--live`; they are never run by hooks or CI. Supply credentials through the operator environment, never source files. Preserve a cumulative test budget; this implementation pass was authorized up to $25.

```sh
node scripts/test-video-capacity.mjs
node scripts/test-live-scale-reads.mjs
node scripts/test-room-watch-count.mjs
node scripts/test-ballot-recovery-worker.mjs

# GOOGLE_SERVICE_ACCOUNT; isolated Firestore documents, stubbed AI
LOAD_CONCURRENCY=10 LOAD_REPORT_PATH=/absolute/path/firestore.json node scripts/load-live-control.mjs --live

# DAILY_API_KEY; private expiring rooms, synthetic media
LOAD_ROOMS=2 LOAD_VIEWERS=4 LOAD_REPORT_PATH=/absolute/path/daily.json node e2e/live-capacity.mjs --live

# ANTHROPIC_API_KEY, XAI_API_KEY, GEMINI_API_KEY; real pinned panel
LOAD_PANELS=3 LOAD_REPORT_PATH=/absolute/path/judge.json node scripts/load-judge-panel.mjs --live
```

Next release gate: verify 50 real rooms with media, 198 receive-only viewers with two speakers under the current 200-person room ceiling, authenticated joins through deployed functions, reconnect storms, and 50 simultaneous completed rounds including delayed/retried judge calls. Measure p95, errors, provider throttles and billed cost. Keep full transcripts and the durable finish protocol until another design proves equivalent evidence and recovery behavior.

References: [Netlify scheduled limits](https://docs.netlify.com/build/functions/scheduled-functions/#limitations), [background functions](https://docs.netlify.com/build/functions/background-functions/), [Daily large calls](https://docs.daily.co/docs/guides/scaling-calls/large-real-time-calls), [Firestore contention guidance](https://firebase.google.com/docs/firestore/best-practices).
