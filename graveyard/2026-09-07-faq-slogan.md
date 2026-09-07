# FAQ slogan

The oversized introduction in `app/landing.html`, section `#faq`, was removed
after Aidan called it “obv vibe coded vibes” and approved a smaller
“Frequently asked questions” heading. The questions and contact link remain.

Previous markup:

```html
<p class="faq-eyebrow">FAQ</p>
<h2 class="faq-title" id="faq-title">Good questions.<br><span>Straight answers.</span></h2>
```

Previous CSS:

```css
#faq .faq-eyebrow{
  display:flex;align-items:center;gap:10px;margin:0 0 22px;
  font-size:.875rem;line-height:1.4;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--text-dim);
}
#faq .faq-eyebrow::before{content:"";width:8px;height:8px;background:var(--faq-accent)}
#faq .faq-title{
  margin:0;max-width:10ch;font-size:clamp(2.5rem,4.1vw,3.75rem);
  font-weight:700;line-height:1.02;letter-spacing:-.055em;color:var(--text);
}
#faq .faq-title span{color:var(--faq-accent)}
@media(max-width:900px){
  #faq .faq-title{max-width:15ch;font-size:clamp(2.5rem,6vw,3.5rem)}
}
@media(max-width:480px){
  #faq .faq-eyebrow{margin-bottom:16px}
}
```

To restore after a new design decision, replace `#faq-title` inside `.faq-intro`
with the old markup and replace its current title rules with these rules.
The grouped accordion layout does not need to change.
