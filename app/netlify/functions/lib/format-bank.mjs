// Per-format reference content for /learn/formats/{slug} pages.
//
// Each entry is sized to render a substantive page (~400-500 words of
// body content) without external lookups, so Google indexes real
// material and users get a useful overview before they try the format
// in the app. Source material: soul.md format voice rules, NSDA /
// federation docs, and the author's circuit experience.
//
// Schema notes:
//   slug             — URL fragment (matches FORMATS keys in debate-ai.html)
//   name             — display name
//   alias            — short alternative if commonly abbreviated
//   pitch            — one-line hook (used in meta description + H1 sub)
//   summary          — 2-3 paragraph overview
//   structure        — array of speech entries { code, name, time, side }
//   judging          — array of judging criteria bullets
//   sampleMotions    — 3-5 real or near-real motions
//   thingsThatWin    — array of "what wins in this format"
//   thingsToAvoid    — array of common errors
//   keywords         — comma list for keyword meta + JSON-LD

export const FORMAT_BANK = {
  apda: {
    slug: 'apda',
    name: 'APDA Parliamentary',
    alias: 'APDA',
    pitch: 'American Parliamentary Debate Association. Impromptu. 15 minutes prep, no internet, no evidence — just structured argument.',
    summary: [
      "APDA is the U.S. college parliamentary circuit. Two teams, two debaters per team. The Government (Gov) team proposes a case under a broad motion they pick from a slate; Opposition (Opp) takes it apart. Each side gives two speeches; the closing speeches are about weighing the round, not introducing new arguments.",
      "Every round is impromptu. You walk into the room, hear three motions, pick one, and have 15 minutes to build a case. No internet. No prepared evidence. The strongest APDA debaters carry a deep mental archive of analogies, frameworks, and historical cases that travel across topics.",
      "Judges are flow-based. They write down every argument and check whether it survives the round. A dropped argument is a conceded argument. The team that wins the central clash, weighs it credibly, and tells the cleanest ballot story wins.",
    ],
    structure: [
      { code: 'PMC', name: 'Prime Minister Constructive', time: '7 min', side: 'Gov' },
      { code: 'LOC', name: 'Leader of Opposition Constructive', time: '8 min', side: 'Opp' },
      { code: 'MGC', name: 'Member of Government Constructive', time: '8 min', side: 'Gov' },
      { code: 'MOC', name: 'Member of Opposition Constructive', time: '8 min', side: 'Opp' },
      { code: 'LOR', name: 'Leader of Opposition Rebuttal', time: '4 min', side: 'Opp' },
      { code: 'PMR', name: 'Prime Minister Rebuttal', time: '5 min', side: 'Gov' },
    ],
    judging: [
      'Argument quality and link analysis over rhetorical flourish.',
      'Weighing — magnitude, probability, timeframe, reversibility — is load-bearing.',
      'Dropped arguments are conceded. New arguments in rebuttals are stricken.',
      'Strategic collapsing in the rebuttal beats trying to extend everything.',
      'Humor lands when it carries an argument, not as standalone garnish.',
    ],
    sampleMotions: [
      'This House would let cities set their own immigration policy.',
      'This House regrets the rise of remote-first work.',
      'This House would scrap legacy admissions at universities.',
      'This House would tax wealth above $50 million annually.',
    ],
    thingsThatWin: [
      'Tight case framing: clear actor, clear mechanism, clear weighing.',
      'POI handling — accepting substantive POIs, refusing trivial ones.',
      'Clean signposting so the judge knows exactly which argument you are on.',
      'A memorable line per speech. One image, not five.',
    ],
    thingsToAvoid: [
      'Spreading. APDA judges flow but are not Policy-style flow judges.',
      'Fabricated evidence. APDA is impromptu — no citations needed or expected.',
      'Reading philosophy verbatim. Frameworks should be your own.',
      'Treating rebuttals like constructives. The PMR is about the ballot story.',
    ],
    keywords: ['APDA', 'parliamentary debate', 'college debate', 'impromptu debate'],
  },

  bp: {
    slug: 'bp',
    name: 'British Parliamentary',
    alias: 'BP',
    pitch: 'WUDC-style four-team format. Two teams per side, ranked 1 through 4. Whip speeches collapse the round.',
    summary: [
      "British Parliamentary is the format of the World Universities Debating Championship and most international circuits. Four teams of two debaters each take seats around the room. Opening Government and Opening Opposition take the first speeches; Closing Government and Closing Opposition follow.",
      "The defining feature is that teams on the SAME side compete with each other. You are ranked 1st through 4th. To win, you have to beat your bench partners on the same side as well as the opposing bench. That forces extensions — Closing teams need to introduce a substantively new argument or analysis that the Opening team did not bring.",
      "Whip speeches collapse the round into the single clash that wins. No new material — just weighing, comparing, and explaining why your bench beats every other bench.",
    ],
    structure: [
      { code: 'PM',  name: 'Prime Minister',           time: '7 min', side: 'OG' },
      { code: 'LO',  name: 'Leader of Opposition',     time: '7 min', side: 'OO' },
      { code: 'DPM', name: 'Deputy Prime Minister',    time: '7 min', side: 'OG' },
      { code: 'DLO', name: 'Deputy Leader of Opposition', time: '7 min', side: 'OO' },
      { code: 'MG',  name: 'Member of Government',     time: '7 min', side: 'CG' },
      { code: 'MO',  name: 'Member of Opposition',     time: '7 min', side: 'CO' },
      { code: 'GW',  name: 'Government Whip',          time: '7 min', side: 'CG' },
      { code: 'OW',  name: 'Opposition Whip',          time: '7 min', side: 'CO' },
    ],
    judging: [
      'Teams are ranked 1-4 by quality of contribution to the round.',
      'Closing teams must extend — introduce a new argument or layer.',
      'POIs accepted between minute 1 and minute 6 of each speech.',
      'Weighing and comparative analysis decide tight rounds.',
      'Whip speeches are about strategic collapse, not summary.',
    ],
    sampleMotions: [
      'This House would mandate open-source release of any AI model trained on public-internet data.',
      'This House would phase out the United Nations Security Council veto.',
      'This House regrets the dominance of streaming services in music.',
      'This House would treat addiction as a medical condition, not a moral failing.',
    ],
    thingsThatWin: [
      'A genuinely new extension from Closing — not a re-skin of Opening.',
      'POI handling that turns the opponent\'s question into your point.',
      'Whip speeches that explicitly compare bench-to-bench, not just side-to-side.',
      'Clear, repeated weighing on a small number of strong points.',
    ],
    thingsToAvoid: [
      'Closing teams re-arguing what Opening already said.',
      'Refusing POIs across an entire speech.',
      'Whip speeches that introduce new arguments (penalized).',
      'Trying to win every clash. Pick three and weigh them.',
    ],
    keywords: ['British Parliamentary', 'BP debate', 'WUDC', 'Worlds debate'],
  },

  worlds: {
    slug: 'worlds',
    name: 'World Schools',
    alias: 'WSDC',
    pitch: 'High school international format. Three speakers per team, prepared and impromptu motions, POIs throughout.',
    summary: [
      "World Schools Debating Championship format is the high-school international standard. Three debaters per team across two teams, with prepared motions released in advance and impromptu motions assigned with one hour of prep on the day.",
      "Each speaker delivers an 8-minute speech, with a fourth reply speech of 4 minutes from speakers 1 or 2. POIs (Points of Information) can be offered between minute 1 and minute 7. The format rewards generalists who can carry an argument across speeches and engage POIs without losing structure.",
      "Judging is structured around four pillars: style, content, strategy, and POIs. Unlike BP, judges typically award the round on a coherent team narrative rather than ranking speakers individually.",
    ],
    structure: [
      { code: '1st Prop', name: 'First Proposition', time: '8 min', side: 'Prop' },
      { code: '1st Opp',  name: 'First Opposition',  time: '8 min', side: 'Opp' },
      { code: '2nd Prop', name: 'Second Proposition', time: '8 min', side: 'Prop' },
      { code: '2nd Opp',  name: 'Second Opposition',  time: '8 min', side: 'Opp' },
      { code: '3rd Prop', name: 'Third Proposition',  time: '8 min', side: 'Prop' },
      { code: '3rd Opp',  name: 'Third Opposition',   time: '8 min', side: 'Opp' },
      { code: 'Reply Opp', name: 'Opposition Reply',  time: '4 min', side: 'Opp' },
      { code: 'Reply Prop', name: 'Proposition Reply', time: '4 min', side: 'Prop' },
    ],
    judging: [
      'Four pillars: style (40%), content (40%), strategy (20%), POIs (cross-cutting).',
      'Team narrative trumps individual speech wins.',
      'POI offers and acceptances are tracked and judged.',
      'Reply speeches are weighing only — no new material.',
      'Manner matters more than in BP or APDA.',
    ],
    sampleMotions: [
      'This House would ban single-use plastics globally.',
      'This House would require ranked-choice voting in all U.S. federal elections.',
      'This House would lower the legal voting age in U.S. national elections to 16.',
      'This House would require all news organizations to disclose anonymous-source agreements.',
    ],
    thingsThatWin: [
      'Speaker 1 sets the framework, Speaker 2 carries the case, Speaker 3 weighs.',
      'POIs offered every 15 seconds, accepted 2-3 times per speech.',
      'Reply speeches that explicitly weigh on judge-stated criteria.',
      'A team line every speaker references — coherence wins close rounds.',
    ],
    thingsToAvoid: [
      'Speed reading. WSDC is a measured-pace format.',
      'New arguments in reply (heavily penalized).',
      'Ignoring POIs across a whole speech.',
      'Speaker 3 introducing entirely new contentions.',
    ],
    keywords: ['World Schools debate', 'WSDC', 'high school debate', 'WSDC format'],
  },

  asian: {
    slug: 'asian',
    name: 'Asian Parliamentary',
    alias: 'AP',
    pitch: 'Three-on-three regional format dominant across South and Southeast Asia. POIs throughout. Whip and reply speeches collapse.',
    summary: [
      "Asian Parliamentary is the dominant format across India, Pakistan, Bangladesh, Sri Lanka, Singapore, and most of Southeast Asia. Three debaters per team, two teams (Government and Opposition). The format is structurally similar to WSDC but with regional inflections — slightly more aggressive POI culture, more frequent use of definitional debate, and reply-speech conventions that differ from WSDC.",
      "Government opens by defining the motion and presenting the case. Opposition responds with rebuttal and counter-case. Each team's third speaker (whip) collapses to the strongest clash. The reply speech goes to either the first or second speaker and is purely weighing — no new material.",
      "Indian and South Asian school circuits run hundreds of Asian Parli rounds every weekend. The format rewards clarity, speed of refutation, and POIs that the speaker actually answers (not just acknowledges).",
    ],
    structure: [
      { code: 'PM', name: 'Prime Minister',            time: '7 min', side: 'Gov' },
      { code: 'LO', name: 'Leader of Opposition',      time: '7 min', side: 'Opp' },
      { code: 'DPM', name: 'Deputy Prime Minister',    time: '7 min', side: 'Gov' },
      { code: 'DLO', name: 'Deputy Leader of Opposition', time: '7 min', side: 'Opp' },
      { code: 'GW', name: 'Government Whip',           time: '7 min', side: 'Gov' },
      { code: 'OW', name: 'Opposition Whip',           time: '7 min', side: 'Opp' },
      { code: 'Reply Opp', name: 'Opposition Reply',   time: '4 min', side: 'Opp' },
      { code: 'Reply Gov', name: 'Government Reply',   time: '4 min', side: 'Gov' },
    ],
    judging: [
      'Argument quality + clash + style, weighted roughly equally.',
      'POIs are expected — refusal across a full speech reads as evasion.',
      'Definitional challenges are common but should not be the only response.',
      'Whip speeches synthesize, reply speeches weigh.',
      'Manner matters but speed does not disqualify if clarity holds.',
    ],
    sampleMotions: [
      'This House would scrap the gaokao / JEE in favor of holistic university admissions.',
      'This House would lift the ban on commercial surrogacy in India.',
      'This House would require all candidates for high office to release a decade of tax returns.',
      'This House would require children to obtain parental consent to use social media until age 16.',
    ],
    thingsThatWin: [
      'Definition that is reasonable, predictable, and clearly within the motion.',
      'Aggressive but answerable POIs — set traps with them.',
      'Whip that names the three best clashes and explicitly weighs them.',
      'Reply speech that does NOT recap — it tells the judge what they already know in the order they should write it.',
    ],
    thingsToAvoid: [
      'Squirreling the definition (defining outside reasonable scope).',
      'POIs that re-ask what the speaker already addressed.',
      'Whip speeches that introduce new examples or contentions.',
      'Reply speeches that re-argue rather than weigh.',
    ],
    keywords: ['Asian Parliamentary', 'AP debate', 'Indian schools debate', 'Indian debate format', 'JPDU', 'KPDU'],
  },

  pf: {
    slug: 'pf',
    name: 'Public Forum',
    alias: 'PF',
    pitch: 'NSDA U.S. high school format. Resolution rotates monthly. Evidence-driven, two-on-two, four-minute speeches.',
    summary: [
      "Public Forum is the NSDA's flagship high-school format and the most widely competed event in U.S. high-school debate. The resolution rotates roughly monthly during the season; teams debate the same topic for a few weeks before it changes. Two teams of two debaters, four constructive speeches followed by crossfire, summary, and final-focus speeches.",
      "PF is evidence-heavy. Cards (cited evidence from named sources) are mandatory in constructive speeches and across rebuttals. The format rewards clean evidence comparison — which study has a larger sample, which is more recent, which controls for confounds.",
      "Crossfire periods between speeches are where strategy lives. The format is fast but not Policy-fast; clarity matters more than speed. Final focus is purely weighing — no new arguments, just a closing brief on why your impact outweighs.",
    ],
    structure: [
      { code: '1AC', name: 'First Pro Constructive',     time: '4 min', side: 'Pro' },
      { code: '1NC', name: 'First Con Constructive',     time: '4 min', side: 'Con' },
      { code: 'CF1', name: 'Crossfire (Speakers 1)',     time: '3 min', side: 'Both' },
      { code: '2AC', name: 'Second Pro Constructive',    time: '4 min', side: 'Pro' },
      { code: '2NC', name: 'Second Con Constructive',    time: '4 min', side: 'Con' },
      { code: 'CF2', name: 'Crossfire (Speakers 2)',     time: '3 min', side: 'Both' },
      { code: 'PS',  name: 'Pro Summary',                time: '3 min', side: 'Pro' },
      { code: 'CS',  name: 'Con Summary',                time: '3 min', side: 'Con' },
      { code: 'GCX', name: 'Grand Crossfire',            time: '3 min', side: 'Both' },
      { code: 'PF',  name: 'Pro Final Focus',            time: '2 min', side: 'Pro' },
      { code: 'CF',  name: 'Con Final Focus',            time: '2 min', side: 'Con' },
    ],
    judging: [
      'Evidence quality (recency, source, methodology) is decisive.',
      'Crossfire performance is judged — not just speech delivery.',
      'Summary and final-focus speeches must weigh, not re-argue.',
      'Lay judges are common — clarity beats jargon.',
      'Dropped arguments in summary are usually treated as conceded.',
    ],
    sampleMotions: [
      'Resolved: The United States federal government should substantially restrict the export of advanced semiconductor manufacturing equipment to the People\'s Republic of China.',
      'Resolved: The United States federal government should substantially increase its military presence in the Arctic.',
      'Resolved: On balance, the rise of generative artificial intelligence has been beneficial to the United States economy.',
      'Resolved: The United States federal government should prioritize reducing economic inequality over reducing the federal deficit.',
    ],
    thingsThatWin: [
      'Two strong cards beat five mediocre ones.',
      'Crossfire questions that lock the opponent into a position they then have to defend.',
      'Summary that collapses to two impacts and weighs them.',
      'Final focus that gives the judge a one-sentence ballot story.',
    ],
    thingsToAvoid: [
      'Card spam without analysis — judges discount cards you do not explain.',
      'Aggressive crossfire (yelling, talking over). Penalized.',
      'New arguments in final focus.',
      'Reading evidence faster than the judge can flow.',
    ],
    keywords: ['Public Forum', 'PF debate', 'NSDA', 'high school PF', 'public forum format'],
  },

  ld: {
    slug: 'ld',
    name: 'Lincoln-Douglas',
    alias: 'LD',
    pitch: 'One-on-one philosophical debate. Value and criterion. NSDA-standard but circuit LD has its own kritik-heavy register.',
    summary: [
      "Lincoln-Douglas is one-on-one value debate. Each topic resolution turns on a normative claim — \"a just society ought…\", \"is morally permissible…\" — and the debate is framed by a value (the larger ethical concept being protected) and a criterion (the standard for weighing competing claims under that value).",
      "Traditional LD is philosophical. Affirmative reads a case grounded in a moral framework — Rawls, Kant, Mill, sometimes contemporary ethicists — defends a value and criterion, and shows the resolution upholds that value. Negative either contests the framework or argues the resolution undermines the affirmative's own value.",
      "Circuit LD (the competitive national circuit) has evolved into a denser, faster format heavily influenced by Policy. Kritiks (philosophical objections to the resolution's assumptions), theory arguments, and tricks (paradoxes used to short-circuit the round) are all common. Some judges welcome this; many do not. Read paradigms.",
    ],
    structure: [
      { code: 'AC',  name: 'Affirmative Constructive',    time: '6 min', side: 'Aff' },
      { code: 'CX1', name: 'Cross-Examination (Neg asks)', time: '3 min', side: 'Both' },
      { code: 'NC',  name: 'Negative Constructive + 1NR', time: '7 min', side: 'Neg' },
      { code: 'CX2', name: 'Cross-Examination (Aff asks)', time: '3 min', side: 'Both' },
      { code: '1AR', name: 'First Affirmative Rebuttal',  time: '4 min', side: 'Aff' },
      { code: '2NR', name: 'Second Negative Rebuttal',    time: '6 min', side: 'Neg' },
      { code: '2AR', name: 'Second Affirmative Rebuttal', time: '3 min', side: 'Aff' },
    ],
    judging: [
      'Value-criterion framework is the most common ballot anchor.',
      'Kritiks and theory are accepted on the national circuit, less so locally.',
      'Cross-examination is evaluated — not flowed for arguments but for skill.',
      'Time-skewed 1AR is the structural challenge; collapse early.',
      'Judges vary widely — read every paradigm.',
    ],
    sampleMotions: [
      'Resolved: A just society ought not use the death penalty.',
      'Resolved: Individual rights ought to be valued above the collective good.',
      'Resolved: A just government ought to prioritize liberty over equality.',
      'Resolved: It is morally permissible to break an unjust law.',
    ],
    thingsThatWin: [
      'A value-criterion pair that does actual work, not just opens the case.',
      '1AR collapse — pick the strongest 2-3 arguments and weigh them.',
      'Kritik responses that engage the philosophy, not just the link.',
      'CX questions that set up a 1AR weighing argument three speeches later.',
    ],
    thingsToAvoid: [
      'Value-criterion that the rest of the case ignores.',
      'Card-dumping in NC without framework defense.',
      'Tricks against a lay judge who has not seen them before.',
      'Failing to extend offense in 1AR.',
    ],
    keywords: ['Lincoln-Douglas', 'LD debate', 'value debate', 'NSDA LD', 'circuit LD'],
  },

  policy: {
    slug: 'policy',
    name: 'Policy',
    alias: 'CX',
    pitch: 'Two-on-two evidence-heavy format. Year-long topic. Spreading, tagged evidence, plan + counterplan + DA + kritik architecture.',
    summary: [
      "Policy (or Cross-Examination) debate is the deepest, most evidence-driven format in U.S. high school and college debate. One resolution runs for the entire season. Two teams of two; the affirmative proposes a specific plan; the negative attacks via disadvantages (DAs), counterplans (CPs), topicality (T), kritiks (K), and case-level critiques.",
      "Policy is where speed (spreading) is most established — debaters read at 350+ words per minute, cite hundreds of cards per round, and flow on legal-pad-sized sheets. The argumentative architecture is highly structured: plan, advantages, disadvantages, links, internal links, impacts, weighing.",
      "The negative block (2NC + 1NR back-to-back) is the structural pivot of the round. The affirmative's 1AR has to cover everything the block raised in less time than the block had to raise it. Affirmative strategy is heavily about 1AR-prep — pre-written blocks, organized evidence, clear collapse.",
    ],
    structure: [
      { code: '1AC', name: 'First Affirmative Constructive',  time: '8 min', side: 'Aff' },
      { code: '1NC', name: 'First Negative Constructive',     time: '8 min', side: 'Neg' },
      { code: '2AC', name: 'Second Affirmative Constructive', time: '8 min', side: 'Aff' },
      { code: '2NC', name: 'Second Negative Constructive',    time: '8 min', side: 'Neg' },
      { code: '1NR', name: 'First Negative Rebuttal',         time: '5 min', side: 'Neg' },
      { code: '1AR', name: 'First Affirmative Rebuttal',      time: '5 min', side: 'Aff' },
      { code: '2NR', name: 'Second Negative Rebuttal',        time: '5 min', side: 'Neg' },
      { code: '2AR', name: 'Second Affirmative Rebuttal',     time: '5 min', side: 'Aff' },
    ],
    judging: [
      'Tagged evidence is the primary unit of argument.',
      'Spreading is accepted on the national circuit, rejected locally.',
      'Disadvantage impact comparison is the most common ballot move.',
      'Kritiks vs. policy is the ongoing philosophical divide in the format.',
      'Topicality is jurisdictional — Aff must be within the resolution.',
    ],
    sampleMotions: [
      'Resolved: The United States federal government should substantially increase its diplomatic engagement with the People\'s Republic of China.',
      'Resolved: The United States federal government should substantially reduce its restrictions on legal immigration.',
      'Resolved: The United States Supreme Court should overturn one or more of the following decisions...',
    ],
    thingsThatWin: [
      'A well-cut DA with strong impact + link evidence.',
      '2AC frontlines that anticipate the block.',
      'A 2NR collapse on either the DA, CP, or K — not all three.',
      'Impact calculus: magnitude, timeframe, probability.',
    ],
    thingsToAvoid: [
      'Spreading in front of a lay judge.',
      'Reading uncut evidence (just dumping a card without a tag).',
      'Conceding the 2NC link work in 1AR.',
      'Going for everything in the 2NR.',
    ],
    keywords: ['Policy debate', 'CX debate', 'cross-examination debate', 'high school policy', 'circuit policy'],
  },

  congress: {
    slug: 'congress',
    name: 'Student Congress',
    alias: 'Congress',
    pitch: 'Mock legislative debate. Bills and resolutions, parliamentary procedure, presiding officer, individual scoring.',
    summary: [
      "Student Congress is NSDA's mock-legislature format. A chamber of 15-25 students debates a series of bills and resolutions on the legislative docket. Each student delivers 3-minute speeches on each bill, alternating affirmative and negative, with questioning periods between speeches.",
      "Unlike other formats, Congress is individual — every speaker is scored against every other speaker in the chamber, not as part of a team. Strategic considerations include cycle position (the first speakers on a bill set the frame; later speakers must extend, refute, or crystallize), parliamentary procedure use, and the presiding officer's influence on speaking order.",
      "Strong Congress speakers blend the analytical depth of policy debate with the rhetorical polish of original oratory. Citations are expected but not required; the format rewards plain-English persuasion grounded in specific evidence.",
    ],
    structure: [
      { code: 'Speech 1', name: 'First Affirmative on Bill',   time: '3 min', side: 'Aff' },
      { code: 'Q1',       name: 'Questioning Period',          time: '2 min', side: 'Both' },
      { code: 'Speech 2', name: 'First Negative on Bill',      time: '3 min', side: 'Neg' },
      { code: 'Q2',       name: 'Questioning Period',          time: '2 min', side: 'Both' },
      { code: '...',      name: 'Subsequent Aff/Neg cycle',    time: '3 min ea', side: 'Both' },
      { code: 'Vote',     name: 'Chamber vote on the bill',    time: '—',     side: 'Both' },
    ],
    judging: [
      'Each speech is scored individually 1-8 by judges in the chamber.',
      'Cycle position matters — late speakers must do more than recap.',
      'Questioning skill is judged separately from speech delivery.',
      'Presiding officer is scored on procedural fairness and clarity.',
      'Best three rounds typically count toward elimination ranking.',
    ],
    sampleMotions: [
      'A Bill to Restrict Foreign Acquisition of U.S. Farmland.',
      'A Resolution Condemning Sanctions Against International Criminal Court Personnel.',
      'A Bill to Establish a Carbon Border Adjustment Mechanism.',
      'A Bill to Require Algorithmic Transparency Reports from Social Media Platforms.',
    ],
    thingsThatWin: [
      'First-cycle speeches set the chamber\'s framework — claim that real estate.',
      'Mid-cycle refutation that names previous speakers by name.',
      'Crystallization speeches that summarize the chamber\'s clash before the vote.',
      'Questioning that pins down vague positions, not gotcha-asks.',
    ],
    thingsToAvoid: [
      'Reading a prepared speech that ignores everything previous speakers said.',
      'Citation dumps without explanation.',
      'Questioning that is just a mini-speech with a question mark at the end.',
      'Speaking out of cycle (penalized by most chambers).',
    ],
    keywords: ['Student Congress', 'Congress debate', 'NSDA Congress', 'legislative debate'],
  },

  mun: {
    slug: 'mun',
    name: 'Model United Nations',
    alias: 'MUN',
    pitch: 'Diplomacy simulation. Represent a country, negotiate resolutions, navigate parliamentary procedure across committees.',
    summary: [
      "Model UN is a diplomacy simulation, not a debate format per se — but the competitive overlap is substantial. Delegates represent assigned countries in simulated UN committees (General Assembly, Security Council, ECOSOC, specialized agencies), debate position papers on a docket of topics, and negotiate working papers that become draft resolutions.",
      "Speaking time is short — most delegates get 60 to 90 seconds at a time on a speaker's list. The real work happens in unmoderated caucus, where delegates form blocs, draft language, and trade amendments. The best MUN delegates combine sharp public speaking with patient backroom negotiation.",
      "Major conferences (THIMUN, HMUN, NHSMUN) host hundreds of schools across dozens of committees. Awards include Best Delegate, Outstanding, Honorable Mention, and Verbal Commendation — though competitive culture varies significantly by circuit.",
    ],
    structure: [
      { code: 'Speakers\' List', name: 'Formal speeches', time: '60-90 sec ea', side: 'Various' },
      { code: 'Moderated Caucus', name: 'Topic-focused short speeches', time: '30-90 sec', side: 'Various' },
      { code: 'Unmoderated', name: 'Negotiation + drafting time', time: '5-20 min', side: 'Open' },
      { code: 'Working Paper', name: 'Bloc drafts circulated', time: 'Async', side: 'Various' },
      { code: 'Draft Resolution', name: 'Formal motion to vote', time: 'Async', side: 'Various' },
      { code: 'Voting Procedure', name: 'Resolution passes or fails', time: '—', side: 'Various' },
    ],
    judging: [
      'Position-paper accuracy: do you actually represent your country\'s real-world policy?',
      'Speaking-list performance: clarity, frequency, substance.',
      'Negotiation: blocs formed, amendments authored, resolutions sponsored.',
      'Parliamentary procedure use: motions, points of order, points of inquiry.',
      'Crisis simulations are scored on real-time adaptation, not prepared content.',
    ],
    sampleMotions: [
      'Draft resolution on the regulation of autonomous weapons systems (DISEC).',
      'Resolution on humanitarian access in conflict zones (UNHCR).',
      'Framework convention on digital identity for refugees (ECOSOC).',
      'Joint statement on critical-mineral supply chains (UNEP).',
    ],
    thingsThatWin: [
      'A position paper your bloc actually wants to merge into.',
      'Speaking-list visibility AND substance — frequency without depth backfires.',
      'Amendment authorship — your name on the resolution as a sponsor matters more than your vote.',
      'Crisis-committee adaptation when the simulation moves faster than your prep.',
    ],
    thingsToAvoid: [
      'Going off-policy because your assigned country is unpopular.',
      'Hogging the speakers list without contributing to drafts.',
      'Confrontational floor speeches that block bloc formation.',
      'Ignoring the rules of procedure (the chair will penalize).',
    ],
    keywords: ['Model UN', 'MUN', 'Model United Nations', 'diplomacy simulation', 'THIMUN', 'HMUN'],
  },
};

export function formatSlugs() {
  return Object.keys(FORMAT_BANK);
}

export function getFormat(slug) {
  return FORMAT_BANK[slug] || null;
}
