#!/usr/bin/env node
/* generate-splash-mp3.mjs
 *
 * Renders the splash voice line (default: "I'll push back. Make your case.")
 * and writes the result to app/audio/splash-hook.mp3.
 *
 * Provider order:
 *   1. ElevenLabs    — reach for first since OpenAI is currently quota'd.
 *                      Free tier covers this; needs ELEVENLABS_API_KEY +
 *                      optional ELEVENLABS_VOICE_ID (default: 'onyx'-style
 *                      male debate voice IDs are noted below).
 *   2. OpenAI gpt-4o-mini-tts — fallback. Needs OPENAI_API_KEY with
 *                                budget remaining.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-splash-mp3.mjs
 *   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... node scripts/generate-splash-mp3.mjs
 *   OPENAI_API_KEY=... node scripts/generate-splash-mp3.mjs --provider openai
 *   node scripts/generate-splash-mp3.mjs --text "Custom line."
 *
 * Flags:
 *   --provider {elevenlabs|openai}   force a specific provider
 *   --text "..."                     override the line
 *   --voice <id>                     override voice id (provider-specific)
 *   --out <path>                     override output path (default: app/audio/splash-hook.mp3)
 *
 * After it writes the file, bump CACHE_NAME in both sw.js files so the
 * new MP3 invalidates any cached splash without it. The script prints a
 * one-liner sed to do exactly that.
 */

import fs from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';

// ── arg parse (tiny, no deps) ──────────────────────────────────────────
function parseArgs(){
  const out = { provider: null, text: null, voice: null, out: null };
  for (let i = 2; i < argv.length; i++){
    const a = argv[i];
    if (a === '--provider') out.provider = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--voice') out.voice = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '-h' || a === '--help'){
      console.log(fs.readFileSync(import.meta.url.replace('file://',''), 'utf8').split('\n').slice(1, 32).join('\n'));
      exit(0);
    }
  }
  return out;
}

const args = parseArgs();
const TEXT = args.text || "I'll push back. Make your case.";
// Resolve relative to the worktree root (this script lives in /scripts/).
const OUT_PATH = args.out || path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..', 'app', 'audio', 'splash-hook.mp3');

// ── ElevenLabs ─────────────────────────────────────────────────────────
// Default voice IDs you can drop in (curated for the brand: confident,
// adversarial-but-clean register, not marketing-y):
//   - 21m00Tcm4TlvDq8ikWAM = "Rachel" (warm, conversational; female)
//   - pNInz6obpgDQGcFmaJgB = "Adam"   (deep male, default ElevenLabs reference)
//   - VR6AewLTigWG4xSOukaG = "Arnold" (gravelly male, debate-coach feel)
//   - SOYHLrjzK2X1ezoPC6cr = "Harry"  (younger, sharper male)
// Override with ELEVENLABS_VOICE_ID env or --voice flag.
async function tryElevenLabs(text){
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, reason: 'ELEVENLABS_API_KEY not set' };
  const voiceId = args.voice || process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const body = {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.42,        // a bit lower than default for natural cadence
      similarity_boost: 0.78,
      style: 0.35,            // some character, not flat
      use_speaker_boost: true,
    },
  };
  process.stdout.write(`[elevenlabs] requesting (${voiceId})… `);
  const r = await fetch(url, {
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
    process.stdout.write('failed.\n');
    return { ok: false, reason: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
  }
  const buf = Buffer.from(await r.arrayBuffer());
  process.stdout.write(`got ${buf.length} bytes.\n`);
  return { ok: true, buf, provider: 'elevenlabs', voiceId };
}

// ── OpenAI gpt-4o-mini-tts ─────────────────────────────────────────────
// Voice options: alloy, ash, ballad, coral, echo, fable, onyx, nova,
// sage, shimmer, verse. 'onyx' = deep masculine, 'sage' = neutral-warm.
async function tryOpenAI(text){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY not set' };
  const voice = args.voice || process.env.OPENAI_TTS_VOICE || 'onyx';
  process.stdout.write(`[openai] requesting (${voice})… `);
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      // 'instructions' steers tone — gpt-4o-mini-tts honors this.
      instructions: 'Confident varsity-debater register. Slight smirk. Sharp, not aggressive. Brief pause between sentences.',
      response_format: 'mp3',
    }),
  });
  if (!r.ok){
    const txt = await r.text().catch(() => '');
    process.stdout.write('failed.\n');
    return { ok: false, reason: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
  }
  const buf = Buffer.from(await r.arrayBuffer());
  process.stdout.write(`got ${buf.length} bytes.\n`);
  return { ok: true, buf, provider: 'openai', voiceId: voice };
}

// ── main ───────────────────────────────────────────────────────────────
async function main(){
  console.log(`Generating splash audio: "${TEXT}"`);
  console.log(`Out: ${OUT_PATH}`);
  console.log();

  const order = args.provider
    ? [args.provider]
    : ['elevenlabs', 'openai'];

  let result = null;
  for (const provider of order){
    const fn = provider === 'elevenlabs' ? tryElevenLabs : provider === 'openai' ? tryOpenAI : null;
    if (!fn){ console.warn(`Unknown provider: ${provider}`); continue; }
    const r = await fn(TEXT);
    if (r.ok){ result = r; break; }
    console.warn(`[${provider}] skipped: ${r.reason}`);
  }

  if (!result){
    console.error('\nAll providers failed or unconfigured.');
    console.error('Set ELEVENLABS_API_KEY (preferred) or OPENAI_API_KEY and re-run.');
    exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, result.buf);
  const kb = (result.buf.length / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_PATH} (${kb} KB) via ${result.provider} (${result.voiceId}).`);

  if (result.buf.length > 60 * 1024){
    console.log('\nNote: file is over 60 KB target. Consider a shorter line or a tighter voice if first-paint mobile latency matters.');
  }

  console.log('\nNext: bump CACHE_NAME in both sw.js files so existing visitors\' SW picks up the new MP3:');
  console.log('  sed -i \'\' \'s/debateos-v\\([0-9]*\\)/debateos-v$((\\1+1))/\' sw.js app/sw.js   # macOS');
  console.log('Or just edit both files by hand (current line: const CACHE_NAME = \'debateos-vNN\';).');
}

main().catch(err => { console.error(err); exit(1); });
