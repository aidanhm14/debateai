import { buildPrompt } from '../../../app/netlify/functions/live-judge.mjs';
import { runPanel } from '../../../app/netlify/functions/lib/judge-run.mjs';
import { callJuror } from '../../../app/netlify/functions/lib/judge-jurors.mjs';

export const AXES = ['clarity', 'reasoning', 'responsiveness', 'weighing', 'strategy', 'persuasion'];

export function validateCases(packet) {
  if (!Array.isArray(packet?.cases) || !packet.cases.length) throw new Error('No behavior cases');
  const ids = new Set();
  for (const c of packet.cases) {
    if (!c.id || ids.has(c.id)) throw new Error('Missing or duplicate case id');
    ids.add(c.id);
    if (!c.motion || !c.transcript?.length) throw new Error(`Missing evidence: ${c.id}`);
    const turns = new Set();
    for (const t of c.transcript) {
      if (!t.id || turns.has(t.id) || !t.text || !['Pro', 'Con', 'Moderator'].includes(t.speaker)) {
        throw new Error(`Invalid transcript turn: ${c.id}`);
      }
      turns.add(t.id);
    }
    if (!c.expected_behavior?.must?.length || !c.expected_behavior?.must_not?.length) {
      throw new Error(`Missing expectations: ${c.id}`);
    }
  }
  for (const c of packet.cases) {
    if (c.paired_with && !ids.has(c.paired_with)) throw new Error(`Missing paired case: ${c.id}`);
  }
  return packet.cases;
}

export function casePrompt(c, format = c.format) {
  if (!['quick', 'open'].includes(format)) throw new Error(`Unsupported format: ${format}`);
  // Keep the conversation interleaved. Labels and IDs are source references,
  // never expectations, hints about a winner, or human judging notes.
  const text = c.transcript.map(t => `[${t.id}] ${t.speaker}: ${t.text}`).join('\n');
  const speeches = format === 'open'
    ? [{ side: 'pro', code: 'TALK', open: true, name: 'Conversation', text }]
    : c.transcript.map(t => ({
      side: t.speaker === 'Moderator' ? '' : t.speaker.toLowerCase(),
      name: t.speaker, text: `[${t.id}] ${t.text}`,
    }));
  return buildPrompt({ format, motion: c.motion, proName: 'Pro', conName: 'Con', speeches });
}

export function inspectRaw(raw, parsed) {
  let source;
  try { source = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || ''); }
  catch { return { sourceJsonValid: false, sourceWinnerValid: false, dimensionsComplete: false }; }
  return {
    sourceJsonValid: true,
    sourceWinnerValid: ['pro', 'con'].includes(source.winner),
    sourceWinner: source.winner ?? null,
    sourceRfd: typeof source.rfd === 'string' ? source.rfd : null,
    reasoningTruncated: typeof source.rfd === 'string' && source.rfd !== parsed?.rfd,
    dimensionsComplete: AXES.every(axis => ['pro', 'con'].every(side => {
      const score = source.dimensions?.[axis]?.[side];
      return typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 10;
    })),
  };
}

export function reviewTemplate(c) {
  return ['must', 'must_not'].flatMap(kind => c.expected_behavior[kind].map((expectation, i) => ({
    id: `${kind}-${i + 1}`, kind, expectation, status: 'unreviewed',
    transcriptTurns: [], ballotEvidence: '', reviewer: '',
  })));
}

export async function evaluateCase(c, format, season, { dispatch = callJuror, timeoutMs = 90000, available, candidateRules = '' } = {}) {
  const prompt = casePrompt(c, format);
  if (candidateRules) prompt.system += '\n\n' + candidateRules;
  const captures = [];
  const capturedCall = async (juror, system, user, maxTokens, parse, timeout) => {
    let raw = null;
    const result = await dispatch(juror, system, user, maxTokens, text => {
      raw = text;
      return parse(text);
    }, timeout);
    captures.push({
      ...result, raw,
      observation: raw === null ? null : inspectRaw(raw, result.ballot),
      review: reviewTemplate(c),
    });
    return result;
  };
  try {
    const result = await runPanel(season, prompt.system, prompt.user, {
      aKey: 'pro', bKey: 'con', scoreScale: 100, jurorTimeoutMs: timeoutMs,
      // No extra paid fallback call. A failure is retained as a failure,
      // while the existing panel code still resolves any returned votes.
      allowRuntimeFallbackCall: false,
      ...(available ? { jurorAvailable: available } : {}),
      callJuror: capturedCall,
      callPanel: (jurors, ...args) => Promise.all(jurors.map(j => capturedCall(j, ...args))),
    });
    return {
      prompt, panel: result.panel, ballot: result.ballot, jurors: captures,
      complete: captures.length === season.panel.jurors.length && captures.every(j => j.ok),
      review: reviewTemplate(c),
    };
  } catch (error) {
    return { prompt, complete: false, error: String(error.message), jurors: captures, review: reviewTemplate(c) };
  }
}

export function summarize(rows) {
  const jurors = rows.flatMap(r => r.jurors || []);
  return {
    panels: rows.length,
    completePanels: rows.filter(r => r.complete).length,
    providerAttempts: jurors.length,
    providerFailures: jurors.filter(j => !j.ok).length,
    malformedSourceJson: jurors.filter(j => j.observation && !j.observation.sourceJsonValid).length,
    invalidSourceWinners: jurors.filter(j => j.observation?.sourceJsonValid && !j.observation.sourceWinnerValid).length,
    incompleteSourceDimensions: jurors.filter(j => j.observation?.sourceJsonValid && !j.observation.dimensionsComplete).length,
    shortenedExplanations: jurors.filter(j => j.observation?.reasoningTruncated).length,
    behaviorAccuracy: null,
    note: 'Behavior expectations require evidence-backed review; successful API calls are not behavior passes.',
  };
}
