(function () {
  'use strict';
  var pending, expires = 0;
  function name(model) {
    var id = String(model || '');
    var known = {
      'gpt-6-astra': 'GPT-6 Astra', 'gpt-6-sol': 'GPT-6 Sol', 'gpt-5.5': 'GPT-5.5',
      'claude-fable-5-1': 'Claude Fable 5.1', 'claude-fable-5': 'Claude Fable 5',
      'claude-opus-5-5': 'Claude Opus 5.5', 'claude-opus-5': 'Claude Opus 5',
      'claude-sonnet-5': 'Claude Sonnet 5',
      'gemini-3.8-flash': 'Gemini 3.8 Flash', 'gemini-3.6-flash': 'Gemini 3.6 Flash'
    };
    return known[id] || id || 'Model not recorded';
  }
  function describe(doc) {
    var running = doc && doc.running;
    if (!running) return 'Current models could not be loaded.';
    if (!running.panelConstitutable) {
      return running.requirePanel ? 'Council unavailable. Judging waits for the panel.'
        : 'Fallback judge: ' + name(running.fallbackModel) + '.';
    }
    return 'Current council: ' + (running.jurors || []).map(function (j) {
      return name(j.pinnedModel || j.model) + (j.available === false ? ' (unavailable)' : '');
    }).join(' · ') + '.';
  }
  function load() {
    if (!pending || Date.now() >= expires) {
      expires = Date.now() + 60000;
      pending = fetch('/api/judge/charter', { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('charter unavailable'); return r.json(); })
      .then(function (doc) {
        if (doc.season && doc.season.to) expires = Math.min(expires, doc.season.to);
        return doc;
      })
      .catch(function () { return null; });
    }
    return pending;
  }
  function paint(root) {
    var nodes = (root || document).querySelectorAll('[data-judge-models]');
    if (!nodes.length) return;
    load().then(function (doc) {
      Array.prototype.forEach.call(nodes, function (el) { el.textContent = describe(doc); });
    });
  }
  window.DBJudgeModels = { name: name, describe: describe, load: load, paint: paint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paint(); }, { once: true });
  else paint();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
  setInterval(function () { if (!document.hidden) paint(); }, 60000);
})();
