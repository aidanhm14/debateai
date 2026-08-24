# Landing: the format chooser

**Removed 2026-08-24.** Founder: "so actually just remove this no need for it
anymore." Same call centred the walkthrough video that sat below it.

## What it was

The block that opened the `.livenow` section on `app/landing.html`, directly
above the walkthrough video and the face wall: a small uppercase kicker
("CHOOSE A FORMAT OF DEBATE"), one plain-English paragraph saying what a format
is and pointing beginners at Quick Clash, and a horizontally scrolling rail of
ten format chips with the first three tinted red as the lead formats.

The chips were never interactive. They named the formats; they did not select
one. Picking a format happens on `/spar` and `/practice`.

Related history, worth knowing before restoring: the `.lf-help` paragraph was
added 2026-08-12 because the bare chips meant nothing to anyone who had not
competed, which is the same reader §2 of soul.md says the page is written for.
If the chips ever come back without that paragraph, they are back to being a
gate on knowing a format.

## Where it lived

`app/landing.html`, inside `<div class="livenow-wrap">`, immediately before
`<div class="livenow-stage">`.

## The markup

```html
    <div class="livenow-meta">
      <div class="lf-group">
        <span class="lf-label">Choose a format of debate</span>
        <p class="lf-help">A format is the ruleset. It sets who speaks, in what order, for how long, and what counts as evidence. Never debated before? Pick <b>Quick Clash</b>. Two people, short speeches, plain argument, no jargon.</p>
        <div class="lf-rail">
          <div class="lf-chips">
          <span class="lf-chip lf-chip--lead">Public Forum</span>
          <span class="lf-chip lf-chip--lead">Parliamentary</span>
          <span class="lf-chip lf-chip--lead">Lincoln-Douglas</span>
          <span class="lf-chip">BP</span>
          <span class="lf-chip">APDA</span>
          <span class="lf-chip">World Schools</span>
          <span class="lf-chip">Asian Parli</span>
          <span class="lf-chip">Policy</span>
          <span class="lf-chip">Congress</span>
          <span class="lf-chip">Quick Clash</span>
          </div>
        </div>
      </div>
    </div>
```

## The CSS

Sat in the `.livenow` section's own `<style>` block, between the
`.livenow-vote-thesis` rules and `.livenow-proofline`.

```css
    .livenow-meta{max-width:1120px;margin:0 auto 22px;text-align:left}
    .lf-group{min-width:0}
    .lf-label{display:flex;align-items:center;gap:12px;margin:0 0 7px;font-size:.6rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.5))}
    .lf-label:after{content:"";height:1px;flex:1;background:var(--border,rgba(255,255,255,.12))}
    [data-theme="light"] .lf-label,[data-theme="stone"] .lf-label{color:rgba(29,25,21,.64)}
    [data-theme="light"] .lf-label:after,[data-theme="stone"] .lf-label:after{background:rgba(29,25,21,.10)}
    /* 2026-08-12 per the founder: the format chips meant nothing to anyone who
       has not competed. One plain line says what a format is and points
       beginners at the informal one. */
    .lf-help{margin:0 0 10px;font-size:.88rem;line-height:1.55;color:var(--text-dim,rgba(255,255,255,.6));max-width:66ch}
    .lf-help b{font-weight:750;color:var(--text,rgba(255,255,255,.85))}
    [data-theme="light"] .lf-help,[data-theme="stone"] .lf-help{color:rgba(29,25,21,.62)}
    [data-theme="light"] .lf-help b,[data-theme="stone"] .lf-help b{color:#1d1915}
    .lf-rail{position:relative;min-width:0}
    .lf-chips{display:flex;flex-wrap:nowrap;justify-content:center;gap:7px;overflow-x:auto;max-width:100%;padding:2px 2px 8px;scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity;overscroll-behavior-inline:contain}
    .lf-chips::-webkit-scrollbar{display:none}
    .lf-chip{flex:none;scroll-snap-align:start;white-space:nowrap;font-size:.74rem;font-weight:700;padding:6px 11px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.16));color:var(--text-dim,rgba(255,255,255,.72));background:var(--bg-card,rgba(255,255,255,.03));box-shadow:0 8px 22px -18px rgba(0,0,0,.65)}
    [data-theme="light"] .lf-chip,[data-theme="stone"] .lf-chip{color:rgba(29,25,21,.68);border-color:rgba(29,25,21,.13);background:#fff;box-shadow:0 9px 24px -20px rgba(80,42,28,.45)}
    .lf-chip--lead{border-color:rgba(239,68,68,.42);color:var(--accent,#ef4444);background:rgba(239,68,68,.06)}
    [data-theme="light"] .lf-chip--lead,[data-theme="stone"] .lf-chip--lead{color:#c81e1e;border-color:rgba(200,30,30,.34);background:rgba(239,68,68,.055)}
    @media(max-width:1100px){
      .lf-chips{justify-content:flex-start;padding-left:14px;padding-right:14px}
      .lf-rail:before,.lf-rail:after{content:"";position:absolute;z-index:2;top:0;bottom:8px;width:26px;pointer-events:none}
      .lf-rail:before{left:0;background:linear-gradient(90deg,var(--bg,#0b0b0d),transparent)}
      .lf-rail:after{right:0;background:linear-gradient(270deg,var(--bg,#0b0b0d),transparent)}
    }
```

## Restoring it

1. Paste the markup back into `.livenow-wrap`, above `<div class="livenow-stage">`.
2. Paste the CSS back into the same section's `<style>` block. Nothing else on
   the page uses an `.lf-*` class or `.livenow-meta`, so there is no collision
   to check.
3. **Undo the layout change that shipped with the cut.** With the chooser gone,
   `.livenow-stage` became a centred column (video on top, face wall under it)
   instead of the two side-by-side columns it had been. If the chooser comes
   back the stage probably wants its side-by-side form back too; that is the
   `.livenow-stage` flex rules and the `@media(min-width:861px)` equal-height
   block, both in the same `<style>`, in the 2026-08-24 commit's diff.
4. Bump `CACHE_NAME` in both `sw.js` files (the pre-commit hook does it).
