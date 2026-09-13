# Mobile homepage leaderboard card, 2026-09-13

A temporary card in `app/landing.html`, in `.mh-row`, replaced the AI button during the public copy simplification. Aidan asked to "bring back the debate the AI button", so that slot now links to the voice debate again. The mobile leaderboard strip, full standings and navigation links remain.

To restore, replace the `.mh-card[data-cta="mhome-ai"]` card with this markup. It uses the existing `.mh-card` styles; no CSS was removed.

```html
      <a class="mh-card" href="/leaderboard" data-cta="mhome-leaderboard">
        <span class="mh-card-top"><span class="mh-card-label">Leaderboard</span><span class="mh-card-arrow" aria-hidden="true">&rarr;</span></span>
        <span class="mh-card-sub">See who is climbing.</span>
      </a>
```
