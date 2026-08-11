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
  // The opinion panel rides the SAME corpus opt-in rather than minting its
  // own toggle, so there is no panel_opt_in event. These two record the
  // optional extras the panel asks for on top: the segmentation answers
  // (experience, circuit, region, age band) that make a cross-tab possible.
  // They are separate events because a panelist can answer propositions
  // forever without ever giving a segment, and the ledger should show that
  // the segment was its own choice.
  'segments_given',
  'segments_cleared',
]);

export const CONSENT_SURFACES = new Set([
  'corpus-nudge',  // the post-rating opt-in modal
  'profile',       // /profile settings toggles
  'round-entry',   // the TranscriptConsent modal before a round
  'panel',         // the opinion-panel widget
  'other',
]);
