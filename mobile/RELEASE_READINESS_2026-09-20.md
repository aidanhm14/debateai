# Debatable app release pack

Prepared September 20, 2026. The complete local release pack is at `/Users/aidanhm/Documents/Codex/2026-09-20/wha/outputs/app-release/`. Apple sign-in and physical-device work were deferred by Aidan. Nothing has been submitted to either store in this session.

## What is ready

- `/Users/aidanhm/mobile/build/v11/Debatable.ipa`: existing signed App Store build, version 1.0 (11), rechecked against 24 release assertions. Loads the live Debatable service.
- `android/Debatable-Android-debug.apk`: existing installable test build; hash matches the verified September 9 artifact. This is a debug APK, not a Play release.
- `store-copy.txt`: current public listing fields.
- `apple-review-notes.txt`: reviewer instructions, updated for email access and private rounds.
- `apple-review-reply-DRAFT.txt`: prepared response to the last recorded rejection. Send only after verifying the video and re-reading Apple's current message.
- `recording-and-device-checks.md`: exact physical-iPhone recording walkthrough and remaining device checks.
- `privacy-worksheet.md`: source-backed disclosure inventory and the remaining dashboard/provider questions.
- `screenshots/`: a fresh iPhone simulator screenshot of build 11 displaying the live product. The iPad simulator is prepared, but its current screenshot still needs a manual capture because the automation could not tap its display. See the screenshot README.
- `evidence/`: command results and artifact hashes. These are supporting checks, not device-test evidence.

## What you already tested

On September 10 you confirmed iPhone microphone, camera, and a completed round working. The earlier handoff explicitly records this as user-reported passed. Those checks are retained as passed; you do not need to repeat them solely for this checklist.

## Next session, in order

1. Sign in to the existing App Store Connect app: https://appstoreconnect.apple.com/apps/6791712877 . Read the newest review conversation and selected build. The last verified record was build 10 rejected on August 25, read September 1. Today's private dashboard was unavailable. Do not withdraw a submission that is already waiting or in review.
2. Connect/unlock the iPhone. Confirm which TestFlight build is installed. Build 11 is the prepared binary; upload it only if Apple has not already processed it and the current submission needs it. The build fixes native detection and cold launch. No new build number is needed for the shared-web notification fix.
3. Use two controlled test accounts for the safety recording. Follow `recording-and-device-checks.md`. Finish the remaining device checks and record actual results.
4. Paste the current public fields. Replace stale screenshots for both device families. Complete privacy and age answers from actual accessible features, using the worksheet and the current questionnaire.
5. Verify the saved reviewer account can sign in and has enough allowance for review. Do not store its password in this folder. Email/password now grants live-video access, as do Google and Apple.
6. Attach the physical-iPhone recording to BOTH the review reply and App Review Information. Play both attachments back. Only then use the prepared reply and complete resubmission. Record the resulting status, build and timestamp; saving notes or sending a reply is not the same as submitting.
7. Resolve any agreement or trader-status request actually shown by Apple. Historical warnings do not prove either remains outstanding. Aidan completes account-holder declarations.

## Android after iPhone

Install the included debug APK on a physical Android phone and complete the device checklist. The Play release still needs the existing Play Console account/app record, its upload-signing key (or a first-upload signing decision), the Play signing certificate registered in Firebase, and a signed AAB. Do not upload this debug APK or create a replacement key for an existing app. The committed `android:bundle` command currently produces an unsigned release bundle until signing is configured. No signed Android release or Play submission is claimed here.

## Known limits

The app requires a network connection. An offline error/retry screen is bundled; the full service is not bundled for offline use. Push delivery and recovery still need physical-device evidence. Universal/App Links are not claimed: the current iOS entitlements lack Associated Domains and the Android manifest lacks a verified web-link intent filter. Native notification-tap routing is a separate path.

The privacy worksheet is preparation, not a saved App Store privacy declaration. No device recording has been fabricated. The public Apple lookup returned no result for app 6791712877 in the US and UK on September 20.
