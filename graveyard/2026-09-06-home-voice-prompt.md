# Homepage voice greeting and rose AI entry

Removed from `app/landing.html` on 2026-09-06. Aidan: “get rid of this its not what i wanted”, then “make the watch blend in white, debate the AI be gray”.

The greeting appeared before `.mh-row` on mobile and `.fs-actions` on desktop. `/css/ai-entry.css` supplied the orb, rose gradient and italic serif type. Both stylesheet mirrors were removed after their only import was removed.

## Removed markup

```html
<a class="home-voice-prompt" href="/newvoice?handoff=landing-orb"><span class="home-voice-orb" aria-hidden="true"></span><span>Hey, how do you want to debate today?</span></a>
```

## Removed CSS

```css
/* AI entry uses its own rose accent and voice orb, on both home layouts. */
html body .fs-actions-row .fs-cta--ai,
html body .mh-card[data-cta="mhome-ai"]{
  background:linear-gradient(120deg,#a61045,#cd2453);
  border:1px solid #f59ab3;color:#fff;
  box-shadow:0 5px 18px rgba(166,16,69,.19);
}
html body .fs-actions-row .fs-cta--ai:hover,
html body .mh-card[data-cta="mhome-ai"]:hover{background:#a61045;color:#fff}
html body .fs-cta--ai,
html body .mh-card[data-cta="mhome-ai"] .mh-card-label{
  font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:21px;
}
html body .mh-card[data-cta="mhome-ai"] .mh-card-sub{color:#fff0f5}
.home-voice-prompt{display:flex;align-items:center;justify-content:center;gap:12px;
  margin:14px 0 2px;font-size:16px;line-height:1.45;color:var(--text,#1a1a1f);text-decoration:none}
.home-voice-orb{display:inline-block;flex:0 0 36px;width:36px;height:36px;border-radius:50%;
  background:radial-gradient(circle at 32% 25%,#ffeaf3 0%,#ff98bc 28%,#d92c66 58%,#790b42 94%);
  box-shadow:inset -4px -5px 8px #650c4438,0 0 18px #e5377130}
.home-voice-prompt:focus-visible{outline:2px solid #b8154c;outline-offset:5px;border-radius:8px}
@media(max-width:720px){.home-voice-prompt{justify-content:flex-start;margin:16px 0 8px;font-size:16px}.home-voice-orb{flex-basis:32px;width:32px;height:32px}}

```

## Restore notes

Restoring requires a new design decision. The current homepage has white Watch and gray Debate the AI buttons, with their original sans-serif type. To restore this experiment, put the markup before each row above, recreate both `app/css/ai-entry.css` and `css/ai-entry.css`, and restore its stylesheet link in the landing head. The old CSS overrides the neutral AI styling.
