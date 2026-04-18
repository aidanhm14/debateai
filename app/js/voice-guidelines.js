// Client-side stub — the real voice bank is now server-side in
// /app/netlify/functions/lib/voice-guidelines.mjs. Callers send the
// request body with `_voiceFeature: <feature>` and the brain endpoints
// (claude.mjs, gemini.mjs, grok.mjs, openai-chat.mjs) resolve the
// matching voice block and prepend it to body.system before forwarding.
//
// The original voice bank (CORE / STRATEGY / CHARACTER / CASE_CONSTRUCTION /
// LANGUAGE_CONSTRUCTION) was publicly readable via view-source and was the
// core of DebateOS's voice IP — now it stays on the server.
//
// Known tradeoff: BYOK (bring-your-own-key) requests bypass the Netlify
// proxy and go straight to Anthropic, so they get no voice injection. BYOK
// is a power-user path; acceptable loss of voice polish in exchange for
// not leaking the bank to every visitor.
//
// This stub preserves `window.DEBATE_VOICE.forFeature()` so any legacy
// client code that still concatenates a voice block into its system prompt
// simply adds an empty string — no breakage, no double-injection.
(function (global) {
  function forFeature(/* feature */) { return ''; }
  global.DEBATE_VOICE = {
    CORE: '',
    STRATEGY: '',
    CHARACTER: '',
    CASE_CONSTRUCTION: '',
    LANGUAGE_CONSTRUCTION: '',
    FULL: '',
    FEATURE_MAP: {},
    forFeature,
  };
})(typeof window !== 'undefined' ? window : globalThis);
