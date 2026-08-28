import fs from 'node:fs';

let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log('PASS', label);
    return;
  }
  failures += 1;
  console.error('FAIL', label);
}

const rootToml = fs.readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const appToml = fs.readFileSync(new URL('../app/netlify.toml', import.meta.url), 'utf8');

check(!fs.existsSync(new URL('../netlify/functions', import.meta.url)), 'no stale root function tree exists');
check(fs.existsSync(new URL('../app/netlify/functions/lib', import.meta.url)), 'the live function tree includes its libraries');
check(/^\s*functions\s*=\s*"app\/netlify\/functions"\s*$/m.test(rootToml), 'root config points at the live function tree');
check(/^\s*functions\s*=\s*"netlify\/functions"\s*$/m.test(appToml), 'app config resolves to the same live function tree');

if (failures) process.exit(1);
