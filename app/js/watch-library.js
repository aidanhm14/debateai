(function () {
  'use strict';
  var root = document.documentElement;
  var mode = root.getAttribute('data-watch-view') || 'all';
  var params = new URLSearchParams(location.search);
  var channel = params.get('channel') || '';
  var query = document.getElementById('watchQuery');
  var topics = document.getElementById('watchTopics');
  var selectedTopic = 'all';
  var examples = document.getElementById('watch-learn');
  var replays = document.querySelector('.watch-rail');
  var result = document.getElementById('watchResultCount');
  var empty = document.getElementById('watchEmpty');
  var title = document.getElementById('examplesTitle');
  query.value = params.get('q') || '';
  Array.prototype.forEach.call(document.querySelectorAll('[data-watch-nav]'), function (link) {
    if (link.getAttribute('data-watch-nav') === mode) link.setAttribute('aria-current', 'page');
  });
  var allowedTopics = ['all', 'technology', 'money', 'culture', 'life', 'short'];
  if (allowedTopics.indexOf(params.get('topic')) !== -1) selectedTopic = params.get('topic');
  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'"); }
  function matchesTopic(card) {
    if (selectedTopic === 'all') return true;
    if (selectedTopic === 'short') return Number(card.dataset.duration) > 0 && Number(card.dataset.duration) <= 600;
    if (card.dataset.topic) return card.dataset.topic === selectedTopic;
    var words = normal(card.querySelector('h3') && card.querySelector('h3').textContent);
    var categories = {
      technology: /\b(ai|artificial|tech|internet|social media|tiktok|google|automation|robot)\b/,
      money: /\b(money|tax|taxes|billionaire|billionaires|capitalism|income|work|employer|employers|economy|economic|jobs)\b/,
      life: /\b(dating|relationship|relationships|monogamy|meat|vegan|friend|friends|homework|school|college|universit)/
    };
    if (selectedTopic === 'culture') return !categories.technology.test(words) && !categories.money.test(words) && !categories.life.test(words);
    return categories[selectedTopic].test(words);
  }
  function filterCards(selector, enabled) {
    var shown = 0;
    var words = normal(query.value).trim().split(/\s+/).filter(Boolean);
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (card) {
      var searchable = normal(card.textContent);
      var match = enabled && (!channel || card.dataset.channel === channel) && matchesTopic(card) && words.every(function (word) { return searchable.indexOf(word) !== -1; });
      card.hidden = !match;
      if (match) shown++;
    });
    return shown;
  }
  function applyFilters() {
    var filtering = !!(query.value.trim() || selectedTopic !== 'all' || channel);
    var exCount = filterCards('#examplesGrid .yt-card', mode === 'all' || mode === 'youtube');
    var rpCount = filterCards('#replaysGrid .card', mode === 'all' || mode === 'debatable');
    examples.hidden = (mode !== 'all' && mode !== 'youtube') || exCount === 0;
    replays.hidden = (mode !== 'all' && mode !== 'debatable') || (filtering && rpCount === 0);
    document.getElementById('watchReset').hidden = !filtering || mode === 'live';
    empty.hidden = !filtering || exCount + rpCount > 0 || mode === 'live';
    result.textContent = filtering ? (exCount + rpCount) + ((exCount + rpCount) === 1 ? ' video' : ' videos') + (channel ? ' from ' + channel : '') : '';
    title.textContent = channel || (mode === 'youtube' ? 'Example debates' : 'Worth an argument');
    Array.prototype.forEach.call(topics.querySelectorAll('[data-topic]'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.topic === selectedTopic));
    });
  }
  function saveFilters() {
    var url = new URL(location.href);
    [['q', query.value.trim()], ['topic', selectedTopic === 'all' ? '' : selectedTopic], ['channel', channel]].forEach(function (entry) {
      if (entry[1]) url.searchParams.set(entry[0], entry[1]); else url.searchParams.delete(entry[0]);
    });
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  var timer;
  query.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { applyFilters(); saveFilters(); }, 120);
  });
  document.getElementById('watchSearch').addEventListener('submit', function (event) {
    event.preventDefault(); clearTimeout(timer); applyFilters(); saveFilters();
  });
  topics.addEventListener('click', function (event) {
    var button = event.target.closest('[data-topic]');
    if (!button) return;
    selectedTopic = button.dataset.topic; applyFilters(); saveFilters();
  });
  document.getElementById('watchReset').addEventListener('click', function () {
    query.value = ''; channel = ''; selectedTopic = 'all'; applyFilters(); saveFilters(); query.focus();
  });
  document.addEventListener('watch:feed-updated', applyFilters);
  applyFilters();
})();
