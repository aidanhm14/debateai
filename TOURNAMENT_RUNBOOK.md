# Tournament Runbook · Debatable

Operations manual for running an online tournament on itsdebatable.com.
Written 2026-08-10 against the production stack (tournament engine,
live rooms, Watch). Executable by any competent organizer; nothing here
requires reading the code. Where a step needs the site owner (Netlify
env vars, Daily dashboard, admin account) it says so.

Planning defaults used in the cost tables: 128 entrants, 1v1, 4 prelim
rounds, break to 16, 30 to 45 minute rounds, up to 64 rooms at once,
one organizer plus a small judge pool. Every number is an input, not a
constraint; the engine caps at 9 prelims and a break of 32, and 2v2 is
supported (entrants register a formed duo from /partners).

---

## 1. Roles

| Role | Who | Does |
|---|---|---|
| Director | tournament host account | Everything in the /tournament control room: registration, check-in, draws, motions, results, break, advance. Only the host account (or a site admin) can run these. |
| Site owner | Aidan | Netlify env vars (kill switch, caps), Daily dashboard, /admin (stream start/stop, recordings publish/unpublish), Firestore console. |
| Judges | trusted volunteers | Sit in rooms as spectators, report the winner to the director (chat, DM, or a shared sheet). The AI judge writes a ballot in every room regardless. |
| Tech marshal | any trusted person | Watches the health line in the control room, chases missing teams, fields "my room is broken" reports. Can be the director at small scale. |

## 2. How the machine works (one paragraph)

The director creates a tournament at /tournament (it starts private),
opens registration, and shares the link. Entrants register and later
check in. The director pairs each round (draws stay hidden until
released), attaches the motion, and releases it; every participant's
page then shows "You are Gov against X, join your room." Rooms are
Daily video rooms inside /live-round with the AI judge listening.
The director enters each result in the control room; the tab updates
live; after the last prelim the director breaks to elims, releases
bracket rounds, and advances until a champion is recorded. Spectators
can read everything without an account and watch rooms; the main stage
is a separate owner-only broadcast started from /admin, surfaced on
/watch and the landing.

## 2b. Money: there isn't any on the entry side

Competing is free at every tournament and there is no paid tier
(decision 2026-08-10, soul.md decision log). `entry-checkout.mjs`
refuses with a 410 behind a code constant, so no charge can fire even
though `ENTRY_PAYMENTS_LIVE` is still `true` in the Netlify env. If a
tournament doc still carries a non-zero `entryFeeCents`, that is stale
data: set it to 0, and never advertise a pay-in.

Where prizes are offered, they come out of the organizer's pocket and
are paid manually after a human reviews the final ballots. Cash goes
only to winners aged 18 and over; a younger winner keeps the placement
and the title, and the cash passes down. That age rule is doctrine
(money never reaches minors), not an organizer preference, so it is not
yours to waive at an event.

## 3. Hard limits and switches (site owner)

- Interactive rooms cap at 8 participants (2 to 4 debaters, judge,
  a few invited spectators). Big audiences belong on the broadcast
  stream or Watch, never in the room.
- Rooms expire 24h after creation; Daily ejects at expiry. Nothing
  accumulates.
- Recording caps at 3h per room and only starts after every seated
  debater consents (adult-or-guardian attestation required by the
  server).
- `DAILY_ROOMS_DISABLED=1` (Netlify env) is the kill switch: blocks
  creation of NEW video rooms sitewide, does not interrupt rooms
  already running. Set it, redeploy or wait for the next deploy, unset
  to resume. Use for a billing emergency, not for schedule slips.
- `DAILY_ROOM_HOURLY_CAP` (default 1200) is the sitewide hourly
  room-creation backstop; per-caller limits are 12/min and 90/hour.
- Stopping a runaway stream: /admin → stream card → Stop. Stopping a
  recording: any seated debater withdraws consent, or finish the
  round; the site owner can also stop it from the Daily dashboard.

## 4. Costs (Daily.co, verified 2026-08-10)

Rates: video $0.004 per participant-minute; cloud recording $0.01349
per recorded minute plus $0.003/min-month storage; RTMP out $0.015 and
HLS $0.03 per encoded minute. 10,000 participant-minutes free each
month. Card on file raises concurrency limits; check the dashboard
(section 11) before announcing.

Formula: participant-minutes = rooms × people-per-room × minutes ×
rounds. People per room = debaters + judges + anyone else physically
in the video call. Interactive spectators multiply cost; the broadcast
does not (one encoded stream regardless of viewers).

128 entrants, 1v1, 40-minute rounds, 3 people per room (2 debaters +
1 judge/marshal), 4 prelims + break to 16 (15 elim rooms):

| Case | Assumptions | Participant-min | Video cost |
|---|---|---|---|
| Low | 64 entrants, 3 prelims, 30 min, 2.5 avg people | ~8,600 | ~$0 (inside free tier) |
| Expected | as above, few invited spectators | ~35,000 | ~$100 to $140 |
| High | every room at the 8-person cap, 45 min | ~120,000 | ~$440 to $480 |

Add-ons: recording all 15 elim rooms (~600 min) ≈ $8 plus ~$2/month
storage; a 6-hour RTMP main stage ≈ $5 (HLS ≈ $11). AI ballots ride
existing Anthropic spend; each of ~270 rounds ends in one ~8K-token
ballot call, so expect a same-day Claude burst, not a Daily charge.
The 8-person room cap is the structural cost ceiling: the worst case
cannot exceed cap × rooms × minutes no matter how many people show up.

## 5. T-minus checklists

### T-7 days
- [ ] Site owner: Daily dashboard check (section 11): plan, card,
      concurrency, recording enabled. Do not announce before this.
- [ ] Site owner: confirm `DAILY_ROOMS_DISABLED` is unset and
      `UPSTASH_REDIS_REST_URL/TOKEN` are set (shared rate-limit
      counters; without them limits are per-instance best effort).
- [ ] Director: create the tournament, set format, team size, prelim
      count, break size, start time. Ask a site admin to flip it
      public once reviewed.
- [ ] Dress rehearsal (section 12) with at least 4 rooms.
- [ ] Publish the tournament link everywhere entrants live.

### T-24 hours
- [ ] Registration numbers sane? An odd field just means byes.
- [ ] Judge pool confirmed; each judge knows which rooms they cover
      and how to reach the director.
- [ ] Draft round schedule with 15-minute buffers between rounds.
- [ ] Site owner: /admin loads, stream card works (start + stop a
      10-second test stream off-hours).

### T-2 hours
- [ ] Director: status → registration closed is NOT yet needed; open
      CHECK-IN instead: tell entrants to press Check in on the
      tournament page. The control room shows "N of M checked in."
- [ ] Smoke one room end to end: two accounts, join, speak, ballot.

### T-15 minutes
- [ ] Check-in sweep: call out missing teams. Drop confirmed
      no-shows (Entries list → Drop) so the draw is honest.
- [ ] Pair round 1 (draw stays hidden), attach the motion, hold.
- [ ] Start the main-stage stream if using one (/admin).
- [ ] Release round 1 on schedule.

## 6. Round loop (repeat per round)

1. Pair round N. The engine pairs checked-in entries only (once two
   or more have checked in), avoids rematches, balances sides, and
   reports pull-ups/rematches to you. Redraw if something looks wrong;
   nobody has seen it yet.
2. Attach the motion, release. Participants' pages flip to "join your
   room" automatically (the page self-refreshes every 30s).
3. During the round: watch the health line (results in: X of Y).
   Judges (or the debaters themselves at small scale) report winners.
4. Enter each result. Speaker points optional. A mistyped result:
   press Correct on that pairing; the server reverses the old result
   before applying the new one, so the tab never double-counts.
5. Record the bye if the round had one (one button).
6. When all results are in, pair the next round.

## 7. Failure playbook

| Failure | Move |
|---|---|
| Team no-shows after release | Enter the result as a walkover win for the present team (0 speaks), or re-draw if before anyone debated. Drop the entry so the next draw skips them. |
| Team arrives late | Entries list → Restore (or Check in). They enter the next draw; the current round stands. |
| Room will not load for one side | Refresh first (state survives refresh; the round doc is server-side). Then have BOTH sides rejoin from the tournament page link. The room is idempotent: same link, same room. |
| Room irrecoverably broken | Redraw is wrong once released. Have the pairing debate in a fresh ad-hoc room: open /live-round with a new room name and the same sides, or run it on the next round's slot; enter the result manually either way. |
| Result entered wrong | Correct button on the pairing (reverses then reapplies). |
| Dispute over a ballot | The AI ballot is advisory to the tab; the DIRECTOR's entered result is the record. Hold the result (do not enter it), hear both sides, decide, enter. Every draw is seeded and reproducible if a pairing itself is disputed. |
| Round running long | Nothing breaks; pair the next round only when results are in. Announce the delay in the stream/chat. |
| Recording must stop NOW | Any seated debater presses withdraw on the consent card, or site owner stops from Daily dashboard. Withdrawal also blocks publication. |
| Replay must come down | /admin → recordings → unpublish (takes effect immediately; Watch links die because playback links are minted per view). |
| Video misbehavior / abuse | Report from the room; video-moderate strikes and Daily eject with ban are wired. Site owner can hard-ban from /admin. |
| Daily outage or billing stop | Set `DAILY_ROOMS_DISABLED=1` to stop new-room spend cleanly; pause the tournament (status → break), announce, resume later. Rounds already live keep running to expiry. |
| Pause the whole event | Status → break (public page shows Break announced). Resume by pairing the next round. Cancel: status → cancelled. |

## 8. Recording, Watch, minors

- Recording is OFF by default in every room. It starts only when every
  seated debater (2 in 1v1, all 4 in 2v2) independently accepts the
  per-round scope, each attesting they are an adult or have guardian
  approval. The server enforces this; there is no organizer override
  to force recording on.
- Unanswered consent = not recorded. Declining never blocks the debate.
- Withdrawal mid-round stops capture and permanently blocks publication
  of that round.
- Consent receipts are written server-side to a private append-only
  collection (`recording_consents`), stamped with policy version and
  scope text.
- Publication: a 5-minute sync auto-publishes only recordings whose
  round doc proves complete consent under the current policy version.
  Organizer streams auto-publish. Everything else needs /admin.
- Policy for a school-age field: leave prelims unrecorded (just do
  nothing; recording never starts without consent), offer recording on
  elims only, and say so in the event announcement.
- Retention: no automatic deletion exists yet (decision pending with
  Aidan; see report). Post-event, review /admin → recordings and
  delete from the Daily dashboard what should not persist.

## 9. Spectators and the main stage

- The public tournament page needs no account: draw, tab, bracket,
  live status all render for a cold visitor, with per-state copy
  (registration open, prelims running, break announced, elims,
  complete, cancelled).
- Room watching: pairings show a Watch button; public rounds gate
  admission through a join request, unlisted rounds admit by link.
  Keep invited-room spectators to a handful; the 8-seat cap is shared
  with the debaters.
- Main stage: /admin → start stream (owner-only broadcast, up to
  200 to 300 watch-only viewers on the default cap, `DAILY_MAX_PARTICIPANTS`
  env raises it). It appears on /watch and injects a live band on the
  landing automatically. For an audience beyond that cap, point the
  broadcast at YouTube/Twitch via RTMP instead of scaling Daily seats
  (Daily supports RTMP out at $0.015/min; this needs a small
  stream-control change to attach an rtmpUrl, currently not wired).
- Finished, consented replays and clips live on /watch.

## 10. Go / no-go (T-0)

GO requires all of:
- [ ] Daily dashboard verified this week: card, plan, recording,
      concurrency comfortably above room count × people per room.
- [ ] Dress rehearsal completed at ≥4 simultaneous rooms without an
      unexplained failure.
- [ ] Director + at least one backup person hold host access and have
      run one full pair → release → result → correct cycle.
- [ ] Judge pool ≥ 1 judge per 8 rooms, briefed.
- [ ] Check-in flow tested by a real entrant account.
- [ ] Kill switch tested once (set, observed 503 with pause message,
      unset) in the last month.
- [ ] Schedule with buffers published to entrants.

NO-GO if any of: Daily card/plan unverified; rehearsal skipped;
a single point of failure on the director (no backup host); recording
promised publicly but consent flow untested.

## 11. Site-owner dashboard checks (needs login, ~10 min)

Daily dashboard (dashboard.daily.co, domain `debateai`):
- Billing: is a card attached? Which plan? (The API cannot answer
  this; 0 recordings exist to date, so recording is UNPROVEN end to
  end on this account even though room-level enablement is accepted.)
- Usage: participant-minutes this month vs the 10K free tier.
- Limits: max concurrent participants/sessions for the current plan.
- Alerts: set a billing alert if the dashboard offers one.

Netlify (app debateos1): env vars `DAILY_API_KEY`, `DAILY_DOMAIN`,
`DAILY_ROOMS_DISABLED` (unset normally), `DAILY_ROOM_HOURLY_CAP`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (last two were
unset as of 2026-07-28; set them before a real event so rate limits
share one counter).

## 12. Dress rehearsal recipe (recommended: T-7 to T-3)

8 to 12 real humans, 4 to 6 rooms, 2 short rounds, 20 minutes total:
1. Everyone registers + checks in on a private tournament.
2. Pair, release with a motion; everyone joins their room.
3. One planted no-show: practice Drop + walkover.
4. One planted wrong result: practice Correct.
5. One mid-round refresh per room: confirm the round survives.
6. Break to a 2-team final, advance, confirm champion renders.
7. If recording matters for the real event: both debaters in ONE room
   consent, record 2 minutes, finish, confirm it appears in /admin
   recordings and plays on /watch. This is the end-to-end recording
   proof the account has never produced.
Success = all seven pass without touching code or the console.

## 13. Escalation

- Site owner: Aidan (aidandavidhollinger@gmail.com).
- Netlify deploys: push to main auto-deploys in ~60s; rollback is
  redeploying the previous commit from the Netlify UI.
- Daily status: status.daily.co · Netlify status: netlifystatus.com
- Firestore console: Firebase project `debateos-78ac5`.

## 14. Post-event

- [ ] Enter any outstanding results; advance to champion; status →
      complete (page shows the champion).
- [ ] Stop the stream; confirm recordings synced (/admin).
- [ ] Unpublish anything that should not be public; delete unneeded
      raw recordings in the Daily dashboard (storage bills monthly).
- [ ] Note participant-minutes used (Daily dashboard) against the
      estimate in section 4; correct the model.
- [ ] Write down every manual intervention; each one is the next
      engineering ticket.
