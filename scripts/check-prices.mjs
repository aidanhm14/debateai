#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// Canonical-price guard.
//
// Blocks a commit that stages an off-canonical price string in a
// user-facing surface. Catches two real failure modes we hit in one
// 2026-07-03 session: (a) a marketing page left stale at $5/mo, and
// (b) an outside agent about to ship prices *backwards* to superseded
// values ($5/year, $20/year, $14.99) because it trusted a stale local
// copy of AGENTS.md. This repo is edited by several agents (Claude,
// Codex, Grok) and the soul.md decision log is a long list of "swept
// prices across N files" entries — this guard pins the numbers so that
// class of drift can't reach main.
//
// Canonical post-beta tiers (source of truth: AGENTS.md "Pricing is
// locked" + soul.md §7):
//     Free $0 · BYOK $1/mo · Individual $10/year · Team $50/year
//     (The Lifetime tier was removed from all pricing displays
//      2026-07-03; the backend `lifetime` entitlement stays for any
//      existing grants, but no price string should advertise it.)
//
// Scope: staged, user-facing *.html under app/ and repo root. Excludes:
//   • report.html   — internal strategy/ARPU doc whose prose narrates
//                      *historical* prices ("re-priced from $30/mo to
//                      $20/year, then to $50/year") on purpose.
//   • *.md / *.mjs   — decision logs + analytics maps legitimately hold
//                      old numbers (never scanned; only .html is).
//   • app/netlify/functions/** — server-side, not a pricing display.
//
// Behavior: soft-skips (exit 0) when git/node are unavailable so it
// never wedges a fresh clone or a non-DebateAI repo; hard-fails
// (exit 1) only when a real off-canonical price is actually staged.
// ──────────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process';

// Each pattern is line-scoped. The gap between a "$N" and a cadence
// word is whitespace-only (\s*), so "$10/year ... Charged once a year"
// on one line does NOT match — the words in between break the run.
const FORBIDDEN = [
  { re: /\$\s?\d+(?:\.\d+)?\s*(?:once|one[-\s]?time)\b/i, why: 'one-time / Lifetime pricing — the Lifetime tier was removed 2026-07-03' },
  { re: /\$\s?14\.99/i,                                   why: 'old Lifetime price $14.99 — tier removed' },
  { re: /\$\s?5\s*\/\s*(?:mo|month|year|yr)\b/i,          why: 'superseded Individual price — canonical is $10/year' },
  { re: /\$\s?20\s*\/\s*(?:year|yr)\b/i,                  why: 'superseded Team price — canonical is $50/year' },
  { re: /\$\s?30\s*\/\s*(?:mo|month)\b/i,                 why: 'superseded Team price — canonical is $50/year' },
];

const EXCLUDE_BASENAMES = new Set(['report.html']);

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

let staged;
try {
  staged = sh('git diff --cached --name-only --diff-filter=ACM')
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  process.exit(0); // no git context → don't block
}

const targets = staged.filter((f) =>
  /\.html$/i.test(f) &&
  !EXCLUDE_BASENAMES.has(f.split('/').pop()) &&
  !/^(app\/)?netlify\/functions\//.test(f)
);

const violations = [];
for (const f of targets) {
  let content = '';
  try { content = sh(`git show :"${f}"`); } catch { continue; }
  content.split('\n').forEach((line, i) => {
    for (const { re, why } of FORBIDDEN) {
      const m = line.match(re);
      if (m) violations.push({ f, line: i + 1, hit: m[0].trim(), why });
    }
  });
}

if (violations.length) {
  const red = (s) => `\x1b[31m${s}\x1b[0m`;
  console.error(red('\n✗ price-guard: off-canonical price string(s) staged'));
  console.error('  Canonical: Free $0 · BYOK $1/mo · Individual $10/year · Team $50/year (no Lifetime).');
  console.error('  Source of truth: AGENTS.md "Pricing is locked" + soul.md §7.\n');
  for (const v of violations) {
    console.error(`  ${v.f}:${v.line}  "${v.hit}"  → ${v.why}`);
  }
  console.error('\n  Fix the price to the canonical value. If it is intentional historical');
  console.error('  prose, it belongs in report.html or a .md file (both excluded here).\n');
  process.exit(1);
}

process.exit(0);
