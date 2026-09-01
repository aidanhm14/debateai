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

// 2026-08-31: the founder REVERSED the 2026-08-22 anonymity call, halfway
// on purpose. His NAME and PHOTO are sanctioned on public surfaces again;
// the CREDENTIAL STACK (champion titles, school) stays retired on his
// explicit instruction ("dont do apda champion - etc"). So the guard no
// longer bans the name; it bans the credential coming back from stale
// copy, and it still bans the personal gmail on public pages.
const failures = [];
for (const file of htmlFiles('app')) {
  const source = fs.readFileSync(file, 'utf8');
  if (/aidandavidhollinger/i.test(source)) {
    failures.push(`${file} exposes the founder's personal email`);
  }
  // Founder-credential PHRASES only. Bare "UChicago"/"APDA" stay legal:
  // the Atlas school list, the high-school circuit explainer, tournament
  // labels and placeholder copy all name them legitimately.
  if (/(APDA|Pro-?Ams)\s+champion/i.test(source)
    || /champion\s+at\s+UChicago/i.test(source)
    || /built by a[^<>]{0,80}(champion|parliamentary debater)/i.test(source)) {
    failures.push(`${file} restores the retired founder credential stack`);
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
