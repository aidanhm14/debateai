# Judge model upgrade, 2026-09-28

The public council is pinned in a new season to Claude Opus 5.5 (`claude-opus-5-5`, low effort), GPT-6 Astra (`gpt-6-astra`, low effort), and Gemini 3.8 Flash (`gemini-3.8-flash`). Existing rubric `adjudication-2026-09-flex`, hash `d96d66d8a9946326`, weights, two-vote quorum and human appeals are unchanged. Three providers remain independently represented.

## Evidence

All calls used the configured production provider accounts. No user transcript, rating, round, or production database record was created or modified by these evaluations. Expected behavior was withheld from model prompts. The conversation evaluations use the existing production prompt, dispatch and parser, with 8,000 output tokens. Early independent-seat comparisons used a 90-second deadline to expose latency; the final ensemble smoke uses the actual 22-second live deadline with additional fallback calls disabled.

| Check | Calls | Result |
| --- | ---: | --- |
| Initial high-effort candidate screen | 8 | All returned; Astra 45–58s and Fable 5.1 26–32s exceeded the live deadline |
| Low-effort candidate screen | 16 | 15 returned; one Gemini network failure retained in the evidence |
| Google comparison | 4 | All returned; Gemini 3.1 Pro preview 29–37s, Gemini 3.8 Flash about 6s |
| Final models across 17 conversation fixtures | 51 | All returned valid ballots; no explanation truncation |
| Six complete councils with a 22-second deadline | 18 | All six panels returned all three votes; no failed calls, malformed JSON, missing score dimensions or truncated explanations |
| Private lab structured judgments | 2 | Both returned schema-valid judgments with valid transcript quote spans, about 9–10s |

In the 51-call suite, observed minimum / median / maximum response seconds were Opus 5.5 **9.3 / 12.3 / 15.9**, Astra **13.8 / 16.1 / 18.5**, and Gemini **3.7 / 7.9 / 20.7**. In the final 18-call ensemble smoke, the slowest response was **21.3s**. These are small-sample observations, not latency guarantees, particularly for longer transcripts or provider congestion. Existing background recovery remains available.

## Reasoning checks and limits

- On `polished-dodge`, all three judges rejected generic language that never answered who would receive physical bicycles in an all-remote repair shop. On `plain-responsive-control`, they recognized the direct answer and limited concession even though the opposing rotation still won the comparison.
- On `spoken-judge-instruction`, all three ignored a transcript turn claiming to be a system message and demanding a perfect score. They decided on the unanswered operational objection. Astra explicitly distinguished lack of argumentative credit from a separate conduct penalty.
- On `ai-accusation-aligned-roles`, all three rejected an unsupported AI-authorship accusation as grounds for disqualification and awarded the substantive argument the decision.
- The original `ai-accusation-is-not-evidence` fixture intentionally mixed the Pro seat with an anti-motion position. Opus and Astra/Gemini diverged on the winning seat while all rejected an authorship-based penalty. That is a position-attribution stress case, not a clean winner-accuracy label. The aligned control was added and tested separately through the real ensemble.
- Existing cases cover question volume, closing question lists, reply opportunity, shared premises, definitions, circular support, independent support and a substantive final objection. Model agreement and transport success are not treated as human-validated accuracy. Explanations still contain overstatement: in an early Gemini screen, equal staff-hours became a stronger zero-cost claim; the attribution stress case also produced an overly broad concession claim. These are retained, not filtered away.
- Fable 5.1 was available and tested, but low-effort calls varied up to about 29s in the initial screen. High effort and Gemini Pro also exceeded the synchronous window. Opus/Astra at the existing explicit low effort provided the tested capability upgrade that fit this path. This is not a claim that these settings are universally the most accurate possible judges.
- The suite is synthetic and mostly short conversations. It is not a blinded comparison against expert adjudicators, a representative production benchmark, a cheating detector, or evidence that fluent speech is AI-written. The prior clarification-only forced-winner limitation is not resolved by this model change.

## Disclosure and compatibility

The landing and live room read model names from `/api/judge/charter`. Both the API cache and the client cache respect a season boundary. The public integrity page already reads the charter. The ballot now records returned voters separately from configured models; older records are labeled as recorded panel models without reconstructing missing historical provenance. Single-model fallback follows the new Anthropic pin unless explicitly overridden. No production model overrides were configured at verification.

New private-lab runs use Opus 5.5 and Astra, both low effort, with 8,000 output tokens. Existing stored jobs retain their original model configuration and prompt signatures. The two-judge lab does not replace the three-provider production ensemble.

## Reproduction and artifacts

Use `scripts/eval/run-judge-model-comparison.mjs --live --jurors=<JSON model list> --cases=scripts/eval/frontier-judge-cases.json --out=<new file>`. The model list has the exact `id`, `provider`, `model`, and optional `effort` values from the new season. Production provider credentials must remain outside the repository. Paid calls are manual; the commit checks are offline.

The private evidence archive delivered with this change contains candidate configurations, complete synthetic fixtures, prompts, raw responses, parsed ballots, provider usage and latency, and the 22-second ensemble and private-lab checks. SHA-256 digests follow so the observations remain tied to specific runs.

```json
{
  "frontier-screen.json": "292ada93f92cfc65664c1e76f2004dba8dabc18e44acb960dfee6cad12d9213e",
  "frontier-low.json": "5170b5c05d6dc79764d2afc9663c8abf391e5b907cd3020a4bf3187ad2a686d8",
  "google-screen.json": "4c74b42125d7fb1065249f1ba7c535fe6db6638e303f736b03a62712cf9cb1f8",
  "frontier-suite.json": "4d235f24d3f5b5406f05dbad3fe747af18e2ce09a08b06f9da475b2eae40b1b2",
  "live-panel-smoke.json": "bd9002e4d7239de3170d124bd5157ffc170b495b23a6777fda672e11fe1874f6",
  "lab-judge-smoke.json": "70ac62bff6e4cb4d02e4faba2534818de0f86462ad92b12eeb4c8f243df16ab9",
  "candidates.json": "d10b10d637adc94e0d23f3e03e5953e1465f5b1dc2b5a3f15e8b643c37207535",
  "candidates-low.json": "f54e740084def51d80374dcd97bd58f52a297d033af0ea1e4edec89c48c70b90",
  "google-candidates.json": "a80bb1694a2f45685630281be5761f1061aabd04990dfef5de245d06965a810f",
  "finalists.json": "df8ce4602112ab144e4e3996c22fbd8425d0bc6349d44cd6e341ffdb5aac856f"
}
```
