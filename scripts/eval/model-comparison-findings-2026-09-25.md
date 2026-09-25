# Casual judge model comparison, 2026-09-25

Decision: replace the second seat, Grok 4.3 / low, with GPT-6 Sol / low in a new published season, `2026-autumn-sol`, starting 2026-09-25 14:20 UTC. Keep Claude Sonnet 5 / low and Gemini 3.6 Flash, the existing rubric, score weights, majority rule and appeal policy. No old ballot is rejudged.

## Evidence

132 independent-seat calls compared three models on the unchanged production prompts and parser. Each model received the same 44 requests: 14 original cases on quick and open routes, five fresh controls on both routes, two initial repetitions of the critical case and its supported-objection control, and two final repetitions of the critical case. All cases are synthetic.

The reproduced closing-question error occurred in Grok in all five open repeats and the quick-route check. Sol and Luna both avoided it in all six. On the separate remote-work question list, Grok repeated the failure on both routes; both replacements rejected the unsupported inference. These are repeated observations on two short cases, not eight independent samples of real-world judge accuracy.

Both replacements still credited the supported last-turn delivery objection in all four exposures and the fresh supported question in both routes. They distinguished a repeated question from a repeated supported objection, recognized a shared-premise answer, rejected circular support and unsupported fallacy accusations, and kept accepted definitions and concessions scoped. The fresh museum case put the empty final list on Pro's side; both still favored the supported access objection from Con.

The final Sol panel was then run through the production `runPanel` on the original closing-question case, circular reasoning and a supported last objection, in both prompt routes. All six panels returned 3/3 valid votes; all six Sol explanations preserved the intended distinctions. Panel wall time was 14.9–18.8 seconds, within the default 22-second live ceiling in these six local runs. This does not establish production tail latency.

Across all 150 calls: zero provider failures, malformed source JSON, missing winners, incomplete six-axis scorecards or shortened explanations.

## Cost and latency

| Seat | Individual calls | Median seconds | Calls above 22 seconds | Mean dollars per call |
|---|---:|---:|---:|---:|
| Grok 4.3 / low | 44 | 12.81 | 5 | 0.00618 |
| GPT-6 Sol / low | 44 | 14.67 | 6 | 0.00756 |
| GPT-6 Luna / medium | 44 | 22.87 | 25 | 0.00115 |

Sol adds approximately $1.38 per 1,000 second-seat calls at this sample's lengths and cache mix. That is a sample estimate, not a production spending forecast. Luna was cheaper and handled the main error, but its median exceeded the live ceiling; Sol is the better fit for this release. Luna also changed its winner between routes on the independent-support case, although that case deliberately has no gold winner and both explanations identified the mechanism and evidence gap.

Individual p95 times were 39.7 seconds for Grok and Sol, 48.8 for Luna; maxima reached 86–88.5 seconds. Some unrelated providers stalled together to nearly identical wall times on this workstation. Keep those outliers in the data; their cause was not established. No 90-second recovery ceiling was exceeded. The later complete-panel runs finished below 19 seconds.

Grok costs come from its response's `cost_in_usd_ticks / 10^10`. OpenAI estimates use returned prompt/completion token usage, cached reads and cache writes at current standard short-context rates. Completion tokens already include reasoning. The 132-call comparison cost approximately $0.66; complete-panel calls are additional and were not instrumented for cost.

Sources checked on 2026-09-25: [OpenAI model pricing](https://developers.openai.com/api/docs/pricing), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [xAI cost tracking](https://docs.x.ai/developers/cost-tracking).

## Limits and remaining issues

- Explanations were reviewed by the coding assistant against written behavior specifications, with transcript and ballot evidence retained. There is no independent human adjudication or defensible overall accuracy percentage.
- The original disputed round and ballot were not supplied. These cases reproduce the reported behavior; they do not establish the correctness of that particular decision.
- The clarification-only record still forces a winner despite containing no substantive policy comparison. Sol explicitly acknowledges the missing case and scopes its decision to clarification, but that remains a product-policy limitation. This release does not change eligibility, settlement or no-winner semantics.
- Some responses omit an explicit sentence about reply opportunity while assigning no concession or evasion credit. Those are recorded as coverage gaps, not silently counted as full compliance with every checklist item.
- Other panel members can still overstate premises. In the full-panel library run, the unchanged seats sometimes inferred cost neutrality from unchanged staffed hours. Sol did not repeat that leap. The panel is not being represented as error-free.
- Changing one seat can change future winners, including close rounds. This is why it is a new season with an exact model and effort pin, rather than an undisclosed replacement inside the old season.

Reproduction: see `model-comparison-protocol-2026-09-25.md`, the candidate JSON and README. Raw outputs and assistant reviews are delivered to the owner separately; they contain synthetic text only.
