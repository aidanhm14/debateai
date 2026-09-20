(function () {
  'use strict';
  var rows = Array.from(document.querySelectorAll('.topic-row'));
  var filters = Array.from(document.querySelectorAll('[data-topic-filter]'));
  var search = document.getElementById('topicSearch');
  var count = document.getElementById('topicCount');
  var empty = document.getElementById('topicEmpty');
  var surprise = document.getElementById('topicSurprise');
  var category = 'all';
  function visibleRows() { return rows.filter(function (row) { return !row.hidden; }); }
  function filter() {
    var words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    rows.forEach(function (row) {
      var text = row.querySelector('summary').textContent.toLowerCase();
      row.hidden = (category !== 'all' && row.dataset.category !== category) || !words.every(function (word) { return text.indexOf(word) !== -1; });
      if (row.hidden) row.open = false;
    });
    var total = visibleRows().length;
    count.textContent = total + (total === 1 ? ' topic' : ' topics');
    empty.hidden = total !== 0;
    surprise.disabled = total === 0;
  }
  filters.forEach(function (button) {
    button.addEventListener('click', function () {
      category = button.dataset.topicFilter;
      filters.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      filter();
    });
  });
  search.addEventListener('input', filter);
  document.getElementById('topicReset').addEventListener('click', function () {
    search.value = '';
    filters[0].click();
    search.focus();
  });
  rows.forEach(function (row) {
    row.addEventListener('toggle', function () {
      if (row.open) rows.forEach(function (other) { if (other !== row) other.open = false; });
    });
  });
  surprise.addEventListener('click', function () {
    var candidates = visibleRows();
    var closed = candidates.filter(function (row) { return !row.open; });
    if (closed.length) candidates = closed;
    if (!candidates.length) return;
    var selected = candidates[Math.floor(Math.random() * candidates.length)];
    rows.forEach(function (row) { row.open = row === selected; });
    selected.querySelector('summary').focus({ preventScroll: true });
    selected.scrollIntoView({ behavior: 'auto', block: 'center' });
  });
  function followHash() {
    var deepLink = document.getElementById(location.hash.slice(1));
    if (!deepLink || !deepLink.classList.contains('topic-row')) return;
    search.value = '';
    filters[0].click();
    rows.forEach(function (row) { row.open = row === deepLink; });
    deepLink.scrollIntoView({ block: 'start' });
  }
  filter();
  followHash();
  window.addEventListener('hashchange', followHash);
})();
