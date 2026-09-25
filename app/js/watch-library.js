(function () {
  'use strict';
  var root = document.documentElement;
  var mode = root.getAttribute('data-watch-view') || 'all';
  var params = new URLSearchParams(location.search);
  var channel = params.get('channel') || '';
  var query = document.getElementById('watchQuery');
  var topics = document.getElementById('watchTopics');
  var selectedTopic = 'all';
  var collection = 'all';
  var collections = document.getElementById('watchCollections');
  var collectionNames = { all: 'Worth an argument', college: 'APDA & college rounds', parliamentary: 'Parliamentary finals', highschool: 'High school rounds', philosophers: 'Philosophers disagree', streamers: 'Twitch debate archives' };
  if (Object.prototype.hasOwnProperty.call(collectionNames, params.get('collection'))) collection = params.get('collection');
  var expanded = false;
  var more = document.getElementById('watchMore');
  var examples = document.getElementById('watch-learn');
  var replays = document.querySelector('.watch-rail');
  var result = document.getElementById('watchResultCount');
  var empty = document.getElementById('watchEmpty');
  var title = document.getElementById('examplesTitle');
  query.value = params.get('q') || '';
  Array.prototype.forEach.call(document.querySelectorAll('[data-watch-nav]'), function (link) {
    if (link.getAttribute('data-watch-nav') === mode) link.setAttribute('aria-current', 'page');
  });
  var allowedTopics = ['all', 'technology', 'money', 'culture', 'life', 'philosophy', 'short'];
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
    categories.philosophy = /\b(consciousness|existence|ethics|moral|morally|free will|god|reality|personhood)\b/;
    if (selectedTopic === 'culture') return !categories.technology.test(words) && !categories.money.test(words) && !categories.life.test(words);
    return categories[selectedTopic].test(words);
  }
  function filterCards(selector, enabled, limit) {
    var shown = 0;
    var words = normal(query.value).trim().split(/\s+/).filter(Boolean);
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (card) {
      var searchable = normal(card.textContent);
      var match = enabled && (collection === 'all' || card.dataset.collection === collection) && (!channel || card.dataset.channel === channel) && matchesTopic(card) && words.every(function (word) { return searchable.indexOf(word) !== -1; });
      if (match) shown++;
      card.hidden = !match || shown > limit;
    });
    return shown;
  }
  function applyFilters() {
    var filtering = !!(query.value.trim() || selectedTopic !== 'all' || channel || collection !== 'all');
    var preview = mode === 'all' && !filtering;
    var exLimit = preview && !expanded ? 9 : Infinity;
    var exCount = filterCards('#examplesGrid .yt-card', mode === 'all' || mode === 'youtube', exLimit);
    var rpCount = filterCards('#replaysGrid .card', mode === 'all' || mode === 'debatable', preview ? 2 : Infinity);
    examples.hidden = (mode !== 'all' && mode !== 'youtube') || exCount === 0;
    replays.hidden = (mode !== 'all' && mode !== 'debatable') || (filtering && rpCount === 0);
    document.getElementById('watchReset').hidden = !filtering || mode === 'live';
    empty.hidden = !filtering || exCount + rpCount > 0 || mode === 'live';
    result.textContent = filtering ? (exCount + rpCount) + ((exCount + rpCount) === 1 ? ' video' : ' videos') + (channel ? ' from ' + channel : '') : '';
    title.textContent = channel || (collection !== 'all' ? collectionNames[collection] : mode === 'youtube' ? 'Example debates' : 'Worth an argument');
    more.hidden = exCount <= exLimit;
    more.textContent = 'Show all ' + exCount + ' example debates';
    collections.hidden = mode === 'debatable' || mode === 'live';
    document.getElementById('twitchSources').hidden = collection !== 'streamers' || mode === 'debatable' || mode === 'live';
    Array.prototype.forEach.call(collections.querySelectorAll('[data-collection-filter]'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.collectionFilter === collection));
    });
    Array.prototype.forEach.call(topics.querySelectorAll('[data-topic]'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.topic === selectedTopic));
    });
  }
  function saveFilters() {
    var url = new URL(location.href);
    [['q', query.value.trim()], ['topic', selectedTopic === 'all' ? '' : selectedTopic], ['channel', channel], ['collection', collection === 'all' ? '' : collection]].forEach(function (entry) {
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
  collections.addEventListener('click', function (event) {
    var button = event.target.closest('[data-collection-filter]');
    if (!button) return;
    collection = button.dataset.collectionFilter;
    channel = ''; applyFilters(); saveFilters();
  });
  more.addEventListener('click', function () {
    expanded = true; applyFilters();
    var next = document.querySelectorAll('#examplesGrid .yt-card')[9];
    if (next) next.focus();
  });
  document.getElementById('watchReset').addEventListener('click', function () {
    query.value = ''; channel = ''; selectedTopic = 'all'; collection = 'all'; expanded = false; applyFilters(); saveFilters(); query.focus();
  });
  document.addEventListener('watch:feed-updated', applyFilters);
  applyFilters();
})();
