// ─────────────────────────────────────────────────────────────
// Shared fixture loading + prompt assembly for the adjudication evals.
//
// This used to live inside run-adjudication-eval.mjs. It moved here when
// the stability harness needed to build the SAME prompt with one thing
// perturbed, for the same reason lib/judge-run.mjs exists in prod: two
// copies of "how a round is put in front of the judge" drift, and then
// the accuracy number and the stability number are measuring two
// different engines while claiming to measure one.
//
// The perturbations live here rather than in the harness so that the
// unperturbed path is literally the same code the accuracy eval runs.
//
// Both perturbations are content-preserving by construction:
//   • swap  — the two bench blocks change position. Labels travel with
//             their own text, so no relabelling is needed and nothing is
//             added or removed. Sides are named in the output (og/oo/cg/
//             co, prop/opp), so a stable judge returns the same call.
//   • pad   — one bench's lines are repeated verbatim behind a filler
//             lead-in. Repetition cannot add an argument, so any verdict
//             movement is length responding to itself.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdjudicationBlock } from '../../../app/netlify/functions/lib/adjudication.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLD_PATH = join(__dirname, '..', 'adjudication-gold.json');

export const BP_SIDES = ['og', 'oo', 'cg', 'co'];
export const TWO_SIDES = ['prop', 'opp'];

const FORMAT_ALIASES = new Map([
  ['bp', 'bp'],
  ['britishparliamentary', 'bp'],
  ['wudc', 'bp'],
  ['worlds', 'wsdc'],
  ['worldschools', 'wsdc'],
  ['worldschool', 'wsdc'],
  ['wsdc', 'wsdc'],
  ['asian', 'asian'],
  ['asianparli', 'asian'],
  ['asianparliamentary', 'asian'],
  ['ap', 'asian'],
  ['apda', 'apda'],
  ['npda', 'npda'],
  ['pf', 'pf'],
  ['publicforum', 'pf'],
  ['ld', 'ld'],
  ['lincolndouglas', 'ld'],
  ['policy', 'policy'],
  ['cx', 'policy'],
  ['congress', 'congress'],
  ['studentcongress', 'congress'],
  ['kp', 'karl-popper'],
  ['karlpopper', 'karl-popper'],
  ['mun', 'mun'],
]);

export function normalizeFormat(raw) {
  const compact = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return FORMAT_ALIASES.get(compact) || compact;
}

export function loadGold() {
  return JSON.parse(readFileSync(GOLD_PATH, 'utf8'));
}

export function resolveFixturesDir(gold) {
  const candidates = [process.env.ADJ_FIXTURES, gold.fixturesDirDefault, gold.fixturesDirLegacy].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || candidates[0] || '';
}

export function selectRounds(gold, { format = '', only = '', limit = 0 } = {}) {
  let rounds = gold.rounds.filter((r) => !format || normalizeFormat(r.format) === format);
  if (only) rounds = rounds.filter((r) => r.id === only);
  if (limit) rounds = rounds.slice(0, limit);
  return rounds;
}

// ── decontaminate a flow note: strip the judge's inline verdict marks so
// the AI cannot read the answer off the page. Best-effort. ──
const VERDICT_LINE_RE = new RegExp(
  '(default to |fourths|loses to |wins because|non[- ]?responsive|\\bNR to\\b|knifes|uncomparative|missing burden|burden:|weighing on certainty|this concedes|isn.?t this squo|what.?s the delta|d/dx|\\bcall\\b|final calls?)',
  'i'
);

export function decontaminate(raw) {
  return raw
    .split('\n')
    .map((line) => {
      let l = line;
      l = l.replace(/\*\*[^*]*\*\*/g, ''); // bold spans = judge interjections
      l = l.replace(/\((?:why+\??|really|d\/dx|knife|unstrategic|same as [a-z]+|nr[^)]*|\?+)\)/gi, '');
      l = l.replace(/\?{2,}/g, '').replace(/\*{2,}/g, '');
      return l;
    })
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (/^scores?\s+for\b/i.test(t)) return false;
      if (/^(\d{1,3}\s*,\s*)+\d{1,3}\s*$/i.test(t)) return false;
      if (/^[A-Z][A-Z \t!?.'-]{8,}$/.test(t)) return false;
      if (/^(?:og|oo|cg|co|prop|opp)(?:\s*>\s*(?:og|oo|cg|co|prop|opp)){1,3}$/i.test(t)) return false;
      if (VERDICT_LINE_RE.test(t) && t.replace(/[*>\- ]/g, '').length < 90) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── padding ─────────────────────────────────────────────────
// Verbatim repetition behind a content-free lead-in. Nothing new is
// asserted, so a verdict that moves under this moved on length.
//
// Fixed lead-ins cycled by index, never sampled, so the padded prompt is
// byte-identical on every run and a flip cannot be the padding text
// having changed underneath the comparison.
const PAD_LEADS = [
  'To restate the point already made: ',
  'Again, on that same point: ',
  'It bears repeating: ',
  'Put another way, and it is the same point: ',
];

/**
 * Repeat every `every`-th non-empty line. Default 2 lands around 1.5x
 * length, which is the ballpark of the verbosity gap the judge would see
 * between a terse and a padded speaker without becoming a different
 * document.
 */
export function padFlow(text, { every = 2 } = {}) {
  let hit = 0;
  const out = [];
  for (const line of String(text || '').split('\n')) {
    out.push(line);
    if (!line.trim()) continue;
    hit++;
    if (hit % every === 0) {
      const lead = PAD_LEADS[(hit / every - 1) % PAD_LEADS.length];
      out.push(lead + line.trim());
    }
  }
  return out.join('\n');
}

/** Growth factor a padding actually achieved, reported with every run. */
export function padRatio(before, after) {
  const a = String(before || '').length;
  return a ? Math.round((String(after || '').length / a) * 100) / 100 : null;
}

// ── fixture reading ─────────────────────────────────────────
export function makeReader(fixturesDir) {
  function readFixture(r, key) {
    const file = r[key];
    if (!file) return '';
    return decontaminate(readFileSync(join(fixturesDir, r.folder, file), 'utf8'));
  }

  function readFirstFixture(r, keys) {
    for (const key of keys) {
      if (r[key]) return readFixture(r, key);
    }
    return '';
  }

  function loadHumanNotes(r) {
    const noteKeys = [
      ['oaFile', 'ORAL ADJUDICATION / OA NOTES'],
      ['delibFile', 'DELIBERATION NOTES'],
      ['ballotFile', 'BALLOT NOTES'],
      ['judgeFile', 'JUDGE NOTES'],
    ];
    return noteKeys
      .filter(([key]) => r[key])
      .map(([key, label]) => '--- ' + label + ' ---\n' + readFixture(r, key))
      .join('\n\n');
  }

  /**
   * The two side blocks plus the notes, before composition. Splitting
   * read from render is what makes swap and pad possible without a
   * second copy of the loader.
   *
   * `includeNotes` exists because the multi-lab benchmark feeds flows
   * only: a human adjudication note, even decontaminated, is an echo of
   * the call.
   */
  function loadBlocks(r, { includeNotes = true } = {}) {
    const format = normalizeFormat(r.format);
    const notes = includeNotes ? loadHumanNotes(r) : '';
    if (format === 'bp') {
      return {
        format,
        notes,
        first: { key: 'gov', label: '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===', text: readFixture(r, 'govFile'), teams: ['og', 'cg'] },
        second: { key: 'opp', label: '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===', text: readFixture(r, 'oppFile'), teams: ['oo', 'co'] },
      };
    }
    const propLabel = format === 'wsdc' ? '=== PROPOSITION FLOW ===' : '=== PRO / AFF FLOW ===';
    const oppLabel = format === 'wsdc' ? '=== OPPOSITION FLOW ===' : '=== OPP / NEG FLOW ===';
    return {
      format,
      notes,
      first: { key: 'prop', label: propLabel, text: readFirstFixture(r, ['propFile', 'govFile', 'affFile', 'proFile']), teams: ['prop'] },
      second: { key: 'opp', label: oppLabel, text: readFirstFixture(r, ['oppFile', 'negFile', 'conFile']), teams: ['opp'] },
    };
  }

  /**
   * Compose blocks into the transcript the judge sees.
   *
   * The two branches below reproduce the original loadRound byte for
   * byte at default options (BP filters empty strings, the others do
   * not, including the trailing empty line when a round has no notes).
   * scripts/test-stability.mjs pins that against a fixture so a tidy-up
   * cannot silently move the accuracy baseline.
   */
  function renderRound(r, blocks, { swap = false, pad = null } = {}) {
    const order = swap ? [blocks.second, blocks.first] : [blocks.first, blocks.second];
    const body = order.map((b) => ({
      label: b.label,
      text: pad && pad.side === b.key ? padFlow(b.text, pad) : b.text,
    }));
    const notesBlock = blocks.notes
      ? '\n=== HUMAN ADJUDICATION NOTES, DECONTAMINATED AND NON-AUTHORITATIVE ===\n' + blocks.notes
      : '';

    if (blocks.format === 'bp') {
      return [
        'MOTION: ' + r.motion,
        '',
        body[0].label,
        body[0].text,
        '',
        body[1].label,
        body[1].text,
        notesBlock,
      ].filter(Boolean).join('\n');
    }
    return [
      'MOTION: ' + r.motion,
      '',
      body[0].label,
      body[0].text,
      '',
      body[1].label,
      body[1].text,
      notesBlock,
    ].join('\n');
  }

  /** The original entry point: default order, no padding. */
  function loadRound(r, opts = {}) {
    return renderRound(r, loadBlocks(r, opts), opts);
  }

  return { readFixture, readFirstFixture, loadHumanNotes, loadBlocks, renderRound, loadRound };
}

// ── prompt assembly ─────────────────────────────────────────
export function formatPromptLine(format) {
  const lines = {
    wsdc: 'You are adjudicating this World Schools round from terse judge flow notes. Decide the winner by WSDC content/style/strategy discipline, with special attention to third-speaker and reply weighing.',
    asian: 'You are adjudicating this Asian Parliamentary round from terse judge flow notes. Decide the winner by definitions, model, team line, engagement, POIs where extended, and whip weighing.',
    apda: 'You are adjudicating this APDA round from terse judge flow notes. Decide the winner on general-knowledge parliamentary norms, tight-case fairness, PMR/LOR new-matter discipline, and comparative weighing.',
    npda: 'You are adjudicating this NPDA round from terse judge flow notes. Decide the winner on the flow, including theory, topicality, kritiks, counterplans, and weighing only when those positions are actually run.',
    pf: 'You are adjudicating this Public Forum round from terse judge flow notes. Decide the winner by evidence quality, frontlining, Summary/Final Focus consistency, and comparative weighing.',
    ld: 'You are adjudicating this Lincoln-Douglas round from terse judge flow notes. Resolve value, criterion, role of the ballot, theory, or policy-style layers before contentions when they are live.',
    policy: 'You are adjudicating this Policy / CX round from terse judge flow notes. Decide the flow across case, disads, counterplans, topicality, theory, kritiks, evidence comparison, and impact calculus.',
    congress: 'You are adjudicating this Student Congress item from terse judge flow notes. Decide the strongest side or speaker ranking by original analysis, refutation, questioning, crystallization, and chamber awareness.',
    'karl-popper': 'You are adjudicating this Karl Popper round from terse judge flow notes. Decide the winner by burden, criterion, cross-ex concessions, refutation, and final focus on the central issue.',
    mun: 'You are adjudicating this MUN or diplomacy exercise from terse notes. Decide who most persuasively moved committee action through feasibility, coalition-building, procedure, and resolution text.',
  };
  return lines[format] || 'You are adjudicating this two-sided flow round from terse judge notes. Decide the winner on the flow.';
}

export function buildPrompt(r, transcript) {
  const format = normalizeFormat(r.format);
  const core = buildAdjudicationBlock({ format });
  const notePosture = '\nIf human adjudication notes appear below, treat them as non-authoritative evidence. They may contain useful reasoning, split-panel confusion, or a bad call. Decide independently from the flow.';

  if (format === 'bp') {
    const instruction =
      core +
      '\n\nYou are chairing this British Parliamentary round. The text below is a JUDGE FLOW of what each bench argued (terse notes, both halves of each bench). Decide the round by the half-call and ORDER ALL FOUR TEAMS 1-2-3-4.\n\n' +
      notePosture + '\n\n' +
      'Return ONLY a single JSON object, no prose before or after:\n' +
      '{"order":["<1st>","<2nd>","<3rd>","<4th>"],"oneLine":"<one sentence naming the deciding clash and why 1st beat 2nd>"}\n' +
      'Each element is one of: og, oo, cg, co (each exactly once).';
    return { system: instruction, user: transcript };
  }

  const instruction =
    core +
    '\n\n' + formatPromptLine(format) + '\n\n' +
    notePosture + '\n\n' +
    'Return ONLY a single JSON object, no prose before or after:\n' +
    '{"winner":"prop"|"opp","oneLine":"<one sentence naming the deciding issue and why the winner won>"}';
  return { system: instruction, user: transcript };
}

// ── parsing ─────────────────────────────────────────────────
export function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function parseBpOrder(text) {
  const obj = parseJson(text);
  const order = obj && Array.isArray(obj.order) ? obj.order.map((s) => String(s).toLowerCase().trim()) : null;
  if (!order || order.length !== 4) return null;
  if (new Set(order).size !== 4 || order.some((s) => !BP_SIDES.includes(s))) return null;
  return order;
}

export function parseWinner(text) {
  const obj = parseJson(text);
  const w = obj && obj.winner ? String(obj.winner).toLowerCase().trim() : '';
  return TWO_SIDES.includes(w) ? w : null;
}

export function rankMap(order) {
  const m = {};
  (order || []).forEach((side, i) => { m[side] = i + 1; });
  return m;
}

/** Fraction of the 6 team-pairs two orderings agree on. */
export function pairwiseAgreement(a, b) {
  if (!a || !b) return 0;
  const ra = rankMap(a);
  const rb = rankMap(b);
  let agree = 0;
  let total = 0;
  for (let i = 0; i < BP_SIDES.length; i++) {
    for (let j = i + 1; j < BP_SIDES.length; j++) {
      const x = BP_SIDES[i];
      const y = BP_SIDES[j];
      if (ra[x] == null || ra[y] == null || rb[x] == null || rb[y] == null) continue;
      total++;
      if ((ra[x] < ra[y]) === (rb[x] < rb[y])) agree++;
    }
  }
  return total ? agree / total : 0;
}

export function promptTokens(prompt) {
  return Math.round(prompt.system.length / 4) + Math.round(prompt.user.length / 4);
}
