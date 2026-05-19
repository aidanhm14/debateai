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
  counterIntensity: 'counter:intensity',
  counterCardOpen: 'counter:card-open',
  counterReader: 'counter:reader',
  counterScope: 'counter:scope', // 'paragraph' | 'full-draft' (avoid clash w/ legacy 'mode')
};
const VALID_READERS = new Set(['generic', 'admissions', 'oped', 'committee', 'opposing', 'vc', 'varsity']);
const VALID_SCOPES = new Set(['paragraph', 'full-draft']);
const COUNTER_CAPS = { paragraph: 12000, 'full-draft': 25000 };
const COUNTER_PLACEHOLDERS = {
  paragraph: 'Paste a paragraph of your argument…',
  'full-draft': 'Paste the whole draft — Counter will find the weakest load-bearing claim across the entire thing.',
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
  // Counter-your-draft section
  counterCard: document.getElementById('counterCard'),
  counterToggle: document.getElementById('counterToggle'),
  counterBody: document.getElementById('counterBody'),
  counterPassage: document.getElementById('counterPassage'),
  counterCount: document.getElementById('counterCount'),
  counterRun: document.getElementById('counterRun'),
  counterError: document.getElementById('counterError'),
  counterResults: document.getElementById('counterResults'),
  readerChips: document.getElementById('readerChips'),
  docStrip: document.getElementById('docStrip'),
  docStripTitle: document.getElementById('docStripTitle'),
  docStripPull: document.getElementById('docStripPull'),
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
  // Counter-your-draft sub-state. intensity / reader / scope persist via
  // localStorage; pending is true while the agent is in flight; results
  // holds the last successful response so re-opening the card mid-session
  // doesn't wipe the rebuttals.
  counterIntensity: 'firm',
  counterReader: 'generic',
  counterScope: 'paragraph',
  counterPending: false,
  counterResults: null,
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
// 15s is generous on purpose: voice-debate.html ships as a single
// ~3000-line text/babel script and the first-load transpile by
// babel-standalone can run 6-10s on a cold CPU before any useEffect
// fires. We want the shade to mean "this isn't loading" not "this is
// slow", so the timeout has to comfortably clear the babel pass.
let readyDeadline = null;
els.frame?.addEventListener('load', () => {
  state.frameReady = false;
  if (readyDeadline) clearTimeout(readyDeadline);
  readyDeadline = setTimeout(() => {
    if (!state.frameReady) {
      console.warn('[counter] iframe loaded but no debateai-ext-ready ping in 15s. To debug: right-click the side panel → Inspect → in the top-left frame dropdown of DevTools, switch from "top" to the voice-debate.html frame → check Console for errors.');
      els.errShade?.classList.add('is-shown');
    }
  }, 15000);
});

// Diagnostic: log every postMessage from the iframe origin so the
// user can confirm in DevTools whether the bridge is firing.
window.addEventListener('message', (ev) => {
  if (ev.origin === APP_ORIGIN && ev.data && ev.data.type) {
    console.log('[counter] iframe →', ev.data.type);
  }
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

// ── Counter-your-draft (POST /api/counter-doc) ─────────────────────
function setCounterOpen(open) {
  const card = els.counterCard;
  if (!card) return;
  card.classList.toggle('is-open', !!open);
  els.counterToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  saveLocal(STORAGE_KEYS.counterCardOpen, open ? '1' : '0');
  if (open) {
    // Soft focus into the passage field, but only on user-initiated
    // opens (skip the boot-time auto-restore that runs from localStorage).
    if (els.counterPassage && document.activeElement !== els.counterPassage) {
      // Defer so the chevron animation doesn't fight the focus ring.
      setTimeout(() => els.counterPassage?.focus(), 160);
    }
  }
}
function updateCounterCount() {
  const n = (els.counterPassage?.value || '').length;
  const cap = COUNTER_CAPS[state.counterScope] || COUNTER_CAPS.paragraph;
  if (els.counterCount) els.counterCount.textContent = `${n} / ${cap}`;
  if (els.counterRun) {
    els.counterRun.disabled = state.counterPending || (els.counterPassage?.value || '').trim().length < 40;
  }
  // Tighten the counter color as the user approaches the cap so an
  // overlong full-draft paste doesn't silently fail at submit time.
  if (els.counterCount) {
    const pct = cap > 0 ? n / cap : 0;
    els.counterCount.style.color = pct >= 0.95 ? '#fda4af'
      : pct >= 0.8  ? '#f59e0b'
      : '';
  }
}
function setCounterIntensity(key) {
  if (!['measured', 'firm', 'fierce'].includes(key)) return;
  state.counterIntensity = key;
  saveLocal(STORAGE_KEYS.counterIntensity, key);
  if (!els.counterBody) return;
  els.counterBody.querySelectorAll('.counter-card__intensity button').forEach((b) => {
    const on = b.dataset.intensity === key;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
function setCounterReader(key) {
  if (!VALID_READERS.has(key)) return;
  state.counterReader = key;
  saveLocal(STORAGE_KEYS.counterReader, key);
  if (!els.readerChips) return;
  els.readerChips.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.reader === key;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
function setCounterScope(key) {
  if (!VALID_SCOPES.has(key)) return;
  state.counterScope = key;
  saveLocal(STORAGE_KEYS.counterScope, key);
  // Update the maxlength + placeholder so the user sees the cap shift.
  if (els.counterPassage) {
    const cap = COUNTER_CAPS[key];
    els.counterPassage.maxLength = cap;
    els.counterPassage.placeholder = COUNTER_PLACEHOLDERS[key];
  }
  // Re-render the tab states.
  document.querySelectorAll('.mode-tabs__btn').forEach((b) => {
    const on = b.dataset.mode === key;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // CTA copy adapts so the verb matches the scope.
  const ctaLabel = document.querySelector('.counter-card__cta-label');
  if (ctaLabel) ctaLabel.textContent = key === 'full-draft' ? 'Stress-test' : 'Counter';
  const ctaTail = document.querySelector('.counter-card__cta--lg span:last-child');
  if (ctaTail) {
    // The CTA template is "<label> this argument". Swap suffix for full-draft.
    ctaTail.innerHTML = key === 'full-draft'
      ? '<span class="counter-card__cta-label">Stress-test</span> the whole draft'
      : '<span class="counter-card__cta-label">Counter</span> this argument';
  }
  updateCounterCount();
}
// Doc-context strip. Asks background for the active-tab metadata; if
// the tab is a Google Doc, render the strip with the title + a Pull
// CTA. Otherwise hide the strip entirely.
async function refreshDocStrip() {
  if (!els.docStrip) return;
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'docs-active-context' }, (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response);
      });
    });
    if (res?.isDoc) {
      els.docStrip.hidden = false;
      if (els.docStripTitle) {
        const title = String(res.title || 'Untitled doc').slice(0, 60);
        els.docStripTitle.textContent = title;
        els.docStripTitle.title = res.title || '';
      }
    } else {
      els.docStrip.hidden = true;
    }
  } catch (_) {
    els.docStrip.hidden = true;
  }
}
async function pullSelectionIntoCounter() {
  if (!els.counterPassage) return;
  if (els.docStripPull) {
    els.docStripPull.disabled = true;
    els.docStripPull.textContent = 'Pulling…';
  }
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'pull-last-selection' }, (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response);
      });
    });
    const text = String(res?.text || '').trim();
    if (!text) {
      showToast('Nothing to pull. Copy or select a paragraph in your Doc first.');
      return;
    }
    const cap = COUNTER_CAPS[state.counterScope] || COUNTER_CAPS.paragraph;
    els.counterPassage.value = text.slice(0, cap);
    updateCounterCount();
    els.counterPassage.focus();
    try { SFX.captured(); } catch (_) {}
  } finally {
    if (els.docStripPull) {
      els.docStripPull.disabled = false;
      els.docStripPull.textContent = 'Pull selection ↓';
    }
  }
}
function showCounterError(msg) {
  const el = els.counterError;
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-shown', !!msg);
}
function setCounterLoading(loading) {
  state.counterPending = !!loading;
  els.counterCard?.classList.toggle('is-loading', state.counterPending);
  if (els.counterRun) els.counterRun.disabled = state.counterPending;
  updateCounterCount();
}
function renderCounterResults(data) {
  const host = els.counterResults;
  if (!host) return;
  host.innerHTML = '';
  if (!data) {
    host.classList.remove('is-shown');
    return;
  }
  host.classList.add('is-shown');

  const thesis = document.createElement('div');
  thesis.className = 'counter-results__thesis';
  thesis.innerHTML = `<em>Your thesis, as I read it</em>${escapeHtml(data.thesis || '')}`;
  host.appendChild(thesis);

  const weakest = document.createElement('div');
  weakest.className = 'counter-results__weakest';
  weakest.innerHTML = `<em>Weakest load-bearing claim</em>${escapeHtml(data.weakestClaim || '')}`;
  host.appendChild(weakest);

  (data.rebuttals || []).forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'rebuttal';
    card.innerHTML =
      `<span class="rebuttal__num">Rebuttal ${idx + 1}</span>` +
      `<div class="rebuttal__claim">${escapeHtml(r.claim || '')}</div>` +
      `<div class="rebuttal__line"><strong>Warrant</strong>${escapeHtml(r.warrant || '')}</div>` +
      `<div class="rebuttal__line"><strong>Impact</strong>${escapeHtml(r.impact || '')}</div>` +
      `<div class="rebuttal__actions">` +
        `<button type="button" class="rebuttal__btn rebuttal__btn--primary" data-counter-drill="${idx}">Drill this in voice</button>` +
        `<button type="button" class="rebuttal__btn" data-counter-copy="${idx}">Copy</button>` +
      `</div>`;
    host.appendChild(card);
  });

  if (data.examinersQuestion) {
    const q = document.createElement('div');
    q.className = 'counter-results__question';
    q.innerHTML = `<em>The question to be ready for</em>${escapeHtml(data.examinersQuestion)}`;
    host.appendChild(q);
  }

  if (data.drillTopic) {
    const drill = document.createElement('div');
    drill.className = 'counter-results__drill';
    drill.innerHTML =
      `<span class="counter-results__drill-topic" title="${escapeHtml(data.drillTopic)}">Drill: ${escapeHtml(data.drillTopic)}</span>` +
      `<button type="button" class="counter-results__drill-cta" data-counter-drill="topic">Run as voice round</button>`;
    host.appendChild(drill);
  }

  // "Drop all into your Doc" — closes the loop back to the page. Copies
  // the whole rebuttal block (weakest claim + 3 rebuttals + the question)
  // as one Docs-comment-shaped payload, then flashes the platform-aware
  // shortcut so the user knows how to actually paste it as a comment
  // (Docs: ⌘⌥M on Mac / Ctrl+Alt+M on Win). Without this CTA, the user
  // had to manually copy each rebuttal one at a time (3+ clicks) then
  // remember the comment-shortcut themselves. Three round-trips → one.
  if ((data.rebuttals || []).length || data.examinersQuestion || data.weakestClaim) {
    const drop = document.createElement('div');
    drop.className = 'counter-results__drop';
    drop.innerHTML =
      `<span class="counter-results__drop-copy">` +
        `<em>Take it back to your Doc</em>` +
        `Drop the whole counter as a Docs comment.` +
      `</span>` +
      `<button type="button" class="counter-results__drop-cta" data-counter-drop="all">Copy as comment</button>`;
    host.appendChild(drop);
  }

  // Action delegation. Each "Drill this" sets the topic to the rebuttal's
  // claim (or the drillTopic for the bottom CTA), flips the panel to
  // drilling, and hands the iframe an autoStart payload. Each "Copy" puts
  // the rebuttal text on the clipboard so the user can paste it into the
  // doc as a comment.
  host.querySelectorAll('[data-counter-drill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-counter-drill');
      let topicText = '';
      if (target === 'topic') {
        topicText = String(data.drillTopic || '').trim();
      } else {
        const idx = Number(target);
        const r = (data.rebuttals || [])[idx];
        if (r) topicText = String(r.claim || '').trim();
      }
      if (!topicText) return;
      setTopic(topicText.slice(0, 900));
      setDrilling(true);
      sendToIframe({
        action: 'defend-this',
        text: topicText,
        mode: state.mode,
        persona: state.persona,
        autoStart: true,
      });
    });
  });
  host.querySelectorAll('[data-counter-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-counter-copy'));
      const r = (data.rebuttals || [])[idx];
      if (!r) return;
      const text = `Claim: ${r.claim}\nWarrant: ${r.warrant}\nImpact: ${r.impact}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Rebuttal copied.');
      } catch (_) {
        showToast('Copy blocked. Select the text manually.');
      }
    });
  });
  host.querySelectorAll('[data-counter-drop="all"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = formatCounterAsDocComment(data);
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const hotkey = isMac ? '⌘ + Option + M' : 'Ctrl + Alt + M';
      try {
        await navigator.clipboard.writeText(text);
        // Long toast — the keyboard hint is the whole point. 5.5s gives the
        // user time to read it AND switch to the Docs tab before it fades.
        showToast(`Copied. In your Doc, select the paragraph and press ${hotkey} to paste as a comment.`, 5500);
        btn.textContent = '✓ Copied';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = 'Copy as comment';
          btn.disabled = false;
        }, 4000);
      } catch (_) {
        showToast('Copy blocked. Select a rebuttal manually and ' + (isMac ? '⌘C' : 'Ctrl+C') + ' instead.', 5000);
      }
    });
  });
}

// Build the all-rebuttals-in-one payload the "Copy as comment" CTA pastes
// into a Google Docs comment. Docs comments display plain text with line
// breaks honored; no real markdown rendering, so this is shaped to read
// cleanly as plain text. Footer credits the extension so anyone viewing
// the comment knows what produced it.
function formatCounterAsDocComment(data) {
  const lines = ['COUNTER · DEBATEAI'];
  if (data.thesis) {
    lines.push('', 'Your thesis as the AI read it:', data.thesis);
  }
  if (data.weakestClaim) {
    lines.push('', 'Weakest load-bearing claim:', data.weakestClaim);
  }
  (data.rebuttals || []).forEach((r, idx) => {
    lines.push('', `Rebuttal ${idx + 1}`);
    if (r.claim) lines.push(`Claim: ${r.claim}`);
    if (r.warrant) lines.push(`Warrant: ${r.warrant}`);
    if (r.impact) lines.push(`Impact: ${r.impact}`);
  });
  if (data.examinersQuestion) {
    lines.push('', 'The question to be ready for:', data.examinersQuestion);
  }
  lines.push('', '— via Counter for Google Docs (debateai.com/counter)');
  return lines.join('\n');
}
async function runCounter() {
  if (state.counterPending) return;
  const passage = (els.counterPassage?.value || '').trim();
  if (passage.length < 40) {
    showCounterError('Paste a paragraph or longer.');
    return;
  }
  showCounterError('');
  setCounterLoading(true);
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'counter-passage',
        passage,
        intensity: state.counterIntensity,
        reader: state.counterReader,
        mode: state.counterScope,
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { error: 'no response' });
      });
    });
    if (res?.error) {
      const hint = res.assistantMessage ? ` (${String(res.assistantMessage).slice(0, 140)})` : '';
      showCounterError(`${res.error}${hint}`);
      return;
    }
    state.counterResults = res;
    renderCounterResults(res);
    try { SFX.captured(); } catch (_) {}
  } finally {
    setCounterLoading(false);
  }
}

els.counterToggle?.addEventListener('click', () => {
  const open = !els.counterCard?.classList.contains('is-open');
  setCounterOpen(open);
});
els.counterPassage?.addEventListener('input', () => {
  updateCounterCount();
  showCounterError('');
});
els.counterRun?.addEventListener('click', runCounter);
els.counterBody?.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLButtonElement)) return;
  // Single delegated click handler for intensity / reader / mode chips.
  if (t.dataset.intensity) { setCounterIntensity(t.dataset.intensity); return; }
  if (t.dataset.reader)    { setCounterReader(t.dataset.reader);       return; }
  if (t.dataset.mode)      { setCounterScope(t.dataset.mode);          return; }
});
els.docStripPull?.addEventListener('click', pullSelectionIntoCounter);
// Cmd/Ctrl+Enter inside the textarea runs the counter — same shortcut as
// many AI form patterns. Plain Enter inserts a newline (default behavior).
els.counterPassage?.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
    ev.preventDefault();
    runCounter();
  }
});

// ── Pending action drain (from context menu / shortcut / pill) ─────
async function drainPending() {
  try {
    const { pendingAction } = await chrome.storage.session.get(['pendingAction']);
    if (!pendingAction) return;
    await chrome.storage.session.remove(['pendingAction']);
    const text = String(pendingAction.text || '').trim();
    const action = pendingAction.action || 'quiz-me';
    // The 'counter-this' action goes to the native Counter-your-draft
    // card instead of the voice round — prefill the passage, open the
    // card, kick off the agent call. Everything else falls through to
    // the voice round with the topic prefilled.
    if (action === 'counter-this') {
      if (text && els.counterPassage) {
        els.counterPassage.value = text.slice(0, 12000);
        updateCounterCount();
      }
      setCounterOpen(true);
      if (els.hint) {
        const preview = text.length > 56 ? text.slice(0, 53) + '…' : text;
        els.hint.textContent = `Countering: "${preview}"`;
      }
      // Auto-run the agent — the user already picked the action; no
      // reason to make them click again. The card surfaces loading state.
      if (text && text.length >= 40) {
        runCounter();
      }
      return;
    }
    // Hint + topic prefilled regardless.
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
// Last-seen streak across panel renders. Compared against the new
// snapshot to fire chimes only on transitions (extended / broken),
// not every refresh. Resets to null on first call so we don't chime
// on the panel's initial open with a pre-existing streak.
let _lastSeenStreak = null;
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

      // Streak-transition chimes. Fire only on second+ refresh so the
      // very first paint (panel open with existing streak) stays silent.
      //   prev > 0 AND now > prev → streak extended (success)
      //   prev > 0 AND now === 0  → streak broken (deflating tone)
      // Tone-only fallback inline because the panel can't reach the
      // host app's SFX module; same da-sfx-muted localStorage key.
      if (_lastSeenStreak !== null) {
        if (days > _lastSeenStreak) {
          try { streakChime.extended(); } catch(_){}
        } else if (_lastSeenStreak > 0 && days === 0) {
          try { streakChime.broken(); } catch(_){}
        }
      }
      _lastSeenStreak = days;

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

// Streak chimes. Use the same minimal SFX bridge pattern as the
// captured/confirm tones — inline AudioContext so the extension can
// sound without bundling /js/sfx.js. Mute respects da-sfx-muted +
// prefers-reduced-motion via the existing SFX object's isMuted-style
// check duplicated here.
const streakChime = (() => {
  function isMuted() {
    try { if (localStorage.getItem('da-sfx-muted') === '1') return true; } catch(_){}
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch(_){}
    return false;
  }
  let ctx = null;
  function getCtx() {
    if (ctx) return ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch(_) { return null; }
    return ctx;
  }
  function note(freq, dur, peak, type, delayMs) {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch(_){} }
    try {
      const t0 = c.currentTime + (delayMs || 0) / 1000;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch(_){}
  }
  return {
    // Streak extended: rising two-note (C5→G5), short. Celebratory but
    // not overdone — the streak chip is a secondary surface.
    extended: () => {
      note(523.25, 0.16, 0.14, 'sine', 0);
      note(783.99, 0.20, 0.16, 'sine', 100);
    },
    // Streak broken: descending minor pair (G4→C4), triangle for a
    // slightly mournful timbre. Quick — the user already feels bad
    // about losing the streak, no need to twist the knife.
    broken: () => {
      note(392.00, 0.22, 0.14, 'triangle', 0);
      note(261.63, 0.30, 0.13, 'triangle', 140);
    },
  };
})();

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
  // Recent-drills list is dormant in the Counter-primary surface — the
  // setup card no longer renders it. The function stays so legacy call
  // sites (drainPending, init) don't trip, but we don't toggle the
  // onboard visibility off based on recent count anymore. The onboard
  // hints (Google-Docs entry points) are always relevant.
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

  // Counter-your-draft restore. Intensity persists; card-open does NOT
  // auto-restore on every boot (would steal vertical space from the
  // primary Start-drill flow) unless the user explicitly opened it.
  const savedIntensity = readLocal(STORAGE_KEYS.counterIntensity);
  if (savedIntensity && ['measured', 'firm', 'fierce'].includes(savedIntensity)) {
    state.counterIntensity = savedIntensity;
  }
  setCounterIntensity(state.counterIntensity);
  // Reader + scope restore. Reader defaults to 'generic'; scope to
  // 'paragraph'. Both persist across panel sessions.
  const savedReader = readLocal(STORAGE_KEYS.counterReader);
  if (savedReader && VALID_READERS.has(savedReader)) {
    state.counterReader = savedReader;
  }
  setCounterReader(state.counterReader);
  const savedScope = readLocal(STORAGE_KEYS.counterScope);
  if (savedScope && VALID_SCOPES.has(savedScope)) {
    state.counterScope = savedScope;
  }
  setCounterScope(state.counterScope);
  updateCounterCount();
  // Doc-context strip: ask the background SW whether the active tab is
  // a Google Doc, render the title strip if so. Re-runs whenever the
  // window regains focus so switching tabs picks up the new context.
  refreshDocStrip();
  window.addEventListener('focus', refreshDocStrip);
  const wasOpen = readLocal(STORAGE_KEYS.counterCardOpen) === '1';
  if (wasOpen) setCounterOpen(true);
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
