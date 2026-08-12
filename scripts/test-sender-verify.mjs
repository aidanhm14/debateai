/* test-sender-verify.mjs
 *
 * Guards the sender-domain check that stands between a mass send and a run
 * of silent 403s. Every assertion here is a failure mode that has actually
 * happened on this project or that this code exists to prevent.
 */
import { senderDomain, verifiedSenderDomains } from '../app/netlify/functions/lib/email.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', label); } };

// ── senderDomain ─────────────────────────────────────────────────────────────
ok(senderDomain('Aidan at Debatable <aidan@debateai.com>') === 'debateai.com', 'named form');
ok(senderDomain('aidan@debateai.com') === 'debateai.com', 'bare form');
ok(senderDomain('Aidan <Aidan@DebateAI.COM>') === 'debateai.com', 'lowercased');
ok(senderDomain('') === '', 'empty');
ok(senderDomain(null) === '', 'null');
ok(senderDomain('no address here') === '', 'garbage');

// ── verifiedSenderDomains ────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API_KEY;

// No key: must not send, must not throw.
delete process.env.RESEND_API_KEY;
let r = await verifiedSenderDomains();
ok(r.ok === false && r.reason === 'no-key' && r.domains.length === 0, 'no key fails closed');

process.env.RESEND_API_KEY = 're_test';

// Only 'verified' domains count. A domain sitting in the dashboard with
// pending DNS is exactly the one that would 403 every send.
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ data: [
    { name: 'debateai.com', status: 'verified' },
    { name: 'itsdebatable.com', status: 'pending' },
    { name: 'OLD.example', status: 'failed' },
  ] }),
});
r = await verifiedSenderDomains();
ok(r.ok === true, 'lookup ok');
ok(r.domains.length === 1 && r.domains[0] === 'debateai.com', 'only verified domains returned');

// Cached: a batch send must not make one lookup per recipient.
let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ data: [] }) }; };
r = await verifiedSenderDomains();
ok(r.cached === true && calls === 0, 'second call served from cache');

// A failed lookup returns ok:false so the caller can fall back, and never
// throws. The cache above is still warm, so each error case needs a fresh
// module instance rather than a TTL wait.
globalThis.fetch = async () => ({ ok: false, status: 401 });
const fresh = await import('../app/netlify/functions/lib/email.mjs?bust=1');
r = await fresh.verifiedSenderDomains();
ok(r.ok === false && r.reason === 'resend-401' && r.domains.length === 0, 'API error fails closed with a reason');

const fresh2 = await import('../app/netlify/functions/lib/email.mjs?bust=2');
globalThis.fetch = async () => { throw new Error('network down'); };
r = await fresh2.verifiedSenderDomains();
ok(r.ok === false && /network down/.test(r.reason), 'network error is caught, not thrown');

globalThis.fetch = realFetch;
if (realKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = realKey;

console.log(`sender-verify: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
