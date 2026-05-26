// Shared content guard — the "pseudo dick detector."
//
// Single regex-first floor used everywhere user-typed content enters the
// system: motion input on the six brain endpoints, /spar waitlist notes,
// profile display-name + bio, DM messages, etc.
//
// Designed deliberately to be FAST (no LLM call), CHEAP (no Firestore
// read), and STATELESS (no rate-limit map). The expensive LLM grader at
// /api/classify-disclosure stays for the disclosure board where false
// positives matter more; this lib is the floor that catches the obvious
// stuff before any LLM or downstream service sees it.
//
// What it catches:
//   - Slurs (racial, ethnic, anti-LGBTQ, ableist) — obfuscation-aware
//   - Sexual explicit (off-topic for any debate or roster surface)
//   - Sexual content involving minors — zero tolerance, separate hit
//   - Harassment patterns ("[name] is a [slur]")
//   - URL spam / link dumps
//   - Length floor + ceiling (per kind)
//   - Control characters + zero-width abuse (homoglyph filler)
//
// What it deliberately DOESN'T catch:
//   - Controversial political positions (debate motions cover these)
//   - Profanity-as-emphasis ("that argument is fucking cooked" is fine)
//   - Quoted slur references ("the n-word's reclamation history") — the
//     analytical/quoted form is allowed; raw use is not
//   - Tagged citations / academic vocab / philosophy references
//
// Returns the same { ok, reason, category } shape as disclosure-guard.js
// so callers can swap or chain them without translation.

// ── Banlist ──────────────────────────────────────────────────────────
//
// Word-boundary-anchored, case-insensitive, with common obfuscation
// (digit/symbol substitution). Mirrors the disclosure-guard.js list +
// adds the few extras debaters don't legitimately need in a motion.
// Keep this list short and surgical. The cost of a false positive on a
// real motion is much higher than the cost of letting one slur slip
// past the cheap floor — the LLM classifier (or human report) catches
// edge cases at higher levels.

const SLUR_PATTERNS = [
  /\bn[i1!|]gg[e3]r/i,
  /\bn[i1!|]gg[a@]/i,
  /\bf[a@]gg?[o0]t/i,
  /\bk[i1!|]k[e3]\b/i,
  /\bch[i1!|]nk\b/i,
  /\bsp[i1!|]c\b/i,
  /\bg[o0]{2}k\b/i,
  /\bw[e3]tb[a@]ck\b/i,
  /\btrann[ie]e?s?\b/i,
  /\bret[a@]rd(ed)?\b/i,
  /\bcunt\b/i,
];

const SEXUAL_EXPLICIT_PATTERNS = [
  /\bcock\s*suck/i,
  /\bjerk\s*off/i,
  /\bjack\s*off/i,
  /\bblow\s*job/i,
  /\bhand\s*job/i,
  /\brim\s*job/i,
  /\bcum\s*(slut|dump|shot|bucket)/i,
  /\bgang\s*bang/i,
  /\bdeep\s*throat/i,
  /\b(suck|lick|eat|ride|fuck)\s+(my|your|his|her|the)?\s*(dick|cock|pussy|ass|tits|boobs)\b/i,
  /\b(my|your|his|her)\s+(throbbing|hard|wet|big|huge|massive|long|thick|tight)\s+(dick|cock|pussy|tits|boobs|ass)\b/i,
  // First-person "I have a [adj?] [genital]" — flexible middle so
  // articles and adjectives in any order still match.
  /\b(i|me)\s+(have|got|own|love|like|am|got\s+a|got\s+the|got\s+such)\s+[a-z\s'-]{0,40}?(dick|cock|penis|pussy|vagina|tits|boobs|balls|nuts)\b/i,
  /\b(send|show|see|gimme|give\s+me|want)\s+(me\s+)?(your\s+)?(nudes|tits|dick|pussy|ass|cock)\b/i,
];

// Bare genital tokens. ON SHORT SURFACES ONLY (name / note / bio) — a
// profile name "BigDick420" or a waitlist note that's literally "pussy"
// has no debate-legitimate use. On long surfaces (motion / message / case)
// these would false-positive on real debate motions ("Should we ban Dick
// Cheney from speaking?" / "policy of cocks of the walk in Indian
// poultry markets") so we let the more nuanced patterns above carry the
// load there.
const BARE_GENITAL_RE = /\b(dick|cock|penis|pussy|vagina|tits|boobs|nuts|balls|cum|jizz|semen|clit)\b/i;
const SHORT_SURFACE_KINDS = new Set(['name', 'note', 'bio']);

// Display-name compound check — CamelCase + digit-suffix hides words from
// \b word-boundary matching ("BigDick420" → "BigDick420", no boundary
// inside). We lowercase + strip non-letters, then look for clearly
// sexual compound substrings. Targeted at the obvious "looks like a
// sexual handle" patterns rather than blanket-blocking real surnames
// (Dickinson, Cox, Hancock, etc.) so a real "Emily Dickinson" still
// passes.
const NAME_COMPRESSED_BLOCKLIST = [
  'bigdick', 'bigcock', 'hugedick', 'hugecock', 'fatcock',
  'cocksuck', 'dicksuck', 'cumeater', 'cumlover', 'cumdump',
  'pussylick', 'pussyeater', 'pussyslayer', 'pussydestroy',
  'sexgod', 'sexlord', 'fuckgod', 'fucklord', 'fuckboi', 'fuckboy',
  'jerkoff', 'jackoff', 'wankoff',
  'rapeme', 'gangbang',
  'bigtits', 'hugetits', 'bigboobs', 'hugeboobs',
];

// Zero-tolerance sexual-minor patterns. Categorized separately so the
// caller knows to never just warn — block hard, log, optionally report.
const SEXUAL_MINOR_PATTERNS = [
  /\b(child|kid|minor|young|teen|preteen|underage)\s+(porn|sex|nude|nudes)\b/i,
  /\b(porn|sex|nude|nudes)\s+(child|kid|minor|young|teen|preteen|underage)\b/i,
  /\b(cp|child\s*p(orn)?)\b/i,
  /\bloli(con)?\b/i,
  /\bshota(con)?\b/i,
];

// Harassment pattern: NAME followed by SLUR. The standalone slur regexes
// already block "n-word", but "[someone] is a [slur]" deserves a more
// specific category so the user message can call it out as a personal
// attack rather than just "banned word."
const ATTACK_PATTERN = /\b(is|are|was|were)\s+(a|an|the)?\s*(fucking|stupid|dumb|gay)?\s*(faggot|retard|tranny|cunt|nigger|niggas?|kike|chink|spic|gook|wetback)/i;

// URL detection. We allow links in motions and bios (sometimes useful)
// but cap the count + ratio to prevent the entry being a link dump.
const URL_RE = /https?:\/\/[^\s)]+/gi;

// Zero-width / formatting characters that abusers use to bypass simple
// word filters ("n​igger"). We strip these before regex-matching.
const ZERO_WIDTH_RE = /[​-‏‪-‮⁠-⁤﻿]/g;

// ── Kind-specific config ────────────────────────────────────────────
//
// Each surface has different reasonable bounds:
//
//   motion   — a debate motion ("THBT this house would ban X"). 8-1024.
//   note     — a /spar waitlist note ("free tonight 8pm EST"). 0-240.
//   bio      — a profile bio / about-me snippet. 0-500.
//   name     — a profile display-name override. 1-40.
//   message  — a DM message. 1-2000.
//   case     — a longer published case (disclosure board floor). 200-51200.
//
// `linkMax`: hard cap on number of URLs in the text (0 disables the cap).
// `linkRatioMax`: if (chars-in-URLs / non-whitespace chars) > this, reject.
//
// Length limits are gentle on the floor and firm on the ceiling — a too-
// short message just gets nudged ("add a real note"), but a too-long one
// would blow up the downstream services.

const KIND_CONFIG = {
  motion:  { min: 8,   max: 1024,  linkMax: 4,  linkRatioMax: 0.35 },
  note:    { min: 0,   max: 240,   linkMax: 1,  linkRatioMax: 0.30 },
  bio:     { min: 0,   max: 500,   linkMax: 2,  linkRatioMax: 0.30 },
  name:    { min: 1,   max: 40,    linkMax: 0,  linkRatioMax: 0    },
  message: { min: 1,   max: 2000,  linkMax: 4,  linkRatioMax: 0.40 },
  case:    { min: 200, max: 51200, linkMax: 8,  linkRatioMax: 0.40 },
  // Fallback bucket — used when the caller doesn't specify a kind.
  // Conservative so a careless caller doesn't accidentally accept
  // garbage; intentionally a little tighter than `message`.
  default: { min: 1,   max: 2000,  linkMax: 3,  linkRatioMax: 0.35 },
};

// ── Normalizer ──────────────────────────────────────────────────────
//
// Strip zero-width chars + control chars + collapse repeated whitespace
// so the regexes match on what the user actually typed, not what they
// disguised. We don't normalize case (regexes are /i) or do leet-substitution
// here — the regexes encode the obvious substitutions inline. Going
// further (homoglyph normalization, Unicode confusable folding) gets
// false-positivey for multilingual users.

function normalize(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(ZERO_WIDTH_RE, '');
  // Strip ASCII control chars except \n \t — those are legitimate in
  // longer text fields. Keep the original line breaks for the
  // length-check + the eventual write.
  s = s.replace(/[ --]/g, '');
  return s;
}

// ── The check ───────────────────────────────────────────────────────
//
// Result shape:
//   { ok: true }                                — safe, ship it
//   { ok: false, reason, category, hit? }     — block, show `reason`
//
// `category` values are stable so callers can branch UX on them:
//   'slur' | 'sexual_explicit' | 'sexual_minor' | 'harassment'
// | 'spam' | 'too_short' | 'too_long' | 'empty'
//
// `hit` (when present) is a redacted snippet around the matched span,
// useful for server logs without echoing the full payload. Never echo
// it back to the user — that just teaches the abuser what tripped the
// filter.

export function checkContent({ text, kind = 'default', minLength, maxLength } = {}) {
  const cfg = KIND_CONFIG[kind] || KIND_CONFIG.default;
  const min = typeof minLength === 'number' ? minLength : cfg.min;
  const max = typeof maxLength === 'number' ? maxLength : cfg.max;

  const normalized = normalize(text);
  const trimmed = normalized.trim();

  // Length floor / ceiling. Min === 0 means "optional content allowed,"
  // not "any zero-length value passes regex checks below" — empty is
  // fine and short-circuits as ok.
  if (!trimmed.length) {
    if (min === 0) return { ok: true };
    return { ok: false, reason: 'This field is required.', category: 'empty' };
  }
  if (trimmed.length < min) {
    return {
      ok: false,
      reason: `Too short (${trimmed.length}/${min} characters). Add a bit more.`,
      category: 'too_short',
    };
  }
  if (trimmed.length > max) {
    return {
      ok: false,
      reason: `Too long (${trimmed.length}/${max} characters). Trim it down.`,
      category: 'too_long',
    };
  }

  // Zero-tolerance check FIRST. If this ever fires, we want the most
  // specific category in the log; the slur checks below would also
  // match some of these patterns but the right reason is the minor one.
  for (const re of SEXUAL_MINOR_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason: 'Content blocked. This kind of content has no place here and the attempt is logged.',
        category: 'sexual_minor',
      };
    }
  }

  // Slurs.
  for (const re of SLUR_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason: 'Content blocked for a slur. Debate the substance without slurs — the AI argues just as hard without them.',
        category: 'slur',
      };
    }
  }

  // Targeted attack ("[name] is a [slur]") — caught by SLUR_PATTERNS
  // already, but if a slur slips past the standalone list as part of an
  // attack phrase, the ATTACK_PATTERN catches it with a more accurate
  // category label.
  if (ATTACK_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason: 'Content blocked for a personal attack. Debate positions, not people.',
      category: 'harassment',
    };
  }

  // Sexual explicit (off-topic for debate + roster surfaces).
  for (const re of SEXUAL_EXPLICIT_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason: 'Content blocked. This isn\'t the surface for explicit content — keep it debate-relevant.',
        category: 'sexual_explicit',
      };
    }
  }

  // Bare genital token on a short-surface kind (name / note / bio).
  // The longer surfaces use the more nuanced patterns above; here we
  // assume a profile field has no legitimate use for the bare word.
  if (SHORT_SURFACE_KINDS.has(kind) && BARE_GENITAL_RE.test(trimmed)) {
    return {
      ok: false,
      reason: 'Content blocked. Profile and roster fields aren\'t the surface for that.',
      category: 'sexual_explicit',
    };
  }

  // Name-only: compressed-letter compound check ("BigDick420" → "bigdick").
  // Real surnames containing flagged letter runs still pass — we only hit
  // the obvious sexual-handle patterns enumerated in NAME_COMPRESSED_BLOCKLIST.
  if (kind === 'name') {
    const compressed = trimmed.toLowerCase().replace(/[^a-z]+/g, '');
    for (const bad of NAME_COMPRESSED_BLOCKLIST) {
      if (compressed.includes(bad)) {
        return {
          ok: false,
          reason: 'That display name isn\'t allowed. Use a real handle.',
          category: 'sexual_explicit',
        };
      }
    }
  }

  // URL spam — only enforce if the kind allows any links at all. `name`
  // forbids them entirely (handled by linkMax:0); other kinds get
  // count + ratio caps to prevent the entry being a link dump.
  if (cfg.linkMax === 0 && URL_RE.test(trimmed)) {
    URL_RE.lastIndex = 0; // reset stateful global regex
    return {
      ok: false,
      reason: 'Links aren\'t allowed in this field.',
      category: 'spam',
    };
  }
  URL_RE.lastIndex = 0;
  const matches = trimmed.match(URL_RE) || [];
  if (cfg.linkMax > 0 && matches.length > cfg.linkMax) {
    return {
      ok: false,
      reason: `Too many links (${matches.length}, max ${cfg.linkMax}).`,
      category: 'spam',
    };
  }
  if (matches.length && cfg.linkRatioMax > 0) {
    let urlChars = 0;
    for (const m of matches) urlChars += m.length;
    const nonWs = trimmed.replace(/\s+/g, '').length;
    if (nonWs > 0 && urlChars / nonWs > cfg.linkRatioMax) {
      return {
        ok: false,
        reason: 'Looks like a link dump. The text should be your words, not a list of URLs.',
        category: 'spam',
      };
    }
  }

  return { ok: true };
}

// Convenience: pre-flight a multi-field write (e.g. spar waitlist note +
// format selection) by running each field through its kind config and
// returning the first failure. Caller passes an array of {text, kind}
// pairs; result is `{ ok: true }` or the failing field's result + which
// field failed.
export function checkAll(fields = []) {
  for (const f of fields) {
    const r = checkContent(f);
    if (!r.ok) return { ...r, field: f.field || f.kind || 'unknown' };
  }
  return { ok: true };
}

// Convenience: light text-sanitizer for the "ok" path. Returns the
// normalized + length-clamped string so callers don't need to re-do
// the normalization before writing to Firestore. Does NOT redact —
// just normalizes whitespace + zero-width chars.
export function sanitizeText(text, kind = 'default') {
  const cfg = KIND_CONFIG[kind] || KIND_CONFIG.default;
  const n = normalize(text).trim();
  return n.length > cfg.max ? n.slice(0, cfg.max) : n;
}

export const KINDS = Object.keys(KIND_CONFIG).filter(k => k !== 'default');

// Brain-endpoint convenience. Each of the 6 brain proxies (claude /
// openai-chat / gemini / grok / deepseek / openlab) destructures the
// same `_motion` field from the request body before forwarding to the
// upstream LLM. Call this once per request, right after the body is
// parsed, so an inappropriate motion never reaches any provider.
//
// We deliberately do NOT screen the messages[] content — that's where
// chained AI / system / user messages live and the false-positive rate
// on a multi-turn debate transcript is high. The `_motion` field is
// the clean, user-typed signal.
//
// Returns the same shape as checkContent: { ok } | { ok: false, reason,
// category }. Caller turns a non-ok into an HTTP response.
export function checkMotionBody(body) {
  if (!body || typeof body !== 'object') return { ok: true };
  const motion = typeof body._motion === 'string' ? body._motion : '';
  if (!motion.trim()) return { ok: true }; // older clients omit _motion
  return checkContent({ text: motion, kind: 'motion' });
}
