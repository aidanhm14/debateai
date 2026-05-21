#!/usr/bin/env node
/* generate-sfx.mjs
 *
 * Pre-generates UI sound effects via ElevenLabs sound-generation API.
 * Writes one MP3 per cue into app/audio/sfx/<name>.mp3. The runtime
 * (app/js/sfx.js) loads these lazily and falls back to the existing
 * Web Audio synth chimes if a file is missing or 404s — so this script
 * is run *once* per cue refresh, and the rest of the time the static
 * MP3s ride along in the Netlify build.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs --force
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs --only click,success
 *
 * Flags:
 *   --force            regenerate even if the MP3 already exists
 *   --only <a,b,c>     restrict to a comma-list of cue names
 *   --influence <0-1>  prompt-influence override (default 0.55)
 *   --out <dir>        output directory (default: app/audio/sfx)
 *
 * Cost: ~0.5s of audio per cue × 6 cues = ~3 credit-seconds total per
 * run. Idempotent by default — only regenerates missing files.
 *
 * After it writes the files, bump CACHE_NAME in both sw.js so the new
 * MP3s invalidate any cached pages without them. The pre-commit hook
 * does this automatically; only relevant if you somehow committed
 * without the hook.
 */

import fs from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';

// ── arg parse ─────────────────────────────────────────────────────────
function parseArgs(){
  const out = { force: false, only: null, influence: 0.55, out: null };
  for (let i = 2; i < argv.length; i++){
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--only') out.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--influence') out.influence = Math.max(0, Math.min(1, +argv[++i]));
    else if (a === '--out') out.out = argv[++i];
    else if (a === '-h' || a === '--help'){
      const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
      console.log(src.split('\n').slice(1, 34).join('\n'));
      exit(0);
    }
  }
  return out;
}

const args = parseArgs();
const ROOT = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = args.out
  ? path.resolve(args.out)
  : path.resolve(ROOT, 'app', 'audio', 'sfx');

// ── cue palette ───────────────────────────────────────────────────────
// Six UI sounds matching the public surface of app/js/sfx.js. Prompts
// are tuned for: short (≤500ms target), professional (macOS / Linear /
// Notion register, NOT cartoony / startup-bubbly), and brand-fit (debate
// / academic / sharp, not playful). Duration is the API's *target*; the
// model often returns slightly more — we trim in playback via gain
// envelope, not by re-encoding.
const CUES = [
  {
    name: 'click',
    prompt: 'Soft minimal UI tap, single short click, modern app interface, clean, dry, 100ms, no reverb, no music',
    duration: 0.5,
    desc: 'Generic button tap. Use on UI interactions.',
  },
  {
    name: 'send',
    prompt: 'Quick upward swoosh, message sent, modern messaging app, subtle, brief, 200ms, no reverb, no music, no voice',
    duration: 0.5,
    desc: 'User submits / commits a message.',
  },
  {
    name: 'receive',
    prompt: 'Soft gentle notification chime, message arriving, modern app, mellow bell, 250ms, no music, no voice',
    duration: 0.5,
    desc: 'AI / system reply lands.',
  },
  {
    name: 'success',
    prompt: 'Two-tone confirmation chime, pleasant, ascending, milestone reached, modern UI feedback, clean, 400ms, no reverb tail, no music, no voice',
    duration: 0.7,
    desc: 'Round complete, ballot ready, accept confirmed. Also aliased as start().',
  },
  {
    name: 'confirm',
    prompt: 'Warm single confirmation tone, brief, committed action, modern UI, soft bell, 200ms, no music, no voice',
    duration: 0.5,
    desc: 'Splash tap, accept-pressed-yes. Also aliased as end().',
  },
  {
    name: 'error',
    prompt: 'Soft low descending error tone, gentle, modern app feedback, not harsh, not buzzy, 300ms, no music, no voice',
    duration: 0.5,
    desc: 'API failure, validation error.',
  },
];

// ── ElevenLabs request ────────────────────────────────────────────────
async function generate(cue){
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  const body = {
    text: cue.prompt,
    duration_seconds: cue.duration,
    prompt_influence: args.influence,
  };
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok){
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 240)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// ── main ──────────────────────────────────────────────────────────────
async function main(){
  if (!process.env.ELEVENLABS_API_KEY){
    console.error('ELEVENLABS_API_KEY is required.');
    console.error('Grab one from the Netlify env or your ElevenLabs dashboard, then:');
    console.error('  ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs');
    exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const selected = args.only
    ? CUES.filter(c => args.only.includes(c.name))
    : CUES;
  if (args.only && selected.length !== args.only.length){
    const missing = args.only.filter(n => !CUES.find(c => c.name === n));
    console.error(`Unknown cue(s): ${missing.join(', ')}. Known: ${CUES.map(c => c.name).join(', ')}`);
    exit(1);
  }

  console.log(`Out: ${OUT_DIR}`);
  console.log(`Cues: ${selected.map(c => c.name).join(', ')}`);
  console.log(`prompt_influence: ${args.influence} · force: ${args.force}`);
  console.log();

  let made = 0, skipped = 0, failed = 0;
  for (const cue of selected){
    const out = path.join(OUT_DIR, `${cue.name}.mp3`);
    if (!args.force && fs.existsSync(out)){
      console.log(`  skip  ${cue.name}  (exists; use --force to regenerate)`);
      skipped++;
      continue;
    }
    process.stdout.write(`  gen   ${cue.name}… `);
    try {
      const buf = await generate(cue);
      fs.writeFileSync(out, buf);
      const kb = (buf.length / 1024).toFixed(1);
      process.stdout.write(`${kb} KB\n`);
      made++;
    } catch (err){
      process.stdout.write(`FAILED — ${err.message}\n`);
      failed++;
    }
  }

  console.log();
  console.log(`Done. made=${made} skipped=${skipped} failed=${failed}`);
  if (made > 0){
    console.log('\nNext: commit the new MP3s. The pre-commit hook bumps CACHE_NAME in both sw.js files automatically.');
  }
  if (failed > 0) exit(2);
}

main().catch(err => { console.error(err); exit(1); });
