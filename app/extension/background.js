// DebateIt extension service worker.
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
// Debater endpoint — given a doc passage, returns structured rebuttals
// the user can defend against. See app/netlify/functions/counter-doc.mjs.
const COUNTER_DOC_URL = 'https://debateai.com/api/counter-doc';

// Open side panel when user clicks the toolbar icon. Without this, the
// click does nothing on most Chrome versions.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn('[debateai-ext] sidePanel.setPanelBehavior', e));

chrome.runtime.onInstalled.addListener(() => {
  // Four context-menu entries for selected text. Each action signals a
  // different framing to the side panel:
  //   counter-this -> "Counter my argument" (debater opens the selection
  //                   in the side panel and returns three rebuttals + the
  //                   examiner's first question + a drill-in-voice CTA)
  //   quiz-me      -> "AI, quiz me on this passage" (study-test framing)
  //   defend-this  -> "I'll defend; AI cross-examines me" (oral-exam framing)
  //   cross-exam   -> "AI, defend the opposite; I'll cross-examine you back"
  // The first three route to native side-panel surfaces; cross-exam routes
  // to the voice round in the iframe (the existing flow).
  const items = [
    { id: 'counter-this', title: 'Counter this argument (build rebuttals)', contexts: ['selection'] },
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
    const {
      streakDays = 0,
      lastDrillDate = '',
      examDate = '',
    } = await chrome.storage.local.get([
      'streakDays', 'lastDrillDate', 'examDate',
    ]);
    const today = ymd(new Date());
    const days = Number(streakDays) || 0;

    // Exam takeover: when an exam is within 14 days, the badge counts
    // down to the exam instead of the streak. The exam is the user's
    // actual goal; the streak is just a proxy that supports it.
    if (examDate) {
      const examDays = ymdDiff(today, String(examDate));
      if (examDays >= 0 && examDays <= 14) {
        const text = examDays === 0 ? 'D-0' : `D-${examDays}`;
        // Crimson inside the last week, amber otherwise so the
        // toolbar reads as gradually-warming pressure.
        chrome.action.setBadgeBackgroundColor({
          color: examDays <= 7 ? '#e54545' : '#f59e0b',
        });
        chrome.action.setBadgeText({ text });
        return;
      }
      if (examDays < 0) {
        // Stale exam — clear so we don't keep showing D-(-3).
        await chrome.storage.local.set({ examDate: '' });
      }
    }

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

function ymdDiff(today, target) {
  // YYYY-MM-DD diff in days. Mirrors the helper in sidepanel.js but
  // duplicated here so the SW doesn't need to round-trip.
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(target) - parse(today)) / 86_400_000);
}

// ── Daily nudge notification ──────────────────────────────────────
// Fires at most once per day if EITHER:
//   - an exam is set within 14 days AND the user hasn't drilled today, OR
//   - the user has a 3+ day streak that's about to break (overdue today)
// Suppressed if the user has chrome.notifications disabled at the OS
// level (chrome.notifications.create silently no-ops).

async function maybeNudge() {
  try {
    if (!chrome.notifications?.create) return;
    const today = ymd(new Date());
    const {
      streakDays = 0,
      lastDrillDate = '',
      examDate = '',
      lastNudgeDate = '',
    } = await chrome.storage.local.get([
      'streakDays', 'lastDrillDate', 'examDate', 'lastNudgeDate',
    ]);
    // One nudge per day, max.
    if (lastNudgeDate === today) return;
    // Already drilled today — nothing to push.
    if (lastDrillDate === today) return;

    let title = '';
    let body = '';
    if (examDate) {
      const examDays = ymdDiff(today, String(examDate));
      if (examDays >= 0 && examDays <= 14) {
        title = examDays === 0
          ? 'Exam today. One last drill.'
          : `Exam in ${examDays} ${examDays === 1 ? 'day' : 'days'}.`;
        body = examDays <= 3
          ? 'Open Counter and run a viva. Even one round helps.'
          : 'A quick viva today keeps the muscle warm.';
      }
    }
    // If no exam (or it's far out), fall back to streak-protection.
    if (!title) {
      const d = Number(streakDays) || 0;
      if (d >= 3) {
        title = `${d}-day streak about to break.`;
        body = 'One drill today keeps it alive.';
      }
    }
    if (!title) return;

    await chrome.storage.local.set({ lastNudgeDate: today });
    try {
      chrome.notifications.create('counter-daily-nudge', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title,
        message: body,
        priority: 1,
        silent: false,
      });
    } catch (_) {
      // Notifications can fail (permission, OS-level mute) — silent OK.
    }
  } catch (e) {
    console.warn('[debateai-ext] maybeNudge', e);
  }
}

// Clicking the notification should land the user inside a side panel
// ready to drill, not just open a random tab.
chrome.notifications?.onClicked?.addListener?.(async (notificationId) => {
  if (notificationId !== 'counter-daily-nudge') return;
  try { chrome.notifications.clear(notificationId); } catch (_) {}
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.warn('[debateai-ext] notification click open', e);
  }
});

// Daily wake-up so the badge flips to "!" the moment a streak day ends
// — even if the user hasn't opened the panel. The same tick also drives
// the once-per-day nudge notification (rate-limited via lastNudgeDate).
try {
  chrome.alarms?.create('debateai-badge-refresh', { periodInMinutes: 30 });
  // Separate alarm for the nudge so we can space it differently from
  // the badge tick. Fires every 4h; maybeNudge() dedupes per day.
  chrome.alarms?.create('debateai-daily-nudge', { periodInMinutes: 240 });
  chrome.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm?.name === 'debateai-badge-refresh') refreshBadge().catch(() => {});
    if (alarm?.name === 'debateai-daily-nudge') maybeNudge().catch(() => {});
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
  if (command !== 'debate-selection' && command !== 'rebut-selection' && command !== 'counter-selection') return;
  // debate-selection  (Cmd+Shift+D) -> quiz-me framing (the default oral
  // exam drill: AI grills the student on the highlighted passage)
  // rebut-selection   (Cmd+Shift+R) -> defend-this framing (student already
  // has a take, AI cross-examines them on it)
  // counter-selection (Cmd+Shift+L) -> counter-this framing (debater
  // builds three rebuttals against the selection in the side panel)
  const action =
    command === 'counter-selection' ? 'counter-this'
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

// ── Counter-the-draft (passage → structured rebuttals) ─────────────
// Side panel sends:
//   {type:'counter-passage', passage, docTitle?, intensity?}
// We forward to /api/counter-doc and pass through the structured response
// (thesis, weakestClaim, rebuttals[], examinersQuestion, drillTopic).
// docTitle is included separately so the user can both (a) paste a raw
// passage AND (b) point at an open Google Doc that's already been read.
async function handleCounterMessage(msg) {
  const startedAt = Date.now();
  try {
    const passage = String(msg?.passage || '').trim();
    const docTitle = String(msg?.docTitle || '').slice(0, 200);
    const intensity = String(msg?.intensity || 'firm').toLowerCase();
    const reader = String(msg?.reader || 'generic').toLowerCase();
    const mode = String(msg?.mode || 'paragraph').toLowerCase();
    if (!passage) return { error: 'Paste a passage first.' };
    if (passage.length < 40) return { error: 'Paste a paragraph or longer — Counter needs more to work with.' };
    // Hard cap mirrors the server side. Full-draft accepts 25k; paragraph
    // mode stays at 12k.
    const cap = mode === 'full-draft' ? 25000 : 12000;
    console.log('[counter SW] fetching /api/counter-doc', { passageLen: passage.length, mode, reader, intensity });
    // 40s upstream timeout: shorter than the sidepanel's 45s outer timeout
    // so if the fetch itself hangs, the SW resolves with a clear error
    // rather than the sidepanel hitting its own timeout first (which would
    // leave us guessing at where in the stack the hang was).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 40_000);
    let res;
    try {
      res = await fetch(COUNTER_DOC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passage: passage.slice(0, cap), docTitle, intensity, reader, mode }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    console.log('[counter SW] /api/counter-doc responded in', Date.now() - startedAt, 'ms · status', res.status);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[counter SW] error response', res.status, data);
      return { error: data?.error || `counter ${res.status}` };
    }
    if (data?.error) {
      console.warn('[counter SW] data.error', data.error);
      return { error: data.error, assistantMessage: data.assistantMessage || '' };
    }
    return data;
  } catch (e) {
    const elapsed = Date.now() - startedAt;
    console.warn('[counter SW] threw after', elapsed, 'ms:', e?.name || '', e?.message || e);
    // AbortError from our own timeout → friendly upstream message that
    // the sidepanel's friendlyCounterError already maps to "AI is having
    // a moment. Try again in a few seconds."
    if (e?.name === 'AbortError') {
      return { error: 'anthropic upstream timeout after ' + Math.round(elapsed / 1000) + 's' };
    }
    return { error: String(e?.message || e) };
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
  if (msg?.type === 'counter-passage') {
    handleCounterMessage(msg).then((res) => sendResponse(res || { error: 'no response' }));
    return true;
  }
  if (msg?.type === 'docs-active-context') {
    // Side panel asks: "what's the user looking at right now?"
    // We answer: { isDoc, title, url, docId } if the active tab is a
    // Google Doc, else { isDoc:false }. No API calls — just the tab
    // metadata, which is enough to show a "Currently reading: <title>"
    // strip in the panel without requiring OAuth.
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab) { sendResponse({ isDoc: false }); return; }
        const docId = parseDocId(tab.url || '');
        if (!docId) {
          sendResponse({ isDoc: false, activeUrl: tab.url || '' });
          return;
        }
        // Docs tab titles look like "My doc - Google Docs" — trim the suffix.
        const rawTitle = String(tab.title || '').replace(/\s*-\s*Google Docs\s*$/, '').trim();
        sendResponse({
          isDoc: true,
          title: rawTitle || 'Untitled doc',
          url: tab.url || '',
          docId,
          tabId: tab.id || null,
        });
      } catch (e) {
        sendResponse({ isDoc: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'pull-last-selection') {
    // Side panel asks the active tab's content script for the last text
    // the user selected/copied. The content script keeps a 5-minute
    // window of last-copied text; we forward the query and pass back
    // whatever it returns. If the tab has no content script (chrome://,
    // store, PDF viewers), we resolve to { text:'' }.
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id) { sendResponse({ text: '' }); return; }
        let res = null;
        try {
          res = await chrome.tabs.sendMessage(tab.id, { type: 'getLastSelection' });
        } catch (_) { res = null; }
        sendResponse({
          text: String(res?.text || '').trim(),
          sourceUrl: tab.url || '',
          sourceTitle: tab.title || '',
        });
      } catch (e) {
        sendResponse({ text: '', error: String(e?.message || e) });
      }
    })();
    return true;
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
  if (msg?.type === 'reset-streak') {
    // Power-user reset from the settings sheet. Wipes the streak +
    // total-drills counters and refreshes the badge so the toolbar
    // matches the zero-state immediately.
    chrome.storage.local.set({
      streakDays: 0,
      lastDrillDate: '',
      totalDrills: 0,
    }).then(() => {
      refreshBadge();
      sendResponse({ ok: true });
    }).catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'refresh-badge') {
    // Side panel just edited examDate (or another badge input). Re-prime
    // the toolbar without waiting for the 30-min alarm.
    refreshBadge()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  return false;
});
