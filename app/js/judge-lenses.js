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
 * EVERY LENS STATES ITS COST. The `Costs you` row is not decoration and
 * is not optional on a new lens. A paradigm system is only fair if the
 * downside of picking one is knowable before you agree to it, and a card
 * that lists only what a judge rewards is an advert rather than a
 * paradigm. If you cannot name what a lens takes away, it is not
 * distinct enough to be a lens.
 *
 * WHAT NO LENS CAN DO, enforced in the adjudication core rather than
 * here: name a winner, dictate points, override deciding on the flow,
 * invent a burden neither side accepted, or penalise a debater for a
 * norm nobody stated before the round. A lens moves emphasis inside
 * those walls. That is the whole of its authority.
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
        { k: 'Costs you', v: 'Nothing, and nothing bespoke either. If your case needs a particular lens to land, this is not the seat that gives it to you.' },
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
        { k: 'Costs you', v: 'Your own silences, at full price. Everything you did not get to is conceded, and being right about it later does not buy it back.' },
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
        { k: 'Costs you', v: 'Clean technical wins. A drop you extended perfectly still loses if the underlying claim is wrong about the world.' },
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
        { k: 'Costs you', v: 'Everything technical. Theory, framework shells, and coverage-by-speed carry almost nothing here even when you are ahead on the flow.' },
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
        { k: 'Costs you', v: 'Credit for the big picture. A moving speech that never touched the line by line reads as a speech, not a rebuttal.' },
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
        { k: 'Costs you', v: 'Impact stacking. Win every consequence in the round and you still lose it if the framework went the other way.' },
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
        { k: 'Costs you', v: 'Unweighed offense. A true, warranted, conceded argument you never compared to their world scores close to zero here.' },
      ],
      lens: 'Make explicit comparative weighing the centre of the decision. An argument that was never weighed against the other side’s world is dead weight no matter how true it is. Demand that teams name the axis a clash turns on: magnitude, probability, timeframe, reversibility, or logical priority. Reward the side that terminalises its impacts and does the comparison for you, and penalise the side that stacks offense without ever telling you why it outweighs. If neither side weighed, state in the RFD that they forced you to default, name the default you used, and let both speaker scores carry the cost.',
    },
    {
      key: 'moved', name: 'Did you move me', accent: '#d08770',
      tag: 'I am a real listener hearing this once. Argue like it.',
      bullets: [
        'Concrete stakes beat abstractions with the same warrant.',
        'If I could not follow it live, it did not do its work.',
        'Delivery is not persuasion. I am reading arguments, not style.',
      ],
      note: [
        'I am a reasonable person hearing this once, in real time, with no transcript to go back to. That is the only thing that separates me from the standard chair.',
        'So an argument has to be built to be understood the first time. Concrete stakes over abstraction, a world I can picture and check, two things that matter rather than nine that might. Where two sides have the same warrant and one of them made me see it, that one is ahead.',
        'What I am not is a style judge. Charm, confidence, polish, pace, and accent are worth nothing here, and I will not credit persuasion unless I can name the argumentative move that earned it. I still decide on the flow. This lens moves the tie, not the round.',
      ],
      inPractice: [
        { k: 'Wins me', v: 'The side whose world I can still describe accurately after the round ends.' },
        { k: 'Never scored', v: 'Delivery, fluency, confidence, accent, or how much you sound like me.' },
        { k: 'Ceiling', v: 'Persuasion breaks a tie the flow left level. It never beats a won comparative.' },
        { k: 'Costs you', v: 'Density. Nine underexplained arguments lose to two I actually followed, even when you are technically ahead on more of them.' },
      ],
      lens: 'Judge as a reasonable listener hearing the round once, live, with no transcript. Credit an argument to the extent it was built to be understood the first time: concrete stakes over abstraction, a world the listener can picture and check, structure that survives being heard rather than read, and the discipline to develop two things that matter instead of gesturing at nine. Where both sides hold the same warrant, prefer the side that made the listener actually see it, and say in the RFD which line did that. Score persuasion ONLY where you can name the specific argumentative move that earned it. Never score charm, confidence, volume, pace, fluency, polish, vocabulary, accent, dialect, or whether the speaker sounds like you: a nervous speaker with a clear mechanism is more persuasive here than a smooth speaker with a gap. Persuasion never repairs a missing warrant, never rescues a side with no offense, and never overturns a won comparative. It decides the round only when every weighing rung above it came out genuinely level, and when it does you must say so in the RFD.',
    },
    {
      key: 'teaching', name: 'Teaching chair', accent: '#7f9f7f',
      tag: 'Same call, same bar. The ballot is written to be useful.',
      bullets: [
        'The decision is unchanged. Only the write-up changes.',
        'Most of the ballot is what to fix and how.',
        'No softer bar for anyone, including whoever is newer.',
      ],
      note: [
        'I call the round exactly as the standard chair would. Nothing about the bar moves, and that is deliberate: a lens that went easy on one debater would be unfair to the other one, who came to win a real round.',
        'What changes is the ballot. Most of it goes on the mechanics, in plain language: the two habits costing you the most, where in your speech the argument stopped being followable, and the specific thing to do differently next time rather than a general note that you should weigh more.',
        'I name jargon I had to decode instead of quietly docking you for it, and I will tell the winner what nearly lost it. Neither of those changes who won.',
      ],
      inPractice: [
        { k: 'The call', v: 'Identical to the standard chair. This lens does not touch the decision.' },
        { k: 'The ballot', v: 'Mostly diagnosis. Named habits, named moments, one concrete fix each.' },
        { k: 'Fairness', v: 'No lowered bar and no handicap, whoever is newer.' },
        { k: 'Costs you', v: 'Brevity. You get a long, blunt ballot about your own mechanics, including when you win.' },
      ],
      lens: 'Decide the round exactly as you would without this lens: the call, the speaker points, and the standards are all unchanged, and you must NOT go easier on a debater who reads as less experienced, because that would be unfair to their opponent. What changes is the ballot. Spend most of it on developmental feedback in plain language: name the two habits that cost each speaker the most, point to the specific moment their argument stopped being followable, and give one concrete, actionable fix for each rather than general advice to weigh more or signpost better. Where a speaker used format jargon, say what you understood it to mean instead of silently discounting it. Tell the winner what nearly lost it. Keep the verdict and the teaching visibly separate so nobody can mistake advice for the reason they lost.',
    },
  ];

  window.judgeLensByKey = function (key) {
    var list = window.JUDGE_LENSES;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0];
  };
})();
