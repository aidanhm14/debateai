# Round data review

Use `scripts/audit-round-data.mjs` on a private JSON snapshot keyed by collection name. It scans every supplied live/async room, rating change, generation, generation signal, feedback record and blind review. The output contains aggregate counts and hashed review references, with no transcript text, account IDs or names. Raw snapshots stay outside Git and outside `app/`.

Follow the source chain before interpreting a number:

| Record | What it means | What it cannot establish |
| --- | --- | --- |
| `live_rounds` | Shared room state, attributed speech, decision and finish state | A created room is not a completed debate |
| `rating_changes` | Paired human results and the before/after rating | Speaker points are not the ranking metric |
| `user_ratings` | Current human standings | AI practice belongs to `ai_ratings` |
| `generations` | A consented capture or model output | Rows are not unique rounds; older rows lack round references |
| `generation_signals` | Owner feedback tied to a generation | A usefulness rating is not independent proof of the winning side |
| `voice_rounds` | Saved voice result/transcript | Do not add it to generation totals as another distinct debate |
| `rfd_ratings` | Explicit decision reviews | Missing reviews are unknown quality, never approval |
| `feedback` | Older unlinked feedback | Do not infer a round join from topic or account name |

New live captures carry `context.roundId`, `captureVersion:2`, and `transcriptScope:'own_side'`. Conversation labels, not the clock-owner field, select the person's words. New voice captures identify `human_and_ai`. Repeated writes use one deterministic generation ID per account, kind and round. One person's consent never authorizes storing or exporting their opponent's words as their contribution.

Review at `/admin-rate`: select `live_round`, `voice_round` or `practice_round`, then the relevant format. Full stored transcripts (up to the capture limit of 40,000 characters), round references, issue categories and notes appear together. A long round's operational transcript in `live_rounds` can be larger than its learning capture; do not confuse those two limits.

The parser's product-language and duplication flags are review leads. Inspect surrounding turns, microphone/timing evidence and the saved decision. Repeated arguments can be intentional; a phrase about audio does not prove a transport defect. Legacy mixed captures carry `qualityHold:'mixed_speaker_consent'`, are excluded from research sharing, and cannot enter automatic exemplars/distillation. Their text is preserved for internal investigation. Do not clear the hold based only on a high rating.

For judging, keep the entire supported transcript. The former 12,000-character per-speech cut removed closing arguments because a conversation is one speech container. The server now uses the existing total 288,000-character round budget, retains all text within it, and refuses oversize rounds before purchasing a judgment. New server ballots stamp `transcriptVersion:2` and the captured character count, so later audits can distinguish complete input from the old prefix path. Existing ballots and rubric versions are unchanged. Historical affected rounds belong in human review, not silent automatic rejudging.

For the ladder, run `node scripts/reconcile-ratings.mjs` with normal server credentials. It defaults to dry run; `--apply` repairs missing eligible human rounds chronologically. The affected suffix is replayed, old rating/change records are archived in `rating_reconciliations`, and the new ladder plus room deltas commit atomically. A changed snapshot, partial pair, recent seed, correction or ambiguous tournament result stops the repair. Never bypass these checks or append an old result after newer games without accounting for order.

Build evaluation sets separately: capture/attribution failures, finishing/recovery failures, and decision quality. Independently reviewed human winner labels can support accuracy measurements; the product's own judge labels support stability checks only. Keep a held-out set, version its provenance, test a proposed fix against it, and record the outcome before changing prompts. User feedback reports should not automatically become training examples; unresolved issue flags are excluded from the learning pool.
