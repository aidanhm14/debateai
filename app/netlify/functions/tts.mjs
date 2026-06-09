// Text-to-Speech proxy
// - Premium (default): ElevenLabs turbo_v2_5 streaming — expressive, voice-matched to debater personalities
// - Premium + opt-in Cartesia: pass body.provider === 'cartesia' to A/B-test Sonic (faster, cheaper, flatter)
// - Free + fallback: OpenAI gpt-4o-mini-tts with per-persona `instructions` steering
//   (March-2025 model — supports natural-language delivery direction; massively
//    closes the gap to the premium providers without changing the voice list).
//   Override the model with env OPENAI_TTS_MODEL=tts-1 if a rollback is needed.
import { checkAppCheck } from './lib/appcheck.mjs';
import { humanizeForTTS } from './lib/tts-humanize.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debateai.com',
  'https://www.debateit.com',
  'https://debateai.com',
  'https://www.debateai.com',
];
const DEV_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
];
const isProduction = process.env.CONTEXT === 'production';
const ALLOWED_ORIGINS = isProduction
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Layered per-IP caps. The minute cap was the only gate until 2026-05-18;
// added a day layer on the credit-burn audit because a bot hammering at
// 60/min under the threshold could rack up 60×60 = 3,600 TTS calls/hour =
// 86K/day per IP, which is meaningful ElevenLabs/OpenAI spend. 100/day
// reflects realistic legit use (a heavy human session is ~30-50 TTS calls).
const TTS_LAYERS = [
  { window: 60_000,    max: 60,  label: 'minute' },
  { window: 86_400_000,max: 100, label: 'day'    },
];
const rateLimitHistory = new Map(); // key → array of request timestamps

function checkRateLimit(key) {
  const now = Date.now();
  const maxWindow = Math.max(...TTS_LAYERS.map(l => l.window));
  const history = (rateLimitHistory.get(key) || []).filter(t => now - t < maxWindow);
  for (const layer of TTS_LAYERS) {
    const count = history.filter(t => now - t < layer.window).length;
    if (count >= layer.max) return { ok: false, layer: layer.label };
  }
  history.push(now);
  rateLimitHistory.set(key, history);
  if (rateLimitHistory.size > 5000) {
    const entries = Array.from(rateLimitHistory.entries());
    rateLimitHistory.clear();
    entries.slice(-2500).forEach(([k, v]) => rateLimitHistory.set(k, v));
  }
  return { ok: true };
}

const MAX_TEXT_LENGTH = 5000;

// ElevenLabs voice ID mapping — matched per-personality. Mix of American
// and British accents. Used as the English baseline AND as the final
// fallback for non-English languages when no language-native voice is
// curated yet (turbo_v2_5 is multilingual so they still synthesize the
// target language — just with an English-influenced accent).
const ELEVENLABS_VOICES = {
  professor:   'pNInz6obpgDQGcFmaJgB',  // Adam — dominant, firm, American male
  closer:      'EXAVITQu4vr4xnSDxMaL',  // Sarah — mature, confident, American female
  surgeon:     'mdBUSEWFjxcplnMt0rUf',   // Joe — confident, articulate male (your IVC)
  veteran:     'nPczCjzI2devNBz1zQrb',   // Brian — deep, resonant, American male
  firebrand:   'TX3LPaxmHKxFdv7VOQHJ',  // Liam — energetic, young, American male
  diplomat:    'XrExE9yKIg1WjnnlVkGX',   // Matilda — professional, American female
  debater:     'jsCqWAovK2LkecY7zXl4',   // Freya — quick, sharp, American female
  philosopher: 'IKne3meq5aSn9XLyUdCD',   // Charlie — thoughtful, calm, American male
  prosecutor:  'bIHbv24MWmeRgasZH58o',   // Will — intense, direct, American male
  storyteller: 'FGY2WhTYpPnrIDTdsKH5',   // Laura — warm, narrative, American female
  // Expansion pack — broader range of debate archetypes:
  statesman:   'JBFqnCBsd6RMkjVDRZzb',   // George — warm British, gravitas
  barrister:   'onwK4e9ZLuTAKqWW03F9',   // Daniel — British authoritative, courtroom
  upstart:     'pFZP5JQG7iQjIQuC4Bku',   // Lily — youthful British female, sharp
  heckler:     'CwhRBWXzGAHq8TQ4Fs17',   // Roger — gravelly older male, sardonic
  disruptor:   'cgSgspJ2msm6clMCkdW9',   // Jessica — youthful female, high-energy
  tactician:   'HKsltWQPot5Fsrsvbq1g',   // Calm guy — calm debater male in his 20s (your IVC)
  // Counter (oral exam) extension default persona. Indian-English
  // examiner. ElevenLabs voice ID is a placeholder — falls back to the
  // measured-narrator voice until an Indian-English voice ID is dropped
  // in via env override (ELEVENLABS_VOICE_EXAMINER) or hard-set here.
  // Free tier (OpenAI gpt-4o-mini-tts) gets the accent steering via
  // OPENAI_PERSONA_INSTRUCTIONS below, which is more important than the
  // ElevenLabs swap given who's actually using oral exam mode.
  examiner:    process.env.ELEVENLABS_VOICE_EXAMINER || 'pqHfZKP75CvOlQylNhV4',
};

// ─────────────────────────────────────────────────────────────────────
// PER-LANGUAGE VOICE RESOLUTION
// ─────────────────────────────────────────────────────────────────────
// The app supports 14 UI languages (see LANGUAGES in debate-it.html:
// en, es, fr, de, it, pt, zh, ja, ko, hi, ar, ru, tr, nl). When the
// user picks a non-English language, we want the persona to speak
// with a native accent of that language, not just English-with-Hindi-
// words. ElevenLabs' multilingual model can do this — but only if we
// pass it a voice whose owner natively speaks the target language.
//
// Resolution cascade (highest priority first):
//   1. Env override:   ELEVENLABS_VOICE_<PERSONA>_<LANG> (e.g.
//                       ELEVENLABS_VOICE_PROFESSOR_HI=xxx)
//   2. Curated map:    LANGUAGE_VOICE_OVERRIDES[lang][persona]
//   3. Gender pool env:ELEVENLABS_VOICE_POOL_<LANG>_<GENDER>
//   4. Gender pool map:LANGUAGE_DEFAULT_VOICES[lang][gender]
//   5. English voice:  ELEVENLABS_VOICES[persona] (existing default)
//
// The env-var paths exist so voice IDs can be curated and rotated
// without a redeploy — just set them in Netlify dashboard and the
// next request picks them up.
//
// To curate: open https://elevenlabs.io/voice-library, filter by
// "Language" → target language, look for voices tagged "Turbo v2.5"
// or "Multilingual v2" compatible, copy the voice ID, set the env var.
//
// Both maps below ship empty — the cascade safely falls back to the
// existing English voices on every persona, so this change is a no-op
// for non-English languages UNTIL voice IDs are populated.

const PERSONA_GENDER = {
  professor: 'male', closer: 'female', surgeon: 'male', veteran: 'male',
  firebrand: 'male', diplomat: 'female', debater: 'female', philosopher: 'male',
  prosecutor: 'male', storyteller: 'female', statesman: 'male', barrister: 'male',
  upstart: 'female', heckler: 'male', disruptor: 'female', tactician: 'male',
  examiner: 'male',
};

// One extra public-library voice we use only for cross-language pools.
// Antoni is the warm-narrative Polish-American voice in ElevenLabs'
// stable default library. Voice ID is documented and stable. He
// crosses to Slavic and Germanic languages noticeably better than the
// American defaults — slower attack, more open vowels, less rhotic R.
// Available everywhere ELEVENLABS_VOICES is, but not surfaced as a
// persona in the app — strictly a pool default.
const EXTRA_VOICES = {
  antoni:  'ErXwobaYiN019PkySvjV',
  rachel:  '21m00Tcm4TlvDq8ikWAM',  // warm conversational American female (default library)
};

// Per-language gender pool. Until language-native voices are curated
// from voice.elevenlabs.io, these are best-fit picks from the existing
// English-multilingual bank. The picks aren't random — each one is the
// voice whose prosody (rhythm, vowel openness, rhotic-R behavior)
// crosses the target language with the least English coloring.
// `eleven_turbo_v2_5` IS multilingual, so these voices DO speak the
// target language; the choice controls how native the accent reads.
//
// Replace any entry with a native-speaker voice ID when one is curated.
// Per-persona overrides below the pool can override these on a per-
// persona basis without losing the pool fallback for unmapped personas.
const LANGUAGE_DEFAULT_VOICES = {
  // Hindi — Indian English / Hindi prosody is rhythmic and stretched.
  // Deep, slow male voices cross better than energetic/clipped ones.
  // Mature professional female register matches Hindi formal speech.
  hi: { male: ELEVENLABS_VOICES.veteran,     female: ELEVENLABS_VOICES.closer },        // Brian + Sarah
  // Spanish — warm/expressive crosses Castilian best; British smoothness
  // crosses Latin Spanish formal register without sounding flat.
  es: { male: ELEVENLABS_VOICES.statesman,   female: ELEVENLABS_VOICES.storyteller },   // George + Laura
  // French — French rhetorical cadence is melodic and rounded. British
  // smoothness + youthful sharp female cross better than American hard-R.
  fr: { male: ELEVENLABS_VOICES.statesman,   female: ELEVENLABS_VOICES.upstart },       // George + Lily
  // German — measured, deep, deliberate. Adam (deep firm American) is
  // already close to German formal register; Sarah's mature stability
  // crosses better than energetic voices.
  de: { male: ELEVENLABS_VOICES.professor,   female: ELEVENLABS_VOICES.closer },        // Adam + Sarah
  // Italian — warm and expressive. Liam's energetic forward-leaning
  // delivery crosses Italian's emphatic prosody; Laura's narrative
  // warmth matches.
  it: { male: ELEVENLABS_VOICES.firebrand,   female: ELEVENLABS_VOICES.storyteller },   // Liam + Laura
  // Portuguese — Brazilian/European Portuguese both have rounded vowels.
  // Charlie (Australian thoughtful) crosses better than American defaults;
  // Matilda's professional register fits both variants.
  pt: { male: ELEVENLABS_VOICES.philosopher, female: ELEVENLABS_VOICES.diplomat },      // Charlie + Matilda
  // Mandarin Chinese — tonal language, voices with stable controlled
  // pitch cross better than energetic. Brian's resonance + Sarah's
  // stability both anchor well.
  zh: { male: ELEVENLABS_VOICES.veteran,     female: ELEVENLABS_VOICES.closer },        // Brian + Sarah
  // Japanese — pitch accent + subtle prosody. Calm thoughtful voices
  // are essential; energetic American voices sound jarring in Japanese.
  ja: { male: ELEVENLABS_VOICES.philosopher, female: ELEVENLABS_VOICES.diplomat },      // Charlie + Matilda
  // Korean — similar prosodic profile to Japanese. Slightly deeper male
  // matches Korean formal speech (-습니다 register).
  ko: { male: ELEVENLABS_VOICES.veteran,     female: ELEVENLABS_VOICES.closer },        // Brian + Sarah
  // Arabic — Modern Standard Arabic is formal and deep-toned. Deep
  // resonant voices match the register expected of public/academic
  // speech in Arabic.
  ar: { male: ELEVENLABS_VOICES.veteran,     female: ELEVENLABS_VOICES.closer },        // Brian + Sarah
  // Russian — sustained vowels, deep masculine register expected in
  // formal speech. Antoni's Polish-American base crosses Russian
  // noticeably better than American defaults.
  ru: { male: EXTRA_VOICES.antoni,           female: ELEVENLABS_VOICES.closer },        // Antoni + Sarah
  // Turkish — vowel-harmony language, melodic. Warm thoughtful voices
  // cross better than clipped/deep.
  tr: { male: ELEVENLABS_VOICES.philosopher, female: ELEVENLABS_VOICES.storyteller },   // Charlie + Laura
  // Dutch — Germanic with English-adjacent vowels. British voices cross
  // better than American (Dutch has British-influenced English imports).
  nl: { male: ELEVENLABS_VOICES.statesman,   female: ELEVENLABS_VOICES.upstart },       // George + Lily
};

// Per-persona × per-language overrides. Use when a specific persona +
// language pairing has a better match than the gender pool default
// would produce. Sparse on purpose — every entry below is a deliberate
// upgrade over the pool fallback, not a duplicate of it. Unmapped
// personas in any language fall through to LANGUAGE_DEFAULT_VOICES
// then to ELEVENLABS_VOICES.
const LANGUAGE_VOICE_OVERRIDES = {
  hi: {
    // Indian academic register favors gravitas + measured pace over
    // American firmness. Brian (veteran) over Adam (professor) is the
    // standard call for Hindi professor delivery.
    professor:   ELEVENLABS_VOICES.veteran,
    // Indian-English barrister register has colonial/Raj-English
    // texture — Daniel's British authoritative voice crosses
    // exceptionally well to Indian courtroom debate.
    barrister:   ELEVENLABS_VOICES.barrister,
    // Examiner persona is Indian-English by design (see examiner
    // persona spec in soul.md 2026-05-10). Daniel's measured British
    // delivery is the closest in the bank to Indian-English academic
    // examiner cadence until a native voice is wired in.
    examiner:    ELEVENLABS_VOICES.barrister,
    // Hindi philosophy / Sanskrit-adjacent contemplation register —
    // Charlie's thoughtful Australian calm crosses better than
    // American philosopher voices.
    philosopher: ELEVENLABS_VOICES.philosopher,
  },
  es: {
    // Spanish académico register matches George's warm British gravitas
    // better than American firmness. Charlie crosses Latin American
    // Spanish smoothly.
    professor:   ELEVENLABS_VOICES.statesman,
    philosopher: ELEVENLABS_VOICES.philosopher,
    // Spanish/Latin storytelling is emphatic + warm — Laura's narrative
    // tone fits without sounding flat the way the American defaults can.
    storyteller: ELEVENLABS_VOICES.storyteller,
  },
  fr: {
    // French rhetorical tradition favors smoothness + measured cadence.
    // George (British) + Charlie (Australian) cross better than American
    // firm-R voices.
    professor:   ELEVENLABS_VOICES.statesman,
    philosopher: ELEVENLABS_VOICES.philosopher,
    diplomat:    ELEVENLABS_VOICES.diplomat,
  },
  de: {
    // German formal register is deep and measured. Adam crosses German
    // academic speech cleanly; Daniel (British) handles measured
    // bureaucratic German register.
    professor:   ELEVENLABS_VOICES.professor,
    barrister:   ELEVENLABS_VOICES.barrister,
    tactician:   ELEVENLABS_VOICES.tactician,
  },
  it: {
    // Italian is warm + emphatic — Liam's forward-leaning energy + Laura's
    // narrative warmth are already the right picks.
    professor:   ELEVENLABS_VOICES.philosopher,
    firebrand:   ELEVENLABS_VOICES.firebrand,
    storyteller: ELEVENLABS_VOICES.storyteller,
  },
  pt: {
    professor:   ELEVENLABS_VOICES.statesman,
    philosopher: ELEVENLABS_VOICES.philosopher,
  },
  zh: {
    // Mandarin formal register favors stable measured deep voices.
    professor:   ELEVENLABS_VOICES.professor,
    surgeon:     ELEVENLABS_VOICES.surgeon,
    philosopher: ELEVENLABS_VOICES.philosopher,
  },
  ja: {
    // Japanese pitch-accent + politeness register reward calm voices.
    professor:   ELEVENLABS_VOICES.veteran,
    philosopher: ELEVENLABS_VOICES.philosopher,
    diplomat:    ELEVENLABS_VOICES.diplomat,
  },
  ko: {
    professor:   ELEVENLABS_VOICES.veteran,
    philosopher: ELEVENLABS_VOICES.philosopher,
  },
  ar: {
    // MSA formal register expects deep + resonant voices in public speech.
    professor:   ELEVENLABS_VOICES.veteran,
    statesman:   ELEVENLABS_VOICES.statesman,
  },
  ru: {
    // Russian formal speech is sustained and deep. Antoni's
    // Polish-American base crosses better than American firm voices.
    professor:   EXTRA_VOICES.antoni,
    philosopher: ELEVENLABS_VOICES.philosopher,
    barrister:   ELEVENLABS_VOICES.barrister,
  },
  tr: {
    // Turkish is melodic + vowel-harmonious — warm/calm voices cross best.
    professor:   ELEVENLABS_VOICES.philosopher,
    storyteller: ELEVENLABS_VOICES.storyteller,
  },
  nl: {
    // Dutch has British-influenced English imports; British voices
    // cross better than American.
    professor:   ELEVENLABS_VOICES.statesman,
    barrister:   ELEVENLABS_VOICES.barrister,
  },
};

// Normalize a language code into the 2-letter primary subtag we use as
// the cascade key (BCP-47 'hi-IN' → 'hi'; null/empty → 'en'). Anything
// not in the 14-language set falls back to English so we don't try to
// resolve voices for unsupported locales.
const SUPPORTED_TTS_LANGS = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja',
  'ko', 'hi', 'ar', 'ru', 'tr', 'nl',
]);
function normalizeLang(language) {
  const lang = String(language || 'en').toLowerCase().split('-')[0].slice(0, 2);
  return SUPPORTED_TTS_LANGS.has(lang) ? lang : 'en';
}

function getElevenLabsVoice(personality, language) {
  const lang = normalizeLang(language);
  // English short-circuit: skip the language cascade entirely.
  if (lang === 'en') {
    return ELEVENLABS_VOICES[personality] || ELEVENLABS_VOICES.professor;
  }
  // 1. Env override per persona × language.
  //    e.g., ELEVENLABS_VOICE_PROFESSOR_HI=xxx
  const envKey = `ELEVENLABS_VOICE_${personality.toUpperCase()}_${lang.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];
  // 2. Curated per persona × language map.
  const curated = LANGUAGE_VOICE_OVERRIDES[lang] && LANGUAGE_VOICE_OVERRIDES[lang][personality];
  if (curated) return curated;
  // 3. Gender-pool env. e.g., ELEVENLABS_VOICE_POOL_HI_MALE=xxx
  const gender = PERSONA_GENDER[personality] || 'male';
  const poolEnvKey = `ELEVENLABS_VOICE_POOL_${lang.toUpperCase()}_${gender.toUpperCase()}`;
  if (process.env[poolEnvKey]) return process.env[poolEnvKey];
  // 4. Gender-pool curated map.
  const poolCurated = LANGUAGE_DEFAULT_VOICES[lang] && LANGUAGE_DEFAULT_VOICES[lang][gender];
  if (poolCurated) return poolCurated;
  // 5. Final fallback — the English voice for this persona. Multilingual
  //    model still synthesizes the target language; the accent comes
  //    from the voice's training data (English-influenced for now).
  return ELEVENLABS_VOICES[personality] || ELEVENLABS_VOICES.professor;
}

// Free-tier fallback. OpenAI only ships 10 voices, so new personas reuse
// the closest match. Keys here MUST mirror ELEVENLABS_VOICES — anything
// unmapped falls through to 'onyx'. Used by the handler when premium=false
// or when the ElevenLabs provider returns non-OK.
const PERSONA_TO_OPENAI = {
  professor: 'onyx',
  closer: 'echo',
  surgeon: 'fable',
  veteran: 'alloy',
  firebrand: 'nova',
  diplomat: 'shimmer',
  debater: 'coral',
  philosopher: 'sage',
  prosecutor: 'ash',
  storyteller: 'ballad',
  statesman: 'onyx',     // closest match: deep, authoritative
  barrister: 'ash',      // closest match: intense, direct
  upstart: 'coral',      // closest match: quick, sharp
  heckler: 'alloy',      // closest match: rich baritone, dry
  disruptor: 'nova',     // closest match: high-energy
  tactician: 'sage',     // closest match: thoughtful, measured
  examiner: 'sage',      // measured academic; Indian-English steered via instructions
};

// Cartesia Sonic voice IDs — placeholder mapping for the opt-in A/B flag.
// Pick real IDs from play.cartesia.ai/voices before relying on this provider.
const CARTESIA_VOICES = {
  professor:   'a0e99841-438c-4a64-b679-ae501e7d6091',
  closer:      'b7d50908-b17c-442d-ad8d-810c63997ed9',
  surgeon:     '421b3369-f63f-4b03-8980-37a44df1d4e8',
  veteran:     '79743797-2087-422f-8dc7-86f9efca85f1',
  firebrand:   '41534ada-d9a3-4f24-b9d5-3a8e1f2f7fc0',
  diplomat:    'bf991597-6c13-47e4-8411-91ec2de5c466',
  debater:     'd46abd1d-2d02-43e8-819f-51fb652c1c61',
  philosopher: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
  prosecutor:  '820a3788-2b37-4d21-847a-b65d8a68c99a',
  storyteller: '248be419-c632-4f23-adf1-5324ed7dbf1d',
  // Expansion pack — placeholder IDs (Cartesia is opt-in; replace before relying on it):
  statesman:   'a0e99841-438c-4a64-b679-ae501e7d6091',
  barrister:   '820a3788-2b37-4d21-847a-b65d8a68c99a',
  upstart:     'd46abd1d-2d02-43e8-819f-51fb652c1c61',
  heckler:     '79743797-2087-422f-8dc7-86f9efca85f1',
  disruptor:   '41534ada-d9a3-4f24-b9d5-3a8e1f2f7fc0',
  tactician:   'a167e0f3-df7e-4d52-a9c3-f949145efdab',
  // Examiner (Counter ext default). Cartesia is opt-in; ID falls back
  // to the philosopher voice until an Indian-English Cartesia voice is
  // wired in via env override.
  examiner:    process.env.CARTESIA_VOICE_EXAMINER || 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
};

// Per-language Cartesia voice maps. Same cascade shape as ElevenLabs;
// see the comment above getElevenLabsVoice() for the curation guide.
// Env-override pattern: CARTESIA_VOICE_<PERSONA>_<LANG>,
//                       CARTESIA_VOICE_POOL_<LANG>_<GENDER>.
const CARTESIA_LANGUAGE_VOICE_OVERRIDES = {};
const CARTESIA_LANGUAGE_DEFAULT_VOICES = {};

function getCartesiaVoice(personality, language) {
  const lang = normalizeLang(language);
  if (lang === 'en') return CARTESIA_VOICES[personality] || CARTESIA_VOICES.professor;
  const envKey = `CARTESIA_VOICE_${personality.toUpperCase()}_${lang.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];
  const curated = CARTESIA_LANGUAGE_VOICE_OVERRIDES[lang] && CARTESIA_LANGUAGE_VOICE_OVERRIDES[lang][personality];
  if (curated) return curated;
  const gender = PERSONA_GENDER[personality] || 'male';
  const poolEnvKey = `CARTESIA_VOICE_POOL_${lang.toUpperCase()}_${gender.toUpperCase()}`;
  if (process.env[poolEnvKey]) return process.env[poolEnvKey];
  const poolCurated = CARTESIA_LANGUAGE_DEFAULT_VOICES[lang] && CARTESIA_LANGUAGE_DEFAULT_VOICES[lang][gender];
  if (poolCurated) return poolCurated;
  return CARTESIA_VOICES[personality] || CARTESIA_VOICES.professor;
}

// Map OpenAI voice keys to personality keys
const OPENAI_TO_PERSONALITY = {
  onyx: 'professor',
  echo: 'closer',
  fable: 'surgeon',
  alloy: 'veteran',
  nova: 'firebrand',
  shimmer: 'diplomat',
  coral: 'debater',
  sage: 'philosopher',
  ash: 'prosecutor',
  ballad: 'storyteller',
};

// Set of valid OpenAI voice keys. Any incoming `voice` that isn't in this
// set must be translated through PERSONA_TO_OPENAI before hitting OpenAI's
// API, otherwise the request 400s with "invalid_voice".
const OPENAI_VALID_VOICES = new Set(Object.keys(OPENAI_TO_PERSONALITY));
function resolveOpenAIVoice(voice){
  if (OPENAI_VALID_VOICES.has(voice)) return voice;
  return PERSONA_TO_OPENAI[voice] || 'onyx';
}

// Per-persona voice_settings character tuning for ElevenLabs. The
// intensity dial sets the BASE stability/style; these offsets shift each
// persona toward its own delivery signature on top of that base, then the
// result is clamped to [0, 1]. Positive stabilityOffset = steadier/flatter;
// positive styleOffset = more expressive/dramatic. Personas not listed
// here fall through to a zero offset (pure intensity curve).
//
// NOTE: keys that are not in the active 17-persona roster (contrarian,
// empiricist, advocate, realist, idealist) are reserved for future
// personas and are inert no-ops today — nothing resolves to them. The
// active roster is professor/closer/surgeon/veteran/firebrand/diplomat/
// debater/philosopher/prosecutor/storyteller/statesman/barrister/upstart/
// heckler/disruptor/tactician/examiner.
const PER_PERSONA_TUNING = {
  professor:   { stabilityOffset: +0.10, styleOffset: -0.10 },  // measured, steady
  closer:      { stabilityOffset: -0.05, styleOffset: +0.15 },  // punchy, emphatic
  surgeon:     { stabilityOffset: +0.05, styleOffset: +0.05 },  // precise, clinical
  veteran:     { stabilityOffset: +0.05, styleOffset: +0.00 },  // calm authority
  firebrand:   { stabilityOffset: -0.15, styleOffset: +0.20 },  // wild, expressive, passionate
  diplomat:    { stabilityOffset: +0.10, styleOffset: -0.05 },  // smooth, controlled
  debater:     { stabilityOffset: -0.05, styleOffset: +0.10 },  // dynamic, conversational
  philosopher: { stabilityOffset: +0.15, styleOffset: -0.15 },  // slow, thoughtful, even
  prosecutor:  { stabilityOffset: +0.00, styleOffset: +0.10 },  // sharp, assertive
  storyteller: { stabilityOffset: -0.10, styleOffset: +0.15 },  // expressive, varied cadence
  // Expansion-pack roster (real personas the user's list omitted) — tuned
  // to match each archetype's register so the offset table covers all 17.
  statesman:   { stabilityOffset: +0.12, styleOffset: -0.05 },  // parliamentary gravitas, measured
  barrister:   { stabilityOffset: +0.10, styleOffset: +0.00 },  // exacting courtroom precision
  upstart:     { stabilityOffset: -0.12, styleOffset: +0.15 },  // hungry, quick, sharp
  heckler:     { stabilityOffset: -0.05, styleOffset: +0.12 },  // sardonic, world-weary swing
  disruptor:   { stabilityOffset: -0.15, styleOffset: +0.18 },  // interruptive, high-energy
  tactician:   { stabilityOffset: +0.05, styleOffset: +0.05 },  // strategic, measured
  examiner:    { stabilityOffset: +0.10, styleOffset: -0.10 },  // Socratic, probing, even
  // Reserved for future personas (inert until they exist in the roster):
  contrarian:  { stabilityOffset: -0.10, styleOffset: +0.10 },
  empiricist:  { stabilityOffset: +0.10, styleOffset: -0.05 },
  advocate:    { stabilityOffset: -0.05, styleOffset: +0.10 },
  realist:     { stabilityOffset: +0.05, styleOffset: +0.00 },
  idealist:    { stabilityOffset: -0.05, styleOffset: +0.10 },
};

// ElevenLabs TTS with streaming for faster first-byte
// intensity: 0 = calm deliberate delivery, 1 = breathless sprint (tournament speed)
// language: BCP-47 short code (en/es/fr/de/it/pt/zh/ja/ko/hi/ar/ru/tr/nl).
//           Used to pick a language-native voice from the cascade in
//           getElevenLabsVoice(). turbo_v2_5 is multilingual so it
//           synthesizes the target language either way; the voice
//           choice controls the accent.
async function elevenLabsTTS(text, voice, speed, apiKey, intensity = 0, language = 'en') {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const voiceId = getElevenLabsVoice(personality, language);

  // At high intensity: lower stability → more variation/breathlessness,
  // higher style → more expressive. Per-persona offsets then shift the
  // base toward each character's delivery signature; clamp final to [0, 1].
  const tuning = PER_PERSONA_TUNING[personality] || { stabilityOffset: 0, styleOffset: 0 };
  const stability = Math.max(0, Math.min(1, (0.7 - intensity * 0.55) + tuning.stabilityOffset));
  const style = Math.max(0, Math.min(1, (0.3 + intensity * 0.5) + tuning.styleOffset));
  const similarityBoost = Math.max(0.55, 0.75 - intensity * 0.2);

  // ElevenLabs turbo_v2_5 honors a `speed` voice_setting; valid range is
  // 0.7–1.2 (outside that the API rejects or clamps). The caller's speed
  // arrives already clamped to 0.75–2.0, so re-clamp into the model's
  // window here. Default 1.0 when unset. If the model ever ignores it,
  // there's no harm — it's a no-op field.
  const elevenSpeed = Math.max(0.7, Math.min(1.2, speed || 1.0));

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
        speed: elevenSpeed,
      },
      // Max-aggressive first-byte mode. ElevenLabs documents 4 as
      // "max latency optimizations, including text normalizer turned off
      // for the first chunk". For mid-round AI speeches where the user
      // is already braced for the next debater to start talking, we
      // care more about time-to-first-audio than the marginal prosody
      // hit on the opening word. Was 3 prior to 2026-05-19.
      optimize_streaming_latency: 4,
    }),
  });

  return response;
}

// Cartesia Sonic — opt-in via body.provider === 'cartesia'
// `language` is required by Cartesia's sonic-2 endpoint. We pass through
// the caller's language code so non-English text synthesizes correctly;
// defaults to 'en' when nothing's specified.
async function cartesiaTTS(text, voice, speed, apiKey, intensity = 0, language = 'en') {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  // Cartesia parallel resolver: same cascade shape as ElevenLabs, just
  // its own env-var namespace (CARTESIA_VOICE_<PERSONA>_<LANG> and
  // CARTESIA_VOICE_POOL_<LANG>_<GENDER>). sonic-2 IDs aren't valid
  // across providers, so this stays separate from getElevenLabsVoice.
  const voiceId = getCartesiaVoice(personality, language);

  const speedParam = intensity > 0.6 ? 'fastest' : intensity > 0.3 ? 'fast' : 'normal';
  const emotionTags = intensity > 0.5 ? ['positivity:high', 'curiosity:high'] : [];

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-11-13',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
        __experimental_controls: {
          speed: speedParam,
          emotion: emotionTags,
        },
      },
      output_format: {
        container: 'mp3',
        sample_rate: 44100,
        bit_rate: 128000,
      },
      language,
    }),
  });

  return response;
}

// Per-persona delivery direction — passed as the `instructions` field to
// gpt-4o-mini-tts. The model honors free-form natural-language steering
// (tone, cadence, emphasis, vocabulary register, breathing), which is what
// closes the perceived gap to ElevenLabs without changing the voice list.
// These are intentionally detailed: the model takes vivid, concrete
// direction about WHERE to pause, WHAT to emphasize, and HOW to breathe far
// better than a one-line vibe. Each persona below should sound genuinely
// distinct in cadence, register, and energy.
const OPENAI_PERSONA_INSTRUCTIONS = {
  professor:   'Speak with deliberate authority. Pause before key terms. Use a slightly lower register and let definitions and distinctions land with weight. Occasional "now, here is where it gets interesting" transitions. Never hurry, never hedge.',
  closer:      'Confident, punchy delivery. Land hard on the last word of each sentence. Brief pauses for effect between arguments. Sound like you are delivering a verdict, not exploring an idea. Calm, certain, slightly satisfied.',
  surgeon:     'Clinical precision. Every word serves a purpose. Flat affect with occasional sharp emphasis on the one devastating detail. Measured pauses between clauses. No filler words, no hedging, no wasted breath.',
  veteran:     'Speak in a rich, unhurried baritone, the voice of someone who has done five hundred rounds and is surprised by none of it. Dry, low-energy authority. Let silences sit. Emphasis comes from slowing down, never from volume.',
  firebrand:   'Speak with urgency and conviction. Speed up during warrant chains. Raise volume and intensity on impact claims. Short punchy sentences, then longer passionate explanations. Audible breath on the big beats. Never sound neutral.',
  diplomat:    'Polished, warm, composed. Make even sharp attacks sound entirely reasonable. Smooth transitions, gentle downward inflection at the end of points so they feel settled. Velvet over steel: pleasant on the surface, unyielding underneath.',
  debater:     'Fast and sharp, like a college circuit debater mid-flow. Crisp consonants, quick wit, slight upward energy on impact lines. Tight clauses stacked quickly. Conversational but relentless, always pressing forward.',
  philosopher: 'Speak slowly and thoughtfully. Long pauses between ideas. Measured, contemplative tone. Treat each word as if choosing it carefully. Lower energy but deep resonance. Let the hard question hang in the air before you answer it.',
  prosecutor:  'Prosecutorial intensity. Clipped, accusatory cadence that builds toward each conclusion like a closing argument. Hammer the verbs. Short declaratives, then a pointed question. Tighten the screws point by point, no warmth.',
  storyteller: 'Warm and narrative, like opening a documentary. Land emotional beats softly and let them breathe. Vary the cadence: slow into the human detail, quicken through the stakes. Let the story do the persuasion, not the volume.',
  statesman:   'British parliamentary gravitas. A warm, resonant baritone with measured cadence, the senior member closing for the Crown. Rounded vowels, generous pauses, rhetorical build toward a dignified peak. Authority worn lightly, never shouted.',
  barrister:   'Crisp British courtroom precision. Exacting and deliberate, picking apart claims one by one. Slight pause before the decisive word. Cool, controlled, faintly dry. Each sentence closes like a door.',
  upstart:     'Hungry, youthful British energy. Quick and sharp, like the first-year who read every paper before the round and cannot wait to use it. Bright, forward-leaning, a touch irreverent, accelerating into the clever point.',
  heckler:     'Gravelly and sardonic. Older, world-weary, like you have heard this argument fifty times and stopped pretending otherwise. Dry emphasis, sceptical downturns, the occasional amused exhale before dismantling the claim.',
  disruptor:   'High-energy challenger cadence. Interruptive, slightly irreverent, thriving on chaos in the round. Punchy bursts, sudden changes of pace, emphatic stress on the line that flips the framing. Restless, never settled.',
  tactician:   'Quiet and three moves ahead. Calm, even, tactical. Never raise the voice. Let the pause before the key point do the work. Soft-spoken but precise, so the listener leans in to catch the move that already won.',
  examiner:    'Speak in measured Indian-English with senior-academic cadence. Even pacing, a slight musical lift on probe questions, no theatrics. Pause patiently between the question and the answer; warm but not eager. The register of a senior school panel examiner conducting a viva: probing, fair, unhurried. No rhotic American R, no British clipping; standard Indian-English vowels.',
};

function buildOpenAIInstructions(voice, intensity) {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const base = OPENAI_PERSONA_INSTRUCTIONS[personality] || OPENAI_PERSONA_INSTRUCTIONS.professor;
  // Intensity overlay: at high values, ask for urgent stakes + faster
  // cadence; at the low end leave the calm baseline alone. Same dial the
  // ElevenLabs path uses — keeps cross-provider behavior coherent.
  if (intensity > 0.6) {
    return base + ' Elevated emotion — urgent stakes, faster cadence, breath audible on emphasis.';
  }
  if (intensity > 0.3) {
    return base + ' Lean into rhetorical peaks; clear emotional inflection on big claims.';
  }
  return base;
}

async function openAITTS(text, voice, speed, apiKey, intensity = 0, customInstructions = null) {
  // Translate persona keys (statesman, barrister, etc.) to a valid OpenAI
  // voice key before calling. Without this, free-tier requests for new
  // personas would get rejected by OpenAI with invalid_voice.
  const safeVoice = resolveOpenAIVoice(voice);

  // Model try-list. We attempt the highest-quality first and fall back
  // through known-good models so a hiccup with one (model not yet
  // available on this account, instructions field rejected, etc.)
  // doesn't black-hole the audio for the user. tts-1 is the proven
  // floor — every account that has Audio API access can call it.
  const envModel = process.env.OPENAI_TTS_MODEL;
  const candidates = [envModel, 'gpt-4o-mini-tts', 'tts-1'].filter(Boolean);

  let lastErr = null;
  for (const model of candidates) {
    const supportsInstructions = model !== 'tts-1' && model !== 'tts-1-hd';
    const body = {
      model,
      input: text,
      voice: safeVoice,
      speed: speed,
      response_format: 'mp3',
    };
    if (supportsInstructions) {
      // Caller can override the auto-built persona instructions by
      // passing a string in the request body. Used by the landing
      // orb, which wants a casual conversational register instead of
      // the in-round prosecutorial / professorial defaults.
      body.instructions = customInstructions || buildOpenAIInstructions(voice, intensity);
    }
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return response;
    // Capture and continue. Status-code logic: 4xx is usually
    // model/param-specific so trying another model can help; 5xx is
    // usually upstream-wide so trying again won't help — but the cost
    // is one extra fetch, fine.
    lastErr = { model, status: response.status, text: await response.text().catch(() => '') };
    console.error(`[tts] openai model "${model}" failed:`, response.status, (lastErr.text || '').slice(0, 240));
  }
  // All candidates failed — synthesize a Response object the outer
  // handler can inspect. status=502 makes the surrounding code treat
  // this as an upstream failure and surface a clear error to the user.
  return new Response(
    JSON.stringify({ error: 'OPENAI_TTS_ALL_FAILED', last: lastErr }),
    { status: lastErr?.status || 502, headers: { 'Content-Type': 'application/json' } }
  );
}

// Inworld TTS — opt-in via body.provider === 'inworld' for Pro users.
// Sub-200ms latency, fully multilingual, "#1 ranked TTS" per their pitch.
// Field names follow the Inworld v1 spec exactly: snake_case for body
// keys, "voice_id" + "model_id", audio_config wrapper, Basic auth.
// Voice names map our debater personalities → Inworld's stock voices.
// Fallback for unknown personality is "Sarah" (the platform's default
// example voice — bright American female).
const INWORLD_VOICES = {
  professor:   'Christopher',  // Deep authoritative male
  closer:      'Sarah',        // Mature confident female
  surgeon:     'Adam',         // Smooth trustworthy male
  veteran:     'Eric',         // Resonant gravitas
  firebrand:   'Liam',         // Energetic young male
  diplomat:    'Matilda',      // Professional female
  debater:     'Freya',        // Sharp quick female
  philosopher: 'Charlie',      // Thoughtful calm male
  prosecutor:  'Will',         // Intense direct male
  storyteller: 'Laura',        // Warm narrative female
  statesman:   'George',       // Warm British male
  barrister:   'Daniel',       // British authoritative
  upstart:     'Lily',         // Youthful British female
  heckler:     'Roger',        // Gravelly older male
  disruptor:   'Jessica',      // Youthful energy female
  tactician:   'Bill',         // Calm narrator male
  // Examiner (Counter ext default). Inworld is Pro opt-in; falls back
  // to the calm-narrator voice until an Indian-English Inworld voice
  // is wired in via INWORLD_VOICE_EXAMINER. Accent direction comes
  // from the system prompt either way.
  examiner:    process.env.INWORLD_VOICE_EXAMINER || 'Bill',
};

// Per-language Inworld voice maps. Inworld TTS 1.5 Max is multilingual
// (per their docs) but, like ElevenLabs, the accent follows the voice's
// training data. Same cascade.
// Env-override pattern: INWORLD_VOICE_<PERSONA>_<LANG>,
//                       INWORLD_VOICE_POOL_<LANG>_<GENDER>.
const INWORLD_LANGUAGE_VOICE_OVERRIDES = {};
const INWORLD_LANGUAGE_DEFAULT_VOICES = {};

function getInworldVoice(personality, language) {
  const lang = normalizeLang(language);
  if (lang === 'en') return INWORLD_VOICES[personality] || INWORLD_VOICES.professor;
  const envKey = `INWORLD_VOICE_${personality.toUpperCase()}_${lang.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];
  const curated = INWORLD_LANGUAGE_VOICE_OVERRIDES[lang] && INWORLD_LANGUAGE_VOICE_OVERRIDES[lang][personality];
  if (curated) return curated;
  const gender = PERSONA_GENDER[personality] || 'male';
  const poolEnvKey = `INWORLD_VOICE_POOL_${lang.toUpperCase()}_${gender.toUpperCase()}`;
  if (process.env[poolEnvKey]) return process.env[poolEnvKey];
  const poolCurated = INWORLD_LANGUAGE_DEFAULT_VOICES[lang] && INWORLD_LANGUAGE_DEFAULT_VOICES[lang][gender];
  if (poolCurated) return poolCurated;
  return INWORLD_VOICES[personality] || INWORLD_VOICES.professor;
}
async function inworldTTS(text, voice, speed, apiKey, language = 'en') {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  // Inworld uses voice *names* (Sarah, Adam, Christopher), not opaque
  // IDs. Same cascade — env override per persona × language, then per-
  // language gender pool, then English persona name.
  const voiceId = getInworldVoice(personality, language) || 'Sarah';
  // Inworld uses Basic auth with the raw key as the credential (no
  // base64 encoding). The "Basic " prefix is part of their format —
  // see the Make Your First API Call page on inworld.ai. If a future
  // deploy needs base64-encoded credentials, set INWORLD_AUTH_BASE64=1.
  const useBase64 = process.env.INWORLD_AUTH_BASE64 === '1';
  const cred = useBase64 ? Buffer.from(apiKey).toString('base64') : apiKey;
  const auth = `Basic ${cred}`;
  const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: 'inworld-tts-1.5-max',
      audio_config: {
        audio_encoding: 'MP3',
      },
    }),
  });
  // Inworld responds with a JSON envelope: { audioContent: "<base64>" }
  // — repackage it as a raw mp3 byte response so it matches the shape
  // the other providers (ElevenLabs/Cartesia/OpenAI) return. The client
  // expects to consume `response.body` as an audio blob; staying
  // byte-stream parity here means no client-side branching per provider.
  if (response.ok) {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await response.json().catch(() => ({}));
      const b64 = j.audioContent || j.audio || j.audio_content;
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        return new Response(buf, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
    }
  }
  return response;
}

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const cartesiaKey = process.env.CARTESIA_API_KEY;
  const inworldKey = process.env.INWORLD_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!elevenKey && !cartesiaKey && !inworldKey && !openaiKey) {
    return new Response(
      JSON.stringify({ error: 'TTS not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const appCheckResult = await checkAppCheck(request);
  if (!appCheckResult.ok) {
    return new Response(
      JSON.stringify({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase() }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  const ttsCheck = checkRateLimit('tts_' + ip);
  if (!ttsCheck.ok) {
    const msg = ttsCheck.layer === 'minute'
      ? 'Too many TTS requests, wait a moment.'
      : 'Daily TTS cap reached on this IP. Come back tomorrow or sign in for higher limits.';
    return new Response(
      JSON.stringify({ error: 'RATE_LIMIT_' + ttsCheck.layer.toUpperCase() + ': ' + msg }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();
    // Warm-up handshake: lets the client kick a request to this function
    // when the prep phase loads so the Netlify instance is already hot
    // by the time the first AI speech needs synthesis. Returns 200
    // immediately without touching ElevenLabs / OpenAI / Cartesia /
    // Inworld — no provider credit burned, no rate-limit consumed
    // beyond the per-IP cap already enforced above. Saves the ~1-3s
    // cold-start penalty on the first speech of a session.
    if (body && body.warm === true) {
      return new Response(JSON.stringify({ ok: true, warm: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const rawText = (body.text || '').slice(0, MAX_TEXT_LENGTH);
    const voice = body.voice || 'onyx';
    const speed = Math.max(0.75, Math.min(2.0, body.speed || 1.0));
    // Humanizer strips stage directions, normalizes pause markers, and
    // auto-detects intensity if the caller didn't specify one. Callers that
    // set `humanize: false` get the old raw-text behavior (useful for short
    // UI chimes where pause injection would sound weird).
    const shouldHumanize = body.humanize !== false;
    const callerIntensity = typeof body.intensity === 'number' ? body.intensity : undefined;
    const humanized = shouldHumanize
      ? humanizeForTTS(rawText, { intensity: callerIntensity })
      : { text: rawText, intensity: callerIntensity || 0 };
    const text = humanized.text;
    const intensity = Math.max(0, Math.min(1, humanized.intensity || 0));
    const premium = !!body.premium;
    const provider = (body.provider || '').toLowerCase(); // 'cartesia' opts into the A/B flag
    // Language hint. ElevenLabs (turbo_v2_5) and OpenAI (gpt-4o-mini-tts)
    // auto-detect from the input text, so language is only load-bearing
    // for Cartesia (sonic-2 requires the field). Accept BCP-47 short
    // codes; fall back to 'en' on anything unrecognized.
    const rawLang = String(body.language || 'en').toLowerCase().slice(0, 5);
    const language = /^[a-z]{2}(-[a-z]{2})?$/.test(rawLang) ? rawLang : 'en';

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: 'No text provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    let response;

    // Premium + explicit opt-in → Cartesia Sonic (A/B flag, not default)
    if (premium && provider === 'cartesia' && cartesiaKey) {
      try {
        response = await cartesiaTTS(text, voice, speed, cartesiaKey, intensity, language);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('Cartesia TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('Cartesia exception:', e.message);
        response = null;
      }
    }

    // Premium + explicit opt-in → Inworld TTS 1.5 Max (Pro provider option)
    if (!response && premium && provider === 'inworld' && inworldKey) {
      try {
        response = await inworldTTS(text, voice, speed, inworldKey, language);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('Inworld TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('Inworld exception:', e.message);
        response = null;
      }
    }

    // Premium default → ElevenLabs turbo_v2_5
    if (!response && premium && elevenKey) {
      try {
        response = await elevenLabsTTS(text, voice, speed, elevenKey, intensity, language);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('ElevenLabs TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('ElevenLabs exception:', e.message);
        response = null;
      }
    }

    // Free users + fallback when premium providers fail. openAITTS
    // walks its own model try-list internally (gpt-4o-mini-tts → tts-1)
    // so by the time we get a !ok response here, every OpenAI model
    // attempt failed — surface the actual upstream error.
    if (!response && openaiKey) {
      // Caller can pass `instructions` (string, max 600 chars) to
      // override the per-voice persona prompt. Used by the landing
      // orb to ask for a casual conversational register rather than
      // the in-round prosecutorial defaults that ship with the
      // 16 personas.
      const customInstr = (typeof body.instructions === 'string' && body.instructions.trim())
        ? body.instructions.slice(0, 600)
        : null;
      response = await openAITTS(text, voice, speed, openaiKey, intensity, customInstr);
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('OpenAI TTS error:', response.status, errText);
        let openaiMessage = '';
        try {
          const parsed = JSON.parse(errText);
          openaiMessage = parsed?.last?.text || parsed?.error?.message || parsed?.error || '';
          if (typeof openaiMessage !== 'string') openaiMessage = JSON.stringify(openaiMessage).slice(0, 240);
        } catch(e) { openaiMessage = errText.slice(0, 240); }
        return new Response(
          JSON.stringify({ error: 'TTS_ERROR ' + response.status, openai: openaiMessage }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }
    }

    if (!response) {
      return new Response(
        JSON.stringify({ error: 'All TTS providers failed.' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        ...CORS,
      },
    });
  } catch (err) {
    console.error('TTS handler error:', err);
    return new Response(
      JSON.stringify({ error: 'TTS failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/tts',
};
