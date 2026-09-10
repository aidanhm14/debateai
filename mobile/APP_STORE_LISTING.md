# Debatable App Store submission copy

Updated 2026-09-06 against the current product. Public fields below are ready
to enter. The privacy inventory and submission checks are internal working
notes, not a claim that App Store Connect has been updated.

## Identity

- **App Store name:** Debatable: Live Debates
- **Subtitle:** Real people. Different sides.
- **In-app product name:** Debatable
- **Bundle ID:** com.debateai.debateit
- **App Store Connect app ID:** 6791712877
- **Primary category:** Social Networking
- **Secondary category:** Entertainment

Use the existing app record. The exact name `Debatable` was unavailable;
Aidan chose the descriptive title above on 2026-09-02. Preserve the bundle
ID. Confirm the saved title in App Store Connect before editing.

## Promotional text

Take a side and debate someone live. Hear the other argument, make your case, and see how the AI judge calls it. Watch rounds or debate the AI on your own.

## Description

Got a different take? Talk it out.

Debatable brings two people together for a live, one-on-one debate. Pick a question, take opposite sides, and make your case out loud. An AI judge explains its verdict after a judged round.

DEBATE SOMEONE LIVE
Meet someone with a different view. Agree on the question, choose your side, and get into the argument. No debate experience needed.

WATCH THE ARGUMENT
Watch live debates when a round is on air. Follow the exchange and see how each side makes its case.

SEE WHERE YOU STAND
Explore the leaderboard, with separate standings for rounds against people and rounds against AI. Keep your round history and read the judge's feedback.

DEBATE THE AI
Choose a topic and argue out loud with an AI opponent. It responds in real time, challenges your reasoning, and gives you another side to answer. Finish the debate to see your transcript and feedback.

KEEP THE CONVERSATION GOING
Find people, connect with friends, and use direct messages to arrange another round.

REPORT AND BLOCK
Report abusive behavior from a live round and block the other account. Community rules, privacy information, and support are available in the app.

Sign in to start a round. Live rounds with another person depend on an opponent being available. An internet connection is required; voice and video features need microphone and camera access when used.

## Keywords

argument,voice,discussion,opinions,conversation,speaking,rebuttal,community,video,ai

## URLs

- **Support URL:** https://itsdebatable.com/support
- **Marketing URL:** https://itsdebatable.com
- **Privacy Policy URL:** https://itsdebatable.com/privacy

The support page publishes `hello@itsdebatable.com`. The old `/contact`
URL returned 404 in the 2026-09-06 handoff; do not restore it.

## What's New (if requested for this version)

Live one-on-one debates, an AI opponent, judge feedback, friends, and separate leaderboards for rounds against people and AI.

## App Privacy: reconcile before saving answers

This inventory replaces the old table, which omitted private political
preferences, uploaded pictures, stored live recordings, and PostHog replay.
Compare it with the exact iOS-accessible features, deployed SDK settings,
and the answers currently saved in App Store Connect. It is not a completed
privacy audit. Include third-party collection as well as our own storage.
Sources: `app/privacy.html`, `app/js/auth-modal.js`, and
[Apple's App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/).

| Apple data type | Collection to account for | Linked to user | Purpose to verify |
|---|---|---|---|
| Email Address, Name | Account identity; account and opted-in lifecycle emails | Yes | App Functionality; Developer's Advertising or Marketing where used for promotional emails |
| User ID | Firebase uid, public handle, account-linked analytics and push registration | Yes | App Functionality, Analytics |
| Sensitive Info | Optional political opinions saved by Match Desk for matchmaking | Yes | Product Personalization, App Functionality |
| Photos or Videos | Public profile picture uploads and consented live-round recordings | Yes | App Functionality |
| Audio Data | Audio retained with consented live-round recordings at Daily.co | Yes | App Functionality |
| Emails or Text Messages | Stored direct messages, including sender and recipient | Yes | App Functionality |
| Other User Content | Debate transcripts, posts, saved rounds and safety reports | Yes for account-linked content | App Functionality; confirm other uses such as opted-in research |
| Product Interaction | Page/feature events and PostHog session replay | Yes when identified by account id | Analytics, Product Personalization where applicable |
| Customer Support | Support requests and associated account information | Yes when identified | App Functionality |

AI voice streamed in real time is distinct from retained human-round audio.
Do not answer that all audio is unlinked simply because the AI audio bypasses
our servers. Confirm providers' retention against Apple's collection definition.

Verify Device ID, diagnostics, approximate location derived from IP, purchase
history exposed to existing web subscribers, and any other SDK collection
before including or excluding those categories. The absence of a checkout
does not prove that purchase history is absent. The previous draft's blanket
unlinked crash/performance answers were not backed by a current SDK audit.

The policy says there are no advertising trackers. Confirm actual SDK data
sharing before saving the Tracking answer; absence of IDFA alone is not
proof of no tracking. Processor inventory includes Firebase, GA4, PostHog,
GoatCounter, Netlify, Daily.co, Resend, and the AI providers reached by the
enabled features. Use the current policy's processor list, not this list as
an exhaustive substitute.

## Age rating and encryption

Complete Apple's current questionnaire from actual features, including user
content, messaging, live voice/video, and any contest or prediction surfaces
reachable in the app. Do not copy a competitor's rating or choose an age
rating to avoid disclosing functionality.

Build 10 declares `ITSAppUsesNonExemptEncryption = NO`. Confirm that the
selected uploaded build matches the verified artifact and answer Apple's
export-compliance questions for that build.

## Submission checklist

1. Open the existing app record and read the latest review conversation.
   The 2026-08-25 rejection is historical until checked against today's UI.
2. Confirm the selected build and test it on a physical iPhone: Apple login,
   Google login, a full voice round and verdict, live video, Report and Block,
   and account deletion with a disposable account.
3. Capture Apple's requested physical-device recording. Follow
   `APP_REVIEW_RESPONSE_2026-09-01.md`; a simulator recording is insufficient.
4. Enter the public fields above. Reconcile privacy answers, age rating,
   screenshots for supported iPhone/iPad sizes, and current product screens.
5. Use the reviewer Notes in `APP_REVIEW_RESPONSE_2026-09-01.md` as the single
   source. Test the saved reviewer credentials without putting them in git.
   AI rounds require sign-in. Live video needs a Google or Apple account;
   an email/password account alone does not cover the whole app.
6. Attach the device recording to the review response and App Review
   Information. Verify the attachments are present before claiming they are.
7. Resolve any account-level agreement or distribution requirements shown
   by Apple. Aidan handles legal agreement acceptance.
8. Reuse build 10 if it still matches the intended release and no native
   defect requires a rebuild. Only Claude's native lane should allocate a
   new build number. Follow the actual resubmission controls and verify the
   resulting review status; saving metadata does not submit the app.

## Safety evidence

Before registration or login, every sign-in method requires the user to agree
to the Terms of Use. The agreement states that Debatable has zero tolerance
for objectionable content or abusive users.

Live human rounds include a visible Report control on the opponent card. The
report dialog includes safety reasons and a Block option, checked by default.
Blocking sends the safety report to Debatable, removes the user from the
current round immediately, and prevents the two accounts from being matched
again. Debatable reviews safety reports within 24 hours and removes confirmed
offending content and users.

## Account deletion evidence

Path: You > Account and settings > Delete account. The implementation cancels
active subscriptions, removes public identity and the Firebase Auth account,
and purges associated data. A server-side continuation completes remaining
cleanup if the first request runs out of time. Some shared-round and legally
required records are retained as disclosed by the deletion screen and policy.
Do not describe every data deletion as completing synchronously in one tap.

Verify the flow on a disposable account before representing it as a completed
device test. Do not delete the reviewer account during that test.
