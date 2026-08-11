# Upload Debatable to App Store Connect

Updated 2026-08-10. The artifact and signing details below were verified
directly from the exported IPA on this Mac.

## The artifact

**`~/mobile/build/v7/Debatable.ipa`**. Version 1.0, **build 7**, 6.9 MB.

- SHA-256: `05ad6d33bf0c3dcedff211682362b9e16367074c76091a8f7e5e2c896f47b0bc`.
- Archive and App Store export both completed successfully on 2026-08-10.
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
node scripts/verify-ios-release.mjs ~/mobile/build/v7/Debatable.ipa 7
```

The verifier checks ZIP integrity, identifiers, build number, permission copy,
server and navigation configuration, distribution signing, production push,
TestFlight reporting, Sign in with Apple, debug status, and symbols.

## Step 1: Upload (~10 min + processing)

App Store Connect record already exists: app ID `6791712877`, bundle
`com.debateai.debateit`. Do not create a second one.

**Transporter** (installed at `/Applications/Transporter.app`):

1. Open it, sign in with your Apple ID (normal 2FA)
2. Drag in `~/mobile/build/v7/Debatable.ipa`
3. Let it validate, then **Deliver**

CLI alternative, using an app-specific password from appleid.apple.com.
Type the password yourself, never paste it into a chat:

```bash
xcrun altool --upload-app -f ~/mobile/build/v7/Debatable.ipa -t ios -u <your-apple-id> -p <app-specific-password>
```

Then wait 10-30 minutes for processing. Apple emails you.

Rebuilding later? Bump `CURRENT_PROJECT_VERSION` past 7 first. App Store
Connect rejects a build number it has already seen.

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
| iPhone 6.5" | `appstore-screenshots/upload-6.5/` (6 files, 1284x2778) |
| iPhone 6.9" | `appstore-screenshots/new-2026-07/` (6 files, 1320x2868) |

Filling only the 6.5" slot is fine; Apple scales it. Never upload `new/`
or `archive/`, both stale. `_contact-sheet.png` is a contact sheet, not an
upload.

**Re-shoot before submitting.** Both sets were captured 2026-07-22/23 and
the app has moved ~1000 commits since, including a redesign of the Live
tab. Screenshots that no longer match the app are a review risk and a
worse store listing.

### Listing fields + privacy labels
Prepared in `APP_STORE_LISTING.md`. Paste as-is.

### The name
Currently **"Debatable - Bet on Your Words"**. The app ships a Bet surface,
and that pairing is what invites a gambling review under Apple's
real-money rules, which can also push the age rating up. Play-money-only
is a good answer, but the name invites the question. Editable in App Store
Connect right up to submission; dropping "Bet" is cheap insurance.

### Demo account for App Review
Three of the five tabs (Coach, Me, and parts of Live) show a sign-in wall
when signed out. Give the reviewer credentials in the App Review notes, or
they will see empty states and may judge the app on them.

### Known gap, not fixed
The app cannot work offline. `www/` carries no bundled build, so with no
network the app shows a branded offline screen and nothing else. If a
reviewer tests on a throttled connection, that screen is the app. Fixing
it properly means a real build pipeline from `app/` into `www/`. Do not
attempt that inside a review appeal window.

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
