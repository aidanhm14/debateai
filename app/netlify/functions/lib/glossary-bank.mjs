// Debate glossary terms for /learn/glossary.
//
// Single-page surface (not per-term URLs) with anchor IDs for each
// term. Pattern matches how Stripe Docs and other long-form glossaries
// rank: one canonical URL, deep content, structured DefinedTerm
// schema. Each entry becomes a DefinedTerm in a DefinedTermSet
// schema block, and gets an in-page anchor like /learn/glossary#kritik.
//
// Categories drive in-page grouping. Search/filter is a future move.
//
// Voice rules (per soul.md §5):
//   - No em-dashes. Periods, commas, semicolons only.
//   - No banned phrases.
//   - Definitions are short (1-3 sentences) + an optional example.
//   - Real debater register. Concrete examples beat abstract definitions.

export const GLOSSARY_CATEGORIES = {
  general:     'Argument fundamentals',
  judging:     'Judging & flow',
  apda:        'APDA Parliamentary',
  bp:          'British Parliamentary',
  asian:       'Asian Parliamentary',
  worlds:      'World Schools (WSDC)',
  policy:      'Policy / CX',
  ld:          'Lincoln-Douglas',
  pf:          'Public Forum',
  procedural:  'Theory & procedural',
};

export const GLOSSARY_BANK = {

  // ── General argument fundamentals ──
  'argument': {
    slug: 'argument',
    term: 'Argument',
    category: 'general',
    definition: "A claim supported by reasoning that connects to a consequence. Every debate argument has three parts: claim (what you assert), warrant (why it's true), and impact (why it matters).",
    relatedSlugs: ['claim', 'warrant', 'impact'],
    guideSlug: 'claim-warrant-impact',
    guideRoute: 'fundamentals',
  },
  'claim': {
    slug: 'claim',
    term: 'Claim',
    category: 'general',
    definition: 'The assertion you are defending. The position your argument takes. A claim alone is an opinion until you add a warrant.',
    example: '"Corporate political donations corrupt democracy" is a claim.',
    relatedSlugs: ['warrant', 'impact', 'argument'],
  },
  'warrant': {
    slug: 'warrant',
    term: 'Warrant',
    category: 'general',
    definition: 'The reasoning that makes a claim true. The mechanism, evidence, or logic that bridges the claim to reality. Without a warrant, a claim is bare assertion.',
    example: '"Elected officials demonstrably vote with donor interests over voter interests (Page and Gilens 2014)" warrants the claim about donor corruption.',
    relatedSlugs: ['claim', 'impact', 'link'],
  },
  'impact': {
    slug: 'impact',
    term: 'Impact',
    category: 'general',
    definition: 'The consequence of the claim being true. What the listener should care about. Without an impact, even a warranted claim is a fact nobody votes on.',
    example: '"90 percent of the country has no real political voice" is the impact downstream of the claim and warrant.',
    relatedSlugs: ['claim', 'warrant', 'weighing'],
  },
  'weighing': {
    slug: 'weighing',
    term: 'Weighing',
    category: 'general',
    definition: 'Comparing competing impacts on four axes: magnitude, probability, timeframe, reversibility. How judges decide rounds when both sides have offense on the flow.',
    relatedSlugs: ['magnitude', 'probability', 'timeframe', 'reversibility', 'impact'],
    guideSlug: 'weighing',
    guideRoute: 'fundamentals',
  },
  'magnitude': {
    slug: 'magnitude',
    term: 'Magnitude',
    category: 'general',
    definition: "How big the harm or benefit is. Measured in lives, dollars, or rights affected. One of the four weighing axes.",
    relatedSlugs: ['weighing', 'probability', 'impact'],
  },
  'probability': {
    slug: 'probability',
    term: 'Probability',
    category: 'general',
    definition: 'How likely an impact is to materialize. A certain small harm often outweighs a speculative large one. One of the four weighing axes.',
    relatedSlugs: ['weighing', 'magnitude', 'impact'],
  },
  'timeframe': {
    slug: 'timeframe',
    term: 'Timeframe',
    category: 'general',
    definition: 'How soon the impact lands. Near-term harms outweigh long-term harms when both sides have winnable paths and equal magnitude.',
    relatedSlugs: ['weighing', 'magnitude'],
  },
  'reversibility': {
    slug: 'reversibility',
    term: 'Reversibility',
    category: 'general',
    definition: 'Whether the harm can be undone. An irreversible harm outweighs a reversible one of equal size. Extinction outweighs recession.',
    relatedSlugs: ['weighing', 'magnitude'],
  },
  'link': {
    slug: 'link',
    term: 'Link',
    category: 'general',
    definition: "The connection between an action and its consequence in an argument. Distinct from the warrant: the link is the causal chain, the warrant is why that chain holds.",
    relatedSlugs: ['warrant', 'impact', 'disadvantage'],
  },
  'mitigation': {
    slug: 'mitigation',
    term: 'Mitigation',
    category: 'general',
    definition: '"Yes, but less." A rebuttal that concedes the opposing argument is real but contests its magnitude or probability.',
    relatedSlugs: ['turn', 'rebuttal'],
  },
  'turn': {
    slug: 'turn',
    term: 'Turn',
    category: 'general',
    definition: 'The strongest rebuttal type: proving an opposing argument actually helps your side. A turn does not just neutralize the argument; it converts it into offense.',
    example: '"They argued higher prices reduce consumption, which reduces emissions. Reducing emissions is what our framework wants. Their first contention is a reason to vote for us."',
    relatedSlugs: ['rebuttal', 'mitigation'],
    guideSlug: 'rebuttal',
    guideRoute: 'fundamentals',
  },
  'rebuttal': {
    slug: 'rebuttal',
    term: 'Rebuttal',
    category: 'general',
    definition: "Any move that attacks an opposing argument. The five types, in order of strength: impact attack, mitigation, warrant attack, link attack, turn.",
    relatedSlugs: ['turn', 'mitigation', 'warrant', 'link'],
    guideSlug: 'rebuttal',
    guideRoute: 'fundamentals',
  },
  'signposting': {
    slug: 'signposting',
    term: 'Signposting',
    category: 'general',
    definition: 'Verbal cues that tell the judge which argument you are on. Without signposting, the judge cannot track your speech on the flow.',
    example: '"Moving to their second contention. Three problems with the warrant."',
    relatedSlugs: ['flow'],
    guideSlug: 'signposting',
    guideRoute: 'fundamentals',
  },
  'framework': {
    slug: 'framework',
    term: 'Framework',
    category: 'general',
    definition: 'The lens through which the judge should evaluate the round. Most explicit in LD (value + criterion), but every format has one (Util in policy, comparative welfare in WSDC, etc.).',
    relatedSlugs: ['value', 'criterion', 'weighing'],
  },
  'burden-of-proof': {
    slug: 'burden-of-proof',
    term: 'Burden of proof',
    category: 'general',
    definition: 'What each side must demonstrate to win the round. Usually borne by the affirmative or proposition team, who proposes change.',
    relatedSlugs: ['framework'],
  },
  'preempt': {
    slug: 'preempt',
    term: 'Pre-empt (preempt)',
    category: 'general',
    definition: "Addressing an obvious opposing argument before they make it. \"Opp will say bodily autonomy. We agree it's a value. Here's why it's outweighed in this case.\"",
    relatedSlugs: ['rebuttal'],
  },

  // ── Judging / Flow ──
  'flow': {
    slug: 'flow',
    term: 'Flow',
    category: 'judging',
    definition: 'The judge\'s real-time written record of the round, organized by argument and column (left side / right side, or contention by contention). Used to write the ballot.',
    relatedSlugs: ['signposting', 'ballot', 'drop'],
  },
  'rfd': {
    slug: 'rfd',
    term: 'RFD (Reason for Decision)',
    abbreviation: 'RFD',
    category: 'judging',
    definition: "The judge's written or spoken justification for the ballot. Explains which arguments they bought, which they didn't, and why one side won.",
    relatedSlugs: ['ballot', 'flow'],
  },
  'ballot': {
    slug: 'ballot',
    term: 'Ballot',
    category: 'judging',
    definition: 'The official vote sheet a judge submits. Names the winning team and assigns speaker points to each debater.',
    relatedSlugs: ['rfd', 'speaks'],
  },
  'speaks': {
    slug: 'speaks',
    term: 'Speaker points (speaks)',
    abbreviation: 'speaks',
    category: 'judging',
    definition: 'Per-speaker scores on the ballot, typically 25-30 in most formats. Used to break ties and rank speakers across the tournament.',
    relatedSlugs: ['ballot'],
  },
  'drop': {
    slug: 'drop',
    term: 'Drop (dropped argument)',
    category: 'judging',
    definition: "An argument that goes unanswered. Most judges treat dropped arguments as conceded. \"You dropped their second contention\" is one of the worst things a judge can write.",
    relatedSlugs: ['flow', 'extend'],
  },
  'extend': {
    slug: 'extend',
    term: 'Extend',
    category: 'judging',
    definition: 'To carry an argument forward into the next speech, usually by adding new analysis or weighing. Extending without new substance is "thin" extension.',
    relatedSlugs: ['drop', 'flow'],
  },
  'tab': {
    slug: 'tab',
    term: 'Tab (tabulation)',
    category: 'judging',
    definition: 'The room or software that processes ballots and assigns pairings for the next round. "Tab" also refers to the tournament staff running it.',
    relatedSlugs: ['ballot'],
  },
  'bid': {
    slug: 'bid',
    term: 'Bid',
    category: 'judging',
    definition: 'A qualification for the Tournament of Champions (TOC) or similar national circuit championship. Earned by clearing the elimination rounds at a designated bid tournament.',
    relatedSlugs: [],
  },

  // ── APDA / general parliamentary ──
  'pmc': {
    slug: 'pmc',
    term: 'PMC (Prime Minister Constructive)',
    abbreviation: 'PMC',
    category: 'apda',
    definition: 'The first speech of an APDA round. 7 minutes. The PM defines the motion, builds the case, and pre-empts the strongest opp move.',
    relatedSlugs: ['loc', 'pmr'],
    guideSlug: 'asian-parli-pm-opening',
    guideRoute: 'guides',
  },
  'loc': {
    slug: 'loc',
    term: 'LOC (Leader of Opposition Constructive)',
    abbreviation: 'LOC',
    category: 'apda',
    definition: 'The second speech of an APDA round. 8 minutes. The LO tears down gov\'s case and builds offensive opp case (counter-narrative, counter-prop, or critique).',
    relatedSlugs: ['pmc', 'mgc', 'moc'],
    guideSlug: 'apda-opp-case',
    guideRoute: 'guides',
  },
  'mgc': {
    slug: 'mgc',
    term: 'MGC (Member of Government Constructive)',
    abbreviation: 'MGC',
    category: 'apda',
    definition: "The third speech of an APDA round. 8 minutes. Extends PM's case, responds to LOC, sets up the rebuttals.",
    relatedSlugs: ['pmc', 'moc'],
  },
  'moc': {
    slug: 'moc',
    term: 'MOC (Member of Opposition Constructive)',
    abbreviation: 'MOC',
    category: 'apda',
    definition: 'The fourth speech of an APDA round. 8 minutes. Last opp constructive. Often the strongest attack speech on the flow.',
    relatedSlugs: ['loc', 'lor'],
  },
  'lor': {
    slug: 'lor',
    term: 'LOR (Leader of Opposition Rebuttal)',
    abbreviation: 'LOR',
    category: 'apda',
    definition: 'The fifth speech of an APDA round. 4 minutes. No new arguments. Opp collapses to a strongest-voter and writes the opp ballot.',
    relatedSlugs: ['pmr', 'moc'],
  },
  'pmr': {
    slug: 'pmr',
    term: 'PMR (Prime Minister Rebuttal)',
    abbreviation: 'PMR',
    category: 'apda',
    definition: 'The last speech of an APDA round. 5 minutes. No new arguments except direct responses to MOC and LOR. The PM collapses to a voter, dismantles the LOR, and writes the gov ballot.',
    relatedSlugs: ['lor', 'pmc'],
    guideSlug: 'apda-pmr',
    guideRoute: 'guides',
  },
  'squirrel': {
    slug: 'squirrel',
    term: 'Squirrel',
    category: 'apda',
    definition: "An unreasonably narrow definition of the motion that gives Opp no ground to attack. Adjudicators on most circuits rule against squirrels on principle.",
    example: 'Motion: "TH would tax wealth." Squirrel: "We tax wealth above $5 billion held by individuals named John, in the city of Boise, on March 14th."',
    relatedSlugs: ['tight-case'],
  },
  'tight-case': {
    slug: 'tight-case',
    term: 'Tight case',
    category: 'apda',
    definition: "A narrow but defensible interpretation of the motion. Gives gov a winnable case while leaving opp legitimate ground. Distinguished from a squirrel by the reasonableness of the framing.",
    relatedSlugs: ['squirrel'],
  },
  'counter-prop': {
    slug: 'counter-prop',
    term: 'Counter-prop (counter-case)',
    category: 'apda',
    definition: 'An offensive opp strategy where opp proposes an alternative actor or mechanism instead of pure negation. Opp now has a case to defend on the flow.',
    relatedSlugs: ['loc'],
  },
  'poi': {
    slug: 'poi',
    term: 'POI (Point of Information)',
    abbreviation: 'POI',
    category: 'apda',
    definition: '15-second interruption offered to the current speaker during the protected middle of their speech (minutes 1 through second-to-last in most parli formats). Speaker may accept or refuse.',
    relatedSlugs: ['poo'],
    guideSlug: 'bp-poi',
    guideRoute: 'guides',
  },
  'poo': {
    slug: 'poo',
    term: 'POO (Point of Order)',
    abbreviation: 'POO',
    category: 'apda',
    definition: 'A challenge during the rebuttal that a speaker has introduced a new argument that should be struck. Adjudicator rules on the spot.',
    relatedSlugs: ['poi'],
  },
  'whip': {
    slug: 'whip',
    term: 'Whip speech',
    category: 'asian',
    definition: "The 3rd speaker's speech in Asian Parli, BP, and Worlds. 8 minutes. No new arguments. Identifies 2-3 key issues, walks each, weighs the round.",
    relatedSlugs: ['reply'],
    guideSlug: 'asian-parli-whip',
    guideRoute: 'guides',
  },
  'reply': {
    slug: 'reply',
    term: 'Reply speech',
    category: 'worlds',
    definition: 'A 4-minute closing speech in WSDC (and similar formats) given by the 1st or 2nd speaker. No new matter; new weighing and new comparisons are allowed. Reply order is Opposition first, then Proposition.',
    relatedSlugs: ['whip'],
    guideSlug: 'wsdc-reply-speech',
    guideRoute: 'guides',
  },
  'adjudicator': {
    slug: 'adjudicator',
    term: 'Adjudicator',
    category: 'apda',
    definition: "The judge of a parliamentary debate round. Term used in international (BP/Worlds/Asian) and APDA circuits.",
    relatedSlugs: ['flow', 'ballot'],
  },

  // ── British Parliamentary ──
  'opening-gov': {
    slug: 'opening-gov',
    term: 'Opening Government (OG)',
    abbreviation: 'OG',
    category: 'bp',
    definition: 'The first two speakers on the government side in BP/Worlds. PM and Deputy PM. They define the motion and build the initial gov case.',
    relatedSlugs: ['closing-gov', 'opening-opp', 'closing-opp'],
  },
  'closing-gov': {
    slug: 'closing-gov',
    term: 'Closing Government (CG)',
    abbreviation: 'CG',
    category: 'bp',
    definition: "The Member of Government and Government Whip in BP/Worlds. They extend OG's case with new material and close the gov side.",
    relatedSlugs: ['opening-gov', 'extension', 'knife'],
    guideSlug: 'bp-closing-extension',
    guideRoute: 'guides',
  },
  'opening-opp': {
    slug: 'opening-opp',
    term: 'Opening Opposition (OO)',
    abbreviation: 'OO',
    category: 'bp',
    definition: 'The first two speakers on opp side in BP/Worlds. LO and Deputy LO.',
    relatedSlugs: ['closing-opp', 'opening-gov'],
  },
  'closing-opp': {
    slug: 'closing-opp',
    term: 'Closing Opposition (CO)',
    abbreviation: 'CO',
    category: 'bp',
    definition: 'The Member of Opposition and Opposition Whip in BP/Worlds.',
    relatedSlugs: ['opening-opp', 'closing-gov'],
  },
  'extension': {
    slug: 'extension',
    term: 'Extension',
    category: 'bp',
    definition: "New substantive material the closing team adds that the opening team did not run. Required for closing to outrank opening on the bench.",
    relatedSlugs: ['knife', 'closing-gov', 'closing-opp'],
    guideSlug: 'bp-closing-extension',
    guideRoute: 'guides',
  },
  'knife': {
    slug: 'knife',
    term: 'Knife (knifing)',
    category: 'bp',
    definition: "When a closing team's extension implicitly contradicts the opening team on the same bench. Hurts both teams in adjudication.",
    relatedSlugs: ['extension'],
  },

  // ── Policy / CX ──
  '1ac': {
    slug: '1ac',
    term: '1AC (First Affirmative Constructive)',
    abbreviation: '1AC',
    category: 'policy',
    definition: 'The first speech of a Policy round. 8 minutes. The Aff reads the plan plus inherency, harms, solvency, and one or more advantages. Usually fully pre-written.',
    relatedSlugs: ['1nc', '2ac', 'plan', 'inherency', 'solvency'],
  },
  '1nc': {
    slug: '1nc',
    term: '1NC (First Negative Constructive)',
    abbreviation: '1NC',
    category: 'policy',
    definition: 'Second speech of a Policy round. 8 minutes. The Neg reads off-case positions (DAs, CPs, Ks, T) and case attacks.',
    relatedSlugs: ['1ac', '2ac', 'disadvantage', 'counterplan', 'kritik', 'topicality'],
  },
  'spread': {
    slug: 'spread',
    term: 'Spread (spreading)',
    category: 'policy',
    definition: 'Rapid delivery (350-450 WPM) of tagged evidence cards. Used to fit more arguments into each speech. Accepted on the national circuit; rejected by most lay judges.',
    example: 'Tag at 150 WPM, card body at 300, underlined warrant at 220, summary back to 150.',
    relatedSlugs: ['card', 'tag'],
    guideSlug: 'policy-speed-reading',
    guideRoute: 'guides',
  },
  'card': {
    slug: 'card',
    term: 'Evidence card (card)',
    category: 'policy',
    definition: 'A piece of evidence read in a Policy speech. Tagged with a claim, cited with author and year, and read with underlined/highlighted warrant text.',
    relatedSlugs: ['tag', 'spread'],
  },
  'tag': {
    slug: 'tag',
    term: 'Tag',
    category: 'policy',
    definition: 'The one-line claim that introduces an evidence card. Read at conversational pace; it is what the judge writes on the flow.',
    relatedSlugs: ['card', 'spread'],
  },
  'topicality': {
    slug: 'topicality',
    term: 'Topicality (T)',
    abbreviation: 'T',
    category: 'policy',
    definition: 'A procedural argument that the Aff plan does not fall under the resolution. Structure: interpretation, violation, standards, voters. Argued as an a-priori voter.',
    relatedSlugs: ['theory', 'kritik', 'disadvantage'],
  },
  'disadvantage': {
    slug: 'disadvantage',
    term: 'Disadvantage (DA)',
    abbreviation: 'DA',
    category: 'policy',
    definition: 'An argument that the plan causes a bad outcome. Four parts: uniqueness, link, internal link, impact.',
    relatedSlugs: ['counterplan', 'link', 'impact'],
  },
  'counterplan': {
    slug: 'counterplan',
    term: 'Counterplan (CP)',
    abbreviation: 'CP',
    category: 'policy',
    definition: 'A non-resolutional alternative that solves the case better than the plan or avoids the disadvantage. Must be competitive: mutually exclusive with the plan or generating a net benefit.',
    relatedSlugs: ['disadvantage', 'plan'],
  },
  'kritik': {
    slug: 'kritik',
    term: 'Kritik (K)',
    abbreviation: 'K',
    category: 'policy',
    definition: "A philosophical critique of the plan's underlying assumptions or epistemology. Three parts: link, impact, alternative. Common Ks: capitalism, security, biopower, settler colonialism.",
    relatedSlugs: ['framework', 'topicality'],
  },
  'inherency': {
    slug: 'inherency',
    term: 'Inherency',
    category: 'policy',
    definition: 'The status-quo barriers that prevent the plan from happening already. A stock issue: if inherency fails, the plan is non-resolutional.',
    relatedSlugs: ['solvency', '1ac'],
  },
  'solvency': {
    slug: 'solvency',
    term: 'Solvency',
    category: 'policy',
    definition: 'The argument that the plan actually solves the harm it identifies. A stock issue: if the plan does not solve, the case fails on its own terms.',
    relatedSlugs: ['inherency', '1ac'],
  },
  'plan': {
    slug: 'plan',
    term: 'Plan',
    category: 'policy',
    definition: 'The specific policy action the Aff defends under the resolution. Read in the 1AC. The plan text is what Aff has to solve through.',
    relatedSlugs: ['1ac', 'counterplan', 'solvency'],
  },

  // ── Theory & procedural ──
  'theory': {
    slug: 'theory',
    term: 'Theory',
    category: 'procedural',
    definition: 'Procedural arguments about how the round should be debated. Topicality, condo (conditionality), reciprocity, abuse arguments. Argued as a voter.',
    relatedSlugs: ['topicality', 'condo'],
  },
  'condo': {
    slug: 'condo',
    term: 'Condo (conditionality)',
    category: 'procedural',
    definition: "A theory argument that the Neg should not be allowed to run multiple conditional counterplans/Ks. \"Condo bad\" is one of the most-run theory shells in Policy.",
    relatedSlugs: ['theory', 'counterplan'],
  },

  // ── Lincoln-Douglas ──
  'value': {
    slug: 'value',
    term: 'Value (value premise)',
    category: 'ld',
    definition: 'The abstract concept the LD round is about. Standard values: Justice, Morality, Liberty, Equality, Wellbeing, Human Dignity. The lens through which the judge evaluates impacts.',
    relatedSlugs: ['criterion', 'framework'],
    guideSlug: 'ld-value-criterion',
    guideRoute: 'guides',
  },
  'criterion': {
    slug: 'criterion',
    term: 'Criterion (standard)',
    category: 'ld',
    definition: 'The standard for measuring whether something achieves the LD value. Common pairings: Justice/Veil of Ignorance, Morality/Categorical Imperative, Wellbeing/Utilitarianism.',
    relatedSlugs: ['value', 'framework'],
    guideSlug: 'ld-value-criterion',
    guideRoute: 'guides',
  },

  // ── Public Forum ──
  'crossfire': {
    slug: 'crossfire',
    term: 'Crossfire',
    category: 'pf',
    definition: '3-minute shared-time exchange in PF where both speakers can ask and answer questions. Comes after each constructive plus a grand crossfire before the final focus.',
    relatedSlugs: ['summary', 'final-focus'],
    guideSlug: 'pf-crossfire-questions',
    guideRoute: 'guides',
  },
  'summary': {
    slug: 'summary',
    term: 'Summary speech (PF)',
    category: 'pf',
    definition: '3-minute speech in PF after both rebuttals. Collapses the round into 2-3 voting issues. Plants the weighing that final focus will deepen.',
    relatedSlugs: ['final-focus', 'crossfire'],
    guideSlug: 'pf-summary-speech',
    guideRoute: 'guides',
  },
  'final-focus': {
    slug: 'final-focus',
    term: 'Final focus',
    category: 'pf',
    definition: 'The last speech in a PF round. 2 minutes. Crystallizes the round into one or two voters and writes the judge\'s ballot.',
    relatedSlugs: ['summary', 'crossfire'],
  },

  // ── WSDC ──
  'principle-practical': {
    slug: 'principle-practical',
    term: 'Principle vs Practical',
    category: 'worlds',
    definition: "A WSDC analytical frame that splits arguments into principled (rights, duties, values) and practical (outcomes, mechanisms, evidence). Strong WSDC teams build both.",
    relatedSlugs: ['framework'],
  },

};

export function getTerm(slug) {
  if (!slug) return null;
  return GLOSSARY_BANK[slug.toLowerCase()] || null;
}

export function listTerms() {
  return Object.values(GLOSSARY_BANK);
}

export function groupedByCategory() {
  const groups = {};
  Object.keys(GLOSSARY_CATEGORIES).forEach(cat => { groups[cat] = []; });
  Object.values(GLOSSARY_BANK).forEach(t => {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  });
  // Sort each category alphabetically by term name.
  Object.keys(groups).forEach(cat => {
    groups[cat].sort((a, b) => a.term.localeCompare(b.term));
  });
  return groups;
}
