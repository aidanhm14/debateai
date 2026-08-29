import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

const sparNight = read('app/js/spar-night.js');
const rsvp = read('app/netlify/functions/spar-rsvp.mjs');
const reminder = read('app/netlify/functions/scheduled-spar-night.mjs');
const notifications = read('app/js/notifications.js');
const spar = read('app/spar.html');
const rounds = read('app/rounds.html');
const asyncLib = read('app/netlify/functions/lib/async-rounds.mjs');
const asyncTurn = read('app/netlify/functions/async-turn.mjs');
const asyncSweep = read('app/netlify/functions/async-sweep.mjs');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const firstEvent = 'Date.UTC(2026, 6, 23, 0, 0, 0)';
check('Spar Night schedule is shared across client and server',
  sparNight.includes(firstEvent) && rsvp.includes(firstEvent) && reminder.includes(firstEvent));
check('Spar Night has three Wednesday sessions',
  sparNight.includes("{ hour: 7,  name: 'Asia-Pacific night'")
  && sparNight.includes("{ hour: 15, name: 'Europe night'")
  && sparNight.includes("{ hour: 20, name: 'US night'")
  && rsvp.includes('for (const hour of [7, 15, 20])')
  && reminder.includes('const SESSION_HOURS = [7, 15, 20]'));
check('Spar Night has a ninety-minute live window',
  sparNight.includes('90 * 60 * 1000')
  && rsvp.includes('90 * 60 * 1000')
  && reminder.includes('90 * 60 * 1000'));
check('anonymous reminder RSVP is wired',
  sparNight.includes("fetch('/api/spar-rsvp'")
  && sparNight.includes("var remindLabel = already ? 'You\\'re on the list' : 'Remind me'"));
check('RSVP endpoint validates and deduplicates email',
  rsvp.includes('EMAIL_RE.test(email)')
  && rsvp.includes("collection('spar_night_rsvps').doc(emailHash(email))"));
check('RSVP endpoint has bot and rate controls',
  rsvp.includes("body['bot-field']") && rsvp.includes('RATE_LIMIT = 5'));
check('scheduled reminder is configured weekly',
  reminder.includes("schedule: '0 9 * * 3'")
  && reminder.includes('MIN_GAP_RUN_MS = 5 * DAY_MS'));
check('scheduled reminder makes no matching-time promise',
  !reminder.includes('match with a real opponent in\n    seconds')
  && reminder.includes('live pool has a better chance'));
check('scheduled reminder honors opt-out and deduplicates addresses',
  reminder.includes("isOptedOut(prof, 'sparnight')")
  && reminder.includes('r.unsubscribed')
  && reminder.includes('mailedAddrs.has(addr)'));

check('background human matching requires an explicit toggle',
  notifications.includes("b.addEventListener('click', function (e) { e.stopPropagation(); setAvailable(!available); });"));
check('notification permission is requested only on a real opt-in',
  notifications.includes('if (available && !quiet) daAskNotify()'));
check('background queue status is honest',
  notifications.includes('Keep this tab open and we will ping you when a human opponent is ready.'));
check('background matcher writes a real matchmaking queue record',
  notifications.includes("db.collection('matchmaking_queue').doc(myUid)")
  && notifications.includes("status: 'waiting'")
  && notifications.includes('background: true'));
check('match notification names accept rather than auto-enter',
  notifications.includes("new Notification('Match found'")
  && notifications.includes("Tap to accept."));
check('match card offers accept and decline',
  notifications.includes('da-match-btn--decline')
  && notifications.includes('da-match-btn--accept'));
check('human queue never silently changes to AI',
  spar.includes('We will not switch you to AI.')
  && spar.includes('There is no time limit and no automatic AI fallback.'));
check('AI opponent is an explicit user decision',
  spar.includes('id="aiNowLink"') && spar.includes('Open Realtime Voice AI'));
check('spar page offers prep while waiting',
  spar.includes('Prep while waiting') && spar.includes('spar_prep_while_waiting'));

check('async board exposes open challenges and personal rounds',
  rounds.includes('Open challenges') && rounds.includes('My rounds'));
check('async opening and reply uploads are real API writes',
  rounds.includes("api('/api/async/upload'")
  && rounds.includes("api('/api/async/turn'"));
check('human answer window is twenty-four hours',
  asyncLib.includes('ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000')
  && rounds.includes('If no human answers within 24 hours'));
check('AI opponent takes over only after the human window',
  asyncSweep.includes('Human window closed: the AI opponent takes the other side.')
  && asyncSweep.includes('aiOpp: true'));
check('creator can explicitly call AI sooner',
  rounds.includes('Have the AI answer now')
  && read('app/netlify/functions/async-round.mjs').includes("action === 'expedite'"));
check('async turns advance through reply and judging states',
  asyncTurn.includes("state: 'awaiting_reply'")
  && asyncTurn.includes("state: 'judging'"));
check('async rounds finish with a ballot',
  asyncSweep.includes("state: 'complete'")
  && asyncSweep.includes('ballot: { ...ballot'));
check('async sweep runs frequently enough for stated latency',
  asyncSweep.includes("export const config = { schedule: '*/15 * * * *' }"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
