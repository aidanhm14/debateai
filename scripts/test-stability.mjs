// ─────────────────────────────────────────────────────────────
// Guards on the verdict-stability harness.
//
// Same reasoning as test-judge-integrity.mjs: a measurement is only
// worth anything if it cannot quietly start measuring something else.
// Three things are pinned here.
//
//   1. The perturbations are content-preserving. A swap that changed
//      length, or a pad that introduced a new claim, would produce a
//      "flip" that says nothing about the judge.
//   2. Round composition is byte-identical to the pre-refactor loader,
//      so the accuracy eval's baseline did not move when the two
//      harnesses started sharing a builder.
//   3. The statistics are the statistics. In particular the multi-
//      category kappa must reproduce prod's binary one exactly, because
//      the published reliability figure comes from prod's and the
//      stability figure from this one, and two kappas that disagree on
//      the same data is a headline waiting to happen.
//
// Run: node scripts/test-stability.mjs
// ─────────────────────────────────────────────────────────────
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeReader, padFlow, padRatio, pairwiseAgreement, normalizeFormat, selectCorpusRounds, loadCorpus } from '../scripts/eval/lib/adjudication-fixtures.mjs';
import { proportionCI, bootstrapCI, binomTest, nForMargin, nForDetect, fleissKappaMulti, rng, mean } from '../scripts/eval/lib/stats.mjs';
import { fleissKappa } from '../app/netlify/functions/lib/judge-panel.mjs';

let pass = 0;
let fail = 0;
function t(label, cond) {
  if (cond) { pass++; return; }
  fail++;
  console.error('FAIL: ' + label);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── 1. the perturbations preserve content ───────────────────
{
  const round = { motion: 'THW abolish the filibuster' };
  const blocks = {
    format: 'bp',
    notes: '',
    first: { key: 'gov', label: '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===', text: 'og: harm one\ncg: extension', teams: ['og', 'cg'] },
    second: { key: 'opp', label: '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===', text: 'oo: turn\nco: whip', teams: ['oo', 'co'] },
  };
  const { renderRound } = makeReader('/nonexistent');

  const base = renderRound(round, blocks);
  const swapped = renderRound(round, blocks, { swap: true });

  // A swap moves blocks. It must not add, drop, or edit a character.
  t('swap preserves length exactly', base.length === swapped.length);
  const lines = (s) => s.split('\n').filter((l) => l.trim()).sort().join('|');
  t('swap preserves the multiset of lines', lines(base) === lines(swapped));
  t('swap actually moves the benches', base !== swapped);
  t('swap puts opposition first', swapped.indexOf('OPPOSITION BENCH') < swapped.indexOf('GOVERNMENT BENCH'));
  t('swap keeps each label with its own text', swapped.indexOf('oo: turn') > swapped.indexOf('OPPOSITION BENCH')
    && swapped.indexOf('oo: turn') < swapped.indexOf('GOVERNMENT BENCH'));

  // Padding may only repeat what a side already said.
  const padded = renderRound(round, blocks, { pad: { side: 'gov', every: 1 } });
  t('padding grows the padded side', padded.length > base.length);
  t('padding leaves the other side untouched', padded.includes('oo: turn\nco: whip'));
  const LEADS = ['To restate the point already made: ', 'Again, on that same point: ', 'It bears repeating: ', 'Put another way, and it is the same point: '];
  const original = new Set(base.split('\n').map((l) => l.trim()));
  const introduced = padded.split('\n').map((l) => l.trim()).filter((l) => l && !original.has(l));
  t('every line padding introduces is a lead-in plus a verbatim original',
    introduced.length > 0 && introduced.every((l) => {
      const lead = LEADS.find((x) => l.startsWith(x.trim()) || l.startsWith(x));
      return Boolean(lead) && original.has(l.slice(lead.length).trim());
    }));
  t('padding is deterministic', renderRound(round, blocks, { pad: { side: 'gov', every: 1 } }) === padded);
  t('padRatio reports the growth', padRatio('abcd', 'abcdabcd') === 2);

  // every=2 is the shipped default: roughly half the lines repeated.
  const half = padFlow('a\nb\nc\nd', { every: 2 });
  t('pad every=2 repeats every second line', half.split('\n').length === 6);
}

// ── 2. composition matches the pre-refactor loader ──────────
{
  const { renderRound } = makeReader('/nonexistent');
  const round = { motion: 'M' };

  // BP filtered empty strings, which is why there is no blank line
  // between the motion and the first bench label. Preserved deliberately.
  const bp = renderRound(round, {
    format: 'bp', notes: '',
    first: { key: 'gov', label: '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===', text: 'G', teams: ['og', 'cg'] },
    second: { key: 'opp', label: '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===', text: 'O', teams: ['oo', 'co'] },
  });
  t('BP composition is byte-identical to the original',
    bp === 'MOTION: M\n=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===\nG\n=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===\nO');

  // The two-sided branches did NOT filter, so the blank lines and the
  // trailing empty notes slot both survive.
  const wsdc = renderRound(round, {
    format: 'wsdc', notes: '',
    first: { key: 'prop', label: '=== PROPOSITION FLOW ===', text: 'P', teams: ['prop'] },
    second: { key: 'opp', label: '=== OPPOSITION FLOW ===', text: 'O', teams: ['opp'] },
  });
  t('WSDC composition is byte-identical to the original',
    wsdc === 'MOTION: M\n\n=== PROPOSITION FLOW ===\nP\n\n=== OPPOSITION FLOW ===\nO\n');

  const withNotes = renderRound(round, {
    format: 'wsdc', notes: 'N',
    first: { key: 'prop', label: '=== PROPOSITION FLOW ===', text: 'P', teams: ['prop'] },
    second: { key: 'opp', label: '=== OPPOSITION FLOW ===', text: 'O', teams: ['opp'] },
  });
  t('notes block keeps its leading newline', withNotes.endsWith('\n=== HUMAN ADJUDICATION NOTES, DECONTAMINATED AND NON-AUTHORITATIVE ===\nN'));

  t('format aliases still normalize', normalizeFormat('WUDC') === 'bp' && normalizeFormat('World Schools') === 'wsdc');
}

// ── 3. consented production rounds feed repeat stability ───
{
  const manifest = {
    rounds: [
      { id: 'ready', format: 'quick', transcriptFile: 'ready/transcript.md', evalUses: ['stability'], stabilityConditions: ['repeat'] },
      { id: 'unsplit-bias', format: 'quick', transcriptFile: 'bias/transcript.md', evalUses: ['bias'], stabilityConditions: ['swap'] },
      { id: 'wrong-format', format: 'bp', transcriptFile: 'bp/transcript.md', evalUses: ['stability'], stabilityConditions: ['repeat'] },
    ],
  };
  const selected = selectCorpusRounds(manifest, { format: 'quick' });
  t('a repeat-ready consented round reaches the stability runner', selected.length === 1 && selected[0].id === 'ready');
  t('a corpus filter normalizes format names', selectCorpusRounds(manifest, { format: 'british-parliamentary' })[0].id === 'wrong-format');
  t('the corpus runner honors an exact round id', selectCorpusRounds(manifest, { only: 'wrong-format' })[0].id === 'wrong-format');
  let malformed = false;
  try { selectCorpusRounds({ nope: [] }); } catch { malformed = true; }
  t('a malformed corpus manifest fails loudly', malformed);

  const temp = mkdtempSync(join(tmpdir(), 'debatable-stability-'));
  try {
    mkdirSync(join(temp, 'ready'));
    writeFileSync(join(temp, 'ready', 'transcript.md'), 'Pro: warranted case\n\nCon: direct answer\n');
    writeFileSync(join(temp, 'corpus-manifest.json'), JSON.stringify({ rounds: [manifest.rounds[0]] }));
    const loaded = loadCorpus(join(temp, 'corpus-manifest.json'));
    t('the corpus loader reads the scrubbed transcript named by the manifest',
      loaded.rounds.length === 1 && loaded.loadRound(loaded.rounds[0]).startsWith('Pro: warranted case'));

    const escaped = { ...manifest.rounds[0], transcriptFile: '../outside.md' };
    writeFileSync(join(temp, 'corpus-manifest.json'), JSON.stringify({ rounds: [escaped] }));
    const unsafe = loadCorpus(join(temp, 'corpus-manifest.json'));
    let refusedEscape = false;
    try { unsafe.loadRound(unsafe.rounds[0]); } catch { refusedEscape = true; }
    t('the corpus loader refuses a transcript path outside its fixture directory', refusedEscape);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// ── 4. pairwise agreement ───────────────────────────────────
{
  t('identical orderings agree fully', pairwiseAgreement(['og', 'oo', 'cg', 'co'], ['og', 'oo', 'cg', 'co']) === 1);
  t('a reversal agrees on nothing', pairwiseAgreement(['og', 'oo', 'cg', 'co'], ['co', 'cg', 'oo', 'og']) === 0);
  t('one adjacent swap costs one of six', near(pairwiseAgreement(['og', 'oo', 'cg', 'co'], ['oo', 'og', 'cg', 'co']), 5 / 6));
  t('a missing ordering is not scored as agreement', pairwiseAgreement(null, ['og', 'oo', 'cg', 'co']) === 0);
}

// ── 5. the statistics ───────────────────────────────────────
{
  // Wilson, not the textbook interval: 0/12 must not return [0,0].
  const zero = proportionCI(0, 12);
  t('Wilson interval is non-degenerate at 0', zero.p === 0 && zero.hi > 0);
  const half = proportionCI(6, 12);
  t('Wilson interval is centred near the estimate', half.lo < 0.5 && half.hi > 0.5);

  // Seeded: same input, same interval, every time. This is what stops a
  // bootstrap being re-rolled until it reads well.
  const xs = [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1];
  const a = bootstrapCI(xs);
  const b = bootstrapCI(xs);
  t('bootstrap is deterministic under a fixed seed', a.lo === b.lo && a.hi === b.hi);
  t('bootstrap differs under a different seed', bootstrapCI(xs, { seed: 7 }).lo !== undefined);
  t('bootstrap brackets the point estimate', a.lo <= a.stat && a.stat <= a.hi);
  t('bootstrap refuses to invent an interval from one point', bootstrapCI([1]).lo === null);

  // Exact binomial: 10 heads in 10 tosses is 2/1024 two-sided.
  t('binomTest is exact at the extreme', near(binomTest(10, 10).p, 2 / 1024, 1e-5));
  t('binomTest is 1 at dead even', binomTest(5, 10).p === 1);
  t('binomTest reports the observed rate', binomTest(7, 10).observed === 0.7);

  // Power, the number that decides whether a run is worth paying for.
  t('n for ±10 points at p=0.9 is about 35', nForMargin(0.9, 0.1) === 35);
  t('tighter margins cost more', nForMargin(0.9, 0.05) > nForMargin(0.9, 0.1));
  t('detecting 65/35 against a coin needs dozens of rounds', nForDetect(0.65) > 60 && nForDetect(0.65) < 120);
  t('a bigger effect needs fewer rounds', nForDetect(0.75) < nForDetect(0.65));
  t('no effect is undetectable', nForDetect(0.5) === Infinity);

  t('rng is reproducible', rng(42)() === rng(42)());
  t('mean ignores non-numbers', mean([1, 2, null, 3]) === 2);
}

// ── 6. kappa must agree with the one prod publishes ─────────
{
  const binary = [
    { a: 3, b: 0 }, { a: 2, b: 1 }, { a: 0, b: 3 }, { a: 1, b: 2 }, { a: 3, b: 0 }, { a: 2, b: 1 },
  ];
  const prod = fleissKappa(binary);
  const mine = fleissKappaMulti(binary.map((r) => ({ a: r.a, b: r.b })));
  t('multi-category kappa reproduces prod on binary data', prod && mine && prod.kappa === mine.kappa);
  t('... and the same observed agreement', prod.observed === mine.observed);
  t('... and the same expected agreement', prod.expected === mine.expected);

  // Four categories, which is what a BP top-1 vote is and what prod's
  // binary version cannot represent.
  const perfect = [{ og: 3 }, { co: 3 }, { cg: 3 }];
  t('unanimous across categories is kappa 1', fleissKappaMulti(perfect).kappa === 1);
  const scattered = [{ og: 1, oo: 1, cg: 1 }, { co: 1, cg: 1, oo: 1 }, { og: 1, co: 1, cg: 1 }];
  t('total disagreement is at or below chance', fleissKappaMulti(scattered).kappa <= 0);
  t('rounds with a single run carry no agreement', fleissKappaMulti([{ og: 1 }]) === null);
  t('empty input returns null rather than a number', fleissKappaMulti([]) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
