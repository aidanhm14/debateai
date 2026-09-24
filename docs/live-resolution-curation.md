# Live-resolution curation, 24 September 2026

Aidan asked to identify patterns in his choices and change the live-round resolution options accordingly. He explicitly described relationship questions as good candidates for the front page. The current change concerns the casual live-room pool.

## Evidence and interpretation

- The latest seven checked removals were original catalogue indexes 39, 45, 46, 47, 51, 53 and 54, from snapshot `57ab3582b1606e2d1e38549556a1be87c6b27839`.
- These include organ sales, income-weighted group trips, default remote office work, honesty versus politeness, landlords allowing pets, pedestrian priority and periodic driving tests.
- Eight earlier relationship/family wordings were removed separately. Those removals remain in force. His praise for relationship questions did not restore those exact wordings.
- Working editorial interpretation: favor a specific choice ordinary people can picture making, with a recognizable conflict over trust, loyalty, money or independence. Reduce generic administrative policy and broad moral comparisons in the casual mix.
- This is an interpretation, not a discovered personal belief or a ban on civic topics. One of the latest cuts was itself a personal money question, and another was provocative, so neither relationships nor controversy alone guarantees a good prompt. Untouched entries were not explicit endorsements.

## What changed

The pool remains 62 entries. Seven direct removals receive replacements, and seven further editorial replacements apply the requested direction. Every other entry stays verbatim. Civil, cultural and school questions remain in the mix. The homepage, AI quick pool, matching-interest suggestions and already-agreed rounds are not edited in this pass.

| Before | After | Basis |
|---|---|---|
| People should be allowed to sell their organs. | Couples should keep their finances separate even after getting married. | Checked removal |
| People with more money should pay a larger share of a group trip. | You should ask a friend to repay a small debt even if they have forgotten about it. | Checked removal |
| Working from home should be the default for office jobs. | You should move out of your hometown even if it means seeing your family less. | Checked removal |
| Being honest matters more than being polite. | You should tell a friend if you dislike their partner. | Checked removal |
| Landlords should be required to allow pets. | You should tell your partner when you have a crush on someone else. | Checked removal |
| City centers should prioritize pedestrians over private cars. | It is fine to stay friends with someone who cheated on your friend. | Checked removal |
| Drivers should have to pass a new road test every five years. | It is fine to take a holiday with friends without inviting your partner. | Checked removal |
| The US should make 32 hours a full workweek with no cut in weekly pay. | You should accept a promotion that means managing your closest friend. | Editorial follow-through |
| Social media apps should show posts in time order instead of choosing what users see. | It is fine to unfollow a close friend because their posts annoy you. | Editorial follow-through |
| Professional athletes should be allowed to use performance-enhancing drugs. | You should tell a coworker if you discover you are paid more for the same work. | Editorial follow-through |
| Zoos should stop breeding animals that cannot be released into the wild. | Couples should live together before getting engaged. | Editorial follow-through |
| Art competitions should accept AI-generated work alongside human-made work. | Using AI to write a romantic message is dishonest. | Editorial follow-through |
| Restaurants should ban customers from using phones at the table. | You should quit a job you hate even if you have no other job lined up. | Editorial follow-through |
| People should repair broken things before replacing them. | You should end a friendship if you are always the one making plans. | Editorial follow-through |

## Future selections

1. Prefer a clear action and a visible competing cost or obligation. A simple sentence still needs real disagreement.
2. Write two credible cases for the exact same claim before accepting a suggestion. Never save one side by changing a requirement into permission, suspicion into knowledge, or introducing convenient facts.
3. Keep enough subject variety for people who prefer work, culture, school or civic disagreements. Do not infer that a short negative selection prohibits a whole subject.
4. Keep explicit owner decisions separate from model evaluations and editor-authored replacements. Only explicit Keep choices count as positive evidence.
5. Preserve the site content boundary and previously removed exact wordings. Never change historical rounds or ballots when curating suggestions.

## Review and implementation

Gemini 3.8 Flash, Grok 4.7 and Claude Sonnet 5 independently reviewed the proposed replacements for opposing cases. Their judgments are advisory, not audience data. The holiday wording was narrowed to permission for a specific trip; the job-exit wording now explicitly includes disliking the job and having no replacement. These two final versions received another independent check. The initial Claude job-exit response reversed its For/Against labels, which is why an editor must read the cases, not merely accept a score.

The canonical source remains `SPAR_MOTIONS` in `app/live-round.html`. Run `node scripts/gen-draft-motions.mjs` after editing it. The generated casual pool serves the normal server spin and blind strikes; the client bank serves local/offline suggestions. Every suggestion still needs the existing room acceptance flow. Personalized differences retain their separate source and consent rules.

Prior text is preserved in `graveyard/2026-09-24-live-resolution-curation.md`.
