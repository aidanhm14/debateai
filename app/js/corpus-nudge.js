/* Research sharing defaults on in the chooser, but no round is eligible
   until the person confirms 18+. Saved opt-outs always win. The question
   follows repeat use across pages; active rounds are never interrupted. */
(function () {
  'use strict';
  if (window.__debateaiCorpusNudge) return;
  window.__debateaiCorpusNudge = true;

  var CONSENT_KEY = 'debateos-corpus-contribute';
  var STATE_KEY = 'debateos-corpus-prompt-v2:';
  var DAY = 86400000;
  var VISIT_GAP = 30 * 60 * 1000;
  var BALLOT_DELAY = 4000;
  var RETURN_DELAY = 20000;
  var user = null, profile = null, activity = {}, mounted = false;
  var timer = null, saving = false, ballotReady = false, previousFocus = null;
  var roundNoted = false, authAttached = false, firestoreLoading = null;
  var pageReadyAt = Date.now() + RETURN_DELAY;
  var dismissedHere = false;

  function get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function count(k) { return Math.max(0, parseInt(get(k), 10) || 0); }
  function currentUser() {
    try { return firebase.auth().currentUser; } catch (_) { return null; }
  }
  function sameUser(uid) {
    var u = currentUser();
    return !!(u && !u.isAnonymous && u.uid === uid && user && user.uid === uid);
  }
  function saveActivity() {
    if (user) put(STATE_KEY + user.uid, JSON.stringify(activity));
  }
  function timestamp(value) {
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return Number(value) || 0;
  }
  function eligible() {
    return (activity.rounds || 0) >= 2 || count('debateos-corpus-rounds-done') >= 2
      || count('debateos-rated-count') >= 3 || (activity.visits || 0) >= 3
      || ((activity.visits || 0) >= 2 && Date.now() - activity.firstSeen >= DAY);
  }
  function answered() {
    if (!profile) return true;
    return profile.contributeToCorpus === false
      || (profile.contributeToCorpus === true && profile.corpusAgeAttested === true);
  }
  function snoozed() {
    var last = Math.max(activity.dismissedAt || 0, timestamp(profile && profile.corpusNudgeDismissedAt));
    return last > 0 && Date.now() - last < 14 * DAY;
  }
  function ensureFirestore() {
    if (firebase.firestore) return Promise.resolve();
    if (firestoreLoading) return firestoreLoading;
    firestoreLoading = new Promise(function (resolve, reject) {
      var src = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js';
      var tag = document.querySelector('script[src="' + src + '"]');
      if (!tag) { tag = document.createElement('script'); tag.src = src; document.head.appendChild(tag); }
      tag.addEventListener('load', function () { resolve(); }, { once: true });
      tag.addEventListener('error', reject, { once: true });
    });
    return firestoreLoading;
  }
  async function readProfile(u) {
    await ensureFirestore();
    var snap = await firebase.firestore().collection('user_profiles').doc(u.uid).get({ source: 'server' });
    if (!sameUser(u.uid)) return false;
    profile = snap.exists ? snap.data() : {};
    put(CONSENT_KEY, profile.contributeToCorpus === true && profile.corpusAgeAttested === true ? '1' : '0');
    return true;
  }
  function pageBlocked() {
    if (document.hidden || window.top !== window.self) return true;
    var path = location.pathname.replace(/\.html$/, '');
    if (/^\/(privacy|terms|research|profile|messages|admin[^/]*|auth[^/]*|signin|login|checkout)(\/|$)/.test(path)) return true;
    if (!ballotReady && /^\/(app|index|spar|live|live-round|practice|newvoice|voice-debate|debate-chat|coach|tournament)(\/|$)/.test(path)) return true;
    var overlays = document.querySelectorAll('[aria-modal="true"],dialog[open],#onboardOverlay,#daAuthOverlay');
    for (var i = 0; i < overlays.length; i++) {
      if (overlays[i].closest('#corpusNudgeRoot')) continue;
      var css = getComputedStyle(overlays[i]);
      if (css.display !== 'none' && css.visibility !== 'hidden' && overlays[i].getClientRects().length) return true;
    }
    return false;
  }
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(maybeShow, Math.max(delay || 0, pageReadyAt - Date.now()));
  }
  async function maybeShow() {
    if (!user || mounted || saving || dismissedHere || answered() || snoozed() || !eligible()) return;
    if (Date.now() < pageReadyAt) { schedule(); return; }
    if (pageBlocked()) { schedule(5000); return; }
    var u = user;
    try {
      // A choice on another device must beat a stale local cache.
      if (!await readProfile(u) || mounted || answered() || snoozed() || pageBlocked()) return;
      mount();
    } catch (_) { /* A failed read is not permission to assume a choice. */ }
  }
  window.showCorpusNudge = function () { schedule(); };
  window.bumpRatedCount = function () {
    put('debateos-rated-count', String(count('debateos-rated-count') + 1));
    schedule(BALLOT_DELAY);
  };
  window.noteRoundComplete = function () {
    if (roundNoted) return;
    roundNoted = true;
    ballotReady = true;
    pageReadyAt = Date.now() + BALLOT_DELAY;
    put('debateos-corpus-rounds-done', String(count('debateos-corpus-rounds-done') + 1));
    if (user) { activity.rounds = (activity.rounds || 0) + 1; saveActivity(); }
    schedule(BALLOT_DELAY);
  };
  document.addEventListener('debatable:round-complete', window.noteRoundComplete);

  async function record(event, extra, u) {
    var token = await u.getIdToken();
    if (!sameUser(u.uid)) throw new Error('Your account changed. Please try again.');
    var res = await fetch('/api/log-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ event: event, surface: 'corpus-nudge' }, extra || {}))
    });
    if (!res.ok) throw new Error('Could not save your choice. Please try again.');
    return res.json();
  }
  function close() {
    var root = document.getElementById('corpusNudgeRoot');
    if (root) root.remove();
    mounted = false;
    saving = false;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function later() {
    if (saving) return;
    activity.dismissedAt = Date.now();
    saveActivity();
    dismissedHere = true;
    record('corpus_nudge_dismissed', {}, user).catch(function () {});
    close();
  }
  async function saveChoice() {
    if (saving) return;
    var u = user;
    var sharing = document.getElementById('corpusNudgeSharing').checked;
    var age = document.getElementById('corpusNudgeAge').checked;
    if (sharing && !age) return;
    saving = true;
    document.getElementById('corpusNudgeYes').disabled = true;
    document.getElementById('corpusNudgeLater').disabled = true;
    document.getElementById('corpusNudgeSharing').disabled = true;
    document.getElementById('corpusNudgeAge').disabled = true;
    document.getElementById('corpusNudgeStatus').textContent = 'Saving your choice…';
    try {
      // State and its receipt are one server batch. Never show success or
      // enable the local capture flag for a write that failed.
      await record(sharing ? 'corpus_opt_in' : 'corpus_opt_out', {
        contribute: sharing, ageAttested: age, applyCorpusChoice: true
      }, u);
      if (!sameUser(u.uid) || !mounted) return;
      profile.contributeToCorpus = sharing;
      if (sharing) profile.corpusAgeAttested = true;
      put(CONSENT_KEY, sharing ? '1' : '0');
      dismissedHere = true;
      document.getElementById('corpusNudgeBody').textContent = sharing
        ? 'Research sharing is on. Only future rounds can contribute. You can turn it off in Account & settings on your profile.'
        : 'Research sharing is off. Your rounds will not be added to the research corpus. You can change this in your profile.';
      document.getElementById('corpusNudgeTitle').textContent = 'Your choice is saved.';
      document.getElementById('corpusNudgeControls').hidden = true;
      document.getElementById('corpusNudgeStatus').textContent = '';
      var done = document.getElementById('corpusNudgeYes');
      done.disabled = false;
      done.textContent = 'Done';
      done.onclick = close;
      document.getElementById('corpusNudgeLater').hidden = true;
      done.focus();
      saving = false;
    } catch (_) {
      if (!sameUser(u.uid) || !mounted) return;
      saving = false;
      document.getElementById('corpusNudgeLater').disabled = false;
      document.getElementById('corpusNudgeSharing').disabled = false;
      document.getElementById('corpusNudgeAge').disabled = false;
      updateChoice();
      document.getElementById('corpusNudgeStatus').textContent = 'Could not save your choice. Please try again.';
    }
  }
  function updateChoice() {
    var sharing = document.getElementById('corpusNudgeSharing').checked;
    var age = document.getElementById('corpusNudgeAge').checked;
    document.getElementById('corpusNudgeSharingLabel').textContent = sharing ? 'Research sharing on' : 'Research sharing off';
    document.getElementById('corpusNudgeAgeRow').hidden = !sharing;
    var yes = document.getElementById('corpusNudgeYes');
    yes.textContent = sharing ? 'Confirm and keep sharing on' : 'Turn sharing off';
    yes.disabled = sharing && !age;
  }
  function mount() {
    mounted = true;
    previousFocus = document.activeElement;
    var root = document.createElement('div');
    root.id = 'corpusNudgeRoot';
    root.innerHTML = '<style>'
      + '#corpusNudgeRoot{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.64);font-family:Archivo,Inter,-apple-system,sans-serif}'
      + '#corpusNudgeCard{box-sizing:border-box;max-width:520px;width:100%;max-height:calc(100dvh - 32px);overflow:auto;background:var(--bg,#faf9f6);color:var(--text,#222);border:1px solid var(--border,#777);border-radius:18px;padding:28px;box-shadow:0 24px 80px #0005;font-size:15px;line-height:1.5}'
      + '#corpusNudgeCard h2{font-size:26px;line-height:1.15;margin:6px 0 16px;letter-spacing:-.025em}'
      + '#corpusNudgeCard p{margin:0 0 12px}#corpusNudgeCard a{color:inherit;text-decoration:underline}'
      + '#corpusNudgeCard .corpus-label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}'
      + '#corpusNudgeControls{padding:14px;border:1px solid var(--border,#aaa);border-radius:10px;margin-top:16px}'
      + '#corpusNudgeControls label{display:flex;gap:10px;align-items:flex-start;cursor:pointer}#corpusNudgeControls input{flex:0 0 auto;margin:4px 0 0;accent-color:#b91c1c;width:18px;height:18px}'
      + '#corpusNudgeAgeRow{margin-top:14px;font-size:14px}#corpusNudgeCard [hidden]{display:none!important}'
      + '#corpusNudgeBtns{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}#corpusNudgeCard button{font:inherit;min-height:44px;border-radius:9px;padding:10px 14px;cursor:pointer;border:1px solid var(--border,#aaa);background:transparent;color:inherit}'
      + '#corpusNudgeYes{flex:1;background:#b91c1c!important;color:#fff!important;border-color:#b91c1c!important;font-weight:700!important}#corpusNudgeCard button:disabled{opacity:.5;cursor:default}'
      + '#corpusNudgeCard :focus-visible{outline:2px solid #dc2626;outline-offset:3px}#corpusNudgeStatus{font-size:14px;margin:12px 0 0}#corpusNudgeStatus:empty{display:none}'
      + '@media(max-width:400px){#corpusNudgeCard{padding:20px}#corpusNudgeBtns{flex-direction:column}#corpusNudgeCard h2{font-size:24px}}'
      + '</style><section id="corpusNudgeCard" role="dialog" aria-modal="true" aria-labelledby="corpusNudgeTitle" aria-describedby="corpusNudgeBody" tabindex="-1">'
      + '<div class="corpus-label">Your research sharing setting</div><h2 id="corpusNudgeTitle">Help AI understand real disagreements?</h2>'
      + '<div id="corpusNudgeBody"><p>You have spent some time on Debatable, so we are asking about research sharing now.</p>'
      + '<p>Real arguments help researchers study how AI responds to opposing views and test whether its judgments are consistent.</p>'
      + '<p>Sharing is <strong>on by default</strong>. Once you confirm you are 18 or older, future typed rounds and voice transcripts can join a research dataset we may <strong>license to AI labs</strong>. We remove account identifiers and scrub personal details before export. Audio and video are excluded.</p>'
      + '<p>Past rounds stay out. This is optional and does not affect access to Debatable. Turn it off any time in your profile. <a href="/privacy#corpus" target="_blank" rel="noopener">Read the privacy details</a>.</p></div>'
      + '<div id="corpusNudgeControls"><label><input type="checkbox" role="switch" id="corpusNudgeSharing" checked><span><strong id="corpusNudgeSharingLabel">Research sharing on</strong><br>Confirm your age before any rounds contribute.</span></label>'
      + '<label id="corpusNudgeAgeRow"><input type="checkbox" id="corpusNudgeAge"><span>I confirm I am 18 or older. Rounds from anyone under 18 are never included.</span></label></div>'
      + '<p id="corpusNudgeStatus" role="status" aria-live="polite"></p><div id="corpusNudgeBtns"><button id="corpusNudgeLater" type="button">Not now</button><button id="corpusNudgeYes" type="button" disabled>Confirm and keep sharing on</button></div></section>';
    document.body.appendChild(root);
    document.getElementById('corpusNudgeAge').checked = profile.corpusAgeAttested === true;
    document.getElementById('corpusNudgeAge').onchange = updateChoice;
    document.getElementById('corpusNudgeSharing').onchange = updateChoice;
    document.getElementById('corpusNudgeYes').onclick = saveChoice;
    document.getElementById('corpusNudgeLater').onclick = later;
    root.addEventListener('click', function (e) { if (e.target === root) later(); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); later(); }
      if (e.key !== 'Tab') return;
      var controls = Array.prototype.filter.call(root.querySelectorAll('a,button,input'), function (el) {
        return !el.disabled && el.getClientRects().length;
      });
      var first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement.id === 'corpusNudgeCard')) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    updateChoice();
    document.getElementById('corpusNudgeCard').focus();
  }
  async function onAuth(u) {
    if (user && u && user.uid === u.uid) return;
    clearTimeout(timer);
    close();
    user = u && !u.isAnonymous ? u : null;
    profile = null;
    dismissedHere = false;
    put(CONSENT_KEY, '0');
    if (!user) return;
    try { activity = JSON.parse(get(STATE_KEY + user.uid) || '{}') || {}; } catch (_) { activity = {}; }
    var now = Date.now();
    if (!activity.firstSeen) activity.firstSeen = now;
    if (!activity.lastSeen || now - activity.lastSeen >= VISIT_GAP) activity.visits = (activity.visits || 0) + 1;
    activity.lastSeen = now;
    saveActivity();
    try { if (await readProfile(user)) schedule(); } catch (_) {}
  }
  function boot(attempt) {
    if (authAttached) return;
    try {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.apps.length) {
        firebase.auth().onAuthStateChanged(onAuth);
        authAttached = true;
        return;
      }
    } catch (_) {}
    if (attempt < 120) setTimeout(function () { boot(attempt + 1); }, 500);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      if (user) {
        var now = Date.now();
        if (now - (activity.lastSeen || now) >= VISIT_GAP) activity.visits = (activity.visits || 0) + 1;
        activity.lastSeen = now;
        saveActivity();
      }
      schedule(5000);
      boot(0);
    }
  });
  window.addEventListener('debatable:corpus-choice-saved', function () {
    dismissedHere = true;
    close();
    if (user) readProfile(user).catch(function () {});
  });
  function init() {
    if (window.__corpusRoundsPending > 0) { window.__corpusRoundsPending = 0; window.noteRoundComplete(); }
    boot(0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
