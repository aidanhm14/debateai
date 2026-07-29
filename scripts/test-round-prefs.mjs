// Guards the /settings ↔ /newvoice contract.
//
// The settings page and the turn engine hold the same numbers twice: the
// engine must keep its own constants so a missing round-prefs.js still runs a
// round, and the page must know the base gate to draw a threshold line that
// is not a lie. Duplication is the right call there and a drift risk here, so
// this asserts the two copies are equal, that every default reproduces the
// pre-settings behavior exactly, and that every key is actually synced.
//
//   node scripts/test-round-prefs.mjs

import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const prefsSrc = read('app/js/round-prefs.js');
const engine = read('app/newvoice.html');
const page = read('app/settings.html');
const sync = read('app/js/prefs-sync.js');

// Load round-prefs.js the way a browser would.
const store = {};
const win = {};
new Function('window', 'localStorage', prefsSrc)(win, {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
});
const RP = win.RoundPrefs;

let pass = 0;
const failures = [];
const check = (name, cond) => { if (cond) pass++; else failures.push(name); };

// Pull a `const NAME = <number>` out of the engine.
function engineConst(name) {
  const m = engine.match(new RegExp('const\\s+' + name + '\\s*=\\s*([0-9.]+)'));
  return m ? Number(m[1]) : NaN;
}

// ── the duplicated numbers ──────────────────────────────────────────
check('speech gate matches the engine', RP.GATE.speech === engineConst('SPEECH_LEVEL'));
check('noise margin matches the engine', RP.GATE.noiseMargin === engineConst('NOISE_MARGIN'));
check('noise cap matches the engine', RP.GATE.noiseCap === engineConst('NOISE_CAP'));

// ── defaults reproduce pre-settings behavior exactly ────────────────
// Anyone who never opens /settings has to get a byte-identical round, so
// every default must resolve to the constant the engine shipped with.
check('default pause equals the engine constant',
  RP.val('turnWait', 'ms', -1) === engineConst('TURN_SILENCE_MS'));
check('default barge sustain equals the engine constant',
  RP.val('barge', 'ms', -1) === engineConst('BARGE_SUSTAIN_MS'));
check('default room multiplier is neutral', RP.val('room', 'gate', -1) === 1);
check('default barge multiplier is neutral', RP.val('barge', 'lvl', -1) === 1);
check('default mic mode is hands free', RP.get('mic') === 'free');
check('nothing is set until the user picks', RP.isDefault());

// ── the accessors ───────────────────────────────────────────────────
check('set then get round-trips', RP.set('room', 'noisy') && RP.get('room') === 'noisy');
check('a set value changes the number', RP.val('room', 'gate', -1) > 1);
check('isDefault notices a change', !RP.isDefault());
check('an unknown option is refused', RP.set('room', 'cathedral') === false);
check('an unknown option leaves the old value', RP.get('room') === 'noisy');
store['da-room-noise'] = 'garbage-from-an-old-build';
check('a junk stored value falls back to the default', RP.get('room') === 'normal');
check('an unknown field falls back', RP.val('room', 'nope', 42) === 42);
check('an unknown setting falls back', RP.val('nothing', 'gate', 7) === 7);
RP.set('mic', 'ptt'); RP.set('turnWait', 'patient');
RP.reset();
check('reset clears every key', RP.isDefault());

// ── monotonic direction, so no control is secretly backwards ────────
const ms = (id) => RP.DEFS.turnWait.opts.find((o) => o.id === id).ms;
check('pause options increase left to right', ms('snappy') < ms('balanced') && ms('balanced') < ms('patient'));
const gate = (id) => RP.DEFS.room.opts.find((o) => o.id === id).gate;
check('a noisier room needs a louder voice', gate('quiet') < gate('normal') && gate('normal') < gate('noisy'));
const bl = (id) => RP.DEFS.barge.opts.find((o) => o.id === id).lvl;
const bm = (id) => RP.DEFS.barge.opts.find((o) => o.id === id).ms;
check('harder interrupting needs more level', bl('easy') < bl('normal') && bl('normal') < bl('hard'));
check('harder interrupting needs more time', bm('easy') < bm('normal') && bm('normal') < bm('hard'));

// ── the engine actually reads the prefs ─────────────────────────────
check('engine loads round-prefs', /src="\/js\/round-prefs\.js"/.test(engine));
check('engine loads it before the round, not deferred',
  /<script src="\/js\/round-prefs\.js"><\/script>/.test(engine));
for (const fn of ['speechGate', 'bargeFloor', 'bargeSustainMs', 'turnWaitMs']) {
  check(`engine routes ${fn} through prefs`, new RegExp(`function ${fn}\\(\\)\\{[^}]*pref\\(`).test(engine));
}
check('engine has no literal TURN_SILENCE_MS left in the tick',
  !/lastActiveAt >= TURN_SILENCE_MS/.test(engine));
check('engine has no literal BARGE_SUSTAIN_MS comparison left',
  !/bargeMs >= BARGE_SUSTAIN_MS/.test(engine));
check('every pref accessor can fall back without prefs',
  /window\.RoundPrefs \? window\.RoundPrefs\.val\(name, field, fallback\) : fallback/.test(engine));

// ── the page ────────────────────────────────────────────────────────
check('page loads round-prefs', /src="\/js\/round-prefs\.js"/.test(page));
check('page renders every voice setting',
  /VOICE_ORDER = \['mic', 'turnWait', 'room', 'barge'\]/.test(page));
check('page mirrors the engine gate formula',
  /Math\.max\(G\.speech, Math\.min\(G\.noiseCap, noiseFloor\) \+ G\.noiseMargin\) \* RP\.val\('room', 'gate', 1\)/.test(page));
check('page stops the mic when hidden', /visibilitychange[\s\S]{0,120}stopMic/.test(page));
check('page is noindex', /content="noindex/.test(page));
check('page points at the profile for account settings', /href="\/profile"/.test(page));

// ── everything is synced, or it is a fresh reset on the next device ─
for (const name of Object.keys(RP.DEFS)) {
  const key = RP.DEFS[name].key;
  check(`prefs-sync carries ${key}`, sync.includes(`'${key}'`));
}
for (const key of ['debateos-newvoice-diff', 'debateos-newvoice-pace', 'debateos-newvoice-judge-live', 'da-sfx-muted']) {
  check(`prefs-sync carries ${key}`, sync.includes(`'${key}'`));
}
// Every key the page writes has to exist somewhere; a typo here is a control
// that appears to work and silently does nothing.
const written = [...page.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
check('page writes at least the four extra keys', written.length >= 4);
for (const key of written) {
  check(`something reads ${key}`, engine.includes(key) || sync.includes(key) || read('app/js/sfx.js').includes(key));
}

// ── routes and house style ──────────────────────────────────────────
for (const toml of ['app/netlify.toml', 'netlify.toml']) {
  check(`${toml} routes /settings`, /from = "\/settings"[\s\S]{0,80}to = "\/settings\.html"/.test(read(toml)));
}
// Visible copy only. Comments and code are author-facing, and the em-dash
// rule is about what a reader sees.
const copy = page
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');
check('no em dashes in page copy', !copy.includes('—'));
for (const banned of ['no sign-up required', 'unlimited', "let's break it down", 'holistic']) {
  check(`banned phrase absent: ${banned}`, !page.toLowerCase().includes(banned));
}

for (const f of failures) console.log('  FAIL:', f);
console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
