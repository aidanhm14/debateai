import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/js/notifications.js', import.meta.url), 'utf8');
const timing = source.slice(source.indexOf('    function consentWindowSeconds('), source.indexOf('    var REINVITE_COOLDOWN_MS'));
const sandbox = { COUNTDOWN_S: 45 };
vm.createContext(sandbox);
vm.runInContext(timing, sandbox);
const start = 1700000000000;
const proposal = { proposedAt: { seconds: start / 1000 }, pinged: false };
const left = (d, waiting, elapsed, seen = start) => sandbox.consentSecondsLeft(d, waiting, seen, start + elapsed * 1000);
assert.equal(left(proposal, false, 44), 1);
assert.equal(left(proposal, false, 45), 0);
assert.equal(left(proposal, true, 74), 1);
// This was the live failure: the accepted side cancelled at 75 seconds
// even though the notified opponent still had 45 seconds to decide.
const notified = { ...proposal, pinged: true };
assert.equal(left(notified, true, 76), 74);
assert.equal(left(notified, false, 76), 44);
assert.equal(left(notified, false, 120), 0);
assert.equal(left(notified, true, 149), 1);
assert.equal(left(notified, true, 150), 0);
// A late snapshot changes the window, never restarts its origin.
assert.equal(left(notified, true, 100, start + 90000), 50);
assert.equal(left({ pinged: true }, false, 100, start + 90000), 110);
assert.equal(left({ proposedAt: { toMillis: () => start }, pinged: true }, false, 76), 44);
assert.match(source, /pendingMatch = d;\s+markPeerAccepted\(d\)/);
assert.match(source, /consentSecondsLeft\(latest, true, pendingSeenAt, Date\.now\(\)\)/);
assert.match(source, /sent = sent\.then\(function \(ok\) \{\s+if \(!ok \|\| !declinedRef\) return;\s+return db\.runTransaction/);
assert.match(source, /recoverBackgroundConsent\(peerUid\)/);
console.log('Background consent: notified windows, late snapshots, retries and release ordering passed.');
