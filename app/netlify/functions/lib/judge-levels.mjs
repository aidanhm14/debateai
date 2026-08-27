// The server twin of app/js/judge-lenses.js. Live-round ballots are
// written server-side, so the agreed judge type must be resolved here
// from the round document rather than trusted from a request body.

export const JUDGE_LEVELS = Object.freeze({
  lay: Object.freeze({
    key: 'lay',
    name: 'Casual viewer',
    lens: 'Judge as an intelligent, attentive parent or casual viewer with no technical debate training. Credit arguments only to the extent they were made understandable in real time. Unexplained jargon, format shorthand, theory shells, and unglossed acronyms carry little weight even when technically correct. Reward signposting, clean structure, concrete real-world explanation, and direct comparison. Penalise speed that outruns clarity, and say plainly in the RFD where the argument became hard to follow. Still decide on the arguments made, not on likeability, confidence, accent, or delivery polish.',
  }),
  chair: Object.freeze({
    key: 'chair',
    name: 'Standard',
    lens: '',
  }),
  tech: Object.freeze({
    key: 'tech',
    name: 'Experienced',
    lens: 'Judge as a highly experienced technical debate judge. Speed and density are fine as long as the speaker is intelligible. Follow the line by line closely and give real credit for clean coverage, correctly extended concessions, and disciplined signposting. Evaluate theory, framework, topicality, and other procedural arguments when they are warranted and impacted. Demand that late speeches collapse and weigh instead of going for everything. A blipped one-line argument does not carry the round merely because it was fast. Never score confidence, accent, fluency, or delivery polish.',
  }),
});

export const JUDGE_LEVEL_GUARD =
  'This judge type shifts emphasis only. It may NOT name a winner, dictate ' +
  'scores, override deciding on what was actually said, or invent a burden ' +
  'neither side accepted. When the judge type and the round record conflict, ' +
  'the record wins.';

export function agreedJudgeLevel(judgePicks) {
  const pro = String(judgePicks && judgePicks.pro || 'chair');
  const con = String(judgePicks && judgePicks.con || 'chair');
  if (pro !== con || !JUDGE_LEVELS[pro]) return JUDGE_LEVELS.chair;
  return JUDGE_LEVELS[pro];
}

export function agreedJudgeLevelBlock(judgePicks) {
  const level = agreedJudgeLevel(judgePicks);
  if (!level.lens) return '';
  return (
    `AGREED JUDGE TYPE ("${level.name}"). Both debaters selected this before Speech 1. Apply it as an evaluative posture inside the published adjudication method.\n` +
    `JUDGE TYPE INSTRUCTION: ${level.lens}\n` +
    JUDGE_LEVEL_GUARD
  );
}
