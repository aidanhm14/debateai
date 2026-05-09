// ──────────────────────────────────────────────────────────────────
// Lightweight client-side guard for /disclosures publishing.
// Catches the obvious garbage (profanity, slurs, near-empty cases,
// pasted spam URLs) so the public board doesn't get drive-by trolled.
// Doesn't replace eventual LLM-classification — just the cheap floor.
//
// Usage:
//   const result = window.disclosureGuard.check({ motion, output });
//   if (!result.ok) { show(result.reason); return; }
//
// Returns { ok: bool, reason?: string }. Reasons are user-facing
// strings — show them in a toast or inline warning.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Minimal slur/profanity floor. We err on the side of letting things
  // through — debate cases LEGITIMATELY discuss morally-loaded topics
  // (slurs in motions like "should X be reclaimable?", historical
  // policy violence, etc.). The list is targeted at:
  //   - racial/ethnic slurs that have no debate-discourse use
  //   - explicit sexual content that's off-topic for any debate motion
  //   - personal-attack patterns ("[name] is a [slur]")
  // Quoted-form ("the n-word") is intentionally allowed; raw use isn't.
  // Add to this list if you observe abuse in /admin user-activity.
  var BANNED_PATTERNS = [
    /\bn[i1!]gg[e3]r/i,
    /\bn[i1!]gg[a@]/i,
    /\bf[a@]gg[o0]t/i,
    /\bk[i1!]k[e3]\b/i,
    /\bch[i1!]nk\b/i,
    /\bsp[i1!]c\b/i,
    /\btrann[ie]e?s?\b/i,
    /\bret[a@]rd(ed)?\b/i,
    /\bcunt\b/i,
    // Sexual/explicit terms that have no debate context
    /\bcock\s*suck/i,
    /\bjerk\s*off/i,
  ];

  // URL-spam detector: a "case" that's mostly URLs is almost certainly
  // an SEO spam attempt. Flag if >40% of non-whitespace chars are
  // inside http/https URLs.
  var URL_RE = /https?:\/\/[^\s)]+/gi;

  var MIN_OUTPUT_CHARS = 200;     // a real disclosed case is well over this
  var MIN_MOTION_CHARS = 8;       // motions like "TH ban X" minimum
  var MAX_OUTPUT_CHARS = 51200;   // matches the firestore.rules content cap

  function check(input) {
    var motion = String(input && input.motion || '').trim();
    var output = String(input && input.output || '').trim();

    if (motion.length < MIN_MOTION_CHARS) {
      return { ok: false, reason: 'Motion is too short. Add the actual debate motion before publishing.' };
    }
    if (output.length < MIN_OUTPUT_CHARS) {
      return { ok: false, reason: 'Case is too short to be useful (' + output.length + '/' + MIN_OUTPUT_CHARS + ' chars). Run a full speech first, then publish.' };
    }
    if (output.length > MAX_OUTPUT_CHARS) {
      return { ok: false, reason: 'Case is too long for the disclosure board (' + output.length + ' chars, max ' + MAX_OUTPUT_CHARS + ').' };
    }

    var combined = motion + ' ' + output;
    for (var i = 0; i < BANNED_PATTERNS.length; i++) {
      if (BANNED_PATTERNS[i].test(combined)) {
        return { ok: false, reason: 'Disclosure flagged for banned content. Public-board cases must be safe-for-classroom — debate the substance without slurs.' };
      }
    }

    // URL-spam ratio
    var urlChars = 0;
    var matches = output.match(URL_RE) || [];
    matches.forEach(function (m) { urlChars += m.length; });
    var nonWs = output.replace(/\s+/g, '').length;
    if (nonWs > 0 && urlChars / nonWs > 0.4) {
      return { ok: false, reason: 'Disclosure looks like a link dump. The board is for cases, not URL lists.' };
    }
    if (matches.length > 8) {
      return { ok: false, reason: 'Too many links (' + matches.length + '). Public-board cases should be your argument, not a citation list.' };
    }

    return { ok: true };
  }

  // LLM-classify check. Heavier than the local word-list — runs
  // /api/classify-disclosure which calls Claude Haiku. Only fires
  // AFTER the local check passes (so we don't burn an LLM call on
  // obvious junk). Auth-required; caller passes the user's id token.
  // Fails OPEN on network/server errors so a transient blip never
  // blocks a legit publisher. Returns the same { ok, reason } shape.
  async function llmCheck(input, token) {
    if (!token) return { ok: true, reason: 'no_token' };
    try {
      const r = await fetch('/api/classify-disclosure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          motion: String(input && input.motion || ''),
          output: String(input && input.output || ''),
        }),
      });
      if (!r.ok) return { ok: true, reason: 'classifier_http_' + r.status };
      const data = await r.json().catch(() => ({}));
      if (data && data.ok === false) {
        return {
          ok: false,
          reason: data.reason || 'Disclosure flagged for review.',
          category: data.category || 'unknown',
        };
      }
      return { ok: true };
    } catch (e) {
      // Fail open on network errors — same pattern as the server-side
      // function. Better to ship a publish than block on a blip.
      return { ok: true, reason: 'classifier_unreachable' };
    }
  }

  // Combined check: local first (instant), LLM second (only if local
  // passed AND a token is provided). Use this as the single entry
  // point from publish handlers.
  async function fullCheck(input, token) {
    const local = check(input);
    if (!local.ok) return local;
    if (!token) return local; // local pass + no auth token = ship it
    return await llmCheck(input, token);
  }

  window.disclosureGuard = { check: check, llmCheck: llmCheck, fullCheck: fullCheck };
})();
