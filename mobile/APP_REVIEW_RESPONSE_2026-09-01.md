# Responding to the 2026-08-25 rejection of build 10

Written 2026-09-01 against the live App Store Connect record and the live
site. Supersedes the "Waiting for Review" state in
`IOS_HANDOFF_FOR_GPT_2026-08-26.md`.

## Where it stands (read from App Store Connect on 2026-09-01)

- App name in ASC: **Debatable: Live Voice Debate**. Version 1.0, build 10,
  status **Rejected**, submission `612e4cb5-e6f9-4a34-87d4-1148a36769d0`.
- Apple's message (2026-08-25 12:45 PM) cites two guidelines:
  - **2.2 Performance, Beta Testing.** The reviewer saw beta-testing
    language in a production submission.
  - **1.2 Safety, User-Generated Content.** Missing precautions: terms
    agreement before registering or logging in, filtering, flagging,
    blocking that notifies the developer and removes the person instantly,
    and 24-hour action on reports.
- Apple asks for a **screen recording captured on a physical device**
  showing the terms agreement, the flag mechanism, and the block mechanism.
  It must be attached to the reply, and to the Notes attachment for future
  submissions.

## Every fix is already live on origin/main, and none needs a new binary

The app loads `https://itsdebatable.com/native`, so the shell picks up web
changes without a rebuild. Verified on production on 2026-09-01 with a
browser user agent (the edge returns 204 to curl):

| Requirement | Where it lives | Shipped | Verified live |
|---|---|---|---|
| Terms agreement before sign-in or sign-up | `js/auth-modal.js`: checkbox `#daTerms` disables Apple, Google, and email buttons until ticked; receipt versioned `2026-08-26` | `4cab5570` | `daTerms` present in the served file |
| Zero-tolerance wording in the terms | `/terms`, section "User-generated content and live-round safety" | `4cab5570` | "zero tolerance" present |
| Flag mechanism | `/live-round` Report button on the opponent card, reasons: harassment, hate or threats, sexual content, spam or impersonation, AI use, other | pre-existing, copy tightened `4cab5570` | `#safetyBlock` present |
| Block that notifies the developer and removes instantly | Same modal, "Block this person" ticked by default; writes `safety_reports` and `user_blocks`, leaves the round, `spar-pair` refuses the pair in both directions server-side | `4cab5570` | test `scripts/test-ios-review-compliance.mjs` 9/9 on origin/main |
| Filtering | Community and channel text screened before write; on-device camera safety check in live rounds | `ee96a40a` | in the compliance test |
| No beta language in the native shell | `data-native-hide` on the coach meter, "Voice · Beta" becomes "Voice" when `__DB_NATIVE` | `73ed88fd` | `/native` serves zero occurrences of "beta" |

**Do not build 11.** Same binary, same build number, resubmitted after the
reply. Building again would only restart the queue.

## Step 1: record the video (Aidan, physical iPhone, ~10 minutes)

Use Control Center screen recording on the iPhone with the app installed
from TestFlight (build 10). Keep it one continuous clip, under three
minutes, no audio needed. Second device: a laptop signed into
`itsdebatable.com/spar` with a different Google account, so a live round
actually pairs.

1. **Terms gate.** Open the app signed out. Tap Debate, choose a stranger
   round (or Me, then Sign in). The chooser opens with the checkbox
   unticked and every sign-in button disabled. Tap the Terms of Use link,
   scroll to "User-generated content and live-round safety" so the
   zero-tolerance line is on screen, come back, tick the box, and sign in
   with Apple.
2. **Flag.** From the laptop join the queue on the other account. On the
   phone join from Debate. When the room opens, tap **Report** on the
   opponent card. Show the reason list, pick "Harassment or bullying",
   type a short note.
3. **Block.** Leave "Block this person" ticked. Tap **Send report**. Show
   the "Reported and blocked. Leaving this round." message and the phone
   landing back on the queue screen.
4. Optional but cheap: Me tab, Account and settings, show Delete account.

Export from Photos. Keep it under 500 MB. If ASC refuses the size, trim in
Photos rather than re-recording.

## Step 2: paste the reply to Apple

App Store Connect, App Review, open the submission dated Aug 19, click
**Reply to App Review**, attach the recording, paste this:

```
Hello,

Thank you for the review. Both issues are resolved in the same build, 1.0 (10), because the app renders its interface from https://itsdebatable.com/native and the changes below are live on that server. No new binary is needed.

Guideline 2.2, Beta Testing
All beta-testing language has been removed from the app. The "Free in beta" meter and the "Voice · Beta" label that the reviewer saw are gone in the iOS app, and the pricing pages already describe live subscriptions rather than a beta. There is no beta feedback or beta enrollment feature in the app.

Guideline 1.2, User-Generated Content
The following precautions are implemented and shown in the attached recording, captured on an iPhone:

1. Terms agreement before registering or logging in. The sign-in sheet now contains a required checkbox, "I agree to the Terms of Use and Privacy Policy. Debatable has zero tolerance for objectionable content or abusive users." Every sign-in method (Apple, Google, email) stays disabled until it is checked. The Terms of Use (https://itsdebatable.com/terms, section "User-generated content and live-round safety") state the zero-tolerance policy, the filtering, the flag and block controls, and the 24-hour response.

2. Filtering. Community posts, comments, and channel messages are screened for objectionable content before they are stored. Live video in human rounds runs an on-device safety check that cuts the camera when it trips.

3. Flagging. In every live round, a Report button sits on the opponent's card. It opens a form with a reason list (harassment, hate speech or threats, sexual content, spam or impersonation, and others) and a note field, and files a safety report to us.

4. Blocking. The same form has "Block this person", checked by default. Sending it notifies us through the safety report, removes the reporter from the round immediately, and records a server-side block so the two accounts can never be matched again, on any device. The recording shows the round ending the moment the report is sent.

5. 24-hour action. We review every objectionable-content report within 24 hours and remove the content and eject the user who provided it. This commitment is written into the Terms of Use.

Additional safety controls: users can delete their account from Me, Account and settings, Delete account. The support page is https://itsdebatable.com/support.

The App Review notes have been updated with the same information and the recording is attached there for future submissions.

Thank you,
Aidan
```

## Step 3: replace the reviewer Notes and attach the recording

Version page, App Review Information. Keep the existing Sign-In
Information as it is (the demo account already saved there still works).
Replace the Notes field with the text below, then use **Attachment,
Choose File** to attach the same recording, then **Save**.

```
Debatable runs timed debate rounds. You pick a motion, take a side, and argue out loud against an AI opponent that pushes back and takes points of information. An AI judge returns a written verdict at the end. You can also be matched with a real person for a live round.

HOW TO SEE THE CORE FLOW IN UNDER TWO MINUTES
1. Debate tab. Choose "AI" as the opponent and any motion. Start the round.
2. Speak, or type, for the first speech. The AI answers, then the judge writes the verdict.
3. Me tab shows the round history, profile, and account settings.

SIGN-IN
A signed-out visitor gets one free AI round, then a sign-in wall. Use the sign-in credentials above to get past it. Before any sign-in or registration, the app requires agreement to the Terms of Use through a checkbox on the sign-in sheet. All sign-in buttons stay disabled until it is checked.

USER-GENERATED CONTENT PRECAUTIONS (Guideline 1.2)
- Terms: https://itsdebatable.com/terms states zero tolerance for objectionable content or abusive users, and describes filtering, flagging, blocking, and 24-hour review.
- Filtering: community text is screened before it is stored; live video runs an on-device safety check.
- Flagging: every live round has a Report button on the opponent's card with a reason list and note field.
- Blocking: the same form blocks the person. Sending it notifies Debatable, removes you from the round immediately, and prevents that account from ever being matched with you again (server-side, survives reinstall).
- Response: reports are reviewed within 24 hours. Confirmed reports lead to content removal and ejection of the user.
Live rounds need two people, so the attached recording shows the Report and Block flow end to end on a physical iPhone. To reproduce it yourself, open https://itsdebatable.com/spar in a browser on a second account, join the queue, and join from the app at the same time.

NO BETA FEATURES (Guideline 2.2)
The beta labels seen in the previous review have been removed from the app. There is no beta enrollment or beta feedback feature.

NATIVE FUNCTIONALITY
Sign in with Apple, push notifications, native share sheet, deep links, camera and microphone permission handling, and a persistent native tab bar (Watch, Debate, Me).

ACCOUNT DELETION
Me tab, Account and settings, Delete account.

SUPPORT
https://itsdebatable.com/support
```

## Step 4: resubmit

Back on the submission page, **Resubmit to App Review** becomes active
once the reply is sent. Click it. Same build 10, no new upload.

## What could still go wrong

- The reviewer may test live matching on a single device and see no
  opponent. The notes explain that, and the recording is the demonstration
  Apple asked for.
- If Apple wants a second demo account for the live round, say so and add
  a second Google account to the notes. Do not create it before they ask.
- The two account-level items in the 08-26 handoff (Program License
  Agreement, EU trader status) are unchanged and still Aidan's browser
  tasks. They do not block replying, but they can hold an approved app
  from going live.
