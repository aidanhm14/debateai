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

## Verdict stability (does the judge agree with ITSELF)

`run-stability-eval.mjs` asks the question that comes before accuracy. The
eval above measures agreement with a human panel; this one measures whether
the same round, unchanged in substance, gets the same verdict twice.

It matters because of what sits downstream. A rating ladder assumes match
outcomes are ground truth. Noise averages out over many rounds; a
SYSTEMATIC bias does not, it compounds into the rating, and the ladder then
measures skill at exploiting the judge rather than skill at debating.

Three perturbations, none of which changes what was argued:

| Condition | What moves | What it catches |
|---|---|---|
| `repeat` | nothing, same prompt twice | raw self-agreement at the temperature prod actually uses |
| `swap` | the two bench blocks change position | position bias |
| `pad` | the LOSING side's lines are repeated verbatim behind a filler lead-in | verbosity bias |

Both are content-preserving by construction and `scripts/test-stability.mjs`
pins that: a swap must not change the transcript's length or its multiset of
lines, and every line padding introduces must be a fixed lead-in plus a
verbatim copy of a line that was already there. Repetition cannot add an
argument, so a verdict that moves under padding moved on length.

```bash
node scripts/eval/run-stability-eval.mjs --dry-run          # assembles prompts, no spend
ANTHROPIC_API_KEY=sk-ant-... node scripts/eval/run-stability-eval.mjs
node scripts/eval/run-stability-eval.mjs --limit=6 --conditions=repeat,swap
node scripts/eval/run-stability-eval.mjs --out=scripts/eval/out/stability-YYYY-MM-DD.json
```

Run the same-round-twice check on consented, anonymized production rounds:

```bash
# Save the admin export from /api/admin/corpus-export?mode=rounds as rounds.jsonl
node scripts/eval/build-corpus-fixtures.mjs --in=rounds.jsonl --out=scripts/eval/out/consented-rounds
node scripts/eval/run-stability-eval.mjs --dry-run --corpus=scripts/eval/out/consented-rounds/corpus-manifest.json
ANTHROPIC_API_KEY=sk-ant-... node scripts/eval/run-stability-eval.mjs \
  --corpus=scripts/eval/out/consented-rounds/corpus-manifest.json \
  --out=scripts/eval/out/consented-stability-YYYY-MM-DD.json
```

The production export is one scrubbed transcript per round, not a trusted
two-bench split. The corpus path therefore runs `repeat` only. It refuses
`swap` and `pad` instead of guessing which words belong to which side.

Flags: `--conditions=` (default `repeat,swap,pad`), `--pad-every=` (repeat
every Nth line, default 2, lands around 1.4x), `--concurrency=`, `--temp=`
(**left unset by default because prod leaves it unset** — self-disagreement
at the default temperature is not a harness artifact, it is what the site
does to a real round), plus `--format=` / `--only=` / `--limit=` / `--model=`
as above.

### Reading the output

- **held across all requested reads** is the headline: the share of rounds
  whose verdict is a property of the round rather than of the sampling.
  That is three reads on the split external fixtures and two on the
  consented production corpus.
- **position bias** is paired within a round, so the round's own difficulty
  cancels. For BP it reports the mean rank change of a bench when it is
  printed first; an interval clear of zero is a defect rather than a
  preference, because slot order is not something a debater controls.
- **padding** reports how often padding the loser handed it the round.
  Anything above zero is the ballot paying for length.
- **kappa** is chance-corrected agreement across the three unpadded runs,
  using a multi-category generalization of the `fleissKappa` that prod
  publishes on `/api/judge/reliability`. The test asserts the two agree
  exactly on binary input, because two kappas that disagree on the same data
  is a headline waiting to happen.

Every rate carries a Wilson interval and a seeded bootstrap. The seed is
fixed on purpose: an unseeded bootstrap gives a slightly different interval
each run, which invites re-rolling until it reads well.

**Power is printed before the spend, and it is the honest part.** On the 23
gold rounds a stability rate carries an interval roughly ±12 points wide.
Pinning one to ±10 needs ~35 rounds, to ±5 needs ~139, and calling position
bias at 65/35 against a coin needs ~85. **Read a run as a tripwire for a
gross defect, not as a certification.**

### What it does NOT measure

It runs the eval prompt (winner plus one line) against the shared
`lib/adjudication.mjs` core, not `async-sweep.mjs`'s richer ballot prompt
with points, dimensions and an RFD. If the rates here are poor, re-run
against that prompt before concluding which part is at fault. It also runs a
single model, so it says nothing about the three-family panel's stability;
the panel's own disagreement is reported separately at
`/api/judge/reliability`.

## The public judge benchmark (lab leaderboard)

`run-judge-benchmark.mjs` runs the same BP gold rounds across every AI lab
reachable with prod keys, one flagship model per lab, identical prompts, and
writes the aggregate to `benchmark-results.json` (committed; it contains no
transcript content). It feeds the leaderboard on `/benchmark`.

```bash
# needs ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY /
# DEEPSEEK_API_KEY in env; labs with no key are skipped
node scripts/eval/run-judge-benchmark.mjs
node scripts/eval/run-judge-benchmark.mjs --models=anthropic,openai --limit=5
```

Two deliberate differences from the base harness: it is multi-provider, and it
feeds models the flows ONLY — human adjudication notes (`oaFile` / `delibFile`
/ `ballotFile` / `judgeFile`) are never included, so no model sees even a
decontaminated echo of the human call. After a run, update the static table in
`app/benchmark.html` from the JSON and note the run date there.

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

By default this writes to `/tmp/debatable-adjudication-finetune`:

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
  --train=/tmp/debatable-adjudication-finetune/adjudication-train.jsonl \
  --valid=/tmp/debatable-adjudication-finetune/adjudication-valid.jsonl \
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
