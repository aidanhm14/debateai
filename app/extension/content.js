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
    wrap.innerHTML = `
      <button type="button" class="debateai-ext-pill__btn" data-debateai-action="quiz-me">
        <span class="debateai-ext-pill__dot"></span>
        <span class="debateai-ext-pill__label">Quiz me</span>
      </button>
      <button type="button" class="debateai-ext-pill__btn debateai-ext-pill__btn--ghost" data-debateai-action="defend-this">Defend</button>
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
    if (label) label.textContent = `Quiz me: "${preview}"`;
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
})();
