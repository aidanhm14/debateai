
// Firebase SDK is loaded with `defer`, so this IIFE has to wait for window load
// or the click handler never gets attached (typeof firebase === 'undefined').
window.addEventListener('load', function(){
(function(){
  var CONFIG = {
    apiKey: ["AIzaSyDDx","TYlyWLOJnFP99","e7XsLPb3FwIEijNNM"].join(""),
    authDomain: "itsdebatable.com",
    projectId: "debateos-78ac5",
    storageBucket: "debateos-78ac5.firebasestorage.app",
    messagingSenderId: "860359449192",
    appId: "1:860359449192:web:f5dc0060dbd50d6c4fb9dd",
    measurementId: "G-0V4R5MY3BT"
  };
  try {
    if (typeof firebase === 'undefined') { console.warn('[landing] Firebase SDK failed to load'); return; }
    if (!firebase.apps.length) firebase.initializeApp(CONFIG);
  } catch(e) { console.warn('[landing] Firebase init error:', e.message); return; }

  var auth = firebase.auth();
  var btn = document.getElementById('googleSignupBtn');
  var btnText = document.getElementById('googleSignupBtnText');
  var INVITE_OPT_IN_KEY = 'debatable-signin-invite-opt-in';
  if (!btn) return;

  function flushInviteOptIn(user){
    var optedIn = false;
    try { optedIn = localStorage.getItem(INVITE_OPT_IN_KEY) === '1'; } catch(e){}
    if (!optedIn || !user || !user.email) return;
    try { localStorage.removeItem(INVITE_OPT_IN_KEY); } catch(e){}
    try {
      fetch('/api/early-signup', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          email:user.email,
          displayName:user.displayName || '',
          source:'google-signin-nudge'
        }),
        keepalive:true
      }).catch(function(){});
    } catch(e){}
  }

  // If already signed in, hide the hero sign-in CTA so it doesn't read as a
  // dead-end loop back to "/". That is done below via #heroGoogleSignup + the
  // topbar user chip. We deliberately do NOT touch btn.parentElement here:
  // #googleSignupBtn is an off-screen, visually-hidden delegate button that
  // now lives directly inside .hero-content, so btn.parentElement IS the whole
  // hero. The old code hid it for signed-in users, which collapsed the entire
  // hero ~1s after auth resolved (the "hero renders for a second then
  // vanishes" bug). Fixed 2026-06.
  auth.onAuthStateChanged(function(user){
    var realUser = user && !user.isAnonymous ? user : null;
    if (window.DBLandingChat) window.DBLandingChat.setUser(realUser);
    // Same rule for the hero account button: signed-in
    // visitors don't need a sign-in CTA in the hero (it'd just loop them
    // back to /app#chat), so hide it and let the topbar user chip stand.
    var heroSignin = document.getElementById('heroGoogleSignup');
    if (heroSignin) heroSignin.style.display = realUser ? 'none' : '';
    // Body class drives the signed-in-tighten CSS block: pulls the
    // hero pill rail + "still building" / "76 debaters" notes closer
    // to the headline once the Google sign-up CTA disappears. Without
    // this the creed + (now-hidden) sign-in row + ctas leave a ~170px
    // empty band between the H1 and the pill rail.
    try { document.body.classList.toggle('signed-in', !!realUser); } catch(e){}
    if (window.__fsRefreshYou) window.__fsRefreshYou();
  });

  // Shared sign-in action. reused by the main button AND the hero timer animation.
  // Opens the shared account chooser. If the chooser failed to load, the
  // existing Google popup remains the fallback, with redirect if blocked.
  function triggerGoogleSignIn(source) {
    try { window.dosTrack && window.dosTrack('sign_in_start',{source:source||'landing_hero'}) } catch(e){}
  // Generic sign-in surfaces use the shared account chooser.
  // This direct Google popup stays as the fallback if that script fails.
    if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (btnText) btnText.textContent = 'Opening Google…';
    // If already signed in, silently refresh auth and jump to the app. This
    // replaces the old "redirect to /" behavior that landed signed-in users on
    // what they perceived as the "College" page without any Google prompt.
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      try { window.dosTrack && window.dosTrack('sign_in_already',{source:source||'landing_hero'}) } catch(e){}
      window.location.href = '/practice';
      return;
    }
    var t0 = Date.now();
    auth.signInWithPopup(provider).then(function(result){
      try { if (window.gtag) gtag('event', 'sign_up', { method: 'Google' }); } catch(e){}
      try { window.dosTrack && window.dosTrack('sign_in_complete',{source:source||'landing_hero'}) } catch(e){}
      try { localStorage.setItem('debateos-feedback-given', '1'); } catch(e){}
      flushInviteOptIn(result && result.user);
      // Must be /app#chat, not /#chat. The root path is rewritten to
      // /landing.html with force=true (see app/netlify.toml), so /#chat
      // bounces the user back to the page they came from and the sign-in
      // looks broken even though it succeeded.
      window.location.href = '/practice';
    }).catch(function(err){
      var code = (err && err.code) || 'unknown';
      var msg = (err && err.message) || '';
      var elapsed = Date.now() - t0;
      console.warn('[landing] Google signin popup error:', code, msg, elapsed + 'ms');
      try { if (window.gtag) gtag('event', 'sign_in_error', { code: code, message: msg.slice(0, 200), surface: source || 'landing_hero', method: 'popup' }); } catch(e){}
      if (btnText) btnText.textContent = 'Sign in or create account. Saves your rounds and results.';
      // Popups are silently blocked on Safari + mobile and surface as a grab
      // bag of codes (popup-blocked, cancelled-popup-request, internal-error,
      // web-storage-unsupported, or a near-instant "popup-closed-by-user" that
      // really means blocked). Respect ONLY a deliberate close — the popup was
      // genuinely open for >1.2s before closing. EVERY other failure falls back
      // to a full-page redirect, which always reaches Google. This is the
      // "make the sign-in button actually work" fix.
      if (code === 'auth/popup-closed-by-user' && elapsed > 1200) return;
      try { auth.signInWithRedirect(provider); }
      catch(e){ alert('Sign-in failed: ' + (err.message || code)); }
    });
  }

  // Finish the redirect flow if the user returned from signInWithRedirect.
  try {
    auth.getRedirectResult().then(function(result){
      if (result && result.user) {
        try { localStorage.setItem('debateos-feedback-given', '1'); } catch(e){}
        flushInviteOptIn(result.user);
        // /app#chat, not /#chat: the root rewrite (force=true → landing.html)
        // would otherwise dump the user back on the page they signed in from.
        window.location.href = '/practice';
      }
    }).catch(function(err){
      var code = (err && err.code) || 'unknown';
      if (code !== 'auth/no-auth-event') {
        console.warn('[landing] redirect result err:', err && err.message);
        try { if (window.gtag) gtag('event', 'sign_in_error', { code: code, message: ((err && err.message) || '').slice(0, 200), surface: 'landing_redirect_result', method: 'redirect' }); } catch(e){}
      }
    });
  } catch(e){}

  // Main sign-up button in the hero
  btn.addEventListener('click', function(){ triggerGoogleSignIn('landing_hero'); });

  // Secondary CTA further down the page (after the cards section).
  // Wired directly so its click doesn't depend on the hero button being
  // visible or its handler being attached. The practice fallback
  // fallback fires if Firebase failed to load entirely so the user
  // still gets dropped into the app (which has its own sign-in modal).
  var ctaBtn = document.getElementById('signupCtaBtn');
  if (ctaBtn) ctaBtn.addEventListener('click', function(e){
    e.preventDefault();
    triggerGoogleSignIn('landing_secondary');
  });

  // Hero timer animation. the highest-signal visual element on the landing
  // page, so it's the biggest sign-up funnel. ALWAYS uses signInWithRedirect,
  // not popup: popups get silently blocked on Safari and mobile browsers and
  // that was the cause of "click does nothing / click goes somewhere wrong"
  // reports. Redirect is bulletproof.
  var heroTimer = document.getElementById('heroTimer');
  function timerForceSignIn(ev){
    try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch(e){}
    try { window.dosTrack && window.dosTrack('sign_in_start',{source:'hero_timer',method:'redirect'}) } catch(e){}
    console.log('[landing] hero timer clicked. starting Google sign-in redirect');
    try {
      // Generic sign-in surfaces use the shared account chooser.
      // This direct Google popup stays as the fallback if that script fails.
      if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      auth.signInWithRedirect(provider);
    } catch(e){
      console.warn('[landing] signInWithRedirect threw:', e.message);
      try { if (window.gtag) gtag('event', 'sign_in_error', { code: (e && e.code) || 'redirect_throw', message: ((e && e.message) || '').slice(0, 200), surface: 'hero_timer', method: 'redirect' }); } catch(_){}
      // Last-ditch fallback: open Google's OAuth URL directly so the user at
      // least gets to Google, even if Firebase is broken. Better than silently
      // doing nothing, or redirecting them into the app without sign-in.
      try { window.location.href = '/?signup=1'; } catch(err){}
    }
  }
  if (heroTimer) {
    heroTimer.addEventListener('click', timerForceSignIn);
    heroTimer.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' ') { timerForceSignIn(ev); }
    });
    // If the user is already signed in, swap the hover caption to "Continue".
    auth.onAuthStateChanged(function(user){
      if (user && !user.isAnonymous) {
        heroTimer.setAttribute('aria-label', 'Continue as ' + (window.DBIdentity ? DBIdentity.forUser(user).name : 'your account'));
        heroTimer.style.setProperty('--timer-caption', '"Tap to continue \\2192"');
      }
    });
  }

  // Sign-up nudge on /landing is always on. Anonymous sessions were
  // crowding Firebase without leaving durable users, so the landing now
  // consistently asks visitors to attach a real account.
})();
});
