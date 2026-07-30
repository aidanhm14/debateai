/* ─────────────────────────────────────────────────────────────
 * ARCADE MENU — keyboard driver for the option-select surfaces.
 *
 * WHAT IT DOES
 * Turns a container of [data-arc-opt] buttons into a real radio group:
 * roving tabindex, arrow keys across a wrapped grid, Home/End, typeahead,
 * Enter/Space to choose. Fires `arc:change` on the group with the picked
 * value so the page can react without knowing any of this.
 *
 * WHY IT IS PLAIN JS AND WHY IT IS SMALL
 * It has to run on spar.html (string-built DOM), engines.html (static),
 * and inside React trees on practice.html. Anything that owns rendering
 * cannot do that, so this owns only focus and selection state and reads
 * the DOM as the source of truth. Options can be re-rendered underneath
 * it at any time; nothing is cached across calls.
 *
 * PROGRESSIVE ENHANCEMENT, NOT A DEPENDENCY. Clicking works with this
 * file absent, because the options are buttons and the page wires click
 * itself. If this fails to load, the menu degrades to a mouse-only
 * menu rather than to a dead one. That is deliberate: a keyboard nicety
 * must never be load-bearing for starting a round.
 *
 * GRID ARITHMETIC, the part worth reading. Up and Down cannot be
 * "index plus one row" because the row length changes with the
 * viewport, and a hardcoded column count means arrow keys jump wrong on
 * a phone. Columns are measured from the live layout by counting how
 * many options share the first row's offsetTop. Re-measured on every
 * keypress, so a resize mid-menu is already handled.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var TYPEAHEAD_MS = 700;

  function opts(group) {
    return Array.prototype.filter.call(
      group.querySelectorAll('[data-arc-opt]'),
      function (el) {
        // A disabled option is skipped by the keyboard but still
        // reachable by mouse and still readable by a screen reader. It
        // is visible-but-not-choosable, not hidden.
        return !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null;
      }
    );
  }

  /* Count options on the first visual row. Returns at least 1 so the
     caller can divide by it without guarding. */
  function columns(list) {
    if (list.length < 2) return 1;
    var top = list[0].offsetTop;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].offsetTop !== top) break;
      n++;
    }
    return n || 1;
  }

  function focusAt(list, i) {
    if (!list.length) return;
    // Wrap rather than clamp. In a menu, holding an arrow key should
    // cycle; stopping dead at the last card reads as a broken key.
    var idx = ((i % list.length) + list.length) % list.length;
    var el = list[idx];
    list.forEach(function (o) { o.tabIndex = o === el ? 0 : -1; });
    el.focus();
  }

  function select(group, el, viaKeyboard) {
    var all = Array.prototype.slice.call(group.querySelectorAll('[data-arc-opt]'));
    var multi = group.getAttribute('data-arc-multi') === 'true';

    if (multi) {
      var on = el.getAttribute('aria-checked') === 'true';
      el.setAttribute('aria-checked', on ? 'false' : 'true');
    } else {
      all.forEach(function (o) { o.setAttribute('aria-checked', o === el ? 'true' : 'false'); });
    }

    var chosen = all.filter(function (o) { return o.getAttribute('aria-checked') === 'true'; })
      .map(function (o) { return o.getAttribute('data-arc-value') || ''; });

    group.dispatchEvent(new CustomEvent('arc:change', {
      bubbles: true,
      detail: {
        value: multi ? chosen : (chosen[0] || ''),
        values: chosen,
        name: group.getAttribute('data-arc-menu') || '',
        el: el,
        viaKeyboard: !!viaKeyboard,
      },
    }));
  }

  function onKey(e) {
    var group = e.currentTarget;
    var el = e.target.closest && e.target.closest('[data-arc-opt]');
    if (!el) return;

    var list = opts(group);
    var i = list.indexOf(el);
    if (i < 0) return;
    var cols = columns(list);
    var next = null;

    switch (e.key) {
      case 'ArrowRight': case 'Right': next = i + 1; break;
      case 'ArrowLeft': case 'Left': next = i - 1; break;
      case 'ArrowDown': case 'Down': next = i + cols; break;
      case 'ArrowUp': case 'Up': next = i - cols; break;
      case 'Home': next = 0; break;
      case 'End': next = list.length - 1; break;
      case 'Enter': case ' ': case 'Spacebar':
        e.preventDefault();
        select(group, el, true);
        return;
      default:
        // Typeahead. Jump to the next option whose label starts with the
        // typed run. Single printable characters only, so it cannot eat
        // a shortcut with a modifier held.
        if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          var now = Date.now();
          if (!group.__arcBuf || now - group.__arcAt > TYPEAHEAD_MS) group.__arcBuf = '';
          group.__arcAt = now;
          group.__arcBuf += e.key.toLowerCase();
          var buf = group.__arcBuf;
          for (var k = 1; k <= list.length; k++) {
            var cand = list[(i + k) % list.length];
            var label = (cand.getAttribute('data-arc-label') || cand.textContent || '').trim().toLowerCase();
            if (label.indexOf(buf) === 0) {
              e.preventDefault();
              group.setAttribute('data-kbd-used', '1');
              focusAt(list, list.indexOf(cand));
              return;
            }
          }
        }
        return;
    }

    e.preventDefault();
    // Surface the keyboard hint only now that a key has been used.
    var shell = group.closest('.arc');
    if (shell) shell.setAttribute('data-kbd', '1');
    focusAt(list, next);

    // Roving focus alone does not choose. In a single-select menu that
    // would mean arrowing past an option silently commits it, which is
    // how people end up in the wrong format. Selection stays on Enter.
  }

  function wire(group) {
    if (group.__arcWired) return;
    group.__arcWired = true;

    if (!group.getAttribute('role')) {
      group.setAttribute('role', group.getAttribute('data-arc-multi') === 'true' ? 'group' : 'radiogroup');
    }

    Array.prototype.forEach.call(group.querySelectorAll('[data-arc-opt]'), function (el, i) {
      if (!el.getAttribute('role')) {
        el.setAttribute('role', group.getAttribute('data-arc-multi') === 'true' ? 'checkbox' : 'radio');
      }
      if (!el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', 'false');
      // Exactly one option is tab-reachable, which is what makes a radio
      // group one tab stop instead of fifteen.
      el.tabIndex = i === 0 ? 0 : -1;
    });

    // A pre-selected option owns the tab stop instead of the first card.
    var checked = group.querySelector('[data-arc-opt][aria-checked="true"]');
    if (checked) {
      Array.prototype.forEach.call(group.querySelectorAll('[data-arc-opt]'), function (o) { o.tabIndex = -1; });
      checked.tabIndex = 0;
    }

    group.addEventListener('keydown', onKey);
    group.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-arc-opt]');
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (!group.contains(el)) return;
      select(group, el, false);
    });
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-arc-menu]'), wire);
  }

  // Public surface, kept minimal. `scan` is the one thing callers need
  // after they render options themselves.
  window.ArcadeMenu = {
    scan: scan,
    wire: wire,
    /* Set selection from code without firing a change event, for
       restoring a saved pick on load. Firing here would make a restore
       indistinguishable from a user choice in analytics. */
    set: function (group, value) {
      if (!group) return;
      Array.prototype.forEach.call(group.querySelectorAll('[data-arc-opt]'), function (o) {
        var on = (o.getAttribute('data-arc-value') || '') === value;
        o.setAttribute('aria-checked', on ? 'true' : 'false');
        o.tabIndex = on ? 0 : -1;
      });
    },
    /* Step rail state. Kept here so every flow renders the rail the
       same way rather than each page inventing its own. */
    steps: function (rail, currentIndex) {
      if (!rail) return;
      Array.prototype.forEach.call(rail.querySelectorAll('.arc-step'), function (s, i) {
        s.setAttribute('data-state', i < currentIndex ? 'done' : (i === currentIndex ? 'now' : 'next'));
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(document); });
  } else {
    scan(document);
  }
})();
