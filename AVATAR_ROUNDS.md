# Avatar Rounds

Debate as an avatar, not as yourself on camera. A muted persona bust
represents each debater; it comes alive when that debater speaks. The
camera is never used. That is the whole point: it lowers the social cost
of a live round (no face, no room, no lighting) while keeping the room
feeling occupied by two people arguing.

This doc covers the shipped Phase 1 (shared module + voice-debate
wiring) and the Phase 2 plan for the human video rooms.

---

## Design principles

- **Muted, not carnival.** Persona hues are deliberately desaturated so
  a wall of avatars reads calm and harmonizes with the warm-paper / ink
  / red (`#a4201d`) brand surface. No neon, no gradients-as-decoration.
- **Additive, never destructive.** Every hook degrades gracefully. If
  `window.DebaterAvatar` fails to load, the existing surfaces work
  exactly as before (voice-debate keeps its orb + abstract figures).
- **One source of truth.** The avatar generator was promoted out of the
  inline `landing.html` block into `app/js/debater-avatar.js`. Every
  surface mounts avatars through that module now.
- **Respect `prefers-reduced-motion`.** The speaking pulse (scale) is
  suppressed; only the glow-ring opacity fades in, so speaking is still
  legible without motion.
- **No em-dashes in user-facing copy** (soul.md). Periods, commas,
  semicolons only.

---

## Phase 1a — the shared module: `app/js/debater-avatar.js`

Plain vanilla JS, dependency-free, one file, standalone. Attaches
`window.DebaterAvatar`. Safe to load on the precompiled pages (it is an
external `<script>`, not part of a `data-precompile` block).

### Public API (`window.DebaterAvatar`)

| Member | Signature | What it does |
|---|---|---|
| `PERSONAS` | `Array<{key,name,style,hue}>` | The 17-persona roster (muted busts). Covers the debate-facing TTS personas. |
| `HAIR` | `Array<string>` | The three hair-silhouette SVG paths. |
| `get(key)` | `(personaKey) -> persona` | Resolve a persona; unknown/empty keys hash to a stable bust (never blank). |
| `svg(key, size)` | `(personaKey, px) -> string` | SVG markup for one bust. The mouth `<path>` carries `data-mouth` so the speaking controller can animate it. Each call gets a unique mouth id. |
| `render(container, opts)` | `{personaKey?, uid?, size?}` | Mount an avatar into a DOM node. `uid` (no `personaKey`) picks deterministically. |
| `pick(container, opts)` | `{onPick, current?, personas?, size?}` | Render a persona-picker grid of avatar buttons (for non-React pages). Calls `onPick(key)` on selection; marks `aria-pressed`. |
| `assignFromUid(uid)` | `(string) -> personaKey` | Deterministic persona from any stable string (same input -> same key, forever). Anonymous users keep one identity across visits. |
| `hashInt(s)` | `(string) -> uint32` | The stable hash behind `assignFromUid` (exposed for callers that want their own deterministic pick). |
| `attach(el)` | `(element) -> controller` | Wrap a mounted-avatar node and give it a speaking-state controller (see below). |
| `driveFromStream(stream, ctrl)` | `(MediaStream, controller) -> stopFn` | Build a WebAudio `AnalyserNode` on a mic/remote stream and pump `ctrl.setLevel` via `rAF`. Registers cleanup on the controller. |
| `driveFromElement(audioEl, ctrl)` | `(HTMLMediaElement, controller) -> stopFn` | Same, tapping a playing `<audio>`/`<video>`. Caches the `MediaElementSource` on the element (an element can only be routed once) and reconnects to `destination` so the user still hears it. |
| `injectCSS()` | `() -> void` | Inject the module's small, token-aware CSS. Idempotent (guards on `#dav-style`). Auto-runs on load. |
| `reducedMotion` | `boolean` | Whether `prefers-reduced-motion: reduce` matched at load. |

### The speaking-state controller (`attach(el)`)

```js
var ctrl = DebaterAvatar.attach(tileEl);
ctrl.setLevel(0..1);    // glow-ring intensity + subtle scale/pulse + mouth open, all proportional
ctrl.setSpeaking(bool); // toggles the active "is-speaking" state; glow is gated on this
ctrl.stop();            // detaches drivers, cancels rAF, resets the tile + mouth
```

Visuals are driven by a CSS custom property `--dav-level` (0..1) plus
the `.dav-live` / `.dav-speaking` / `.dav-reduced` classes on the tile.
The rendered level eases toward the latest target (`level += (target -
level) * 0.35`) so analyser spikes do not strobe. When not speaking, the
glow is gated to `level * 0.15` so a hot mic never lights the wrong
tile. The mouth path drops its control point proportional to level to
"open" while speaking (max ~7px), and restores to the base smile on
`stop()`.

Two easy drivers feed `setLevel`:

- `driveFromStream(mediaStream, ctrl)` — for a mic or a remote WebRTC
  stream.
- `driveFromElement(audioEl, ctrl)` — for a playing `<audio>`/`<video>`.

Both return a `stop` fn and also register it on the controller, so
`ctrl.stop()` tears the analyser + `rAF` down cleanly.

---

## Phase 1b — voice-debate wiring (`app/voice-debate.html`)

The audio-only Realtime surface. This is where "avatar vs avatar" lands.

What was added (all surgical, additive):

1. **Module include** in `<head>` (non-defer, so `window.DebaterAvatar`
   is ready before the precompiled React block runs).
2. **`AI_AVATAR_MAP`** — maps each `PERSONALITIES` key (verse, ash,
   coral, sage, ballad, shimmer, echo, alloy, examiner) to a
   `DebaterAvatar` persona. `aiAvatarKey(personaKey)` resolves it, with a
   hash fallback for unknown keys.
3. **User avatar state** — `userAvatarKey` React state, persisted to
   `localStorage['debateit-avatar']`. `getUserAvatarKey()` falls back to
   a deterministic hash of the Firebase uid (or the presence client id,
   or `'anon'`) so a first-time user still gets a stable face.
4. **Two live avatar tiles** — a `.player__avatar` node inside each of
   the existing user + AI `player__viz` cards. When the module renders
   the bust it becomes the primary portrait; the pre-existing abstract
   figure drops back to a faint backdrop (via `:has()`), so the two do
   not fight. If the module is absent, the tile stays empty (`:empty {
   display:none }`) and the figure remains the portrait as before.
5. **One rAF drive loop** (`useEffect` on `[status, personaKey,
   userAvatarKey]`) that reuses the same `aiAnalyser` / `userAnalyser`
   the orb already reads. The AI tile animates from the Realtime/TTS
   OUTPUT level; the user tile from the mic INPUT level. Speaking flags
   mirror `speakingRef` / `isUserSpeakingRef` so the glow only lights the
   side that holds the floor.
6. **A "Pick your avatar" step** on the setup screen (a React-rendered
   grid in the `el(...)` idiom, syncing `userAvatarKey`). Copy: "You
   debate as this figure. No camera. It comes alive when you speak."

Why reuse the existing analysers instead of `driveFromStream`: the orb
already taps both the AI remote stream and the mic into
`aiAnalyserRef` / `userAnalyserRef`. Re-tapping the same streams would
create duplicate `MediaStreamSource` nodes. The drivers
(`driveFromStream` / `driveFromElement`) exist for surfaces that do NOT
already have analysers wired (Phase 2, other pages).

---

## Phase 2 — human video rooms (`app/spar.html`, `app/live-round.html`)

**Not built. This is the plan.**

### The constraint

Both rooms use **Daily.co's prebuilt iframe** (`DailyIframe.createFrame`
/ `.wrap`). The iframe renders Daily's own participant tiles inside a
cross-origin frame we cannot reach into. That means **we cannot overlay
avatars on top of Daily's video tiles** and we cannot read per-tile
audio levels from inside the prebuilt UI.

### Two paths

**(a) Avatar mode = audio-only round with our own tiles. RECOMMENDED MVP.**

Run the round with Daily providing **audio transport only** (mic on,
camera off), and render our own two `DebaterAvatar` tiles in our own DOM
outside the iframe. Animate them from Daily's events:

- `active-speaker-change` -> `setSpeaking(true)` on the active
  participant's tile, `false` on the other.
- Audio level: prebuilt exposes `startLocalAudioLevelObserver()` /
  `startRemoteParticipantsAudioLevelObserver()` and emits
  `local-audio-level` / `remote-participants-audio-level` events with
  0..1 volumes per participant. Feed those straight into `setLevel`.
  (If we want finer control we can hide the iframe UI and drive purely
  from these events.)

This keeps the existing Daily plumbing (rooms, tokens, signaling,
matchmaking, the ballot flow) and only swaps the *visual* layer for
avatar tiles. Lowest-risk, ships fastest. A per-room "Avatar mode"
toggle lets a pair opt in; default stays video for people who want it.

**(b) Refactor to Daily's call-object (custom-UI) mode.**

Replace the prebuilt iframe with `DailyIframe.createCallObject()` and
build the tile layout ourselves. Then avatars can sit *alongside*
optional video (avatar for camera-off participants, live video for
camera-on ones), and we own every pixel. This is the richer end state
but it is a real refactor of two live surfaces (custom join/leave UI,
device pickers, screen-share, error states, network-quality
indicators — all of which prebuilt gives us for free). Do this only
after (a) validates that people want avatar rounds.

### Recommendation

Ship **(a)** first behind an "Avatar mode" toggle on `/spar` and
`/live-round`. Reuse the exact module + controller from Phase 1; the
only new code is a thin adapter that maps Daily's
`active-speaker-change` + audio-level events onto `setSpeaking` /
`setLevel`. Revisit **(b)** only if Avatar mode earns its keep.

### Explicitly out of scope

**Real-time face replacement (Memoji-style).** Mapping the user's real
facial expressions onto a rigged avatar needs face-tracking (FaceMesh /
MediaPipe) + a rigged 3D or morph-target avatar + per-frame blendshape
solving. That is a different, much heavier project (perf, model
download, licensing, uncanny-valley tuning) and is not worth it for the
"lower the social cost of a live round" goal. Audio-reactive busts get
95% of the presence for ~1% of the cost.

---

## Files

- `app/js/debater-avatar.js` — the shared module (new).
- `app/voice-debate.html` — Phase 1b wiring (edited).
- `AVATAR_ROUNDS.md` — this doc (new).

## Verification status

- `node --check app/js/debater-avatar.js` — passes.
- Logic tests (headless): `assignFromUid` determinism (same uid ->
  same persona; all 17 personas reachable over 2000 uids), `get()`
  fallback, SVG shape (persona hue + red lapel + unique mouth ids),
  `attach()` level->visual math (eases up while speaking, gated to
  ~0.15x when not, mouth opens/closes, `stop()` resets), and
  AI-map-target validity — all pass.
- The precompiled inline React block in `voice-debate.html` parses
  clean after the commit-time precompile pass.
- **Visual / browser QA is PENDING** and must be done by the founder on
  the branch (no browser was available in the build environment). See
  the test steps in the PR / final report.
