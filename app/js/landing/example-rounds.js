/* Authored examples and unaccepted challenges. Rendered by example-board.js. */
window.DBLandingExampleRounds = function () {
var ROUNDS = [
    { lead:true, fmt:'World Schools', motion:'People should stop boycotting a company once it reverses the policy they opposed.',
      a:{ nm:'Sarah', side:'For', face:'face46' }, b:{ nm:'Nick', side:'Against', face:'face53' },
      open:50, drift:58, won:'a', score:'88 - 75', crowd:186, vol:340,
      rfd:'Sarah wins by arguing that ending the boycott gives the company a reason to keep the change. Nick calls for continued pressure, but does not explain what further action the company must take before customers return.' },
    { fmt:'British Parli', motion:'The US should ban unpaid internships.',
      a:{ nm:'Eric', side:'For', face:'face46' }, b:{ nm:'Chloe', side:'Against', face:'face52' },
      open:52, drift:71, won:'a', score:'88 - 69', crowd:214, vol:380,
      rfd:'Eric wins by showing the job is sold to whoever can afford to work for nothing, which prices out the people the ladder was supposed to lift. Chloe defends the training on offer but never answers who is standing on the rung.' },
    { fmt:'Public Forum', motion:'US colleges should stop favoring the children of past students.',
      a:{ nm:'Megan', side:'For', face:'face49' }, b:{ nm:'Ian', side:'Against', face:'face52' },
      open:50, drift:61, won:'b', score:'75 - 82', crowd:151, vol:310,
      rfd:'Ian wins by arguing that alumni preferences can help fund scholarships for students who could not otherwise attend. Megan makes the case for equal treatment in admissions, but does not answer his proposal to tie any preference to a measurable benefit for those students.' },
    { lead:true, fmt:'Congress', motion:'Going through your partner’s phone is justified if you suspect cheating.',
      a:{ nm:'Lily', side:'For', face:'face49' }, b:{ nm:'Henry', side:'Against', face:'face48' },
      open:50, drift:39, won:'b', score:'75 - 88', crowd:88, vol:205,
      rfd:'Henry wins. Privacy still matters when trust is shaky. Suspicion alone does not give someone permission to search.' },
    { lead:true, fmt:'Lincoln-Douglas', motion:'Your employer should be allowed to fire you for political posts made off the clock.',
      a:{ nm:'Josh', side:'For', face:'face53' }, b:{ nm:'Hannah', side:'Against', face:'face54' },
      open:50, drift:44, won:'a', score:'88 - 75', crowd:122, vol:265,
      rfd:'Josh wins by showing how a public post can damage trust with customers even when it was written at home. Hannah defends private political expression, but never answers the case where the employee publicly represents the business.' },
    { lead:true, fmt:'Karl Popper', motion:'Dating a friend’s ex is fine without asking them first.',
      a:{ nm:'Cole', side:'For', face:'face46' }, b:{ nm:'Sofia', side:'Against', face:'face47' },
      open:51, drift:68, won:'b', score:'82 - 88', crowd:108, vol:230,
      rfd:'Sofia wins. Dating someone a friend still cares about can damage the friendship. Asking first is a small price for keeping that trust.' },
    { lead:true, title:'Left vs Right', fmt:'APDA', motion:'Nobody should be allowed to become a billionaire.',
      a:{ nm:'Owen', side:'Against', face:'face46' }, b:{ nm:'Faith', side:'For', face:'face49' },
      open:50, drift:38, won:'a', score:'88 - 75', crowd:201, vol:365,
      rfd:'Owen wins by separating the existence of extreme wealth from the conduct used to acquire it. Faith proves inequality is harmful but never proves a hard wealth ceiling fixes it.' },
    { fmt:'Asian Parli', motion:'Governments should ban anonymous social media accounts.',
      a:{ nm:'Amy', side:'For', face:'face49' }, b:{ nm:'Anonymous', side:'Against', face:'face50' },
      open:52, drift:73, won:'b', score:'82 - 88', crowd:192, vol:350,
      rfd:'Anonymous wins because anonymity protects whistleblowers and vulnerable speakers who cannot safely use their names. Amy never shows why narrower enforcement tools would fail.' },
    { fmt:'Public Forum', motion:'The US should cancel all student debt.',
      a:{ nm:'Taylor', side:'For', face:'face54' }, b:{ nm:'Caleb', side:'Against', face:'face47' },
      open:51, drift:47, won:'b', score:'75 - 88', crowd:164, vol:315,
      rfd:'Caleb wins by arguing that the same money should go to low-income households, including people without student loans. Taylor makes the case for debt relief but never justifies extending it to wealthy borrowers too.' },
    { lead:true, fmt:'APDA', motion:'Public figures should be able to block true stories about their private lives.',
      a:{ nm:'Ryan', side:'For', face:'face51' }, b:{ nm:'Jenna', side:'Against', face:'face52' },
      open:48, drift:54, won:'b', score:'82 - 88', crowd:137, vol:285,
      rfd:'Jenna wins because a public figure could use that power to hide a conflict of interest. Ryan makes a strong case against intrusive gossip, but his rule also blocks information the public needs to assess someone in power.' },
    { lead:true, fmt:'World Schools', motion:'Couples should share their live location with each other.',
      a:{ nm:'Mike', side:'For', face:'face47' }, b:{ nm:'Natalie', side:'Against', face:'face52' },
      open:49, drift:35, won:'a', score:'88 - 82', crowd:128, vol:270,
      rfd:'Mike wins. Sharing location can make everyday plans easier. Turning it on voluntarily is different from demanding access.' },
    { fmt:'British Parli', motion:'The US should ban billionaires from owning news outlets.',
      a:{ nm:'Sydney', side:'For', face:'face49' }, b:{ nm:'Sam', side:'Against', face:'face53' },
      open:51, drift:74, won:'b', score:'75 - 95', crowd:209, vol:375,
      rfd:'Sam wins by arguing that an ownership ban would remove a source of funding for expensive reporting. Sydney shows how an owner can influence coverage, but does not explain how the outlets would replace that funding or why ownership safeguards would fail.' },
    { lead:true, fmt:'Quick Clash', motion:'Restaurants should replace tipping with fixed wages funded by higher menu prices.',
      a:{ nm:'Hunter', side:'For', face:'face46' }, b:{ nm:'Camila', side:'Against', face:'face54' },
      open:50, drift:65, won:'b', score:'82 - 88', crowd:196, vol:355,
      rfd:'Camila wins by comparing total earnings with the proposed wage. Hunter argues that a fixed wage would make pay more stable, but does not show that it would replace the tips lost by staff at busy restaurants.' },
    { fmt:'Quick Clash', motion:'Companies that replace workers with AI should pay to retrain them.',
      a:{ nm:'Claire', side:'For', face:'face48' }, b:{ nm:'Victor', side:'Against', face:'face47' },
      open:49, drift:37, won:'a', score:'88 - 82', crowd:243, vol:415,
      rfd:'Claire wins by arguing that a company benefiting from automation should share the cost of helping displaced workers find new jobs. Victor questions whether retraining works, but does not compare his alternative with the support Claire proposes.' },
    { fmt:'Public Forum', motion:'The US should ban social media for under-16s.',
      a:{ nm:'Andrew', side:'For', face:'face54' }, b:{ nm:'Sofia', side:'Against', face:'face51' },
      open:51, drift:68, won:'a', score:'88 - 75', crowd:231, vol:400,
      rfd:'Andrew wins by arguing that a ban would reduce how many children platforms can profitably target. Sofia shows that some users would evade the checks, but does not explain why partial enforcement would erase that benefit.' },
    { lead:true, fmt:'APDA', motion:'Parents should split their inheritance equally, regardless of who needs it most.',
      a:{ nm:'Megan', side:'For', face:'face52' }, b:{ nm:'Ben', side:'Against', face:'face53' },
      open:48, drift:33, won:'b', score:'82 - 88', crowd:187, vol:340,
      rfd:'Ben wins by showing that equal amounts can leave the child with greater care needs far worse off. Megan argues that unequal shares create resentment, but never explains why avoiding that dispute should outweigh the need for support.' },
    { lead:true, fmt:'Quick Clash', motion:'Influencers should pay refunds when a product they are paid to promote is a scam.',
      a:{ nm:'Maddie', side:'For', face:'face54' }, b:{ nm:'Matt', side:'Against', face:'face53' },
      open:49, drift:58, won:'a', score:'88 - 75', crowd:257, vol:425,
      rfd:'Maddie wins by tying paid endorsements to responsibility for the trust they sell. Matt argues that the seller caused the loss, but never answers why the promoter should keep the fee while followers carry the whole cost.' },
    { fmt:'Public Forum', motion:'The US should set a maximum age for politicians.',
      a:{ nm:'Faith', side:'For', face:'face51' }, b:{ nm:'Ryan', side:'Against', face:'face54' },
      open:50, drift:63, won:'a', score:'89 - 78', crowd:196, vol:355,
      rfd:'Faith wins by arguing that a clear age limit would make leadership turnover predictable. Ryan defends judging each candidate individually, but does not answer her concern that party loyalty can protect an unfit incumbent.' },
    { fmt:'Casual 1v1', motion:'European countries should compensate the countries they colonized.',
      a:{ nm:'Josh', side:'For', face:'face48' }, b:{ nm:'Taylor', side:'Against', face:'face49' },
      open:51, drift:66, won:'b', score:'75 - 88', crowd:144, vol:290,
      rfd:'Taylor wins by arguing for support that reaches affected communities directly instead of compensation paid to national governments. Josh makes the case for a duty to repair past harm, but does not explain why government-to-government payments would fulfill it better.' },
    { lead:true, fmt:'British Parli', motion:'Messaging apps should turn read receipts off by default.',
      a:{ nm:'Claire', side:'For', face:'face53' }, b:{ nm:'Malik', side:'Against', face:'face47' },
      open:49, drift:35, won:'b', score:'77 - 88', crowd:118, vol:250,
      rfd:'Malik wins by arguing that read receipts help people know whether an important message has been read. Claire makes the case for avoiding pressure to reply, but does not explain why an individual off switch would not address it.' },
    { fmt:'Lincoln-Douglas', motion:'US businesses should be allowed to refuse cash payments.',
      a:{ nm:'Elena', side:'For', face:'face54' }, b:{ nm:'Ian', side:'Against', face:'face46' },
      open:50, drift:32, won:'b', score:'74 - 90', crowd:127, vol:265,
      rfd:'Ian wins on access: a customer without a bank account still needs to buy essentials. Elena shows that cash creates handling costs, but never gives those customers a practical way to pay.' },
    { lead:true, fmt:'World Schools', motion:'You should tell a friend if you suspect their partner is cheating, even without proof.',
      a:{ nm:'Lucas', side:'For', face:'face52' }, b:{ nm:'Sarah', side:'Against', face:'face51' },
      open:50, drift:38, won:'b', score:'76 - 91', crowd:263, vol:430,
      rfd:'Sarah wins by weighing the harm of a false suspicion against the benefit of an early warning. Lucas argues that his friend should investigate, but does not answer how the warning itself could damage trust even if it is wrong.' },
    /* 2026-08-26, per the founder: "more polling proxy type resolutions,
       hot button culture topics, not ketchup v mustard absurd energy", and
       name the actor ("globally, X should happen" / "in the US x should
       happen"). Every motion above was swept for the actor in the same
       pass; these fourteen are new, and each one is a question a real poll
       asks and comes back near even on. The actor is picked for where the
       institution actually lives: the US when the thing being argued is
       American (the Electoral College, college sport, tipping), "your
       country" when every reader has their own version of it, and
       "globally" only when the motion needs every country to move at once.
       A US-only deck would be its own claim about who this site is for,
       and section 8 is explicit that the audience is not one country.
       THE LINE THAT STAYS DRAWN, unchanged from the 08-19 batch: contested
       is the goal, targeted is not. Nothing here takes its heat from
       questioning whether a group should have rights. The platform-wide
       sensitive-motion boundary applies here too. Border enforcement and
       trans participation are live polling questions and deliberately absent
       from this first screen because a stranger reads the selection as a
       statement about what the site wants people to argue. */
    { lead:true, fmt:'Public Forum', motion:'Ending a serious relationship by text is acceptable.',
      a:{ nm:'Natalie', side:'For', face:'face13' }, b:{ nm:'Cole', side:'Against', face:'face47' },
      open:50, drift:64, won:'b', score:'82 - 88', crowd:274, vol:445,
      rfd:'Cole wins by arguing that ending a serious relationship deserves the effort of a face-to-face conversation. Natalie says writing helps her explain her reasons clearly, but does not answer his suggestion to prepare those reasons before meeting.' },
    { fmt:'Lincoln-Douglas', motion:'US voters should be able to rank candidates in order of preference.',
      a:{ nm:'Grace', side:'For', face:'face18' }, b:{ nm:'Owen', side:'Against', face:'face48' },
      open:51, drift:72, won:'a', score:'88 - 75', crowd:218, vol:392,
      rfd:'Grace wins by arguing that ranking backup choices lets people support a favorite without giving up a say between the leading candidates. Owen raises ballot complexity, but does not weigh that cost against having to abandon a preferred candidate under the alternative.' },
    { fmt:'British Parli', motion:'The UK should replace its monarchy with an elected head of state.',
      a:{ nm:'Camila', side:'For', face:'face20' }, b:{ nm:'Caleb', side:'Against', face:'face51' },
      open:52, drift:36, won:'b', score:'75 - 88', crowd:196, vol:358,
      rfd:'Caleb wins by arguing that an elected head of state could claim a competing mandate to the elected government. Camila makes the case against inherited office, but does not answer his concern about turning a ceremonial role into another partisan contest.' },
    { lead:true, fmt:'Policy', motion:'You should forgive a friend’s debt if they are struggling to pay it back.',
      a:{ nm:'Jon', side:'For', face:'face52' }, b:{ nm:'Lily', side:'Against', face:'face30' },
      open:48, drift:69, won:'a', score:'95 - 75', crowd:227, vol:401,
      rfd:'Jon wins by showing that collecting the debt would cost more in hardship and trust than it would recover. Lily defends keeping promises, but never answers why a promise should matter more than a friend’s ability to meet basic needs.' },
    { fmt:'Asian Parli', motion:'The US should make voting mandatory.',
      a:{ nm:'Faith', side:'For', face:'face35' }, b:{ nm:'Tom', side:'Against', face:'face53' },
      open:50, drift:66, won:'a', score:'88 - 75', crowd:163, vol:312,
      rfd:'Faith wins by naming who stops turning out first when voting is optional. Tom defends the right to abstain and never answers that a blank ballot preserves it.' },
    { fmt:'Congress', motion:'The US should elect presidents by popular vote.',
      a:{ nm:'Ben', side:'For', face:'face54' }, b:{ nm:'Anna', side:'Against', face:'face37' },
      open:51, drift:43, won:'b', score:'82 - 88', crowd:209, vol:379,
      rfd:'Anna wins by defending a system that requires candidates to build support across states. Ben argues for counting every vote equally, but does not answer her concern that a national campaign would neglect smaller regional interests.' },
    { lead:true, fmt:'Quick Clash', motion:'The US should make 32 hours a full workweek with no cut in weekly pay.',
      a:{ nm:'Maddie', side:'For', face:'face01' }, b:{ nm:'Diego', side:'Against', face:'face46' },
      open:50, drift:58, won:'a', score:'88 - 82', crowd:252, vol:418,
      rfd:'Maddie wins by explaining why productivity gains should buy workers time as well as profit. Diego raises the cost of covering shifts, but never compares that cost with the value of the time workers would get back.' },
    { fmt:'Public Forum', motion:'US colleges should split athlete pay equally across all their sports teams.',
      a:{ nm:'Hunter', side:'For', face:'face53' }, b:{ nm:'Zoe', side:'Against', face:'face07' },
      open:50, drift:74, won:'a', score:'88 - 69', crowd:234, vol:397,
      rfd:'Hunter wins by showing why athletes representing the same school deserve a common pay rule. Zoe argues that popular teams bring in more money, but never proves that revenue measures the work each athlete contributes.' },
    { fmt:'Karl Popper', motion:'The US should require childhood vaccines for school attendance.',
      a:{ nm:'Hannah', side:'For', face:'face04' }, b:{ nm:'Lucas', side:'Against', face:'face52' },
      open:52, drift:77, won:'a', score:'95 - 75', crowd:188, vol:344,
      rfd:'Hannah wins on the children who cannot be vaccinated at all, for whom the classroom is the one place their protection is somebody else\'s decision. Lucas argues parental judgement and never answers that the risk is not carried by the family taking it.' },
    { fmt:'Quick Clash', motion:'The US should stop funding religious schools.',
      a:{ nm:'Elena', side:'For', face:'face13' }, b:{ nm:'Josh', side:'Against', face:'face48' },
      open:50, drift:41, won:'b', score:'77 - 88', crowd:171, vol:326,
      rfd:'Josh wins because the money follows the pupil rather than the doctrine, and Elena never shows that a state funding a school it does not run is endorsing what that school teaches.' },
    { fmt:'Quick Clash', motion:'The US should let 16-year-olds vote.',
      a:{ nm:'Malik', side:'For', face:'face47' }, b:{ nm:'Sofia', side:'Against', face:'face30' },
      open:48, drift:39, won:'b', score:'75 - 88', crowd:257, vol:424,
      rfd:'Sofia wins by arguing that parents and schools could have disproportionate influence over younger teenagers’ votes. Malik shows that sixteen-year-olds are affected by policy, but does not address her concern about their independence when making political choices.' },
    /* 2026-09-02, per the founder: the deck should keep adding serious,
       polarizing questions, but every card must still name a concrete
       choice with real ground on both sides. These twenty draw from the
       live public divides around trade, courts, schools, work, housing,
       privacy and platform power. The removed cards below were either
       founder strikes or failed that clarity test. */
    { fmt:'Casual 1v1', motion:'The US should put a 10% tax on all imports.',
      a:{ nm:'Grace', side:'For', face:'face18' }, b:{ nm:'Owen', side:'Against', face:'face48' },
      open:49, drift:38, won:'b', score:'75 - 88', crowd:286, vol:458,
      rfd:'Owen wins by tracing the tariff to the price paid by American buyers and to retaliation against exporters. Grace shows that protected factories may hire more workers but never proves those gains outrun the costs across everything imported.' },
    { fmt:'Casual 1v1', motion:'The US should limit Supreme Court justices to 18-year terms.',
      a:{ nm:'Eric', side:'For', face:'face46' }, b:{ nm:'Jenna', side:'Against', face:'face52' },
      open:50, drift:66, won:'a', score:'88 - 82', crowd:241, vol:406,
      rfd:'Eric wins because regular, staggered appointments stop one death or retirement from giving a president decades of extra influence. Jenna defends judicial independence but never shows why independence requires an unpredictable lifetime seat.' },
    { fmt:'Casual 1v1', motion:'The US should let families spend public school funding on private tuition.',
      a:{ nm:'Hannah', side:'For', face:'face54' }, b:{ nm:'Tom', side:'Against', face:'face53' },
      open:51, drift:36, won:'b', score:'75 - 89', crowd:268, vol:438,
      rfd:'Tom wins by distinguishing costs that fall when a pupil leaves from building and staffing costs that remain. Hannah explains why families want another option, but does not show how her voucher proposal would protect the students left in the public school.' },
    { fmt:'Casual 1v1', motion:'The US should fund election campaigns with taxes instead of private donations.',
      a:{ nm:'Mia', side:'For', face:'face51' }, b:{ nm:'Caleb', side:'Against', face:'face47' },
      open:48, drift:61, won:'a', score:'88 - 77', crowd:224, vol:389,
      rfd:'Mia wins by showing that candidates now spend their time answering to the people who finance access. Caleb makes the free-speech objection but never explains why taxpayers should accept private money deciding which candidates can afford to be heard.' },
    { fmt:'Casual 1v1', motion:'The US should ban members of Congress from trading stocks.',
      a:{ nm:'Malik', side:'For', face:'face47' }, b:{ nm:'Zoe', side:'Against', face:'face07' },
      open:52, drift:74, won:'a', score:'95 - 75', crowd:292, vol:467,
      rfd:'Malik wins because lawmakers receive market-moving information and write rules that change the value of what they own. Zoe argues that disclosure is enough and never explains how disclosure removes the conflict before a trade happens.' },
    { fmt:'Casual 1v1', motion:'The US should require paid family leave.',
      a:{ nm:'Claire', side:'For', face:'face48' }, b:{ nm:'Ben', side:'Against', face:'face53' },
      open:49, drift:67, won:'a', score:'89 - 77', crowd:212, vol:376,
      rfd:'Claire wins by showing that an unpaid right is no right for the worker who cannot miss a paycheck. Ben identifies the burden on small employers and never offers another way to keep a new parent from choosing between income and care.' },
    { lead:true, fmt:'Casual 1v1', motion:'The US should make public college free.',
      a:{ nm:'Lucas', side:'For', face:'face52' }, b:{ nm:'Faith', side:'Against', face:'face35' },
      open:51, drift:39, won:'b', score:'76 - 88', crowd:247, vol:414,
      rfd:'Faith wins because a universal subsidy sends public money to wealthy students who would have paid anyway. Lucas proves tuition blocks capable students and never explains why targeted grants would not buy more access for the same budget.' },
    { fmt:'Casual 1v1', motion:'The US should require a year of community service after high school.',
      a:{ nm:'Natalie', side:'For', face:'face13' }, b:{ nm:'Nick', side:'Against', face:'face53' },
      open:50, drift:35, won:'b', score:'75 - 88', crowd:263, vol:431,
      rfd:'Nick wins because the policy takes a full year from every young adult regardless of their work, care duties or plans. Natalie proves shared service can build civic trust but never shows why a paid voluntary program could not produce the same benefit.' },
    { fmt:'Casual 1v1', motion:'The US should stop rents rising faster than inflation.',
      a:{ nm:'Adam', side:'For', face:'face47' }, b:{ nm:'Elena', side:'Against', face:'face13' },
      open:52, drift:34, won:'b', score:'77 - 88', crowd:281, vol:455,
      rfd:'Elena wins by arguing that repair and borrowing costs can rise faster than inflation, leaving landlords less willing to maintain or rent out homes. Adam makes the case for predictable rent, but does not explain how his cap would handle those costs.' },
    { fmt:'Casual 1v1', motion:'The US should tax homes that sit empty.',
      a:{ nm:'Abby', side:'For', face:'face20' }, b:{ nm:'Diego', side:'Against', face:'face46' },
      open:49, drift:64, won:'a', score:'88 - 82', crowd:205, vol:362,
      rfd:'Abby wins by tying the tax to scarce homes sitting unused while local buyers compete for too little supply. Diego raises seasonal homes and renovation gaps, but those cases can be exempted without protecting long-term vacancy.' },
    { fmt:'Casual 1v1', motion:'Cities should ban Airbnb rentals in residential neighborhoods.',
      a:{ nm:'Sofia', side:'For', face:'face30' }, b:{ nm:'Hunter', side:'Against', face:'face53' },
      open:50, drift:38, won:'b', score:'76 - 88', crowd:238, vol:401,
      rfd:'Hunter wins against the blanket ban by separating investor-run apartments from a resident renting a spare room. Sofia proves whole homes are being pulled from local housing and never explains why the narrower rule would fail.' },
    { fmt:'Casual 1v1', motion:'Cities should charge drivers to enter downtown.',
      a:{ nm:'Matt', side:'For', face:'face52' }, b:{ nm:'Nora', side:'Against', face:'face49' },
      open:48, drift:33, won:'b', score:'75 - 88', crowd:251, vol:419,
      rfd:'Nora wins on the worker whose shift starts before transit runs and whose job is inside the fee zone. Matt proves pricing cuts traffic and pollution, but never makes the charge fair where a practical alternative does not exist.' },
    { fmt:'Casual 1v1', motion:'Public schools should ban smartphones for the entire school day.',
      a:{ nm:'Lily', side:'For', face:'face49' }, b:{ nm:'Aaron', side:'Against', face:'face54' },
      open:51, drift:70, won:'a', score:'88 - 79', crowd:289, vol:462,
      rfd:'Lily wins because a schoolwide ban removes the social cost from the student who would otherwise have to put the phone away alone. Aaron raises emergencies, and Lily answers them with the school office and narrow medical exceptions.' },
    { fmt:'Casual 1v1', motion:'Schools should group students by ability.',
      a:{ nm:'Cole', side:'For', face:'face47' }, b:{ nm:'Megan', side:'Against', face:'face52' },
      open:50, drift:37, won:'b', score:'75 - 89', crowd:233, vol:395,
      rfd:'Megan wins because a placement made early becomes a label that changes teacher expectations and the quality of instruction a student receives. Cole proves one pace cannot fit every classroom and never builds a reliable path between groups.' },
    { fmt:'Casual 1v1', motion:'Schools should let students use AI tutors instead of doing traditional homework.',
      a:{ nm:'Camila', side:'For', face:'face20' }, b:{ nm:'Ian', side:'Against', face:'face46' },
      open:49, drift:65, won:'a', score:'88 - 80', crowd:271, vol:443,
      rfd:'Camila wins by showing how immediate feedback can stop a student from practicing the same mistake all evening. Ian raises dependence on the tool, but never answers her requirement that students explain the work themselves in class.' },
    { fmt:'Casual 1v1', motion:'Social media apps should check every user’s age.',
      a:{ nm:'Ryan', side:'For', face:'face51' }, b:{ nm:'Paige', side:'Against', face:'face11' },
      open:52, drift:36, won:'b', score:'78 - 88', crowd:298, vol:472,
      rfd:'Paige wins by asking how a platform would verify age without retaining sensitive identity data. Ryan shows why a simple checkbox is weak, but does not explain how his proposed checks would avoid the privacy risk she identifies.' },
    { fmt:'Casual 1v1', motion:'Social media apps should ban political ads.',
      a:{ nm:'Taylor', side:'For', face:'face23' }, b:{ nm:'Sam', side:'Against', face:'face53' },
      open:50, drift:40, won:'b', score:'75 - 88', crowd:276, vol:449,
      rfd:'Sam wins by arguing that unknown candidates rely more on paid reach than politicians who already attract attention. Taylor identifies misleading targeted messages, but does not explain why an ad ban is preferable to public records of who paid for each message.' },
    { fmt:'Casual 1v1', motion:'The US should ban companies from selling your location data.',
      a:{ nm:'Andrew', side:'For', face:'face46' }, b:{ nm:'Ashley', side:'Against', face:'face54' },
      open:51, drift:76, won:'a', score:'95 - 74', crowd:258, vol:426,
      rfd:'Andrew wins because a trail of where someone sleeps, works and travels cannot be made harmless by removing a name that can be inferred again. Ashley defends free services funded by data and never proves that they need a precise location history rather than less sensitive advertising signals.' },
    { fmt:'Casual 1v1', motion:'The US should never force messaging apps to let it read private messages.',
      a:{ nm:'Henry', side:'For', face:'face03' }, b:{ nm:'Amy', side:'Against', face:'face49' },
      open:48, drift:69, won:'a', score:'89 - 76', crowd:244, vol:408,
      rfd:'Henry wins because a special route into encrypted messages is still a vulnerability that hostile states and criminals can find. Amy proves investigators sometimes need the content and never shows how a backdoor remains available only to the government that requested it.' },
    /* 2026-09-02, per the founder ("add options for 'democrats versus
       republicans' basic prompts and titles to some"). Plain partisan
       clashes in the words a stranger would use, each under a short title.
       Same rules as the rest of the deck: contested, never targeted, and
       every ballot names only the two people in the round. Names reuse the
       existing cast so castFaces deals them a portrait. */
    { lead:true, title:'Democrats vs Republicans', fmt:'Casual 1v1', motion:'Democrats are better for the US economy than Republicans.',
      a:{ nm:'Grace', side:'For', face:'face49' }, b:{ nm:'Ryan', side:'Against', face:'face47' },
      open:50, drift:41, won:'b', score:'79 - 86', crowd:231, vol:402,
      rfd:'Ryan wins by showing that Grace has not separated the effects of party policy from the economic conditions each president inherited. Her comparisons show different outcomes, but do not establish that the party in office caused the difference.' },
    { title:'Democrats vs Republicans', fmt:'Casual 1v1', motion:'Republicans should raise taxes on the wealthy to cut taxes for low-paid workers.',
      a:{ nm:'Ben', side:'For', face:'face48' }, b:{ nm:'Zoe', side:'Against', face:'face51' },
      open:49, drift:63, won:'a', score:'86 - 78', crowd:219, vol:388,
      rfd:'Ben wins by making the party choose who its tax policy is meant to help. Zoe raises the risk to investment, but never shows why that cost outweighs leaving more money with workers who need it for everyday bills.' },
    { title:'Democrats vs Republicans', fmt:'Casual 1v1', motion:'Democrats should drop unpopular policies to win over moderate voters.',
      a:{ nm:'Natalie', side:'For', face:'face54' }, b:{ nm:'Diego', side:'Against', face:'face46' },
      open:51, drift:33, won:'b', score:'76 - 84', crowd:204, vol:371,
      rfd:'Diego wins because changing a position whenever it polls badly leaves voters unsure what they are electing. Natalie argues that winning is necessary to govern, but never explains how the party keeps trust after abandoning its promises.' },
    { lead:true, title:'Democrats vs Republicans', fmt:'Casual 1v1', motion:'America needs a third major party.',
      a:{ nm:'Caleb', side:'For', face:'face53' }, b:{ nm:'Jenna', side:'Against', face:'face52' },
      open:50, drift:36, won:'b', score:'77 - 85', crowd:197, vol:350,
      rfd:'Jenna wins by asking how a new party would win seats under winner-take-all elections. Caleb shows frustration with the two existing parties, but does not explain how his proposal would avoid splitting voters who share its goals.' },
    /* 2026-09-09, per the founder: "taxes on the rich should go up" was too
       vague to argue, so it names a threshold and a rate now. The old wording
       let each side pick its own rich person and its own tax, which is how a
       round ends with both debaters agreeing and still disagreeing. Its
       ballot moved with it: the old one turned on capital flight, and the
       specific version turns on valuation and on what the fortune earns
       sitting still. */
    { title:'Left vs Right', fmt:'Casual 1v1', motion:'The US should tax wealth over $50 million at 2% a year.',
      a:{ nm:'Elena', side:'For', face:'face49' }, b:{ nm:'Hunter', side:'Against', face:'face48' },
      open:50, drift:62, won:'a', score:'87 - 78', crowd:240, vol:410,
      rfd:'Elena wins by arguing that accumulated wealth is a better measure of ability to pay than annual salary alone. Hunter raises the difficulty of valuing private businesses, and Elena answers with independent valuations and payment plans.' },
    { title:'Left vs Right', fmt:'Casual 1v1', motion:'The US should make it easier for foreign workers to get permanent residency.',
      a:{ nm:'Luke', side:'For', face:'face47' }, b:{ nm:'Paige', side:'Against', face:'face54' },
      open:52, drift:66, won:'a', score:'85 - 77', crowd:226, vol:395,
      rfd:'Luke wins by showing why people who build a working life in the country need a stable future there. Paige raises pressure on housing and services, but never explains why keeping those workers on temporary status solves it.' },
    { title:'Left vs Right', fmt:'Casual 1v1', motion:'The US should replace private health insurance with one public plan.',
      a:{ nm:'Camila', side:'For', face:'face51' }, b:{ nm:'Matt', side:'Against', face:'face46' },
      open:50, drift:44, won:'b', score:'80 - 86', crowd:233, vol:404,
      rfd:'Matt wins by arguing that a single public insurer leaves patients with fewer options when it refuses to cover a treatment. Camila makes the case for simpler universal coverage, but does not explain how her plan would resolve disputed coverage decisions.' },
    /* 2026-09-09, per the founder ("some of our most interesting /
       controversial / fun to watch debates on the screen too"). The 09-02
       batch above did what it was asked to do and left the deck in one
       register: nearly every card is now a policy question about the United
       States, and eight in a row read as the same argument with the nouns
       changed. These twenty are the watchable half of the board. Each one
       passes two tests. A stranger can take a side inside five seconds
       without knowing any policy, and two reasonable people who agree about
       tariffs still disagree about this.
       The 08-19 exclusion did the most work in drafting: several obvious
       "spicy" motions were cut because their charge comes from putting a
       group's rights up for a vote, which is targeted rather than
       contested. Nothing on the soul.md content boundary is on this board.
       Casual 1v1 on every card, per the 08-27 call. Competitive format
       names survive above only on cards authored before it.
       Six of these seats exist for a mechanical reason as well as an
       editorial one. Jake, Marcus, Tyler, Danny, Kevin and Vanessa were all
       authored into FS_MALE / FS_FEMALE and cast into no round, so six
       portraits sat on the bench on every single load, which is exactly the
       "missing images in circulation" the 08-24 pass was written to fix.
       Casting them puts the men's roster back within one of its bank.
       SAME DAY, second pass, per the founder reading the board back: eleven
       cards struck and the lead rail re-cut. The strikes were the algorithms
       and tobacco card, free transit, five homes, employer healthcare, AI
       paying creators, nuclear against wind and solar, private jets, the
       drinking age, climate displacement, new oil and gas, and the fifteen
       dollar minimum wage. Read them together and the reason is one thing
       rather than eleven: they are the cards a reader can guess the shape of
       before the ballot loads, and four of them were the same climate
       argument wearing four hats. His call, and the useful half of it is
       that "no climate cards" is now a fact about this deck, not a taste.
       The reparations card was not struck but was made SPECIFIC at his
       request, Europe to Africa rather than rich countries to countries they
       colonised, because the abstract version lets both sides argue about a
       different pair of countries all round. Its ballot moved with it, since
       an rfd that says nobody named who pays is false once the motion does.
       And `lead` is a real rail again. It had drifted to 53 of 101 cards,
       which is not a rail, it is the deck. It is now the 39 cards that can
       hold a stranger who has never watched a round: the twenty above, the
       partisan block, and the culture and money cards that were already
       carrying it. Everything else is a good round nobody arrives for.
       The opener rule draws from that bucket, so the first card a cold
       visitor meets is one of them. */
    { lead:true, fmt:'Casual 1v1', motion:'Ghosting someone after one date is fine.',
      a:{ nm:'Tyler', side:'For', face:'face49' }, b:{ nm:'Nora', side:'Against', face:'face18' },
      open:47, drift:33, won:'b', score:'78 - 90', crowd:231, vol:398,
      rfd:'Nora wins. A short message gives someone clarity. Avoiding a few uncomfortable words leaves the other person guessing.' },
    { lead:true, fmt:'Casual 1v1', motion:'You should tell your friends how much you earn.',
      a:{ nm:'Jake', side:'For', face:'face52' }, b:{ nm:'Grace', side:'Against', face:'face25' },
      open:44, drift:58, won:'a', score:'89 - 78', crowd:174, vol:322,
      rfd:'Jake wins by arguing that sharing salaries helps friends compare offers and negotiate pay. Grace raises privacy concerns, but does not answer his case for sharing voluntarily with people they trust.' },
    { fmt:'Casual 1v1', motion:'The US should ban private schools.',
      a:{ nm:'Camila', side:'For', face:'face11' }, b:{ nm:'Owen', side:'Against', face:'face26' },
      open:51, drift:44, won:'b', score:'80 - 91', crowd:268, vol:441,
      rfd:'Owen wins by comparing a ban with investment in public schools. Camila shows that private tuition buys advantages, but does not explain how removing that option would improve teaching in the public system.' },
    { lead:true, fmt:'Casual 1v1', motion:'Couples should split bills based on income, not 50/50.',
      a:{ nm:'Aaron', side:'For', face:'face21' }, b:{ nm:'Ashley', side:'Against', face:'face35' },
      open:46, drift:62, won:'a', score:'90 - 79', crowd:203, vol:366,
      rfd:'Aaron wins. An equal bill can leave one person struggling while the other saves. Sharing the burden matters more than matching the amount.' },
    { lead:true, fmt:'Casual 1v1', motion:'You should stop inviting friends who always cancel plans.',
      a:{ nm:'Hannah', side:'For', face:'face07' }, b:{ nm:'Diego', side:'Against', face:'face33' },
      open:48, drift:55, won:'a', score:'87 - 76', crowd:259, vol:430,
      rfd:'Hannah wins. Repeated cancellations cost other people time. Good intentions do not make the lost evening come back.' },
    { lead:true, fmt:'Casual 1v1', motion:'Companies should publish every employee’s salary.',
      a:{ nm:'Ryan', side:'For', face:'face16' }, b:{ nm:'Zoe', side:'Against', face:'face41' },
      open:53, drift:40, won:'b', score:'76 - 88', crowd:288, vol:452,
      rfd:'Zoe wins by distinguishing pay transparency from publishing each person’s earnings. Ryan shows that secrecy can hide unfair pay, but does not explain why salary bands and pay audits would not address it with less intrusion.' },
    { fmt:'Casual 1v1', motion:'Museums should return objects taken from former colonies.',
      a:{ nm:'Cole', side:'For', face:'face28' }, b:{ nm:'Megan', side:'Against', face:'face38' },
      open:45, drift:57, won:'a', score:'86 - 77', crowd:162, vol:300,
      rfd:'Cole wins by arguing that returning ownership need not end public access because museums can negotiate loans. Megan raises conservation concerns, but does not show why care agreements would require the current museum to keep ownership.' },
    { fmt:'Casual 1v1', motion:'Banks should stop customers from borrowing money to buy cryptocurrency.',
      a:{ nm:'Faith', side:'For', face:'face13' }, b:{ nm:'Ian', side:'Against', face:'face31' },
      open:50, drift:61, won:'a', score:'85 - 74', crowd:149, vol:288,
      rfd:'Faith wins by comparing the lasting burden of debt with the freedom to risk money someone already owns. Ian defends access to credit, but never answers her concern that customers could lose the investment and still owe the bank.' },
    { lead:true, fmt:'Casual 1v1', motion:'Flirting with an AI should count as cheating.',
      a:{ nm:'Sydney', side:'For', face:'face20' }, b:{ nm:'Matt', side:'Against', face:'face36' },
      open:47, drift:36, won:'b', score:'79 - 89', crowd:241, vol:404,
      rfd:'Matt wins by asking what commitment was actually broken when no other person is involved. Sydney shows that the habit can hurt a partner, but never explains why every hurtful habit should count as cheating.' },
    { fmt:'Casual 1v1', motion:'The US should give every adult $1,000 a month, even if they have a job.',
      a:{ nm:'Natalie', side:'For', face:'face37' }, b:{ nm:'Hunter', side:'Against', face:'face24' },
      open:49, drift:60, won:'a', score:'88 - 80', crowd:197, vol:349,
      rfd:'Natalie wins by showing why a payment people keep when they find work offers more security than support that disappears. Hunter objects to paying wealthy recipients, but never answers her proposal to recover their share through taxes.' },
    { fmt:'Casual 1v1', motion:'New employees should work in the office for their first six months.',
      a:{ nm:'Abby', side:'For', face:'face43' }, b:{ nm:'Sam', side:'Against', face:'face40' },
      open:46, drift:59, won:'a', score:'84 - 76', crowd:186, vol:331,
      rfd:'Abby wins by showing how a newcomer learns from questions and conversations they would not know to schedule. Sam makes the case for flexibility, but never provides an equally reliable way to get that informal help remotely.' },
    { lead:true, fmt:'Casual 1v1', motion:'You should choose a degree for its earning potential rather than your passion.',
      a:{ nm:'Marcus', side:'For', face:'face63' }, b:{ nm:'Lily', side:'Against', face:'face32' },
      open:45, drift:38, won:'b', score:'77 - 87', crowd:264, vol:437,
      rfd:'Lily wins by arguing that likely earnings must be weighed against the risk of leaving work someone dislikes. Marcus emphasizes the cost of tuition, but does not compare the salary advantage with the cost of abandoning that career.' },
    { fmt:'Casual 1v1', motion:'Zoos should stop breeding animals that cannot be released into the wild.',
      a:{ nm:'Maddie', side:'For', face:'face57' }, b:{ nm:'Ben', side:'Against', face:'face42' },
      open:55, drift:45, won:'b', score:'78 - 86', crowd:143, vol:278,
      rfd:'Ben wins by explaining why a captive population can preserve a species while its habitat remains unsafe. Maddie makes the welfare cost clear, but never answers what happens when stopping breeding means losing that population altogether.' },
    { lead:true, fmt:'Casual 1v1', motion:'You should delete photos of your ex when you start a new relationship.',
      a:{ nm:'Andrew', side:'For', face:'face34' }, b:{ nm:'Jenna', side:'Against', face:'face58' },
      open:44, drift:35, won:'b', score:'79 - 90', crowd:274, vol:448,
      rfd:'Jenna wins by distinguishing keeping a record of the past from wanting to return to it. Andrew argues that deleting the photos would reassure a new partner, but does not explain why keeping private memories violates a present commitment.' },
    { lead:true, fmt:'Casual 1v1', motion:'Parents should charge rent once their adult children have full-time jobs.',
      a:{ nm:'Rose', side:'For', face:'face59' }, b:{ nm:'Jon', side:'Against', face:'face44' },
      open:41, drift:34, won:'b', score:'77 - 85', crowd:121, vol:254,
      rfd:'Jon wins. Charging rent can delay saving for an independent home. Parents who can afford to help should give their children that start.' },
    { fmt:'Casual 1v1', motion:'AI videos of real people should require their consent, even when labeled fake.',
      a:{ nm:'Alex', side:'For', face:'face22' }, b:{ nm:'Paige', side:'Against', face:'face60' },
      open:48, drift:57, won:'a', score:'86 - 78', crowd:212, vol:372,
      rfd:'Alex wins because a label can disappear when a clip is shared while the person’s face stays attached. Paige defends parody, but never offers a reliable way to keep the disclosure with every copy.' },
    { lead:true, fmt:'Casual 1v1', motion:'You should stay friends with people whose politics you hate.',
      a:{ nm:'Claire', side:'For', face:'face61' }, b:{ nm:'Kevin', side:'Against', face:'face19' },
      open:50, drift:58, won:'a', score:'85 - 79', crowd:233, vol:396,
      rfd:'Claire wins by arguing that a disagreement can be challenged within a friendship. Kevin explains why the views offend him, but does not show that remaining friends would require endorsing those views.' },
    { fmt:'Casual 1v1', motion:'Adult children owe their parents financial help, even if they rarely speak.',
      a:{ nm:'Danny', side:'For', face:'face17' }, b:{ nm:'Amy', side:'Against', face:'face62' },
      open:43, drift:56, won:'a', score:'83 - 77', crowd:137, vol:271,
      rfd:'Danny wins by arguing that a parent’s unmet needs and an adult child’s ability to help can create an obligation even when contact is rare. Amy defends choosing which ties to maintain, but does not explain why distance alone should settle the question of support.' },
    { lead:true, fmt:'Casual 1v1', motion:'Dating apps should limit users to five new matches a week.',
      a:{ nm:'Vanessa', side:'For', face:'face56' }, b:{ nm:'Josh', side:'Against', face:'face48' },
      open:54, drift:64, won:'a', score:'85 - 78', crowd:252, vol:419,
      rfd:'Vanessa wins by showing why a limit gives each conversation a chance before the next match competes for attention. Josh defends having more options, but never answers the cost of treating every match as replaceable.' },
    { lead:true, fmt:'Casual 1v1', motion:'Art competitions should accept AI-generated work alongside human-made work.',
      a:{ nm:'Taylor', side:'For', face:'face23' }, b:{ nm:'Caleb', side:'Against', face:'face29' },
      open:42, drift:52, won:'a', score:'84 - 79', crowd:198, vol:358,
      rfd:'Taylor wins by asking the competition to judge the work against the same published criteria. Caleb argues that the process matters, but never explains why difficulty of production should outweigh what the finished piece achieves.' },
    { lead:true, title:'Israel and Palestine', fmt:'Casual 1v1', motion:'The US should recognize Palestine as a state before a final peace agreement.',
      a:{ nm:'Grace', side:'For', face:'face49' }, b:{ nm:'Ryan', side:'Against', face:'face47' },
      open:50, drift:59, won:'a', score:'86 - 80', crowd:213, vol:374,
      rfd:'Grace wins by showing how recognition gives negotiations a defined political goal. Ryan argues that recognition should follow an agreement, but never explains why waiting would bring that agreement closer.' },
    { lead:true, title:'Israel and Palestine', fmt:'Casual 1v1', motion:'The US should pause military aid to Israel until it freezes West Bank settlement building.',
      a:{ nm:'Claire', side:'For', face:'face52' }, b:{ nm:'Nick', side:'Against', face:'face53' },
      open:50, drift:42, won:'b', score:'79 - 87', crowd:228, vol:392,
      rfd:'Nick wins by distinguishing settlement policy from defense commitments. Claire shows that aid gives the US influence, but never explains why a blanket pause would change settlement decisions more effectively than restrictions aimed at those projects.' },
    { lead:true, title:'Israel and Palestine', fmt:'Casual 1v1', motion:'Countries should ban imports from Israeli settlements in the West Bank.',
      a:{ nm:'Faith', side:'For', face:'face35' }, b:{ nm:'Hunter', side:'Against', face:'face48' },
      open:50, drift:61, won:'a', score:'88 - 81', crowd:205, vol:359,
      rfd:'Faith wins by targeting trade with settlements rather than all Israeli businesses. Hunter argues that the ban would hurt workers, but never weighs that cost against the economic incentive to keep expanding settlements.' },
    { lead:true, title:'Israel and Palestine', fmt:'Casual 1v1', motion:'Universities should cut ties with Israeli universities as a form of political protest.',
      a:{ nm:'Cole', side:'For', face:'face47' }, b:{ nm:'Megan', side:'Against', face:'face52' },
      open:50, drift:40, won:'b', score:'78 - 86', crowd:219, vol:383,
      rfd:'Megan wins by showing that a boycott cuts off students and researchers who do not control government policy. Cole argues that institutions should face pressure, but never demonstrates why ending those partnerships would change state decisions.' },
    { lead:true, title:'Israel and Palestine', fmt:'Casual 1v1', motion:'Israelis and Palestinians would be better off in two states than in one shared state.',
      a:{ nm:'Luke', side:'For', face:'face47' }, b:{ nm:'Paige', side:'Against', face:'face54' },
      open:50, drift:57, won:'a', score:'85 - 80', crowd:237, vol:406,
      rfd:'Luke wins by giving both populations a path to political self-government. Paige argues that a shared state avoids partition, but never explains how its institutions would earn enough trust from both communities.' },
    /* 2026-08-24, per the founder ("i also want to see the influencers/celebs
       here"). These were introduced as a DIFFERENT KIND OF CARD and the difference is
       the whole reason they are allowed on this board. soul.md is explicit:
       never caption a real person with an invented name, score, or ballot,
       and never name a creator as a participant in a round that has not
       happened. So a challenge card carries no verdict, no speaker points,
       no viewer read and no ballot: it is an open seat with a resolution on
       it, labelled unaccepted, in the same words the watchlist band already
       uses ("none confirmed, none affiliated, none endorsing"). The motion
       is what the room would put to them, never a position attributed to
       them, which is why no side is printed against a creator tile.
       Portraits are the same CC or public-domain files as the watchlist,
       credited in /img/creator-watchlist/README.md. If a creator ever
       actually debates, that round belongs in the deck above with a real
       ballot, not here. Four of the original ten were founder-struck on
       2026-09-02, leaving the six below. */
    { kind:'challenge', openTopic:true, fmt:'Open challenge', motion:'Round of your choice.',
      a:{ nm:'MrBeast', img:'mrbeast' }, b:{ nm:'Open seat' } },
    { kind:'challenge', fmt:'Open challenge', motion:'You should take a year to pursue an online career before starting college.',
      a:{ nm:'IShowSpeed', img:'ishowspeed' }, b:{ nm:'Open seat' } },
    { lead:true, kind:'challenge', fmt:'Open challenge', motion:'Parents should set a daily time limit on teenagers watching streams.',
      a:{ nm:'Kai Cenat', img:'kaicenat' }, b:{ nm:'Open seat' } },
    { lead:true, kind:'challenge', fmt:'Open challenge', motion:'Political streamers should refuse money from political parties.',
      a:{ nm:'HasanAbi', img:'hasanabi' }, b:{ nm:'Open seat' } },
    { kind:'challenge', openTopic:true, fmt:'Open challenge', motion:'Round of your choice.',
      a:{ nm:'Destiny', img:'destiny' }, b:{ nm:'Open seat' } },
    { kind:'challenge', openTopic:true, fmt:'Open challenge', motion:'Round of your choice.',
      a:{ nm:'Lex Fridman', img:'lexfridman' }, b:{ nm:'Open seat' } }
  ];

  /* Wildcard matchups use the no-verdict invitation card. Untitled cards
     put the visitor in the second seat and recur throughout the deck. */
  ROUNDS.push(
    { kind:'challenge', matched:true, openTopic:true, fmt:'Open match', motion:'Round of your choice.',
      a:{ nm:'Sarah' }, b:{ nm:'Victor' } },
    { kind:'challenge', matched:true, openTopic:true, fmt:'Open match', motion:'Round of your choice.',
      a:{ nm:'Claire' }, b:{ nm:'Nick' } },
    { kind:'challenge', matched:true, openTopic:true, fmt:'Open match', motion:'Round of your choice.',
      a:{ nm:'Hannah' }, b:{ nm:'Malik' } },
    { kind:'challenge', matched:true, openTopic:true, fmt:'Open match', motion:'Round of your choice.',
      a:{ nm:'Lucas' }, b:{ nm:'Sofia' } },
    { lead:true, kind:'challenge', matched:true, openTopic:true, title:'Democrats vs Republicans', fmt:'Open match',
      motion:'Taxes, immigration, healthcare, or your own. Pick the fight.',
      a:{ nm:'Abby' }, b:{ nm:'Owen' } }
  );
  return ROUNDS;
};
