import fs from 'node:fs';

const page = fs.readFileSync('app/leaderboard.html', 'utf8');
const start = page.indexOf('function ratingStory(r){');
const end = page.indexOf('// RATING_STORY_END');
const failures = [];

function check(label, condition) {
  if (!condition) failures.push(label);
}

check('rating story helper exists', start >= 0 && end > start);

let ratingStory = null;
let source = '';
if (start >= 0 && end > start) {
  source = page.slice(start, end);
  ratingStory = Function(source + '; return ratingStory;')();
}

const row = (overrides = {}) => ({
  _ratingRow: true,
  _provisional: true,
  _rounds: 1,
  _wins: 1,
  _draws: 0,
  _losses: 0,
  score: 1500,
  _peak: 1500,
  ...overrides,
});

if (ratingStory) {
  check('non-rating rows get no invented profile copy', ratingStory({ _rounds: 9 }) === '');
  check('one-win story explains volatility',
    ratingStory(row()) === 'One round, one win. A perfect start, with plenty of volatility left.');
  check('high opening rating gets a distinct hot-start story',
    ratingStory(row({ score: 1732, _peak: 1732 }))
      === 'One win and already above 1700. A flying start, but the number is still settling.');
  check('opening draw gets its own honest story',
    ratingStory(row({ _wins: 0, _draws: 1 })) === 'Opened with a draw. The rating is still finding its level.');
  check('opening loss does not shame the person',
    ratingStory(row({ _wins: 0, _losses: 1 })) === 'One round in. The next result can move this rating fast.');
  check('unbeaten provisional record is described from the record',
    ratingStory(row({ _rounds: 4, _wins: 4 })) === '4 wins from 4 rounds, still unbeaten. The rating is still settling.');
  check('provisional winning record stays explicitly unsettled',
    ratingStory(row({ _rounds: 4, _wins: 3, _losses: 1 })) === '3 wins from 4 rounds. The rating is still finding its level.');
  check('settled personal best uses the published peak',
    ratingStory(row({ _provisional: false, _rounds: 12, _wins: 7, _losses: 5, score: 1688, _peak: 1688 }))
      === '12 rated rounds and sitting at a personal best.');
  check('settled comeback uses the published peak gap',
    ratingStory(row({ _provisional: false, _rounds: 12, _wins: 5, _losses: 7, score: 1600, _peak: 1688 }))
      === 'Chasing a personal best of 1688. The comeback is on the board.');
}

check('story does not infer from identity or topic fields',
  !/displayName|photoURL|avatar|motion|subject|location|age/i.test(source));
check('light is the first-paint fallback',
  page.includes("if(!t || t==='day'){")
  && page.includes("localStorage.setItem('da-theme','light')")
  && page.includes("document.documentElement.setAttribute('data-theme','light')"));
check('dark palette remains available as an explicit theme',
  page.includes('[data-theme="crimson"]') && page.includes('--bg:#000'));
check('stories render on both podium and table rows',
  page.includes('rating-story rating-story--pod')
  && page.includes('<p class="rating-story">'));
check('story punctuation does not double in profile labels',
  page.includes("bits.push(story.replace(/[.!?]+$/,''))"));

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Leaderboard rating stories: 14 checks passed');
