// Per-fundamental content for /learn/fundamentals/{slug} pages.
//
// Each entry is a deep-dive on one of the six debate fundamentals
// summarized on /learn. The summary cards on /learn link here; these
// pages stand on their own as SEO ranking targets for the specific
// concept queries (e.g. "what is weighing in debate", "how to rebut
// an argument").
//
// Same schema as guide-bank.mjs so the renderer can mirror that
// pattern exactly.
//
// Voice rules (per soul.md §5):
//   - No em-dashes. Periods, commas, semicolons only.
//   - No banned phrases.
//   - No-preface rule: say the thing, don't announce it.
//   - Varsity debater register. Real examples, concrete numbers.

export const FUNDAMENTALS_BANK = {

  'claim-warrant-impact': {
    slug: 'claim-warrant-impact',
    question: 'Claim, warrant, impact: the anatomy of a debate argument',
    hook: 'Every debate argument has three parts. The claim is the position. The warrant is the reason it is true. The impact is why it matters. Skip any of them and the argument fails.',
    readTime: '6 min',
    takeaways: [
      'Claim is what you assert. Warrant is the reasoning. Impact is the consequence that matters.',
      "A claim with no warrant is an opinion. A warrant with no impact is a fact nobody cares about.",
      'Test every argument by asking: what does the judge write on their flow for the claim? For the warrant? For the impact?',
      'Strong arguments link the warrant to the impact mechanistically. "A causes B because C" beats "A is bad."',
    ],
    sections: [
      {
        heading: 'The three parts in detail',
        body: [
          "The claim is your position. It is the assertion you are defending. \"Carbon pricing reduces emissions.\" \"The death penalty is morally impermissible.\" \"Mandatory vaccination violates bodily autonomy.\" Each is a claim. None of them are arguments yet.",
          "The warrant is the reasoning that makes the claim true. It is the bridge between observation and conclusion. \"Carbon pricing reduces emissions because firms minimize input costs; when carbon is priced, the firm's cheapest production path is the low-carbon one; British Columbia's 2008-2018 data shows a 15-percent decrease in per-capita emissions with no GDP impact.\" That is a warrant. It tells the listener why the claim should be believed.",
          'The impact is why the listener should care. It is the consequence of the claim being true. "Reducing emissions by 15 percent slows warming, which means fewer climate refugees, less coastal displacement, lower wildfire risk for the next generation." That is the impact. It makes the warrant matter.',
        ],
      },
      {
        heading: 'How each part fails',
        body: [
          'A claim with no warrant is an opinion. "Corporate political donations corrupt democracy" is an opinion until you explain the mechanism. Most novice debate arguments fail here. The debater states a position confidently, never explains why, and assumes the listener agrees.',
          'A warrant with no impact is a fact nobody cares about. "Carbon pricing reduces emissions by 15 percent" is true but the listener does not yet have a reason to vote for it. You need to connect that 15 percent to something that matters: lives, dollars, rights, dignity.',
          "An impact with no warrant is fearmongering. \"This policy will destroy democracy\" without a chain of reasoning is a scare tactic, not an argument. The opposing side will demand the warrant, you won't have one, and the judge writes off the impact.",
        ],
      },
      {
        heading: 'How judges test arguments',
        body: [
          "When judges flow a round, they write down each argument in three columns: claim, warrant, impact. If any column is empty, that line is weaker on the flow. When weighing at the end, they look for arguments where all three are populated and the chain is tight.",
          "This is why varsity debaters explicitly signal the three parts: \"My claim is X. The warrant is Y, because Z. The impact is A: B people, C dollars, D years.\" The judge writes each piece down. The argument lives on the flow.",
          'A test you can run on yourself: stop in the middle of any argument and ask, "Have I stated the claim? Have I given a warrant? Have I shown the impact?" If the answer is no to any, fill it in before moving on.',
        ],
      },
      {
        heading: 'The strongest claim-warrant-impact chains',
        body: [
          "Strong arguments link the warrant to the impact mechanistically. \"A causes B because C\" beats \"A is bad.\" Each step has a verb. Each step has a subject. Each step is testable.",
          'Weak: "Algorithmic feeds harm kids." Stronger: "Algorithmic feeds maximize engagement, which optimizes for content that triggers strong emotion; the strongest-engagement content is outrage and self-comparison; in 14-year-olds, sustained exposure to outrage and self-comparison correlates with measured anxiety and depression in the 2021 NIH youth-tech panel." Now you have warrant, you have data, you have impact.',
          "The weakest arguments are vague at the warrant step. \"It causes harm.\" What kind of harm? To whom? How? When the warrant gets fuzzy, the impact gets discounted by 50 percent. When the warrant is specific and named, the impact is full-weight.",
        ],
      },
      {
        heading: 'In practice across formats',
        body: [
          "In APDA, the impromptu nature means you have to build claim-warrant-impact chains from memory under 15-minute prep. The strongest APDA debaters carry mental libraries of warrant-types (incentives, signaling, path dependence, externalities) that they can apply across motions.",
          "In Policy, the warrant is usually a tagged evidence card. The 1AC reads tag (claim), cite (source), card body (warrant), tag-line summary (impact). Each card is one CWI chain.",
          "In LD, the impact connects up to the framework. Claim is the policy position; warrant is the analysis; impact is what the framework cares about. If your framework is Util, your impact is wellbeing. If your framework is Kantian, your impact is the violation of the categorical imperative.",
          "In PF and WSDC, the structure is similar but less formalized: a contention is a claim with one or more warrants and a stated impact. Judges flow it the same way.",
        ],
      },
    ],
    examples: [
      {
        context: 'A claim with no warrant (weak argument).',
        line: '"Corporate political donations corrupt democracy."',
        why: 'Opinion. The listener has no reason to believe it.',
      },
      {
        context: 'Same claim, with warrant and impact (strong argument).',
        line: '"Corporate political donations corrupt democracy because elected officials demonstrably vote with donor interests over voter interests (Page and Gilens 2014 showed near-zero correlation between bottom-90% policy preferences and actual outcomes), which means representative democracy stops representing the median citizen and 90 percent of the country has no real political voice."',
        why: 'Claim, warrant with named source, impact with magnitude. Judge flows all three. Argument lives.',
      },
    ],
    related: ['asian-parli-pm-opening', 'apda-opp-case', 'ld-value-criterion'],
    keywords: [
      'claim warrant impact debate',
      'what is a debate argument',
      'argument structure debate',
      'anatomy of debate argument',
      'debate argument components',
      'how to build a debate argument',
      'argument fundamentals debate',
    ],
    ctaLabel: 'Practice building arguments',
    ctaHref: '/debate-ai?format=apda&motion=This%20house%20would%20ban%20political%20donations%20from%20corporations.',
  },

  'weighing': {
    slug: 'weighing',
    question: 'Weighing in debate: magnitude, probability, timeframe, reversibility',
    hook: 'Judges decide debate rounds by weighing impacts. There are four axes. Plant your weighing in the constructive; do not save it for the rebuttal.',
    readTime: '6 min',
    takeaways: [
      'The four axes: magnitude (how big), probability (how likely), timeframe (how soon), reversibility (whether undo-able).',
      'A small certain harm outweighs a large speculative one. An irreversible harm outweighs a reversible one of equal size.',
      'Weighing belongs in the constructive, not the rebuttal. State the impact framework when you state the impact.',
      'You can weigh against your own arguments to pre-empt your opponent. "Even at half magnitude, we still outweigh."',
    ],
    sections: [
      {
        heading: 'The four axes',
        body: [
          'Magnitude: how big is the harm or benefit. Measured in lives, dollars, or rights affected. Five thousand jobs lost is bigger than five hundred. A nationwide policy is bigger than a state-level one. The harder you make magnitude concrete, the harder the opponent can argue around it.',
          "Probability: how likely is the impact to materialize. A certain small harm often outweighs a speculative large one. \"Net-zero by 2050\" has high probability of failing on schedule; the climate models showing harm have very high probability of being right at the temperature thresholds. When you stack probability with magnitude, you get expected value, which is what economists use to decide and what judges use to compare impacts.",
          "Timeframe: how soon does the impact land. Near-term harms outweigh long-term harms when both sides have winnable paths and equal magnitude. A harm that hits in two years is more decision-relevant than one that hits in fifty, because intervening policy can adjust the long-term one. Climate harms are an exception because the lock-in is near-term even though the worst effects are long-term.",
          'Reversibility: can the harm be undone. An irreversible harm outweighs a reversible one of equal size. Extinction outweighs recession. Lost rights outweigh lost dollars. Death outweighs injury. When you can show that the opposition path is reversible and yours is not, you win the weighing.',
        ],
      },
      {
        heading: 'How to weigh in speech',
        body: [
          'The single biggest gap between novice and varsity debaters is when they weigh. Novices argue in the constructive and weigh in the rebuttal. Varsity weighs in the constructive, then deepens the weighing in the rebuttal.',
          'Plant the weighing at the same moment you plant the impact. "Our impact is X. The reason X outweighs anything opp brings: magnitude (Y people affected); probability (high, because Z mechanism is already in motion); reversibility (irreversible once X happens). Anything opp argues fits inside that frame."',
          "By the time the judge writes the impact on their flow, they have already written the weighing axes next to it. When opp brings a competing impact, the judge automatically asks: how does this stack against the axes already on the flow.",
        ],
      },
      {
        heading: 'Weighing against your own arguments',
        body: [
          'The strongest move is to weigh against your own argument before opp does. If your impact is a 15 percent emissions reduction, and you know opp will argue your estimate is inflated, pre-empt: "Even if you cut our number in half, even if it is 7 percent instead of 15, magnitude still wins because the climate-impact curve is non-linear at the 1.5C threshold."',
          'This does two things. It signals to the judge that you have stress-tested your own argument. And it sets up a no-win: if opp tries to halve your number, you have already conceded that, so the argument is whether your halved number still outweighs. Often it does.',
        ],
      },
      {
        heading: 'Format-specific weighing',
        body: [
          "In Policy, weighing is explicit: \"prefer our impact on probability\" or \"prefer our impact on magnitude\" is standard language. Judges expect each rebuttal to weigh.",
          "In Parliamentary formats (APDA, BP, Asian Parli, WSDC), weighing is more conversational but no less important. The reply or whip speech is mostly weighing.",
          "In PF, weighing usually happens in the summary speech and final focus. Magnitude and probability are the two most-weighted axes; timeframe matters when the resolution is short-term policy; reversibility matters on extinction-impact arguments.",
          "In LD, weighing is filtered through the framework. Util frameworks weigh on net wellbeing across magnitude and probability. Deontological frameworks weigh on the categorical violation, not on aggregate outcome. Always weigh THROUGH your framework, not around it.",
        ],
      },
      {
        heading: 'Common weighing mistakes',
        body: [
          "Skipping weighing entirely. Most novice rounds end with both sides having impacts on the flow and no one telling the judge how to compare them. The judge picks the impact that felt more visceral, which is not a process you want to depend on.",
          'Weighing only at the end. By the rebuttal, the judge has already mentally weighed. Plant your weighing when you plant the impact.',
          'Vague weighing. "Our impact is bigger" is not weighing. "Our impact has higher magnitude because 50 million people are affected versus their 200 thousand" is weighing.',
          'Weighing on the wrong axis. If your impact is environmental and reversible, do not weigh on reversibility. Weigh on magnitude. Pick the axis where you actually win, not the axis your team always uses.',
        ],
      },
    ],
    examples: [
      {
        context: 'Weighing planted in the constructive (varsity).',
        line: '"Our impact: 50 million people gain healthcare access. The reason this outweighs opp\'s deficit concern: magnitude (50 million versus their abstract national debt figure), probability (Medicaid expansion empirically delivered this in 38 states), and reversibility (one bad year of debt is reversible; a death from untreated illness is not)."',
        why: 'Magnitude, probability, reversibility all stated at the same moment as the impact. Judge writes all four next to each other.',
      },
      {
        context: 'Weighing against your own argument (advanced).',
        line: '"Even if you cut our 50-million number in half, even if it is 25 million, magnitude still wins because the next-most-uninsured group is below the federal poverty line, which means the marginal benefit per person is highest there."',
        why: 'Pre-empts opp\'s attack. If opp halves the number, the argument still works. Judge sees the move and weights it.',
      },
    ],
    related: ['asian-parli-pm-opening', 'wsdc-reply-speech', 'asian-parli-whip'],
    keywords: [
      'weighing in debate',
      'debate impact weighing',
      'how to weigh impacts debate',
      'magnitude probability timeframe reversibility',
      'debate weighing axes',
      'debate impact calculus',
      'comparative impact debate',
    ],
    ctaLabel: 'Practice weighing in a round',
    ctaHref: '/debate-ai?format=bp&motion=This%20house%20would%20fund%20universal%20healthcare%20by%20raising%20marginal%20income%20tax.',
  },

  'rebuttal': {
    slug: 'rebuttal',
    question: 'Rebuttal in debate: link, warrant, impact, mitigation, turn',
    hook: 'Five ways to attack any argument, in order of strength. Master the hierarchy and you can dismantle opposition cases without breaking your own structure.',
    readTime: '6 min',
    takeaways: [
      'Five attack types from weakest to strongest: impact attack, mitigation, warrant attack, link attack, turn.',
      'The turn is the strongest move: prove their argument helps your side, and you have taken their contention off the flow.',
      "Don't try to attack every argument. Group them and attack the strongest two. The rest fall by association.",
      'Always rebut in the strength hierarchy. A clean turn beats five mitigations every round.',
    ],
    sections: [
      {
        heading: 'The five rebuttal types',
        body: [
          'Impact attack: even if their argument is fully true, the consequence is small or speculative. "Sure, the policy might raise consumer prices by 2 cents per gallon, but that is 0.05 percent of average household fuel spending. Trivial." Impact attacks are the weakest because they concede the argument and only contest the size.',
          "Mitigation: yes, but less. \"The harm is real but smaller than they claim. Their evidence is from a 2015 study that has been updated three times since; the current estimate is half their number.\" Mitigation is one step stronger than impact attack because you are contesting both magnitude and methodology.",
          'Warrant attack: their reasoning is wrong on its own terms. The chain from claim to impact has a broken link. "Their argument depends on consumers responding to a 2-cent price signal. The price-elasticity literature for gasoline is around -0.1; consumers barely respond. Their mechanism does not actually work."',
          'Link attack: their argument does not connect to the world. The premise is fine but it does not apply here. "Yes, carbon taxes reduce emissions in countries with stable energy grids. The motion is about a country with 40 percent of its grid running on lignite coal that cannot be replaced on the policy timeline. The link to their mechanism is broken."',
          'Turn: their argument actually helps your side. "They argued that the policy raises consumer prices. We agree. Higher prices reduce consumption, which reduces emissions, which is what our framework actually wants. Their first contention is a reason to vote government."',
        ],
      },
      {
        heading: 'Why turns are so strong',
        body: [
          "A turn does not just neutralize the opposing argument; it converts it into offense for your side. If opp ran three arguments and you turn one, you now have four arguments on the flow (your three constructives plus their turned one) while opp has only two.",
          "Turns are also the most efficient rebuttal type. A 30-second turn replaces a 90-second mitigation and a 60-second impact attack. You save speech time AND you out-bid opp on the flow.",
          'Not every argument can be turned. Look for arguments that have an unstated assumption you can flip. Opp claims that "raising taxes hurts the economy" rests on the assumption that government spending is less productive than private spending. Often it is the reverse for public goods. Turn it: "Yes, this raises taxes. That funds infrastructure, which has measured higher economic multipliers than equivalent private consumption. The economic argument is on our side, not theirs."',
        ],
      },
      {
        heading: 'How to pick what to attack',
        body: [
          "Do not try to attack every argument opp made. In an 8-minute LOC, you cannot meaningfully attack four contentions. Pick two: the strongest one (because if you knock it out, the case collapses) and the second-strongest (because two strong attacks leave opp with only marginal arguments).",
          'Group the rest. "Opp also argued implementation cost and democratic legitimacy. Both rest on the same flawed mechanism premise we just dismantled, so they fall with it." The judge writes "grouped, falls" and moves on. You saved 90 seconds.',
          'Pick attacks based on warrant quality, not impact size. A big impact with a paper-thin warrant is easier to attack than a small impact with a tight warrant. Attack the warrant and the impact is irrelevant.',
        ],
      },
      {
        heading: 'The rebuttal hierarchy in practice',
        body: [
          'When you scan an opposing argument, run through the hierarchy in order. Can I turn it? If yes, that is the move. If no, can I attack the link? If no, can I attack the warrant? If no, can I mitigate? If no, can I attack the impact?',
          "Always pick the strongest available attack. Do not run a mitigation when a warrant attack is available. Do not run an impact attack when a link attack is available. Judges read the hierarchy the same way you do.",
          "Once you pick the strongest attack, deliver it cleanly. \"Their first contention fails on the warrant. Their argument is that X causes Y. The warrant is the price-elasticity claim. The empirical literature shows elasticity is around -0.1, which means the mechanism they need is roughly ten times weaker than their argument assumes. Their first contention is non-functional.\"",
        ],
      },
      {
        heading: 'Common rebuttal mistakes',
        body: [
          'Linear point-by-point rebuttal. Going through opp\'s case line by line is a recipe for shallow attacks on everything and deep attacks on nothing. Group and prioritize instead.',
          'Reading opp\'s argument back to them before attacking. They know what they argued. You do not need to spend 20 seconds restating it. Quote the warrant or the impact, attack, move on.',
          'Forgetting to weigh the rebuttal. After you knock out an argument, tell the judge what it means. "If we win this rebuttal, opp loses their first contention, which was 60 percent of their impact framework. The case is now structurally insufficient."',
          'Defensive-only rebuttal. Attacking opp\'s case without extending your own is a tie at best. You need to land attacks AND extend your offense. The cleanest rebuttals do both in the same paragraph: "We agree their argument fails on the warrant. Our parallel argument, however, has empirical support: X."',
        ],
      },
    ],
    examples: [
      {
        context: 'A turn (strongest rebuttal type).',
        line: '"Opp argued that the policy raises consumer prices. We agree. Higher prices reduce consumption, which reduces emissions, which is what our framework actually wants. Their first contention is a reason to vote government."',
        why: 'Their argument now works for you. They lose their contention and you add a fourth argument to your flow.',
      },
      {
        context: 'Warrant attack (high-strength).',
        line: '"Their argument depends on consumers responding to a 2-cent price signal. The price-elasticity literature for gasoline is around -0.1; consumers barely respond. Their mechanism does not actually work."',
        why: 'Names the warrant, attacks it with named empirics, concludes the consequence. Judge writes "mechanism broken" on the flow.',
      },
    ],
    related: ['apda-opp-case', 'wsdc-reply-speech', 'asian-parli-whip'],
    keywords: [
      'how to rebut argument debate',
      'rebuttal techniques debate',
      'turn argument debate',
      'mitigation rebuttal',
      'warrant attack debate',
      'link attack debate',
      'debate rebuttal hierarchy',
      'how to attack debate arguments',
    ],
    ctaLabel: 'Practice rebuttals against an AI',
    ctaHref: '/debate-ai?format=apda&side=opp&motion=This%20house%20would%20impose%20a%20carbon%20tax%20on%20heavy%20industry.',
  },

  'signposting': {
    slug: 'signposting',
    question: 'Signposting in debate: telling the judge where you are',
    hook: 'Judges decide rounds from their flow. If they cannot track which argument you are on, they cannot write the ballot in your favor. Signpost like a wayfinding system.',
    readTime: '5 min',
    takeaways: [
      'Signposting is the act of telling the judge which argument you are addressing at any moment.',
      'Announce structure up front: "Three contentions. First, X. Second, Y. Third, Z." Then signpost each transition.',
      "If the judge can't write your structure on their flow in real time, you don't have structure.",
      'Internal signposts within arguments help too: "On the first argument, three problems with their warrant."',
    ],
    sections: [
      {
        heading: 'What signposting is',
        body: [
          "Signposting is the verbal cue that tells the judge where you are in your speech. \"Moving to the second contention.\" \"On the rebuttal to their first argument.\" \"Three responses to their cross-ex point.\" Each phrase is a signpost.",
          "Judges flow rounds on paper or a laptop in real time. They write down each argument under a column. When you give a speech, they need to find the right line on their flow before they can write your response. Signposting tells them where to put their pen.",
          "Without signposting, the judge guesses. Guessing means they sometimes write your response under the wrong argument, and at the end of the round, when they reconstruct the flow, your argument looks misplaced or unresponsive. You lose rounds you should have won.",
        ],
      },
      {
        heading: 'The structure-then-detail pattern',
        body: [
          'The strongest signposters open every speech with a roadmap. "I will address three of opp\'s contentions. First, their argument on economic harm. Second, their argument on civil liberties. Third, their argument on enforcement cost. Then I will extend our second and third contentions."',
          "The judge writes that roadmap at the top of their flow page. As you walk through it, they know what to expect and where each piece goes.",
          "Then for each item: \"Moving to their economic-harm contention. Three problems with the warrant.\" Now they are on the right line on the flow, and they know to expect three sub-items.",
        ],
      },
      {
        heading: 'Internal signposts',
        body: [
          'Signposting works at every level, not just the speech outline. Within a single argument, signpost the substructure. "Three problems with their warrant. First, the empirical evidence is out of date. Second, the mechanism does not apply to this case. Third, even if it did, our counter-mechanism dominates."',
          'Now the judge writes three sub-bullets under that argument and can flow each one separately. If you skip the signposting, they merge your three points into one fuzzy paragraph on the flow.',
          'Even tighter: signpost the warrant-impact transition. "The warrant is X. The impact is Y." The judge writes warrant on the left column and impact on the right.',
        ],
      },
      {
        heading: 'Why signposting wins close rounds',
        body: [
          "Two debaters can make the same arguments. The one who signposts wins. Reason: at the end of the round, the judge writes the ballot from the flow. If your flow is clean and theirs is messy, the judge resolves close calls in your favor because your arguments are easier to extract from the page.",
          "Adjudicators consistently rank signposting as one of the top three discriminators between varsity and novice debaters. The other two are weighing and warranting. Notice the pattern: all three are about making the judge's job easier.",
          'A practical test: at the end of any speech you give, ask the partner who flowed you to read back the structure. If they can recreate your speech outline from their notes, you signposted well. If their flow is unreadable or organized differently than what you said, you have a signposting problem.',
        ],
      },
      {
        heading: 'Format-specific signposting',
        body: [
          "In Policy, signposting is highly formalized. Speakers cross-apply by line number on the flow. \"On the disad, third subpoint, our response is X.\" Judges flow per-position.",
          "In Parliamentary formats, signposting is less procedural but no less important. Use plain English: \"Moving to their second argument.\" \"On the case side.\" \"Returning to the framework.\"",
          "In PF, summaries and final focuses live or die on signposting. The summary identifies 2-3 key issues; the final focus walks each one. Without clean signposting, both speeches blend together and the judge has nothing to extract.",
          "In LD, signposting separates framework debate from contention debate. \"On the framework: their criterion fails for three reasons.\" \"On the case: their first contention does not link to my criterion.\" The judge keeps framework and case on different sides of the flow.",
        ],
      },
    ],
    examples: [
      {
        context: 'Opening a constructive with a clean roadmap.',
        line: '"I will address three of opposition\'s contentions. First, their argument on economic harm. Second, their argument on civil liberties. Third, their enforcement cost claim. Then I will extend on our second and third contentions."',
        why: 'Judge writes 3+2 items on the flow at the top of the page. They know what is coming and where each piece goes.',
      },
      {
        context: 'Signposting within a single argument.',
        line: '"On their economic-harm contention. Three problems. First, the warrant is out of date. Second, the mechanism does not apply. Third, even if it did, our counter-mechanism dominates."',
        why: 'Judge writes three sub-bullets under the right argument. Each piece is independently flowable.',
      },
    ],
    related: ['asian-parli-pm-opening', 'wsdc-reply-speech', 'apda-opp-case'],
    keywords: [
      'signposting in debate',
      'how to signpost debate',
      'debate speech structure',
      'flowing in debate',
      'judge flow debate',
      'roadmap debate speech',
      'debate speech organization',
    ],
    ctaLabel: 'Practice signposting in a round',
    ctaHref: '/debate-ai?format=asian&motion=This%20house%20would%20mandate%20vaccination.',
  },

  'cross-examination': {
    slug: 'cross-examination',
    question: 'Cross-examination and POIs: the shared-time game',
    hook: 'Cross-ex, crossfire, and points of information are not about winning the exchange. They are about planting ammunition for your next speech.',
    readTime: '5 min',
    takeaways: [
      'The best cross-ex questions are not questions. They are concessions you want your opponent to make on the record.',
      "Never ask 'why' in cross-ex. Why hands them a free 45-second speech.",
      'Concession-first phrasing wins. "Would you agree that..." beats "What do you think about...".',
      'POIs are scored on both sides: how you ask and how you handle one.',
    ],
    sections: [
      {
        heading: 'The setup-not-win principle',
        body: [
          "Cross-examination, PF crossfire, and BP points of information are shared airtime. Both sides can ask and answer. The judge is watching for who controls the exchange, not who scores literal points.",
          "Novices think cross-ex is for winning. They try to corner the opponent into admitting they are wrong, and when the opponent does not crack, they walk away frustrated. Varsity treats cross-ex as setup. The goal is not to win the exchange in real time; it is to extract a quote or a concession that comes back in the next speech.",
          'A typical varsity cross-ex extracts two or three quotable answers. In the next speech: "On cross, my opponent confirmed that the warrant rests on a 2015 study. I have the 2023 update; the number has been revised downward by 60 percent." That is the cross-ex win, delivered 90 seconds after the exchange ended.',
        ],
      },
      {
        heading: 'Concession-first questions',
        body: [
          'Phrasing matters. "Would you agree that X?" is harder for them to refuse than "What do you think about X?" The first frames a concession; the second hands them a microphone.',
          'Good concession-first questions:',
          '"Would you agree that the warming trend in your evidence is global, not localized?"',
          '"You said earlier that markets self-correct. Is there a timeframe on that?"',
          '"Does your contention 1 evidence cover the post-2020 period or end in 2018?"',
          "Each locks them into a position you can exploit. If they agree, you have the concession. If they refuse, you ask them to explain why and they are now defending a position they should not be defending.",
        ],
      },
      {
        heading: 'The "never ask why" rule',
        body: [
          '"Why do you think X" is a free 45-second speech for your opponent. They will use it to re-explain their case, add warrants you could not flow in the constructive, and run out the clock.',
          'Replace "why" with structural questions: "Can you point to the specific evidence?" "Which contention does that fall under?" "What is the timeframe?" "Is your impact reversible?" These force short factual answers, not extended argumentation.',
          'If you actually need to attack a warrant, attack it in your next speech, not in cross-ex. Cross-ex is for setup, not for fighting. Reserve the speech for the kill.',
        ],
      },
      {
        heading: 'Controlling the exchange',
        body: [
          "Cross-ex is not polite conversation; it is shared airtime. If they are running long on an answer, cut them: \"I have my answer, moving on.\" Adjudicators expect this. Letting your opponent monologue for 90 seconds while you stand there is a sign you have lost control.",
          'Conversely, when they ask you a question, decide whether to answer fully (when it is a softball), partially (when they are fishing), or pivot ("That is a fair question; the more important issue is X").',
          'Do not talk over each other. Two debaters arguing simultaneously is unflowable. If they are talking, wait one beat, then jump in clean: "Let me finish that thought." Polite, firm, controlled.',
        ],
      },
      {
        heading: 'Format-specific cross-ex',
        body: [
          'In Policy, cross-examination is one-on-one for 3 minutes after each constructive. The questioning side controls the floor; the answering side has to respond. Adjudicators flow cross-ex.',
          'In PF, crossfire is shared 3-minute time where both sides can ask and answer. Pace matters: rapid concession-first questions beat slow exploratory ones.',
          'In Parliamentary formats (APDA, BP, Asian Parli, WSDC), POIs are 15-second interruptions during constructive speeches. Take 1-2; refuse the rest cleanly. The asking side is also scored, so a strong POI raises both speakers\' marks.',
          'Deep guides for specific formats: <a href="/learn/guides/pf-crossfire-questions">PF crossfire</a> and <a href="/learn/guides/bp-poi">BP POIs</a>.',
        ],
      },
    ],
    examples: [
      {
        context: 'Setting up a concession on their warrant.',
        line: '"Would you agree that the warming trend in your evidence is global, not localized?"',
        why: 'They almost have to agree. You now own the framing for your next speech: "Their own evidence concedes the trend is global, which means a localized response does not solve."',
      },
      {
        context: 'Cutting them off mid-monologue.',
        line: '"I have my answer, moving on."',
        why: 'Legal, expected, and the only way to keep control of a shared clock.',
      },
    ],
    related: ['pf-crossfire-questions', 'bp-poi', 'apda-opp-case'],
    keywords: [
      'cross examination debate',
      'crossfire debate tips',
      'POI debate',
      'how to ask debate questions',
      'cross ex debate strategy',
      'concession questions debate',
      'debate questioning techniques',
    ],
    ctaLabel: 'Practice cross-ex against an AI',
    ctaHref: '/voice-debate?mode=crossex',
  },

  'register': {
    slug: 'register',
    question: 'Debater register: how varsity sounds, how novices sound',
    hook: 'Two debaters can make the same arguments and only one of them sounds like they should win. Register is the difference.',
    readTime: '5 min',
    takeaways: [
      "Varsity register: clean signposting, direct address, real numbers, one memorable line per speech, no announcing what you're about to say.",
      'Novice register: throat-clearing openers ("Let me break this down"), abstract language, wall-of-words paragraphs, philosopher name-dropping when the motion does not call for it.',
      'The no-preface rule: never announce what you are about to say. Just say it.',
      'Direct address beats abstract phrasing. "You will see" beats "It can be observed."',
    ],
    sections: [
      {
        heading: 'What register is',
        body: [
          "Register is the verbal style you bring to a debate. Same content, different register, and the judge perceives one debater as more competent. This is not subjective decoration. Register signals competence in the same way that posture signals it in a job interview.",
          'Varsity debaters share a register across formats. Different formats have different vocabularies (a Policy debater says "uniqueness" and a PF debater does not), but the underlying register is the same: confident, specific, direct, structured.',
          "Novice register is also recognizable across formats. The same throat-clearing openers, the same vague abstractions, the same announcing-not-delivering. Judges pick up on it within the first 30 seconds of a speech and start adjusting their flow weights accordingly.",
        ],
      },
      {
        heading: 'The no-preface rule',
        body: [
          "Never announce what you are about to say. Just say it. \"Three reasons their argument fails. One: warrant. Two: impact. Three: reversibility.\" Not \"I will give you three reasons their argument fails, and the first reason is...\" The numbers are the structure; the preface is dead weight.",
          'Same goes for "Here\'s why this fails" → cut "Here\'s why," start with the reason. "Let me break this down" → just break it down. "I would like to argue that" → just argue.',
          "The judge has limited attention. Every word that is not load-bearing eats into the budget for the words that are. Cut the preface and your speech gets denser in the same time.",
        ],
      },
      {
        heading: 'Direct address',
        body: [
          'Direct address beats abstract phrasing. "You will see in our second contention" beats "It can be observed in the second contention." Same content, different perceived authority.',
          'Speak TO the judge, not ABOUT the round. "On their first argument, three problems" speaks to them. "There are three problems with their first argument" speaks about it.',
          'This also applies to "we" language. "We argued in the constructive" beats "the constructive argued." The first sounds like you remember what your team did; the second sounds like you are summarizing a meeting you missed.',
        ],
      },
      {
        heading: 'Specific over abstract',
        body: [
          '"50 million people gain healthcare access" beats "many people gain healthcare access." Real numbers signal that you have actually thought about magnitude.',
          'Named sources beat unsourced claims. "Page and Gilens 2014" beats "research has shown." The former is testable; the latter is unverifiable handwaving.',
          'Concrete scenarios beat hypothetical generalities. "Linda in Dayton loses her job when the plant closes" beats "workers in affected regions face economic harm." This is the same principle that makes journalism work: the specific is more vivid than the general.',
        ],
      },
      {
        heading: 'Memorable lines',
        body: [
          'One memorable line per speech. Not a slogan, not a buzzword. A line that captures the central argument and that the judge can write on the flow and remember at ballot time.',
          'Example, motion on inequality: "Every economic argument they made assumes inequality is the price of growth. Our argument is that inequality at this scale destroys the conditions for growth. The thing they say is the cost is actually the cause."',
          'You do not need a memorable line in every paragraph. You need one per speech. Save it for the moment that needs to land.',
        ],
      },
      {
        heading: 'Specific tells, varsity vs novice',
        body: [
          'Varsity tells: numbered structure announced and delivered, named sources, concession-first cross-ex questions, weighing planted in the constructive, one memorable line per speech, direct address, partner handoff at the end.',
          'Novice tells: "let me break this down," "in today\'s world," "I would like to argue that," wall-of-words paragraphs without internal structure, philosopher name-dropping when the motion does not call for it (running Kant on every motion), "I hope to convince you," "in conclusion."',
          'No philosopher name-dropping unless the motion actually calls for ethical philosophy. The default register is "varsity debater on the circuit," not "philosophy seminar." A Util frame is fine on a policy motion; running Foucault on a death-penalty round to sound smart loses.',
        ],
      },
    ],
    examples: [
      {
        context: 'Novice opening.',
        line: '"In today\'s world, we face many challenges, and I would like to argue that this resolution is something we should affirm because it brings about positive change. Let me break this down for you."',
        why: 'Throat-clearing, vague, announcing-not-delivering. Judge has tuned out before the first real argument.',
      },
      {
        context: 'Varsity opening, same speech.',
        line: '"Three reasons to vote affirmative. One: the policy reduces emissions by 15 percent in five years. Two: the cost is reversible if the projection misses. Three: the alternative is irreversible warming above 1.5C. I will walk each."',
        why: 'No preface. Numbered structure. Concrete numbers. Direct address. Judge writes three lines on the flow and listens for each one.',
      },
    ],
    related: ['asian-parli-pm-opening', 'wsdc-reply-speech', 'ld-value-criterion'],
    keywords: [
      'debater register',
      'how varsity debaters sound',
      'debate speech style',
      'debate delivery tips',
      'how to sound like a varsity debater',
      'debate speaking style',
      'public speaking debate',
      'no preface rule debate',
    ],
    ctaLabel: 'Practice with a judge ballot',
    ctaHref: '/voice-debate',
  },

};

export function getFundamental(slug) {
  if (!slug) return null;
  return FUNDAMENTALS_BANK[slug.toLowerCase()] || null;
}

export function listFundamentals() {
  return Object.values(FUNDAMENTALS_BANK);
}
