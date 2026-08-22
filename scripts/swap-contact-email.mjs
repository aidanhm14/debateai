#!/usr/bin/env node
/**
 * Swap the public contact address across every user-facing surface.
 *
 * Written 2026-08-22 alongside the founder-anonymity sweep. The site
 * carries one contact address in ~140 places: mailto hrefs, mailto
 * subjects, visible link text, JSON-LD `email` fields, and a couple of
 * plain-prose mentions in the terms and privacy pages. A find/replace
 * is easy to get wrong in two directions, so this script exists to
 * make the swap repeatable and to REFUSE to touch the places that look
 * like the contact address but are actually identity plumbing.
 *
 *   node scripts/swap-contact-email.mjs --to contact@itsdebatable.com --dry
 *   node scripts/swap-contact-email.mjs --to contact@itsdebatable.com
 *
 * DO NOT run this until the destination mailbox actually receives mail.
 * Every one of these is a mailto link; pointing them at a domain with no
 * MX record turns "Contact" into a hard bounce for the sender, which is
 * a worse failure than the one being fixed.
 */
import fs from 'node:fs';
import path from 'node:path';

const OLD = 'aidandavidhollinger@gmail.com';
const OLD_ENC = encodeURIComponent(OLD);          // shows up inside mailto query strings

// Identity plumbing, NOT public copy. These name the founder's Google
// sign-in identity; rewriting them locks the operator out of /admin and
// silently un-excludes the founder's own account from the product stats.
const SKIP = new Set([
  'app/netlify/functions/lib/auth.mjs',
  'app/netlify/functions/lib/founder-exclude.mjs',
]);

const SKIP_DIRS = ['node_modules', '.git', 'app/copy-edit', 'app/_temp_photos'];
const EXTS = new Set(['.html', '.js', '.mjs', '.json', '.txt', '.md', '.css']);

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const to = args[args.indexOf('--to') + 1];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error('usage: swap-contact-email.mjs --to <address> [--dry]');
  process.exit(1);
}
const TO_ENC = encodeURIComponent(to);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP_DIRS.some(s => p.startsWith(s))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

let files = 0, hits = 0, skipped = 0;
for (const p of walk('app')) {
  const s = fs.readFileSync(p, 'utf8');
  const n = (s.match(new RegExp(OLD.replace(/\./g, '\\.'), 'g')) || []).length
          + (s.match(new RegExp(OLD_ENC.replace(/\./g, '\\.'), 'g')) || []).length;
  if (!n) continue;
  if (SKIP.has(p)) { skipped += n; console.log(`  SKIP ${p} (${n}) — identity plumbing`); continue; }
  files++; hits += n;
  console.log(`  ${dry ? 'would fix' : 'fixed'} ${p} (${n})`);
  if (!dry) fs.writeFileSync(p, s.split(OLD_ENC).join(TO_ENC).split(OLD).join(to), 'utf8');
}
console.log(`\n${dry ? 'DRY RUN — ' : ''}${hits} occurrence(s) across ${files} file(s); ${skipped} deliberately skipped.`);
