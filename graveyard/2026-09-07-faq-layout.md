# Previous FAQ layout

The podium illustration, pill accordion, and feedback tail lived in the FAQ section of `app/landing.html`.

Removed on 2026-09-07 after Aidan asked to “redo FAQ section visually and textually”. The replacement uses grouped rows and a compact text introduction.

To restore the illustration or layout, use the styles and markup below at `<section id="faq"`. Keep current answers and matching FAQ structured data. The old answers include superseded sign-in and product claims and must not be restored. Reconcile mobile layout and the section's height containment before restoring.

```html
<section id="faq" class="sec">
  <div class="wrap" style="max-width:1440px">
    <div class="faq-head">
      <div class="faq-head-text">
        <span class="faq-eyebrow">FAQ</span>
        <h2 class="faq-title">Common questions</h2>
        <p class="faq-sub">Short answers. If something's not here, the last one routes to a real inbox.</p>
      </div>
    </div>
    <!-- FAQ stack — staggered-pill accordion. Each closed row sizes to its
         question text length so the list reads as variable rhythm; opening
         a row stretches it to the container width and reveals the answer.
         Replaces the bento grid (2026-05-14). Too many questions, too
         structured, didn't feel human. The final row routes to a real
         contact inbox. -->
    <style>
      #faq .faq-stack{
        display:flex;flex-direction:column;align-items:stretch;
        gap:15px;max-width:920px;margin:36px auto 0;
      }
      #faq .faq-stack-row{width:100%}
      /* 2026-05-18: default = dark-on-dark pill (white text, soft
         elevated dark surface, hairline white border). Light theme
         flips to dark-on-cream below. Replaces the previous all-cream
         island that fought the warm-dark landing aesthetic. */
      #faq .faq-stack-row{
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.045);
        border-radius:18px;overflow:hidden;
        transition:border-color .2s ease,background .2s ease,box-shadow .2s ease;
      }
      #faq .faq-stack-row:hover{
        border-color:rgba(255,255,255,.24);
        background:rgba(255,255,255,.065);
      }
      #faq .faq-stack-row[open]{
        border:1.5px solid rgba(239,68,68,.45);
        background:rgba(255,255,255,.06);
        box-shadow:0 10px 34px rgba(239,68,68,.12);
        align-self:stretch;
      }
      #faq .faq-stack-q{
        list-style:none;cursor:pointer;
        padding:22px 32px;
        display:flex;align-items:center;gap:16px;
        font-size:22px;font-weight:600;color:#fff;
        line-height:1.3;letter-spacing:-.01em;user-select:none;
      }
      #faq .faq-stack-row[open] .faq-stack-q{
        padding:26px 32px;font-size:24px;
      }
      #faq .faq-stack-q::-webkit-details-marker{display:none}
      #faq .faq-stack-q::marker{content:''}
      #faq .faq-stack-q:hover{color:#ef4444}
      #faq .faq-stack-chev{
        width:16px;height:16px;flex-shrink:0;opacity:.7;color:rgba(255,255,255,.78);
        transition:transform .3s ease,opacity .2s ease,color .2s ease;
        margin-left:auto;
      }
      #faq .faq-stack-row[open] .faq-stack-chev{transform:rotate(180deg);opacity:1;color:#ef4444}
      /* 2026-09-04, Aidan, from the newspaper type test that was otherwise
         reverted: the FAQ answers keep the reading serif (Source Serif 4,
         already loaded sitewide as --font-judge). Only the answers. */
      #faq .faq-stack-a{font-family:var(--font-judge),Georgia,serif;
        padding:30px 32px 34px;color:rgba(255,255,255,.86);
        font-size:21px;line-height:1.5;max-width:none;
        border-top:1px solid rgba(255,255,255,.12);
      }
      #faq .faq-stack-a strong{color:#fff}
      #faq .faq-stack-a a{color:#ef4444;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(239,68,68,.5)}
      #faq .faq-stack-a a:hover{text-decoration-color:#ef4444}

      /* Light theme flip — restore the dark-on-cream pill. */
      [data-theme="light"] #faq .faq-stack-row{
        border-color:rgba(0,0,0,.10);background:#fff;
        box-shadow:0 1px 0 rgba(0,0,0,.03);
      }
      [data-theme="light"] #faq .faq-stack-row:hover{
        border-color:rgba(0,0,0,.22);background:#fff;
        box-shadow:0 4px 14px rgba(0,0,0,.06);
      }
      [data-theme="light"] #faq .faq-stack-row[open]{
        border-color:rgba(220,38,38,.45);background:#fff;
        box-shadow:0 6px 22px rgba(220,38,38,.10);
      }
      [data-theme="light"] #faq .faq-stack-q{color:#1a1a1f}
      [data-theme="light"] #faq .faq-stack-q:hover{color:#dc2626}
      [data-theme="light"] #faq .faq-stack-chev{color:#1a1a1f}
      [data-theme="light"] #faq .faq-stack-row[open] .faq-stack-chev{color:#dc2626}
      [data-theme="light"] #faq .faq-stack-a{
        color:rgba(0,0,0,.72);border-top-color:rgba(0,0,0,.08);
      }
      [data-theme="light"] #faq .faq-stack-a strong{color:#1a1a1f}
      [data-theme="light"] #faq .faq-stack-a a{color:#dc2626;text-decoration-color:rgba(220,38,38,.45)}
      [data-theme="light"] #faq .faq-stack-a a:hover{text-decoration-color:#dc2626}
      #faq .faq-stack-a p{margin:0 0 10px}
      #faq .faq-stack-a p:last-child{margin-bottom:0}
      /* Inline note chips inside an FAQ answer. Red = a hard guarantee
         ("no fake evidence"); gray = an honest "still improving" caveat.
         They read as typographic punctuation between paragraphs, not
         buttons, so they hug their content and sit on their own line. */
      #faq .faq-note{
        display:inline-flex;align-items:center;gap:8px;
        margin:4px 0 14px;padding:7px 14px;
        border-radius:999px;
        font-size:.8rem;font-weight:700;letter-spacing:-.004em;line-height:1.3;
        border:1px solid rgba(255,255,255,.16);
        background:rgba(255,255,255,.05);
        color:rgba(255,255,255,.68);
      }
      #faq .faq-note::before{
        content:'';width:7px;height:7px;border-radius:50%;
        background:rgba(255,255,255,.4);flex-shrink:0;
      }
      #faq .faq-note--warn{
        border-color:rgba(239,68,68,.5);
        background:rgba(239,68,68,.10);
        color:#fca5a5;
      }
      #faq .faq-note--warn::before{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.5)}
      [data-theme="light"] #faq .faq-note{
        border-color:rgba(0,0,0,.10);background:rgba(0,0,0,.03);color:rgba(0,0,0,.64);
      }
      [data-theme="light"] #faq .faq-note::before{background:rgba(0,0,0,.32)}
      [data-theme="light"] #faq .faq-note--warn{
        border-color:rgba(220,38,38,.42);background:rgba(220,38,38,.08);color:#b91c1c;
      }
      [data-theme="light"] #faq .faq-note--warn::before{background:#dc2626;box-shadow:none}
      /* Quiet subtitle that splits the general FAQ from the
         competitive-debater-specific ones below. Sits flush with the
         left edge of the pills, no chrome, just a typographic cue. */
      #faq .faq-stack-section{
        align-self:stretch;
        margin:22px 4px 2px;
        font-size:.62rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;
        color:rgba(255,255,255,.68);
      }
      [data-theme="light"] #faq .faq-stack-section{color:rgba(0,0,0,.64)}
      #faq .faq-stack-a a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
      #faq .faq-stack-a strong{color:var(--text)}
      @media (max-width:700px){
        #faq .faq-stack{align-items:stretch;max-width:none;padding:0;gap:12px}
        #faq .faq-stack-q{font-size:21px;padding:18px 22px}
        #faq .faq-stack-row[open] .faq-stack-q{font-size:22px;padding:20px 22px}
        #faq .faq-stack-a{font-size:18px;line-height:1.5;padding:22px 22px 24px}
      }

      /* Two-column layout: debater LEFT (centered toward the page
         middle), question stack RIGHT (clear of the fixed page-toc
         sidebar at left:24/width:172). HTML keeps stack first for
         semantic flow; .faq-debater uses order:-1 to flip visually.
         Above 1280px (where page-toc is shown), the wrap shifts
         rightward so neither column dives under the rail.
         Collapses to single column under 1080px. */
      #faq .faq-layout{
        display:grid;
        grid-template-columns:minmax(280px,0.36fr) minmax(560px,0.64fr);
        gap:64px;align-items:start;
        max-width:1860px;margin:0 auto;
      }
      #faq .faq-debater{order:-1}
      #faq .faq-layout .faq-stack{
        margin:0;max-width:1120px;
        transform:translateX(-12px);
      }
      #faq .faq-debater{
        position:sticky;top:96px;align-self:start;
        display:flex;align-items:center;justify-content:center;
        padding:0;
        /* slightly left + lower so the figure reads as supporting
           atmosphere under the heading, not a centered block competing
           with the cards */
        transform:translate(-32px,28px);
      }
      /* Soft radial glow blended into the page so the figure sits in
         atmosphere rather than a hard rectangular box. */
      #faq .faq-debater::before{
        content:"";position:absolute;z-index:-1;
        width:118%;height:88%;left:-9%;top:4%;
        background:radial-gradient(58% 52% at 50% 40%,rgba(239,68,68,.06),rgba(239,68,68,0) 70%);
        pointer-events:none;
      }
      /* Debater illustration: colored podium figure, gently dimmed so it
         supports the FAQ. ~10% smaller than before per the balance pass. */
      #faq .faq-debater-svg{
        width:clamp(300px,28vw,420px);max-width:420px;height:auto;
        color:rgba(255,255,255,.68);opacity:.94;
        transition:opacity .3s ease,color .3s ease;
      }
      #faq .faq-debater:hover .faq-debater-svg{opacity:1;color:rgba(255,255,255,.80)}
      [data-theme="light"] #faq .faq-debater-svg{color:#2a2a32;opacity:.78}
      [data-theme="light"] #faq .faq-debater:hover .faq-debater-svg{color:#1a1a1f;opacity:.95}

      /* Gesturing arm — vertical bob with slight rotation. */
      @keyframes faq-debater-arm-bob{
        0%,100%{transform:translateY(0) rotate(0deg)}
        50%   {transform:translateY(-5px) rotate(-3deg)}
      }
      #faq .faq-debater-arm{
        transform-box:fill-box;transform-origin:0% 50%;
        animation:faq-debater-arm-bob 3.6s ease-in-out infinite;
      }

      @media (prefers-reduced-motion:reduce){
        #faq .faq-debater-arm{animation:none}
      }
      @media (max-width:1080px){
        #faq .faq-layout{grid-template-columns:1fr;max-width:920px;gap:0}
        #faq .faq-debater{display:none}
      }
      /* Above 1280px the fixed page-toc rail (left:24/width:172) shows
         AND the FAQ has room to bias its grid rightward so the debater
         sits more central and the question stack clears the rail
         entirely. Below 1280px the rail hides (see .page-toc rule),
         and the FAQ centers normally. */
      @media (min-width:1281px){
        #faq > .wrap{padding-left:120px !important}
        /* toc rail occupies the far left here, so drop the figure's
           leftward nudge to keep it clear of the rail (it keeps the
           downward nudge). */
        #faq .faq-debater{transform:translate(0,28px)}
      }
    </style>

    <div class="faq-layout">

    <div class="faq-stack">

      <details class="faq-stack-row" open>
        <summary class="faq-stack-q">What is this website?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Debatable is a place to argue something out one-on-one.</p><p><a href="/spar">Debate a real person live</a>, <a href="/newvoice?handoff=landing-faq">argue out loud against the AI</a>, pick a question from <a href="/topics">Topics</a>, or use <a href="/judge">Judge</a> after a round.</p><p>Every completed round can end with a written decision: who won, why, a score out of 100, and what to fix next. Competitive debate formats and team debate are not part of the experience.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Can I use this on my stream?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Yes. <a href="/room-judge">Room Judge</a> runs in a browser tab and listens to your broadcast through screen capture, so there is nothing to install. It follows the round, gives you a live read whenever you ask, and writes a full decision at the end: winner, a score out of 100 for each side, and the reasoning.</p><p>On Twitch it also reads public chat as audience signal, and the compact view works as a panel or overlay URL. <a href="/plugins/twitch">Twitch setup is here</a>. Chat never decides the winner; it tells the judge where the room was persuaded.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Is it actually free?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>A Free plan is available. Paid tiers and current limits are listed on <a href="/pricing">/pricing</a>.</p><p>AI rounds require an account before starting. Live video requires Google sign-in or Apple before you enter the queue. Your matching answers stay saved through sign-in.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Will it argue back, or just hallucinate arguments?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>It argues. It presses soft claims, asks for warrants, and tells you when your logic collapses. It can still get a fact wrong, so question its claims, check anything it cites, and flag a verdict you think is off.</p><p>The other failure is that it can sound too complete, missing the texture of a real round.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Isn't this just another AI debate tool?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>This is a live round, not a wall of text. One question, one person on each side, a clock that does not pause, and a judge at the end.</p><p>The AI responds to what you actually said and explains who won and why.</p><p>It still says wrong things. Catching them is part of the argument.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Why does the site keep changing?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Because a lot of it is experimental, on purpose. A live arena for spoken argument, an AI judge that shows its reasoning, rankings built from judged rounds: this is new territory, and the honest way to build in it is in the open.</p><p>Changes ship most days. Features appear, get measured, and sometimes get cut. If something looks rough or half-built, it probably shipped this week; <a href="https://docs.google.com/forms/d/e/1FAIpQLSeIaqv8NvUsUdZI8VWFya05cQFS_Q_1hhe13L4cafRBShMkow/viewform" target="_blank" rel="noopener">tell us</a> and it gets fixed fast.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Can I debate in another language?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Yes. Start from the <a href="/languages/">language hub</a>, including <a href="/languages/es" lang="es">debate en español</a>, <a href="/languages/fr" lang="fr">débat en français</a>, <a href="/languages/de" lang="de">auf Deutsch debattieren</a>, <a href="/languages/hi" lang="hi">हिंदी में डिबेट</a>, <a href="/languages/zh" lang="zh-Hans">中文在线辩论</a>, and <a href="/languages/ko" lang="ko">한국어 토론</a>. Switch from the language pill and the AI argues, responds when you interrupt, and explains its decision in whichever you pick.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Never debated. Where do I start?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Start a casual 1v1. You take a side, the AI or another person takes the other, and the clock runs. There are no format rules to memorize.</p><p><a href="/learn">/learn</a> covers clear claims, direct rebuttals, and how to compare which consequence matters more.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Do I need to sign up?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>You can finish your first AI round before signing in. Live video rounds require Google sign-in before you enter the queue.</p><p>Sign in with Google or use your email and password to keep your results across devices. You can create a password when you join or reset it if you forget it. Keep me signed in is on by default so your account is ready when you come back; turn it off on a shared device. Email updates are optional and every message has an unsubscribe link.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Can my school get access for the whole team?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Yes. School programs run on a season license: $200 for the whole roster, billed once a season. The price covers the API cost of the rounds a roster runs, not a margin on schools. <a href="/schools">/schools</a> has the details and contact path for programs.</p></div>
      </details>

      <div class="faq-stack-section">The round</div>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">What kind of round is it?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Casual 1v1. One person supports the claim, one person opposes it, and both get scored out of 100.</p><p>Competitive debate formats, team debate, and tournament rule sets are not part of the site.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Can I interrupt?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Yes. In voice and live rounds, both sides can cut in. The judge tracks whether the point survived the response rather than punishing the interruption itself.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">How long is a round?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>A casual round is short enough to finish in one sitting. You can adjust prep and turn length, or stop when the argument has run its course.</p></div>
      </details>

      <details class="faq-stack-row">
        <summary class="faq-stack-q">Something else?<svg class="faq-stack-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></summary>
        <div class="faq-stack-a"><p>Start at <a href="/schools">/schools</a> for program access and procurement questions.</p></div>
      </details>

    </div><!-- /.faq-stack -->

    <aside class="faq-debater" aria-hidden="true">
      <!-- ════════════════════════════════════════════════════════════════
           ANIMATED DEBATER · FAQ right column

           Placeholder SVG below. Replace with the ChatGPT-generated
           animated debater when ready. The wrapping <aside class="faq-debater">
           handles sticky right-column positioning, max-width, and the
           responsive hide on tablet/mobile (under 1080px).

           Replacement should:
             • Keep aria-hidden="true" — illustration is decorative
             • Use roughly a 3:4 portrait ratio (current viewBox is 320×420)
             • Use stroke/fill = currentColor where possible so the dim/hover
               states flow from the parent
             • Wrap motion in @keyframes that respect prefers-reduced-motion
               (see #faq .faq-debater-arm / .faq-debater-pulse for examples)
             • Stay under ~8KB inline
           ════════════════════════════════════════════════════════════════ -->
      <svg class="faq-debater-svg" viewBox="0 0 320 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <!-- soft halo behind figure. picks up currentColor so the hover
               color shift still flows through subtly. -->
          <radialGradient id="faqd-glow" cx="50%" cy="32%" r="55%">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.08"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="160" cy="150" r="150" fill="url(#faqd-glow)"/>

        <!-- subtle room backdrop. Very faint warm-charcoal wash that
             grounds the scene so the figure stops reading as a sticker
             on paper. Just barely visible against #fafaf7. -->
        <rect x="0" y="58" width="320" height="304" rx="22" fill="#2a261f" opacity="0.016"/>

        <!-- audience silhouettes (back of room). Single muted slate at
             varying opacities for depth. The speaker is drawn over these,
             so the figures at the speaker's flanks (L3, R1) get
             partially overlapped — creates an "emerging from a crowd"
             feel without literal perspective. One raised hand on the
             left = POI gesture, very debate-coded.
             Scaled 1.45x around (160,240) so the crowd carries more
             weight against the speaker (per design pass 2026-05-18). -->
        <g fill="#3a4250" transform="translate(160 240) scale(1.45) translate(-160 -240)">
          <!-- L1 (far left, small/further back) -->
          <g opacity="0.16">
            <ellipse cx="22" cy="212" rx="7" ry="9"/>
            <path d="M14 221 Q11 232 11 246 L33 246 Q33 232 30 221 Z"/>
          </g>
          <!-- L2 (left mid, with raised POI hand) -->
          <g opacity="0.28">
            <ellipse cx="52" cy="220" rx="10" ry="12"/>
            <path d="M41 231 Q38 244 38 260 L66 260 Q66 244 63 231 Z"/>
            <path d="M62 232 L70 196 L76 196 L68 233 Z"/>
            <circle cx="73" cy="192" r="3.6"/>
          </g>
          <!-- L3 (left close, behind speaker's left flank) -->
          <g opacity="0.20">
            <ellipse cx="92" cy="204" rx="9" ry="11"/>
            <path d="M82 215 Q79 228 79 246 L105 246 Q105 228 102 215 Z"/>
          </g>
          <!-- R1 (right close, behind speaker's right flank) -->
          <g opacity="0.20">
            <ellipse cx="232" cy="204" rx="9" ry="11"/>
            <path d="M222 215 Q219 228 219 246 L245 246 Q245 228 242 215 Z"/>
          </g>
          <!-- R2 (right mid) -->
          <g opacity="0.26">
            <ellipse cx="262" cy="216" rx="10" ry="12"/>
            <path d="M251 228 Q248 240 248 256 L276 256 Q276 240 273 228 Z"/>
          </g>
          <!-- R3 (far right, small/further back) -->
          <g opacity="0.16">
            <ellipse cx="294" cy="222" rx="7" ry="9"/>
            <path d="M286 231 Q283 242 283 254 L305 254 Q305 242 302 231 Z"/>
          </g>
        </g>

        <!-- floor shadow under podium -->
        <ellipse cx="160" cy="384" rx="86" ry="5" fill="#1a1a1f" opacity="0.10"/>

        <!-- hair back layer (frames jaw) -->
        <path d="M128 100 Q130 76 160 72 Q190 76 192 100 L192 134 Q192 140 186 140 L186 110 Q184 96 176 90 Q168 84 160 84 Q152 84 144 90 Q136 96 134 110 L134 140 Q128 140 128 134 Z" fill="#2a2520"/>

        <!-- neck -->
        <path d="M148 138 L172 138 L170 168 L150 168 Z" fill="#caa680"/>

        <!-- head (skin) -->
        <ellipse cx="160" cy="110" rx="28" ry="32" fill="#d8b693"/>

        <!-- subtle jaw shadow -->
        <path d="M148 138 L172 138 L170 144 L150 144 Z" fill="#1a1a1f" opacity="0.10"/>

        <!-- hair fringe across forehead -->
        <path d="M134 100 Q140 86 160 84 Q180 86 186 100 Q180 92 168 90 Q160 89 152 91 Q142 93 134 100 Z" fill="#2a2520"/>

        <!-- eyes (focused, closed-line) -->
        <line x1="148" y1="113" x2="155" y2="113" stroke="#1a1a1f" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="165" y1="113" x2="172" y2="113" stroke="#1a1a1f" stroke-width="1.6" stroke-linecap="round"/>

        <!-- mouth (small dark line, slightly open mid-speech) -->
        <line x1="156" y1="126" x2="164" y2="126" stroke="#5a3030" stroke-width="1.4" stroke-linecap="round"/>

        <!-- shirt collar V (cream, picks up paper tone of FAQ bg) -->
        <path d="M134 164 L160 196 L186 164 L186 240 L134 240 Z" fill="#f1ebde"/>

        <!-- blazer body -->
        <path d="M104 170 Q98 200 102 256 L218 256 Q222 200 216 170
                 L186 164 L160 196 L134 164 Z" fill="#404a5a"/>

        <!-- blazer lapels (slightly darker wedges) -->
        <path d="M134 164 L160 196 L154 222 L128 192 Z" fill="#2f3744"/>
        <path d="M186 164 L160 196 L166 222 L192 192 Z" fill="#2f3744"/>

        <!-- tie (muted brand red) -->
        <path d="M156 196 L164 196 L167 240 L153 240 Z" fill="#8a3030"/>
        <path d="M157 196 L163 196 L160 204 Z" fill="#5a2020"/>

        <!-- gesturing arm — pivots from right shoulder -->
        <g class="faq-debater-arm">
          <path d="M208 180 Q236 184 250 174 L246 166 Q230 174 210 168 Z" fill="#404a5a"/>
          <ellipse cx="252" cy="170" rx="5.5" ry="4.5" fill="#d8b693"/>
        </g>

        <!-- podium top edge (lighter highlight) -->
        <rect x="84" y="248" width="152" height="10" rx="2" fill="#a48564"/>
        <!-- podium body (trapezoid) -->
        <path d="M88 258 L232 258 L222 372 L98 372 Z" fill="#8a6e54"/>
        <!-- wood grain vertical stripes -->
        <line x1="118" y1="272" x2="116" y2="364" stroke="#6c5340" stroke-width="1.2" opacity="0.5"/>
        <line x1="144" y1="272" x2="143" y2="364" stroke="#6c5340" stroke-width="1.2" opacity="0.5"/>
        <line x1="176" y1="272" x2="177" y2="364" stroke="#6c5340" stroke-width="1.2" opacity="0.5"/>
        <line x1="202" y1="272" x2="204" y2="364" stroke="#6c5340" stroke-width="1.2" opacity="0.5"/>
        <!-- front panel inset -->
        <rect x="110" y="280" width="100" height="76" rx="3" fill="none" stroke="#6c5340" stroke-width="1" opacity="0.4"/>
        <!-- shadow line under top edge -->
        <rect x="88" y="258" width="144" height="3" fill="#1a1a1f" opacity="0.16"/>

        <!-- microphone (angled toward speaker) -->
        <line x1="148" y1="248" x2="140" y2="216" stroke="#2a2a2e" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="138" cy="210" rx="6.5" ry="10" fill="#34343a" transform="rotate(-15 138 210)"/>
        <ellipse cx="138" cy="210" rx="4" ry="7" fill="#1f1f24" opacity="0.55" transform="rotate(-15 138 210)"/>
        <circle cx="148" cy="248" r="3" fill="#2a2a2e"/>
        <!-- mic indicator light -->
        <circle cx="144" cy="218" r="1.2" fill="#dc2626"/>

        <!-- papers on podium (slightly tilted) -->
        <g transform="rotate(-4 192 250)">
          <rect x="172" y="246" width="44" height="6" rx="1" fill="#f1ebde"/>
          <line x1="178" y1="250" x2="208" y2="250" stroke="#9a8a78" stroke-width="0.6" opacity="0.55"/>
        </g>
      </svg>
    </aside>

    </div><!-- /.faq-layout -->

    <!-- After the FAQ, the natural next move for a still-curious visitor
         is "but I have my own question / thought." Send them straight to
         the feedback button rather than emailing or hoping they find Discord. -->
    <div class="faq-feedback-tail">
      <span class="ffft-line">Have a question the FAQ didn't answer?</span>
      <a href="#" data-open-feedback="1" class="ffft-link">Send it in feedback <span aria-hidden="true">→</span></a>
    </div>
  </div>
</section>
<style>
  .faq-feedback-tail{
    max-width:1480px;margin:32px auto 0;padding:16px 22px;
    display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;
    text-align:center;
    border-top:1px solid var(--border);
  }
  .faq-feedback-tail .ffft-line{
    font-size:.92rem;color:var(--text-dim);
  }
  .faq-feedback-tail .ffft-link{
    display:inline-flex;align-items:center;gap:6px;
    font-size:.92rem;font-weight:700;color:var(--accent,#ef4444);
    text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;
    text-decoration-color:rgba(239,68,68,.4);
  }
  .faq-feedback-tail .ffft-link:hover{text-decoration-color:var(--accent,#ef4444)}

</style>
```
