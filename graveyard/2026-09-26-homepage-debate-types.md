# Homepage debate types, September 26, 2026

The four training cards lived between `#ranked-band` and `#landing-more` in `app/landing.html`.

Removed at Aidan’s request: “remove the 4 sections of ‘types of debates to have’ at the bottom remove from landing page”.

To restore after a new product decision, insert the markup immediately before `#landing-more`, restore the stylesheet to both `app/css/landing/debate-types.css` and `css/landing/debate-types.css`, and restore the relevant homepage design overrides in both mirrored stylesheets. The shared `.rb-title` and `.rb-action` rules remain live; avoid duplicating them.

## Markup

```html
  <section id="debate-types" class="debate-types" aria-labelledby="debate-types-title">
    <link rel="stylesheet" href="/css/landing/debate-types.css" data-page-source>
    <h2 id="debate-types-title">Types of debates to have</h2>
    <div class="dt-grid">
      <section class="dt-card" aria-labelledby="dt-sales-training">
        <h3 id="dt-sales-training">Sales training</h3>
        <p>Practise explaining value and answering objections.</p>
        <a href="/sales-training" data-cta="debate-types-sales-training">Explore <span class="dt-sr-only">sales training</span><span aria-hidden="true">&rarr;</span></a>
      </section>
      <section class="dt-card" aria-labelledby="dt-lawyer-training">
        <h3 id="dt-lawyer-training">Lawyer training</h3>
        <p>Practise making a case and defending your reasoning.</p>
        <a href="/lawyer-training" data-cta="debate-types-lawyer-training">Explore <span class="dt-sr-only">lawyer training</span><span aria-hidden="true">&rarr;</span></a>
      </section>
      <section class="dt-card" aria-labelledby="dt-negotiation-training">
        <h3 id="dt-negotiation-training">Negotiation training</h3>
        <p>Practise defending your terms and finding a workable trade.</p>
        <a href="/negotiation-training" data-cta="debate-types-negotiation-training">Explore <span class="dt-sr-only">negotiation training</span><span aria-hidden="true">&rarr;</span></a>
      </section>
      <section class="dt-card" aria-labelledby="dt-belief-expression-training">
        <h3 id="dt-belief-expression-training">Belief expression training</h3>
        <p>Practise saying what you believe and explaining why.</p>
        <a href="/belief-expression-training" data-cta="debate-types-belief-expression-training">Explore <span class="dt-sr-only">belief expression training</span><span aria-hidden="true">&rarr;</span></a>
      </section>
    </div>
  </section>
```

## Section stylesheet

```css
#debate-types{width:min(1240px,calc(100% - 48px));margin:0 auto 48px;padding:32px 0 0;border-top:1px solid var(--border,rgba(128,128,128,.25));scroll-margin-top:88px;color:var(--text,#f5efeb);font-family:var(--font-body,Arial,sans-serif)}
#debate-types h2{margin:0 0 24px;color:var(--text,#f5efeb);font-family:var(--font-display,Arial,sans-serif);font-size:clamp(1.65rem,3vw,2.3rem);font-weight:600;line-height:1.2;letter-spacing:-.025em}
#debate-types .dt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
#debate-types .dt-card{display:flex;flex-direction:column;min-width:0;margin:0;padding:24px;border:1px solid var(--border,rgba(128,128,128,.25));border-radius:10px;background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
#debate-types h3{margin:0 0 10px;color:var(--text,#f5efeb);font-family:var(--font-display,Arial,sans-serif);font-size:1.18rem;font-weight:600;line-height:1.3;letter-spacing:-.015em}
#debate-types .dt-card p{margin:0 0 16px;color:var(--text-dim,#b8b1ac);font-size:.94rem;line-height:1.6}
#debate-types .dt-card a{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-top:auto;color:var(--text,#f5efeb);font-size:.86rem;font-weight:700;line-height:1.4;text-decoration:none}
#debate-types .dt-card a span[aria-hidden]{color:var(--accent-text,#ef4444);font-size:1.2rem}
#debate-types a:hover{text-decoration:underline;text-underline-offset:4px}
#debate-types a:focus-visible{outline:2px solid var(--accent-text,#ef4444);outline-offset:5px;border-radius:2px}
#debate-types .dt-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:620px){#debate-types{width:calc(100% - 28px)}#debate-types .dt-grid{grid-template-columns:1fr}#debate-types .dt-card{padding:20px}}

/* September 24 walkthrough: color and shape, without category pictures. */
.dt-grid{gap:16px}
.dt-card{--dt-ink:#9c3516;--dt-tint:#fff1e8;padding:24px;border:1px solid color-mix(in srgb,var(--dt-ink) 25%,transparent);border-top:4px solid var(--dt-ink);border-radius:14px;background:var(--dt-tint)}
.dt-card:nth-child(2){--dt-ink:#254f87;--dt-tint:#edf3fc}
.dt-card:nth-child(3){--dt-ink:#226544;--dt-tint:#edf7ef}
.dt-card:nth-child(4){--dt-ink:#694187;--dt-tint:#f5eefb}
#debate-types .dt-card h3,#debate-types .dt-card a{color:var(--dt-ink)}
.dt-card p{color:#42454d}
html:not([data-theme="light"]) .dt-card{--dt-tint:color-mix(in srgb,var(--dt-ink) 18%,#15151a);--dt-ink:#efb18e}
html:not([data-theme="light"]) .dt-card:nth-child(2){--dt-ink:#a8c9f7}
html:not([data-theme="light"]) .dt-card:nth-child(3){--dt-ink:#a1d9b2}
html:not([data-theme="light"]) .dt-card:nth-child(4){--dt-ink:#d5b5ef}
html:not([data-theme="light"]) .dt-card p{color:#ddd}
@media(max-width:480px){.dt-card{padding:18px}.dt-grid{gap:12px}}
```

## Original homepage overrides

```css
body.homepage-red-wordmark :is(.rb-title,#debate-types h2){font-size:clamp(1.5rem,2.4vw,2.2rem);font-weight:500;letter-spacing:-.04em}
body.homepage-red-wordmark .rb-action{font-size:13px;font-weight:500}
body.homepage-red-wordmark #debate-types .dt-grid{gap:16px}
body.homepage-red-wordmark #debate-types .dt-card{
  padding:24px;border:1px solid color-mix(in srgb,var(--dt-ink) 25%,transparent);border-top:4px solid var(--dt-ink);border-radius:var(--home-corner);background:var(--dt-tint);
}
body.homepage-red-wordmark #debate-types h3{font-size:22px;font-weight:500;letter-spacing:-.025em}
body.homepage-red-wordmark #debate-types .dt-card p{font-size:15px;max-width:42ch}
body.homepage-red-wordmark #debate-types .dt-card a{font-size:13px;font-weight:500;justify-content:flex-start;gap:20px}
```
