// Shared helpers for public round pages (/r/{id}).
//
// Public rounds are a separate Firestore collection (`public_rounds`)
// from the user-private `debate_rounds`. Two reasons for the split:
//  1. Public docs need different security rules (read=any, write=author).
//  2. We want short URL-safe IDs (8 chars), not the `{uid}_{timestamp}`
//     keys debate_rounds uses for private storage.
//
// The publish flow COPIES sanitized fields from a finished round into a
// new public_rounds doc, generating a short ID. The original private
// round (and its localStorage twin) stays untouched.

import crypto from 'node:crypto';

// 8-char URL-safe ID. base32-ish alphabet (no 0/O/1/l/i confusables).
// At 30 chars × 8 = 30^8 ≈ 6.5e11 possibilities — collisions vanishingly
// rare for any realistic publish volume on this app.
const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function generatePublicId() {
  const bytes = crypto.randomBytes(8);
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return id;
}

// Hard caps so a hostile or runaway client can't bloat a single public
// doc into something that breaks Firestore (1 MB doc limit) or the
// render-page response. Speeches array capped at 12 turns total
// (a full debate round is 6–8 speeches; 12 is comfortable headroom).
export const MAX_MOTION_CHARS = 600;
export const MAX_SPEECH_CHARS = 8000;
export const MAX_RFD_CHARS = 12000;
export const MAX_SPEECHES = 12;
export const MAX_DISPLAY_NAME_CHARS = 40;

export function clamp(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

// Build the doc that goes into Firestore. The caller supplies a raw
// payload; this strips/normalizes per the caps above and returns either
// a clean object or null (which the caller turns into a 400).
export function sanitizePublishPayload(raw, uid) {
  if (!raw || typeof raw !== 'object') return null;

  const motion = clamp(raw.motion, MAX_MOTION_CHARS);
  if (!motion) return null;

  const speechesIn = Array.isArray(raw.speeches) ? raw.speeches.slice(0, MAX_SPEECHES) : [];
  const speeches = speechesIn
    .map(s => {
      if (!s || typeof s !== 'object') return null;
      const text = clamp(s.text, MAX_SPEECH_CHARS);
      if (!text) return null;
      return {
        who: clamp(s.who, 16) || 'user',         // 'user' | 'ai'
        speaker: clamp(s.speaker, 40),           // human-readable, e.g. 'Gov 1'
        side: clamp(s.side, 16),                 // 'gov' | 'opp' | etc.
        text,
      };
    })
    .filter(Boolean);

  if (!speeches.length) return null;

  const winner = raw.winner === 'user' || raw.winner === 'ai' ? raw.winner : null;
  const speakerPoints = (raw.speakerPoints && typeof raw.speakerPoints === 'object')
    ? {
        user: typeof raw.speakerPoints.user === 'number' ? raw.speakerPoints.user : null,
        ai:   typeof raw.speakerPoints.ai   === 'number' ? raw.speakerPoints.ai   : null,
      }
    : null;

  // First-name + last-initial only. If the client sends a full name we
  // truncate to that pattern server-side so a slip on the client can't
  // leak a real-name doxx.
  const rawName = clamp(raw.displayName, MAX_DISPLAY_NAME_CHARS).trim();
  const parts = rawName.split(/\s+/).filter(Boolean);
  const displayName = parts.length >= 2
    ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
    : (parts[0] || '');

  return {
    motion,
    format: clamp(raw.format, 40),
    formatName: clamp(raw.formatName, 80),
    side: clamp(raw.side, 16),
    sideLabel: clamp(raw.sideLabel, 40),
    voice: clamp(raw.voice, 40),
    voiceName: clamp(raw.voiceName, 80),
    brain: clamp(raw.brain, 40),
    speeches,
    rfd: clamp(raw.rfd, MAX_RFD_CHARS),
    decision: clamp(raw.decision, 1200),
    winner,
    speakerPoints,
    authorUid: uid,
    displayName,
    viewCount: 0,
    tryCount: 0,
  };
}

// Plain HTML escape for server-rendered output. Public round content is
// user-supplied; everything that hits the response body has to pass
// through this. Don't add raw HTML to the render template without it.
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}

// JSON for <script type="application/ld+json"> bodies. Need to break out
// of the script context if the content contains </script>.
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
