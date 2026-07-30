// ─────────────────────────────────────────────────────────────
// THE ENGINE ROSTER — one source of truth for what argues here.
//
// WHY THIS EXISTS
// The engine list was written down in six places: CASE_BRAINS in
// index.html, BRAINS in practice.html, a hardcoded <select> in
// judge.html, the ALLOWED_MODELS array in openlab.mjs, prose on the
// landing, and prose on /pricing. Every one of them drifted. "6 brains"
// is quoted on nine surfaces and none of them could tell you which
// model slug was actually being called.
//
// So: engines are declared here, served to clients by /api/engines, and
// the proxy's allow-list is DERIVED from this file rather than
// maintained beside it. Adding an engine is one edit.
//
// TWO KINDS OF ENTRY, and the difference matters for copy:
//
//   HOUSES  the six front doors a user picks between. Each is a proxy
//           endpoint in this repo. "Claude" is a house, not a model:
//           which Claude you get depends on your plan.
//   OPEN    the open-weight pool behind the Open Lab house. These are
//           specific published models, routed through OpenRouter.
//
// CLAIMS RULE, and this one is load-bearing. `license` and `weights`
// are factual claims about somebody else's release, rendered on a
// public page. Every OPEN entry below was checked against the vendor's
// own release on the date in `verifiedAt`. Do not add an entry from
// memory of a model announcement: an "open source" label on a model
// that shipped API-only is the kind of wrong that gets screenshotted.
// If you cannot verify the license, leave the field null. Null renders
// as "license not verified", which is honest and costs us nothing.
//
// This module is PURE. No I/O, no clock. Reachability (is the API key
// set) is resolved by the caller, because that is environment state and
// this file is a description of the world.
// ─────────────────────────────────────────────────────────────

// ── the six houses ──────────────────────────────────────────────────
//
// `pool` marks the house whose engine is chosen from the open roster
// below. `plan` is the entitlement gate the proxy actually enforces, so
// the picker can grey out what it cannot call instead of letting the
// user find out from a 402.
export const HOUSES = [
  {
    key: 'claude',
    label: 'Claude',
    vendor: 'Anthropic',
    endpoint: '/api/claude',
    color: '#D97757',
    plan: 'free',
    role: 'Structure. Clean warrant chains, holds a case together.',
    note: 'The default, and the only house on the free tier.',
  },
  {
    key: 'gpt',
    label: 'GPT',
    vendor: 'OpenAI',
    endpoint: '/api/openai-chat',
    color: '#10a37f',
    plan: 'paid',
    role: 'Range. Most conversational across a casual back-and-forth.',
  },
  {
    key: 'gemini',
    label: 'Gemini',
    vendor: 'Google',
    endpoint: '/api/gemini',
    color: '#4285F4',
    plan: 'paid',
    role: 'Recall. Fastest grounding on a current-events motion.',
  },
  {
    key: 'grok',
    label: 'Grok',
    vendor: 'xAI',
    endpoint: '/api/grok',
    color: '#e5e7eb',
    plan: 'paid',
    role: 'Edge. Finds the crack in a case faster than the rest.',
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    vendor: 'DeepSeek',
    endpoint: '/api/deepseek',
    color: '#4D6BFE',
    plan: 'paid',
    role: 'Cost. Sharp and technical for what it charges.',
  },
  {
    key: 'openlab',
    label: 'Open Lab',
    vendor: 'Open weights, routed',
    endpoint: '/api/openlab',
    color: '#a78bfa',
    plan: 'paid',
    pool: 'open',
    role: 'Published weights. Pick the engine yourself.',
    note: 'Runs the open roster. Nine engines, swappable per round.',
  },
];

// ── the open-weight roster ──────────────────────────────────────────
//
// Ordered as the picker shows them: flagship first, then the rest by
// what they are actually FOR in a round. `slug` is the OpenRouter id
// and is the only field the proxy reads.
//
// `context` is the published window. `params` is stated only where the
// vendor stated it or the slug carries it, because a guessed parameter
// count on a public page is a claim we cannot defend.
export const OPEN_ENGINES = [
  {
    key: 'kimi-k3',
    slug: 'moonshotai/kimi-k3',
    label: 'Kimi K3',
    vendor: 'Moonshot AI',
    params: '2.8T total, 104B active',
    context: 1_048_576,
    weights: 'published',
    license: 'Kimi K3 License',
    licenseNote: 'Open weights with a revenue-triggered clause for large commercial hosts. Well outside our scale.',
    released: '2026-07-27',
    verifiedAt: '2026-07-30',
    tier: 'flagship',
    role: 'The heavyweight. Longest reach on a dense motion, and it does not hedge.',
  },
  {
    key: 'glm-5.2',
    slug: 'z-ai/glm-5.2',
    label: 'GLM-5.2',
    vendor: 'Zhipu AI',
    params: '753B total, 40B active',
    context: 1_048_576,
    weights: 'published',
    license: 'MIT',
    released: '2026-06-13',
    verifiedAt: '2026-07-30',
    tier: 'flagship',
    role: 'Frontier reasoning at a fraction of frontier cost. The value pick.',
  },
  {
    key: 'deepseek-v4',
    slug: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    vendor: 'DeepSeek',
    context: 1_048_576,
    weights: 'published',
    license: 'MIT',
    released: '2026-04-24',
    verifiedAt: '2026-07-30',
    tier: 'flagship',
    role: 'Cold and technical. Least likely to be charmed by a pretty argument.',
  },
  {
    key: 'minimax-m3',
    slug: 'minimax/minimax-m3',
    label: 'MiniMax M3',
    vendor: 'MiniMax',
    context: 1_048_576,
    weights: 'published',
    license: null,
    released: '2026-06-01',
    verifiedAt: '2026-07-30',
    tier: 'strong',
    role: 'Long-context specialist. Holds a full tournament transcript without losing the thread.',
  },
  {
    key: 'kimi-k2.6',
    slug: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    vendor: 'Moonshot AI',
    context: 262_144,
    weights: 'published',
    license: 'Modified MIT',
    verifiedAt: '2026-07-30',
    tier: 'strong',
    role: 'Most of K3 for a quarter of the bill. The one to drill against daily.',
  },
  {
    key: 'qwen3.5-397b',
    slug: 'qwen/qwen3.5-397b-a17b',
    label: 'Qwen3.5 397B',
    vendor: 'Alibaba',
    params: '397B total, 17B active',
    context: 262_144,
    weights: 'published',
    license: 'Apache 2.0',
    verifiedAt: '2026-07-30',
    tier: 'strong',
    role: 'The multilingual bench. Strongest of these outside English.',
  },
  {
    key: 'hermes-4-405b',
    slug: 'nousresearch/hermes-4-405b',
    label: 'Hermes 4 405B',
    vendor: 'Nous Research',
    params: '405B',
    context: 131_072,
    weights: 'published',
    license: 'Llama 3.1 Community',
    verifiedAt: '2026-07-30',
    tier: 'voice',
    role: 'Human voice. Character-rich prose, argues a hard motion without a disclaimer first.',
    note: 'The long-standing Open Lab default.',
  },
  {
    key: 'olmo-3-32b',
    slug: 'allenai/olmo-3-32b-think',
    label: 'OLMo 3 32B',
    vendor: 'Allen Institute for AI',
    params: '32B',
    context: 65_536,
    weights: 'published',
    license: 'Apache 2.0',
    verifiedAt: '2026-07-30',
    tier: 'open',
    role: 'Open all the way down: weights, data, and training recipe. The reproducible one.',
  },
  {
    key: 'mistral-large',
    slug: 'mistralai/mistral-large-2512',
    label: 'Mistral Large',
    vendor: 'Mistral AI',
    context: 262_144,
    weights: 'published',
    license: 'Mistral Research',
    verifiedAt: '2026-07-30',
    tier: 'strong',
    role: 'European bench. Tight, formal register that suits BP and Worlds.',
  },
];

// Slugs that stay callable but are off the picker: superseded defaults
// that older clients may still post, plus documented fallbacks. Keeping
// them in the allow-list means a cached bundle does not start 400ing the
// day a new roster ships.
export const LEGACY_OPEN_SLUGS = [
  'nousresearch/hermes-3-llama-3.1-405b',
  'mistralai/mistral-large-2407',
  'qwen/qwen3-235b-a22b',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'moonshotai/kimi-k2',
  'deepseek/deepseek-v4-flash',
];

// The proxy's allow-list, derived. An arbitrary model slug from a
// runaway client bills us, so this stays a closed set.
export function allowedOpenSlugs(envOverride) {
  const raw = String(envOverride || '').trim();
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...OPEN_ENGINES.map((e) => e.slug), ...LEGACY_OPEN_SLUGS];
}

export const DEFAULT_OPEN_SLUG = 'nousresearch/hermes-4-405b';

export function openEngineBySlug(slug) {
  return OPEN_ENGINES.find((e) => e.slug === slug) || null;
}

export function openEngineByKey(key) {
  return OPEN_ENGINES.find((e) => e.key === key) || null;
}

// Resolve whatever a client sent into a slug we are willing to call.
// Accepts either a roster key ('kimi-k3') or a raw slug, because the
// client picker speaks keys and older callers speak slugs.
export function resolveOpenSlug(requested, envOverride) {
  const allowed = allowedOpenSlugs(envOverride);
  const want = String(requested || '').trim();
  if (!want) return DEFAULT_OPEN_SLUG;
  if (allowed.includes(want)) return want;
  const byKey = openEngineByKey(want);
  if (byKey && allowed.includes(byKey.slug)) return byKey.slug;
  return DEFAULT_OPEN_SLUG;
}

// The public document. `reachable` is passed in by the endpoint from
// env, never inferred here: an engine we cannot call must not be
// advertised as available, and this module has no business reading env.
export function engineRoster(reachable = {}) {
  return {
    houses: HOUSES.map((h) => ({
      ...h,
      available: reachable[h.key] !== false,
      ...(h.pool === 'open' ? { engineCount: OPEN_ENGINES.length } : {}),
    })),
    open: OPEN_ENGINES.map((e) => ({
      ...e,
      license: e.license || null,
      licenseKnown: !!e.license,
      available: reachable.openlab !== false,
    })),
    counts: {
      houses: HOUSES.length,
      open: OPEN_ENGINES.length,
    },
  };
}
