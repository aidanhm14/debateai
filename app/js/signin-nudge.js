/* signin-nudge.js
 *
 * Site-wide Google sign-in reminder. Slides up from bottom-right after
 * the user shows engagement on any page (scroll past 40%, 30s elapsed,
 * or exit-intent). Hides itself permanently if dismissed and stays
 * dismissed for the rest of the session. Auto-hides on successful
 * sign-in.
 *
 * Skips entirely when:
 *   - Firebase isn't loaded
 *   - User is already signed in
 *   - User has dismissed it this session (sessionStorage)
 *   - User has dismissed it permanently (localStorage flag)
 *   - Page sets `window.daSkipSignInNudge = true` (e.g. /debate-ai which
 *     has its own SignUpNudgeModal flow)
 *
 * Delegates the actual sign-in to the existing #googleSignupBtn on the
 * page if one is wired up; otherwise falls back to a direct
 * firebase.auth().signInWithPopup call.
 */
(function(){
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.daSkipSignInNudge === true) return;
  if (window.__daSignInNudgeBooted) return;
  window.__daSignInNudgeBooted = true;

  var SESSION_DISMISS_KEY = 'da-signin-nudge-dismissed';
  var PERMANENT_DISMISS_KEY = 'da-signin-nudge-perma-dismissed';
  var SCROLL_THRESHOLD = 0.40;
  var TIME_THRESHOLD_MS = 30 * 1000;

  function safeRead(storage, key){
    try { return storage.getItem(key); } catch(e){ return null; }
  }
  function safeWrite(storage, key, val){
    try { storage.setItem(key, val); } catch(e){}
  }

  // Honor a permanent dismiss across sessions; if the user has clicked
  // "Not now" twice across different sessions we stop showing it.
  if (safeRead(window.localStorage, PERMANENT_DISMISS_KEY) === '1') return;
  if (safeRead(window.sessionStorage, SESSION_DISMISS_KEY) === '1') return;

  // Wait for the DOM ready; the nudge needs to attach to <body>.
  function onReady(fn){
    if (document.readyState === 'complete' || document.readyState === 'interactive'){
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn, {once:true});
    }
  }

  onReady(function(){
    var signedIn = false;
    var shown = false;
    var dismissed = false;
    var rootEl = null;
    var pageStartedAt = Date.now();

    function waitForFirebase(cb){
      if (typeof window.firebase !== 'undefined' && window.firebase.auth){
        cb();
        return;
      }
      var tries = 0;
      var iv = setInterval(function(){
        tries += 1;
        if (typeof window.firebase !== 'undefined' && window.firebase.auth){
          clearInterval(iv);
          cb();
        } else if (tries > 40){
          // ~10s without Firebase — page likely doesn't include it, so
          // there's no point showing a sign-in nudge here. Bail out.
          clearInterval(iv);
        }
      }, 250);
    }

    waitForFirebase(function(){
      try {
        window.firebase.auth().onAuthStateChanged(function(u){
          if (u){
            signedIn = true;
            // If we already showed the nudge before they signed in
            // (e.g. another tab), retract it.
            if (rootEl){ retract(); }
          } else {
            signedIn = false;
          }
        });
      } catch(e){}
    });

    function buildNudge(){
      if (rootEl) return rootEl;
      var root = document.createElement('div');
      root.className = 'da-signin-nudge';
      root.setAttribute('role', 'complementary');
      root.setAttribute('aria-label', 'Sign in with Google');
      root.style.cssText = [
        'position:fixed',
        'right:20px',
        'bottom:20px',
        'z-index:9999',
        'max-width:340px',
        'background:var(--bg-elev,#fff)',
        'color:var(--text,#1a1a1f)',
        'border:1px solid var(--border,rgba(0,0,0,.10))',
        'border-radius:14px',
        'box-shadow:0 18px 44px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.06)',
        'padding:18px 18px 16px',
        'font-family:inherit',
        'transform:translateY(24px)',
        'opacity:0',
        'transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .25s ease',
        'pointer-events:none'
      ].join(';');

      var dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.setAttribute('aria-label', 'Dismiss');
      dismissBtn.innerHTML = '✕';
      dismissBtn.style.cssText = [
        'position:absolute',
        'top:8px',
        'right:8px',
        'width:26px',
        'height:26px',
        'border-radius:50%',
        'border:none',
        'background:transparent',
        'color:var(--text-ghost,rgba(0,0,0,.45))',
        'font-size:14px',
        'cursor:pointer',
        'line-height:1',
        'transition:background .15s,color .15s'
      ].join(';');
      dismissBtn.addEventListener('mouseenter', function(){
        dismissBtn.style.background = 'rgba(0,0,0,.06)';
        dismissBtn.style.color = 'var(--text,#1a1a1f)';
      });
      dismissBtn.addEventListener('mouseleave', function(){
        dismissBtn.style.background = 'transparent';
        dismissBtn.style.color = 'var(--text-ghost,rgba(0,0,0,.45))';
      });
      dismissBtn.addEventListener('click', dismissSession);

      var eyebrow = document.createElement('div');
      eyebrow.textContent = 'Save your rounds';
      eyebrow.style.cssText = [
        'font-size:.62rem',
        'font-weight:800',
        'letter-spacing:.16em',
        'text-transform:uppercase',
        'color:var(--accent,#ef4444)',
        'margin-bottom:8px'
      ].join(';');

      var title = document.createElement('div');
      title.textContent = 'One click. No card. Your debate style follows you across devices.';
      title.style.cssText = [
        'font-size:.92rem',
        'line-height:1.4',
        'font-weight:600',
        'color:var(--text,#1a1a1f)',
        'margin-bottom:14px',
        'padding-right:18px'
      ].join(';');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'da-signin-nudge-cta';
      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'gap:10px',
        'width:100%',
        'padding:11px 14px',
        'background:#fff',
        'color:#1a1a1f',
        'border:1px solid rgba(0,0,0,.12)',
        'border-radius:10px',
        'font-family:inherit',
        'font-size:.86rem',
        'font-weight:700',
        'cursor:pointer',
        'transition:border-color .15s,box-shadow .15s,transform .1s'
      ].join(';');
      // Multi-color Google G glyph (re-used pattern across the site).
      btn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">' +
        '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.12-.84 2.07-1.79 2.71v2.26h2.9c1.69-1.56 2.67-3.86 2.67-6.61z"/>' +
        '<path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.83.85-3.06.85-2.35 0-4.34-1.59-5.05-3.72H.96v2.33C2.43 15.98 5.48 18 9 18z"/>' +
        '<path fill="#FBBC05" d="M3.95 10.69c-.18-.54-.28-1.12-.28-1.71s.1-1.17.28-1.71V4.94H.96A8.99 8.99 0 0 0 0 8.98c0 1.45.35 2.83.96 4.04l2.99-2.33z"/>' +
        '<path fill="#EA4335" d="M9 3.55c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.86 11.43 0 9 0 5.48 0 2.43 2.02.96 4.94l2.99 2.33C4.66 5.15 6.65 3.55 9 3.55z"/>' +
        '</svg>' +
        '<span>Continue with Google</span>';
      btn.addEventListener('mouseenter', function(){
        btn.style.borderColor = 'rgba(0,0,0,.28)';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,.06)';
      });
      btn.addEventListener('mouseleave', function(){
        btn.style.borderColor = 'rgba(0,0,0,.12)';
        btn.style.boxShadow = 'none';
      });
      btn.addEventListener('click', trigger);

      var notNow = document.createElement('button');
      notNow.type = 'button';
      notNow.textContent = 'Not now';
      notNow.style.cssText = [
        'display:block',
        'margin-top:10px',
        'width:100%',
        'background:transparent',
        'border:none',
        'color:var(--text-dim,rgba(0,0,0,.6))',
        'font-family:inherit',
        'font-size:.72rem',
        'cursor:pointer',
        'padding:6px 0'
      ].join(';');
      notNow.addEventListener('click', dismissPermanent);

      root.appendChild(dismissBtn);
      root.appendChild(eyebrow);
      root.appendChild(title);
      root.appendChild(btn);
      root.appendChild(notNow);
      document.body.appendChild(root);
      rootEl = root;

      // ESC anywhere on the page dismisses for the session.
      document.addEventListener('keydown', escHandler);

      return root;
    }

    function escHandler(e){
      if (e.key === 'Escape' && rootEl){ dismissSession(); }
    }

    function show(){
      if (shown || dismissed || signedIn) return;
      shown = true;
      var root = buildNudge();
      // Force layout, then animate. setTimeout is more reliable than rAF
      // when the page is throttled (background tab, headless eval, etc).
      // eslint-disable-next-line no-unused-expressions
      root.offsetHeight;
      setTimeout(function(){
        root.style.transform = 'translateY(0)';
        root.style.opacity = '1';
        root.style.pointerEvents = 'auto';
      }, 16);
      // Track impression (best-effort).
      try {
        if (window.track && typeof window.track === 'function'){
          window.track('signin_nudge_impression', { source: location.pathname });
        }
      } catch(_){}
    }

    function retract(){
      if (!rootEl) return;
      rootEl.style.transform = 'translateY(24px)';
      rootEl.style.opacity = '0';
      rootEl.style.pointerEvents = 'none';
      setTimeout(function(){
        if (rootEl && rootEl.parentNode){
          rootEl.parentNode.removeChild(rootEl);
        }
        rootEl = null;
      }, 300);
      document.removeEventListener('keydown', escHandler);
    }

    function dismissSession(){
      dismissed = true;
      safeWrite(window.sessionStorage, SESSION_DISMISS_KEY, '1');
      try {
        if (window.track && typeof window.track === 'function'){
          window.track('signin_nudge_dismiss', { kind:'session', source: location.pathname });
        }
      } catch(_){}
      retract();
    }

    function dismissPermanent(){
      dismissed = true;
      // Track "Not now" across sessions — second time we hit it from a
      // fresh session, set the perma flag so we stop pestering them.
      var prev = safeRead(window.localStorage, PERMANENT_DISMISS_KEY) || '0';
      if (prev === 'soft'){
        safeWrite(window.localStorage, PERMANENT_DISMISS_KEY, '1');
      } else {
        safeWrite(window.localStorage, PERMANENT_DISMISS_KEY, 'soft');
      }
      safeWrite(window.sessionStorage, SESSION_DISMISS_KEY, '1');
      try {
        if (window.track && typeof window.track === 'function'){
          window.track('signin_nudge_dismiss', { kind:'not_now', source: location.pathname });
        }
      } catch(_){}
      retract();
    }

    function trigger(){
      try {
        if (window.track && typeof window.track === 'function'){
          window.track('signin_nudge_cta_click', { source: location.pathname });
        }
      } catch(_){}
      // Prefer delegating to the page's existing #googleSignupBtn so it
      // shares the success/error analytics + post-sign-in routing the
      // page already wired up.
      var pageBtn = document.getElementById('googleSignupBtn');
      if (pageBtn){
        try { pageBtn.click(); retract(); return; } catch(_){}
      }
      // Fallback: direct firebase signInWithPopup.
      try {
        var auth = window.firebase && window.firebase.auth && window.firebase.auth();
        if (!auth){ return; }
        var provider = new window.firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function(){
          retract();
        }).catch(function(){ /* user closed popup, etc. — keep nudge open */ });
      } catch(e){}
    }

    // Trigger 1: scroll past 40% of page height.
    var scrollScheduled = false;
    function onScroll(){
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(function(){
        scrollScheduled = false;
        if (shown || dismissed || signedIn) return;
        var doc = document.documentElement;
        var max = (doc.scrollHeight - doc.clientHeight) || 1;
        var ratio = (window.scrollY || doc.scrollTop || 0) / max;
        if (ratio >= SCROLL_THRESHOLD){
          show();
        }
      });
    }
    window.addEventListener('scroll', onScroll, {passive:true});

    // Trigger 2: time on page (the user lingered, didn't bounce).
    setTimeout(function(){
      if (shown || dismissed || signedIn) return;
      // Require at least *some* scroll so we don't pop on a stationary
      // SEO crawler / accessibility scan / dev tab left open in a
      // background window.
      if ((window.scrollY || 0) > 50){ show(); }
    }, TIME_THRESHOLD_MS);

    // Trigger 3: exit-intent (mouse leaves the viewport via the top
    // edge — classic signal the user is heading for the URL bar /
    // tab strip / closing). Suppressed on touch devices where there's
    // no equivalent gesture.
    if (window.matchMedia && !window.matchMedia('(hover: hover)').matches){
      // touch device, skip
    } else {
      document.addEventListener('mouseout', function(e){
        if (shown || dismissed || signedIn) return;
        if (!e.relatedTarget && e.clientY <= 0){
          show();
        }
      });
    }
  });
})();
