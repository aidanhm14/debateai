/* ─────────────────────────────────────────────────────────────
 * LIVE ROUND JUDGE TYPES
 *
 * One shared three-level scale for /spar and /live-round. Both sides
 * see the same choices and must agree before Speech 1. `lens` is the
 * exact instruction applied by the client fallback ballot; the server
 * carries the same three values in lib/judge-levels.mjs.
 *
 * A type may shift emphasis inside the published adjudication method.
 * It may not name a winner, dictate points, override the round record,
 * or invent a burden neither side accepted.
 *
 * COPY RULE: every string here renders to users. No em dashes.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  window.JUDGE_LENSES = [
    {
      key: 'lay', name: 'Casual viewer', accent: '#c98a7a',
      tag: 'A parent or first-time viewer. Plain explanations come first.',
      bullets: [
        'Conversational pace and plain language.',
        'Jargon counts only when it is explained.',
        'The clearest real-world comparison usually wins.',
      ],
      note: [
        'Assume I am an attentive parent or audience member who has never watched competitive debate.',
        'Make every important point understandable the first time. Unexplained jargon, format shorthand, and speed past clarity carry little weight.',
        'I still decide on the arguments made. Charm is not an argument, and a simple claim still needs a reason.',
      ],
      inPractice: [
        { k: 'Rewards', v: 'Clear explanations, concrete examples, and comparisons an ordinary viewer can follow.' },
        { k: 'Punishes', v: 'Unexplained jargon, excessive speed, and technical moves that were never translated.' },
        { k: 'Costs you', v: 'A technical edge can disappear if a casual viewer could not understand why it mattered.' },
      ],
      lens: 'Judge as an intelligent, attentive parent or casual viewer with no technical debate training. Credit arguments only to the extent they were made understandable in real time. Unexplained jargon, format shorthand, theory shells, and unglossed acronyms carry little weight even when technically correct. Reward signposting, clean structure, concrete real-world explanation, and direct comparison. Penalise speed that outruns clarity, and say plainly in the RFD where the argument became hard to follow. Still decide on the arguments made, not on likeability, confidence, accent, or delivery polish.',
    },
    {
      key: 'chair', name: 'Standard', accent: '#9aa4b2',
      tag: 'The normal balanced judge. What was said and weighed decides.',
      bullets: [
        'Decides on what was actually said.',
        'Balances clarity, reasoning, responses, and weighing.',
        'The default for every round.',
      ],
      note: [
        'I bring no special house style. You get the round the two of you ran.',
        'I decide on what was actually said and compare the arguments the way you compared them. If neither side weighed a clash, I name the reasonable default I used.',
        'This is the default judge type. Both sides start here unless they agree to change it.',
      ],
      inPractice: [
        { k: 'Rewards', v: 'Complete arguments, direct responses, and explicit weighing.' },
        { k: 'Punishes', v: 'Missing reasoning, unanswered offense, and claims that never reach the ballot question.' },
        { k: 'Costs you', v: 'Nothing bespoke. A case that needs special treatment will not get it.' },
      ],
      lens: '',
    },
    {
      key: 'tech', name: 'Experienced', accent: '#a78bfa',
      tag: 'A highly experienced technical judge who follows line by line.',
      bullets: [
        'Coverage and correctly extended drops count.',
        'Theory, framework, and procedural arguments are live.',
        'Any speed is fine while every word stays clear.',
      ],
      note: [
        'Assume I am a highly experienced circuit judge. Density is fine. Unintelligible is not.',
        'I follow the line by line closely and credit clean coverage, properly extended concessions, disciplined signposting, and warranted procedural arguments.',
        'Late speeches should collapse and weigh. Going for everything suggests you did not identify what was winning.',
      ],
      inPractice: [
        { k: 'Rewards', v: 'Technical execution, line-by-line coverage, clean extensions, and disciplined signposting.' },
        { k: 'Punishes', v: 'Dropped offense, late answers, and procedural claims with no warrant or impact.' },
        { k: 'Costs you', v: 'A compelling big picture does not replace answering the line by line.' },
      ],
      lens: 'Judge as a highly experienced technical debate judge. Speed and density are fine as long as the speaker is intelligible. Follow the line by line closely and give real credit for clean coverage, correctly extended concessions, and disciplined signposting. Evaluate theory, framework, topicality, and other procedural arguments when they are warranted and impacted. Demand that late speeches collapse and weigh instead of going for everything. A blipped one-line argument does not carry the round merely because it was fast. Never score confidence, accent, fluency, or delivery polish.',
    },
  ];

  window.judgeLensByKey = function (key) {
    var list = window.JUDGE_LENSES;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    for (var j = 0; j < list.length; j++) if (list[j].key === 'chair') return list[j];
    return list[0];
  };
})();
