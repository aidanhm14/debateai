# Homepage Watch buttons

Removed 2026-09-20 from the desktop and mobile action rows in `app/landing.html`.

Aidan: "remove this button so its just the debate the AI - watcvh will be in top selection area". Watch remains in the top menu. The AI button now fills its row.

## Removed markup

```html
        <a class="fs-cta fs-cta--ghost fs-cta--watch" data-landing-piece="watch" href="/watch" data-fs-watch-live data-cta="first-screen-watch"><span class="fs-watch-dot" aria-hidden="true"></span><span data-fs-watch-label>Watch</span></a>
      <a class="mh-card" data-landing-piece="mobile-watch" href="/watch" data-cta="mhome-watch">
        <span class="mh-card-top"><span class="mh-card-label">Watch</span><span class="mh-card-arrow" aria-hidden="true">&rarr;</span></span>
        <span class="mh-card-sub" id="mhWatchMeta">Live rounds and replays</span>
      </a>
```

## Previous row CSS

```css
  .fs-actions-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .mh-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
#first-screen .fs-actions-row{grid-template-columns:repeat(2,minmax(0,1fr))}
```

Other Watch styling and guarded polling remain in landing.html. To restore the desktop button, insert it before `data-landing-piece="ai"`; insert the mobile card after `data-landing-piece="mobile-ai"`. Restore the two-column layout in both copies of `css/home-simple.css` and the mobile row. Revisit the UX journey assertions and the homepage decision in soul.md.
