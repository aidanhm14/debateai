#!/usr/bin/env node
/* generate-narration.mjs
 *
 * Builds the sitewide "listen to this page" narration bank.
 *
 * For each page in PAGES:
 *   1. Reads the HTML and strips it down to visible prose.
 *   2. Asks Claude to write a SPOKEN explainer of that page — what it is,
 *      what you can do there, where to go next. Written for the ear, not
 *      a verbatim read of the markup.
 *   3. Sends that script to ElevenLabs and writes app/audio/narration/<slug>.mp3.
 *   4. Records the result in app/audio/narration/manifest.json.
 *
 * The manifest carries a hash of the source prose, so re-running only
 * regenerates pages whose copy actually changed. A no-op re-run costs
 * nothing and touches no provider.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... ELEVENLABS_API_KEY=... node scripts/generate-narration.mjs
 *
 * Flags:
 *   --only <slug[,slug]>   restrict to specific pages (e.g. --only future,story)
 *   --dry-run              write scripts + manifest, skip ElevenLabs (no audio spend)
 *   --force                regenerate even when the source hash is unchanged
 *   --script-only          re-run Claude but keep existing audio
 *   --voice <id>           override the ElevenLabs voice id
 *   --list                 print the page list and exit
 *
 * Cost note: ElevenLabs is billed per character of the SCRIPT, not of the
 * page. Scripts land around 900-1300 characters, so a full 40-page rebuild
 * is roughly 45K characters. Incremental runs are a few pages at most.
 *
 * After a run that changes audio, bump CACHE_NAME in both sw.js files —
 * the service worker serves /audio/* cache-first, so a same-URL replacement
 * is invisible to returning visitors until the cache name moves.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { argv, exit } from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'app', 'audio', 'narration');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

// ── The narrator ───────────────────────────────────────────────────────
// 'tactician' in the TTS persona bank = the calm debater voice. The site
// guide should sound like someone walking you through a room, not like a
// trailer voiceover, so this leans calm on purpose. See the
// calm-guide default in the voice rules.
const DEFAULT_VOICE = process.env.NARRATION_VOICE_ID || 'HKsltWQPot5Fsrsvbq1g';

// ── Pages that get narration ───────────────────────────────────────────
// Content and marketing surfaces only. The live app surfaces (a round in
// progress, the profile, the leaderboard, messages) are deliberately out:
// narration there would talk over the product instead of explaining it.
const PAGES = [
  { slug: 'landing',                     file: 'app/landing.html',                        route: '/' },
  { slug: 'why-debateit',                file: 'app/why-debateit.html',                   route: '/why-debateit' },
  { slug: 'future',                      file: 'app/future.html',                         route: '/future' },
  { slug: 'story',                       file: 'app/story.html',                          route: '/story' },
  { slug: 'learn',                       file: 'app/learn.html',                          route: '/learn' },
  { slug: 'pricing',                     file: 'app/pricing.html',                        route: '/pricing' },
  { slug: 'schools',                     file: 'app/schools.html',                        route: '/schools' },
  { slug: 'professionals',               file: 'app/professionals.html',                  route: '/professionals' },
  { slug: 'coaches',                     file: 'app/coaches.html',                        route: '/coaches' },
  { slug: 'community',                   file: 'app/community.html',                      route: '/community' },
  { slug: 'credentials',                 file: 'app/credentials.html',                    route: '/credentials' },
  { slug: 'research',                    file: 'app/research.html',                       route: '/research' },
  { slug: 'reviews',                     file: 'app/reviews.html',                        route: '/reviews' },
  { slug: 'us',                          file: 'app/us.html',                             route: '/us' },
  { slug: 'india',                       file: 'app/india.html',                          route: '/india' },
  { slug: 'uwc',                         file: 'app/uwc.html',                            route: '/uwc' },
  { slug: 'high-school',                 file: 'app/high-school.html',                    route: '/high-school' },
  { slug: 'ambassadors',                 file: 'app/ambassadors.html',                    route: '/ambassadors' },
  { slug: 'tournaments',                 file: 'app/tournaments.html',                    route: '/tournaments' },
  { slug: 'online-debate-camp',          file: 'app/online-debate-camp.html',             route: '/online-debate-camp' },
  { slug: 'debate-an-ai',                file: 'app/debate-an-ai.html',                   route: '/debate-an-ai' },
  { slug: 'debate-online',               file: 'app/debate-online.html',                  route: '/debate-online' },
  { slug: 'debate-strangers',            file: 'app/debate-strangers.html',               route: '/debate-strangers' },
  { slug: 'online-debate-platforms',     file: 'app/online-debate-platforms.html',        route: '/online-debate-platforms' },
  { slug: 'ai-vs-ai-debate',             file: 'app/ai-vs-ai-debate.html',                route: '/ai-vs-ai-debate' },
  { slug: 'debatable',                   file: 'app/debatable.html',                      route: '/debatable' },
  { slug: 'compare-index',               file: 'app/compare/index.html',                  route: '/compare' },
  { slug: 'compare-chatgpt',             file: 'app/compare/debateit-vs-chatgpt.html',    route: '/compare/debateit-vs-chatgpt' },
  { slug: 'compare-claude',              file: 'app/compare/debateit-vs-claude.html',     route: '/compare/debateit-vs-claude' },
  { slug: 'compare-best',                file: 'app/compare/best-ai-for-debate-practice.html', route: '/compare/best-ai-for-debate-practice' },
  { slug: 'topics-index',                file: 'app/topics/index.html',                   route: '/topics' },
  { slug: 'topics-apda',                 file: 'app/topics/apda.html',                    route: '/topics/apda' },
  { slug: 'topics-asian-parliamentary',  file: 'app/topics/asian-parliamentary.html',     route: '/topics/asian-parliamentary' },
  { slug: 'topics-british-parliamentary',file: 'app/topics/british-parliamentary.html',   route: '/topics/british-parliamentary' },
  { slug: 'topics-world-schools',        file: 'app/topics/world-schools.html',           route: '/topics/world-schools' },
  { slug: 'topics-lincoln-douglas',      file: 'app/topics/lincoln-douglas.html',         route: '/topics/lincoln-douglas' },
  { slug: 'topics-public-forum',         file: 'app/topics/public-forum.html',            route: '/topics/public-forum' },
  { slug: 'topics-policy',               file: 'app/topics/policy.html',                  route: '/topics/policy' },
  { slug: 'topics-congress',             file: 'app/topics/congress.html',                route: '/topics/congress' },
  { slug: 'topics-mun',                  file: 'app/topics/mun.html',                     route: '/topics/mun' },
  { slug: 'topics-big-questions',        file: 'app/topics/big-questions.html',           route: '/topics/big-questions' },
];

// ── args ───────────────────────────────────────────────────────────────
function parseArgs(){
  const out = { only: null, dryRun: false, force: false, scriptOnly: false, voice: null, list: false };
  for (let i = 2; i < argv.length; i++){
    const a = argv[i];
    if (a === '--only') out.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--script-only') out.scriptOnly = true;
    else if (a === '--voice') out.voice = argv[++i];
    else if (a === '--list') out.list = true;
    else if (a === '-h' || a === '--help'){
      console.log(fs.readFileSync(new URL(import.meta.url).pathname, 'utf8').split('\n').slice(1, 40).join('\n'));
      exit(0);
    }
  }
  return out;
}
const args = parseArgs();

// ── HTML → prose ───────────────────────────────────────────────────────
// Deliberately regex-based, no DOM dependency. The output only ever feeds
// a summarizer, so "roughly the visible words, in order" is the bar. Drop
// anything that is markup, chrome, or navigation noise.
function extractProse(html){
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  // Keep block boundaries as sentence breaks so the summarizer sees structure.
  s = s.replace(/<\/(p|div|section|li|h[1-6]|tr|article|blockquote)>/gi, '.\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\s*\n\s*/g, '\n');
  s = s.replace(/\n{2,}/g, '\n');
  s = s.replace(/(^|\n)[.\s]+(?=\n|$)/g, '$1');
  return s.trim();
}

function pageTitle(html){
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

// ── Claude writes the spoken script ────────────────────────────────────
// The voice rules here mirror soul.md: no em-dashes, no prefaces, no
// consultant-speak, no founder name, plain language over metaphor.
const SYSTEM = `You write short spoken narrations that explain a single web page to someone who is listening rather than reading. The site is DebateIt, a voice-first debate trainer at debateai.com where people argue out loud against an AI opponent and get a judge ballot.

Your output is read aloud by a text-to-speech voice. Write for the ear.

WHAT TO WRITE
Explain what this page is, what the person can actually do here, and where it makes sense to go next. Lead with the most useful thing. Assume the listener may be browsing with their eyes elsewhere, so orient them quickly and concretely.

LENGTH
130 to 190 words. One paragraph, no headings, no lists, no bullet characters.

VOICE
Calm and direct, like a person showing you around a room. Short sentences next to longer ones. Concrete over abstract. Every sentence load-bearing.

HARD RULES
- No em-dashes. Use periods, commas, semicolons.
- Never announce what you are about to say. No "let's break it down", "here's why", "let me explain", "in this page we will". Just say the thing.
- Banned phrases: "dive in", "unpack", "hear me out", "at the end of the day", "it's important to note", "in today's world", "holistic", "robust framework", "ladies and gentlemen".
- No em-dash substitutes like " - " used as a dash. Rewrite the sentence instead.
- Do not name the founder. Refer to credentials by role only, for example "a national APDA champion".
- Do not claim the product is free forever or unlimited. It is in beta and every tier is currently free.
- Never sell on the absence of friction. Do not say "no card", "no credit card", "no sign-up", "no commitment", or any variant, even when the page says it somewhere. If the page states it as a fact you may not repeat it as a benefit.
- Never invent urgency or scarcity. No "lock in this rate", "before beta ends", "limited spots", "prices go up". If the page does not promise it, it does not exist.
- Do not invent features, prices, statistics, or guarantees. Every claim must be traceable to the page text you were given. When unsure, leave it out.
- No markdown, no stage directions, no emoji, no URLs read out character by character.
- Do not start with the page title verbatim. Start with what it does for the listener.

Return only the narration text. Nothing else.`;

// Brand and honesty lint. The prompt forbids all of this, but a bad line
// here ships as an MP3, which is far more expensive to notice and correct
// than a bad line of text. Anything flagged blocks synthesis for that page
// rather than quietly burning ElevenLabs credits on copy that has to be
// regenerated anyway.
const LINT = [
  [/\bno (credit )?card\b/i,                 'sells on "no card"'],
  [/\bno sign[- ]?up\b/i,                    'sells on "no sign-up"'],
  [/\bno commitment\b/i,                     'sells on "no commitment"'],
  [/\block in\b/i,                           'invented urgency ("lock in")'],
  [/\bbefore beta ends\b/i,                  'invented urgency ("before beta ends")'],
  [/\blimited (spots|time|seats)\b/i,        'invented scarcity'],
  [/\bprices? (go|will go) up\b/i,           'invented urgency'],
  [/\bunlimited\b/i,                         'says "unlimited"'],
  [/\bfree forever\b/i,                      'says "free forever"'],
  [/[—–]/,                                   'contains an em/en dash'],
  [/\blet'?s (dive|unpack|break)\b/i,        'banned preface'],
  [/\b(let me explain|hear me out|bear with me|stay with me)\b/i, 'banned preface'],
  [/\bat the end of the day\b/i,             'banned phrase'],
  [/\bit'?s important to note\b/i,           'banned phrase'],
  [/\bin today'?s world\b/i,                 'banned phrase'],
  [/\b(holistic|robust framework)\b/i,       'consultant-speak'],
  [/\bladies and gentlemen\b/i,              'banned phrase'],
];

function lint(script){
  return LINT.filter(([re]) => re.test(script)).map(([, why]) => why);
}

async function writeScript(title, prose, route, problems){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const fix = problems && problems.length
    ? `\n\nA previous attempt was rejected for: ${problems.join('; ')}. Write a new narration that does not repeat those. Do not acknowledge this note.`
    : '';
  const body = {
    model: 'claude-sonnet-4-5',
    max_tokens: 700,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Page route: ${route}\nPage title: ${title}\n\nVisible page text follows. Write the spoken narration for this page.${fix}\n\n---\n${prose.slice(0, 14000)}`,
    }],
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok){
    const txt = await r.text().catch(() => '');
    throw new Error(`Claude HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || []).map(c => c.text || '').join('').trim();
  if (!text) throw new Error('Claude returned an empty script');
  return text;
}

// Last line of defence. The prompt forbids these, but a stray em-dash in a
// narration is a brand bug that ships as AUDIO, which is far more annoying
// to fix later than a text diff. Normalize rather than fail the run.
function sanitize(script){
  let s = script.trim();
  s = s.replace(/\s*[—–]\s*/g, ', ');   // em/en dash → comma
  s = s.replace(/\s+-\s+/g, ', ');      // spaced hyphen used as a dash
  s = s.replace(/^["'`]+|["'`]+$/g, '');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/,\s*,/g, ',');
  return s.trim();
}

// ── ElevenLabs ─────────────────────────────────────────────────────────
// 64 kbps rather than the 128 kbps default. This is one voice reading
// prose, so the extra bitrate buys nothing audible and costs real repo
// weight: at the default, 41 pages is roughly 36 MB of binaries carried
// in git forever. At 64 it is about half that and still clean speech.
// Override with NARRATION_FORMAT if a page ever needs better.
const OUTPUT_FORMAT = process.env.NARRATION_FORMAT || 'mp3_44100_64';

async function synthesize(script, voiceId){
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        // Steadier and flatter than a debate speech. This is a guide
        // talking you through a page, so character is a liability here.
        stability: 0.62,
        similarity_boost: 0.78,
        style: 0.18,
        use_speaker_boost: true,
        speed: 1.0,
      },
    }),
  });
  if (!r.ok){
    const txt = await r.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// ── main ───────────────────────────────────────────────────────────────
function loadManifest(){
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return { voice: DEFAULT_VOICE, generated: null, pages: {} }; }
}

// Written after every page, not once at the end. A run that dies on page
// 30 of 41 would otherwise leave 29 paid-for MP3s on disk that no manifest
// entry points at, so the next run regenerates them and pays twice.
function saveManifest(manifest, voiceId){
  manifest.voice = voiceId;
  manifest.generated = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

async function main(){
  if (args.list){
    PAGES.forEach(p => console.log(`${p.slug.padEnd(32)} ${p.route}`));
    exit(0);
  }

  const voiceId = args.voice || DEFAULT_VOICE;
  const manifest = loadManifest();
  const targets = args.only
    ? PAGES.filter(p => args.only.includes(p.slug))
    : PAGES;

  if (!targets.length){
    console.error(`No pages matched --only ${args.only?.join(',')}. Run --list to see slugs.`);
    exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let built = 0, skipped = 0, failed = 0, chars = 0;

  for (const page of targets){
    const abs = path.join(ROOT, page.file);
    if (!fs.existsSync(abs)){
      console.warn(`  ${page.slug}: source missing (${page.file}), skipping`);
      failed++;
      continue;
    }

    const html = fs.readFileSync(abs, 'utf8');
    const prose = extractProse(html);
    const title = pageTitle(html);
    const hash = crypto.createHash('sha256').update(prose).digest('hex').slice(0, 16);

    const prev = manifest.pages[page.slug];
    const mp3Path = path.join(OUT_DIR, `${page.slug}.mp3`);
    const audioExists = fs.existsSync(mp3Path);
    const unchanged = prev && prev.hash === hash && prev.voice === voiceId && audioExists;

    if (unchanged && !args.force && !args.scriptOnly){
      console.log(`  ${page.slug}: unchanged, skipping`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ${page.slug}: writing script… `);
    let script;
    try {
      script = sanitize(await writeScript(title, prose, page.route));
      let problems = lint(script);
      if (problems.length){
        // One corrective pass with the violations named. Cheaper than a
        // human catching it after it is already audio.
        process.stdout.write(`retry (${problems.join('; ')})… `);
        script = sanitize(await writeScript(title, prose, page.route, problems));
        problems = lint(script);
      }
      if (problems.length){
        process.stdout.write('blocked.\n');
        console.warn(`    lint still failing: ${problems.join('; ')}`);
        console.warn(`    script kept in manifest for review, no audio generated.`);
        manifest.pages[page.slug] = {
          ...(prev || {}), slug: page.slug, route: page.route, title,
          script, hash: 'LINT_FAILED', voice: voiceId,
          words: script.split(/\s+/).length, lint: problems,
        };
        saveManifest(manifest, voiceId);
        failed++;
        continue;
      }
    } catch (err){
      process.stdout.write('failed.\n');
      console.warn(`    ${err.message}`);
      failed++;
      continue;
    }
    const words = script.split(/\s+/).length;
    process.stdout.write(`${words}w. `);
    chars += script.length;

    if (args.dryRun){
      process.stdout.write('(dry run, no audio)\n');
      manifest.pages[page.slug] = {
        ...(prev || {}), slug: page.slug, route: page.route, title,
        script, hash, voice: voiceId, words,
      };
      saveManifest(manifest, voiceId);
      built++;
      continue;
    }

    if (args.scriptOnly && audioExists){
      process.stdout.write('(script only, audio kept)\n');
      manifest.pages[page.slug] = {
        ...(prev || {}), slug: page.slug, route: page.route, title,
        script, hash, voice: voiceId, words,
      };
      saveManifest(manifest, voiceId);
      built++;
      continue;
    }

    process.stdout.write('synthesizing… ');
    let buf;
    try {
      buf = await synthesize(script, voiceId);
    } catch (err){
      process.stdout.write('failed.\n');
      console.warn(`    ${err.message}`);
      failed++;
      continue;
    }
    fs.writeFileSync(mp3Path, buf);
    process.stdout.write(`${(buf.length / 1024).toFixed(0)} KB.\n`);

    manifest.pages[page.slug] = {
      slug: page.slug,
      route: page.route,
      title,
      script,
      hash,
      voice: voiceId,
      words,
      bytes: buf.length,
      // Rough duration estimate for the player's progress affordance
      // before metadata loads. ~2.6 words/second at this voice setting.
      seconds: Math.round(words / 2.6),
    };
    saveManifest(manifest, voiceId);
    built++;
  }

  saveManifest(manifest, voiceId);

  console.log();
  console.log(`Built ${built}, skipped ${skipped}, failed ${failed}. ${chars} script characters sent to TTS.`);
  console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`);
  if (built && !args.dryRun && !args.scriptOnly){
    console.log('\nAudio changed. Bump CACHE_NAME in both sw.js files so the service worker stops serving the old files.');
  }
}

main().catch(err => { console.error(err); exit(1); });
