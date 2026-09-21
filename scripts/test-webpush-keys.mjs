// Web Push key guard (2026-09-04). The served VAPID public key must be the
// one derived from the private key, never a separately configured value:
// two env values that had to agree drifted, every browser subscribed
// against a key the server could not sign for, and push never delivered
// once. Pure, no network, no env needed.
import { createECDH } from 'node:crypto';
import { derivePublicKey, resolvePublicKey } from '../app/netlify/functions/lib/webpush.mjs';

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok  ', msg); }

// web-push lives in app/node_modules, which the repo-root scripts cannot
// resolve, so the reference pair comes from node's own ECDH: the same
// curve and encoding web-push's generateVAPIDKeys uses.
function b64u(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function generateVAPIDKeys(scalar) {
  const e = createECDH('prime256v1');
  if (scalar) e.setPrivateKey(scalar); else e.generateKeys();
  // Match web-push's generator: Node can omit leading zero bytes from
  // the scalar, but VAPID requires exactly 32 bytes. Without this padding
  // the random fixture intermittently rejects its own otherwise valid key.
  const raw = e.getPrivateKey();
  const padded = Buffer.concat([Buffer.alloc(32 - raw.length), raw]);
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(padded) };
}
const pair = generateVAPIDKeys();
ok(derivePublicKey(pair.privateKey) === pair.publicKey, 'derivePublicKey reproduces web-push generateVAPIDKeys public key');
const short = generateVAPIDKeys(Buffer.from([1]));
ok(derivePublicKey(short.privateKey) === short.publicKey, 'leading-zero VAPID scalars use the generator padding');
ok(derivePublicKey('') === '', 'empty private key derives nothing');
ok(derivePublicKey('not-a-key') === '', 'garbage private key derives nothing rather than throwing');

const other = generateVAPIDKeys();
ok(resolvePublicKey(pair.privateKey, other.publicKey, 'BAKED') === pair.publicKey,
  'a mismatched env public key is overridden by the derived key');
ok(resolvePublicKey(pair.privateKey, pair.publicKey, 'BAKED') === pair.publicKey,
  'a matching env public key resolves to the same derived key');
ok(resolvePublicKey('', other.publicKey, 'BAKED') === other.publicKey,
  'with no private key the env public key is served (dormant mode)');
ok(resolvePublicKey('', '', 'BAKED') === 'BAKED', 'with nothing set the baked key is served');

if (fails) { console.error(fails + ' failing'); process.exit(1); }
console.log('test-webpush-keys: all passed');
