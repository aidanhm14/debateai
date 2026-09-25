# Personal Gmail signup welcome

Each verified signup calls `POST /api/welcome-email`, which stores a delivery
due five minutes after the server's Auth creation time. A minute worker sends
one separate message per person, normally five to six minutes after signup,
even if the browser is closed. The existing half-hour sweep recovers
missed triggers and definitive failures. No historical email campaign is started
when Gmail is activated. Phone-only accounts cannot receive an email.

Sender and reply address: **aidandavidhollinger@gmail.com**. First names come
from account/profile names, with `Hey,` as the fallback. The email contains three
daily 9 pm sessions in New York, London and India local time, the existing
Debatable feedback form, and an invitation to bring a friend. No tracking pixel,
AI-invented personal details, attachments or newsletter layout.

## One-time Google connection

1. In the Debatable Google Cloud project, enable the **Gmail API**. Configure an
   OAuth consent app for the owner's use and include
   `https://www.googleapis.com/auth/gmail.send`, `openid`, and `email`.
   It does not need permission to read, delete, or organize email.
2. Use an OAuth **Desktop app** client and download its client JSON into a
   private local directory, outside the repository. For continuous operation,
   the consent app must be in production. Google issues refresh tokens that
   expire after seven days for an external app left in testing mode.
3. Run the following from the repository, replacing the private paths:

   ```sh
   node scripts/connect-welcome-gmail.mjs --client-json /private/client.json --output /private/gmail.env
   ```

4. Open the Google link printed by the helper and approve with
   **aidandavidhollinger@gmail.com**. The helper uses PKCE and state, listens
   only on the loopback interface, verifies the Google account, and writes a
   mode-0600 file. It never prints tokens, sends mail, or enables production.
5. Import `WELCOME_GMAIL_OAUTH` from that file into the existing Netlify site's
   **production Functions** environment as a secret. Keep the existing
   `EMAIL_UNSUB_SECRET`. Never paste tokens into a task, commit, screenshot,
   browser URL, or deploy log. Check the function environment size before
   adding the secret because this repository has an AWS environment size limit.
6. Send a test to the owner through `sendGmailWelcome`, using the owner's UID
   and existing signed unsubscribe URL. Confirm it appears in Gmail Sent with
   the correct sender and that replies return to this mailbox. Inbox placement
   at another provider is a separate observation, not something this proves.
7. Set `WELCOME_GMAIL_SINCE` to the current UTC ISO timestamp and
   `WELCOME_TRANSPORT=gmail`, then deploy. This only admits new accounts from
   activation onward. Existing welcome stamps remain honored. No Resend
   fallback is used in Gmail mode.

Until step 7, the existing Resend sender remains in use. The Gmail connection
has not been established merely because this code is deployed.

## Delivery records and recovery

`welcome_deliveries/{uid}` is server-only under the existing default-deny
Firestore rules. It records state, provider, source, submitted RFC Message-ID,
and the provider receipt. It contains no message body or OAuth token. Gmail may
replace the submitted Message-ID, as observed in the owner test on 2026-09-21.

- `sent`: accepted by the provider; the shared `signupWelcomeSentAt` stamp is set.
- `pending`: waits for its `nextAttemptAt`, without reserving Gmail capacity.
- `retry`: definitely rejected or never dispatched. Retry after its stored delay.
- `dispatching` or `uncertain`: do not automatically replay. Inspect Gmail Sent
  using the recipient's Auth email, subject `welcome to debatable`, and the
  record's `startedAt` window. The submitted Message-ID is only an additional
  search hint; absence of that ID does not prove Gmail rejected the message.
  If found, reconcile the Gmail receipt and profile stamp. Only clear the hold
  after establishing that no message was accepted; keep the hold if inconclusive.
- A receipt-write failure remains held as `dispatching`. Re-running the signup
  endpoint will not resend it. Gmail does not provide an exactly-once send API.

The rolling cap defaults to **100 send reservations per 24 hours**, configurable
with `WELCOME_GMAIL_DAILY_CAP` up to 400. It leaves room for personal email but
cannot measure mail sent outside this system. Google's account limits still
apply; a reservation is consumed even if the send fails. Over-cap messages wait
for recovery rather than disappearing. Delivery failure logs contain reason
codes without credentials or message bodies.

Tests: `node scripts/test-welcome-email.mjs` includes concurrent sends, ambiguous
network outcomes, failed receipt persistence, retry delays, rate caps, opt-outs,
verified-email eligibility, MIME headers, and all three meeting times and the calendar chooser.

## Explicit historical follow-up

Aidan authorized the new personal note for the last 150 signup accounts on
2026-09-21. `welcome_campaigns/{id}` stores the frozen UID list, approval status
and expiry; clients cannot write it. The admin-only `/api/admin/gmail-welcome`
sends one member at a time, using Gmail's existing private server connection.
It does not accept a recipient email or create/expand campaigns. Unverified
addresses and opt-outs are skipped. Older unversioned welcome stamps are
preserved; this note gets `personalGmailWelcomeSentAt` plus its separate
`gmail_campaign_deliveries` receipt. Prior copies of the current note are not
sent again, and ambiguous delivery stays held. The follow-up allowance is 150
per rolling day, separate from the 100 automatic signup welcomes. Close the
manifest after the requested run so it cannot be reused.

## References

- [Google: Gmail API send scope](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google: desktop OAuth with loopback callback](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google: refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2)
- [Google: sender guidelines](https://support.google.com/mail/answer/81126)
- [Google: personal Gmail sending limits](https://support.google.com/mail/answer/22839)

Real Gmail sending does not guarantee avoiding spam or landing in Primary.

## 2026-09-25 calendar update

The founder requested three suggested Clash Hours with Google and iCalendar
options. Welcome mail now matches the shared schedule: 9pm India, London and
New York, with `/clash-hours` as the calendar chooser. This supersedes the earlier
four-city welcome copy. Apple subscriptions and .ics downloads use stable event
UIDs and explicit time-zone rules; Google links open the next occurrence.

Today's separate member invitation is `clash-calendar-2026-09-25`, through
`/api/admin/clash-calendar`. Preview is read-only. `PREPARE` freezes the verified,
deduplicated cohort and message hash. `SEND` rechecks account preferences plus
Resend suppressions/audience opt-outs, uses individual envelopes and a durable
identical batch/idempotency key, and stops at midnight London time. Never expand
that frozen manifest or reuse this campaign for a later invitation. Receipts live
under `email_campaigns/clash-calendar-2026-09-25`. This does not consume the Gmail
welcome allowance. Resend's secret is available only inside Netlify; an API env
read returns a masked value and must not be treated as the usable key.
