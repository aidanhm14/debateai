// Dry run for the nightly X pulse. Runs both passes against live X and
// prints what WOULD land in the review queue. Writes nothing to
// Firestore, so it is safe to run against prod credentials.
//
//   node scripts/x-pulse-dryrun.mjs [domainSlug]
//
// Requires XAI_API_KEY and ANTHROPIC_API_KEY in the environment.

import { searchX, extractJson } from '../app/netlify/functions/lib/xai-x.mjs';

// Domain + format specs are duplicated here rather than imported.
// Importing scheduled-x-pulse.mjs would pull in lib/firestore.mjs and
// therefore @google-cloud/firestore, which is a Netlify build dep and is
// not installed at the repo root. Keep these in sync by hand; they are
// the only two constants this script needs.
const DOMAINS = [
  { slug: 'tech', label: 'Technology & AI', probe: 'AI policy, automation, algorithmic power, platform governance, and who should control frontier models' },
  { slug: 'politics', label: 'Politics & governance', probe: 'democratic institutions, elections, courts, federalism, protest, and state legitimacy' },
  { slug: 'economics', label: 'Economics & work', probe: 'labour markets, housing, inequality, trade, industrial policy, and the future of employment' },
  { slug: 'education', label: 'Education', probe: 'schools, universities, testing, curriculum, credentialism, and academic integrity' },
  { slug: 'geopolitics', label: 'Geopolitics', probe: 'international order, alliances, sovereignty, borders, war, and multilateral institutions' },
  { slug: 'ethics', label: 'Ethics & society', probe: 'rights, speech, religion, family, criminal justice, and moral obligation between citizens' },
  { slug: 'science', label: 'Science & environment', probe: 'climate policy, energy, public health, biotechnology, and scientific authority' },
  { slug: 'india', label: 'India & South Asia', probe: 'Indian policy, federalism, reservations, language politics, and South Asian regional questions' },
];

const MOTION_FORMATS = [
  { slug: 'apda',   label: 'APDA',            spec: '"This house would ..." / "THW ..." / "THBT ...". Impromptu, so NO tagged citations and no invented studies. Self-contained: a reader with general knowledge must be able to run it cold.' },
  { slug: 'bp',     label: 'British Parli',   spec: '"This house would ..." / "This house believes that ...". Must sustain four benches, so the motion needs enough ground for both an opening and a closing extension.' },
  { slug: 'asian',  label: 'Asian Parli',     spec: '"This house would ..." Asian Parliamentary. Should survive a definitional challenge: concrete enough that the setup is not itself the debate.' },
  { slug: 'worlds', label: 'World Schools',   spec: '"This house would ..." WSDC. Accessible to a strong 16-year-old with no specialist knowledge, while still having real clash.' },
  { slug: 'pf',     label: 'Public Forum',    spec: '"Resolved: ..." Policy-flavoured and evidence-driven. Both sides must have a real published evidence base, since PF debaters cut cards.' },
  { slug: 'ld',     label: 'Lincoln-Douglas', spec: '"Resolved: ..." Value-driven. The motion must turn on a moral or philosophical question, not an empirical one, so a value/criterion framework is meaningful.' },
];
const want = process.argv[2] || 'tech';
const domain = DOMAINS.find(d => d.slug === want) || DOMAINS[0];

console.log(`\n=== PASS 1: x_search on "${domain.label}" ===\n`);

// Rebuild the prompts here rather than exporting them: the point of a dry
// run is to exercise the real request path, and both prompts are already
// deterministic functions of the domain.
const p1 = [
  `Search X for the live arguments in this area: ${domain.probe}.`,
  '',
  'Identify the 3 sharpest DISAGREEMENTS being had right now.',
  'A disagreement is not a news event. "There was an election" is an event.',
  '"Whether courts should be able to overturn the result" is a disagreement.',
  'You want the ones where serious people are landing on opposite sides.',
  '',
  'For each, report how people ACTUALLY TALK about it. The exact terms,',
  'the framings each side reaches for, the names and cases being cited.',
  'Do not sanitise the phrasing into policy-brief language, and do not',
  'reproduce slurs or harassment. Quote short representative phrases.',
  '',
  'Return ONLY a JSON array, no prose outside it:',
  '[{',
  '  "headline": "the disagreement in one plain sentence",',
  '  "summary": "2-3 sentences on why it is contested NOW, including what changed recently",',
  '  "sideA": { "label": "short name for this camp", "phrasing": ["3-5 short phrases this side actually uses"] },',
  '  "sideB": { "label": "short name for the other camp", "phrasing": ["3-5 short phrases this side actually uses"] },',
  '  "vocabulary": ["6-10 specific terms, coinages, or shorthands in circulation"],',
  '  "actors": ["real people, institutions, companies, or cases being named"],',
  '  "heat": 1-5 how live and high-volume the argument is,',
  '  "debatable": true only if a reasonable person could argue EITHER side',
  '}]',
].join('\n');

const res = await searchX(p1, { maxSearches: 4 });
console.log(`searches: ${res.searchCount}   citations: ${res.citations.length}   cost: $${res.costUsd.toFixed(4)}`);

const faultLines = extractJson(res.text);
if (!Array.isArray(faultLines)) {
  console.error('\nUNPARSEABLE. Raw text follows:\n');
  console.error(res.text.slice(0, 2000));
  process.exit(1);
}

for (const fl of faultLines) {
  console.log(`\n  [heat ${fl.heat}] ${fl.headline}`);
  console.log(`    ${fl.summary}`);
  console.log(`    ${fl.sideA?.label}: ${(fl.sideA?.phrasing || []).join(' | ')}`);
  console.log(`    ${fl.sideB?.label}: ${(fl.sideB?.phrasing || []).join(' | ')}`);
  console.log(`    terms: ${(fl.vocabulary || []).join(', ')}`);
  console.log(`    named: ${(fl.actors || []).join(', ')}`);
}

console.log(`\n\n=== PASS 2: motions for "${faultLines[0].headline}" ===\n`);

const MOTION_SYSTEM = [
  'You write competitive debate motions. You are given a real argument',
  'happening on X and must convert it into tournament-correct motions.',
  '',
  'RULES, in priority order:',
  '',
  '1. BALANCE. A motion where one side obviously wins is a broken motion.',
  '   Both benches need a genuine path to victory. If the fault line is',
  '   lopsided, find the contested sub-question inside it that is not.',
  '',
  '2. FORMAT PHRASING IS NOT DECORATION. Each format opens differently and',
  '   rewards different motion shapes. Follow the per-format spec exactly.',
  '',
  '3. DEBATE THE PRINCIPLE, NOT THE PERSONALITY. X argues about people.',
  '   Tournaments argue about policies and principles. Convert "is X a',
  '   hypocrite" into the underlying question worth 45 minutes.',
  '',
  '4. NO EM-DASHES anywhere in your output. Periods, commas, semicolons only.',
  '',
  '5. NO PREFACES. Never announce what you are about to say. State it.',
  '',
  '6. The background block is briefing, not persuasion. Give the setup a',
  '   debater needs: what changed recently, the real numbers, the actual',
  '   institutions involved, and where the clash sits. Neutral between',
  '   sides. 2-4 sentences. No fabricated statistics, ever. If you do not',
  '   know a number, describe the mechanism instead of inventing a figure.',
  '',
  '7. Reject anything unfit for a 15-year-old in a school debate, anything',
  '   that targets a private individual, and anything whose "debate" is',
  '   really a demand that someone justify their own existence.',
].join('\n');

const fl = faultLines[0];
const p2 = [
  `DOMAIN: ${domain.label}`,
  `DISAGREEMENT: ${fl.headline}`,
  `CONTEXT: ${fl.summary}`,
  `SIDE A (${fl.sideA?.label}): ${(fl.sideA?.phrasing || []).join(' / ')}`,
  `SIDE B (${fl.sideB?.label}): ${(fl.sideB?.phrasing || []).join(' / ')}`,
  `TERMS IN CIRCULATION: ${(fl.vocabulary || []).join(', ')}`,
  `NAMED: ${(fl.actors || []).join(', ')}`,
  '',
  'Write one motion per format:',
  '',
  ...MOTION_FORMATS.map(f => `- ${f.slug} (${f.label}): ${f.spec}`),
  '',
  'Return ONLY JSON:',
  '{',
  '  "usable": true|false,',
  '  "rejectReason": "why, if usable is false",',
  '  "motions": [{ "format": "apda", "text": "...", "bg": "..." }]',
  '}',
  '',
  'Set usable:false if this cannot make a balanced, school-appropriate',
  'debate. A false here is a good outcome, not a failure. Do not force it.',
].join('\n');

const ares = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: process.env.PULSE_MOTION_MODEL || 'claude-sonnet-5',
    max_tokens: 4000,
    system: MOTION_SYSTEM,
    messages: [{ role: 'user', content: p2 }],
  }),
});

if (!ares.ok) {
  console.error('anthropic error', ares.status, (await ares.text()).slice(0, 400));
  process.exit(1);
}

const adata = await ares.json();
console.log(`stop_reason: ${adata.stop_reason}   output_tokens: ${adata.usage?.output_tokens}\n`);
const raw = (adata.content || []).map(b => b.text || '').join('\n');
const out = extractJson(raw);
if (!out) { console.error('pass 2 unparseable. tail:\n' + raw.slice(-600)); process.exit(1); }
if (out.usable === false) { console.log('REJECTED:', out.rejectReason); process.exit(0); }

for (const m of out.motions || []) {
  console.log(`  [${m.format}] ${m.text}`);
  console.log(`     bg: ${m.bg}\n`);
}

// House-rule check: em-dashes are banned in user-facing copy and these
// strings go straight onto motion cards.
const dashes = (out.motions || []).filter(m => /[—–]/.test(m.text + m.bg));
console.log(dashes.length ? `\n!! ${dashes.length} motions contain em-dashes` : '\nem-dash check: clean');
