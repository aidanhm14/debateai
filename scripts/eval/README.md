# Adjudication eval

Replays real out-rounds through the AI judge and scores them against the
configured expected call. BP rounds are scored as 1-2-3-4 team orderings. WSDC
and other two-sided rounds are scored as side winners. The gold file can also
mark a fixture as a disagreement case, where the human call is preserved but
the expected label is the corrected call the model should reach from the flow.
It imports the **same** `lib/adjudication.mjs` core that ships in prod, so it
measures the real engine.

## Run

```bash
# validate fixtures + prompt assembly, no API spend:
node scripts/eval/run-adjudication-eval.mjs --dry-run

# score against the model (needs an Anthropic key):
ANTHROPIC_API_KEY=sk-ant-... node scripts/eval/run-adjudication-eval.mjs

# one round / first N:
node scripts/eval/run-adjudication-eval.mjs --only=vienna24-r2
node scripts/eval/run-adjudication-eval.mjs --limit=5

# one format:
node scripts/eval/run-adjudication-eval.mjs --format=bp
node scripts/eval/run-adjudication-eval.mjs --format=wsdc
node scripts/eval/run-adjudication-eval.mjs --format=public-forum
node scripts/eval/run-adjudication-eval.mjs --format=policy
```

Env / flags: `ADJ_FIXTURES` (transcript dir, defaults to the path baked into
`adjudication-gold.json`), `ADJ_MODEL` (defaults to `claude-sonnet-4-6`).

Format aliases are normalized by the runner: `bp`, `wudc`, `worlds`, `wsdc`,
`asian`, `apda`, `npda`, `pf`, `public-forum`, `ld`, `lincoln-douglas`,
`policy`, `cx`, `congress`, `karl-popper`, and `mun`.

## What's committed vs not

- **Committed:** `adjudication-gold.json` — the gold labels (team orderings or
  two-sided winners + motions + which fixture files). These are non-sensitive.
- **Not committed:** the round transcripts themselves. They are private flow
  notes that name real debaters. Point `ADJ_FIXTURES` at a local copy.

For disagreement training, keep the panel's actual call in `humanOrder` or
`humanWinner`, set `verdictMode` to `challenge`, and put the corrected target in
`expectedOrder` or `expectedWinner`. The runner scores against the expected
label, not the preserved human call.

## Fine-tuning

Build private OpenAI supervised fine-tuning files from the local fixtures:

```bash
node scripts/eval/build-adjudication-finetune.mjs
```

By default this writes to `/tmp/debateit-adjudication-finetune`:

- `adjudication-train.jsonl`
- `adjudication-valid.jsonl`
- `manifest.json`

The JSONL files contain private flow notes and real debater names. Do not commit
them. To write under the repo for local experiments, use an ignored directory:

```bash
node scripts/eval/build-adjudication-finetune.mjs --out=scripts/eval/out/adjudication-ft
```

Submit the generated files to OpenAI when an API key is present:

```bash
OPENAI_API_KEY=sk-... node scripts/eval/submit-openai-finetune.mjs \
  --train=/tmp/debateit-adjudication-finetune/adjudication-train.jsonl \
  --valid=/tmp/debateit-adjudication-finetune/adjudication-valid.jsonl \
  --model=gpt-4.1-nano-2025-04-14
```

Use `--dry-run` first to validate the request without uploading. OpenAI's
fine-tuning access is account/model dependent; the script will preserve the
dataset and fail cleanly if the org cannot create fine-tuning jobs.

## Metrics

- **BP top-1 accuracy** — did the AI put the same team 1st (random ≈ 25%).
- **BP exact 1-2-3-4 accuracy** — whole ordering matches (random ≈ 4%, brutal).
- **BP pairwise agreement** — fraction of the 6 team-pairs the AI orders the same
  way as the expected label (random ≈ 50%, perfect = 100%). **This is the headline
  metric:** it gives partial credit and is robust to the close/split rounds
  where even human panels disagreed (see `confidence` in the gold file).
- **WSDC / two-sided winner accuracy** — did the AI pick the configured side
  winner (random ≈ 50%).
- **Challenge count** — how many scored cases asked the model to reject a human
  note or call rather than imitate it.

## The big caveat

The fixtures are the chair's own **shorthand flow notes**, not clean speech
transcripts, and they're laced with the chair's inline verdict marks (bolded
interjections, "default to OG", "NR to frame"). The harness de-contaminates
(strips bold spans, parenthetical judge marks, all-caps reactions) before
judging so the AI can't read the answer off the page — but the strip is
best-effort and the notes are terse. **Treat the score as a noisy lower bound
and a regression tripwire, not an absolute grade.** For a clean eval, add full
transcripts to the fixtures dir and reference them in the gold file.
