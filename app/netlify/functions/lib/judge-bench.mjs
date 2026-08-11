// ─────────────────────────────────────────────────────────────
// THE BENCH — faces for the jurors that already judge the round.
//
// WHAT THIS IS FOR
// The panel shipped as three provider strings. "anthropic / openai /
// google" is accurate and tells a debater nothing about what they are
// standing in front of. Real rounds are judged by people you can size
// up, and a panel you can picture is a panel you can argue TO. So each
// pinned juror family gets an archetype: a name, a glyph, and the thing
// it is hardest on.
//
// WHAT THIS IS NOT
// It is not a way to choose your judge, and it must never become one.
// The season pins the panel (lib/judge-charter.mjs) precisely so the
// operator cannot move an outcome by swapping models, and a debater
// picking a friendlier juror is the same hole with the thumb on the
// other side. That is why this module is PRESENTATION ONLY:
//
//   - It exports no vote, no score, no winner, and no model id.
//   - Nothing in the tally path (judge-panel.mjs) imports it, and
//     scripts/test-judge-integrity.mjs asserts that stays true.
//   - Personas are keyed to the PROVIDER FAMILY, then looked up through
//     the season's own juror list. Change the season pin and the bench
//     re-derives; the bench cannot pin anything itself.
//
// The archetypes are drawn from the rubric's own tests, not invented
// wholesale, so a debater reading a persona learns something true about
// how the ballot works. "Watches the delta" is a real rubric test.
//
// GUEST JUDGES (the bottom half of this file) are the opposite case and
// stay clearly separated: an unranked practice round settles nothing, so
// there you may seat whoever you like.
//
// COPY RULE: every string here renders on a public page. No em dashes,
// no banned phrases. Archetypes only, never a human name: invented
// people attached to real verdicts is the thing /arena already rejected.
// ─────────────────────────────────────────────────────────────

// ── the pinned bench ────────────────────────────────────────────────
//
// Keyed by provider family, because that is what the season pins. The
// `hardOn` line names rubric tests from RUBRICS.tests so the persona is
// a real description of a tendency rather than flavor text.
export const BENCH_PERSONAS = {
  anthropic: {
    key: 'anthropic',
    name: 'The Architect',
    glyph: '◈',
    color: '#D97757',
    seat: 'Chair',
    temper: 'Structural. Reads the case as a load-bearing thing and finds the beam that is missing.',
    hardOn: ['warrant', 'burden'],
    hardOnLine: 'Hardest on an unwarranted key claim and a burden nobody discharged.',
    paradigm: {
      note: [
        'I read a case the way you would read a building. Something is holding it up, and most rounds turn on whether that thing is actually there.',
        'So I go looking for the step you skipped. Not the flourish, the step. If the run from your claim to your impact never got said out loud, I am not going to say it for you, and the ballot will name the exact sub-claim your case needed and never went back for.',
        'Do that work and I am easy to win in front of. Tell me what your case has to prove. Prove it. Then tell me what theirs had to prove and did not.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Whatever you can hold. I lose the frame before I lose the words, so signpost.' },
        { k: 'Evidence', v: 'One source that says what your tag claims beats three that nearly do.' },
        { k: 'Drops', v: 'A drop counts once you tell me which beam it was holding up.' },
      ],
    },
  },
  openai: {
    key: 'openai',
    name: 'The Generalist',
    glyph: '◉',
    color: '#10a37f',
    seat: 'Wing',
    temper: 'Broad. Judges the round the way an educated stranger in the back row would.',
    hardOn: ['responsive', 'comparative'],
    hardOnLine: 'Hardest on a rebuttal that answers the original claim instead of the answer given.',
    paradigm: {
      note: [
        'Picture the back row. I am the person sitting in it: awake, reasonably smart, never been to a tournament.',
        'That means you have to beat the answer they actually gave you, not the version you prepared for on the bus. And you have to tell me why your world beats theirs in a sentence I could repeat to someone in the hallway afterwards.',
        'None of this is hostility to technical debate. I just do not hand out credit for anything I could not explain back.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Conversational to brisk. Past that I stop keeping up and you stop banking coverage.' },
        { k: 'Jargon', v: 'Fine if you gloss it once. Unglossed, it did not land.' },
        { k: 'Weighing', v: 'Do the comparison yourselves, or I default and say in the ballot that you made me.' },
      ],
    },
  },
  google: {
    key: 'google',
    name: 'The Registrar',
    glyph: '▦',
    color: '#4285F4',
    seat: 'Wing',
    temper: 'Literal. Holds the flow as the record and will not fill a gap that sounded fine.',
    hardOn: ['delta', 'status-quo'],
    hardOnLine: 'Hardest on offense the status quo already delivers, and a delta never shown.',
    paradigm: {
      note: [
        'The flow is the record. I write down what was said, in the speech it was said in, and that is what the round gets decided on.',
        'The gap I will not fill for you is the delta. Tell me what changes from the world we are already living in, and by how much. Plenty of true cases win nothing here, because the status quo was already doing the thing they promised.',
        'Answers are owed in the speech where they were owed. A point revived two speeches later is a new argument wearing an old name.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Fast is fine when it is clear. What I could not hear is not on the record at all.' },
        { k: 'Evidence', v: 'Recency and fit. A source about the neighbouring question is not a source about this one.' },
        { k: 'Extensions', v: 'Carry the warrant forward, not just the label.' },
      ],
    },
  },
  // Fallbacks so an override or a future season pin still renders a
  // face. An unnamed family is reported as unnamed rather than silently
  // borrowing another juror's persona.
  xai: {
    key: 'xai',
    name: 'The Contrarian',
    glyph: '◆',
    color: '#e5e7eb',
    seat: 'Wing',
    temper: 'Adversarial. Assumes the pretty argument is hiding the weak step.',
    hardOn: ['symmetry', 'terminal'],
    hardOnLine: 'Hardest on a mechanism that runs on both sides, and an impact that stops short.',
    paradigm: {
      note: [
        'The prettiest argument in the round is usually covering for the weakest step. That step is what I am listening for.',
        'If your mechanism runs just as well on their side, it cancels, and proving the asymmetry is your job. If your impact stops at awareness rising or money moving or confidence falling, it has not landed yet. Take it to the thing that happens to a person.',
        'I will rebuild the strongest version of an argument you strawmanned before I score that clash, so beat the real one.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Any speed you can hold.' },
        { k: 'Evidence', v: 'Read the qualifier out loud. An overclaimed source costs you more than a missing one.' },
        { k: 'Turns', v: 'Their own material turned against them beats any amount of defense.' },
      ],
    },
  },
  deepseek: {
    key: 'deepseek',
    name: 'The Auditor',
    glyph: '▨',
    color: '#4D6BFE',
    seat: 'Wing',
    temper: 'Mechanical. Follows the chain link by link and stops at the first one that is missing.',
    hardOn: ['actor', 'landed'],
    hardOnLine: 'Hardest on a behaviour change with no actor, and a chain that lost the listener partway.',
    paradigm: {
      note: [
        'I read your case as a chain and I check every link. The one that is missing is usually the one you were most confident about.',
        'For anything that turns on people acting differently, tell me who acts, why they want to, what power they have, and whether the timeline fits. Three of the four is not a mechanism.',
        'I also track where the chain stopped being followable. If I had to reconstruct your third step myself, you did not make it, and I will name the sentence where it went.',
      ],
      inPractice: [
        { k: 'Speed', v: 'Fast is fine. Skipping a link to save time is not.' },
        { k: 'Mechanisms', v: 'Actor, incentive, capacity, timeline. Name all four or I discount the step.' },
        { k: 'Rebuttal', v: 'Break one load-bearing link cleanly and you have done more than answering six things partly.' },
      ],
    },
  },
};

export const UNKNOWN_PERSONA = {
  key: 'unknown',
  name: 'Unnamed juror',
  glyph: '○',
  color: '#9ca3af',
  seat: 'Wing',
  temper: 'A juror family with no published archetype.',
  paradigm: {
    note: [
      'No published tendency for this juror family. The rubric is the whole of it, applied test by test in the order it publishes.',
    ],
    inPractice: [],
  },
  hardOn: [],
  hardOnLine: 'Applies the published rubric without a stated tendency.',
};

export function personaForProvider(provider) {
  return BENCH_PERSONAS[String(provider || '').toLowerCase()] || UNKNOWN_PERSONA;
}

// Render the bench for a season. Takes the season's OWN panel object so
// this function cannot introduce a juror the charter did not pin.
//
// `disclosedOverrides` maps jurorId to the model actually used, so an
// operational override shows on the bench card as a deviation instead of
// hiding behind the persona. Same posture as the charter endpoint.
export function benchForSeason(season, disclosedOverrides = {}) {
  const panel = season && season.panel;
  if (!panel || !Array.isArray(panel.jurors) || !panel.jurors.length) {
    return {
      seated: [],
      size: 1,
      quorum: 1,
      // A season with no panel is the pre-2026-07-30 single-judge era.
      // Say so rather than drawing three empty chairs.
      note: 'This window was judged by a single model, not a panel.',
      pinned: true,
    };
  }
  const seated = panel.jurors.map((j) => {
    const persona = personaForProvider(j.provider);
    const override = disclosedOverrides[j.id];
    return {
      jurorId: j.id,
      provider: j.provider,
      // The model id is public in the charter and the audit record
      // already. Repeated here so a bench card is self-contained.
      model: override || j.model,
      pinnedModel: j.model,
      overridden: !!override && override !== j.model,
      ...persona,
    };
  });
  return {
    seated,
    size: panel.size,
    quorum: panel.quorum,
    noMajority: panel.noMajority,
    pinned: true,
    note:
      'The bench is pinned by the season, not chosen by the debaters. '
      + 'A majority carries. An even split is recorded as no result rather than broken in anyone\'s favor.',
  };
}

// ── guest judges (unranked only) ────────────────────────────────────
//
// A practice round moves no ladder, settles no credits, and produces no
// public standing, so nothing is at stake in letting a debater pick who
// hears it. That is the entire justification, and it is why every entry
// carries ranked:false. If a surface ever wants a guest judge on a
// ranked round, the answer is no; seat the pinned bench.
//
// `house` is the engine roster key (lib/engines.mjs), so a guest judge
// is a house, not a hidden second panel.
export const GUEST_JUDGES = [
  {
    key: 'architect',
    house: 'claude',
    name: 'The Architect',
    glyph: '◈',
    color: '#D97757',
    lens: 'Structure and warrants',
    pitch: 'Wants the mechanism spelled out. Best when you are learning to build a case that holds.',
  },
  {
    key: 'generalist',
    house: 'gpt',
    name: 'The Generalist',
    glyph: '◉',
    color: '#10a37f',
    lens: 'The back row',
    pitch: 'Judges like a smart stranger. Best before a lay-judged final.',
  },
  {
    key: 'registrar',
    house: 'gemini',
    name: 'The Registrar',
    glyph: '▦',
    color: '#4285F4',
    lens: 'The flow as record',
    pitch: 'Punishes drops. Best when you keep losing rounds you thought you won.',
  },
  {
    key: 'contrarian',
    house: 'grok',
    name: 'The Contrarian',
    glyph: '◆',
    color: '#e5e7eb',
    lens: 'Adversarial reading',
    pitch: 'Assumes you are hiding the weak link. Best for pressure-testing a case you like too much.',
  },
  {
    key: 'actuary',
    house: 'deepseek',
    name: 'The Actuary',
    glyph: '▲',
    color: '#4D6BFE',
    lens: 'Impact arithmetic',
    pitch: 'Cold on magnitude and probability. Best for drilling weighing.',
  },
  {
    key: 'openbench',
    house: 'openlab',
    name: 'The Open Bench',
    glyph: '⬡',
    color: '#a78bfa',
    lens: 'Published weights',
    pitch: 'Any engine off the open roster. Best when you want a ballot you could reproduce yourself.',
  },
];

export function guestJudgeByKey(key) {
  return GUEST_JUDGES.find((g) => g.key === key) || null;
}

// Every guest judge is unranked by construction. Exported as a function
// rather than a flag on each row so a later edit cannot make one of them
// ranked by forgetting a field.
export function guestJudgeIsRanked() {
  return false;
}
