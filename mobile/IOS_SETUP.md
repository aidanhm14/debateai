# Debate AI — iOS Build Setup

This directory holds the **Capacitor** wrapper that turns
[itsdebatable.com](https://itsdebatable.com) into a native iOS app.

Below is everything you need to get from "nothing installed" to "running on
the iOS Simulator," then to the App Store. Follow top-to-bottom.

---

## App Store readiness — status + your checklist

**Done in code (2026-07-09), safe + inert on the plain web:**
- **Native payment gating** — `app/js/native-bridge.js` flags native mode
  (`window.__DB_NATIVE`, `<html class="dbnative">`) and hides every
  pricing / upgrade / checkout surface; the `/pricing` route redirects to
  `/native` in the app. `app/js/upgrade-cta.js` no-ops in native. This
  satisfies Apple **3.1.1 / 3.1.3** (no steering to web payment) while the
  product is free in beta. Loaded on index / debate-it / landing / pricing /
  coach / voice-debate.
- **JS-built paywall surfaces gated at source (2026-07-15)** — the
  paywall / limit-hit modals and upgrade CTAs that React builds in JS
  (which the CSS net can't catch) now branch on `window.__DB_NATIVE`:
  index.html (UpgradeModal price cards + button, CheckoutResumeModal price
  copy, TeamDashboard plan grids + Upgrade Plan / Manage Billing button +
  trial pricing card, Judge Analyzer and Live Debates pro gates, brain-lock
  and cap error strings, upgrade promo banners, checkout-resume deep link),
  debate-it.html (quota modal copy, account-modal Stripe button + upsell
  line, brain-row upgrade link, cap copy), voice-debate / newvoice / coach
  402 copy, learn.html (native-bridge added + cap alert). The
  native-bridge CTA sweeper also matches Upgrade / Go Pro / Upgrade Plan /
  Manage Billing labels. Web behavior is unchanged when the flag is off.
  Still needs the physical-device sweep below before submitting.
- **Native auth UI** — Apple and Google sit together in the app sign-in sheet.
  The Capacitor Firebase plugin returns provider credentials to the web Firebase
  session so the same account works across app and web.
- **App-first shell** — `/native` is the focused home, with a persistent native
  tab bar, safe-area handling, offline state, push opt-in, native sharing, and
  deep-link routing.
- **Safety and account lifecycle** — live human rooms include report and block;
  Profile includes account deletion.
- **Generated iOS project** — `mobile/ios/App` is tracked. Pods and build
  products stay untracked.

**Only YOU can do these (needs your Mac / Apple ID / money):**
1. **Install full Xcode** (~7 GB, App Store) + `sudo xcode-select -s
   /Applications/Xcode.app/Contents/Developer` — see Step 1.
2. **Enroll in the Apple Developer Program** — $99/yr, your Apple ID (Step 6).
   Approval can take a day.
3. **Enable Sign in with Apple in Firebase** — Firebase console → Auth →
   Sign-in method → Apple. Needs an Apple **Services ID** + a **Sign in with
   Apple key** (both created in the Apple Developer portal, so this waits on
   step 2). The native call site is already wired.
4. **Build and review the native project** — run the simulator and a physical
   device, then archive, upload to TestFlight, and submit.

**Pre-submission audit:** walk every reachable screen on a physical iPhone.
Confirm no pricing, upgrade, Stripe, or external purchase call to action is
visible. Verify Apple and Google sign-in, microphone permission, account
deletion, report/block, push delivery, and a complete voice round.

**IAP (later, not now):** when you exit beta and charge, digital
subscriptions MUST go through Apple IAP (30%). Path: RevenueCat + unhide a
native purchase flow (replace the `native-bridge` hide). Keep the web Stripe
flow for the website.

---

## What's already in this directory

```
mobile/
├── capacitor.config.ts       # Capacitor app config — appId, server, plugins
├── package.json              # Capacitor deps (@capacitor/ios, plugins)
├── IOS_SETUP.md              # this file
├── icons/
│   ├── build_ios_icons.py    # regenerator script
│   └── AppIcon.appiconset/   # 17 PNGs + Contents.json — drop into Xcode
└── splash/
    ├── build_splash.py       # regenerator script
    └── splash-2732x2732.png  # universal launch screen image
```

The tracked `ios/` folder is the release project. Run `npm ci`, `npx cap sync
ios`, and `pod install` after cloning it on a new Mac.

---

## Step 1 — Install Xcode + CocoaPods (one-time, ~45 min)

You currently have **Command Line Tools only**. The full Xcode app is required
to compile for an iOS device or simulator.

```bash
# Install full Xcode from the App Store (~7 GB download)
# https://apps.apple.com/us/app/xcode/id497799835

# After install, switch the active dev dir from CLT to Xcode:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Accept the Xcode license:
sudo xcodebuild -license accept

# Verify:
xcodebuild -version            # should print Xcode 16.x
xcrun simctl list devices       # should list iPhone simulators

# Install CocoaPods (Capacitor uses it for iOS dependency management):
sudo gem install cocoapods
pod --version                   # should print 1.15+
```

If `gem install cocoapods` fails with a permission error, prefer
`brew install cocoapods` (install Homebrew first if needed).

---

## Step 2 — Bootstrap the Capacitor iOS project (~5 min)

```bash
cd mobile/
npm ci
npx cap sync ios
```

The Xcode project is already tracked. If CocoaPods does not run during sync,
run `cd ios/App && pod install` manually.

---

## Step 3 — Drop in icons + splash

```bash
# From mobile/
cp -r icons/AppIcon.appiconset ios/App/App/Assets.xcassets/
cp splash/splash-2732x2732.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
```

Xcode will pick these up on next open.

---

## Step 4 — First simulator run

```bash
cd mobile/
npx cap sync ios          # writes config into the iOS project
npx cap open ios          # opens Xcode
```

In Xcode: select an iPhone 16 Pro simulator from the toolbar, hit ⌘+R.

The simulator should boot, show the orb splash for ~1.2s, then load
itsdebatable.com inside the WKWebView.

---

## Step 5 — Required Info.plist additions (Phase 2)

Open `ios/App/App/Info.plist` and add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Debate AI uses the microphone for live spoken debate rounds.</string>

<key>NSCameraUsageDescription</key>
<string>Debate AI may capture video of your delivery for self-review.</string>

<key>ITSAppUsesNonExemptEncryption</key>
<false/>

<!-- App Transport Security: allow our own domains -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><false/>
  <key>NSExceptionDomains</key>
  <dict>
    <key>itsdebatable.com</key>
    <dict>
      <key>NSIncludesSubdomains</key><true/>
      <key>NSExceptionAllowsInsecureHTTPLoads</key><false/>
    </dict>
  </dict>
</dict>
```

Apple **rejects** apps that use `getUserMedia` without
`NSMicrophoneUsageDescription`. Non-negotiable.

---

## Step 6 — Apple Developer Program enrollment ($99/yr)

Required to ship to TestFlight or the App Store. Sign up at
[developer.apple.com/programs](https://developer.apple.com/programs/).
Verification takes 24-48hr; do this in parallel with Phase 1 dev so it's
ready when we reach Phase 4.

Bundle ID we're using: **`com.debateai.debateit`** — register this exact ID in
your Apple Developer account before first archive.

---

## Step 7 — Firebase iOS app registration (Phase 2)

The web app's Firebase project (`debateos-78ac5`) needs an iOS counterpart:

1. Firebase Console → Project Settings → Add app → iOS
2. Bundle ID: `com.debateai.debateit`
3. Download `GoogleService-Info.plist`, drop into `ios/App/App/`
4. App Check → register for **App Attest** provider (Apple's iOS attestation)

This is what makes Sign In with Apple, App Check tokens, and FCM push all work.

---

## Step 8 — Push notifications (FCM) — the "go live" alerts

The web app already delivers push via VAPID Web Push. WKWebView has no Web Push,
so the native app uses **FCM** instead. **All the code is already done** — the
live site (`app/js/notifications.js`) detects the native shell, registers an FCM
token via `@capacitor-firebase/messaging`, and posts it to
`/.netlify/functions/push-subscribe`. The server (`lib/fcm.mjs` +
`lib/native-push.mjs`) delivers DM + go-live pushes to those tokens
automatically. You only do the native + console wiring below.

**8a. Install the plugin** (already in `package.json`):
```bash
cd mobile/ && npm install
npx cap sync ios
```

**8b. Create an APNs Auth Key and give it to Firebase** (one-time):
1. [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers
   & Profiles → **Keys** → ➕ → enable **Apple Push Notifications service (APNs)**
   → download the `.p8`. Note the **Key ID** and your **Team ID**.
2. Firebase Console (`debateos-78ac5`) → Project Settings → **Cloud Messaging**
   → Apple app config → **APNs Authentication Key** → upload the `.p8` + Key ID +
   Team ID. (This is what lets FCM talk to Apple's push servers.)
3. Make sure `GoogleService-Info.plist` is in `ios/App/App/` (Step 7).

**8c. Xcode capabilities** — open `ios/App/App.xcworkspace`, select the App
target → **Signing & Capabilities** → ➕ Capability:
- **Push Notifications**
- **Background Modes** → check **Remote notifications**

**8d. Server side** (one-time, no redeploy of code needed):
- In Google Cloud Console for `debateos-78ac5`, ensure the **Firebase Cloud
  Messaging API (v1)** is **enabled**.
- The Netlify functions already authenticate to FCM using the **same service
  account** that powers Firestore — no new secret. Just confirm that service
  account has the **Firebase Cloud Messaging API** permission (the default
  Firebase Admin / Editor role covers it).

**8e. Verify on a real device** (APNs tokens don't mint on the simulator
reliably — use a physical iPhone):
1. Build + run on your device, sign in with Google.
2. Accept the notification permission prompt.
3. In Firestore, confirm a doc appears at
   `push_subscriptions/{yourUid}/native/{hash}` with your FCM `token`.
4. From a second account (web is fine), hit **Available** / join `/spar`. Your
   phone should get a notification **even with the app backgrounded**, and
   tapping it opens `/spar`.

No changes to `app/` are needed for this — the bridge ships with the site.

---

## What still needs to happen (mapped to the plan)

| Phase | Item | File this lives in |
|---|---|---|
| 1 | Capacitor scaffold | `mobile/capacitor.config.ts` ✅ |
| 1 | iOS icons + splash | `mobile/icons/`, `mobile/splash/` ✅ |
| 1 | First simulator run | requires Step 1-4 above |
| 2 | Native mic via Capacitor plugin | `app/debate-ai.html` (detect native, swap recorder) |
| 2 | Sign In with Apple | `app/landing.html` (auth UI), Firebase console |
| 2 | Push notifications (FCM) | **Code done** (`app/js/notifications.js`, `lib/fcm.mjs`, `lib/native-push.mjs`); native wiring in Step 8 |
| 2 | Share extension | `mobile/ios/App/ShareExtension/` (created in Xcode) |
| 3 | RevenueCat IAP | `mobile/` deps + `app/pricing.html` (gate UI on platform) |
| 4 | Screenshots, ASC listing | App Store Connect web |

---

## Regenerating icons / splash later

If we update the logo, regenerate everything from one source PNG:

```bash
# From repo root, with /tmp/logo-env Python venv (has Pillow)
/tmp/logo-env/bin/python mobile/icons/build_ios_icons.py
/tmp/logo-env/bin/python mobile/splash/build_splash.py
```

Then re-copy into `ios/App/App/Assets.xcassets/`.
