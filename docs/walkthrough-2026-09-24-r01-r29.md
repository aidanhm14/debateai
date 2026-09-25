# Walkthrough 2026-09-24: R01 to R29 status

Reconciled 2026-09-25 against the real handoff (`DEBATABLE_CODEX_HANDOFF_2026-09-24.md`, downloaded 2026-09-25 13:16, after Codex's second run finished at 13:15). Codex's provisional W01 to W29 were derived from the same transcript in the same order, so they map one to one; this file uses the handoff's R numbers and its acceptance wording. Recording: `ScreenRecording_09-24-2026 15-14-20_1.MP4`, 7:24.81 at 1640x2360 (iPad Safari), audio effectively silent, so the transcript supplies the words and the video supplies the targets (windows in Codex's `recording-map.md`).

Production at the time of writing: `origin/main` = live (`debateos-v3716`). Live checks below were made against itsdebatable.com with a browser user agent.

Legend: **Verified live** = observed on production. **Implemented, mock-tested** = shipped, covered by the Playwright walkthrough suite with intercepted services. **Partial** = shipped narrower than the acceptance text. **Unresolved** = deliberately not changed.

| R | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| R01 | Fix the initially indicated area | **Verified live** (2026-09-25, `dc6cd737`) | 0:00 to 0:10 | Frames (Claude, 2026-09-25): at 0:03 the homepage board shows a finished example round with its decision; at 0:08 it has flipped to the invitation panel ("Round of your choice", an empty "Your seat" silhouette, "Pick a topic. Take a side."). Aidan confirmed the invitation panel. It now reads "Your seat is open", explains the trade in one line, and carries its own Take the seat button inside the panel (`#fsSeatCta`, shown only on the matched-you card). The decision card ("this is good") is untouched. |
| R02 | Optional perspective label beside leaderboard names | Implemented, mock-tested | `/leaderboard`, landing standings; `rating-board.mjs`, `standings.js`, `profile.html` | Public opt-in field (`publicIdeology`) with "Not given" fallback. Never inferred. |
| R03 | Profile details discoverable from the board | Implemented, mock-tested | `standings.js`, `leaderboard.html` | Name links to `/users?uid=`, plus a "Profile details" affordance. |
| R04 | Differentiate training categories, no new pictures | **Verified live** | `homepage-design.css`, `debate-types.css` | Four colour treatments, zero images (visual batch `1d459bcd`). |
| R05 | Redesign the referenced box as an opening | Implemented, medium confidence | `landing.html` walkthrough card | Codex read "this box" (0:55 to 1:05) as the How-it-works opening card and shortened it to "One person. One question. A different point of view." Live. Frames at 0:58 and 1:02 show the training-category cards and then the "An AI judge scores the whole round" section with its decision card, so the box may instead be that judge-decision card. Medium confidence, audio silent. |
| R06 | Preserve regions called good | Preserved | landing | Later panels untouched. |
| R07 | Simplify "criteria are published before you speak" | Implemented, mock-tested | `/judge-integrity` | Plain summary first, technical detail below; rubric and weights unchanged. |
| R08 | Round-feedback Google Form + general feedback link | **Verified live** | `/round-feedback`, `round-feedback-config.json` | Real form (responses on, email collection off). Config served as static JSON after the Lambda hit Netlify's 4KB env cap. General feedback link kept separate. |
| R09 | Images inside expanded FAQ answers | Implemented, mock-tested | `landing.html`, `faq.css` | Three existing assets; lazy, alt text. |
| R10 | Mobile Explore horizontally varied | **Verified live** | `topbar.js` | Two-column grid at 390px, four on tablet. |
| R11 | Apple sign-in without breaking Google or email | **Verified live** (browser) | `auth-modal.js`, `netlify.toml` proxy, all 67 `authDomain`, Apple Services ID | Root cause: redirect fallback round-tripped through firebaseapp.com and lost the session to partitioned storage. authDomain is now itsdebatable.com with `/__/auth/*` proxied. Google redirect reaches accounts.google.com on the new handler; Apple reaches its real sign-in page; Aidan completed one real Apple sign-in in Codex's browser and the session persisted across reload. Not exercised: iOS Safari and the native app. |
| R12 | Better evaluated YouTube debate examples, incl. parliamentary | **Verified live** (2026-09-25) | `/watch`, `scripts/data/watch-library.json` | Aidan: "find the parliamentary rounds". Nine finals added under a new Parliamentary finals collection (WUDC 2023 and 2026, EUDC 2022 and 2025, APDA Nationals 2015, CUDC 2024, Canadian Parliamentary 2024, Australs 2020, WSDC 2016); every id verified with YouTube oEmbed, durations read from the watch pages. No evaluation scores are shown because none exist. |
| R13 | "Watch & Vote" | **Partial** | `watch.html` | Title and copy changed; voting points at the existing audience controls in eligible live rounds. No vote on YouTube examples and no numeric counter ("and number" still unclear). No fake totals. |
| R14 | Ask display name once | Implemented, mock-tested | `public-identity.js`, `topbar.js` | Prompt waits for profile hydration; completion saved per account. |
| R15 | More homepage people imagery | Implemented, mock-tested | `example-rounds.js`, `example-board.js` | Existing supplied pool widened; no invented results. |
| R16 | Faster rotation on one side | Implemented, mock-tested | `example-board.js` | Left column 2.52s, right fixed, completed rounds 9.6s, reduced motion respected. Side chosen from the 4:20 to 5:20 window. |
| R17 | "No decision", "Good talk", "Good chat" states | Implemented, mock-tested | `example-board.js` | Demo board only: a no-winner example renders "Good chat" and "No decision". Real ballots untouched. "Good talk" not used. |
| R18 | Remove redundant age questions | **Verified live** (2026-09-25) | `age-gate.js`, `spar-pair.mjs`, `challenge.mjs`, `lib/challenge-room.mjs`, `lib/team-seats.mjs`, `lib/private-invite.mjs`, `safety.html` | Aidan: "everyone for live matches, no age limit thing". The queue-door age question is retired and every server pairing path stops reading age bands (`AGE_BAND_PAIRING=false`, `PAIRING_BANDS=false`; flip together to restore). No age is invented or recorded. /safety says "One live pool". Still 18+: research licensing and cash prizes. The public-broadcast stage was opened to every account the same day (Aidan: "open it"; `stage.mjs`, guard updated). |
| R19 | First spacing fix | Implemented, mock-tested | `/spar` queue | Mobile queue spacing reduced (5:35 to 6:10 window). |
| R20 | Globe spins faster | Reported by Codex, not independently verified | `spar.html` | Codex records 240s to 120s on the queue globe; the grep in this pass did not locate the constant. Low risk. |
| R21 | Spread left and right | Implemented, mock-tested | `spar.html` | Two desktop columns at 900px+. |
| R22 | Move element higher | Implemented, mock-tested | `spar.html` | Queue content raised. |
| R23 | Enlarge the chat | Implemented, mock-tested | `spar.html` | Commons chat wider in the desktop columns. |
| R24 | Simplify Settings | Implemented, mock-tested | `/profile#settings` | Routine controls first, privacy/research/account separated. |
| R25 | Resolve the "Always" setting | Resolved narrowly | `profile.html` | Recording shows "Store my round transcripts". Label now "Always save my future rounds"; existing opt-outs kept. |
| R26 | Prefill saved display name | Implemented, mock-tested | `profile.html`, `public-identity.js` | Saved name prefilled; fetch failure cannot erase it. |
| R27 | Prefill training defaults, imply 18 | Implemented with guardrail | `profile.html` | Saved attestation reused when present. No assumed adulthood. |
| R28 | Remove "Type to beat the AI" and its page | **Verified live; Aidan confirmed "keep retired"** | `netlify.toml`: `/practice` and `/practice.html` 301 to `/newvoice` | The phrase "Type to beat the AI" appears nowhere in the repo history; Codex read the 6:50 to 7:00 frames as the typed `/practice` round and retired that whole surface. Frame at 6:55 shows the typed `/practice` setup (AI voice picker, AI speed, AI brain, judge model) and 7:15 shows `/newvoice` ("How do you want to debate the AI?"), which matches "get rid of this page entirely" then "improve this one". Aidan: keep it retired and "reinvent /practice entirely to help SEO": `/practice` is now a static debate-practice acquisition page (`app/practice-debate.html`, FAQPage, WebPage and VideoObject JSON-LD, listed in the sitemap) carrying the walkthrough video, three consented-still example face-offs and the live-round screenshot; `/practice.html` folds into it. |
| R29 | AI-vs-AI harness | Implemented; live quality unverified | `scripts/ai-vs-ai-smoke.mjs`, `test-ai-vs-ai-smoke.mjs`, `docs/walkthrough-2026-09-24.md` | Bounded, mock by default, `--prompt-profile voice` runs the real spoken prompt on a text model. Two paid OpenAI runs passed mechanical checks; manual review still found overconfident economics. Does not exercise audio, interruption or the judge panel. Separately, the typed casual prompt in `practice.html` was reviewed on the real assembly and fixed (`fb4a4dab`), but that surface now redirects, so the fix is dormant unless R28 is narrowed. |

## Decisions still needed

R28, R18, R12 and R01 were decided by Aidan on 2026-09-25 and are shipped (`f06224ff`, `dc6cd737`); the stage is open.

1. **R13 "and number".** Say whether a vote count was wanted on Watch & Vote.

## What was not done and why

No further paid AI runs. No change to judging rules, ratings, consent defaults or research eligibility. Discord sign-in: no OIDC provider exists in Firebase yet, so nothing to register.
