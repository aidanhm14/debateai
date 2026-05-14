// Daily motion bank for /today (the SEO content engine).
//
// Each date deterministically maps to a motion via a per-date hash, so
// /today/2026-05-14 always shows the same content (Google-stable) but
// different dates show different motions. No cron, no Firestore writes,
// no scheduled job needed — the page renders pure-function from date.
//
// The bank is intentionally diverse across debate domains (econ, tech,
// ethics, civic, edu, env, global). Each entry carries a short framing
// blurb that gives the /today page enough unique body content to be
// indexable, plus the gov/opp side hints so the CTA can pre-fill the
// debate-ai setup form.

export const DAILY_MOTIONS = [
  {
    motion: 'This House would ban algorithmic newsfeeds.',
    domain: 'tech',
    frame: 'Recommendation algorithms decide what hundreds of millions of people read every day. Defenders argue they connect people to relevant content at unprecedented scale. Critics say they fragment shared reality and reward outrage. A live debate motion any direction you take it.',
    background: 'Meta, TikTok, X, and YouTube together reach over 4 billion accounts. Their ranking systems are trained on engagement signals (time on page, reshares, replies) which are correlated with outrage and tribal content, not accuracy. The EU\'s Digital Services Act now requires VLOPs to offer a non-algorithmic feed option; the US has no equivalent.\n\nThe 2024 NYU Center for Social Media and Politics study found that users on chronological feeds saw 23% less political content overall but reported higher trust in the platform. The "fragmentation" critique sits on real data: cross-platform exposure to political opinions has dropped sharply since 2016, when algorithmic ranking became dominant. The case against the ban is that the engagement-metric incentive operates regardless of ranking — without algorithms, platforms would optimize the same metrics through editorial choices.',
    govHint: 'Outrage compounds; chronological feeds restore epistemic baseline.',
    oppHint: 'Banning algorithmic ranking returns us to the engagement metrics it replaced, just slower.',
  },
  {
    motion: 'This House would tax wealth above $100M at 2% annually.',
    domain: 'econ',
    frame: 'Wealth taxes have been tried in 12 OECD countries; 9 of them repealed them. Yet the policy keeps re-emerging in U.S. presidential platforms. The empirics are messier than either side admits.',
    background: 'France ran a wealth tax (ISF) from 1989 to 2017. Studies by Eric Pichet and the IMF found it raised roughly €4 billion annually but cost the French economy an estimated €125 billion in cumulative capital flight and reduced investment. Norway and Switzerland still have wealth taxes that perform much better, largely because both are small countries with strong enforcement and limited exit options for citizens.\n\nThe US version has a different shape. Senators Warren and Sanders have proposed thresholds at $50M or $100M with rates between 1% and 3%. The University of California study estimated the Warren plan would raise $2.75 trillion over a decade. Critics including former Treasury Secretary Lawrence Summers argue the valuation problem (how do you mark to market a 5% stake in SpaceX?) makes the rate effectively unenforceable. Defenders point out that estate taxes solve identical problems annually.',
    govHint: 'Concentrated capital distorts political markets; an annual tax restores accountability.',
    oppHint: 'Wealth fled every European wealth tax; the U.S. would lose more revenue than it raised.',
  },
  {
    motion: 'This House would require AI-generated content to be visibly labeled.',
    domain: 'tech',
    frame: 'Generative AI now produces tens of millions of images and articles daily. Without disclosure, users cannot tell what they are consuming. With disclosure, every output carries a friction tax that erodes the technology\'s value.',
    background: 'The EU AI Act, effective 2026, requires watermarking of synthetic media and clear disclosure of chatbots. California\'s AB 730 mandates labels on AI-altered political content. Adobe, Microsoft, and OpenAI co-developed C2PA, a cryptographic provenance standard that embeds origin data in image metadata. None of these regimes survive a single screenshot, which strips the metadata.\n\nThe scale challenge: an estimated 30% of new web content in 2025 is at least partially AI-generated, per a Europol study. Mandatory labeling at that volume creates a definitional problem (what counts as "AI-generated" when a human edits an AI draft?) and an enforcement problem (most platforms cannot verify watermarks at scale). The strongest case for the policy is that labels work for the use case that matters most — explicit deepfakes and impersonation — even if they fail for the marginal case of "human plus AI assist."',
    govHint: 'Asymmetric information markets always favor the producer; labeling restores consumer choice.',
    oppHint: 'Mandatory labels create false confidence in what is unlabeled and discriminate against legitimate AI use.',
  },
  {
    motion: 'This House would scrap legacy admissions at universities.',
    domain: 'edu',
    frame: 'Legacy preferences give children of alumni a meaningful boost at elite U.S. universities. After the 2023 affirmative action ruling, the practice faces renewed scrutiny. Defenders cite donor relationships; critics cite hereditary privilege.',
    background: 'Harvard\'s own data, released during the affirmative action litigation, showed legacy applicants admitted at 33% versus 6% overall. Princeton, Yale, and Stanford report similar ratios. The Department of Education opened a Title VI investigation into Harvard\'s legacy preferences in 2023. Colorado, Virginia, and Maryland have already banned legacy admissions at public universities.\n\nThe donor argument has empirical support — a 2010 study by Chad Coffman found that legacy preferences correlate with a 7-8% bump in annual alumni giving at the universities that use them. The counterargument: that effect is concentrated at the top 20 schools, where endowments already exceed the GDP of medium-sized countries. The first-generation student access case lands hardest at schools where it is hardest to make it land: the elite institutions whose admissions practices set the national signal.',
    govHint: 'Inherited advantage in education is anti-meritocratic by definition.',
    oppHint: 'Legacy admits fund the scholarships that admit first-gen students; the math is uncomfortable but real.',
  },
  {
    motion: 'This House would let people sell one of their kidneys.',
    domain: 'ethics',
    frame: 'Iran is the only country with a regulated kidney market. The waitlist for transplants there is near zero. Critics argue the policy commodifies the poor; defenders argue prohibition leaves people to die.',
    background: 'About 100,000 Americans are on the kidney transplant waitlist; 13 die each day. Iran\'s regulated market, established in 1988, eliminated the country\'s waitlist within 11 years. Donors are compensated roughly $4,500 plus a year of insurance, with the government as broker. Studies by Sigrid Fry-Revere have found donor regret rates and health outcomes comparable to altruistic donors in the US.\n\nThe coercion critique has real teeth: 78% of Iranian donors in a 2014 survey reported financial distress as the primary motivation, and donor demographics skew heavily toward the bottom income quintile. The middle path — Singapore-style "rewarded gifting" with non-cash benefits like priority in future organ allocation, paid leave, and lifetime health insurance — has been proposed by Sally Satel and others. The motion as stated puts this on a binary, but most policy proposals sit on a spectrum between current prohibition and full markets.',
    govHint: 'A regulated market with price floors saves more lives than prohibition.',
    oppHint: 'Voluntary in the abstract is coerced in practice; the poor will be the donor class.',
  },
  {
    motion: 'This House would extend voting rights to 16-year-olds.',
    domain: 'civic',
    frame: 'Austria, Scotland, and Brazil all allow voting at 16. Turnout data is mixed; civic-engagement research is split. The U.S. debate has now moved beyond the academic question into actual ballot measures.',
    background: 'Austria lowered the age to 16 in 2007. Subsequent turnout data has been mixed: 16-17 year-olds turned out slightly higher than 18-21 year-olds in the first election but the gap narrowed over time. Scotland\'s 2014 independence referendum saw 75% turnout among 16-17 year-olds, higher than any other age group under 35. Eight US cities now allow 16-year-olds to vote in municipal elections, with Takoma Park, Maryland (2013) as the longest-running example.\n\nThe development-psychology case cuts both ways. Research by Laurence Steinberg distinguishes "cold cognition" (deliberative, well-developed by 16) from "hot cognition" (impulsive, immature until early 20s). Voting, the argument goes, is a cold-cognition task. But the same research is used to argue against trying 16-year-olds as adults in criminal cases — and you cannot consistently say the brain is ready for one civic responsibility and not the other.',
    govHint: 'Civic habits are formed in adolescence; voting earlier creates a more durable voter.',
    oppHint: 'We do not entrust 16-year-olds with contracts, juries, or the draft for a reason.',
  },
  {
    motion: 'This House would ban private jets.',
    domain: 'env',
    frame: 'A private jet emits per-passenger CO2 at roughly 20 to 50 times the rate of commercial flight. Defenders argue private aviation drives 0.04 percent of global emissions and the ban is symbolic. Critics argue symbolism is the point.',
    background: 'Private aviation released roughly 37 million tonnes of CO2 in 2023 per the Transport & Environment NGO. That is 0.04% of global emissions but ~10x the per-flight footprint of commercial aviation. France has restricted short-haul flights when a rail alternative exists; the Netherlands has limited private jet movements at Schiphol. Neither has banned private jets outright.\n\nThe symbolic-policy argument is doing more work than either side usually admits. The Yale Program on Climate Change Communication finds visible-emitter punishment correlates strongly with public support for broader climate policy. The counterargument is that climate norms built on resentment of the rich are fragile — they collapse the moment economic conditions shift the public mood, which is why carbon pricing has outlasted every "ban this thing" headline of the last decade.',
    govHint: 'Climate norms need a high-end target; jets are the most visible carbon excess.',
    oppHint: 'Banning the most-disliked emitter buys nothing in tonnage and corrodes climate seriousness.',
  },
  {
    motion: 'This House would lift the ban on commercial surrogacy in India.',
    domain: 'ethics',
    frame: 'India banned commercial surrogacy in 2021 after a decade as the global hub. The ban removed an income source for thousands of women; it also closed off practices critics called exploitative. Two real harms in tension.',
    background: 'India\'s commercial surrogacy market was estimated at $400-500M annually before the 2015 partial ban and 2021 full ban. Anand, Gujarat became known as the "surrogacy capital of the world" with the Akanksha Hospital running over 1,000 deliveries. Most surrogates earned ₹3-5 lakh per delivery, equivalent to 5-7 years of typical agricultural wages.\n\nPost-ban, demand shifted to less-regulated jurisdictions: Mexico, Cyprus, Georgia, and increasingly Ukraine before 2022. Indian women still take work in those markets, with fewer legal protections. The Indian regulation framework now permits only altruistic surrogacy by close relatives — a narrowing that critics argue eliminates the practice in name but pushes it underground. Defenders point to the 2010 Anita Pant case, where a surrogate died from postpartum complications without contractually-required medical follow-up.',
    govHint: 'Prohibition pushes the practice underground without reducing demand; regulation is safer.',
    oppHint: 'The Indian pre-ban market did not produce informed consent at the rates regulation requires.',
  },
  {
    motion: 'This House would require every social media platform to provide an algorithmic-feed off switch.',
    domain: 'tech',
    frame: 'The EU\'s Digital Services Act mandates this for VLOPs. The U.S. has no equivalent. The toggle is technically trivial; the platform incentives against it are not.',
    background: 'The DSA, effective for VLOPs in 2024, requires Meta, TikTok, X, and others to offer an opt-out from algorithmic ranking. Compliance data shows under 5% of EU users have switched. Instagram already offers "Following" and "Favorites" feeds; engagement on those feeds drops by 40-60% versus the default. The toggle exists; the question is whether mandatory disclosure of its existence (currently buried in settings) would meaningfully change adoption — or whether the platforms have already engineered the friction that makes the toggle theoretical.',
    govHint: 'Default-on engagement algorithms are the addiction layer; opt-out is the minimum dignity.',
    oppHint: 'A toggle nobody uses is regulatory theater; the binding mechanism is open competition for attention.',
  },
  {
    motion: 'This House would replace the SAT with portfolio-based admissions.',
    domain: 'edu',
    frame: 'Test-optional policies have not improved diversity at top schools as much as advocates predicted. Portfolios reward students with the resources to build them. Both directions face uncomfortable evidence.',
    background: 'Over 1,800 US colleges went test-optional during the pandemic. By 2024, MIT, Yale, Brown, and Dartmouth had reinstated requirements after their own research showed standardized scores predict college performance better than high school GPA — and crucially, they predict it equally well across income brackets when contextualized. The Opportunity Insights study by Raj Chetty showed test scores actually surface high-potential low-income applicants who get filtered out by extracurricular-heavy admissions, because portfolios reward students with the time and adult support to build them.',
    govHint: 'Standardized tests measure tutoring access more than ability.',
    oppHint: 'Portfolio admissions measure adult mentorship even more than tests measure tutoring.',
  },
  {
    motion: 'This House would prohibit corporate ownership of single-family homes.',
    domain: 'econ',
    frame: 'Institutional investors now own 3 to 5 percent of U.S. single-family rentals. In specific metros (Atlanta, Phoenix, Charlotte) the share is 15 to 25 percent. The macro impact on prices is disputed; the micro impact on renters is not.',
    background: 'Invitation Homes (founded by Blackstone), Tricon, and AMH together own over 250,000 single-family rentals. A 2023 University of Pennsylvania study found their entry into a metro correlates with a 2-4% price bump in the first 18 months, but no measurable bump after that — the effect saturates. The eviction filings story is sharper: institutional landlords file 14-20% more eviction notices per occupied unit than mom-and-pop landlords in the same markets, per Brookings.',
    govHint: 'Housing is the cornerstone of household wealth; corporate ownership extracts that cornerstone.',
    oppHint: 'Banning institutional buyers shrinks the rental supply that renters depend on.',
  },
  {
    motion: 'This House would mandate a four-day work week.',
    domain: 'econ',
    frame: 'The largest pilot to date, in the UK, found productivity neutral and worker satisfaction sharply higher. Critics point out that pilots self-select for firms whose work suits the schedule. The policy question is whether mandate makes sense at all.',
    background: 'The 2022 UK pilot ran for six months across 61 firms with 2,900 workers. 56 of the 61 firms made the change permanent. Revenue rose 1.4% on average; sick days fell by two-thirds. Iceland\'s public-sector trial (2015-2019) showed similar results across 2,500 workers. Spain and Portugal have launched government-subsidized national pilots. Belgium passed a "right to request" 4-day week in 2022 (working the same hours in compressed days), distinct from a true 4-day mandate.',
    govHint: 'Productivity is now measured per hour, not per week; the workweek lags the data.',
    oppHint: 'A mandate flattens differences across industries where the four-day week is not feasible.',
  },
  {
    motion: 'This House would ban facial recognition in public spaces.',
    domain: 'tech',
    frame: 'San Francisco, Portland, and Boston have banned police use. China and the UK have expanded use. The technology improves faster than the policy debate around it.',
    background: 'NIST\'s 2024 vendor test showed the top facial-recognition systems crossing 99% accuracy across demographics — up from a 10-100x error rate on darker-skinned faces in the 2018 benchmarks. The accuracy gap that fueled the original ban movement has narrowed. London\'s Metropolitan Police live-deployment, expanded in 2023, has produced 540 arrests against 3.4 million scans. The civil-liberties critique no longer rests on accuracy; it rests on what continuous identification of citizens in public means for what privacy is.',
    govHint: 'Continuous identification in public is a categorical change in what privacy means.',
    oppHint: 'Bans push the practice to private actors with worse accountability than police.',
  },
  {
    motion: 'This House would let cities set their own immigration policy.',
    domain: 'civic',
    frame: 'Sanctuary cities already partially do this in practice. Federalists argue policy coherence demands a single national stance; localists argue cities bear the costs and benefits and should decide.',
    background: 'Roughly 600 US jurisdictions have "sanctuary" policies limiting cooperation with ICE detainer requests, per the Center for Immigration Studies. The Supreme Court has held that immigration enforcement is a federal function (Arizona v. United States, 2012) but cities are not required to use their police as federal agents. Toronto, Berlin, and Barcelona have gone further with municipal ID cards that grant city services regardless of federal status. The federalism question moves from "are sanctuary cities allowed" to "can a city actively grant a status the federal government does not recognize."',
    govHint: 'Cities know their labor markets, schools, and capacity; one-size policy fails both ends.',
    oppHint: 'Federalizing immigration was a solved problem; un-federalizing it is a rule-of-law problem.',
  },
  {
    motion: 'This House would require all teenagers to learn a second language to graduate high school.',
    domain: 'edu',
    frame: 'The U.S. is one of the few rich countries where a second language is not the norm. The cognitive case is well-documented. The opportunity-cost case is rarely engaged honestly.',
    background: '20% of US K-12 students take a world-language class, compared to 92% in Europe. State-level mandates exist in New Jersey, Texas, and California with mixed enforcement. Proficiency outcomes are weak: the ACTFL benchmarks show only 1 in 10 graduates of US high-school Spanish programs reach intermediate-mid speaking proficiency. The cognitive-benefits literature (Bialystok, Diamond) has held up for fluent bilinguals; the same effects do not appear for students who study a language for two years and never use it.',
    govHint: 'Monolingualism is a competitive disadvantage in every market the U.S. competes in.',
    oppHint: 'A required course taught poorly produces resentment, not fluency; the policy fails its own goal.',
  },
  {
    motion: 'This House would treat repeated drunk driving as a violent offense.',
    domain: 'ethics',
    frame: 'Drunk-driving fatalities have plateaued after decades of decline. Existing penalties are clearly not deterring the repeat-offender population. Critics warn that reclassification is a punishment-creep slippery slope.',
    background: 'NHTSA data: 13,500 US drunk-driving deaths in 2022, up 14% from 2019. About 30% of fatal DUI crashes involve drivers with at least one prior DUI conviction. The "repeat offender" population is concentrated — fewer than 2% of all licensed drivers — and that subset is responsible for a majority of fatal incidents. Idaho and Tennessee already classify a fourth DUI as a felony with mandatory prison; the deterrence data is mixed because the same population responds poorly to incarceration generally.',
    govHint: 'A 0.20 BAC driver on a third offense is choosing to point a weapon at strangers.',
    oppHint: 'Treating impaired choice as intentional violence erases the line that makes intent meaningful.',
  },
  {
    motion: 'This House would require ranked-choice voting in all U.S. federal elections.',
    domain: 'civic',
    frame: 'Maine and Alaska use RCV statewide. Outcomes diverge from what plurality would have produced. The procedural-fairness case is strong; the legitimacy-perception case is messier.',
    background: 'Maine adopted RCV in 2018; Alaska in 2022. New York City uses it for mayoral primaries. The Alaska 2022 special election sent Mary Peltola (D) to Congress in a 50-50 state — Sarah Palin would have won under plurality. Polling by FairVote shows 60% voter approval after experiencing RCV, but a 2024 Massachusetts ballot measure to adopt it lost decisively. The pattern: voters who have used it like it; voters who have not are suspicious of it.',
    govHint: 'Plurality voting forces a two-party duopoly that suppresses real choice.',
    oppHint: 'RCV results require explanation; democratic legitimacy needs results that explain themselves.',
  },
  {
    motion: 'This House would ban targeted political advertising online.',
    domain: 'tech',
    frame: 'The EU restricts cross-context behavioral ads for political content; the U.S. does not. Defenders of restriction cite Cambridge Analytica; opponents cite incumbent protection.',
    background: 'The EU\'s 2024 Transparency and Targeting of Political Advertising regulation requires platforms to allow micro-targeting only on data the user has explicitly consented to share for political purposes — effectively shutting down behavioral ads. Brazil banned political micro-targeting for the 2022 election. US campaigns spent roughly $9 billion on digital ads in 2024 per AdImpact, with the targeting capacity that built the Facebook 2016 controversy still largely intact. A ban would compress political spending toward broadcast and small-donor email, both of which currently favor incumbents.',
    govHint: 'Micro-targeted ads atomize public discourse into millions of private conversations no one can audit.',
    oppHint: 'Restrictions help the candidates with built-in name recognition and hurt outsiders.',
  },
  {
    motion: 'This House would prioritize reducing economic inequality over reducing the federal deficit.',
    domain: 'econ',
    frame: 'The trade-off is real: deficit-funded transfers can reduce inequality short-term but raise long-term interest costs that crowd out future transfers. Either side, the empirics matter.',
    background: 'The US federal deficit hit $1.8 trillion in fiscal 2024, with interest payments now larger than defense spending. Top 1% wealth share has risen from 24% in 1980 to 32% in 2024 per Federal Reserve data. CBO projects that under current law, debt-service costs crowd out about $300 billion of discretionary spending annually by 2034. Stiglitz and Krugman argue inequality reduction generates growth that pays down deficits; Summers and Furman argue interest-rate dynamics now make that math much harder than in the 1990s.',
    govHint: 'Inequality is the binding constraint on growth at this level; deficits are not.',
    oppHint: 'Inequality reduction funded by deficit raises the cost of the safety net it claims to expand.',
  },
  {
    motion: 'This House regrets the rise of remote-first work.',
    domain: 'econ',
    frame: 'Five years post-pandemic the productivity data is contested, the city-revenue data is not. The career-progression data for early-career workers is the quietest part of the debate and probably the most important.',
    background: 'About 22% of US workdays were remote in 2024 per WFH Research, down from a peak of 40% but ten times the pre-pandemic rate. San Francisco office values have dropped 60%+ from 2019 peaks; transit ridership in major US cities sits at 60-75% of pre-pandemic levels. The productivity literature has split: Bloom\'s Stanford studies find a slight remote-positive in repetitive work, slight remote-negative in creative work. The career-progression study by Emanuel and Harrington (2023) showed remote engineers got 50% less feedback from senior engineers and were promoted at 12% lower rates over 2 years.',
    govHint: 'Remote work has hollowed mentorship and tilted careers toward the already-established.',
    oppHint: 'Remote work freed millions of workers from commute, geography, and the office class system.',
  },
  {
    motion: 'This House would mandate open-source release of any AI model trained on public-internet data.',
    domain: 'tech',
    frame: 'GPT-4 and Claude were trained on text that humans wrote and posted publicly. Defenders of mandatory release argue the inputs were collective, so the outputs should be. Critics argue the compute and engineering were not collective.',
    background: 'OpenAI, Anthropic, and Google DeepMind have all trained frontier models on Common Crawl, Reddit, Wikipedia, and books scraped from the web — content humans created and shared without opting into corporate training. The NYT v. OpenAI lawsuit (2023) and the Authors Guild suits are testing the copyright question. Meanwhile Meta\'s Llama, Mistral, and DeepSeek have shipped near-frontier open-weights models, demonstrating the technical possibility. The compute argument has teeth: training GPT-4 reportedly cost over $100M; open-sourcing the weights doesn\'t open-source the cluster you need to fine-tune them. The strongest version of the policy targets weights but not training infrastructure — closer to a compulsory-license regime than a true open-source mandate.\n\nA mandatory release regime would face an immediate jurisdictional problem: the major labs are all US-based but operate globally, while open-source-friendly governments (France\'s Mistral push, UAE\'s Falcon program) have no leverage over Anthropic or OpenAI. The EU AI Act already imposes transparency obligations on general-purpose AI models; full open-source has not been seriously proposed by any major regulator. The closest analogue is the FDA\'s clinical-trial disclosure regime — pharma companies must publish trial protocols and outcomes but not the underlying chemistry of the molecule.',
    govHint: 'Closed AI funded by public data privatizes a commons that was never sold.',
    oppHint: 'Open-sourcing frontier models without compute access just hands capability to authoritarians.',
  },
  {
    motion: 'This House would require all U.S. high schools to teach a personal-finance course.',
    domain: 'edu',
    frame: 'Twenty-four states have implemented this in the last decade. Test-score data on financial literacy went up modestly; actual savings rates and debt outcomes did not move.',
    background: 'Tim Ranzetta\'s Next Gen Personal Finance tracker counts 26 US states with personal-finance graduation requirements as of 2024, up from 5 in 2018. The largest study (Urban et al., 2022) compared credit scores across state cohorts pre- and post-mandate. Result: a 5-12 point improvement in credit score by age 22, and a measurable reduction in payday-loan use. Outcomes on retirement saving and student-loan default were null. The course works for the specific decisions students make right after graduation; it does not survive contact with adult-life complexity.',
    govHint: 'Asymmetric financial information lets predatory lenders extract from people who don\'t know the math.',
    oppHint: 'The course tests well, doesn\'t change behavior, and crowds out civics or math that does.',
  },
  {
    motion: 'This House regrets the legalization of marijuana.',
    domain: 'ethics',
    frame: 'Twenty-four states now allow recreational use. Adolescent use rates have not surged as critics predicted, but ER visits for high-potency products have. The harm is real and unevenly distributed.',
    background: 'Colorado was the first to legalize in 2014. National Youth Risk Behavior surveys show adolescent past-30-day use is essentially flat (15-18%) across the legalization period. Adult ER visits for cannabis hyperemesis and acute psychosis have risen 3-5x since 2014, driven almost entirely by high-potency concentrates (60%+ THC) that did not exist in the pre-legalization black market. The criminal-justice case is strongest: cannabis arrests fell from 750,000 in 2013 to under 230,000 in 2022, with the disparity-in-arrest rate dropping in legalized states but not vanishing.',
    govHint: 'Commercial legalization gave a multibillion-dollar industry incentives to push potency.',
    oppHint: 'Criminalization\'s harms were concentrated, certain, and racially patterned; legalization\'s harms are diffuse and partially mitigable.',
  },
  {
    motion: 'This House would phase out the United Nations Security Council veto.',
    domain: 'civic',
    frame: 'Russia\'s 2022 invasion of Ukraine and the 2023 Gaza war both produced UNSC paralysis. The veto was the price of getting the great powers into the UN in 1945. Whether it\'s still the price in 2026 is the live question.',
    background: 'The P5 veto has been used 320+ times since 1945, with Russia (formerly USSR) accounting for over half. The 2022 General Assembly Resolution 76/262 (the "veto initiative") requires automatic GA debate within 10 working days of any veto — a transparency mechanism that does not remove the veto itself. The Uniting for Consensus group (Italy, Pakistan, Mexico, others) supports veto-elimination; the G4 (Germany, Japan, India, Brazil) want UNSC expansion with veto rights for new permanent members. The institutional question of who actually loses if the UNSC becomes irrelevant: every power except the P5.',
    govHint: 'The veto turns the UNSC into a forum that ratifies what the great powers were going to do anyway.',
    oppHint: 'No-veto UNSC = no great-power UNSC = irrelevance, like the League of Nations.',
  },
  {
    motion: 'This House would require new buildings to be carbon-neutral by 2030.',
    domain: 'env',
    frame: 'New York, California, and the EU have layered versions of this rule. Construction-cost data shows real impact on housing supply; emission data shows real impact on building-sector carbon. Both effects are large.',
    background: 'Buildings account for roughly 40% of global energy-related emissions per the IEA. New York City\'s Local Law 97, effective 2024, phases in emission caps with steep penalties for non-compliance. California Title 24 requires solar on most new construction. The EU\'s Energy Performance of Buildings Directive mandates zero-emission new construction by 2030. The cost data is contested: industry estimates 15-30% construction-cost premium; UC Berkeley CLEE finds 5-8% with payback within 7 years through energy savings. Both figures land in the middle of a housing-affordability crisis.',
    govHint: 'Building stock locks in emissions for 60 years; new construction is the cheapest place to decarbonize.',
    oppHint: 'A mandate during a housing crisis adds 10-20 percent to construction costs and worsens the supply problem.',
  },
  {
    motion: 'This House would ban gain-of-function research on potential pandemic pathogens.',
    domain: 'ethics',
    frame: 'The COVID-19 origin debate made this question central. Defenders of GoF research argue it accelerates vaccine development; critics argue the downside scenario is civilizational.',
    background: 'The 2014 US moratorium paused GoF research on influenza, SARS, and MERS; it lifted in 2017 under stricter review. The Wuhan Institute of Virology controversy reignited the debate after 2020 with no resolution on lab-leak likelihood. Marc Lipsitch (Harvard) has led the anti-GoF coalition, arguing a single accidental release at BSL-3 or BSL-4 could rival a natural pandemic. Defenders point to GoF\'s role in mapping spike-protein behavior — useful for mRNA vaccine development. A ban shifts the research to less-regulated jurisdictions; the question is whether less research-but-shifted is safer than more research-with-oversight.',
    govHint: 'Asymmetric risk: a single lab leak could kill millions; the marginal vaccine benefit is replaceable.',
    oppHint: 'A ban shifts the research to less-regulated jurisdictions and forfeits the scientific dividend.',
  },
  {
    motion: 'This House would lower the legal voting age in U.S. national elections to 16.',
    domain: 'civic',
    frame: 'Austria, Scotland, and Brazil already do this. Empirical turnout data is mixed; civic-engagement researchers are split. The U.S. debate has moved from academic to actual ballot measures.',
    background: 'Note: this motion overlaps with the broader "extend voting rights to 16-year-olds" motion in the bank. The narrower framing here (US national elections specifically) raises a 26th-Amendment question — the amendment set the floor at 18, not the ceiling. Congress could in theory pass a statute lowering the federal voting age, but the constitutional path is unclear after Oregon v. Mitchell (1970). Practically, every recent expansion has happened at the municipal level: Takoma Park MD (2013), Berkeley CA (2016 for school board only), Oakland CA (2022).',
    govHint: 'Voting habits form in adolescence; voting earlier creates a more durable voter.',
    oppHint: 'We bar 16-year-olds from contracts, juries, and the draft for related reasons.',
  },
  {
    motion: 'This House would replace national militaries with a standing UN force.',
    domain: 'civic',
    frame: 'Classic IR motion that keeps re-emerging because the underlying tension never resolves: nation-state sovereignty vs. collective-security efficiency.',
    background: 'The UN currently fields about 70,000 peacekeepers across 11 missions, contributed by member states under blue-helmet rotation. There is no standing UN military force; the Military Staff Committee envisioned in Article 47 of the UN Charter has never functioned as designed. Brian Urquhart proposed a UN rapid-reaction force in the 1990s; the recommendation died in the Security Council. The structural problem is recursive: a standing force needs funding from member states, and those member states want their own military or none at all.',
    govHint: 'National militaries are duplicative, escalatory, and politically captured by domestic factions.',
    oppHint: 'A monopoly on legitimate force without a constituency to check it is the definition of tyranny.',
  },
  {
    motion: 'This House would require all candidates for high office to release a decade of tax returns.',
    domain: 'civic',
    frame: 'Norm-violation by recent U.S. presidents reopened the question of whether the precedent needs to be legislated. Other democracies have done both — mandated, and trusted-norm.',
    background: 'Every US presidential candidate from Nixon (1973) to Romney (2012) voluntarily released tax returns. Trump broke the norm in 2016 and the precedent has not reset. California passed AB 690 in 2019 requiring presidential candidates to release five years of returns to appear on the primary ballot; the Supreme Court struck it down 9-0 (Patterson v. Padilla, 2020). At the federal level only constitutional amendment, not statute, could mandate disclosure. Other democracies (Norway, Sweden, Finland) publish all citizens\' tax records — a different model entirely.',
    govHint: 'Tax returns are the cheapest available disclosure of conflicts of interest at scale.',
    oppHint: 'Mandatory disclosure pushes candidates toward complex shielding structures, getting the OPPOSITE of transparency.',
  },
  {
    motion: 'This House regrets the dominance of streaming services in music.',
    domain: 'tech',
    frame: 'Spotify and Apple Music control how 600 million people discover and listen to music. Artists earn fractions of a cent per stream. Listeners get unparalleled access. Both are true.',
    background: 'Spotify pays out roughly $0.003 per stream after the label cut, meaning an artist needs ~250,000 streams/month to earn US minimum wage. Pre-streaming, the same listener at $15/month bought a CD every few months; that revenue stream is now distributed across every artist they listen to. Live touring revenue, merch, and Patreon-style direct support have grown as compensating channels but only for the top 10-20% of artists. The discovery side genuinely improved: 60% of streams now come from algorithmic playlists where the artist gets exposure they could never have bought.',
    govHint: 'Streaming flattens the economic ladder for working musicians; only the top 1 percent earn a sustainable income.',
    oppHint: 'Pre-streaming, even fewer artists made a living. Streaming widened the base, narrowed the top.',
  },
  {
    motion: 'This House would ban political advertising in the 60 days before an election.',
    domain: 'civic',
    frame: 'Brazil, France, and the UK already restrict election-period advertising in various ways. The U.S. has the loosest regime in the OECD. Whether the U.S. exceptionalism is constitutional or just contingent is the live question.',
    background: 'France bans all paid political ads on broadcast media for the 6 months before an election. The UK has restricted broadcast political ads since 1955 (party election broadcasts are free, allotted, and equally distributed). Brazil bans paid ads on TV and radio. The US protects political ads under Citizens United v. FEC (2010) and earlier First Amendment doctrine; a 60-day total ban would almost certainly be struck down. The constitutional carve-out is narrow — disclaimers, contribution limits, and platform-level voluntary policies (which Meta and Google have used) are the practical regulatory levers.',
    govHint: 'The closing ad blitz favors money over deliberation and is when most disinformation lands.',
    oppHint: 'A 60-day blackout entrenches incumbents who already have name recognition and disadvantages outsiders.',
  },
  {
    motion: 'This House would require ride-share drivers to be classified as employees.',
    domain: 'econ',
    frame: 'California Prop 22, the EU\'s Platform Work Directive, and the UK Supreme Court\'s Uber ruling are pulling in different directions. Drivers themselves are split on which they prefer.',
    background: 'The UK Supreme Court ruled unanimously in 2021 that Uber drivers are "workers" entitled to minimum wage and holiday pay. California voters passed Prop 22 in 2020 (with $200M+ in campaign spending from Uber/Lyft/DoorDash) keeping drivers as contractors but adding earnings floors. The EU\'s 2024 Platform Work Directive presumes platform workers are employees unless the company proves otherwise. Driver surveys consistently find a majority prefer the flexibility of contractor status, but the same surveys find a majority want guaranteed minimum hourly earnings. Both reforms can be true at once; the legal frameworks usually force a choice.',
    govHint: 'The gig classification was engineered to externalize labor costs onto workers who can\'t bargain.',
    oppHint: 'Mandatory employee classification ends ride-share availability outside dense cities; the drivers who lose income are the ones who relied on flexibility.',
  },
  {
    motion: 'This House would prohibit publicly traded companies from buying back their own stock.',
    domain: 'econ',
    frame: 'Buybacks were illegal in the U.S. until 1982. They are now the dominant form of shareholder return. Defenders argue they\'re tax-efficient capital return; critics argue they enrich executives at the expense of long-term investment.',
    background: 'SEC Rule 10b-18 legalized open-market buybacks in 1982. S&P 500 buybacks hit $900 billion in 2023, exceeding dividends. The Inflation Reduction Act introduced a 1% excise tax on buybacks in 2023; Biden\'s proposed quadrupling failed in Congress. Lazonick\'s research at UMass Lowell argues buybacks have transferred trillions from R&D and worker wages to executives whose stock comp is correlated with EPS. Defenders point out that capital not returned through buybacks doesn\'t reliably go to R&D — it often goes to bad acquisitions or sits as low-yield cash.',
    govHint: 'Buybacks signal "we have no better use for capital" and reward stock-comp executives for the signal.',
    oppHint: 'Banning buybacks pushes the same capital return into less-efficient channels like dividends and special distributions.',
  },
  {
    motion: 'This House would prioritize content moderation by human reviewers over algorithmic moderation.',
    domain: 'tech',
    frame: 'Meta\'s human-reviewer staffing has dropped by half since 2022. Trust-and-safety teams across the major platforms have been gutted. The work moved to AI; the failure modes shifted accordingly.',
    background: 'Meta laid off roughly 21,000 employees in 2022-2023, with trust-and-safety teams disproportionately hit. X cut over 50% of its T&S workforce after the Musk acquisition. The AI-moderation systems now handling that volume have measurable strengths (extremism flagging) and measurable weaknesses (context-dependent harassment, sarcasm, breaking-news adjudication). The human-moderation literature also documents real harm: Sama and Genpact contractors in Kenya and the Philippines have reported PTSD-level trauma from reviewing graphic content for $1.50-3/hour. Both moderation modes have costs the other does not.',
    govHint: 'Algorithmic moderation fails at context — sarcasm, satire, breaking news — at precisely the moments stakes are highest.',
    oppHint: 'Human moderation is unscalable, expensive, and traumatizing for the moderators; AI is the only path that respects worker dignity AND throughput.',
  },
  {
    motion: 'This House would treat addiction as a medical condition, not a moral failing.',
    domain: 'ethics',
    frame: 'The medical framing has dominated public-health discourse for two decades. Opioid-deaths data and the policy response since 2017 has tested it. Where the framing helps and where it hurts is now an empirical question.',
    background: 'The American Society of Addiction Medicine formally classified addiction as a brain disease in 2011. Insurance coverage for treatment expanded after the 2008 Mental Health Parity Act. US overdose deaths still rose from 47,000 in 2014 to 108,000 in 2022 driven by fentanyl. The medical-framing critique now comes from both directions: Sally Satel argues exclusive medicalization removes the patient agency that recovery requires; the harm-reduction left argues medicalization still pathologizes choice. Portugal\'s 2001 decriminalization model is the cleanest test case — overdose deaths there fell 80% over 15 years.',
    govHint: 'Criminalizing addiction increases overdose deaths, removes the social supports that aid recovery, and racially distorts enforcement.',
    oppHint: 'A purely medical frame removes the agency and responsibility that recovery programs require to actually work.',
  },
  {
    motion: 'This House would ban the use of AI in K-12 grading.',
    domain: 'edu',
    frame: 'Algorithmic essay grading has been piloted in three U.S. states. Results are mixed: faster turnaround, more consistent within-grader scoring, but the systems inherit and amplify their training-data biases.',
    background: 'Utah and Ohio piloted AI essay grading on state writing assessments in 2022-2023. The systems (ETS\'s e-rater, MI Write) match human inter-rater reliability around 0.85-0.92 for the kind of structured writing on standardized tests but underperform on creative or argumentative prompts. The 2024 Texas STAAR controversy — where students discovered they could trick the AI grader with keyword stuffing — exposed the kind of failure mode standardized testing has always had at scale, now executed faster. Human grading has its own consistency problems; the comparison is not between AI and a perfect grader.',
    govHint: 'Children\'s assessment data is too sensitive to outsource to a black box that schools cannot audit.',
    oppHint: 'Human graders are not consistent, not fast, and not unbiased either. The AI tradeoff has to be measured, not assumed.',
  },
  {
    motion: 'This House would require all news organizations to disclose anonymous-source agreements.',
    domain: 'civic',
    frame: 'The Pentagon Papers, Watergate, and most modern investigative journalism rested on anonymous sourcing. The line between protecting whistleblowers and enabling fabrication is where the debate lives.',
    background: 'Most US states have shield laws protecting reporter-source confidentiality, but the federal government has none. The NYT, WaPo, and other major outlets have internal standards (typically: two independent sources for anonymous-source attribution) that journalism schools teach but readers cannot verify. The 2003 Jayson Blair scandal and the 2014 UVA rape-case retraction at Rolling Stone are repeatedly cited as failures of internal review. Mandatory disclosure would mean filing source agreements with a regulator — a step every major democracy has explicitly rejected as state intrusion into the press.',
    govHint: 'Anonymous sourcing has eroded into a convention reporters use to launder speculation as fact.',
    oppHint: 'Mandatory disclosure ends whistleblowing in any high-stakes domain; the chilling effect is the point of the policy and an own goal.',
  },
  {
    motion: 'This House would ban single-use plastics globally.',
    domain: 'env',
    frame: 'The EU\'s 2021 ban has measurably reduced beach litter. India\'s rollout has had patchy enforcement. The global treaty negotiations are stuck on which plastics to include.',
    background: 'The EU\'s 2021 Single-Use Plastics Directive banned 10 of the most-littered items (cutlery, plates, straws, cotton buds, polystyrene containers). Beach-litter audits show a 40-50% reduction in those specific items in the first two years. India announced a similar ban in 2022 with patchy enforcement at the state level. The UN Global Plastics Treaty negotiations, which started in 2022 and are scheduled to conclude in 2026, are deadlocked between a production-cap coalition (Norway, Rwanda, EU) and a recycling-focused coalition (US, Saudi Arabia, China).',
    govHint: 'Single-use plastics are a 70-year experiment that has demonstrably failed the ocean.',
    oppHint: 'A blanket ban without parallel investment in alternatives shifts the externality to glass production and food spoilage, both of which are worse on different axes.',
  },
  {
    motion: 'This House would require children to obtain parental consent to use social media until age 16.',
    domain: 'tech',
    frame: 'Australia legislated this in 2024. The U.S. surgeon general recommended a similar policy in 2023. The COPPA framework is now widely seen as insufficient given the data showing adolescent mental-health correlations.',
    background: 'Australia\'s 2024 law mandates platforms enforce a minimum age of 16 with substantial fines for non-compliance. France passed a softer 15-year minimum in 2023. US states Utah, Arkansas, and Texas have passed parental-consent laws; most have been preliminarily enjoined on First Amendment grounds. Jonathan Haidt\'s The Anxious Generation argues the smartphone-plus-social-media combination caused the post-2012 adolescent mental health crisis. Critics (Candice Odgers) point out the correlation evidence is weaker than Haidt presents and that verification regimes create their own privacy harms.',
    govHint: 'Adolescent brains do not have the prefrontal development to manage variable-reward platforms; protection is not paternalism.',
    oppHint: 'Verification requirements push kids to lie about their age and operate without any of the safety features age-gating was supposed to enable.',
  },
];

// Deterministic per-date picker. Same date → same motion, every render.
// Different dates → different motion. Spreads across the bank by hashing
// year+day-of-year so consecutive days don't cluster in the same domain.
export function dailyMotionFor(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return DAILY_MOTIONS[0];
  // Days-since-epoch hash for a clean linear walk through the bank with
  // a small offset so we don't start at index 0 on Jan 1.
  const days = Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
  const idx = ((days * 13) + 7) % DAILY_MOTIONS.length;
  return DAILY_MOTIONS[idx];
}

// ISO-formatted YYYY-MM-DD parser. Used to validate /today/{date}
// URLs; rejects anything that doesn't parse to a real date within the
// last 5 years or the next 5 years (keeps the URL space bounded and
// blocks spam crawling).
export function parseDailyDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000;
  if (d.getTime() < now - fiveYears || d.getTime() > now + fiveYears) return null;
  return d;
}

export function formatDailyDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

// Pretty long-form date for the page body (server-side, en-US locale
// for stability — Google's crawler is en-US by default).
export function prettyDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
