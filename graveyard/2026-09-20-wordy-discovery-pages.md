# Topics, round guide, and generator before the September 20 redesign

Aidan: “this page is vibe coded reinvent and do same for other wordy sections like how this works too”. The category-card directory and repeated explanations were replaced with usable topic rows, a visual round guide, and a compact generator. Restore only after reviewing the current topic handoff, private-round policy, and public format restrictions. The exact previous files follow; replace the corresponding document and remove its discovery-pages stylesheet and page script to restore its layout.

## app/topics/index.html

```html
<!doctype html>
<html lang="en" data-lightweb="web">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Things to Argue About · Casual 1v1 Topics · Debatable</title>
<meta name="description" content="Pick a question worth arguing about, take a side, and start a casual one-on-one round. No teams, format jargon, or tournament rulebook.">
<link rel="canonical" href="https://itsdebatable.com/topics/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "name": "Things to Argue About · Casual 1v1 Topics",
      "description": "Questions for casual one-on-one arguments about everyday life, relationships, culture, technology, and society.",
      "url": "https://itsdebatable.com/topics/",
      "inLanguage": "en",
      "isPartOf": { "@type": "WebSite", "name": "Debatable", "url": "https://itsdebatable.com/" },
      "about": ["Everyday disagreements", "Relationships", "Technology", "Culture", "Work", "Society"]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Debatable", "item": "https://itsdebatable.com/" },
        { "@type": "ListItem", "position": 2, "name": "Topics", "item": "https://itsdebatable.com/topics/" }
      ]
    }
  ]
}
</script>
<meta property="og:title" content="Things to Argue About · Casual 1v1 Topics">
<meta property="og:description" content="Pick a question, take a side, and start a casual one-on-one argument.">
<meta property="og:url" content="https://itsdebatable.com/topics/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://itsdebatable.com/og-image.png?v=deb1">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Things to Argue About · Casual 1v1 Topics">
<meta name="twitter:description" content="Pick a question, take a side, and start a casual one-on-one argument.">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>

<link rel="stylesheet" href="/css/ui.css">
<script>
/* Reference pages render light + editorial (topic.css). Force the light
   token set so the shared topbar matches the page. */
document.documentElement.setAttribute('data-theme','light');
document.documentElement.setAttribute('data-force-theme','light');
</script>
<link rel="stylesheet" href="/css/topic.css">
<style>
/* ── Neural constellation on this surface (2026-08-18 sitewide sweep;
   same recipe as /pricing and /schools, per the founder: "it adds a nice
   depth"). The shared canvas is position:fixed; painted late at
   z-index 0 it would sit ON TOP of static content, so the page
   background moves to <html>, <body> goes transparent, and the canvas
   drops to z-index -1: behind every element, in front of the paper.
   Dark themes keep ui.css own opacity; only the light arm is lifted,
   because red-on-cream at .45 is close to invisible. */
html[data-lightweb="web"]{background:var(--bg)}
html[data-lightweb="web"] body{background:transparent}
html[data-lightweb="web"] .ui-neural-canvas{z-index:-1}
html[data-lightweb="web"][data-theme="light"] .ui-neural-canvas{opacity:.75}
</style>
</head>
<body>
<div class="wrap">
  <div id="daTopbar"></div>
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Debatable</a> <span class="sep" aria-hidden="true">›</span> Topics</nav>

  <header>
    <h1>Things worth arguing about</h1>
    <p class="lede">Pick a question, take a side, and argue it out one-on-one. Debatable keeps the setup simple: one person supports the claim, one person pushes back, and the stronger argument wins.</p>
    <p><a href="/debate-topic-generator" class="cta">Generate a debate topic →</a></p>
  </header>

  <div class="grid">
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Everyday life</div>
      <div class="name">The stuff people already disagree about</div>
      <div class="desc">Ghosting, splitting the bill, being late, cancelling plans, reclining a plane seat, and whether honesty is always kind.</div>
    </a>
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Relationships</div>
      <div class="name">Friends, family, and boundaries</div>
      <div class="desc">Reading a partner's phone, telling a friend hard truths, owing family loyalty, privacy, trust, and forgiveness.</div>
    </a>
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Technology</div>
      <div class="name">Who controls the machines</div>
      <div class="desc">Algorithms, AI, phones in schools, online anonymity, social media, privacy, and what platforms owe the people using them.</div>
    </a>
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Culture</div>
      <div class="name">Taste, influence, and attention</div>
      <div class="desc">Reality television, sports, celebrity, art, streaming, fandom, and which cultural habits deserve to survive.</div>
    </a>
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Work and school</div>
      <div class="name">Rules, rewards, and fairness</div>
      <div class="desc">Group projects, salaries, remote work, grading, hiring, workplace loyalty, and who should carry the cost of a bad system.</div>
    </a>
    <a href="/debate-topic-generator" class="card">
      <div class="fmt">Society</div>
      <div class="name">The rules we live under</div>
      <div class="desc">Public policy, rights, safety, punishment, public space, and the tradeoffs that shape ordinary life.</div>
    </a>
  </div>

  <div class="why">
    <p>Every round uses the same casual 1v1 structure. No teams, format jargon, or tournament rulebook.</p>
    <p>The AI takes the other side, responds to what you said, and writes a verdict when the round ends. <a href="/practice">Try a round →</a></p>
  </div>

  <h2>What makes a good topic</h2>
  <p>Both sides should have something real to say. The stakes should be clear without an hour of research, and a reasonable person should be able to disagree. The best questions create a choice between values, not a trivia test.</p>

  <h2>Practice mode</h2>
  <p>Pick a side, the AI takes the other, and argue through a short timed round with judge feedback at the end. <a href="/practice">Open the trainer →</a></p>

  <p style="margin-top:48px"><a href="/practice" class="cta">Spar with an AI →</a></p>
</div>

<aside style="max-width:780px;margin:0 auto;padding:32px 24px 64px;border-top:1px solid var(--line);font:14px/1.6 Archivo,Georgia,serif">
  <div style="font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:0 16px">
    <a href="/how-it-works" style="color:var(--muted)">How it works</a>
    <span aria-hidden="true">·</span>
    <a href="/pricing" style="color:var(--muted)">Pricing</a>
    <span aria-hidden="true">·</span>
    <a href="/community" style="color:var(--muted)">Community</a>
    <span aria-hidden="true">·</span>
    <a href="/" style="color:var(--muted)">Home</a>
  </div>
</aside>

<script defer src="/js/topbar.js"></script>
  <script src="/js/home-magnet.js" defer></script>
<!-- Shared neural-constellation background. Animates on this light
     surface because <html> carries data-lightweb="web". -->
<canvas id="uiNeuralCanvas" class="ui-neural-canvas"></canvas>
<script defer src="/js/ui-neural.js"></script>
</body>
</html>

```

## app/how-it-works.html

```html
<!DOCTYPE html>
<html lang="en" data-lightweb="web">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>How Debatable Works · Meet Someone, Argue It Out · Debatable</title>
<meta name="description" content="Meet someone, choose a question, and talk it out. See how live conversations, round notes, private invites and results work on Debatable." />
<meta name="keywords" content="how does debatable work, debate online how it works, ai debate judge, practice debate online, ai debate opponent, online debate rounds, debate app how it works, ai judged debate">

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="https://itsdebatable.com/how-it-works">

<meta property="og:type" content="website">
<meta property="og:url" content="https://itsdebatable.com/how-it-works">
<meta property="og:title" content="How Debatable Works · Meet Someone, Argue It Out">
<meta property="og:description" content="Watch a live argument or take a seat. Every ranked result feeds the public board.">
<meta property="og:image" content="https://itsdebatable.com/og-image.png?v=cards6">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="How Debatable Works · Meet Someone, Argue It Out">
<meta name="twitter:description" content="Watch a live argument or take a seat. Every ranked result feeds the public board.">
<meta name="twitter:image" content="https://itsdebatable.com/og-image.png?v=cards6">

<script async src="https://www.googletagmanager.com/gtag/js?id=G-0V4R5MY3BT"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-0V4R5MY3BT');</script>



<script>
/* Theme: honor the visitor's saved `da-theme` so the sitewide dark
   toggle reaches this page. Light stays the default for anyone who has
   not picked. Runs before first paint, so neither theme flashes. This
   page carries a full dual palette (dark tokens at :root, light
   override under [data-theme="light"]), which is why it no longer
   pins itself with data-force-theme. */
(function(){
  var t = 'light';
  try { t = localStorage.getItem('da-theme') || 'light'; } catch(e){}
  if (t !== 'light') t = 'crimson';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-lighting', t === 'light' ? 'light' : 'dark');
})();
</script>

<link rel="stylesheet" href="/css/ui.css">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to debate online on Debatable",
  "description": "Meet a person, agree on a question, have a conversation or take timed turns, and read the judge’s decision.",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Meet your opponent",
      "text": "Join the live queue or invite a friend.",
      "url": "https://itsdebatable.com/how-it-works#step-opponent"
    },
    {
      "@type": "HowToStep",
      "name": "Agree on a question",
      "text": "Choose a topic together and take opposite sides.",
      "url": "https://itsdebatable.com/how-it-works#step-topic"
    },
    {
      "@type": "HowToStep",
      "name": "Start talking",
      "text": "Choose a natural conversation or timed turns.",
      "url": "https://itsdebatable.com/how-it-works#step-round"
    },
    {
      "@type": "HowToStep",
      "name": "Read the decision",
      "text": "The judge explains the result and scores the arguments.",
      "url": "https://itsdebatable.com/how-it-works#step-ballot"
    }
  ]
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do I need to know how to debate?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Make a point, explain your reason, and listen to the reply. You can have a natural conversation or take timed turns. One person is on each side."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need an account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Live video requires sign-in with Google, Apple, or email. Your results stay on your profile."
      }
    },
    {
      "@type": "Question",
      "name": "What if nobody is available?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Keep your search open or invite a friend. Solo practice with a labeled AI opponent is also available."
      }
    },
    {
      "@type": "Question",
      "name": "Can people watch or record me?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Public live rounds can have spectators. Private invite rooms stay off the public board. Recording asks everyone in the room for permission before it starts. You can leave, report, or block someone from the room."
      }
    },
    {
      "@type": "Question",
      "name": "What does the judge use?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Judging uses AI to assess what both sides said. It explains the decision and can make mistakes. The judging page publishes the scoring rules and appeal policy."
      }
    },
    {
      "@type": "Question",
      "name": "What does it cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A Free plan is available. Private round judging includes two free uses per account, then requires a paid plan. Other limits and subscriptions are listed on the pricing page."
      }
    },
    {
      "@type": "Question",
      "name": "Where do my rounds go?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Open your profile to return to saved rounds. You can reopen a live room to read its transcript, notes and decision. Public replays and clips are on Watch when recording was agreed."
      }
    }
  ]
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Debatable",
      "item": "https://itsdebatable.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "How it works",
      "item": "https://itsdebatable.com/how-it-works"
    }
  ]
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Debatable",
  "url": "https://itsdebatable.com",
  "applicationCategory": "SocialNetworkingApplication",
  "operatingSystem": "Web",
  "description": "Casual one-on-one argument platform: pair with a real person or AI, take a side, and get a clear ballot with scores out of 100."
}
</script>

<style>
/* ── Neural constellation on this surface (2026-08-18 sitewide sweep;
   same recipe as /pricing and /schools, per the founder: "it adds a nice
   depth"). The shared canvas is position:fixed; painted late at
   z-index 0 it would sit ON TOP of static content, so the page
   background moves to <html>, <body> goes transparent, and the canvas
   drops to z-index -1: behind every element, in front of the paper.
   Dark themes keep ui.css's own opacity; only the light arm is lifted,
   because red-on-cream at .45 is close to invisible. */
html[data-lightweb="web"]{background:var(--bg)}
html[data-lightweb="web"] body{background:transparent}
html[data-lightweb="web"] .ui-neural-canvas{z-index:-1}
html[data-lightweb="web"][data-theme="light"] .ui-neural-canvas{opacity:1}
html[data-lightweb="web"]:not([data-theme="light"]) .ui-neural-canvas{opacity:.8}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
/* 2026-07-22: 20px root. The page was a wall of ~15px serif body copy
   at default root; the old serif ran small for its size (comment predates the 2026-08-19 Archivo swap). The shared
   topbar sets its own px sizes so it does not scale with this. */
html{font-size:20px}
:root,[data-theme="grey"]{
  /* Paper literals from the light-only era, restated for dark. */
  --surf-1:#191920;--surf-2:#191920;--ink-lit:#f2f2f6;--ink-rgb:232,232,240;

  --bg:#0a0a0c;--bg-elev:#101014;--bg-card:#15151a;
  --border:rgba(255,255,255,.18);--border-strong:rgba(255,255,255,.32);
  --accent:#ef4444;--accent-glow:rgba(239,68,68,.4);
  --green:#22c55e;
  --text:#fff;--text-dim:rgba(255,255,255,.85);--text-ghost:rgba(255,255,255,.68);
  --shadow-lg:0 18px 60px rgba(0,0,0,.55);
}
[data-theme="light"]{
  --surf-1:#fff;--surf-2:#fafaf7;--ink-lit:#1a1a1f;--ink-rgb:20,20,30;

  --bg:#fafaf7;--bg-elev:#fff;--bg-card:#fff;
  --border:rgba(0,0,0,.10);--border-strong:rgba(0,0,0,.22);
  --accent:#b91c1c;--accent-glow:rgba(185,28,28,.22);
  --green:#16a34a;
  --text:#1a1a1f;--text-dim:rgba(0,0,0,.7);--text-ghost:rgba(0,0,0,.64);
  --shadow-lg:0 18px 60px rgba(0,0,0,.10);
}
body{
  font-family:'Archivo',Georgia,"Times New Roman",serif;
  background:var(--bg);color:var(--text);
  min-height:100vh;display:flex;flex-direction:column;
  -webkit-font-smoothing:antialiased;
  overflow-x:clip;
}
a{color:inherit;text-decoration:none}
em,i{font-style:normal}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}

main{flex:1}
.wrap{max-width:1240px;margin:0 auto;padding:76px 22px 80px}
@media (max-width:880px){.wrap{padding-top:86px}}

.eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;
  padding:5px 12px;border-radius:999px;
  background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.34);
  color:var(--accent);margin-bottom:18px;
}
.eyebrow .pip{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}

.brand-bar{
  display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
  margin:0 0 22px;font-size:.95rem;line-height:1.2;
}
.brand-mark{
  font-weight:800;color:var(--text);
  letter-spacing:-.012em;text-decoration:none;
  transition:color .15s;
}
.brand-mark strong{color:var(--accent);font-weight:800}
.brand-mark .tld{color:var(--text-ghost);font-weight:500}
.brand-mark:hover{color:var(--accent)}
.brand-mark:hover .tld{color:var(--accent);opacity:.7}
.brand-sep{color:var(--text-ghost);font-weight:300;opacity:.6}
.brand-here{color:var(--text-ghost);font-weight:600;letter-spacing:.005em}

.hero-ctas{
  display:flex;flex-wrap:wrap;gap:10px;
  margin:6px 0 36px;
}
.btn-primary,.btn-secondary{
  display:inline-flex;align-items:center;gap:10px;
  padding:14px 24px;border-radius:12px;
  font-size:1.05rem;font-weight:800;letter-spacing:-.003em;
  text-decoration:none;cursor:pointer;
  transition:transform .15s,box-shadow .15s,background .15s,border-color .15s,color .15s;
}
.btn-primary{
  background:var(--accent-solid,#b91c1c);color:#fff;
  box-shadow:0 14px 30px -10px var(--accent-glow);
}
.btn-primary:hover{
  background:#dc2626;
  transform:translateY(-1px);
  box-shadow:0 18px 36px -8px var(--accent-glow);
}
.btn-secondary{
  background:transparent;color:var(--text);
  border:1px solid var(--border-strong);
}
.btn-secondary:hover{
  border-color:var(--accent);
  background:rgba(220,38,38,.06);
  color:var(--accent);
}

h1{font-size:clamp(2.5rem,6vw,3.9rem);font-family:'Archivo',Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:-.022em;line-height:1.04;margin-bottom:14px;color:var(--text)}
h1 em{color:var(--accent);font-style:normal}
.lede{font-size:1.24rem;color:var(--text-dim);line-height:1.55;max-width:680px;margin-bottom:32px;font-weight:500}

h2{font-size:clamp(1.75rem,3.4vw,2.35rem);font-family:'Archivo',Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:-.018em;line-height:1.15;margin:48px 0 14px;color:var(--text)}
h3{font-size:1.2rem;font-weight:800;color:var(--text);margin:0 0 6px}

p{font-size:1.12rem;color:var(--text-dim);line-height:1.62;margin-bottom:14px;max-width:760px}
p a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
p.muted{color:var(--text-ghost);font-size:1rem}

.point-list{list-style:none;padding:0;margin:14px 0 28px;display:flex;flex-direction:column;gap:8px}
.point-list li{
  font-size:1.1rem;color:var(--text-dim);line-height:1.55;padding-left:20px;position:relative;max-width:760px;
}
.point-list li::before{content:'';position:absolute;left:0;top:.6em;width:9px;height:2px;background:var(--accent)}

/* .steps / .step retired 2026-08-22 with the three-card "loop in three
   steps" grid, which restated the five plain steps above it in product
   vocabulary. One explanation per thing. */

/* ── Mock ballot (hero illustration). Decorative, aria-hidden:
   the endpoint of every round is the ballot, so show one. ───── */
.ballot-card{
  max-width:640px;margin:36px 0 14px;padding:20px 22px;
  background:var(--surf-1);border:1px solid rgba(var(--ink-rgb),.10);border-radius:18px;
  box-shadow:0 1px 2px rgba(20,20,30,.04),0 22px 48px -30px rgba(20,20,30,.28);
}
.bc-top{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  margin:0 0 14px;font-size:.72rem;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;color:rgba(var(--ink-rgb),.64);
}
.bc-flag{display:inline-flex;align-items:center;gap:6px;color:var(--green)}
.bc-flag i{width:6px;height:6px;border-radius:50%;background:var(--green)}
.bc-top .sp{flex:1}
.bc-verdict{
  font-family:'Archivo',Georgia,serif;font-size:1.4rem;font-weight:700;
  letter-spacing:-.015em;color:var(--ink-lit);margin:0 0 4px;
}
.bc-verdict b{color:var(--accent)}
.bc-points{
  display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 12px;
}
.bc-pt{
  font-size:.88rem;color:rgba(var(--ink-rgb),.64);
}
.bc-pt b{
  display:block;font-size:1.24rem;font-weight:800;color:var(--ink-lit);
  font-variant-numeric:tabular-nums;
}
.bc-rfd{
  margin:0;padding:12px 14px;border-radius:10px;
  background:rgba(20,20,30,.035);border:1px solid rgba(var(--ink-rgb),.08);
  font-size:1.04rem;line-height:1.58;color:rgba(var(--ink-rgb),.72);
}
.bc-rfd b{
  display:block;font-size:.68rem;font-weight:800;letter-spacing:.13em;
  text-transform:uppercase;color:var(--accent);margin-bottom:5px;
}
@media (max-width:560px){.ballot-card{padding:16px}}

/* ── Product walkthrough. It belongs directly under the opening promise:
   seeing the full round makes the explanation below easier to parse. ── */
.video-card{
  max-width:640px;margin:28px 0 14px;
  background:var(--surf-1);border:1px solid var(--border);border-radius:18px;overflow:hidden;
  box-shadow:0 1px 2px rgba(20,20,30,.04),0 22px 48px -30px rgba(20,20,30,.28);
}
.video-el{
  display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#0c0c10;
}
.video-cap{
  margin:0;padding:11px 16px 13px;
  font-size:.86rem;line-height:1.45;color:var(--text-soft,rgba(var(--ink-rgb),.6));
  border-top:1px solid var(--border);
}
.video-cap b{color:var(--text,#14141e)}
@media (max-width:560px){.video-card{margin:22px 0 12px}}
.video-card--hero{
  width:min(100%,1080px);max-width:none;
  margin:24px 0 36px;
  border-radius:20px;
}
.video-card--hero .video-cap{
  padding:14px 20px 16px;
  font-size:1rem;
}
@media (max-width:640px){
  .video-card--hero{margin:18px 0 26px;border-radius:14px}
  .video-card--hero .video-cap{padding:11px 14px 13px;font-size:.9rem}
}
/* ── Photos. Real rounds from the repo's own shots. A pure-text
   explainer of a live, spoken product should show the thing. ──── */
.shot{
  margin:26px 0 30px;position:relative;
  border-radius:14px;overflow:hidden;
  border:1px solid var(--border);background:#15100e;
  box-shadow:0 1px 2px rgba(20,20,30,.04),0 22px 48px -30px rgba(20,20,30,.28);
}
.shot img{display:block;width:100%;height:100%;object-fit:cover}
.shot--band{aspect-ratio:16/7}
.shot--band img{object-position:50% 46%}
.shot--tall{aspect-ratio:16/9}
.shot--native{max-width:707px;aspect-ratio:707/282}
.shot--ui{background:var(--surf-2)}
.shot--ui img{object-position:50% 0}
.shot::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,transparent 42%,rgba(14,10,9,.74) 100%);
}
.shot--ui::after{background:linear-gradient(180deg,transparent 52%,rgba(14,10,9,.66) 100%)}
.shot figcaption{
  position:absolute;left:18px;right:18px;bottom:14px;
  font-size:.92rem;line-height:1.4;color:rgba(255,253,247,.84);
  text-shadow:0 1px 10px rgba(0,0,0,.6);
}
.shot figcaption b{font-weight:700;color:#fff}
@media (max-width:600px){
  .shot--band{aspect-ratio:16/10}
  .shot figcaption{left:13px;right:13px;bottom:11px;font-size:.86rem}
}

.faq{margin-top:14px;display:flex;flex-direction:column;gap:10px}
.faq details{
  background:var(--surf-1);border:1px solid var(--border);border-radius:12px;padding:14px 18px;
  box-shadow:0 1px 2px rgba(20,20,30,.04),0 16px 36px -26px rgba(20,20,30,.20);
}
.faq summary{
  cursor:pointer;font-weight:700;font-size:1.12rem;color:var(--text);list-style:none;
  display:flex;align-items:center;justify-content:space-between;gap:14px;
}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';font-size:1.4rem;font-weight:400;color:var(--text-ghost);transition:transform .2s}
.faq details[open] summary::after{content:'×'}
.faq details p{margin:12px 0 0;font-size:1.05rem;color:var(--text-dim);line-height:1.55}
.faq details p a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}

/* ── Jump strip. Eight sections is enough that a stranger who arrived
   for one answer should not have to scroll for it. ───────────────── */
.jumpnav{
  display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  margin:30px 0 8px;padding:14px 16px;
  border:1px solid var(--border);border-radius:12px;background:var(--surf-2);
}
.jumpnav .jn-label{
  font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--text-ghost);margin-right:4px;
}
.jumpnav a{
  font-size:.92rem;font-weight:700;color:var(--text-dim);
  padding:5px 11px;border-radius:999px;border:1px solid transparent;
  transition:color .15s,border-color .15s,background .15s;
}
.jumpnav a:hover{color:var(--accent);border-color:var(--accent);background:rgba(220,38,38,.06)}
@media (max-width:640px){
  .jumpnav{margin:22px 0 6px;padding:12px}
  .jumpnav a{font-size:.86rem;padding:5px 9px}
}

/* ── Proof row. Short factual claims that each stand alone, used where
   a paragraph would bury them. ──────────────────────────────────── */
.proof-row{
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;
  margin:20px 0 26px;
}
.proof{
  padding:14px 15px;border:1px solid var(--border);border-radius:12px;
  background:var(--surf-1);
}
.proof b{
  display:block;font-size:.68rem;font-weight:800;letter-spacing:.13em;
  text-transform:uppercase;color:var(--accent);margin-bottom:6px;
}
.proof span{font-size:.98rem;line-height:1.48;color:var(--text-dim)}
@media (max-width:860px){.proof-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){
  .proof-row{grid-template-columns:1fr;gap:9px;margin:16px 0 20px}
  .proof{padding:12px 13px}
  .proof span{font-size:.94rem}
}

.cross-links{margin-top:24px;display:flex;flex-wrap:wrap;gap:10px}
.cross-links a{
  font-size:.95rem;font-weight:700;padding:10px 18px;border-radius:999px;
  border:1px solid var(--border);color:var(--text-dim);
  background:rgba(20,20,30,.03);
  transition:border-color .15s,color .15s,background .15s;
}
.cross-links a:hover{color:var(--text);border-color:var(--border-strong);background:rgba(20,20,30,.06)}

footer.foot{padding:24px 22px;border-top:1px solid var(--border);text-align:center;font-size:.88rem;color:var(--text-ghost)}
footer.foot a{color:var(--text-dim)}

.theme-dots{display:none !important}
.btn-secondary{background:rgba(20,20,30,.03);border-color:rgba(var(--ink-rgb),.14)}
.btn-secondary:hover{background:rgba(220,38,38,.06);border-color:var(--accent)}

/* Phone proportions. The page previously overrode shared mobile sizing
   with an 18px root, which made the hero, ballot, and long-form copy feel
   like a zoomed desktop page. Keep the headline decisive, but tighten the
   rhythm and make both primary actions full-width tap targets. */
@media (max-width:640px){
  html{font-size:16px}
  .wrap{padding:68px 16px 56px}
  .brand-bar{gap:7px;margin-bottom:16px;font-size:.88rem}
  .eyebrow{
    max-width:100%;gap:7px;margin-bottom:14px;padding:5px 10px;
    font-size:.64rem;letter-spacing:.12em;white-space:normal;
  }
  h1{font-size:clamp(2.35rem,11.5vw,3rem);line-height:1.01;margin-bottom:12px}
  .lede{font-size:1.08rem;line-height:1.48;margin-bottom:22px}
  p{font-size:1rem;line-height:1.56;margin-bottom:12px}
  p.muted{font-size:.92rem}
  .hero-ctas{display:grid;grid-template-columns:1fr;gap:9px;margin:4px 0 28px}
  .btn-primary,.btn-secondary{
    width:100%;justify-content:center;padding:12px 16px;
    border-radius:11px;font-size:1rem;
  }
  .ballot-card{padding:15px 14px;border-radius:14px}
  .bc-top{gap:6px;margin-bottom:11px;font-size:.62rem;letter-spacing:.1em}
  .bc-verdict{font-size:1.28rem;line-height:1.2}
  .bc-points{gap:12px;margin:9px 0 10px}
  .bc-pt{font-size:.78rem}
  .bc-pt b{font-size:1.1rem}
  .bc-rfd{padding:11px 12px;font-size:.94rem;line-height:1.5}
  .video-card{border-radius:14px}
  h2{font-size:1.72rem;line-height:1.12;margin:36px 0 12px}
  h3{font-size:1.08rem}
  .steps{gap:10px;margin-bottom:22px}
  .step{padding:15px 14px;border-radius:12px}
  .step .n{width:26px;height:26px;margin-bottom:8px}
  .step p{font-size:.94rem;line-height:1.48}
  .point-list{gap:6px;margin-bottom:22px}
  .point-list li{font-size:.98rem;line-height:1.5;padding-left:17px}
  .shot{margin:20px 0 24px;border-radius:12px}
  .shot figcaption{font-size:.82rem;line-height:1.35}
  .faq{gap:8px}
  .faq details{padding:12px 14px}
  .faq summary{font-size:1rem}
  .faq details p{font-size:.94rem}
  .cross-links{gap:8px}
  .cross-links a{padding:9px 14px;font-size:.9rem}
  footer.foot{padding:20px 16px;font-size:.82rem}
}
@media (max-width:380px){
  html{font-size:15px}
  .wrap{padding-left:14px;padding-right:14px}
  h1{font-size:2.35rem}
  .brand-sep{display:none}
  .brand-here{flex-basis:100%}
}
/* The plain-language block. Deliberately the highest-contrast thing on
   the first screen after the headline: it answers the question a
   stranger actually arrived with. */
.simple{
  margin:22px 0 26px;padding:20px 22px;
  border:1px solid var(--border-strong);border-left:3px solid var(--accent);
  border-radius:12px;background:var(--bg-card);
  max-width:64ch;
}
.simple h2{
  margin:0 0 14px;font-size:.74rem;font-weight:800;
  letter-spacing:.14em;text-transform:uppercase;color:var(--accent);
}
.simple-steps{margin:0;padding:0;list-style:none;counter-reset:s}
.simple-steps li{
  position:relative;counter-increment:s;
  padding:0 0 0 34px;margin:0 0 12px;
  font-size:1rem;line-height:1.55;color:var(--text-dim);
}
.simple-steps li:last-child{margin-bottom:0}
.simple-steps li::before{
  content:counter(s);position:absolute;left:0;top:1px;
  width:22px;height:22px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:.72rem;font-weight:800;
  color:var(--accent);border:1px solid var(--accent);
}
.simple-steps b{color:var(--text);font-weight:700}
.simple-foot{
  margin:16px 0 0;padding-top:14px;border-top:1px solid var(--border);
  font-size:.9rem;line-height:1.5;color:var(--text-ghost);
}
@media (max-width:560px){ .simple{padding:16px 16px} .simple-steps li{font-size:.95rem} }

/* ── The experience fork. One quiet line, not a banner: it is a
   convenience, and a first-time visitor who ignores it loses nothing,
   because the authored copy is the debate-register default and every
   plain variant is additive. */
.exp-fork{
  display:flex;flex-wrap:wrap;align-items:center;gap:9px;
  margin:0 0 22px;padding:12px 14px;
  border:1px solid var(--border);border-radius:12px;background:var(--surf-2);
  font-size:.92rem;
}
.exp-fork[hidden]{display:none}
.exp-fork-q{font-weight:800;color:var(--text)}
.exp-fork-b{
  padding:6px 14px;border-radius:999px;cursor:pointer;
  border:1px solid var(--border-strong);background:transparent;color:var(--text-dim);
  font-family:inherit;font-size:.88rem;font-weight:700;
  transition:color .15s,border-color .15s,background .15s;
}
.exp-fork-b:hover{color:var(--accent);border-color:var(--accent);background:rgba(220,38,38,.06)}
.exp-fork-note{flex:1 1 260px;color:var(--text-ghost);font-size:.84rem;line-height:1.4}
.exp-fork-done{
  margin:0 0 22px;font-size:.9rem;color:var(--text-ghost);
}
.exp-fork-done button{
  color:var(--accent);text-decoration:underline;text-underline-offset:3px;font:inherit;
}

/* Which door leads is the one thing the answer moves on this page.
   Ordering, not hiding: both actions stay on screen and in the DOM in
   the same place, so an unanswered visitor sees exactly what shipped
   before. */
html[data-debate-experience="new"] #startCtas .btn-secondary,
html[data-debate-experience="unsure"] #startCtas .btn-secondary{order:-1}

/* ── Five words. A definition list because that is what it is, laid
   out as rows so the term is scannable down the left. */
.lexicon{margin:30px 0 8px}
.lex-list{margin:14px 0 26px;padding:0;display:flex;flex-direction:column;gap:0}
.lex-item{
  display:grid;grid-template-columns:170px minmax(0,1fr);gap:18px;
  padding:13px 0;border-bottom:1px solid var(--border);
}
.lex-item:first-child{border-top:1px solid var(--border)}
.lex-item dt{font-size:1.02rem;font-weight:800;color:var(--text)}
.lex-item dd{margin:0;font-size:1.02rem;line-height:1.55;color:var(--text-dim)}
@media (max-width:620px){
  .lex-item{grid-template-columns:1fr;gap:3px;padding:11px 0}
  .lex-item dt{font-size:.98rem}
  .lex-item dd{font-size:.95rem}
}
/* ── LIVELINESS PASS ───────────────────────────────────────────────
   Motion here is CSS TRANSITIONS driven by an IntersectionObserver
   class, never keyframes carrying opacity. anim-governor.js ships
   animations PAUSED off-screen, so a keyframe with `fill-mode: both`
   holding opacity:0 freezes its element at zero forever, which is how
   five motion cards once sat in the DOM with nothing on screen. A
   transition has no paused state to be trapped in, and everything here
   is visible with JS off because `.rv` only ADDS the finished state.

   Every rule below is inside a reduced-motion guard at the bottom. */

/* Reading-progress hairline. The page is long; this is the cheapest
   honest signal of how much is left. */
.readbar{position:fixed;top:0;left:0;height:2px;width:0;z-index:60;
  background:linear-gradient(90deg,var(--accent),#f87171);
  box-shadow:0 0 10px var(--accent-glow);transition:width .1s linear}

/* Scroll reveal. Base state is fully visible; `js-rv` on <html> is set
   by the script BEFORE first paint only when motion is allowed, so a
   visitor with JS off or reduced motion never meets a hidden element. */
html.js-rv .rv{opacity:0;transform:translateY(14px);
  transition:opacity .5s cubic-bezier(.2,.7,.3,1),transform .5s cubic-bezier(.2,.7,.3,1)}
html.js-rv .rv.in{opacity:1;transform:none}
html.js-rv .rv-d1{transition-delay:.06s}
html.js-rv .rv-d2{transition-delay:.12s}
html.js-rv .rv-d3{transition-delay:.18s}

/* The five steps get a spine that fills as you pass them, so the list
   reads as a sequence rather than five bullets. */
.simple-steps{position:relative}
.simple-steps::before{content:'';position:absolute;left:13px;top:14px;bottom:14px;width:2px;
  background:rgba(var(--ink-rgb),.14);border-radius:2px}
.simple-steps::after{content:'';position:absolute;left:13px;top:14px;width:2px;height:0;
  background:linear-gradient(180deg,var(--accent),rgba(239,68,68,.35));border-radius:2px;
  transition:height .45s cubic-bezier(.2,.7,.3,1)}
.simple-steps.lit::after{height:calc(100% - 28px)}
.simple-steps li{position:relative}
.simple-steps li::marker{color:transparent}

/* Depth. One recipe: a hairline rim, a close contact shadow, and one
   soft far shadow. Cards lift on hover so the page answers the pointer. */
.ballot-card,.video-card,.faq details,.proof,.lex-item,.shot{
  transition:transform .22s cubic-bezier(.2,.7,.3,1),box-shadow .22s,border-color .22s}
.ballot-card{box-shadow:0 1px 0 rgba(255,255,255,.04) inset,
  0 2px 4px rgba(20,20,30,.06),0 26px 56px -30px rgba(20,20,30,.34)}
.proof:hover,.lex-item:hover{transform:translateY(-2px);border-color:var(--border-strong);
  box-shadow:0 10px 26px -14px rgba(20,20,30,.3)}
.faq details:hover{border-color:var(--border-strong)}
.ballot-card:hover,.video-card:hover{transform:translateY(-3px);
  box-shadow:0 3px 8px rgba(20,20,30,.08),0 34px 70px -34px rgba(20,20,30,.42)}
.shot:hover{transform:translateY(-3px);box-shadow:0 34px 70px -34px rgba(20,20,30,.42)}

/* The ballot writes itself once, when it first comes into view: the
   endpoint of every round is a written decision, so showing it being
   written is the one place on this page where motion is the argument. */
.bc-rfd .rfd-text{display:inline}
html.js-rv .bc-rfd .caret{display:inline-block;width:2px;height:1em;margin-left:1px;
  vertical-align:-.14em;background:var(--accent);animation:bcCaret 1s steps(2) infinite}
html.js-rv .bc-rfd.done .caret{display:none}
@keyframes bcCaret{0%,100%{opacity:1}50%{opacity:0}}
.bc-pt b{transition:color .2s}

/* The three doors. A card that names the seat you would take reads
   better than a paragraph that lists them. */
.ways{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0 30px}
@media (max-width:900px){.ways{grid-template-columns:1fr}}
.way{position:relative;overflow:hidden;padding:18px 18px 16px;border-radius:16px;
  border:1px solid var(--border);background:var(--surf-1);
  box-shadow:0 2px 4px rgba(20,20,30,.05),0 22px 48px -32px rgba(20,20,30,.3);
  transition:transform .22s cubic-bezier(.2,.7,.3,1),box-shadow .22s,border-color .22s}
.way:hover{transform:translateY(-3px);border-color:var(--border-strong);
  box-shadow:0 4px 10px rgba(20,20,30,.07),0 32px 64px -34px rgba(20,20,30,.4)}
.way::before{content:'';position:absolute;inset:0 0 auto;height:3px;
  background:linear-gradient(90deg,var(--accent),transparent)}
.way .wk{display:inline-flex;align-items:center;gap:7px;font-size:.66rem;font-weight:800;
  letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:9px}
.way h3{font-size:1.16rem;margin-bottom:7px}
.way p{font-size:1rem;line-height:1.55;margin-bottom:12px;max-width:none;color:var(--text-dim)}
.way .wgo{display:inline-flex;align-items:center;gap:7px;font-size:.95rem;font-weight:800;
  color:var(--accent);text-decoration:none}
.way .wgo:hover{text-decoration:underline;text-underline-offset:3px}
.way .wnote{margin:0;font-size:.85rem;line-height:1.45;color:var(--text-ghost)}

/* Motion is a courtesy, not a requirement. */
/* Printing and forced colors must never inherit a mid-reveal state. */
@media print{
  html.js-rv .rv{opacity:1!important;transform:none!important}
  .readbar{display:none}
}
@media (forced-colors: active){
  html.js-rv .rv{opacity:1;transform:none}
}
@media (prefers-reduced-motion: reduce){
  html.js-rv .rv{opacity:1;transform:none;transition:none}
  .simple-steps::after{transition:none}
  .readbar{display:none}
  .ballot-card,.video-card,.faq details,.proof,.lex-item,.shot,.way{transition:none}
  .proof:hover,.lex-item:hover,.ballot-card:hover,.video-card:hover,.shot:hover,.way:hover{transform:none}
  html.js-rv .bc-rfd .caret{display:none}
}


/* Local 2026-09-05 explainer layout. Explicit readable px sizing avoids the
   shared mobile root overrides shrinking interactive and body text. */
.hiw{max-width:1220px;padding:74px 32px 64px}
.hiw p,.hiw li,.hiw .faq details p{font:400 17px/1.6 'DM Sans',Arial,sans-serif}
.hiw h1,.hiw h2,.hiw h3{font-family:'Archivo',Arial,sans-serif}
.hiw h1{font-size:clamp(40px,5.2vw,66px);line-height:1.04;letter-spacing:-2px;margin:0 0 24px}
.hiw h2{font-size:34px;line-height:1.15;letter-spacing:-.8px;margin:8px 0 18px}
.hiw h3{font-size:20px;line-height:1.3;letter-spacing:-.25px}
.hiw .brand-bar{font-size:14px;margin-bottom:42px}
.hiw .brand-mark{color:var(--text)}.hiw .brand-mark strong{color:var(--accent)}
.hiw .eyebrow{font-size:12px;letter-spacing:1.2px;border:0;padding:0;background:none;margin-bottom:20px}
.hiw-hero{display:grid;grid-template-columns:1.1fr 1fr;gap:56px;align-items:center;padding-bottom:54px}
.hiw .lede{font-size:20px;line-height:1.55;margin-bottom:25px;max-width:540px}
.hiw .hero-ctas{display:flex;margin:0 0 18px;gap:10px}
.hiw .btn-primary,.hiw .btn-secondary{font:700 16px/1.3 'DM Sans',Arial,sans-serif;padding:15px 18px;border-radius:8px;min-height:48px}
.hiw .hiw-small{font-size:15px;line-height:1.55;margin:16px 0 0}
.hiw-example{border:1px solid var(--border-strong);background:var(--bg-card);border-radius:18px;padding:26px;box-shadow:var(--shadow-lg)}
.hiw-example-label,.hiw-kicker{display:block;font:700 11px/1.4 'DM Sans',Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent)}
.hiw-example h2{font-size:29px;line-height:1.22;margin:22px 0}
.hiw-sides{display:grid;gap:14px}.hiw-sides>div{padding:16px 18px;border-radius:10px;background:var(--surf-2);border-left:3px solid var(--accent)}
.hiw-sides>div:last-child{border-color:var(--text-ghost);margin-left:22px}
.hiw-sides b{font:800 11px 'DM Sans',Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;color:var(--accent)}
.hiw-sides p{margin:7px 0 0;font-size:16px}
.hiw .hiw-example-end{font-size:14px;line-height:1.5;margin:20px 0 0;color:var(--text-ghost)}
.hiw-section{border-top:1px solid var(--border-strong);padding:42px 0}
.hiw-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:25px;list-style:none;padding:0;margin:30px 0 0}
.hiw-steps>li>span{display:block;font:500 14px 'Geist Mono',monospace;color:var(--accent);margin-bottom:20px}
.hiw-steps p{font-size:16px;margin:12px 0 0}
.hiw-record,.hiw-watch{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.hiw-notes{border:1px solid var(--border);border-radius:12px;padding:24px;background:var(--bg-card)}
.hiw-notes h3{margin:20px 0 8px;color:var(--accent);font-size:16px}
.hiw-notes ul{padding-left:20px}.hiw-notes li{font-size:16px;margin:6px 0;color:var(--text-dim)}
.hiw-ways{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:24px}
.hiw-ways>a{display:block;border:1px solid var(--border);border-radius:10px;padding:22px;background:var(--bg-card)}
.hiw-ways>a:hover{border-color:var(--accent)}.hiw-ways h3{display:flex;justify-content:space-between;gap:12px}.hiw-ways h3 span{color:var(--accent)}
.hiw-ways p{font-size:16px;margin:12px 0 0}
.hiw .video-card{margin:0;max-width:none;box-shadow:none;border-radius:10px}
.hiw .faq{max-width:850px;gap:0;margin:28px 0 0}.hiw .faq details{border:0;border-bottom:1px solid var(--border);border-radius:0;padding:19px 0;background:transparent;box-shadow:none}
.hiw .faq summary{font:600 18px/1.4 'DM Sans',Arial,sans-serif;min-height:28px}.hiw .faq details p{max-width:750px}
.hiw-end{border-top:1px solid var(--border-strong);text-align:center;padding:46px 0 10px}.hiw-end h2{font-size:44px;margin-bottom:24px}.hiw-end em{color:var(--accent)}
.hiw a:focus-visible,.hiw summary:focus-visible{outline:3px solid var(--accent);outline-offset:5px}
@media(max-width:1000px){.hiw-hero{gap:28px}.hiw-record,.hiw-watch{gap:32px}.hiw-steps{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:28px}}
@media(max-width:720px){.hiw{padding:72px 20px 42px}.hiw .brand-bar{margin-bottom:30px}.hiw-hero,.hiw-record,.hiw-watch{grid-template-columns:1fr;gap:28px}.hiw-hero{padding-bottom:34px}.hiw h1{font-size:46px;letter-spacing:-1.4px}.hiw .lede{font-size:18px}.hiw .hero-ctas{display:grid;grid-template-columns:1fr;width:100%}.hiw-example{padding:22px}.hiw-example h2{font-size:25px}.hiw h2{font-size:29px}.hiw-section{padding:32px 0}.hiw-ways{grid-template-columns:1fr;gap:12px}.hiw-ways>a{padding:19px}.hiw-end h2{font-size:38px}.hiw .faq summary{font-size:17px}.hiw .btn-primary,.hiw .btn-secondary{width:100%;justify-content:center}.hiw-steps{gap:28px 22px}.hiw-steps h3{font-size:18px}}
@media(max-width:390px){.hiw{padding-right:16px;padding-left:16px}.hiw h1{font-size:40px}.hiw-steps{grid-template-columns:1fr}.hiw-steps>li>span{margin-bottom:8px}.hiw-sides>div:last-child{margin-left:12px}}

</style>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=DM+Sans:opsz,wght@9..40,400..900&family=Geist+Mono:wght@400..700&family=Inter:wght@400..900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<link rel="stylesheet" href="/css/debate-discovery.css">
<script defer src="/js/debate-discovery.js"></script>
<script defer src="/js/track.js"></script>
</head>
<body>

<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>
<script defer src="/js/notifications.js"></script>

<main id="main-content">
<div class="wrap hiw">
  <nav class="brand-bar" aria-label="Breadcrumb"><a class="brand-mark" href="/"><span class="db-wordmark notranslate" translate="no" role="img" aria-label="Debatable"><span class="db-wordmark-base">Debat</span><span class="db-wordmark-accent">able</span></span></a><span class="brand-sep">/</span><span aria-current="page">How it works</span></nav>
  <section class="hiw-hero" aria-labelledby="hiw-title">
    <div>
      <span class="eyebrow">How it works</span>
      <h1 id="hiw-title">One question. Two people.<br><em>Argue it out.</em></h1>
      <p class="lede">Meet a person, choose a question together, and talk face to face. The round ends with a decision and the reasons behind it.</p>
      <div class="hero-ctas" id="startCtas"><a class="btn-primary" href="/spar" data-cta="hiw-spar">Find someone to debate <span aria-hidden="true">→</span></a><a class="btn-secondary" href="/watch" data-cta="hiw-watch">Watch a round</a></div>
      <p class="hiw-small">Have someone in mind? <a href="/private">Send a private invite.</a></p>
    </div>
    <figure class="debate-preview" data-debate-preview>
      <div class="debate-preview__head"><span>Example exchange · animated portraits</span><button type="button" class="debate-preview__pause" data-preview-pause>Pause animation</button></div>
      <h2 class="debate-preview__question">Should a four-day workweek be the standard?</h2>
      <div class="debate-preview__people" aria-hidden="true">
        <div class="debate-preview__seat"><video muted loop playsinline preload="none" poster="/img/round/faces/face46.jpg" data-src="/img/round/faces/face46.mp4"></video><span>FOR</span></div>
        <div class="debate-preview__seat"><video muted loop playsinline preload="none" poster="/img/round/faces/face48.jpg" data-src="/img/round/faces/face48.mp4"></video><span>AGAINST</span></div>
      </div>
      <div class="debate-preview__exchange"><p><b>For:</b> “Same work done. More time to live.”</p><p><b>Against:</b> “Who covers the fifth day at a hospital?”</p></div>
      <figcaption>You make a point. They push back. <a href="/watch" data-cta="hiw-example-watch">Watch a real debate &rarr;</a></figcaption>
    </figure>
  </section>

  <section class="hiw-section" aria-labelledby="simple-h">
    <div class="hiw-section-head"><span class="hiw-kicker">From hello to decision</span><h2 id="simple-h">From matching to the decision.</h2></div>
    <ol class="hiw-steps">
      <li id="step-opponent"><span>01</span><h3>Meet your opponent</h3><p>Sign in and find someone with a different take. Both of you accept before meeting.</p></li>
      <li id="step-topic"><span>02</span><h3>Agree on a question</h3><p>Choose a topic together and take opposite sides. You can argue what you believe or try the other side.</p></li>
      <li id="step-round"><span>03</span><h3>Start talking</h3><p>Choose <b>Start conversation</b> for an open exchange, or take timed turns. Check your microphone, then start the round.</p></li>
      <li id="step-ballot"><span>04</span><h3>Read the decision</h3><p>The judge explains the result and scores the arguments. Ranked results appear on the leaderboard.</p></li>
    </ol>
  </section>

  <!-- 2026-09-07: the "What This House means" link on a live round points
       here. Plain English, no debate jargon beyond the phrase itself. -->
  <details class="hiw-section" id="this-house"><summary>What does “This House” mean?</summary>
    <div class="hiw-section-head"><span class="hiw-kicker">A phrase you will see</span><h2 id="this-house-h">What "This House" means</h2></div>
    <p>Some topics start with <b>This House would</b> or <b>This House believes</b>. It is an old parliament habit. "This House" just means whoever has the power to act, usually a national government. Nobody has to pick a country unless you both want one.</p>
    <p>If the topic says <b>This House would ban X</b>, the person arguing for it says the ban should happen. The person arguing against says it should not. You do not have to prove a law would pass. You argue whether it is a good idea.</p>
    <p><b>Believes</b> means it is a claim about what is true or right, not a plan. <b>Regrets</b> means the thing already happened and you argue whether it was a mistake. <b>Would</b> means assume it happens and argue about whether it should.</p>
  </details>

  <details class="hiw-section" id="ai-matching"><summary>How matching works</summary>
    <div><span class="hiw-kicker">Find your next round</span><h2 id="ai-matching-title">Something in common.<br>Something to disagree on.</h2><p>Tell the Match Desk what you like talking about and where you stand. You can skip questions. Matching prioritizes shared topics and different answers among people available to debate.</p><p>Choose a suggested question or write your own. Both people agree before the round starts.</p><p><a href="/spar?from=how-it-works" data-cta="hiw-ai-matching">Find someone to debate &rarr;</a></p></div>
    <div class="hiw-notes"><span class="hiw-kicker">How matching works</span><h3>1. Your interests and opinions</h3><p>Answer a few questions. Your progress stays saved while you sign in with Google or Apple.</p><h3>2. A person with a different take</h3><p>Matching can use your answers, your rating, or whoever is available first. Who you meet depends on who is online.</p><h3>3. A question you both choose</h3><p>A suggested question starts the conversation. It does not assign you a belief. You can concede a point, question the framing, or choose another topic.</p><p class="hiw-small">Matching answers are not the judge’s evidence. The judge evaluates what is argued in the round.</p></div>
  </details>

  <section class="hiw-section hiw-record" aria-labelledby="after">
    <div><span class="hiw-kicker">Keep the conversation</span><h2 id="after">Keep notes from your round.</h2><p>Open <b>Round notes</b> on your phone or computer to see bullet points of what each side said. The judge’s decision is a separate part of the round.</p><p>Return to saved rounds from your <a href="/profile">profile</a>. Open a round and use <b>Export to Google Docs</b> to keep a copy.</p></div>
    <div class="hiw-notes"><span class="hiw-kicker">Example round notes</span><h3>For</h3><ul><li>Argued that a shorter week leaves more time outside work.</li><li>Said productivity could stay the same.</li></ul><h3>Against</h3><ul><li>Asked how hospitals would cover the extra day.</li><li>Distinguished office jobs from continuous services.</li></ul></div>
  </section>

  <section class="hiw-section" aria-labelledby="ways-in"><span class="hiw-kicker">Start where you like</span><h2 id="ways-in">Choose how to join.</h2>
    <div class="hiw-ways">
      <a href="/private"><h3>Bring a friend <span aria-hidden="true">↗</span></h3><p>One private room. Send them the invite link.</p></a>
      <a href="/newvoice"><h3>Practice solo <span aria-hidden="true">↗</span></h3><p>A clearly labeled AI opponent, ready when you are.</p></a>
      <a href="/watch"><h3>Watch first <span aria-hidden="true">↗</span></h3><p>See a live round or replay before taking a seat.</p></a>
    </div>
    <p class="hiw-small">Prefer typing? <a href="/practice">Start a typed round.</a> Have a transcript already? <a href="/judge">Get it judged.</a></p>
  </section>

  <section class="hiw-section hiw-watch" aria-labelledby="walkthrough-title"><div><span class="hiw-kicker">See the product</span><h2 id="walkthrough-title">Watch the walkthrough.</h2><p>A tour of a round, from joining to reading the decision. Some controls have moved as the site has changed.</p></div><div class="video-card"><video class="video-el" controls playsinline preload="none" poster="/assets/video/how-debatable-works-poster-round.jpg" aria-label="Debatable product walkthrough"><source src="/assets/video/how-debatable-works.mp4" type="video/mp4"></video></div></section>

  <section class="hiw-section" aria-labelledby="faq"><span class="hiw-kicker">Before you start</span><h2 id="faq">A few practical things.</h2><div class="faq"><details><summary>Do I need to know how to debate?</summary><p>No. Make a point, explain your reason, and listen to the reply. You can have a natural conversation or take timed turns. One person is on each side.</p></details>
<details><summary>Do I need an account?</summary><p>Live video requires sign-in with Google, Apple, or email. Your results stay on your profile.</p></details>
<details><summary>What if nobody is available?</summary><p>Keep your search open or invite a friend. Solo practice with a labeled AI opponent is also available.</p></details>
<details><summary>Can people watch or record me?</summary><p>Public live rounds can have spectators. Private invite rooms stay off the public board. Recording asks everyone in the room for permission before it starts. You can leave, report, or block someone from the room.</p></details>
<details><summary>What does the judge use?</summary><p>Judging uses AI to assess what both sides said. It explains the decision and can make mistakes. The judging page publishes the scoring rules and appeal policy.</p></details>
<details><summary>What does it cost?</summary><p>A Free plan is available. Private round judging includes two free uses per account, then requires a paid plan. Other limits and subscriptions are listed on the pricing page.</p></details>
<details><summary>Where do my rounds go?</summary><p>Open your profile to return to saved rounds. You can reopen a live room to read its transcript, notes and decision. Public replays and clips are on Watch when recording was agreed.</p></details>
</div><p class="hiw-small"><a href="/judge-integrity">Read the judge’s method</a> · <a href="/pricing">Plans and limits</a> · <a href="/privacy">Privacy</a></p></section>
  <section class="hiw-end"><h2>Ready to debate?</h2><a class="btn-primary" href="/spar" data-cta="hiw-bottom-spar">Start debating <span aria-hidden="true">→</span></a></section>
</div>
</main>

<footer class="foot">
  <a href="/">itsdebatable.com</a> · <a href="/debate-online">Debate online</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Match. Argue. Get scored.
</footer>

<script src="/js/home-magnet.js" defer></script>
<!-- Shared neural-constellation background. Animates on this light
     surface because <html> carries data-lightweb="web". -->


<canvas id="uiNeuralCanvas" class="ui-neural-canvas"></canvas>
<script defer src="/js/ui-neural.js"></script>
</body>
</html>

```

## app/debate-topic-generator.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Free Debate Topic Generator for Students | Debatable</title>
  <meta name="description" content="Generate balanced debate topics by subject, age, and format. Get the core clash, copy a motion, or practice it immediately against an AI opponent.">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="theme-color" content="#fbfaf7">
  <link rel="canonical" href="https://itsdebatable.com/debate-topic-generator">
  <script>(function(){try{if(new URLSearchParams(location.search).get('embed')==='1')document.documentElement.setAttribute('data-embed','true')}catch(e){}}());</script>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Debatable">
  <meta property="og:url" content="https://itsdebatable.com/debate-topic-generator">
  <meta property="og:title" content="Free Debate Topic Generator for Students">
  <meta property="og:description" content="Choose a subject, age, and debate format. Get balanced motions with the core clash, then practice one immediately.">
  <meta property="og:image" content="https://itsdebatable.com/og-image.png?v=deb1">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Debatable debate topic generator">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Free Debate Topic Generator for Students">
  <meta name="twitter:description" content="Balanced debate motions by subject, age, and format, with one-click AI practice.">
  <link rel="icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="/seo-growth.css">
  <script defer src="/js/track.js"></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": "Debatable Debate Topic Generator",
        "url": "https://itsdebatable.com/debate-topic-generator",
        "applicationCategory": "SocialNetworkingApplication",
        "operatingSystem": "Any",
        "browserRequirements": "Requires JavaScript",
        "description": "Generate balanced debate topics by subject, age, and debate format, then copy a motion or practice it against an AI opponent.",
        "isAccessibleForFree": true,
        "publisher": {
          "@type": "Organization",
          "name": "Debatable",
          "url": "https://itsdebatable.com/"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Debatable", "item": "https://itsdebatable.com/" },
          { "@type": "ListItem", "position": 2, "name": "Debate Topics", "item": "https://itsdebatable.com/topics/" },
          { "@type": "ListItem", "position": 3, "name": "Debate Topic Generator", "item": "https://itsdebatable.com/debate-topic-generator" }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What makes a good debate topic?",
            "acceptedAnswer": { "@type": "Answer", "text": "A good debate topic gives both sides a plausible path to victory. It names the actor or value at issue, creates a clear disagreement, and leaves room for evidence, rebuttal, and impact comparison." }
          },
          {
            "@type": "Question",
            "name": "Can I use these debate topics in class?",
            "acceptedAnswer": { "@type": "Answer", "text": "Yes. Choose the student age and classroom format, then assign sides or let students prepare both positions. Each generated topic includes the core clash to guide preparation." }
          },
          {
            "@type": "Question",
            "name": "What is the difference between a topic and a motion?",
            "acceptedAnswer": { "@type": "Answer", "text": "A topic is the broad issue, such as artificial intelligence in schools. A motion or resolution is the exact statement teams argue for and against, such as schools should prohibit students from using generative AI for homework." }
          },
          {
            "@type": "Question",
            "name": "How do I practice a generated debate topic?",
            "acceptedAnswer": { "@type": "Answer", "text": "Choose a generated motion and open it in Debatable. The motion is carried into a voice or typed practice round where an AI opponent takes the other side and an AI judge writes a ballot." }
          }
        ]
      }
    ]
  }
  </script>
  <style>
    /* ── TYPE SYSTEM ─────────────────────────────────────────────
       seo-growth.css collapses --serif and --sans onto Archivo, so this
       page had one voice for everything. Source Serif 4 is already in the
       shared @import and was going unused; it carries the editorial lines
       (the core clash, the pull statement) so the motion and the reason to
       argue it read as two different registers. ───────────────────── */
    :root{--editorial:'Source Serif 4',Georgia,'Times New Roman',serif}

    /* ── HERO ─────────────────────────────────────────────────── */
    .topic-hero{align-items:start;padding-top:56px;gap:44px}
    .topic-hero h1{font-size:clamp(2.9rem,6.2vw,5.6rem);line-height:.94}
    .topic-hero .intro{max-width:660px}
    .topic-hero .intro>p{font-size:clamp(1.12rem,1.5vw,1.32rem);line-height:1.55;max-width:600px}
    .trust-row{display:flex;flex-wrap:wrap;gap:10px 22px;margin:26px 0 0;padding:0;list-style:none;color:var(--ink);font-size:1rem;font-weight:750}
    .trust-row li::before{content:'✓';margin-right:9px;color:var(--red);font-weight:900}

    /* ── GENERATOR PANEL ──────────────────────────────────────── */
    .generator{padding:26px 26px 24px;border-top:5px solid var(--red);border-radius:16px}
    .generator-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px}
    .generator-head h2{font-size:clamp(1.5rem,2.1vw,1.85rem);margin:0;line-height:1.05}
    .generator-head span{flex:none;padding:5px 10px;border-radius:99px;background:var(--red-soft);font:800 .68rem/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--red)}
    .filters{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .field label{display:block;margin:0 0 7px;font:800 .69rem/1 var(--mono);letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
    .field select{
      width:100%;min-height:52px;border:1px solid var(--line-strong);border-radius:11px;
      padding:10px 38px 10px 13px;background:#fff;color:var(--ink);cursor:pointer;
      font-size:1rem;font-weight:700;
      -webkit-appearance:none;appearance:none;
      background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%235f5f6a' stroke-width='1.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 14px center;
    }
    .field select:focus-visible{outline:2px solid var(--red);outline-offset:2px}
    .field select:hover{border-color:rgba(220,38,38,.4)}
    .generate-row{display:grid;grid-template-columns:1fr auto;gap:11px;margin-top:18px}
    .generate-row button{min-height:58px;border:0;border-radius:12px;padding:12px 18px;font-weight:850;font-size:1.04rem;cursor:pointer;transition:background .16s ease,transform .16s ease,border-color .16s ease}
    #generate{background:var(--red);color:#fff;box-shadow:0 16px 32px -18px rgba(185,28,28,.85);letter-spacing:-.01em}
    #generate:hover{background:var(--red-dark);transform:translateY(-1px)}
    #surprise{background:var(--paper);border:1px solid var(--line-strong);color:var(--ink);font-size:.98rem}
    #surprise:hover{border-color:var(--red);color:var(--red)}
    .tool-note{margin:14px 0 0;color:var(--ghost);font-size:.86rem}

    /* ── RESULTS ──────────────────────────────────────────────── */
    .results-section{padding:26px 0 72px}
    .results-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:22px}
    .results-head h2{margin:0;font-size:clamp(1.9rem,3.8vw,2.85rem)}
    .results-head p{margin:0;flex:none;padding:7px 13px;border-radius:99px;background:#fff;border:1px solid var(--line);font:800 .76rem/1.2 var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
    .results{display:grid;gap:16px}

    /* The card IS the product. It used to read as a table row: a 1.23rem
       motion over a .94rem grey clash line. The motion is now the second
       largest type on the page after the h1. */
    .topic-card{
      position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;
      gap:22px;align-items:start;padding:28px 30px;background:#fff;
      border:1px solid var(--line);border-radius:18px;
      box-shadow:0 1px 2px rgba(20,20,30,.04),0 20px 48px -36px rgba(20,20,30,.5);
      transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease;
    }
    .topic-card::before{content:'';position:absolute;left:0;top:22px;bottom:22px;width:3px;border-radius:0 3px 3px 0;background:var(--red);opacity:0;transition:opacity .18s ease}
    .topic-card:hover{border-color:rgba(220,38,38,.32);box-shadow:0 1px 2px rgba(20,20,30,.04),0 26px 56px -34px rgba(20,20,30,.55);transform:translateY(-2px)}
    .topic-card:hover::before{opacity:1}
    .topic-number{font:800 2.9rem/.85 var(--serif);color:rgba(220,38,38,.45);letter-spacing:-.04em;padding-top:2px;min-width:56px}
    .topic-copy h3{margin:0 0 12px;font-size:clamp(1.32rem,2vw,1.78rem);line-height:1.2;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
    .topic-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
    .topic-meta span{padding:5px 10px;border:1px solid var(--line);border-radius:99px;color:var(--muted);font:800 .68rem/1.2 var(--mono);letter-spacing:.07em;text-transform:uppercase;background:var(--paper)}
    .clash{margin:0;padding-top:14px;border-top:1px solid var(--line);font-family:var(--editorial);font-size:1.1rem;line-height:1.5;color:var(--muted)}
    .clash-label{display:block;margin-bottom:4px;font:800 .66rem/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--red)}
    .topic-actions{display:flex;flex-direction:column;gap:9px;min-width:176px}
    .topic-actions a,.topic-actions button{min-height:48px;border-radius:11px;padding:11px 15px;text-decoration:none;text-align:center;font-weight:800;font-size:.96rem;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease}
    .topic-actions a{display:flex;align-items:center;justify-content:center;background:var(--ink);border:1px solid var(--ink);color:#fff}
    .topic-actions a:hover{background:var(--red);border-color:var(--red)}
    .topic-actions button{background:#fff;border:1px solid var(--line-strong);color:var(--ink)}
    .topic-actions button:hover{border-color:var(--red);color:var(--red)}

    /* ── SECTIONS ─────────────────────────────────────────────── */
    .section-pad{padding:72px 0}
    .section-rule{border-top:1px solid var(--line)}
    .section-rule .wrap>h2{font-size:clamp(1.85rem,3.6vw,2.75rem)}
    .section-rule .wrap>p{font-size:1.12rem;max-width:620px}
    .guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:28px}
    .guide-card{padding:26px;border:1px solid var(--line);border-radius:14px;background:#fff}
    .guide-card .n{display:block;margin-bottom:14px;color:rgba(220,38,38,.45);font:800 2.5rem/1 var(--serif);letter-spacing:-.04em}
    .guide-card h3{font-size:1.24rem;margin-bottom:11px}
    .guide-card p{margin-bottom:0;font-size:1rem}
    .format-table{width:100%;border-collapse:collapse;margin-top:28px;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
    .format-table th,.format-table td{padding:17px 18px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:1rem}
    .format-table tr:last-child td{border-bottom:0}
    .format-table th{background:var(--red-soft);font:800 .72rem/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--red)}
    .format-table tbody tr:hover{background:var(--paper)}
    .format-table td{color:var(--muted)}
    .format-table td:first-child{font-weight:800;color:var(--ink);font-size:1.04rem}
    .faq summary{font-size:1.06rem}
    .conversion{display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center;margin:8px auto 72px;padding:38px 40px;border-radius:18px;background:var(--ink);color:#fff}
    .conversion h2{color:#fff;margin-bottom:9px;font-size:clamp(1.65rem,3vw,2.35rem)}
    .conversion p{color:rgba(255,255,255,.74);margin:0;font-size:1.06rem}
    .conversion .btn{white-space:nowrap;min-height:54px;padding:14px 24px;font-size:1.02rem}

    /* ── EMBED SHARE ──────────────────────────────────────────── */
    .embed-share{margin:0 auto 72px;padding:30px;border:1px solid var(--line);border-radius:16px;background:#fff}
    .embed-share h2{margin-bottom:9px;font-size:clamp(1.5rem,2.6vw,1.95rem)}
    .embed-share p{margin:0 0 16px;font-size:1.04rem}
    .embed-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:11px;align-items:stretch}
    .embed-row textarea{min-height:98px;resize:vertical;border:1px solid var(--line-strong);border-radius:11px;padding:13px;background:var(--paper);color:var(--ink);font:600 .78rem/1.55 var(--mono)}
    .embed-row button{min-width:168px;border:0;border-radius:11px;padding:12px 18px;background:var(--ink);color:#fff;font-weight:800;font-size:.98rem;cursor:pointer}
    .embed-row button:hover{background:var(--red)}
    .embed-credit{display:none;margin:20px 0 0;text-align:center;font-size:.84rem;color:var(--muted)}
    .embed-credit a{font-weight:800;color:var(--ink)}

    html[data-embed="true"] .top,
    html[data-embed="true"] .topic-hero .intro,
    html[data-embed="true"] .section-rule,
    html[data-embed="true"] .faq,
    html[data-embed="true"] .conversion,
    html[data-embed="true"] .embed-share,
    html[data-embed="true"] .footer{display:none}
    html[data-embed="true"] .topic-hero{display:block;padding:18px 16px 8px}
    html[data-embed="true"] .topic-hero .generator{width:100%;max-width:none}
    html[data-embed="true"] .results-section{padding:14px 16px 24px}
    html[data-embed="true"] .embed-credit{display:block}

    @media(max-width:980px){
      .topic-card{padding:24px 24px 24px 26px}
      .topic-number{font-size:2.3rem;min-width:44px}
      .topic-actions{min-width:158px}
    }
    @media(max-width:860px){
      .topic-card{grid-template-columns:auto minmax(0,1fr)}
      .topic-actions{grid-column:2;flex-direction:row;min-width:0}
      .topic-actions a,.topic-actions button{flex:1}
      .guide-grid{grid-template-columns:1fr}
      .section-pad{padding:56px 0}
    }
    @media(max-width:620px){
      .filters{grid-template-columns:1fr}
      .generate-row{grid-template-columns:1fr}
      .results-head{align-items:start;flex-direction:column;gap:12px}
      .topic-card{grid-template-columns:1fr;gap:0;padding:22px}
      .topic-number{font-size:2rem;min-width:0;margin-bottom:8px}
      .topic-copy h3{font-size:1.32rem}
      .clash{font-size:1.04rem}
      .topic-actions{grid-column:1;flex-direction:column;margin-top:16px}
      .format-table thead{display:none}
      .format-table,.format-table tbody,.format-table tr,.format-table td{display:block;width:100%}
      .format-table tr{border-bottom:1px solid var(--line)}
      .format-table tr:last-child{border-bottom:0}
      .format-table td{border:0;padding:9px 16px}
      .format-table td:first-child{padding-top:16px}
      .format-table td:last-child{padding-bottom:16px}
      .conversion{grid-template-columns:1fr;padding:28px}
      .conversion .btn{width:100%}
      .embed-row{grid-template-columns:1fr}
      .embed-row button{min-height:50px}
    }
  </style>
<link rel="stylesheet" href="/css/wordmark.css">
</head>
<body>
  <header class="top">
    <div class="wrap nav">
      <a class="brand" href="/" aria-label="Debatable home"><span class="db-wordmark notranslate" translate="no" role="img" aria-label="Debatable"><span class="db-wordmark-base">Debat</span><span class="db-wordmark-accent">able</span></span></a>
      <nav class="links" aria-label="Primary navigation">
        <a href="/topics/">Current topics</a>
        <a href="/learn">Learn</a>
        <a href="/practice">Typed practice</a>
        <a href="/voice-debate">Voice debate</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="wrap hero topic-hero">
      <div class="intro">
        <p class="eyebrow">Free debate topic generator</p>
        <h1>Find a debate worth having.</h1>
        <p>Generate balanced debate topics for class, a club meeting, tournament practice, or an argument with friends. Choose the audience and format, then take any motion straight into a live AI practice round.</p>
        <ul class="trust-row" aria-label="Generator features">
          <li>57 handpicked motions</li>
          <li>Core clash for every topic</li>
          <li>Middle school through college</li>
        </ul>
      </div>

      <aside class="panel generator" aria-labelledby="generator-title">
        <div class="generator-head">
          <h2 id="generator-title">Build your topic set</h2>
          <span>57 motions</span>
        </div>
        <div class="filters">
          <div class="field">
            <label for="category">Subject</label>
            <select id="category">
              <option value="all">Any subject</option>
              <option value="technology">AI and technology</option>
              <option value="education">Education</option>
              <option value="government">Government and law</option>
              <option value="speech">Speech and media</option>
              <option value="environment">Environment</option>
              <option value="economics">Economics</option>
              <option value="society">Ethics and society</option>
              <option value="international">International affairs</option>
              <option value="science">Science and health</option>
            </select>
          </div>
          <div class="field">
            <label for="audience">Audience</label>
            <select id="audience">
              <option value="all">Any age</option>
              <option value="middle">Middle school</option>
              <option value="high">High school</option>
              <option value="college">College</option>
            </select>
          </div>
          <div class="field">
            <label for="format">Format</label>
            <select id="format">
              <option value="all">Any format</option>
              <option value="classroom">Classroom debate</option>
              <option value="pf">Public Forum</option>
              <option value="ld">Lincoln-Douglas</option>
              <option value="worlds">World Schools</option>
              <option value="bp">British Parliamentary</option>
            </select>
          </div>
          <div class="field">
            <label for="count">Number of topics</label>
            <select id="count">
              <option value="1">1 topic</option>
              <option value="3" selected>3 topics</option>
              <option value="5">5 topics</option>
            </select>
          </div>
        </div>
        <div class="generate-row">
          <button id="generate" type="button">Generate debate topics</button>
          <button id="surprise" type="button" aria-label="Choose random filters">Surprise me</button>
        </div>
        <p class="tool-note">Every result is selected from a human-reviewed bank. No filler or invented facts.</p>
      </aside>
    </section>

    <section class="wrap results-section" aria-labelledby="results-title">
      <div class="results-head">
        <h2 id="results-title">Your debate topics</h2>
        <p id="resultSummary" aria-live="polite">3 balanced motions</p>
      </div>
      <div class="results" id="topicResults" aria-live="polite"></div>
      <p class="embed-credit"><a href="https://itsdebatable.com/debate-topic-generator" target="_blank" rel="noopener">Powered by Debatable</a></p>
    </section>

    <section class="wrap embed-share" aria-labelledby="embed-title">
      <p class="eyebrow">Free to publish</p>
      <h2 id="embed-title">Embed a debate motion widget.</h2>
      <p>Add a rotating one-motion card to a club, newsletter, or resource page. It includes the core clash and a direct action to debate the motion.</p>
      <div class="embed-row">
        <textarea id="embedCode" readonly aria-label="Embed code">&lt;div data-debatable-motion-widget&gt;&lt;/div&gt;
&lt;script async src="https://itsdebatable.com/js/motion-widget.js"&gt;&lt;/script&gt;</textarea>
        <button id="copyEmbed" type="button">Copy embed code</button>
      </div>
    </section>

    <section class="section-rule">
      <div class="wrap section-pad">
        <p class="eyebrow">How to choose</p>
        <h2>What makes a good debate topic?</h2>
        <p>A strong topic is specific enough to argue and open enough for both sides to win. Before assigning a motion, check three things.</p>
        <div class="guide-grid">
          <article class="guide-card"><span class="n">01</span><h3>There is a real decision</h3><p>Policy motions should identify who acts and what changes. Value motions should name the principle being compared.</p></article>
          <article class="guide-card"><span class="n">02</span><h3>Both sides have a burden</h3><p>The proposition must defend the change. The opposition must defend a clear alternative, not only point out uncertainty.</p></article>
          <article class="guide-card"><span class="n">03</span><h3>The impacts can be weighed</h3><p>Good rounds compare outcomes such as fairness, safety, freedom, cost, trust, and long-term effects.</p></article>
        </div>
      </div>
    </section>

    <section class="section-rule">
      <div class="wrap section-pad">
        <p class="eyebrow">Format guide</p>
        <h2>Match the motion to the room.</h2>
        <p>The same issue should be framed differently for a classroom discussion and a competitive round.</p>
        <table class="format-table">
          <thead><tr><th>Format</th><th>Best motion shape</th><th>Preparation tip</th></tr></thead>
          <tbody>
            <tr><td>Classroom</td><td>A concrete choice with familiar stakes</td><td>Define one key term and let students prepare both sides.</td></tr>
            <tr><td>Public Forum</td><td>A current policy with evidence on both sides</td><td>Research the mechanism, affected groups, and measurable impacts.</td></tr>
            <tr><td>Lincoln-Douglas</td><td>A value conflict or question of justice</td><td>Choose a value and explain the standard used to evaluate the round.</td></tr>
            <tr><td>World Schools</td><td>A broad policy or social judgment</td><td>Build a clear model, comparative world, and principled case.</td></tr>
            <tr><td>British Parliamentary</td><td>A motion with several affected groups</td><td>Look for distinct perspectives that can support four unique team cases.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="wrap faq section-pad" aria-labelledby="faq-title">
      <p class="eyebrow">Questions</p>
      <h2 id="faq-title">Debate topic FAQ</h2>
      <details><summary>What makes a good debate topic?</summary><p>A good debate topic gives both sides a plausible path to victory. It names the actor or value at issue, creates a clear disagreement, and leaves room for evidence, rebuttal, and impact comparison.</p></details>
      <details><summary>Can I use these debate topics in class?</summary><p>Yes. Choose the student age and classroom format, then assign sides or let students prepare both positions. Each generated topic includes the core clash to guide preparation.</p></details>
      <details><summary>What is the difference between a topic and a motion?</summary><p>A topic is the broad issue, such as artificial intelligence in schools. A motion or resolution is the exact statement teams argue for and against, such as schools should prohibit students from using generative AI for homework.</p></details>
      <details><summary>How do I practice a generated debate topic?</summary><p>Choose a generated motion and open it in Debatable. The motion is carried into a voice or typed practice round where an AI opponent takes the other side and a judge writes a ballot.</p></details>
    </section>

    <section class="wrap conversion">
      <div><h2>Already have a tournament topic?</h2><p>Browse current PF, LD, Policy, Big Questions, Worlds, Congress, and parliamentary topic guides.</p></div>
      <a class="btn" href="/topics/">Browse current topics</a>
    </section>
  </main>

  <footer class="wrap footer">
    <a href="/">Debatable</a> · <a href="/topics/">Current debate topics</a> · <a href="/practice">Typed practice</a> · <a href="/voice-debate">Voice debate</a> · <a href="/learn">Learn debate</a>
  </footer>

  <script>
  (function () {
    var isEmbed = document.documentElement.getAttribute('data-embed') === 'true';
    var topics = [
      {m:'Schools should prohibit students from using generative AI for graded homework.',c:'technology',l:['middle','high'],f:['classroom','pf','worlds'],x:'Academic integrity vs. learning with new tools'},
      {m:'Governments should require licenses for developers of frontier AI systems.',c:'technology',l:['high','college'],f:['pf','worlds','bp'],x:'Public safety vs. open innovation'},
      {m:'AI-generated political advertisements should be prohibited.',c:'technology',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Election integrity vs. political expression'},
      {m:'Social media platforms should be legally responsible for harms caused by their recommendation algorithms.',c:'technology',l:['high','college'],f:['pf','worlds','bp'],x:'Platform accountability vs. user choice'},
      {m:'Facial recognition should be banned in public spaces.',c:'technology',l:['middle','high','college'],f:['classroom','pf','worlds','bp'],x:'Privacy and bias vs. security and convenience'},
      {m:'The benefits of self-driving vehicles outweigh the risks.',c:'technology',l:['middle','high'],f:['classroom','pf'],x:'Safety and access vs. technical failure and job loss'},
      {m:'Governments should treat access to high-speed internet as a public utility.',c:'technology',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Universal access vs. market competition'},

      {m:'Cell phones should be prohibited during the school day.',c:'education',l:['middle','high'],f:['classroom','pf','worlds'],x:'Attention and safety vs. autonomy and access'},
      {m:'Homework should be abolished in middle schools.',c:'education',l:['middle','high'],f:['classroom','pf'],x:'Student well-being vs. practice and responsibility'},
      {m:'Public colleges should not charge tuition.',c:'education',l:['middle','high','college'],f:['classroom','pf','worlds','bp'],x:'Equal opportunity vs. public cost and quality'},
      {m:'Standardized tests should no longer be used in university admissions.',c:'education',l:['high','college'],f:['pf','worlds','bp'],x:'Fair comparison vs. unequal preparation'},
      {m:'Schools should replace letter grades with mastery-based assessment.',c:'education',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Deeper learning vs. clarity and comparability'},
      {m:'School days should begin later for teenagers.',c:'education',l:['middle','high'],f:['classroom','pf'],x:'Health and learning vs. family and transport constraints'},
      {m:'Debate should be a required subject in secondary school.',c:'education',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Civic reasoning vs. curriculum time and access'},

      {m:'Voting should be mandatory in national elections.',c:'government',l:['middle','high','college'],f:['classroom','pf','worlds','bp'],x:'Representative democracy vs. freedom not to participate'},
      {m:'The voting age should be lowered to sixteen.',c:'government',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Youth representation vs. political maturity'},
      {m:'Governments should require social platforms to offer a chronological feed.',c:'technology',l:['middle','high','college'],f:['classroom','pf','worlds','bp'],x:'User control vs. personalized relevance'},
      {m:'Judges should be elected rather than appointed.',c:'government',l:['high','college'],f:['pf','worlds','bp'],x:'Democratic accountability vs. judicial independence'},
      {m:'Governments should use citizens assemblies to decide major constitutional questions.',c:'government',l:['high','college'],f:['pf','worlds','bp'],x:'Deliberative legitimacy vs. expertise and accountability'},
      {m:'Prisons should prioritize rehabilitation over punishment.',c:'government',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Reintegration and safety vs. desert and deterrence'},
      {m:'Police departments should be required to publish all body-camera footage after serious uses of force.',c:'government',l:['high','college'],f:['pf','worlds'],x:'Public accountability vs. privacy and due process'},

      {m:'Social media companies should verify the identity of every account holder.',c:'speech',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Accountability vs. privacy and protected dissent'},
      {m:'Universities should refuse to host speakers who advocate discriminatory ideas.',c:'speech',l:['high','college'],f:['ld','worlds','bp'],x:'Community safety vs. open inquiry'},
      {m:'News organizations should avoid publishing leaked government documents when national security is at risk.',c:'speech',l:['high','college'],f:['ld','worlds','bp'],x:'Public accountability vs. collective security'},
      {m:'Public figures should have the same online privacy rights as private citizens.',c:'speech',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Personal dignity vs. public scrutiny'},
      {m:'Governments should fund local journalism as a public service.',c:'speech',l:['high','college'],f:['pf','worlds','bp'],x:'Civic information vs. editorial independence'},
      {m:'Anonymous political speech does more good than harm.',c:'speech',l:['high','college'],f:['ld','worlds','bp'],x:'Protected dissent vs. manipulation and impunity'},

      {m:'Cities should ban private cars from their centers.',c:'environment',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Clean air and public space vs. mobility and commerce'},
      {m:'Nuclear power should be central to climate policy.',c:'environment',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Reliable low-carbon energy vs. cost, waste, and risk'},
      {m:'High-income countries should pay climate compensation to lower-income countries.',c:'environment',l:['high','college'],f:['pf','worlds','bp'],x:'Historical responsibility vs. present-day accountability'},
      {m:'Governments should prohibit new oil and gas exploration.',c:'environment',l:['high','college'],f:['pf','worlds','bp'],x:'Climate urgency vs. energy security and transition costs'},
      {m:'Protecting biodiversity should take priority over building new housing.',c:'environment',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Ecological preservation vs. human need and affordability'},
      {m:'Individuals have a moral duty to reduce their carbon footprint.',c:'environment',l:['middle','high','college'],f:['classroom','ld'],x:'Personal responsibility vs. systemic responsibility'},

      {m:'Governments should guarantee a basic income to every adult.',c:'economics',l:['middle','high','college'],f:['classroom','pf','worlds','bp'],x:'Economic security vs. cost and work incentives'},
      {m:'A maximum wage should limit how much the highest-paid workers can earn relative to the lowest-paid workers.',c:'economics',l:['high','college'],f:['ld','worlds','bp'],x:'Equality and solidarity vs. reward and productivity'},
      {m:'College athletes should be treated as employees.',c:'economics',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Fair compensation vs. the educational model of sport'},
      {m:'Governments should break up companies that dominate digital markets.',c:'economics',l:['high','college'],f:['pf','worlds','bp'],x:'Competition and consumer power vs. efficiency and scale'},
      {m:'Tipping should be replaced by higher guaranteed wages.',c:'economics',l:['middle','high','college'],f:['classroom','pf'],x:'Income stability vs. worker upside and customer choice'},
      {m:'Inheritance above a high threshold should be taxed at a much higher rate.',c:'economics',l:['high','college'],f:['ld','worlds','bp'],x:'Equal opportunity vs. family property rights'},

      {m:'Zoos should be abolished.',c:'society',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Animal liberty vs. conservation and education'},
      {m:'Parents should not post identifiable images of their young children online.',c:'society',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'A child’s future privacy vs. family expression'},
      {m:'Professional athletes should be expected to serve as role models.',c:'society',l:['middle','high'],f:['classroom','ld','worlds'],x:'Public influence vs. personal autonomy'},
      {m:'Museums should return artifacts acquired under colonial rule.',c:'society',l:['middle','high','college'],f:['classroom','worlds','bp'],x:'Restitution and ownership vs. preservation and access'},
      {m:'It is better to forgive wrongdoing than to seek retribution.',c:'society',l:['middle','high','college'],f:['classroom','ld'],x:'Mercy and restoration vs. justice and accountability'},
      {m:'Cancel culture does more harm than good.',c:'society',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Accountability and collective voice vs. due process and open dialogue'},

      {m:'Democratic countries should boycott major sporting events hosted by authoritarian governments.',c:'international',l:['high','college'],f:['pf','worlds','bp'],x:'Human-rights pressure vs. engagement and athlete interests'},
      {m:'Middle powers should form a non-aligned technology alliance.',c:'international',l:['high','college'],f:['pf','worlds','bp'],x:'Strategic autonomy vs. alliance coherence'},
      {m:'International sanctions do more harm than good.',c:'international',l:['high','college'],f:['ld','worlds','bp'],x:'Pressure without war vs. civilian harm and entrenchment'},
      {m:'Refugees should be allowed to choose which safe country hears their asylum claim.',c:'international',l:['high','college'],f:['pf','worlds','bp'],x:'Human agency and family ties vs. fair burden sharing'},
      {m:'Countries should prioritize regional trade over global trade.',c:'international',l:['high','college'],f:['pf','worlds','bp'],x:'Resilience and local ties vs. efficiency and global development'},
      {m:'The United Nations Security Council veto should be abolished.',c:'international',l:['high','college'],f:['pf','worlds','bp'],x:'Equal sovereignty vs. great-power participation'},

      {m:'Human gene editing should be allowed to prevent serious inherited diseases.',c:'science',l:['middle','high','college'],f:['classroom','pf','ld','worlds'],x:'Preventing suffering vs. consent, inequality, and unintended effects'},
      {m:'Governments should require routine childhood vaccination for attendance at public schools.',c:'science',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Collective health vs. parental choice'},
      {m:'Animal testing for medical research is morally justified.',c:'science',l:['middle','high','college'],f:['classroom','ld','worlds'],x:'Human benefit vs. animal suffering'},
      {m:'Space exploration is worth the public cost.',c:'science',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Discovery and long-term benefit vs. urgent needs on Earth'},
      {m:'Governments should regulate addictive design in digital products as a public-health issue.',c:'science',l:['middle','high','college'],f:['classroom','pf','worlds'],x:'Health protection vs. autonomy and enforceability'},
      {m:'Medical resources should prioritize patients most likely to recover.',c:'science',l:['high','college'],f:['ld','worlds','bp'],x:'Maximizing benefit vs. equal worth and vulnerability'}
    ];

    var labels = {
      technology:'AI and technology',education:'Education',government:'Government and law',speech:'Speech and media',environment:'Environment',economics:'Economics',society:'Ethics and society',international:'International affairs',science:'Science and health',
      middle:'Middle school',high:'High school',college:'College',classroom:'Classroom',pf:'Public Forum',ld:'Lincoln-Douglas',worlds:'World Schools',bp:'British Parliamentary'
    };
    var ids = ['category','audience','format','count'];
    var controls = {};
    ids.forEach(function (id) { controls[id] = document.getElementById(id); });
    var results = document.getElementById('topicResults');
    var summary = document.getElementById('resultSummary');

    function shuffled(list) {
      var copy = list.slice();
      for (var i = copy.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = copy[i]; copy[i] = copy[j]; copy[j] = temp;
      }
      return copy;
    }

    function formatForLink(selected) {
      if (selected === 'pf' || selected === 'ld' || selected === 'worlds' || selected === 'bp') return selected;
      return 'quick';
    }

    function setQuery() {
      try {
        var q = new URLSearchParams();
        if (controls.category.value !== 'all') q.set('subject', controls.category.value);
        if (controls.audience.value !== 'all') q.set('age', controls.audience.value);
        if (controls.format.value !== 'all') q.set('format', controls.format.value);
        if (controls.count.value !== '3') q.set('count', controls.count.value);
        if (isEmbed) q.set('embed', '1');
        history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
      } catch (error) {}
    }

    function topicCard(topic, index) {
      var selectedFormat = controls.format.value;
      var displayFormat = selectedFormat !== 'all' && topic.f.indexOf(selectedFormat) !== -1 ? selectedFormat : topic.f[0];
      var practice = '/practice?motion=' + encodeURIComponent(topic.m) + '&format=' + encodeURIComponent(formatForLink(displayFormat));
      var article = document.createElement('article');
      article.className = 'topic-card';
      article.innerHTML = '<div class="topic-number">' + String(index + 1).padStart(2, '0') + '</div>' +
        '<div class="topic-copy"><div class="topic-meta"><span>' + labels[topic.c] + '</span><span>' + labels[displayFormat] + '</span></div>' +
        '<h3>' + topic.m + '</h3><p class="clash"><span class="clash-label">Core clash</span>' + topic.x + '</p></div>' +
        '<div class="topic-actions"><a href="' + practice + '" data-cta="topic-generator-practice">Debate this topic</a><button type="button" class="copy-topic">Copy motion</button></div>';
      var copy = article.querySelector('.copy-topic');
      copy.addEventListener('click', function () {
        var text = topic.m + '\nCore clash: ' + topic.x;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy motion'; }, 1600); });
        } else {
          var area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy motion'; }, 1600);
        }
      });
      return article;
    }

    function generate() {
      var category = controls.category.value;
      var audience = controls.audience.value;
      var format = controls.format.value;
      var count = Number(controls.count.value) || 3;
      var matches = topics.filter(function (topic) {
        return (category === 'all' || topic.c === category) &&
          (audience === 'all' || topic.l.indexOf(audience) !== -1) &&
          (format === 'all' || topic.f.indexOf(format) !== -1);
      });
      if (matches.length < count) {
        matches = topics.filter(function (topic) {
          return (category === 'all' || topic.c === category) && (audience === 'all' || topic.l.indexOf(audience) !== -1);
        });
      }
      if (matches.length < count) matches = topics;
      var chosen = shuffled(matches).slice(0, count);
      results.innerHTML = '';
      chosen.forEach(function (topic, index) { results.appendChild(topicCard(topic, index)); });
      summary.textContent = chosen.length === 1 ? '1 balanced motion' : chosen.length + ' balanced motions';
      setQuery();
    }

    function readQuery() {
      try {
        var q = new URLSearchParams(location.search);
        var map = {subject:'category',age:'audience',format:'format',count:'count'};
        Object.keys(map).forEach(function (key) {
          var value = q.get(key); var select = controls[map[key]];
          if (value && Array.prototype.some.call(select.options, function (option) { return option.value === value; })) select.value = value;
        });
      } catch (error) {}
    }

    document.getElementById('generate').addEventListener('click', generate);
    document.getElementById('surprise').addEventListener('click', function () {
      controls.category.selectedIndex = 1 + Math.floor(Math.random() * (controls.category.options.length - 1));
      controls.audience.selectedIndex = 1 + Math.floor(Math.random() * (controls.audience.options.length - 1));
      controls.format.selectedIndex = Math.floor(Math.random() * controls.format.options.length);
      generate();
    });
    document.getElementById('copyEmbed').addEventListener('click', function () {
      var button = this;
      var code = document.getElementById('embedCode').value;
      function done() { button.textContent = 'Copied'; setTimeout(function () { button.textContent = 'Copy embed code'; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done);
      } else {
        var area = document.getElementById('embedCode'); area.focus(); area.select(); document.execCommand('copy'); done();
      }
    });
    readQuery();
    generate();
  }());
  </script>
<script src="/js/home-magnet.js" defer></script>
</body>
</html>

```