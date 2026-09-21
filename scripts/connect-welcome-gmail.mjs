#!/usr/bin/env node
// One-time owner authorization. Tokens stay in a private local file; this
// script neither changes Netlify settings nor sends any email.
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { GMAIL_SENDER } from '../app/netlify/functions/lib/gmail-welcome.mjs';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--client-json') || !args.includes('--output')) {
  console.error('Usage: node scripts/connect-welcome-gmail.mjs --client-json /path/to/desktop-client.json --output /private/path/gmail.env');
  process.exit(1);
}
const client = JSON.parse(await readFile(resolve(value('--client-json')), 'utf8')).installed;
if (!client?.client_id || !client.client_secret) throw new Error('Use a Google OAuth Desktop app client JSON file.');
const output = resolve(value('--output'));
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const scope = 'openid email https://www.googleapis.com/auth/gmail.send';
let redirect;
let busy = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect);
  if (url.pathname !== '/oauth/callback') { res.writeHead(404).end(); return; }
  if (url.searchParams.get('state') !== state) { res.writeHead(403).end('Invalid state.'); return; }
  if (busy) { res.writeHead(409).end('Authorization already in progress.'); return; }
  busy = true;
  try {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) throw new Error('Authorization was not completed.');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret,
        grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
    const token = await response.json();
    if (!token.refresh_token) throw new Error('Google did not return offline access. Reconnect with consent.');
    if (!(token.scope || '').split(' ').includes('https://www.googleapis.com/auth/gmail.send')) throw new Error('Gmail send permission was not granted.');
    // Obtain the account identity directly from Google with the new access
    // token; never accept a typed From address as proof of mailbox ownership.
    const identityResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!identityResponse.ok) throw new Error('Could not verify the Google account.');
    const identity = await identityResponse.json();
    if (identity.email !== GMAIL_SENDER || identity.email_verified !== true) throw new Error(`Please authorize ${GMAIL_SENDER}. Nothing was saved.`);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, 'WELCOME_GMAIL_OAUTH=' + JSON.stringify({ client_id: client.client_id,
      client_secret: client.client_secret, refresh_token: token.refresh_token }) + '\n', { mode: 0o600, flag: 'wx' });
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
      .end('Gmail authorization saved locally. Return to Codex to test and activate the welcome emails.');
    console.log(`Authorized ${GMAIL_SENDER}. Private environment file saved to ${output}. Sending is not enabled yet.`);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(error.message);
    console.error(error.message); process.exitCode = 1;
  } finally { clearTimeout(expiry); server.close(); }
});
const expiry = setTimeout(() => { console.error('Authorization expired. Run the command again.'); server.close(); }, 10 * 60_000);
server.listen(0, '127.0.0.1', () => {
  redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code',
    scope, access_type: 'offline', prompt: 'consent', login_hint: GMAIL_SENDER, state,
    code_challenge: challenge, code_challenge_method: 'S256' });
  console.log('Open this Google authorization link and approve sending mail from your account:');
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
