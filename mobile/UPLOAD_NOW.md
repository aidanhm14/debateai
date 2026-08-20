# Upload Debatable to App Store Connect

Updated 2026-08-10. The artifact and signing details below were verified
directly from the exported IPA on this Mac.

## The artifact

**`~/mobile/build/v10/Debatable.ipa`**. Version 1.0, **build 10**, 6.9 MB.

- SHA-256: `39a3a64ec0376e180995039a0ea07c531167a9e68dc82da6175ed5a414f903e8`.
- Archive and App Store export both completed successfully on 2026-08-19.
- Minimum iOS **15.0**. Build 9 was 13.0 and drew Transporter warning 90068
  on upload: Apple refuses anything under 15.0 from Spring 2027. It is only a
  warning today, so build 9 still delivered, but every later build should be
  15.0 and the verifier now enforces it. iOS 15 reaches the iPhone 6s, so
  nothing anyone still debates on is excluded.
- Carries the offline screen (see below). Supersedes v7, v8 and v9.
- Points at `https://itsdebatable.com/native`.
- Uses `DebatableApp/1.0`; no legacy domain is present in the navigation allowlist.
- Camera, microphone, and photo-library permission copy all says Debatable.
- Signed **Cloud Managed Apple Distribution** (`35Z3KB54MV`), profile valid to 2027-07-16.
- Entitlements: `aps-environment=production`, `beta-reports-active`,
  Sign in with Apple, `get-task-allow=false`.
- `ITSAppUsesNonExemptEncryption=false`, so Apple should not ask about export compliance.

Do not upload build 6. Its signed payload still contains three old DebateIt
permission labels and the old user-agent. Build 7 fixes those release defects.

Repeat the release audit at any time:

```bash
node scripts/verify-ios-release.mjs ~/mobile/build/v10/Debatable.ipa 10
```

The verifier checks ZIP integrity, identifiers, build number, permission copy,
server and navigation configuration, distribution signing, production push,
TestFlight reporting, Sign in with Apple, debug status, and symbols.

## Step 1: Upload (~10 min + processing)

App Store Connect record already exists: app ID `6791712877`, bundle
`com.debateai.debateit`. Do not create a second one.

**Transporter** (installed at `/Applications/Transporter.app`):

1. Open it, sign in with your Apple ID (normal 2FA)
2. Drag in `~/mobile/build/v10/Debatable.ipa`
3. Let it validate, then **Deliver**

CLI alternative, using an app-specific password from appleid.apple.com.
Type the password yourself, never paste it into a chat:

```bash
xcrun altool --upload-app -f ~/mobile/build/v10/Debatable.ipa -t ios -u <your-apple-id> -p <app-specific-password>
```

Then wait 10-30 minutes for processing. Apple emails you.

Rebuilding later? Bump `CURRENT_PROJECT_VERSION` first. App Store Connect
rejects a build number it has already seen.

**2026-08-19 correction: `build/v8/Debatable.ipa` exists and is build 8**,
exported 2026-08-11, one day after this section was written. The Xcode
project had been left back at `CURRENT_PROJECT_VERSION = 7`, so anyone
rebuilding would have produced build 7 a second time and been rejected on
upload. The project is now at **9**, which is clear of both. Confirm what
App Store Connect has already accepted before assuming 8 is free.

## Step 2: TestFlight (~10 min, no Apple review)

App Store Connect → TestFlight → Internal Testing → new group → add your
own Apple ID. Internal testing skips Beta App Review, so it is immediate
once processing finishes.

**Test these two things on the real phone, in this order:**

1. **A full voice round.** Microphone access inside the Capacitor WebView
   is the one thing that has never run on hardware, and the product depends
   on it.
2. **Sign in with Apple.** The Firebase provider is enabled (verified
   2026-07-28), but the native flow has only ever been exercised in a
   simulator with no iCloud account, where it cannot succeed. A real
   signed-in phone is the first honest test.

## Step 3: Before public review

TestFlight needs none of this.

### Screenshots
Two prepared sets:

| ASC slot | Use |
|---|---|
| iPhone 6.9" | `appstore-screenshots/2026-08-19/` (6 files, 1320x2868) |

**Use the 2026-08-19 set.** Captured from build 10 on an iPhone 17 Pro Max
simulator with the status bar pinned to Apple's 9:41 convention, ordered
strongest first:

1. `01-live-round.png` a live round, P1 Pro Constructive, running clock
2. `02-home.png` the Debate home
3. `03-watch.png` the Watch tab
4. `04-me.png` the Me training room
5. `05-setup-opponent.png` choosing AI or a stranger
6. `06-setup-confirm.png` the round summary before it starts

Filling only the 6.9" slot is fine; Apple scales down. Every earlier
directory (`upload-6.5/`, `new-2026-07/`, `new/`, `archive/`, `2026-07-28/`)
is from 2026-07-22/23, predates ~1000 commits including the move to a three
tab bar, and should not be uploaded. `_contact-sheet.png` is a contact
sheet, not an upload.

### Listing fields + privacy labels
Prepared in `APP_STORE_LISTING.md`. Paste as-is.

### The name
Currently **"Debatable - Bet on Your Words"**. The app ships a Bet surface,
and that pairing is what invites a gambling review under Apple's
real-money rules, which can also push the age rating up. Play-money-only
is a good answer, but the name invites the question. Editable in App Store
Connect right up to submission; dropping "Bet" is cheap insurance.

### Demo account for App Review
The tab bar is **Watch / Debate / Me** as of 2026-08-19, not the five tabs
this line used to describe, and signed-out states were not re-checked
against the current build. Walk the app signed out before writing the review
notes rather than trusting this paragraph. Where a wall does appear, Give the reviewer credentials in the App Review notes, or
they will see empty states and may judge the app on them.

### Offline behaviour (fixed 2026-08-19, but still not an offline app)
This section used to say the app "shows a branded offline screen". It did
not. `server.errorPath` was never set, so a failed load left WKWebView on a
blank page, and `www/index.html` was a 93-byte black document still carrying
the retired brand name. It could never render.

`www/index.html` is now a real self-contained offline screen (mark, "No
connection", a Try again button that re-navigates, and an `online` listener
that retries by itself), and `server.errorPath` in `capacitor.config.ts`
points at it. Verified in the simulator by pointing `server.url` at an
unreachable host and watching the screen render.

**The app still cannot work offline**, which is the part that has not
changed. There is no bundled build of the product, so with no network a user
gets that screen and nothing else. Fixing it properly means a real build
pipeline from `app/` into `www/`. Do not attempt that inside a review appeal
window.

Anything touching `www/` or `capacitor.config.ts` needs `npx cap copy ios`
before the next build, or the app ships the previous copy.

## Corrections to the 2026-07-22 version

- **"Sign in with Apple WILL REJECT YOU (4.8)" was wrong.** The Firebase
  Apple provider is enabled and configured. Verified by probing
  `identitytoolkit.googleapis.com/v1/accounts:signInWithIdp`: `apple.com`
  returns `INVALID_IDP_RESPONSE` (provider found, bogus token rejected)
  while `facebook.com` returns `OPERATION_NOT_ALLOWED` as a control. The
  in-app chooser also renders "Continue with Apple" first and above
  Google. This is no longer the gate on going live; upload is.
- **"There is no Apple sign-in anywhere in the codebase" was wrong.**
  `app/js/auth-modal.js` has `dbAppleSignIn`, which prefers the native
  Capacitor plugin and falls back to popup then redirect on the web.
- **A missing local distribution certificate is not a blocker.** The
  signing identity is Cloud Managed, so its private key lives with Apple
  and `security find-identity` will not list it. `xcodebuild -exportArchive
  -allowProvisioningUpdates` signs correctly anyway.

## Order of operations

Upload → TestFlight → test mic and Apple sign-in on the phone → re-shoot
screenshots → decide the name → submit.
