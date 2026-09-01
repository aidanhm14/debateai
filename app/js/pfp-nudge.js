/* Profile-picture nudge. One engine, mounted wherever an account's own
   letter-avatar is on screen next to other people's (friends list, DM
   rail, community).

   Usage: put <div data-pfp-nudge></div> where the card should sit and load
   this script with defer. It renders nothing unless ALL of these hold:
     - a NAMED account is signed in (an anonymous Firebase uid is not a
       person we can ask, and its picture would die with the uid),
     - the account has no chosen identity (picked tile, designed portrait,
       live mask) and no account photo,
     - "Not now" has not been pressed in this browser.
   The decision waits for avatar-account.js to hydrate a design saved on
   another device (injected here if the page does not load it), so nobody
   who built a face on their phone is nagged on their laptop.

   The click lazy-loads /js/avatar.js and opens the existing builder, which
   leads with the one-tap picture picker. No second copy of the picker
   lives here. Styles ride theme tokens with hard fallbacks because every
   host page defines a different token set (the invisible-text trap).
   No em dashes in any user-facing string. */
(function (global) {
  'use strict';
  if (global.__daPfpNudgeLoaded) return;
  global.__daPfpNudgeLoaded = true;

  var KEY = 'da-pfp-nudge';
  var READY_EVT = 'debatable-avatar-account-ready';
  var CSS = '.da-pfpn{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:14px 16px;border-radius:14px;'
    + 'border:1px solid var(--line,var(--border,rgba(127,127,127,.22)));background:var(--panel,var(--bg-card,rgba(127,127,127,.06)));'
    + 'color:var(--text,inherit);font:inherit}'
    + '.da-pfpn[hidden]{display:none!important}'
    + '.da-pfpn-av{flex:0 0 auto;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
    + 'font-weight:800;font-size:1rem;background:var(--accent,#dc2626);color:#fff}'
    + '.da-pfpn-id{flex:1 1 220px;min-width:0}'
    + '.da-pfpn-t{font-weight:800;font-size:.98rem;margin:0 0 2px}'
    + '.da-pfpn-s{font-size:.82rem;line-height:1.4;opacity:.72;margin:0}'
    + '.da-pfpn-acts{display:flex;gap:8px;flex-wrap:wrap}'
    + '.da-pfpn-btn{appearance:none;border:1px solid var(--line,var(--border,rgba(127,127,127,.3)));background:transparent;color:inherit;'
    + 'border-radius:10px;padding:8px 12px;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}'
    + '.da-pfpn-btn.pri{background:var(--accent,#dc2626);border-color:var(--accent,#dc2626);color:#fff}'
    + '.da-pfpn-btn.pri:disabled{opacity:.6;cursor:default}'
    + '.da-pfpn-btn.quiet{border-color:transparent;opacity:.72}'
    + '.da-pfpn-btn:focus-visible{outline:2px solid var(--accent,#dc2626);outline-offset:2px}';

  function ga(name, extra) {
    try {
      var p = { event_category: 'identity', surface: location.pathname };
      if (extra) for (var k in extra) p[k] = extra[k];
      global.gtag && global.gtag('event', name, p);
    } catch (e) {}
  }
  function dismissed() {
    try { return !!global.localStorage.getItem(KEY); } catch (e) { return true; }
  }
  function hasPic(user) {
    try {
      if (user && user.photoURL) return true;
      var ls = global.localStorage;
      return !!(ls.getItem('debatable-avatar') || ls.getItem('debateit-avatar')
        || ls.getItem('debatable-live-avatar-v1') || ls.getItem('debatable-pfp-v1'));
    } catch (e) { return true; }   // storage unreadable: never nag
  }
  function isNamed(u) {
    if (!u || u.isAnonymous) return false;
    var pd = u.providerData || [];
    for (var i = 0; i < pd.length; i++) if (pd[i] && pd[i].providerId && pd[i].providerId !== 'anonymous') return true;
    return false;
  }
  function initial(u) {
    var name = '';
    try { if (global.daPublicName) name = global.daPublicName(u) || ''; } catch (e) {}
    try { if (!name && global.DBIdentity && global.DBIdentity.forUser) name = (global.DBIdentity.forUser(u) || {}).name || ''; } catch (e) {}
    var c = String(name || '').trim().charAt(0).toUpperCase();
    return c || '?';
  }
  function loadOnce(src, attr, cb) {
    var tag = document.querySelector('script[' + attr + ']') || document.querySelector('script[src="' + src + '"]');
    if (!tag) {
      tag = document.createElement('script');
      tag.src = src;
      tag.setAttribute(attr, '1');
      document.head.appendChild(tag);
    }
    if (tag.__daDone) { cb(true); return; }
    tag.addEventListener('load', function () { tag.__daDone = true; cb(true); });
    tag.addEventListener('error', function () { cb(false); });
  }
  function ensureStyle() {
    if (document.getElementById('daPfpNudgeCss')) return;
    var s = document.createElement('style');
    s.id = 'daPfpNudgeCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function render(mount, user) {
    ensureStyle();
    mount.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'da-pfpn';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Add a profile picture');
    card.innerHTML =
      '<span class="da-pfpn-av" aria-hidden="true"></span>' +
      '<div class="da-pfpn-id"><p class="da-pfpn-t">Put a face on your name</p>' +
      '<p class="da-pfpn-s">People see this letter everywhere you debate. Pick a picture or design an avatar once and it rides your rounds, messages, and the leaderboard.</p></div>' +
      '<div class="da-pfpn-acts"><button class="da-pfpn-btn pri" type="button" data-go>Choose my picture</button>' +
      '<button class="da-pfpn-btn quiet" type="button" data-no>Not now</button></div>';
    card.querySelector('.da-pfpn-av').textContent = initial(user);
    mount.appendChild(card);
    ga('pfp_nudge_shown');

    var go = card.querySelector('[data-go]');
    go.addEventListener('click', function () {
      ga('pfp_nudge_open');
      go.disabled = true;
      var open = function () {
        go.disabled = false;
        if (!(global.DBAvatar && global.DBAvatar.openBuilder)) {
          card.querySelector('.da-pfpn-s').textContent = 'The picture picker could not load. Try again in a moment.';
          return;
        }
        global.DBAvatar.openBuilder({ onSave: function () {
          ga('pfp_nudge_saved');
          card.querySelector('.da-pfpn-t').textContent = 'Saved.';
          card.querySelector('.da-pfpn-s').textContent = 'That face now rides everywhere you debate.';
          card.querySelector('.da-pfpn-acts').remove();
          var av = card.querySelector('.da-pfpn-av');
          try {
            var pub = global.DBAvatar.getPublicIdentity ? global.DBAvatar.getPublicIdentity() : null;
            if (global.DBAvatar.mountIdentity) global.DBAvatar.mountIdentity(av, { uid: user.uid, size: 40, publicIdentity: pub });
          } catch (e) {}
          setTimeout(function () { card.hidden = true; }, 5000);
        }});
      };
      if (global.DBAvatar && global.DBAvatar.openBuilder) open();
      else loadOnce('/js/avatar.js', 'data-da-avatar', open);
    });
    card.querySelector('[data-no]').addEventListener('click', function () {
      card.hidden = true;
      try { global.localStorage.setItem(KEY, 'dismissed'); } catch (e) {}
      ga('pfp_nudge_dismissed');
    });
  }

  function decideFor(mount, user) {
    if (mount.__daPfpDone) return;
    var done = false;
    var decide = function () {
      if (done) return;
      done = true;
      mount.__daPfpDone = true;
      if (hasPic(user)) return;
      render(mount, user);
    };
    // avatar-account.js hydrates the account's saved design; wait for it,
    // or 3s, whichever first. Inject it when the page does not load it.
    global.addEventListener(READY_EVT, decide, { once: true });
    if (!(global.DBAvatarAccount)) loadOnce('/js/avatar-account.js', 'data-da-avatar-account', function () {});
    setTimeout(decide, 3000);
  }

  function boot(attempt) {
    attempt = attempt || 0;
    var mount = document.querySelector('[data-pfp-nudge]');
    if (!mount) return;
    if (dismissed()) return;
    var fb = global.firebase;
    if (!(fb && fb.auth)) {
      if (attempt < 40) setTimeout(function () { boot(attempt + 1); }, 250);
      return;
    }
    try {
      fb.auth().onAuthStateChanged(function (u) {
        if (isNamed(u)) decideFor(mount, u);
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); });
  else boot(0);
})(window);
