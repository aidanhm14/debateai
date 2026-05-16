# Chrome Web Store listing — Counter

Paste-ready copy and reference for every field on the Chrome Web Store
developer dashboard. Read this top-to-bottom the first time, then keep
it as the source-of-truth when you update the listing.

---

## Identity

**Name** (≤45 chars, 26 used)
```
Counter: Oral Exam Trainer
```

**Short description** (≤132 chars, 112 used)
```
Defend your work out loud. The AI grills you the way your panel will. Viva, oral exam, CBSE/ICSE, JEE/NEET prep.
```

**Category**
- Primary: **Productivity**
- Secondary (if a "Education" tab exists for your account): **Education**

**Language**
- English

**Visibility**
- Start as **Unlisted** while you self-test, then flip to **Public** after a clean dogfood week.

---

## Detailed description (≤16,000 chars)

```
Counter is the AI you couldn't sit across from in school. You wrote
the essay. You built the project. You drafted the paper. Now the
panel wants you to defend it out loud, and "I think I get it" is not
going to land. Counter is the sparring partner that grills you the
way your teacher will, before your teacher gets the chance.

Highlight your own work in Google Docs, or paste it into the side
panel, and an examiner-style AI cross-examines you out loud. You
defend the claim; it asks the next question. After 3-5 probes it
closes with examiner-voice oral feedback: what landed, what didn't,
and where to tighten before the real panel.

Built for:
• CBSE viva (Class 10 + 12 Physics, Chemistry, Biology, Computer Science practical and project orals)
• ICSE oral practice (Hindi, English, History, Geography, Biology orals)
• State board oral exams (Maharashtra HSC, Karnataka PUC, Tamil Nadu state board, etc.)
• JEE Advanced + NEET counselling and interview prep
• IIT / IIM / NMIMS / NLU / school-admission interview rehearsal
• University seminars, internal assessment vivas, dissertation and thesis defenses
• Any exam where you have to argue out loud, not just write — including English-medium and Hindi-medium

What you get
• Highlight + right-click → Quiz me on this passage
• Floating "Quiz me" pill in Google Docs (Docs canvas blocks the right-click; the pill catches your copy events instead)
• Voice round powered by OpenAI Realtime: server-side voice activity detection means the AI actually waits for you to finish, then answers in under a second
• Dr. Iyer, the Examiner persona: measured Indian-English, asks one precise question and lets you think, no piling on
• A real "viva" format with structured speech list (opening defense → 3 examiner probes → closing defense) and per-format voice rules so the AI doesn't drift into debate-jargon mode
• Hindi-language vivas via the in-app language picker
• Keyboard shortcuts: Ctrl/Cmd+Shift+D to quiz, Ctrl/Cmd+Shift+R to defend, Ctrl/Cmd+Shift+Y to open the panel

How it differs from "AI tutor" extensions
• Voice-first. The drill is talking, not chatting. Real oral examiners don't wait for a typed paragraph; this one doesn't either.
• One question at a time. Counter doesn't dump three questions, two follow-ups, and a summary in a single beat. It asks, it stops, you think.
• Indian-English by default. The senior-academic register your panel will actually use.
• No fabricated citations. The AI works from the passage you highlighted, not invented "Smith 2022" quotes.
• No debate jargon in oral mode. "Warrant" and "magnitude / probability / timeframe" stay silent in the examiner's head; the student gets plain academic English.

Pricing
• Free: 15 anonymous + 15 more on sign-in (30 total drills)
• Individual at $5/year: 250 drills/month, four AI brains, premium voice
• Lifetime at $14.99 once: 250 drills/month forever, no recurring charge
• Bring-your-own-key (Anthropic Claude only) at $1/month for unlimited
• Team at $20/year for school clubs and prep groups (1,500 drills/month, 50 seats)

Counter is part of DebateAI. Same engine that powers debateai.com's
voice round and six-brain panel; the chrome extension is a focused
entry point for the student / oral-exam audience.

Built by a national APDA debate champion. A sparring partner that
asks the questions your examiner will actually ask.
```

---

## Single-purpose statement

```
Counter has one job: let a user highlight study material on a web page or in Google Docs and practice oral examination on it out loud, with the AI as the examiner.
```

---

## Permission justifications

(Paste each into the corresponding permission's "justification" textbox in the developer dashboard.)

**`sidePanel`**
```
Required to render the Counter user interface in Chrome's side panel — the panel is the only surface the user interacts with after triggering a context-menu item or shortcut.
```

**`contextMenus`**
```
Required to add the three "Quiz me on this passage", "Defend this out loud (cross-exam)", and "Cross-examine the AI on this" entries to the right-click menu over selected text. These are the primary entry points to the extension.
```

**`activeTab`**
```
When the user triggers Counter via context menu, keyboard shortcut, or the Docs floating pill, the extension reads the URL and selection of the user's currently active tab so it can pass that text into the side panel. No other tabs are accessed; no background access.
```

**`storage`**
```
Required to queue a single pending action (the selection text the user just clicked) between the moment the context-menu handler fires and the moment the side panel finishes mounting. Stored in chrome.storage.session, cleared the moment the panel drains it.
```

**`clipboardRead`**
```
Required by the side panel's "Paste from clipboard" fallback button. In environments where the right-click flow is intercepted by the page (some PDF viewers, some intranet tools), the user copies the passage and pastes it manually; this permission is what lets the panel read clipboard contents on the explicit Paste click.
```

**`identity`**
```
Required to call chrome.identity.getAuthToken so the user can connect their Google account to the Counter side panel and have the extension read their currently-open Google Doc via the Google Docs API. The token is requested only after the user clicks "Connect" inside the side panel; it is never requested in the background, never persisted by the extension, and is revoked the moment the user clicks "Disconnect".
```

**`tabs`**
```
Required to read the URL of the user's active tab so the side panel can identify which Google Doc the user is currently viewing. Without this, the "Read active doc" button cannot resolve the document ID. The extension does not iterate other tabs, does not track tab-change events, and does not read tab content beyond what is required to extract the docId from the URL.
```

**Host permission `https://debateai.com/*` and `https://debatethedevil.com/*`**
```
The Counter side panel renders an iframe of debateai.com's voice round and typed flow so the extension shares one engine, one billing surface, and one auth session with the web app. host_permissions on these origins is required for the iframe to load and for postMessage bridging between the panel and the iframe to work without origin-blocking. No other origins are accessed by the extension's own code.
```

**Host permission `https://docs.googleapis.com/*` and `https://www.googleapis.com/*`**
```
Required to call the Google Docs API and the Google OAuth userinfo endpoint after the user has explicitly authenticated. The extension reads documents only when the user clicks "Read active doc"; it writes documents only when the user clicks "Apply to Doc" on a specific edit proposal the user reviewed in the side panel. Each API call is gated on a manual user action; nothing happens in the background. The userinfo endpoint is used solely to display the connected account's email in the side panel for confirmation.
```

**OAuth scope `https://www.googleapis.com/auth/documents`**
```
Required for the user-confirmed editing flow: the user reads their doc, asks Counter to sharpen a specific passage, reviews the agent's proposed replacement in a diff card, and clicks "Apply to Doc" to commit the single replacement. Without write access, only the read-and-quiz drill is possible. Every write goes through documents.batchUpdate with one replaceAllText request scoped to the exact text the user confirmed; the extension never edits docs in the background, never deletes spans the user did not see, and never iterates over multiple docs.
```

**Content script on `<all_urls>`**
```
Required exclusively to detect copy events in Google Docs and Microsoft Word Online, both of which use canvas rendering rather than the standard DOM. Without a document-level copy listener, the floating "Quiz me" pill cannot surface in those products because the right-click + selection-capture path is intercepted by the page. The content script does NOT read page DOM, does NOT track navigation, and does NOT exfiltrate page data; it only listens for the copy event to know that the user just selected text in a canvas-rendered editor.
```

---

## Privacy

**Privacy policy URL**
```
https://debateai.com/privacy-extension
```

**Data collection disclosures** (the developer dashboard's checkbox grid)

| Type | Counter collects? | Note |
|---|---|---|
| Personally identifiable information | Yes (limited) | If the user connects Google Docs, the email address of the connected Google account is displayed in the side panel for confirmation. Not stored, not transmitted to any third party, never used for advertising. |
| Health information | No | |
| Financial / payment information | No | Billing happens at debateai.com via Stripe; the extension never sees payment information. |
| Authentication information | No | If the user signs in inside the iframe, sign-in happens at debateai.com against Firebase. The extension itself does not store or transmit credentials. The Google OAuth token used for the Docs API is held only in chrome.identity's cache, which the user can clear by clicking "Disconnect". |
| Personal communications | No | |
| Location | No | |
| Web history | No | The extension does not track browsing history. |
| User activity | Yes | Selection text clicked through a Counter context-menu item is sent to debateai.com for AI processing. |
| Website content | Yes | Same as above. Additionally, when the user clicks "Read active doc", the contents of the currently-open Google Doc are fetched via the official Google Docs API and shown in the side panel for the user's review. |

**Required certification checkboxes**
- [x] I do not sell or transfer user data to third parties, outside of approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Screenshots (1280 × 800 PNG/JPEG, at least 1, ideally 5)

Capture these on a high-DPI monitor at 1280×800 effective. Each one
gets a 1-line caption.

1. **`01-context-menu.png`** — Highlighted paragraph in a Wikipedia article on photosynthesis, with the Chrome right-click menu open and the three Counter entries visible ("Quiz me on this passage", "Defend this out loud (cross-exam)", "Cross-examine the AI on this"). Caption: "Highlight any passage. Right-click. Counter quizzes you on it."

2. **`02-docs-pill.png`** — Google Docs page with a paragraph selected, Cmd+C just pressed, the floating "Quiz me" pill visible bottom-right. Caption: "Inside Google Docs, copy → the Quiz me pill appears."

3. **`03-side-panel-setup.png`** — Side panel open showing voice-debate.html?ext=1&mode=counter with the motion field prefilled, Dr. Iyer persona selected, viva mode selected, and the big Connect button visible. Caption: "One tap from Connect. Examiner persona, viva mode, motion prefilled."

4. **`04-voice-round.png`** — Side panel mid-round: waveform visualization, Dr. Iyer's avatar pulsing, transcript showing one examiner question and one student answer. Caption: "Live voice round. The examiner asks one precise question and waits."

5. **`05-feedback.png`** — End-of-session ballot card showing the 30-second oral-feedback verdict from Dr. Iyer, plus the round count for the bond progression. Caption: "Closes with examiner-voice oral feedback. No debate ballot — viva-style."

(Optional 6: "Hindi-language viva" — same as 4 with aiLanguage='hi'
selected. Captures the Indian-market story directly.)

---

## Promotional tiles

Both are nice-to-have but not strictly required.

- **Small promo tile**: 440 × 280 PNG. Counter logo on dark background with the headline "The AI you couldn't sit across from in school."
- **Marquee promo tile**: 1400 × 560 PNG. Required only if you want to be considered for the editorial featuring slot.

---

## Submission checklist

Run this list before clicking "Submit for review":

- [ ] `manifest.json` version is bumped from the live version
- [ ] `npm run build:ext` (or `app/extension/build.sh`) produces `counter-v0.x.x.zip`
- [ ] Zip opens cleanly and contains `manifest.json` at the root, not nested in a `extension/` folder
- [ ] Privacy policy URL `https://debateai.com/privacy-extension` is live (deploy first)
- [ ] At least 1 screenshot at 1280×800 attached
- [ ] Single-purpose statement matches the manifest description
- [ ] Each requested permission has a justification pasted in
- [ ] "Sells data" / "uses for unrelated purposes" / "creditworthiness" boxes all UNCHECKED
- [ ] Tested unpacked install on a fresh Chrome profile (no existing DebateAI session) and confirmed the side panel loads, the Docs pill works, and at least one voice round completes
- [ ] If OAuth (Google Docs API agent) is in scope: extension ID is locked via the manifest `key` field, OAuth client ID is registered, and the consent screen is configured

---

## Common review-rejection reasons (and how Counter avoids them)

1. **Broad host permissions without justification.** Counter's `host_permissions` are limited to debateai.com and debatethedevil.com. The `<all_urls>` content script is justified specifically by the Google Docs canvas-rendering case.
2. **Vague single-purpose statement.** Counter's is concrete: "let a user highlight study material and practice oral examination on it out loud."
3. **Misleading screenshots.** All screenshots are real captures, not mockups.
4. **Privacy policy contradicts manifest.** This file (`STORE_LISTING.md`), the privacy policy at `/privacy-extension.html`, and the manifest are written from the same data flow. If you change one, change the others — search the repo for "privacy-extension" to find the bindings.
5. **Inactive extension.** Don't sit on the listing for months without an update; bump the version and ship a small improvement at least quarterly.

---

## Where each piece of Web Store text actually lives in the repo

| Web Store field | Source of truth in repo |
|---|---|
| Name, description, version | `app/extension/manifest.json` |
| Short description | `manifest.json` `description` field |
| Detailed description | This file (`STORE_LISTING.md`, "Detailed description" section) |
| Single-purpose statement | This file, "Single-purpose statement" section |
| Permission justifications | This file, "Permission justifications" section |
| Privacy policy | `app/privacy-extension.html` (rendered at debateai.com/privacy-extension) |
| Icons | `app/extension/icons/icon-{16,32,48,128}.png` |

When the Web Store listing says one thing and a file in this repo says
another, the file in the repo wins. Update the listing.
