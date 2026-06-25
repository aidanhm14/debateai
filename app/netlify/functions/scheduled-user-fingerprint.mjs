// Nightly per-user style fingerprint pass.
//
// For each recently-active user with enough captured rounds, send their
// last N generations to Claude Haiku with a tight system prompt asking
// for an ~150-token fingerprint covering signature moves, strengths,
// weaknesses, topic affinities, and response patterns. Write to
// user_fingerprints/{uid} where the brain functions read it via
// lib/user-fingerprints.mjs and inject it into every subsequent prompt.
//
// Also: when a user gets their FIRST fingerprint (no prior doc existed),
// fire a one-time Resend email — "The AI just learned 5 things about
// how you argue. Read it." Single highest-intent retention moment we
// have: the AI has crossed a tangible threshold of personalization,
// and the email previews the actual fingerprint text so the user has
// a concrete reason to come back. Idempotent via user_profiles.
// firstFingerprintEmailSentAt.
//
// Cost: ~$0.003 per user-pass via Haiku. At a cap of 30 users/night
// that's ~$0.09/night, ~$2.70/month at current scale.
//
// Selection criteria:
//   - User has ≥ MIN_ROUNDS generations total
//   - User has at least 1 generation in the last 14 days (active)
//   - No existing fingerprint OR fingerprint older than FRESH_DAYS
//
// Env vars:
//   ANTHROPIC_API_KEY       — required
//   GOOGLE_SERVICE_ACCOUNT  — for admin Firestore
//   RESEND_API_KEY          — optional; missing = skip first-fingerprint emails
//   FINGERPRINT_FROM        — email "from" header (default Aidan <hello@debateai.com>)
//   FINGERPRINT_MAX_USERS   — cap per nightly run (default 60)
//   FINGERPRINT_MIN_ROUNDS  — min generations to fingerprint (default 3)
//   FINGERPRINT_FRESH_DAYS  — re-run if fingerprint older than this (default 7)
//   FINGERPRINT_MODEL       — override (default claude-haiku-4-5-20251001)

import { getDb, FieldValue } from './lib/firestore.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.FINGERPRINT_MODEL || 'claude-haiku-4-5-20251001';
// Tightened 2026-05-18 (60 → 30 users/night, 7 → 14 days freshness) on a
// credit-burn audit. Fingerprints describe an argumentative style and
// don't drift fast enough to need weekly refresh — biweekly is plenty,
// and capping the per-night pool halves the per-night Haiku spend.
// Env overrides still let us re-tune without a redeploy.
const MAX_USERS = parseInt(process.env.FINGERPRINT_MAX_USERS || '30', 10);
const MIN_ROUNDS = parseInt(process.env.FINGERPRINT_MIN_ROUNDS || '3', 10);
const FRESH_DAYS = parseInt(process.env.FINGERPRINT_FRESH_DAYS || '14', 10);
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

const FROM_EMAIL = process.env.FINGERPRINT_FROM || 'Aidan <hello@debateai.com>';
const REPLY_TO   = process.env.FINGERPRINT_REPLY_TO || 'aidandavidhollinger@gmail.com';
const SITE_URL   = process.env.SITE_URL || 'https://debateai.com';

function esc(s) {
  return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function buildFingerprintEmail({ firstName, fingerprint }) {
  // Strip the fingerprint into the most-shareable bullets. The cron's
  // strict output schema means we can splice deterministically.
  const lines = String(fingerprint).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const tryHref = `${SITE_URL}/debate-it`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <div style="font-size:1.05rem;font-weight:900;letter-spacing:-.02em;color:#1a1a1f;margin-bottom:24px">
    <span style="color:#dc2626">Debate</span> AI
  </div>
  <h1 style="font-size:1.45rem;font-weight:800;letter-spacing:-.015em;line-height:1.2;color:#1a1a1f;margin:0 0 14px">
    The AI just learned how you argue${firstName ? ', ' + firstName : ''}.
  </h1>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 18px">
    We ran a pass over your recent rounds. Here is the read it now carries into every round you run from this point on:
  </p>
  <div style="margin:0 0 22px;padding:18px 20px;border-left:3px solid #dc2626;background:rgba(220,38,38,.05);border-radius:0 10px 10px 0;font-size:.92rem;line-height:1.7;color:#1a1a1f;white-space:pre-line">${esc(lines.join('\n'))}</div>
  <p style="font-size:.95rem;line-height:1.55;color:#3a3a44;margin:0 0 22px">
    Your next round, the AI will push hardest on the weaknesses above and refuse to reward the moves it has already seen from you. The judge will call out the pattern by name if it shows up again. This is the part ChatGPT cannot do.
  </p>
  <a href="${tryHref}" style="display:inline-block;padding:13px 22px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:.92rem;border-radius:100px;letter-spacing:.02em">
    Run a round against the sharper version →
  </a>
  <p style="font-size:.78rem;line-height:1.5;color:#6a6a74;margin:32px 0 0;border-top:1px solid #e8e8e0;padding-top:16px">
    You are getting this because the AI just produced its first read of your style. We send this exactly once per signup, never again. Reply if you want to talk debate, the AI, or anything else.
  </p>
  <p style="font-size:.7rem;color:#8a8a94;margin:8px 0 0">
    DebateIt · debateai.com · Built by a UChicago parliamentary debater.
  </p>
</div>
</body></html>`;
}

// Returns true on a successful Resend send, false on any skip
// condition (no key, no email, already sent, send failure). Soft-fail:
// the cron's other work continues regardless.
async function sendFirstFingerprintEmail(db, uid) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('[fingerprint-email]', uid.slice(0, 6), 'skipped (RESEND_API_KEY missing)');
    return false;
  }

  // Look up email + name + idempotency flag from user_profiles.
  const profileRef = db.collection('user_profiles').doc(uid);
  const profileSnap = await profileRef.get().catch(() => null);
  if (!profileSnap || !profileSnap.exists) {
    console.log('[fingerprint-email]', uid.slice(0, 6), 'no user_profiles doc, skip');
    return false;
  }
  const profile = profileSnap.data();
  if (profile.firstFingerprintEmailSentAt) {
    // Defensive: should not happen since we gate on isFirst, but if
    // somehow the cron re-runs on the same uid in the same window we
    // shouldn't double-send.
    return false;
  }
  const email = (profile.email || '').trim();
  if (!email) {
    console.log('[fingerprint-email]', uid.slice(0, 6), 'no email on profile, skip');
    return false;
  }

  // Pull the fingerprint we just wrote.
  const fpSnap = await db.collection('user_fingerprints').doc(uid).get().catch(() => null);
  const fingerprint = (fpSnap && fpSnap.exists && fpSnap.data()?.fingerprint) || '';
  if (!fingerprint) return false;

  const firstName = (profile.displayName || '').trim().split(/\s+/)[0] || '';
  const html = buildFingerprintEmail({ firstName, fingerprint });
  const subject = 'The AI just learned how you argue';

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      reply_to: REPLY_TO,
      subject,
      html,
      tags: [{ name: 'category', value: 'first-fingerprint' }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.warn('[fingerprint-email]', uid.slice(0, 6), 'resend', resp.status, text.slice(0, 200));
    return false;
  }

  // Mark sent so we never duplicate.
  await profileRef.set({
    firstFingerprintEmailSentAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(err => {
    console.warn('[fingerprint-email]', uid.slice(0, 6), 'mark-sent failed:', err.message);
  });
  console.log('[fingerprint-email]', uid.slice(0, 6), '✓ sent to', email.slice(0, 3) + '***');
  return true;
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

// Return whether this user is due for a fingerprint AND whether they
// already have one (so the caller can decide whether to send the
// first-fingerprint email). Also respects the userEdited flag set
// when a user manually edits their style profile on /profile via
// /api/user/style-update — those edits must not be overwritten by
// the nightly Haiku pass, otherwise the editing surface is theater.
async function getFingerprintStatus(db, uid) {
  try {
    const fp = await db.collection('user_fingerprints').doc(uid).get();
    if (!fp.exists) return { needsRun: true, isFirst: true };
    const data = fp.data() || {};
    // User manually edited their profile → leave it alone until they
    // reset (POST /api/user/style-update { reset: true }).
    if (data.userEdited === true) return { needsRun: false, isFirst: false };
    const ts = data.updatedAt?.toMillis?.() || 0;
    const ageMs = Date.now() - ts;
    return {
      needsRun: ageMs > FRESH_DAYS * 24 * 60 * 60 * 1000,
      isFirst: false,
    };
  } catch {
    return { needsRun: true, isFirst: true };
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

  // Filter to users who actually need a refresh + flag the new ones.
  // first-fingerprint users get an email send after a successful run;
  // refresh users just get a quiet update.
  const queue = [];
  for (const uid of candidates) {
    const status = await getFingerprintStatus(db, uid);
    if (status.needsRun) queue.push({ uid, isFirst: status.isFirst });
  }
  console.log('[fingerprint] need refresh:', queue.length, 'of', candidates.length, '(' + queue.filter(x => x.isFirst).length + ' new)');

  const results = [];
  let emailsSent = 0;
  // Sequential — keeps Anthropic rate-limit pressure low, and lets us
  // cleanly bail on a single failure without stranding a bunch of
  // in-flight calls. 60 users × ~1.5s/call ~= 90s — fits comfortably
  // in the 10-min cron-function ceiling Netlify gives us.
  for (const { uid, isFirst } of queue) {
    try {
      const r = await fingerprintOne(db, uid);
      results.push(r);
      // Fire the first-fingerprint email only on a successful first run.
      // Email sender no-ops if RESEND_API_KEY isn't set or user has no
      // email on user_profiles — neither should block the rest of the
      // cron from finishing its writes.
      if (isFirst && r.status === 'ok') {
        const sent = await sendFirstFingerprintEmail(db, uid).catch(err => {
          console.warn('[fingerprint-email]', uid.slice(0, 6), 'failed:', err.message);
          return false;
        });
        if (sent) emailsSent += 1;
      }
    } catch (err) {
      console.error('[fingerprint]', uid.slice(0, 6), 'crashed:', err.message);
      results.push({ uid: uid.slice(0, 6), status: 'crashed', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  console.log('[fingerprint] done:', ok, '/', results.length, '· emails:', emailsSent);

  return new Response(JSON.stringify({ ok: true, processed: results.length, succeeded: ok, emailsSent, results }), {
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
