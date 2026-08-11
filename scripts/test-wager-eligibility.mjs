// Tests for lib/wager-eligibility.mjs, the 18+ / jurisdiction gate on
// every staking path. Run: node scripts/test-wager-eligibility.mjs
//
// The properties worth asserting are all NEGATIVE ones: the gate must
// refuse in the cases where refusing is inconvenient. A gate that only
// gets tested on its happy path has not been tested.

import {
  checkWagerAge, checkWagerEligibility, checkJurisdiction,
  trustedCountry, blockedCountries, invalidateWagerEligibility,
  _clearWagerEligibilityCache, MINOR_AGE_RANGES,
} from '../app/netlify/functions/lib/wager-eligibility.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + name); } };

// Minimal Firestore double: db.collection(c).doc(id).get()
function fakeDb(profiles, opts = {}) {
  return {
    collection: () => ({
      doc: (id) => ({
        get: async () => {
          if (opts.throwOn === id) throw new Error('simulated firestore outage');
          const d = profiles[id];
          return { exists: d !== undefined, data: () => d };
        },
      }),
    }),
  };
}
const req = (headers = {}) => ({ headers: { get: (k) => headers[k] ?? null } });

const ADULT = { wagerAgeAttested: true, onboarding: { ageRange: '19-24' } };

// ── age ──────────────────────────────────────────────────────────────
_clearWagerEligibilityCache();
ok((await checkWagerAge(fakeDb({ u: ADULT }), 'u')).ok, 'attested adult passes');

for (const range of MINOR_AGE_RANGES) {
  _clearWagerEligibilityCache();
  const r = await checkWagerAge(fakeDb({ u: { wagerAgeAttested: true, onboarding: { ageRange: range } } }), 'u');
  ok(!r.ok && r.reason === 'minor', `minor range ${range} refused EVEN WITH attestation`);
}

_clearWagerEligibilityCache();
ok((await checkWagerAge(fakeDb({ u: { wagerAgeAttested: true, onboarding: { ageRange: '  16-18  ' } } }), 'u')).reason === 'minor',
  'minor range matched after trim/lowercase');

_clearWagerEligibilityCache();
ok((await checkWagerAge(fakeDb({ u: { onboarding: { ageRange: '19-24' } } }), 'u')).reason === 'no_attestation',
  'adult without attestation refused');

_clearWagerEligibilityCache();
ok((await checkWagerAge(fakeDb({}), 'ghost')).reason === 'no_attestation', 'missing profile refused');

_clearWagerEligibilityCache();
ok(!(await checkWagerAge(fakeDb({}), '')).ok, 'empty uid refused');

// Fails closed on a read error, and does NOT cache that failure.
_clearWagerEligibilityCache();
const flaky = fakeDb({ u: ADULT }, { throwOn: 'u' });
const errRes = await checkWagerAge(flaky, 'u');
ok(!errRes.ok && errRes.reason === 'unknown', 'firestore error fails CLOSED');
ok((await checkWagerAge(fakeDb({ u: ADULT }), 'u')).ok, 'a failed read is not cached (user recovers immediately)');

// Cache actually caches, and invalidation actually invalidates.
_clearWagerEligibilityCache();
await checkWagerAge(fakeDb({ u: { onboarding: {} } }), 'u');           // -> no_attestation, cached
ok(!(await checkWagerAge(fakeDb({ u: ADULT }), 'u')).ok, 'decision is cached');
invalidateWagerEligibility('u');
ok((await checkWagerAge(fakeDb({ u: ADULT }), 'u')).ok, 'invalidate lets the new attestation through');

// ── jurisdiction ─────────────────────────────────────────────────────
const geoHeader = (cc) => ({ 'x-nf-geo': Buffer.from(JSON.stringify({ country: cc })).toString('base64') });

delete process.env.WAGER_BLOCKED_COUNTRIES;
ok(blockedCountries().size === 0, 'blocklist empty by default');
ok(checkJurisdiction(req(), {}).ok, 'unknown country allowed while blocklist empty');
ok(checkJurisdiction(req(geoHeader('US')), {}).ok, 'US allowed while blocklist empty');

process.env.WAGER_BLOCKED_COUNTRIES = 'us, fr';
ok(!checkJurisdiction(req(geoHeader('US')), {}).ok, 'blocked country refused (case-insensitive env)');
ok(!checkJurisdiction(req(geoHeader('fr')), {}).ok, 'blocked country refused (lowercase geo)');
ok(checkJurisdiction(req(geoHeader('GB')), {}).ok, 'unblocked country allowed');
ok(!checkJurisdiction(req(), {}).ok, 'UNKNOWN country refused once a blocklist exists');
ok(!checkJurisdiction(req({ 'x-nf-geo': 'not-base64-json' }), {}).ok, 'unparseable geo refused once a blocklist exists');

// Geo must come from the edge, never from anything a caller controls.
ok(trustedCountry(req(), { geo: { country: 'DE' } }) === 'DE', 'context.geo string form read');
ok(trustedCountry(req(), { geo: { country: { code: 'DE' } } }) === 'DE', 'context.geo object form read');
ok(trustedCountry(req(geoHeader('NOPE')), {}) === '', 'non-ISO country rejected');
ok(trustedCountry({ headers: { get: () => null }, url: 'https://x/?country=GB' }, {}) === '',
  'query param is NOT a source of truth');

// ── combined ─────────────────────────────────────────────────────────
_clearWagerEligibilityCache();
process.env.WAGER_BLOCKED_COUNTRIES = 'US';
const blocked = await checkWagerEligibility(fakeDb({ u: ADULT }), 'u', req(geoHeader('US')), {});
ok(!blocked.ok && blocked.reason === 'jurisdiction', 'jurisdiction refuses before age is even read');
ok(typeof blocked.message === 'string' && blocked.message.length > 0, 'refusal carries a user-facing message');

delete process.env.WAGER_BLOCKED_COUNTRIES;
_clearWagerEligibilityCache();
ok((await checkWagerEligibility(fakeDb({ u: ADULT }), 'u', req(geoHeader('GB')), {})).ok,
  'attested adult in an allowed country passes both gates');

console.log(`\nwager-eligibility: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
