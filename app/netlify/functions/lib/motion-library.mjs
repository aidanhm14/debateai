// motion-library.mjs — data for the /motions and /motions/{slug} pages.
//
// Different job from debate-bank.mjs. That bank answers consumer
// questions ("Should AI be regulated?") for readers who are not
// debaters. This bank holds real competitive motions in their canonical
// tournament phrasing ("This House would abolish the filibuster") and
// answers the question an actual debater types the night before a
// tournament: how do I run this motion, on either side?
//
// Every motion here MUST exist verbatim in one of the motion pools in
// app/debate-it.html (APDA_MOTIONS / BP_MOTIONS / ASIAN_MOTIONS /
// WORLDS_MOTIONS / MOTIONS_BY_FORMAT). The page CTA prefills the
// trainer with `motion`, and the curated case files in debate-it.html
// key off exact motion text, so a paraphrase here silently breaks the
// handoff. Copy the string, do not retype it.
//
// Voice rules (soul.md): no em-dashes, no banned phrases, no prefaces.
// Arguments carry real impact calculus (magnitude / probability /
// timeframe), not adjectives. Coach register: the thing you would
// actually say to someone twenty minutes before the round.
//
// Schema per motion:
//   slug        URL segment. Derived from the motion, kept short.
//   motion      canonical tournament text. Must match the app pool.
//   format      primary format key (apda|bp|asian|worlds|ld|pf|policy)
//   formats     human label listing where the motion runs
//   domain      econ|tech|ethics|civic|edu|env|global|social
//   difficulty  Intro|Medium|Hard
//   summary     one sentence. Used as meta description seed.
//   reading     { asks, burden, ground } what the motion actually asks,
//               who has to prove what, and the definitional ground worth
//               claiming before the first speech.
//   prop/opp    { line, args:[{ title, claim, warrant, impact }] }
//   clash       { question, prop, opp } the tension that decides it
//   mistakes    { prop:[], opp:[] } how rounds on this motion get lost
//   related     [slug] internal links. Keep 3-4, keep them reciprocal.
//   keywords    [] search phrases this page targets

export const MOTION_LIBRARY = {

  // ── PARLIAMENTARY / APDA ────────────────────────────────────────

  'ban-billionaires': {
    slug: 'ban-billionaires',
    motion: 'This house would ban billionaires.',
    format: 'apda',
    formats: 'APDA / BP / Worlds adaptable',
    domain: 'econ',
    difficulty: 'Medium',
    summary: 'A wealth-cap motion that turns on whether extreme fortunes are a political problem or an economic signal.',
    reading: {
      asks: 'Not whether billionaires are likable. Whether a hard ceiling on personal wealth, enforced by confiscatory tax above the line, produces a better society than the status quo.',
      burden: 'Prop has to defend a mechanism, not a sentiment. Name the cap, name the instrument (marginal tax at 100% above $1B, forced equity dilution, trust-busting), and own the transition. Opp does not have to love inequality, only to show the cure costs more than the disease.',
      ground: 'Prop should define the ban as a cap on retained personal wealth rather than seizure of operating companies. That dodges the strongest Opp attack (you are nationalizing Amazon) while keeping the political-power argument intact.',
    },
    prop: {
      line: 'Concentrated private wealth converts into political power that no vote can check, and the conversion is getting faster.',
      args: [
        {
          title: 'Wealth buys the rules',
          claim: 'Above a threshold, money stops buying goods and starts buying policy.',
          warrant: 'A billion dollars cannot be spent on consumption. It is deployed into media ownership, campaign finance, litigation, and lobbying, which are the machinery that sets the next set of tax rules.',
          impact: 'The harm compounds: each cycle of influence writes rules that make the next accumulation easier. This is present-tense and self-reinforcing, not speculative.',
        },
        {
          title: 'The money is idle',
          claim: 'Capital at that concentration sits in appreciating assets, not in wages or productive investment.',
          warrant: 'Marginal propensity to consume collapses at the top. Redirected through public spending, the same capital moves through an economy with a multiplier above one.',
          impact: 'Same dollars, more circulation. The magnitude is national-budget scale and the timeframe is immediate, unlike growth arguments that pay out in decades.',
        },
        {
          title: 'The cap is the incentive',
          claim: 'A ceiling does not stop people building companies, it stops them hoarding the output.',
          warrant: 'Founders build for status, control, and the work. The marginal motivational value of the tenth billion over the first is close to zero, and the people who claim otherwise are already rich enough to test it.',
          impact: 'You keep the innovation and lose the accumulation. Opp needs to show that specific founders quit at the cap, which is an empirical claim they rarely evidence.',
        },
      ],
    },
    opp: {
      line: 'The cap is unenforceable where it matters and destructive where it works.',
      args: [
        {
          title: 'Valuation makes it fake',
          claim: 'Most billionaire wealth is illiquid founder equity that has no price until it is sold.',
          warrant: 'Enforcing a cap means forcing sales into thin markets, which crashes the very valuation you are taxing. The state either accepts a fraction of the paper number or takes the equity, which is nationalization by another name.',
          impact: 'You get a fraction of projected revenue and a state holding controlling stakes in private firms. Both sides of Prop\'s case fail at once.',
        },
        {
          title: 'Exit is cheap',
          claim: 'Capital and people leave before the rule binds.',
          warrant: 'France\'s wealth tax ran from 1989 to 2017 and the estimated capital flight exceeded the revenue raised by an order of magnitude. Billionaire mobility is higher now than it was then, not lower.',
          impact: 'The revenue is lost, the companies relocate, and the political-influence problem is unsolved because influence crosses borders more easily than tax authority does.',
        },
        {
          title: 'Wrong target for the real harm',
          claim: 'The political-capture problem is a campaign-finance problem wearing a wealth costume.',
          warrant: 'Capping wealth leaves every existing channel of influence open to the merely rich, to corporations, and to foreign money. Direct rules on political spending hit the harm without touching the capital stock.',
          impact: 'Prop pays the full economic cost of the ban and buys a partial fix. The comparative is worse than the targeted alternative on every axis.',
        },
      ],
    },
    clash: {
      question: 'Is extreme wealth the cause of political capture, or just its most visible symptom?',
      prop: 'Prop wins by showing the conversion from wealth to rule-setting power is direct, systematic, and unreachable by campaign-finance law alone.',
      opp: 'Opp wins by showing the same influence flows through channels the cap does not touch, so you pay for the ban and keep the harm.',
    },
    mistakes: {
      prop: [
        'Arguing that billionaires are morally bad. The judge does not care. Argue that the wealth does something.',
        'Refusing to name a mechanism. "Ban" without an instrument loses to the first valuation attack.',
      ],
      opp: [
        'Defending billionaires as heroic job creators. You do not need it and it makes you unlikeable for no ballot gain.',
        'Leading with capital flight and stopping there. Prop concedes some flight and asks about the residual. Have the second layer ready.',
      ],
    },
    related: ['replace-income-tax-with-wealth-tax', 'universal-basic-income', 'abolish-the-filibuster', 'make-every-salary-public'],
    keywords: ['this house would ban billionaires', 'ban billionaires debate', 'should billionaires exist debate motion', 'wealth cap debate arguments'],
  },

  'abolish-the-electoral-college': {
    slug: 'abolish-the-electoral-college',
    motion: 'This house would abolish the electoral college.',
    format: 'apda',
    formats: 'APDA / Congress / PF adaptable',
    domain: 'civic',
    difficulty: 'Intro',
    summary: 'A first-principles democracy motion where the real fight is over what a presidential election is supposed to represent.',
    reading: {
      asks: 'Whether the US should elect presidents by national popular vote instead of state-allocated electors. The replacement matters: straight plurality and ranked-choice runoff defend very differently.',
      burden: 'Prop should specify the replacement in the first speech. Opp gets enormous ground against an unspecified "popular vote" (plurality winners at 34%, no recount procedure, no federal election administration).',
      ground: 'Prop should take national popular vote with a runoff or ranked ballot. It costs one sentence and removes Opp\'s cleanest attack.',
    },
    prop: {
      line: 'The system gives some citizens more voting power than others for no defensible reason, and the distortion is not random.',
      args: [
        {
          title: 'Unequal weight',
          claim: 'A vote in Wyoming carries several times the electoral weight of a vote in California.',
          warrant: 'Electors are allocated by House seats plus two Senate seats, so the two-seat floor overweights small states structurally. This is arithmetic, not interpretation.',
          impact: 'Political equality is the foundational claim of a democracy. A system that violates it needs a justification stronger than tradition, and the founders\' reasons (slave-state apportionment, distrust of mass suffrage) are ones we have already rejected.',
        },
        {
          title: 'Campaigns collapse to six states',
          claim: 'Winner-take-all allocation makes safe states electorally irrelevant.',
          warrant: 'Candidates spend where marginal votes move electors. In 2020, over 90% of general-election events happened in about a dozen states.',
          impact: 'Policy follows attention. Ethanol, steel tariffs, and Cuba policy are shaped by swing-state composition rather than national interest, and the distortion runs every cycle.',
        },
        {
          title: 'Legitimacy risk',
          claim: 'The system can and does produce presidents who lost the national vote.',
          warrant: 'It has happened twice since 2000. Both times the winner governed under a persistent legitimacy challenge that shaped everything from judicial confirmations to protest scale.',
          impact: 'The probability is not small and the magnitude is systemic. A democracy that regularly seats the second-place finisher erodes the consent it runs on.',
        },
      ],
    },
    opp: {
      line: 'The college forces coalitions to be geographically broad, and the replacement creates failure modes worse than the ones it fixes.',
      args: [
        {
          title: 'Federalism is the point',
          claim: 'The US elects a president of a federation, not a chief executive of an undifferentiated national mass.',
          warrant: 'State-based allocation forces winning coalitions to span regions with different economies. A pure popular vote lets a candidate build a majority from a handful of metropolitan areas.',
          impact: 'Rural and small-state interests lose their only structural leverage in national elections. The magnitude is permanent, not cyclical.',
        },
        {
          title: 'Recounts contain themselves',
          claim: 'Under the college, a disputed election is a dispute inside one or two states.',
          warrant: 'Florida 2000 was ugly and it was bounded. A national popular vote makes every precinct in the country relevant to a 50,000-vote margin, with 50 different sets of election law and no federal administrator.',
          impact: 'The probability of a contested national recount is meaningfully higher than a contested single-state one, and the resolution mechanism does not exist.',
        },
        {
          title: 'Swing states move',
          claim: 'The battleground map is not fixed, so the neglect argument overstates the permanence.',
          warrant: 'Ohio, Missouri, Virginia, Colorado, Georgia, and Arizona have each swapped categories within twenty years. Parties chase the map because the map moves.',
          impact: 'Prop\'s harm is real for one cycle and self-correcting across several. That reduces the magnitude enough that the transition costs dominate.',
        },
      ],
    },
    clash: {
      question: 'Should a presidential election aggregate citizens or aggregate states?',
      prop: 'Prop wins by establishing that the president governs individuals directly, so individuals are the correct unit and unequal weighting needs a live justification.',
      opp: 'Opp wins by showing the federation is real, that broad geographic coalitions are a genuine good, and that the transition creates administrative failure modes with no owner.',
    },
    mistakes: {
      prop: [
        'Leaving the replacement unspecified. Half of Opp\'s case is aimed at the gap you left.',
        'Relitigating 2000 and 2016 for two minutes. Establish the pattern in one line and move to the structural claim.',
      ],
      opp: [
        'Defending the founders\' original intent as authority. Prop will point out what that intent actually was.',
        'Only running recount chaos. It is a strong argument and it is not a theory of why the system is good.',
      ],
    },
    related: ['make-voting-compulsory', 'lower-the-voting-age-to-16', 'abolish-the-senate', 'replace-congress-with-citizens-chosen-by-lottery'],
    keywords: ['this house would abolish the electoral college', 'abolish electoral college debate', 'electoral college debate arguments both sides', 'apda electoral college motion'],
  },

  'make-voting-compulsory': {
    slug: 'make-voting-compulsory',
    motion: 'This house would make voting compulsory.',
    format: 'apda',
    formats: 'APDA / Worlds / BP / PF adaptable',
    domain: 'civic',
    difficulty: 'Intro',
    summary: 'A classic liberty-versus-participation motion where the size of the fine decides how much of the case survives.',
    reading: {
      asks: 'Whether the state may compel electoral participation, usually enforced by a small administrative fine, as in Australia and Belgium.',
      burden: 'Prop must defend compulsion, not just high turnout. Opp must show the compulsion does something bad that voluntary low turnout does not.',
      ground: 'Prop should take compulsory attendance with a valid blank-ballot option rather than compulsory choice. It answers the freedom-of-conscience attack directly and Australia already works this way.',
    },
    prop: {
      line: 'Turnout is not randomly distributed, so voluntary voting systematically over-represents the people who already have power.',
      args: [
        {
          title: 'The turnout gap is a class gap',
          claim: 'Non-voting concentrates among the young, the poor, and renters.',
          warrant: 'Voting cost is time, information, and transport, all of which are scarcer at the bottom. The people with the strongest interest in redistribution are the least likely to show up.',
          impact: 'Policy tracks the electorate, not the population. Compulsion closes a representation gap that voluntary reform efforts have never closed in any democracy.',
        },
        {
          title: 'It kills the suppression incentive',
          claim: 'When everyone votes, no party gains from making voting harder.',
          warrant: 'Voter ID rules, poll closures, and roll purges are profitable only where differential turnout is the lever. Universal participation removes the return on that investment.',
          impact: 'You defuse a whole category of democratic backsliding permanently, not case by case through litigation that runs a decade behind.',
        },
        {
          title: 'Campaigns change shape',
          claim: 'Mobilization budgets convert into persuasion budgets.',
          warrant: 'With turnout fixed, the only way to win is to move opinion. Australia\'s campaigns spend far less on base-turnout operations than American ones.',
          impact: 'Less incentive to run on maximum-outrage base activation, which is the mechanism most directly linked to polarization.',
        },
      ],
    },
    opp: {
      line: 'A coerced ballot is not a stronger mandate, and the people you drag in are the ones least equipped to cast a meaningful one.',
      args: [
        {
          title: 'Abstention is speech',
          claim: 'Refusing to participate is a legitimate political position.',
          warrant: 'A citizen who believes no candidate is acceptable expresses that by staying home. Fining them converts a political statement into an administrative offense.',
          impact: 'The state punishing a form of political expression is a rights violation with no compensating gain, since Prop can pursue turnout through access reform instead.',
        },
        {
          title: 'Low-information ballots',
          claim: 'Compulsion adds voters selected precisely for disengagement.',
          warrant: 'Australia shows measurable donkey-voting: ballots filled top to bottom, and a documented advantage to candidates listed first. The added votes are noise, not signal.',
          impact: 'You degrade the information content of the result. If Prop\'s claim is that the electorate should better reflect the population, noise does not achieve that.',
        },
        {
          title: 'The cure is available without coercion',
          claim: 'Automatic registration, weekend voting, and mail ballots raise turnout without a fine.',
          warrant: 'These interventions have measurable effects and no liberty cost. Prop has to show compulsion beats the best voluntary package, not the status quo.',
          impact: 'Comparative failure. Prop pays a rights cost for a result the alternative reaches more cheaply.',
        },
      ],
    },
    clash: {
      question: 'Is the harm of an unrepresentative electorate worse than the harm of compelling participation?',
      prop: 'Prop wins by showing the turnout gap is structural, self-perpetuating, and untouched by access reform, so only compulsion closes it.',
      opp: 'Opp wins by proving the access package gets most of the turnout benefit at no liberty cost, which makes the fine gratuitous.',
    },
    mistakes: {
      prop: [
        'Saying voting is a duty and stopping. Assertion, not argument. Show what the gap does to policy.',
        'Ignoring the fine. Opp will make it the whole round if you do not price it.',
      ],
      opp: [
        'Running pure liberty against a $20 fine. The magnitude is too small to carry alone; pair it with the low-information argument.',
        'Conceding the turnout gap is real and never explaining why the added voters do not fix it.',
      ],
    },
    related: ['abolish-the-electoral-college', 'lower-the-voting-age-to-16', 'allow-citizens-to-sell-their-vote', 'require-elected-officials-to-publish-tax-returns'],
    keywords: ['this house would make voting compulsory', 'compulsory voting debate', 'mandatory voting arguments for and against', 'compulsory voting motion analysis'],
  },

  'the-ends-justify-the-means': {
    slug: 'the-ends-justify-the-means',
    motion: 'This house believes the ends justify the means.',
    format: 'apda',
    formats: 'APDA / LD adaptable',
    domain: 'ethics',
    difficulty: 'Hard',
    summary: 'A pure ethics motion that is won on the framework, not on examples.',
    reading: {
      asks: 'Whether outcomes are the only thing that determines whether an act was right. This is consequentialism against deontology, stated in circuit shorthand.',
      burden: 'Both sides are defending a decision procedure, not a set of anecdotes. The team that only trades atrocity examples loses to the team that explains how to decide.',
      ground: 'Prop should take sophisticated consequentialism (rule-consequentialism, expected value under uncertainty) rather than naive act-utilitarianism. Opp should take threshold deontology rather than absolutism, because absolutism dies to the first ticking-bomb hypothetical.',
    },
    prop: {
      line: 'Every moral theory that refuses to look at outcomes ends up endorsing outcomes nobody would choose.',
      args: [
        {
          title: 'Consequences are the only common currency',
          claim: 'Moral disagreement is resolvable only where there is a shared measure, and welfare is the one measure everyone already uses.',
          warrant: 'Rights claims conflict and offer no internal tiebreak. When your right to speech meets my right to safety, the only way to adjudicate is to compare what happens.',
          impact: 'Without an outcome test, hard cases have no decision procedure at all, which is a total failure of a moral theory rather than a partial one.',
        },
        {
          title: 'Inaction is a choice with a body count',
          claim: 'Refusing to act is not moral neutrality.',
          warrant: 'The deontologist who will not lie to the murderer at the door has chosen the outcome where the victim dies. Clean hands are a description of the agent, not of the world.',
          impact: 'A theory that lets you avoid responsibility for foreseeable deaths by declining to touch the lever is optimizing for the agent\'s self-image over actual people.',
        },
        {
          title: 'Rules are consequences in disguise',
          claim: 'The constraints Opp defends are justified by what happens when societies abandon them.',
          warrant: 'Ask why torture is wrong and the answer arrives as consequences: it produces bad intelligence, corrupts institutions, licenses escalation. The rule is a compressed prediction.',
          impact: 'Opp is running consequentialism with extra steps. Once that is established, the round is about which level to evaluate at, and Prop already conceded rules are useful heuristics.',
        },
      ],
    },
    opp: {
      line: 'A permission structure that lets sufficiently large numbers license any act is not a moral theory, it is an excuse generator.',
      args: [
        {
          title: 'The calculation is never available',
          claim: 'Ends-justify reasoning requires knowing the ends, and agents systematically do not.',
          warrant: 'Every historical atrocity defended this way was defended with confident projections that were wrong. The Great Leap Forward was an expected-value argument.',
          impact: 'A decision rule whose inputs are unknowable in exactly the high-stakes cases it is meant for fails where it matters most. The failure mode is catastrophic and repeated.',
        },
        {
          title: 'Constraints are what make coordination possible',
          claim: 'Rights function as guarantees, and a guarantee with an exception clause is not one.',
          warrant: 'I can build a life around a right to not be killed for parts only if it holds when killing me is net-positive. Prop\'s theory removes exactly the case where the protection matters.',
          impact: 'You lose the social infrastructure that trust runs on. The magnitude is every institution that depends on predictable treatment.',
        },
        {
          title: 'It is unfalsifiable in the agent\'s favor',
          claim: 'The framework hands the powerful a justification that cannot be checked at the time of acting.',
          warrant: 'The person invoking the greater good is always the person with the power to define it, and the accounting is settled after the fact by the winners.',
          impact: 'In practice the theory does not restrain anyone. It converts self-interest into moral language, which is worse than no theory because it launders the act.',
        },
      ],
    },
    clash: {
      question: 'Is the failure of rule-based ethics in hard cases worse than the failure of outcome-based ethics under uncertainty?',
      prop: 'Prop wins by forcing Opp to bite a bullet: name the case where they accept a catastrophic outcome to keep a rule intact, then show the rule was doing no work.',
      opp: 'Opp wins by showing the epistemic problem is not a bug at the edges but the standard condition, so the theory never actually gets to run correctly.',
    },
    mistakes: {
      prop: [
        'Defending naive act-utilitarianism. You will spend the round answering organ-harvest hypotheticals.',
        'Treating this as a policy debate. There is no plan; the ballot goes to the better decision procedure.',
      ],
      opp: [
        'Absolutism. One ticking-bomb case and you are stuck defending a rule against a city.',
        'Only listing atrocities. Prop concedes the examples and says they were bad calculations, not bad frameworks. Have the structural answer.',
      ],
    },
    related: ['free-will-is-an-illusion', 'moral-progress-is-real', 'immoral-to-have-children-in-the-current-era', 'a-just-society-ought-not-use-the-death-penalty'],
    keywords: ['this house believes the ends justify the means', 'ends justify the means debate', 'consequentialism vs deontology debate motion', 'apda ethics motion'],
  },

  'abolish-prisons': {
    slug: 'abolish-prisons',
    motion: 'This house would abolish prisons.',
    format: 'apda',
    formats: 'APDA / BP / Worlds adaptable',
    domain: 'ethics',
    difficulty: 'Hard',
    summary: 'An abolition motion that Prop loses by refusing to answer the violent-offender question and Opp loses by pretending the status quo works.',
    reading: {
      asks: 'Whether incarceration should be replaced as the default response to crime. Abolition in the literature means building the alternatives, not opening the doors tomorrow.',
      burden: 'Prop owns the hard cases. If you cannot say what happens to a serial violent offender, the round ends there. Opp owns recidivism: you are defending a system with measurable failure rates.',
      ground: 'Prop should define abolition as a phased replacement with secure treatment, restorative processes, and civil commitment for the dangerous few. Opp should attack that as prison relabeled, which is the strongest available line.',
    },
    prop: {
      line: 'Prison is a very expensive machine that reliably produces the outcome it exists to prevent.',
      args: [
        {
          title: 'It manufactures repeat offenders',
          claim: 'Incarceration raises the probability of future crime for most people who go through it.',
          warrant: 'It severs employment, housing, and family ties, and replaces them with a criminal network. Roughly two thirds of released prisoners in the US are rearrested within three years.',
          impact: 'The institution is net-criminogenic. Every marginal sentence buys short-term incapacitation and pays for it with a higher-risk person released later.',
        },
        {
          title: 'The alternatives outperform on the same metric',
          claim: 'Restorative and treatment-based responses beat incarceration on reoffending for most offense classes.',
          warrant: 'Norway\'s system, drug courts, and restorative-justice conferencing all show lower recidivism at comparable or lower cost. This is a comparison of measured outcomes, not of ideals.',
          impact: 'Prop does not need prison to be evil, only to be dominated. If a cheaper intervention produces fewer future victims, keeping prison is choosing more crime.',
        },
        {
          title: 'The harm lands off-target',
          claim: 'Incarceration punishes families and communities that committed no offense.',
          warrant: 'Household income collapses, children of incarcerated parents show sharply elevated risk across every measured outcome, and the effects concentrate by race and postcode.',
          impact: 'A punishment system that distributes most of its damage to non-offenders has failed the basic requirement that punishment be aimed at the guilty.',
        },
      ],
    },
    opp: {
      line: 'Incapacitation is not replaceable, and everything in Prop\'s alternative that works is already available without abolition.',
      args: [
        {
          title: 'Some people must be separated',
          claim: 'A small number of offenders will predictably harm others if unrestrained.',
          warrant: 'Prop\'s own model concedes this by building secure facilities for them. A secure facility you cannot leave, run by the state, holding people who are dangerous, is a prison.',
          impact: 'The motion collapses into a renaming exercise for the hardest cases, which are the cases that generate the most victims. Prop wins reform and loses abolition.',
        },
        {
          title: 'Reform does not require abolition',
          claim: 'Drug courts, restorative conferencing, and Norwegian conditions all operate inside prison systems.',
          warrant: 'Every alternative Prop cites was built by a state that also runs prisons. The evidence base for the alternatives is evidence for reform, not for removal.',
          impact: 'Prop pays the full political cost of abolition to obtain benefits available under reform. The comparative fails without a unique benefit to removal.',
        },
        {
          title: 'Victims have a claim',
          claim: 'Restorative processes require a victim willing to participate, and many are not.',
          warrant: 'Conferencing works well where both parties consent. It has no answer for a victim who wants no contact, or for offenses with no identifiable individual victim.',
          impact: 'The alternative has a coverage gap on exactly the offenses that most damage public confidence in the justice system, and public confidence is what keeps people reporting crime at all.',
        },
      ],
    },
    clash: {
      question: 'Is there a category of offender for whom secure confinement is the only workable response, and if so does that concede the institution?',
      prop: 'Prop wins by shrinking the category to a genuinely small number and showing that designing a system around the exception is what produced mass incarceration.',
      opp: 'Opp wins by holding Prop to their own secure-facility concession and naming it prison, which converts the debate into reform that Opp already supports.',
    },
    mistakes: {
      prop: [
        'Refusing to answer "what about murderers." Answer it in the first speech, on your terms, before Opp frames it.',
        'Running only the racial-disparity argument. It is true and it argues for reform, not abolition, unless you link it to the structure.',
      ],
      opp: [
        'Defending the status quo. You do not have to. Concede the failures and argue for reform.',
        'Missing the relabeling attack. It is your best line and it needs to land in your first speech.',
      ],
    },
    related: ['abolish-the-death-penalty-worldwide', 'decriminalize-sex-work', 'replace-juries-with-professional-judges', 'abolish-parole-boards'],
    keywords: ['this house would abolish prisons', 'prison abolition debate', 'abolish prisons arguments for and against', 'prison abolition motion analysis'],
  },

  'universal-basic-income': {
    slug: 'universal-basic-income',
    motion: 'This house supports universal basic income.',
    format: 'apda',
    formats: 'APDA / BP / PF / Policy adaptable',
    domain: 'econ',
    difficulty: 'Medium',
    summary: 'The funding question decides this round. Teams that skip it lose to teams that do not.',
    reading: {
      asks: 'Whether an unconditional cash payment to every citizen should replace or supplement targeted welfare. Which of those two you pick changes the entire case.',
      burden: 'Prop must fund it. A universal payment at a meaningful level is a multi-trillion-dollar line item, and Opp will spend their first speech there if you do not.',
      ground: 'Prop should take UBI as a replacement for a defined set of means-tested programs plus a tax adjustment, which makes the net cost defensible. Taking UBI as pure addition is the harder side of the same motion.',
    },
    prop: {
      line: 'Means-tested welfare fails on take-up, administration, and work incentives, and unconditionality fixes all three at once.',
      args: [
        {
          title: 'Conditionality is the failure',
          claim: 'Targeted programs miss the people they are designed for.',
          warrant: 'Take-up rates for means-tested benefits routinely sit far below eligibility because of paperwork, stigma, and reassessment. Unconditional payments have take-up near universal by construction.',
          impact: 'You reach the poorest without a bureaucracy that costs money and fails exactly the people least able to navigate it.',
        },
        {
          title: 'It removes the welfare cliff',
          claim: 'Withdrawal rates in targeted systems create effective marginal tax rates above 70% for low earners.',
          warrant: 'Every extra pound earned withdraws benefit, so working more can leave a household worse off. A universal floor does not taper, so every additional hour pays.',
          impact: 'The work-incentive argument runs the opposite direction from the intuitive one. This is a strong turn on Opp\'s central objection.',
        },
        {
          title: 'Bargaining power',
          claim: 'A floor lets workers refuse the worst offers.',
          warrant: 'Exit options set the reservation wage. Kenya\'s GiveDirectly trials and the Finnish pilot both show recipients becoming more selective rather than idle.',
          impact: 'Wages and conditions rise at the bottom without a wage mandate, and the effect is durable because it changes the structure of the negotiation.',
        },
      ],
    },
    opp: {
      line: 'A universal payment spends its largest share on people who do not need it, which is why it is either unaffordable or too small to matter.',
      args: [
        {
          title: 'The arithmetic does not close',
          claim: 'Universality means most of the money goes to households above the poverty line.',
          warrant: 'A payment large enough to live on, multiplied by an entire adult population, exceeds the total current welfare budget several times over in every developed economy that has costed it.',
          impact: 'You either set it below subsistence, which fails the poverty claim, or you fund it with tax increases that hit the same working households you are paying.',
        },
        {
          title: 'It buys out targeted support',
          claim: 'Flat payments cannot price different needs.',
          warrant: 'A disabled claimant, a single parent in London, and a childless adult in a low-cost region have wildly different requirements. A single number serves none of them well, and Prop\'s funding model pays for the flat rate by scrapping the tailored ones.',
          impact: 'The most vulnerable claimants lose the most. That is the opposite of Prop\'s stated goal and it is a direct consequence of their own funding mechanism.',
        },
        {
          title: 'The pilots do not test the policy',
          claim: 'Every trial is small, temporary, and locally funded.',
          warrant: 'Recipients in a two-year pilot know it ends, and nobody in the trial is paying the tax that would fund it at scale. That removes both the general-equilibrium price effects and the labor-supply response you actually care about.',
          impact: 'Prop\'s strongest empirical evidence does not test the thing being proposed, so the case rests on projection where the projection is contested.',
        },
      ],
    },
    clash: {
      question: 'Does unconditionality buy enough in take-up and incentives to justify paying people who do not need the money?',
      prop: 'Prop wins by showing targeting costs more than it saves once you price administration, non-take-up, and the withdrawal cliff.',
      opp: 'Opp wins by holding Prop to a number and showing that at any affordable level the payment is too small to deliver the benefits claimed.',
    },
    mistakes: {
      prop: [
        'Citing pilots as if they settle it. Opp has the general-equilibrium answer ready. Use pilots for the behavioral point only.',
        'Leaving the payment level unnamed. Every strong Opp attack needs a number to bite on, so pick one and defend it.',
      ],
      opp: [
        'Leading with "people will stop working." The evidence is weak and Prop has the cliff-effect turn waiting.',
        'Ignoring take-up failure. It is Prop\'s best empirical ground and it goes unanswered in most rounds.',
      ],
    },
    related: ['ban-billionaires', 'replace-income-tax-with-wealth-tax', 'ban-unpaid-internships', 'introduce-a-robot-tax'],
    keywords: ['this house supports universal basic income', 'ubi debate motion', 'universal basic income arguments for and against', 'ubi debate case'],
  },

  'lower-the-voting-age-to-16': {
    slug: 'lower-the-voting-age-to-16',
    motion: 'This house would lower the voting age to 16.',
    format: 'apda',
    formats: 'APDA / Worlds / PF adaptable',
    domain: 'civic',
    difficulty: 'Intro',
    summary: 'A franchise motion where the consistency attack on the age line does most of the work for Prop.',
    reading: {
      asks: 'Whether 16 and 17 year olds should have the vote in general elections. Austria, Brazil, Argentina, Scotland, and Wales already do this in some form.',
      burden: 'Prop should attack the coherence of 18 as a line rather than argue teenagers are wise. Opp should defend a competence threshold without sounding like they would also disenfranchise adults who fail it.',
      ground: 'Prop takes the real-world comparators. Scotland\'s 2014 referendum turnout among 16-17s exceeded that of 18-24s, which pre-empts the apathy attack.',
    },
    prop: {
      line: 'Sixteen year olds carry adult obligations already, and the line at 18 tracks nothing that predicts good voting.',
      args: [
        {
          title: 'Taxation without representation',
          claim: 'Sixteen year olds can work, pay income tax, and in many jurisdictions leave school, consent to medical treatment, and join the armed forces.',
          warrant: 'The state has already decided they are competent enough to bear the duties. Withholding the corresponding right is an inconsistency the state has to justify, not the other way round.',
          impact: 'A class of taxpayers with no electoral representation is the clearest form of democratic deficit, and it applies to millions of people continuously.',
        },
        {
          title: 'Habit formation',
          claim: 'First-time voting at 16 produces higher lifetime turnout than first-time voting at 18.',
          warrant: 'At 16 most people are in a stable home and in school, so registration and a first vote can be supported. At 18 many are moving, and the disruption is why that cohort has the worst turnout of any age group.',
          impact: 'The effect compounds across a lifetime of elections. This is the strongest long-run argument on either side because it changes a durable behavior, not one result.',
        },
        {
          title: 'The affected-interests principle',
          claim: 'Young people bear the longest exposure to climate, debt, and pension decisions and have the least say in them.',
          warrant: 'Policy horizons systematically favor the median voter, who is old and getting older in every developed democracy.',
          impact: 'Structural under-weighting of long-run interests is not a one-election problem, it is a permanent bias in what governments choose to do.',
        },
      ],
    },
    opp: {
      line: 'Lines have to sit somewhere, and 18 tracks the point where the state stops treating you as a dependent.',
      args: [
        {
          title: 'The line is doing real work',
          claim: 'Eighteen is where legal majority, contractual capacity, and full criminal responsibility arrive together.',
          warrant: 'Prop\'s inconsistency argument cuts both ways: the coherent response to a 16 year old paying tax is to align the outliers upward, not to unbundle the franchise from majority.',
          impact: 'Unbundling one right from the majority package invites the same argument at 14 with no principled stopping point, which is a cost Prop never prices.',
        },
        {
          title: 'Dependence shapes the ballot',
          claim: 'Most 16 year olds live with, and are financially dependent on, the people whose vote they would sit next to.',
          warrant: 'Household political influence is strongest where the young person cannot exit. That is not a hypothetical: it is why secret ballots exist.',
          impact: 'You add votes that are more correlated with parental preference than any other bloc, which amplifies existing voters rather than representing new interests.',
        },
        {
          title: 'It does not fix the horizon problem',
          claim: 'Two extra cohorts are a small share of the electorate and vote at lower rates in general elections.',
          warrant: 'Austria\'s experience shows participation for the new cohort settling below the average once the novelty passes. The demographic weight of older voters is unchanged.',
          impact: 'Prop\'s largest claimed benefit, correcting the long-run policy bias, is numerically unreachable through this reform.',
        },
      ],
    },
    clash: {
      question: 'Is 18 a principled threshold or an arbitrary inheritance?',
      prop: 'Prop wins by showing the state already treats 16 year olds as adults wherever it is convenient for the state, which makes the franchise exception look like exclusion rather than protection.',
      opp: 'Opp wins by holding the majority package together and showing the unbundling has no stopping rule.',
    },
    mistakes: {
      prop: [
        'Arguing teenagers are informed. You will lose an evidence fight you did not need to start. Argue about the line instead.',
        'Skipping Scotland and Austria. The comparators do most of the rebuttal work for you.',
      ],
      opp: [
        'Saying 16 year olds are immature. It generalizes to plenty of adult voters and Prop will say so.',
        'Ignoring the tax point. It is Prop\'s cleanest argument and it needs a direct answer, not a dismissal.',
      ],
    },
    related: ['make-voting-compulsory', 'abolish-the-electoral-college', 'give-children-a-vote-cast-by-parents', 'ban-smartphones-in-schools'],
    keywords: ['this house would lower the voting age to 16', 'voting age 16 debate', 'should the voting age be lowered arguments', 'lower voting age motion'],
  },

  'ai-development-should-be-paused': {
    slug: 'ai-development-should-be-paused',
    motion: 'This house believes AI development should be paused.',
    format: 'apda',
    formats: 'APDA / BP / Worlds adaptable',
    domain: 'tech',
    difficulty: 'Medium',
    summary: 'A moratorium motion where enforcement, not risk, is the actual battleground.',
    reading: {
      asks: 'Whether frontier AI training should stop for a defined period. Scope matters enormously: all AI, frontier models above a compute threshold, or specific capabilities.',
      burden: 'Prop must specify scope, duration, and enforcement. An unbounded global pause is indefensible; a compute-threshold moratorium with export-control enforcement is arguable.',
      ground: 'Prop should take a frontier-only pause defined by training compute, enforced through the chip supply chain, because that is the one enforcement mechanism that actually exists.',
    },
    prop: {
      line: 'Capability is running ahead of the ability to evaluate it, and a pause is the only intervention that buys evaluation time.',
      args: [
        {
          title: 'Evaluation lags capability',
          claim: 'We deploy systems whose failure modes we discover after release.',
          warrant: 'Interpretability research is years behind scaling. Each frontier release surfaces behaviors, from jailbreaks to deceptive completions, that were not predicted by pre-deployment testing.',
          impact: 'Deploying into critical infrastructure while the failure surface is unmapped is a bet whose downside is unbounded and whose timeframe is now.',
        },
        {
          title: 'The race removes the safety margin',
          claim: 'Competitive dynamics push every lab to ship at the earliest defensible moment.',
          warrant: 'Safety testing is a cost that delays release. In a race, unilateral caution transfers market share to the least careful competitor, so nobody can afford it.',
          impact: 'A coordinated pause is the only move that changes the payoff matrix. Voluntary commitments fail for exactly the reason the pause is needed.',
        },
        {
          title: 'The chokepoint exists',
          claim: 'Frontier training runs need advanced chips from a supply chain with three or four real nodes.',
          warrant: 'TSMC, ASML, and a small number of fabs are the binding constraint. Export controls already demonstrate that this chokepoint is usable.',
          impact: 'Enforcement is not hypothetical, which distinguishes this from the arms-control comparisons Opp will reach for.',
        },
      ],
    },
    opp: {
      line: 'A pause you cannot enforce everywhere is a pause on the labs that would have done the safety work.',
      args: [
        {
          title: 'Asymmetric compliance',
          claim: 'The labs that pause are the ones already investing in alignment.',
          warrant: 'Western frontier labs have safety teams, publish evaluations, and answer to regulators. State programs and offshore actors do not, and they gain relative capability during the pause.',
          impact: 'You slow the most careful actors and hand the frontier to the least accountable. The risk Prop identifies gets worse, not better.',
        },
        {
          title: 'Safety comes from the frontier',
          claim: 'The techniques that make models safer are developed on frontier models.',
          warrant: 'RLHF, constitutional methods, and interpretability tooling were all built by studying the largest available systems. Freezing capability freezes the research that reduces the risk.',
          impact: 'Prop\'s mechanism defunds the solution to Prop\'s problem, and the pause has no exit condition because the research that would establish safety is the research being paused.',
        },
        {
          title: 'The counterfactual has a body count',
          claim: 'AI systems are delivering measurable benefits in diagnostics, drug discovery, and materials.',
          warrant: 'Protein-structure prediction and screening pipelines have already compressed research timelines that translate into treatments.',
          impact: 'A pause has a real present cost in delayed medicine against a speculative future benefit. Prop must show the risk magnitude beats a concrete opportunity cost.',
        },
      ],
    },
    clash: {
      question: 'Does a pause buy safety time, or does it just redistribute capability to actors who will not use the time for safety?',
      prop: 'Prop wins by proving the chip chokepoint makes enforcement real, which collapses the asymmetric-compliance attack.',
      opp: 'Opp wins by showing the offshore and state actors sit outside any enforceable perimeter, so the pause is unilateral disarmament with a safety label.',
    },
    mistakes: {
      prop: [
        'Running extinction risk as the lead. It invites a probability fight you do not need. Lead with evaluation lag, which is observable.',
        'Leaving the duration open. "Until it is safe" has no exit condition and Opp will say so.',
      ],
      opp: [
        'Arguing progress is always good. Too broad, and it concedes the framing that Prop is anti-progress.',
        'Ignoring the race-dynamics argument. It is the strongest structural claim on the table.',
      ],
    },
    related: ['grant-legal-personhood-to-advanced-ai', 'nationalise-frontier-ai-labs', 'require-ai-developers-to-license-training-data', 'open-source-ai-is-a-net-negative'],
    keywords: ['this house believes ai development should be paused', 'ai pause debate motion', 'ai moratorium arguments for and against', 'pause ai debate case'],
  },

  'abolish-legacy-admissions': {
    slug: 'abolish-legacy-admissions',
    motion: 'This house would abolish legacy admissions.',
    format: 'apda',
    formats: 'APDA / PF / Congress adaptable',
    domain: 'edu',
    difficulty: 'Intro',
    summary: 'One of the few motions where Prop has both the fairness argument and the empirics, so Opp has to get creative.',
    reading: {
      asks: 'Whether universities should stop giving admissions preference to the children of alumni. The live version is whether it should be banned by law or abandoned voluntarily.',
      burden: 'Prop has the easier side. The job is to close off Opp\'s donation argument with numbers rather than assertion.',
      ground: 'Prop should take a legal ban conditioned on federal funding, because it answers "let universities decide" and gives a mechanism.',
    },
    prop: {
      line: 'Legacy preference transfers an advantage from parent to child on no criterion the university itself claims to care about.',
      args: [
        {
          title: 'It is inherited advantage, stated plainly',
          claim: 'The preference rewards an applicant for a relationship they did nothing to earn.',
          warrant: 'Universities justify every other preference by reference to merit, adversity, or institutional need. Legacy status is the only one whose entire content is parentage.',
          impact: 'It converts a positional good into something closer to heritable property, which is the specific thing higher education claims to be an escape route from.',
        },
        {
          title: 'The effect size is large',
          claim: 'Legacy applicants at selective US universities are admitted at multiples of the base rate.',
          warrant: 'Institutional data from the Harvard litigation put legacy admit rates roughly five times the overall rate, with the advantage persisting after controlling for academic profile.',
          impact: 'This is not a tiebreaker at the margin. It displaces a measurable number of otherwise-admitted applicants every cycle.',
        },
        {
          title: 'The donation link is weak',
          claim: 'Universities that dropped legacy preference did not see giving collapse.',
          warrant: 'Johns Hopkins, Amherst, and MIT all admit without it and continue to raise money at scale. A 2010 study across selective institutions found no statistically significant relationship between legacy preference and alumni giving.',
          impact: 'Opp\'s central defense rests on a causal claim the evidence does not support, which removes the only consequentialist reason to keep it.',
        },
      ],
    },
    opp: {
      line: 'Banning it is a symbolic fix for a distributional problem whose real drivers sit upstream and untouched.',
      args: [
        {
          title: 'It is a rounding error on the real problem',
          claim: 'Wealth advantages admissions long before the application arrives.',
          warrant: 'Test prep, private schooling, unpaid internships, and counselor access do vastly more work than legacy status. Removing the visible mechanism leaves the invisible ones intact and better disguised.',
          impact: 'Prop buys a headline and leaves the distribution roughly where it was, while the reform energy that could have gone to the upstream causes is spent.',
        },
        {
          title: 'Institutional continuity has value',
          claim: 'Multigenerational attachment is what sustains endowments, mentoring networks, and long-horizon institutional behavior.',
          warrant: 'Universities operate on century timescales and rely on alumni loyalty for capital campaigns, career networks, and governance stability.',
          impact: 'Weakening that relationship has diffuse costs that show up over decades, which is exactly the kind of harm a short-run study will not detect.',
        },
        {
          title: 'Autonomy',
          claim: 'A legal ban puts the state inside private admissions.',
          warrant: 'Once the government sets one admissions criterion by statute, the same authority extends to the next contested one, and it will be used by whichever party holds it.',
          impact: 'Prop should want universities choosing to end it, which most selective institutions are already trending toward, rather than establishing a precedent that outlives the current politics.',
        },
      ],
    },
    clash: {
      question: 'Does removing the most visible form of inherited advantage matter if the larger invisible forms remain?',
      prop: 'Prop wins by showing legitimacy is the resource at stake: an admissions system with an open heredity clause cannot credibly ask anyone to accept its other judgments.',
      opp: 'Opp wins by proving the reform is cosmetic, that the donation and network effects are real, and that state control of admissions is the more durable harm.',
    },
    mistakes: {
      prop: [
        'Assuming the donation argument is obviously wrong. Bring the actual studies; Opp will assert the link confidently.',
        'Ignoring the ban-versus-voluntary distinction. Opp\'s autonomy argument only bites the legal version.',
      ],
      opp: [
        'Defending legacy preference as fair. You cannot win that; argue it is minor and that the ban is worse.',
        'Skipping the upstream argument. It is your strongest line and it reframes the whole round.',
      ],
    },
    related: ['ban-private-education', 'eliminate-standardized-testing', 'replace-take-home-essays-with-oral-examinations', 'treat-college-athletes-as-employees'],
    keywords: ['this house would abolish legacy admissions', 'legacy admissions debate', 'end legacy admissions arguments', 'legacy admissions motion analysis'],
  },

  'mandate-organ-donation-upon-death': {
    slug: 'mandate-organ-donation-upon-death',
    motion: 'This house would mandate organ donation upon death.',
    format: 'apda',
    formats: 'APDA / Worlds / PF adaptable',
    domain: 'ethics',
    difficulty: 'Medium',
    summary: 'A bodily-autonomy motion where Prop should be careful not to take more than they need.',
    reading: {
      asks: 'Whether the state should take organs from the deceased without prior consent. The weaker version, presumed consent with opt-out, is a different motion and Opp should say so if Prop tries to slide into it.',
      burden: 'The word is mandate. Prop that quietly argues for opt-out has abandoned the motion, and a good Opp will name that in their first speech.',
      ground: 'Prop should own conscription and argue that the dead have no interests to violate. Opp should force the distinction between mandate and presumed consent early, because opt-out gets most of the supply benefit at a fraction of the rights cost.',
    },
    prop: {
      line: 'The organs are being buried while people on the waiting list die, and the corpse has no competing interest.',
      args: [
        {
          title: 'The dead cannot be harmed',
          claim: 'Interests require a subject, and after death there is none.',
          warrant: 'We already override posthumous preferences routinely: autopsies happen without consent, estates are taxed, wills are set aside. The corpse has no experiential stake in the outcome.',
          impact: 'On one side of the scale is a preference held by nobody. On the other is a person who lives instead of dying. The comparison is not close once the first premise lands.',
        },
        {
          title: 'The shortage is the whole problem',
          claim: 'Waiting lists are long because supply is voluntary, not because demand is unusual.',
          warrant: 'Thousands die annually on transplant lists in the US and UK while usable organs are cremated. Even high-performing opt-out systems leave a gap because family veto and registration friction persist.',
          impact: 'Magnitude is measured in preventable deaths per year, probability is near one, and the timeframe is immediate. Few motions have impact calculus this clean.',
        },
        {
          title: 'Equity of access',
          claim: 'A voluntary system distributes both donation and receipt unevenly.',
          warrant: 'Donation rates vary sharply by community, and matching is tissue-dependent, so groups with low registration wait longest for organs.',
          impact: 'Universal supply removes a health inequality that voluntary campaigns have failed to close over decades of trying.',
        },
      ],
    },
    opp: {
      line: 'You do not need conscription to fix the shortage, and taking it destroys the trust the system runs on.',
      args: [
        {
          title: 'Opt-out gets the benefit without the cost',
          claim: 'Presumed-consent systems reach donation rates close to the achievable ceiling.',
          warrant: 'Spain, Austria, and Belgium run opt-out with high yields. Spain\'s advantage comes largely from transplant-coordinator infrastructure rather than the consent rule itself, which is available to any system.',
          impact: 'Prop pays the entire autonomy cost for a marginal supply gain over the best available alternative. That comparative loses.',
        },
        {
          title: 'Trust is load-bearing',
          claim: 'A system that takes without asking invites suspicion about end-of-life care.',
          warrant: 'Where communities already distrust medical institutions, and many have historical reason to, mandatory harvest confirms the fear that the hospital has an interest in your death.',
          impact: 'You risk reduced presentation for treatment and organized resistance, which can cut total organ availability below the voluntary baseline. The mechanism is self-defeating.',
        },
        {
          title: 'Religious and bodily commitments survive death',
          claim: 'Several traditions hold specific requirements about burial and bodily integrity.',
          warrant: 'For observant families this is not a preference about a corpse, it is a duty owed by the living. Prop\'s "no subject, no harm" argument does not reach the people who bear the obligation.',
          impact: 'The state overrides a religious duty for a supply gain it could have obtained through opt-out, which fails the necessity test any rights infringement has to pass.',
        },
      ],
    },
    clash: {
      question: 'Is the supply gain from mandate over opt-out large enough to justify the difference in rights cost?',
      prop: 'Prop wins by showing family veto and registration friction cap opt-out well below the achievable rate, so the residual gap is real people.',
      opp: 'Opp wins by showing the gap is small, the trust damage is large, and the coordinator infrastructure closes the difference without conscription.',
    },
    mistakes: {
      prop: [
        'Sliding from mandate to opt-out mid-round. Opp will catch it and you lose the motion you were assigned.',
        'Dismissing religious objections as irrational. Engage the duty-on-the-living framing or it stands.',
      ],
      opp: [
        'Running bodily autonomy of the deceased as the lead. Prop has a clean answer. Lead with the opt-out comparative instead.',
        'Failing to name the mandate-versus-opt-out distinction early. It is the round-winning move and it works best in the first speech.',
      ],
    },
    related: ['abolish-intellectual-property-for-medicines', 'the-ends-justify-the-means', 'decriminalize-sex-work', 'require-a-license-to-become-a-parent'],
    keywords: ['this house would mandate organ donation', 'mandatory organ donation debate', 'presumed consent organ donation motion', 'organ donation debate arguments'],
  },

  // ── BRITISH PARLIAMENTARY ───────────────────────────────────────

  'abolish-the-filibuster': {
    slug: 'abolish-the-filibuster',
    motion: 'This House would abolish the filibuster.',
    format: 'bp',
    formats: 'BP / APDA / Congress adaptable',
    domain: 'civic',
    difficulty: 'Medium',
    summary: 'An institutional-design motion that rewards teams willing to argue against their own party\'s short-term interest.',
    reading: {
      asks: 'Whether the US Senate should remove the 60-vote threshold for ending debate, making legislation pass by simple majority.',
      burden: 'Both sides must argue from behind a veil. A case that only works while your side holds the Senate loses to the team that asks what happens after the next election.',
      ground: 'In BP, Opening Gov should take clean abolition and own the majoritarian principle. Closing Gov has strong extension ground on comparative institutions: every other developed legislature passes laws by majority and none has collapsed.',
    },
    prop: {
      line: 'A supermajority requirement nobody voted for has made the legislature structurally incapable of legislating.',
      args: [
        {
          title: 'It is not in the Constitution',
          claim: 'The filibuster is a procedural accident, not a designed check.',
          warrant: 'It emerged from a cleanup of Senate rules in 1806 and went largely unused for a century. The founders specified supermajorities for treaties, impeachment, and amendments, which means the omission elsewhere was deliberate.',
          impact: 'Opp\'s appeal to constitutional design is backwards. Prop is restoring the intended threshold, not inventing a new one.',
        },
        {
          title: 'Gridlock relocates power',
          claim: 'When Congress cannot legislate, the executive and the courts decide instead.',
          warrant: 'Policy moves by executive order and agency rule, which the next president reverses, and by litigation resolved by unelected judges. Both are less accountable than a statute.',
          impact: 'You do not get stability from gridlock, you get unstable policy made by the least democratic branch. The harm runs continuously and is getting worse each cycle.',
        },
        {
          title: 'Accountability requires the ability to act',
          claim: 'Voters cannot judge a majority that was never allowed to govern.',
          warrant: 'A party that campaigns on a program, wins, and then blames a procedural threshold faces no test of whether the program worked.',
          impact: 'Democratic feedback needs enacted policy to evaluate. The filibuster severs the loop between election result and governing record.',
        },
      ],
    },
    opp: {
      line: 'A 51-vote Senate turns every election into a total-control event, and the whiplash costs more than the gridlock.',
      args: [
        {
          title: 'Policy whiplash',
          claim: 'Simple-majority passage means simple-majority repeal.',
          warrant: 'Healthcare, tax, immigration, and climate rules would rewrite every time the chamber flips. Businesses, states, and households cannot plan against a two-year policy horizon.',
          impact: 'Uncertainty is itself a cost. Long-horizon investment, which is exactly what climate and infrastructure need, requires a durable rule.',
        },
        {
          title: 'Minority protection has to live somewhere',
          claim: 'The Senate is where geographically dispersed minorities have leverage.',
          warrant: 'The House is majoritarian by design and the presidency is a single actor. Remove the Senate threshold and no federal institution requires cross-party assent for ordinary law.',
          impact: 'The magnitude is structural and permanent. Prop needs to name where minority protection goes, and usually cannot.',
        },
        {
          title: 'It forces negotiation that produces better law',
          claim: 'Bills that clear 60 have broader buy-in and survive longer.',
          warrant: 'The major durable statutes, from civil rights legislation to infrastructure packages, cleared with cross-party votes. Party-line reconciliation bills are the ones that get unwound.',
          impact: 'Prop wins speed and loses durability. On any policy whose benefits accrue over more than one cycle, that trade is negative.',
        },
      ],
    },
    clash: {
      question: 'Is a legislature that cannot pass laws worse than one whose laws flip every two years?',
      prop: 'Prop wins by showing the vacuum is already being filled by executive orders and courts, so the choice is not gridlock versus whiplash but whiplash by decree versus whiplash by statute.',
      opp: 'Opp wins by proving the 60-vote threshold is what makes durable legislation possible, and that Prop\'s examples of executive overreach are arguments for restraining the executive.',
    },
    mistakes: {
      prop: [
        'Arguing from the current partisan configuration. It dates your case by one election and judges notice.',
        'Skipping where minority protection goes. Opp will ask and the silence is loud.',
      ],
      opp: [
        'Defending the filibuster\'s history. Its history is segregationist obstruction and Prop will read it back to you.',
        'Only running whiplash. Pair it with the institutional-location argument or Prop\'s executive-overreach turn eats it.',
      ],
    },
    related: ['pack-the-supreme-court', 'abolish-the-electoral-college', 'abolish-the-senate', 'replace-a-chamber-with-a-citizens-assembly'],
    keywords: ['this house would abolish the filibuster', 'filibuster debate motion', 'abolish filibuster arguments for and against', 'bp motion filibuster'],
  },

  'break-up-google': {
    slug: 'break-up-google',
    motion: 'This House would break up Google.',
    format: 'bp',
    formats: 'BP / APDA / Policy adaptable',
    domain: 'econ',
    difficulty: 'Medium',
    summary: 'An antitrust motion that turns on whether the harm is monopoly power or something structural breakup cannot reach.',
    reading: {
      asks: 'Whether the state should force divestiture, typically separating search from advertising, Android, YouTube, and cloud.',
      burden: 'Prop must name the cut. "Break up Google" without a separation line invites Opp to pick the least defensible version and argue against that.',
      ground: 'Prop should take the ad-tech separation, splitting the buy side, sell side, and exchange, because that is the cut US and EU regulators have actually pursued and it has a live evidentiary record.',
    },
    prop: {
      line: 'Google sits on both sides of the ad auction and owns the exchange, which is a conflict no conduct remedy has fixed.',
      args: [
        {
          title: 'Structural conflict, structural remedy',
          claim: 'Operating the buyer, the seller, and the marketplace at once is a position no referee should hold.',
          warrant: 'Court filings in the US ad-tech case describe internal programs that adjusted auction mechanics in Google\'s favor. Behavioral remedies require a regulator to monitor an auction running billions of times daily, which is not a supervisable task.',
          impact: 'Only separation removes the incentive. Every conduct decree since 2010 has been followed by a new variant of the same conduct.',
        },
        {
          title: 'Publishers absorb the tax',
          claim: 'Google takes a cut at each layer of the stack it controls.',
          warrant: 'Estimates from the UK CMA put the total take rate across the chain at roughly 30 cents of every advertiser dollar. Publishers cannot route around a stack that includes the dominant exchange.',
          impact: 'The transfer runs at industry scale every year and falls hardest on news publishers, which is where the downstream civic harm shows up.',
        },
        {
          title: 'Default deals foreclose entry',
          claim: 'Paying to be the default search engine buys the market rather than winning it.',
          warrant: 'Google pays Apple a sum in the tens of billions annually for default placement. A rival cannot outbid that without the revenue that only default placement produces.',
          impact: 'Entry is blocked by a mechanism unrelated to product quality, so the market cannot self-correct on any timeframe.',
        },
      ],
    },
    opp: {
      line: 'The product is free, the switching cost is one click, and breakup trades an integrated service for a worse one at real user cost.',
      args: [
        {
          title: 'Consumers are not paying more',
          claim: 'The classic antitrust harm, supra-competitive prices, is absent.',
          warrant: 'Search, maps, and mail are free at the point of use. The advertiser-side harm is real but it is a dispute between commercial parties, not a consumer-welfare case.',
          impact: 'Prop is asking for the most invasive remedy in the antitrust toolkit against a firm whose users are not being overcharged. That standard, once relaxed, applies to every large integrated firm.',
        },
        {
          title: 'Integration produces the quality',
          claim: 'Search, Android, and Maps improve each other through shared signal.',
          warrant: 'Ranking quality depends on cross-product behavioral data. Separated entities cannot share it, which is the point of the separation and also the mechanism of the degradation.',
          impact: 'Users get a worse product immediately while the competitive benefit is speculative and arrives years later, if at all.',
        },
        {
          title: 'The threat is already elsewhere',
          claim: 'Search behavior is fragmenting to AI assistants, TikTok, and Amazon.',
          warrant: 'Product discovery increasingly starts on Amazon, and conversational AI is absorbing informational queries. Google\'s share of the actual job is falling without intervention.',
          impact: 'Breakup remedies a 2015 market in 2026. Prop should show why the market cannot correct itself, and the current shift is evidence that it can.',
        },
      ],
    },
    clash: {
      question: 'Is the ad-tech conflict of interest reachable by conduct remedies, or does it require separation?',
      prop: 'Prop wins by showing every conduct decree has been evaded, which makes supervision structurally impossible rather than merely difficult.',
      opp: 'Opp wins by narrowing the harm to advertisers, proposing targeted ad-market rules, and pricing the user-side quality loss that breakup imposes on everyone.',
    },
    mistakes: {
      prop: [
        'Arguing Google is too big. Size is not an antitrust theory; conduct and foreclosure are.',
        'Leaving the separation line unnamed. Opp gets to pick the version they can beat.',
      ],
      opp: [
        'Claiming there is no harm. The ad-tech record is strong and denying it costs credibility on everything else.',
        'Skipping the free-to-consumer framing. It is your best structural answer to the whole case.',
      ],
    },
    related: ['nationalise-frontier-ai-labs', 'require-major-tech-firms-to-sell-ai-divisions', 'ban-political-advertising-on-social-media', 'require-ai-developers-to-license-training-data'],
    keywords: ['this house would break up google', 'break up big tech debate', 'google antitrust debate motion', 'bp antitrust motion'],
  },

  'nationalise-frontier-ai-labs': {
    slug: 'nationalise-frontier-ai-labs',
    motion: 'This House would nationalise frontier AI labs.',
    format: 'bp',
    formats: 'BP / APDA adaptable',
    domain: 'tech',
    difficulty: 'Hard',
    summary: 'A high-ceiling motion where the best teams argue about who ends up controlling the technology, not about whether AI is dangerous.',
    reading: {
      asks: 'Whether the state should take ownership of the labs training frontier models. Which state matters: a US nationalisation and an international consortium defend completely differently.',
      burden: 'Prop must pick an owner and defend that owner\'s incentives. Opp\'s strongest line is that the state is a worse steward than the firm, so Prop has to engage government capability directly.',
      ground: 'Prop should take nationalisation into a public-benefit corporation with a statutory safety mandate, modeled on the way nuclear weapons research is held, rather than a normal government department.',
    },
    prop: {
      line: 'A technology with state-level consequences is currently owned by firms whose fiduciary duty runs to shareholders.',
      args: [
        {
          title: 'The incentive is misaligned by construction',
          claim: 'A private lab is legally obliged to prioritise return, and safety is a cost.',
          warrant: 'Every frontier lab founded on a safety mission has since restructured toward commercial capital. That is not hypocrisy, it is what capital requirements do to a mission.',
          impact: 'You cannot fix by regulation an incentive that operates on every internal decision. Ownership is the only lever that changes the objective function.',
        },
        {
          title: 'The externality is national-security scale',
          claim: 'Frontier capability affects biosecurity, cyber-offence, and information integrity.',
          warrant: 'These are precisely the domains where states already refuse private control. No country lets a private firm decide enrichment policy or export its own cryptographic standards.',
          impact: 'Consistency plus magnitude: the same reasoning that nationalised fissile material applies here, and the timeframe is now rather than after an incident.',
        },
        {
          title: 'Public capital is already the input',
          claim: 'The research base, the chips, and the security guarantees are publicly underwritten.',
          warrant: 'Transformer research came out of publicly funded labs, export controls protect the chip supply, and the compute build-out depends on state-approved energy infrastructure.',
          impact: 'The public bears the risk and the input cost while the returns privatise. Nationalisation aligns who pays with who owns.',
        },
      ],
    },
    opp: {
      line: 'You are handing the most powerful surveillance and persuasion technology ever built to the one actor with a monopoly on force.',
      args: [
        {
          title: 'State ownership is state capability',
          claim: 'A government that owns the frontier model owns the ability to deploy it domestically.',
          warrant: 'Every capability Prop worries about, persuasion, surveillance, autonomous targeting, becomes directly available to the executive with no commercial party in the way to refuse.',
          impact: 'Prop\'s risk model assumes a benign owner. Across a twenty-year horizon and multiple administrations, that assumption fails at some point, and the failure is not recoverable.',
        },
        {
          title: 'Talent exits',
          claim: 'Frontier research depends on a few thousand people who can work anywhere.',
          warrant: 'Nationalisation means civil-service pay bands, clearance requirements, and publication restrictions. The researchers move to whichever jurisdiction did not nationalise.',
          impact: 'You acquire the buildings and lose the capability. The paused-capability outcome Prop wanted arrives, but the frontier continues somewhere with less oversight.',
        },
        {
          title: 'Regulation reaches the same goal',
          claim: 'Compute thresholds, mandatory evaluations, and liability rules bind behavior without transferring ownership.',
          warrant: 'The EU AI Act and US executive actions already impose pre-deployment obligations. These are enforceable against firms that remain private and remain accountable to courts.',
          impact: 'Prop must show a safety benefit unreachable by regulation. If regulation gets most of it, the ownership transfer is unjustified risk.',
        },
      ],
    },
    clash: {
      question: 'Is a profit motive or a state monopoly on force the more dangerous thing to attach to frontier AI?',
      prop: 'Prop wins by showing commercial pressure is already producing measurable safety compromises, and that democratic states have governed dangerous technologies before.',
      opp: 'Opp wins by making the misuse case concrete: name the administration, name the deployment, and show no institutional check survives state ownership.',
    },
    mistakes: {
      prop: [
        'Leaving "the state" undefined. A US-only nationalisation and a UN consortium face opposite objections.',
        'Ignoring talent flight. It is the most concrete Opp mechanism and it needs an answer, not a dismissal.',
      ],
      opp: [
        'Defending labs as responsible actors. Prop has the receipts on restructuring and you do not need the claim.',
        'Running only market efficiency. This motion is about safety and power, and an efficiency case reads as missing the point.',
      ],
    },
    related: ['ai-development-should-be-paused', 'break-up-google', 'require-ai-developers-to-license-training-data', 'grant-legal-personhood-to-advanced-ai'],
    keywords: ['this house would nationalise frontier ai labs', 'nationalise ai debate motion', 'government ownership of ai labs debate', 'bp ai motion'],
  },

  'seize-frozen-russian-assets': {
    slug: 'seize-frozen-russian-assets',
    motion: 'This House would seize frozen Russian state assets to fund the reconstruction of Ukraine.',
    format: 'bp',
    formats: 'BP / Worlds / PF adaptable',
    domain: 'global',
    difficulty: 'Hard',
    summary: 'A motion about legal precedent, not about whether Russia deserves it. Teams that miss that lose.',
    reading: {
      asks: 'Whether roughly $300bn in immobilised Russian central-bank reserves should be confiscated outright and transferred to Ukraine, rather than held frozen or used only for the interest they generate.',
      burden: 'Prop must answer sovereign immunity. Central-bank reserves have stronger protection than private assets, and "they invaded" is a moral claim, not a legal mechanism.',
      ground: 'Prop should take confiscation via a countermeasures theory under international law, executed multilaterally through the G7, because unilateral seizure is much harder to defend.',
    },
    prop: {
      line: 'The reconstruction bill exists, the money exists, and the only question is who pays.',
      args: [
        {
          title: 'The aggressor should bear the cost',
          claim: 'Reparations from an aggressor state are an established principle, not an innovation.',
          warrant: 'The UN General Assembly has affirmed Russia\'s obligation to make reparation, and the register of damage is already established. Confiscation executes an obligation that has been formally recognised.',
          impact: 'The alternative is that European and American taxpayers fund reconstruction while the responsible state keeps its reserves. That is a transfer from victims to aggressor.',
        },
        {
          title: 'Frozen is not neutral',
          claim: 'Holding assets indefinitely is itself a decision with costs.',
          warrant: 'Reconstruction needs capital now: grids, housing, and demining have compounding returns and rapidly rising costs the longer they wait. Ukraine is borrowing at cost against a future settlement that may never come.',
          impact: 'The delay converts into permanent damage, emigration that does not reverse, and higher eventual cost. Timeframe is doing real work here.',
        },
        {
          title: 'Deterrence needs a price tag',
          claim: 'If reserves are safe from consequence, the cost of aggression is bounded.',
          warrant: 'Freezing is reversible and every potential aggressor knows it. Confiscation makes the loss real and therefore makes the calculation different for the next state considering it.',
          impact: 'The deterrent value extends beyond this conflict to every future one, which is a larger magnitude than the reconstruction sum itself.',
        },
      ],
    },
    opp: {
      line: 'Confiscating central-bank reserves tells every state on earth that reserves held in your currency are political, and they will act on it.',
      args: [
        {
          title: 'Reserve-currency damage',
          claim: 'The value of holding dollars and euros rests on the assumption that reserves are untouchable.',
          warrant: 'Central banks in the Gulf, China, and across the Global South are already diversifying. Confiscation converts a hypothetical risk into a demonstrated one and gives the strongest available argument to every de-dollarisation program.',
          impact: 'The West loses the financial infrastructure that makes sanctions work at all. You spend the sanctions weapon to fire it once.',
        },
        {
          title: 'The legal basis is thin',
          claim: 'Sovereign immunity for central-bank assets is one of the most settled rules in international law.',
          warrant: 'Countermeasures doctrine permits temporary, reversible measures aimed at inducing compliance. Permanent confiscation is neither temporary nor reversible, which is why most G7 legal advisers stopped short of it.',
          impact: 'Acting outside the law to punish a state that acted outside the law removes the standing on which the whole case against Russia rests.',
        },
        {
          title: 'The precedent has no limiting principle',
          claim: 'Whoever holds the assets decides when aggression justifies seizure.',
          warrant: 'There is no neutral adjudicator. The same reasoning is available to any state holding another\'s reserves whenever it judges the conduct sufficiently bad, and judgments differ.',
          impact: 'You establish a rule you do not control. The states most likely to use it next are not the ones writing it now.',
        },
      ],
    },
    clash: {
      question: 'Is the reconstruction and deterrence gain worth degrading the legal and monetary system that makes Western financial leverage possible?',
      prop: 'Prop wins by showing diversification is already happening for unrelated reasons, so the marginal reserve-currency damage is small against a certain reconstruction benefit.',
      opp: 'Opp wins by proving the immunity rule is load-bearing, and by offering the windfall-profits route, using only the interest, as the option that funds Ukraine without breaking it.',
    },
    mistakes: {
      prop: [
        'Arguing Russia deserves it. Nobody disputes that. The round is about the mechanism and the precedent.',
        'Ignoring the interest-only alternative. Opp will offer it as the reasonable middle and it is genuinely strong.',
      ],
      opp: [
        'Sounding like you are defending Russia. Frame everything through the system, never through the aggressor.',
        'Overstating de-dollarisation. Prop will show the trend predates this and is slow.',
      ],
    },
    related: ['ban-the-export-of-dual-use-surveillance-technology', 'economic-sanctions-do-more-harm-than-good', 'reduce-the-powers-of-un-security-council-permanent-members', 'replace-the-imf-with-a-multipolar-lending-body'],
    keywords: ['seize frozen russian assets debate', 'this house would seize russian state assets', 'russian assets ukraine reconstruction motion', 'bp motion russian assets'],
  },

  'ban-political-advertising-on-social-media': {
    slug: 'ban-political-advertising-on-social-media',
    motion: 'This House would ban political advertising on social media.',
    format: 'bp',
    formats: 'BP / Worlds / PF adaptable',
    domain: 'civic',
    difficulty: 'Medium',
    summary: 'A speech-regulation motion where the definition of political advertising decides half the round.',
    reading: {
      asks: 'Whether paid political advertising should be prohibited on platforms. Twitter banned it in 2019 and Google restricted microtargeting, so there are real comparators.',
      burden: 'Prop must define political advertising. Issue ads, advocacy from charities, and get-out-the-vote messaging all sit in the grey zone, and Opp will live there.',
      ground: 'Prop should define narrowly, paid placement by candidates, parties, and registered political committees, and concede organic speech entirely. That removes most of the censorship attack.',
    },
    prop: {
      line: 'Microtargeted paid political speech breaks the one thing public campaigning depended on: everybody hearing the same message.',
      args: [
        {
          title: 'No shared record',
          claim: 'Targeted ads let a campaign tell different groups incompatible things with no cross-audience check.',
          warrant: 'Broadcast advertising was self-policing because opponents and journalists saw every ad. Segment-level delivery means a claim can reach 40,000 people and never be seen by anyone positioned to rebut it.',
          impact: 'Accountability for political claims requires a common record. Its absence is a structural harm that runs every cycle and worsens as targeting improves.',
        },
        {
          title: 'Money converts to reach more efficiently here',
          claim: 'Platform advertising gives a precise conversion of spend into persuasion at the margin.',
          warrant: 'Optimisation targets persuadable voters directly, which is far more efficient than broadcast. The advantage scales with budget, so the spending gap between campaigns translates into a larger outcome gap than it used to.',
          impact: 'Political inequality compounds. A ban removes the highest-efficiency channel and pushes campaigning back toward organising, which money buys less well.',
        },
        {
          title: 'Enforcement of existing rules has failed',
          claim: 'Platforms cannot police the volume they sell.',
          warrant: 'Ad libraries are incomplete, foreign-origin spending is routed through intermediaries, and moderation decisions are made by systems reviewing millions of creatives.',
          impact: 'A prohibition is enforceable in a way that content review is not: you check whether money changed hands, not whether a claim is true.',
        },
      ],
    },
    opp: {
      line: 'A ban entrenches whoever already has attention and hands the agenda to platforms and media owners nobody elected.',
      args: [
        {
          title: 'Challengers need to buy reach',
          claim: 'Incumbents have name recognition, press access, and existing lists. Challengers have money at best.',
          warrant: 'Paid placement is the only channel a new candidate can use to reach voters who have never heard of them. Organic reach favours accounts that already have followers.',
          impact: 'You lock in the current field. The harm falls on exactly the insurgent and minor-party candidates that a healthy democracy depends on.',
        },
        {
          title: 'The line cannot hold',
          claim: 'Political speech does not separate cleanly from issue speech.',
          warrant: 'A climate charity ad during an election, a union video on labour law, a hospital campaign on funding: each is political in effect and none is candidate advertising. Platforms will over-remove to stay safe.',
          impact: 'The predictable outcome is suppression of civil-society speech while professional campaigns route around the rule through influencers and unpaid coordination.',
        },
        {
          title: 'Displacement, not removal',
          claim: 'Money moves to channels with less transparency.',
          warrant: 'After Twitter\'s ban, spending shifted to influencer partnerships, podcasts, and dark-post equivalents, none of which appear in any ad library.',
          impact: 'Prop loses the one thing they had, a disclosure regime with named payers, and gets a less visible market instead.',
        },
      ],
    },
    clash: {
      question: 'Does removing paid political speech level the field or freeze it?',
      prop: 'Prop wins by showing targeting is qualitatively different from broadcast, so the harm is not about money in politics generally but about a channel that defeats scrutiny by design.',
      opp: 'Opp wins on the challenger-access mechanism plus displacement: the ban costs insurgents their only route to voters while professionalised money simply changes shape.',
    },
    mistakes: {
      prop: [
        'Leaving the definition to Opp. Define narrowly in the first speech or spend the round defending charity ads.',
        'Running general money-in-politics. It argues for campaign-finance reform, not a channel ban.',
      ],
      opp: [
        'Leading with free speech absolutism. Weak in most jurisdictions and it skips your better mechanisms.',
        'Missing displacement. It is the empirically strongest line and it comes with a real comparator.',
      ],
    },
    related: ['criminalise-lying-by-elected-officials', 'require-ai-generated-content-to-be-watermarked', 'ban-deepfake-content-of-real-people', 'require-id-verification-to-use-social-media'],
    keywords: ['ban political advertising on social media debate', 'this house would ban political ads', 'political advertising ban motion', 'bp political advertising motion'],
  },

  // ── ASIAN PARLIAMENTARY ─────────────────────────────────────────

  'asean-south-china-sea-code-of-conduct': {
    slug: 'asean-south-china-sea-code-of-conduct',
    motion: 'This House, as ASEAN, would adopt a binding South China Sea code of conduct.',
    format: 'asian',
    formats: 'Asian Parliamentary / BP / WSDC adaptable',
    domain: 'global',
    difficulty: 'Hard',
    summary: 'An actor motion. You are ASEAN, so every argument has to run through what ASEAN can actually do.',
    reading: {
      asks: 'Whether ASEAN should adopt a legally binding code governing conduct in the South China Sea, replacing the non-binding 2002 declaration. You are the actor, so feasibility inside ASEAN is on you.',
      burden: 'ASEAN decides by consensus and includes states that depend on Chinese investment. A case that ignores Cambodia and Laos is not an ASEAN case.',
      ground: 'Prop should take a code binding among ASEAN members first, with accession open to China, rather than one requiring Chinese signature up front. It is the version that survives the consensus problem.',
    },
    prop: {
      line: 'Non-binding language has produced twenty years of reclamation, and the only asset ASEAN has is collective position.',
      args: [
        {
          title: 'Ambiguity is the thing being exploited',
          claim: 'The 2002 declaration has no definitions, no enforcement, and no penalty.',
          warrant: 'Under it, artificial-island construction, militarisation of features, and coast-guard harassment all proceeded without breaching anything. A binding code with specified prohibited conduct removes the deniability.',
          impact: 'You convert incidents from ambiguous into violations. That is the precondition for any external pressure, legal or diplomatic, to have a hook.',
        },
        {
          title: 'Bilateral is where small states lose',
          claim: 'Handled one at a time, every ASEAN claimant negotiates alone against a far larger power.',
          warrant: 'The Philippines won at the Permanent Court of Arbitration in 2016 and could not enforce it. A collective instrument makes each incident a matter for ten states rather than one.',
          impact: 'Asymmetry is the core problem for every claimant. Collective position is the only variable ASEAN controls and it is available now.',
        },
        {
          title: 'Credibility of the institution',
          claim: 'ASEAN centrality is the organisation\'s stated reason to exist.',
          warrant: 'If the region\'s defining security question is resolved by external powers while ASEAN issues communiqués, the centrality claim is hollow and members will route around it.',
          impact: 'Failure here costs ASEAN relevance across trade, disaster response, and every other file. The institutional damage outlasts the dispute.',
        },
      ],
    },
    opp: {
      line: 'A binding code either fails to pass consensus or passes so watered down that it legitimises the status quo.',
      args: [
        {
          title: 'Consensus makes it impossible or empty',
          claim: 'ASEAN requires unanimity and several members are economically dependent on Beijing.',
          warrant: 'Cambodia blocked a joint communiqué on this issue in 2012. Any text that binds meaningfully will be vetoed; any text that passes will be drafted to be acceptable to the states least willing to constrain China.',
          impact: 'The realistic output is a document that formalises current control and forecloses the stronger positions claimants currently hold in reserve.',
        },
        {
          title: 'Binding without enforcement is worse than nothing',
          claim: 'ASEAN has no navy, no court, and no sanctions capacity.',
          warrant: 'A binding instrument that is then breached without consequence demonstrates the ceiling of ASEAN power more clearly than ambiguity ever did.',
          impact: 'You spend the organisation\'s remaining deterrent ambiguity and receive a documented failure in exchange.',
        },
        {
          title: 'It cuts across the hedge',
          claim: 'Members currently balance American security ties against Chinese economic ties.',
          warrant: 'A binding code forces each state into an explicit position on the region\'s hardest question, which is precisely what the hedging strategy exists to avoid.',
          impact: 'Prop risks fracturing ASEAN into blocs. That is a larger and more permanent harm than the reclamation the code was meant to stop.',
        },
      ],
    },
    clash: {
      question: 'Does a binding code create leverage ASEAN does not have, or spend the ambiguity that is currently protecting its members?',
      prop: 'Prop wins by proving ambiguity has already failed on the observable record, so the hedge is protecting nothing that is still there.',
      opp: 'Opp wins on the consensus mechanism: show the only passable text is a weak one, and a weak binding code is worse than a strong non-binding one.',
    },
    mistakes: {
      prop: [
        'Arguing as if you were the Philippines or the US. The actor is ASEAN and the consensus constraint is yours.',
        'Assuming China signs. Build the case so it works without Chinese accession.',
      ],
      opp: [
        'Defending the status quo as adequate. It plainly is not; argue the alternative is worse.',
        'Ignoring the institutional-credibility argument. It is Prop\'s best actor-specific line.',
      ],
    },
    related: ['philippines-accept-chinese-infrastructure-investment', 'un-security-council-permanent-seat-for-india', 'regrets-the-rise-of-china-as-regional-hegemon', 'asean-fast-track-timor-leste-membership'],
    keywords: ['asean south china sea code of conduct debate', 'this house as asean would adopt a binding code of conduct', 'south china sea debate motion', 'asian parliamentary motion south china sea'],
  },

  'india-scrap-caste-based-affirmative-action': {
    slug: 'india-scrap-caste-based-affirmative-action',
    motion: 'This House, as India, would scrap caste-based affirmative action.',
    format: 'asian',
    formats: 'Asian Parliamentary / WSDC / BP adaptable',
    domain: 'social',
    difficulty: 'Hard',
    summary: 'A reservation motion that requires actual knowledge of how Indian reservations work. Generic affirmative-action arguments do not survive contact.',
    reading: {
      asks: 'Whether India should end caste-based reservation in education and public employment. The serious version of Prop replaces it with an economic-criteria system rather than removing support entirely.',
      burden: 'Prop must engage caste as a live social fact, not just a historical one. Opp must answer creamy-layer capture, which is the strongest empirical attack available.',
      ground: 'Prop should take replacement with an income-and-assets criterion, keeping the total quota size. That reframes the round from "abandon the disadvantaged" to "target the disadvantaged accurately."',
    },
    prop: {
      line: 'Reservation is capturing the wrong beneficiaries within the right categories, and the categories themselves have become political currency.',
      args: [
        {
          title: 'The benefit concentrates at the top of each category',
          claim: 'Within reserved groups, the same families access reserved seats across generations.',
          warrant: 'This is why the creamy-layer exclusion exists for OBCs at all. The exclusion is under-enforced, and the poorest within Scheduled Caste and Scheduled Tribe communities remain under-represented in the seats reserved for them.',
          impact: 'The policy is not reaching the people it was designed for, and an economic criterion reaches them directly.',
        },
        {
          title: 'It has become a political market',
          claim: 'Reservation categories are expanded and contested for electoral reasons.',
          warrant: 'The Jat, Patidar, and Maratha agitations were campaigns by relatively prosperous, landholding communities for reserved status. The 50% ceiling has been repeatedly pressured, and the EWS amendment breached it.',
          impact: 'The system entrenches caste as the operative political identity, which is the opposite of what the constitutional framers intended it to achieve over time.',
        },
        {
          title: 'It hardens the category it was meant to dissolve',
          claim: 'Permanent legal salience keeps caste central to public life.',
          warrant: 'Ambedkar framed reservation as a transitional measure. Seventy-five years in, caste certificates are a routine part of administrative identity for every citizen who uses the system.',
          impact: 'You cannot make a category obsolete by attaching resources to it indefinitely. The timeframe argument is Prop\'s and it is strong.',
        },
      ],
    },
    opp: {
      line: 'Caste discrimination is present-tense and economic criteria do not detect it.',
      args: [
        {
          title: 'The disadvantage is social, not just financial',
          claim: 'Caste operates through networks, housing, marriage, and hiring, independent of income.',
          warrant: 'Audit studies in Indian labour markets show callback gaps by surname at matched qualifications. A wealthy Dalit applicant still faces the network exclusion that an income test cannot see.',
          impact: 'An economic criterion under-serves exactly the harm reservation exists to correct, so Prop\'s replacement misses the mechanism while claiming to target it better.',
        },
        {
          title: 'Representation has independent value',
          claim: 'Reserved seats in the bureaucracy and judiciary change how institutions treat those communities.',
          warrant: 'A police force or district administration with no Dalit officers handles caste-atrocity cases differently. Representation is not only a benefit to the appointee.',
          impact: 'Prop\'s income-based replacement produces a poor-but-upper-caste intake, which does nothing for institutional composition.',
        },
        {
          title: 'The creamy layer is an argument for reform',
          claim: 'Capture is a case for enforcing the exclusion, not for scrapping the basis.',
          warrant: 'Sub-categorisation and stricter creamy-layer enforcement are available now and directly target Prop\'s stated harm.',
          impact: 'Comparative failure: Prop pays the full cost of removing caste protection to fix a problem with a cheaper and better-aimed remedy.',
        },
      ],
    },
    clash: {
      question: 'Is caste disadvantage reducible to economic disadvantage?',
      prop: 'Prop wins by showing the surviving discrimination is concentrated among the poor within each caste, so an economic criterion captures nearly all of it and misdirects less.',
      opp: 'Opp wins on the audit-study evidence: identical income, identical qualifications, different outcome by surname, which economic targeting cannot reach by construction.',
    },
    mistakes: {
      prop: [
        'Running American colourblindness arguments. The Indian system is quota-based and constitutionally grounded, and the transplant shows.',
        'Ignoring atrocity data. If you claim caste is fading, Opp will produce the numbers.',
      ],
      opp: [
        'Denying creamy-layer capture. It is well documented and denial costs you the round\'s credibility.',
        'Treating reservation as permanent by right. Ambedkar did not, and Prop will quote him.',
      ],
    },
    related: ['prioritize-gender-quotas-over-caste-quotas', 'uniform-civil-code-for-indian-states', 'scrap-the-gaokao-jee-ksat', 'regrets-the-rise-of-hindu-nationalism'],
    keywords: ['india caste based affirmative action debate', 'scrap caste reservation motion', 'reservation debate india arguments', 'asian parliamentary caste motion'],
  },

  'pay-couples-in-aging-east-asian-economies-to-have-children': {
    slug: 'pay-couples-in-aging-east-asian-economies-to-have-children',
    motion: 'This House would pay couples in aging East Asian economies to have children.',
    format: 'asian',
    formats: 'Asian Parliamentary / WSDC / BP adaptable',
    domain: 'econ',
    difficulty: 'Medium',
    summary: 'A pronatalist motion where the evidence base cuts against Prop and Prop has to know that going in.',
    reading: {
      asks: 'Whether states facing severe fertility decline (South Korea at roughly 0.7, Japan, Singapore, China) should pay direct cash incentives for births.',
      burden: 'Prop is arguing against a fairly consistent evidence base showing cash transfers move fertility timing more than completed family size. Prop needs a mechanism story that survives that.',
      ground: 'Prop should take a large sustained transfer tied to childcare and housing rather than a one-off baby bonus, because one-off bonuses are what the failed comparators used.',
    },
    prop: {
      line: 'The demographic arithmetic is already locked in for thirty years, and every year without intervention makes the correction steeper.',
      args: [
        {
          title: 'The dependency ratio is a fiscal cliff',
          claim: 'Pension and healthcare systems are transfers from workers to retirees.',
          warrant: 'South Korea\'s working-age population is projected to fall by roughly half by 2070. The tax base contracts while obligations grow, and the gap does not close by growth alone.',
          impact: 'Either benefits collapse or taxes on a shrinking cohort rise sharply. Both outcomes are large, near-certain, and already visible in the projections.',
        },
        {
          title: 'Cost is the stated barrier',
          claim: 'Surveys consistently name housing and education costs as the reason for not having children.',
          warrant: 'In Seoul and Tokyo, private-education spending and housing deposits are the dominant line items in family budgeting. These are cash problems, and cash addresses them.',
          impact: 'You are not trying to change preferences, only to remove a constraint people themselves identify. That is a far lower bar than cultural engineering.',
        },
        {
          title: 'The alternative is immigration these states will not accept',
          claim: 'The only other lever that closes the gap is large-scale migration.',
          warrant: 'Japan and Korea have run restrictive policies for decades under stable public opinion. Prop is comparing against what these governments will actually do, not against an idealised policy set.',
          impact: 'Within the realistic option set, pronatalist transfer is the remaining instrument. Opp must either accept the demographic outcome or defend a migration policy the actor will not adopt.',
        },
      ],
    },
    opp: {
      line: 'Every country that has tried this has bought a timing shift at enormous cost, and the money would work harder somewhere else.',
      args: [
        {
          title: 'The evidence says timing, not total',
          claim: 'Cash incentives move when people have children more than whether they do.',
          warrant: 'South Korea has spent well over $200bn on pronatalist programs since 2006 and fertility fell throughout. Hungary\'s package produced a modest bump that has since flattened.',
          impact: 'Prop is proposing the most expensive intervention in the fiscal toolkit with the weakest evidence of durable effect. That comparison holds across every tried comparator.',
        },
        {
          title: 'The binding constraint is time and career, not cash',
          claim: 'Fertility decline tracks female labour-force participation and workplace structure, not just cost.',
          warrant: 'Korea and Japan combine long working hours with an expectation that childcare falls on mothers. A transfer does not change the career penalty, which is what surveys show women weighing.',
          impact: 'Prop\'s money leaves the actual mechanism untouched. Working-hours regulation and parental-leave enforcement address it directly and cost less.',
        },
        {
          title: 'Opportunity cost inside the same problem',
          claim: 'The same budget could fund adaptation to a smaller population.',
          warrant: 'Automation, later retirement, and productivity investment all raise output per worker, which is the variable that actually determines whether the pension system holds.',
          impact: 'Adaptation works regardless of whether fertility recovers. Prop\'s plan only works if it succeeds, and the record says it will not.',
        },
      ],
    },
    clash: {
      question: 'Is low fertility a cost problem that cash can solve, or a structural problem cash cannot reach?',
      prop: 'Prop wins by showing the failed comparators used small one-off bonuses, so they do not test a transfer large enough to change the housing and childcare calculation.',
      opp: 'Opp wins on the Korean spending record: a very large sum, over a long period, with fertility falling throughout.',
    },
    mistakes: {
      prop: [
        'Ignoring Korea\'s spending record. Opp opens with it. Pre-empt it and distinguish the design.',
        'Framing this as a duty to reproduce. It reads badly and it is not your argument.',
      ],
      opp: [
        'Saying population decline is fine. In these specific economies the pension arithmetic is genuinely severe.',
        'Proposing immigration as the answer without engaging why these states refuse it.',
      ],
    },
    related: ['regrets-the-spread-of-cram-school-culture', 'cap-wedding-spending-in-india', 'india-scrap-caste-based-affirmative-action', 'mandate-parental-leave-of-at-least-6-months'],
    keywords: ['pay couples to have children debate', 'pronatalist policy debate motion', 'east asia fertility debate', 'asian parliamentary demographics motion'],
  },

  // ── WORLD SCHOOLS ───────────────────────────────────────────────

  'ban-homework-for-k-12-students': {
    slug: 'ban-homework-for-k-12-students',
    motion: 'This House would ban homework for K-12 students.',
    format: 'worlds',
    formats: 'WSDC / Asian Parliamentary / Quick Clash adaptable',
    domain: 'edu',
    difficulty: 'Intro',
    summary: 'A good first motion. Accessible on both sides, and it rewards teams that split primary from secondary school.',
    reading: {
      asks: 'Whether schools should be prohibited from assigning work to be completed outside school hours, across the whole K-12 range.',
      burden: 'The K-12 range is the pressure point. The evidence for homework is weak in primary and moderate in upper secondary, so an undifferentiated case on either side is vulnerable.',
      ground: 'Prop should concede exam-preparation work in the final two years and defend the ban everywhere else. Opp should force Prop to defend the ban for 17 year olds sitting national exams.',
    },
    prop: {
      line: 'Homework transfers schooling into the home, where resources are unequal, and the measured learning return is close to zero for most of the range.',
      args: [
        {
          title: 'It converts school into a wealth test',
          claim: 'Completion depends on quiet space, a device, and an adult who can help.',
          warrant: 'A student sharing a room, working an evening job, or with parents who did not study the subject faces a different task than a classmate with a desk and a tutor. Same assignment, different exercise.',
          impact: 'Attainment gaps widen through a mechanism the school controls and could simply stop using. This runs every night of every school year.',
        },
        {
          title: 'The primary-school evidence is close to null',
          claim: 'Research finds little to no achievement benefit for younger students.',
          warrant: 'Cooper\'s meta-analyses, the reference point in the literature, find negligible correlation with achievement in elementary grades and a modest one only in upper secondary.',
          impact: 'For most of the K-12 range Prop is removing a cost with no measured benefit. Opp has to defend the practice where the evidence is weakest.',
        },
        {
          title: 'Time has alternative uses',
          claim: 'Sleep, unstructured play, family time, and physical activity have documented developmental value.',
          warrant: 'Adolescent sleep deprivation is well evidenced and tracks assignment load alongside early start times.',
          impact: 'The comparison is not homework against nothing. It is homework against activities with their own measurable returns to development.',
        },
      ],
    },
    opp: {
      line: 'Independent practice is where difficult material consolidates, and banning it hurts most the students with the least support elsewhere.',
      args: [
        {
          title: 'Spaced practice is how retention works',
          claim: 'Skills that require repetition need distributed practice over time.',
          warrant: 'Language vocabulary, mathematical fluency, and instrument practice all depend on spacing. Class time is finite and cannot supply the required repetitions.',
          impact: 'Prop\'s ban caps attainment in exactly the cumulative subjects where falling behind compounds year over year.',
        },
        {
          title: 'The equity argument reverses',
          claim: 'Wealthy families replace banned homework with tutoring within a week.',
          warrant: 'Where school-assigned work disappears, private supplementary education fills the space, and only some households can buy it. East Asian cram-school markets are the demonstration.',
          impact: 'You remove the standardised, free, teacher-set task and leave the paid, unequal one. The gap Prop wanted to close widens.',
        },
        {
          title: 'It teaches self-management',
          claim: 'Planning work against a deadline without supervision is itself the skill.',
          warrant: 'University and employment both assume independent working. A student who has never managed unsupervised work meets that requirement for the first time when the stakes are highest.',
          impact: 'The transition failure shows up as first-year university dropout, a documented and costly outcome.',
        },
      ],
    },
    clash: {
      question: 'Does removing homework close the resource gap or hand it to the private tutoring market?',
      prop: 'Prop wins by showing the tutoring substitution is partial and voluntary, while homework is universal and compulsory, so the mandatory unequal task is the bigger harm.',
      opp: 'Opp wins by proving substitution is near-total among the families Prop is worried about being outcompeted by, which flips the equity argument.',
    },
    mistakes: {
      prop: [
        'Defending the ban uniformly through to Grade 12. Concede exam years and you keep the strong part of the case.',
        'Arguing homework is stressful and stopping. Stress alone loses to attainment; use the evidence.',
      ],
      opp: [
        'Claiming homework obviously works. The primary-school literature is genuinely against you; distinguish by age.',
        'Missing the tutoring-substitution turn. It is your best argument and it beats Prop on their own ground.',
      ],
    },
    related: ['ban-smartphones-in-schools', 'replace-standardized-testing-with-portfolio-based-admissions', 'pay-students-to-attend-school', 'regrets-the-spread-of-cram-school-culture'],
    keywords: ['this house would ban homework', 'ban homework debate motion', 'should homework be banned arguments', 'wsdc homework motion'],
  },

  'support-open-borders': {
    slug: 'support-open-borders',
    motion: 'This House supports open borders.',
    format: 'worlds',
    formats: 'WSDC / BP / APDA adaptable',
    domain: 'global',
    difficulty: 'Hard',
    summary: 'The largest-magnitude motion in common circulation, and the one where Prop most often forgets to defend the actual policy.',
    reading: {
      asks: 'Whether states should permit free movement of people across borders, with residence and work rights, subject only to security screening.',
      burden: 'Prop owns the transition. The economic literature supports large long-run gains, and Opp will fight on the adjustment period and on political backlash, both of which are real.',
      ground: 'Prop should take open movement with a phased schedule and retained security vetting, and should concede that welfare eligibility can be time-limited. That answers the fiscal attack without conceding the principle.',
    },
    prop: {
      line: 'Where you are born determines most of your lifetime income, and borders are the mechanism enforcing that.',
      args: [
        {
          title: 'The place premium is the largest wage gap on earth',
          claim: 'The same worker earns several times more in a high-income country than at home.',
          warrant: 'Clemens\'s work puts the wage gain for equivalent workers moving from low- to high-income countries at a multiple, not a margin. Nothing about the worker changes; only the location does.',
          impact: 'Estimates of the global output gain from free movement run to a large fraction of world GDP. No other single policy has a comparable magnitude.',
        },
        {
          title: 'Birthplace is arbitrary',
          claim: 'No one earns their country of birth, yet it determines life outcomes more than any choice they make.',
          warrant: 'Every domestic theory of justice treats unchosen characteristics as illegitimate bases for distributing opportunity. Nationality is unchosen and it is the most consequential one.',
          impact: 'Opp needs a principled reason the moral circle stops at the border, and most available reasons apply equally to internal boundaries we already reject.',
        },
        {
          title: 'Receiving economies gain',
          claim: 'Migration expands the labour force at both ends of the skill distribution.',
          warrant: 'Migrants are disproportionately working age, which improves the dependency ratio in exactly the ageing economies with pension gaps. The Mariel boatlift literature finds minimal native wage displacement.',
          impact: 'The fiscal effect is positive in most studies over a working lifetime. Opp\'s strongest empirical claims are about short-run local effects, not aggregate ones.',
        },
      ],
    },
    opp: {
      line: 'The gains are real and they are conditional on the receiving institutions surviving the speed at which they arrive.',
      args: [
        {
          title: 'Absorption capacity is physical',
          claim: 'Housing, schools, and clinics adjust over years while movement happens in months.',
          warrant: 'Housing supply is the slowest-adjusting market in developed economies, constrained by planning systems that take a decade to reform. The shortfall lands on existing low-income residents first.',
          impact: 'The short-run cost concentrates on the poorest natives, which is both a real harm and the exact political mechanism that produces the backlash.',
        },
        {
          title: 'Backlash is a predictable consequence, not an accident',
          claim: 'Rapid demographic change reliably produces restrictionist politics.',
          warrant: 'Every European state with a sharp migration increase since 2015 has seen restrictionist parties gain, and several have since implemented harder controls than existed before.',
          impact: 'Prop\'s policy is self-reversing. You get the disruption, then a political correction that closes borders tighter than the baseline, so the long-run gain never arrives.',
        },
        {
          title: 'Sending countries lose their trained people',
          claim: 'Free movement pulls doctors, nurses, and engineers out of the countries that trained them.',
          warrant: 'Health-worker emigration from sub-Saharan Africa is already severe under restricted migration. Remove the restriction and the flow increases sharply.',
          impact: 'The people who cannot move, who are the poorest, lose the services the movers provided. Prop\'s equality argument does not hold for them.',
        },
      ],
    },
    clash: {
      question: 'Do the long-run gains survive the short-run absorption shock and the political reaction it produces?',
      prop: 'Prop wins by phasing the policy so absorption tracks capacity, which defuses both the housing mechanism and the backlash that follows from it.',
      opp: 'Opp wins by showing a phased open border is not open, and a genuinely open one triggers the reversal mechanism before the gains compound.',
    },
    mistakes: {
      prop: [
        'Defending the moral case only. Opp concedes it and wins on implementation.',
        'Ignoring brain drain. It is the argument that turns your own equality framing against you.',
      ],
      opp: [
        'Running cultural-cohesion arguments as the lead. They are contested and they cost you the judge.',
        'Denying the economic gains. They are well evidenced; argue about distribution and speed instead.',
      ],
    },
    related: ['grant-permanent-residents-the-right-to-vote-in-local-elections', 'issue-climate-visas-to-pacific-island-residents', 'create-a-world-government', 'legalise-regulated-markets-in-citizenship'],
    keywords: ['this house supports open borders', 'open borders debate motion', 'open borders arguments for and against', 'wsdc immigration motion'],
  },

  'ban-factory-farming': {
    slug: 'ban-factory-farming',
    motion: 'This House would ban factory farming.',
    format: 'worlds',
    formats: 'WSDC / BP / APDA adaptable',
    domain: 'env',
    difficulty: 'Medium',
    summary: 'A motion where Prop has three independent routes to the ballot and often tries to run all of them badly instead of one well.',
    reading: {
      asks: 'Whether intensive confinement animal agriculture should be prohibited. Prop should define by practice (confinement density, gestation crates, routine antibiotics) rather than by farm size.',
      burden: 'Prop must handle food prices. A ban raises the cost of protein, and the incidence falls on low-income households, so Prop needs an answer beyond "they can eat something else."',
      ground: 'Prop should take a phased ban with a transition subsidy for farmers, defined by welfare standards. Opp should force the price question early and keep it in the room.',
    },
    prop: {
      line: 'The system produces suffering at a scale nothing else matches, and it does it while manufacturing the next pandemic and a large share of agricultural emissions.',
      args: [
        {
          title: 'Scale of suffering',
          claim: 'Tens of billions of animals annually live in conditions that prevent nearly all natural behaviour.',
          warrant: 'Battery and gestation systems restrict movement below the animal\'s own body length for most of its life. This is not a byproduct; density is the economic model.',
          impact: 'If animal suffering counts at all, this is the largest single source of it, and the number is measured in billions of individuals per year.',
        },
        {
          title: 'Antibiotic resistance',
          claim: 'Routine prophylactic antibiotic use in livestock breeds resistant bacteria.',
          warrant: 'A majority of antibiotics by volume in several major producing countries go to animals, mostly not to treat identified illness. Resistant strains transfer to humans through food and water.',
          impact: 'The projected mortality from antimicrobial resistance is in the millions annually by mid-century. This is a human-health argument that does not require the judge to weigh animal welfare at all.',
        },
        {
          title: 'Pandemic risk',
          claim: 'Dense monoculture populations are ideal amplifiers for zoonotic transmission.',
          warrant: 'High-density poultry operations are where avian influenza strains recombine and spread. The 2020s outbreaks have already forced culls in the hundreds of millions.',
          impact: 'Low probability per year, catastrophic magnitude, and the mechanism is well understood. This is the argument that survives a judge who does not weigh animal interests.',
        },
      ],
    },
    opp: {
      line: 'A ban raises food prices for people who have no slack, and the production moves to countries with weaker rules.',
      args: [
        {
          title: 'Price incidence lands on the poor',
          claim: 'Intensive farming is why animal protein is affordable.',
          warrant: 'Extensive systems require far more land and labour per unit of output. Estimates of the cost increase for eggs, chicken, and pork under welfare standards run to substantial multiples.',
          impact: 'Food-price increases are regressive by construction. In lower-income countries they translate directly into protein and micronutrient deficiency in children.',
        },
        {
          title: 'Production relocates',
          claim: 'Demand does not disappear when domestic supply is banned.',
          warrant: 'Imports fill the gap from jurisdictions with lower welfare standards and weaker environmental enforcement, unless the ban includes an import prohibition that violates trade commitments.',
          impact: 'You export the suffering and the emissions while losing regulatory reach over both. Every harm Prop names continues somewhere you can no longer inspect.',
        },
        {
          title: 'Standards reach the same harms',
          claim: 'Antibiotic restriction, density limits, and enrichment requirements are enforceable without prohibition.',
          warrant: 'The EU banned prophylactic antibiotic use and battery cages while keeping intensive production. The specific harms Prop names have specific rules attached to them.',
          impact: 'Comparative failure. Prop pays the price shock and the relocation cost for harms that targeted regulation already addresses.',
        },
      ],
    },
    clash: {
      question: 'Are the harms intrinsic to intensive farming or attachable to specific practices that regulation can prohibit?',
      prop: 'Prop wins by showing density is the mechanism behind all three harms, so any system that keeps the density keeps the harm.',
      opp: 'Opp wins by pointing at the EU: the specific practices were banned, production continued, and the price shock Prop invites did not have to happen.',
    },
    mistakes: {
      prop: [
        'Running all three arguments shallow. Pick antibiotic resistance or pandemic risk and develop it fully; those do not need the judge to weigh animals.',
        'Ignoring price. It is Opp\'s strongest line and silence reads as not having an answer.',
      ],
      opp: [
        'Denying the conditions. They are documented and denial costs credibility.',
        'Skipping the EU comparator. It is the cleanest proof that targeted regulation works.',
      ],
    },
    related: ['ban-zoos', 'grant-legal-standing-to-ecosystems', 'criminalize-ecocide', 'is-veganism-better-for-the-environment'],
    keywords: ['this house would ban factory farming', 'factory farming debate motion', 'ban factory farming arguments', 'wsdc animal welfare motion'],
  },

  'ban-smartphones-in-schools': {
    slug: 'ban-smartphones-in-schools',
    motion: 'This House would ban smartphones in schools.',
    format: 'worlds',
    formats: 'WSDC / PF / Quick Clash adaptable',
    domain: 'edu',
    difficulty: 'Intro',
    summary: 'An accessible motion with unusually good evidence on both sides, which makes it a fair test of who researched.',
    reading: {
      asks: 'Whether students should be prohibited from having phones during the school day. The strong version is locked storage on arrival, not just a no-phones-in-class rule.',
      burden: 'Prop should take full-day storage, because classroom-only bans are the status quo in most schools and Opp will say the motion changes nothing.',
      ground: 'Prop owns the safeguarding exception: emergency contact through the school office is how it already works. Concede it early and the emergency argument loses its force.',
    },
    prop: {
      line: 'The device is engineered to capture attention and it is sitting in the pocket of every student during the one activity that requires sustained attention.',
      args: [
        {
          title: 'Attention residue is measurable',
          claim: 'Presence of the phone degrades performance even unused.',
          warrant: 'Studies on cognitive capacity find reduced working-memory performance when a phone is merely visible. Notification-driven task switching carries a recovery cost per interruption.',
          impact: 'The effect applies to every lesson for every student, so a small per-instance cost aggregates to a large total across a school career.',
        },
        {
          title: 'Bans show attainment gains, concentrated at the bottom',
          claim: 'Schools that introduced full bans recorded improved exam results.',
          warrant: 'The Beland and Murphy study of English schools found improvement after phone bans, with the largest gains among previously low-attaining students.',
          impact: 'Prop gets an attainment gain and an equity gain from the same intervention, and the equity direction is the opposite of most education reforms.',
        },
        {
          title: 'Bullying follows the device',
          claim: 'Phones move harassment into a space staff cannot see.',
          warrant: 'Filming incidents, group messaging, and image sharing all happen during the school day and are unavailable to teacher supervision in a way corridor behaviour is not.',
          impact: 'Removing the device during school hours restores the one environment where an adult can actually intervene.',
        },
      ],
    },
    opp: {
      line: 'The device is not the problem and confiscating it teaches nothing about the skill students will need for the rest of their lives.',
      args: [
        {
          title: 'Regulated use is the transferable skill',
          claim: 'Students will have phones at university and at work with no one to confiscate them.',
          warrant: 'A ban produces compliance under supervision, not self-regulation. The behaviour reverts the moment the enforcement structure is removed.',
          impact: 'You defer the problem to the point of highest stakes and lowest support. Schools are the right place to fail at self-regulation safely.',
        },
        {
          title: 'Real educational uses exist',
          claim: 'Phones function as translation tools, accessibility devices, cameras, and research tools.',
          warrant: 'For students learning the language of instruction, and for those with reading or organisational support needs, the phone is often the assistive device the school did not buy.',
          impact: 'The ban hits hardest the students who use the device as a support, which reverses Prop\'s equity claim.',
        },
        {
          title: 'The enforcement cost is real',
          claim: 'Full-day storage means confiscation conflicts, lost devices, and liability.',
          warrant: 'Schools operating locked-pouch systems report significant staff time on compliance and disputes over damaged or missing phones.',
          impact: 'Teacher time is the scarcest resource in a school. Prop spends it on a policing function to buy an effect that classroom-level rules already largely achieve.',
        },
      ],
    },
    clash: {
      question: 'Does a school teach self-regulation better by removing the temptation or by supervising exposure to it?',
      prop: 'Prop wins on the attainment evidence plus the concentration of gains among low-attaining students, which is a hard result for Opp to argue around.',
      opp: 'Opp wins by showing the ban produces supervised compliance with no transfer, and by making the assistive-use group concrete rather than hypothetical.',
    },
    mistakes: {
      prop: [
        'Running screen-time harm generally. The motion is about school hours; stay on the attention and attainment mechanism.',
        'Fumbling the emergency-contact question. Answer it in the first speech with the office-phone route.',
      ],
      opp: [
        'Defending phones in class. Nobody believes it. Argue about storage, autonomy, and transfer instead.',
        'Ignoring the Beland and Murphy result. Prop will cite it and unaddressed evidence carries.',
      ],
    },
    related: ['ban-homework-for-k-12-students', 'require-id-verification-to-use-social-media', 'social-media-does-more-harm-than-good-for-teenagers', 'ban-advertising-to-children-under-16'],
    keywords: ['this house would ban smartphones in schools', 'phone ban in schools debate', 'should phones be banned in schools arguments', 'wsdc smartphone motion'],
  },

  // ── LINCOLN-DOUGLAS ─────────────────────────────────────────────

  'a-just-society-ought-not-use-the-death-penalty': {
    slug: 'a-just-society-ought-not-use-the-death-penalty',
    motion: 'Resolved: A just society ought not use the death penalty.',
    format: 'ld',
    formats: 'Lincoln-Douglas',
    domain: 'ethics',
    difficulty: 'Medium',
    summary: 'A values resolution. The value and criterion do more work than any contention, and most rounds are decided there.',
    reading: {
      asks: 'Whether capital punishment is compatible with justice. The word "just" is the operative term: this is a normative resolution, not a policy one, so pure empirics without a framework will not carry.',
      burden: 'Aff must show the practice is incompatible with justice itself, not merely badly administered. Neg can win by showing retribution is a legitimate aim of a just system, even if this system executes it imperfectly.',
      ground: 'Aff typically runs Justice with a criterion of protecting rights or minimising irreversible state error. Neg typically runs Justice with a criterion of retributive desert or societal safety. Whoever wins the criterion usually wins the round.',
    },
    prop: {
      line: 'A punishment that cannot be corrected requires a certainty the state has repeatedly failed to deliver.',
      args: [
        {
          title: 'Irreversibility plus fallibility',
          claim: 'Justice systems make errors, and this is the one punishment that cannot be undone.',
          warrant: 'Over 190 people sentenced to death in the US have been exonerated. That is the detected error rate, so the true rate is higher by construction.',
          impact: 'A just society cannot adopt a practice whose error mode is the execution of an innocent person, because no compensation exists after the fact.',
        },
        {
          title: 'Arbitrary application',
          claim: 'Who receives death tracks race, geography, and defence funding rather than culpability.',
          warrant: 'Sentencing outcomes vary sharply by victim race and by county. The same offence produces different sentences depending on the prosecutor\'s office.',
          impact: 'Justice requires like cases treated alike. If the distribution is arbitrary, the practice fails the definition of justice regardless of whether any individual sentence is deserved.',
        },
        {
          title: 'The state as killer',
          claim: 'A society that prohibits killing while performing it undermines the norm it is enforcing.',
          warrant: 'The prohibition on taking life derives its force from being unconditional. An exception held by the state, applied to a captive person who poses no present threat, is not self-defence.',
          impact: 'The expressive harm is to the norm itself, which is the thing the criminal law depends on across every other offence.',
        },
      ],
    },
    opp: {
      line: 'Justice includes giving people what they are owed, and for the worst offences that includes a proportionate response.',
      args: [
        {
          title: 'Retributive desert',
          claim: 'Proportionality is a requirement of justice, not a concession to vengeance.',
          warrant: 'Kant\'s treatment holds that punishment respects the offender as a rational agent who chose the act. A response that fails to match the gravity treats the victim as worth less than the offence took.',
          impact: 'On a retributive criterion, abolishing the maximum penalty for the maximum offence is itself an injustice, which meets Aff on the value rather than dodging it.',
        },
        {
          title: 'Administration is separable from the practice',
          claim: 'Aff\'s evidence indicts the current system, not the punishment.',
          warrant: 'Wrongful convictions and racial disparity are arguments for better procedure: mandatory review, evidentiary standards, funded defence. A just society is the one that fixes those, not one that concludes the penalty is impermissible.',
          impact: 'The resolution asks about a just society. In that society the administration problems Aff cites are stipulated away, and Aff\'s case largely goes with them.',
        },
        {
          title: 'Some acts sever the social contract',
          claim: 'Certain offences represent a total rejection of the terms of membership.',
          warrant: 'Locke and Hobbes both locate a point at which the offender has placed themselves outside the protection the contract provides. The society is not obliged to guarantee continued life to someone who has refused the condition on which it rests.',
          impact: 'This grounds the penalty in the same contractarian logic Aff uses for rights, which prevents Aff from claiming the entire rights framework.',
        },
      ],
    },
    clash: {
      question: 'Is the death penalty unjust in principle, or just in principle and unjust in practice?',
      prop: 'Aff wins by showing irreversibility is not an administrative feature but a property of the punishment, so no procedural fix reaches it.',
      opp: 'Neg wins by holding the resolution to its own terms: a just society has the procedures, so the empirical failures Aff cites are outside the world the resolution describes.',
    },
    mistakes: {
      prop: [
        'Running deterrence statistics as the lead. It is a policy argument in a values round and Neg will say so.',
        'Never defining justice. If you leave the value uncontested, Neg\'s retributive criterion decides the round.',
      ],
      opp: [
        'Defending the current system. The resolution says "a just society," so stipulate the fixed procedures and argue from there.',
        'Running only cost or deterrence. Both are policy frames and neither answers the value question Aff is asking.',
      ],
    },
    related: ['civil-disobedience-in-a-democracy-is-morally-justified', 'abolish-prisons', 'the-ends-justify-the-means', 'abolish-the-death-penalty-worldwide'],
    keywords: ['a just society ought not use the death penalty', 'ld death penalty resolution', 'lincoln douglas death penalty case', 'death penalty value criterion'],
  },

  'civil-disobedience-in-a-democracy-is-morally-justified': {
    slug: 'civil-disobedience-in-a-democracy-is-morally-justified',
    motion: 'Resolved: Civil disobedience in a democracy is morally justified.',
    format: 'ld',
    formats: 'Lincoln-Douglas',
    domain: 'ethics',
    difficulty: 'Medium',
    summary: 'The words "in a democracy" carry the whole resolution. Neg wins by making Aff explain why legal channels are insufficient.',
    reading: {
      asks: 'Whether deliberately breaking the law as political protest can be morally justified in a system that provides lawful means of change.',
      burden: 'Aff must clear the democracy hurdle. Disobedience is easy to justify under tyranny; the resolution deliberately removes that case.',
      ground: 'Aff should adopt the Rawlsian conditions (public, non-violent, conscientious, accepting the legal penalty) because they answer most Neg attacks in advance. Neg should attack those conditions as either too restrictive to matter or unenforceable in practice.',
    },
    prop: {
      line: 'Majority rule can produce persistent injustice for a minority, and the affected minority is the one group the lawful channels cannot help.',
      args: [
        {
          title: 'Democracy is not self-correcting for permanent minorities',
          claim: 'Voting cannot fix an injustice sustained by a stable majority.',
          warrant: 'A group that is 12% of the electorate cannot vote its way out of a rule the other 88% support. Segregation was democratically maintained for decades under fully lawful procedures.',
          impact: 'For exactly the population most in need of remedy, the legal channel is not slow, it is closed. Aff only needs this class of case to exist.',
        },
        {
          title: 'Accepting the penalty preserves the rule of law',
          claim: 'The disobedient who submits to arrest affirms the legal order while contesting one rule.',
          warrant: 'This is what separates civil disobedience from ordinary lawbreaking. The willingness to be punished is the costly signal that the objection is conscientious rather than self-serving.',
          impact: 'Neg\'s anarchy argument does not reach the Rawlsian version, because the practice as defined is a demand for the law\'s attention, not an escape from it.',
        },
        {
          title: 'It works where argument alone has not',
          claim: 'Disobedience forces salience onto an issue the majority prefers to ignore.',
          warrant: 'The Montgomery boycott, the Salt March, and the sit-ins each moved policy that decades of petitioning had not. The mechanism is imposing a cost on continued inattention.',
          impact: 'If the moral end is legitimate and no lawful means achieves it, the case for the means is as strong as the case for the end.',
        },
      ],
    },
    opp: {
      line: 'In a democracy the citizen has already agreed to a procedure for losing, and reserving a personal veto for the times you lose destroys it.',
      args: [
        {
          title: 'Consent to the procedure includes consent to lose',
          claim: 'Democratic legitimacy comes from the process, not from agreeing with each output.',
          warrant: 'A citizen who accepts the system\'s authority only when it agrees with them has not accepted its authority at all. That is the definition of the obligation the resolution is testing.',
          impact: 'Aff\'s justification generalises to every citizen with a sincere moral objection, including the ones Aff finds repugnant.',
        },
        {
          title: 'The standard is unenforceable',
          claim: 'Conscientiousness cannot be verified from outside.',
          warrant: 'Every group that has broken the law for political ends believed it was justified. Aff\'s conditions do not distinguish the civil-rights movement from an armed occupation whose participants are equally sincere.',
          impact: 'A moral permission that cannot be limited to the cases you intended is a permission for all of them, and the aggregate is worse than the injustice it addressed.',
        },
        {
          title: 'The channels are wider than Aff admits',
          claim: 'Democracies provide courts, press, protest, and organising, all lawful.',
          warrant: 'Constitutional litigation exists precisely to protect minorities from majority legislation, and it succeeded on segregation, marriage, and speech.',
          impact: 'Aff\'s necessity claim fails wherever the lawful route is merely slow rather than closed, and that covers nearly every real case in a functioning democracy.',
        },
      ],
    },
    clash: {
      question: 'Are the lawful channels genuinely closed to a permanent minority, or only slow?',
      prop: 'Aff wins by naming the class of injustice where litigation and voting both failed for a generation, and showing disobedience is what moved it.',
      opp: 'Neg wins by proving the courts are the designed answer to majority tyranny, so the necessity condition is almost never met in a real democracy.',
    },
    mistakes: {
      prop: [
        'Citing King without engaging the Letter from Birmingham Jail conditions. Neg will use them against a loose Aff case.',
        'Sliding toward justifying violence. The moment you lose non-violence you lose the framework.',
      ],
      opp: [
        'Arguing law-breaking is always wrong. It commits you to defending obedience to unjust law and Aff will find the example.',
        'Skipping the courts argument. It is your best answer to the permanent-minority case.',
      ],
    },
    related: ['a-just-society-ought-not-use-the-death-penalty', 'the-ends-justify-the-means', 'whistleblowers-should-receive-absolute-legal-immunity', 'supports-the-existence-of-separatist-movements'],
    keywords: ['civil disobedience is morally justified resolution', 'ld civil disobedience case', 'lincoln douglas civil disobedience', 'civil disobedience value criterion'],
  },

  // ── PUBLIC FORUM ────────────────────────────────────────────────

  'social-media-benefits-for-adolescents-outweigh-harms': {
    slug: 'social-media-benefits-for-adolescents-outweigh-harms',
    motion: 'Resolved: On balance, the benefits of social media for adolescents outweigh the harms.',
    format: 'pf',
    formats: 'Public Forum',
    domain: 'social',
    difficulty: 'Intro',
    summary: 'An on-balance resolution, so the weighing mechanism is the round. Both sides will have evidence; the winner explains why theirs matters more.',
    reading: {
      asks: 'Whether net effects of social media on adolescents are positive. "On balance" means neither side has to deny the other\'s evidence, only to out-weigh it.',
      burden: 'Neither side needs to prove an absolute. Pro needs the benefits to be larger or more probable; Con needs the harms to be. Say which weighing mechanism you are using in the first speech.',
      ground: 'The causation fight is the centre of this resolution. Con has correlational mental-health data; Pro has the confound argument. Whoever handles causation more carefully usually takes the ballot.',
    },
    prop: {
      line: 'For adolescents who are isolated where they live, the platform is the only place the community exists.',
      args: [
        {
          title: 'Connection for marginalised teens',
          claim: 'LGBTQ, disabled, and minority adolescents in unsupportive environments find peers online.',
          warrant: 'Survey work consistently finds these groups report online community as a primary support source, and for many it is the only one available in their physical location.',
          impact: 'The benefit concentrates on the highest-risk population, so the magnitude per affected person is large even if the average effect across all teens is small.',
        },
        {
          title: 'The causal evidence is weaker than the headlines',
          claim: 'The link between social-media use and adolescent mental health is correlational and small.',
          warrant: 'Orben and Przybylski\'s specification-curve analysis found the association comparable in size to effects like wearing glasses. Reverse causation, that struggling teens use more, is unresolved.',
          impact: 'Con\'s primary harm rests on a contested inference. If the effect size is genuinely that small, it cannot outweigh benefits that are directly reported by users.',
        },
        {
          title: 'Access to information and mobilisation',
          claim: 'Teens use platforms for health information, academic help, and political organising.',
          warrant: 'For adolescents who cannot ask an adult about mental health, sexuality, or abuse, search and peer communities are the accessible route.',
          impact: 'This reaches exactly the questions that are hardest to ask offline, and it operates at population scale continuously.',
        },
      ],
    },
    opp: {
      line: 'The product is optimised for engagement, and the mechanisms that produce engagement in adolescents are the same ones that produce harm.',
      args: [
        {
          title: 'The timing evidence is hard to explain away',
          claim: 'Adolescent depression, self-harm, and anxiety rose sharply from roughly 2012 across multiple countries.',
          warrant: 'The inflection tracks smartphone and platform adoption, appears in several national datasets, and is concentrated among girls, which matches the appearance-comparison mechanism.',
          impact: 'Even at a modest effect size, applied to essentially every adolescent in a developed country, the aggregate magnitude is enormous.',
        },
        {
          title: 'Sleep displacement is the clean causal link',
          claim: 'Night-time use directly reduces sleep duration.',
          warrant: 'This is not correlational: time spent on a device at midnight is time not spent asleep, and adolescent sleep need is well established.',
          impact: 'Sleep deprivation independently causes mood, attention, and metabolic harm. Pro\'s confound argument does not touch this mechanism at all.',
        },
        {
          title: 'Design targets developmental vulnerability',
          claim: 'Variable-reward feeds and social-metric displays exploit exactly the period of peak peer sensitivity.',
          warrant: 'Adolescence is when social comparison has maximum effect on self-concept. Quantifying peer approval and delivering it unpredictably is the specific design choice.',
          impact: 'The harm is not incidental to the product, it is the engagement mechanism, which means it does not get better without regulation.',
        },
      ],
    },
    clash: {
      question: 'Does the mental-health correlation reflect causation, and does it outweigh benefits that are concentrated on the most vulnerable users?',
      prop: 'Pro wins by narrowing the causal claim and showing the benefit lands on the population with the highest baseline risk, which is where marginal help matters most.',
      opp: 'Con wins on sleep displacement, because it is the one mechanism with a clean causal path that survives every confound argument Pro has.',
    },
    mistakes: {
      prop: [
        'Denying the mental-health trend. It is real; contest the causation instead.',
        'Listing benefits without weighing. On balance means you must compare, not enumerate.',
      ],
      opp: [
        'Reading Haidt as settled science. Pro will bring Orben. Have the methodological response ready.',
        'Ignoring the marginalised-teen benefit. It is Pro\'s strongest ground and it needs a direct answer.',
      ],
    },
    related: ['ban-smartphones-in-schools', 'require-id-verification-to-use-social-media', 'ban-advertising-to-children-under-16', 'ban-political-advertising-on-social-media'],
    keywords: ['social media benefits for adolescents outweigh the harms', 'pf social media resolution', 'public forum social media case', 'social media teens debate evidence'],
  },

  'us-should-adopt-single-payer-universal-healthcare': {
    slug: 'us-should-adopt-single-payer-universal-healthcare',
    motion: 'Resolved: The United States should adopt a single-payer universal healthcare system.',
    format: 'pf',
    formats: 'Public Forum / Policy adaptable',
    domain: 'econ',
    difficulty: 'Medium',
    summary: 'A policy resolution in a PF frame. The transition, not the steady state, is where rounds are won.',
    reading: {
      asks: 'Whether the US should replace its mixed insurance system with a single public payer. Note that single-payer is narrower than universal coverage: Germany and the Netherlands are universal and multi-payer.',
      burden: 'Pro must defend single-payer specifically. Con\'s best move is to concede universal coverage as a goal and attack the single-payer mechanism, which splits Pro from their strongest moral ground.',
      ground: 'Pro should take a phased Medicare expansion with a defined funding source. Con should take a universal multi-payer alternative, which wins the coverage argument without defending the status quo.',
    },
    prop: {
      line: 'The US pays roughly twice the OECD average per person and gets worse outcomes, and the gap is administrative.',
      args: [
        {
          title: 'Administrative cost is the difference',
          claim: 'Multi-payer billing consumes a large share of US health spending.',
          warrant: 'US administrative costs run several times those of single-payer systems, driven by claims processing, prior authorisation, and provider-side billing staff negotiating with dozens of insurers.',
          impact: 'This is spending that buys no care. It is the clearest available example of a cost that a structural change removes rather than reallocates.',
        },
        {
          title: 'Coverage gaps cause deaths and bankruptcies',
          claim: 'Tens of millions are uninsured or underinsured.',
          warrant: 'Medical debt is a leading contributor to personal bankruptcy, and delayed presentation among uninsured patients produces worse outcomes at higher eventual cost.',
          impact: 'The harm is measurable in mortality and in financial ruin, and it falls on people who did nothing except get sick without coverage.',
        },
        {
          title: 'Monopsony pricing',
          claim: 'A single buyer can negotiate drug and procedure prices the way every other developed country does.',
          warrant: 'US drug prices run multiples of those in comparable countries for identical products, because no US payer has the volume to force the price down.',
          impact: 'The savings are large, immediate on implementation, and unavailable under any fragmented alternative.',
        },
      ],
    },
    opp: {
      line: 'You can get universal coverage without single-payer, and the transition costs of single-payer are where the plan actually fails.',
      args: [
        {
          title: 'The transition is the vulnerability',
          claim: 'Moving 180 million people off employer coverage in one legislative act has no precedent.',
          warrant: 'It requires new tax architecture, a federal claims system at unprecedented scale, and the elimination of an industry employing hundreds of thousands. Every previous US health reform of a fraction of this size had severe implementation problems.',
          impact: 'Failure during transition means coverage disruption for people mid-treatment. That risk is concentrated in time and falls on patients.',
        },
        {
          title: 'Universal does not require single-payer',
          claim: 'Germany, Switzerland, and the Netherlands achieve universal coverage with regulated multi-payer systems.',
          warrant: 'These systems use mandates, community rating, and subsidies. They achieve Pro\'s coverage goal while preserving a path from the existing US structure.',
          impact: 'Con concedes the moral case entirely and still wins the mechanism, which leaves Pro defending disruption for a benefit reachable another way.',
        },
        {
          title: 'Provider payment rates',
          claim: 'Single-payer savings depend on paying providers Medicare rates.',
          warrant: 'Many hospitals operate below cost on Medicare and cross-subsidise from private insurance. Extending those rates system-wide without a payment increase threatens rural hospital solvency.',
          impact: 'Either the savings shrink to fund higher rates, or facilities close in exactly the underserved areas Pro is trying to help.',
        },
      ],
    },
    clash: {
      question: 'Is single-payer necessary for universal coverage, or is it one route among several with the highest transition risk?',
      prop: 'Pro wins by showing the administrative and monopsony savings are only available with a single payer, so the multi-payer alternative keeps the cost problem.',
      opp: 'Con wins by conceding universality and pinning Pro to the transition, since a disruption harm concentrated on current patients is easy to weigh.',
    },
    mistakes: {
      prop: [
        'Ignoring provider payment rates. It is the most technical Con attack and it is well evidenced.',
        'Citing other countries loosely. Several comparators are multi-payer and Con will point that out.',
      ],
      opp: [
        'Defending the status quo. You lose the coverage argument and the sympathy. Take the multi-payer alternative.',
        'Running only cost. Pro has the international price comparison and it is strong.',
      ],
    },
    related: ['universal-basic-income', 'abolish-intellectual-property-for-medicines', 'mandate-organ-donation-upon-death', 'ban-billionaires'],
    keywords: ['single payer universal healthcare resolution', 'pf healthcare case', 'medicare for all debate arguments', 'public forum healthcare resolution'],
  },

  // ── POLICY ──────────────────────────────────────────────────────

  'usfg-increase-regulation-of-large-language-models': {
    slug: 'usfg-increase-regulation-of-large-language-models',
    motion: 'Resolved: The United States federal government should substantially increase the regulation of large-language-model artificial intelligence systems.',
    format: 'policy',
    formats: 'Policy / Congress adaptable',
    domain: 'tech',
    difficulty: 'Hard',
    summary: 'A broad policy stem. The resolution is the topic area, not the plan, so the affirmative is whatever plan text you can defend as topical.',
    reading: {
      asks: 'Nothing on its own. This is a topic stem: the aff writes a plan inside it. "Substantially increase" and "regulation" are the words the negative will run topicality on.',
      burden: 'Aff needs a plan text, a solvency advocate, and inherency. Neg gets topicality, disads, counterplans, and kritiks. Neither side is arguing the resolution in the abstract.',
      ground: 'Standard aff areas: pre-deployment evaluation mandates, compute-threshold licensing, training-data disclosure, liability for model outputs, and biosecurity screening on model capability. Each has a distinct disad profile, so pick one and build the block around its specific link turns.',
    },
    prop: {
      line: 'The capability curve is outrunning the evaluation regime, and only a federal mandate creates a pre-deployment check.',
      args: [
        {
          title: 'Inherency: voluntary commitments are not binding',
          claim: 'Current safety practice rests on lab self-governance.',
          warrant: 'The White House voluntary commitments and lab safety frameworks carry no enforcement, no defined threshold, and no penalty. A lab may revise its own policy at will, and several have.',
          impact: 'The status quo has no mechanism that survives commercial pressure, which is the condition the plan is designed for.',
        },
        {
          title: 'Bioweapon uplift advantage',
          claim: 'Frontier models measurably assist non-expert users with pathogen-related tasks.',
          warrant: 'Red-team evaluations have found uplift on protocol synthesis relative to internet-only baselines. Screening obligations on both the model and the DNA-synthesis supply chain close the path.',
          impact: 'Low probability, extinction-adjacent magnitude, and the plan is one of few interventions that acts before rather than after. This is the standard high-magnitude aff on this topic.',
        },
        {
          title: 'Modeling advantage',
          claim: 'US federal rules become the global default.',
          warrant: 'The Brussels effect is the precedent: firms build to the strictest large market and export that standard. The US hosts the frontier labs, so a US rule binds where the EU rule does not reach.',
          impact: 'The plan\'s effect extends beyond US jurisdiction, which is how aff answers the "other countries will not comply" argument on the flow.',
        },
      ],
    },
    opp: {
      line: 'The plan trades off with the innovation and the state capacity it needs to work, and there is a counterplan that captures the offense without the link.',
      args: [
        {
          title: 'Innovation / China DA',
          claim: 'Compliance burden slows US development relative to Chinese labs.',
          warrant: 'Fixed regulatory cost falls hardest on smaller labs and open-weight developers. Uniqueness is contested and the aff will have link turns, so the block needs an internal-link story about which specific capability slips.',
          impact: 'Military and economic leverage transfer to a competitor. Standard impact scenarios run through Taiwan or through standard-setting bodies.',
        },
        {
          title: 'States counterplan',
          claim: 'Fifty states should adopt the regulation through an interstate compact.',
          warrant: 'California and Colorado have already legislated in this space and the industry concentration in California gives a single state substantial reach.',
          impact: 'Captures aff solvency, avoids the federalism and federal-capacity net benefits, and puts the aff on the wrong side of a "why federal" burden they often have not pre-empted.',
        },
        {
          title: 'Cap K / techno-solutionism',
          claim: 'Regulating the outputs of AI leaves intact the accumulation logic that produced the harm.',
          warrant: 'Compliance regimes are written by, and become moats for, the largest firms. The aff\'s reform stabilises the industry it is criticising.',
          impact: 'The alt is refusal or a structural critique; the aff\'s residual harms recur under a friendlier label. Framework debate decides whether this outweighs the case.',
        },
      ],
    },
    clash: {
      question: 'Does federal regulation solve the capability risk, or does the states counterplan capture it while the DA turns the case?',
      prop: 'Aff wins by proving a federal-only internal link: interstate compacts cannot bind labs that relocate, and export-relevant standards require federal authority.',
      opp: 'Neg wins by consolidating the counterplan and the DA: states solve, federal action adds only the compliance cost that produces the competitiveness slip.',
    },
    mistakes: {
      prop: [
        'Running the resolution as the plan. You need a plan text; "regulate AI" is not one and topicality will be the whole 1NC.',
        'Reading bioweapon uplift without impact calculus. Magnitude claims need probability and timeframe work or they lose to a smaller but cleaner DA.',
      ],
      opp: [
        'Going for topicality and the case in the 2NR. Pick one and develop it.',
        'Reading a generic innovation DA with no specific internal link. The aff link turn writes itself if you cannot name the capability.',
      ],
    },
    related: ['ai-development-should-be-paused', 'nationalise-frontier-ai-labs', 'require-ai-developers-to-license-training-data', 'require-ai-generated-content-to-be-watermarked'],
    keywords: ['usfg regulate large language models resolution', 'policy debate ai topic', 'ai regulation policy debate case', 'llm regulation aff neg'],
  },

};

// ── accessors ───────────────────────────────────────────────────────

export function getLibraryMotion(slug) {
  if (!slug) return null;
  return MOTION_LIBRARY[String(slug).toLowerCase()] || null;
}

export function listLibraryMotions() {
  return Object.values(MOTION_LIBRARY);
}

export function listLibrarySlugs() {
  return Object.keys(MOTION_LIBRARY);
}

// Format keys in display order, with the label the hub groups under.
// Order matters: it is the order the hub renders sections in.
export const FORMAT_LABELS = [
  ['apda', 'Parliamentary / APDA'],
  ['bp', 'British Parliamentary'],
  ['asian', 'Asian Parliamentary'],
  ['worlds', 'World Schools'],
  ['ld', 'Lincoln-Douglas'],
  ['pf', 'Public Forum'],
  ['policy', 'Policy'],
];

export function motionsByFormat(key) {
  return listLibraryMotions().filter(m => m.format === key);
}
