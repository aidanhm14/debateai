// Nightly X pulse: turn live argument on X into debate motions.
//
// The motion banks in this codebase are hardcoded arrays (RANDOM_MOTIONS
// in index.html, MOTION_BANK in live.html, WARMUP_MOTIONS in spar.html).
// They are good motions, but they are frozen: written once, never
// refreshed, and increasingly framed around whatever was contested the
// month someone typed them. A debater practising "should AI write the
// news" in 2026 is arguing a 2023 fault line.
//
// This job fixes the input side. Every night it asks X what people are
// actually fighting about, then converts each fault line into
// format-correct motions. Two passes, two models, on purpose:
//
//   Pass 1 (Grok + x_search) — X is xAI's home turf. Grok reads live
//     posts and reports the fault line: who is arguing, which two sides
//     exist, and the ACTUAL PHRASING each side uses. That phrasing is
//     half the point (see lib/discourse.mjs).
//
//   Pass 2 (Claude) — Grok does not know that APDA motions open "This
//     house would" while PF motions open "Resolved:". Claude gets the
//     fault line plus an explicit phrasing spec and writes tournament-
//     correct motions with a real background block.
//
// Nothing published here reaches a student unreviewed. Everything lands
// in pulse_candidates with status:'pending' and waits for approval on
// /admin (see admin-pulse.mjs). X discourse is unfiltered by nature, and
// this product ships to schools.
//
// Cost: each x_search call bills ~$0.015 and each domain runs ~4 of
// them, so one domain is roughly $0.08 including tokens. PULSE_DOMAINS
// per night defaults to 4 of the 8 (rotating by day-of-year, so every
// domain refreshes every other day) for ~$0.32/night, ~$10/month.
//
// Env vars:
//   XAI_API_KEY            — required (pass 1)
//   ANTHROPIC_API_KEY      — required (pass 2)
//   GOOGLE_SERVICE_ACCOUNT — admin Firestore
//   PULSE_DOMAINS_PER_RUN  — how many domains per night (default 4)
//   PULSE_MOTION_MODEL     — pass-2 override (default sonnet)
//   PULSE_MAX_SEARCHES     — per-domain x_search cap (default 4)

import { getDb, FieldValue } from './lib/firestore.mjs';
import { searchX, extractJson } from './lib/xai-x.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MOTION_MODEL = process.env.PULSE_MOTION_MODEL || 'claude-sonnet-5';
const DOMAINS_PER_RUN = parseInt(process.env.PULSE_DOMAINS_PER_RUN || '4', 10);
const MAX_SEARCHES = parseInt(process.env.PULSE_MAX_SEARCHES || '4', 10);

// Fault lines per domain. Higher just dilutes: the 4th-hottest argument
// in a domain is usually a subplot of the 1st.
const FAULT_LINES_PER_DOMAIN = 3;

// The eight domains competitive motions actually get set in. Deliberately
// NOT "trending topics" — trending is celebrity news and sports results,
// which are not debatable propositions. Each domain is phrased as a
// question about disagreement, because a fault line is what we want, not
// a headline.
const DOMAINS = [
  {
    slug: 'tech',
    label: 'Technology & AI',
    probe: 'AI policy, automation, algorithmic power, platform governance, and who should control frontier models',
  },
  {
    slug: 'politics',
    label: 'Politics & governance',
    probe: 'democratic institutions, elections, courts, federalism, protest, and state legitimacy',
  },
  {
    slug: 'economics',
    label: 'Economics & work',
    probe: 'labour markets, housing, inequality, trade, industrial policy, and the future of employment',
  },
  {
    slug: 'education',
    label: 'Education',
    probe: 'schools, universities, testing, curriculum, credentialism, and academic integrity',
  },
  {
    slug: 'geopolitics',
    label: 'Geopolitics',
    probe: 'international order, alliances, sovereignty, borders, war, and multilateral institutions',
  },
  {
    slug: 'ethics',
    label: 'Ethics & society',
    probe: 'rights, speech, religion, family, criminal justice, and moral obligation between citizens',
  },
  {
    slug: 'science',
    label: 'Science & environment',
    probe: 'climate policy, energy, public health, biotechnology, and scientific authority',
  },
  {
    slug: 'india',
    label: 'India & South Asia',
    probe: 'Indian policy, federalism, reservations, language politics, and South Asian regional questions',
  },
];

// Formats pass 2 writes for. Kept to the parliamentary + prepared set the
// motion banks actually draw from; the Career trio (courtroom, negotiation,
// pitch) is not motion-driven so it is deliberately absent.
const MOTION_FORMATS = [
  { slug: 'apda',   label: 'APDA',            spec: '"This house would ..." / "THW ..." / "THBT ...". Impromptu, so NO tagged citations and no invented studies. Self-contained: a reader with general knowledge must be able to run it cold.' },
  { slug: 'bp',     label: 'British Parli',   spec: '"This house would ..." / "This house believes that ...". Must sustain four benches, so the motion needs enough ground for both an opening and a closing extension.' },
  { slug: 'asian',  label: 'Asian Parli',     spec: '"This house would ..." Asian Parliamentary. Should survive a definitional challenge: concrete enough that the setup is not itself the debate.' },
  { slug: 'worlds', label: 'World Schools',   spec: '"This house would ..." WSDC. Accessible to a strong 16-year-old with no specialist knowledge, while still having real clash.' },
  { slug: 'pf',     label: 'Public Forum',    spec: '"Resolved: ..." Policy-flavoured and evidence-driven. Both sides must have a real published evidence base, since PF debaters cut cards.' },
  { slug: 'ld',     label: 'Lincoln-Douglas', spec: '"Resolved: ..." Value-driven. The motion must turn on a moral or philosophical question, not an empirical one, so a value/criterion framework is meaningful.' },
];

// ── Pass 1 ────────────────────────────────────────────────────────────

function faultLinePrompt(domain) {
  return [
    `Search X for the live arguments in this area: ${domain.probe}.`,
    '',
    `Identify the ${FAULT_LINES_PER_DOMAIN} sharpest DISAGREEMENTS being had right now.`,
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
}

// ── Pass 2 ────────────────────────────────────────────────────────────

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

function motionPrompt(faultLine, domain) {
  return [
    `DOMAIN: ${domain.label}`,
    `DISAGREEMENT: ${faultLine.headline}`,
    `CONTEXT: ${faultLine.summary}`,
    `SIDE A (${faultLine.sideA?.label || 'for'}): ${(faultLine.sideA?.phrasing || []).join(' / ')}`,
    `SIDE B (${faultLine.sideB?.label || 'against'}): ${(faultLine.sideB?.phrasing || []).join(' / ')}`,
    `TERMS IN CIRCULATION: ${(faultLine.vocabulary || []).join(', ')}`,
    `NAMED: ${(faultLine.actors || []).join(', ')}`,
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
}

async function writeMotions(faultLine, domain) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MOTION_MODEL,
      max_tokens: 4000,
      system: MOTION_SYSTEM,
      messages: [{ role: 'user', content: motionPrompt(faultLine, domain) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic_${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || []).map(b => b.text || '').join('\n');
  return extractJson(text);
}

// ── Orchestration ─────────────────────────────────────────────────────

// Rotate which domains run tonight. Day-of-year stride means every domain
// comes up on a fixed cadence rather than at random, so no domain can go
// a week without a refresh through bad luck.
function domainsForToday(now, count) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start) / 86400000);
  const offset = (dayOfYear * count) % DOMAINS.length;
  const picked = [];
  for (let i = 0; i < Math.min(count, DOMAINS.length); i++) {
    picked.push(DOMAINS[(offset + i) % DOMAINS.length]);
  }
  return picked;
}

// Dedupe key. The same argument resurfaces night after night; without
// this the review queue fills with the same fault line eight times.
function fingerprint(headline) {
  return String(headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort()
    .slice(0, 8)
    .join('-')
    .slice(0, 120);
}

async function runDomain(db, domain, seenFingerprints) {
  const out = { domain: domain.slug, found: 0, written: 0, skipped: 0, costUsd: 0 };

  const pulse = await searchX(faultLinePrompt(domain), { maxSearches: MAX_SEARCHES });
  out.costUsd = pulse.costUsd;

  const faultLines = extractJson(pulse.text);
  if (!Array.isArray(faultLines)) {
    console.warn('[x-pulse]', domain.slug, 'no parseable fault lines');
    return { ...out, status: 'unparseable' };
  }
  out.found = faultLines.length;

  for (const fl of faultLines.slice(0, FAULT_LINES_PER_DOMAIN)) {
    if (!fl || !fl.headline) { out.skipped++; continue; }

    // Grok's own debatability check comes first: cheaper to trust it than
    // to pay Claude to reject the same thing.
    if (fl.debatable === false) { out.skipped++; continue; }

    const fp = fingerprint(fl.headline);
    if (!fp || seenFingerprints.has(fp)) { out.skipped++; continue; }

    let written;
    try {
      written = await writeMotions(fl, domain);
    } catch (err) {
      console.warn('[x-pulse]', domain.slug, 'motion pass failed:', err.message);
      out.skipped++;
      continue;
    }

    if (!written || written.usable === false || !Array.isArray(written.motions) || !written.motions.length) {
      console.log('[x-pulse]', domain.slug, 'rejected:', written?.rejectReason || 'no motions');
      out.skipped++;
      continue;
    }

    const motions = written.motions
      .filter(m => m && m.format && m.text)
      .map(m => ({
        format: String(m.format).slice(0, 20),
        text: String(m.text).slice(0, 400).replace(/[—–]/g, ','),
        bg: String(m.bg || '').slice(0, 1200).replace(/[—–]/g, ','),
      }));
    if (!motions.length) { out.skipped++; continue; }

    seenFingerprints.add(fp);

    await db.collection('pulse_candidates').doc(fp).set({
      fingerprint: fp,
      domain: domain.slug,
      domainLabel: domain.label,
      headline: String(fl.headline).slice(0, 300),
      summary: String(fl.summary || '').slice(0, 900),
      sideA: sanitizeSide(fl.sideA),
      sideB: sanitizeSide(fl.sideB),
      vocabulary: strList(fl.vocabulary, 12, 60),
      actors: strList(fl.actors, 12, 80),
      heat: clampHeat(fl.heat),
      motions,
      // Receipts. Every published motion traces back to real posts.
      citations: pulse.citations.slice(0, 40),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
    }, { merge: true });

    out.written++;
  }

  return { ...out, status: 'ok' };
}

function sanitizeSide(side) {
  return {
    label: String((side && side.label) || '').slice(0, 80),
    phrasing: strList(side && side.phrasing, 6, 200),
  };
}

function strList(arr, maxItems, maxChars) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(x => typeof x === 'string' && x.trim())
    .slice(0, maxItems)
    .map(x => x.trim().slice(0, maxChars));
}

function clampHeat(h) {
  const n = parseInt(h, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

export default async () => {
  if (!process.env.XAI_API_KEY || !ANTHROPIC_API_KEY) {
    console.error('[x-pulse] missing XAI_API_KEY or ANTHROPIC_API_KEY');
    return new Response(JSON.stringify({ ok: false, error: 'missing_keys' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb();
  const now = new Date();
  const domains = domainsForToday(now, DOMAINS_PER_RUN);

  // Pull existing fingerprints so a fault line already sitting in the
  // queue (or already rejected) does not come back tomorrow night. A
  // rejected fault line staying rejected is the important half: without
  // it, every "no" would need saying again every night.
  const seen = new Set();
  try {
    const existing = await db.collection('pulse_candidates').select('fingerprint').get();
    existing.forEach(d => { const f = d.get('fingerprint'); if (f) seen.add(f); });
  } catch (err) {
    console.warn('[x-pulse] fingerprint preload failed:', err.message);
  }

  const results = [];
  let totalCost = 0;

  // Sequential on purpose. Parallel domains would multiply concurrent
  // x_search spend with no wall-clock benefit that matters at 04:20 UTC.
  for (const domain of domains) {
    try {
      const r = await runDomain(db, domain, seen);
      totalCost += r.costUsd || 0;
      results.push(r);
    } catch (err) {
      console.error('[x-pulse]', domain.slug, 'crashed:', err.message);
      results.push({ domain: domain.slug, status: 'crashed', error: err.message });
    }
  }

  await db.collection('config').doc('x_pulse_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastDomains: domains.map(d => d.slug),
    lastResults: results,
    lastCostUsd: Math.round(totalCost * 10000) / 10000,
  }, { merge: true });

  console.log('[x-pulse] done', JSON.stringify({ results, totalCost }));

  return new Response(JSON.stringify({ ok: true, results, costUsd: totalCost }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// 04:20 UTC, twenty minutes after scheduled-distill so the two nightly
// Firestore-heavy jobs never overlap. Idempotent: fingerprint doc ids
// mean a re-run refreshes rather than duplicates.
export const config = {
  schedule: '20 4 * * *',
};

export const _internal = { DOMAINS, MOTION_FORMATS, domainsForToday, fingerprint };
