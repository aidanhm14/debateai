# First live debate: investigation and fixes

Production data read on September 10, 2026 (EDT). The room window is August 28, 00:47 UTC through September 11, 00:47 UTC. Diagnostic events cover the preceding seven days.

## What the data establishes

The full 14-day query returned 180 room documents. Founder/team exclusions removed 85. For the remaining participants, earlier room records were checked across all four seat fields. **36 rooms contained at least one person in their first recorded seated round**, representing 53 first-time account IDs.

| First-recorded-round cohort | Rooms |
| --- | ---: |
| Created | 36 |
| Both sides registered presence | 34 |
| At least one finished-speech row saved | 16 |
| A winner's ballot saved | 11 |
| Completed unresolved panel result | 1 |
| No-contest result for missing speech | 2 |

Four rooms without a finished-speech row nevertheless had saved conversation segments. Thus absence of a finished speech does **not** prove nobody spoke or that their microphone failed. The largest measured gap is between arrival and completing speech, but the old events do not establish a causal ranking within that gap.

“First” means earliest recorded room for that account ID, not necessarily the person's first visit. Historical records without timestamps, different accounts, anonymous founder traffic, and private rooms without identifiable seats limit that inference. Room presence proves a page arrived, not that the video call connected.

## Three verified defects fixed

1. **Google sign-in cancels itself on repeated clicks.** Seven days of diagnostic events contain 65 sign-in errors in 33 sessions, including 45 `cancelled-popup-request` errors across 19 sessions. The direct Google handler had no pending-operation guard. Its returning-account path also opened another popup after Google had already returned a usable credential. Repeated clicks reproduced the conflicting-popup failure using the production function. The fix keeps one operation pending, disables the provider controls during it, reuses the returned credential, and restores controls after cancellation or redirect failure.

2. **A confirmed match can leave the screen waiting for a database listener.** The server's successful consent response was discarded; navigation required a later listener callback. A browser reproduction withheld that callback while the server confirmed both people, leaving the Accept button disabled indefinitely. The fix refreshes the authoritative document after consent and adds an independent HTTPS read when listeners fall behind, in both the queue and room. A bounded consent request restores the card on failure. Recovery never invents acceptance, overwrites pending local writes, or applies a read begun before a newer snapshot. Recent room-arrival loss supports investigating this stage; the previous telemetry cannot count how many real sessions suffered this exact transport failure.

3. **Media setup opens the microphone twice and can report success after denial.** The camera pipeline captured audio, then Daily was allowed to request a second microphone capture. A fully denied capture was converted into an empty stream, followed by “You joined with your mic only.” The before/after browser fixture reproduced two captures versus one, the false notice on denial, and successful retry after permission was restored. Daily now receives the existing microphone track; denial gets an accurate explanation and retry; camera-renderer failure still permits audio-only joining. Recent diagnostics include 30 no-video notices across 21 sessions and 21 transcription fallbacks across 16 sessions. Those legacy events did not distinguish camera-only trouble from failed audio, so these are symptoms, not counts of debates lost to this defect.

The HTTP recovery uses the signed-in person's Firebase token and remains subject to the same [Firestore Security Rules](https://firebase.google.com/docs/firestore/use-rest-api). No privileged read endpoint was added.

## Measurement shipped

`events.event = app_event`, `metadata.name = live_journey`, `metadata.version = 1`. Existing tracking supplies session, anonymous acquisition identity, and signed-in account identity. Room events also carry room ID and round-start time. No new transcript text, names, credentials, or device IDs are sent.

Stages distinguish auth start/completion/failure, consent result/timeout, queue state, room navigation/arrival, listener recovery/failure, media permission wait/failure/readiness, call join/failure, Start requested/blocked/started, transcript captured, speech save requested/succeeded/failed, judging requested, and actual decision/unresolved result.

For follow-up analysis, join by account/session and then room; use earliest historical seat timestamps to form the first-round cohort. Separate a waiting queue with no offer from a consent failure; separate room arrival from connected audio; separate Start not pressed from a blocked Start; separate captured conversation from a completed speech; separate a pending judgment, missing-evidence no-contest, completed tie, and decided ballot. Recovery counts include listener-gap duration and whether a snapshot had arrived; they should not be treated as lost debates.

`/api/admin/round-funnel` now reports actual outcomes, excludes identifiable founder/team traffic, and exposes captured speech separately from finished-speech rows. Previously `status: ballot` or any `completedAt` counted as completion, even with no decision. The response is definition version 2, so pre/post comparisons must use that definition consistently.

## Verification and limits

Browser checks used actual source functions with controlled dependencies, without matching real users or writing production rooms. They cover repeated sign-in, successful consent with a suppressed listener, duplicate microphone acquisition, denied microphone, and permission retry. Node regression checks additionally cover delayed/stopped reads, pending writes, REST authorization/refusal, credential reuse, a hanging consent token, renderer failure, transcript classification, and complete inline-script parsing.

Repository commit guards, including judge integrity, no-speech ballots, live-judge recovery, account admission, and mutual acceptance, pass. Rubrics, seasons, panel composition, evidence requirements, unresolved-result rules, and judging endpoints were not changed.

These are verified defects and a measured baseline, not a measured conversion lift. The new data is needed to quantify their contribution and prioritize remaining problems, including opponent availability and people leaving after a conversation has begun.
