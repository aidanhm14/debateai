// Guards the derived speaker score. Runs in the pre-commit hook.
import { speakerScoreFromDims, deriveSpeakerScores, marginBand, AXIS_WEIGHTS } from '../app/netlify/functions/lib/speaker-score.mjs';
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL: ' + name); } };

const dims = (p, c) => ({
  clarity:{pro:p[0],con:c[0]}, reasoning:{pro:p[1],con:c[1]}, responsiveness:{pro:p[2],con:c[2]},
  weighing:{pro:p[3],con:c[3]}, persuasion:{pro:p[4],con:c[4]},
});

// The real published round that started this: axes say rout, the old
// headline said coin flip.
const rout = deriveSpeakerScores({ dimensions: dims([8,8,8,7,8],[4,3,3,2,3]), proPoints: 28.5, conPoints: 25.4 });
t('a rout on the axes reads as a rout', rout.pro - rout.con > 35);
t('the derived score ignores the model headline', rout.pro !== 28.5 && rout.con !== 25.4);
t('the rout is banded one sided', marginBand(rout.pro, rout.con) === 'one sided');
t('the old headline banded as razor thin', marginBand(28.5, 25.4) === 'razor thin');

const close = deriveSpeakerScores({ dimensions: dims([7,7,6,7,6],[7,6,7,7,6]) });
t('a close round still reads close', marginBand(close.pro, close.con) === 'razor thin');

t('scores sit on 1-100', rout.pro <= 100 && rout.con >= 1 && close.pro <= 100);
t('a perfect card is 100', speakerScoreFromDims(dims([10,10,10,10,10],[1,1,1,1,1]), 'pro') === 100);
t('a floor card is 10', speakerScoreFromDims(dims([1,1,1,1,1],[1,1,1,1,1]), 'pro') === 10);

// Weighting is a published claim: substance must outrank delivery.
t('reasoning outweighs persuasion', AXIS_WEIGHTS.reasoning > AXIS_WEIGHTS.persuasion);
t('responsiveness outweighs clarity', AXIS_WEIGHTS.responsiveness > AXIS_WEIGHTS.clarity);
t('persuasion is at the bottom of the ladder',
  AXIS_WEIGHTS.persuasion === Math.min(...Object.values(AXIS_WEIGHTS)));
// Compare like with like: one substance axis against one delivery axis.
// The first version of this test put clarity AND persuasion against
// reasoning, whose weights sum to exactly 2.5 either way, so it was
// symmetric by construction and proved nothing.
const polish    = speakerScoreFromDims({ reasoning:{pro:2},  persuasion:{pro:10} }, 'pro');
const substance = speakerScoreFromDims({ reasoning:{pro:10}, persuasion:{pro:2}  }, 'pro');
t('substance beats polish at equal spread', substance > polish + 25);

// Older ballots must not be punished for axes nobody asked them for.
const fourAxis = speakerScoreFromDims({ clarity:{pro:8}, reasoning:{pro:8}, responsiveness:{pro:8}, weighing:{pro:8} }, 'pro');
t('a four-axis ballot still scores on the same scale', fourAxis === 80);

// Degradation, not invention.
t('no dimensions yields null, never zero', speakerScoreFromDims(null, 'pro') === null);
t('unscorable dimensions yield null', speakerScoreFromDims({ clarity:{pro:'x'} }, 'pro') === null);
const fb = deriveSpeakerScores({ proPoints: 71, conPoints: 64 });
t('falls back to the model when no axis is scorable', fb.pro === 71 && fb.derived === false);
t('a derived pair says so', rout.derived === true);
t('out-of-range axis values clamp', speakerScoreFromDims({ reasoning:{pro:99} }, 'pro') === 100);

console.log(`\nspeaker-score: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
