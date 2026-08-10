// The corpus export schema, shared by admin-corpus-export.mjs (which
// enforces it) and admin-corpus-manifest.mjs (which documents it). One
// definition so the datasheet can never drift from what actually ships.
//
// Posture is allowlist-everything: a field not named here is dropped
// before any row reaches an external party.

// Free-text fields that can carry PII spoken/typed *inside* the content
// (a real name in a voice transcript, an email in a typed argument).
// Run through pii-scrub before export.
export const SCRUB_FIELDS = new Set(['motion', 'userPrompt', 'output', 'userNotes']);

// Top-level generations fields allowed out.
export const ALLOWED_TOP = new Set([
  'kind',
  'motion',
  'side',
  'format',
  'depth',
  'model',
  'promptId',
  'systemPrompt',
  'userPrompt',
  'output',
  'outputLength',
  'durationMs',
  'inputTokens',
  'outputTokens',
  'rating',
  'saved',
  'shared',
  'regenerated',
  'edited',
  'boring',
  'userNotes',
  'lastSignal',
  'contributable',
  'createdAt',
  // context is allowlisted separately below
]);

// Context-object allowlist. Only structural metadata that helps a lab
// understand the row, never anything that ties back to a person.
export const ALLOWED_CONTEXT = new Set([
  'persona',
  'turnCount',
  'userTurnCount',
  'fullTranscript',
  'language',
  'aiLanguage',
  'modeKey',
  'intensity',
  'source',
  'judgePool',
  'mode',
  'depth',
  'feature',
  'speechCount',
  'result',
  'speakerPoints',
]);
