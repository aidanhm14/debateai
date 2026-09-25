import { callJuror, SUPPORTED_PROVIDERS } from '../../../app/netlify/functions/lib/judge-jurors.mjs';
import { makeBallotParser } from '../../../app/netlify/functions/lib/judge-run.mjs';
import { casePrompt, inspectRaw, reviewTemplate } from './conversation-behavior.mjs';

export function validateJurors(jurors) {
  if (!Array.isArray(jurors) || jurors.length < 1 || jurors.length > 4) throw new Error('Select 1..4 comparison jurors');
  const ids = new Set();
  for (const j of jurors) {
    if (!j.id || ids.has(j.id) || !SUPPORTED_PROVIDERS.includes(j.provider) || !j.model) throw new Error('Invalid or duplicate comparison juror');
    if (j.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(j.effort)) throw new Error('Unsupported effort');
    ids.add(j.id);
  }
  return jurors;
}

// Evaluate seats independently: this is a comparison, not an alternative
// panel with relaxed quorum. Dispatch and parsing are production code.
export async function evaluateJuror(c, format, juror, { dispatch = callJuror, maxTokens = 8000, timeoutMs = 90000 } = {}) {
  const prompt = casePrompt(c, format);
  let raw = null;
  const parse = makeBallotParser('pro', 'con', 100);
  const result = await dispatch(juror, prompt.system, prompt.user, maxTokens, text => {
    raw = text;
    return parse(text);
  }, timeoutMs);
  return { ...result, raw, observation: raw === null ? null : inspectRaw(raw, result.ballot), review: reviewTemplate(c) };
}
