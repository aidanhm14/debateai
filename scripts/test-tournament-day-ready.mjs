import fs from 'node:fs';

const reminder = fs.readFileSync('app/netlify/functions/scheduled-tournament-day-reminder.mjs', 'utf8');
const kickoffReminder = fs.readFileSync('app/netlify/functions/scheduled-tournament-kickoff-reminder.mjs', 'utf8');
const cta = fs.readFileSync('app/js/tournament-day-cta.js', 'utf8');
const landing = fs.readFileSync('app/landing.html', 'utf8');
const leaderboard = fs.readFileSync('app/leaderboard.html', 'utf8');
const tournamentAdmin = fs.readFileSync('app/netlify/functions/tournament-admin.mjs', 'utf8');
const liveJudge = fs.readFileSync('app/netlify/functions/live-judge.mjs', 'utf8');
const liveRound = fs.readFileSync('app/live-round.html', 'utf8');
const open = fs.readFileSync('app/open.html', 'utf8');
const tournament = fs.readFileSync('app/tournament.html', 'utf8');
const failures = [];

function check(label, condition) {
  if (!condition) failures.push(label);
}

check('detailed rules email runs at the next five-minute mark',
  reminder.includes("schedule: '*/5 11 29 8 *'")
  && reminder.includes("SEND_AT_MS = Date.parse('2026-08-29T04:20:00-07:00')")
  && reminder.includes('now >= DETAILS_CUTOFF_MS'));
check('separate kickoff reminder runs at 6:55 AM Pacific',
  kickoffReminder.includes("schedule: '55 13 29 8 *'")
  && kickoffReminder.includes("SEND_AT_MS = Date.parse('2026-08-29T06:55:00-07:00')"));
check('kickoff reminder cannot send after contestants should already be in rooms',
  kickoffReminder.includes('now >= EVENT_START_MS'));
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
check('kickoff reminder has a separate idempotency stamp',
  kickoffReminder.includes('tournamentKickoffReminderEventId === tournament.id')
  && kickoffReminder.includes('tournamentKickoffReminderSentAt: FieldValue.serverTimestamp()'));
check('a failed stamp cannot abort the remaining entrant sends',
  reminder.includes("errorReasons['stamp-failed']")
  && reminder.includes('stamp failed for'));
check('detailed roster send stays below the ordinary mail rate ceiling',
  reminder.includes('const PACE_MS = 650'));
check('email sends contestants to the event page',
  reminder.includes('/open?utm_source=email')
  && reminder.includes('Check in now'));
check('email puts the schedule first and starts the stream at 6:50 Pacific',
  reminder.indexOf('<strong>Schedule</strong>') < reminder.indexOf('<strong>Check in:</strong>')
  && reminder.includes('6:50 AM Pacific, 9:50 AM Eastern')
  && reminder.includes('landing page')
  && reminder.includes('tournament room'));
check('email carries the check-in, room, rules, Discord, and reconnect instructions',
  ['Join your room', 'official rules', 'five minutes to return', 'https://discord.gg/WMHZW9BKvJ']
    .every((text) => reminder.includes(text)));
check('email explains resolutions and how a round works',
  ['three resolutions', 'secretly strike one', '90-second opening', '60-second reply']
    .every((text) => reminder.includes(text)));
check('email states the tournament recording, footage, and fair-winner goals',
  ['Every round is recorded', 'capture strong footage', 'awarding the winners fairly',
    'separate public-use permission', 'appeal a panel ballot for human review']
    .every((text) => reminder.includes(text)));
check('email carries question, spreading, and camera scoring expectations',
  ['Questions and interruptions', '250 words per minute', 'Camera presence adds 2',
    'Avatar mode subtracts 1', 'camera off or too dark subtracts 3']
    .every((text) => reminder.includes(text)));
check('email supplies matching HTML and plain-text bodies',
  reminder.includes('html: renderEmail') && reminder.includes('text: renderTextEmail'));
check('kickoff reminder is short, schedule-first, and points straight to check-in',
  kickoffReminder.indexOf('<strong>Schedule</strong>') < kickoffReminder.indexOf('The Open starts in five minutes')
  && kickoffReminder.includes('Check in now &rarr;')
  && kickoffReminder.includes('The stream is live')
  && kickoffReminder.includes('Join the <a href="${DISCORD_URL}"'));
check('kickoff reminder targets the same active entrant cohort',
  kickoffReminder.includes("collection('entries').get()")
  && kickoffReminder.includes("new Set(['registered', 'checked_in'])")
  && kickoffReminder.includes("isOptedOut(profile, 'transactional')"));
check('both tournament participant pages prompt registered arrivals to check in',
  [open, tournament].every((page) => page.includes("title: 'You made it. Check in now.'")
    && page.includes("confirmLabel: 'Check in now'")
    && page.includes("mine.status !== 'registered'")
    && page.includes("t.status === 'running'")));
check('arrival prompts recommend the official Discord as a backup',
  [open, tournament].every((page) => page.includes("linkLabel: 'Join Discord backup'")
    && page.includes("https://discord.gg/WMHZW9BKvJ")
    && page.includes('room links, schedule changes, or help if video fails')));
check('arrival prompt check-in preserves recording and age approval',
  [open, tournament].every((page) => page.includes("confirmTournamentRecording(t, 'Agree and check in')")
    && page.includes('recordingAccepted: true, adultOrGuardianApproved: true')));
check('Open prize tiles are compact direct children, not nested boxes',
  open.includes('grid-template-columns:repeat(3,minmax(0,1fr))')
  && open.includes('.prize>div')
  && !open.includes('.prize div'));
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
  && liveRound.includes("'· fixed by tournament draw'")
  && liveRound.includes("'· three-judge council fixed'")
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
