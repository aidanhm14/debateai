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
import {
  mediaStore, readMediaBuffer, transcribe, claude, speechToMp3, sendEmail,
  newId, feedKeyFor, FEED_CACHE_KEY, FORMAT_NAMES, REPLY_WINDOW_MS,
  AI_UID, AI_NAME as AI_IDENT, AI_MAX_OPEN, AI_MIN_BOARD, AI_CHALLENGE_TTL_MS, SEED_MOTIONS,
} from './lib/async-rounds.mjs';

const SITE = process.env.SITE_ORIGIN || 'https://itsdebatable.com';
const OPP_MODEL   = process.env.ASYNC_OPP_MODEL   || 'claude-sonnet-5';
const JUDGE_MODEL = process.env.ASYNC_JUDGE_MODEL || 'claude-sonnet-5';
const TIME_BUDGET_MS = 18_000;   // stop starting new work near the 26s wall
const MAX_TRANSCRIPT_TRIES = 4;

const AI_NAME = AI_IDENT;

function oppSpeechPrompt(motion, format, openingTranscript) {
  const system =
    'You are The Debater, the AI sparring partner on Debatable, recording a spoken Opposition answer in an async round. ' +
    'Register: varsity debater on the circuit, spoken not written. 200 to 240 words. ' +
    'Structure: direct clash with the two strongest things the opening actually said, then one independent reason the motion fails, then one line of impact weighing. ' +
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
    '120 to 150 words. Rebuild your strongest point against what the answer actually said, concede nothing by silence on their best attack, ' +
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

function ballotPrompt(d) {
  const system = buildAdjudicationBlock() +
    '\n\nASYNC ROUND BALLOT. Three recorded speeches: Prop opening, Opp answer, Prop reply (the reply may be waived). ' +
    'Judge ONLY what is in the transcripts. Weigh the actual clash, not what could have been said. ' +
    'Return STRICT JSON, nothing else: {"winner":"prop"|"opp","propPoints":<25-30 one decimal>,"oppPoints":<25-30 one decimal>,"rfd":"<=150 words, plain register, name the deciding clash, no em dashes"}';
  const t = {};
  for (const turn of d.turns || []) t[turn.n] = turn.transcript || '[transcript unavailable]';
  const user =
    'Motion: ' + d.motion + '\nFormat: ' + (FORMAT_NAMES[d.format] || d.format) +
    '\n\nPROP OPENING (' + ((d.prop && d.prop.name) || 'Prop') + '):\n' + (t[1] || '[missing]') +
    '\n\nOPP ANSWER (' + ((d.opp && d.opp.name) || 'Opp') + (d.aiOpp ? ', AI opponent' : '') + '):\n' + (t[2] || '[missing]') +
    '\n\nPROP REPLY:\n' + (d.replyWaived ? '[reply waived — the opener did not record within the window]' : (t[3] || '[missing]'));
  return { system, user };
}

function parseBallot(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in ballot output');
  const j = JSON.parse(m[0]);
  const clamp = (x) => Math.max(25, Math.min(30, Math.round(Number(x) * 10) / 10 || 27));
  const propPoints = clamp(j.propPoints);
  const oppPoints = clamp(j.oppPoints);
  let winner = j.winner === 'prop' || j.winner === 'opp' ? j.winner : null;
  if (!winner) winner = propPoints >= oppPoints ? 'prop' : 'opp';
  return { winner, propPoints, oppPoints, rfd: String(j.rfd || '').slice(0, 1600) };
}

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
  const stats = { scanned: 0, transcribed: 0, aiAnswers: 0, waived: 0, ballots: 0, errors: 0 };

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
          await db.collection('async_rounds').doc().set({
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
            if (now >= (d.deadlineAt || 0)) {
              await ref.update({ feedKey: 'quiet', sweepAt: FieldValue.delete() });
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
          const { system, user } = ballotPrompt(d);
          const ballot = parseBallot(await claude(system, user, 900, JUDGE_MODEL));
          await ref.update({
            state: 'complete', feedKey: feedKeyFor('complete', d.visibility, d.hidden),
            ballot: { ...ballot, model: JUDGE_MODEL, at: Date.now() },
            completedAt: Date.now(), sweepAt: FieldValue.delete(),
          });
          stats.ballots++;
          await deleteCachedShared(FEED_CACHE_KEY).catch(() => {});
          try {
            const priv = await ref.collection('private').doc('notify').get();
            const p = priv.exists ? priv.data() : {};
            const who = ballot.winner === 'prop' ? ((d.prop && d.prop.name) || 'Prop') : ((d.opp && d.opp.name) || 'Opp');
            const html = `<p>The ballot is in on “${d.motion}”: <b>${who}</b> takes it, ${ballot.propPoints} to ${ballot.oppPoints}.</p>` +
              `<p><a href="${SITE}/rounds?r=${ref.id}">Read the reason for decision</a></p>`;
            if (p.propEmail) await sendEmail(p.propEmail, `Ballot in: ${who} wins`, html);
            if (p.oppEmail && !d.aiOpp) await sendEmail(p.oppEmail, `Ballot in: ${who} wins`, html);
          } catch { /* best effort */ }
          continue;
        }

        if (d.state === 'complete') {
          await ref.update({ sweepAt: FieldValue.delete() });
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
