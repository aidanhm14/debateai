// Wire 4 of the self-recurring feedback loop: weekly distillation.
//
// Reads the past 7 days of high-signal generations + decisive debate
// rounds and asks Claude to extract concrete patterns — recurring
// strong moves, recurring failure modes, format-specific tics. Writes
// a draft patch to voice_drafts/{id} for human review. Aidan applies
// the patch by hand to voice-guidelines.mjs (the source of truth the
// model already reads on every call), so the loop closes on the same
// artifact instead of inventing a new one.
//
// Also runs the offline pairwise-eval pass: reads generation_pairs
// rows where winner is null, samples a small batch (cost-bounded), and
// asks Haiku to pick a winner per pair. Verdicts go back as
// generation_pairs/{id}.winner with source='judge'.
//
// Scheduled by netlify.toml — see the [[functions]] schedule below.
// First invocation will return errors for any missing composite
// indexes; the Firestore console exposes one-click "create" links in
// the failure log.

import { getDb, FieldValue } from './lib/firestore.mjs';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL_DISTILL = 'claude-sonnet-4-6';
const MODEL_PAIR_JUDGE = 'claude-haiku-4-5-20251001';
const MAX_GENERATIONS = 80;     // sample size for the distillation prompt
const MAX_LOSING_SPEECHES = 30; // budget for losing-speech analysis
const MAX_PAIRS_TO_JUDGE = 20;  // pairs evaluated per cron tick
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo() {
  return new Date(Date.now() - SEVEN_DAYS_MS);
}

async function callClaude({ model, system, user, maxTokens = 4000 }) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: system || '',
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const block = (data.content || []).find(c => c.type === 'text');
  return (block && block.text) || '';
}

// ── Stage 1: gather samples ───────────────────────────────────────
async function gatherSamples(db) {
  const since = sevenDaysAgo();

  // High-signal generations
  let highGens = [];
  try {
    const snap = await db.collection('generations')
      .where('createdAt', '>=', since)
      .where('rating', '>=', 4)
      .orderBy('rating', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(MAX_GENERATIONS)
      .get();
    snap.forEach(d => {
      const x = d.data() || {};
      if (!x.output) return;
      highGens.push({
        kind: x.kind, motion: x.motion, format: x.format, side: x.side,
        rating: x.rating, saved: !!x.saved, output: String(x.output).slice(0, 1800),
      });
    });
  } catch (err) {
    console.warn('[distill-voice] high-gen query failed:', err.message);
  }

  // Saved-but-unrated generations as a secondary positive signal.
  let savedGens = [];
  try {
    const snap = await db.collection('generations')
      .where('createdAt', '>=', since)
      .where('saved', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(MAX_GENERATIONS)
      .get();
    snap.forEach(d => {
      const x = d.data() || {};
      if (!x.output) return;
      savedGens.push({
        kind: x.kind, motion: x.motion, format: x.format, side: x.side,
        rating: x.rating, saved: true, output: String(x.output).slice(0, 1800),
      });
    });
  } catch (err) {
    console.warn('[distill-voice] saved-gen query failed:', err.message);
  }

  // Losing speeches from completed debates.
  let losingSpeeches = [];
  try {
    const snap = await db.collection('debate_speeches')
      .where('createdAt', '>=', since)
      .where('won', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(MAX_LOSING_SPEECHES)
      .get();
    snap.forEach(d => {
      const x = d.data() || {};
      if (!x.text) return;
      losingSpeeches.push({
        code: x.code, motion: x.motion, format: x.format, side: x.speechSide,
        text: String(x.text).slice(0, 1500),
      });
    });
  } catch (err) {
    console.warn('[distill-voice] losing-speech query failed:', err.message);
  }

  // Winning speeches as a balance — distillation needs both poles.
  let winningSpeeches = [];
  try {
    const snap = await db.collection('debate_speeches')
      .where('createdAt', '>=', since)
      .where('won', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(MAX_LOSING_SPEECHES)
      .get();
    snap.forEach(d => {
      const x = d.data() || {};
      if (!x.text) return;
      winningSpeeches.push({
        code: x.code, motion: x.motion, format: x.format, side: x.speechSide,
        text: String(x.text).slice(0, 1500),
      });
    });
  } catch (err) {
    console.warn('[distill-voice] winning-speech query failed:', err.message);
  }

  return { highGens, savedGens, losingSpeeches, winningSpeeches };
}

// ── Stage 2: distillation prompt ──────────────────────────────────
function buildDistillPrompt(samples) {
  const block = (label, items) => {
    if (!items.length) return label + ': (none)\n\n';
    return label + ' (showing ' + items.length + '):\n\n' + items.map((s, i) => {
      const head = `[${label.split(' ')[0]} ${i + 1}] motion: "${(s.motion || '').slice(0, 160)}" | kind/code: ${s.kind || s.code || '?'} | format: ${s.format || '?'} | side: ${s.side || '?'}`;
      const body = (s.output || s.text || '').slice(0, 1200);
      return head + '\n' + body;
    }).join('\n\n---\n\n') + '\n\n';
  };

  const user = [
    'You are auditing one week of Debate AI generations and live-debate speeches to extract concrete style patterns.',
    'Inputs (anonymized):',
    '',
    block('HIGH-SIGNAL CASES (rated 4-5 stars or saved)', samples.highGens.slice(0, 30)),
    block('SAVED CASES (kept by users)', samples.savedGens.slice(0, 10)),
    block('WINNING DEBATE SPEECHES (panel ruled this side won)', samples.winningSpeeches.slice(0, 12)),
    block('LOSING DEBATE SPEECHES (panel ruled this side lost)', samples.losingSpeeches.slice(0, 12)),
    '',
    'Your job: produce a DRAFT PATCH that proposes additions or edits to the voice-guidelines bank (the artifact at app/netlify/functions/lib/voice-guidelines.mjs that gets injected into every model call). Output PLAIN TEXT only, no markdown headers, no asterisks.',
    '',
    'Sections (use plain text labels followed by a colon, no hash characters):',
    '',
    'WINNING PATTERNS',
    'List 3-5 concrete moves that recur across high-signal cases AND winning speeches. For each: name the move, give a short example pulled from a sample, and explain why it works (judge perspective).',
    '',
    'FAILURE MODES',
    'List 3-5 patterns that recur across losing speeches OR appear in samples that scored poorly. For each: name the failure, quote 1-2 lines from a sample that exhibits it, explain the consequence.',
    '',
    'FORMAT-SPECIFIC DRIFT',
    'If you see APDA voice leaking into Policy or PF, BP voice leaking into LD, etc., name the drift with one example each. Skip if no drift is visible in this week.',
    '',
    'PROPOSED VOICE-GUIDELINES PATCH',
    'Write 1-2 paragraphs of new copy in the tone of voice-guidelines.mjs (debater-facing, second-person, direct). The copy should be ready to paste into the LANGUAGE_CONSTRUCTION section. Quote concrete vocabulary, do not hedge, anchor to the patterns above. Prefer additive edits over rewrites.',
    '',
    'Be honest. If the week\'s data does not support a strong pattern, say so and produce a smaller patch rather than padding.',
  ].join('\n');

  return user;
}

async function runDistill(db) {
  const samples = await gatherSamples(db);
  const totalSamples = samples.highGens.length + samples.savedGens.length + samples.winningSpeeches.length + samples.losingSpeeches.length;
  if (totalSamples < 6) {
    console.log('[distill-voice] not enough samples this week (' + totalSamples + ') — skipping distillation');
    return { skipped: true, reason: 'insufficient_samples', totalSamples };
  }
  const prompt = buildDistillPrompt(samples);
  let patch;
  try {
    patch = await callClaude({
      model: MODEL_DISTILL,
      system: 'You analyze debate-AI usage data and propose voice-guideline updates. Output plain text only — no markdown, no asterisks, no hash characters.',
      user: prompt,
      maxTokens: 4500,
    });
  } catch (err) {
    console.error('[distill-voice] distill call failed:', err.message);
    return { error: err.message };
  }
  if (!patch || patch.length < 200) {
    return { skipped: true, reason: 'short_output', length: patch ? patch.length : 0 };
  }
  const ref = await db.collection('voice_drafts').add({
    source: 'distill-voice',
    week: new Date().toISOString().slice(0, 10),
    samples: {
      highGens: samples.highGens.length,
      savedGens: samples.savedGens.length,
      winningSpeeches: samples.winningSpeeches.length,
      losingSpeeches: samples.losingSpeeches.length,
    },
    patch,
    reviewed: false,
    applied: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('[distill-voice] wrote draft', ref.id, 'patch len=', patch.length);
  return { draftId: ref.id, patchChars: patch.length, totalSamples };
}

// ── Stage 3: pairwise judge for generation_pairs ───────────────────
async function runPairJudge(db) {
  const since = sevenDaysAgo();
  let snap;
  try {
    snap = await db.collection('generation_pairs')
      .where('createdAt', '>=', since)
      .where('winner', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(MAX_PAIRS_TO_JUDGE)
      .get();
  } catch (err) {
    console.warn('[distill-voice] pair query failed:', err.message);
    return { judged: 0, error: err.message };
  }
  if (snap.empty) return { judged: 0 };

  let judged = 0;
  for (const doc of snap.docs) {
    const pair = doc.data();
    try {
      const [leftSnap, rightSnap] = await Promise.all([
        db.collection('generations').doc(pair.leftId).get(),
        db.collection('generations').doc(pair.rightId).get(),
      ]);
      if (!leftSnap.exists || !rightSnap.exists) continue;
      const left = leftSnap.data().output || '';
      const right = rightSnap.data().output || '';
      if (!left || !right) continue;

      const verdict = await callClaude({
        model: MODEL_PAIR_JUDGE,
        system: 'You are a debate-output judge. Given two outputs on the same motion, pick the better one for a competitive debater. Reply with ONE word only: LEFT, RIGHT, or TIE. No explanation.',
        user: 'Motion: ' + (pair.motion || '(unknown)') + '\nKind: ' + (pair.kind || 'case') + '\nFormat: ' + (pair.format || '?') + '\n\n=== LEFT ===\n' + String(left).slice(0, 6000) + '\n\n=== RIGHT ===\n' + String(right).slice(0, 6000),
        maxTokens: 8,
      });
      const v = String(verdict).trim().toUpperCase();
      let winner = null;
      if (v.startsWith('LEFT')) winner = 'left';
      else if (v.startsWith('RIGHT')) winner = 'right';
      else if (v.startsWith('TIE')) winner = null; // leave null; we don't dilute the dataset with weak ties
      if (winner) {
        await doc.ref.update({
          winner,
          winnerSetAt: FieldValue.serverTimestamp(),
          winnerSource: 'judge',
          winnerVerdict: v,
        });
        judged += 1;
      }
    } catch (err) {
      console.warn('[distill-voice] pair judge failed for', doc.id, err.message);
    }
  }
  return { judged, considered: snap.size };
}

// Netlify Scheduled Functions invoke as a regular handler. The schedule
// is declared by the export below.
export default async () => {
  console.log('[distill-voice] tick @', new Date().toISOString());
  if (!ANTHROPIC_KEY) {
    console.error('[distill-voice] ANTHROPIC_API_KEY missing — aborting');
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY missing' }), { status: 500 });
  }
  const db = getDb();
  const distill = await runDistill(db).catch(e => ({ error: e.message }));
  const pairs = await runPairJudge(db).catch(e => ({ error: e.message }));
  return new Response(JSON.stringify({ ok: true, distill, pairs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// Schedule: weekly on Mondays at 09:00 UTC. Distill is intentionally
// infrequent — we want a week of usage to settle before reviewing
// patterns. Pair judge ALSO runs on this same tick, which is fine —
// 20 pairs/week is a manageable training-data trickle.
export const config = {
  path: '/api/distill-voice',
  schedule: '0 9 * * 1',
};
