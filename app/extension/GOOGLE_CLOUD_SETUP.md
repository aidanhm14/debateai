# Google Cloud setup for the Counter Docs agent

10 minutes, one-time. You do this in your browser; I cannot do it for
you (it's all clicks in the Google Cloud console under your account).

When you finish, you'll have **one OAuth client ID** that goes into
`app/extension/manifest.json`. The Counter side panel's "Connect Google
Docs" button starts working the moment you reload the unpacked
extension.

---

## Order of operations (read this first)

The two ID's are circular: Google's OAuth client wants the extension's
ID, and the extension's manifest wants the OAuth client ID. So the
flow is **load unpacked once with a placeholder, copy the extension ID
out of `chrome://extensions`, finish the OAuth setup, paste the OAuth
client ID back in, reload.**

```
1. (optional) Generate a stable extension key   — gen-extension-key.sh
2. Load unpacked → copy the extension ID         — chrome://extensions
3. Google Cloud: project + APIs + consent screen — console.cloud.google.com
4. Google Cloud: OAuth client (uses extension ID) — same place
5. Paste OAuth client ID into manifest.json       — one line edit
6. Reload extension → click Connect → done       — chrome://extensions
```

The "stable extension key" step is **optional today**, but you want it
**before publishing to the Web Store**. Without it, the dev install
and the Web Store install get different IDs, which means you have to
re-do the OAuth client config after publish. With it, they match.

---

## Step 1 (optional but recommended) — lock the extension ID

```bash
./app/extension/scripts/gen-extension-key.sh
```

Output looks like:

```
Wrote private key to app/extension/.local/extension.key.pem (gitignored)
Public key (paste into manifest.json as a top-level "key" field):

  MIIBIjANBg... [base64, ~390 chars] ...AQAB
```

In `app/extension/manifest.json`, add a top-level `"key"` field at the
same indent level as `"name"`:

```json
{
  "manifest_version": 3,
  "name": "Counter: Oral Exam Trainer (by DebateIt)",
  "key": "MIIBIjANBg...AQAB",
  ...
}
```

The private key file (`extension.key.pem`) stays on your machine and
is gitignored. Keep a backup somewhere safe; if you lose it you cannot
re-sign offline `.crx` builds with the same identity.

---

## Step 2 — load unpacked, copy the extension ID

1. Visit `chrome://extensions`
2. Toggle **Developer mode** (top right) on
3. Click **Load unpacked**, pick `app/extension/`
4. The Counter card now has a line like `ID: kpkpkpkpkpkpkpkpkpkpkpkpkpkpkpkp`
5. **Copy that ID** — you'll paste it into Google Cloud in step 4

---

## Step 3 — Google Cloud: project, APIs, consent screen

### 3a. Project

1. Go to <https://console.cloud.google.com>
2. If you don't have a project, click the project dropdown at the top
   → **New Project** → name it something like `counter-extension` →
   **Create**
3. Make sure that project is selected in the top dropdown

### 3b. Enable APIs

1. **APIs & Services → Library**
2. Search **Google Docs API** → click → **Enable**
3. Search **Google Drive API** → click → **Enable** (Stage 2 will need
   this for listing the user's docs; safe to enable now)

### 3c. OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. **User Type**: **External** (unless you have a Google Workspace and
   want it locked to your domain) → **Create**
3. Fill in:
   - **App name**: `Counter`
   - **User support email**: your email
   - **App logo**: optional, skip for now
   - **Application home page**: `https://debateit.com`
   - **Application privacy policy link**: `https://debateit.com/privacy-extension`
   - **Application terms of service**: optional, skip
   - **Authorized domains**: add `debateit.com`
   - **Developer contact**: your email
4. **Save and Continue**
5. **Scopes** screen → **Add or Remove Scopes** → search for and
   select:
   - `https://www.googleapis.com/auth/documents` (read + write — required
     for the agent to apply user-confirmed edits to the active doc)
   - `https://www.googleapis.com/auth/userinfo.email`
   - **Update** → **Save and Continue**
   - This scope is treated as a "sensitive" scope by Google. While in
     Testing mode (next step) you can use it without verification; for
     production launch on the Web Store, plan for OAuth verification
     (~2-6 weeks security review).
6. **Test users** screen — add **your own Google account email**
   while the app is in Testing mode. (You can later "Publish app" to
   open it to all Google accounts; for first-week dogfooding stay in
   Testing mode.) **Save and Continue**.
7. **Summary** → **Back to Dashboard**

### 3d. Why the consent screen looks scary in Testing mode

When you first connect, Google will show a **"Google hasn't verified
this app"** warning. That's normal for an unpublished extension. Click
**Advanced** → **Go to Counter (unsafe)** to proceed. After Web Store
publish + Google's verification, the warning disappears.

---

## Step 4 — create the OAuth client (Chrome Extension type)

1. **APIs & Services → Credentials**
2. **+ Create Credentials → OAuth client ID**
3. **Application type**: **Chrome Extension**
4. **Name**: `Counter (chrome extension)` (just a label for you)
5. **Item ID**: paste the extension ID you copied in Step 2
6. **Create**
7. A modal pops up with **Your Client ID** like
   `<32 chars>-<27 chars>.apps.googleusercontent.com`
8. **Copy the full client ID** (including the `.apps.googleusercontent.com` suffix)

---

## Step 5 — paste the OAuth client ID into manifest.json

Open `app/extension/manifest.json`. Find:

```json
"oauth2": {
  "client_id": "PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
},
```

Replace the placeholder with your real client ID. **Do not commit this
to a public repository if your repo is public** — OAuth client IDs are
not secrets, but they're tied to your project and can hit quota
limits if abused. For private repos, committing is fine.

---

## Step 6 — reload the extension and connect

1. `chrome://extensions` → click the **reload** icon on the Counter
   card
2. Click the Counter toolbar icon → side panel opens
3. Click the **Docs** button in the top bar → the docs strip drops down
4. Click **Connect** → Google's OAuth popup opens → choose your
   account → if you see "Google hasn't verified" → **Advanced** →
   **Go to Counter (unsafe)** → **Continue**
5. The strip status now reads **Connected as you@gmail.com**
6. Open any Google Doc in another tab → come back to the side panel →
   click **Read active doc** → the doc's title and first 600 chars
   appear in the strip

That's Stage 1 working end-to-end.

---

## Troubleshooting

**"OAuth2 not granted or revoked" error on Connect**
- The client ID in manifest doesn't match the OAuth client in Google Cloud, OR
- The extension ID in chrome://extensions doesn't match the Item ID in the OAuth client config (this happens if you reloaded the unpacked extension WITHOUT a `key` field — Chrome reassigns the ID)
- Fix: copy the current extension ID from chrome://extensions, edit your OAuth client in Google Cloud → Credentials → click the client → update Item ID → Save.

**"This app isn't verified" / "Google hasn't verified this app"**
- Expected while in Testing mode. Click **Advanced → Go to Counter (unsafe) → Continue**.
- For your published extension, submit for OAuth verification in Google Cloud (separate from Chrome Web Store review). Required before you can leave Testing mode and accept arbitrary users.

**"Access blocked: This app's request is invalid"**
- The redirect URI Chrome generates doesn't match what Google expects.
- This is automatic for `Chrome Extension` OAuth clients — if you're seeing it, you probably picked **Web application** instead. Recreate the OAuth client with type **Chrome Extension**.

**The Connect button does nothing / immediately errors**
- Open the extension's background-script devtools: `chrome://extensions` → click **Inspect views: service worker** under Counter
- Look at the console; the actual chrome.identity error is logged there
- Most common: client_id is still the placeholder. Search manifest.json for `PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE`.

**Quota exceeded after lots of testing**
- Default Docs API quota is 300 read requests per minute per user.
  More than enough for human use, but tight loops will hit it.
- If you do hit it: Google Cloud → APIs & Services → Quotas → search
  "Docs API" → request an increase. Approval is usually same-day.

---

## Stage 2 is now live

The setup above already requests the broader `documents` scope (read +
write), which is what Stage 2 needs. You don't have to redo anything.

What Stage 2 unlocks in the side panel:

- After **Read active doc** loads your document, an agent input appears
  below the snippet ("Sharpen this. e.g. 'make the thesis more direct'")
- Type a request and hit **Propose** (or Enter)
- Counter sends the doc passage + your request to `/api/docs-agent`,
  which calls Claude with one tool (`propose_edit`)
- The proposal renders as a diff card: red-strikethrough for the existing
  text, green for the replacement, italic for the agent's reason
- **Apply to Doc** writes the single replacement via
  `documents.batchUpdate`. Cmd/Ctrl+Z in Docs reverts.
- **Reject** discards the proposal; nothing is written

If the agent picks text that doesn't appear exactly once in the passage,
the server-side guardrails surface that as an error before the side
panel ever shows an Apply button — the user is asked to refine the
request.

---

## What changes when you go to the Chrome Web Store (preview)

1. Make sure the manifest has a `key` field (Step 1) so the extension
   ID won't change post-publish. If you didn't lock it: after publish,
   copy the new ID from the Web Store dashboard, update your OAuth
   client's Item ID in Google Cloud, done.
2. In Google Cloud → OAuth consent screen → **Publish app**. This
   moves you out of Testing mode; the "unverified" warning goes away
   for your verified scopes.
3. For the broader scopes used in Stage 2 (`documents`), Google
   requires OAuth verification: a security review (~2-6 weeks) where
   they want a video walkthrough showing exactly how each scope is
   used. Plan for this.
