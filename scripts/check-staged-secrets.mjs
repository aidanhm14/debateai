#!/usr/bin/env node
// Pre-commit secret guard (2026-09-07). Scans the STAGED diff (added lines
// only) for live credential shapes and hard-blocks the commit. Netlify's own
// build-time scanner is switched off in netlify.toml, so this is the only
// automated check between a pasted key and a public repository.
//
// Public-by-design values are deliberately NOT matched: Firebase web keys
// (AIza...), Stripe publishable keys (pk_live_), Turnstile/App Check site
// keys, PostHog project tokens, VAPID public keys. Only server secrets.
import { execSync } from 'node:child_process';

const PATTERNS = [
  [/sk_live_[A-Za-z0-9]{16,}/, 'Stripe live secret key'],
  [/sk_test_[A-Za-z0-9]{16,}/, 'Stripe test secret key'],
  [/rk_live_[A-Za-z0-9]{16,}/, 'Stripe restricted key'],
  [/whsec_[A-Za-z0-9]{16,}/, 'Stripe webhook secret'],
  [/sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/sk-proj-[A-Za-z0-9_-]{20,}/, 'OpenAI project key'],
  [/sk-or-v1-[A-Fa-f0-9]{20,}/, 'OpenRouter key'],
  [/xai-[A-Za-z0-9]{20,}/, 'xAI key'],
  [/\bre_[A-Za-z0-9]{20,}\b/, 'Resend key'],
  [/AC[a-f0-9]{32}/, 'Twilio account SID'],
  [/-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'PEM private key'],
  [/LS0tLS1CRUdJTi[A-Za-z0-9+/=]{20,}/, 'base64-encoded PEM private key'],
  [/"private_key_id"\s*:\s*"[a-f0-9]{20,}"/, 'Google service-account JSON'],
  [/UPSTASH_REDIS_REST_TOKEN\s*=\s*['"]?A[A-Za-z0-9_-]{20,}/, 'Upstash token'],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],
  [/PRIVATE_KEY_B64 = "[^"]{20,}"/, 'baked Firestore credentials (the stub must stay null)'],
];

let diff = '';
try { diff = execSync('git diff --cached --unified=0 --no-color', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { process.exit(0); }

const hits = [];
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  if (file === 'scripts/check-staged-secrets.mjs') continue; // this file names the shapes
  for (const [re, label] of PATTERNS) {
    if (re.test(line)) hits.push(`${file}: ${label}`);
  }
}
if (hits.length) {
  console.error('[secret-guard] commit blocked. Staged lines match live credential shapes:');
  for (const h of [...new Set(hits)]) console.error('  ' + h);
  console.error('[secret-guard] Move the value to a Netlify env var. Never bypass with --no-verify.');
  process.exit(1);
}
process.exit(0);
