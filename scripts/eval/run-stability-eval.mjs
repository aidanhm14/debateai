// ─────────────────────────────────────────────────────────────
// VERDICT STABILITY EVAL
//
// The accuracy eval next door asks whether the judge agrees with a human
// panel. This one asks a prior question: does the judge agree with
// ITSELF. A ladder inherits its judge's bias, and unlike noise, a
// systematic bias does not average out over many rounds. It compounds
// into a rating, and the ladder then measures skill at exploiting the
// judge rather than skill at debating.
//
// Three perturbations, none of which changes what was argued:
//
//   repeat  same prompt, second sample     → self-agreement
//   swap    bench blocks change position   → position bias
//   pad     one bench's lines repeated     → verbosity bias
//
// A judge that is fit to carry a rating returns the same call under all
// three. Anything it does not survive is a lever a player can pull.
//
// Every rate ships with an interval, because on the 23 rounds that exist
// a bare percentage is a decoration. Power is printed BEFORE the spend
// so the run is either worth paying for or is not.
//
// Run:
//   node scripts/eval/run-stability-eval.mjs --dry-run      # no API spend
//   ANTHROPIC_API_KEY=sk-... node scripts/eval/run-stability-eval.mjs
//   ... --limit=6 --conditions=repeat,swap --format=bp
//   ... --out=scripts/eval/out/stability-2026-08-14.json
//
// Notes on fidelity: this measures lib/adjudication.mjs (the core that
// ships) through the same prompt builder as the accuracy eval, on real
// out-round flows. It does NOT measure async-sweep's richer ballot
// prompt (points, dimensions, RFD). If the headline rates here are poor,
// re-run against that prompt before concluding which part is at fault.
// ─────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadGold, resolveFixturesDir, selectRounds, loadCorpus, normalizeFormat, makeReader,
  buildPrompt, parseBpOrder, parseWinner, pairwiseAgreement, promptTokens, padRatio,
} from './lib/adjudication-fixtures.mjs';
import {
  proportionCI, bootstrapCI, binomTest, nForMargin, nForDetect, fleissKappaMulti, pct, mean,
} from './lib/stats.mjs';
import { kappaBand } from '../../app/netlify/functions/lib/judge-panel.mjs';

// ── args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const DRY = flag('dry-run') || !process.env.ANTHROPIC_API_KEY;
const ONLY = opt('only', '');
const FORMAT = normalizeFormat(opt('format', ''));
const LIMIT = parseInt(opt('limit', '0'), 10) || 0;
const MODEL = process.env.ADJ_MODEL || opt('model', 'claude-sonnet-4-6');
const OUT = opt('out', '');
const CORPUS = opt('corpus', '');
const PAD_EVERY = parseInt(opt('pad-every', '2'), 10) || 2;
const CONCURRENCY = Math.max(1, parseInt(opt('concurrency', '3'), 10) || 3);
const CONDITIONS = new Set(String(opt('conditions', CORPUS ? 'repeat' : 'repeat,swap,pad')).split(',').map((s) => s.trim()).filter(Boolean));
// Temperature is deliberately left UNSET by default, because prod leaves
// it unset. Self-disagreement at the default temperature is not an
// artifact of this harness, it is what the site does to a real round.
const TEMP = opt('temp', '');

const unknownConditions = [...CONDITIONS].filter((c) => !['repeat', 'swap', 'pad'].includes(c));
if (unknownConditions.length) throw new Error('unknown stability condition(s): ' + unknownConditions.join(', '));
if (CORPUS && [...CONDITIONS].some((c) => c !== 'repeat')) {
  throw new Error('consented corpus fixtures are unsplit and support --conditions=repeat only');
}

const filters = { format: FORMAT, only: ONLY, limit: LIMIT };
const corpus = CORPUS ? loadCorpus(CORPUS, filters) : null;
const gold = corpus ? null : loadGold();
const fixturesDir = corpus ? corpus.fixturesDir : resolveFixturesDir(gold);
const rounds = corpus ? corpus.rounds : selectRounds(gold, filters);
const reader = corpus ? null : makeReader(fixturesDir);
const source = corpus ? 'consented production corpus' : 'external adjudication fixtures';
if (!rounds.length) throw new Error('no stability-eligible rounds matched the requested filters');

// ── the judge call ──
//
// Retried, for the same reason live-round ballots are (2026-07-28): this
// harness fires ~90 large requests in a burst, and a single dropped
// connection kills a whole round's comparison rather than one call. An
// unretried transport failure would land in the results as a missing
// verdict, which is indistinguishable from the judge being unstable. That
// is the one confusion this file exists to avoid, so it fails loudly
// instead: errors are counted and printed, never silently averaged over.
// Jittered, because N identical backoffs is a second burst.
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

async function callAnthropicOnce(prompt) {
  const body = {
    model: MODEL,
    // 3000, not 600, and this is the same defect prod hit on 2026-08-12:
    // reasoning models bill thinking against max_tokens, so a cap tuned
    // before they existed spends the whole budget reasoning and returns
    // no closing brace. It presents as a parse failure, which in THIS
    // harness would have read as instability. Measured here: at 600
    // every call on the first round truncated. Matches BALLOT_MAX_TOKENS.
    max_tokens: Number(process.env.STABILITY_MAX_TOKENS || 3000),
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  };
  if (TEMP !== '') body.temperature = Number(TEMP);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 300));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  // A truncated ballot parses as a missing vote and would read as
  // instability that is really a token cap. Surface it instead.
  if (data.stop_reason === 'max_tokens') process.stderr.write('  ! max_tokens hit, verdict may be truncated\n');
  return (data.content || []).map((c) => c.text || '').join('');
}

async function callAnthropic(prompt, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callAnthropicOnce(prompt);
    } catch (err) {
      lastErr = err;
      // A key or quota problem never self-heals; retrying it just spends
      // the budget slower.
      const retryable = err.status === undefined || RETRYABLE.has(err.status);
      if (!retryable || i === attempts - 1) throw err;
      const base = [2000, 5000, 12000][i] || 12000;
      const wait = base + Math.floor(base * 0.4 * ((i * 7919 + prompt.user.length) % 100) / 100);
      process.stderr.write(`  ~ retry ${i + 1}/${attempts - 1} in ${Math.round(wait / 100) / 10}s (${err.message.slice(0, 60)})\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** BP → "cg>og>oo>co", two-sided → "prop". The unit every rate counts. */
function verdictKey(format, raw) {
  if (format === 'bp') {
    const order = parseBpOrder(raw);
    return order ? { key: order.join('>'), top: order[0], order } : null;
  }
  const w = parseWinner(raw);
  return w ? { key: w, top: w, order: null } : null;
}

/** Build the four prompts for one round. */
function conditionsFor(r) {
  const format = normalizeFormat(r.format);
  const blocks = corpus ? null : reader.loadBlocks(r);
  const base = corpus ? corpus.loadRound(r) : reader.renderRound(r, blocks);
  const out = [
    { name: 'base', transcript: base },
  ];
  if (CONDITIONS.has('repeat')) out.push({ name: 'repeat', transcript: base });
  if (CONDITIONS.has('swap')) out.push({ name: 'swap', transcript: reader.renderRound(r, blocks, { swap: true }) });
  if (CONDITIONS.has('pad')) {
    // Padded side is decided AFTER the baseline verdict, so it is always
    // the side that lost. Padding the winner would be a weaker test: it
    // asks whether length protects a lead rather than whether length
    // buys a round.
    out.push({ name: 'pad', deferred: true });
  }
  return { format, blocks, base, conditions: out };
}

function padTargetFor(format, blocks, baseVerdict) {
  if (!baseVerdict) return null;
  if (format === 'bp') {
    // The bench holding the 4th-ranked team. If padding buys anything,
    // that bench's mean rank improves.
    const last = baseVerdict.order[3];
    return blocks.first.teams.includes(last) ? blocks.first.key : blocks.second.key;
  }
  return baseVerdict.top === 'prop' ? 'opp' : 'prop';
}

/** Mean rank (1 best) of a bench's teams under an ordering. */
function benchRank(order, teams) {
  const ranks = teams.map((t) => order.indexOf(t) + 1).filter((n) => n > 0);
  return ranks.length ? mean(ranks) : null;
}

async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }));
  return out;
}

// ── plan + power, printed before any spend ──
const planned = rounds.map((r) => conditionsFor(r));
const callsPerRound = 1 + (CONDITIONS.has('repeat') ? 1 : 0) + (CONDITIONS.has('swap') ? 1 : 0) + (CONDITIONS.has('pad') ? 1 : 0);
const estTokens = planned.reduce((s, p, i) => s + promptTokens(buildPrompt(rounds[i], p.base)) * callsPerRound, 0);
const halfWidthPts = 100 * 1.96 * Math.sqrt((0.9 * 0.1) / Math.max(1, rounds.length));

console.log(`\nVerdict stability  ·  ${rounds.length} rounds  ·  ${callsPerRound} calls each  ·  model ${MODEL}${TEMP !== '' ? '  ·  temp ' + TEMP : '  ·  temp default'}`);
console.log(`source: ${source}`);
console.log(`fixtures: ${fixturesDir}`);
console.log(`conditions: base, ${[...CONDITIONS].join(', ')}`);
console.log(`≈${(estTokens / 1000).toFixed(0)}k input tokens total\n`);

console.log('POWER, before spending anything');
console.log(`  n = ${rounds.length}. A rate observed at 90% carries a 95% interval of roughly ±${halfWidthPts.toFixed(0)} points.`);
console.log(`  To pin a stability rate to ±10 points needs ~${nForMargin(0.9, 0.1)} rounds; to ±5 points, ~${nForMargin(0.9, 0.05)}.`);
console.log(`  To call position bias at 65/35 against a coin (80% power) needs ~${nForDetect(0.65)} paired rounds; at 75/25, ~${nForDetect(0.75)}.`);
console.log(`  So ${rounds.length} rounds can catch a GROSS defect and cannot certify a good number. Read this run as a tripwire.\n`);

if (DRY) {
  for (const [i, p] of planned.entries()) {
    const r = rounds[i];
    if (corpus) {
      console.log(`• ${r.id.padEnd(28)} ${String(p.format).padEnd(6)} base=${String(p.base.length).padStart(6)}ch  repeat ready ✓`);
    } else {
      const padded = reader.renderRound(r, p.blocks, { pad: { side: p.blocks.second.key, every: PAD_EVERY } });
      const swapped = reader.renderRound(r, p.blocks, { swap: true });
      const sameLen = swapped.length === p.base.length;
      console.log(
        `• ${r.id.padEnd(28)} ${String(p.format).padEnd(6)} base=${String(p.base.length).padStart(6)}ch  ` +
        `swap=${sameLen ? 'same length ✓' : 'LENGTH MOVED ✗'}  pad×${padRatio(p.base, padded)}`
      );
    }
  }
  console.log('\nDry run: prompts assembled, no API calls. Set ANTHROPIC_API_KEY to score.\n');
  process.exit(0);
}

// ── run ──
const results = [];
for (const [i, plan] of planned.entries()) {
  const r = rounds[i];
  const label = `${r.id} (${plan.format})`;
  try {
    const immediate = plan.conditions.filter((c) => !c.deferred);
    const raws = await pool(immediate, (c) => callAnthropic(buildPrompt(r, c.transcript)), CONCURRENCY);

    const verdicts = {};
    immediate.forEach((c, idx) => { verdicts[c.name] = verdictKey(plan.format, raws[idx]); });

    let padSide = null;
    let padFactor = null;
    if (CONDITIONS.has('pad') && verdicts.base) {
      padSide = padTargetFor(plan.format, plan.blocks, verdicts.base);
      const padded = reader.renderRound(r, plan.blocks, { pad: { side: padSide, every: PAD_EVERY } });
      padFactor = padRatio(plan.base, padded);
      verdicts.pad = verdictKey(plan.format, await callAnthropic(buildPrompt(r, padded)));
    }

    const row = { id: r.id, format: plan.format, motion: r.motion, padSide, padFactor, verdicts };
    results.push(row);

    const shown = ['base', 'repeat', 'swap', 'pad']
      .filter((k) => verdicts[k] !== undefined)
      .map((k) => `${k}=${verdicts[k] ? verdicts[k].key : 'UNPARSED'}`)
      .join('  ');
    const invariants = ['repeat', 'swap'].filter((c) => CONDITIONS.has(c));
    const stable = verdicts.base && invariants.length
      && invariants.every((c) => verdicts[c] && verdicts[c].key === verdicts.base.key);
    console.log(`• ${label.padEnd(34)} ${stable ? '✓' : '✗'}  ${shown}`);
  } catch (err) {
    console.log(`• ${label.padEnd(34)} ERROR ${err.message}`);
    results.push({ id: r.id, format: plan.format, error: err.message, verdicts: {} });
  }
}

// ── metrics ──
function flags(pick) {
  return results.map(pick).filter((v) => v === 0 || v === 1);
}

const sameAs = (row, cond) => {
  const a = row.verdicts && row.verdicts.base;
  const b = row.verdicts && row.verdicts[cond];
  if (!a || !b) return null;
  return a.key === b.key ? 1 : 0;
};
const sameTop = (row, cond) => {
  const a = row.verdicts && row.verdicts.base;
  const b = row.verdicts && row.verdicts[cond];
  if (!a || !b) return null;
  return a.top === b.top ? 1 : 0;
};

const selfSame = flags((r) => sameAs(r, 'repeat'));
const swapSame = flags((r) => sameAs(r, 'swap'));
const selfTop = flags((r) => sameTop(r, 'repeat'));
const swapTop = flags((r) => sameTop(r, 'swap'));
const padSame = flags((r) => sameAs(r, 'pad'));

// Held across every requested unpadded comparison. On the external
// fixtures that is base + repeat + swap. On the unsplit consented corpus
// it is base + repeat, the exact same-round-twice test.
const invariantConditions = ['repeat', 'swap'].filter((c) => CONDITIONS.has(c));
const heldAll = results
  .filter((r) => r.verdicts && r.verdicts.base && invariantConditions.length
    && invariantConditions.every((c) => r.verdicts[c]))
  .map((r) => invariantConditions.every((c) => r.verdicts[c].key === r.verdicts.base.key) ? 1 : 0);

// Position bias: did the bench presented FIRST do better when it was
// first? Paired within a round, so the round's own difficulty cancels.
const positionDeltas = [];
for (const row of results) {
  const v = row.verdicts || {};
  if (!v.base || !v.swap) continue;
  if (row.format === 'bp') {
    const plan = planned[rounds.findIndex((r) => r.id === row.id)];
    if (!plan) continue;
    const firstTeams = plan.blocks.first.teams;
    const asFirst = benchRank(v.base.order, firstTeams);
    const asSecond = benchRank(v.swap.order, firstTeams);
    if (asFirst != null && asSecond != null) positionDeltas.push(asSecond - asFirst); // >0 = better when first
  } else {
    // Two-sided: count how often the side printed first won, pooled over
    // both presentations.
    positionDeltas.push(v.base.top === 'prop' ? 1 : 0, v.swap.top === 'opp' ? 1 : 0);
  }
}
const twoSidedRows = results.filter((r) => r.format !== 'bp');
const firstSlotWins = twoSidedRows.reduce((acc, r) => {
  const v = r.verdicts || {};
  let k = 0;
  let n = 0;
  if (v.base) { n++; if (v.base.top === 'prop') k++; }
  if (v.swap) { n++; if (v.swap.top === 'opp') k++; }
  return { k: acc.k + k, n: acc.n + n };
}, { k: 0, n: 0 });

// Verbosity: did padding the loser hand it the round?
const padFlips = results.filter((r) => r.verdicts && r.verdicts.base && r.verdicts.pad).map((r) => {
  if (r.format === 'bp') {
    const plan = planned[rounds.findIndex((x) => x.id === r.id)];
    const bench = plan && (plan.blocks.first.key === r.padSide ? plan.blocks.first : plan.blocks.second);
    if (!bench) return null;
    const before = benchRank(r.verdicts.base.order, bench.teams);
    const after = benchRank(r.verdicts.pad.order, bench.teams);
    return { id: r.id, moved: before != null && after != null ? before - after : null, tookTop: r.verdicts.pad.top !== r.verdicts.base.top ? 1 : 0 };
  }
  return { id: r.id, moved: null, tookTop: r.verdicts.pad.top !== r.verdicts.base.top ? 1 : 0 };
}).filter(Boolean);

// Chance-corrected agreement across the available unpadded runs. The
// consented corpus has two reads per round; the external fixtures have
// three when both repeat and swap are selected.
const kappaConditions = ['base', ...invariantConditions];
const kappaItems = results
  .filter((r) => r.verdicts && kappaConditions.length >= 2 && kappaConditions.every((c) => r.verdicts[c]))
  .map((r) => {
    const counts = {};
    for (const c of kappaConditions) {
      const t = r.verdicts[c].top;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  });
const kappa = fleissKappaMulti(kappaItems);

// BP partial credit: how much of the ordering survives a swap.
const bpPairwise = results
  .filter((r) => r.format === 'bp' && r.verdicts && r.verdicts.base && r.verdicts.swap)
  .map((r) => pairwiseAgreement(r.verdicts.base.order, r.verdicts.swap.order));

function line(label, arr, note = '') {
  if (!arr.length) { console.log(`  ${label.padEnd(34)} no data`); return null; }
  const k = arr.reduce((s, x) => s + x, 0);
  const ci = proportionCI(k, arr.length);
  const boot = bootstrapCI(arr);
  console.log(
    `  ${label.padEnd(34)} ${pct(ci.p).padStart(6)}  (${k}/${arr.length})  95% CI ${pct(ci.lo)}-${pct(ci.hi)}  bootstrap ${pct(boot.lo)}-${pct(boot.hi)}${note ? '  ' + note : ''}`
  );
  return { rate: ci.p, k, n: arr.length, wilson: [ci.lo, ci.hi], bootstrap: [boot.lo, boot.hi] };
}

console.log('\n─── VERDICT STABILITY ' + '─'.repeat(46));
const m = {};
m.heldAllRequested = line(`held across all ${kappaConditions.length} reads (headline)`, heldAll);
m.selfAgreement = line('self-agreement (same prompt twice)', selfSame);
m.selfAgreementTop = line('  ... same winner only', selfTop);
m.orderRobust = line('survives the order swap', swapSame);
m.orderRobustTop = line('  ... same winner only', swapTop);
m.padRobust = line('survives padding the loser', padSame);

if (bpPairwise.length) {
  const b = bootstrapCI(bpPairwise);
  console.log(`  ${'BP pairwise agreement, base vs swap'.padEnd(34)} ${pct(b.stat).padStart(6)}  (n=${b.n})  bootstrap ${pct(b.lo)}-${pct(b.hi)}`);
  m.bpPairwiseSwap = { rate: b.stat, n: b.n, bootstrap: [b.lo, b.hi] };
}

console.log('\n─── POSITION BIAS ' + '─'.repeat(50));
if (firstSlotWins.n) {
  const t = binomTest(firstSlotWins.k, firstSlotWins.n);
  console.log(`  two-sided: the side printed first won ${firstSlotWins.k}/${firstSlotWins.n} (${pct(firstSlotWins.k / firstSlotWins.n)}), exact binomial p=${t.p}`);
  m.firstSlotWinRate = { k: firstSlotWins.k, n: firstSlotWins.n, p: t.p };
}
const bpDeltas = results.filter((r) => r.format === 'bp').length ? positionDeltas.filter((d) => Number.isFinite(d)) : [];
if (bpDeltas.length && results.some((r) => r.format === 'bp')) {
  const b = bootstrapCI(bpDeltas);
  console.log(`  BP: mean rank change of a bench when printed first: ${b.stat > 0 ? '+' : ''}${b.stat} places (positive = helped by going first), bootstrap ${b.lo} to ${b.hi}`);
  console.log('  A bench-position effect is a lever a player cannot control, so any interval clear of 0 is a defect, not a preference.');
  m.bpPositionDelta = { mean: b.stat, n: b.n, bootstrap: [b.lo, b.hi] };
}

console.log('\n─── VERBOSITY ' + '─'.repeat(54));
if (padFlips.length) {
  const took = padFlips.map((f) => f.tookTop);
  const k = took.reduce((s, x) => s + x, 0);
  const ci = proportionCI(k, took.length);
  console.log(`  padding the LOSER changed the winner in ${k}/${took.length} rounds (${pct(ci.p)}), 95% CI ${pct(ci.lo)}-${pct(ci.hi)}`);
  const moved = padFlips.map((f) => f.moved).filter((x) => Number.isFinite(x));
  if (moved.length) {
    const b = bootstrapCI(moved);
    console.log(`  BP: padded bench moved ${b.stat > 0 ? '+' : ''}${b.stat} places on average (positive = padding helped), bootstrap ${b.lo} to ${b.hi}`);
    m.padBenchMove = { mean: b.stat, n: b.n, bootstrap: [b.lo, b.hi] };
  }
  console.log('  Repetition adds no argument, so anything above 0 here is the ballot paying for length.');
  m.padTookTop = { k, n: took.length, rate: ci.p, wilson: [ci.lo, ci.hi] };
} else {
  console.log('  not run');
}

console.log('\n─── AGREEMENT ' + '─'.repeat(54));
if (kappa) {
  console.log(`  Fleiss kappa across ${kappaConditions.length} unpadded reads: ${kappa.kappa} (${kappaBand(kappa.kappa)}), n=${kappa.n}`);
  console.log(`  observed agreement ${pct(kappa.observed)}, expected by chance ${pct(kappa.expected)}`);
  m.kappa = kappa;
} else {
  console.log('  not enough parsed runs');
}

const unparsed = results.reduce((s, r) => s + ['base', 'repeat', 'swap', 'pad'].filter((c) => r.verdicts && r.verdicts[c] === null).length, 0);
if (unparsed) console.log(`\n⚠ ${unparsed} verdicts failed to parse and were excluded. A parse failure is not a stable verdict; check the max_tokens warnings above before reading these rates.`);

console.log(`\nRead: ${rounds.length} rounds is a tripwire, not a certification. See the power block at the top.\n`);

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    ranAt: new Date().toISOString(),
    source: corpus ? 'consented_corpus' : 'external_fixtures',
    model: MODEL,
    temp: TEMP === '' ? 'default' : Number(TEMP),
    conditions: [...CONDITIONS],
    padEvery: PAD_EVERY,
    n: rounds.length,
    metrics: m,
    rows: results.map((r) => ({
      id: r.id,
      format: r.format,
      padSide: r.padSide,
      padFactor: r.padFactor,
      error: r.error || null,
      verdicts: Object.fromEntries(Object.entries(r.verdicts || {}).map(([k, v]) => [k, v ? v.key : null])),
    })),
  }, null, 2));
  console.log(`Wrote ${OUT}\n`);
}
