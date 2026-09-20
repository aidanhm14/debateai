
// FAQ accordion
document.querySelectorAll('.faq-q').forEach(function(b){b.addEventListener('click',function(e){var i=b.closest('.faq-item');if(i.classList.contains('faq-item--big')||i.classList.contains('faq-item--wide')){e.preventDefault();return;}var o=i.classList.contains('open');document.querySelectorAll('.faq-item.open').forEach(function(x){x.classList.remove('open')});if(!o)i.classList.add('open')})});

// Theme switcher. Mirrors the chosen theme onto the body class so
// shared ui.css (which uses body.light-theme / body.crimson-theme
// for token overrides) picks up the change too. Without this the
// page-level [data-theme] vars get clobbered by ui.css's body-level
// :root,body defaults — that's why early light mode looked broken.
function applyThemeClasses(t){
  document.documentElement.setAttribute('data-theme',t);
  var b=document.body;
  if (!b) return;
  b.classList.remove('light-theme','crimson-theme','grey-theme');
  if (t==='light') b.classList.add('light-theme');
  else if (t==='crimson') b.classList.add('crimson-theme');
  else if (t==='grey') b.classList.add('grey-theme');
}
// Theme-dot click handlers — skipped entirely when the page is locked.
// The dots are hidden via CSS in the locked case anyway, but the no-op
// guard keeps us safe if a stale handler somewhere tries to fire.
if (!window.daLockTheme) {
  document.querySelectorAll('.theme-dot').forEach(function(dot){
    dot.addEventListener('click',function(){
      var t=dot.getAttribute('data-t');
      var prev=document.documentElement.getAttribute('data-theme')||'';
      try{localStorage.setItem('da-theme',t)}catch(e){}
      // Force a full reload on theme change so token cascade, ui.css
      // body-class rebinds, and any per-section style block all settle
      // from a clean slate. Without this, switching grey ↔ light could
      // leave half-flipped text/card colors in sections that scope
      // their own <style> blocks (e.g. /current-topics).
      if (prev !== t) {
        applyThemeClasses(t);
        window.location.reload();
        return;
      }
      applyThemeClasses(t);
      document.querySelectorAll('.theme-dot').forEach(function(d){d.classList.remove('active')});
      dot.classList.add('active');
    });
  });
}
// Restore saved theme — UNLESS this page is theme-locked (landing is, see
// the early-paint script in <head>). The lock keeps the page in crimson
// regardless of the user's global preference, because the orb + casual
// chat panel + sparring CTAs were designed only for the crimson tokens.
// We deliberately don't touch localStorage here so other pages
// (/leaderboard, /community, etc.) stay user-controlled.
try{
  if (window.daLockTheme){
    applyThemeClasses(window.daLockTheme);
  } else {
    var saved=localStorage.getItem('da-theme');
    if(!saved || saved==='day') {
      saved='light';
      try{localStorage.setItem('da-theme',saved);}catch(e){}
    }
    applyThemeClasses(saved);
    document.querySelectorAll('.theme-dot').forEach(function(d){
      d.classList.toggle('active',d.getAttribute('data-t')===saved);
    });
  }
}catch(e){}

// Hero topic ticker. fades through debate motions to advertise breadth.
(function(){
  var box=document.getElementById('heroTimerTopics');
  if(!box)return;
  var topics=box.querySelectorAll('.hero-timer-topic');
  if(!topics.length)return;
  var i=0;
  setInterval(function(){
    if(document.hidden)return; // no DOM churn in a backgrounded tab
    topics[i].classList.remove('active');
    i=(i+1)%topics.length;
    topics[i].classList.add('active');
  },2800);
})();

// ── Scroll-triggered audio: removed entirely (2026-05-13). ─────────
// Prior versions fired audio on every section boundary as the user
// scrolled — first as arpeggios (success/send/receive/confirm), then
// as a "smooth" ambient pad. Both were wrong for the same root
// reason: scroll is not consent for audio. A marketing landing fires
// sound at people who are reading, often with headphones in another
// app, often in quiet rooms (class, library, office, public space).
// "Smooth and tasteful" doesn't fix the consent problem.
//
// Audio still fires for user-initiated actions inside the page (CTA
// click chimes, the voice-orb tap demo). Those are deliberate gestures
// where acoustic feedback is expected. The SFX mute toggle in the
// topbar remains for users who want even those silenced.
//
// Reference for future contributors: Apple, Stripe, Linear, OpenAI,
// Anthropic — every major product landing is silent by default. The
// market has decided this question; don't relitigate it per release.
// If a future contributor wants section-boundary audio back, it MUST
// be opt-in (separate toggle defaulting to off), not opt-out via the
// global SFX mute.

// Hero audio-timer live countdown. loops 7:11 → 0:00 → resets. Pure theatre.
(function(){
  var el=document.getElementById('heroTimerReadout');
  if(!el)return;
  var total=7*60+11;
  function tick(){
    if(document.hidden)return; // pure theatre; no need to tick a hidden tab
    var m=Math.floor(total/60),s=total%60;
    el.textContent=m+':'+(s<10?'0':'')+s;
    total--;
    if(total<0)total=7*60+11;
  }
  tick();
  setInterval(tick,1000);
})();

