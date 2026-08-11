import fs from 'node:fs';

const file = fs.readFileSync(new URL('../app/voice-debate.html', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log('PASS ' + name);
  } else {
    failed++;
    console.error('FAIL ' + name);
  }
}

check('active round checkpoint is tab-scoped', file.includes("sessionStorage.setItem(VOICE_RECOVERY_KEY"));
check('checkpoint expires after four hours', file.includes('4 * 60 * 60 * 1000'));
check('live round autosaves every 1.5 seconds', file.includes('setInterval(save, 1500)'));
check('page hide forces a final checkpoint', file.includes("window.addEventListener('pagehide', save)"));
check('normal round end clears the checkpoint', file.indexOf('clearVoiceRoundRecovery();', file.indexOf('function stop(')) > -1);
check('recovery restores transcript turns', file.includes('setTurns(resumingSnapshot.turns || [])'));
check('recovery restores the speech index', file.includes('recoveredSpeechIdx'));
check('recovery restores elapsed time', file.includes('Date.now() - recoveredElapsed * 1000'));
check('recovery transcript is reinjected as context', file.includes('[Recovered round context]'));
check('resume does not replay the opening', file.includes('Do not repeat the motion, sides, rules, or opening'));
check('failed WebRTC offers recovery', file.includes("offerRoundRecovery('The live connection ended"));
check('disconnected WebRTC gets an eight-second self-heal window', file.includes('}, 8000);'));
check('fake reconnect-attempt UI is gone', !file.includes("addSystem('Reconnect attempt "));
check('preflight opens a live microphone track', file.includes('navigator.mediaDevices.getUserMedia({ audio:'));
check('preflight reaches a Debatable endpoint', file.includes("fetch('/api/online-count?preflight='"));
check('preflight result is cached briefly', file.includes('Date.now() - preflightRef.current.at < 60000'));

const startAt = file.indexOf('var start = useCallback(async () => {');
const preflightAt = file.indexOf('var preflightOkay = await runPreflight();', startAt);
const mintAt = file.indexOf("setConnectStep('Minting session…');", startAt);
check('preflight runs before session minting', startAt > -1 && preflightAt > startAt && mintAt > preflightAt);

check('setup exposes mic and connection test', file.includes('Test mic & connection'));
check('live transcript shows autosave state', file.includes('Autosaved in this tab'));
check('verdict progress uses an accessible progressbar', file.includes("role: 'progressbar'") && file.includes('Progress toward the verdict'));
check('APDA progress names the verdict boundary', file.includes('Verdict after PMR'));
check('free-form progress explains stronger ballot threshold', file.includes('Six turns gives the judge more to work with.'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
