import fs from 'node:fs';
import path from 'node:path';

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of htmlFiles('app')) {
  const source = fs.readFileSync(file, 'utf8');
  if (/aidandavidhollinger|\bAidan(?:\s+Hollinger)?\b/i.test(source)) {
    failures.push(`${file} exposes the retired founder identity`);
  }
}

for (const file of ['app/index.html', 'app/practice.html', 'app/voice-debate.html']) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes("OWNER_EMAIL_HASHES = new Set(['2a7460e5'])")) {
    failures.push(`${file} lost the anonymous client owner entitlement`);
  }
  if (/OWNER_EMAILS\s*=/.test(source)) {
    failures.push(`${file} exposes a raw owner allowlist`);
  }
}

const signIn = fs.readFileSync('app/netlify/functions/signin-link.mjs', 'utf8');
if (!signIn.includes('>Debatable<br>itsdebatable.com</p>') || signIn.includes('>Aidan<br>')) {
  failures.push('sign-in emails expose the retired founder identity');
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Public identity guard passed');
