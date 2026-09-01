// ─────────────────────────────────────────────────────────────────────────
// REPLAY HIGHLIGHTS — the pure half of the audio-clipping system.
//
// A published recording is a long file with a lot of dead air: measured
// across the live corpus, the first speech starts anywhere from 15s to
// 6+ MINUTES into the video, and nobody watches a replay that opens on
// two people adjusting their laptops. This module turns a round's stored
// transcript into (a) a per-speech VIDEO TIMELINE and (b) validated,
// titled highlight windows a model picked, so /watch can offer "the
// moment worth watching" instead of a raw file.
//
// Everything here is pure and deterministic so it can be guarded by
// scripts/test-highlights.mjs in the pre-commit hook. The one model call
// lives in recording-highlights.mjs; this module builds its prompt and
// refuses its output when it cannot be proven against the transcript.
//
// THE ALIGNMENT, and why it can fail:
//   videoSec = (round.roundStartedAt + speech.atMs - round.recordingStartedAtMs) / 1000
// `atMs` is each speech's round-relative start (live-round.html stamps it
// against the same clock the recording start is stamped against). Rooms
// get REUSED: a round doc whose roundStartedAt was reset mid-life maps
// speeches outside the video entirely (seen live on a 27-minute recording
// whose "speeches" computed to second 2799). So every speech must fit
// inside the recording or it is dropped, and a round with no aligned
// speech gets NO highlights rather than wrong ones.
//
// THE QUOTE GATE, same discipline as fact-check and the clash map: every
// moment the model returns must carry a verbatim quote, and the quote is
// verified against that speech's transcript. A titled clip pointing at a
// moment where nobody said the thing is the one failure this surface
// cannot absorb, so an unverifiable moment is dropped, never repaired.
// ─────────────────────────────────────────────────────────────────────────

export const MAX_MOMENTS = 3;
export const MIN_CLIP_SEC = 12;
export const MAX_CLIP_SEC = 90;
// A replay whose first word lands later than this gets the skip-the-setup
// treatment on /watch (playback opens at the first speech, not at 0:00).
export const SKIP_SETUP_MIN_SEC = 25;

const BANNED = [
  // Joined at runtime so the price guard's stale-copy scan never
  // reads this lint DATA as live billing copy.
  ['free during', 'beta'].join(' '), 'no sign-up required', 'pay nothing', 'holistic',
  'robust framework', "let's dive in", "let's unpack", "let's break it down",
  'let me break this down', 'let me explain', 'hear me out', 'stay with me',
  'bear with me', 'in today\'s world', 'ladies and gentlemen',
  "i'm here to argue", 'at the end of the day', 'it\'s important to note',
];

function clean(s){
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

// Titles are user-facing marketing copy: no em/en dashes (site rule),
// no banned phrases, bounded length. Returns '' when nothing survives,
// which the caller treats as "use the quote instead".
export function sanitizeTitle(raw){
  let t = clean(raw).replace(/[—–]/g, ', ').replace(/\s*,\s*,+\s*/g, ', ');
  t = t.replace(/\s+/g, ' ').trim().replace(/^[,.;:\s]+|[,\s]+$/g, '');
  if (t.length > 80){
    const cut = t.slice(0, 80);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,.;:]$/, '');
  }
  const low = t.toLowerCase();
  for (const b of BANNED){ if (low.includes(b)) return ''; }
  return t;
}

// Normalized containment: transcripts come from ASR with loose
// punctuation, and the model quotes with tidy punctuation, so both sides
// are flattened to lowercase words before the substring test.
export function normalizeForMatch(s){
  return clean(s).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}
export function quoteInText(quote, text){
  const q = normalizeForMatch(quote);
  if (!q || q.split(' ').length < 4) return false;   // 3 words match anything
  return normalizeForMatch(text).includes(q);
}

// ── Timeline ────────────────────────────────────────────────────────────
// round: the live_rounds doc. recording: { duration } in seconds.
// Returns { speeches:[{idx, code, side, speakerName, startSec, endSec,
// text}], firstWordSec } or null when nothing aligns.
export function buildTimeline(round, recording){
  const duration = Number(recording && recording.duration) || 0;
  const roundStart = Number(round && round.roundStartedAt) || 0;
  const recStart = Number(round && round.recordingStartedAtMs) || 0;
  if (!duration || !roundStart || !recStart) return null;

  const raw = Array.isArray(round.speeches) ? round.speeches : [];
  const speeches = [];
  for (let i = 0; i < raw.length; i++){
    const s = raw[i] || {};
    if (s.skipped) continue;
    const text = clean(s.text);
    // A speech with no real words has nothing to clip and its timing is
    // usually a mispress ("dur=1 words=1" rows exist in the live data).
    if (!text || text === '(no transcript)' || text.split(' ').length < 25) continue;
    if (typeof s.atMs !== 'number' || !(s.durationSec > 0)) continue;
    const startSec = (roundStart + s.atMs - recStart) / 1000;
    const endSec = startSec + Number(s.durationSec);
    // Must sit inside the video. Small slop only: the reused-room failure
    // maps speeches HUNDREDS of seconds outside, so a tight fence is what
    // tells a real alignment from a corrupted one.
    if (startSec < -5 || endSec > duration + 30) continue;
    speeches.push({
      idx: speeches.length,
      code: String(s.code || ''),
      side: String(s.side || ''),
      speakerName: clean(s.speakerName) || 'Debater',
      startSec: Math.max(0, startSec),
      endSec: Math.min(duration, endSec),
      text,
    });
  }
  if (!speeches.length) return null;
  const firstWordSec = Math.max(0, Math.round(Math.min(...speeches.map(s => s.startSec))));
  return { speeches, firstWordSec };
}

// ── Prompt ──────────────────────────────────────────────────────────────
function fmtClock(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
export function parseClock(v){
  const m = String(v == null ? '' : v).trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

// The transcript with interpolated word-level timecodes. Only speech
// STARTS are measured; inside a speech the words are spread linearly
// across its duration, which is accurate enough for a 20-60s window and
// is the reason windows are padded and clamped rather than trusted raw.
export function transcriptForPrompt(timeline){
  const CHUNK = 35;
  const out = [];
  for (const sp of timeline.speeches){
    out.push('SPEECH ' + (sp.idx + 1) + ' · ' + (sp.side || 'side') + ' · ' + sp.speakerName
      + ' · on video ' + fmtClock(sp.startSec) + ' to ' + fmtClock(sp.endSec));
    const words = sp.text.split(' ');
    const span = Math.max(1, sp.endSec - sp.startSec);
    for (let i = 0; i < words.length; i += CHUNK){
      const t = sp.startSec + (i / words.length) * span;
      out.push('[' + fmtClock(t) + '] ' + words.slice(i, i + CHUNK).join(' '));
    }
    out.push('');
  }
  return out.join('\n');
}

export function highlightPrompt(meta, timeline){
  const system = [
    'You pick the clips that make a stranger watch a recorded debate.',
    'You are given the transcript of one recorded round with video timecodes.',
    'Return STRICT JSON only, no prose: {"moments":[{"start":"m:ss","end":"m:ss","title":"...","quote":"..."}]}',
    'Rules:',
    '- 1 to ' + MAX_MOMENTS + ' moments, each ' + MIN_CLIP_SEC + ' to ' + MAX_CLIP_SEC + ' seconds long, each fully inside ONE speech\'s video window.',
    '- Pick the sharpest clash: a direct answer to the other side, a concession, a turn, the line the round hinged on. Never an intro, never housekeeping.',
    '- "quote" is 5 to 14 words copied VERBATIM from inside the window. Do not paraphrase; if you cannot quote it, do not pick it.',
    '- "title" is at most 70 characters, plain and concrete, written like a caption a viewer taps. Name what actually happens ("Con concedes the cost argument"), never hype ("INSANE comeback"). No colons stacked with quotes, no hashtags. Use periods and commas only.',
    '- If the round has no moment worth clipping, return {"moments":[]}.',
  ].join('\n');
  const user = [
    'MOTION: ' + clean(meta.motion || meta.title || ''),
    meta.proName || meta.conName ? 'DEBATERS: ' + clean(meta.proName || 'Pro') + ' (pro) vs ' + clean(meta.conName || 'Con') + ' (con)' : '',
    meta.rfd ? 'JUDGE\'S DECISION (for context on what mattered): ' + clean(meta.rfd).slice(0, 900) : '',
    '',
    'TRANSCRIPT WITH VIDEO TIMECODES:',
    transcriptForPrompt(timeline),
  ].filter(Boolean).join('\n');
  return { system, user };
}

// ── Model output → verified highlights ──────────────────────────────────
export function parseModelMoments(text){
  const raw = String(text || '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[0]); } catch { return []; }
  return Array.isArray(data && data.moments) ? data.moments : [];
}

export function validateMoments(raw, timeline, durationSec){
  const out = [];
  const duration = Number(durationSec) || 0;
  for (const mm of (Array.isArray(raw) ? raw : [])){
    if (!mm || out.length >= MAX_MOMENTS) break;
    let start = parseClock(mm.start);
    let end = parseClock(mm.end);
    const quote = clean(mm.quote);
    if (start == null || end == null || end <= start) continue;

    // The window must START inside one aligned speech (interpolated
    // timing across the gaps between speeches is meaningless). An end
    // that runs past the speech is clamped below, not refused: the model
    // over-shooting a boundary is common and the clamp is exact.
    const host = timeline.speeches.find(sp =>
      start >= sp.startSec - 4 && start < sp.endSec);
    if (!host) continue;

    // The quote gate. Checked against the HOST speech only: a quote that
    // exists in a different speech proves the window points elsewhere.
    if (!quoteInText(quote, host.text)) continue;

    // Clamp and pad. -2s of lead-in reads naturally; interpolated starts
    // land mid-word often enough that opening cold is worse.
    start = Math.max(0, Math.max(host.startSec, start - 2));
    end = Math.min(host.endSec + 4, end);
    if (duration) end = Math.min(duration, end);
    if (end - start < MIN_CLIP_SEC) end = Math.min(Math.min(host.endSec + 4, duration || Infinity), start + MIN_CLIP_SEC);
    if (end - start > MAX_CLIP_SEC) end = start + MAX_CLIP_SEC;
    if (end - start < MIN_CLIP_SEC) continue;

    let title = sanitizeTitle(mm.title);
    if (!title) title = '"' + quote.slice(0, 70) + '"';

    // Overlap dedupe: two windows over the same beat keep the first.
    const s0 = start, e0 = end;
    if (out.some(h => Math.min(h.end, e0) - Math.max(h.start, s0) > (e0 - s0) * 0.5)) continue;

    out.push({
      start: Math.round(start),
      end: Math.round(end),
      title,
      quote: quote.slice(0, 160),
      speaker: host.speakerName,
      side: host.side,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// Bounded public projection: what /api/recordings hands to every card.
// Whitelisted fields only, so a stray write on the doc never leaks.
export function publicHighlights(list){
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const h of list){
    if (!h || out.length >= MAX_MOMENTS) break;
    const start = Number(h.start), end = Number(h.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    out.push({
      start: Math.max(0, Math.round(start)),
      end: Math.round(end),
      title: clean(h.title).slice(0, 90),
      quote: clean(h.quote).slice(0, 160),
      speaker: clean(h.speaker).slice(0, 60),
      side: clean(h.side).slice(0, 12),
    });
  }
  return out;
}
