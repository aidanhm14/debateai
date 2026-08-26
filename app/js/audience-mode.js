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
 *
 * Plain-copy swaps: an element carrying data-plain="simpler wording" shows
 * that wording when the visitor said they are new (or unsure), and keeps its
 * authored debate-register text for competitive visitors and for anyone who
 * never answered. The authored text is stashed on the element so the swap
 * reverses cleanly when the answer changes.
 *
 * Intent is the second half of the same question, asked only of someone who
 * said they do not compete: do they want to LEARN competitive debate, or do
 * they just want to ARGUE. "New to debate" answers how much vocabulary to
 * use; it does not answer whether the person wants to be taught any. Both
 * answers are plain-language visitors, and they want opposite things from
 * a term like "warrant": the learner wants it named and explained once, the
 * arguer wants it gone. Lands on <html> as data-debate-intent="learn|argue"
 * and syncs across devices through prefs-sync.js.
 */
(function () {
  'use strict';
  if (window.__debatableAudienceMode) return;
  window.__debatableAudienceMode = true;

  var KEY = 'debateos-experience';
  var VALID = { competitive: 1, new: 1, unsure: 1 };
  var INTENT_KEY = 'debateos-intent';
  var INTENTS = { learn: 1, argue: 1 };
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

  /* ── Plain-language glossary ──────────────────────────────────────
   * 2026-08-26, the founder: choosing "competitive" or "new" has to
   * actually change how things are articulated, and the target audience
   * is NOT competitive debaters, who already have squads and rounds.
   *
   * Only 20 data-plain annotations existed across three pages, so for
   * almost every visitor the answer changed nothing. Hand-annotating a
   * 100-page site does not converge, so the common vocabulary is handled
   * here and data-plain stays for sentences that need real rewriting.
   *
   * This runs ONLY for visitors who said they are new or unsure.
   * Competitive visitors, and anyone who never answered, see the
   * authored words untouched — the precision is the point for them.
   *
   * Rules that keep an automatic find-and-replace from going wrong:
   *  - Longest phrases first, so "speaker points" is consumed before
   *    "points" could ever be looked at.
   *  - Word boundaries, and only terms whose debate sense dominates on
   *    this site. Deliberately NOT included: "flow" (flow of the
   *    argument), "case" (in case, lower case), "round" (round number),
   *    "impact" and "spread" — each has a common English sense that
   *    appears on these pages, and a wrong swap is worse than a jargon
   *    word a reader can look up.
   *  - Capitalisation of the original's first letter is preserved.
   *  - Originals are kept in a WeakMap so switching the answer back
   *    restores the authored wording exactly rather than approximating
   *    it with a reverse map, which would not round-trip.
   */
  var GLOSSARY = [
    ['points of information', 'interruptions'],
    ['point of information', 'an interruption'],
    ['speaker points', 'speaking scores'],
    ['reason for decision', 'the reasons behind the result'],
    ['constructive speech', 'opening speech'],
    ['rebuttal speech', 'response speech'],
    ['judge paradigm', 'what the judge rewards'],
    ['the motion', 'the topic'],
    ['a motion', 'a topic'],
    ['motions', 'topics'],
    ['rebuttals', 'responses'],
    ['rebuttal', 'response'],
    ['the ballot', 'the result'],
    ['prelims', 'the early rounds'],
    // Short, because RFD is usually a LABEL rather than prose and the
    // long gloss ("the reasons behind the result") overflowed a small
    // uppercase heading when this was measured on /how-it-works.
    ['RFD', 'the decision'],
    ['POIs', 'interruptions'],
    ['POI', 'an interruption'],
  ];

  /* Surfaces where the glossary must NOT run. These publish promises
   * people are held to — the judge charter, the tournament rules, the
   * legal pages — and two visitors reading materially different wording
   * of the same rule is a problem no amount of readability is worth.
   * The acronym expansion above is fine there (it only spells out what
   * the abbreviation already said); substituting a different word is
   * not. */
  var NO_GLOSSARY = /^\/(tournament-rules|judge-integrity|terms|privacy|judge-charter|learn)(\.html)?$/;

  /* Why /learn is on that list, since it is the page a newcomer most
   * obviously needs plain language on. It is the format GUIDE: the
   * terms are the subject being taught, not incidental vocabulary.
   * Measured there before this was added, the glossary retitled the
   * lesson "03 Rebuttal" to "03 Response" and turned the link "BP POIs"
   * into "BP Interruptions", which teaches a reader the wrong name for
   * the thing they came to learn about. Replacing a word is right when
   * the word is in the way and wrong when the word IS the lesson.
   * Pages that teach vocabulary belong here; pages that merely use it
   * do not. */

  function glossaryAllowed() {
    var path = (location.pathname || '/').replace(/\/$/, '') || '/';
    return !NO_GLOSSARY.test(path);
  }

  var originals = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function applyGlossary(value) {
    var out = value, hit = false;
    for (var i = 0; i < GLOSSARY.length; i++) {
      var term = GLOSSARY[i][0], plainWord = GLOSSARY[i][1];
      var re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b',
                          term === term.toUpperCase() ? 'g' : 'gi');
      out = out.replace(re, function (m) {
        hit = true;
        // Keep the original's opening case so a term that started a
        // sentence does not come back lowercase mid-paragraph.
        return (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase())
          ? plainWord.charAt(0).toUpperCase() + plainWord.slice(1)
          : plainWord;
      });
    }
    return hit ? out : null;
  }

  function glossaryNode(node) {
    if (!originals || !eligible(node)) return;
    var wantPlain = plainActive() && glossaryAllowed();
    if (wantPlain) {
      if (originals.has(node)) return;
      var next = applyGlossary(node.nodeValue);
      if (next != null && next !== node.nodeValue) {
        originals.set(node, node.nodeValue);
        node.nodeValue = next;
      }
    } else if (originals.has(node)) {
      node.nodeValue = originals.get(node);
      originals['delete'](node);
    }
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
    if (document.body) {
      swapPlainCopy(document.body);
      normalize(document.body);
    }
    try { window.dispatchEvent(new CustomEvent('debatable:experience', { detail: { value: value } })); } catch (e) {}
  }

  function readIntent() {
    try {
      var value = localStorage.getItem(INTENT_KEY) || '';
      return INTENTS[value] ? value : '';
    } catch (e) { return ''; }
  }

  function applyIntent(value) {
    if (INTENTS[value]) document.documentElement.setAttribute('data-debate-intent', value);
    else document.documentElement.removeAttribute('data-debate-intent');
  }

  function setIntent(value) {
    if (!INTENTS[value]) return;
    try { localStorage.setItem(INTENT_KEY, value); } catch (e) {}
    applyIntent(value);
    try { window.dispatchEvent(new CustomEvent('debatable:intent', { detail: { value: value } })); } catch (e) {}
  }

  function plainActive() {
    var v = read();
    return v === 'new' || v === 'unsure';
  }

  function swapPlainCopy(root) {
    var scope = root && root.nodeType === 1 ? root : document.body;
    if (!scope || !scope.querySelectorAll) return;
    var els = Array.prototype.slice.call(scope.querySelectorAll('[data-plain]'));
    if (scope !== document.body && scope.matches && scope.matches('[data-plain]')) els.push(scope);
    var wantPlain = plainActive();
    els.forEach(function (el) {
      var plain = el.getAttribute('data-plain');
      if (!plain) return;
      if (wantPlain) {
        if (el.getAttribute('data-plain-on') === '1') return;
        el.setAttribute('data-comp-text', el.textContent);
        el.textContent = plain;
        el.setAttribute('data-plain-on', '1');
      } else if (el.getAttribute('data-plain-on') === '1') {
        var original = el.getAttribute('data-comp-text');
        if (original != null) el.textContent = original;
        el.removeAttribute('data-plain-on');
      }
    });
  }

  function eligible(node) {
    var parent = node && node.parentElement;
    if (!parent) return false;
    // [data-plain] is excluded because that element's copy is owned by
    // swapPlainCopy, and letting both mechanisms write the same node
    // corrupts the revert. Measured: the glossary turned the nav label
    // "Browse motions" into "Browse topics" FIRST, then swapPlainCopy
    // stashed that already-rewritten string as the competitive original,
    // so switching back to competitive restored "Browse topics" and the
    // authored label was gone for the rest of the session. One owner per
    // element; the authored text is the source of truth.
    return !parent.closest('script,style,textarea,input,select,option,code,pre,[data-keep-debate-acronym],[data-plain]');
  }

  function normalize(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (eligible(root)) {
        var next = plainMotion(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
        // Acronym expansion above runs for everyone; the glossary only
        // for visitors who said they are new, and it no-ops back to the
        // authored wording when that answer changes.
        glossaryNode(root);
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
    getIntent: readIntent,
    setIntent: setIntent,
    // True only for someone who is not a competitor AND asked to be taught.
    // A competitor never answered this question, so never read them as
    // wanting the beginner tour.
    wantsToLearn: function () { return plainActive() && readIntent() === 'learn'; },
    isCompetitive: function () { return read() === 'competitive'; },
    isPlain: plainActive,
    plainMotion: plainMotion,
  };

  apply(read());
  applyIntent(readIntent());
  function start() {
    normalize(document.body);
    swapPlainCopy(document.body);
    if (!document.body || !window.MutationObserver) return;
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'characterData') normalize(record.target);
        else Array.prototype.forEach.call(record.addedNodes || [], function (node) {
          normalize(node);
          if (node.nodeType === 1) swapPlainCopy(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
