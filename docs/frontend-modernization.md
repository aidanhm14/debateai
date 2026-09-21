# Frontend modernization checkpoint, 2026-09-21

The landing page and live room were extracted in working slices after the
other UI tasks completed. Product behavior and backend draft/judge rules
remain in place.

| Area | Before | After |
| --- | --- | --- |
| Landing HTML | 21,165 lines | 5,073 lines |
| Live-room HTML | 25,102 lines | 22,279 lines |
| Landing behavior/styles | Mostly inline | Named sections under `app/js/landing/` and mirrored CSS |
| Room responsibilities | One main closure | Timer, media, connection, presence, draft and verdict controllers |

This is a first modularization pass. The room still has substantial page
coordination and other responsibilities to migrate gradually. It retains
classic scripts, explicit dependencies, live shared-state access and the
existing browser runtime. No framework migration or JSX was introduced.

## Regression protection

Controlled browser fixtures now cover sign-in completion/retry, paid access,
both participants' finish consent and durable transcripts, decision display,
landing navigation, media failure/retry, spectator playback and presence
after return from the browser's page cache. Existing matching, draft, clock
and voice-metering tests remain. Source guards expand marked external assets
using `scripts/lib/page-source.mjs` rather than inspecting empty wrappers.

Browser access tests exposed a mismatch in practice's plan helper: incomplete
and paused subscriptions were admitted, while a canceled legacy Lifetime
grant was denied. Its client checks now match the existing backend policy.
No plan prices, Stripe settings or billing server policy changed.

Twelve landing comparisons preserve computed layout/styles and screenshots
with changing media masked. Twenty-four room comparisons preserve computed
layout/styles; 23 screenshots match exactly, and one spectator preview has
16 edge pixels differing by at most 4/255 in a channel. Animations/transitions
are disabled and dynamic media masked for these comparisons. The scene
fixture holds auth observation pending so the omitted SDK's error gate does
not cover the room. These fixtures do not replace live OAuth, camera transport
or payment-provider integration checks.

## Verified cleanup

Audio-element cleanup was identical in participant refresh and call teardown;
both now call the media controller's `removeAudio`. Browser checks verify
that microphone and judge elements detach and release their streams in both
paths.

The private helpers `showModerationCard`, `floorJudgeStatus`, `trimFloorRemark`
and `startCueGo` had no lexical callers, assignments or public exports. A
repository search found no external references. They were removed along with
31 unreferenced page adapters whose implementations remain in the controllers.

The explicitly retained local-recording rollback code, landing debug layouts,
legacy team/format renderers, account entitlements and stored-round handling
remain. An absent current caller alone does not justify removing an intended
compatibility or rollback path.
