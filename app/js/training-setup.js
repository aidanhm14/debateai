(function () {
  'use strict';
  var schema = window.DBTrainingScenario;
  var form = document.getElementById('trainingForm');
  if (!form || !schema) return;
  form.querySelector('[type=submit]').disabled = false;
  var type = form.dataset.training;
  var error = document.getElementById('trainingError');
  var status = document.getElementById('trainingStatus');
  var examples = document.querySelectorAll('[data-training-example]');
  function fill(value) {
    ['situation', 'counterpart', 'goal'].forEach(function (name) { form.elements[name].value = value[name] || ''; });
    error.textContent = '';
  }
  try {
    fill(schema.read(sessionStorage, type));
    if (status) status.textContent = 'Your previous setup is ready to edit.';
  } catch (e) {}
  examples.forEach(function (button) {
    button.addEventListener('click', function () {
      try {
        fill(JSON.parse(button.dataset.trainingExample));
        examples.forEach(function (example) { example.setAttribute('aria-pressed', String(example === button)); });
        if (status) status.textContent = 'Example loaded. Edit any detail to make it yours.';
        form.scrollIntoView({ block: 'start' });
        form.elements.situation.focus({ preventScroll: true });
      } catch (e) { error.textContent = 'Could not load that example. You can write your own below.'; }
    });
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    try {
      var value = schema.parse({ type: type, situation: form.elements.situation.value,
        counterpart: form.elements.counterpart.value, goal: form.elements.goal.value });
      sessionStorage.setItem(schema.key(type), JSON.stringify(value));
      // Keep scenario details out of links, referrers and analytics URLs.
      window.location.assign('/newvoice?training=' + encodeURIComponent(type));
    } catch (e) {
      error.textContent = e.name === 'QuotaExceededError' || e.name === 'SecurityError'
        ? 'Your browser could not keep this setup. Allow storage for this site and try again.' : e.message;
    }
  });
})();
