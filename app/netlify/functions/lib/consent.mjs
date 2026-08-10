// Consent-ledger vocabulary. Shared by log-consent.mjs (the writer) and
// admin-corpus-manifest.mjs (the reporter) so the two can never disagree
// about what a valid event is.
//
// CONSENT_POLICY_VERSION identifies the privacy-policy revision the user
// saw when they acted. Bump it whenever privacy.html §6/§7 changes in a
// way that alters what consent means; the ledger then shows which users
// consented under which text. Never reuse an old value.

export const CONSENT_POLICY_VERSION = '2026-08-10';

export const CONSENT_EVENTS = new Set([
  'corpus_opt_in',          // research-corpus licensing consent granted
  'corpus_opt_out',         // research-corpus licensing consent withdrawn
  'corpus_nudge_dismissed', // saw the ask, declined (proves choice was real)
  'transcript_grant',       // round-entry transcript-storage consent granted
  'transcript_deny',        // round-entry transcript-storage consent declined
]);

export const CONSENT_SURFACES = new Set([
  'corpus-nudge',  // the post-rating opt-in modal
  'profile',       // /profile settings toggles
  'round-entry',   // the TranscriptConsent modal before a round
  'other',
]);
