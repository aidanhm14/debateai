import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { benchOfSide, heuristicScreen, analysisPrompt, parseAnalysis, combineVerdicts } from './lib/ai-use.mjs';

const REASONS = new Set(['harassment', 'hate_or_threats', 'sexual_content', 'spam', 'ai_use', 'other']);

// One Claude call per ai_use report, so the analysis lane is metered per
// reporter (the standing rule: anything that spends provider money goes
// through lib/rate-limit). Tripping the cap never blocks the REPORT —
// a human review must not be rate-limited — it only skips the machine
// screen and says so on the record.
const AI_USE_LAYERS = [
  { window: 60 * 60_000, max: 4, label: 'hour' },
  { window: 24 * 60 * 60_000, max: 10, label: 'day' },
];
const AI_MODEL = 'claude-sonnet-4-6';

// Screen the accused side's transcript for the reviewer. EVIDENCE ONLY:
// this function writes nothing, strikes nobody, and its result rides the
// safety_reports record and stops there. The AI judge never sees it and
// no ballot or settlement path reads safety_reports. Returns the
// aiAnalysis object to attach, or null when there is nothing to screen.
async function screenForAiUse({ db, roomId, reporterUid, reportedUid }) {
  if (!roomId) return { skipped: 'no-round' };
  let round;
  try {
    const snap = await db.collection('live_rounds').doc(roomId).get();
    round = snap.exists ? snap.data() : null;
  } catch (e) { return { skipped: 'round-unreadable' }; }
  if (!round) return { skipped: 'no-round' };

  // Both parties must actually be seats in this round: a report about a
  // round neither person debated gets a human review but no machine
  // read, because the transcript is not theirs to screen.
  const seats = {
    pro: [round.proUid, round.proUid2].filter(Boolean),
    con: [round.conUid, round.conUid2].filter(Boolean),
  };
  const all = seats.pro.concat(seats.con);
  if (!all.includes(reporterUid) || !all.includes(reportedUid)) return { skipped: 'not-participants' };
  const accusedBench = seats.pro.includes(reportedUid) ? 'pro' : 'con';

  const speeches = (Array.isArray(round.speeches) ? round.speeches : [])
    .filter((sp) => benchOfSide(sp && sp.side) === accusedBench);
  const heur = heuristicScreen(speeches, round.format);
  if (!heur.stats.analyzedSpeeches) {
    return { skipped: 'no-transcript', note: 'The accused side has no usable transcript in this round; nothing to screen.' };
  }

  let model = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const prompt = analysisPrompt({
        motion: round.motion,
        format: round.format,
        accusedName: accusedBench === 'pro' ? round.proName : round.conName,
        speeches,
      });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 1500,
          temperature: 0,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        model = parseAnalysis((data.content || []).map((c) => c.text || '').join(''));
      }
    } catch (e) { /* heuristics stand alone; a dead model is not a dead report */ }
  }

  return {
    verdict: combineVerdicts(heur, model),
    heuristics: { verdict: heur.verdict, hardArtifact: heur.hardArtifact, signals: heur.signals.map((s) => s.note).slice(0, 10), stats: heur.stats },
    model: model ? { verdict: model.verdict, signals: model.signals, summary: model.summary } : null,
    disclaimer: 'Advisory machine screen for the human reviewer. Never a verdict; never shown to the AI judge; no automatic penalty.',
  };
}

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Invalid token', 401, request); }

  let body;
  try { body = await request.json(); }
  catch (e) { return errorResponse('Bad JSON', 400, request); }

  const reporterUid = decoded.sub;
  const reportedUid = clean(body.reportedUid, 128);
  const reason = clean(body.reason, 40);
  const details = clean(body.details, 1000);
  const roomId = clean(body.roomId, 180);
  const reportedName = clean(body.reportedName, 120);
  const shouldBlock = body.block !== false;

  if (!reportedUid || reportedUid === reporterUid) return errorResponse('Invalid reported user', 400, request);
  if (!REASONS.has(reason)) return errorResponse('Invalid reason', 400, request);

  const db = getDb();
  const report = {
    reporterUid,
    reporterEmail: clean(decoded.email, 220),
    reportedUid,
    reportedName,
    reason,
    details,
    roomId,
    source: clean(body.source || 'live_round', 80),
    platform: clean(body.platform || 'web', 32),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  };

  // AI-use reports carry a transcript screen for the reviewer. It runs
  // BEFORE the write so the analysis lands on the same record the
  // reviewer opens; a failed or rate-limited screen files the report
  // anyway with the skip stated on the record.
  let aiAnalysis = null;
  if (reason === 'ai_use') {
    const gate = await checkLayers('aiuse', reporterUid, AI_USE_LAYERS);
    if (!gate.ok) {
      aiAnalysis = { skipped: 'rate-limit', note: 'Machine screen skipped (reporter over the analysis cap). Human review proceeds as normal.' };
    } else {
      try { aiAnalysis = await screenForAiUse({ db, roomId, reporterUid, reportedUid }); }
      catch (e) { aiAnalysis = { skipped: 'error' }; }
    }
    if (aiAnalysis) report.aiAnalysis = aiAnalysis;
  }

  const writes = [db.collection('safety_reports').add(report)];
  if (shouldBlock) {
    writes.push(db.collection('user_blocks').doc(reporterUid).collection('blocked').doc(reportedUid).set({
      reportedName,
      reason,
      roomId,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await Promise.all(writes);

  const out = { ok: true, blocked: shouldBlock };
  if (reason === 'ai_use') {
    // The reporter gets the machine read back so their expectations are
    // calibrated honestly: "no signal found" is worth telling them, and
    // so is "signals found, a human reviews". Never the raw evidence
    // list: naming the accused's phrasing back to the accuser invites a
    // mid-round confrontation the reviewer has not had yet.
    out.aiVerdict = (aiAnalysis && aiAnalysis.verdict) || 'unscreened';
  }
  return jsonResponse(out, 200, request);
};

export const config = { path: '/api/report-user' };
