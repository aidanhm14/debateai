/* voice-status.js
 *
 * Fetches /api/voice-status (Netlify function reading the
 * VOICE_AI_ENABLED env var). Exposes:
 *
 *   window.daVoiceStatus = { loaded, enabled, reason, source, checkedAt }
 *   window.daVoiceStatusReady — Promise that resolves with the status
 *
 * Pages that surface voice CTAs read this and either:
 *   - render voice as primary (enabled: true), or
 *   - swap to typed-mode messaging (enabled: false), with reason.
 *
 * Defaults to enabled:true on fetch failure (the CTA stays as-is rather
 * than showing a misleading "voice off" state if the function is just
 * slow / down). When the function returns enabled:false, fires a
 * 'da-voice-disabled' CustomEvent on window for any late-mounted UI.
 *
 * Ship as <script defer src="/js/voice-status.js"></script>. Most
 * consumers should await window.daVoiceStatusReady before deciding
 * what to render — but the script also sets window.daVoiceStatus
 * synchronously to a placeholder so direct reads don't crash.
 */
(function(){
  'use strict';

  var DEFAULT = { loaded:false, enabled:true, reason:'', source:'default', checkedAt:'' };
  window.daVoiceStatus = DEFAULT;

  window.daVoiceStatusReady = fetch('/api/voice-status', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    // cache:'no-store' would defeat the function's edge cache; let the
    // browser respect Cache-Control: max-age=60.
  }).then(function(r){
    if (!r.ok) throw new Error('voice-status HTTP ' + r.status);
    return r.json();
  }).then(function(j){
    var status = {
      loaded: true,
      enabled: j.enabled !== false,
      reason: j.reason || '',
      source: j.source || 'env',
      checkedAt: j.checkedAt || '',
    };
    window.daVoiceStatus = status;
    if (!status.enabled){
      try {
        window.dispatchEvent(new CustomEvent('da-voice-disabled', { detail: status }));
      } catch(e){}
    }
    return status;
  }).catch(function(err){
    // Network or function failure → leave the default optimistic state.
    // We don't want a flaky function to disable voice for everyone.
    console.warn('[voice-status] fetch failed, defaulting to enabled:', err && err.message);
    return DEFAULT;
  });
})();
