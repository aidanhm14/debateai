#!/usr/bin/env node
// Upload adjudication JSONL and create an OpenAI supervised fine-tuning job.
//
// This script never prints the API key. It expects generated JSONL files from:
//   node scripts/eval/build-adjudication-finetune.mjs

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

const TRAIN = opt('train', '');
const VALID = opt('valid', '');
const MODEL = opt('model', process.env.ADJ_OPENAI_FT_MODEL || 'gpt-4.1-nano-2025-04-14');
const SUFFIX = opt('suffix', 'debateit-judge');
const EPOCHS = opt('epochs', 'auto');
const DRY_RUN = flag('dry-run');
const API_KEY = process.env.OPENAI_API_KEY || '';

function usage(exitCode = 0) {
  console.log(`Usage:
  OPENAI_API_KEY=... node scripts/eval/submit-openai-finetune.mjs \\
    --train=/tmp/debateit-adjudication-finetune/adjudication-train.jsonl \\
    --valid=/tmp/debateit-adjudication-finetune/adjudication-valid.jsonl \\
    --model=gpt-4.1-nano-2025-04-14

Options:
  --dry-run          Print the planned request, do not upload or create a job.
  --suffix=name      Fine-tune suffix. Default: debateit-judge.
  --epochs=auto|N    Supervised fine-tuning epochs. Default: auto.`);
  process.exit(exitCode);
}

if (flag('help') || flag('h')) usage(0);

function assertReadable(path, label) {
  if (!path) throw new Error(`Missing --${label}=path`);
  if (!existsSync(path)) throw new Error(`${label} file does not exist: ${path}`);
  const st = statSync(path);
  if (!st.isFile() || st.size <= 0) throw new Error(`${label} file is empty or not a file: ${path}`);
  return st;
}

function validateJsonl(path, label) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 1) throw new Error(`${label} JSONL has no examples`);
  for (let i = 0; i < lines.length; i++) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (err) {
      throw new Error(`${label} line ${i + 1} is not valid JSON: ${err.message}`);
    }
    if (!Array.isArray(parsed.messages) || parsed.messages.length < 3) {
      throw new Error(`${label} line ${i + 1} is missing chat-format messages`);
    }
    const last = parsed.messages[parsed.messages.length - 1];
    if (!last || last.role !== 'assistant' || typeof last.content !== 'string') {
      throw new Error(`${label} line ${i + 1} must end with an assistant message`);
    }
    try {
      JSON.parse(last.content);
    } catch {
      throw new Error(`${label} line ${i + 1} assistant content is not JSON`);
    }
  }
  return lines.length;
}

async function openaiFetch(path, opts = {}) {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.raw || text || `${res.status} ${res.statusText}`;
    throw new Error(`OpenAI ${res.status}: ${msg}`);
  }
  return data;
}

async function uploadFile(path) {
  const form = new FormData();
  const bytes = readFileSync(path);
  form.append('purpose', 'fine-tune');
  form.append('file', new Blob([bytes], { type: 'application/jsonl' }), basename(path));
  return openaiFetch('/files', { method: 'POST', body: form });
}

function buildJobPayload(trainingFileId, validationFileId) {
  const payload = {
    model: MODEL,
    training_file: trainingFileId,
    suffix: SUFFIX,
    method: {
      type: 'supervised',
    },
    metadata: {
      app: 'debateit',
      task: 'adjudication',
      dataset: 'local-judging-fixtures',
    },
  };
  if (validationFileId) payload.validation_file = validationFileId;
  if (EPOCHS !== 'auto') {
    const n = Number(EPOCHS);
    if (!Number.isInteger(n) || n < 1) throw new Error('--epochs must be auto or a positive integer');
    payload.method.supervised = { hyperparameters: { n_epochs: n } };
  }
  return payload;
}

try {
  const trainStat = assertReadable(TRAIN, 'train');
  const trainLines = validateJsonl(TRAIN, 'train');
  let validLines = 0;
  let validStat = null;
  if (VALID) {
    validStat = assertReadable(VALID, 'valid');
    validLines = validateJsonl(VALID, 'valid');
  }

  const planned = {
    model: MODEL,
    suffix: SUFFIX,
    method: 'supervised',
    train: { path: TRAIN, examples: trainLines, bytes: trainStat.size },
    validation: VALID ? { path: VALID, examples: validLines, bytes: validStat.size } : null,
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, planned }, null, 2));
    process.exit(0);
  }

  if (!API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Export it in this shell before submitting the fine-tune.');
  }

  console.log(`Uploading train file: ${TRAIN} (${trainLines} examples)`);
  const trainUpload = await uploadFile(TRAIN);
  console.log(`train file id: ${trainUpload.id}`);

  let validUpload = null;
  if (VALID) {
    console.log(`Uploading validation file: ${VALID} (${validLines} examples)`);
    validUpload = await uploadFile(VALID);
    console.log(`validation file id: ${validUpload.id}`);
  }

  const payload = buildJobPayload(trainUpload.id, validUpload?.id || null);
  console.log(`Creating fine-tuning job on ${MODEL}`);
  const job = await openaiFetch('/fine_tuning/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log(JSON.stringify({
    ok: true,
    jobId: job.id,
    status: job.status,
    model: job.model,
    fineTunedModel: job.fine_tuned_model || null,
    trainingFile: trainUpload.id,
    validationFile: validUpload?.id || null,
  }, null, 2));
} catch (err) {
  console.error(err.message);
  if (/fine-tuning platform|not accessible|does not have access|model/i.test(err.message)) {
    console.error('The dataset is still usable. This usually means the OpenAI org lacks fine-tuning access for the requested model, or the fine-tuning platform is unavailable for the account.');
  }
  process.exit(1);
}
