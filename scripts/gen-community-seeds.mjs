#!/usr/bin/env node
/* gen-community-seeds.mjs
 *
 * Regenerate the AI-persona seed threads in
 * app/js/community-threads.js using Grok (xAI). This is the "Grok for
 * seeded content only" path: the bots are written once, here, and baked
 * as static seeds so the public forum stays alive without a per-request
 * Grok cost. The live click-to-generate buttons are a separate path.
 *
 * Usage:
 *   XAI_API_KEY=xai-... node scripts/gen-community-seeds.mjs            # writes the file
 *   XAI_API_KEY=xai-... node scripts/gen-community-seeds.mjs --dry      # print only
 *   XAI_API_KEY=xai-... node scripts/gen-community-seeds.mjs --count 8  # N threads
 *
 * The personas are FIXED in community-threads.js (PERSONAS registry).
 * This script only fills the THREADS_RAW block between the GEN markers.
 *
 * Honesty contract (enforced in the prompt + validated on parse):
 *   - Authors are AI personas only. No fake students, schools, names,
 *     personal stories, testimonials, or human-passing handles.
 *   - The bots ask questions, drop motions, steelman, post counters,
 *     and summarize. They start conversations; humans finish them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(__dirname, '..', 'app', 'js', 'community-threads.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const countIdx = args.indexOf('--count');
const COUNT = countIdx >= 0 ? Math.max(3, Math.min(14, parseInt(args[countIdx + 1], 10) || 6)) : 6;

const KEY = process.env.XAI_API_KEY;
if (!KEY) {
  console.error('Missing XAI_API_KEY. Run:  XAI_API_KEY=xai-... node scripts/gen-community-seeds.mjs');
  process.exit(1);
}

// Persona handles MUST match PERSONAS in community-threads.js.
const PERSONAS = ['motionbot', 'counterpoint', 'steelman', 'clashsummary', 'warrantcheck'];
const CATEGORIES = ['asian', 'bp', 'worlds', 'pf', 'ld', 'policy', 'meta', 'general'];

const SYSTEM = `You generate conversation-starter forum threads for a competitive-debate community. Every thread is authored by a clearly-labeled AI persona. This is honest "dead internet" seeding: bots start arguments so the room is never empty, and they are always tagged AI in the UI.

PERSONAS (use the handle exactly):
- motionbot: drops a fresh motion + the clash worth fighting over.
- counterpoint: posts the strongest counter to a popular take, and asks to be argued out of it.
- steelman: rebuilds the weaker / dropped side as strong as it can honestly be made.
- clashsummary: summarizes where a recurring debate's clash stands and revives it (adds no new opinion).
- warrantcheck: takes one claim and demands the missing warrant / mechanism.

HARD RULES (these are the point of the feature):
- NEVER pose as a student or person. No personal stories, no "I", no schools, no tournaments you attended, no names, no human-passing handles, no testimonials, no claims of real human engagement.
- Speak as a debate bot doing its one job. It is fine to be direct and provocative.
- Do not praise the product. Do not invent user counts.

VOICE: casual, direct, witty, debate-literate, concise. Short sentences next to longer ones. No em-dashes (use periods, commas, semicolons). No throat-clearing openers.

OUTPUT: a single JSON array, no prose around it, of ${COUNT} objects:
{ "persona": <one of the handles>, "category": <one of: ${CATEGORIES.join(', ')}>, "title": <short, no end punctuation>, "content": <2-4 short paragraphs that end on an explicit ask>, "ageHours": <integer 2-120>, "voteScore": <integer 4-30>, "replies": [ { "persona": <handle, usually warrantcheck or counterpoint>, "hoursAfter": <integer 1-12>, "content": <one tight bot follow-up doing its job>, "voteScore": <integer 1-8> } ] }
Most threads should have 0 or 1 replies (bots start; humans finish). Vary personas and categories. Lead with asian/bp/worlds since that is where the traffic competes.`;

async function callGrok() {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-3',
      temperature: 0.9,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Generate ${COUNT} fresh starter threads now. JSON array only.` },
      ],
    }),
  });
  if (!res.ok) throw new Error('xAI ' + res.status + ': ' + (await res.text()).slice(0, 400));
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('No JSON array in Grok response:\n' + text.slice(0, 400));
  return JSON.parse(text.slice(start, end + 1));
}

function validate(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Empty generation.');
  const banned = /\bI\b|\bmy\b|\bwe\b|coaching|my school|my coach|i'm |i am |last season|my team/i;
  return items.map((t, i) => {
    if (!PERSONAS.includes(t.persona)) throw new Error(`Item ${i}: unknown persona "${t.persona}"`);
    if (!t.title || !t.content) throw new Error(`Item ${i}: missing title/content`);
    if (banned.test(t.title) || banned.test(t.content)) {
      console.warn(`  ! Item ${i} ("${t.title}") tripped the human-voice filter; review before shipping.`);
    }
    (t.replies || []).forEach((r) => {
      if (!PERSONAS.includes(r.persona)) throw new Error(`Item ${i} reply: unknown persona "${r.persona}"`);
    });
    return t;
  });
}

function toJsLiteral(items) {
  // Pretty-print as the THREADS_RAW array using the same shape the
  // module expects. Template literals for content so newlines survive.
  const esc = (s) => String(s).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const lines = ['  const THREADS_RAW = ['];
  for (const t of items) {
    lines.push('');
    lines.push('    {');
    lines.push(`      persona: '${t.persona}', category: '${t.category}', ageHours: ${Number(t.ageHours) || 6}, voteScore: ${Number(t.voteScore) || 6},`);
    lines.push(`      title: ${JSON.stringify(t.title)},`);
    lines.push('      content:');
    lines.push('`' + esc(t.content) + '`,');
    if (t.replies && t.replies.length) {
      lines.push('      replies: [');
      for (const r of t.replies) {
        lines.push(`        { persona: '${r.persona}', hoursAfter: ${Number(r.hoursAfter) || 2}, voteScore: ${Number(r.voteScore) || 2},`);
        lines.push('          content: `' + esc(r.content) + '` },');
      }
      lines.push('      ],');
    } else {
      lines.push('      replies: [],');
    }
    lines.push('    },');
  }
  lines.push('');
  lines.push('  ];');
  return lines.join('\n');
}

(async () => {
  console.log(`Generating ${COUNT} AI-persona seed threads via Grok...`);
  const items = validate(await callGrok());
  const literal = toJsLiteral(items);

  if (DRY) {
    console.log('\n--- DRY RUN (not written) ---\n');
    console.log(literal);
    return;
  }

  const src = fs.readFileSync(TARGET, 'utf8');
  const startMark = '/* GEN:START';
  const endMark = '/* GEN:END */';
  const si = src.indexOf(startMark);
  const ei = src.indexOf(endMark);
  if (si < 0 || ei < 0) throw new Error('GEN markers not found in ' + TARGET);
  // Keep the GEN:START comment block (ends at its closing */ before THREADS_RAW).
  const headerEnd = src.indexOf('*/', si) + 2;
  const header = src.slice(si, headerEnd);
  const next = src.slice(0, si) + header + '\n' + literal + '\n  ' + src.slice(ei);
  fs.writeFileSync(TARGET, next, 'utf8');
  console.log(`Wrote ${items.length} threads into ${path.relative(path.join(__dirname, '..'), TARGET)}.`);
  console.log('Review the diff, then bump the SW + commit (the pre-commit hook handles the SW bump).');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
