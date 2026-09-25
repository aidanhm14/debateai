# Transcript storage and coverage

The intended uses are participant history and separately consented research. Storage consent does not authorize publication or external research sharing. This document describes the code, not a measured production completeness rate.

## Existing stores

Text is already stored in Firestore, Firebase project `debateos-78ac5`.

| Store | Purpose and coverage |
| --- | --- |
| `live_rounds/{room}` | Operational human-room state: attributed conversation segments, completed speeches and decision. Needed for synchronization and server judging. This is distinct from optional personal capture. |
| `voice_transcripts/{id}` and `chunks/{sequence}` | Optional, owner-readable incremental archive for a consenting account, including anonymous Firebase accounts. New live-human and `/voice-debate` headers carry `roundId` at creation. `/newvoice` currently attaches its round reference at completion. |
| `generations` | Model outputs and optional per-person round captures used by existing review and research tools. These are not unique rounds. Live captures contain only that consenting person's words; AI voice captures label human and model turns. |
| `voice_rounds` | Completed `/voice-debate` decision and transcript. Creation checks transcript consent; reads are owner-only until the owner explicitly chooses **Share decision and transcript**. Publication changes only the publication fields, never evidence or scores. |
| `saved_rounds` | Explicitly saved participant history. |
| `round_feedback` | Explicit feedback reports, independent of transcript-storage permission. Contains no copied transcript. |

A generation's internal `context.transcriptId` can link a live-human or `/voice-debate` summary to its fuller archive. The pointer does not authorize reading, publication or research export. It is excluded from the existing external export allowlist.

## Consent boundaries

- `TranscriptConsent` must grant optional archive storage. A decline or unanswered prompt creates no optional voice archive. Human capture stores only the authenticated person's own committed segments or completed speeches. Spectators, partnered rooms and four-team rooms do not enter this personal capture path.
- The shared module asks only when capture is started. Live conversation background capture requires an existing grant, so it does not add a new mid-speech prompt. A later grant can capture the person's existing committed segments through the same round's capture session.
- External research selection still uses the existing server-verified corpus preference, recorded adult attestation, future-round-only rules, withdrawal and provider restrictions. The new chunk writer does not change these rules.
- `voice_rounds` is private by default, including legacy records without a publication field. A saved link alone grants no access. Existing explicitly URL-encoded shared payloads are unchanged.
- Retention and account-deletion behavior are unchanged. AI audio is not newly retained.

## Acknowledgement and retry

The shared writer batches at 25 stored turn parts or ten seconds. Pending chunks remain in memory until Firestore acknowledges their immutable, stable sequence ID. A failed or timed-out write retries with backoff and retries on an online event. If a prior create succeeded but its acknowledgement was lost, readback must match the exact owner, sequence and turn fields before it counts as saved. Conflicting content does not count.

Headers count acknowledged chunks and characters, carry pending-chunk counts, and report `incomplete` after a saving error. `complete` is written only after the entire queued archive and the final header are acknowledged. Reaching the safety limit reports `capped`, never `complete`.

A finalized turn longer than 4,000 characters is split into labelled parts with stable part identifiers, the same speaker and time metadata. Joining the parts restores the full text. Surrogate pairs are kept intact. Existing overall limits remain 600 stored turn parts and 240,000 text characters per archive session. Reaching either limit explicitly marks the archive capped.

`/voice-debate` now uses this writer for finalized user turns, finalized/interrupted model turns and typed interventions. Streamed model deltas are not recorded as duplicate turns. Startup waits do not discard an early finalized turn. Human conversation capture stores committed own-seat segments while the round runs and deduplicates repeated operational publishes; finishing does not add a second combined transcript copy.

## Known limits and operator questions

- The retry queue is in memory, not a durable cross-reload outbox. A browser or device killed before acknowledgement can still lose pending words. Previously acknowledged chunks survive. No claim of 100% capture is justified without measuring acknowledged coverage.
- Timed human speeches enter the personal archive when finalized. Their unfinished speech may remain only in operational/browser recovery state. Raw microphone audio and words the transcription provider never returned are not recovered by buying more text storage.
- `/practice` still captures its generation record at ballot time, so abandoned typed rounds are not comprehensively archived.
- `generations.context.fullTranscript` remains a bounded summary (39,000 client characters, 40,000 server limit). Existing research export reads eligible generation records, not the full chunk archive. Exporting full archives needs a separately reviewed join that verifies the archive owner, per-person consent at capture, research eligibility and withdrawal; the archive pointer alone is insufficient.
- Rejoining may create another archive session for one round. `roundId` and segment source IDs help distinguish this from a new round. Aggregate reporting must deduplicate at round/person/source-segment level, not count headers as debates.
- Human operational conversation streams retain their existing 144,000-byte per-seat limit in 1v1. Final saves fail visibly above that bound. This limit is separate from the optional archive and generation-summary limits.
- `privacy.html` section 6 still says a storage decline means nothing reaches the server, while human operational synchronization and judging persist room text regardless. Its claim that every stored transcript is unreadable by the opponent also conflates personal archives with shared room state. Reconcile this language with the actual, necessary room processing and optional-history boundary before extending collection. This change does not silently rewrite that policy or override a decline.
- Verify deployed Firestore rules, then monitor started sessions, consented sessions, acknowledged chunks, completed/capped/incomplete archives, failed saves and missing round links as aggregate counts. Separate declined capture from technical loss. Existing `scripts/audit-round-data.mjs` is useful for room/generation completeness but does not yet certify every chunk archive.

Regression coverage: `node scripts/test-voice-transcript.mjs` exercises consent, pending writes, retries, ambiguous acknowledgements, conflicting content, split long turns, explicit caps, per-person conversation attribution, final-turn deduplication and private history rules.
