// Counter side-panel — native shell around the voice-debate iframe.
// The panel owns: brand bar (streak chip + reload), Setup card
// (mode/persona/topic + Start drill CTA), Live drill canvas (iframe
// + End-drill pill), warm-up shade, recent drills, and toasts.
// All persistent state lives in chrome.storage.local (streak via the
// SW; ext-prefs via the local helpers in this file).

const APP_ORIGIN = 'https://debateai.com';
const FRAME_URL = APP_ORIGIN + '/voice-debate.html?ext=1&mode=counter';

const STORAGE_KEYS = {
  mode: 'counter:mode',
  persona: 'counter:persona',
  recent: 'counter:recent',
};

// Mode keys MUST match MODES in voice-debate.html. Labels + descriptions
// are panel-side copy. Order is the chip render order.
const MODES = [
  { key: 'crossex',    label: 'Cross-exam',  desc: 'Q&A under fire' },
  { key: 'rebuttal',   label: 'Rebuttal',    desc: 'Short clash' },
  { key: 'layjudge',   label: 'Persuasion',  desc: 'Smart non-expert' },
  { key: 'aggressive', label: 'Adversarial', desc: 'No politeness' },
  { key: 'steelman',   label: 'Steelman',    desc: 'Defend opposite' },
  { key: 'apda',       label: 'Full Round',  desc: 'Open + rebut + close' },
];

// Personas the user can flip between from the chip row. Subset of the
// app's full PERSONALITIES list, chosen to cover the most common Counter
// archetypes. Keys MUST match the app's persona keys.
const PERSONAS = [
  { key: 'examiner', label: 'Dr. Iyer',      desc: 'Examiner (default)' },
  { key: 'verse',    label: 'Cassidy Vale',  desc: 'All-rounder' },
  { key: 'ash',      label: 'Marcus Crane',  desc: 'Prosecutor' },
  { key: 'coral',    label: 'Priya Reddi',   desc: 'Quick wit' },
];
const DEFAULT_MODE = 'crossex';
const DEFAULT_PERSONA = 'examiner';

const els = {
  stage: document.getElementById('stage'),
  setup: document.getElementById('setup'),
  modeChips: document.getElementById('modeChips'),
  personaChips: document.getElementById('personaChips'),
  topicField: document.getElementById('topicField'),
  topicCount: document.getElementById('topicCount'),
  pasteBtn: document.getElementById('paste'),
  clearBtn: document.getElementById('clearTopic'),
  startBtn: document.getElementById('startBtn'),
  startSub: document.getElementById('startSub'),
  hint: document.getElementById('hint'),
  recentBlock: document.getElementById('recentBlock'),
  recentList: document.getElementById('recentList'),
  streakChip: document.getElementById('streakChip'),
  reloadBtn: document.getElementById('reload'),
  frame: document.getElementById('frame'),
  livepill: document.getElementById('livepill'),
  livepillLabel: document.getElementById('livepillLabel'),
  endDrillBtn: document.getElementById('endDrillBtn'),
  warmupEl: document.getElementById('warmup'),
  errShade: document.getElementById('errShade'),
  retryBtn: document.getElementById('retry'),
  toast: document.getElementById('toast'),
};

const state = {
  mode: DEFAULT_MODE,
  persona: DEFAULT_PERSONA,
  topic: '',
  drilling: false,
  frameReady: false,
};

// Anything we want to post before the iframe handshake completes.
const queueWhileLoading = [];

// ── Iframe message bridge ──────────────────────────────────────────
function sendToIframe(payload) {
  if (!els.frame?.contentWindow) return;
  if (!state.frameReady) {
    queueWhileLoading.push(payload);
    return;
  }
  try {
    els.frame.contentWindow.postMessage(
      { type: 'debateai-ext', ...payload },
      APP_ORIGIN,
    );
  } catch (e) {
    console.warn('[counter] postMessage failed', e);
  }
}

window.addEventListener('message', (ev) => {
  if (ev.origin !== APP_ORIGIN) return;
  const t = ev.data?.type;
  if (t === 'debateai-ext-ready') {
    state.frameReady = true;
    hideWarmup();
    while (queueWhileLoading.length) sendToIframe(queueWhileLoading.shift());
    return;
  }
  if (t === 'debateai-ext-live') {
    setDrilling(true);
    try { chrome.runtime.sendMessage({ type: 'drill-started' }); } catch (_) {}
    recordRecent({
      topic: state.topic.slice(0, 200),
      modeKey: state.mode,
      personaKey: state.persona,
      at: Date.now(),
    });
    refreshStreakChip();
    return;
  }
  if (t === 'debateai-ext-ended') {
    setDrilling(false);
    return;
  }
});

// ── Warm-up + error shade ──────────────────────────────────────────
function showWarmup() { els.warmupEl?.classList.remove('is-hidden'); }
function hideWarmup() { els.warmupEl?.classList.add('is-hidden'); }
function resetFrame() {
  state.frameReady = false;
  els.errShade?.classList.remove('is-shown');
  showWarmup();
  els.frame.src = FRAME_URL;
}

// Surface a recovery shade if the iframe never reports ready.
let readyDeadline = null;
els.frame?.addEventListener('load', () => {
  state.frameReady = false;
  if (readyDeadline) clearTimeout(readyDeadline);
  readyDeadline = setTimeout(() => {
    if (!state.frameReady) els.errShade?.classList.add('is-shown');
  }, 7000);
});

els.reloadBtn?.addEventListener('click', () => resetFrame());
els.retryBtn?.addEventListener('click', () => resetFrame());

// ── Toast ──────────────────────────────────────────────────────────
function showToast(text, ms = 2400) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.classList.add('is-shown');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('is-shown'), ms);
}

// ── Stage state (setup vs drilling) ────────────────────────────────
function setDrilling(on) {
  state.drilling = !!on;
  els.stage?.classList.toggle('is-drilling', state.drilling);
  if (state.drilling) {
    const m = MODES.find((x) => x.key === state.mode);
    const label = m ? `Live · ${m.label.toLowerCase()}` : 'Live drill';
    if (els.livepillLabel) els.livepillLabel.textContent = label;
  }
}

els.endDrillBtn?.addEventListener('click', () => {
  // Best-effort: ask the iframe to stop. We don't wait for the response;
  // the iframe's status useEffect will post `debateai-ext-ended` once it
  // tears down, and that's what flips the stage back.
  sendToIframe({ stop: true });
  // Optimistic flip in case the iframe is busy — the user just decided.
  setDrilling(false);
});

// ── Chip rows ──────────────────────────────────────────────────────
function renderChips(host, items, currentKey, onPick) {
  if (!host) return;
  host.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (item.key === currentKey ? ' is-on' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', item.key === currentKey ? 'true' : 'false');
    btn.dataset.key = item.key;
    btn.innerHTML = `${escapeHtml(item.label)}${item.desc ? `<span class="chip__sub">· ${escapeHtml(item.desc)}</span>` : ''}`;
    btn.addEventListener('click', () => onPick(item.key));
    host.appendChild(btn);
  });
}

function setMode(key) {
  if (!MODES.some((m) => m.key === key)) return;
  state.mode = key;
  saveLocal(STORAGE_KEYS.mode, key);
  renderChips(els.modeChips, MODES, state.mode, setMode);
  sendToIframe({ mode: key });
  updateStartButton();
}
function setPersona(key) {
  if (!PERSONAS.some((p) => p.key === key)) return;
  state.persona = key;
  saveLocal(STORAGE_KEYS.persona, key);
  renderChips(els.personaChips, PERSONAS, state.persona, setPersona);
  sendToIframe({ persona: key });
}

// ── Topic field ────────────────────────────────────────────────────
function updateTopicCount() {
  const n = (els.topicField?.value || '').length;
  if (els.topicCount) els.topicCount.textContent = `${n} / 900`;
}
function setTopic(text) {
  state.topic = String(text || '');
  if (els.topicField && els.topicField.value !== state.topic) {
    els.topicField.value = state.topic;
  }
  updateTopicCount();
  updateStartButton();
}
function updateStartButton() {
  if (!els.startBtn) return;
  const hasTopic = state.topic.trim().length > 0;
  els.startBtn.disabled = !hasTopic;
  if (els.startSub) {
    if (!hasTopic) {
      els.startSub.textContent = 'Add a topic first';
    } else {
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      els.startSub.textContent = isMac ? '⌘⇧D anywhere' : 'Ctrl+Shift+D';
    }
  }
}

els.topicField?.addEventListener('input', (ev) => {
  state.topic = ev.target.value;
  updateTopicCount();
  updateStartButton();
});

els.pasteBtn?.addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      showToast('Clipboard is empty.');
      return;
    }
    setTopic(text.slice(0, 900));
    els.topicField?.focus();
  } catch (e) {
    showToast('Clipboard read blocked.');
  }
});

els.clearBtn?.addEventListener('click', () => {
  setTopic('');
  els.topicField?.focus();
});

// ── Start drill ────────────────────────────────────────────────────
els.startBtn?.addEventListener('click', () => {
  const text = state.topic.trim();
  if (!text) {
    els.topicField?.focus();
    return;
  }
  // Optimistic: flip to drilling immediately so the user sees the iframe
  // canvas while WebRTC negotiates. The 'debateai-ext-live' confirms it;
  // if it errors, the iframe's own error UI takes over inside the canvas.
  setDrilling(true);
  sendToIframe({
    action: 'quiz-me',
    text,
    mode: state.mode,
    persona: state.persona,
    autoStart: true,
  });
});

// ── Pending action drain (from context menu / shortcut / pill) ─────
async function drainPending() {
  try {
    const { pendingAction } = await chrome.storage.session.get(['pendingAction']);
    if (!pendingAction) return;
    await chrome.storage.session.remove(['pendingAction']);
    const text = String(pendingAction.text || '').trim();
    const action = pendingAction.action || 'quiz-me';
    // Hint + topic prefilled regardless. Lint actions are no longer
    // supported in this panel rebuild (the linter surface was a stale
    // mode swap); fall through to a normal Quiz me with the passage.
    if (text) {
      setTopic(text.slice(0, 900));
      if (els.hint) {
        const verb = action === 'defend-this'
          ? 'Defending'
          : action === 'cross-exam'
          ? 'Cross-examining'
          : 'Quizzing';
        const preview = text.length > 56 ? text.slice(0, 53) + '…' : text;
        els.hint.textContent = `${verb}: "${preview}"`;
      }
    }
    // Trigger the drill straight away — whoever queued this action has
    // already chosen, the panel is just the runway.
    setDrilling(true);
    sendToIframe({
      action,
      text,
      mode: state.mode,
      persona: state.persona,
      autoStart: true,
    });
  } catch (e) {
    console.warn('[counter] drainPending', e);
  }
}

chrome.runtime.onMessage?.addListener?.((msg) => {
  if (msg?.type === 'fromExtension') {
    const text = String(msg.text || '').trim();
    if (text) setTopic(text.slice(0, 900));
    setDrilling(true);
    sendToIframe({
      action: msg.action,
      text,
      mode: state.mode,
      persona: state.persona,
      autoStart: true,
    });
  }
});

// ── Streak chip ────────────────────────────────────────────────────
function refreshStreakChip() {
  const chip = els.streakChip;
  if (!chip) return;
  try {
    chrome.runtime.sendMessage({ type: 'streak-state' }, (res) => {
      if (!res || chrome.runtime.lastError) return;
      const days = Number(res.streakDays || 0);
      const last = String(res.lastDrillDate || '');
      const today = ymd(new Date());
      const overdue = days > 0 && last !== today;
      if (days <= 0) {
        chip.classList.remove('is-active', 'is-overdue');
        chip.textContent = 'Start a streak';
        chip.title = 'No drills yet. Start one to begin your streak.';
        return;
      }
      chip.classList.add('is-active');
      chip.classList.toggle('is-overdue', overdue);
      chip.innerHTML =
        `<span class="streak-chip__flame" aria-hidden="true">🔥</span>` +
        `<span class="streak-chip__num">${days}</span>` +
        `<span class="streak-chip__unit">${days === 1 ? 'day' : 'days'}</span>`;
      chip.title = overdue
        ? `${days}-day streak. Drill today to keep it alive.`
        : `${days}-day streak. Drilled today.`;
    });
  } catch (_) {}
}

// ── Recent drills (localStorage) ───────────────────────────────────
function recordRecent(entry) {
  try {
    const arr = readRecent();
    arr.unshift(entry);
    const trimmed = arr.slice(0, 5);
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(trimmed));
    renderRecent();
  } catch (_) {}
}
function readRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recent);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function renderRecent() {
  const list = els.recentList;
  const block = els.recentBlock;
  if (!list || !block) return;
  const items = readRecent();
  if (items.length === 0) { block.hidden = true; return; }
  block.hidden = false;
  list.innerHTML = '';
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'recent__item';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    const m = MODES.find((x) => x.key === it.modeKey);
    const p = PERSONAS.find((x) => x.key === it.personaKey);
    const topic = String(it.topic || '').slice(0, 80) || '(no topic)';
    li.innerHTML =
      `<span class="recent__topic">${escapeHtml(topic)}</span>` +
      `<span class="recent__meta">` +
        `<span>${escapeHtml(m?.label || it.modeKey || 'Drill')}</span>` +
        (p ? `<span>· ${escapeHtml(p.label)}</span>` : '') +
        `<span class="recent__when">${relativeTime(it.at)}</span>` +
      `</span>`;
    const replay = () => {
      setTopic(it.topic || '');
      if (it.modeKey) setMode(it.modeKey);
      if (it.personaKey) setPersona(it.personaKey);
      els.startBtn?.click();
    };
    li.addEventListener('click', replay);
    li.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); replay(); }
    });
    list.appendChild(li);
  });
}

// ── Storage helpers ────────────────────────────────────────────────
function saveLocal(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) {}
}
function readLocal(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

// ── Utilities ──────────────────────────────────────────────────────
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function relativeTime(ms) {
  if (!ms) return '';
  const delta = Date.now() - Number(ms);
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Bootstrap ──────────────────────────────────────────────────────
(function init() {
  // Restore persisted prefs (mode + persona) before chip render.
  const savedMode = readLocal(STORAGE_KEYS.mode);
  if (savedMode && MODES.some((m) => m.key === savedMode)) state.mode = savedMode;
  const savedPersona = readLocal(STORAGE_KEYS.persona);
  if (savedPersona && PERSONAS.some((p) => p.key === savedPersona)) state.persona = savedPersona;

  renderChips(els.modeChips, MODES, state.mode, setMode);
  renderChips(els.personaChips, PERSONAS, state.persona, setPersona);
  updateTopicCount();
  updateStartButton();
  renderRecent();
  refreshStreakChip();

  // After the iframe handshake, push the user's saved choices so the
  // realtime session opens with what they actually picked, not just the
  // ext-mode defaults.
  const pushPrefs = () => sendToIframe({ mode: state.mode, persona: state.persona });
  setTimeout(pushPrefs, 600);

  // Drain any action queued by the SW before the panel mounted (context
  // menu, shortcut, in-page chip).
  setTimeout(drainPending, 450);
})();
