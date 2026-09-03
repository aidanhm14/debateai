// ─────────────────────────────────────────────────────────────
// BRAIN HEALTH — the pure half.
//
// Same split as judge-charter (pure) against judge-jurors (I/O): the
// roster, the failure classifier, and the public redaction live here so
// they are directly testable, and brain-health.mjs owns the fetches and
// the cache. scripts/test-brain-health.mjs drives every function below.
//
// COPY RULE: `reason` values render on a public page and in the picker,
// so they stay short, lowercase, and free of provider prose.
// ─────────────────────────────────────────────────────────────

// The model each brain actually serves a user. Keep in sync with
// `brains` in app/js/judge-options.js: probing a model the picker does
// not offer would report health for something nobody can select, and
// the test asserts the two lists match exactly.
export const BRAINS = [
  { key: 'claude',   name: 'Claude',   maker: 'Anthropic',  provider: 'anthropic',  model: 'claude-opus-5',              env: 'ANTHROPIC_API_KEY' },
  { key: 'gpt',      name: 'GPT',      maker: 'OpenAI',     provider: 'openai',     model: 'gpt-5.5',                    env: 'OPENAI_API_KEY' },
  { key: 'gemini',   name: 'Gemini',   maker: 'Google',     provider: 'google',     model: 'gemini-3.6-flash',           env: 'GEMINI_API_KEY' },
  { key: 'grok',     name: 'Grok',     maker: 'xAI',        provider: 'xai',        model: 'grok-3',                     env: 'XAI_API_KEY' },
  { key: 'deepseek', name: 'DeepSeek', maker: 'DeepSeek',   provider: 'deepseek',   model: 'deepseek-v4-flash',          env: 'DEEPSEEK_API_KEY' },
  { key: 'openlab',  name: 'Open Lab', maker: 'OpenRouter', provider: 'openrouter', model: 'nousresearch/hermes-4-405b', env: 'OPENROUTER_API_KEY' },
];

// ── The council's own health ────────────────────────────────────────
//
// WHY THIS EXISTS, and it is a hole that cost real ballots. BRAINS above
// is the roster a USER PICKS FROM, and probing it says nothing about the
// bench that JUDGES. The two lists overlap in provider and disagree in
// model: the Anthropic brain is claude-opus-5 while the Anthropic juror
// is claude-sonnet-5, and the xAI brain is grok-3 while the juror is
// grok-4.3. So a green board here was compatible with a pinned juror
// whose model id had gone, whose key was never set, or whose provider
// was refusing us, and that is roughly what happened: the Google seat
// failed every live round for days while this endpoint reported six of
// six up.
//
// DERIVED FROM THE SEASON, never hand-maintained. A second list of
// judges would drift from the charter the first time a season re-pins,
// and a health board that disagrees with the thing it reports on is
// worse than no board. Pass the live season in and the roster follows
// it automatically.
export const PROVIDER_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * One probe target per pinned juror seat, in seat order.
 * `seat` is the charter's own juror id, so a red row names the seat a
 * reader can find in the published charter rather than a model string.
 */
export function councilRoster(season) {
  const jurors = (season && season.panel && Array.isArray(season.panel.jurors)) ? season.panel.jurors : [];
  return jurors.map((j) => ({
    key: 'seat-' + j.id,
    seat: j.id,
    name: 'Seat ' + String(j.id || '').toUpperCase(),
    maker: j.provider,
    provider: j.provider,
    model: j.model,
    // A provider with no env mapping is reported as unconfigured rather
    // than skipped: a seat nobody can probe is exactly the seat that
    // goes dark unnoticed.
    env: PROVIDER_ENV[j.provider] || ('UNKNOWN_' + String(j.provider || '').toUpperCase() + '_KEY'),
  }));
}

// OpenAI retired `max_tokens` on the gpt-5 and o-series families and
// returns 400 `unsupported_parameter` for it. The same branch lives in
// lib/judge-jurors.mjs and openai-chat.mjs; verified live 2026-08-11.
export const usesCompletionTokens = (m) => /^(gpt-5|gpt-6|o[0-9])/i.test(String(m || ''));

/**
 * Turn a provider failure into something a picker can act on and an
 * admin can triage, without republishing the provider's prose.
 *
 * Body text is checked BEFORE status because providers overload codes:
 * xAI returns 400 for a bad key, and Google returns 429 for exhausted
 * prepaid credit rather than for rate. Reading the status first would
 * send someone to the wrong console.
 */
export function classify(status, body) {
  const b = String(body || '').toLowerCase();
  if (/api key|unauthorized|invalid.token|incorrect api key|authentication/.test(b)) return 'auth';
  if (/credit|billing|quota|insufficient|payment|exceeded your current/.test(b)) return 'billing';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing';
  if (status === 429) return 'rate_limit';
  if (/model/.test(b) && (status === 404 || status === 400)) return 'model';
  if (status === 404) return 'model';
  return 'down';
}

// What each category means and what to do about it. Rendered on /admin,
// because a dashboard that says "down" and stops has moved the problem
// rather than surfaced it.
export const REASON_FIX = {
  unconfigured: 'the key is not set on Netlify',
  auth: 'the key is invalid, regenerate it',
  billing: 'the account is out of credit, top it up',
  rate_limit: 'rate limited, may clear on its own',
  model: 'the pinned model id no longer exists',
  timeout: 'no response in time',
  down: 'provider error',
};

/**
 * The public payload. Drops `detail` and `env`: the raw provider message
 * names an account's billing state ("your prepayment credits are
 * depleted") and the env var name is a hint about our configuration.
 * Neither is needed by the thing that reads this publicly, which only
 * wants to know whether to grey out an option and why in one word.
 *
 * Returns a new object; the caller's payload is left intact so an admin
 * response built from the same cache entry keeps its detail.
 */
export function publicView(payload) {
  const strip = (rows) => (rows || []).map(({ detail, env, ...rest }) => rest);
  const out = { ...payload, brains: strip(payload.brains) };
  // The council rows carry the same two secrets as a brain row: the raw
  // provider message names an account's billing state, and the env var
  // name is a hint about our configuration. Redact them the same way, or
  // adding the council quietly widens what this public endpoint leaks.
  if (payload.council) out.council = strip(payload.council);
  return out;
}
