# Selected resolution deletions, 2026-09-24

Aidan selected these eight entries in the resolution review and submitted “Apply my 8 checked resolution deletions to Debatable. Keep every unchecked resolution.”

Removed from live-round.html, practice.html and newvoice.html where present; regenerated draft-motions.mjs from those source pools. Removed the matching homepage example and Topics card. Historical round records are unchanged.

## Exact resolution text

- Couples should share their phone passwords.
- You should break up with someone if your friends dislike them.
- Your partner should come before your friends.
- Ghosting someone after one date is fine.
- You should choose your dream job over your relationship.
- You should always tell a friend when their partner flirts with you.
- Parents should not track their teenager’s location.
- Family deserves loyalty even when you disagree with them.

The voice picker stored the ghosting resolution without its final period. That variant was removed too.

## Homepage example

From app/js/landing/example-rounds.js, immediately before “You should tell your friends how much you earn.”

```javascript
    { lead:true, fmt:'Casual 1v1', motion:'Ghosting someone after one date is fine.',
      a:{ nm:'Tyler', side:'For', face:'face49' }, b:{ nm:'Nora', side:'Against', face:'face18' },
      open:47, drift:33, won:'b', score:'78 - 90', crowd:231, vol:398,
      rfd:'Nora wins. A short message gives someone clarity. Avoiding a few uncomfortable words leaves the other person guessing.' },
```

## Topics card

From app/topics/index.html, immediately before the repair card. Later display numbers were reduced by one; the initial count became 19.

```html
<details class="topic-row" id="passwords" data-category="relationships"><summary><span class="topic-number">07</span><span class="topic-subject">Relationships</span><span class="topic-title">Couples should share their phone passwords.</span><span class="topic-toggle" aria-hidden="true">+</span></summary><div class="topic-expanded"><div class="topic-arguments"><p><b>For</b>Shared access can make everyday coordination easier and build openness.</p><p><b>Against</b>People still need private space, including conversations with friends and family.</p></div><div class="dp-actions"><a class="dp-button dp-button--primary" href="/private?motion=Couples+should+share+their+phone+passwords.&amp;from=topics" data-cta="topics-invite">Invite someone <span aria-hidden="true">↗</span></a><a class="dp-button" href="/newvoice?motion=Couples+should+share+their+phone+passwords.&amp;handoff=topics" data-cta="topics-ai">Debate the AI</a></div></div></details>
```

## Restore notes

Restore only with a new editorial decision. Add the selected text back to its original source pools and run node scripts/gen-draft-motions.mjs. Restore the complete example with its matching verdict, and the complete Topics card with both arguments and links. Renumber topic cards and update the initial count. Never rewrite historical round records.
