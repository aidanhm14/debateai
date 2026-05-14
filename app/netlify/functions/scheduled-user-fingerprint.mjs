// Nightly per-user style fingerprint pass.
//
// For each recently-active user with enough captured rounds, send their
// last N generations to Claude Haiku with a tight system prompt asking
// for an ~150-token fingerprint covering signature moves, strengths,
// weaknesses, topic affinities, and response patterns. Write to
// user_fingerprints/{uid} where the brain functions read it via
// lib/user-fingerprints.mjs and inject it into every subsequent prompt.
//
// Cost: ~$0.003 per user-pass via Haiku. At a cap of 60 users/night
// that's ~$0.18/night, ~$5/month at current scale.
//
// Selection criteria:
//   - User has ≥ MIN_ROUNDS generations total
//   - User has at least 1 generation in the last 14 days (active)
//   - No existing fingerprint OR fingerprint older than FRESH_DAYS
//
// Env vars:
//   ANTHROPIC_API_KEY       — required
//   GOOGLE_SERVICE_ACCOUNT  — for admin Firestore
//   FINGERPRINT_MAX_USERS   — cap per nightly run (default 60)
//   FINGERPRINT_MIN_ROUNDS  — min generations to fingerprint (default 3)
//   FINGERPRINT_FRESH_DAYS  — re-run if fingerprint older than this (default 7)
//   FINGERPRINT_MODEL       — override (default claude-haiku-4-5-20251001)

import { getDb, FieldValue } from './lib/firestore.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.FINGERPRINT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_USERS = parseInt(process.env.FINGERPRINT_MAX_USERS || '60', 10);
const MIN_ROUNDS = parseInt(process.env.FINGERPRINT_MIN_ROUNDS || '3', 10);
const FRESH_DAYS = parseInt(process.env.FINGERPRINT_FRESH_DAYS || '7', 10);
const SAMPLES_PER_USER = 6;        // last 6 generations per user
const MAX_SAMPLE_CHARS = 900;      // per-sample truncation
const RECENT_ACTIVITY_DAYS = 14;

// Fingerprint instructions. Strict format because the output gets
// injected verbatim into every future prompt for this user — bloat
// here = wasted tokens on every brain call from this user going forward.
const FINGERPRINT_SYSTEM = `You are analyzing a specific debater's recent AI-debate turns to build a compressed style fingerprint. Your output gets injected into the system prompt for every future round this user runs. Treat token economy as load-bearing.

OUTPUT FORMAT (strict, inject-ready, ~150 tokens total):

Signature moves: [2-3 specific argumentative moves this debater consistently uses. Concrete, not generic. Example: "leans on probabilistic impact weighing; opens with a definitions read."]
Recurring strengths: [1-2 things they do well. Specific, not "engaging."]
Recurring weaknesses: [1-2 patterns they consistently miss or fumble. Example: "drops counter-warrants in extensions; weak link analysis on econ motions."]
Topic affinities: [Areas where this debater is sharper or weaker, if discernible from the data. Skip if no signal.]
Response pattern under pressure: [How they handle pushback in 1 sentence. E.g., "pivots to reframing rather than direct refutation."]

Rules:
- Be specific to THIS debater's actual moves, not generic debate advice.
- No platitudes. No "they argue well" / "compelling" / "engaging."
- No em-dashes.
- No preface. Start with "Signature moves:" on line 1.
- If the data doesn't reveal a pattern for a section, write "Insufficient signal." and move on. Don't pad.
- Total output ≤ 200 words.`;

function safeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SAMPLE_CHARS);
}

// Find users worth fingerprinting tonight. We can't query "users with
// ≥3 generations and ≥1 recent" without a denormalized counter, so we:
// 1. Pull the most-recent N generations in the lookback window
// 2. Group by uid
// 3. Keep uids with count ≥ MIN_ROUNDS
// 4. Cap at MAX_USERS
//
// Sampling bias toward active users — fine since inactive users don't
// benefit from a fingerprint anyway (they're not coming back to use it).
async function findCandidateUsers(db) {
  const cutoff = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  // Pull a chunky slice of recent generations and group client-side.
  // 1500 is sized to capture ~50-150 distinct active users without
  // blowing the function timeout.
  const recentSnap = await db.collection('generations')
    .where('createdAt', '>=', cutoff)
    .orderBy('createdAt', 'desc')
    .limit(1500)
    .get()
    .catch(err => {
      console.warn('[fingerprint] recent-generations query failed:', err.message);
      return { docs: [] };
    });

  const counts = new Map();         // uid → count
  const latestByUid = new Map();    // uid → latest createdAt (for ordering)
  for (const doc of recentSnap.docs || []) {
    const d = doc.data();
    const uid = d.uid;
    if (!uid) continue;
    counts.set(uid, (counts.get(uid) || 0) + 1);
    if (!latestByUid.has(uid)) latestByUid.set(uid, d.createdAt);
  }

  const candidates = Array.from(counts.entries())
    .filter(([, c]) => c >= MIN_ROUNDS)
    .sort((a, b) => {
      // Sort by most-recent activity first so we always cover fresh users.
      const ta = latestByUid.get(a[0])?.toMillis?.() || 0;
      const tb = latestByUid.get(b[0])?.toMillis?.() || 0;
      return tb - ta;
    })
    .slice(0, MAX_USERS)
    .map(([uid]) => uid);

  return candidates;
}

async function shouldFingerprint(db, uid) {
  // Skip if fingerprint already fresh (within FRESH_DAYS).
  try {
    const fp = await db.collection('user_fingerprints').doc(uid).get();
    if (!fp.exists) return true;
    const ts = fp.data()?.updatedAt?.toMillis?.() || 0;
    const ageMs = Date.now() - ts;
    return ageMs > FRESH_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function fetchRecentSamples(db, uid) {
  const snap = await db.collection('generations')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(SAMPLES_PER_USER)
    .get()
    .catch(err => {
      console.warn('[fingerprint] sample fetch failed for', uid.slice(0, 6), err.message);
      return { docs: [] };
    });
  return (snap.docs || []).map(d => d.data()).filter(d => d && d.output && d.output.length >= 200);
}

function buildUserPrompt(samples) {
  const lines = [
    `${samples.length} recent AI-debate turns from this user. Build the fingerprint.`,
    '',
    '─── SAMPLES ───',
    '',
  ];
  samples.forEach((s, i) => {
    lines.push(`SAMPLE ${i + 1}${s.format ? ` · ${s.format}` : ''}${s.side ? ` · ${s.side}` : ''}${s.kind ? ` · ${s.kind}` : ''}`);
    if (s.motion) lines.push(`Motion: ${safeText(s.motion).slice(0, 200)}`);
    lines.push('');
    lines.push(safeText(s.output));
    lines.push('');
    lines.push('─────────────');
    lines.push('');
  });
  return lines.join('\n');
}

async function fingerprintOne(db, uid) {
  const samples = await fetchRecentSamples(db, uid);
  if (samples.length < MIN_ROUNDS) {
    return { uid: uid.slice(0, 6), status: 'too_few_samples', count: samples.length };
  }

  const userPrompt = buildUserPrompt(samples);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: FINGERPRINT_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[fingerprint]', uid.slice(0, 6), 'Anthropic error', res.status, errText.slice(0, 200));
    return { uid: uid.slice(0, 6), status: 'anthropic_error', code: res.status };
  }

  const data = await res.json();
  const fingerprint = (data.content || []).map(b => b.text || '').join('\n').trim();
  if (!fingerprint || fingerprint.length < 40) {
    return { uid: uid.slice(0, 6), status: 'empty' };
  }

  await db.collection('user_fingerprints').doc(uid).set({
    uid,
    fingerprint,
    sampleCount: samples.length,
    model: MODEL,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('[fingerprint]', uid.slice(0, 6), '✓', samples.length, 'samples');
  return { uid: uid.slice(0, 6), status: 'ok', count: samples.length };
}

export default async () => {
  if (!ANTHROPIC_API_KEY) {
    console.error('[fingerprint] ANTHROPIC_API_KEY missing');
    return new Response(JSON.stringify({ ok: false, error: 'missing_api_key' }), { status: 500 });
  }

  const db = getDb();
  const candidates = await findCandidateUsers(db);
  console.log('[fingerprint] candidates:', candidates.length);

  // Filter to users who actually need a refresh.
  const needFresh = [];
  for (const uid of candidates) {
    if (await shouldFingerprint(db, uid)) needFresh.push(uid);
  }
  console.log('[fingerprint] need refresh:', needFresh.length, 'of', candidates.length);

  const results = [];
  // Sequential — keeps Anthropic rate-limit pressure low, and lets us
  // cleanly bail on a single failure without stranding a bunch of
  // in-flight calls. 60 users × ~1.5s/call ~= 90s — fits comfortably
  // in the 10-min cron-function ceiling Netlify gives us.
  for (const uid of needFresh) {
    try {
      const r = await fingerprintOne(db, uid);
      results.push(r);
    } catch (err) {
      console.error('[fingerprint]', uid.slice(0, 6), 'crashed:', err.message);
      results.push({ uid: uid.slice(0, 6), status: 'crashed', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  console.log('[fingerprint] done:', ok, '/', results.length);

  return new Response(JSON.stringify({ ok: true, processed: results.length, succeeded: ok, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Daily at 04:30 UTC — 30 min after scheduled-distill, so the two
// nightly Haiku passes don't fight for API throughput. Off-peak in
// every active geography.
export const config = {
  schedule: '30 4 * * *',
};
