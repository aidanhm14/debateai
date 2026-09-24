/* Explicit device setup. Permission is requested only by the enable button. */
(function(){
  'use strict';
  function mount(root){
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    root.classList.add('notification-setup');
    root.innerHTML = '<strong>Get match and message notifications</strong>' +
      '<p data-notify-help></p><div class="notification-setup-actions">' +
      '<button type="button" data-notify-enable>Turn on notifications</button>' +
      '<button type="button" data-notify-test hidden>Send a test notification</button></div>' +
      '<label data-notify-live-row hidden><input type="checkbox" data-notify-live> Also notify me when someone is looking for a round</label>' +
      '<details><summary>Set up on your phone</summary><p>Open <b>itsdebatable.com/notifications</b> on your phone and sign in to the same account.</p>' +
      '<p><b>iPhone or iPad:</b> open the browser menu, choose Share, then Add to Home Screen. Keep Open as Web App on if shown. Open the new icon and turn on notifications here.</p>' +
      '<p><b>Android:</b> open this page in Chrome and turn on notifications. You can also choose Add to Home screen or Install app from the browser menu.</p></details>' +
      '<div class="notification-sound"><button type="button" data-notify-sound>Test notification sound</button><button type="button" data-notify-mute aria-pressed="false">Mute sounds</button></div>' +
      '<p data-notify-status role="status" aria-live="polite"></p>';
    var enable = root.querySelector('[data-notify-enable]');
    var test = root.querySelector('[data-notify-test]');
    var live = root.querySelector('[data-notify-live]');
    var status = root.querySelector('[data-notify-status]');
    var mute = root.querySelector('[data-notify-mute]');
    var pending = false;
    function paint(){
      var state = window.daGetMessageAlertsState ? window.daGetMessageAlertsState() : 'loading';
      root.querySelector('[data-notify-help]').textContent = state === 'on'
        ? 'Notifications are on for this device. Each phone or computer needs its own setup.'
        : (window.daMessageAlertsHelp ? window.daMessageAlertsHelp() : 'Loading notification settings.');
      enable.hidden = state === 'on';
      enable.disabled = pending || /^(loading|working|unsupported|denied)$/.test(state);
      enable.textContent = pending || state === 'working' ? 'Setting up…' : state === 'guest' ? 'Sign in to enable' : state === 'install' ? 'Show phone setup' : state === 'denied' ? 'Blocked in device settings' : 'Turn on notifications';
      test.hidden = state !== 'on' || !window.Notification;
      root.querySelector('[data-notify-live-row]').hidden = state !== 'on';
      live.checked = !!(window.daGetLiveAlerts && window.daGetLiveAlerts());
      live.disabled = pending;
      var muted = false; try { muted = localStorage.getItem('da-sfx-muted') === '1'; } catch (_) {}
      mute.setAttribute('aria-pressed', String(muted));
      mute.textContent = muted ? 'Unmute sounds' : 'Mute sounds';
    }
    enable.addEventListener('click', function(){
      var state = window.daGetMessageAlertsState && window.daGetMessageAlertsState();
      if (state === 'install'){ root.querySelector('details').open = true; return; }
      if (state === 'guest'){
        if (window.openAuthModal) window.openAuthModal('signin');
        else status.textContent = 'Sign in using the account button, then return here.';
        return;
      }
      if (pending || !window.daEnableMessageAlerts) return;
      // Start in this click, before any asynchronous sound/script work.
      var setup = window.daEnableMessageAlerts();
      pending = true; status.textContent = ''; paint();
      setup.then(function(ok){
        status.textContent = ok ? 'This device is registered. Try a test notification.' : window.daMessageAlertsHelp();
      }).catch(function(){ status.textContent = 'Could not set up notifications. Try again.'; })
        .finally(function(){ pending = false; paint(); });
    });
    live.addEventListener('change', function(){
      if (!window.daSetLiveAlerts || pending) return;
      var on = live.checked; pending = true; paint();
      window.daSetLiveAlerts(on, function(saved, error){
        pending = false; status.textContent = error || (saved ? 'New-round alerts are on.' : 'New-round alerts are off. Match and message notifications stay on.'); paint();
      });
    });
    test.addEventListener('click', function(){
      if (!window.daShowDeviceNotification) return;
      test.disabled = true;
      window.daShowDeviceNotification('Debatable notifications are ready', {
        body: 'This is your test notification.', tag: 'da-device-test', url: '/notifications', test: true
      }).then(function(ok){ status.textContent = ok ? 'Test sent. Check your notification center. Device focus and silent settings can hide banners or sound.' : 'Could not show the test. Check notification permissions in your device settings.'; })
        .finally(function(){ test.disabled = false; });
    });
    root.querySelector('[data-notify-sound]').addEventListener('click', function(){
      var button = this; button.disabled = true;
      // Existing mute is a deliberate preference. A test never unmutes it.
      var load = window.daEnsureSfx ? window.daEnsureSfx() : Promise.resolve(window.SFX);
      load.then(function(sfx){
        if (!sfx) { status.textContent = 'Sound did not load. Check your connection and try again.'; return; }
        if (sfx.isSilenced()) { status.textContent = 'Sounds are muted. Choose Unmute sounds to hear the test.'; return; }
        return sfx.unlock().then(function(ok){
          if (ok) sfx.notify();
          status.textContent = ok ? 'Test sound played. These sounds use your device volume.' : 'Sound is paused by your browser. Tap the sound test again.';
        });
      }).finally(function(){ button.disabled = false; paint(); });
    });
    mute.addEventListener('click', function(){
      var was = mute.getAttribute('aria-pressed') === 'true';
      if (window.SFX) { if (was) window.SFX.unmute(); else window.SFX.mute(); }
      else { try { localStorage.setItem('da-sfx-muted', was ? '0' : '1'); } catch (_) {} }
      status.textContent = was ? 'Notification sounds are on. Try the sound test.' : 'Notification sounds are muted. Call audio is unchanged.';
      paint();
    });
    window.addEventListener('debatable:notification-state', paint);
    window.addEventListener('focus', paint);
    window.addEventListener('storage', paint);
    paint();
  }
  function scan(){ document.querySelectorAll('[data-notification-setup]:not([data-ready])').forEach(mount); }
  function boot(){
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    if (window.daEnsureSfx) window.daEnsureSfx();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
