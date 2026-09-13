# Homepage three-step section, 2026-09-13

Removed from `app/landing.html` immediately before `#ranked-band`. Aidan pointed at the section and said: "u can get rid of this". He separately asked to keep the expand-to-See-more button. That button now expands the short FAQ; the leaderboard remains visible.

To restore, insert this section before `#ranked-band` and restore its selectors from the stylesheet below in both `app/css/home-simple.css` and `css/home-simple.css`. Keep the See more control and its FAQ visibility rules.

## Removed markup

```html
<section class="home-how" aria-labelledby="home-how-title">
  <div class="home-how-wrap">
    <h2 id="home-how-title">One question. Two sides.</h2>
    <ol class="home-steps">
      <li><span>01</span><h3>Meet someone</h3><p>Find a person with a different take. Choose a question together.</p></li>
      <li><span>02</span><h3>Argue it out</h3><p>Talk face to face. Make your point and hear their reply.</p></li>
      <li><span>03</span><h3>Get your result</h3><p>Read what won and why. Ranked rounds count toward your place on the leaderboard.</p></li>
    </ol>
    <p class="home-judge-note">Rounds use AI judging, with written reasons you can check. <a href="/judge-integrity">How judging works</a></p>
    <a class="home-how-link" href="/how-it-works">More about the round &rarr;</a>
  </div>
</section>
```

## Stylesheet before removal

```css
/* The public home has one live-debate door, three steps and standings. */
.home-intro{margin:0 0 22px;text-align:left}
.home-intro h1{margin:0;font-size:clamp(30px,3.2vw,48px);font-weight:800;line-height:1.08;letter-spacing:-.04em;color:var(--text)}
.home-intro p{margin:12px 0 0;font-size:clamp(16px,1.35vw,19px);line-height:1.5;color:var(--text-dim)}
#first-screen .fs-actions-row{grid-template-columns:1fr}
#first-screen .fs-actions-row .fs-cta{width:100%}
#first-screen{height:auto;min-height:0;padding-top:44px;padding-bottom:40px}
.home-how,.home-faq{padding:56px 24px;background:var(--bg);color:var(--text);position:relative;z-index:1}
.home-how-wrap{max-width:1080px;margin:0 auto}
.home-how h2,.home-faq h2{font-size:clamp(26px,3vw,36px);line-height:1.15;letter-spacing:-.035em;margin:0 0 30px;text-align:left}
.home-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px;padding:0;margin:0;list-style:none}
.home-steps li{padding-top:18px;border-top:1px solid var(--border)}
.home-steps li>span{color:var(--accent,#c8282e);font-size:13px;font-weight:700}
.home-steps h3{font-size:21px;line-height:1.3;margin:12px 0 8px}
.home-steps p,.home-faq p{font-size:17px;line-height:1.6;color:var(--text-dim);margin:0}
.home-judge-note{margin:30px 0 10px;font-size:15px;line-height:1.6;color:var(--text-dim)}
.home-how a,.home-faq a{color:var(--text);text-decoration:underline;text-underline-offset:4px}
.home-how-link{display:inline-block;margin-top:12px;font-size:15px;font-weight:600}
body.landing-more-ready:not(.landing-more-open) #faq.home-faq{display:block!important}
#faq.home-faq{content-visibility:visible;contain:none}
.home-faq details{border-top:1px solid var(--border);padding:20px 0}
.home-faq summary{cursor:pointer;font-size:19px;font-weight:600}
.home-faq details p{padding-top:14px;max-width:65ch}
.home-how :focus-visible,.home-faq :focus-visible{outline:2px solid var(--accent,#c8282e);outline-offset:5px}
.landing-more-shell:empty,.hero-founder-frame:empty,.page-toc,.jumpnav{display:none!important}
@media(max-width:720px){
 .home-intro{margin-bottom:22px}
 .home-intro h1{font-size:34px}
 .home-intro p{font-size:16px}
 .home-how,.home-faq{padding:36px 20px}
 .home-steps{grid-template-columns:1fr;gap:22px}
 .home-steps h3{margin-top:8px}
 .home-how h2,.home-faq h2{margin-bottom:22px}
}
/* These wrappers used to hide the long tour on phones. */
body .lm-wl-row,body .landing-more-shell{display:block!important;width:100%;max-width:none;padding:0;margin:0;grid-template-columns:none}
@media(max-width:720px){#ranked-band.ranked-band{display:block!important;width:calc(100% - 40px)}}
.home-footer{text-align:center;padding:32px 24px 90px}
.home-footer-links{display:flex;justify-content:center;flex-wrap:wrap;gap:14px 24px;margin:24px auto;max-width:850px}
.home-footer-links a,.home-footer-legal a{color:var(--text-dim);font-size:14px}
.home-footer-legal{font-size:13px;color:var(--text-dim)}
```
