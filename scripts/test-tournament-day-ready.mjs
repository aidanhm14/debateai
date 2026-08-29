import fs from 'node:fs';

const reminder = fs.readFileSync('app/netlify/functions/scheduled-tournament-day-reminder.mjs', 'utf8');
const cta = fs.readFileSync('app/js/tournament-day-cta.js', 'utf8');
const landing = fs.readFileSync('app/landing.html', 'utf8');
const leaderboard = fs.readFileSync('app/leaderboard.html', 'utf8');
const tournamentAdmin = fs.readFileSync('app/netlify/functions/tournament-admin.mjs', 'utf8');
const liveJudge = fs.readFileSync('app/netlify/functions/live-judge.mjs', 'utf8');
const liveRound = fs.readFileSync('app/live-round.html', 'utf8');
const failures = [];

function check(label, condition) {
  if (!condition) failures.push(label);
}

check('reminder runs at 6 AM Pacific on August 29',
  reminder.includes("schedule: '0,5,10,15,20,25,30,35,40,45,50 13 29 8 *'"));
check('reminder cannot send after contestants should already be in rooms',
  reminder.includes('now > EVENT_START_MS - 5 * 60_000'));
check('reminder targets tournament entry members',
  reminder.includes("collection('entries').get()")
  && reminder.includes('entrantUids.add(uid)'));
check('withdrawn and dropped entries are excluded',
  reminder.includes("new Set(['registered', 'checked_in'])"));
check('reminder honors the global transactional opt-out',
  reminder.includes("isOptedOut(profile, 'transactional')"));
check('reminder is idempotent per entrant and tournament',
  reminder.includes('tournamentDayReminderEventId === tournament.id')
  && reminder.includes('tournamentDayReminderSentAt: FieldValue.serverTimestamp()'));
check('a failed stamp cannot abort the remaining entrant sends',
  reminder.includes("errorReasons['stamp-failed']")
  && reminder.includes('stamp failed for'));
check('email sends contestants to the event page',
  reminder.includes('/open?utm_source=email')
  && reminder.includes('Open your event page'));
check('email carries the room, rules, stream, and reconnect instructions',
  ['Join your room', 'official rules', 'watch page', 'five minutes to return']
    .every((text) => reminder.includes(text)));
check('homepage CTA is loaded', landing.includes('/js/tournament-day-cta.js'));
check('homepage CTA is signed-in only and points to the event page',
  cta.includes('!user || user.isAnonymous')
  && cta.includes("cta.href = '/open'"));
check('homepage CTA clears the fixed topbar hit layer',
  cta.includes('margin:52px 0 0'));
check('homepage CTA does not double-space below the live-room strip',
  cta.includes('#homeLiveBand + .tday-cta{margin-top:0}'));
check('homepage CTA self-retires after tournament day',
  cta.includes("Date.parse('2026-08-29T23:59:59-07:00')"));
check('human Debate Rating is the leaderboard default',
  leaderboard.includes("const state={view:'live'"));
check('director-entered tournament results move the human rating',
  tournamentAdmin.includes("verdictSourceOverride: payload.verdictSource")
  && tournamentAdmin.includes("eventId: payload.room")
  && tournamentAdmin.includes("source: 'live'"));
check('tournament result amendments reverse the old rating first',
  tournamentAdmin.includes('await reverseRoundRating(db')
  && tournamentAdmin.includes('revision: amended ? prevRev + 1 : prevRev'));
check('the live judge follows the authoritative tournament winner and revision',
  liveJudge.includes('ratingBallot = { ...ballot, winner: winnerIsPro')
  && liveJudge.includes('rev: ratingRevision'));
check('participant screen sharing is absent from the live-room controls',
  !liveRound.includes("trayBtn('cvShare'")
  && !liveRound.includes("display-capture; autoplay"));
check('the resolution bar includes repeated timer and context controls',
  liveRound.includes('id="rmbTimerNum"')
  && liveRound.includes('id="rmbContextBtn"')
  && liveRound.includes('id="rmbAiCue">AI tools'));
check('the motion timer is driven by the canonical speech clock',
  liveRound.includes("var motionClock = $('rmbTimerNum')")
  && liveRound.includes("motionClock.textContent = num.textContent"));
check('tournament motion, format, side and judge controls are locked',
  liveRound.includes('function tournamentControlsLocked()')
  && liveRound.includes('Tournament resolution and sides are fixed by the draw.')
  && liveRound.includes('Tournament format is fixed.')
  && liveRound.includes('Three-judge council'));
check('tournament prep is fixed at five minutes',
  liveRound.includes('state.prepMin = tournamentControlsLocked() ? 5')
  && liveRound.includes('Tournament prep · fixed at 5 minutes')
  && liveRound.includes('setupPrep.disabled = tournamentControlsLocked()'));
check('verified tournament ballots ignore client judge preferences',
  liveJudge.includes("judgePicks: { pro: 'chair', con: 'chair' }")
  && liveJudge.includes('tourney.canonicalRound?.motion || d.motion')
  && liveJudge.includes("pairedParadigm: ''"));

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Tournament-day readiness guard passed');
