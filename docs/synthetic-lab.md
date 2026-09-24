# Private synthetic debate lab

`/synthetic-lab` is an internal research surface. It does not affect public
judgments, ratings, recorded user rounds or the training corpus.

The gate verifies a password server-side using scrypt. Netlify's Functions-only
`SYNTHETIC_LAB_AUTH` contains a JSON object with a random hexadecimal `salt`
(16 bytes), `hash` (32 bytes, scrypt output), and session-signing `key` (32
bytes). The password itself is not in the repository or client. The cookie
is host-only, Secure, HttpOnly, SameSite=Strict and expires in eight hours.
POSTs require the canonical origin and JSON. Every data read and write,
including raw downloads and training exports, verifies the session.

Firestore `synthetic_lab_runs` and `synthetic_lab_control` are server-only
under the existing default-deny rules. No client Firebase SDK is used. The
control collection owns transactional login limits, a 40-round daily cap,
an 800-model-call daily cap, and motion-to-family assignment. The caps are
call limits, not dollar guarantees. Login counters use a keyed IP hash;
expired bucket documents can be pruned by an admin. Raw IPs are not stored.

One authenticated step makes at most one model request. A 90-second lease
prevents simultaneous steps. `expectedStep` makes a repeated completed
request idempotent. Provider timeout is 45 seconds. Saved responses replay
locally with exact prompt hashes, so resuming never intentionally calls a
completed step again. A process failure between a provider response and
storage may still cause a retry to incur another call. A round has at most
22 attempts. Closing the browser pauses advancement after the in-flight
request; reopening and choosing Continue resumes it.

The server owns models, rubric, phases and request shapes. Claude and GPT
take six alternating speeches, then independent judge calls annotate the
transcript. Up to two repairs use only the prior turn context and receive
two comparisons with reversed candidate order. Model identities and private
reviewer notes are omitted from judge input. Same-family model bias remains
possible; human review is required. API response IDs, actual models, usage,
prompts, configuration and hashes stay with the private run.

`synthetic-lab-core.mjs` builds research prompts around the current casual
adjudication core without editing the production charter. A rubric/version
change blocks resuming an older experiment; completed raw data remains
downloadable. This is not the full production judge path.

All AI annotations start provisional. Approval requires a named reviewer,
factual-check acknowledgement, validated exact quote spans and optional
corrected judgment. Candidate repairs must pass both comparisons and be
selected by the reviewer. Raw JSON is always available to authorized users.
SFT, preference, judge and held-out benchmark files are separate. Family
assignment is a fixed 80/10/10 hash split. Near-duplicate topics must use one
family. Never move a held-out family into training to improve reported scores.
Exports currently cover at most 200 approved rounds and refuse larger
collections instead of silently truncating. No fine-tuning job is launched.

The benchmark panel accepts candidate-model predictions for the reviewed test
rounds. It scores winner agreement, counts missing outputs as errors, and
shows a descriptive Wilson interval. Variants in the same family are not
independent samples. This does not measure explanation quality or debate
skill; those need separate blind comparison and human calibration.

Checks: `node --test scripts/test-synthetic-lab.mjs`,
`node scripts/check-function-imports.mjs --all`, the normal commit hooks,
browser interaction at desktop/mobile sizes, and a full real provider round.
