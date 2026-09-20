
(function(){
  var section = document.getElementById('waitlist');
  var slot = document.getElementById('waitlist-slot');
  if (section && slot) slot.replaceWith(section);
  var form = document.getElementById('wlForm');
  if (!form) return;
  var btn = document.getElementById('wlBtn');
  var errEl = document.getElementById('wlErr');
  var success = document.getElementById('wlSuccess');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    errEl.classList.remove('is-on');
    errEl.textContent = '';
    var email = document.getElementById('wlEmail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Enter a valid email address.';
      errEl.classList.add('is-on');
      return;
    }
    btn.disabled = true;
    var prevText = btn.textContent;
    btn.textContent = 'Registering…';
    fetch('/api/early-signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'landing-waitlist' })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, body: d }; }); })
      .then(function(res){
        if (!res.ok) {
          errEl.textContent = (res.body && res.body.error) || 'Could not save your registration. Try again.';
          errEl.classList.add('is-on');
          btn.disabled = false;
          btn.textContent = prevText;
          return;
        }
        try { gtag('event', 'waitlist_register', { returning: !!res.body.returning, source: 'landing' }); } catch(_){}
        form.hidden = true;
        success.hidden = false;
        if (res.body && res.body.returning) {
          document.getElementById('wlSuccessHead').textContent = "You're already registered.";
          document.getElementById('wlSuccessBody').textContent = 'Same list, nothing else to do. Updates land in your inbox as they ship.';
        }
      })
      .catch(function(){
        errEl.textContent = 'Network error. Check your connection and try again.';
        errEl.classList.add('is-on');
        btn.disabled = false;
        btn.textContent = prevText;
      });
  });

  // Google-first waitlist (2026-08-10). The card's primary action is the
  // account, because a signed-in visitor is reachable (notifications,
  // presence, spar invites) where an email row is not. The email form
  // stays behind the "Prefer email updates?" link, and is the automatic
  // fallback in browsers where the Firebase SDK never loads.
  var gWrap = document.getElementById('wlGoogleWrap');
  var gBtn = document.getElementById('wlGoogleBtn');
  var signedCard = document.getElementById('wlSigned');
  var notifBtn = document.getElementById('wlNotifBtn');
  var emailAlt = document.getElementById('wlEmailAlt');
  var WL_G_FLAG = 'debatable-waitlist-google';
  function showEmailForm(focus){
    if (gWrap) gWrap.hidden = true;
    form.hidden = false;
    if (focus) { var em = document.getElementById('wlEmail'); if (em) { try { em.focus(); } catch(_){} } }
  }
  if (emailAlt) emailAlt.addEventListener('click', function(e){ e.preventDefault(); showEmailForm(true); });
  if (gBtn) gBtn.addEventListener('click', function(){
    try { localStorage.setItem(WL_G_FLAG, '1'); } catch(_){}
    try { gtag('event', 'waitlist_google_click'); } catch(_){}
    if (window.openAuthModal) { window.openAuthModal(); return; }
    var real = document.getElementById('googleSignupBtn');
    if (real && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) { real.click(); return; }
    showEmailForm(true);
  });
  function paintNotifBtn(){
    if (!notifBtn) return;
    if (!('Notification' in window)) { notifBtn.hidden = true; return; }
    if (Notification.permission === 'granted') { notifBtn.textContent = 'Notifications on'; notifBtn.disabled = true; }
    else if (Notification.permission === 'denied') { notifBtn.textContent = 'Notifications blocked in browser settings'; notifBtn.disabled = true; }
  }
  if (notifBtn) notifBtn.addEventListener('click', function(){
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function(p){
      paintNotifBtn();
      if (p === 'granted') { try { gtag('event', 'waitlist_notif_enable'); } catch(_){} }
    }).catch(function(){});
  });
  function onWlAuthUser(user){
    if (user && !user.isAnonymous) {
      if (gWrap) gWrap.hidden = true;
      form.hidden = true;
      if (success) success.hidden = true;
      if (signedCard) signedCard.hidden = false;
      paintNotifBtn();
      var flagged = false;
      try { flagged = localStorage.getItem(WL_G_FLAG) === '1'; } catch(_){}
      if (flagged && user.email) {
        try { localStorage.removeItem(WL_G_FLAG); } catch(_){}
        fetch('/api/early-signup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: user.email, displayName: user.displayName || '', source: 'landing-waitlist-google' })
        }).catch(function(){});
      }
    } else {
      if (signedCard) signedCard.hidden = true;
      if (gWrap && form.hidden && (!success || success.hidden)) gWrap.hidden = false;
    }
  }
  var wlAuthTries = 0;
  (function wireWlAuth(){
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.apps && firebase.apps.length) {
      try { firebase.auth().onAuthStateChanged(onWlAuthUser); return; } catch(_){}
    }
    if (++wlAuthTries < 60) setTimeout(wireWlAuth, 250);
  })();
})();
