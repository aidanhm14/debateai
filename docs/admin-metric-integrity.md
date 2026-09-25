# Admin metric definitions

September 25, 2026: the dashboard previously mixed Auth accounts with profile
documents, treated a recent event sample as full history, counted sign-in starts
and successes as failures, declared A/B leads from zero clicks, and divided all
exit reasons by card impressions.

- **Signups:** all signup charts, cohort membership and the headline use named
  Firebase Auth accounts. The seven-day headline and warning use the same server
  field and a rolling window. The daily chart is UTC calendar days. Internal
  accounts remain excluded from retention. Auth read errors never become zeros.
- **Activity:** the bounded newest-first scan reports its coverage boundary.
  Distinct activity IDs are returned only for fully covered rolling 24-hour,
  7-day and 28-day windows. Anonymous IDs represent sessions, not known people.
  Stickiness requires both complete windows. Uncovered retention cells are null,
  not 0%; a failed query returns an error or an explicitly stale cached response.
  This change does not backfill a full activity ledger or increase the 4,000-event
  read budget. Exact longer-window values require complete history or a future
  deduplicated activity rollup.
- **Sign-in failures:** only `sign_in_error`, plus legacy records without an
  event name carrying an `auth/` code. Historical lifecycle records are excluded
  at read time. Old clients' lifecycle posts are acknowledged without storage;
  current clients preserve them in ordinary analytics only. Capped scans are
  explicitly partial. A failure record is not a unique failed person.
- **Experiments:** impressions and matching conversion sessions are descriptive.
  No arm is declared the leader. A future inferential result needs a defined
  outcome, unit of assignment, complete data and a statistical stopping rule.
  Session identity survives a sign-in during the exposure-to-click journey.
- **Exit cards:** `card_id` joins a prompt's display and terminal event. Repeated
  receipts count once. Known button reasons remain in the reason breakdown but
  never enter the card response rate. Unpaired historical card events are shown
  separately. Orphan/conflicting receipts and truncated scans suppress the rate
  instead of clamping it to 100% or manufacturing a denominator.

Changed aggregates use new cache versions so pre-fix values do not survive a
deployment. `node scripts/test-admin-metric-integrity.mjs` runs behavioral
fixtures, handler tests and dashboard rendering checks, including the observed
225/225 sample, nine-vs-nine, two-vs-zero, zero-vs-zero and mixed exit sources.
