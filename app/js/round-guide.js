(function () {
  'use strict';
  var tabs = Array.from(document.querySelectorAll('[data-guide-step]'));
  var panels = Array.from(document.querySelectorAll('.guide-panel'));
  function choose(index, focus) {
    tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { choose(index, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      choose(next, true);
    });
  });
  function followHash() {
    var target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    var index = panels.indexOf(target);
    if (index !== -1) choose(index, false);
    if (target.tagName === 'DETAILS') target.open = true;
  }
  choose(0, false);
  followHash();
  window.addEventListener('hashchange', followHash);
})();
