// Side-panel bridge.
// Loads debate-ai.html?ext=1 in an iframe and relays:
//   - "pendingAction" rows queued by the SW (selection from context menu,
//     keyboard shortcut, or Docs pill) into the iframe via postMessage
//   - manual "Paste from clipboard" clicks into the iframe
//   - reload + iframe load-failure handling

const APP_ORIGIN = 'https://debateai.com';
const frame = document.getElementById('frame');
const pasteBtn = document.getElementById('paste');
const reloadBtn = document.getElementById('reload');
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
  const action = p.action || 'debate-this';
  const verb =
    action === 'rebut-this' ? 'Rebutting'
    : action === 'case-prep' ? 'Building a case from'
    : 'Debating';
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
    setHintFromPayload({ action: 'debate-this', text });
    sendToIframe({ action: 'debate-this', text });
    showToast('Sent to DebateAI.');
  } catch (e) {
    showToast('Clipboard read blocked. Try the Debate-this menu instead.');
  }
});

reloadBtn.addEventListener('click', () => {
  errShade.classList.remove('is-shown');
  frame.src = frame.src;
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
