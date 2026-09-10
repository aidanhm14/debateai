# Debatable for iPhone and Android

## Product surface

Both platforms load `https://itsdebatable.com/native`. The shared home leads
with people, the existing talking-face clips in a moving strip, and **Find someone**.
The five tabs are **Home, People, Watch, You, Leaderboard**. AI voice remains available
from Home as **Debate the AI**.

The home uses existing matchmaking, friendships, messages, video, recordings,
auth and safety routes. Public counts come from the queue endpoint and fall
back to neutral wording when unavailable. Personal friends come from the
signed-in person's existing friendship records. It does not create accounts
or join a queue on load.

Faces reuse the landing page’s existing silent talking clips, with the consented
stills as posters. Only visible clips play. Motion pauses when the page is
hidden, respects reduced-motion preferences and has a visible pause button.
The phone header and photo strip are compact so the main action fits above
the tab bar. Its supporting text has 13:1 contrast against a white background.
The first-screen copy is intentionally direct: “Debate someone.” and “Meet
a real person. Talk it out.” Do not restore “Different opinions. Good company.”

## Source

- `app/native.html`: shared native home.
- `app/js/native-home.js`: discovery, friends, sharing and photo controls.
- `app/js/native-bridge.js`: native integration and five-tab navigation.
- `app/css/native-app.css` and `css/native-app.css`: matching style files.
- `mobile/android/`: Android shell, Google Firebase client config and icons.
- `mobile/ios/`: existing iPhone shell.

`?native-preview` enables app chrome only on localhost and persists through
local navigation. It never enables native preview on the production website.

## Android build

Requires JDK 17, Android SDK platform 36 and build-tools 35.0.0 and 36.0.0. The Gradle
wrapper pins Gradle 8.11.1; the Android plugin is 8.9.2. SDK and Java paths
belong in the local environment, never in committed machine-specific paths.

```sh
cd mobile
npm ci
firebase apps:sdkconfig ANDROID 1:860359449192:android:3eb4292558c2760a4fb9dd --project debateos-78ac5 > android/app/google-services.json
npm run android:build
```

Set `JAVA_HOME` and `ANDROID_HOME` for your installation, or create an ignored
`android/local.properties` containing `sdk.dir=/absolute/path/to/android-sdk`.
The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

Firebase Android app: `1:860359449192:android:3eb4292558c2760a4fb9dd`.
Package: `com.debateai.debateit`. Google sign-in requires the installed
build's signing certificate fingerprints registered with this Firebase app.
After adding a certificate, download its updated `google-services.json`.
This client configuration is ignored by the repository and must be downloaded
with an account that has access to the existing Firebase project. The debug
key lives in the ignored `android/debug.keystore`, local to this workspace.

Release signing credentials are deliberately external to the repository.
Before Play upload, configure the release signing key, register the Play
app-signing certificate in Firebase, and build a signed app bundle. Android
App Links verification also needs that release certificate in the site's
`assetlinks.json`; do not assume web URLs open the installed app yet.

## iPhone and store verification

The existing iOS build 11 already loads this shared web surface. Aidan confirmed microphone and camera working on his iPhone on September 10.
This is user-reported device evidence. Sign-in recovery and push still need verification.
The source safety guard and IPA audit are supporting checks only.

Before submitting either platform, test on physical devices: cold launch,
Google sign-in (and Apple sign-in on iPhone), terms acceptance/refusal,
microphone/camera permission refusal and recovery, one real controlled round,
messages with the keyboard visible, notification opt-in, offline recovery,
blocking/reporting and account deletion. Use controlled test accounts for
UGC safety evidence. Do not fabricate reports against public users.

The Apple review response remains a draft. Its physical-iPhone evidence
recording still needs to be captured and attached before submission. See
`APP_REVIEW_RESPONSE_2026-09-01.md` for the existing rejection and proof steps.

## Verified on September 9, 2026

The Android debug build passes `assembleDebug` with all 356 tasks complete.
The APK signature, package ID, SDK levels and bundled live-server configuration
were checked. Its debug SHA-1 is
`B6:44:77:4B:6B:38:04:71:6A:48:41:12:27:81:AD:0B:45:2E:DB:5E`,
registered with the Firebase Android app. No Android device was connected, so
installation, Google sign-in, calls and push still need physical-device checks.

The shared home is deployed in commit `4ebbf67`. Browser checks confirm the
main action clears the tab bar at 320×568 and 393×852, visible clips play muted,
the pause control stops all motion, and reduced-motion preferences show stills.
The repository commit hooks and the hosted smoke check pass.

## September 10 updates

Home uses the public-domain U.S. Capitol photo for universal-basic-income
topics, the existing supplied Discord screenshot, and approved community
faces. The AI voice action uses a warm gradient with gentle press feedback.
Leaderboard is the fifth tab, after You.

The phone round uses the full width for its topic, a 44px recording control,
and fixed conversation/speech start choices. After a speech begins, Camera
view expands the call and hides supporting details. Show details restores
them; the decision exits Camera view automatically. Clock, speech controls,
recording status and the existing call/safety controls remain available.
The call element is never moved or restarted by this display preference.
