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

5. **A learning loop that captures user style** (in progress). The AI remembers how you argue. preferred frameworks, signature phrases, topic areas. and mirrors your register.

## 4. Non-negotiables (product principles)

These are the rules that override other considerations. Any change that violates one needs an explicit rationale.

- **Auth is ADVISED, not required (reversed 2026-04-20).** Anyone can use the app anonymously with the 5-request cap; sign-in unlocks the persistent profile, the 250-request Individual tier, and the style-learning loop. The prior full-screen pricing gate blocked too many users whose browser couldn't load Firebase (Safari ITP, in-app browsers, strict extensions). Nudges live in the topbar "Sign in. free" button, the SignUpNudgeModal after 2+ generations, and feature-specific paywalls on limit-hit. Google is still the only provider. email/password and magic-link remain off.
- **5-request free tier, then paywall.** The free tier is an appetizer, not a product. Displayed as `5/5 free` (clamped. never `20/5`).
- **BYOK is Claude-only.** Label it Claude-only on the card, the input form, and the error message. Cross-provider attempts throw a specific error.
- **APDA does NOT belong in the Topics Hub.** It's impromptu, no rolling motion. Only PF / LD / Policy / Congress belong there. APDA users go to the Motions tab (random generator).
- **No em-dashes in user-facing copy.** Copy was swept to remove them. New copy shouldn't reintroduce them.
- **No "no sign-up required" / "unlimited" / "free during beta" claims.** Those were stale references to the pre-gate model and keep getting caught in sweeps. Default to naming the actual tiers.
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
- "no sign-up required" · "Free during beta" · "unlimited requests" (on Free) · "Infinity free"
- "Pay nothing" · "holistic approach" · "robust framework" · "at the end of the day"
- "Let's dive in" · "Let's unpack" · "In today's world" · "It's important to note"
- "ladies and gentlemen" · "I'm here to argue"

## 6. Build philosophy

- **Keep everything in this repo.** The landing, the app, the audience pages, the CSS, the Netlify functions. all in one tree. No split repos.
- **React inline in one big `app/index.html`.** Yes, it's 18k lines. Yes, we've talked about Vite. The split can happen when it actually hurts more than it helps; not before.
- **Netlify for everything**. hosting, functions, redirects. Stripe for payments. Firebase for auth + Firestore.
- **Publish dir is `/app/`** on Netlify's side. Mirror every user-facing file that lives at repo root into `/app/` too, because the build pulls from there. Same for `css/`.
- **`netlify.toml` in both root and `/app/`.** They must stay in sync on redirects. The `/` → `/landing.html` redirect needs `force = true` so it wins against any shadow `index.html`.
- **PWA + service worker.** Bump `CACHE_NAME` when HTML or bundle changes. Never precache `/` directly. it caused a root-routing regression.

## 7. Pricing (decided, stop debating it)

Five tiers, locked (Lifetime added to canonical list 2026-05-10):

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | 5 anonymous + 5 more on sign-in (10 total) |
| BYOK | $1/mo | Unlimited Claude (Anthropic-only, user's key) |
| Individual | $5/mo | 250 requests/mo, 4 brains, HD voice |
| Lifetime | $14.99 once | 250 requests/mo forever, no recurring charge. One-time unlock for the user who'd rather not think about it again. |
| Team | $30/mo | 1,500 requests, 50 seats |

Target conversion tier: **Individual at $5/mo**. Everything else exists to funnel toward it. BYOK is for the power users who'd otherwise leave; Lifetime is for the impulse-buy converter who wants out of the recurring-charge cycle; Team is for debate clubs and later sales motion.

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
4. **Learning loop.** User-input → style profile → re-injected into prompts. Scaffolding exists (`styleProfile` state, `StyleProfileModal`). Missing: capture-on-generate, server-side summarizer, prompt-injection wiring.
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

---

*Last updated: 2026-05-10 · Maintained as part of the repo, not as a wiki page. When something here becomes false, fix the code or fix this file. don't leave the contradiction.*
