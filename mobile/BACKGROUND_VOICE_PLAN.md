# Background voice ("FaceTime mode") — findings + plan

Goal: a live voice debate/coach session keeps working when the user
leaves the app (like a phone call). Researched 2026-07-09. Sources at
the bottom; verify against current iOS before building Option C.

---

## The hard constraint (verified, not a guess)

Our voice sessions are **WebRTC inside a WKWebView** (the web app talks
to OpenAI Realtime directly). On iOS:

- With `UIBackgroundModes: audio` (ALREADY SET in Info.plist), **incoming
  audio keeps playing** when the app is backgrounded.
- **The microphone is force-muted by the system** shortly after the app
  backgrounds. `WKWebView.setMicrophoneCaptureState(.active)` does not
  un-mute it while backgrounded. This is WebKit behavior, tracked in
  WebKit bugs 241480 / 233419.
- **CallKit does NOT fix this by itself.** The webview's WebRTC audio
  lives in a separate WebContent process with its own AVAudioSession;
  CallKit's mic authorization in the app process does not propagate into
  it (Apple forum threads 685268, 774784). So "just add CallKit" is a
  trap — you get call UI with a dead mic.

Net: the coach can keep TALKING to you in the background today, but it
cannot HEAR you, unless we do more.

## Options, cheapest first

### A. `audio` background mode — DONE (needs device rebuild to test)
One-way background: coach audio continues, mic suspends, session VAD
sees silence. Zero extra work. Test on device and measure how long iOS
lets the session live.

### B. Web Audio Session API — CHEAP, TRY NEXT (few lines, web lane)
iOS 16.4+ exposes `navigator.audioSession`; setting
`navigator.audioSession.type = 'play-and-record'` while a call is live
tells WebKit the page is a call-style session. On recent iOS this is the
sanctioned lever for keeping capture alive longer (it is how web calls
behave better in Safari). Support inside WKWebView varies by iOS
version — this is a "ship behind a flag and test on device" item.

Where: the voice pages (voice-debate.html / coach.html) — set it when a
session starts, gate on `window.__DB_NATIVE` + feature-detect
`navigator.audioSession`. NOTE: those files are in Codex's active lane;
coordinate or have Codex make the 5-line change.

### C. Native call layer + CallKit — THE REAL FIX (big lift)
Move the call's AUDIO off the webview into native code:
1. A Capacitor plugin owns the OpenAI Realtime WebRTC connection
   natively (native WebRTC stack or Apple's AVAudioEngine + the
   Realtime API's WebSocket/WebRTC from native).
2. CallKit + `voip` background mode wraps it: lock-screen call UI,
   stays alive in background, survives screen-lock — true FaceTime feel.
3. The webview becomes the UI only (transcript, controls) and talks to
   the plugin over the Capacitor bridge.

Effort: roughly 2–4 weeks of native work + a resubmission; real
maintenance surface. Only worth it if background voice becomes a core
differentiator. Skip `cordova-plugin-iosrtc` (effectively unmaintained).

### Non-option: nothing web-only fully fixes background mic in WKWebView
today. Do not burn time hunting a pure-JS fix.

## Recommendation
1. Test A on-device now (rebuild is staged; plug phone in).
2. Ship B behind a native-only flag; test on-device. If iOS honors it,
   we get most of the value for ~5 lines.
3. Hold C until the app has traction and background voice is proven to
   matter (App Store reviews / user asks). Decide then.

## Sources
- WebKit bug 241480 — WKWebView WebRTC loses mic input in background:
  https://bugs.webkit.org/show_bug.cgi?id=241480
- WebKit bug 233419 — WKWebView mic not working in background:
  https://bugs.webkit.org/show_bug.cgi?id=233419
- Apple Dev Forums — CallKit + WebRTC-in-webview session split:
  https://developer.apple.com/forums/thread/685268
- Apple Dev Forums — implementing WebRTC voice in background:
  https://developer.apple.com/forums/thread/774784
- WWDC21 WKWebView additions (getUserMedia in WKWebView):
  https://wwdcnotes.com/documentation/wwdcnotes/wwdc21-10032-explore-wkwebview-additions/
