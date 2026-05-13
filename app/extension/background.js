// DebateAI extension service worker.
// Owns: context-menu setup, command shortcuts, side-panel opening, and
// queueing actions for the side panel to drain on load. Also owns the
// Google Docs API auth + read path (Stage 1 of the Counter agent).
// Stays small — MV3 service workers get killed aggressively, so anything
// stateful goes through chrome.storage.session.

import {
  getAuthToken,
  clearAuthToken,
  getUserEmail,
  readDoc,
  docToPlainText,
  parseDocId,
  getDocTitle,
  applyReplaceAllText,
} from './lib/docs-api.js';

// Where the agent sends its proposal request. The Netlify function at
// /api/docs-agent calls Claude with one tool (propose_edit) and returns
// {tool, input:{containsText, replaceText, reason}}.
const DOCS_AGENT_URL = 'https://debateai.com/api/docs-agent';

const APP_URL = 'https://debateai.com/debate-ai.html?ext=1';

// Open side panel when user clicks the toolbar icon. Without this, the
// click does nothing on most Chrome versions.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn('[debateai-ext] sidePanel.setPanelBehavior', e));

chrome.runtime.onInstalled.addListener(() => {
  // Four context-menu entries for selected text. Each action signals a
  // different framing to the side panel:
  //   lint-this   -> "Open the linter on this passage" (Grammarly-style
  //                  structural critique — no voice round, no AI debater,
  //                  just claim/warrant/impact + suggested rephrasings).
  //   quiz-me     -> "AI, quiz me on this passage" (study-test framing)
  //   cross-exam  -> "AI, defend the opposite; I'll cross-examine you back"
  //   defend-this -> "I'll defend; AI cross-examines me" (oral-exam framing)
  // Lint routes to /linter.html in the iframe; the other three route to
  // the voice round (default) or typed flow.
  const items = [
    { id: 'lint-this', title: 'Lint this argument (claim / warrant / impact)', contexts: ['selection'] },
    { id: 'quiz-me', title: 'Quiz me on this passage', contexts: ['selection'] },
    { id: 'defend-this', title: 'Defend this out loud (cross-exam)', contexts: ['selection'] },
    { id: 'cross-exam', title: 'Cross-examine the AI on this', contexts: ['selection'] },
    { id: 'sep-1', type: 'separator', contexts: ['selection'] },
    { id: 'open-panel', title: 'Open Counter side panel', contexts: ['action', 'page'] },
  ];
  for (const item of items) {
    chrome.contextMenus.create(item, () => {
      // Swallow duplicate-id errors on reload
      if (chrome.runtime.lastError) {
        // no-op
      }
    });
  }
  // Pin the badge color so refreshBadge() never has to set it on every
  // refresh. The first refresh paints text on this background.
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#e54545' });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch (_) {}
  refreshBadge().catch(() => {});
});

// Refresh the badge whenever the service worker boots — MV3 kills the SW
// aggressively, and the badge state is the user-facing memory of their
// streak.
refreshBadge().catch(() => {});

// ── Streak tracking ────────────────────────────────────────────────
// One row per day the user actually drilled. Persisted in
// chrome.storage.local so it survives SW recycling. The badge surfaces
// the streak count; an amber "!" replaces the count once the user has
// missed today (i.e. a streak is at risk).

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function recordDrill() {
  try {
    const now = new Date();
    const today = ymd(now);
    const yesterday = ymd(new Date(now.getTime() - 86_400_000));
    const stored = await chrome.storage.local.get([
      'streakDays', 'lastDrillDate', 'totalDrills',
    ]);
    const prev = Number(stored.streakDays || 0);
    const last = String(stored.lastDrillDate || '');
    const total = Number(stored.totalDrills || 0);
    let nextStreak;
    if (last === today) nextStreak = prev || 1;
    else if (last === yesterday) nextStreak = prev + 1;
    else nextStreak = 1;
    await chrome.storage.local.set({
      streakDays: nextStreak,
      lastDrillDate: today,
      totalDrills: total + 1,
    });
    await refreshBadge();
  } catch (e) {
    console.warn('[debateai-ext] recordDrill', e);
  }
}

async function refreshBadge() {
  try {
    if (!chrome.action?.setBadgeText) return;
    const { streakDays = 0, lastDrillDate = '' } = await chrome.storage.local.get([
      'streakDays', 'lastDrillDate',
    ]);
    const today = ymd(new Date());
    const days = Number(streakDays) || 0;
    if (days <= 0) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const overdue = lastDrillDate !== today;
    if (overdue) {
      // Streak in jeopardy — switch badge to amber + "!" so the user
      // sees it in their toolbar without having to open the panel.
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      chrome.action.setBadgeText({ text: '!' });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#e54545' });
      // Two-digit cap is a Chrome limit anyway; clamp to keep the badge
      // readable for the 99+ case.
      chrome.action.setBadgeText({ text: days > 99 ? '99' : String(days) });
    }
  } catch (e) {
    console.warn('[debateai-ext] refreshBadge', e);
  }
}

// Daily wake-up so the badge flips to "!" the moment a streak day ends
// — even if the user hasn't opened the panel.
try {
  chrome.alarms?.create('debateai-badge-refresh', { periodInMinutes: 30 });
  chrome.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm?.name === 'debateai-badge-refresh') refreshBadge().catch(() => {});
  });
} catch (_) {}

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
  if (command !== 'debate-selection' && command !== 'rebut-selection' && command !== 'lint-selection') return;
  // debate-selection (Cmd+Shift+D) -> quiz-me framing (the default oral
  // exam drill: AI grills the student on the highlighted passage)
  // rebut-selection (Cmd+Shift+R) -> defend-this framing (student already
  // has a take, AI cross-examines them on it)
  // lint-selection  (Cmd+Shift+L) -> lint-this framing (Grammarly-style
  // structural critique in the linter pane — no voice round)
  const action =
    command === 'lint-selection' ? 'lint-this'
    : command === 'rebut-selection' ? 'defend-this'
    : 'quiz-me';
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

// ── Google Docs agent (Stage 1: auth + read-active-doc) ──────────────
// The side panel sends:
//   {type:'docs-status'}        -> {connected, email}
//   {type:'docs-connect'}       -> opens the OAuth consent screen,
//                                   resolves to {connected:true, email}
//                                   or {error}
//   {type:'docs-disconnect'}    -> revokes the cached token
//   {type:'docs-read-active'}   -> reads the user's currently active
//                                   tab; if it's a Docs URL, fetches the
//                                   doc and returns
//                                   {title, snippet, charCount, docId}
// All handlers ALWAYS resolve via sendResponse (never throw), so the
// side panel can render a clean error state instead of a console trace.

async function getActiveDocsTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return null;
  const docId = parseDocId(tab.url || '');
  if (!docId) return { tab, docId: '' };
  return { tab, docId };
}

async function handleDocsMessage(msg) {
  switch (msg?.type) {
    case 'docs-status': {
      // Non-interactive token check. Returns connected:false if the user
      // hasn't authorized yet — never pops the consent screen on its own.
      try {
        const token = await getAuthToken({ interactive: false });
        const email = await getUserEmail(token).catch(() => '');
        return { connected: true, email };
      } catch (e) {
        return { connected: false, email: '' };
      }
    }
    case 'docs-connect': {
      try {
        const token = await getAuthToken({ interactive: true });
        const email = await getUserEmail(token).catch(() => '');
        return { connected: true, email };
      } catch (e) {
        // Most common cause: manifest oauth2.client_id is the placeholder.
        const msg = String(e?.message || e);
        const hint = msg.includes('OAuth2') || msg.includes('client_id') || msg.includes('PASTE_')
          ? 'Paste your Google OAuth client ID into manifest.json (see GOOGLE_CLOUD_SETUP.md), then reload the extension at chrome://extensions.'
          : '';
        return { error: msg, hint };
      }
    }
    case 'docs-disconnect': {
      try {
        const token = await getAuthToken({ interactive: false }).catch(() => null);
        if (token) await clearAuthToken(token);
        return { ok: true };
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    }
    case 'docs-read-active': {
      try {
        const active = await getActiveDocsTab();
        if (!active?.tab) return { error: 'No active tab found.' };
        if (!active.docId) {
          return {
            error: 'The active tab is not a Google Doc. Open a doc at docs.google.com and try again.',
            activeUrl: active.tab.url || '',
          };
        }
        const token = await getAuthToken({ interactive: true });
        const doc = await readDoc(active.docId, token);
        const text = docToPlainText(doc);
        const SNIPPET_MAX = 600;
        return {
          docId: active.docId,
          title: getDocTitle(doc),
          // Full doc text used by the Stage 2 agent so propose_edit
          // can target paragraphs the snippet doesn't reach. Capped
          // server-side at 8000 chars.
          fullText: text,
          snippet: text.slice(0, SNIPPET_MAX),
          charCount: text.length,
          truncated: text.length > SNIPPET_MAX,
        };
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    }
    case 'docs-propose-edit': {
      // Send the user's request + the doc passage to /api/docs-agent.
      // No auth or extension-side guardrails beyond size — the agent's
      // server-side prompt + tool schema enforce single-edit, exact-
      // match-required behavior.
      try {
        const userRequest = String(msg.userRequest || '').trim();
        const passage = String(msg.passage || '').trim();
        const docTitle = String(msg.docTitle || '').slice(0, 200);
        if (!userRequest) return { error: 'Tell Counter what to sharpen.' };
        if (!passage) return { error: 'No doc passage to work on. Read your doc first.' };
        const res = await fetch(DOCS_AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userRequest, passage: passage.slice(0, 8000), docTitle }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `agent ${res.status}` };
        if (data?.error) return { error: data.error, assistantMessage: data.assistantMessage || '' };
        return data; // { tool, input:{containsText, replaceText, reason} }
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    }
    case 'docs-apply-edit': {
      // The user confirmed. Hit the Docs API with replaceAllText.
      try {
        const docId = String(msg.docId || '').trim();
        const containsText = String(msg.containsText || '');
        const replaceText = String(msg.replaceText || '');
        if (!docId) return { error: 'docId is required' };
        if (!containsText) return { error: 'containsText is required' };
        const token = await getAuthToken({ interactive: true });
        const result = await applyReplaceAllText(docId, containsText, replaceText, token);
        if (!result.occurrencesChanged) {
          return {
            error: 'No changes made — the live doc no longer contained the exact text the agent saw. Re-read the doc and try again.',
          };
        }
        return { ok: true, occurrencesChanged: result.occurrencesChanged };
      } catch (e) {
        const m = String(e?.message || e);
        const hint = m.includes('403') || m.includes('PERMISSION_DENIED')
          ? 'Manifest scope may still be documents.readonly. Update oauth2.scopes to include /auth/documents (read+write), reload the extension, and re-Connect to grant the broader access.'
          : '';
        return { error: m, hint };
      }
    }
    default:
      return null;
  }
}

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
  if (msg?.type && msg.type.startsWith('docs-')) {
    handleDocsMessage(msg).then((res) => sendResponse(res || { error: 'unknown docs message' }));
    return true; // async sendResponse
  }
  if (msg?.type === 'drill-started') {
    recordDrill().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'streak-state') {
    chrome.storage.local.get(['streakDays', 'lastDrillDate', 'totalDrills']).then((s) => {
      sendResponse({
        streakDays: Number(s.streakDays || 0),
        lastDrillDate: String(s.lastDrillDate || ''),
        totalDrills: Number(s.totalDrills || 0),
      });
    }).catch(() => sendResponse({ streakDays: 0, lastDrillDate: '', totalDrills: 0 }));
    return true;
  }
  return false;
});
