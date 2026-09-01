# Landing point-of-view strip ("A good argument is a beautiful thing.")

Removed 2026-08-31, per Aidan ("get rid of this thing now"), the same day
it shipped and was widened. A text-only founder-voice quote above the
one-pager gate with a "Why this exists" link to /story. The /story page
is untouched; only this landing surface died.

Restore: paste the block below back into app/landing.html directly after
the "Progressive landing gate (2026-07-25)" comment (inside .lm-wl-row,
above the gate), replacing the tombstone comment there.

```html
<!-- ── POINT-OF-VIEW STRIP (2026-08-31) ───────────────────────────────
     This stays above the one-pager gate so the collapsed page carries a
     human point of view. The landing treatment is text-only by Aidan's
     later call: no portrait, name, title, or attribution label. The story
     link remains as the quiet way to read the reason behind the product. -->
<section class="fndr">
  <style>
    /* The note keeps real bottom air before the quick-door cards and a
       breath before the attribution line. */
    .fndr{padding:clamp(8px,1.2vw,16px) 20px clamp(22px,3vw,36px);background:var(--bg,#faf9f5)}
    /* 2026-08-31, Aidan: "widen it across the page". Matches the
       page's widest content band rather than the old 680px note width;
       the quote's type scales up with the line so it reads as a
       statement, not a stretched caption. */
    .fndr-card{width:min(1240px,calc(100vw - 48px));position:relative;left:50%;transform:translateX(-50%);margin:0}
    .fndr-body{min-width:0}
    /* .fndr prefix on the text rules is load-bearing: the page carries
       `[data-theme="light"] section p` at (0,1,2), which beats a lone
       class and dimmed the quote to .65 ink. Two classes outrank it. */
    .fndr .fndr-quote{margin:0 0 14px;font-family:var(--font-judge,'Source Serif 4',Georgia,serif);
      font-size:clamp(1.08rem,1.9vw,1.5rem);line-height:1.5;color:var(--text,#1a1a1f);
      text-wrap:balance}
    .fndr .fndr-sig{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;
      font-size:.88rem;color:var(--text-dim,rgba(26,26,31,.62))}
    .fndr-sig a{color:var(--accent,#dc2626);font-weight:700;text-decoration:underline;
      text-underline-offset:2px;text-decoration-thickness:1px}
    .fndr-sig a:hover{text-decoration-thickness:2px}
    /* Text colors ride the theme tokens, which flip per theme (measured:
       light/dark keep dark ink on light --bg; crimson/grey/stone flip
       both). A :not([data-theme="light"]) guess here painted light text
       on the light "dark"-value background, so don't bring one back.
       Only --accent never flips, so the link gets the page's own
       dark-theme link red on the three real dark themes. */
    /* #fca5a5 rather than the usual #f87171: the sig links render at
       ~13px, where #f87171 measures 3.5:1 on these grounds (under AA). */
    :root[data-theme="crimson"] .fndr .fndr-sig a,
    :root[data-theme="grey"] .fndr .fndr-sig a,
    :root[data-theme="stone"] .fndr .fndr-sig a{color:#fca5a5}
  </style>
  <div class="fndr-card">
    <div class="fndr-body">
      <p class="fndr-quote">A good argument is a beautiful thing. Debatable gives anyone a place to test an idea, take a side, and enjoy the game.</p>
      <p class="fndr-sig"><a href="/story">Why this exists</a></p>
    </div>
  </div>
</section>
```
