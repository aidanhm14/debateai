// Scheduled brain for async rounds. Runs every 15 minutes and does the
// slow work the submit path refuses to: transcription, the AI opponent
// when the human window closes, waivers, and the ballot.
//
// Everything advances off one field: `sweepAt` (ms). Every pending state
// keeps it set to the next moment work is due; completion deletes it.
// One range query on a single field, so no composite indexes.
//
// Cadence: */15 is ~2.9K invocations/month. The 2026-05-18 credit audit
// killed a 15-minute keepalive, so do not tighten this without a reason;
// deadlines here are 24h and the only latency a user feels is ballot
// delivery, which the UI states as "within about 15 minutes".
import { getDb, FieldValue } from './lib/firestore.mjs';
import { deleteCachedShared } from './lib/admin-cache.mjs';
import { buildAdjudicationBlock } from './lib/adjudication.mjs';
import { clashMapPrompt, parseClashMap, clashMapForBallot } from './lib/clash-map.mjs';
import { applyRoundRating } from './lib/rating-apply.mjs';
import { recordJudgment } from './lib/judgment.mjs';
import { settleMarket } from './lib/settle.mjs';
import { marketId as mkMarketId } from './lib/credits.mjs';
import { seasonFor } from './lib/judge-charter.mjs';
import { runPanel } from './lib/judge-run.mjs';
import { speakerScoreFromDims } from './lib/speaker-score.mjs';
import { auditRecord, writeAudit } from './lib/judge-audit.mjs';
import { judgmentId as mkJudgmentId } from './lib/judgment.mjs';
import {
  mediaStore, readMediaBuffer, transcribe, claude, speechToMp3, sendEmail,
  newId, feedKeyFor, FEED_CACHE_KEY, FORMAT_NAMES, REPLY_WINDOW_MS,
  AI_UID, AI_NAME as AI_IDENT, AI_MAX_OPEN, AI_MIN_BOARD, AI_CHALLENGE_TTL_MS, SEED_MOTIONS,
} from './lib/async-rounds.mjs';

const SITE = process.env.SITE_ORIGIN || 'https://itsdebatable.com';
const OPP_MODEL   = process.env.ASYNC_OPP_MODEL   || 'claude-sonnet-5';
const JUDGE_MODEL = process.env.ASYNC_JUDGE_MODEL || 'claude-sonnet-5';
const CLASH_MODEL = process.env.ASYNC_CLASH_MODEL || 'claude-sonnet-5';
const DEEP_MODEL  = process.env.ASYNC_DEEP_MODEL  || 'claude-sonnet-5';
// One extra call per completed round. Set ASYNC_CLASH_ENABLED=0 to stop
// drawing maps without a redeploy; the ballot then runs exactly as it did
// before the map existed.
const CLASH_ENABLED = process.env.ASYNC_CLASH_ENABLED !== '0';
// Stop STARTING new work this far into the invocation. Cut from 18s on
// 2026-08-12: the panel's jurors are reasoning models now and a ballot
// begun at 18s would still be running when the wall arrives, which loses
// the whole invocation's work rather than deferring one round by 15
// minutes. A deferred round is invisible; a killed invocation is not.
const TIME_BUDGET_MS = 9_000;
const MAX_TRANSCRIPT_TRIES = 4;


const AI_NAME = AI_IDENT;

function oppSpeechPrompt(motion, format, openingTranscript) {
  const system =
    'You are The Debater, the AI sparring partner on Debatable, recording a spoken Opposition answer in an async round. ' +
    'Register: varsity debater on the circuit, spoken not written. 200 to 240 words. ' +
    'Structure: direct clash with the two strongest things the opening actually said, then one independent reason the motion fails, then one line of impact weighing. ' +
    'The ballot maps every argument to whether you answered it, conceded it, or said nothing, so account for their strongest points out loud: answer them, or concede one on purpose and say why it does not decide the round. ' +
    'No invented citations or statistics. No preface, no salutation, no "ladies and gentlemen". Do not use em dashes. Start mid-argument the way a real speech does.';
  const user = 'Motion: ' + motion + '\nFormat: ' + (FORMAT_NAMES[format] || format) +
    '\n\nProposition opening (transcript):\n' + (openingTranscript || '[transcript unavailable — answer the motion on its merits]');
  return { system, user };
}

function propOpeningPrompt(motion, format) {
  const system =
    'You are The Debater, the AI sparring partner on Debatable, recording a spoken Proposition opening in an async round. ' +
    'A human will answer you, so leave real ground: argue hard but take one clear line rather than covering everything. ' +
    'Register: varsity debater on the circuit, spoken not written. 200 to 240 words. ' +
    'Structure: one framing line, two developed arguments with mechanisms, one line of impact weighing. ' +
    'No invented citations or statistics. No preface, no salutation. Do not use em dashes.';
  const user = 'Motion: ' + motion + '\nFormat: ' + (FORMAT_NAMES[format] || format);
  return { system, user };
}

function propReplyPrompt(d) {
  const t = {};
  for (const turn of d.turns || []) t[turn.n] = turn.transcript || '';
  const system =
    'You are The Debater, the AI sparring partner on Debatable, recording the spoken Proposition reply in an async round you opened. ' +
    '120 to 150 words. Rebuild your strongest point against what the answer actually said, concede nothing by silence on their best attack (the ballot maps silence as a drop, so concede out loud or answer it), ' +
    'then weigh the round in one or two lines. No new arguments, no invented citations. Spoken register, no preface. Do not use em dashes.';
  const user = 'Motion: ' + d.motion + '\nFormat: ' + (FORMAT_NAMES[d.format] || d.format) +
    '\n\nYour opening:\n' + (t[1] || '') + '\n\nTheir answer:\n' + (t[2] || '');
  return { system, user };
}

async function makeAiTurn(store, n, kind, speech, now) {
  const mp3 = await speechToMp3(speech);
  const mediaId = 'ai:' + newId();
  await store.set(`m/${mediaId}/p0`, mp3);
  await store.setJSON(`m/${mediaId}/meta`, { mime: 'audio/mpeg', bytes: mp3.length, partCount: 1, uid: AI_UID });
  const words = speech.split(/\s+/).length;
  return { n, uid: AI_UID, ai: true, kind: 'audio', mediaId,
    durationSec: Math.round(words / 2.4), transcript: speech, name: AI_NAME, photo: '', createdAt: now };
}

function ballotPrompt(d, clashMap) {
  const casual = String(d.format || '').toLowerCase() === 'quick';
  const pointShape = casual
    ? '"propPoints":<1-100 one decimal>,"oppPoints":<1-100 one decimal>,'
    : '"propPoints":<25-30 one decimal>,"oppPoints":<25-30 one decimal>,';
  const extraAxis = casual
    ? ',"strategy":{"prop":<1-10 int>,"opp":<1-10 int>}'
    : '';
  const system = buildAdjudicationBlock({ format: d.format || '' }) +
    '\n\nASYNC ROUND BALLOT. Three recorded speeches: Prop opening, Opp answer, Prop reply (the reply may be waived). ' +
    'Judge ONLY what is in the transcripts. Weigh the actual clash, not what could have been said. ' +
    'Return STRICT JSON, nothing else: {"winner":"prop"|"opp",' + pointShape + '"decidingIssue":"<8 words or fewer naming the ONE clash that decided it>","rfd":"<=150 words, plain register, open with the deciding clash, name each consequential drop only when the other side extended it and explained its ballot significance, close with the single thing the losing side needed to change, no em dashes",' +
    '"dimensions":{"clarity":{"prop":<1-10 int>,"opp":<1-10 int>},"reasoning":{"prop":<1-10 int>,"opp":<1-10 int>},"responsiveness":{"prop":<1-10 int>,"opp":<1-10 int>},"weighing":{"prop":<1-10 int>,"opp":<1-10 int>}' + extraAxis + ',"persuasion":{"prop":<1-10 int>,"opp":<1-10 int>}}} ' +
    'For "decidingIssue": name the substantive clash, not the outcome. "Whether the ad libraries answer accountability" is an issue. "Opp was more responsive" is not. ' +
    'For "dimensions": score each side alone on each axis. clarity = structure, signposting, intelligibility. reasoning = warrants and link chains. responsiveness = direct clash with what the other side actually said. weighing = impact comparison and ballot-story crystallization. ' +
    (casual ? 'strategy = focus and time spent on what decided the round. ' : '') +
    'persuasion = whether the case moved a reasonable listener hearing it once: concrete stakes, a world you can picture, an argument built to be understood the first time. Persuasion is NOT delivery, fluency, confidence, accent, or polish, and a transcript cannot tell you those anyway. Score it only where you can name the argumentative move that earned it. It never overrides the arguments. ' +
    (casual
      ? 'The public score out of 100 is derived from the six axes at the published weights. Score every axis honestly and use the whole range.'
      : 'Score the axes independently; they should differ where the round differed and need not average to the legacy points.');
  const t = {};
  for (const turn of d.turns || []) t[turn.n] = turn.transcript || '[transcript unavailable]';
  const user =
    'Motion: ' + d.motion + '\nFormat: ' + (FORMAT_NAMES[d.format] || d.format) +
    '\n\nPROP OPENING (' + ((d.prop && d.prop.name) || 'Prop') + '):\n' + (t[1] || '[missing]') +
    '\n\nOPP ANSWER (' + ((d.opp && d.opp.name) || 'Opp') + (d.aiOpp ? ', AI opponent' : '') + '):\n' + (t[2] || '[missing]') +
    '\n\nPROP REPLY:\n' + (d.replyWaived ? '[reply waived — the opener did not record within the window]' : (t[3] || '[missing]')) +
    clashMapForBallot(clashMap);
  return { system, user };
}

// The full ballot, second beat. The panel's RFD is deliberately compact
// (three concurrent jurors cannot each write 1,000 words inside the
// ~26s execution wall), so the long-form Reason for Decision is one
// dedicated call that fires on a LATER sweep pass, after the verdict is
// recorded, with a whole invocation's budget to itself. Same
// architecture as live-round and /practice: it explains a verdict that
// is already final, it never re-litigates it, and the charter is
// untouched because RFD length is per-surface output shape, which the
// adjudication core explicitly leaves to the surfaces.
function deepBallotPrompt(d) {
  const b = d.ballot || {};
  const t = {};
  for (const turn of d.turns || []) t[turn.n] = turn.transcript || '[transcript unavailable]';
  const propName = (d.prop && d.prop.name) || 'Prop';
  const oppName = (d.opp && d.opp.name) || 'Opp';
  const winName = b.winner === 'prop' ? propName : oppName;
  const system = buildAdjudicationBlock({ format: d.format || '' }) +
    '\n\nTHE FULL BALLOT, ASYNC ROUND. The panel verdict on this round is already issued and FINAL; it is included in the message. Your job is the long-form Reason for Decision the debaters keep and reread. Explain the verdict; never contradict or soften the winner or the points.' +
    '\n\nHARD RULES:' +
    '\n- MINIMUM 450 words. Target 550 to 900. This round is three short recorded speeches, so depth comes from walking all of them completely, not from padding.' +
    '\n- Walk EVERY substantive argument either side ran, one at a time, not just the biggest. For each: state it the way its side ran it, trace what happened to it across the later speeches (answered, turned, extended, dropped), rule who won it, and name the test that settled it (comparative, symmetry, delta, terminalization, missing burden, stated default).' +
    '\n- Quote short verbatim lines from the transcripts so every ruling points at the exact moment it happened.' +
    '\n- Then THE WEIGHING: which won arguments outweigh which, on what named axis (certainty, magnitude, prerequisite, proximity), and why that ordering decides the ballot.' +
    '\n- Then THE DROPS: every consequential dropped argument, named as it appeared in the round.' +
    '\n- Then THE SPEAKERS: one tight paragraph per side: strongest moment (quoted), costliest moment (quoted), one concrete fix for their next round.' +
    '\n- Close with HOW THIS FLIPS: the two or three specific moves that would have flipped this ballot.' +
    '\n- These are speech transcripts: expect speech-to-text noise. Judge the arguments, never the transcription, and never treat a transcription artifact as a dropped argument.' +
    '\n\nOUTPUT: plain text only. Short ALL-CAPS section labels (THE DECISION / THE ARGUMENTS / THE WEIGHING / THE DROPS / THE SPEAKERS / HOW THIS FLIPS), each on its own line, paragraphs separated by blank lines. No JSON, no markdown, no asterisks, no code fences, no em dashes, no preamble.';
  const user =
    'Motion: ' + d.motion + '\nFormat: ' + (FORMAT_NAMES[d.format] || d.format) +
    '\n\nVERDICT ALREADY ISSUED (final, do not re-litigate): winner = ' + winName + ' (' + b.winner + ').' +
    (b.scoreScale === 100 ? ' Scores out of 100: ' : ' Legacy points: ') + propName + ' ' + b.propPoints + ', ' + oppName + ' ' + b.oppPoints + '.' +
    (b.decidingIssue ? ' Deciding issue: ' + b.decidingIssue + '.' : '') +
    (b.rfd ? '\nShort RFD already shown: ' + b.rfd : '') +
    '\n\nPROP OPENING (' + propName + '):\n' + (t[1] || '[missing]') +
    '\n\nOPP ANSWER (' + oppName + (d.aiOpp ? ', AI opponent' : '') + '):\n' + (t[2] || '[missing]') +
    '\n\nPROP REPLY:\n' + (d.replyWaived ? '[reply waived — the opener did not record within the window]' : (t[3] || '[missing]')) +
    clashMapForBallot(d.clashMap) +
    '\n\nWrite the full ballot now.';
  return { system, user };
}

// The panel, the ballot parser and the scorecard clamp all moved to
// lib/judge-run.mjs when live rounds needed the same machinery. Two
// copies of "how a panel decides a round" is how degraded-mode and
// no-majority semantics drift apart, and those two are the difference
// between a disclosed limitation and a silent one. Async speaks
// prop/opp on the wire; the runner is parameterised on exactly that.

async function ensureTranscripts(store, ref, d) {
  // Returns true when every present turn has a transcript (or gave up).
  let turns = d.turns || [];
  let changed = false;
  let allDone = true;
  for (const turn of turns) {
    if (turn.transcript != null) continue;
    const tries = turn.transcriptTries || 0;
    if (tries >= MAX_TRANSCRIPT_TRIES) { turn.transcript = '[transcript unavailable]'; changed = true; continue; }
    try {
      const meta = await store.get(`m/${turn.mediaId}/meta`, { type: 'json' });
      const buf = await readMediaBuffer(store, turn.mediaId, meta);
      if (!buf) throw new Error('media missing');
      turn.transcript = (await transcribe(buf, meta.mime)).slice(0, 12000);
      changed = true;
    } catch (err) {
      console.warn('[async-sweep] transcribe failed', ref.id, 'turn', turn.n, err && err.message);
      turn.transcriptTries = tries + 1;
      changed = true;
      allDone = false;
    }
  }
  if (changed) await ref.update({ turns });
  return allDone;
}

export default async () => {
  const started = Date.now();
  const db = getDb();
  const store = mediaStore();
  const stats = { scanned: 0, transcribed: 0, aiAnswers: 0, waived: 0, ballots: 0, deepBallots: 0, clashMaps: 0, rated: 0, settled: 0, audited: 0, unresolved: 0, errors: 0 };

  try {
    // ── board inventory: keep a couple of AI-opened challenges live so a
    // first visitor never lands on an empty feed. One per run, capped.
    try {
      const openSnap = await db.collection('async_rounds').where('feedKey', '==', 'open-public').limit(8).get();
      let total = 0, ai = 0;
      openSnap.forEach((doc) => { total++; if ((doc.data().prop || {}).uid === AI_UID) ai++; });
      if (total < AI_MIN_BOARD && ai < AI_MAX_OPEN) {
        const pick = SEED_MOTIONS[Math.floor(Math.random() * SEED_MOTIONS.length)];
        const dup = openSnap.docs.some((doc) => doc.data().motion === pick.motion);
        if (!dup) {
          const now = Date.now();
          const { system, user } = propOpeningPrompt(pick.motion, pick.format);
          const speech = (await claude(system, user, 700, OPP_MODEL)).trim();
          const turn1 = await makeAiTurn(store, 1, 'audio', speech, now);
          // Deterministic id per motion: Netlify can double-fire a schedule
          // around deploys, and two concurrent runs both passed the count
          // check (the board briefly held 3 AI challenges against a cap of
          // 2 on 2026-07-22). Same-motion seeds now land on one doc, so a
          // duplicate run overwrites instead of adding.
          const seedId = 'seed-' + pick.motion.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
          await db.collection('async_rounds').doc(seedId).set({
            state: 'open', visibility: 'public', hidden: false, feedKey: 'open-public',
            motion: pick.motion, format: pick.format,
            prop: { uid: AI_UID, name: AI_NAME, photo: '' }, opp: null, aiOpp: false,
            turns: [turn1], replyWaived: false,
            createdAt: now, deadlineAt: now + AI_CHALLENGE_TTL_MS, completedAt: 0,
            sweepAt: now + AI_CHALLENGE_TTL_MS,
            ballot: null, votes: { prop: 0, opp: 0 }, reports: 0,
          });
          stats.seeded = 1;
          await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
        }
      }
    } catch (err) { console.warn('[async-sweep] seed pass failed', err && err.message); }

    const due = await db.collection('async_rounds').where('sweepAt', '<=', Date.now()).limit(12).get();
    for (const doc of due.docs) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      stats.scanned++;
      const ref = doc.ref;
      try {
        let d = doc.data();
        const now = Date.now();

        const transcriptsReady = await ensureTranscripts(store, ref, d);
        d = (await ref.get()).data();

        if (d.state === 'open') {
          if ((d.prop || {}).uid === AI_UID) {
            // Never AI-vs-AI: an unanswered AI challenge retires quietly.
            // retiredAt is read by nobody; it exists so a parked doc
            // (state 'open', feedKey 'quiet', no sweepAt) explains itself
            // in Firestore instead of reading as a stranded round.
            if (now >= (d.deadlineAt || 0)) {
              await ref.update({ feedKey: 'quiet', retiredAt: now, sweepAt: FieldValue.delete() });
              await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
            } else {
              await ref.update({ sweepAt: d.deadlineAt || (now + AI_CHALLENGE_TTL_MS) });
            }
            continue;
          }
          if (now >= (d.deadlineAt || 0)) {
            // Human window closed: the AI opponent takes the other side.
            const t1 = (d.turns || []).find((t) => t.n === 1) || {};
            const { system, user } = oppSpeechPrompt(d.motion, d.format, t1.transcript);
            const speech = (await claude(system, user, 700, OPP_MODEL)).trim();
            const mp3 = await speechToMp3(speech);
            const mediaId = 'ai:' + newId();
            await store.set(`m/${mediaId}/p0`, mp3);
            await store.setJSON(`m/${mediaId}/meta`, { mime: 'audio/mpeg', bytes: mp3.length, partCount: 1, uid: 'ai' });
            const words = speech.split(/\s+/).length;
            const turn2 = {
              n: 2, uid: 'ai', ai: true, kind: 'audio', mediaId,
              durationSec: Math.round(words / 2.4), transcript: speech,
              name: AI_NAME, photo: '', createdAt: now,
            };
            await ref.update({
              state: 'awaiting_reply', feedKey: feedKeyFor('awaiting_reply', d.visibility, d.hidden),
              opp: { uid: 'ai', name: AI_NAME, photo: '' }, aiOpp: true,
              turns: [...(d.turns || []), turn2],
              answeredAt: now, deadlineAt: now + REPLY_WINDOW_MS, sweepAt: now + REPLY_WINDOW_MS,
            });
            stats.aiAnswers++;
            await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
            try {
              const priv = await ref.collection('private').doc('notify').get();
              const to = priv.exists ? priv.data().propEmail : '';
              if (to) await sendEmail(to, 'The AI answered your challenge. Record your reply.',
                `<p>No human picked up your round on “${d.motion}” inside the window, so The Debater answered it.</p>` +
                `<p>You have 24 hours to record a 60-second reply, then the ballot comes back.</p>` +
                `<p><a href="${SITE}/rounds?r=${ref.id}">Hear the answer and reply</a></p>`);
            } catch { /* best effort */ }
          } else {
            await ref.update({ sweepAt: transcriptsReady ? (d.deadlineAt || now + 60_000) : now + 10 * 60_000 });
          }
          continue;
        }

        if (d.state === 'awaiting_reply') {
          if ((d.prop || {}).uid === AI_UID) {
            // The AI opened this round, so the reply is its job — and it
            // does not wait out the window. Needs the answer's transcript.
            if (!transcriptsReady) { await ref.update({ sweepAt: now + 10 * 60_000 }); continue; }
            const { system, user } = propReplyPrompt(d);
            const speech = (await claude(system, user, 500, OPP_MODEL)).trim();
            const turn3 = await makeAiTurn(store, 3, 'audio', speech, now);
            await ref.update({
              state: 'judging', feedKey: feedKeyFor('judging', d.visibility, d.hidden),
              turns: [...(d.turns || []), turn3], sweepAt: now,
            });
            d = (await ref.get()).data();
          } else if (now >= (d.deadlineAt || 0)) {
            await ref.update({ state: 'judging', feedKey: feedKeyFor('judging', d.visibility, d.hidden), replyWaived: true, sweepAt: now });
            stats.waived++;
            d = (await ref.get()).data();
          } else {
            await ref.update({ sweepAt: transcriptsReady ? (d.deadlineAt || now + 60_000) : now + 10 * 60_000 });
            continue;
          }
        }

        if (d.state === 'judging') {
          if (!transcriptsReady) { await ref.update({ sweepAt: now + 10 * 60_000 }); continue; }

          // Draw the clash map BEFORE the ballot so the judge decides with
          // the flow in front of it. Best effort on purpose: a failed or
          // fully-rejected map yields `null`, ballotPrompt appends nothing,
          // and the round is judged exactly as it was before maps existed.
          let clashMap = null;
          if (CLASH_ENABLED) {
            try {
              const cp = clashMapPrompt(d, FORMAT_NAMES[d.format] || d.format);
              clashMap = parseClashMap(await claude(cp.system, cp.user, 1600, CLASH_MODEL), d);
              if (clashMap) stats.clashMaps++;
            } catch (err) {
              console.warn('[async-sweep] clash map failed', ref.id, err && err.message);
            }
          }

          const { system, user } = ballotPrompt(d, clashMap);
          const season = seasonFor(Date.now());
          const casual = String(d.format || '').toLowerCase() === 'quick';
          const judged = await runPanel(season, system, user, {
            aKey: 'prop', bKey: 'opp', singleModel: JUDGE_MODEL,
            scoreScale: casual ? 100 : 30,
          });

          // Nobody voted. Every juror failed, which is a transient
          // provider problem rather than an undecidable round, so leave
          // the round in `judging` and come back. Completing it with an
          // empty ballot would burn the round permanently.
          if (judged.panel.resolution === 'no_votes') {
            stats.errors++;
            console.error('[async-sweep] panel returned no votes', ref.id);
            await ref.update({ sweepAt: Date.now() + 10 * 60_000 });
            continue;
          }

          let ballot = judged.ballot;
          if (casual) {
            const axes = ['clarity', 'reasoning', 'responsiveness', 'weighing', 'strategy', 'persuasion'];
            if (!ballot.dimensions || !axes.every((axis) => ballot.dimensions[axis])) {
              throw new Error('casual ballot missing complete six-axis scorecard');
            }
            const propScore = speakerScoreFromDims(ballot.dimensions, 'prop');
            const oppScore = speakerScoreFromDims(ballot.dimensions, 'opp');
            if (propScore == null || oppScore == null) throw new Error('casual ballot score could not be derived');
            ballot = {
              ...ballot,
              propPoints: propScore,
              oppPoints: oppScore,
              scoreScale: 100,
              pointsDerived: true,
            };
          }
          const judgedAt = Date.now();
          // A decided round keeps sweepAt set so the NEXT sweep pass
          // writes the long-form full ballot (see the 'complete' branch
          // below). A split panel has no verdict to explain, so it
          // finishes here. The deep write cannot ride THIS invocation:
          // the panel already spent 16-24s of the ~26s wall.
          const deepDue = ballot.winner === 'prop' || ballot.winner === 'opp';
          await ref.update({
            state: 'complete', feedKey: feedKeyFor('complete', d.visibility, d.hidden),
            ballot: { ...ballot, panel: judged.panel, at: judgedAt },
            ...(clashMap ? { clashMap: { ...clashMap, model: CLASH_MODEL } } : {}),
            completedAt: judgedAt,
            ...(deepDue ? { sweepAt: judgedAt } : { sweepAt: FieldValue.delete() }),
          });
          stats.ballots++;
          if (judged.panel.resolution === 'unresolved') stats.unresolved++;
          await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});

          // The audit record, before anything settles off the verdict.
          // A regulator or a plaintiff asks what configuration decided
          // this round, and the answer has to have been written down at
          // the moment it was decided rather than reconstructed later.
          // Best effort on the write, loud on failure: a missing audit
          // row must never strand a judged round in the sweep.
          try {
            const jid = mkJudgmentId('async', ref.id);
            await writeAudit(db, auditRecord({
              judgmentId: jid,
              source: 'async',
              eventId: ref.id,
              season,
              jurorResults: judged.jurorResults,
              panel: judged.panel,
              motion: d.motion,
              format: d.format,
              clashMapUsed: !!clashMap,
              now: judgedAt,
            }));
            stats.audited++;
          } catch (err) {
            console.error('[async-sweep] audit write failed', ref.id, err && err.message);
          }

          // Record the judgment FIRST. It is the document both the
          // ladder and the credit market settle from, so nothing
          // downstream can invent a winner if this step fails. A panel
          // that could not reach a majority has no winner, so
          // recordJudgment refuses it and nothing settles: that is the
          // charter's `unresolved` promise doing its job rather than a
          // failure to handle.
          try {
            await recordJudgment(db, {
              source: 'async',
              eventId: ref.id,
              roundData: { ...d, state: 'complete', ballot: { ...ballot, panel: judged.panel, at: judgedAt }, completedAt: judgedAt },
            });
            const settled = await settleMarket(db, mkMarketId('async', ref.id));
            if (settled.settled) stats.settled++;
          } catch (err) {
            console.error('[async-sweep] judgment/settle failed', ref.id, err && err.message);
          }

          // Rate the round the moment the ballot lands. applyRoundRating
          // re-checks eligibility itself and is idempotent, so a retry
          // or a later backfill over the same round is a no-op. Best
          // effort on purpose: a rating failure must never leave a
          // judged round stuck in the sweep.
          try {
            const rated = await applyRoundRating(db, {
              source: 'async',
              eventId: ref.id,
              roundData: { ...d, state: 'complete', ballot, completedAt: Date.now() },
            });
            if (rated.applied) stats.rated++;
          } catch (err) {
            console.error('[async-sweep] rating failed', ref.id, err && err.message);
          }
          try {
            const priv = await ref.collection('private').doc('notify').get();
            const p = priv.exists ? priv.data() : {};
            // A split panel has no winner to announce. Say that instead
            // of picking one, which is the same discipline the ballot
            // itself is under.
            const who = ballot.winner === 'prop' ? ((d.prop && d.prop.name) || 'Prop')
              : ballot.winner === 'opp' ? ((d.opp && d.opp.name) || 'Opp') : '';
            const subject = who ? `Ballot in: ${who} wins` : 'Ballot in: the panel split';
            const headline = who
              ? `<p>The ballot is in on “${d.motion}”: <b>${who}</b> takes it, ${ballot.propPoints} to ${ballot.oppPoints}.</p>`
              : `<p>The judging panel split on “${d.motion}”, so the round is recorded without a winner. Every juror's reasoning is on the round page, and either of you can ask a human to review it.</p>`;
            const html = headline +
              `<p><a href="${SITE}/rounds?r=${ref.id}">Read the reason for decision</a></p>`;
            if (p.propEmail) await sendEmail(p.propEmail, subject, html);
            if (p.oppEmail && !d.aiOpp) await sendEmail(p.oppEmail, subject, html);
          } catch { /* best effort */ }
          continue;
        }

        if (d.state === 'complete') {
          // Second beat: the long-form full ballot. Only rounds judged
          // with a winner arrive here with sweepAt still set (see the
          // judging branch), so old completed rounds are never
          // backfilled and a split panel never schedules a ballot it
          // has no verdict to explain. Best effort with a tries cap:
          // the verdict above is complete on its own, so a round that
          // cannot get its full ballot is left as it was, not stranded.
          const b = d.ballot || null;
          const needDeep = b && (b.winner === 'prop' || b.winner === 'opp')
            && !b.rfdDeep && (b.rfdDeepTries || 0) < 3;
          if (!needDeep) { await ref.update({ sweepAt: FieldValue.delete() }); continue; }
          try {
            const { system, user } = deepBallotPrompt(d);
            const text = (await claude(system, user, 1800, DEEP_MODEL)).trim();
            if (!text) throw new Error('empty full ballot');
            await ref.update({
              'ballot.rfdDeep': text,
              'ballot.rfdDeepModel': DEEP_MODEL,
              'ballot.rfdDeepAt': Date.now(),
              sweepAt: FieldValue.delete(),
            });
            stats.deepBallots++;
          } catch (err) {
            console.warn('[async-sweep] full ballot failed', ref.id, err && err.message);
            const tries = ((b && b.rfdDeepTries) || 0) + 1;
            await ref.update({
              'ballot.rfdDeepTries': tries,
              ...(tries >= 3 ? { sweepAt: FieldValue.delete() } : { sweepAt: Date.now() + 10 * 60_000 }),
            });
          }
        }
      } catch (err) {
        stats.errors++;
        console.error('[async-sweep] round', doc.id, err && err.message);
        await doc.ref.update({ sweepAt: Date.now() + 10 * 60_000 }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[async-sweep] fatal', err);
    return new Response('error', { status: 500 });
  }

  console.log('[async-sweep]', JSON.stringify(stats));
  return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '*/15 * * * *' };
