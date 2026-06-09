# Adjudication eval

Replays real BP out-rounds through the AI judge and scores its 1-2-3-4
ordering against the chair's actual call. It imports the **same**
`lib/adjudication.mjs` core that ships in prod, so it measures the real engine.

## Run

```bash
# validate fixtures + prompt assembly, no API spend:
node scripts/eval/run-adjudication-eval.mjs --dry-run

# score against the model (needs an Anthropic key):
ANTHROPIC_API_KEY=sk-ant-... node scripts/eval/run-adjudication-eval.mjs

# one round / first N:
node scripts/eval/run-adjudication-eval.mjs --only=vienna24-r2
node scripts/eval/run-adjudication-eval.mjs --limit=5
```

Env / flags: `ADJ_FIXTURES` (transcript dir, defaults to the path baked into
`adjudication-gold.json`), `ADJ_MODEL` (defaults to `claude-sonnet-4-6`).

## What's committed vs not

- **Committed:** `adjudication-gold.json` — the gold labels (team orderings +
  motions + which fixture files). These are non-sensitive.
- **Not committed:** the round transcripts themselves. They are private flow
  notes that name real debaters. Point `ADJ_FIXTURES` at a local copy.

## Metrics

- **top-1 (winner) accuracy** — did the AI put the same team 1st (random ≈ 25%).
- **exact 1-2-3-4 accuracy** — whole ordering matches (random ≈ 4%, brutal).
- **pairwise agreement** — fraction of the 6 team-pairs the AI orders the same
  way as the chair (random ≈ 50%, perfect = 100%). **This is the headline
  metric:** it gives partial credit and is robust to the close/split rounds
  where even human panels disagreed (see `confidence` in the gold file).

## The big caveat

The fixtures are the chair's own **shorthand flow notes**, not clean speech
transcripts, and they're laced with the chair's inline verdict marks (bolded
interjections, "default to OG", "NR to frame"). The harness de-contaminates
(strips bold spans, parenthetical judge marks, all-caps reactions) before
judging so the AI can't read the answer off the page — but the strip is
best-effort and the notes are terse. **Treat the score as a noisy lower bound
and a regression tripwire, not an absolute grade.** For a clean eval, add full
transcripts to the fixtures dir and reference them in the gold file.
