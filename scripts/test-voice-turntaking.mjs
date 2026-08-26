// Exercises the tap-to-speak state machine and the noise gates lifted out of
// newvoice.html, so this runs the shipped source rather than a copy.
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/newvoice.html', import.meta.url), 'utf8');

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('anchor not found: ' + (a < 0 ? from : to));
  return page.slice(a, b);
}

// The three regions under test, in dependency order.
const stateSrc = slice('let pttMode = false;', 'const HARD_CAP_MS');
const gateSrc = slice('const SPEECH_LEVEL', 'let aiHold = 0;')
  + slice('const TURN_SILENCE_MS', 'function bargeTick');
const ctlSrc = slice('function setFloor(open)', "$('floorBtn').addEventListener");

// Stubs for everything the extracted code touches.
const harness = `
let status = 'live', muted = false, micStream = null, dc = { send(){} };
let aiTalking = false, aiHold = 0, aiTurnAt = 0, bargeMs = 0;
let pendingTurn = false, awaitingResponse = false, nudgeFired = false;
let lastActiveAt = 0, userAnalyser = {}, userBuf = new Uint8Array(4);
let cancelled = 0, painted = 0, trackEnabled = null;
const els = {};
function $(id){ return els[id] || (els[id] = { id, classList:{ toggle(){}, add(){}, remove(){} },
  setAttribute(){}, querySelectorAll(){ return []; }, hidden:false, textContent:'' }); }
function paintSeg(){ painted++; }
function setSpeaking(){}
function level(){ return harnessLevel; }
let harnessLevel = 0;
const localStorage = { _v:{}, getItem(k){ return this._v[k] ?? null; }, setItem(k,v){ this._v[k]=v; } };
${stateSrc}
${gateSrc}
${ctlSrc}
// Reach in for assertions.
return {
  micLive, speechGate, bargeFloor, setFloor, setMicMode, paintMic, measureNoiseFloor,
  get: (k) => eval(k),
  set: (k, v) => { eval(k + ' = v'); },
  els,
};
`;

const api = new Function(harness)();
let pass = 0;
const failures = [];
const check = (name, cond) => { if (cond) pass++; else failures.push(name); };

// ── micLive truth table ────────────────────────────────────────────
// The one function that decides whether audio reaches OpenAI. Every wrong
// cell here is either a dead mic or a hot mic the user thinks is off.
const cases = [
  // muted, pttMode, pttOpen, expected
  [false, false, false, true],   // hands free, unmuted: live
  [true,  false, false, false],  // hands free, muted: dead
  [false, true,  false, false],  // tap mode, floor closed: dead
  [false, true,  true,  true],   // tap mode, floor open: live
  [true,  true,  true,  false],  // muted beats an open floor
];
for (const [m, pm, po, want] of cases) {
  api.set('muted', m); api.set('pttMode', pm); api.set('pttOpen', po);
  check(`micLive muted=${m} ptt=${pm} open=${po} => ${want}`, api.micLive() === want);
}
api.set('muted', false);

// ── noise gates ────────────────────────────────────────────────────
api.set('noiseFloor', 0);
check('quiet room falls back to the constant', api.speechGate() === 0.18);
check('barge floor clears the speech gate by a margin', api.bargeFloor() >= api.speechGate() + 0.1);
api.set('noiseFloor', 0.15);
check('noisy room raises the speech gate', Math.abs(api.speechGate() - 0.24) < 1e-9);
check('noisy room raises the barge floor too', api.bargeFloor() > 0.3);
api.set('noiseFloor', 0.05);
check('a slightly noisy room cannot LOWER the gate', api.speechGate() === 0.18);

// The cap is the case that matters: someone already talking during connect.
api.set('noiseFloor', 0);
api.set('harnessLevel', 0.9);
api.measureNoiseFloor();
await new Promise((r) => setTimeout(r, 900));
check('a loud room is capped, not allowed to deafen the mic', api.get('noiseFloor') <= 0.24);
check('gate stays usable after a loud calibration', api.speechGate() <= 0.33);
api.set('noiseFloor', 0);
api.set('harnessLevel', 0);

// ── the floor ──────────────────────────────────────────────────────
api.set('pttMode', true); api.set('pttOpen', false);

// Opening the floor while the AI talks cancels it outright: a tap is
// unambiguous intent, so it should not have to clear a loudness gate.
api.set('aiTalking', true);
let sent = [];
api.set('dc', { send: (s) => sent.push(JSON.parse(s).type) });
api.setFloor(true);
check('opening the floor cancels a talking AI', sent.includes('response.cancel'));
check('opening the floor flushes buffered AI audio', sent.includes('output_audio_buffer.clear'));
check('aiTalking clears on tap', api.get('aiTalking') === false);
check('floor is open', api.get('pttOpen') === true);

// Closing with nothing said is a misfire, not a turn.
api.set('spokeOnFloor', false);
api.set('pendingTurn', false);
api.setFloor(false);
check('a tap-open-tap-closed misfire does not hand the floor over', api.get('pendingTurn') === false);

// Closing after real speech schedules the handover through the one path.
api.setFloor(true);
api.set('spokeOnFloor', true);
const before = Date.now();
api.setFloor(false);
check('closing after speech marks a pending turn', api.get('pendingTurn') === true);
const backdate = before - api.get('lastActiveAt');
// Derived, not hardcoded: TURN_SILENCE_MS moves whenever someone reports the
// AI cutting in too early, and a literal here fails the next time it does.
// What matters is that the close BACKDATES by the full silence window minus
// the handoff, so the one existing silence path fires the turn.
const expectedBackdate = api.get('TURN_SILENCE_MS') - api.get('PTT_HANDOFF_MS');
check('handover is scheduled, not immediate',
  backdate >= expectedBackdate - 100 && backdate <= expectedBackdate + 100);
check('floor is closed', api.get('pttOpen') === false);

// Leaving tap mode must never strand a closed floor as a dead mic.
api.set('pttOpen', false);
api.setMicMode(false);
check('leaving tap mode restores a live mic', api.micLive() === true);
check('mode preference is persisted', api.get('localStorage').getItem('da-nv-mic') === 'free');
api.setMicMode(true);
check('entering tap mode closes the floor', api.get('pttOpen') === false);
check('entering tap mode kills the mic until a tap', api.micLive() === false);
check('tap preference is persisted', api.get('localStorage').getItem('da-nv-mic') === 'ptt');

// setFloor is inert outside a live round, so a stray keypress on the recap
// screen cannot open a mic against a torn-down peer connection.
api.set('status', 'ended');
api.set('pttOpen', false);
api.setFloor(true);
check('the floor cannot open when the round is not live', api.get('pttOpen') === false);

// ── shipped-source guards ──────────────────────────────────────────
check('the tick refuses to hand over while the floor is open',
  /if \(pttMode && pttOpen\) return;/.test(page));
check('hands-free barge gate is skipped in tap mode',
  /aiTalking && micLive\(\) && !pttMode/.test(page));
check('the arena meter follows micLive, not muted',
  !/muted \? 0 : level\(userAnalyser/.test(page));
check('VAD eagerness lowered', /eagerness: 'low'/.test(page));
check('server_vad threshold raised', /threshold: 0\.68/.test(page));
check('opening turn no longer recites the sides',
  /do NOT announce who is on which side/.test(page));

for (const f of failures) console.log('  FAIL:', f);
console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
