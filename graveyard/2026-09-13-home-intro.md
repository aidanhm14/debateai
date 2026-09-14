# Added homepage introduction, removed 2026-09-13

This introduction was added above the desktop board and mobile live-debate button during the simplification pass. Aidan asked to "remove the debate some one now thing above it" because it "confuses the sigte and messes up what it used to be which was simpler". Both copies are removed. The desktop retains a visually hidden Debatable heading for accessibility.

Only restore after a new instruction: insert the markup at the start of `.fs-board-wrap` and `.mh-wrap`, then restore these selectors in both home-simple.css files. The last three rules belong inside the 720px mobile media query.

```html
<header class="home-intro"><h1>Debate someone live.</h1><p>Pick a side. Make your case. See where you rank.</p></header>
```

```css
.home-intro{margin:0 0 22px;text-align:left}
.home-intro h1{margin:0;font-size:clamp(30px,3.2vw,48px);font-weight:800;line-height:1.08;letter-spacing:-.04em;color:var(--text)}
.home-intro p{margin:12px 0 0;font-size:clamp(16px,1.35vw,19px);line-height:1.5;color:var(--text-dim)}
 .home-intro{margin-bottom:22px}
 .home-intro h1{font-size:34px}
 .home-intro p{font-size:16px}
```
