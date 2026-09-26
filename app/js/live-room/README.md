# Live-room controllers

`app/live-round.html` retains the page composition, shared round state and
coordination with existing services. These classic scripts load before its
main script, with `data-page-source` so source guards also inspect them.

| Module | Responsibility |
| --- | --- |
| `timers.js` | Speech clock display, start/pause/stop and remote clock state |
| `speech-timing.js` | Versioned casual speech schedules, legacy compatibility and transactional pre-start timing saves |
| `round-start.js` | Agreement to current shared choices, per-person readiness and atomic first-clock start |
| `media.js` | Capture, camera modes, published tracks, media tiles and audio |
| `connection.js` | Daily call lifecycle, retries, network health and receive quality |
| `presence.js` | Seat/spectator heartbeats, departure/rejoin and quiet-room display |
| `draft.js` | Optional topic negotiation, client refresh, synchronization and controls |
| `topic-choice.js` | Optional blind strikes, safe snapshot merging and topic/side choice |
| `verdict.js` | Decision presentation, unresolved results and post-round actions |

Each controller receives explicit dependencies. The page's getters/setters
keep replaced state objects and mutable handles current. Callback adapters
also resolve at call time, preserving the design scenes' overrides. Do not
copy shared state into module-local snapshots. Factories define functions
without starting effects; `draft.attach` runs at its original setup position
and owns the draft's local state, listeners and timers. Browser globals stay
browser globals. Page forwarding functions preserve existing callers while
allowing later slices to move without a simultaneous rewrite.

The server still owns draft decisions, judge policy, billing and saved
rounds. These controllers do not alter their schemas or authorization.
Dormant team/format rendering remains for existing rounds.

Relevant checks: `live-room-modules`, `round-draft-sync`, `speech-countdown`,
`conversation-completion` and `live-room-views` in `e2e/tests`, plus the
source/runtime suites under `scripts`. The media tests stub devices and
Daily at their boundaries; they do not verify real media transport. Full
page `?design=` scenes allow appearance comparisons without live rounds.

Remote audio removal is shared by participant refresh and call teardown
through `media.removeAudio`. It detaches both microphone and judge tracks
from their elements and drops the registry entries; Daily retains track
ownership. Unused page adapters were removed after checking lexical callers.

Casual 1v1 timed rounds now save `speechTiming` (version 1, six durations)
separately from the existing `quick` format key. The default is 4/4/3/3/2/2
minutes. First timed Start transactionally sets `speechTimingLocked` before
the clock runs; duration edits and lock removal are denied after that.
Already-started rounds without this field, tournament rounds and team rounds
retain the legacy plan. `test-speech-timing.mjs` covers the migration and
shared settings; the room-panel browser suite covers visible timing controls.
