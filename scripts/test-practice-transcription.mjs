// Contract test for the canonical AI round's browser-independent mic path.
// Runs the real useRecognition hook body against a mocked MediaRecorder so
// Firefox/Brave-style browsers (no SpeechRecognition) stay covered without
// opening a real microphone or spending a transcription call.

import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/practice.html', import.meta.url), 'utf8');
const hookStart = source.indexOf('function useRecognition()');
const hookEnd = source.indexOf('/* ═══════════════════════════════════════════════════\n   TIMER', hookStart);

if (hookStart < 0 || hookEnd < 0) throw new Error('Could not find useRecognition in practice.html');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {passed++;console.log('PASS', label);}
  else {failed++;console.error('FAIL', label);}
}

globalThis.useRef = (current) => ({ current });
globalThis.useState = (initial) => {
  let value = typeof initial === 'function' ? initial() : initial;
  return [value, (next) => {value = typeof next === 'function' ? next(value) : next;}];
};

let trackStops = 0;
const borrowedStream = {
  getAudioTracks() {return [{ readyState: 'live', stop() {trackStops++;} }];},
  getTracks() {return this.getAudioTracks();},
};

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported() {return true;}
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    FakeMediaRecorder.instances.push(this);
  }
  start() {this.state = 'recording';}
  stop() {
    if (this.state !== 'recording') return;
    this.state = 'inactive';
    this.ondataavailable?.({data: new Blob([new Uint8Array(3000)], {type: this.mimeType})});
    this.onstop?.();
  }
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {mediaDevices: {getUserMedia: async () => {throw new Error('borrowed stream should be reused');}}},
});
globalThis.MediaRecorder = FakeMediaRecorder;
globalThis.localStorage = {getItem() {return null;}};
globalThis.window = {
  MediaRecorder: FakeMediaRecorder,
  AbortController: globalThis.AbortController,
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined,
};

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  const call = fetchCalls;
  // Resolve the second segment first. The returned transcript must still
  // follow speech order rather than network order.
  if (call === 1) await new Promise((resolve) => setTimeout(resolve, 20));
  return {ok: true, async json() {return {text: call === 1 ? 'first segment' : 'final segment'};}};
};

// eslint-disable-next-line no-new-func
const makeHook = new Function(source.slice(hookStart, hookEnd) + '\nreturn useRecognition;');
const useRecognition = makeHook();
const recognition = useRecognition();

await recognition.start(borrowedStream);
check('missing SpeechRecognition starts MediaRecorder', FakeMediaRecorder.instances.length === 1);

// Close the first timed segment, which immediately starts the next one.
FakeMediaRecorder.instances[0].stop();
check('recording continues while the first segment transcribes', FakeMediaRecorder.instances.length === 2);

const transcript = await recognition.stop();
check('stop waits for the final segment and preserves speech order', transcript === 'first segment final segment');
check('both captured segments reached the transcription endpoint', fetchCalls === 2);
check('the recognition hook never stops the orb-owned microphone track', trackStops === 0);
check('the browser-only dead-end copy is gone', !source.includes('Speech recognition not supported in this browser'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
