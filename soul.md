# soul.md. Debate AI

**A living document of what this product is, who it's for, how it sounds, and why the decisions were made the way they were. When a new contributor (or a new Claude session) loads this repo, read this file first. If a change would contradict something here, either the change or this file is wrong. don't ship the change without reconciling.**

---

## 1. What this is (one sentence)

Debate AI is a **voice-first adversarial-argument trainer** built for competitive debaters, extending to any professional whose job is arguing out loud.

Not a chatbot. Not a writing assistant. Not a research tool. A **live sparring partner** that gives you real speeches against a clock, then grades you like a judge would.

## 2. Who it's for

**Primary (where the product is sharpest):**
- Competitive debaters, HS through college
- Format-accurate across APDA, BP, Policy, LD, PF, Worlds (WUDC), Asian Parli, Congress, MUN, and Quick Clash
- As of Apr 2026: traffic is ~80% Indian. The dominant school/college circuits here run **Asian Parli, WSDC, and BP**. Copy should lead with those, not APDA-first.

**Secondary (same engine, different room):**
- Lawyers. opening / closing / cross-ex / motion practice
- Sales. objection drills, demo rehearsal, negotiation
- Teams. red-team, pre-mortem, stakeholder rehearsal
- Founders. VC pitch rehearsal, board prep, hard conversations
- Students. interview prep, admissions essays, thesis defense
- Speakers. debate prep, media training, panel rehearsal

Each gets its own landing page under `/{slug}` with audience-tuned copy and a distinct color identity.

**NOT for:**
- People looking for a generic AI chat buddy. The whole point is that it **pushes back**. it's not a cheerleader.
- People who want written essays. The voice round is the moat.
- Casual learners who don't care about format accuracy. This is for people who debate seriously enough to care that APDA doesn't use tagged cards and Policy does.

## 3. The wedge (what makes it different)

Five things, in order of importance:

1. **Format accuracy.** Policy gets tagged-card delivery. LD gets value/criterion. BP gets extensions + whip structure. APDA is impromptu with no fake citations. No other AI-debate tool does this. they all speak in generic "Harvard debate society" English. This is the hardest moat to copy because it requires actually knowing debate.

2. **Voice round + judge RFD.** You can run a timed speech, hear pushback, take POIs, and get a judge ballot. That's the moat against ChatGPT. voice + timer + format-specific structure.

3. **Built by someone who won.** The creator is a national APDA champion. Most AI-product founders can say "I used AI to build this"; very few can say "I actually argued in this format at the top of the country." Surface this on the landing, not just the footer.

4. **Four brains + HD voice on paid.** Claude, GPT, Gemini, Grok. The $5/mo tier is where users get the full engine. BYOK is Anthropic-only and labeled as such.

5. **A learning loop that gets sharper every night** (live as of 2026-05-13). Every typed AI turn and every voice-round transcript writes to `generations`. Admin-weighted past rounds get pulled back into the system prompt of future rounds matching the same motion + format. A nightly Haiku pass distills the top-rated rounds per format into a "PATTERNS THAT WORK" block that also feeds back into prompts. The AI on motion X today is meaningfully different from the AI on motion X last month — see decision log 2026-05-13.

## 4. Non-negotiables (product principles)

These are the rules that override other considerations. Any change that violates one needs an explicit rationale.

- **Auth is ADVISED, not required (reversed 2026-04-20).** Anyone can use the app anonymously with the 5-request cap; sign-in unlocks the persistent profile, the 250-request Individual tier, and the style-learning loop. The prior full-screen pricing gate blocked too many users whose browser couldn't load Firebase (Safari ITP, in-app browsers, strict extensions). Nudges live in the topbar "Sign in. free" button, the SignUpNudgeModal after 2+ generations, and feature-specific paywalls on limit-hit. Google is still the only provider. email/password and magic-link remain off.
- **15-request free tier, then paywall (bumped from 5 on 2026-05-14).** Anonymous: 15. Signed-in: 30 total (15 anon + 15 bonus). The bump was a response to casual visitors hitting the paywall in their first session — the 5-request cap signaled "this is paid" too loudly and bounced people before they ever saw what the engine could do. The new floor: a user should be able to fully sample three to five real rounds across formats before they ever see a paywall. Pricing surfaces (the floating "Upgrade" pill, the persistent usage banner, the jumpnav Pricing link on /landing) were also softened the same day so the product reads as "free with a paid option" rather than "paid with a free trial."
- **BYOK is Claude-only.** Label it Claude-only on the card, the input form, and the error message. Cross-provider attempts throw a specific error.
- **APDA does NOT belong in the Topics Hub.** It's impromptu, no rolling motion. Only PF / LD / Policy / Congress belong there. APDA users go to the Motions tab (random generator).
- **No em-dashes in user-facing copy.** Copy was swept to remove them. New copy shouldn't reintroduce them.
- **No "no sign-up required" / "unlimited (on Free)" claims.** Those were stale references to the pre-gate model and keep getting caught in sweeps. (2026-05-14: "Free during beta" / "Currently free in beta" framing is now ALLOWED — the product is officially in beta with all tiers free and explicit "future pricing for reference" framing on /pricing and the landing FAQ. See decision log.)
- **No villain-line zingers about ChatGPT / "chatbots" / "yes-man AI."** Positive product framing only — describe what Debate AI does, not what other tools allegedly fail at. The "us vs them" sneer reads as insecure and was swept out 2026-05-14. "How is this different from a general-purpose AI" answers the same question without naming a villain.
- **Hard-refresh after SW bumps.** When cached bundles need to expire, bump `CACHE_NAME` in both `sw.js` files. Current: `debateos-v12`.
- **Debate-first is the commitment (2026-04-20).** The six separate audience pages (lawyers / sales / teams / founders / students / speakers) were consolidated into a single `/pro` page. Debaters remains the main landing. Professional use cases share one page with color-coded cards per room. Open strategic question #1 in section 9. now closed.

## 5. Voice & tone (how copy sounds)

**Punchy, specific, debater-register.** Not marketing-polished.

- Short sentences alongside longer ones. Rhythm matters.
- Real numbers and named people over abstraction. "Linda in Dayton loses her job" beats "economic harm to workers."
- Direct address. "You'll give real speeches against the clock" not "users can engage in speech-based interaction."
- No throat-clearing openers. Never start with "Imagine…" or "Picture a world…"
- No consultant-speak: no "holistic," "robust framework," "navigate the complexities of."
- Dismissive-when-earned. "That argument is cooked" is OK if the warrant is actually broken.
- One memorable line per section. Callbacks > recap closers.
- No em-dashes. Periods, commas, semicolons. that's the punctuation palette.

**Banned phrases (these rot the brand if they appear):**
- "no sign-up required" · "unlimited requests" (on Free) · "Infinity free"
- "Pay nothing" · "holistic approach" · "robust framework" · "at the end of the day"
- "Let's dive in" · "Let's unpack" · "Let's break it down" · "Let me break this down" · "Let me explain"
- "Hear me out" · "Stay with me" · "Bear with me"
- "In today's world" · "It's important to note"
- "ladies and gentlemen" · "I'm here to argue"
- "ChatGPT agrees with you" / "the chatbot agrees with you" / "yes-man chatbot" / any us-vs-ChatGPT zinger (the sneer reads as insecure — describe what we do, not what they don't)

(Note: "Free during beta" was on this list pre-2026-05-14 but has been lifted — the product is genuinely in beta with all tiers free, and the framing is explicitly "future pricing for reference, share feedback for pricing proposals." This is no longer a stale legacy reference; it's the current state.)

**The no-preface rule.** Never announce what you're about to say — say it. "Three reasons they're wrong, let's break it down" → "Three reasons they're wrong. One: ... Two: ... Three: ..." The numbers ARE the structure; the preface is dead weight. Same for "Here's why this fails" → cut "Here's why," start with the reason. Articulate, not chatty.

## 6. Build philosophy

- **Keep everything in this repo.** The landing, the app, the audience pages, the CSS, the Netlify functions. all in one tree. No split repos.
- **React inline in one big `app/index.html`.** Yes, it's 18k lines. Yes, we've talked about Vite. The split can happen when it actually hurts more than it helps; not before.
- **Netlify for everything**. hosting, functions, redirects. Stripe for payments. Firebase for auth + Firestore.
- **Publish dir is `/app/`** on Netlify's side. Mirror every user-facing file that lives at repo root into `/app/` too, because the build pulls from there. Same for `css/`.
- **`netlify.toml` in both root and `/app/`.** They must stay in sync on redirects. The `/` → `/landing.html` redirect needs `force = true` so it wins against any shadow `index.html`.
- **PWA + service worker.** Bump `CACHE_NAME` when HTML or bundle changes. Never precache `/` directly. it caused a root-routing regression.

## 7. Pricing (decided, stop debating it)

**CURRENT STATE (2026-05-14): Beta. All tiers free. The table below is future pricing for reference.** Every paywall surface (landing FAQ, /pricing, debate-ai paywall modal, the floating upgrade-cta pill) frames the tiers as "future pricing once we exit beta" and routes users to the feedback form for pricing proposals rather than to a checkout. No card is collected today. The structure stays defined so users know what's coming and so it's easy to flip back to active billing later.

Five tiers. Lifetime added to canonical list 2026-05-10. Individual repriced from $5/mo → $5/year on 2026-05-14 (see decision log).

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | 15 anonymous + 15 more on sign-in (30 total) |
| BYOK | $1/mo | Unlimited Claude (Anthropic-only, user's key) |
| Individual | $5/year | 250 requests/mo, 4 brains, HD voice |
| Lifetime | $14.99 once | 250 requests/mo forever, no recurring charge. One-time unlock for the user who'd rather not think about it again. |
| Team | $30/mo | 1,500 requests, 50 seats |

Target conversion tier: **Individual at $5/year**. Everything else exists to funnel toward it. The annual price isn't a discount strategy — it's a framing one. At $5 for the whole year, the decision stops being "is this worth a recurring monthly charge" (where the user is weighing it against Netflix) and starts being "is this worth a single tournament entry fee" (where the answer is obviously yes for anyone who debates). BYOK is for the power users who'd otherwise leave on cost; Lifetime is for the impulse-buy converter who wants out of even the annual renewal cycle; Team is for debate clubs and later sales motion.

## 8. Current state (updated Apr 2026)

- Live at debatethedevil.com
- ~6,980 active users in the last 28 days (per Firebase)
- ~80% Indian traffic (top cities: Bengaluru, Delhi, Mumbai, Hyderabad, Chennai)
- Reddit is the primary acquisition channel (~1,560 sessions / 28d)
- Organic search is near zero. SEO is an open investment.
- **Retention is ~2% Week 1.** Biggest known product problem. Everything else is downstream of this.
- **Paid conversions: 0 tracked.** Either tracking is broken or the funnel is. Verify Stripe → Firebase event firing before assuming the pricing gate works.

## 9. Open strategic questions

1. ~~Is this a debate tool that happens to extend to professionals, or a professional-argument tool that happens to have a debate niche?~~ **CLOSED 2026-04-20.** Committed to debate-first. Six audience pages consolidated into one `/pro` page. The moat (format accuracy, built by a champion) points at debaters; professionals ride on the same engine as a secondary revenue stream.
2. **Indian market.** 80% of your traffic is in India. Your copy is US-debate-centric. Either (a) lean into India hard (rewrite hero, reorder format list, partner with school circuits) or (b) accept that a huge share of traffic won't retain. Pick one.
3. **App Store packaging.** User said defer until the web app is tighter. When it's ready, path is Capacitor wrapping the existing PWA.
4. ~~**Learning loop.** User-input → style profile → re-injected into prompts.~~ **CLOSED 2026-05-13.** Loop is wired end-to-end. Every typed AI turn (case, opp_attack, rebuttal, judge, debate-chat, etc.) and every voice-round transcript writes to the `generations` collection via `captureTurn` inside `callAnyAI` / `callClaude`. Server-side `applyExemplars` (lib/exemplars.mjs) pulls 1–3 admin-weighted past rounds into the system prompt at runtime. Nightly `scheduled-distill.mjs` runs Haiku over top-rated outputs per format and writes a "PATTERNS THAT WORK" block to `learning_distillations/{format}`, which `applyDistillations` injects on every subsequent generation. Open follow-ups: session-end rating prompts on voice rounds (so distill has stronger labels) and exposing distillation freshness on /admin.
5. **Community features.** Live Debates / calendar / scheduled-judge sign-ups. Mentioned in Reddit post but thinly implemented.

## 10. Decision log (major decisions with why)

- **Removed anonymous trial** (2026-04). The free-bypass was leaking usage and preventing a real paywall signal. Gmail-required is the only clean policy.
- **Removed magic-link auth** (2026-04). Firebase email-link wasn't enabled and "via Gmail" was the stated direction. Two paths = confusion; one is clearer.
- **Reversed Gmail-required gate to advise-only** (2026-04-20). The full-screen pricing/sign-in gate locked out users whose browser couldn't load Firebase (iOS Safari ITP, Instagram/FB/TikTok in-app browsers, strict ad blockers). Too big a funnel leak to ignore. Now: anyone can enter with the 5-request anon cap; sign-in is advised via the topbar CTA + the post-2-generations nudge modal + feature-specific paywalls.
- **Tab shadows bumped to 30px vertical padding** (2026-04). `overflow-x:auto` on `.nav` clamps overflow-y to auto, clipping the red halo. 30px padding gives the shadow room to breathe.
- **Case Feedback moved from Other → Competitive** (2026-04). Post-round critique is a competitive-prep tool, not a support link.
- **Vocab Quiz added to Competitive** (2026-04). 52-term bank across debate flow / Policy / philosophy / elevated vocab. Multiple choice + flashcard mode, localStorage streak.
- **God mode trait preset** (2026-04). All strengths on, no weaknesses. `buildTraitPrompt` detects the combo and swaps to a dedicated world-champion prompt.
- **Audience pages use shared `/css/audience.css`** (2026-04). Level 1 distinctness is per-page `:root` override blocks for `--accent` and `--accent-glow`.
- **Per-format research allowance** (2026-04). `voice-guidelines.mjs` now has explicit research rules per format. Policy cards, PF citations, LD philosophy lit, parli no-evidence, Congress / MUN conversational cites. Prevents the AI from fabricating `Smith 2022` quotes in formats that don't use them.
- **APDA removed from CURRENT_TOPICS** (2026-04). Impromptu format; no rolling motion exists to hub. Users routed to Motions tab instead.
- **Counter sub-brand for the chrome extension** (2026-05-10). The chrome extension at `app/extension/` ships as **Counter: Oral Exam Trainer (by DebateAI)** — student-first, viva / oral-exam framed. The web app stays debater-first (per the 2026-04-20 commitment); the extension is a focused entry point for the "students" secondary audience listed in §2 (interview prep, admissions essays, thesis defense). This is NOT a contradiction with debate-first: same engine, different front door, sized for the highest-conversion entry context (highlight study material → defend out loud). India is the obvious primary market for this surface (80% of traffic, viva is universal in CBSE/ICSE board exams + IIT/NEET interviews + dissertation defenses). When future cleanup sweeps the surface for stale "DebateAI"-only branding, leave the extension's "Counter" labels alone.
- **Viva format added to FORMATS** (2026-05-10). New `viva` entry in `app/debate-ai.html` and `app/netlify/functions/lib/voice-guidelines.mjs`. Auto-selected when `?ext=1&mode=counter` is present. Two-speech structure (opening defense + cross-examination Q&A), no fabricated citations, plain academic register, examiner asks follow-ups under time pressure. This is the format the Counter extension defaults to.
- **Examiner persona ('Dr. Iyer')** (2026-05-10). New persona in `app/voice-debate.html` PERSONALITIES + `tts.mjs` voice maps. Indian-English measured academic tone via the OpenAI/Realtime `instructions` field; ElevenLabs falls back to its existing American voice (timbre stays American, register matches). Default persona for the Counter extension. Hindi-language vivas use the existing `aiLanguage='hi'` toggle, which already routes through the LLM and TTS pipelines.
- **Counter extension iframe switched to voice-debate.html** (2026-05-10). For oral-exam prep, the voice round (OpenAI Realtime) is the actual drill, not the typed flow. The extension side panel now loads `voice-debate.html?ext=1&mode=counter` instead of `debate-ai.html?ext=1&mode=counter`. The bridge useEffect in voice-debate.html prefills motion + auto-picks the Examiner persona + auto-picks `crossex` mode, landing the user one tap from "Connect."
- **Reverted the splash interstitial at /** (2026-05-15). Five days after adding `/splash.html` as the public face of the site at `/`, reverted it back to serving `/landing.html` at `/`. The splash had ~14 words of body content and zero outbound links (PREP/COMMUNITY removed the same day), so Google was indexing an empty page at the canonical URL `https://debateai.com/` while the 2,700-line marketing page with full SoftwareApplication + FAQPage structured data was buried at `/landing` with no inbound link equity. This is the root cause for the §8 "organic search is near zero" entry — not a content problem, a routing problem. The splash is still reachable at `/splash` for anyone who wants the voice-first intro; it just stops being the URL Google sees first. Paired with this: bumped the SoftwareApplication offers in the JSON-LD to the canonical pricing tiers (Free / BYOK $1 / Individual $5 / Lifetime $14.99 / Team $30), and added a `google-site-verification` meta placeholder so the user can verify ownership in GSC and finally see what queries the site ranks for.
- **Learning loop wired end-to-end** (2026-05-13). Closes §9 #4. Four surgical patches shipped: (1) `captureTurn` lives inside `callAnyAI` + `callClaude` in `app/index.html` so every typed AI turn (case, opp_attack, rebuttal, judge, debate-chat, casual, vision, resolution) lands in the `generations` Firestore collection with the full prompt → output triple, not just the case generator. (2) `voice-debate.html` `stop()` flushes the full turn-by-turn transcript to `/api/log-generation` with `kind:'voice_round'` so the WebRTC voice path stops being a blind spot. (3) New `app/netlify/functions/lib/exemplars.mjs` pulls 1–3 admin-weighted past rounds matching motion + format + side and prepends them as REFERENCE ROUNDS to `body.system`. Wired into all four brain functions (`claude.mjs`, `openai-chat.mjs`, `gemini.mjs`, `grok.mjs`) before `applyVoiceGuidelines`. Client (`callAnyAI` / `callClaude` in `index.html`) now sends `_motion` + `_side` in the body, stripped server-side after read. (4) New `scheduled-distill.mjs` runs nightly at 04:00 UTC over the previous 30 days of top-rated (rating ≥ 4 OR saved) generations per format, sends them to Claude Haiku with a strict "extract patterns" system prompt, writes the result to `learning_distillations/{format}`. `lib/distillations.mjs` reads that doc and appends a LEARNED PATTERNS block to `body.system` on every subsequent generation. Final system-prompt order: `[REFERENCE ROUNDS] + base system + [LEARNED PATTERNS] + [VOICE GUIDELINES]`. Voice rules come last so they win conflicts. Two 1-hour in-memory caches (admin uids, distillations) keep per-request Firestore reads near zero. Anon users can't log (server requires Firebase token), so this only captures signed-in usage — fine, that's the population we want.
- **Free tier bumped 5→15 and pricing surfaces softened** (2026-05-14). The 5-anon / 10-signed-in cap made the product feel paid-by-default; casual visitors hit the paywall before they understood the wedge. New caps: 15 anon, 30 signed-in (15 + 15). Per-pro-feature trial (Sneaky, Opp Attack, Competition Depth, Style Memory) bumped from 1 → 5 in `app/index.html` for the same reason. Pricing surfaces dialed back the same day: (a) `app/js/upgrade-cta.js` now only renders the floating "Upgrade" pill when the user has actually hit the cap, not as a persistent default-state ad on every page for every free user. (b) `app/js/usage-banner.js` hides the top-center usage banner for free users until 75%+ used (was 33%); paid users keep the graduated 50%/75%/90% severity tiers since budget awareness is genuinely useful for them. (c) `/pricing` removed from the `.landing-jumpnav` sticky in-page nav on `app/landing.html` — pricing info still reachable via the on-page FAQ "Pricing & practical stuff" block and the footer, just not surfaced as a top-level nav target. (d) Copy strings everywhere that said "5 free requests" / "all 10 free requests" / "Sign in for 5 more" got updated to either the new numbers or to ambient phrasing ("rounds left," "more on the house") so the per-action counter stops shouting the metering at the user. Updates to: `app/debate-ai.html` (ANON_LIMIT/SIGNED_IN_LIMIT consts + counter + modal copy), `app/index.html` (getAnonLimit, canUseProFeature, paywall modal, sign-up nudge), `app/learn.html` (ANON_BASE_LIMIT + banner copy), `app/high-school.html` (limit-hit copy), `app/counter.html` (hero pre-install + FAQ pricing line), `app/pricing.html` (Free-tier feature bullets), `app/report.html` (Free-tier row in the offers table), `app/landing.html` (JSON-LD FAQ answer + visible FAQ answer + pricing-card Free row), `app/extension/STORE_LISTING.md` (free-tier line). Server-side per-IP throttle in `app/netlify/functions/claude.mjs` (5/min, 40/hour, 150/day on `ANON_LAYERS`) is unchanged — that's an anti-abuse layer, not a paywall signal. Supersedes the 5-request principle in §4.
- **Beta-pricing framing, bento FAQ, villain-line removal** (2026-05-14, same day, third pass). Three more positioning moves:
  - **All tiers reframed as "future pricing — beta is free."** The product is officially in beta now; every pricing surface leads with "Currently free. The numbers below are what plans will look like after beta — share thoughts via feedback." Updates to: `app/pricing.html` (hero eyebrow + h1 + lede + A/B variant, new beta banner above the cards), `app/landing.html` FAQ "Is Debate AI free?" answer and the bigger "How much does it cost?" answer (both now lead with the beta state and link to the feedback form for pricing proposals), `app/debate-ai.html` paywall modal (eyebrow "Beta cap reached" + body explains beta + button now routes to the feedback Google Form, not /pricing), `app/js/upgrade-cta.js` (title "Help shape future pricing"; sub "Beta is free. Pricing proposals welcome."; CTA renamed "Feedback" + routed to the feedback form instead of /pricing). soul.md §4 + §5 + §7 updated: "Free during beta" lifted off the banned-phrases list since the product is now genuinely in beta with explicit future-pricing-for-reference framing. The literal "go to feedback for better pricing proposals" phrasing the user asked for is reused verbatim across surfaces so the message is consistent.
  - **Landing FAQ converted to a bento layout.** Replaced the uniform 3-column grid with a 6-column `grid-auto-flow: dense` bento where each tile is sized by editorial weight: `.faq-item--big` (3col × 2row) for wedge-defining questions (What is Debate AI / How is this different / How much does it cost / Is using this to prep cheating), `.faq-item--wide` (3col × 1row) for substantive secondaries, `.faq-item--circle` (2col × 1row, `aspect-ratio:1/1`, `border-radius:50%`) for short punchy questions ("Which debate formats?" / "Get started in 60 seconds" / "Bring your own API key?" / "Share cases with my team?" / "Who's behind this?"), and the rest as default 1×1 tiles. Open circles transition out of the disc shape into a normal rounded card so the answer panel fits; on mobile (<680px) all tiles collapse to a single column and aspect ratios are killed (a circle in a 1-col stack is awful). The `#faq > .wrap` max-width bumped 1240 → 1480 to give the bento room to breathe. Big-tile copy gets a larger non-uppercase question font so the size hierarchy reads visually, not just structurally.
  - **Villain lines removed sitewide.** The hero "The chatbot agrees with you. We don't." beat on `app/landing.html` was cut along with its CSS rule. The whole `.why-different` section (60+ lines: "Why Debate AI, not ChatGPT — Grounded in real rounds. Not just internet text. ChatGPT doesn't have any of that. It also agrees with you. This doesn't.") got deleted. The landing FAQ "How is this different from just using ChatGPT?" was renamed to "How is this different from a general-purpose AI?" and rewritten to describe what the product does rather than what ChatGPT allegedly fails at. The pricing.html "Does it actually make me better, or is it just another ChatGPT?" FAQ question and "ChatGPT will generate you a persuasive blob" answer got rewritten the same way. The counter.html "Is this just another AI chatbot in a side panel?" question was rewritten as "How is this different from chatting with an AI tutor?" without the villain framing. The topics/index.html "Most 'AI debate' tools give you a generic chatbot" line and the extension/STORE_LISTING.md "Not a chatbot pretending to be a tutor" line both lost the villain phrasing. The index.html "Debate-trained, not generic AI" pill lost its "not generic AI" half. Decision: positive product framing only — sneering at the out-group reads as insecure and contradicts the "varsity debater on the circuit, not philosophy seminar" register the AI itself is supposed to use. Banned-phrase list in soul.md §5 updated.
- **Individual repriced $5/mo → $5/year, Voice "Pro" rebranded to "New", FAQ regridded** (2026-05-14, same day, second pass). Three coupled product-positioning moves:
  - **Individual: $5/mo → $5/year.** The previous $5/mo target tier was being mentally compared to Netflix ($15-22/mo) and Spotify ($11/mo) — same shape (monthly SaaS), so the user's frame was "is this worth a recurring monthly bill?" At $5/year the frame switches to "is this worth a single tournament entry fee?" which is a trivially-yes answer for anyone who debates. Annual billing also kills churn-rate volatility. Updated in: `app/landing.html` (JSON-LD offer description + visible FAQ answer + pricing-rows card), `app/pricing.html` (JSON-LD + title + meta og/twitter + lede + Individual card cadence/button/note + FAQ entry on under-50-requests + Lifetime + Team subtitles), `app/debate-ai.html` (JSON-LD + paywall-modal "signed-in quota used" body), `app/index.html` (callAnyAI + callClaude error strings, pricing-grid in both signed-out and signed-in states, BYOK-cross-provider error, paywall-modal `/month` → `/year` cadence in localizedPrice block), `app/counter.html` (FAQ pricing line), `app/report.html` (header + Individual row + closing margin paragraph), `app/india.html` (rupee/USD mix), `app/us.html` (USD mix), `app/extension/STORE_LISTING.md` (free-tier line), `app/js/upgrade-cta.js` (pill title), `app/netlify/functions/lib/auth.mjs` (paid-feature error message). JSON-LD `price` field kept as "5" (still $5) — only the cadence/recurrence framing changed. BYOK ($1/mo = $12/yr) is now nominally more expensive than Individual ($5/yr), but BYOK serves a different niche: power users who'd rather route everything through their own Anthropic key for cost transparency / privacy / having the receipts. Lifetime ($14.99 once) is now ~3 years of Individual — still a meaningful upsell for users who want to forget about renewing.
  - **Voice rebranded: "Pro" tag → "New" tag.** On `app/landing.html` the hero pill rail and hero CTA rail both labeled Voice with a gold-on-amber `Pro` tag (CSS classes `hero-pill-pro` / `hero-cta-rail-pro` / `hero-pill-tag` / `hero-cta-rail-tag`). That framing put Voice mentally in the "paid feature locked behind a tier" bucket. Renamed CSS classes to `-new` and recolored from gold/amber to brand red (the same red as the primary CTA) so the badge reads as a fresh-feature highlight, not a paywall flag. Paired with the rename, the voice gate in `app/voice-debate.html` bumped its free caps (anon 1 → 3, signed-in 3 → 8) so the label isn't lying — Voice is now genuinely more accessible, not just relabeled. Updated copy on the upgrade gate ("Upgrade to Pro for unlimited voice" → "Keep going with a plan") and the sign-in gate ("Sign in for 3 more rounds" → "Sign in for 8 more voice rounds"). The TTS HD voice provider selector inside `app/debate-ai.html` (ElevenLabs / Inworld vs free OpenAI gpt-4o-mini-tts) keeps its `Pro` tag — that one is a genuine paid premium-voice upsell, not the Voice-round feature itself.
  - **Landing FAQ regridded into 3 columns.** `app/landing.html` `#faq` wrap max-width bumped 780 → 1240 (override on the `!important` rule at line 2636). The inner container converted from a vertical stack to `.faq-grid` with `grid-template-columns:repeat(3, minmax(0, 1fr))`; group headings (`.faq-group-head`) span the full row via `grid-column:1 / -1`. Drops to 2 columns under 1024px and 1 column under 680px so mobile reading order stays linear. Visual goal: FAQ now uses the available page width instead of a tall narrow rail nobody scrolled to the bottom of.

---

*Last updated: 2026-05-14 · Maintained as part of the repo, not as a wiki page. When something here becomes false, fix the code or fix this file. don't leave the contradiction.*
