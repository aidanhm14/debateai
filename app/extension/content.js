// DebateAI content script.
// Two jobs:
//   1. Answer chrome.runtime selection queries from the SW (used when the
//      keyboard shortcut fires — the SW has no DOM, so it asks us).
//   2. On Google Docs (and Word Online, where right-click is also
//      intercepted), inject a floating "Debate this" pill that surfaces
//      after a copy event. Docs uses canvas rendering, so the standard
//      contextmenu+selection capture doesn't work; the copy event is the
//      most reliable selection signal.

(() => {
  const DOCS_HOSTS = [
    'docs.google.com',
    'office.com',
    'office.live.com',
    'onedrive.live.com',
  ];
  const isDocsLike = DOCS_HOSTS.some((h) => location.hostname.endsWith(h));

  // ── 1. Selection probe ──────────────────────────────────────────
  // The SW asks us for the current selection when Cmd+Shift+D fires.
  // Try DOM selection first; if empty (Docs canvas case), fall back to
  // the most recently-copied text we observed.
  let lastCopiedText = '';
  let lastCopiedAt = 0;

  function readDomSelection() {
    try {
      const s = String(window.getSelection?.() || '').trim();
      return s;
    } catch {
      return '';
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'getSelection') return false;
    let text = readDomSelection();
    if (!text && lastCopiedText && Date.now() - lastCopiedAt < 60_000) {
      text = lastCopiedText;
    }
    sendResponse({ text });
    return true;
  });

  // Capture every copy event at the document level. Docs fires copy via a
  // hidden <iframe class="docs-texteventtarget-iframe">, but the event
  // bubbles up to the top document with `clipboardData` populated.
  document.addEventListener(
    'copy',
    (e) => {
      try {
        const data = e.clipboardData?.getData?.('text/plain') || '';
        const t = data.trim();
        if (!t) return;
        lastCopiedText = t;
        lastCopiedAt = Date.now();
        if (isDocsLike) showPill(t);
      } catch {
        // Some pages strip clipboardData; ignore.
      }
    },
    true,
  );

  // ── 2. Docs floating pill ──────────────────────────────────────
  if (!isDocsLike) return;

  let pillEl = null;
  let pillTimer = null;

  function ensurePill() {
    if (pillEl && document.body.contains(pillEl)) return pillEl;
    const wrap = document.createElement('div');
    wrap.id = 'debateai-ext-pill';
    wrap.className = 'debateai-ext-pill debateai-ext-pill--hidden';
    // 2026-05-19: Counter-this is the primary action on Docs. The whole
    // extension is now positioned as "DebateAI for Google Docs" — the
    // floating pill should default to the same call to action as the
    // right-click menu's top entry ("Counter this argument").
    wrap.innerHTML = `
      <button type="button" class="debateai-ext-pill__btn" data-debateai-action="counter-this">
        <span class="debateai-ext-pill__dot"></span>
        <span class="debateai-ext-pill__label">Counter this argument</span>
      </button>
      <button type="button" class="debateai-ext-pill__btn debateai-ext-pill__btn--ghost" data-debateai-action="defend-this">Defend out loud</button>
      <button type="button" class="debateai-ext-pill__close" data-debateai-action="dismiss" aria-label="Dismiss">×</button>
    `;
    document.documentElement.appendChild(wrap);
    wrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-debateai-action]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const act = btn.getAttribute('data-debateai-action');
      if (act === 'dismiss') {
        hidePill();
        return;
      }
      const text = lastCopiedText;
      if (!text) {
        hidePill();
        return;
      }
      chrome.runtime.sendMessage({
        type: 'open-panel-with-text',
        action: act,
        text,
      });
      hidePill();
    });
    pillEl = wrap;
    return wrap;
  }

  function showPill(text) {
    const el = ensurePill();
    const preview = text.length > 60 ? text.slice(0, 57) + '…' : text;
    const label = el.querySelector('.debateai-ext-pill__label');
    if (label) label.textContent = `Defend: "${preview}"`;
    el.classList.remove('debateai-ext-pill--hidden');
    if (pillTimer) clearTimeout(pillTimer);
    pillTimer = setTimeout(hidePill, 9000);
  }

  function hidePill() {
    if (!pillEl) return;
    pillEl.classList.add('debateai-ext-pill--hidden');
    if (pillTimer) {
      clearTimeout(pillTimer);
      pillTimer = null;
    }
  }

  // ── 2b. Persistent floating action button on Docs ──────────────
  // The copy-event pill (section 2) only appears after the user
  // presses Cmd-C. That's three steps and an unfamiliar gesture for
  // first-time users. A persistent bottom-right anchor button gives
  // them a visible affordance the moment the extension loads on a
  // Docs page. Click flow: if the user has copied something in the
  // last 5 minutes, fire the same defend-this action straight into
  // the panel; otherwise show a 4-second toast telling them to copy
  // their paragraph first.

  const FAB_COPY_FRESHNESS_MS = 5 * 60_000;
  let fabEl = null;
  let fabToastEl = null;
  let fabToastTimer = null;

  function ensureFab() {
    if (fabEl && document.body.contains(fabEl)) return fabEl;
    const wrap = document.createElement('div');
    wrap.id = 'debateai-ext-fab';
    wrap.className = 'debateai-ext-fab';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', 'Defend the selected passage out loud (Counter)');
    wrap.setAttribute('tabindex', '0');
    wrap.innerHTML = `
      <span class="debateai-ext-fab__dot" aria-hidden="true"></span>
      <span class="debateai-ext-fab__label">Defend this out loud</span>
      <span class="debateai-ext-fab__hint">Counter</span>
    `;
    document.documentElement.appendChild(wrap);
    function trigger() {
      const fresh = lastCopiedText && Date.now() - lastCopiedAt < FAB_COPY_FRESHNESS_MS;
      if (fresh) {
        chrome.runtime.sendMessage({
          type: 'open-panel-with-text',
          action: 'defend-this',
          text: lastCopiedText,
        });
      } else {
        showFabToast('Highlight your paragraph + press ⌘C (or Ctrl-C), then click again.');
      }
    }
    wrap.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      trigger();
    });
    wrap.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        trigger();
      }
    });
    fabEl = wrap;
    return wrap;
  }

  function showFabToast(message) {
    if (!fabEl) return;
    if (!fabToastEl) {
      fabToastEl = document.createElement('div');
      fabToastEl.className = 'debateai-ext-fab__toast';
      fabEl.appendChild(fabToastEl);
    }
    fabToastEl.textContent = message;
    fabToastEl.classList.add('is-visible');
    if (fabToastTimer) clearTimeout(fabToastTimer);
    fabToastTimer = setTimeout(() => {
      fabToastEl?.classList.remove('is-visible');
    }, 4200);
  }

  // Wait for body to exist (Docs ships its DOM lazily) before mounting.
  function mountFabWhenReady() {
    if (document.body) {
      ensureFab();
    } else {
      window.addEventListener('DOMContentLoaded', ensureFab, { once: true });
    }
  }
  mountFabWhenReady();

  // ── 3. Universal selection chip ────────────────────────────────
  // Non-Docs pages don't have the canvas-copy problem, but they also
  // don't have any visible affordance — the user has to remember the
  // context menu or Cmd+Shift+D. A small anchored chip appears after a
  // long selection has idled ~800ms, gives a one-tap "Quiz me" path,
  // and disappears the moment the user starts typing / clicks away /
  // selects something different. Suppressed inside form fields so we
  // don't fight the user's own selection toolbar while they compose.

  if (isDocsLike) return; // Docs is already handled by section 2.

  const MIN_SELECTION_CHARS = 40;
  const SELECTION_IDLE_MS = 800;
  const CHIP_DISMISS_COOLDOWN_MS = 30_000;

  let chipEl = null;
  let chipIdleTimer = null;
  let chipDismissedUntil = 0;
  let chipCurrentText = '';

  function isEditableTarget(node) {
    if (!node) return false;
    const n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    if (!n || !n.closest) return false;
    return !!n.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  function ensureChip() {
    if (chipEl && document.body.contains(chipEl)) return chipEl;
    const wrap = document.createElement('div');
    wrap.id = 'debateai-sel-chip';
    wrap.className = 'is-hidden';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', 'Quiz me on the selected passage');
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const hotkey = isMac ? '⌘⇧D' : 'Ctrl+Shift+D';
    wrap.innerHTML = `
      <span class="debateai-sel-chip__dot" aria-hidden="true"></span>
      <span class="debateai-sel-chip__label">Quiz me</span>
      <span class="debateai-sel-chip__hotkey">${hotkey}</span>
      <button type="button" class="debateai-sel-chip__close" aria-label="Dismiss" data-action="dismiss">×</button>
    `;
    document.documentElement.appendChild(wrap);
    wrap.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
    });
    wrap.addEventListener('click', (ev) => {
      const closeBtn = ev.target.closest('[data-action="dismiss"]');
      if (closeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        chipDismissedUntil = Date.now() + CHIP_DISMISS_COOLDOWN_MS;
        hideChip();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (!chipCurrentText) {
        hideChip();
        return;
      }
      chrome.runtime.sendMessage({
        type: 'open-panel-with-text',
        action: 'quiz-me',
        text: chipCurrentText,
      });
      hideChip();
    });
    chipEl = wrap;
    return wrap;
  }

  function positionChip(rect) {
    if (!chipEl) return;
    const margin = 8;
    const chipW = chipEl.offsetWidth || 160;
    const chipH = chipEl.offsetHeight || 28;
    // Anchor: top-right of the selection rect by default. If that
    // overflows the viewport top, flip to bottom-right of the rect.
    let top = rect.top - chipH - margin;
    let left = rect.right - chipW;
    if (top < margin) top = rect.bottom + margin;
    // Clamp horizontally.
    left = Math.max(margin, Math.min(left, window.innerWidth - chipW - margin));
    // If the resulting bottom would go offscreen, clamp.
    if (top + chipH > window.innerHeight - margin) {
      top = window.innerHeight - chipH - margin;
    }
    chipEl.style.top = `${Math.round(top)}px`;
    chipEl.style.left = `${Math.round(left)}px`;
  }

  function showChip(text, rect) {
    if (Date.now() < chipDismissedUntil) return;
    chipCurrentText = text;
    const el = ensureChip();
    positionChip(rect);
    el.classList.remove('is-hidden');
  }

  function hideChip() {
    if (!chipEl) return;
    chipEl.classList.add('is-hidden');
  }

  function evaluateSelection() {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideChip();
      return;
    }
    const range = sel.getRangeAt(0);
    if (isEditableTarget(range.commonAncestorContainer)) {
      hideChip();
      return;
    }
    const text = String(sel).trim();
    if (text.length < MIN_SELECTION_CHARS) {
      hideChip();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideChip();
      return;
    }
    showChip(text, rect);
  }

  function scheduleEvaluate() {
    if (chipIdleTimer) clearTimeout(chipIdleTimer);
    chipIdleTimer = setTimeout(evaluateSelection, SELECTION_IDLE_MS);
  }

  // Selection changes fire on every keystroke / drag tick. Debounce.
  document.addEventListener('selectionchange', scheduleEvaluate, true);
  // The user is actively dragging a selection — chip would jitter, hide it.
  document.addEventListener('mousedown', (ev) => {
    if (chipEl && chipEl.contains(ev.target)) return;
    hideChip();
  }, true);
  // Scroll invalidates the anchored position. Cheaper to hide than
  // recompute on every scroll tick; the chip will return when the user
  // stops scrolling and the selection is still live.
  document.addEventListener('scroll', () => {
    if (chipEl && !chipEl.classList.contains('is-hidden')) hideChip();
    scheduleEvaluate();
  }, { capture: true, passive: true });
  // Hide on Escape — standard dismiss affordance.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      hideChip();
      chipDismissedUntil = Date.now() + CHIP_DISMISS_COOLDOWN_MS;
    }
  }, true);
})();
