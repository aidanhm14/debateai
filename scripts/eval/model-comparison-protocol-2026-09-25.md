# Judge replacement comparison, 2026-09-25

Decision being tested: replace the xAI seat only if another provider handles the reproduced final-question error consistently and passes relevant controls. Keep the same rubric, prompt, score weights and other two seats. Production changes require a new published season; historical configurations remain addressable.

The first screen compares Grok 4.3 / low with GPT-6 Sol / low and GPT-6 Luna / medium. Official model documentation confirms chat-completions support and the selected effort settings; successful ballots must confirm account access. This is a task-specific comparison, not a claim about overall model rankings.

Acceptance checks, written before screen outputs:

- Read the actual explanations. No win credit, responsiveness penalty or invented cost from an unanswered last-turn question list. Correct winner alone is insufficient.
- Repeat the reproduced case at least five times for a finalist, then test both casual prompt routes.
- Preserve credit for a supported last-turn objection, including one phrased as a question.
- Run all 14 existing behavior cases and the five newly authored controls. Report ambiguous labels separately; do not demand a winner where the case specifies only behavior.
- Assess definitions, narrow concessions, circular reasoning, shared-premise answers and legitimate repeated objections. Flag any new material error rather than hiding it in an average.
- Keep all provider failures, invalid JSON, incomplete scorecards and truncated explanations in the report. Measure latency against the live synchronous ceiling and the 90-second recovery ceiling.
- Validate the finalist in a complete three-provider panel through the production runner before pinning it.
- Use measured token counts and current published prices for cost estimates. Never infer cost from the 8,000-token ceiling alone.

Review labels are assistant assessments with cited transcript turns and ballot evidence. They are not independent human gold labels or population accuracy estimates. Synthetic cases cannot establish that the original reported debate is fixed; the original transcript and ballot have not been supplied. The clarification-only record probes an existing forced-winner limitation and is not a license to silently change eligibility or no-winner policy.

Sources accessed 2026-09-25: [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing). Standard short-context rates per million tokens: Sol $2 input, $0.20 cached input, $10 output; Luna $0.10 input, $0.01 cached input, $0.50 output. OpenAI completion usage includes billed reasoning tokens. Longer-context and other service tiers have different rates.
