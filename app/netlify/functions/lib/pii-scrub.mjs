// PII scrub for the research-corpus exporter.
//
// Conservative, deterministic redaction. The goal is that nothing leaving the
// building via /api/admin/export-corpus carries direct identifiers. We redact
// what we can match with high precision (emails, phones, URLs, @handles,
// explicit self-naming) and deliberately do NOT try to nuke every capitalized
// word — debate speech is full of proper nouns (countries, cases, authors)
// that are the substance of the data, not PII. Over-redaction would destroy
// the asset; the uid is already dropped + hashed upstream, so this layer is
// about scrubbing identifiers that leak inside the free text itself.
//
// Returns { text, hits } so the exporter can report how much was scrubbed and
// flag any round that scrubbed unusually heavily for manual review.

import { createHash } from 'node:crypto';

const PATTERNS = [
  // Email addresses.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
  // URLs (http/https/www).
  [/\b(?:https?:\/\/|www\.)[^\s)>\]]+/gi, '[URL]'],
  // @handles (social), but not mid-email (emails are scrubbed first).
  // Function replacer because scrubText invokes every repl as a function,
  // where a literal "$1" would NOT be interpreted — so reattach the group.
  [/(^|\s)@[A-Za-z0-9_]{2,30}\b/g, (m, lead) => lead + '[HANDLE]'],
  // Phone numbers: +country, separators, 7+ digits in a phone-shaped run.
  // Intentionally narrow so we don't eat statistics ("40,000 deaths") or years.
  [/\b(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3}[\s.-]?\d{3,4}[\s.-]?\d{0,4}\b/g, (m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 ? '[PHONE]' : m;
  }],
  // Explicit self-identification. Conservative: only fires on a clear cue verb
  // followed by a Capitalized token (optionally First Last). Catches the most
  // common real-name leak in voice rounds ("my name is Priya Sharma", "I'm
  // Aidan") without touching "I am arguing", "this is true", etc.
  [/\b(?:[Mm]y name is|[Ii] am|[Ii]'m|[Tt]his is|[Nn]ame's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, (m, name) => {
    // Don't redact if the "name" is a sentence-continuation common word.
    const STOP = /^(I|A|The|This|That|We|They|You|It|He|She|Going|Here|Now|Not|Just|Really|Actually|Arguing|Saying|Talking|Trying|About|Sure|Certain|Right|Wrong|Confident|Glad|Happy|Sorry|Afraid)$/;
    if (STOP.test(name.split(/\s+/)[0])) return m;
    return m.slice(0, m.length - name.length) + '[NAME]';
  }],
];

export function scrubText(input) {
  if (typeof input !== 'string' || !input) return { text: '', hits: 0 };
  let text = input;
  let hits = 0;
  for (const [re, repl] of PATTERNS) {
    text = text.replace(re, (...args) => {
      hits += 1;
      return typeof repl === 'function' ? repl(...args) : repl;
    });
  }
  return { text, hits };
}

// Deterministic, non-reversible author id so the corpus can be grouped by
// debater ("N unique authors", dedup) without carrying the real uid. Salted
// with CORPUS_HASH_SALT; rotate the salt to sever the linkage entirely.
export function anonAuthorId(uid) {
  if (!uid) return null;
  const salt = process.env.CORPUS_HASH_SALT || 'debateit-corpus-v1';
  return 'a_' + createHash('sha256').update(salt + ':' + uid).digest('hex').slice(0, 16);
}

// Scrub a whole round's worth of text fields at once. Mutates a shallow copy.
export function scrubRound(fields) {
  const out = {};
  let totalHits = 0;
  for (const [k, v] of Object.entries(fields)) {
    const { text, hits } = scrubText(v);
    out[k] = text;
    totalHits += hits;
  }
  return { fields: out, scrubHits: totalHits };
}
