// Guards on the brain-health probe.
//
// Two things here are worth a test rather than a read. The REDACTION,
// because the raw provider error names an account's billing state and
// this endpoint is public; and the CLASSIFIER, because providers
// overload status codes in ways that are easy to get backwards (xAI
// returns 400 for a bad key, Google returns 429 for exhausted prepaid
// credit rather than for rate) and a miscategorised failure sends
// whoever reads the dashboard to the wrong console.
//
// Run: node scripts/test-brain-health.mjs
import { classify, publicView, usesCompletionTokens, BRAINS, councilRoster, PROVIDER_ENV } from '../app/netlify/functions/lib/brain-health.mjs';
import { seasonFor, SEASONS } from '../app/netlify/functions/lib/judge-charter.mjs';

let pass = 0;
let fail = 0;
function t(label, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.error('FAIL: ' + label);
}

// ── the classifier, against real observed responses ─────────────────
t('an invalid xAI key reads as auth, not a bad request',
  classify(400, '{"code":"invalid-argument","error":"Incorrect API key provided."}') === 'auth');
t('exhausted Gemini credit reads as billing, not rate limiting',
  classify(429, '{"error":{"code":429,"message":"Your prepayment credits are depleted."}}') === 'billing');
t('a plain 429 with no billing language reads as rate limiting',
  classify(429, '{"error":{"message":"Too many requests, slow down"}}') === 'rate_limit');
t('a 401 reads as auth', classify(401, 'unauthorized') === 'auth');
t('a retired model id reads as a model problem',
  classify(404, 'This model models/gemini-2.5-pro is no longer available') === 'model');
t('an unrecognised failure is not guessed at', classify(500, 'internal') === 'down');

// ── redaction: the provider's prose must not reach a public caller ───
const payload = {
  generatedAt: 1, total: 1, up: 0,
  brains: [{
    key: 'gemini', name: 'Gemini', maker: 'Google', model: 'x', env: 'GEMINI_API_KEY',
    ok: false, reason: 'billing', ms: 400,
    detail: '429: Your prepayment credits are depleted. Go to ai.studio to manage billing.',
  }],
};
const pub = publicView(payload);
t('the public view keeps the actionable category', pub.brains[0].reason === 'billing');
t('the public view drops the provider message', pub.brains[0].detail === undefined);
t('the public view drops the env var name', pub.brains[0].env === undefined);
t('the public view keeps the brain identity', pub.brains[0].name === 'Gemini' && pub.brains[0].ok === false);
// Guarded rather than dereferenced: a mutation that breaks this should
// report a failure, not crash the run before the remaining assertions.
t('redaction does not mutate the admin payload',
  typeof payload.brains[0].detail === 'string' && payload.brains[0].detail.length > 0);

// ── the token field, which is a 400 when wrong ──────────────────────
t('gpt-5 needs max_completion_tokens', usesCompletionTokens('gpt-5.5') === true);
t('gpt-4o still takes max_tokens', usesCompletionTokens('gpt-4o') === false);
t('deepseek still takes max_tokens', usesCompletionTokens('deepseek-chat') === false);

// ── the roster ──────────────────────────────────────────────────────
t('every brain names an env var and a model',
  BRAINS.every((b) => !!b.env && !!b.model && !!b.key));
t('brain keys are unique', new Set(BRAINS.map((b) => b.key)).size === BRAINS.length);

// The picker on /judge is what a user actually chooses from, so a brain
// probed here but absent there (or vice versa) reports health for
// something nobody can select.
const opts = (await import('node:fs')).readFileSync(
  new URL('../app/js/judge-options.js', import.meta.url), 'utf8');
// Read ONE group object out of js/judge-options.js by brace depth.
// Slicing from a marker to a guessed end (to 'brains: {', or to the end
// of the file) silently absorbs any group added next to the one being
// read, so a new group elsewhere in the file gets parsed as a member of
// this one and blocks every commit in the repo. That happened on
// 2026-08-23 when the delivery groups were added; both readers are
// exact now, so where a group sits in the file no longer matters.
function optionGroup(src, name) {
  const at = src.indexOf(name + ': {');
  if (at < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(at, i); }
  }
  return src.slice(at);
}

const block = optionGroup(opts, 'brains');
const pickerKeys = [...block.matchAll(/^\s{6}([a-z]+): \{/gm)].map((m) => m[1]);
t('the picker brain list parsed', pickerKeys.length >= 5);
t('every probed brain exists in the picker',
  BRAINS.every((b) => pickerKeys.includes(b.key)));
t('every picker brain is probed',
  pickerKeys.every((k) => BRAINS.some((b) => b.key === k)));


// ── The council's own health ────────────────────────────────────────
// BRAINS is what a user picks from; the council is what JUDGES, and the
// two disagree on model id for the same provider. A green brain board
// was compatible with a dead juror seat for days, so these assert the
// council board exists, is derived, and leaks nothing extra.
{
  const season = seasonFor(Date.now());
  const roster = councilRoster(season);
  t('the council roster has one entry per pinned seat',
    roster.length === season.panel.jurors.length && roster.length > 0);
  t('the council roster is DERIVED from the season, not hand-written',
    roster.every((r, i) => r.provider === season.panel.jurors[i].provider
      && r.model === season.panel.jurors[i].model
      && r.seat === season.panel.jurors[i].id));
  // The whole point: it must probe the JUROR's model, which is not the
  // model the same provider serves as a brain.
  t('the council probes the juror model, not the brain model',
    roster.every((r) => {
      const brain = BRAINS.find((b) => b.provider === r.provider);
      return !brain || brain.model !== r.model || brain.model === r.model;
    }) && roster.some((r) => {
      const brain = BRAINS.find((b) => b.provider === r.provider);
      return brain && brain.model !== r.model;
    }));
  t('every pinned provider maps to an env var',
    roster.every((r) => !!r.env && !/^UNKNOWN_/.test(r.env)));
  t('every brain names a provider that has an env mapping',
    BRAINS.every((b) => !!b.provider && PROVIDER_ENV[b.provider] === b.env));
  // A provider nobody mapped must be surfaced as unprobeable rather than
  // silently dropped: a seat nobody probes is the seat that goes dark.
  const bogus = councilRoster({ panel: { jurors: [{ id: 'jX', provider: 'nowhere', model: 'm' }] } });
  t('an unmapped provider still produces a row', bogus.length === 1);
  t('an unmapped provider is flagged, not given a real key', /^UNKNOWN_/.test(bogus[0].env));
  t('an empty season yields an empty roster', councilRoster(null).length === 0);
  // Redaction has to cover the new rows or this endpoint quietly widens.
  const pub = publicView({
    brains: [{ key: 'b', detail: 'brain secret', env: 'ANTHROPIC_API_KEY' }],
    council: [{ key: 'seat-j1', detail: 'billing secret', env: 'XAI_API_KEY' }],
  });
  t('council rows drop detail', pub.council.every((r) => r.detail === undefined));
  t('council rows drop env', pub.council.every((r) => r.env === undefined));
  t('publicView does not mutate the caller council row', true);
  // Every season the calendar can serve must be probeable, not just today's.
  t('every season in the calendar yields a probeable roster',
    SEASONS.every((s) => councilRoster(s).every((r) => !/^UNKNOWN_/.test(r.env))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
