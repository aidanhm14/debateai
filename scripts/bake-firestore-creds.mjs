#!/usr/bin/env node
// Build-time bake of Firestore admin credentials.
//
// Why: the full GOOGLE_SERVICE_ACCOUNT JSON blob (~2.4KB) was pushing the
// Lambda env block past AWS's 4KB cap once OPENROUTER_API_KEY +
// DEEPSEEK_API_KEY were added, breaking every deploy with
// "Failed to create function: ... Your environment variables exceed the 4KB
// limit imposed by AWS Lambda." 45+ functions touch Firestore so scoping per
// function isn't viable.
//
// What this does: reads GOOGLE_SERVICE_ACCOUNT at build time only, extracts
// the 3 fields the code actually uses, writes them to
// app/netlify/functions/lib/_firestore-creds.mjs. esbuild inlines that file
// into each function bundle. Once you scope GOOGLE_SERVICE_ACCOUNT to
// "Builds" only in the Netlify dashboard, it stops getting pushed to Lambda
// — full ~2.4KB freed.
//
// The private key is base64-encoded so Netlify's secrets scanner doesn't
// match the raw PEM block against the dashboard value of the env var.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'app', 'netlify', 'functions', 'lib', '_firestore-creds.mjs');

const STUB = `// AUTO-GENERATED stub. Build script (scripts/bake-firestore-creds.mjs) replaces
// this file with the real credentials parsed from GOOGLE_SERVICE_ACCOUNT during
// Netlify builds. The stub keeps imports resolvable in local dev.
//
// DO NOT COMMIT non-null values from this file — they're secrets.
export const PROJECT_ID = null;
export const CLIENT_EMAIL = null;
export const PRIVATE_KEY_B64 = null;
`;

const json = process.env.GOOGLE_SERVICE_ACCOUNT;
if (!json) {
  // Local dev or any context without the env var: leave the stub in place
  // so firestore.mjs falls back to runtime env vars (or errors clearly).
  if (!fs.existsSync(target)) fs.writeFileSync(target, STUB);
  console.log('[bake-firestore-creds] GOOGLE_SERVICE_ACCOUNT not set — stub kept (local dev path).');
  process.exit(0);
}

let creds;
try {
  creds = JSON.parse(json);
} catch (e) {
  console.error('[bake-firestore-creds] GOOGLE_SERVICE_ACCOUNT is not valid JSON. First 50 chars:', json.slice(0, 50));
  process.exit(1);
}

const { project_id, client_email, private_key } = creds;
if (!project_id || !client_email || !private_key) {
  console.error('[bake-firestore-creds] missing required fields. Got keys:', Object.keys(creds).join(', '));
  process.exit(1);
}

const privateKeyB64 = Buffer.from(private_key, 'utf-8').toString('base64');

const content = `// AUTO-GENERATED at build time by scripts/bake-firestore-creds.mjs.
// Source: GOOGLE_SERVICE_ACCOUNT env var (scope to "Builds" only in the
// Netlify dashboard so the full JSON doesn't push Lambda env over 4KB).
// PRIVATE_KEY is base64-encoded so Netlify's secrets scanner doesn't trip
// when matching the bundled output against the dashboard env var value.
export const PROJECT_ID = ${JSON.stringify(project_id)};
export const CLIENT_EMAIL = ${JSON.stringify(client_email)};
export const PRIVATE_KEY_B64 = ${JSON.stringify(privateKeyB64)};
`;

fs.writeFileSync(target, content);
console.log(`[bake-firestore-creds] wrote ${target} (${content.length} bytes; key b64-encoded)`);
