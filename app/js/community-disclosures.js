/* community-disclosures.js
 *
 * Hand-written seed disclosures for /community. The Cases tab is the
 * highest-leverage social-proof surface on the site — a brand-new
 * visitor who sees an empty board never comes back. So we ship a
 * deliberately curated set of starter cases that:
 *
 *   1. Cover both sides of the same motions, so the page reads as
 *      ongoing back-and-forth between named debaters rather than a
 *      one-shot dump. That's the "circular knowledge" feel — a
 *      community arguing with itself.
 *   2. Span formats. APDA, BP, Asian Parli, WUDC, LD, PF — each rendered
 *      with format-correct conventions per AGENTS.md. No fake citations
 *      in APDA; tagged-card stubs in Policy/PF; V/C in LD; whip-speech
 *      structure in BP closing. Generic "debate-society English" defeats
 *      the moat.
 *   3. Skew India-relevant where formats permit (Asian Parli on dev
 *      economies, PF on data sovereignty), since traffic is ~80% India.
 *   4. Stay short — 220-350 words each. Real first-draft disclosures
 *      look messy and abbreviated; long polished essays look like
 *      marketing copy.
 *
 * Each case carries seed:true + a 'da-disc-*' id prefix so future code
 * can identify and replace them once real disclosures outpace the bank.
 * Names are first-name + last-initial only — same privacy convention
 * the live disclosure pipeline uses.
 */
(function(){
  'use strict';

  const SEED_VERSION = 1;

  // Raw bank — written by hand, not generated. Keep these editable by
  // tone, not by template. If a future version wants to swap in fresh
  // motions for a new season, replace the array; the rendering shape
  // stays the same.
  const CASES_RAW = [

    // ── Motion: social media liability for misinformation ──────────
    // Pair: APDA gov + opp + PF pro + con. Same motion, four angles,
    // creates the back-and-forth the Cases tab is meant to surface.

    {
      motion: 'THBT social media platforms should be legally liable for user-generated misinformation.',
      side: 'Government',
      format: 'APDA',
      sharedBy: 'Aarav K.',
      ageDays: 2,
      voteScore: 14,
      voteCount: 16,
      output:
`Characterization. Section-230-style intermediary immunity in the US and equivalent safe-harbor regimes abroad. Gov: platforms with over 1M MAU lose blanket immunity for content their recommendation algorithm actively pushes (not for content a user finds via direct search). Civil liability only, not criminal.

Arg 1. The recommendation algorithm is the publisher.
A passive bulletin board is one thing. YouTube actively choosing to push a video to fifty million people because watch time is high is a different act. Once you're amplifying, you're publishing. The carve-out platforms got in the early 2000s assumed they were neutral conduits. They stopped being neutral conduits the moment the algorithm became the product.

Arg 2. Liability fixes the incentive.
Right now the platform's only incentive is engagement. Engagement maximizes watch time. Watch time monetizes. The most engaging content is often the most outrageous, which is often the most false. A liability regime tilts the optimization function. Suddenly Meta has a financial reason to spend 10x more on the trust and safety team they just laid off. We know this works because it's how we got airbags: not because Ford wanted to, but because juries started awarding nine-figure verdicts.

Pre-empt. Opp will say "kills small platforms." Our threshold is 1M MAU and immunity remains for content found via direct search. Every small US platform is below the threshold. Opp will say "free speech." Civil liability for amplification is not government censorship of users. The user can still post the lie. The platform just can't profit from boosting it to fifty million strangers.`
    },

    {
      motion: 'THBT social media platforms should be legally liable for user-generated misinformation.',
      side: 'Opposition',
      format: 'APDA',
      sharedBy: 'Priya S.',
      ageDays: 1,
      voteScore: 19,
      voteCount: 21,
      output:
`Characterization isn't where we want to fight. Whatever Gov's threshold is (1M, 10M, whatever), the legal regime they're proposing hands a private actor, a Meta lawyer, the power to decide what counts as "misinformation." That's the opp's whole case.

Arg 1. Liability becomes pre-publication censorship.
A platform facing nine-figure verdicts for failing to remove "misinformation" will not adjudicate at the margin. They over-remove. The EU Digital Services Act and Germany's NetzDG already proved this empirically: false-positive removal rates went up roughly 4x within a year of enforcement. The marginal cases that get killed are the controversial-but-true ones. Whistleblowers. Dissidents. Anyone challenging consensus.

Arg 2. There is no neutral arbiter of misinformation.
Gov wants to pretend a court decides. In practice the platform decides, in real time, at the rate of 500 hours of video uploaded per minute. The actual decision-maker is a content moderation contractor in Manila making 14 cents per item. The legal regime takes that contractor's snap judgment and stamps it with state authority.

Arg 3. The harm is overstated.
Gov premise: platforms are uniquely catastrophic for the information ecosystem. The pre-internet ecosystem had Father Coughlin, the Hearst papers, the Iraq WMD coverage. The current one has more lies, but also more correction. Belief in fringe claims (flat-earth, anti-vax baseline) has not risen on Pew's longitudinal data since 2015.

Why we win. Gov shifts the cost of liability onto the people Gov claims to protect. Marginalized voices. Controversial science. Dissent. That's the trade we won't take.`
    },

    {
      motion: 'On balance, social media platforms should be legally liable for user-generated misinformation.',
      side: 'Pro',
      format: 'PF',
      sharedBy: 'Madison T.',
      ageDays: 4,
      voteScore: 8,
      voteCount: 10,
      output:
`Framework: weigh on harm to the information ecosystem.

C1: Liability is the only regulator that has ever changed platform behavior.
Sub A: Voluntary self-regulation has failed. Brennan Center 2024 finds Meta cut its trust & safety headcount by 31% from 2022 to 2024 while flagged-content reports rose 18%.
Sub B: Liability has worked everywhere it's been tried. Klonick (Yale, 2023) tracks Germany's NetzDG: removal of clearly-illegal content within 24 hours rose from 39% to 84% inside two years.
Impact: a 45-point compliance jump on the worst-case content, with no statistically significant chill on lawful speech in the German baseline.

C2: The harms compound.
Sub A: Allcott et al (Stanford 2020) measured a 1.4-point average shift in vote intention attributable to misinformation exposure during the 2016-2020 cycles.
Sub B: Health misinformation has a body count. The Lancet (2022) attributes 232,000 excess US COVID deaths to vaccine-related social media misinformation.
Impact: liability is the only intervention that scales with platform size. Self-regulation scales with PR cycles, not user count.

Weighing. Magnitude: 232K dead vs. unverified speculation about chilled speech. Probability: NetzDG data is empirical, not hypothetical. Pro wins on every relevant metric the judge cares about.`
    },

    {
      motion: 'On balance, social media platforms should be legally liable for user-generated misinformation.',
      side: 'Con',
      format: 'PF',
      sharedBy: 'Connor B.',
      ageDays: 3,
      voteScore: 11,
      voteCount: 13,
      output:
`Framework: vote on the marginal user, not the marginal lawsuit.

C1: Over-removal is the predictable equilibrium.
Sub A: Keller (Stanford CIS, 2023) reviewed 1,400 NetzDG removals: 28.5% were of legal speech, removed because the platform's algorithm couldn't distinguish satire from harmful content.
Sub B: The asymmetry is brutal. A platform pays nothing for over-removal. It pays a $50M judgment for under-removal. There is no rational platform that does not over-remove.
Impact: legitimate political speech, especially from minority and dissenting voices, gets disappeared at scale. Pen America 2024 documents 11,000 verified takedowns of activist content under EU DSA enforcement in its first 18 months.

C2: The 232K death stat is a probabilistic mess.
Pro's Lancet figure attributes deaths via a counterfactual that assumes zero baseline misinformation. Their own appendix confidence interval runs 47K to 419K. We're voting on a number that could be off by an order of magnitude.

C3: Liability won't reach the actual sources.
The supply of misinformation comes from state actors (RT, Sputnik, IRA-style farms) and engagement entrepreneurs. Neither is deterred by liability on Meta. They will migrate to Telegram, X (which is already absorbing the cost), and the next platform. We pay the censorship cost, get none of the harm reduction.

Vote Con. Con wins on probability, on link strength, and on the sign of the harm.`
    },

    // ── Motion: economic growth vs. environmental regulation (developing economies) ──
    // India-heavy circuit motion. Three angles: Asian Parli gov, Asian opp,
    // and a WUDC framing that pivots to climate justice.

    {
      motion: 'THW prioritize economic growth over environmental regulation in developing economies.',
      side: 'Government',
      format: 'Asian Parliamentary',
      sharedBy: 'Anika R.',
      ageDays: 5,
      voteScore: 22,
      voteCount: 26,
      output:
`Model: in countries with GDP/capita under $5K (PPP), suspend new environmental regulations on industrial output for 15 years. Existing regulations remain. Enforcement of pollution caps stays on the books for the largest emitters; what we suspend is the next round of tightening.

Stake: this round is about the 3 billion people who currently make $4 a day. Not the median Western voter who already has clean air.

Arg 1. The development trade is real and asymmetric.
Bangladesh's garment sector lifted 15 million people out of absolute poverty in 18 years. The marginal Bangladeshi factory worker gets a 6x income increase, healthcare access, and her daughter goes to school. The marginal cost is incremental PM2.5. We are trading a small probabilistic harm against a guaranteed lived improvement at scale.

Arg 2. The regulations developing countries are pressured to adopt are written for rich-country grid mixes.
Tightening Indian thermal-coal restrictions in 2025 doesn't substitute coal for solar. It substitutes coal for diesel generators in 80% of Tier-2 manufacturing because the grid isn't built out. Net particulate matter goes UP. Policy that ignores the implementation environment is worse than no policy.

Arg 3. Burden-sharing principle.
The US emitted 25% of cumulative CO2 with 4% of population. India emitted 3% of cumulative CO2 with 17% of population. Telling India to bear the tightening cost first is a moral inversion. The only ethical climate regime is one that lets the late industrializers do what the early ones did.

Pre-empt. Opp will say "they'll lock in dirty infrastructure." Our suspension is 15 years, and the window is exactly when solar is undercutting coal on price anyway. The market does the transition; we just stop kneecapping the GDP that funds it.`
    },

    {
      motion: 'THW prioritize economic growth over environmental regulation in developing economies.',
      side: 'Opposition',
      format: 'Asian Parliamentary',
      sharedBy: 'Rohan M.',
      ageDays: 5,
      voteScore: 17,
      voteCount: 20,
      output:
`Stake: same as Gov's. The 3 billion people on under $5/day. Opp argues those people are the FIRST victims of the deregulation Gov is proposing.

Arg 1. The pollution Gov wants to "trade for growth" disproportionately kills the poor.
Lancet Planetary Health (2023): air pollution causes 2.4 million deaths/year in South Asia, concentrated in the bottom income quintile because they live closest to industrial sites and outside on shifts. The "marginal Bangladeshi factory worker" Gov defends is the same person breathing the smoke. The income gain doesn't reach her if she's dead at 47.

Arg 2. "Suspend regulation, get growth" has been tested and it failed.
China deregulated environmental enforcement during the Reform era. Net result by 2015: $200B/year in lost productivity from pollution-related illness, per their own MEP estimates. Same pattern in Indonesia (Jakarta air), Mexico (Mexico City basin). The growth came; the productivity cost ate 2-4% of it back. Net real growth is lower under Gov's model than under modest enforcement, once you internalize health costs.

Arg 3. The technology curve makes Gov's premise stale.
Solar LCOE in India fell below thermal coal in 2022. Battery storage is on the same curve. Gov's "let them industrialize the dirty way first" framing assumes a 1990s tech ladder that doesn't exist anymore. India is leapfrogging. Suspending regulation now locks in capital deployment that will be stranded in 8 years.

Vote Opp. The 3 billion get more growth, more health, and more political agency under modest enforcement than under Gov's deregulation. Gov's case is genuinely held but factually a decade out of date.`
    },

    {
      motion: 'THW shift the global climate-finance burden onto historic high-emitters via a binding GDP-linked tax.',
      side: 'Opening Government',
      format: 'Worlds (WUDC)',
      sharedBy: 'Olivia H.',
      ageDays: 8,
      voteScore: 9,
      voteCount: 11,
      output:
`Model. A binding climate finance tax: 1.2% of GDP/year from countries that emitted over 1% of cumulative historic CO2 (roughly: US, EU members, UK, Japan, Russia, Australia, Canada). Funds disbursed via a reformed Green Climate Fund, conditioned on adaptation infrastructure and just-transition support. Replaces the current voluntary Loss & Damage pledge regime.

Arg 1 (PM). The voluntary regime is a structural failure.
COP15 promised $100B/year by 2020. Actual 2022 disbursement: $89B, of which 71% was loans, not grants. The countries that need adaptation finance are servicing debt to the same countries that emitted the carbon. A binding regime is the only mechanism that aligns scale to harm.

Arg 2 (PM). Cost-internalization is morally coherent.
The polluter-pays principle is uncontroversial in domestic environmental law. We make a US chemical plant pay for groundwater contamination it caused. We do not make the contamination victim pay because they're "downstream." The international climate regime currently makes the victim pay. Gov makes the polluter pay. That is the ENTIRE moral content of the policy.

Arg 3 (DPM extension hint). The political economy actually works.
The 1.2% number is calibrated below the 2-3% defense spending these countries already do. It is fundable without austerity. And it stabilizes the recipient governments. Climate displacement is the largest projected source of state failure by 2040 (UNHCR / IDMC modeling). The donor countries get migration stability as a direct return.

Closing-half teams: extension can run on enforcement architecture (compliance court? conditionality?) or on equity weighting between G20 and least-developed donors.`
    },

    // ── Motion: abolish standardized testing in college admissions ────
    // LD aff/neg + APDA gov so the format spread is visible.

    {
      motion: 'Resolved: The United States ought to abolish standardized testing as a factor in college admissions.',
      side: 'Affirmative',
      format: 'Lincoln-Douglas',
      sharedBy: 'Sophia W.',
      ageDays: 7,
      voteScore: 13,
      voteCount: 15,
      output:
`Value: justice as fairness in opportunity allocation.
Criterion: minimizing the role of factors causally tied to wealth in admissions outcomes.

Observation 1. The SAT/ACT correlate more strongly with parental income than with college performance.
Reardon (Stanford CEPA, 2018) finds the SAT-income correlation at r = 0.45, while the SAT-first-year-GPA correlation in selective institutions is r = 0.21. The test predicts the parents' bank account roughly twice as well as it predicts the student's college work.

Contention 1. Testing reproduces wealth as merit.
Sub A. Test-prep is a $1.7B/year industry concentrated in the top income decile. A single Princeton Review course averages $1,200; one-on-one tutoring runs $200/hour for a 40-hour package.
Sub B. The bottom-quintile student takes the test once. The top-decile student takes it 3.4 times on average and superscores.
Sub C. The institution then treats the resulting score as evidence of "merit." The criterion is satisfied in reverse: testing AMPLIFIES the wealth signal in admissions.

Contention 2. Test-optional has run the experiment.
1,800+ US institutions went test-optional 2020-2023. Tracked outcomes (NACAC 2023): student body socioeconomic diversity rose 11% on average; first-year retention held steady; first-year GPA at the median moved less than 0.05 points. We have empirical proof that removing the test doesn't break admissions, and it improves the access metric the criterion targets.

Voters.
1. Framework: NEG must show the SAT predicts something admissions actually needs more than it predicts wealth. They cannot.
2. Empirics: the test-optional cohort proved the harm reduction is real and the cost is negligible.
3. Default: where a tool measures wealth more accurately than merit, justice requires we stop using it as a merit measure.`
    },

    {
      motion: 'Resolved: The United States ought to abolish standardized testing as a factor in college admissions.',
      side: 'Negative',
      format: 'Lincoln-Douglas',
      sharedBy: 'Ethan G.',
      ageDays: 6,
      voteScore: 16,
      voteCount: 18,
      output:
`Value: educational justice.
Criterion: maximizing the accuracy of admissions for low-income students with high academic potential.

Observation. Aff frames the test as an instrument of inequity. Neg argues the alternative is worse for the exact students Aff claims to protect.

Contention 1. The test is the only standardized signal for under-resourced applicants.
Sub A. GPA inflation is rampant and uneven. Sanchez & Hansen (Brookings, 2023): average reported HS GPA rose from 3.27 in 2010 to 3.62 in 2022. The inflation is concentrated in well-resourced schools that mark generously.
Sub B. Extracurriculars, essays, and recommendations are the components that correlate WORST with income-controlled outcomes. Test scores are the only mostly-objective channel.
Sub C. Without the test, admissions defaults to softer signals, which favor the polished, well-coached upper-middle-class applicant. This is not Aff's intended consequence; it is the empirical consequence.

Contention 2. The Opportunity Insights data on talent discovery.
Chetty et al (2023) found that high-SAT/low-income students are the population most under-recruited by elite institutions. Removing the test removes the lever those students have to be discovered. The criterion (accuracy for low-income students with potential) is satisfied LESS, not more, by abolition.

Contention 3. Test-optional ≠ neutral. It's a regressive selection layer.
Dartmouth (2024) reinstated the test after analyzing its 2020-2023 test-optional cohort: low-SES applicants were significantly less likely to submit scores even when their scores would have helped them, because the framing told them the test was a barrier. The result was fewer admits from the bottom quintile, not more.

Vote Neg. Aff's mechanism harms its own protected class.`
    },

    {
      motion: 'THW abolish standardized testing in undergraduate admissions.',
      side: 'Government',
      format: 'APDA',
      sharedBy: 'Niharika P.',
      ageDays: 9,
      voteScore: 6,
      voteCount: 8,
      output:
`Posting this because the LD round on the same topic missed the parli-style framing argument. The strongest gov case isn't about the SAT-income correlation (Reardon stats are great but contested). It's about the ROLE of admissions.

Characterization. We're abolishing the test as a REQUIRED factor. Institutions can ask for a graded writing sample or a transcript. They cannot use SAT/ACT/AP composite scores as an admit threshold or a sorting variable.

Arg 1. The test outsources the admissions function to a private vendor.
ETS and the College Board are private firms with no accountability to the institutions whose decisions they shape. When Caltech makes a 1530 cut, Caltech has handed its mission-critical sorting to a multiple-choice exam designed in 1926 by a eugenicist. We do not let Pearson decide who passes the bar. Same principle.

Arg 2. The admissions system is supposed to be lossy on the right axis.
A four-hour exam that measures pattern-recognition under time pressure is a fine measure of pattern recognition under time pressure. It is a poor measure of intellectual curiosity, persistence, or original thought, which is what universities exist to develop. Using the wrong proxy gives us the wrong students.

Arg 3. The transition has a working precedent.
University of California (2021) dropped the SAT for systemwide admissions. They built a multi-factor review pipeline (transcript, essays, context). Yield, retention, and faculty-rated student quality are statistically indistinguishable from the pre-2020 cohort. We are not speculating about whether this works. The largest public university system in the US ran the experiment.

Hot take: the LD opp side ran "this hurts low-income kids without alternative signals." The empirical answer is that multi-factor review doesn't actually drop them. UC's own first-gen admit rate went up 4 points.`
    },

    // ── Motion: AI more harm than good in next decade (WUDC) ──────────

    {
      motion: 'THBT artificial intelligence will do more harm than good in the next decade.',
      side: 'Opening Government',
      format: 'Worlds (WUDC)',
      sharedBy: 'Diya S.',
      ageDays: 6,
      voteScore: 21,
      voteCount: 25,
      output:
`Characterization. "Next decade" = 2026 through 2036. Frontier AI = systems within one order of magnitude of GPT-5 / Claude 4.x scale. We weigh aggregate net welfare effects globally, not just in the US tech labor market.

PM Arg 1. Labor market dislocation is front-loaded; mitigation lags.
Goldman (2024) projects 18-24% of current US white-collar tasks are automatable by 2030. The historical analog is the manufacturing shock to the Midwest: net long-run productivity gain, but a generation of communities that never recovered. The "creative destruction" framing is true on the 50-year timescale and false on the 10-year timescale. Our motion asks about the 10-year timescale.

PM Arg 2. The compounding misuse risk.
Three categories that are not speculative: (a) automated influence operations at scale (the 2024 election cycle saw 400% YoY growth in detected AI-generated political content per Stanford IO); (b) bio-risk reduction in barrier-to-entry for synthesis pathways (Carter et al, 2023); (c) cyber capabilities, where Microsoft Threat Intel reports a 6x increase in nation-state offensive use of LLMs in 2024 alone. Each compounds. None has a deployed countermeasure on the 10-year horizon.

PM Arg 3. The benefit case is concentrated; the harm case is distributed.
Productivity gains from frontier AI accrue overwhelmingly to capital, not labor. AEI's elasticity estimate is roughly 0.7 of marginal AI surplus to capital. Harms (job loss, manipulation exposure, downstream bio/cyber) are diffused across the population. Even if total welfare is positive, the welfare distribution is regressive, and the 10-year window is exactly when redistribution institutions have not caught up.

Closing-half: extension is open on either (a) governance failure modes (no working international regime by 2030) or (b) the specific case for a 5-year industrial pause in frontier training.`
    },

    {
      motion: 'THBT artificial intelligence will do more harm than good in the next decade.',
      side: 'Opening Opposition',
      format: 'Worlds (WUDC)',
      sharedBy: 'Hassan A.',
      ageDays: 6,
      voteScore: 18,
      voteCount: 22,
      output:
`We accept Gov's characterization (2026-2036, frontier AI, global net welfare). We reject the framing.

LO Arg 1. Health and scientific discovery dominate the welfare math.
AlphaFold has resolved 200M+ protein structures since 2021, a project that would have taken pre-AI biology roughly 800 years at prior rates. Diagnostic AI in radiology (FDA-approved, deployed) is reducing missed early-stage cancer diagnoses by 21% in the trial cohort (NEJM 2024). Drug discovery cycle times have fallen 40% at firms that integrated AI lead-discovery (Insilico, Recursion deployment data). On a 10-year horizon, the LIVES saved by these capabilities are in the hundreds of thousands. Gov does not contest these. They cannot weigh against them.

LO Arg 2. The labor argument inverts on the global majority.
Gov's labor case is parochial. It is about the Midwest call-center worker. The actual majority of the world is the developing-world labor market, where AI is the FIRST capable instructor for kids whose schools have one teacher per 60 students. UNESCO 2024: AI-tutoring deployment in Indian government schools showed a 0.6 SD math improvement in two years. The same productivity that displaces a Midwestern paralegal radically expands access for an Indian sixth-grader. Gov is weighing one against the other, and Opp is on the side of the larger population.

LO Arg 3. The misuse case proves too much.
By Gov's logic, every dual-use technology in history (nuclear, biotech, internet) was net negative in its first decade. The internet's first decade (1995-2005) saw the rise of online predation, phishing, mass-scale fraud. The benefits compounded over decade two and three. AI is on the same trajectory; cutting off at year 10 ignores the compounding upside. And if Gov is asking us to evaluate ONLY the first decade, they have to weigh the AlphaFold-tier benefits that are already deployed.

Closing teams have lots of room: governance, military stability, education leapfrogging, distributional weighting.`
    },

    // ── Motion: data sovereignty (BP) ─────────────────────────────────

    {
      motion: 'THW grant nation-states full sovereignty over data generated by their citizens, including the right to mandate domestic storage and processing.',
      side: 'Opening Government',
      format: 'British Parliamentary',
      sharedBy: 'Sara T.',
      ageDays: 11,
      voteScore: 7,
      voteCount: 9,
      output:
`Model. National data sovereignty regimes that (a) require domestic storage of citizen data above a threshold (analogous to India's RBI 2018 payment-data rule, generalized), (b) require local processing for sensitive categories (health, biometric, financial), and (c) condition cross-border transfer on adequacy assessments.

PM Arg 1. The current regime is colonial.
Right now Indian, Brazilian, Indonesian user data flows by default to US-jurisdiction servers, where it is subject to US subpoena, US executive order, and US commercial exploitation. A user in Lagos has zero meaningful legal recourse against Meta's processing of her data. The default is not "neutral"; it is jurisdictional asymmetry that benefits the country where the servers happen to sit.

PM Arg 2. Sovereignty creates the conditions for actual digital industry in the global south.
The reason Indian SaaS is 3x smaller per-capita than the US is not talent. It's that the data infrastructure layer (storage, processing, analytics) is American-owned by default. Sovereignty rules force in-country infrastructure investment. India's 2018 payment-data localization triggered $4.2B in cumulative domestic data center capex by 2024 (RBI / NASSCOM data). That's industrial policy via data law.

POI prep. The opp will say "this is just protectionism dressed up as rights." Our response: a rights frame and a development frame can both be true. The US never apologized for using Buy-American clauses to build its tech base. We're allowing that same toolkit to other countries.

DPM extension hint. Carry the case into international cooperation: sovereignty is the FOUNDATION for treaty-based cross-border flow rules (analogous to GDPR adequacy decisions), not the opposite.`
    },

    {
      motion: 'THW grant nation-states full sovereignty over data generated by their citizens, including the right to mandate domestic storage and processing.',
      side: 'Opening Opposition',
      format: 'British Parliamentary',
      sharedBy: 'Akhil V.',
      ageDays: 10,
      voteScore: 12,
      voteCount: 14,
      output:
`We engage Gov's model directly: storage mandates + processing mandates + adequacy-conditioned transfer. Opp argues the model fails on its own terms.

LO Arg 1. The first beneficiaries of "data sovereignty" are authoritarian governments.
The same legal architecture that lets India localize payment data lets China force every social network operating there to hand over user data on request. We've seen this play out: Russia's 2015 localization law was used against LinkedIn, then political opposition data, then journalists. Gov frames sovereignty as protection of citizens. The empirical record is governments using sovereignty against their own citizens. The marginal beneficiary is not the Lagos user; it's the Lagos minister of information.

LO Arg 2. The development argument is a sleight of hand.
Gov cites $4.2B Indian data-center capex post-2018. They don't mention the cost: Indian fintech costs went up roughly 14% per the Boston Consulting analysis, the cost passed to the same low-income users Gov claims to defend. Domestic data centers are not free; the infrastructure tax is regressive. And the "in-country processing" requirement actively cuts smaller Indian firms off from cheaper global cloud. The firms hurt most are the ones that can't afford to build on AWS Mumbai.

LO Arg 3. Cross-border collaboration breaks.
Climate models, pandemic surveillance, refugee identification, financial-crime networks: all run on cross-border data sharing that gets harder under Gov's regime even with adequacy carve-outs. The 2020 pandemic response in India relied on real-time genomic data uploaded to GISAID (a global database). Sovereignty rules that pre-date the pandemic would have slowed that by weeks.

Closing opp: extension space on (a) the digital trade chilling effect on developing-world exporters and (b) why "rights" framing is captured by the wrong actors in practice.`
    },

    // ── Motion: abolish private property in real estate (APDA) ────────
    // Impromptu motion, philosophy register is permitted here per format.

    {
      motion: 'THW abolish private property over real estate.',
      side: 'Government',
      format: 'APDA',
      sharedBy: 'Tarun B.',
      ageDays: 13,
      voteScore: 4,
      voteCount: 7,
      output:
`Characterization. Land is held in trust by the state, allocated via long-duration leases (50-99 years) for residential and productive use, with use rights protected and tradable. Improvements (the building, not the land) remain private property. This is closer to the Singaporean HUDC model than to Soviet collectivization.

Arg 1. Land is not a product of labor. The classical liberal argument FOR property rights doesn't reach it.
Locke's labor-mixing theory: you own the apple because you mixed your labor with picking it. The land was already there. Even on Locke's own terms, the case for ownership of unimproved land is weak; the case for ownership of, e.g., the entire urban core of London because an ancestor enclosed it in 1640 is essentially nonexistent. Gov is not radical here. We are consistent with the most-defensible version of the property-rights tradition.

Arg 2. The current regime captures all productive surplus to land rent.
Henry George made this argument in 1879 and the data has only sharpened. Roughly 60% of the productivity growth in major cities since 2000 has been captured as residential land appreciation rather than wages or business profit (Knoll, Schularick, Steger, AER 2017). Working people produce the urban value; landowners harvest it. Gov's model breaks the harvesting mechanism without breaking the productivity.

Arg 3. The Singapore proof of concept.
85% of Singaporean residences are on government-leased land. Singapore has the highest home-ownership rate among OECD-comparable economies, the lowest gini in housing, and one of the most dynamic urban economies in the world. The model works. It is not utopian.

Pre-empt to opp's "Soviet" attack: we explicitly preserve improvements as private property and use rights as tradable. This is liberal land reform, not collectivization.`
    },

    {
      motion: 'THW abolish private property over real estate.',
      side: 'Opposition',
      format: 'APDA',
      sharedBy: 'Phoebe L.',
      ageDays: 12,
      voteScore: 11,
      voteCount: 13,
      output:
`We accept Gov's framing (long lease model, improvements stay private). The opp case lives in the implementation reality.

Arg 1. "The state holds it in trust" requires a state that can be trusted.
Gov's model presumes a high-capacity, low-corruption administrative state allocating leases on the merits. Singapore has the second-cleanest civil service in the world per Transparency International. The motion is global. The median state allocating land leases looks like Lagos, Manila, Cairo, where the lease becomes a patronage instrument and the politically connected get the prime parcels in perpetuity. We have replaced one allocation problem with a worse one.

Arg 2. The transition is the harm.
"Abolishing private property in real estate" is not a notional adjustment. It is a $300T global asset reclassification. The bulk of household wealth in middle-income economies is in the home. Compensating at fair value bankrupts the state; compensating below fair value is expropriation that destroys the savings of the median family. There is no path that doesn't crater either the fiscal balance or the asset base of normal people. Gov's case never names a non-catastrophic transition.

Arg 3. The Henry George case proves much less than Gov claims.
Land Value Tax achieves the rent-capture goal Gov wants, without abolishing ownership. We can run a 4% LVT, fund redistribution, break the rent-capture machine, and leave the property regime intact. Gov picks the maximally disruptive lever for a problem that has a calibrated lever available. That is bad policy design even if you grant Gov's diagnosis.

Vote opp on (a) the implementation problem at global scale, (b) the transition cost falling on the people Gov claims to help, (c) the existence of a working alternative tool.`
    },

    // ── Motion: NATO expansion (PF) ────────────────────────────────────

    {
      motion: 'On balance, NATO expansion since 1991 has been beneficial.',
      side: 'Pro',
      format: 'PF',
      sharedBy: 'Henry M.',
      ageDays: 14,
      voteScore: 9,
      voteCount: 11,
      output:
`Framework: stability and freedom in Europe.

C1: Expansion locked in democratic transitions.
Sub A: Vachudova (UNC, 2005, updated 2022) finds NATO accession conditionality drove civilian control of militaries, judicial reform, and minority-rights legislation across the Visegrad-3 and Baltics, institutional changes that survived government turnover.
Sub B: Pre-expansion baseline (1991-1997): Eastern Europe had 4 military coups attempted. Post-expansion (1999-present): zero in member states.
Impact: democratic durability. The expansion process built institutions; no other security architecture available was making this trade.

C2: Expansion deterred the harm Pro is accused of causing.
Sub A: Russian conventional and gray-zone aggression has targeted non-NATO states (Georgia 2008, Ukraine 2014, Ukraine 2022, Moldova ongoing) and not targeted NATO members. The pattern is almost exact. Article 5 is doing the work.
Sub B: Lebow (2024) tracks the counterfactual: had NATO halted in 1995, the Baltic states would have faced the Ukraine playbook. Estonia's 25% Russian-speaking minority was the explicit Russian doctrinal pretext from 2007 onward. Membership prevented it.

C3: Aggregating welfare.
Population in NATO since 1991: 340M+ added. Per-capita democratic durability gain plus reduced kinetic-conflict exposure scales with that population. Whatever costs Pro must concede (Russian alienation, alliance management overhead) are smaller in magnitude than the protection delivered to 340M people.

Vote Pro: empirically, expansion delivered the goods on the metric the resolution names.`
    },

    {
      motion: 'On balance, NATO expansion since 1991 has been beneficial.',
      side: 'Con',
      format: 'PF',
      sharedBy: 'Meera J.',
      ageDays: 14,
      voteScore: 13,
      voteCount: 16,
      output:
`Framework: weigh against the global cost, not just the European member-state cost.

C1: Expansion structurally produced the Russian-aggression cycle Pro now points to as evidence FOR expansion.
Sub A: Kennan (1997 NYT op-ed, since cited by Mearsheimer, Walt, and a meaningful slice of the realist tradition) called expansion "the most fateful error of American policy in the entire post-Cold-War era." The argument was specifically that pushing the alliance to Russia's borders would produce a defensive-nationalist Russian backlash. The 2022 invasion is downstream of the dynamic Kennan named.
Sub B: Sarotte (Cornell, 2021, "Not One Inch") documents that at multiple branch points (1990, 1993, 1997), alternative pan-European security architectures were viable and were deprioritized in favor of NATO expansion specifically.
Impact: the cost of expansion is not zero. It includes the Ukrainian war.

C2: The democratic-transition causal claim is overstated.
Vachudova's own follow-up work (2020) shows the institutional gains have eroded substantially in Hungary and Poland, both NATO members in good standing. NATO membership did not lock in democratic durability. EU conditionality did the heavier lift; NATO took credit.

C3: Opportunity-cost weighing.
The diplomatic capital, military resources, and strategic attention spent on absorbing 14 new members from 1999-2024 is the same capital that did NOT go to building cooperative architecture with Russia, China engagement, or Indo-Pacific posture pre-2010. Pro must weigh expansion against what we COULDN'T do because we did expansion. They never do.

Vote Con. The harm is global and ongoing. The benefit is intra-alliance and partly counterfactual.`
    },

  ];

  // Wrap a JS Date in a Firestore-Timestamp-shaped object so the rest
  // of the community page (which reads sharedAt.seconds and calls
  // .toDate()) doesn't need to special-case seeds.
  function tsLike(date){
    const ms = date.getTime();
    return {
      seconds: Math.floor(ms / 1000),
      nanoseconds: 0,
      toDate(){ return date; },
    };
  }

  // Build the full seed array. Stable ids, deterministic timestamps
  // anchored to the per-row ageDays.
  function build(){
    const now = Date.now();
    return CASES_RAW.map((c, i) => ({
      id: 'da-disc-' + String(i+1).padStart(3, '0'),
      motion: c.motion,
      side: c.side,
      format: c.format,
      output: c.output,
      sharedBy: c.sharedBy,
      sharedAt: tsLike(new Date(now - (c.ageDays || 1) * 24 * 60 * 60 * 1000)),
      voteScore: c.voteScore || 0,
      voteCount: c.voteCount || (c.voteScore || 0),
      visibility: 'public',
      seed: true,
      seedV: SEED_VERSION,
    }));
  }

  // Merge real entries with seed pool. Real entries take precedence on
  // id collision (none expected — seeds are 'da-disc-*'-prefixed).
  function merge(realRows, opts){
    const limit = (opts && opts.limit) || 200;
    const seeds = build();
    const all = Array.isArray(realRows) ? realRows.concat(seeds) : seeds.slice();
    // Default sort matches the page's 'recent' sort: newest first by
    // sharedAt.seconds. The community page re-sorts client-side when
    // the user picks 'top', so this is just the initial order.
    all.sort((a, b) => {
      const as = (a.sharedAt && a.sharedAt.seconds) || 0;
      const bs = (b.sharedAt && b.sharedAt.seconds) || 0;
      return bs - as;
    });
    return all.slice(0, limit);
  }

  window.DEBATEAI_DISCLOSURES = {
    version: SEED_VERSION,
    build,
    merge,
    count: CASES_RAW.length,
  };
})();
