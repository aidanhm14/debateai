/* ─────────────────────────────────────────────────────────────
 * JUDGE LENSES — the paradigms a live round can actually be judged
 * under, in one place so /spar and /live-round cannot drift apart.
 *
 * WHAT A LENS IS
 * A live round's ballot is written by ONE judge, in the room, working
 * from the published adjudication method. The lens is the part the two
 * debaters get to agree on: it shifts what the ballot emphasises, what
 * gets resolved first, how hard a drop is punished, how much rope
 * speed and jargon get. It cannot name who wins and it cannot override
 * deciding on the flow. `lens` is the exact string that ships into the
 * ballot prompt, and live-round.html restates that guard for the model.
 *
 * WHY IT IS SHARED
 * /spar shows these before the queue resolves so a debater can read a
 * paradigm while they wait, and their pick rides into the round as a
 * NOMINATION. It binds only when the opponent independently picks the
 * same card, which is the safety property: you cannot be judged under
 * a paradigm the other side chose for you.
 *
 * 'chair' is the default and is deliberately lens-free. A round where
 * nobody touches this is judged exactly as it was before any of this
 * shipped.
 *
 * `note` and `inPractice` are the debater-facing read, written the way
 * a judge writes a paradigm. `lens` is what the model is told. Edit the
 * note freely; editing `lens` changes how rounds are judged.
 *
 * COPY RULE: every string here renders to users. No em dashes.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  window.JUDGE_LENSES = [
    {
      key: 'chair', name: 'Standard chair', accent: '#9aa4b2',
      tag: 'I judge the flow and I weigh what you weighed.',
      bullets: [
        'Decides on what was actually said, nothing imported.',
        'No house style. The default tournament read.',
        'Picked for you unless both sides agree on another.',
      ],
      note: [
        'I am the default, which mostly means I bring no house style to impose. You get the round the two of you ran.',
        'I decide on what was actually said. If you weighed it, I weigh it your way. If neither of you weighed anything, I name the default I fell back on and say in the ballot that you left it to me.',
        'Nobody has to agree to me. I am who hears the round when you have not agreed on anyone else.',
      ],
      inPractice: [
        { k: 'Lens', v: 'None applied. The published method is the whole of it.' },
        { k: 'Speed', v: 'Whatever the format expects of you.' },
        { k: 'Agreement', v: 'This is the seat you get by default, not one either of you picked.' },
      ],
      lens: '',
    },
    {
      key: 'tab', name: 'Tabula rasa', accent: '#7aa2f7',
      tag: 'I do nothing you do not tell me to do. A dropped argument is a won argument.',
      bullets: [
        'Silence concedes. Answer everything or lose it.',
        'No intervention. If you did not say it, it is not on my flow.',
        'Tell me how to evaluate, or I use your opponent’s instructions.',
      ],
      note: [
        'I do nothing you have not told me to do. That cuts both ways, and the second way is the one that surprises people.',
        'An argument that goes genuinely unanswered is conceded, and I will name the speech where it died. I will not fill in the warrant you were reaching for, I will not supply the obvious answer, and I will not credit a point you gestured at and never made.',
        'Where you hand me competing instructions for evaluating the round, I follow the one that was actually extended and explained, not the one I happen to find sensible.',
      ],
      inPractice: [
        { k: 'Drops', v: 'Silence concedes. Cover it or lose it.' },
        { k: 'Instructions', v: 'Tell me how to evaluate. If you do not, theirs stands.' },
        { k: 'Limits', v: 'A flatly false claim still does not become true by going unanswered.' },
      ],
      lens: 'Run the round as a strict tabula-rasa flow judge. Import nothing the debaters did not say: no filling in warrants, no supplying the obvious answer, no crediting an argument the speaker gestured at but never made. Treat a genuinely unanswered argument as conceded for the round and say so explicitly in the RFD, naming the speech where it went unanswered. Where the debaters gave you competing evaluative instructions, follow the one that was actually extended and explained rather than the one you find more sensible. Speaker points still reflect quality, and the truth-test guardrail in the method above still applies to flatly false claims.',
    },
    {
      key: 'truth', name: 'Truth tester', accent: '#5ea88a',
      tag: 'An unanswered claim still has to be true.',
      bullets: [
        'A false premise loses even when nobody catches it.',
        'Evidence quality over evidence volume.',
        'Real-world plausibility is part of the warrant.',
      ],
      note: [
        'An unanswered claim still has to be true. That is most of what you need to know about me.',
        'If a premise your case rests on is wrong about the world, I discount it even when your opponent missed it, and the ballot will say both that it went unanswered and why it failed anyway. Close rounds break toward whoever has the more plausible picture of how things actually work.',
        'None of that rescues a side that ran no offense, and I will not invent arguments neither of you made.',
      ],
      inPractice: [
        { k: 'Evidence', v: 'Quality and recency, and whether the source says what the tag claims.' },
        { k: 'Close calls', v: 'The more plausible causal story takes it.' },
        { k: 'Limits', v: 'Being right is not the same as being ahead. You still have to run offense.' },
      ],
      lens: 'Weight accuracy heavily. An unanswered claim does not automatically become true for the round: if a key premise is flatly wrong about the world, discount it even when the opponent missed it, and name in the RFD both that it went unanswered and why it still failed. Prefer the side whose factual and causal picture is more plausible when the flow leaves a clash close. Scrutinise evidence quality, recency, and whether a cited source actually supports the claim it is attached to. Do not invent arguments neither side made, and do not use this lens to rescue a side that ran no offense.',
    },
    {
      key: 'lay', name: 'Lay judge', accent: '#c98a7a',
      tag: 'Say it like the room has never seen a debate.',
      bullets: [
        'Jargon with no plain-language gloss does not score.',
        'Speed past clarity is your loss, not my problem.',
        'The clearest story about the real world usually wins.',
      ],
      note: [
        'Say it like the room has never seen a debate, because in front of me it has not.',
        'I am an attentive person with no technical training. Jargon with no plain gloss carries almost nothing here, theory shells land as noise, and speed past the point of clarity is your loss rather than my problem. Signpost, tell me what happens to real people, keep the round legible.',
        'I still decide on the arguments you made. Charm is not an argument, and the ballot will tell you exactly where I lost the thread.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Conversational. Past that I stop following and stop crediting.' },
        { k: 'Jargon', v: 'Gloss it once or it does not count.' },
        { k: 'Wins me', v: 'The clearest story about what actually happens to people.' },
      ],
      lens: 'Judge as an intelligent, attentive person with no technical debate training. Credit arguments only to the extent they were made intelligible: unexplained jargon, format shorthand, theory shells, and unglossed acronyms carry little weight even when technically correct. Reward signposting, clean structure, concrete real-world explanation, and speakers who make the stakes legible. Penalise speed that outruns clarity, and say plainly in the RFD where you lost the thread. Persuasion and comprehensibility matter more than coverage here. Still decide on the arguments made, not on likeability or delivery polish alone.',
    },
    {
      key: 'tech', name: 'Technical', accent: '#a78bfa',
      tag: 'Go as fast as you are clear. Line by line, and theory is live.',
      bullets: [
        'Coverage counts. Conceded lines are real offense.',
        'Theory and framework arguments get evaluated properly.',
        'Signpost and I will follow you anywhere.',
      ],
      note: [
        'Go as fast as you are clear. Density is fine. Unintelligible is not, and I will not pretend to have caught what I did not.',
        'I follow the line by line closely and pay for clean coverage, properly extended concessions, and disciplined signposting. Theory, framework, topicality, and other procedurals get evaluated on their merits instead of being waved off for being technical.',
        'What I want from your last speech is a collapse. Going for everything tells me you could not work out which arguments were winning.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Any speed you can stay clear at.' },
        { k: 'Theory', v: 'Live, when it is warranted and impacted.' },
        { k: 'Blips', v: 'A one line argument does not carry a round just because it was fast.' },
      ],
      lens: 'Judge on technical execution. Speed and density are fine as long as the speaker is intelligible; do not penalise a fast speech that was clear. Follow the line-by-line closely and give real credit for clean coverage, correctly extended concessions, and disciplined signposting. Evaluate theory, framework, topicality, and other procedural arguments properly when they are warranted and impacted rather than dismissing them for being technical. Demand that late speeches collapse and weigh instead of going for everything. Blipped one-line arguments still do not carry a round just because they were fast.',
    },
    {
      key: 'principle', name: 'Principle first', accent: '#e0af68',
      tag: 'Prove the right exists before you tell me it is useful.',
      bullets: [
        'Framework gets resolved before any impact is counted.',
        'Useful is not the same as owed. Build the bridge.',
        'A won principle can outweigh a bigger consequence.',
      ],
      note: [
        'Prove the right exists before you tell me it is useful. I resolve the framework before I count a single impact, and what happens there decides what counts as an impact at all.',
        'If you claim a right, an obligation, a dignity interest, or a democratic entitlement, build the bridge from valuable to owed. Utility alone never discharges that burden. Do the work and a won principle can outweigh a larger consequence.',
        'Naming a philosopher is not doing the work, and a final rebuttal cannot invent a framework the round never ran on.',
      ],
      inPractice: [
        { k: 'Order', v: 'Framework first, impacts second, and the first gates the second.' },
        { k: 'Philosophy', v: 'Warranted, not name dropped.' },
        { k: 'New frameworks', v: 'Not in the last speech.' },
      ],
      lens: 'Resolve the framework, value, criterion, or principled burden BEFORE weighing any consequences, and let that resolution gate what counts as an impact. Where a side claims a right, an obligation, a dignity interest, or a democratic entitlement, demand the bridge from "this is valuable" to "this is owed": utility alone never discharges that burden. A cleanly won and properly warranted principle can outweigh a larger consequentialist impact, but only if the team actually did the work of proving it rather than asserting a philosopher’s name. Do not let a final rebuttal invent a new framework the round never ran on.',
    },
    {
      key: 'calculus', name: 'Impact calculus', accent: '#ef4444',
      tag: 'If you do not weigh it, I will, and you will not like how.',
      bullets: [
        'Magnitude, probability, timeframe, reversibility. Out loud.',
        'Unweighed offense is dead weight, however true.',
        'Comparative or it does not score.',
      ],
      note: [
        'If you do not weigh it, I will, and you will not like how.',
        'Comparative weighing is the centre of my decision. Name the axis the clash turns on: magnitude, probability, timeframe, reversibility, or logical priority. An argument that never got compared to their world is dead weight however true it is.',
        'Stack offense without telling me why it outweighs and the ballot will say you forced me to default, name the default I used, and let both speaker scores carry it.',
      ],
      inPractice: [
        { k: 'Weighing', v: 'Start it in the middle speeches, not in the last one.' },
        { k: 'Impacts', v: 'Terminalise them. Take it to the thing that happens to a person.' },
        { k: 'If nobody weighs', v: 'I default, I name the default, and it costs you both.' },
      ],
      lens: 'Make explicit comparative weighing the centre of the decision. An argument that was never weighed against the other side’s world is dead weight no matter how true it is. Demand that teams name the axis a clash turns on: magnitude, probability, timeframe, reversibility, or logical priority. Reward the side that terminalises its impacts and does the comparison for you, and penalise the side that stacks offense without ever telling you why it outweighs. If neither side weighed, state in the RFD that they forced you to default, name the default you used, and let both speaker scores carry the cost.',
    },
  ];

  window.judgeLensByKey = function (key) {
    var list = window.JUDGE_LENSES;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0];
  };
})();
