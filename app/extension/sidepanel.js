// Side-panel bridge.
// Loads debate-ai.html?ext=1 in an iframe and relays:
//   - "pendingAction" rows queued by the SW (selection from context menu,
//     keyboard shortcut, or Docs pill) into the iframe via postMessage
//   - manual "Paste from clipboard" clicks into the iframe
//   - reload + iframe load-failure handling

const APP_ORIGIN = 'https://debateai.com';
// Two surfaces under the same brand:
//  - voice-debate.html  -> default. Voice round (OpenAI Realtime). The
//                          actual oral-exam drill — student speaks, AI
//                          examiner asks, AI grades.
//  - debate-ai.html     -> escape hatch for users who want the typed
//                          flow (no mic, slower pace, full setup screen).
const VOICE_URL = APP_ORIGIN + '/voice-debate.html?ext=1&mode=counter';
const TYPED_URL = APP_ORIGIN + '/debate-ai.html?ext=1&mode=counter';
const frame = document.getElementById('frame');
const pasteBtn = document.getElementById('paste');
const reloadBtn = document.getElementById('reload');
const typedBtn = document.getElementById('typed');
const retryBtn = document.getElementById('retry');
const errShade = document.getElementById('errShade');
const hint = document.getElementById('hint');
const toast = document.getElementById('toast');

let frameReady = false;
const queueWhileLoading = [];

function showToast(text, ms = 2400) {
  toast.textContent = text;
  toast.classList.add('is-shown');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('is-shown'), ms);
}

function sendToIframe(payload) {
  if (!frame.contentWindow) return;
  if (!frameReady) {
    queueWhileLoading.push(payload);
    return;
  }
  try {
    frame.contentWindow.postMessage({ type: 'debateai-ext', ...payload }, APP_ORIGIN);
  } catch (e) {
    console.warn('[debateai-ext] postMessage failed', e);
  }
}

function setHintFromPayload(p) {
  if (!p) return;
  const action = p.action || 'quiz-me';
  // Map action -> verb shown in the side-panel header. Picked so the user
  // can tell at a glance which framing the bridge will apply: AI quizzes
  // you, AI defends and you cross-exam, or you defend and AI cross-exams.
  const verb =
    action === 'defend-this' ? 'Defending'
    : action === 'cross-exam' ? 'Cross-examining'
    : action === 'rebut-this' ? 'Rebutting'
    : action === 'debate-this' ? 'Debating'
    : 'Quiz on';
  if (p.text) {
    const preview = p.text.length > 56 ? p.text.slice(0, 53) + '…' : p.text;
    hint.textContent = `${verb}: "${preview}"`;
  } else if (p.sourceTitle) {
    hint.textContent = `${verb}: ${p.sourceTitle}`;
  }
}

async function drainPending() {
  try {
    const { pendingAction } = await chrome.storage.session.get(['pendingAction']);
    if (!pendingAction) return;
    await chrome.storage.session.remove(['pendingAction']);
    setHintFromPayload(pendingAction);
    sendToIframe({
      action: pendingAction.action,
      text: pendingAction.text || '',
      sourceUrl: pendingAction.sourceUrl || '',
      sourceTitle: pendingAction.sourceTitle || '',
    });
  } catch (e) {
    console.warn('[debateai-ext] drainPending', e);
  }
}

// The iframe tells us when its bridge useEffect mounted ("debateai-ext-ready").
// At that point we flush any queued payloads and start trusting future sends.
window.addEventListener('message', (ev) => {
  if (ev.origin !== APP_ORIGIN) return;
  if (ev.data?.type !== 'debateai-ext-ready') return;
  frameReady = true;
  while (queueWhileLoading.length) {
    sendToIframe(queueWhileLoading.shift());
  }
});

// On iframe load (or reload) restart the handshake state and drain any
// pending action queued by the SW since the last drain.
frame.addEventListener('load', () => {
  frameReady = false;
  // Give the React tree a tick to mount its message listener before we
  // start sending; the iframe will also send a ready ping once mounted.
  setTimeout(drainPending, 350);
});

// Manual paste: read clipboard (requires user gesture, which the click is),
// post to iframe as a debate-this action.
pasteBtn.addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      showToast('Clipboard is empty.');
      return;
    }
    setHintFromPayload({ action: 'quiz-me', text });
    sendToIframe({ action: 'quiz-me', text });
    showToast('Sent to Counter.');
  } catch (e) {
    showToast('Clipboard read blocked. Try the Quiz-me menu instead.');
  }
});

reloadBtn.addEventListener('click', () => {
  errShade.classList.remove('is-shown');
  frame.src = frame.src;
});

// Toggle between voice round and typed flow. Both surfaces support the
// ext bridge, so switching just swaps the iframe src and the next
// pendingAction (or paste) drains into the new page.
typedBtn?.addEventListener('click', () => {
  const onVoice = frame.src.includes('/voice-debate.html');
  errShade.classList.remove('is-shown');
  frame.src = onVoice ? TYPED_URL : VOICE_URL;
  typedBtn.textContent = onVoice ? 'Voice' : 'Typed';
  typedBtn.title = onVoice ? 'Switch back to the voice round' : 'Switch to typed flow (debate-ai)';
});

// ── Google Docs agent strip (Stage 1) ───────────────────────────────
// All UI state mirrors the SW's reply: connected/disconnected, the
// signed-in email, the active doc's title + snippet. The SW does the
// heavy lifting (chrome.identity, fetch /v1/documents) — this file
// just renders the result.
const docsToggleBtn = document.getElementById('docsToggle');
const docsEl = document.getElementById('docs');
const docsStatusEl = document.getElementById('docsStatus');
const docsConnectBtn = document.getElementById('docsConnect');
const docsDisconnectBtn = document.getElementById('docsDisconnect');
const docsReadBtn = document.getElementById('docsRead');
const docsBodyEl = document.getElementById('docsBody');

function sendBg(msg) {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) { resolve({ error: 'chrome.runtime missing' }); return; }
    chrome.runtime.sendMessage(msg, (res) => resolve(res || { error: 'no response' }));
  });
}

function setDocsBody(html) { docsBodyEl.innerHTML = html; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderDocsConnected(email) {
  docsEl.classList.add('is-connected');
  docsStatusEl.textContent = email ? `Connected as ${email}` : 'Connected to Google Docs';
  docsConnectBtn.style.display = 'none';
  docsDisconnectBtn.style.display = 'inline-flex';
  docsReadBtn.style.display = 'inline-flex';
}
function renderDocsDisconnected() {
  docsEl.classList.remove('is-connected');
  docsStatusEl.textContent = 'Not connected to Google Docs';
  docsConnectBtn.style.display = 'inline-flex';
  docsDisconnectBtn.style.display = 'none';
  docsReadBtn.style.display = 'none';
}
function renderDocsError(msg, hint) {
  setDocsBody(
    `<div class="docs__error">${escapeHtml(msg)}</div>` +
    (hint ? `<div class="docs__hint">${escapeHtml(hint)}</div>` : '')
  );
}
function renderDocPreview(payload) {
  const meta = `${payload.charCount.toLocaleString()} chars${payload.truncated ? ' (showing first 600)' : ''}`;
  setDocsBody(
    `<div class="docs__panel docs__panel--meta"><span class="docs__title">${escapeHtml(payload.title)}</span> · ${escapeHtml(meta)}</div>` +
    `<div class="docs__panel">${escapeHtml(payload.snippet || '(empty)')}</div>`
  );
}

async function refreshDocsStatus() {
  const res = await sendBg({ type: 'docs-status' });
  if (res?.connected) renderDocsConnected(res.email);
  else renderDocsDisconnected();
}

docsToggleBtn?.addEventListener('click', () => {
  const open = !docsEl.classList.contains('is-open');
  docsEl.classList.toggle('is-open', open);
  if (open) refreshDocsStatus();
});

docsConnectBtn?.addEventListener('click', async () => {
  docsConnectBtn.disabled = true;
  setDocsBody('');
  const res = await sendBg({ type: 'docs-connect' });
  docsConnectBtn.disabled = false;
  if (res?.connected) {
    renderDocsConnected(res.email);
    showToast('Google Docs connected.');
  } else {
    renderDocsError(res?.error || 'Connect failed.', res?.hint);
  }
});

docsDisconnectBtn?.addEventListener('click', async () => {
  await sendBg({ type: 'docs-disconnect' });
  setDocsBody('');
  renderDocsDisconnected();
  showToast('Disconnected.');
});

docsReadBtn?.addEventListener('click', async () => {
  docsReadBtn.disabled = true;
  setDocsBody('<div class="docs__panel--meta">Reading active doc…</div>');
  const res = await sendBg({ type: 'docs-read-active' });
  docsReadBtn.disabled = false;
  if (res?.error) {
    renderDocsError(res.error, res.activeUrl ? `Active tab: ${res.activeUrl}` : '');
  } else if (res?.title) {
    renderDocPreview(res);
  } else {
    renderDocsError('No response from background script.');
  }
});

retryBtn?.addEventListener('click', () => {
  errShade.classList.remove('is-shown');
  frame.src = frame.src;
});

// If the iframe never fires "ready" within 7s after load, the app likely
// failed to render (network, App Check, ad blocker). Surface a recovery
// shade so the user has somewhere to go that isn't a black panel.
let readyDeadline = null;
frame.addEventListener('load', () => {
  if (readyDeadline) clearTimeout(readyDeadline);
  readyDeadline = setTimeout(() => {
    if (!frameReady) errShade.classList.add('is-shown');
  }, 7000);
});

// Also drain if the panel was already open and a new action arrives via
// runtime broadcast. (Most flows go through chrome.storage.session — this
// is a fallback path.)
chrome.runtime.onMessage?.addListener?.((msg) => {
  if (msg?.type === 'fromExtension') {
    setHintFromPayload(msg);
    sendToIframe({
      action: msg.action,
      text: msg.text || '',
      sourceUrl: msg.sourceUrl || '',
      sourceTitle: msg.sourceTitle || '',
    });
  }
});
