// Side-panel bridge.
// Loads debate-ai.html?ext=1 in an iframe and relays:
//   - "pendingAction" rows queued by the SW (selection from context menu,
//     keyboard shortcut, or Docs pill) into the iframe via postMessage
//   - manual "Paste from clipboard" clicks into the iframe
//   - reload + iframe load-failure handling

const APP_ORIGIN = 'https://debateai.com';
// Three surfaces under the same brand. The Mode buttons in the top bar
// rotate between them; the lint-this context-menu action force-switches
// to LINT_URL regardless of the current view.
//  - voice-debate.html  -> Voice round (OpenAI Realtime). The actual oral
//                          exam drill: student speaks, AI examiner asks,
//                          AI grades.
//  - debate-ai.html     -> Typed flow (no mic, full setup screen). Useful
//                          when the user can't speak right now (library,
//                          shared room).
//  - linter.html        -> "Grammarly for debate." Paste any passage; get
//                          a claim / warrant / impact breakdown with
//                          structural suggestions. No facts ever added.
const VOICE_URL = APP_ORIGIN + '/voice-debate.html?ext=1&mode=counter';
const TYPED_URL = APP_ORIGIN + '/debate-ai.html?ext=1&mode=counter';
const LINT_URL  = APP_ORIGIN + '/linter.html?ext=1';
const frame = document.getElementById('frame');
const pasteBtn = document.getElementById('paste');
const reloadBtn = document.getElementById('reload');
const modeBtn = document.getElementById('mode');
const retryBtn = document.getElementById('retry');
const errShade = document.getElementById('errShade');
const hint = document.getElementById('hint');
const toast = document.getElementById('toast');
const warmupEl = document.getElementById('warmup');

function showWarmup() { warmupEl?.classList.remove('is-hidden'); }
function hideWarmup() { warmupEl?.classList.add('is-hidden'); }

// Which surface is currently in the iframe. Drives the Mode button label
// + which URL we swap to next.
function currentMode() {
  const src = frame.src || '';
  if (src.includes('/linter.html')) return 'lint';
  if (src.includes('/debate-ai.html')) return 'typed';
  return 'voice';
}
function setMode(next) {
  const url = next === 'lint' ? LINT_URL : next === 'typed' ? TYPED_URL : VOICE_URL;
  if (frame.src === url) return;
  errShade.classList.remove('is-shown');
  showWarmup();
  frame.src = url;
  updateModeButton();
}
function updateModeButton() {
  if (!modeBtn) return;
  const m = currentMode();
  // Rotation order: voice → typed → lint → voice. Label shows the NEXT
  // mode the button will switch to (matches the convention of the prior
  // Typed/Voice toggle).
  const next =
    m === 'voice' ? 'typed'
    : m === 'typed' ? 'lint'
    : 'voice';
  const label =
    next === 'lint'  ? 'Lint'
    : next === 'typed' ? 'Typed'
    : 'Voice';
  modeBtn.textContent = label;
  const title =
    next === 'lint'  ? 'Switch to the argument linter'
    : next === 'typed' ? 'Switch to the typed flow'
    : 'Switch back to the voice round';
  modeBtn.title = title;
}

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
  // you, AI defends and you cross-exam, you defend and AI cross-exams,
  // or the linter inspects the passage without an AI debater at all.
  const verb =
    action === 'lint-this'   ? 'Linting'
    : action === 'defend-this' ? 'Defending'
    : action === 'cross-exam'  ? 'Cross-examining'
    : action === 'rebut-this'  ? 'Rebutting'
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
    // Lint actions target the linter surface; other actions target the
    // voice/typed surfaces. If we're on the wrong surface for the
    // pending action, swap the iframe BEFORE posting — the new page's
    // bridge mounts and will receive the queued payload via the
    // "ready" handshake.
    const action = pendingAction.action || 'quiz-me';
    const onLinter = currentMode() === 'lint';
    const wantsLint = action === 'lint-this' || action === 'lint';
    if (wantsLint && !onLinter) {
      // Re-queue: setMode triggers an iframe load → frame.addEventListener
      // 'load' calls drainPending again 350ms later, which will pick up
      // the still-pending action (we already removed it, so put it back).
      await chrome.storage.session.set({ pendingAction });
      setMode('lint');
      return;
    }
    if (!wantsLint && onLinter) {
      await chrome.storage.session.set({ pendingAction });
      setMode('voice');
      return;
    }
    sendToIframe({
      action,
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
  hideWarmup();
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
  showWarmup();
  frame.src = frame.src;
});

// Cycle between the three surfaces (voice → typed → lint → voice). All
// three support the ext bridge, so swapping the iframe src is enough —
// the next pendingAction (or paste / shortcut) drains into the new page
// once its bridge mounts and fires "debateai-ext-ready".
modeBtn?.addEventListener('click', () => {
  const m = currentMode();
  const next = m === 'voice' ? 'typed' : m === 'typed' ? 'lint' : 'voice';
  setMode(next);
});
// Initial label reflects whatever the iframe currently shows (in case
// the side panel was reloaded mid-session).
updateModeButton();

// ── Google Docs agent strip (Stage 1) ───────────────────────────────
// All UI state mirrors the SW's reply: connected/disconnected, the
// signed-in email, the active doc's title + snippet. The SW does the
// heavy lifting (chrome.identity, fetch /v1/documents) — this file
// just renders the result.
const docsToggleBtn = document.getElementById('docsToggle');
const docsEl = document.getElementById('docs');

// Hide the Docs entry point until the manifest has a real OAuth client_id.
// Shipping with the PASTE_ placeholder makes Connect throw a confusing
// "OAuth2 not granted" error; better to hide the affordance entirely than
// invite the user into a dead end.
try {
  const cid = chrome.runtime.getManifest()?.oauth2?.client_id || '';
  if (!cid || cid.startsWith('PASTE_')) {
    docsToggleBtn?.style.setProperty('display', 'none');
  }
} catch (_) {
  // chrome.runtime.getManifest is sync + always available; the try is
  // defensive against future MV3 changes.
}
const docsStatusEl = document.getElementById('docsStatus');
const docsConnectBtn = document.getElementById('docsConnect');
const docsDisconnectBtn = document.getElementById('docsDisconnect');
const docsReadBtn = document.getElementById('docsRead');
const docsBodyEl = document.getElementById('docsBody');
// Stage 2 agent surface
const agentInputEl = document.getElementById('agentInput');
const agentProposeBtn = document.getElementById('agentPropose');
const agentProposalEl = document.getElementById('agentProposal');
let loadedDoc = null;       // { docId, title, fullText }
let currentProposal = null; // { containsText, replaceText, reason }

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
  docsEl.classList.remove('is-doc-loaded');
  docsStatusEl.textContent = 'Not connected to Google Docs';
  docsConnectBtn.style.display = 'inline-flex';
  docsDisconnectBtn.style.display = 'none';
  docsReadBtn.style.display = 'none';
  loadedDoc = null;
  currentProposal = null;
  if (agentProposalEl) agentProposalEl.innerHTML = '';
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
  // Stash the loaded doc for the Stage 2 agent. The agent input + diff
  // card become visible via the .is-doc-loaded class.
  loadedDoc = {
    docId: payload.docId,
    title: payload.title,
    fullText: payload.fullText || payload.snippet || '',
  };
  docsEl.classList.add('is-doc-loaded');
  // Reset any prior proposal — new doc, fresh slate.
  agentProposalEl.innerHTML = '';
  currentProposal = null;
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
    docsEl.classList.remove('is-doc-loaded');
    loadedDoc = null;
  } else if (res?.title) {
    renderDocPreview(res);
  } else {
    renderDocsError('No response from background script.');
    docsEl.classList.remove('is-doc-loaded');
  }
});

// ── Stage 2: agent propose + apply ──────────────────────────────
function renderProposal(input) {
  currentProposal = input;
  agentProposalEl.innerHTML = `
    <div class="agent__proposal">
      <div class="agent__reason">${escapeHtml(input.reason || '')}</div>
      <div class="agent__diff">
        <div class="agent__old" title="Existing text in your doc">${escapeHtml(input.containsText || '')}</div>
        <div class="agent__new" title="Proposed replacement">${escapeHtml(input.replaceText || '')}</div>
      </div>
      <div class="agent__actions">
        <button class="docs__btn" data-agent-action="reject">Reject</button>
        <button class="docs__btn docs__btn--primary" data-agent-action="apply">Apply to Doc</button>
      </div>
    </div>
  `;
  agentProposalEl.querySelectorAll('[data-agent-action]').forEach((btn) => {
    btn.addEventListener('click', onProposalAction);
  });
}

function renderProposalError(error, hint) {
  agentProposalEl.innerHTML =
    `<div class="docs__error">${escapeHtml(error)}</div>` +
    (hint ? `<div class="docs__hint">${escapeHtml(hint)}</div>` : '');
  currentProposal = null;
}

async function onProposalAction(ev) {
  const action = ev.currentTarget.getAttribute('data-agent-action');
  if (action === 'reject') {
    agentProposalEl.innerHTML = '';
    currentProposal = null;
    return;
  }
  if (action !== 'apply') return;
  if (!currentProposal || !loadedDoc?.docId) {
    renderProposalError('Lost the doc context. Reload and try again.');
    return;
  }
  // Lock buttons during the API call so a double-click doesn't fire twice.
  agentProposalEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const res = await sendBg({
    type: 'docs-apply-edit',
    docId: loadedDoc.docId,
    containsText: currentProposal.containsText,
    replaceText: currentProposal.replaceText,
  });
  if (res?.ok) {
    agentProposalEl.innerHTML =
      `<div class="docs__panel docs__panel--meta" style="color:#86efac">` +
      `Applied. ${res.occurrencesChanged} change${res.occurrencesChanged === 1 ? '' : 's'} written to the doc. ` +
      `Cmd/Ctrl+Z in Docs reverts.</div>`;
    currentProposal = null;
    showToast('Edit applied to your Doc.');
  } else {
    renderProposalError(res?.error || 'Apply failed.', res?.hint);
  }
}

agentProposeBtn?.addEventListener('click', async () => {
  const userRequest = (agentInputEl.value || '').trim();
  if (!userRequest) {
    agentInputEl.focus();
    return;
  }
  if (!loadedDoc) {
    renderProposalError('Read a doc first so the agent has something to work on.');
    return;
  }
  agentProposeBtn.disabled = true;
  agentProposalEl.innerHTML = `<div class="docs__panel docs__panel--meta">Thinking…</div>`;
  const res = await sendBg({
    type: 'docs-propose-edit',
    userRequest,
    passage: loadedDoc.fullText || '',
    docTitle: loadedDoc.title || '',
  });
  agentProposeBtn.disabled = false;
  if (res?.tool === 'propose_edit' && res.input) {
    renderProposal(res.input);
  } else if (res?.assistantMessage) {
    renderProposalError(res.assistantMessage);
  } else {
    renderProposalError(res?.error || 'No proposal returned.', res?.hint);
  }
});

// Submit on Enter for ergonomics — small input, the user is keyboard-led.
agentInputEl?.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    agentProposeBtn?.click();
  }
});

retryBtn?.addEventListener('click', () => {
  errShade.classList.remove('is-shown');
  showWarmup();
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
