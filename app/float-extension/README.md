# DebateIt — Floating Round (Chrome/Edge extension)

A one-click launcher for a DebateIt voice round you can keep on top of your
other apps while you work.

## What it does

The toolbar button opens (or focuses) a DebateIt voice round at
`debateai.com/voice-debate`. Inside the round, the **⧉ Float over apps**
button pops it into an always-on-top window (Document Picture-in-Picture)
that stays visible over Slack, docs, your editor, anything — with a live
transcript, timer, mute, a one-tap **POI** (cut in to make a point), and end
controls. Audio (your mic and the AI) keeps running in the background.

The round also **auto-floats** the moment you switch away from the tab, if
"Auto-float" is left on in the round controls.

## Honest scope

The actual floating is done by the web app itself (Document
Picture-in-Picture), which works in Chrome and Edge. This extension is just a
persistent launcher, so you don't have to find the tab first. If you already
keep the round tab open, you don't strictly need the extension — but the
toolbar button is a faster entry point.

Firefox/Safari don't support Document PiP yet; there the round falls back to
an in-browser floating panel ("Minimize"), which stays on top of the site but
not over other desktop apps.

## Load it (unpacked)

1. Go to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `float-extension` folder.
4. Pin the DebateIt icon to your toolbar. Click it to start a floating round.

## Files

- `manifest.json` — MV3 manifest (action popup + `tabs` permission to
  find/focus an existing round tab).
- `popup.html` / `popup.js` — the launcher UI and the open-or-focus logic.
