# Live-room controllers

`app/live-round.html` retains the page composition, shared round state and
coordination with existing services. These classic scripts load before its
main script, with `data-page-source` so source guards also inspect them.

| Module | Responsibility |
| --- | --- |
| `timers.js` | Speech clock display, start/pause/stop and remote clock state |
| `media.js` | Capture, camera modes, published tracks, media tiles and audio |
| `connection.js` | Daily call lifecycle, retries, network health and receive quality |
| `presence.js` | Seat/spectator heartbeats, departure/rejoin and quiet-room display |
| `draft.js` | Optional topic negotiation, client refresh, synchronization and controls |
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
