// /political-debate and /political-debate-topics
//
// A server-rendered acquisition cluster for people who want to discuss
// politics, public policy, and current issues. The individual question
// dossiers still live under /debate/{slug}; this function gives them a clear
// politics hierarchy and a guided path into a real round.

import { MOTION_BANK } from './lib/debate-bank.mjs';
import {
  FEATURED_POLITICAL_SLUGS,
  PARTISAN_ISSUES,
  PARTY_POSITION_SOURCES,
  POLITICS_GROUPS,
  politicalSlugCount,
} from './lib/politics-hub.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const HERO_IMAGE = `${SITE_ORIGIN}/img/politics/capitol.jpg`;
const UPDATED = '2026-09-03';

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, char => HTML_ESCAPE[char]);
}
function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
function motionFor(slug) {
  return MOTION_BANK[slug] || null;
}
function groupMotions(group) {
  return group.slugs.map(motionFor).filter(Boolean);
}
function challengeHref({ question, context, sideA = 'For', sideB = 'Against', topic = 'Politics' }, side = 'a') {
  const query = new URLSearchParams();
  query.set('claim', question);
  if (context) query.set('context', context);
  query.set('sideA', sideA);
  query.set('sideB', sideB);
  query.set('side', side === 'b' ? 'b' : 'a');
  query.set('topic', topic);
  query.set('category', 'Politics');
  query.set('source', 'political-debate');
  return `/challenges?${query.toString()}`;
}
function partisanChallengeHref(issue, side) {
  return challengeHref({
    question: issue.question,
    context: `Common Democratic case: ${issue.democratic} Common Republican case: ${issue.republican} Central clash: ${issue.clash}`,
    sideA: 'Democratic case',
    sideB: 'Republican case',
    topic: issue.topic,
  }, side);
}
function motionChallengeHref(motion) {
  return challengeHref({
    question: motion.title,
    context: `Central clash: ${motion.clash.question}`,
    topic: motion.category,
  });
}
function modeFromUrl(url) {
  try {
    const path = new URL(url).pathname.replace(/^\/api/, '').replace(/\/$/, '');
    if (path === '/political-debate' || path === '') return 'hub';
    if (path === '/political-debate/topics' || path === '/political-debate-topics') return 'topics';
    return null;
  } catch {
    return null;
  }
}

function sharedStyles() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@500;600;700;800&display=swap');
  *{box-sizing:border-box}
  :root{
    --paper:#f5f1e8;--paper-2:#ebe4d6;--ink:#191714;--muted:#665f56;
    --card:#fffdf8;--line:rgba(42,35,28,.16);--line-strong:rgba(42,35,28,.28);
    --red:#be1e2d;--red-dark:#8f1520;--blue:#173f5f;--dem:#2366c9;--rep:#c9283d;--gold:#9a6713;
    --serif:'Fraunces',Georgia,'Times New Roman',serif;
    --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }
  html{scroll-behavior:smooth}
  body{margin:0;background:
    linear-gradient(rgba(25,23,20,.025) 1px,transparent 1px),
    linear-gradient(90deg,rgba(25,23,20,.025) 1px,transparent 1px),var(--paper);
    background-size:42px 42px;color:var(--ink);font:17px/1.65 var(--serif);-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  a:hover{text-decoration:none}
  img{display:block;max-width:100%}
  figure{margin:0}
  button,input{font:inherit}
  .shell{max-width:1200px;margin:0 auto;padding:26px 34px 110px}
  .nav{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:34px;font-family:var(--sans)}
  .brand{font-weight:800;letter-spacing:-.035em;font-size:19px}
  .brand b{color:var(--red)}
  .nav-links{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}
  .nav-link{border:1px solid var(--line);background:rgba(255,253,248,.72);border-radius:999px;padding:9px 13px;color:var(--muted);font-size:12px;font-weight:800}
  .nav-link:hover{border-color:var(--line-strong);color:var(--ink)}
  .nav-link.primary{color:#fff;background:var(--red);border-color:var(--red);box-shadow:0 10px 26px -16px rgba(190,30,45,.9)}
  .eyebrow{font:800 11px/1.2 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--red)}
  h1,h2,h3,p{margin-top:0}
  h1{font:600 clamp(43px,6.2vw,78px)/.98 var(--serif);letter-spacing:-.045em;margin-bottom:20px;max-width:820px}
  h2{font:600 clamp(30px,4.3vw,50px)/1.03 var(--serif);letter-spacing:-.035em;margin-bottom:15px}
  h3{font:600 23px/1.18 var(--serif);letter-spacing:-.018em;margin-bottom:8px}
  .lede{font-size:20px;line-height:1.52;color:var(--muted);max-width:680px}
  .section{padding-top:92px}
  .section-head{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:28px}
  .section-head p{max-width:520px;color:var(--muted);margin-bottom:4px}
  .rule{height:1px;background:var(--line);margin-top:14px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:12px;padding:13px 18px;font:800 13px/1 var(--sans);border:1px solid var(--line-strong);background:var(--card);transition:transform .14s,border-color .14s,background .14s}
  .btn:hover{transform:translateY(-2px);border-color:var(--ink)}
  .btn.red{background:var(--red);border-color:var(--red);color:#fff}
  .btn.red:hover{background:var(--red-dark);border-color:var(--red-dark)}
  .btn.dark{background:var(--ink);border-color:var(--ink);color:#fff}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}
  .arrow{font-size:16px;line-height:1}
  .photo{position:relative;overflow:hidden;background:#d9d2c5}
  .photo img{width:100%;height:100%;object-fit:cover}
  .credit{position:absolute;right:10px;bottom:9px;z-index:3;background:rgba(16,15,13,.76);color:rgba(255,255,255,.9);padding:5px 8px;border-radius:6px;font:600 9px/1.2 var(--sans)}
  .credit:hover{background:rgba(16,15,13,.9)}
  .hero{display:grid;grid-template-columns:minmax(0,1.03fr) minmax(390px,.97fr);gap:48px;align-items:center;min-height:620px}
  .hero-copy{padding:34px 0}
  .hero .eyebrow{margin-bottom:18px}
  .hero-photo{height:560px;border-radius:28px;box-shadow:0 30px 80px -38px rgba(25,23,20,.65)}
  .hero-photo::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 46%,rgba(14,13,12,.76))}
  .image-question{position:absolute;left:24px;right:24px;bottom:22px;z-index:2;color:#fff}
  .image-question .iq-eye{font:800 10px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;opacity:.76;margin-bottom:8px}
  .image-question q{font:500 clamp(22px,2.7vw,34px)/1.15 var(--serif);quotes:none}
  .signals{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
  .signal{border:1px solid var(--line);background:rgba(255,253,248,.62);border-radius:999px;padding:7px 11px;font:700 11px/1 var(--sans);color:var(--muted)}
  .party-section{scroll-margin-top:24px}
  .party-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
  .party-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:0 15px 34px -32px rgba(25,23,20,.7)}
  .party-topic{font:800 9.5px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
  .party-card h3{font-size:24px;margin-bottom:17px}
  .party-sides{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .party-side{display:flex;flex-direction:column;min-height:164px;border:1px solid var(--line);border-radius:14px;padding:15px;transition:transform .14s,border-color .14s,background .14s}
  .party-side:hover{transform:translateY(-2px)}
  .party-side.dem:hover{border-color:rgba(35,102,201,.58);background:rgba(35,102,201,.045)}
  .party-side.rep:hover{border-color:rgba(201,40,61,.58);background:rgba(201,40,61,.045)}
  .party-label{display:flex;align-items:center;gap:7px;font:800 10px/1.2 var(--sans);letter-spacing:.08em;text-transform:uppercase;margin-bottom:9px}
  .party-label::before{content:'';width:9px;height:9px;border-radius:50%;background:currentColor;flex:none}
  .dem .party-label{color:var(--dem)}.rep .party-label{color:var(--rep)}
  .party-case{font-size:13px;line-height:1.45;color:var(--muted);margin-bottom:13px}
  .party-action{margin-top:auto;font:800 11px/1.2 var(--sans)}
  .dem .party-action{color:var(--dem)}.rep .party-action{color:var(--rep)}
  .party-brief{display:inline-flex;margin-top:14px;font:800 11px/1.2 var(--sans);color:var(--muted);border-bottom:1px solid var(--line-strong);padding-bottom:3px}
  .party-source{margin:18px 0 0;color:var(--muted);font:600 11px/1.55 var(--sans)}
  .party-source a{border-bottom:1px solid var(--line-strong)}
  .category-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}
  .category{position:relative;min-height:300px;border-radius:18px;overflow:hidden;color:#fff;background:#222;isolation:isolate;box-shadow:0 14px 40px -30px rgba(25,23,20,.85);transition:transform .16s}
  .category:hover{transform:translateY(-4px)}
  .category img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;filter:saturate(.72)}
  .category::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(10,10,10,.04),rgba(10,10,10,.88))}
  .category-copy{position:absolute;left:17px;right:17px;bottom:17px}
  .category-copy span{font:800 9px/1 var(--sans);letter-spacing:.15em;text-transform:uppercase;opacity:.78}
  .category-copy h3{font-size:20px;margin:6px 0 4px;color:#fff}
  .category-copy p{font:500 11px/1.45 var(--sans);margin:0;color:rgba(255,255,255,.78)}
  .question-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .question{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;display:flex;flex-direction:column;min-height:280px;box-shadow:0 12px 32px -30px rgba(25,23,20,.65)}
  .question:hover{border-color:var(--line-strong)}
  .question-eye{font:800 9.5px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:12px}
  .question h3{font-size:24px}
  .clash{font-size:15px;line-height:1.5;color:var(--muted);margin-bottom:20px}
  .question-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
  .question-actions a{font:800 11px/1 var(--sans);border-bottom:1px solid var(--line-strong);padding:8px 0}
  .question-actions a:last-child{margin-left:auto;color:var(--red)}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:22px;overflow:hidden}
  .step{background:var(--card);padding:30px}
  .step-num{width:34px;height:34px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font:800 12px/1 var(--sans);margin-bottom:28px}
  .step p{font-size:15px;color:var(--muted);margin-bottom:0}
  .charter{display:grid;grid-template-columns:1fr 1fr;background:var(--blue);color:#fff;border-radius:26px;overflow:hidden}
  .charter-copy{padding:46px}
  .charter .eyebrow{color:#ffb4b9}
  .charter h2{font-size:clamp(31px,4vw,49px);margin-top:13px}
  .charter p{color:rgba(255,255,255,.74);max-width:500px}
  .charter-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:36px;background:rgba(255,255,255,.06)}
  .charter-item{border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:18px}
  .charter-item b{display:block;font:800 11px/1.2 var(--sans);text-transform:uppercase;letter-spacing:.1em;color:#fff;margin-bottom:7px}
  .charter-item span{font-size:14px;line-height:1.45;color:rgba(255,255,255,.72)}
  .cta-band{display:flex;justify-content:space-between;align-items:center;gap:24px;background:var(--red);color:#fff;border-radius:24px;padding:34px 38px}
  .cta-band h2{font-size:clamp(27px,3.6vw,43px);margin-bottom:6px}
  .cta-band p{color:rgba(255,255,255,.78);margin-bottom:0}
  .cta-band .btn{background:#fff;color:var(--red);border-color:#fff;flex-shrink:0}
  .faq{display:grid;grid-template-columns:.75fr 1.25fr;gap:44px}
  .faq details{border-top:1px solid var(--line);padding:18px 0}
  .faq details:last-child{border-bottom:1px solid var(--line)}
  .faq summary{cursor:pointer;font:700 16px/1.4 var(--sans);list-style:none;padding-right:30px;position:relative}
  .faq summary::-webkit-details-marker{display:none}
  .faq summary::after{content:'+';position:absolute;right:2px;top:0;color:var(--red);font-size:22px}
  .faq details[open] summary::after{content:'−'}
  .faq details p{color:var(--muted);font-size:15px;margin:12px 30px 0 0}
  .footer{margin-top:88px;border-top:1px solid var(--line);padding-top:24px;display:flex;justify-content:space-between;gap:22px;flex-wrap:wrap;color:var(--muted);font:600 12px/1.7 var(--sans)}
  .footer-links{display:flex;gap:16px;flex-wrap:wrap}
  .footer a:hover{color:var(--red)}
  .topics-hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:40px;align-items:end;padding:38px 0 28px}
  .topics-hero .eyebrow{margin-bottom:16px}
  .topics-photo{height:260px;border-radius:20px}
  .guide{position:sticky;top:0;z-index:20;background:rgba(245,241,232,.94);backdrop-filter:blur(12px);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 0;margin-top:24px}
  .guide-in{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:14px;align-items:center}
  .search{width:100%;border:1px solid var(--line-strong);border-radius:11px;padding:11px 13px;background:var(--card);color:var(--ink);font:600 13px/1 var(--sans);outline:none}
  .search:focus{border-color:var(--red);box-shadow:0 0 0 3px rgba(190,30,45,.12)}
  .filters{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
  .filter{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:9px 11px;color:var(--muted);font:800 10px/1 var(--sans);cursor:pointer}
  .filter[aria-pressed='true']{background:var(--ink);border-color:var(--ink);color:#fff}
  .result-line{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:18px;color:var(--muted);font:700 12px/1.4 var(--sans)}
  .pick{border:0;background:none;color:var(--red);font:800 12px/1.2 var(--sans);cursor:pointer;padding:4px 0;border-bottom:1px solid rgba(190,30,45,.35)}
  .topic-group{padding-top:74px;scroll-margin-top:86px}
  .group-head{display:grid;grid-template-columns:230px 1fr;gap:28px;align-items:center;margin-bottom:22px}
  .group-photo{height:150px;border-radius:16px}
  .group-head h2{font-size:clamp(29px,3.8vw,45px);margin-bottom:7px}
  .group-head p{color:var(--muted);max-width:650px;margin-bottom:0}
  .topic-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .topic-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:stretch}
  .topic-card:hover{border-color:var(--line-strong)}
  .topic-main{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}
  .topic-card h3{font-size:20px;margin-bottom:8px}
  .topic-card p{font-size:14px;line-height:1.45;color:var(--muted);margin-bottom:0}
  .topic-card .go{width:35px;height:35px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;color:var(--red);font:800 14px/1 var(--sans)}
  .topic-card:hover .go{background:var(--red);color:#fff;border-color:var(--red)}
  .topic-actions{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid var(--line);margin-top:16px;padding-top:13px;font:800 11px/1.2 var(--sans)}
  .topic-actions a:first-child{color:var(--muted)}
  .topic-actions a:last-child{color:var(--red)}
  [hidden]{display:none!important}
  @media(max-width:1000px){
    .hero{grid-template-columns:1fr;min-height:0}.hero-photo{height:470px}.hero-copy{padding-bottom:0}
    .category-grid{grid-template-columns:repeat(3,1fr)}.question-grid{grid-template-columns:repeat(2,1fr)}
    .charter{grid-template-columns:1fr}.topics-hero{grid-template-columns:1fr}.topics-photo{height:320px}
  }
  @media(max-width:720px){
    .shell{padding:18px 17px 86px}.nav{align-items:flex-start}.nav-links .nav-link:not(.primary){display:none}
    h1{font-size:clamp(42px,14vw,61px)}.lede{font-size:18px}.hero{gap:26px}.hero-photo{height:410px;border-radius:20px}
    .section{padding-top:70px}.section-head{display:block}.category-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 1px 14px}.category{min-width:76vw;scroll-snap-align:start}
    .party-grid,.question-grid,.steps,.topic-list{grid-template-columns:1fr}.question{min-height:0}.charter-copy{padding:30px 24px}.charter-list{grid-template-columns:1fr;padding:22px}
    .party-card{padding:17px}.party-sides{grid-template-columns:1fr}.party-side{min-height:0}.party-card h3{font-size:22px}
    .cta-band{display:block;padding:29px 24px}.cta-band .btn{margin-top:20px}.faq{grid-template-columns:1fr;gap:8px}
    .topics-hero{padding-top:18px}.topics-photo{height:230px}.guide{position:static}.guide-in{grid-template-columns:1fr}.filters{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:3px}.filter{white-space:nowrap}
    .group-head{grid-template-columns:1fr}.group-photo{height:190px}.topic-group{padding-top:56px}
  }
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.category,.btn{transition:none}}
  `;
}

function topNav() {
  return `<nav class="nav" aria-label="Main navigation">
    <a class="brand" href="/">Debat<b>able</b></a>
    <div class="nav-links">
      <a class="nav-link" href="/political-debate-topics">Political topics</a>
      <a class="nav-link" href="/contested">Current issues</a>
      <a class="nav-link primary" href="/challenges">Open challenges</a>
    </div>
  </nav>`;
}

function photo(group, className = 'photo') {
  return `<figure class="${esc(className)} photo">
    <img src="${esc(group.image)}" alt="${esc(group.imageAlt)}" width="${esc(group.imageWidth)}" height="${esc(group.imageHeight)}" loading="lazy" decoding="async">
    <a class="credit" href="${esc(group.imageSource)}" target="_blank" rel="noopener">${esc(group.imageCredit)}</a>
  </figure>`;
}

function categoryCard(group) {
  const count = groupMotions(group).length;
  return `<a class="category" href="/political-debate-topics#${esc(group.id)}">
    <img src="${esc(group.image)}" alt="" width="${esc(group.imageWidth)}" height="${esc(group.imageHeight)}" loading="lazy" decoding="async">
    <div class="category-copy">
      <span>${count} questions</span>
      <h3>${esc(group.label)}</h3>
      <p>${esc(group.description)}</p>
    </div>
  </a>`;
}

function partisanCard(issue) {
  return `<article class="party-card" id="issue-${esc(issue.id)}">
    <div class="party-topic">${esc(issue.topic)} · Democrats vs Republicans</div>
    <h3>${esc(issue.question)}</h3>
    <div class="party-sides">
      <a class="party-side dem" href="${esc(partisanChallengeHref(issue, 'a'))}">
        <span class="party-label">Common Democratic case</span>
        <span class="party-case">${esc(issue.democratic)}</span>
        <span class="party-action">Defend this case →</span>
      </a>
      <a class="party-side rep" href="${esc(partisanChallengeHref(issue, 'b'))}">
        <span class="party-label">Common Republican case</span>
        <span class="party-case">${esc(issue.republican)}</span>
        <span class="party-action">Defend this case →</span>
      </a>
    </div>
    ${issue.dossierSlug ? `<a class="party-brief" href="/debate/${esc(issue.dossierSlug)}">Read the full issue brief</a>` : ''}
  </article>`;
}

function partisanSection() {
  return `<section class="section party-section" id="party-lines" aria-labelledby="party-heading">
    <div class="section-head"><div><div class="eyebrow">Democrats vs Republicans</div><h2 id="party-heading">Pick the case you will defend.</h2></div><p>These are common party cases, not a claim about every voter. Choose one and Debatable carries the question, context, and your side straight into a public challenge.</p></div>
    <div class="party-grid">${PARTISAN_ISSUES.map(partisanCard).join('')}</div>
    <p class="party-source">Position framing follows the parties' published national platforms: <a href="${esc(PARTY_POSITION_SOURCES.democratic)}" target="_blank" rel="noopener">Democratic platform</a> and <a href="${esc(PARTY_POSITION_SOURCES.republican)}" target="_blank" rel="noopener">Republican platform</a>. The summaries identify a common case for each side. They do not assign a belief to every party member.</p>
  </section>`;
}

function featuredCard(motion) {
  const group = POLITICS_GROUPS.find(item => item.slugs.includes(motion.slug));
  return `<article class="question">
    <div class="question-eye">${esc(group ? group.label : motion.category)}</div>
    <h3>${esc(motion.title)}</h3>
    <p class="clash">${esc(motion.clash.question)}</p>
    <div class="question-actions">
      <a href="/debate/${esc(motion.slug)}">Read both sides</a>
      <a href="${esc(motionChallengeHref(motion))}">Post this challenge <span aria-hidden="true">→</span></a>
    </div>
  </article>`;
}

function faqMarkup() {
  return `<div>
    <details><summary>Can I debate politics online here?</summary><p>Yes. Choose a political question, take a side, and start a timed round. You can argue against the AI immediately or use live matching to find another person.</p></details>
    <details><summary>Does Debatable take a political side?</summary><p>No position is assigned a platform endorsement. The judge applies the published rubric to the claims, support, responses, comparisons, and follow-through heard in the round.</p></details>
    <details><summary>Can I debate a real person?</summary><p>Yes. Post an asynchronous challenge or use casual one-on-one video. Live video requires Google on the web or Apple in the iOS app.</p></details>
    <details><summary>Do I have to argue my own opinion?</summary><p>No. Take either side. Arguing the unfamiliar case is often the fastest way to find the part of your own view that still needs work.</p></details>
  </div>`;
}

function baseHead({ title, description, canonical, image = HERO_IMAGE, type = 'website', structured }) {
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="${esc(type)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1400">
  <meta property="og:image:height" content="726">
  <meta property="og:image:alt" content="Political questions ready for a live one-on-one round on Debatable">
  <meta property="og:site_name" content="Debatable">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta name="theme-color" content="#f5f1e8">
  <link rel="icon" href="/icons/icon-192.png">
  <script defer src="/js/track.js"></script><script defer src="/js/home-magnet.js"></script>
  <script type="application/ld+json">${jsonLd(structured)}</script>
  <style>${sharedStyles()}</style>`;
}

function footer() {
  return `<footer class="footer">
    <span>© 2026 Debatable. Everyone has an opinion.</span>
    <span class="footer-links"><a href="/political-debate">Political debate</a><a href="/political-debate-topics">Political topics</a><a href="/contested">Current issues</a><a href="/debate">All questions</a><a href="/judge-integrity">Judge integrity</a><a href="/safety">Safety</a></span>
  </footer>`;
}

function renderHub() {
  const canonical = `${SITE_ORIGIN}/political-debate`;
  const title = 'Political Debate Online | Discuss Current Issues | Debatable';
  const description = 'Choose a Democratic or Republican case on a polarized political question, post it as a challenge, and meet someone willing to defend the other side.';
  const featured = FEATURED_POLITICAL_SLUGS.map(motionFor).filter(Boolean);
  const faqs = [
    ['Can I debate politics online here?', 'Yes. Choose a political question, take a side, and start a timed round against the AI or another person.'],
    ['Does Debatable take a political side?', 'No position is assigned a platform endorsement. The judge applies the published rubric to the argument made in the round.'],
    ['Can I debate a real person?', 'Yes. Post an asynchronous challenge or use casual one-on-one video. Live video requires Google on the web or Apple in the iOS app.'],
    ['Do I have to argue my own opinion?', 'No. You can take either side of a question.'],
  ];
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#page`,
        name: 'Political Debate Online',
        headline: 'Democrats versus Republicans. Pick a side.',
        description,
        url: canonical,
        image: HERO_IMAGE,
        dateModified: UPDATED,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'Debatable', url: `${SITE_ORIGIN}/` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: PARTISAN_ISSUES.length,
          itemListElement: PARTISAN_ISSUES.map((issue, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: issue.question,
            url: `${canonical}#issue-${issue.id}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Debatable', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Political debate', item: canonical },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(([name, text]) => ({
          '@type': 'Question', name,
          acceptedAnswer: { '@type': 'Answer', text },
        })),
      },
    ],
  };

  return `<!doctype html><html lang="en"><head>${baseHead({ title, description, canonical, structured })}</head>
  <body><main class="shell">
    ${topNav()}
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Democrats vs Republicans · casual 1v1</div>
        <h1>Democrats versus Republicans. Pick a side.</h1>
        <p class="lede">Choose the issue. Defend the common Democratic or Republican case. Post it to Challenges, where another person can take the other side and put both arguments on the record.</p>
        <div class="actions">
          <a class="btn red" href="#party-lines">Choose a partisan question <span class="arrow" aria-hidden="true">↓</span></a>
          <a class="btn" href="/challenges">See open challenges</a>
        </div>
        <div class="signals" aria-label="How political debates work">
          <span class="signal">Common Democratic case</span>
          <span class="signal">Common Republican case</span>
          <span class="signal">Neutral judge</span>
        </div>
      </div>
      <figure class="hero-photo photo">
        <img src="/img/politics/capitol.jpg" alt="The west front of the United States Capitol" width="1400" height="726" decoding="async">
        <div class="image-question"><div class="iq-eye">One of ${politicalSlugCount()} political questions</div><q>Should the Electoral College be abolished?</q></div>
        <a class="credit" href="https://commons.wikimedia.org/wiki/File:United_States_Capitol_-_west_front.jpg" target="_blank" rel="noopener">Architect of the Capitol, public domain</a>
      </figure>
    </section>

    ${partisanSection()}

    <section class="section" aria-labelledby="care-heading">
      <div class="section-head"><div><div class="eyebrow">Beyond the party line</div><h2 id="care-heading">Five ways into politics.</h2></div><p>Not every political argument maps cleanly onto red and blue. Browse by the institution, policy, or public question you want to test.</p></div>
      <div class="category-grid">${POLITICS_GROUPS.map(categoryCard).join('')}</div>
    </section>

    <section class="section" aria-labelledby="questions-heading">
      <div class="section-head"><div><div class="eyebrow">Ready now</div><h2 id="questions-heading">Questions with a real clash.</h2></div><p>Read the strongest case on both sides, then carry the exact question into a round.</p></div>
      <div class="question-grid">${featured.map(featuredCard).join('')}</div>
    </section>

    <section class="section" aria-labelledby="works-heading">
      <div class="section-head"><div><div class="eyebrow">How it works</div><h2 id="works-heading">One question becomes a public challenge.</h2></div><p>The party framing gets you to a sharp clash. The challenge system gets another person onto the other side.</p></div>
      <div class="steps">
        <article class="step"><div class="step-num">1</div><h3>Pick red or blue</h3><p>Choose the common Democratic or Republican case you are willing to defend.</p></article>
        <article class="step"><div class="step-num">2</div><h3>Post the challenge</h3><p>The question, both party cases, and your chosen side arrive prefilled. Sign in and put it on the board.</p></article>
        <article class="step"><div class="step-num">3</div><h3>Meet the answer</h3><p>Another person takes the open side. Both arguments go on the record, then the judge explains what won.</p></article>
      </div>
    </section>

    <section class="section">
      <div class="charter">
        <div class="charter-copy"><div class="eyebrow">Argument, not affiliation</div><h2>The judge scores what happened in the round.</h2><p>The published casual rubric looks for a clear claim, support, direct response, comparison, and follow-through. Name, accent, fluency, confidence, and apparent experience do not affect the verdict.</p><div class="actions"><a class="btn" href="/judge-integrity">Read the judging rules <span aria-hidden="true">→</span></a></div></div>
        <div class="charter-list">
          <div class="charter-item"><b>Clear claim</b><span>Say what you want the listener to believe.</span></div>
          <div class="charter-item"><b>Support</b><span>Give a reason, example, or piece of evidence.</span></div>
          <div class="charter-item"><b>Direct response</b><span>Answer the strongest point the other person made.</span></div>
          <div class="charter-item"><b>Comparison</b><span>Explain which consequence matters more and why.</span></div>
        </div>
      </div>
    </section>

    <section class="section"><div class="cta-band"><div><h2>Find the question you cannot leave alone.</h2><p>${politicalSlugCount()} political and public-policy questions, each connected to the challenge board.</p></div><a class="btn" href="/political-debate-topics">Browse political debate topics <span aria-hidden="true">→</span></a></div></section>

    <section class="section faq" aria-labelledby="faq-heading"><div><div class="eyebrow">Questions</div><h2 id="faq-heading">Before you enter.</h2></div>${faqMarkup()}</section>
    ${footer()}
  </main></body></html>`;
}

function topicCard(motion, group) {
  const haystack = `${motion.title} ${motion.category} ${motion.mainClash} ${motion.clash.question} ${group.label}`.toLowerCase();
  const challenge = motionChallengeHref(motion);
  return `<article class="topic-card" data-topic-card data-group="${esc(group.id)}" data-search="${esc(haystack)}" data-challenge="${esc(challenge)}" tabindex="-1">
    <a class="topic-main" href="/debate/${esc(motion.slug)}"><div><div class="question-eye">${esc(group.shortLabel)}</div><h3>${esc(motion.title)}</h3><p>${esc(motion.mainClash)}. ${esc(motion.clash.question)}</p></div><span class="go" aria-hidden="true">→</span></a>
    <div class="topic-actions"><a href="/debate/${esc(motion.slug)}">Read both sides</a><a href="${esc(challenge)}">Post this challenge →</a></div>
  </article>`;
}

function topicGroup(group) {
  const motions = groupMotions(group);
  return `<section class="topic-group" id="${esc(group.id)}" data-topic-group>
    <div class="group-head">
      ${photo(group, 'group-photo')}
      <div><div class="eyebrow">${motions.length} questions</div><h2>${esc(group.label)}</h2><p>${esc(group.description)}</p></div>
    </div>
    <div class="topic-list">${motions.map(motion => topicCard(motion, group)).join('')}</div>
  </section>`;
}

function topicsScript() {
  return `<script>
  (function(){
    var search=document.getElementById('topicSearch');
    var cards=Array.prototype.slice.call(document.querySelectorAll('[data-topic-card]'));
    var groups=Array.prototype.slice.call(document.querySelectorAll('[data-topic-group]'));
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
    var count=document.getElementById('topicCount');
    var pick=document.getElementById('pickTopic');
    var active='all';
    function apply(){
      var q=(search.value||'').trim().toLowerCase();
      var shown=0;
      cards.forEach(function(card){
        var okGroup=active==='all'||card.getAttribute('data-group')===active;
        var okSearch=!q||(card.getAttribute('data-search')||'').indexOf(q)>-1;
        card.hidden=!(okGroup&&okSearch);
        if(!card.hidden)shown++;
      });
      groups.forEach(function(group){
        group.hidden=!group.querySelector('[data-topic-card]:not([hidden])');
      });
      count.textContent=shown+' question'+(shown===1?'':'s')+' shown';
    }
    buttons.forEach(function(button){
      button.addEventListener('click',function(){
        active=button.getAttribute('data-filter')||'all';
        buttons.forEach(function(item){item.setAttribute('aria-pressed',item===button?'true':'false');});
        apply();
      });
    });
    search.addEventListener('input',apply);
    pick.addEventListener('click',function(){
      var visible=cards.filter(function(card){return !card.hidden;});
      if(!visible.length)return;
      var chosen=visible[Math.floor(Math.random()*visible.length)];
      location.href=chosen.getAttribute('data-challenge');
    });
    apply();
  })();
  </script>`;
}

function renderTopics() {
  const canonical = `${SITE_ORIGIN}/political-debate-topics`;
  const title = 'Political Debate Topics | Current Issues to Argue | Debatable';
  const description = `Browse ${politicalSlugCount()} political debate topics, compare common Democratic and Republican cases, choose a side, and post the question as a public challenge.`;
  const allMotions = POLITICS_GROUPS.flatMap(group => groupMotions(group));
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#page`,
        name: 'Political Debate Topics',
        description,
        url: canonical,
        image: HERO_IMAGE,
        dateModified: UPDATED,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'Debatable', url: `${SITE_ORIGIN}/` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: allMotions.length,
          itemListElement: allMotions.map((motion, index) => ({
            '@type': 'ListItem', position: index + 1, name: motion.title,
            url: `${SITE_ORIGIN}/debate/${motion.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Debatable', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Political debate', item: `${SITE_ORIGIN}/political-debate` },
          { '@type': 'ListItem', position: 3, name: 'Political debate topics', item: canonical },
        ],
      },
    ],
  };

  return `<!doctype html><html lang="en"><head>${baseHead({ title, description, canonical, structured })}</head>
  <body><main class="shell">
    ${topNav()}
    <section class="topics-hero">
      <div><div class="eyebrow">Political debate topics</div><h1>Political questions with two real sides.</h1><p class="lede">Start with the Democratic versus Republican fault lines, or browse ${politicalSlugCount()} questions across public life. Choose a side and the question opens in Challenges, ready to post.</p></div>
      <figure class="topics-photo photo"><img src="/img/politics/ballot.jpg" alt="A secure ballot drop box outside a public library" width="675" height="900" decoding="async"><a class="credit" href="https://commons.wikimedia.org/wiki/File:Ballot_Box.jpg" target="_blank" rel="noopener">Kelson Vibber, CC0</a></figure>
    </section>

    ${partisanSection()}

    <div class="guide" aria-label="Filter political debate topics">
      <div class="guide-in">
        <label><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search political questions</span><input class="search" id="topicSearch" type="search" placeholder="Search voting, privacy, wages, health care…" autocomplete="off"></label>
        <div class="filters" role="group" aria-label="Topic category">
          <button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>
          ${POLITICS_GROUPS.map(group => `<button class="filter" type="button" data-filter="${esc(group.id)}" aria-pressed="false">${esc(group.shortLabel)}</button>`).join('')}
        </div>
      </div>
      <div class="result-line"><span id="topicCount" aria-live="polite">${politicalSlugCount()} questions shown</span><button class="pick" id="pickTopic" type="button">Pick one and challenge</button></div>
    </div>

    ${POLITICS_GROUPS.map(topicGroup).join('')}
    <section class="section"><div class="cta-band"><div><h2>Stop browsing when one gets under your skin.</h2><p>Post it, defend your side, and make room for someone who thinks you are wrong.</p></div><a class="btn" href="/challenges">See open challenges <span aria-hidden="true">→</span></a></div></section>
    ${footer()}
  </main>${topicsScript()}</body></html>`;
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default async function handler(request) {
  const mode = modeFromUrl(request.url);
  if (!mode) return notFound();
  const html = mode === 'topics' ? renderTopics() : renderHub();
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

export const config = {
  path: ['/api/political-debate', '/api/political-debate/*'],
};
