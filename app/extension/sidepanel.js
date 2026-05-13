// Counter side-panel — native shell around the voice-debate iframe.
// The panel owns: brand bar (streak chip + reload), Setup card
// (mode/persona/topic + Start drill CTA), Live drill canvas (iframe
// + End-drill pill), warm-up shade, recent drills, and toasts.
// All persistent state lives in chrome.storage.local (streak via the
// SW; ext-prefs via the local helpers in this file).

// ── Minimal SFX bridge ─────────────────────────────────────────────
// The sidepanel runs in the extension's own context (no DOM access to
// the host page's /js/sfx.js). Rather than ship the full module, we
// inline two tiny tones: a tick on highlight-captured and a warm
// confirm on drill-ended. Mute state is stored under the same
// localStorage key as the host app (da-sfx-muted) so toggling sound
// off on debateai.com silences the panel too. Lazy AudioContext +
// no-op on suspend (extension service-worker context can't resume
// without a user gesture, and we get one when the user highlights /
// clicks End-drill, so it's a fine default).
const SFX = (() => {
  const KEY = 'da-sfx-muted';
  let ctx = null;
  const isMuted = () => {
    try { if (localStorage.getItem(KEY) === '1') return true; } catch(_){}
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch(_){}
    return false;
  };
  const getCtx = () => {
    if (ctx) return ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch(_) { return null; }
    return ctx;
  };
  const tone = (freq, freqEnd, dur, peak, type = 'sine') => {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch(_){} }
    try {
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (freqEnd && freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur * 0.85);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch(_){}
  };
  return {
    captured: () => tone(820, 720, 0.06, 0.10, 'sine'),  // light tick
    confirm:  () => tone(700, null, 0.16, 0.16, 'sine'), // warm chime
  };
})();

const APP_ORIGIN = 'https://debateai.com';
const FRAME_URL = APP_ORIGIN + '/voice-debate.html?ext=1&mode=counter';

const STORAGE_KEYS = {
  mode: 'counter:mode',
  persona: 'counter:persona',
  recent: 'counter:recent',
};
// examDate lives in chrome.storage.local (not localStorage) so the
// background SW can read it for badge / notification logic — see
// readExamDate / writeExamDate below.
const SFX_MUTED_KEY = 'da-sfx-muted'; // shared with the host app's SFX module

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

// All 9 personas from app/voice-debate.html's PERSONALITIES. First 4
// render by default; the rest unfurl behind a "More" toggle so the
// setup card stays compact while still giving access to the full bench.
// Keys MUST match the app's persona keys (renderChips sends them
// verbatim to the iframe bridge, which calls setPersonaKey).
const PERSONAS = [
  { key: 'examiner', label: 'Dr. Iyer',         desc: 'Examiner (default)' },
  { key: 'verse',    label: 'Cassidy Vale',     desc: 'All-rounder' },
  { key: 'ash',      label: 'Marcus Crane',     desc: 'Prosecutor' },
  { key: 'coral',    label: 'Priya Reddi',      desc: 'Quick wit' },
  { key: 'sage',     label: 'Dr. Eleanor Voss', desc: 'Philosopher' },
  { key: 'echo',     label: 'Maya Chen',        desc: 'Closer' },
  { key: 'alloy',    label: 'Theo Alvarez',     desc: 'Veteran' },
  { key: 'shimmer',  label: 'Aisha Khan',       desc: 'Diplomat' },
  { key: 'ballad',   label: 'Rosa Lopez',       desc: 'Storyteller' },
];
const PERSONA_PRIMARY_COUNT = 4;
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
  quickstartBlock: document.getElementById('quickstartBlock'),
  quickstartChips: document.getElementById('quickstartChips'),
  retryStrip: document.getElementById('retryStrip'),
  retryStripMsg: document.getElementById('retryStripMsg'),
  retryStripBtn: document.getElementById('retryStripBtn'),
  retryStripClose: document.getElementById('retryStripClose'),
  examline: document.getElementById('examline'),
  examlineText: document.getElementById('examlineText'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsShade: document.getElementById('settingsShade'),
  settingsSheet: document.getElementById('settingsSheet'),
  settingsClose: document.getElementById('settingsClose'),
  examDateInput: document.getElementById('examDate'),
  examClearBtn: document.getElementById('examClear'),
  muteToggle: document.getElementById('muteToggle'),
  resetStreakBtn: document.getElementById('resetStreakBtn'),
  clearRecentBtn: document.getElementById('clearRecentBtn'),
  streakStat: document.getElementById('streakStat'),
  recentStat: document.getElementById('recentStat'),
  versionStat: document.getElementById('versionStat'),
};

// Quick-start prompts. Mixed slate so a first-time user sees both
// academic-viva (CBSE/ICSE/IIT/JEE) and debate-motion shape — Counter
// drills either. Tags front-load category so the chip reads fast.
const QUICKSTART_PROMPTS = [
  { tag: 'Bio',     text: 'Mitochondria — role in cellular apoptosis.' },
  { tag: 'Lit',     text: 'Hamlet\'s delay — psychological vs. moral reading.' },
  { tag: 'Physics', text: 'Newton\'s third law applied to rocket propulsion.' },
  { tag: 'Motion',  text: 'India should make voting compulsory.' },
];

const state = {
  mode: DEFAULT_MODE,
  persona: DEFAULT_PERSONA,
  topic: '',
  drilling: false,
  frameReady: false,
  // Persona-expander state. Stays collapsed by default; auto-expands
  // (one-shot) if the user's stored persona pick lives in the hidden
  // tail so they don't see "selected" reflected as missing.
  personasExpanded: false,
  // Last drill's failure mode — drives the sticky retry strip below
  // the topic field when a session bailed before going live.
  lastDrillFailed: false,
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
    hideRetryStrip();
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
    const reachedLive = ev.data?.reachedLive === true;
    setDrilling(false);
    if (reachedLive) {
      // Warm confirm chime as the session wraps cleanly. Distinct from
      // the iframe's own SFX.end (which fires inside voice-debate before
      // the postMessage round-trip lands here) — this is the panel's
      // "we received the end signal and the UI flipped back" beat.
      try { SFX.confirm(); } catch (_) {}
      // Visible moment for the streak increment. Pull fresh streak state
      // so the toast reflects what background.js just recorded.
      try {
        chrome.runtime.sendMessage({ type: 'streak-state' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            showToast('Drill ended.');
            return;
          }
          const days = Number(res.streakDays || 0);
          if (days > 1) {
            showToast(`Drill ended. ${days}-day streak alive.`);
          } else if (days === 1) {
            showToast('Drill ended. Day-1 streak started.');
          } else {
            showToast('Drill ended.');
          }
        });
      } catch (_) {
        showToast('Drill ended.');
      }
    } else {
      // Failed before going live. The toast is transient; the sticky
      // retry strip survives so the user can re-attempt without
      // re-entering the topic.
      showToast('Drill didn\'t start. Check the mic prompt and try again.');
      showRetryStrip('Last drill didn\'t go live. Mic was likely blocked, or the page lost focus mid-prompt.');
    }
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
    const modeLabel = m ? m.label.toLowerCase() : 'drill';
    const topic = (state.topic || '').trim();
    // Topic in the live pill so the user sees what they're being grilled
    // on without having to peek back at setup. Truncated so the End
    // button never wraps off-screen.
    const preview = topic.length > 38 ? topic.slice(0, 35) + '…' : topic;
    const text = preview
      ? `Live · ${modeLabel} · ${preview}`
      : `Live · ${modeLabel}`;
    if (els.livepillLabel) els.livepillLabel.textContent = text;
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

function renderPersonaChips() {
  if (!els.personaChips) return;
  // Always show the primary 4 + the user's pick if it lives in the
  // hidden tail (so the "is-on" chip is never invisible).
  const primary = PERSONAS.slice(0, PERSONA_PRIMARY_COUNT);
  const hidden = PERSONAS.slice(PERSONA_PRIMARY_COUNT);
  const pickedHidden = hidden.find((p) => p.key === state.persona);
  const visible = state.personasExpanded
    ? PERSONAS
    : pickedHidden
      ? [...primary, pickedHidden]
      : primary;
  renderChips(els.personaChips, visible, state.persona, setPersona);
  // Append a More/Less toggle as the last chip in the row.
  const extras = hidden.length - (pickedHidden && !state.personasExpanded ? 1 : 0);
  if (extras > 0 || state.personasExpanded) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'chip chip--ghost';
    more.setAttribute('aria-expanded', state.personasExpanded ? 'true' : 'false');
    more.textContent = state.personasExpanded
      ? 'Show less'
      : `More · +${extras}`;
    more.addEventListener('click', () => {
      state.personasExpanded = !state.personasExpanded;
      renderPersonaChips();
    });
    els.personaChips.appendChild(more);
  }
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
  renderPersonaChips();
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
  // Quick-start chips: only visible when topic is empty AND we're not
  // mid-drill. Once the user has something to drill on, they don't need
  // sample prompts in the way.
  if (els.quickstartBlock) {
    els.quickstartBlock.hidden = hasTopic;
  }
}

function renderQuickstart() {
  const host = els.quickstartChips;
  if (!host) return;
  host.innerHTML = '';
  QUICKSTART_PROMPTS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quickstart__chip';
    btn.title = p.text;
    btn.innerHTML =
      `<span class="quickstart__tag">${escapeHtml(p.tag)}</span>` +
      escapeHtml(p.text);
    btn.addEventListener('click', () => {
      setTopic(p.text);
      els.topicField?.focus();
    });
    host.appendChild(btn);
  });
}

// ── Retry strip (failed drill recovery) ────────────────────────────
function showRetryStrip(msg) {
  if (!els.retryStrip) return;
  state.lastDrillFailed = true;
  if (msg && els.retryStripMsg) els.retryStripMsg.textContent = msg;
  els.retryStrip.classList.add('is-shown');
}
function hideRetryStrip() {
  state.lastDrillFailed = false;
  els.retryStrip?.classList.remove('is-shown');
}
els.retryStripBtn?.addEventListener('click', () => {
  hideRetryStrip();
  els.startBtn?.click();
});
els.retryStripClose?.addEventListener('click', () => hideRetryStrip());

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
    // Highlight-captured tick. Confirms the selection reached the panel
    // before the iframe's heavier "session live" chime fires (SFX.start
    // inside voice-debate). Silenced by the global da-sfx-muted toggle.
    try { SFX.captured(); } catch(_){}
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
  // Onboarding card is the mirror image of recent: visible only while
  // the user has no drills under their belt yet. Once they drill once,
  // the recent list replaces it.
  const onboard = document.getElementById('onboardBlock');
  if (onboard) onboard.hidden = items.length > 0;
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

// ── Exam countdown ─────────────────────────────────────────────────
// Exam date lives in chrome.storage.local so background.js can read it
// for badge logic + notifications. The sidepanel mirrors it locally for
// instant render, but the source of truth is chrome.storage.
async function readExamDate() {
  try {
    const { examDate = '' } = await chrome.storage.local.get(['examDate']);
    return String(examDate || '');
  } catch (_) { return ''; }
}
async function writeExamDate(val) {
  try { await chrome.storage.local.set({ examDate: String(val || '') }); } catch (_) {}
}

async function refreshExamline() {
  const banner = els.examline;
  const text = els.examlineText;
  if (!banner || !text) return;
  const raw = await readExamDate();
  if (!raw) {
    banner.classList.remove('is-shown', 'is-urgent');
    return;
  }
  // Compare YYYY-MM-DD strings to avoid timezone drift. Days = today's
  // ymd diff vs the saved ymd. Negative means the exam was yesterday or
  // earlier (auto-clear).
  const today = ymd(new Date());
  const days = ymdDiff(today, raw);
  if (days < 0) {
    // Stale exam date — silently clear and let background know.
    await writeExamDate('');
    try { chrome.runtime.sendMessage({ type: 'refresh-badge' }); } catch (_) {}
    banner.classList.remove('is-shown', 'is-urgent');
    return;
  }
  banner.classList.add('is-shown');
  banner.classList.toggle('is-urgent', days <= 7);
  if (days === 0) text.textContent = 'Exam is today. Last drill — make it count.';
  else if (days === 1) text.textContent = 'Exam is tomorrow.';
  else text.textContent = `Exam in ${days} ${days === 1 ? 'day' : 'days'}.`;
}

function ymdDiff(today, target) {
  // Both args are YYYY-MM-DD. Returns target - today in days.
  const parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(target) - parse(today)) / 86_400_000);
}

// ── Settings sheet ─────────────────────────────────────────────────
async function openSettings() {
  if (!els.settingsShade) return;
  // Refresh dynamic values right before showing so the user sees
  // current state, not stale snapshots from the previous open.
  if (els.examDateInput) {
    els.examDateInput.value = await readExamDate();
  }
  refreshMuteToggle();
  refreshSettingsStats();
  if (els.versionStat) {
    const v = (chrome?.runtime?.getManifest?.() || {}).version || '';
    els.versionStat.textContent = v ? `Counter v${v}` : '';
  }
  els.settingsShade.classList.add('is-shown');
}
function closeSettings() {
  els.settingsShade?.classList.remove('is-shown');
}
function refreshMuteToggle() {
  if (!els.muteToggle) return;
  const muted = readLocal(SFX_MUTED_KEY) === '1';
  els.muteToggle.classList.toggle('is-on', muted);
  els.muteToggle.setAttribute('aria-checked', muted ? 'true' : 'false');
}
function refreshSettingsStats() {
  // Streak stat
  if (els.streakStat) {
    chrome.runtime.sendMessage({ type: 'streak-state' }, (res) => {
      if (!els.streakStat) return;
      if (chrome.runtime.lastError || !res) {
        els.streakStat.textContent = 'Streak state unavailable.';
        return;
      }
      const days = Number(res.streakDays || 0);
      const total = Number(res.totalDrills || 0);
      if (days === 0 && total === 0) {
        els.streakStat.textContent = 'No drills yet.';
      } else {
        els.streakStat.textContent =
          `${days}-day streak. ${total} drill${total === 1 ? '' : 's'} total.`;
      }
    });
  }
  // Recent stat
  if (els.recentStat) {
    const n = readRecent().length;
    els.recentStat.textContent = n === 0
      ? 'No saved drills.'
      : `${n} saved drill${n === 1 ? '' : 's'}.`;
  }
}

els.settingsBtn?.addEventListener('click', openSettings);
els.settingsClose?.addEventListener('click', closeSettings);
els.settingsShade?.addEventListener('click', (ev) => {
  // Close on backdrop click but not on clicks inside the sheet itself.
  if (ev.target === els.settingsShade) closeSettings();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && els.settingsShade?.classList.contains('is-shown')) {
    closeSettings();
  }
});

els.examDateInput?.addEventListener('change', async (ev) => {
  const val = ev.target.value || '';
  await writeExamDate(val);
  refreshExamline();
  // Background owns badge + nudge — re-prime both as soon as the
  // user commits a new date.
  try { chrome.runtime.sendMessage({ type: 'refresh-badge' }); } catch (_) {}
});
els.examClearBtn?.addEventListener('click', async () => {
  await writeExamDate('');
  if (els.examDateInput) els.examDateInput.value = '';
  refreshExamline();
  try { chrome.runtime.sendMessage({ type: 'refresh-badge' }); } catch (_) {}
});

els.muteToggle?.addEventListener('click', () => {
  const muted = readLocal(SFX_MUTED_KEY) === '1';
  saveLocal(SFX_MUTED_KEY, muted ? '0' : '1');
  refreshMuteToggle();
});

els.resetStreakBtn?.addEventListener('click', () => {
  // No browser confirm() — too obtrusive in a side panel. Two-step
  // affordance: first click arms the button, second click commits.
  const btn = els.resetStreakBtn;
  if (btn.dataset.armed === '1') {
    chrome.runtime.sendMessage({ type: 'reset-streak' }, () => {
      btn.dataset.armed = '0';
      btn.textContent = 'Reset';
      refreshStreakChip();
      refreshSettingsStats();
      showToast('Streak reset.');
    });
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = 'Confirm reset';
  setTimeout(() => {
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '0';
      btn.textContent = 'Reset';
    }
  }, 4000);
});

els.clearRecentBtn?.addEventListener('click', () => {
  const btn = els.clearRecentBtn;
  if (btn.dataset.armed === '1') {
    try { localStorage.removeItem(STORAGE_KEYS.recent); } catch (_) {}
    btn.dataset.armed = '0';
    btn.textContent = 'Clear';
    renderRecent();
    refreshSettingsStats();
    showToast('Recent drills cleared.');
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = 'Confirm clear';
  setTimeout(() => {
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '0';
      btn.textContent = 'Clear';
    }
  }, 4000);
});

// ── Bootstrap ──────────────────────────────────────────────────────
(function init() {
  // Restore persisted prefs (mode + persona) before chip render.
  const savedMode = readLocal(STORAGE_KEYS.mode);
  if (savedMode && MODES.some((m) => m.key === savedMode)) state.mode = savedMode;
  const savedPersona = readLocal(STORAGE_KEYS.persona);
  if (savedPersona && PERSONAS.some((p) => p.key === savedPersona)) state.persona = savedPersona;

  renderChips(els.modeChips, MODES, state.mode, setMode);
  renderPersonaChips();
  renderQuickstart();
  updateTopicCount();
  updateStartButton();
  renderRecent();
  refreshStreakChip();
  refreshExamline();
  // Platform-correct shortcut in the onboarding card.
  const kbd = document.getElementById('onboardKbd');
  if (kbd) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    kbd.textContent = isMac ? '⌘⇧D' : 'Ctrl+Shift+D';
  }

  // After the iframe handshake, push the user's saved choices so the
  // realtime session opens with what they actually picked, not just the
  // ext-mode defaults.
  const pushPrefs = () => sendToIframe({ mode: state.mode, persona: state.persona });
  setTimeout(pushPrefs, 600);

  // Drain any action queued by the SW before the panel mounted (context
  // menu, shortcut, in-page chip).
  setTimeout(drainPending, 450);
})();
