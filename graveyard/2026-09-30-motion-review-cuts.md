# Saved motion-review cuts, 30 September 2026

Applied from review version 33, source snapshot `26bea29b209adacfc35351fcf5e75e86c5283b08`, after the request to implement the changes. Fourteen explicit cuts occurred in the live pool, three also in the quick source, and one also in the authored homepage examples. The two other cuts are source-only review cards and were never live. The broad pay-rise/privacy wording is withheld while its requested case-study revision is reviewed.

These choices concern editorial suitability, not personal beliefs or topic-wide bans. Previously agreed rounds and ballots remain intact.

## Exact removed source

### app/live-round.html

```js
    "It is fine to unfollow a close friend because their posts annoy you.",
    "You should accept a promotion that means managing your closest friend.",
    "It is fine to use connections to get a job you are less qualified for.",
    "You should take a full-time job offer instead of borrowing money for college.",
    "Hard work matters more than luck in becoming rich.",
    "You should tell a friend when they are being embarrassing.",
    "It is fine to cancel plans because you no longer feel like going.",
    "Friends should pay for what they ordered instead of splitting the bill evenly.",
    "You should cut off friends whose political views offend you.",
    "Both people should split the bill on a first date.",
    "Love matters more than money when choosing a partner.",
    "Flirting with someone else counts as cheating.",
    "Dating a friend’s ex is fine without asking them first.",
    "You should tell your friend if their partner is cheating.",
    "You should turn down a large pay rise if taking it would make your private life public.",
```

### app/practice.html

```js
  "Friends should pay for what they ordered instead of splitting the bill evenly.",
  "Dating a friend’s ex is fine without asking them first.",
  "You should tell your friend if their partner is cheating.",
```

### app/js/landing/example-rounds.js

```js
    { lead:true, fmt:'Karl Popper', motion:'Dating a friend’s ex is fine without asking them first.',
      a:{ nm:'Cole', side:'For', face:'face46' }, b:{ nm:'Sofia', side:'Against', face:'face47' },
      open:51, drift:68, won:'b', score:'82 - 88', crowd:108, vol:230,
      rfd:'Sofia wins. Dating someone a friend still cares about can damage the friendship. Asking first is a small price for keeping that trust.' },
```

## Restore notes

Restore only on a new explicit editorial decision. Put string entries back in SPAR_MOTIONS in live-round.html or MOTIONS_BY_FORMAT.quick in practice.html. Homepage objects belong in ROUNDS in js/landing/example-rounds.js. Regenerate the server pool with `node scripts/gen-draft-motions.mjs`; never edit the generated file by hand. Preserve the room acceptance flow and topic boundary.
