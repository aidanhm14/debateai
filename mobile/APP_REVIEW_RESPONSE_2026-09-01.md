# Responding to the 2026-08-25 rejection of build 10

Updated 2026-09-06 against current source and Claude's same-day handoff.
This is a preparation document, not a record of a reply or resubmission.

## Last verified Apple record

The 2026-09-01 read of App Store Connect recorded version 1.0, build 10,
status **Rejected**, submission `612e4cb5-e6f9-4a34-87d4-1148a36769d0`.
Apple's message was dated 2026-08-25, 12:45 PM:

- **2.2, Performance, Beta Testing:** production submission displayed
  beta-testing language.
- **1.2, Safety, User-Generated Content:** terms agreement, filtering,
  flagging, developer notification, immediate blocking, and 24-hour action.
- Apple requested a **physical-device screen recording** showing terms
  agreement, flagging, and blocking, attached to the reply and to App Review
  Information for future submissions.

Read the latest conversation before using this response. A newer Apple
message takes precedence. The current reply, attachment, and resubmission
status was not verified by Codex on 2026-09-06.

## Current implementation and evidence

The submitted shell loads `https://itsdebatable.com/native`. Web fixes
reach that shell, but code presence is not an end-to-end device test.

| Requirement | Current implementation | Evidence available |
|---|---|---|
| Affirmative terms acceptance | Shared chooser renders `#daTerms`; each auth handler checks `requireTerms()` before Firebase authentication | Source; Claude observed unchecked field on a clean simulator |
| Terms error feedback | Buttons remain enabled. An attempt without agreement is refused, displays an error, and focuses the checkbox | Source; deliberate 2026-09-02 change |
| Zero tolerance and 24-hour action | Published terms include both and describe moderation | Served terms checked in Claude's 2026-09-06 handoff |
| Flagging and blocking | Report dialog, reason and note, block checked by default; safety report and durable two-way matchmaking exclusion | Source and existing compliance guard |
| Filtering | Community writes use content screening; live camera safety-check integration is present | Source; device behavior still needs validation |
| Production language | Previously reported native beta meter/label removed or hidden in the native branch | Served-file checks in Claude's handoff |
| AI account requirement | Named sign-in before starting a fresh AI round | Current sign-in policy and source |
| Native navigation | Home, People, Watch, You, Leaderboard; tab bar hidden in immersive rounds | Native bridge source and browser verification; physical-device check pending |

For this rejection's web changes, a new binary is not inherently required.
Reuse build 10 if Claude's device checks confirm it is the intended release.
If the cold-start blank screen or another native defect needs a shell fix,
Claude owns the rebuild and next build number. Do not promise that rebuilding
always restarts a queue, or that build 11 can never be necessary.

## Step 1: capture the requested evidence on an iPhone

Use the selected TestFlight build on a physical iPhone. Confirm the build
number first. Use two controlled accounts belonging to the test participants,
with their agreement to the recording. Do not report an unrelated person to
demonstrate the feature.

Keep Apple passwords, verification codes, and unrelated notifications out of
the clip. If authentication is visible, stop before secrets appear and explain
the recording segments. The important evidence is the real device and the
actual terms, Report, and Block controls, not an artificial uninterrupted take.

1. **Terms gate:** open Me and the sign-in chooser while signed out. A new
   device has an unticked field; a returning device may restore a previous
   acceptance. Untick it if needed. Tap a sign-in button and show the refusal:
   "Tick the box to agree to the Terms of Use, then continue." Open Terms of
   Use and show the user-generated-content safety section. Return, agree,
   and use Apple or Google sign-in.
2. **Enter a controlled live round:** the Watch page contains
   "Get in a debate yourself. Join a live room!" linking to `/spar`.
   Verify its exact position on the device before recording. The People
   tab also supports a Challenge to an existing friend. Prefer that direct
   invitation to testing against an unrelated person in the public queue.
   The second controlled account must be signed in with Google or Apple.
3. **Flag:** once the intended second participant is in the room, tap Report
   on their card. Show the reason list and note field. Label the note
   "App Review test with two controlled accounts; no actual abuse" so the
   real moderation queue receives an accurately identified test.
4. **Block:** leave "Block this person" ticked and send the report. Show
   "Reported and blocked. Leaving this round." and the return to `/spar`.
   Verify the server recorded the safety report and block, then confirm the
   accounts cannot be paired again. Label code-only verification honestly.
5. Separately verify a full AI voice round, Apple and Google login, camera/
   microphone, and account deletion on a disposable account. Do not delete
   either reviewer account. These checks support release readiness; Apple's
   requested clip specifically concerns terms, flagging, and blocking.

Do not fabricate abuse, successful verification, or a recording that does not
exist. Attach the real recording in both required places, inspect playback,
and replace any old attachments showing a different flow.

## Step 2: prepare the reply to Apple

Use this draft only after the recording and the stated fixes have been
verified. Attach the clip first. Update the final sentence only after the
Notes and their attachment have actually been saved.

```text
Hello,

We have addressed the issues reported for version 1.0 (10). The app loads its interface from https://itsdebatable.com/native, and the fixes described below are deployed there.

Guideline 2.2, Beta Testing
The previously reported "Free in beta" meter and "Voice · Beta" label no longer appear in the iOS app. This is the production service.

Guideline 1.2, User-Generated Content
1. Terms agreement: before registration or login, the shared sign-in sheet requires agreement to the Terms of Use and Privacy Policy and states that Debatable has zero tolerance for objectionable content or abusive users. Every sign-in method refuses to proceed and highlights the checkbox until it is checked. The recording demonstrates the refusal and subsequent acceptance.

2. Filtering: community posts, comments, and channel messages are screened for objectionable content before storage. Live video also includes an on-device camera safety check.

3. Flagging: the opponent's card in a live round has a Report control with a reason list and a note field. Submitting it creates a safety report for Debatable to review.

4. Blocking: the report form includes "Block this person", checked by default. Sending a report with blocking enabled notifies Debatable, immediately leaves the current round, and records a server-side block. Matchmaking checks blocks in both directions to prevent these accounts from being paired again across devices.

5. Response: our Terms of Use commit to reviewing objectionable-content reports within 24 hours and removing offending content and suspending or terminating offending accounts when a violation is confirmed.

The attached iPhone recording demonstrates the terms, flagging, and blocking flows using two controlled test accounts. The report is labeled as an App Review test.

Terms: https://itsdebatable.com/terms
Support: https://itsdebatable.com/support
Account deletion: You > Account and settings > Delete account.

The app's tab bar is Home, People, Watch, You, Leaderboard. Immersive rounds hide the tabs.

We have also updated App Review Information with the current instructions and attached the same recording there.

Thank you,
Debatable
```

## Step 3: replace App Review Notes

Test the saved Sign-In Information before relying on it. Do not copy
credentials into git or this document. Email/password is an account method
for general features but does not grant live-video access. Confirm Apple
Review can access every reviewable feature through the supplied accounts
and instructions; a quota-exhausted or email-only account is not full access.

The draft below assumes the device checks passed and the recording is
attached. It deliberately does not claim an anonymous AI round, disabled
sign-in buttons, a three-tab shell, or a verdict after a single speech.

```text
Debatable is a social app for one-on-one spoken debates. People can debate each other live, watch rounds, message friends, and view separate leaderboards for rounds against people and AI. The app also offers an AI voice opponent and judge feedback.

AI VOICE FLOW
1. Sign in using the supplied review access. In the iOS chooser, Apple and Google are available. Agree to the Terms of Use before continuing.
2. Open Home, then Debate the AI. Choose a topic, side, and voice in the setup, then tap Start debating.
3. Allow microphone access and exchange arguments with the AI. Tap Finish debate to request the transcript and feedback.
4. You contains the profile, round history, and account settings.

LIVE HUMAN FLOW
Live video requires a Google or Apple account. From Watch, use "Get in a debate yourself. Join a live room!" to reach matching. Complete or skip the Match Desk questions and join the queue. Availability depends on another person being present. An existing friend can also be challenged from People.

The attached physical-iPhone recording demonstrates the terms, Report, and Block controls using two controlled accounts. To reproduce a live round, use a second Google or Apple account on another device. Confirm the intended test participant before submitting a test report.

TERMS AND USER SAFETY
Before registration or login, an affirmative checkbox accepts the Terms of Use and Privacy Policy. It states zero tolerance for objectionable content or abusive users. With the checkbox unticked, a sign-in attempt is refused and highlights the field; the buttons are not disabled.

Community text is screened before storage. Live video includes an on-device camera safety check. Every live round has Report on the opponent's card, a reason list, a note field, and "Block this person", checked by default. A report with blocking enabled notifies Debatable, immediately leaves the round, and prevents the accounts being paired again through a server-side block.

Our terms commit to reviewing objectionable-content reports within 24 hours and removing offending content and suspending or terminating offending accounts when a violation is confirmed.
https://itsdebatable.com/terms

PRODUCTION APP
The labels identified in the previous 2.2 review have been removed from the iOS app.

NATIVE FEATURES
Apple sign-in, push notifications, native sharing, deep links, camera and microphone permission handling, and the persistent Home, People, Watch, You, Leaderboard tabs. Immersive rounds hide the tabs. An internet connection is required.

ACCOUNT DELETION
You > Account and settings > Delete account. This deletes the account in the app without requiring a support email; the confirmation explains data removal and retention.

SUPPORT
https://itsdebatable.com/support
```

## Step 4: submit and verify

Confirm the live version status, selected build, corrected listing, privacy
answers, supported-device screenshots, working review access, and both video
attachments. Resolve account-level requirements actually shown by Apple;
historical agreement or trader-status warnings are not proof they remain open.

Send the reviewed response and follow the resubmission controls presented in
App Store Connect. Record the resulting status and timestamp. Saving metadata
or sending a reply alone is not evidence that a build entered review.

If a newer rejection exists, respond to that message first. If the version is
already Waiting for Review or In Review, do not withdraw it merely to follow
this historical checklist.
