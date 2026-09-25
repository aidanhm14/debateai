# September 24 walkthrough completion

The September 25 follow-up authorizes connecting the feedback form, fixing AI practice issues, testing Apple sign-in and publishing the remaining clear walkthrough changes. Implementation uses the complete downloaded `DEBATABLE_FULL_CHAT_TRANSCRIPT_2026-09-24.md` and the matching `ScreenRecording_09-24-2026 15-14-20_1.MP4`. The main `DEBATABLE_CODEX_HANDOFF_2026-09-24.md` remains missing. Its exact R01–R29 checklist cannot be asserted; the task's recording map uses clearly provisional W01–W29 labels instead. The ambiguous opening “this area” remains unresolved.

## Product changes

- Leaderboard names link to profiles. Viewpoint labels come only from an explicitly chosen public field, never inferred from private onboarding answers.
- Training category colors, the shorter opening copy and the mobile Explore layout were already published in the three-item visual batch.
- Judging criteria move above technical detail. Round-decision feedback has its own route; general feedback remains separate. Three existing images illustrate FAQ entries.
- The current Watch search, generated video library, collections and replay-first order are preserved. Its newly published parliamentary collection is preserved, with “Watch & vote” navigation and accurate wording about which rounds support audience votes.
- The display-name prompt waits for profile hydration and runs once per account. Saved names remain visible. Age questions reuse server answers and re-read when accounts switch; no age or research consent is invented.
- Homepage invitation rotation speeds up only on the left. The completed-round cadence remains coherent. A “Good chat” example has no invented winner or score.
- The live queue uses two desktop columns with the Commons higher and wider, less mobile spacing and a faster globe. Settings separates routine controls from research and account details. “Always” means saving future round transcripts; opt-outs are preserved.
- Public `/practice` and `/practice.html` redirect to `/newvoice`. Typed-practice entry points are removed while voice AI practice and legacy source needed for compatibility remain.

## Feedback form

The published [round-decision feedback form](https://docs.google.com/forms/d/e/1FAIpQLSe3UddjNT5ljSkR09hfa-PTk2SMftnrJQdGJs8bzZYKBkuUNw/viewform) has an optional round reference, optional usefulness rating, optional issue category and required description. Email collection and public results summaries are disabled. `ROUND_FEEDBACK_FORM_URL` is configured in Netlify production with functions scope. `/api/round-feedback-form` exposes only a validated public form URL; `/round-feedback` provides the handoff. No test response was submitted. The Apps Script helper defaults to the existing form ID and does not need to be run again.

## Apple verification

A real Chrome test returned `invalid_request: Invalid web redirect url` after a separate migration to `authDomain: itsdebatable.com`. The existing Debatable Web Apple service now includes `itsdebatable.com` and `https://itsdebatable.com/__/auth/handler`, preserving its Firebase-hosted entries. Saving succeeded and a fresh flow reached Apple's normal Debatable sign-in page. The user completed sign-in. The in-app browser reported a non-anonymous Firebase account with provider `apple.com` and token sign-in provider `apple.com`, and retained the same provider after a full reload. This establishes a real, persisted Apple session in that browser. It does not establish every Safari/native-device path. The /spar Apple button also called the shared handler with its modal closed, leaving first-time terms errors invisible. The handler now opens its chooser before checking terms, preserving prior acceptance and showing provider errors. Both first-time and returning paths have mocked browser coverage.

## Bounded AI-vs-AI harness

From the repository root, with Node 20+:

```sh
node scripts/test-ai-vs-ai-smoke.mjs
node scripts/ai-vs-ai-smoke.mjs --output work/ai-vs-ai-report.json
```

The default runs four deterministic mock turns with no network or model spending. It checks empty output, truncation, length, prefacing, repetition, em dashes and unsupported study references. These checks cannot establish reasoning quality or factual accuracy.

For a bounded real TEXT test using the application's current voice instructions, securely supply `OPENAI_API_KEY` in the process environment, then run:

```sh
node scripts/ai-vs-ai-smoke.mjs --live --transport openai --prompt-profile voice --model gpt-5.6-luna --rounds 1 --turns 4 --max-tokens 512 --output work/voice-prompt-check.json
```

The endpoint is fixed to OpenAI Responses, storage is disabled, redirects are refused and requests are never retried. `liveVoiceConfig` supplies the real spoken prompt, but the model is a text surrogate, not `gpt-live-1` audio. No microphone, interruption, audio latency, entitlement, application proxy or multi-model judge coverage is claimed. Prompt hashes and observed token usage are recorded without credentials.

All live modes require an explicit model and enforce 1–2 rounds, 2–6 turns per round, 64–512 output tokens per request, at most 12 requests, 20 seconds per request and three minutes total. Provider input and reasoning tokens also cost money. The harness never writes to a production round or ranking.

Two four-turn OpenAI runs on September 25 used eight paid requests and reported 5,731 tokens. Automated checks passed before and after. Manual review prompted explicit side assignment, shorter replies, no invented prior arguments, no silent changes to the proposed policy and less pressure for unsupported factual examples. The fallback reasoning prompt was tightened too. The later run still contained overconfident reasoning about restaurant costs and fair pay, so broad AI quality remains unverified. No additional paid runs were started. Earlier September 24 direct Anthropic tests were separate and exposed quality failures; they did not validate the voice product.

Other supported transports:

```sh
# Requires ANTHROPIC_API_KEY in the secure environment.
node scripts/ai-vs-ai-smoke.mjs --live --transport anthropic --model claude-haiku-4-5-20251001 --rounds 1 --turns 4 --max-tokens 256 --output work/anthropic-check.json

# Requires a running local Netlify server, its configured provider key,
# a test account's DEBATABLE_EVAL_TOKEN and, when enforced, DEBATABLE_EVAL_APPCHECK.
node scripts/ai-vs-ai-smoke.mjs --live --origin http://localhost:8888 --model YOUR_SUPPORTED_CLAUDE_MODEL --rounds 1 --turns 4 --max-tokens 256 --output work/local-proxy-check.json
```

The local proxy mode refuses remote/production origins and exercises its normal gates and logging. Do not put credentials in commands, reports or source.

## Verification

Relevant browser tests intercept all traffic and use synthetic profiles, standings and charter data. They cover layouts at 390, 834, 1180 and 1280 pixels, saved names, account switching, consent, left-only rotation, reduced motion and no-decision examples. Before/after screenshots use actual baseline/revised component code with mocked data; they are not live account screenshots.

```sh
node scripts/test-ai-vs-ai-smoke.mjs
node scripts/test-round-feedback-form.mjs
node scripts/test-public-identity.mjs
node scripts/test-judge-integrity.mjs
node scripts/test-corpus-consent.mjs
node scripts/test-live-voice.mjs
node scripts/test-newvoice-talk-it-out.mjs
node scripts/test-sitemap-indexing.mjs
node scripts/check-function-imports.mjs --all
cd e2e
npx playwright test walkthrough.spec.mjs landing-modules.spec.mjs auth-completion.spec.mjs round-feedback.spec.mjs round-feedback-review.spec.mjs
cd ../app
npm run build
```

Vite validates its configured entry rather than every standalone HTML page. The repository hooks run their required guards; the final task report records actual test results, commit, deployment and live route checks. Judging rules, ratings and account entitlements are unchanged.
