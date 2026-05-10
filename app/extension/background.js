// DebateAI extension service worker.
// Owns: context-menu setup, command shortcuts, side-panel opening, and
// queueing actions for the side panel to drain on load. Stays small —
// MV3 service workers get killed aggressively, so anything stateful goes
// through chrome.storage.session.

const APP_URL = 'https://debateai.com/debate-ai.html?ext=1';

// Open side panel when user clicks the toolbar icon. Without this, the
// click does nothing on most Chrome versions.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn('[debateai-ext] sidePanel.setPanelBehavior', e));

chrome.runtime.onInstalled.addListener(() => {
  // Three context-menu entries for selected text. The action determines
  // which mode the side panel will steer the user toward (debate / rebut /
  // case-prep), but all three currently land on the setup screen with
  // motion prefilled — the user picks their format and brain there.
  const items = [
    { id: 'debate-this', title: 'Debate this with DebateAI', contexts: ['selection'] },
    { id: 'rebut-this', title: 'Rebut this argument', contexts: ['selection'] },
    { id: 'case-prep', title: 'Build a case from this', contexts: ['selection'] },
    { id: 'sep-1', type: 'separator', contexts: ['selection'] },
    { id: 'open-panel', title: 'Open DebateAI side panel', contexts: ['action', 'page'] },
  ];
  for (const item of items) {
    chrome.contextMenus.create(item, () => {
      // Swallow duplicate-id errors on reload
      if (chrome.runtime.lastError) {
        // no-op
      }
    });
  }
});

async function queueAction(payload) {
  await chrome.storage.session.set({ pendingAction: { ...payload, queuedAt: Date.now() } });
}

async function openPanelInWindow(windowId) {
  if (!windowId) return;
  try {
    await chrome.sidePanel.open({ windowId });
  } catch (e) {
    console.warn('[debateai-ext] sidePanel.open failed', e);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = String(info.menuItemId || '');
  if (action === 'open-panel') {
    await openPanelInWindow(tab?.windowId);
    return;
  }
  const text = (info.selectionText || '').trim();
  await queueAction({
    action,
    text,
    sourceUrl: tab?.url || '',
    sourceTitle: tab?.title || '',
  });
  await openPanelInWindow(tab?.windowId);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'debate-selection' && command !== 'rebut-selection') return;
  const action = command === 'rebut-selection' ? 'rebut-this' : 'debate-this';
  let text = '';
  if (tab?.id != null) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'getSelection' });
      text = (res?.text || '').trim();
    } catch (e) {
      // Content script not present (chrome:// pages, store, etc.) — open
      // the panel anyway so the user can paste manually.
    }
  }
  await queueAction({
    action,
    text,
    sourceUrl: tab?.url || '',
    sourceTitle: tab?.title || '',
  });
  await openPanelInWindow(tab?.windowId);
});

// Content scripts can ask the SW to open the panel + queue text directly
// (used by the Docs floating pill, where the content script already has
// the freshly-copied text in hand from the copy event).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'open-panel-with-text') {
    (async () => {
      const windowId = sender?.tab?.windowId;
      await queueAction({
        action: msg.action || 'debate-this',
        text: (msg.text || '').trim(),
        sourceUrl: sender?.tab?.url || '',
        sourceTitle: sender?.tab?.title || '',
      });
      await openPanelInWindow(windowId);
      sendResponse({ ok: true });
    })();
    return true; // keep the channel open for async sendResponse
  }
  return false;
});
