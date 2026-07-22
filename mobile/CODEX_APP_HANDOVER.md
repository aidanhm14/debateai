# DebateIt iOS App — Handover for Codex (and any AI agent)

> Read this before touching anything under `mobile/` or before making a
> change meant to affect the iOS app. It explains what the app is, how it
> relates to the website, how to build/run it, the app-specific UI design
> system, and Apple's rules. Pairs with the repo-root `AGENTS.md` (website
> deploy topology) and `soul.md` (product/voice).

---

## 1. What the app is (one paragraph)

DebateIt is on iOS as a **Capacitor 6 wrapper** that loads the LIVE website
(`https://itsdebatable.com/native`) inside a native WKWebView. It is not a
separate frontend. The native shell adds: splash, status bar, keyboard,
share, push, camera/mic permission, and Firebase (Auth + Messaging)
plugins. The web content is the product; the shell is the frame.

- **Bundle ID:** `com.debateai.debateit` (the obvious ones `com.debateai.app`
  and `com.debateit.app` were already taken on Apple's global registry).
- **App name (under the icon):** `DebateIt` (`CFBundleDisplayName`).
- **Opens to:** `/native`, the app-only home with a persistent bottom tab bar.
- **Firebase iOS app:** registered under project `debateos-78ac5`,
  bundle `com.debateai.debateit`, config at
  `mobile/ios/App/App/GoogleService-Info.plist`.
- **Apple Team (dev):** Aidan's Personal Team, ID `35Z3KB54MV` (free tier —
  runs on his device; NOT enough for App Store, which needs the paid
  Developer Program team).

---

## 2. THE MODEL: auto-synced, app-specific look

Decided 2026-07-09. The app and website **share one codebase and one
deploy**, but the app can **look and behave differently** where we want it
to. Three lanes:

| You want to change... | Edit... | Affects |
|---|---|---|
| Shared feature / bug fix | normal website code | web AND app (auto) |
| APP only | `app/css/native-app.css` (+ `dbnative` gating) | app only |
| WEBSITE only | normal website CSS, tag app-hidden bits `data-web-only` | web only |

**Why not fully separate?** A bundled, independent app would need an App
Store resubmission (1–3 day review) for every change and would fall behind
the daily website ships. This model keeps the app current for free while
still letting it diverge.

### How the app knows it's the app
`app/js/native-bridge.js` runs on every key page. When it detects Capacitor
(`window.Capacitor`) it:
- sets `window.__DB_NATIVE = true` and `<html class="dbnative">`,
- injects the app design layer `app/css/native-app.css`,
- hides all pricing/upgrade/checkout surfaces (Apple rule, see §5),
- redirects `/pricing` → `/native`,
- redirects `/` and `/landing` → `/native`, and repoints any link resolving
  there at the app home. Nearly every page aims its wordmark and back arrow
  at `/`, which is the marketing landing; in the app that walked the user
  out of the shell. Bare `#hash` jumps are excluded on purpose.
- loads `app/js/auth-modal.js` and routes any "Sign in with Google" button
  into it, because that chooser is the one that also offers Sign in with
  Apple (guideline 4.8). See §5.

On the plain web it is inert (no `dbnative`, no changes) — every one of the
behaviors above sits behind an early return.

**Rule: the bridge must be on EVERY page the app can reach.** A page without
it renders as the full website inside the app, with its pricing links live.
On 2026-07-22 twelve reachable pages were missing it (community, credentials,
debate-online, high-school, india, judge, leaderboard, privacy, room-judge,
schools, terms, us) and ten of those carried a purchase reference. Check with:

```bash
cd app && for p in $(grep -oh 'href="/[a-z0-9-]*"' native.html coach.html \
  profile.html spar.html newvoice.html live.html debate-it.html \
  | sed 's/href="\///;s/"//' | sort -u); do
  [ -f "$p.html" ] && ! grep -q native-bridge "$p.html" && echo "MISSING $p.html"
done
```

### How to make an APP-ONLY change  ← the important part
1. Put the CSS in **`app/css/native-app.css`** (already scoped under
   `html.dbnative`, and only loaded in the app). This file is THE home for
   app design. Editing it cannot affect the website.
2. For show/hide in markup, use the hooks:
   - `data-app-only` → shows only in the app,
   - `data-web-only` → shows only on the web,
   - `[data-native-only]` / `[data-native-hide]` (from native-bridge) also work.
3. For app-only JS behavior, branch on `window.__DB_NATIVE`.
4. Ship it the normal website way (worktree → `origin/main` → Netlify). It
   reaches the app **live, no rebuild, no resubmission** — because the app
   loads the live site.

### When you DO need a native rebuild + resubmit (rare)
Only for changes to the native shell itself: `capacitor.config.ts` (e.g.,
the `server.url` entry point), Info.plist (permissions), app icon/splash,
adding/removing a Capacitor plugin, or the bundle ID/version. Those live in
`mobile/` and require the build steps in §4 plus a new App Store version.

---

## 3. App-specific UI design rules (what "app" should look like)

The website is designed browser-first; the app needs a few things the web
doesn't. Put all of this in `app/css/native-app.css`:

- **Safe areas.** The webview is full-bleed under the notch/Dynamic Island
  and home indicator. Pad fixed chrome with the `--safe-top` / `--safe-bottom`
  vars (already defined). Never let a fixed bar hide behind the island.
- **No browser chrome vibes.** Kill tap-highlight, long-press callout, and
  document-style text selection on UI (done); re-enable selection on real
  content (inputs, transcripts).
- **Hide web-for-web surfaces in the app:** "download our app" / smart-app
  banners, and anything that only makes sense to a website visitor. Tag them
  `data-web-only` or `data-app-promo`.
- **No purchase UI in the app.** Non-negotiable (Apple 3.1.1). native-bridge
  hides pricing/upgrade/checkout and bounces `/pricing`. If you add a new
  paid surface to the website, tag it so it stays hidden in the app.
- **Touch targets ≥ 44×44pt**, no hover-only affordances (there's no hover
  on touch), and momentum scroll.
- **The app opens to `/native`.** The app home is in `app/native.html`; shared
  native chrome and safe-area behavior live in `app/css/native-app.css`.

Keep it tasteful and on-brand (Crimson Pro, red accent, no em-dashes, no
banned phrases — same rules as the site; see `soul.md`).

**Open finding (2026-07-09 simulator walk):** on `/app` (index.html) at
phone width, the page's own internal top bar crowds 7 controls (wordmark,
Dark, EN, voice orb, Available, Manage, Sign Out) and the wordmark
overlaps a neighboring label. Likely a mobile-web bug too, not app-only.
Fix belongs in index.html's own bar layout (active Codex lane), not in
native-app.css.

**Audit pass 2026-07-22.** `/native`, `/coach`, `/profile`, `/spar` all come
back clean at 375pt: no horizontal overflow, no visible purchase CTA, no web
footer, tab bar mounted. Two known non-issues, so nobody re-reports them:
spar's `.waitlist-rail` sits at x -328 (the closed mobile drawer), and
schools' `.hero-art` runs ~30pt past the fold but is clipped by an ancestor,
so it crops rather than scrolls.

Handy check, with the bridge forced on in a desktop browser at 375px — the
app itself needs no rebuild for web-side changes, so this is the fast loop:

```js
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
fetch('/js/native-bridge.js').then(r => r.text()).then(s => (0, eval)(s));
```

---

## 4. Build & run (the exact working recipe)

This machine has a quirky toolchain; these are the commands that WORK.
Always export these first:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"     # CocoaPods lives here
export PATH="$HOME/.npm-global/bin:$PATH"          # firebase CLI lives here
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

**Why the Ruby PATH:** system Ruby is 2.6 (too old for modern CocoaPods).
CocoaPods 1.12.1 was installed with pinned Ruby-2.6-safe deps
(`gem install --user-install cocoapods -v 1.12.1` after pinning
`ffi 1.15.5` + `activesupport 5.2.x`). Do NOT `gem update` it. No Homebrew
on this machine.

Sync web/config changes into the native project, then pods:
```bash
cd mobile && npx cap copy ios        # push capacitor.config + www
cd ios/App && pod install            # only after adding/removing plugins
```

**Simulator build + run:**
```bash
cd mobile/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ./build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.debateai.debateit
xcrun simctl io booted screenshot /tmp/shot.png
```

**Device build + install (Aidan's iPhone, UDID `00008150-001679E40AA0C01C`):**
```bash
cd mobile/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -destination 'id=00008150-001679E40AA0C01C' \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=35Z3KB54MV -derivedDataPath ./build-device build
xcrun devicectl device install app --device 00008150-001679E40AA0C01C \
  ./build-device/Build/Products/Debug-iphoneos/App.app
# then on the phone: Settings > General > VPN & Device Management > Trust the dev cert
```

**Gotchas that already bit us (don't re-discover them):**
- `ENABLE_USER_SCRIPT_SANDBOXING = NO` is set on the App target — required or
  device builds fail with `Sandbox: deny file-read-data ...Pods-App-frameworks.sh`.
- Xcode 26 ships WITHOUT the iOS Simulator runtime; download once with
  `xcodebuild -downloadPlatform iOS` (~8.5 GB, no sudo).
- Physical device needs **Developer Mode** ON (Settings > Privacy & Security)
  and the dev cert **Trusted**, or apps won't launch.
- The Firebase plugins call `FirebaseApp.configure()` on launch — the app
  **crashes** if `GoogleService-Info.plist` is missing or the bundle ID
  mismatches. Regenerate it via the firebase CLI if you change the bundle ID:
  `firebase apps:sdkconfig IOS <appId> --project debateos-78ac5`.

---

## 5. Apple App Store compliance (must stay true)

- **3.1.1 / 3.1.3 — no web payment.** No pricing/upgrade/Stripe UI or links
  in the app. native-bridge enforces it; keep new paid surfaces tagged.
  Real revenue on iOS later = Apple IAP (RevenueCat), not the web flow.
- **4.8 — Sign in with Apple.** We offer Google, so we MUST offer Sign in
  with Apple in the app. The chooser in `app/js/auth-modal.js` does that
  (`renderChooser` adds "Continue with Apple" when `window.__DB_NATIVE`),
  and `openAuthModal()` falls back to plain Google on the web.

  The trap: nine surfaces ship their OWN Google-only button and never load
  the chooser (coach and spar are tab targets; also live, index,
  voice-debate, debate-it, learn, community, room-judge). The bridge now
  loads the chooser everywhere in the app and intercepts those buttons
  (capture phase, propagation stopped so the page's own popup does not also
  fire). **If you add a new sign-in button, label it with the word "Google"
  or it will not be routed** — the interceptor matches on the label.

  Still needs Aidan: the Firebase Apple provider (Services ID + key from
  the Apple Developer portal). The button is present and wired; until the
  provider is enabled it will error rather than sign anyone in.
- **4.2 — minimum functionality.** The release now has an app-only home,
  persistent native navigation, Apple and Google native auth, push alerts,
  native sharing, deep links, report/block, and account deletion. Keep those
  paths working in every submitted build.
- **Permissions** (Info.plist): mic + camera + photo-add usage strings are
  set. Keep them honest; Apple reads them.

---

## 6. What's left to actually ship to the App Store (needs Aidan)

1. **Paid Developer Program team** must appear in Xcode's Team dropdown
   (Personal Team can't submit). If freshly enrolled, allow ~a day.
2. **App Store Connect** → create the app record (bundle `com.debateai.debateit`).
3. **Screenshots** (6.9" iPhone) + listing copy + privacy answers →
   see `mobile/APP_STORE_LISTING.md`.
4. **Archive & upload:** in Xcode, Product > Archive (Release, real device
   target) → Distribute → App Store Connect. Then submit for review.
5. Enable Sign in with Apple (Firebase + Apple portal) — §5.

---

## 7. File map

```
mobile/
├── capacitor.config.ts          appId, appName, server.url (/native), plugins
├── ios/App/                      the native Xcode project (committed)
│   ├── App.xcworkspace           ← open this in Xcode, not the .xcodeproj
│   ├── App/Info.plist            name + permission strings
│   ├── App/GoogleService-Info.plist   Firebase config (bundle-matched)
│   └── Podfile                   CocoaPods (26 pods)
├── icons/AppIcon.appiconset/     branded app icons
├── splash/                       splash images
├── CODEX_APP_HANDOVER.md         this file
├── APP_STORE_LISTING.md          store copy + privacy + submit steps
├── BACKGROUND_VOICE_PLAN.md      background voice (FaceTime mode): findings + options
└── IOS_SETUP.md                  first-time toolchain setup

app/js/native-bridge.js           native detection + app-css inject + payment gating
app/css/native-app.css            THE app design layer (app-only styles)
app/js/auth-modal.js              window.dbAppleSignIn() (Sign in with Apple)
```
