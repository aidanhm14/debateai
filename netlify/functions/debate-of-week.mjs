/* debate-of-week.mjs
 *
 * GET /api/debate-of-week
 *
 * Returns the "Resolution of the day": a featured, topical motion with a
 * short background (infoslide-style) and a strategy note. The UI in
 * debate-it.html renders this above the motion input — one click fills
 * the field. Rotates DAILY (UTC) through the curated bank below; every
 * visitor sees the same motion on a given day.
 *
 * Admin override still wins: config/debate_of_week
 *   { motion, format, context, background, setAt (serverTimestamp) }
 *   db.doc('config/debate_of_week').set({ motion: '...', format: 'bp', context: '...', background: '...', setAt: serverTimestamp() })
 * (Endpoint path and doc path keep the legacy "week" name for compat.)
 *
 * Cache: in-memory cache is keyed to the UTC day so the rotation never
 * serves yesterday's motion; edge cache is 1 hour.
 *
 * Fallback bank curation rules: every entry two-sided; background states
 * only verifiable facts; no em-dashes in user-facing strings.
 */

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse } from './lib/response.mjs';

const DOC_PATH = 'config/debate_of_week';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Rotate weekly fallbacks by ISO week number so the hardcoded motions
// cycle even when no admin has manually set one.
const DAILY_BANK = [
  {
    motion: 'This House would ban algorithmic content curation.',
    format: 'bp',
    context: 'The clash is user autonomy versus engagement. Prop wins on manufactured addiction and the democratic harm of rage-optimized feeds; opp wins on the counterfactual, a chronological feed nobody can actually navigate at modern volume. The strongest opp reframes curation as a service users opt into, then carries the burden back onto prop to show a workable alternative.',
    background: 'Chronological-by-default feeds are effectively gone. Instagram, TikTok, and X all rank algorithmically, and the EU Digital Services Act now forces very large platforms to offer a non-profiling feed option. So the live fight is not whether ranking exists, but who controls the dial.'
  },
  {
    motion: 'Resolved: The United States should abolish the electoral college.',
    format: 'ld',
    context: 'Trad rounds turn on the value clash, democratic legitimacy versus federalism. Circuit rounds get won on the framework and the disadvantage to abolition, the campaign shift toward pure population centers. Have a clean, pre-loaded answer to the National Popular Vote Compact either way.',
    background: 'Two of the last seven presidential elections sent the popular-vote loser to the White House. The National Popular Vote Interstate Compact has pledges worth 209 of the 270 electoral votes it needs to take effect, so the abolition question is closer to live policy than it looks.'
  },
  {
    motion: 'This House believes that affirmative action does more harm than good.',
    format: 'apda',
    context: 'A canonical impromptu. The trap is debating whether discrimination exists; the real round is mechanism, does race-conscious policy repair the harm or entrench it. Prep the mismatch argument and keep a race-neutral alternative (class-based, geographic) ready so you are not just defending the status quo.',
    background: 'The 2023 Students for Fair Admissions ruling struck down race-conscious college admissions in the US. That makes this a live test of what actually replaces it, not an abstract values debate.'
  },
  {
    motion: 'THBT developed nations should open their borders to climate migrants.',
    format: 'worlds',
    context: 'On the WSDC circuit this year. Opp almost always concedes the moral pull and wins on absorption capacity and political backlash. Prop should not run open borders as a slogan; bring a phased, capacity-linked model so the practical objections have somewhere to land.',
    background: 'The World Bank projects up to 216 million internal climate migrants by 2050. No binding treaty currently recognizes a climate refugee, which is precisely the legal gap this motion asks you to fill.'
  },
  {
    motion: 'This House would introduce a universal basic income.',
    format: 'asian',
    context: 'High-frequency motion, so judges have heard the easy lines. Win on the funding mechanism and the labor-supply response, not on the warm story. Cite specific pilots and be honest about what they did and did not show.',
    background: 'Pilots in Finland, Kenya (the long-run GiveDirectly study), and Stockton, California reported better mental health and no large drop in employment. Opp should attack scale and cost rather than denying the local benefits.'
  },
  {
    motion: 'Resolved: Plea bargaining should be abolished.',
    format: 'ld',
    context: 'LD topic for the season, and the best prep is the opp. Practice defending a system that disposes of almost every case. Prop wins on coercion of the innocent; opp wins on the collapse that follows if every charge demands a trial.',
    background: 'Roughly 95 percent of US criminal convictions come from plea deals, not trials. The Innocence Project ties a meaningful share of later exonerations to defendants who pled guilty to crimes they did not commit, which is the prop core.'
  },
  {
    motion: 'This House would hold social media companies liable for user-generated content.',
    format: 'bp',
    context: 'BP panel classic. The MA extension is where it is won, usually the chilling-effect-at-scale tradeoff that opening prop glossed. Closing half has to add a mechanism the opening did not already say, not just re-weigh.',
    background: 'Section 230 in the US still shields platforms from liability for user posts, while the EU DSA and the UK Online Safety Act move the other way. The motion is contested live law, not a hypothetical.'
  },
  {
    motion: 'THBT the International Criminal Court does more harm than good.',
    format: 'worlds',
    context: 'A current WSDC and MUN favourite. The sovereignty-shield opp is underrated: argue the Court entrenches impunity through selective, unenforceable warrants. Prop needs a tight line on deterrence and a response to the great-power exemption.',
    background: 'The ICC issued an arrest warrant for Vladimir Putin in 2023 and for Israeli and Hamas leaders in 2024, yet it has no police force and depends entirely on member-state cooperation that the most powerful states withhold.'
  },
  {
    motion: 'This House believes that cancel culture has gone too far.',
    format: 'apda',
    context: 'A surface-level motion with a deep second layer, and the good prop finds it. Define the harm precisely, disproportionate punishment without process or proportionality, not just hurt feelings. The both-sides mush loses; a clean threshold for when accountability becomes mob sanction wins.'
  },
  {
    motion: 'Resolved: The benefits of space exploration outweigh the costs.',
    format: 'pf',
    context: 'A PF opener for newer debaters and a clean drill for summary collapse and weighing. The round is opportunity cost: every dollar to orbit is a dollar not spent on Earth. Quantify the spillover technology rather than gesturing at it.'
  },
  {
    motion: 'This House would make voting mandatory.',
    format: 'bp',
    context: 'Deceptively hard, and the Whip speeches are the round. Prop wins on legitimacy and turnout equality across class; opp wins on compelled speech and the uninformed-vote harm. Whoever handles the Australia comparison most honestly tends to take it.',
    background: 'Australia has enforced compulsory voting since 1924 and posts turnout above 90 percent, against roughly 60 percent in comparable voluntary systems. That single contrast anchors most of the clash.'
  },
  {
    motion: 'This House believes artificial intelligence is a net positive for democracy.',
    format: 'asian',
    context: 'An emerging circuit motion that rewards real 2025 grounding over sci-fi. Prop wins on access and civic information; opp wins on deepfakes and microtargeted manipulation. Name specific harms and specific safeguards, not vibes.',
    background: '2024 brought the first real wave of AI-generated deepfakes into elections from the US to India to Slovakia. Generative tools now draft campaign copy and help moderate platforms at scale, so the benefits and harms are both already operating.'
  },
  {
    motion: 'Resolved: Economic sanctions are an effective tool of foreign policy.',
    format: 'pf',
    context: 'A PF classic where first-speaker offense on uniqueness decides it. The weighing is effectiveness versus civilian harm, and the empirics cut both ways depending on which case you anchor. Pick your sanctions regime deliberately.',
    background: 'The post-2022 sanctions on Russia are the largest coordinated package in history, yet the ruble recovered and oil kept flowing to new buyers. That gap between intent and result is the center of the round.'
  },
  {
    motion: 'This House would end anonymous online speech.',
    format: 'bp',
    context: 'A strong DPM extension opportunity worth running twice. The clash is accountability versus the cover anonymity gives whistleblowers, activists, and abuse survivors. Specify the verification mechanism, because the harms live in the implementation, not the principle.'
  },
  {
    motion: 'THBT India should transition to a presidential system of government.',
    format: 'worlds',
    context: 'A high-India-circuit motion, and India won WSDC 2025, so their case shapes are worth knowing. Prop wins on decisive governance and ending coalition paralysis; opp wins on the federalism and minority-protection harms of concentrating executive power.',
    background: 'India runs a Westminster parliamentary system: a ceremonial president and a prime minister who needs a Lok Sabha majority. The 2024 election returned a coalition government, which sharpens the stability-versus-accountability question this motion runs on.'
  },
  {
    motion: 'Resolved: Governments should prioritize economic growth over environmental protection.',
    format: 'pf',
    context: 'The weighing mechanic is the whole round: probability times severity times timeframe. Prop leans on near-term, high-certainty development gains; opp leans on irreversible long-term harm. Whoever controls how the judge discounts the future wins.'
  },
  {
    motion: 'This House would abolish nuclear weapons.',
    format: 'worlds',
    context: 'A perennial WSDC motion where deterrence theory versus humanitarian law is the core clash. Opp wins on the stability of mutually assured destruction; prop wins on accident risk and proliferation. Prop must have a credible verification answer or the round slips away.',
    background: 'The 2021 Treaty on the Prohibition of Nuclear Weapons is in force, but no nuclear-armed state has signed it. Modernizing arsenals in Russia, China, and North Korea make the principled-versus-practical split impossible to dodge.'
  },
  {
    motion: 'This House believes that free trade does more harm than good.',
    format: 'bp',
    context: 'The BP PM speech here is well-trodden, so the LO split is where rounds get creative. Prop wins on hollowed-out communities and strategic dependency; opp wins on aggregate welfare and poverty reduction. Distributional weighing, who gains and who loses, decides it.',
    background: 'The turn to tariffs and industrial policy since 2016, from US-China trade barriers to reshoring subsidies, means the free-trade consensus is genuinely contested again rather than assumed.'
  },
  {
    motion: 'That civil disobedience is justified in a functioning democracy.',
    format: 'apda',
    context: 'An APDA classic where the definitional debate is only the first layer. The real round is the threshold: when does a working democracy still fail to justify breaking its own laws. Bring a principled limiting principle so you are not defending every act of lawbreaking.'
  },
  {
    motion: 'Resolved: The US should substantially increase restrictions on immigration.',
    format: 'policy',
    context: 'A policy motion on the table, and the K-aff landscape is worth knowing cold, borders-as-violence frameworks dominate the affirmative. Neg needs a clean framework answer and a topical counterplan, not just a politics disad.'
  },
  {
    motion: 'This House would require social media companies to verify user ages.',
    format: 'asian',
    context: 'Age verification is live policy, and the recent statutes are your uniqueness. Prop wins on documented harm to minors; opp wins on the privacy cost of universal ID checks and how easily teens route around them. Engage the circumvention point directly.',
    background: 'The UK Online Safety Act and a 2024 Australian law banning under-16 social-media accounts both mandate age checks. That makes this a real-world test of enforceability rather than a thought experiment.'
  },
  {
    motion: 'THBT the global community should prioritize pandemic prevention over economic recovery.',
    format: 'worlds',
    context: 'A post-COVID lens that WSDC and MUN both run versions of. The clash is precaution versus present, certain harm, and the round turns on how you discount a low-probability, high-magnitude future event against jobs and growth people can feel now.'
  },
  {
    motion: 'This House believes that the ends justify the means.',
    format: 'apda',
    context: 'The classic impromptu test, good for drilling your ethical framework at speed. Resist the philosophy-seminar pull; ground it in one concrete case and let the principle fall out of the example. Examiners reward a clean line over a name-dropped one.'
  },
  {
    motion: 'Resolved: Affirmative action is justified as a remedy for historical injustice.',
    format: 'ld',
    context: 'A live LD topic where the trad framework fight is corrective justice versus desert, and circuit rounds add a structural-violence layer. Have the post-2023 legal landscape ready to deploy as offense or as defensive ground depending on side.',
    background: 'After the 2023 Students for Fair Admissions ruling barred race-conscious admissions, this motion is really arguing whether the remedy was ever justified and what, if anything, legitimately takes its place.'
  },
  {
    motion: 'This House would impose a global carbon tax.',
    format: 'bp',
    context: 'A BP round that demands real economics grounding. The Opposition split is the play, usually competitiveness and regressivity set against the prop mechanism. Border carbon adjustments are your uniqueness, so know how they actually work before you cite them.',
    background: 'The EU Carbon Border Adjustment Mechanism entered its transitional phase in 2023, pricing the carbon content of imports. That turns a coordinated global carbon price into a live negotiation rather than a hypothetical.'
  },
  {
    motion: 'THBT democracy is not the best form of government for developing nations.',
    format: 'worlds',
    context: 'Runs hot at WSDC, so know the Singapore and Rwanda case shapes before the semifinal. Prop wins on developmental-state speed and coordination; opp wins on accountability and the long-run fragility of authoritarian growth. The round is whether the success stories generalize.',
    background: 'The China and Singapore growth records are the prop backbone; the counter-evidence is post-authoritarian collapse and stagnation elsewhere. Most of the clash is really about selection bias in which cases each side cites.'
  },
  {
    motion: 'THBT multi-club ownership models cause more harm than good for soccer.',
    format: 'apda',
    context: 'Round-tested on the 2026 summer circuit. The winning material is mechanism, not nostalgia: trace what a shared owner does to transfer pricing, loan pipelines, and competitive integrity, then weigh it against the capital and survival that MCO money buys smaller clubs.',
    background: 'Multi-club ownership means one entity holds stakes in two or more professional teams. From a handful of cases a decade ago, over 180 such structures operated worldwide by late 2025; rules bar co-owned clubs from the same domestic league but not from the same continental competitions.'
  },
  {
    motion: 'This House would replace take-home essays with oral examinations.',
    format: 'bp',
    context: 'Prop wins on assessment integrity in the AI era and on speech as the durable skill; opp wins on anxiety, grading subjectivity, and scale. The best rounds fight over what an exam is FOR, signaling or learning, before fighting over format.',
    background: 'Surveys since 2023 find a large majority of students have used AI chatbots on written coursework, and US retailers reported blue-book sales rising 30 to 80 percent as instructors moved assessment back into the room. The viva format this motion proposes is already standard in many European and Indian systems.'
  },
  {
    motion: 'This House would ban smartphones in schools.',
    format: 'worlds',
    context: 'A live-policy motion, so anchor to real implementations rather than hypotheticals. Prop wins on attention and mental-health data; opp wins on enforcement reality, parental contact, and the equity of confiscation regimes. The clash is whether the harm is the phone or the platform.',
    background: 'France banned phones in middle schools in 2018, UNESCO called for school smartphone bans in 2023, and a wave of US states and European countries adopted restrictions through 2024 and 2025. Early evaluations report attention gains; effect sizes are still contested.'
  },
  {
    motion: 'THS congestion pricing in major cities.',
    format: 'pf',
    context: 'The empirics are unusually clean for a debate motion, so command them. Prop weighs traffic, transit funding, and air quality; opp weighs regressivity and the political backlash that repeals schemes before benefits mature. Pick your city case deliberately and defend its numbers.',
    background: 'London has charged a congestion fee since 2003. New York launched the first US scheme in January 2025, charging most drivers to enter lower Manhattan, and early months showed faster crossings and higher transit ridership alongside continued legal and political challenges.'
  },
  {
    motion: 'THR the rise of prediction markets.',
    format: 'apda',
    context: 'A THR, so build the counterfactual world: information aggregation without wagers (polls, models, forecasting tournaments). Gov wins on gamblified civic life and manipulation risk; opp wins on accuracy incentives and the failure record of punditry. Keep the mechanism concrete: who trades, why, and what the price actually tells you.',
    background: 'Platforms like Polymarket and Kalshi cleared billions in volume on the 2024 US election after a federal court allowed regulated election contracts. Their prices beat many polls on the result, which is exactly the ground both sides fight over.'
  },
  {
    motion: 'This House supports the nuclear renaissance.',
    format: 'bp',
    context: 'Ground the round in the new demand story, not the 1970s one. Prop wins on firm zero-carbon power and the grid math of AI-era demand; opp wins on cost overruns, timelines, and what the same capital buys in renewables plus storage. The waste argument is table stakes; the levelized-cost fight decides it.',
    background: 'In 2024 Microsoft signed a deal to restart a Three Mile Island reactor and Google and Amazon backed small modular reactor projects, all to power data centers. More than 20 countries pledged at COP28 to triple nuclear capacity by 2050.'
  },
  {
    motion: 'This House would seize frozen Russian state assets to fund the reconstruction of Ukraine.',
    format: 'bp',
    context: 'The principle is easy and the precedent is the round. Prop must answer what sovereign immunity is worth after aggression; opp must answer why interest-skimming half-measures are principled rather than timid. The strongest opp material is reserve-currency flight and what China learns from the seizure.',
    background: 'Western governments immobilized roughly 300 billion dollars of Russian central bank assets after the 2022 invasion. The G7 has so far used only the windfall profits to back a 50 billion dollar loan to Ukraine in 2024; outright confiscation remains legally untested at this scale.'
  },
  {
    motion: 'This House would require AI developers to license the copyrighted work used to train their models.',
    format: 'ld',
    context: 'Trad rounds run property and desert against access and progress; circuit rounds live on the disad, whether licensing entrenches the incumbents who can afford it. Both sides should know what fair use actually requires, because the round collapses without it.',
    background: 'The New York Times sued OpenAI and Microsoft in December 2023 over training data, while AP, Axel Springer, Reddit and others signed licensing deals instead. Courts have not settled whether training on copyrighted text is fair use, which is the legal vacuum this motion fills.'
  },
  {
    motion: 'THBT universities should adopt institutional neutrality on contested political questions.',
    format: 'apda',
    context: 'Define the policy precisely or lose the round to strawmen: neutrality binds the institution, not its scholars. Gov wins on truth-seeking credibility and donor-and-government pressure; opp wins on the moments when silence IS a position. The taxonomy of what counts as contested does the heavy lifting.',
    background: 'The University of Chicago\'s 1967 Kalven Report is the canonical statement that universities should stay institutionally silent on politics to protect individual inquiry. After the campus crises of 2023 and 2024, Harvard, Stanford and a wave of other universities adopted versions of it.'
  },
  {
    motion: 'TH, as the NCAA, would treat college athletes as employees.',
    format: 'apda',
    context: 'An actor motion, so argue from the NCAA\'s interests: survival, control, and the antitrust siege it keeps losing. Gov wins on liability clarity and ending the lawsuit bleed; opp wins on Title IX exposure, the fate of non-revenue sports, and collective bargaining chaos across 50 states.',
    background: 'The House v. NCAA settlement approved in June 2025 lets schools pay athletes directly, roughly 20 million dollars per school per year to start, on top of the name-image-likeness rights athletes won in 2021. Employment status is the one line the NCAA has not yet crossed.'
  },
  {
    motion: 'This House would ban private equity firms from buying single-family homes.',
    format: 'pf',
    context: 'The round is won on market-share honesty. Prop needs the concentrated-metro story, not a national average; opp should concede the sympathy and win on supply, the actual driver of prices, and on who provides rental stock if institutions exit. Quantify or lose.',
    background: 'Institutional investors own a small single-digit share of US single-family homes nationally but concentrated positions in metros like Atlanta and Phoenix. Bills to force divestment, including the End Hedge Fund Control of American Homes Act, have been introduced in Congress since 2023.'
  },
  {
    motion: 'This House prefers a world in which professional sport permits performance enhancement.',
    format: 'worlds',
    context: 'A THP world-comparison, so no transition costs: compare stable end-states. Prop wins on autonomy, safety through medical supervision, and the hypocrisy of the current arms race; opp wins on coercion of the marginal athlete and what spectators actually watch sport to see.',
    background: 'The Enhanced Games, a competition without doping controls backed by venture investors, has been announced for 2026 with seven-figure prizes for world records. Anti-doping agencies have condemned it, which makes the previously hypothetical clash concrete.'
  },
  {
    motion: 'This House would introduce a robot tax on labor-displacing automation.',
    format: 'asian',
    context: 'Mechanism-first economics: define the tax base (robots, software, or displaced payroll?) before the judge does it for you. Prop wins on transition funding and the erosion of payroll-funded welfare; opp wins on defining-the-base absurdity and on taxing exactly the productivity poor countries need.',
    background: 'Bill Gates floated the idea in 2017 and South Korea trimmed its automation tax credits the same year, the closest any state has come. The debate returned with force once generative AI moved displacement from factory floors to white-collar work.'
  },
  {
    motion: 'This House would break up Google.',
    format: 'policy',
    context: 'The remedies fight IS the round: behavioral conditions versus structural separation. Aff wins on self-preferencing mechanics and the default-payments moat; neg wins on integration efficiencies and the chilling effect on the next platform. Know what the court actually ordered versus what it declined.',
    background: 'A US federal court ruled in August 2024 that Google illegally monopolized search, and the 2025 remedies decision ordered data sharing and payment restrictions while declining to force a Chrome divestiture. The gap between the ruling and the remedy is the live controversy.'
  },
  {
    motion: 'This House, as South Korea, would develop an independent nuclear deterrent.',
    format: 'asian',
    context: 'An actor motion where the actor\'s interests genuinely cut both ways. Gov wins on alliance abandonment risk and the North\'s arsenal growth; opp wins on the NPT rupture, sanctions exposure for a trade-dependent economy, and what Seoul teaches Tokyo and Taipei the day after.',
    background: 'Polls since 2023 repeatedly show a majority of South Koreans favor an indigenous nuclear arsenal. The 2023 Washington Declaration deepened US extended deterrence instead, trading nuclear submarine visits for a reaffirmed non-proliferation commitment.'
  },
  {
    motion: 'THS India\'s move to simultaneous national and state elections.',
    format: 'asian',
    context: 'The clash is democratic accountability versus governance bandwidth. Prop wins on the permanent-campaign cost and policy paralysis under the model code of conduct; opp wins on federalism, the fate of state-level issues under a national wave, and what happens when a government falls mid-cycle.',
    background: 'A committee led by former President Kovind endorsed simultaneous elections in 2024 and a constitutional amendment bill was introduced in the Lok Sabha that December. India held simultaneous polls until 1967, so both worlds have actually existed.'
  },
  {
    motion: 'This House would criminalize ecocide under international law.',
    format: 'worlds',
    context: 'Prop should model the mens rea threshold precisely, wanton or reckless destruction, or opp will win on farmers and development projects becoming war criminals. Opp\'s best ground is enforcement realism against the states doing the destroying. The symbolic-law clash is live on both sides.',
    background: 'Vanuatu, Fiji and Samoa formally proposed adding ecocide to the International Criminal Court\'s jurisdiction in 2024, Belgium wrote it into domestic law the same year, and the EU\'s 2024 environmental crimes directive covers comparable conduct.'
  },
  {
    motion: 'THBT social media does more harm than good for teenagers.',
    format: 'pf',
    context: 'The evidence fight is the round, so learn what the studies actually show: correlational harm concentrated in heavy use and vulnerable groups, not uniform damage. Weigh identity-finding and community for isolated teens honestly against the anxiety and sleep data, then win on net direction.',
    background: 'The US Surgeon General issued a 2023 advisory on social media and youth mental health, and Australia legislated an under-16 account ban in late 2024 taking effect at the end of 2025. Platform design, not existence, is where most serious proposals now aim.'
  },
  {
    motion: 'This House would bar authoritarian states from hosting international sporting events.',
    format: 'worlds',
    context: 'Opp usually wins the definitional skirmish (who counts as authoritarian, and who decides?) unless prop pre-empts with a clean criterion. Prop\'s core is legitimacy laundering; opp\'s is engagement, the record of boycotts, and the athletes who pay the cost of principle.',
    background: 'Qatar hosted the 2022 World Cup amid labor-rights scrutiny and Saudi Arabia was confirmed as 2034 host in December 2024. Sportswashing is now an academic literature, not just an accusation, and the counter-case cites reform pressure that hosting brings.'
  },
  {
    motion: 'This House would ban advertising in public spaces.',
    format: 'quick',
    context: 'A fun one that rewards a concrete model: what counts as public, what replaces the revenue, and who decides what fills the walls. Prop wins on cognitive commons and consent; opp wins on funded transit, discovery for small businesses, and the vibrancy that pure blankness kills.',
    background: 'Sao Paulo\'s 2006 Cidade Limpa law removed some 15,000 billboards from one of the world\'s largest cities and remains the canonical real-world test both sides cite.'
  },
  {
    motion: 'This House regrets the influencer economy.',
    format: 'apda',
    context: 'A THR on a trend, so the counterfactual keeps celebrity and advertising; what changes is the parasocial, algorithmic, everyone-is-a-storefront layer. Gov wins on trust decay and the aspiration funnel it sells kids; opp wins on redistributed fame, creator livelihoods, and gatekeepers losing their monopoly.',
    background: 'Goldman Sachs valued the creator economy near 250 billion dollars in 2023 and projected roughly double by 2027. Influencer marketing is now a standard line item in major consumer brands\' budgets, and disclosure regulation lags well behind the spend.'
  },
  {
    motion: 'This House would replace juries with professional judges.',
    format: 'ld',
    context: 'Trad framing: legitimacy through peers versus accuracy through expertise. The underrated opp ground is that juries are the last unreviewable check ordinary citizens hold over state power; the underrated prop ground is the data on comprehension in complex trials. Pick a jurisdiction and argue its record.',
    background: 'Most of the world already tries serious cases without common-law juries; France and Germany use mixed panels of judges and lay assessors. US civil juries decide well under 1 percent of filed federal cases after settlement and plea dynamics, so the institution is rarer in practice than in principle.'
  },
  {
    motion: 'This House supports central bank digital currencies.',
    format: 'bp',
    context: 'Split the motion cleanly: retail CBDC for citizens is a different debate from wholesale settlement rails. Prop wins on inclusion, payment sovereignty, and sanctions-proof plumbing; opp wins on surveillance, disintermediating banks in a crisis, and the honest question of what problem rich-country CBDCs solve.',
    background: 'Over 130 countries have explored CBDCs, China\'s e-CNY pilot is the largest, and the ECB is in a digital euro preparation phase. The US moved the other way: a January 2025 executive order barred federal work on a retail CBDC, framing it as a surveillance risk.'
  },
  {
    motion: 'THBT de-extinction is a worthwhile conservation strategy.',
    format: 'quick',
    context: 'The science-honesty layer decides it: what was actually created, and does the answer change the ethics? Prop wins on restored ecosystems and the technology spillover to living endangered species; opp wins on opportunity cost, moral hazard (extinction stops being forever), and hubris about ecological reinsertion.',
    background: 'Colossal Biosciences announced gene-edited pups presented as dire wolves in April 2025; critics called them modified gray wolves, which is itself the definitional core of the debate. The same toolkit is being pitched for the mammoth and the thylacine.'
  },
  {
    motion: 'This House, as Indonesia, would keep its raw nickel export ban permanently.',
    format: 'asian',
    context: 'An actor motion about development strategy. Gov wins on the downstreaming record, smelters, jobs and battery-chain leverage; opp wins on WTO exposure, the monoculture risk of betting on one commodity, and the environmental cost being exported to Indonesian islands rather than abroad.',
    background: 'Indonesia, holder of the world\'s largest nickel reserves, banned raw ore exports in 2020 to force domestic processing. Smelter investment surged, the EU won a WTO challenge that Indonesia appealed into limbo, and battery-grade output has made the country central to the EV supply chain.'
  },
  {
    motion: 'THBT the Gulf migration corridor does South Asia more good than harm.',
    format: 'asian',
    context: 'Both sides should argue people, not just remittance aggregates. Prop wins on the welfare math of wages five times home rates and the households they transform; opp wins on kafala-era labor conditions, brain and brawn drain, and the political economy of states that export their unemployment.',
    background: 'Gulf states host tens of millions of South Asian workers, and roughly half of India\'s record remittance inflows, over 100 billion dollars annually in recent years, originate there. Kafala sponsorship reforms since 2020 remain unevenly enforced.'
  },
  {
    motion: 'This House would grant permanent residents voting rights in local elections.',
    format: 'worlds',
    context: 'Keep the scope local or the round dissolves into citizenship-in-general. Prop wins on taxation-representation logic and integration incentives; opp wins on citizenship as the meaningful threshold and the political backlash that sets integration back. Real jurisdictions on both sides make this concrete.',
    background: 'New Zealand lets permanent residents vote nationally, dozens of countries allow it locally, and New York City\'s 2022 attempt to enfranchise 800,000 noncitizen residents was struck down in state court, showing exactly where the legal and political lines sit.'
  },
  {
    motion: 'This House would adopt a four-day work week as the national standard.',
    format: 'quick',
    context: 'The productivity studies are prop\'s opening and opp\'s target: who self-selected into the pilots, and what happens in hospitals, logistics and schools that cannot compress output? The distributional layer, salaried knowledge workers versus hourly shift workers, is where sharp rounds go.',
    background: 'The 2022 UK pilot of 61 companies reported most kept the schedule with stable revenue, and trials in Iceland and Spain preceded it. No large economy has yet legislated a standard four-day week, so the motion asks who moves first.'
  },
];

function dayNumber() {
  return Math.floor(Date.now() / 86400000); // UTC days since epoch
}

let cache = { data: null, ts: 0, day: -1 };

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  // Serve from memory cache if fresh AND still the same UTC day.
  if (cache.data && cache.day === dayNumber() && Date.now() - cache.ts < CACHE_TTL) {
    return jsonResponse(cache.data, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  }

  let db;
  try { db = getDb(); }
  catch (e) {
    const fallback = DAILY_BANK[dayNumber() % DAILY_BANK.length];
    return jsonResponse({ ...fallback, source: 'fallback' }, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  }

  try {
    const snap = await db.doc(DOC_PATH).get();
    const payload = snap.exists
      ? { ...snap.data(), source: 'firestore', setAt: snap.data().setAt?.toMillis?.() || null }
      : { ...DAILY_BANK[dayNumber() % DAILY_BANK.length], source: 'fallback' };

    cache = { data: payload, ts: Date.now(), day: dayNumber() };
    return jsonResponse(payload, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    console.error('[debate-of-week] Firestore read failed:', err.message);
    const fallback = DAILY_BANK[dayNumber() % DAILY_BANK.length];
    return jsonResponse({ ...fallback, source: 'fallback-error' }, 200, request, { 'Cache-Control': 'public, max-age=3600' });
  }
};

export const config = { path: '/api/debate-of-week' };
