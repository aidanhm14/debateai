/* ──────────────────────────────────────────────────────────────────
   Transcript capture consent.

   Asked ONCE, before the first voice round on any surface, and nothing
   is stored until it is answered. Default is no capture: an unanswered
   prompt and a dismissed prompt both mean "do not store."

   This is deliberately SEPARATE from the research-corpus opt-in in
   corpus-nudge.js. They are different asks and conflating them would
   make both dishonest:

     transcriptCapture  store this person's own rounds so their ballot,
                        their history and their progress survive the tab
                        closing. The data stays theirs.
     corpusContribute   let their rounds join the research corpus, which
                        is an external licensing question and is gated on
                        an 18+ attestation on top of this.

   Granting capture does NOT grant corpus. Nothing here touches the
   corpus flag.

   The honest part: declining has to actually mean something. Consumers
   of this module (voice-transcript.js and the log-generation payload
   builders on each voice surface) must check state() before writing
   transcript text anywhere, including the fullTranscript field that
   used to ship unconditionally. A consent prompt that still stores the
   data is worse than no prompt.

   Usage:
     await TranscriptConsent.ensure();   // resolves true/false
     TranscriptConsent.state();          // 'granted' | 'denied' | 'unset'
     TranscriptConsent.set(true);        // profile toggle path
   ────────────────────────────────────────────────────────────── */
(function () {
  if (window.TranscriptConsent) return;

  var KEY = 'debateos-transcript-capture';   // '1' | '0', absent = unanswered
  var pending = null;                        // in-flight ask(), so two
                                             // surfaces cannot stack modals

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function state() {
    var v = get();
    if (v === '1') return 'granted';
    if (v === '0') return 'denied';
    return 'unset';
  }

  function currentUser() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return null;
      return firebase.auth().currentUser || null;
    } catch (e) { return null; }
  }

  // Mirror onto the profile so the choice follows the account across
  // browsers. localStorage stays the fast read that gates every write;
  // this is the durable copy. Anonymous guests keep the local copy only,
  // which is the right ceiling for an account that cannot be recovered.
  function persist(granted) {
    put(granted ? '1' : '0');
    var u = currentUser();
    if (!u) return;
    try {
      firebase.firestore().collection('user_profiles').doc(u.uid).set({
        transcriptCapture: !!granted,
        transcriptCaptureAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(function () {});
    } catch (e) {}
    // Append-only server-side ledger: the profile field is the state,
    // this row is the receipt (when, which surface, which policy text).
    try {
      u.getIdToken().then(function (t) {
        fetch('/api/log-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({
            event: granted ? 'transcript_grant' : 'transcript_deny',
            surface: 'round-entry',
            contribute: !!granted,
          }),
        }).catch(function () {});
      }).catch(function () {});
    } catch (e) {}
  }

  // Adopt a stored choice made on another browser, but never downgrade a
  // local grant into a remote deny mid-round: the local answer is the one
  // this person just gave.
  function hydrate() {
    var u = currentUser();
    if (!u || state() !== 'unset') return;
    try {
      firebase.firestore().collection('user_profiles').doc(u.uid).get().then(function (snap) {
        if (!snap.exists) return;
        var v = snap.data().transcriptCapture;
        if (typeof v === 'boolean' && state() === 'unset') put(v ? '1' : '0');
      }).catch(function () {});
    } catch (e) {}
  }

  function ensure() {
    var s = state();
    if (s === 'granted') return Promise.resolve(true);
    if (s === 'denied') return Promise.resolve(false);
    return ask();
  }

  function ask() {
    if (pending) return pending;
    pending = new Promise(function (resolve) {
      mount(function (granted) {
        persist(granted);
        pending = null;
        resolve(granted);
      });
    });
    return pending;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(done) {
    var old = document.getElementById('tcRoot');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var root = document.createElement('div');
    root.id = 'tcRoot';
    root.innerHTML =
      '<style>' +
      '#tcRoot{position:fixed;inset:0;z-index:2147483050;display:flex;align-items:center;' +
        'justify-content:center;padding:20px;background:rgba(0,0,0,.62);backdrop-filter:blur(3px)}' +
      '#tcCard{width:min(100%,460px);border-radius:16px;padding:24px;background:#0d0d10;' +
        'border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);' +
        'color:#f2f2f4;font:inherit;max-height:90vh;overflow:auto}' +
      '@media (prefers-color-scheme:light){#tcCard{background:#fff;color:#17171b;' +
        'border-color:rgba(0,0,0,.12)}}' +
      ':root[data-theme="light"] #tcCard{background:#fff;color:#17171b;border-color:rgba(0,0,0,.12)}' +
      '#tcCard h2{margin:0 0 10px;font-size:1.18rem;font-weight:800;letter-spacing:-.01em;line-height:1.25}' +
      '#tcCard p{margin:0 0 11px;font-size:.88rem;line-height:1.6;opacity:.86}' +
      '#tcCard ul{margin:0 0 13px;padding-left:18px;display:flex;flex-direction:column;gap:7px}' +
      '#tcCard li{font-size:.84rem;line-height:1.55;opacity:.86}' +
      '#tcCard li b{font-weight:700;opacity:1}' +
      '#tcNote{font-size:.78rem;opacity:.62;line-height:1.55;margin-bottom:16px}' +
      '#tcRow{display:flex;gap:9px;flex-wrap:wrap}' +
      '#tcRoot button{flex:1;min-width:132px;padding:11px 16px;border-radius:10px;cursor:pointer;' +
        'font:inherit;font-size:.85rem;font-weight:700;letter-spacing:.01em;border:1px solid transparent}' +
      '#tcYes{background:#b91c1c;color:#fff}' +
      '#tcYes:hover{background:#dc2626}' +
      '#tcNo{background:transparent;color:inherit;border-color:rgba(255,255,255,.22)}' +
      ':root[data-theme="light"] #tcNo{border-color:rgba(0,0,0,.2)}' +
      '@media (prefers-color-scheme:light){#tcNo{border-color:rgba(0,0,0,.2)}}' +
      '#tcMore{display:inline-block;margin-top:13px;font-size:.76rem;opacity:.6;color:inherit}' +
      '</style>' +
      '<div id="tcCard" role="dialog" aria-modal="true" aria-labelledby="tcTitle">' +
        '<h2 id="tcTitle">Can we store what you say in this round?</h2>' +
        '<p>Debatable is free. Keeping a copy of the round is the only way the judge gets better at judging you.</p>' +
        '<ul>' +
          '<li><b>Private to you.</b> The transcript is stored under your account and nobody else can read it. That is what lets you reopen your ballot instead of losing it when the tab closes, and what lets the site show whether you are actually improving.</li>' +
          '<li><b>Anonymous when it trains the AI.</b> Rounds that go into improving the judge and the opponent go in as text only. Your name and your account do not travel with them.</li>' +
          '<li><b>Never published.</b> Your rounds do not show up anywhere on the site unless you publish one yourself.</li>' +
        '</ul>' +
        '<div id="tcNote">Say no and the round still runs and you still get your ballot at the end. You will not be able to reopen that ballot later, and the round will not count toward your progress. You can change this any time in your profile.</div>' +
        '<div id="tcRow">' +
          '<button type="button" id="tcYes">Store my rounds</button>' +
          '<button type="button" id="tcNo">Do not store</button>' +
        '</div>' +
        '<a id="tcMore" href="/privacy#transcripts" target="_blank" rel="noopener">What exactly gets stored</a>' +
      '</div>';

    document.body.appendChild(root);

    function finish(granted) {
      if (root.parentNode) root.parentNode.removeChild(root);
      document.removeEventListener('keydown', onKey, true);
      try { gtag('event', 'transcript_consent', { granted: granted ? 1 : 0 }); } catch (e) {}
      done(granted);
    }
    function onKey(e) {
      // Escape is a decline, not a dismissal. There is no "ask me later"
      // state: an unanswered prompt would leave capture running on a
      // person who never said yes.
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }

    document.getElementById('tcYes').addEventListener('click', function () { finish(true); });
    document.getElementById('tcNo').addEventListener('click', function () { finish(false); });
    document.addEventListener('keydown', onKey, true);
    try { document.getElementById('tcYes').focus(); } catch (e) {}
  }

  window.TranscriptConsent = {
    state: state,
    granted: function () { return state() === 'granted'; },
    ensure: ensure,
    ask: ask,
    set: function (v) { persist(!!v); },
    hydrate: hydrate,
  };

  try {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(function () { hydrate(); });
    }
  } catch (e) {}
})();
