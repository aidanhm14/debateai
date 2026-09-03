// Capture a signed-in Google session for the two-person spar test.
//
//   cd e2e && npm run save-auth -- a      # writes auth/a.json
//   cd e2e && npm run save-auth -- b      # writes auth/b.json
//
// Opens a headed Chrome at /spar. Sign in with a THROWAWAY Google account
// (never a real user's, never the founder's), wait until the gate is gone,
// then come back here and press Enter. The saved state includes IndexedDB,
// which is where the Firebase SDK keeps its session; cookies alone would
// not carry a sign-in across contexts.
//
// Google sometimes refuses sign-in inside an automated browser ("this
// browser may not be secure"). The real-Chrome channel and the
// AutomationControlled flag below are the usual way past it; if it still
// refuses, sign the throwaway account into that Chrome profile once by hand.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import readline from 'node:readline';

const slot = process.argv[2] || 'a';
const BASE_URL = process.env.BASE_URL || 'https://itsdebatable.com';
const out = `auth/${slot}.json`;
fs.mkdirSync('auth', { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: process.env.E2E_CHANNEL || 'chrome',
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${BASE_URL}/spar`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) => rl.question(`Sign in as throwaway account "${slot}" in the browser, then press Enter here... `, resolve));
rl.close();

await context.storageState({ path: out, indexedDB: true });
console.log(`saved ${out}`);
await browser.close();
