# Counter — Publish & Promote

Action-oriented companion to `STORE_LISTING.md`. The other doc has the
content (descriptions, permission justifications, privacy notes). This
one has the click order + the demo asset + the week-1 promo playbook.

---

## 1. Publish to the Chrome Web Store (one-time)

### Pre-flight (do once, before any submission)

1. **Pay the $5 developer fee.**
   - Go to https://chrome.google.com/webstore/devconsole/register
   - Sign in with a Google account you want associated with the publisher
     identity. Aidan's main is fine; the publisher name shows on the
     listing as "DebateAI" (set in the developer profile).
   - Pay the one-time $5 USD fee. Approval is instant.

2. **Lock the extension key.**
   - Currently `manifest.json` has no `"key"` field, which means each
     unpacked install gets a different extension ID and OAuth flows
     break across machines. For the production listing:
     ```bash
     ./app/extension/scripts/gen-extension-key.sh
     ```
     paste the printed `"key": "..."` into `manifest.json` at the top
     level, commit. From this point on, the extension ID is stable.

3. **Confirm the privacy policy is live.**
   - Open https://debateai.com/privacy-extension in a fresh tab. It
     should render the dark-themed privacy page. If 404, redeploy
     debateai.com first — the listing will reject without a working
     privacy URL.

### Build the artifact

```bash
./app/extension/build.sh
```

Output: `app/extension/dist/counter-v0.11.0.zip` (version follows
`manifest.json`). Open the zip to confirm `manifest.json` sits at the
root, not inside an `extension/` folder.

### Pre-submission gotcha — OAuth client_id

`manifest.json` ships with `oauth2.client_id` set to the placeholder
`PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com`.
The v0.11 Counter-your-draft feature works without OAuth (paste-passage
→ /api/counter-doc, no Google identity involved), but the Chrome Web
Store reviewer WILL flag the placeholder. Two choices before submit:

1. **Recommended for first ship**: strip the `oauth2` block + the
   `identity` permission + the `docs.googleapis.com` / `www.googleapis.com`
   host_permissions from `manifest.json`. The lib/docs-api.js +
   background.js Stage-2 Docs-edit code goes dormant (no UI reaches it
   anyway in v0.11). Re-add when you wire a Read-Active-Doc UI in the
   side panel.

2. **If you want OAuth from day one**: run through
   `GOOGLE_CLOUD_SETUP.md` end-to-end. ~10 minutes in console.cloud.google.com
   per the doc; the real OAuth client ID replaces the placeholder.
   You'll also want to lock the extension `key` field first so the
   client ID and extension ID stay tied across dev / store installs.

### Submit (the actual click order)

1. Open https://chrome.google.com/webstore/devconsole/.
2. Click **New item** (top right).
3. **Upload** the `counter-v0.9.x.zip`. Wait for the analyzer; if it
   flags anything, fix in the source repo (don't edit the zip
   directly) and rebuild.
4. **Store listing tab** — paste from `STORE_LISTING.md`:
   - **Description** → "Detailed description" section (≤16k chars)
   - **Category** → Productivity (primary), Education (secondary)
   - **Language** → English (US). Add Hindi later via the "Add
     translation" button if/when you localize the listing.
   - **Icons** — already in zip from `app/extension/icons/icon-128.png`.
   - **Screenshots** (1280×800) — need at least 1, target 5. See
     "Demo asset" section below for what to shoot.
   - **Promotional tiles** — skip unless going for editorial feature.
5. **Privacy practices tab**:
   - **Single purpose** → paste the single-purpose statement.
   - **Permission justifications** → paste each one. Match the
     manifest's permissions list exactly.
   - **Data usage** → check ONLY "Personally identifiable information"
     (the user's Google name appears on the leaderboard) and "User
     activity" (drill history). LEAVE UNCHECKED: sells data, uses for
     credit/lending, uses for unrelated purposes.
   - **Privacy policy URL** → `https://debateai.com/privacy-extension`
6. **Distribution tab**:
   - **Visibility** → **Public**.
   - **Regions** → All regions. (India is 80% of traffic; don't
     accidentally exclude.)
   - **Pricing** → Free.
7. **Save draft**, then **Submit for review**.

Review typically takes 1-3 days. Status emails go to the publisher
account. If rejected, the email cites the exact policy clause —
search `STORE_LISTING.md` "Common review-rejection reasons" first;
most rejections match one of those five and the fix is in the doc.

### Post-publish wiring

The moment the listing goes live, you get a URL like
`https://chrome.google.com/webstore/detail/counter/abcdef123456`.

Then in this repo:

```bash
# Replace the placeholder install link everywhere it appears.
git grep -l 'chrome.google.com/webstore/detail/counter' \
  | xargs sed -i '' 's|chrome.google.com/webstore/detail/counter|chrome.google.com/webstore/detail/counter/<your-actual-id>|g'
```

Files that reference the placeholder today (verify with `git grep`):
`app/counter.html`, `app/landing.html` (if Counter card is there),
`app/extension/STORE_LISTING.md` references.

Commit + push. Topbar pill on debateai.com now points to a real
install page.

---

## 2. Demo asset (30-second screencap)

This is the single most leverage-able piece of marketing copy you'll
have. It's the chip that goes everywhere: store screenshots, Reddit
posts, YouTube Shorts, X, embed on counter.html.

### Setup

- **Recording tool**: QuickTime → File → New Screen Recording (Cmd+5
  on macOS). Native, no overlay, sharp. Record at 1920×1080;
  Chrome Web Store screenshots downscale to 1280×800.
- **Subject**: a Wikipedia article that reads as exam material.
  Recommended: https://en.wikipedia.org/wiki/Mitochondrion. Visually
  busy, recognizably "biology textbook", universally familiar.
- **Browser chrome**: hide bookmarks bar, use a fresh Chrome profile
  so no extensions clutter the toolbar. Counter icon should be the
  only visible extension.
- **Audio**: record system audio (the AI voice) AND mic (your defense
  speech). QuickTime → Options → Internal Microphone + Built-in Output.
  Practice the user-side speech 2-3 times before the live take —
  hesitations kill the rhythm.

### Beat-by-beat script (30s, English)

| Time   | On screen                                              | Audio (VO or natural)                                         |
|--------|--------------------------------------------------------|---------------------------------------------------------------|
| 0:00   | Wikipedia mitochondrion page, scrolled to "Function"   | (silent)                                                      |
| 0:01-3 | Cursor highlights "Mitochondria are involved in apoptosis" sentence | (silent)                                              |
| 0:03-4 | Floating chip appears bottom-right: ● Quiz me ⌘⇧D       | (subtle chip-appear tick — already in content.js SFX)         |
| 0:04-5 | Click chip                                              | (click)                                                       |
| 0:05-8 | Counter side panel slides in, topic prefilled, big "Start drill" highlighted | (silent — let the UI breathe)                  |
| 0:08-9 | Click Start drill                                       | "Start drill" UI press                                        |
| 0:09-12| Live pill appears: "Live · cross-exam · Mitochondria…"; orb pulses | AI voice (Dr. Iyer): "Tell me — what role do mitochondria play in apoptosis?" |
| 0:12-22| User speaks: "Mitochondria release cytochrome c into the cytoplasm, which triggers caspase activation and starts the apoptotic cascade." | (your real voice)                                  |
| 0:22-25| AI follow-up                                            | "And what's the trigger upstream of that release?"            |
| 0:25-28| End drill. Brief RFD shown                              | (visual: "SPEAKER POINTS: 27.5")                              |
| 0:28-30| Logo card                                               | "Counter, by DebateAI. Free on Chrome Web Store."             |

### Hindi variant (same beats, different audio)

The AI voice can speak Hindi if the user selects Hindi in the side
panel before the drill. For the Hindi cut:

- 0:09-12 — AI (Hindi): "बताइए, माइटोकॉन्ड्रिया का apoptosis में क्या role है?"
- 0:12-22 — User responds in Hindi-English code-switch (natural for
  CBSE board exam students).
- 0:28-30 — VO: "Counter — viva ke liye taiyaari, har page par. Chrome
  Web Store par free."

Don't dub. Re-record the take. Tone of the Hindi audio matters more
than the words.

### Captions (burn-in)

Three lines, max 28 chars each, sans-serif white with 50% black
shadow. Place at bottom-center, not bottom-edge.

1. (0:00-0:05) **Highlight anything.**
2. (0:05-0:22) **The AI grills you out loud.**
3. (0:22-0:30) **Speaker points like a real round.**

### Cuts to deliver

From the same source recording, export:

- **Full 30s** — YouTube, counter.html embed, debateai.com landing.
- **15s** (0:00-0:09 + 0:25-0:30) — YouTube Shorts, X, Reels.
- **Five 1280×800 stills** for Chrome Web Store screenshots:
  1. Wikipedia + the Quiz me chip visible
  2. Counter side panel open with topic prefilled
  3. Mid-drill: orb pulsing, live pill visible
  4. RFD card with the speaker-points line
  5. The leaderboard with a real entry from this drill

---

## 3. Week-1 promotion playbook (after listing is live)

Order matters. Each step assumes the previous shipped.

### Day 0 (publish day)

- [ ] Replace placeholder install link in repo (see section 1 post-publish wiring).
- [ ] Post the install URL in pinned tweet on @DebateAI X account.
- [ ] Post once in your own circle (LinkedIn / Instagram story) — soft launch, not the public push.

### Day 1-2: debateai.com integration

- [ ] Add a Counter install banner to the debateai.com topbar (right
  side, dismissible, fires `gtag('event', 'counter_install_click')`).
- [ ] On `/voice-debate.html` end-of-session screen, add a small "Drill
  from any page → install Counter" link.
- [ ] On `/india` and `/pro` landing pages, surface Counter as the
  primary mobile-adjacent CTA (since the extension is desktop-only,
  desktop visitors are the right audience).

### Day 3: Reddit

Pick ONE subreddit per day for the first week — don't blast. Each post
is the 30s demo + 2-3 sentence pitch matching the sub's vibe.

- [ ] **Day 3** — `r/CBSE` or `r/JEENEETards`: lead with "highlight any
  textbook section, get grilled out loud before your viva". Demo
  video. Don't link the install in the post body — comment with the
  link after the post lands. Reddit hates direct promo in OPs.
- [ ] **Day 4** — `r/CompetitiveDebate` or `r/Debate`: reframe to
  "highlight any motion on a news article, instantly drill it in
  cross-ex". Different framing, same extension.
- [ ] **Day 5** — `r/IndianTeenagers` or `r/IndiaInvestments`-adjacent
  student subs: the broadest pitch ("AI that grills you on anything
  you read"). Lower conversion, wider reach.

After each post, watch for:
- Comments asking for features → respond, file as GitHub issues.
- "Is this safe?" / "what permissions" → link the privacy page
  directly. Don't be defensive; transparency converts.

### Day 4-7: YouTube + X

- [ ] **YouTube channel** — if you don't have one yet, create
  `@DebateAI`. Upload the 30s demo as a YouTube Short. Title:
  "Get grilled before your viva does." Tags: `viva prep`, `cbse`,
  `jee neet`, `oral exam`, `study tool`.
- [ ] **YouTube Short, Hindi variant** — same day. Different title:
  "Apne notes par viva practice kar — ekdam page se."
- [ ] **X / Twitter** — pin the demo as a tweet on @DebateAI.
  Quote-tweet from Aidan's personal handle with the founder angle
  ("built this because I lost a viva I had nailed in writing.").
- [ ] **Producthunt** — schedule a Tuesday launch (Tue/Wed get the
  best traction). Hunter outreach 5 days before launch day.

### Educator outreach (slow burn, high conversion)

Parallel to all the above. One a day, no batching:

- [ ] Email 5 CBSE board-exam tutors with a 90s personal video (your
  face on camera, demo behind). Subject: "I built a Counter for my
  former teacher — wanted you to see it before anyone else."
- [ ] DM 5 debate coaches on Instagram with the same approach,
  reframed for competitive debate.
- [ ] Find 3 IIT/NEET YouTubers (mid-tier, 20-100k subs) who already
  do study-tool reviews. Email them the demo + a "no strings, just
  thought you'd find it useful" note.

---

## 4. Conversion telemetry to add before promoting

You can't optimize what you can't measure. Add these events BEFORE
day 0 so the first week of traffic gets counted:

```js
// On counter.html, every install CTA click
gtag('event', 'counter_install_click', {
  source: window.location.pathname,         // /counter, /, /india, /pro
  referrer: document.referrer || 'direct',
});

// In background.js, on first install (chrome.runtime.onInstalled)
if (details.reason === 'install') {
  fetch('https://debateai.com/api/log-counter-install', {
    method: 'POST',
    body: JSON.stringify({
      version: chrome.runtime.getManifest().version,
      installedAt: Date.now(),
    }),
  }).catch(() => {});
}

// On first 'drill-started' in background.js
// (already tracked for streak — also fire a one-time activation event)
if (totalDrills === 0) {
  fetch('https://debateai.com/api/log-counter-activation', {...});
}
```

Add a matching Netlify function `log-counter-install.mjs` that just
writes to Firestore `counter_installs` with `{version, installedAt,
ip-derived country}`. Lets you correlate Reddit / YouTube / Twitter
traffic to actual installs.

The funnel you'll watch:
1. Landing visits to /counter
2. Install clicks
3. Installs (chrome.runtime.onInstalled fires)
4. Activations (first drill goes live — already tracked via
   `debateai-ext-live` postMessage → `drill-started` → recordDrill)
5. Day-2 retention (drilled at least once on day +1 after install)

Soul.md §8: retention is the real bottleneck. The funnel above is
how you'll know whether Counter has the same problem the web app does
or whether the install gesture self-selects for higher-retention
users.
