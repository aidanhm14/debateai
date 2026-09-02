#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────
// Guard for the live stage: viewers joining the broadcast to argue on it.
//
// Two things are being protected and they fail in different directions.
//
// THE DOOR. A hand raise is a record, never a seat; the send token is
// minted server-side against a verified uid at claim time; a seated
// person's side and name come from the seat map and never from the
// request body. Loosen any of those and a viewer can put themselves on
// a public broadcast, or put words in the other side's mouth.
//
// THE METHOD. An open-floor argument is judged by a method that says, in
// as many words, that taking the floor is not an argument. Lose that
// sentence and the judge starts pricing volume, which is the one failure
// mode a conversational ballot has that a speech ballot does not.
//
// Run: node scripts/test-stage.mjs   (also runs in the pre-commit hook)
// ─────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FN = join(ROOT, 'app/netlify/functions');

const S = await import(join(FN, 'lib/stage.mjs'));
const A = await import(join(FN, 'lib/adjudication.mjs'));

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; return; }
  fails.push(label);
}
function eq(actual, expected, label) {
  ok(Object.is(actual, expected), `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}
const src = (p) => readFileSync(join(FN, p), 'utf8');

// ── Mode and input hygiene ──────────────────────────────────────────
eq(S.normalizeMode('structured'), 'structured', 'structured mode accepted');
eq(S.normalizeMode('CASUAL'), 'casual', 'casual mode accepted case-insensitively');
eq(S.normalizeMode('freeform'), null, 'unknown mode rejected');
eq(S.normalizeMode(''), null, 'empty mode rejected');
eq(S.normalizeSide('PRO'), 'pro', 'side normalized');
eq(S.normalizeSide('centre'), null, 'unknown side rejected');
eq(S.otherSide('pro'), 'con', 'otherSide flips');

ok(S.cleanText('a\u0000b\u001fc', 40) === 'a b c', 'control characters stripped from stored text');
eq(S.cleanText('x'.repeat(400), 10).length, 10, 'text capped');
eq(S.cleanText(null, 10), '', 'null text is empty');

eq(S.normalizeCasualMs(480000), 480000, 'known casual length kept');
eq(S.normalizeCasualMs(99), S.DEFAULT_CASUAL_MS, 'unknown casual length falls back');
eq(S.normalizeCasualMs(60 * 60 * 1000), S.DEFAULT_CASUAL_MS, 'an hour-long floor is refused');

// ── A hand raise is not a seat ──────────────────────────────────────
const now = 1_000_000;
const built = S.buildRequest({ uid: 'u1', name: 'Ada', side: 'pro', mode: 'casual', note: 'hi' }, now);
ok(!built.error, 'valid request builds');
eq(built.request.state, 'pending', 'a new request is pending, not admitted');
ok(!('token' in built.request), 'a request never carries a credential');
ok(S.buildRequest({ uid: 'u1', mode: 'nope' }, now).error, 'request refuses an unknown mode');
eq(S.buildRequest({ uid: 'u1', mode: 'casual', name: '' }, now).request.name, 'Guest', 'a nameless request gets a placeholder');
eq(S.buildRequest({ uid: 'u1', mode: 'casual', side: 'sideways' }, now).request.side, null,
  'an unknown side preference becomes "either", never a seat');

const fresh = S.emptyBoard('room-1', now);
eq(S.seatOf(fresh, 'u1'), null, 'raising a hand does not seat anyone');
eq(fresh.status, 'idle', 'a new board is idle');

// ── Seating ─────────────────────────────────────────────────────────
eq(S.seatFor(fresh, 'con'), 'con', 'preference honoured when the seat is free');
const halfFull = { ...fresh, seats: { pro: { uid: 'a', name: 'A' }, con: null } };
eq(S.seatFor(halfFull, 'pro'), 'con', 'a taken preference falls back to the open seat');
const full = { ...fresh, seats: { pro: { uid: 'a', name: 'A' }, con: { uid: 'b', name: 'B' } } };
eq(S.seatFor(full, 'pro'), null, 'a full stage seats nobody');
eq(S.seatOf(full, 'b'), 'con', 'seatOf finds a seated uid');
eq(S.seatOf(full, 'zz'), null, 'seatOf refuses a stranger');
ok(S.seatedUids(full).length === 2, 'seatedUids lists both');

// ── The clock is an anchor, not a tick ──────────────────────────────
const structured = {
  ...full, status: 'debating', mode: 'structured', motion: 'Ban cars downtown',
  openedAt: now, speechIdx: 0, turnStartedAt: now,
};
const c0 = S.clockFor(structured, now + 1000);
eq(c0.side, 'pro', 'structured round opens on Pro');
eq(c0.endsAt, now + S.STRUCTURED_SEQUENCE[0].ms, 'the clock is an absolute end time');
eq(c0.remainingMs, S.STRUCTURED_SEQUENCE[0].ms - 1000, 'remaining derives from the anchor');
ok(!c0.expired, 'a running speech is not expired');
ok(S.clockFor(structured, now + S.STRUCTURED_SEQUENCE[0].ms + 1).expired, 'an overrun speech reports expired');

const casual = { ...full, status: 'debating', mode: 'casual', openedAt: now, casualMs: 300000 };
eq(S.clockFor(casual, now).side, null, 'an open floor is held by nobody');
eq(S.clockFor(casual, now).endsAt, now + 300000, 'the open floor ends at openedAt plus its length');
eq(S.clockFor({ ...casual, status: 'idle' }, now).running, false, 'an idle stage has no clock');

// ── Who may have a live microphone ──────────────────────────────────
ok(S.floorHolders(structured).length === 1 && S.floorHolders(structured)[0] === 'pro',
  'structured mode gives the floor to one side');
ok(S.floorHolders(casual).length === 2, 'casual mode is an open floor for both');
ok(S.floorHolders({ ...structured, status: 'idle' }).length === 0, 'an idle stage has no floor');

const advanced = S.advanceStructured(structured, now + 5000);
eq(advanced.speechIdx, 1, 'next turn advances the index');
eq(advanced.status, 'debating', 'the round continues mid-sequence');
eq(S.advanceStructured({ ...structured, speechIdx: S.STRUCTURED_SEQUENCE.length - 1 }, now).status, 'ended',
  'advancing past the last turn ends the round');

// ── A turn is attributed by the server, never by the sender ────────
const t = S.buildTurn({ uid: 'b', text: 'Cars are the problem.', side: 'pro', name: 'Impostor' }, casual, now + 2000);
ok(!t.error, 'a seated speaker may add a turn');
eq(t.turn.side, 'con', 'the side comes from the seat map, not the request body');
eq(t.turn.name, 'B', 'the name comes from the seat map, not the request body');
ok(S.buildTurn({ uid: 'nobody', text: 'let me in' }, casual, now).error, 'an unseated uid cannot add a turn');
ok(S.buildTurn({ uid: 'b', text: '   ' }, casual, now).error, 'an empty turn is refused');
eq(S.buildTurn({ uid: 'b', text: 'x'.repeat(9000) }, casual, now).turn.text.length, S.MAX_TURN_CHARS,
  'a paste bomb is capped');
ok(S.buildTurn({ uid: 'b', text: 'hi', startedAt: now - 999999 }, casual, now).turn.startedAt >= casual.openedAt,
  'a turn cannot claim to have started before the floor opened');

// ── Interruptions are annotation, and never a score ────────────────
const turns = [
  { side: 'pro', name: 'A', text: 'Congestion pricing cut traffic in London by fifteen percent.', startedAt: 0, endedAt: 6000 },
  { side: 'con', name: 'B', text: 'That is not the same as cutting car ownership though.', startedAt: 5000, endedAt: 9000 },
  { side: 'pro', name: 'A', text: 'Sure.', startedAt: 8800, endedAt: 9200 },
  { side: 'pro', name: 'A', text: 'Ownership is not what the policy targets, trips are.', startedAt: 9400, endedAt: 14000 },
  { side: 'pro', name: 'A', text: 'And the trip data is the part nobody disputes.', startedAt: 13900, endedAt: 18000 },
];
const marked = S.markInterruptions(turns);
eq(marked[1].interrupts, 'pro', 'a line that begins mid-sentence over the other side is marked');
ok(marked[1].overlapMs === 1000, 'the overlap is measured');
eq(marked[2].backchannel, true, 'a short agreement noise is backchannel, not floor-taking');
eq(marked[2].interrupts, null, 'backchannel never counts as an interruption');
eq(marked[3].interrupts, null, 'a clean hand-off is not an interruption');
eq(marked[4].interrupts, null, 'overlapping yourself is never an interruption');
const grazing = S.markInterruptions([
  { side: 'pro', name: 'A', text: 'A full sentence that ends about here.', startedAt: 0, endedAt: 5000 },
  { side: 'con', name: 'B', text: 'Answering that directly now.', startedAt: 4700, endedAt: 9000 },
]);
eq(grazing[1].interrupts, null, 'an overlap inside the clock-skew grace is a hand-off, not a cut-in');

// ── Airtime is reported and immediately disarmed ────────────────────
const air = S.airtime(turns);
ok(air.pro.turns === 4 && air.con.turns === 1, 'airtime counts turns per side');
ok(air.pro.words > air.con.words, 'airtime counts words per side');
const brief = S.airtimeBrief(turns);
ok(/AIRTIME/.test(brief), 'the airtime brief names itself');
ok(/not arguing better/i.test(brief), 'the airtime number never travels without its warning');
ok(/context only/i.test(brief), 'the airtime brief marks itself as context');

// ── The transcript the judge reads ──────────────────────────────────
const conv = S.conversationTranscript(turns, { ...casual, openedAt: 0 });
ok(/cuts in over PRO/.test(conv), 'the conversation transcript marks cut-ins for the judge');
ok(/short reaction/.test(conv), 'backchannel is labelled rather than dropped');
ok(/0:0[05]/.test(conv), 'the conversation transcript is timestamped');
ok(conv.includes('Congestion pricing'), 'the conversation transcript carries what was said');

const structuredTurns = [
  { side: 'pro', name: 'A', text: 'Opening case for the motion, at length.', startedAt: 0, endedAt: 5000, speechIdx: 0 },
  { side: 'con', name: 'B', text: 'That is wrong and here is a whole sentence about why.', startedAt: 2000, endedAt: 6000, speechIdx: 0 },
  { side: 'con', name: 'B', text: 'My own opening, delivered on my own clock.', startedAt: 8000, endedAt: 12000, speechIdx: 1 },
];
const st = S.structuredTranscript(structuredTurns, full);
ok(/Pro opening/.test(st), 'the structured transcript keeps the speech labels');
ok(/off-turn from the other side/.test(st), 'talking out of turn is reported to the judge');
ok(st.indexOf('Opening case') < st.indexOf('My own opening'), 'speeches stay in order');
ok(S.transcriptFor(turns, casual) === S.conversationTranscript(turns, casual), 'casual mode routes to the conversation transcript');
ok(S.transcriptFor(structuredTurns, { ...full, mode: 'structured' }) === S.structuredTranscript(structuredTurns, { ...full, mode: 'structured' }),
  'structured mode routes to the speech transcript');

// ── Nothing one-sided gets a ballot ─────────────────────────────────
const long = (side, n) => ({ side, name: side, text: 'word '.repeat(n), startedAt: 0, endedAt: 30000 });
eq(S.judgeReadiness([long('pro', 200)], casual).code, 'too_short', 'two lines are not a round');
const oneSided = [long('pro', 100), long('pro', 100), long('pro', 100), long('pro', 100)];
eq(S.judgeReadiness(oneSided, casual).code, 'con_silent', 'a monologue at a silent guest is refused');
const bothSpoke = [long('pro', 60), long('con', 60), long('pro', 60), long('con', 60)];
eq(S.judgeReadiness(bothSpoke, casual).ok, true, 'a real two-sided exchange is judgeable');

// ── The public projection leaks nothing ─────────────────────────────
const pub = S.publicBoard({ ...casual, motion: 'Ban cars' }, now);
const flat = JSON.stringify(pub);
ok(!/"uid"/.test(flat), 'the public board carries no uids');
ok(!flat.includes('"a"') || !/uid/.test(flat), 'the public board carries no seat uids');
eq(pub.seats.pro.name, 'A', 'the public board carries the on-camera name');
eq(pub.motion, 'Ban cars', 'the public board carries the question');
ok(Number.isFinite(pub.serverNow), 'the public board carries the server clock so clients can correct their own');
eq(S.publicBoard(fresh, now).active, false, 'an idle stage is not advertised as active');

// ── The host queue ──────────────────────────────────────────────────
const reqs = [
  { uid: 'x', name: 'X', mode: 'casual', state: 'pending', askedAt: now - 1000, seenAt: now },
  { uid: 'y', name: 'Y', mode: 'casual', state: 'pending', askedAt: now - 5000, seenAt: now },
  { uid: 'z', name: 'Z', mode: 'casual', state: 'admitted', askedAt: now - 9000, seenAt: now },
  { uid: 'g', name: 'Ghost', mode: 'casual', state: 'pending', askedAt: now - 900000, seenAt: now - 900000 },
];
const q = S.queueView(reqs, now);
eq(q.length, 2, 'admitted and stale requests leave the queue');
eq(q[0].uid, 'y', 'the queue is oldest first');
ok(q.every((r) => typeof r.waitingMs === 'number'), 'the queue reports how long each person has waited');
ok(S.isStale({ state: 'pending', seenAt: now - 900000 }, now), 'a request whose owner stopped polling is stale');
ok(!S.isStale({ state: 'pending', seenAt: now }, now), 'a live request is not stale');

// ── The conversation judging method ─────────────────────────────────
const conversationCore = A.buildAdjudicationBlock({ format: 'conversation' });
ok(conversationCore.startsWith('LIVE CONVERSATION JUDGING METHOD'),
  'an open-floor round routes to the conversation method');
ok(A.buildAdjudicationBlock({ format: 'quick' }).startsWith('CASUAL 1V1'),
  'a structured casual round still routes to the casual 1v1 method');
ok(A.buildAdjudicationBlock({ format: 'bp' }).startsWith('ADJUDICATION METHOD'),
  'a legacy format still routes to the tournament method');

// The sentences the method cannot lose. Each of these is a way the
// ballot goes wrong that a speech method has no equivalent of.
const mustSay = [
  [/TAKING THE FLOOR IS NOT AN ARGUMENT/, 'floor-taking is never an argument'],
  [/never worth a point and never costs one/i, 'interrupting neither wins nor loses'],
  [/did not thereby win/i, 'more airtime does not win'],
  [/NEVER COMPLETED IS NOT AN ARGUMENT/i, 'a point cut off and abandoned is credited to nobody'],
  [/neither side may claim it/i, 'an unfinished point is unresolved rather than awarded'],
  [/NOT YOURS TO PUNISH/i, 'the judge invents no conduct penalty for talking over someone'],
  [/Dodges/, 'dodging a direct question is scored'],
  [/Concessions/, 'spoken concessions bind'],
  [/artifacts of speaking/i, 'transcription noise is never scored'],
  [/accent/i, 'accent never counts'],
  [/is not a weaker arguer/i, 'being interrupted more is not a deficit'],
  [/never coin-flip/i, 'no tie-break'],
  [/never fill a gap/i, 'no invented arguments'],
  [/turned on whether/i, 'the deciding issue must be named'],
];
for (const [re, label] of mustSay) ok(re.test(conversationCore), `conversation method: ${label}`);

// ── Endpoint-level promises, read from source ───────────────────────
const stageSrc = src('stage.mjs');
// The provider set must MATCH the live-video door rather than narrow it:
// AGENTS.md pins google/phone/apple in seven places, and a stage seat
// that refused a phone account would make the site disagree with itself.
// The stricter half of this door is the adult age band below.
ok(/LIVE_VIDEO_PROVIDERS = new Set\(\['google\.com', 'phone', 'apple\.com'\]\)/.test(stageSrc),
  'the stage door takes the same accountable providers as every other live-video door');
ok(/if \(!LIVE_VIDEO_PROVIDERS\.has\(provider\)\)/.test(stageSrc),
  'the provider set is actually enforced on the verified token');
// Asserted as the literal guard EXPRESSION, not as the presence of the
// word 'adult'. The first version of this check matched the string
// 'minor' inside the refusal copy, so replacing the whole condition with
// `if (false)` left the assertion green while the door stood open.
ok(/const band = [^;]*age_bands|age_bands'\)\.doc\(uid\)/.test(stageSrc),
  'the stage door reads the server-side age band');
ok(/if \(!band\) return/.test(stageSrc), 'an unattested account is refused the stage');
ok(/if \(band !== 'adult'\)/.test(stageSrc), 'a minor is refused a seat on a public broadcast');
ok(/video_bans/.test(stageSrc), 'a video ban blocks the stage');
ok(/checkAppCheck/.test(stageSrc), 'the stage door is App Check gated');
ok(/checkLayers/.test(stageSrc), 'the stage door is rate limited');
ok((stageSrc.match(/mintStageToken\(/g) || []).length === 2,
  'the send token is minted in exactly one place (its definition and its single call)');
const claimBlock = stageSrc.slice(stageSrc.indexOf("action === 'claim'"), stageSrc.indexOf("action === 'leave'"));
ok(/if \(!mySeat\)/.test(claimBlock), 'claiming a token requires already holding a seat');
ok(/HOST_ACTIONS\.has\(action\) && !host/.test(stageSrc), 'host actions refuse a non-host');
// A debater ending their own turn early is theirs to do; ending SOMEBODY
// ELSE'S is not, and the seat is checked against the board's current step
// rather than against anything the caller sends.
ok(/if \(!host && \(!step \|\| mine !== step\.side\)\)/.test(stageSrc),
  'only the speaker on the clock (or the host) can advance a structured turn');
ok(!/HOST_ACTIONS = new Set\(\[[^\]]*'next'/.test(stageSrc),
  'next is not silently host-only after being shared');
ok(/'admit'|'sit'/.test(stageSrc) && !/action === 'seat-self'/.test(stageSrc),
  'there is no path for a viewer to seat themselves');

const judgeSrc = src('stage-judge.mjs');
ok(/format: conversation \? 'conversation' : 'quick'/.test(judgeSrc.replace(/\s+/g, ' ')) ||
   /conversation \? 'conversation' : 'quick'/.test(judgeSrc),
  'the mode picks the judging method');
// Same lesson: the identifier surviving is not the gate surviving. Assert
// that its result is what the early return is taken on.
ok(/const ready = judgeReadiness\(turns, board\);/.test(judgeSrc),
  'readiness is computed from the real transcript');
ok(/if \(!ready\.ok\) \{[\s\S]{0,400}?return jsonResponse/.test(judgeSrc),
  'a one-sided or too-short stage round returns before the panel is called');
ok(/writeAudit/.test(judgeSrc), 'a stage verdict still writes an audit row');
ok(!/applyRoundRating|rating-apply/.test(judgeSrc),
  'a stage round never moves the rating ladder');
ok(!/settleMarket|lib\/settle/.test(judgeSrc),
  'a stage round settles no market');
ok(!/recordJudgment/.test(judgeSrc),
  'a stage round writes no judgment record, so it cannot enter the economy by a side door');
ok(/ranked: false/.test(judgeSrc), 'the ballot says on its face that it is not ranked');

// MEASURED against the live model, not reasoned about: this method's
// ballot runs 1400-3000 output tokens, and with the prose first a long
// one truncated the object mid-`dimensions` and the whole ballot failed
// to parse. Prose LAST means an overrun costs a paragraph tail instead.
// Output tokens are also the wall clock, so the length rule is the
// latency budget as well as an editorial one.
ok(judgeSrc.indexOf('"dimensions": {') < judgeSrc.indexOf('"rfd": "<the decision'),
  'the scorecard is requested before the prose, so a long ballot cannot truncate it away');
ok(/LENGTH IS A HARD RULE/.test(judgeSrc), 'the ballot length is stated as a rule rather than a target');
ok(/NO line breaks in it at all/.test(judgeSrc),
  'the rfd is one unbroken paragraph: a literal newline inside a JSON string is invalid and the shared parser does a plain JSON.parse');
ok(/winner !== 'pro' && judged\.ballot\.winner !== 'con'/.test(judgeSrc),
  'an even panel split is not tie-broken');
ok(/body\.room \|\| stream\.roomName/.test(judgeSrc) && !/body\.transcript|body\.turns|body\.motion|body\.winner/.test(judgeSrc),
  'the judge reads the transcript from the server, never from the request body');

// The GATED list in app-check.js is a hand-kept mirror of "which routes
// call checkAppCheck()", and its documented failure mode is SILENT: the
// endpoint 401s and the client takes a fallback that looks like it works.
const appCheckSrc = readFileSync(join(ROOT, 'app/js/app-check.js'), 'utf8');
ok(/'\/api\/stage'/.test(appCheckSrc), 'the stage route is in the App Check GATED list');
ok(/'\/api\/stage-judge'/.test(appCheckSrc), 'the stage-judge route is in the App Check GATED list');

const statusSrc = src('stream-status.mjs');
ok(/publicBoard/.test(statusSrc), 'the player poll carries the public stage board');
ok(/stageOpen/.test(statusSrc), 'the player poll says whether hand raises are open');

console.log(`\n[test-stage] ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.error('  FAIL: ' + f);
  process.exit(1);
}
