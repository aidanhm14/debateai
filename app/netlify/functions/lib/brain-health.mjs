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
  { key: 'claude',   name: 'Claude',   maker: 'Anthropic',  model: 'claude-opus-5',                env: 'ANTHROPIC_API_KEY' },
  { key: 'gpt',      name: 'GPT',      maker: 'OpenAI',     model: 'gpt-5.5',                      env: 'OPENAI_API_KEY' },
  { key: 'gemini',   name: 'Gemini',   maker: 'Google',     model: 'gemini-2.5-pro-preview-05-06', env: 'GEMINI_API_KEY' },
  { key: 'grok',     name: 'Grok',     maker: 'xAI',        model: 'grok-3',                       env: 'XAI_API_KEY' },
  { key: 'deepseek', name: 'DeepSeek', maker: 'DeepSeek',   model: 'deepseek-chat',                env: 'DEEPSEEK_API_KEY' },
  { key: 'openlab',  name: 'Open Lab', maker: 'OpenRouter', model: 'nousresearch/hermes-4-405b',   env: 'OPENROUTER_API_KEY' },
];

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
  return {
    ...payload,
    brains: (payload.brains || []).map(({ detail, env, ...rest }) => rest),
  };
}
