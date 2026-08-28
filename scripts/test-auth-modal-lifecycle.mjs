import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/js/auth-modal.js', import.meta.url), 'utf8');
let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log('PASS', label);
    return;
  }
  failures += 1;
  console.error('FAIL', label);
}

function functionBody(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`\n  function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

const finish = functionBody('finishSignIn', 'handOff');
const handoffAt = finish.indexOf('if (handOff(method)) return;');
const closeAt = finish.indexOf('forceClose();', handoffAt);
const navigateAt = finish.indexOf('window.location.href', handoffAt);

check(!!finish, 'finishSignIn is present');
check(
  handoffAt >= 0 && closeAt > handoffAt && navigateAt > closeAt,
  'ordinary sign-in closes the modal before same-page navigation',
);

const google = functionBody('doGoogle', 'doAppleSignIn');
check(
  /attempt\.then\(function \(\) \{[\s\S]*?finishSignIn\('google'\);/.test(google),
  'successful Google popup sign-in uses the guarded completion path',
);

if (failures) process.exit(1);
