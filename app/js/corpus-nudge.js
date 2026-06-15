/* ──────────────────────────────────────────────────────────────────
   One-time research-corpus opt-in nudge.

   Fires after the user has rated 3+ AI rounds (typed or voice), if and
   only if they haven't already opted in via the profile toggle and
   haven't dismissed the nudge before.

   Drop <script defer src="/js/corpus-nudge.js"></script> on any page
   where rating happens (index.html, voice-debate.html). The script:

     1. Exposes window.bumpRatedCount() for the rate signal call site
        to call after a successful rate. Increments a localStorage
        counter; if the count crosses the threshold, maybeShow() runs.
     2. Suppresses itself if the user is anonymous, already opted in,
        or already saw + dismissed the nudge.
     3. Mounts a centered modal with three actions: opt in (writes
        users/{uid}.contributeToCorpus + localStorage mirror), not now
        (sets dismissed=1, leaves contribute=0), learn more (opens
        /privacy#corpus in a new tab and dismisses).

   Dismissal is sticky (no TTL) — this isn't a re-nag prompt. The user
   can always flip the toggle back on in /profile if they change their
   mind.
   ────────────────────────────────────────────────────────────── */
(function(){
  if (window.__debateaiCorpusNudge) return;
  window.__debateaiCorpusNudge = true;

  var SHOWN_KEY    = 'debateos-corpus-nudge-shown';
  var COUNT_KEY    = 'debateos-rated-count';
  var CONSENT_KEY  = 'debateos-corpus-contribute';
  var THRESHOLD    = 3;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function alreadyOptedIn(){ return get(CONSENT_KEY) === '1'; }
  function alreadyDismissed(){ return get(SHOWN_KEY) === '1'; }
  function ratedCount(){ var n = parseInt(get(COUNT_KEY) || '0', 10); return isFinite(n) ? n : 0; }

  // Called from the rating signal site (index.html captureTurn rate
  // path + voice-debate.html postRate). Each successful rate signal
  // bumps the counter once.
  window.bumpRatedCount = function(){
    if (alreadyOptedIn() || alreadyDismissed()) return;
    var n = ratedCount() + 1;
    set(COUNT_KEY, String(n));
    if (n >= THRESHOLD) maybeShow();
  };

  // Also expose a manual trigger for the rare case a page wants to
  // force the prompt (e.g. a "tell me about the research corpus" link).
  window.showCorpusNudge = maybeShow;

  function isSignedIn(){
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return false;
      return !!firebase.auth().currentUser;
    } catch (e) { return false; }
  }

  var mounted = false;
  function maybeShow(){
    if (mounted || alreadyOptedIn() || alreadyDismissed()) return;
    if (!isSignedIn()) {
      // Anonymous users can't write to user_profiles; skip silently.
      // The next rate after sign-in will re-trigger.
      return;
    }
    mount();
  }

  function close(persistDismissed){
    if (persistDismissed) set(SHOWN_KEY, '1');
    var root = document.getElementById('corpusNudgeRoot');
    if (root && root.parentNode) root.parentNode.removeChild(root);
    mounted = false;
  }

  function optIn(){
    set(CONSENT_KEY, '1');
    set(SHOWN_KEY, '1');
    try {
      var user = firebase.auth().currentUser;
      if (user && firebase.firestore) {
        firebase.firestore().collection('user_profiles').doc(user.uid).set({
          contributeToCorpus: true,
          contributeToCorpusUpdatedAt: new Date(),
        }, { merge: true }).catch(function(e){ console.warn('[corpus-nudge] save failed:', e && e.message); });
      }
    } catch (e) { console.warn('[corpus-nudge] firestore write skipped:', e.message); }
    // Visual confirmation: swap modal content to a thank-you for 2s
    // then close. Keeps the moment of consent from feeling like a
    // disappear-on-click.
    var body = document.getElementById('corpusNudgeBody');
    var btns = document.getElementById('corpusNudgeBtns');
    if (body) body.innerHTML = '<div style="font-size:1.4rem;font-weight:800;margin-bottom:8px">Thanks.</div><div>Your future rounds are now part of the licensable corpus. Toggle off any time in profile settings.</div>';
    if (btns) btns.innerHTML = '';
    setTimeout(function(){ close(true); }, 2400);
  }

  function mount(){
    mounted = true;
    var root = document.createElement('div');
    root.id = 'corpusNudgeRoot';
    root.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:Crimson Pro,Inter,-apple-system,sans-serif;animation:corpusFadeIn .18s ease-out';

    root.innerHTML = ''
      + '<style>'
      + '@keyframes corpusFadeIn{from{opacity:0}to{opacity:1}}'
      + '@keyframes corpusSlideUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}'
      + '#corpusNudgeCard{animation:corpusSlideUp .22s ease-out}'
      + '#corpusNudgeCard .cb{cursor:pointer;border:none;font:inherit;transition:filter .15s,transform .1s}'
      + '#corpusNudgeCard .cb:active{transform:translateY(1px)}'
      + '#corpusNudgeCard .cb.primary{background:#ef4444;color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;font-size:.95rem}'
      + '#corpusNudgeCard .cb.primary:hover{filter:brightness(1.08)}'
      + '#corpusNudgeCard .cb.ghost{background:transparent;color:rgba(247,245,238,.62);padding:12px 16px;font-size:.9rem;font-weight:500}'
      + '#corpusNudgeCard .cb.ghost:hover{color:#fff}'
      + '#corpusNudgeCard a.cb{display:inline-block;text-decoration:none}'
      + '</style>'
      + '<div id="corpusNudgeCard" role="dialog" aria-modal="true" aria-labelledby="corpusNudgeTitle" style="background:#1a0808;color:#f7f5ee;border:1px solid rgba(239,68,68,.25);border-radius:18px;padding:32px 30px;max-width:520px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.6)">'
      +   '<div style="font-size:.72rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ef4444;margin-bottom:10px">A quick ask</div>'
      +   '<h2 id="corpusNudgeTitle" style="font-family:Georgia,serif;font-size:1.7rem;line-height:1.15;font-weight:700;margin:0 0 14px;letter-spacing:-.01em">Help train better AIs?</h2>'
      +   '<div id="corpusNudgeBody" style="color:rgba(247,245,238,.78);font-size:.98rem;line-height:1.55">'
      +     '<p style="margin:0 0 10px">You\'ve rated a few rounds now. The rounds you\'re generating here are exactly the data AI research orgs are looking for: structured, format-aware, judge-graded argumentative speech that they can\'t get from reddit or podcasts.</p>'
      +     '<p style="margin:0 0 10px">If you opt in, your <strong>future</strong> rounds (typed and voice) become part of an anonymized corpus we may license to those research orgs. Anonymized means stripped of name, email, account id. Past rounds are never affected. Off by default. Toggle off any time in profile settings.</p>'
      +   '</div>'
      +   '<div id="corpusNudgeBtns" style="margin-top:22px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end">'
      +     '<a href="/privacy#corpus" target="_blank" rel="noopener" class="cb ghost" id="corpusNudgeLearn">Read terms</a>'
      +     '<button class="cb ghost" id="corpusNudgeLater">Not now</button>'
      +     '<button class="cb primary" id="corpusNudgeYes">Yes, count me in</button>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(root);

    document.getElementById('corpusNudgeYes').addEventListener('click', optIn);
    document.getElementById('corpusNudgeLater').addEventListener('click', function(){ close(true); });
    document.getElementById('corpusNudgeLearn').addEventListener('click', function(){
      // Dismiss when they go read the terms — if they come back wanting
      // to opt in, the profile toggle is the right surface.
      close(true);
    });
    // Backdrop click = "not now" (same as the button).
    root.addEventListener('click', function(e){
      if (e.target === root) close(true);
    });
  }

  // If a user navigates to a page when they're already past the
  // threshold (e.g. they rated on /app then opened /voice-debate),
  // try to show on auth state changing to signed-in. Wrap in a
  // listener so it doesn't fight with the host page's auth setup.
  function attachAuthListener(){
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      firebase.auth().onAuthStateChanged(function(user){
        if (user && ratedCount() >= THRESHOLD) maybeShow();
      });
    } catch (e) { /* host page handles its own auth */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAuthListener);
  } else {
    attachAuthListener();
  }
})();
