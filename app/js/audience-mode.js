/* Audience mode + plain-language debate copy.
 *
 * New accounts say whether they already do competitive debate. That answer
 * follows the account through prefs-sync.js and lands on <html> as
 * data-debate-experience="competitive|new|unsure", giving any page a stable
 * hook for selective copy and layout.
 *
 * Motion acronyms are never useful to a first-time visitor. Expand them in
 * visible page copy for everyone, including content rendered after load.
 * Inputs are left alone so we never rewrite something while a person types.
 */
(function () {
  'use strict';
  if (window.__debatableAudienceMode) return;
  window.__debatableAudienceMode = true;

  var KEY = 'debateos-experience';
  var VALID = { competitive: 1, new: 1, unsure: 1 };
  var replacements = [
    [/^(\s*)THBT\b\.?\s*/i, '$1This House believes that '],
    [/^(\s*)THBR\b\.?\s*/i, '$1This House believes it regrets '],
    [/^(\s*)THW\b\.?\s*/i, '$1This House would '],
    [/^(\s*)THR\b\.?\s*/i, '$1This House regrets '],
    [/^(\s*)THS\b\.?\s*/i, '$1This House supports '],
    [/^(\s*)THO\b\.?\s*/i, '$1This House opposes '],
    [/^(\s*)THP\b\.?\s*/i, '$1This House prefers '],
    [/^(\s*)TH\b\.?\s*/i, '$1This House '],
  ];

  function plainMotion(value) {
    var text = String(value == null ? '' : value);
    if (!/^\s*TH(?:BT|BR|W|R|S|O|P)?\b/i.test(text)) return text;
    for (var i = 0; i < replacements.length; i++) {
      if (replacements[i][0].test(text)) return text.replace(replacements[i][0], replacements[i][1]);
    }
    return text;
  }

  function read() {
    try {
      var value = localStorage.getItem(KEY) || '';
      return VALID[value] ? value : '';
    } catch (e) { return ''; }
  }

  function apply(value) {
    if (VALID[value]) document.documentElement.setAttribute('data-debate-experience', value);
    else document.documentElement.removeAttribute('data-debate-experience');
  }

  function set(value) {
    if (!VALID[value]) return;
    try { localStorage.setItem(KEY, value); } catch (e) {}
    apply(value);
    try { window.dispatchEvent(new CustomEvent('debatable:experience', { detail: { value: value } })); } catch (e) {}
  }

  function eligible(node) {
    var parent = node && node.parentElement;
    if (!parent) return false;
    return !parent.closest('script,style,textarea,input,select,option,code,pre,[data-keep-debate-acronym]');
  }

  function normalize(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (eligible(root)) {
        var next = plainMotion(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
      }
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) normalize(node);
  }

  window.DebatableAudience = {
    get: read,
    set: set,
    isCompetitive: function () { return read() === 'competitive'; },
    plainMotion: plainMotion,
  };

  apply(read());
  function start() {
    normalize(document.body);
    if (!document.body || !window.MutationObserver) return;
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'characterData') normalize(record.target);
        else Array.prototype.forEach.call(record.addedNodes || [], normalize);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
