// debate-bank.mjs — data for the /debate/{slug} "debate dossier" pages.
//
// Each motion is a structured object the dossier renderer (debate.mjs)
// turns into a hero, clash compass, pro/con argument arena, sample-round
// transcript, judge ballot, and related-motions block. Content is the
// single source of truth: edit a motion here and the rendered page,
// JSON-LD, and hub all update. To add a motion, append an entry and add
// its slug to the sitemap URLS array in netlify/functions/sitemap.mjs.
//
// Voice rules (soul.md): no em-dashes, no banned phrases, no villain
// lines about other tools, impact-calculus arguments (magnitude /
// probability / timeframe). Coach register, not seminar.
//
// Schema per motion:
//   slug, title, eyebrow, category, difficulty, formats, mainClash,
//   subtitle, description, keywords[], bestFor[]
//   clash: { question, axis, pro:{label,points[]}, con:{label,points[]} }
//   pro/con: { thesis, args:[{ n, title, claim, warrant, impact, weakSpot }] }
//   round: [{ side:'pro'|'con', speech, text, note, badge }]
//   ballot: { winner, side:'pro'|'con', margin, rfd, keyClash, proFeedback, conFeedback, drill }
//   related: [slug]   drills: [{ label, motion }]

export const MOTION_BANK = {

  'should-ai-be-regulated': {
    slug: 'should-ai-be-regulated',
    title: 'Should AI Be Regulated?',
    eyebrow: 'AI Regulation · Live Motion',
    category: 'AI Regulation',
    difficulty: 'Medium',
    formats: 'Quick Clash / BP / PF adaptable',
    mainClash: 'Safety vs innovation',
    subtitle: 'A live circuit motion with a clean central tradeoff: public harm reduction versus the innovation and security ground regulation costs.',
    description: 'Both sides of "Should AI be regulated?" argued out by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['should ai be regulated', 'ai regulation debate', 'arguments for and against ai regulation', 'ai policy debate'],
    bestFor: ['Weighing', 'Impact comparison', 'Regulatory design'],
    clash: {
      question: 'Does binding regulation prevent more harm than the innovation and security ground it costs?',
      axis: 'Win this trade and you probably win the ballot.',
      pro: { label: 'Regulate', points: ['Prevents bias at population scale', 'Creates a liable party when models fail', 'Trusted, auditable models clear export markets'] },
      con: { label: 'Do not overregulate', points: ['Fixed compliance cost favors incumbents', 'Capture turns rules into a moat', 'Unilateral slowdown cedes the lead'] },
    },
    pro: {
      thesis: 'Unregulated AI fails the people least able to absorb the cost, and the harm is present-tense, not hypothetical.',
      args: [
        { n: 1, title: 'Scale of harm', claim: 'AI already decides hiring, lending, policing, and medical access.', warrant: 'The harm lands before the individual knows they were scored at all.', impact: 'Errors compound across millions with no one accountable.', weakSpot: 'Con will say audits can be voluntary and rules freeze progress.' },
        { n: 2, title: 'Liability gap', claim: 'When a model is wrong, today no one owns the failure.', warrant: 'Disclosure and audit duties force a named, liable party into the loop.', impact: 'Accountability is what turns a diffuse risk into a fixable one.', weakSpot: 'Con will say tort law already assigns liability without a new regime.' },
        { n: 3, title: 'Trust is leverage', claim: 'A standard nobody trusts is not a competitive advantage.', warrant: 'Auditable models are the ones that clear other markets and buyers.', impact: 'Safety and competitiveness point the same way, not opposite ways.', weakSpot: 'Con will say the market prices trust on its own, no mandate needed.' },
      ],
    },
    con: {
      thesis: 'Premature, broad regulation slows the tools that solve the same harms Pro names, and consolidates the market while doing it.',
      args: [
        { n: 1, title: 'Innovation drag', claim: 'Compliance cost is fixed, so it punishes small labs and open research.', warrant: 'Incumbents can staff a legal team; a two-person lab cannot.', impact: 'The net effect is consolidation, which is the opposite of safety.', weakSpot: 'Pro will say risk-tiering scales the burden with model risk.' },
        { n: 2, title: 'Capture risk', claim: 'The largest players write the rules that lock out the next competitor.', warrant: '"Risk-based" thresholds get lobbied into a moat with a compliance label.', impact: 'You buy a permanent incumbent advantage, not public safety.', weakSpot: 'Pro will say capture is an argument for better rules, not none.' },
        { n: 3, title: 'Strategic cost', claim: 'A unilateral slowdown does not stop the technology, only your share of it.', warrant: 'Rivals keep building and inherit the standard-setting power you drop.', impact: 'You lose the lead and the leverage in one move, hard to reverse.', weakSpot: 'Pro will say speed without liability just externalizes the risk.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Unregulated AI fails the people least able to absorb the cost. Hiring models, lending scores, and predictive policing already encode bias at a scale no human review can catch, and the harm lands on millions before anyone audits the system. Regulation forces pre-deployment testing, disparate-impact disclosure, and a liable party when the model is wrong.', note: 'Strong magnitude and timeframe. Mechanism is still vague: which rule, on whom?', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: 'Pro names a real harm and prescribes the wrong cure. Compliance cost is fixed, so it falls hardest on small labs and open research, not the incumbents who can staff a legal department. The net effect of heavy rules is consolidation. And a unilateral slowdown does not stop the technology; it just hands the lead and the standard to rivals who keep building.', note: 'Clean turn. Reframes Pro\'s cure as a cost. Wins ground on incumbents.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'The consolidation point cuts the other way. Tiered rules scale with model risk, so a two-person lab shipping a recommendation tool faces light duties and a frontier lab faces real ones. And a standard nobody trusts is not leverage. The country that proves its models are auditable is the one whose exports clear other markets.', note: 'Risk-tiering answers the small-lab attack. Border-standards point goes unanswered later.', badge: 'Recovers' },
      { side: 'con', speech: 'Con · weighing', text: '"Tiered and risk-based" is the version that works on a whiteboard. In practice the thresholds get captured by the largest players, who lobby for rules that lock out the next competitor. Keep the targeted fixes Pro likes, transparency on automated decisions and liability for provable harm, and you get most of the benefit without betting the whole ecosystem on a regulator drawing the line exactly right.', note: 'The closing concession quietly grants Pro\'s core mechanism: transparency + liability.', badge: 'Concedes mechanism' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'The round turns on whether regulation can be targeted without being captured. Con wins that broad regulation creates innovation drag and incumbent lock-in. Pro wins that the harms are real and present, but never specifies a regulatory design narrow enough to dodge Con\'s costs. On the motion as worded, the abstract "should AI be regulated," Con\'s implementation attack carries.',
      keyClash: 'Regulation good in theory vs regulation as implemented.',
      proFeedback: 'Strong moral urgency and the best impact in the room. Weak policy design: you needed a model, not a principle.',
      conFeedback: 'Strong tradeoff framing and the cleanest turn. Engage the bias victims more; you let Pro own the human harm unchallenged.',
      drill: 'Give Pro a narrower model: mandatory audits for high-risk systems only, not a blanket AI licensing regime. Then see if Con\'s drag argument still bites.',
    },
    related: ['should-ai-generated-art-be-copyrighted', 'will-ai-replace-human-jobs', 'should-students-be-allowed-to-use-ai', 'should-the-us-ban-tiktok'],
    drills: [
      { label: 'Practice weighing safety vs innovation', motion: 'This house would impose binding safety regulation on frontier AI models' },
      { label: 'Defend a narrow regulation model', motion: 'This house would require third-party audits for high-risk AI systems only' },
      { label: 'Answer "innovation solves"', motion: 'This house believes AI harms are better fixed by competition than by regulation' },
    ],
  },

  'will-ai-replace-human-jobs': {
    slug: 'will-ai-replace-human-jobs',
    title: 'Will AI Replace Human Jobs?',
    eyebrow: 'AI & Labor · Live Motion',
    category: 'AI & Labor',
    difficulty: 'Medium',
    formats: 'PF / Parli / Quick Clash',
    mainClash: 'Replacement vs reshaping',
    subtitle: 'A motion that lives or dies on one number: the speed of the transition versus the speed of retraining.',
    description: 'Will AI take human jobs or move them? Both sides argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['will ai replace jobs', 'ai job loss debate', 'ai automation jobs arguments', 'ai unemployment debate'],
    bestFor: ['Economic weighing', 'Timeframe analysis', 'Burden framing'],
    clash: {
      question: 'Does new work absorb the loss faster than AI creates it, or does the displacement outrun the adjustment?',
      axis: 'Whoever proves the speed of the transition wins.',
      pro: { label: 'Replaced', points: ['This wave automates judgment, not muscle', 'Transition outpaces retraining', 'Entry rungs vanish first'] },
      con: { label: 'Reshaped', points: ['Net employment rose every prior wave', 'Tools raise the value of paired humans', 'The task mix changes, not headcount'] },
    },
    pro: {
      thesis: 'Past automation replaced muscle; this replaces judgment, and the speed is the harm.',
      args: [
        { n: 1, title: 'Judgment, not muscle', claim: 'Drafting, support, analysis, and translation are being absorbed now.', warrant: 'These are the core of most desk jobs, not the edges.', impact: 'The reach is white-collar work, not just the factory floor.', weakSpot: 'Con will say each tool augments rather than removes the worker.' },
        { n: 2, title: 'Speed of the cliff', claim: 'A tool can eat a role in two years; the worker does not get two years.', warrant: 'Retraining worked when the shift took a generation, not a product cycle.', impact: 'The gap between displacement and adjustment is where real damage lives.', weakSpot: 'Con will say speed is an argument for policy, not proof of net loss.' },
        { n: 3, title: 'Broken ladder', claim: 'Entry-level rungs are the first tasks a model can do end to end.', warrant: 'Firms cut the cheap junior work before the expensive senior work.', impact: 'You break the career ladder a generation needed to climb.', weakSpot: 'Con will say new entry roles emerge around the tools themselves.' },
      ],
    },
    con: {
      thesis: 'Every wave triggered the same forecast, and employment kept rising because tools raise the value of the humans paired with them.',
      args: [
        { n: 1, title: 'Historical base rate', claim: 'Net employment rose through every prior automation wave.', warrant: 'Cheaper output raises demand, which raises the work to be done.', impact: 'The base rate is strongly against "this time the jobs vanish."', weakSpot: 'Pro will say prior waves never automated cognition this broadly.' },
        { n: 2, title: 'Augmentation', claim: 'A model that drafts faster makes one analyst do the work of three.', warrant: 'The firm responds by doing three times the analysis, not firing two.', impact: 'Headcount holds where the firm can sell the extra output.', weakSpot: 'Pro will say that only holds where demand is elastic.' },
        { n: 3, title: 'Task mix, not headcount', claim: 'What changes is the set of tasks inside a job, not the job count.', warrant: 'Roles reshape around the tool the way they did around spreadsheets.', impact: '"Replace" overstates a real but narrower shift.', weakSpot: 'Pro will say reshaping at this speed is displacement by another name.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Past automation replaced muscle. This replaces judgment, and judgment is what most desk jobs are. Drafting, support, basic analysis, and translation are being absorbed now, not in some future decade. The harm is not that work vanishes forever. It is the speed. When a tool eats a role in two years, the worker does not have two years to retrain.', note: 'Reframes the resolution around speed. Smart, because net-headcount is a losing fight.', badge: 'Strong frame' },
      { side: 'con', speech: 'Con · response', text: 'Every wave of automation triggered the same forecast, and employment kept rising because tools raise the value of the humans paired with them. A model that drafts faster makes one analyst do the work of three; the firm responds by doing three times the analysis, not firing two people. What changes is the task mix inside a job, not the headcount.', note: 'Owns the base rate cleanly. Nobody rebuts that total jobs rose.', badge: 'Wins base rate' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'The historical analogy assumes retraining keeps pace. It did when the shift took a generation. It does not when it takes a product cycle. And "the firm does more analysis" only holds where demand is elastic. In plenty of sectors it is not, and there the gain shows up as a smaller payroll, not more output.', note: 'Elasticity point is the right answer to augmentation. Lands.', badge: 'Good answer' },
      { side: 'con', speech: 'Con · weighing', text: 'Then the resolution is mis-framed. The problem Pro describes is transition speed, which is a case for retraining policy and a slower rollout, not proof that the jobs are gone. Concede the painful adjustment and you still do not get to "replace." You get "reshape, with a hard few years for the people on the wrong side of the curve."', note: 'Forces Pro to concede a "hard few years," which is most of what Pro needed anyway.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'Both sides agreed more than they admitted. The disagreement is timeframe versus net headcount. Con won the long-run net-employment point cleanly. Pro reframed the harm as speed and forced Con to concede a "hard few years," which is most of what Pro needed. On the literal wording, Con edges it: jobs move more than they vanish. On impact, Pro lands the heavier blow.',
      keyClash: 'Net headcount over decades vs the speed of displacement now.',
      proFeedback: 'The speed reframe was the right call. Push the elasticity point harder; it is your cleanest win and you dropped it after one mention.',
      conFeedback: 'Base rate carried you. You let Pro own the human cost of the transition. Name a worker, not just a statistic.',
      drill: 'Run it as Pro but commit to one sector with inelastic demand. Make the judge feel the payroll shrink, do not just assert it.',
    },
    related: ['should-ai-be-regulated', 'should-students-be-allowed-to-use-ai', 'universal-basic-income', 'should-ai-generated-art-be-copyrighted'],
    drills: [
      { label: 'Practice timeframe weighing', motion: 'This house believes AI will destroy more jobs than it creates within a decade' },
      { label: 'Defend the augmentation case', motion: 'This house believes AI will reshape work without reducing total employment' },
      { label: 'Argue the broken-ladder harm', motion: 'This house believes AI most threatens entry-level and early-career workers' },
    ],
  },

  'should-students-be-allowed-to-use-ai': {
    slug: 'should-students-be-allowed-to-use-ai',
    title: 'Should Students Be Allowed to Use AI in School?',
    eyebrow: 'AI & Education · Live Motion',
    category: 'AI & Education',
    difficulty: 'Easy',
    formats: 'PF / Parli / Quick Clash',
    mainClash: 'Access vs the struggle',
    subtitle: 'A motion every school is arguing right now, and one that usually narrows to a policy question, not a yes or no.',
    description: 'Should students use AI in school? Both sides argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['should students use ai in school', 'ai in education debate', 'should ai be allowed in schools', 'ai homework debate'],
    bestFor: ['Policy framing', 'Analogy testing', 'Feasibility weighing'],
    clash: {
      question: 'Does AI build the skill school exists to teach, or skip it?',
      axis: 'If it is a calculator for thinking, the fight is over which thinking we still do by hand.',
      pro: { label: 'Allow', points: ['A tutor for students without one', 'Teach the tools the world runs on', 'Bad assignments are the real problem'] },
      con: { label: 'Restrict', points: ['It automates the struggle that teaches', 'The deficit hides until the test', 'Default behavior is over-reliance'] },
    },
    pro: {
      thesis: 'Banning the tool students will use for life does not protect learning; it just makes school less honest about the world.',
      args: [
        { n: 1, title: 'Equity tutor', claim: 'AI is an always-available tutor that never runs out of patience.', warrant: 'The students who gain most are the ones who cannot afford a private one.', impact: 'The access gain lands fastest on the kids with the least.', weakSpot: 'Con will say a tutor that does the work is not tutoring.' },
        { n: 2, title: 'Real-world tools', claim: 'Schools should teach the tools the working world actually runs on.', warrant: 'The calculator did not end math; it moved the lesson up the stack.', impact: 'Banning the tool trains students for a world that no longer exists.', weakSpot: 'Con will say the calculator automates a mastered step, not the struggle.' },
        { n: 3, title: 'Redesign the task', claim: 'If a model can ace the assignment, the assignment tested the wrong thing.', warrant: 'Move assessment to live reasoning the tool cannot sit for you.', impact: 'You keep the rigor and the access at the same time.', weakSpot: 'Con will say most schools cannot redesign assessment overnight.' },
      ],
    },
    con: {
      thesis: 'AI automates the struggle, and the struggle is exactly where learning happens.',
      args: [
        { n: 1, title: 'The struggle is the point', claim: 'Outsource the first draft and you never build the muscle for the second.', warrant: 'Learning is the difficulty, not the output that follows it.', impact: 'You lose the one skill school exists to build.', weakSpot: 'Pro will say supervised use keeps the struggle while adding the tool.' },
        { n: 2, title: 'Invisible deficit', claim: 'The skill gap does not show until a test the tool cannot sit.', warrant: 'Fluent output masks the absence of the underlying ability.', impact: 'You discover the harm at the interview or the exam, too late to fix.', weakSpot: 'Pro will say live assessment surfaces the deficit early.' },
        { n: 3, title: 'Default is over-reliance', claim: 'The real-world default is quiet over-reliance, not Pro\'s supervised ideal.', warrant: 'The safe version needs a redesign most schools cannot ship fast.', impact: 'Policy should plan for the median classroom, not the best one.', weakSpot: 'Pro will say that argues for guardrails, not a ban.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Banning the tool students will use for the rest of their lives does not protect learning, it just makes school less honest about the world. The calculator did not end math. It moved the lesson up the stack to when you apply the result. Used in the open, AI becomes a tutor that is always available and never impatient, which matters most for the students who cannot afford a private one.', note: 'Equity framing is the strongest ground here. Calculator analogy invites the obvious turn.', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: 'The calculator analogy breaks on one point: a calculator automates a step you have already mastered. AI automates the struggle itself, and the struggle is where learning happens. Outsource the first draft and you never build the muscle that writes the second. The harm is quiet and compounding, and you will not see the deficit until the test where the tool is not allowed.', note: 'Lands the disanalogy. "Automates the struggle" is the line of the round.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'That assumes the assignment stays the same. It should not. If a model can write the five-paragraph essay, the essay was testing the wrong thing. Move the task to defending the argument out loud, where the tool cannot sit the exam for you. Con\'s struggle point is real, so design for it: allow AI for research and feedback, require the reasoning to be the student\'s own and assessed live.', note: 'Good pivot, but the fix concedes that unsupervised use should be restricted.', badge: 'Concedes ground' },
      { side: 'con', speech: 'Con · weighing', text: '"Redesign every assessment" is the cost Pro keeps waving away. Most schools cannot do that overnight, so in the real transition the default is quiet over-reliance, not Pro\'s well-supervised ideal. And notice Pro\'s own fix proves the point: the safe version requires a human defending reasoning out loud. That is a restriction on unsupervised use, which is most of what Con asked for.', note: 'Turns Pro\'s solution into Con\'s thesis. Feasibility does the work.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Pro', side: 'pro', margin: 'Narrow',
      rfd: 'This round narrowed well. By the end both sides agreed AI should be allowed for research and feedback and restricted on the assessment that proves the reasoning is the student\'s own. Pro won the equity impact and the framing that bad assignments, not the tool, are the problem. Con won the strongest practical point, that the safe version needs a redesign most schools cannot ship quickly. On "allowed in principle," Pro takes it; on "allowed with no guardrails," Con does.',
      keyClash: 'Allowed in principle vs allowed with no guardrails.',
      proFeedback: 'You won the principle. Pre-empt the feasibility attack next time: name the redesign and cost it, do not let Con own "the real world."',
      conFeedback: 'Feasibility was your best lane and you found it late. Open on it, not on the analogy.',
      drill: 'Defend the narrowest live policy: AI allowed for drafting and research, banned in graded assessment. See if either side can break it.',
    },
    related: ['should-ai-be-regulated', 'will-ai-replace-human-jobs', 'should-ai-generated-art-be-copyrighted', 'should-social-media-be-banned-for-minors'],
    drills: [
      { label: 'Defend AI as an equity tool', motion: 'This house would allow students to use AI tutors for all coursework' },
      { label: 'Argue the skill-atrophy harm', motion: 'This house believes student AI use erodes the skills education exists to build' },
      { label: 'Build a workable school policy', motion: 'This house would permit AI for research but ban it in graded assessment' },
    ],
  },

  'should-ai-generated-art-be-copyrighted': {
    slug: 'should-ai-generated-art-be-copyrighted',
    title: 'Should AI-Generated Art Be Copyrighted?',
    eyebrow: 'AI & Copyright · Live Motion',
    category: 'AI & Copyright',
    difficulty: 'Hard',
    formats: 'LD / Parli / Quick Clash',
    mainClash: 'Authorship vs output',
    subtitle: 'A live courtroom question and a sharp motion, where both sides usually converge on the same line from opposite directions.',
    description: 'Should AI-generated art get copyright protection? Both sides argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['should ai art be copyrighted', 'ai art copyright debate', 'ai generated art copyright arguments', 'ai art intellectual property'],
    bestFor: ['Definition clash', 'Analogy testing', 'Threshold drawing'],
    clash: {
      question: 'Does protecting AI output reward human creation, or just reward owning the machine?',
      axis: 'The whole round is fought over where the authorship line sits.',
      pro: { label: 'Grant', points: ['Prompting and editing are real choices', 'No protection means no incentive', 'Photography is also selection'] },
      con: { label: 'Deny', points: ['The model performs the expressive act', 'It runs on uncompensated training data', 'Infinite output crowds out artists'] },
    },
    pro: {
      thesis: 'Copyright rewards the human choices that shape a work, and a finished image carries thousands of them.',
      args: [
        { n: 1, title: 'Human direction', claim: 'The prompt, edits, and selection from hundreds of failures are human choices.', warrant: 'Copyright protects the expressive judgment, and that judgment is human.', impact: 'The tool is a brush; denying the brush-user authorship is arbitrary.', weakSpot: 'Con will say choosing among outputs is curation, not creation.' },
        { n: 2, title: 'Incentive', claim: 'Deny protection and the work is instantly copyable by anyone.', warrant: 'No protection means no market, so no reason to invest in the careful version.', impact: 'You kill the incentive to make the good work over the lazy one.', weakSpot: 'Con will say the incentive then runs to whoever owns the most compute.' },
        { n: 3, title: 'Photography precedent', claim: 'Photography is selection from what the lens captured; we protect it.', warrant: 'Collage is arrangement of others\' work; we protect that too.', impact: 'Drawing the line specifically at AI is a double standard.', weakSpot: 'Con will say the photographer still aimed a device at a real moment.' },
      ],
    },
    con: {
      thesis: 'A brush does not generate the image; the model does, and the model was trained on millions of other people\'s protected work.',
      args: [
        { n: 1, title: 'Who created it', claim: 'The human picks among outputs they did not author.', warrant: '"I chose the good one" is curation, and copyright protects expression.', impact: 'The expressive act happened inside the model, not the prompt box.', weakSpot: 'Pro will say photography and collage are also acts of selection.' },
        { n: 2, title: 'Uncompensated source', claim: 'The causal chain runs through art the model never paid for.', warrant: 'Unlike a camera aimed at the world, the model resynthesizes others\' work.', impact: 'Granting rights launders uncompensated input into private property.', weakSpot: 'Pro will say training-data ethics is a separate question from authorship.' },
        { n: 3, title: 'Flooding', claim: 'Protection hands monopoly rights over near-infinite output to whoever prompts fastest.', warrant: 'Output scales with compute, not with creativity.', impact: 'You crowd out the human artists the system was built on.', weakSpot: 'Pro will say a higher originality threshold fixes flooding without a ban.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Copyright exists to reward the human choices that shape a work, and a finished image carries thousands of them: the prompt, the edits, the selection from hundreds of failures, the composition. The tool is a brush, not the author. Deny protection and you do not free the work, you make it instantly copyable by anyone, which kills the incentive to invest in producing it.', note: 'Incentive + authorship is the right pairing. "Brush, not author" invites the strongest turn.', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: 'A brush does not generate the image; the model does. The human picks among outputs they did not author, and "I chose the good one" is curation, not creation. Copyright protects expression, and the expressive work was done by a system trained on millions of other people\'s protected art. Grant it and you hand monopoly rights over near-infinite output to whoever runs the prompt fastest.', note: 'Curation-not-creation is the cleanest framing of the round. Strong.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'The curation line proves too much. Photography is selection from what the lens captured; collage is arrangement of others\' work. We protect both because the human judgment is the expression. Drawing the line at AI is arbitrary. On flooding: that is an argument for a higher originality threshold, not a blanket denial. Require demonstrable human authorship and the lazy one-prompt output fails the bar.', note: 'Photography analogy is good. But the threshold concession is the opening Con needs.', badge: 'Overreaches' },
      { side: 'con', speech: 'Con · weighing', text: 'Photography still requires capturing a real moment with a device you aimed; the causal chain runs through the human. With generation it runs through a model trained on uncompensated work. That is the disanalogy Pro keeps stepping over. And Pro\'s own fix, an originality threshold proving human authorship, is just Con\'s position with extra steps. If only the heavily human-directed pieces qualify, then "AI-generated art" as such still does not get protection.', note: 'Turns Pro\'s threshold into Con\'s thesis. The convergence decides it.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'Best clash of the set, because both sides converged on the same line from opposite directions: protection should track human authorship, not the tool. Con landed the cleaner disanalogy on photography and forced Pro\'s threshold concession. On the literal motion, copyright for AI-generated art as a category, that wins it. Pro wins the narrower and more defensible claim: heavily human-directed works should qualify.',
      keyClash: 'Selection as expression vs the model as the true author.',
      proFeedback: 'The photography analogy was your best weapon. Do not concede the originality threshold; it hands Con the category. Hold the line that selection alone is authorship.',
      conFeedback: 'You won by making Pro agree with you. Tighten the training-data point; you left magnitude on the table there.',
      drill: 'Argue Pro without ever conceding a threshold. Defend that prompt-and-select alone is enough for authorship, and make it stick.',
    },
    related: ['should-ai-be-regulated', 'will-ai-replace-human-jobs', 'should-students-be-allowed-to-use-ai', 'should-the-us-ban-tiktok'],
    drills: [
      { label: 'Defend selection as authorship', motion: 'This house would grant copyright to AI-assisted art directed by a human' },
      { label: 'Argue the training-data harm', motion: 'This house believes AI art built on scraped work should not be protected' },
      { label: 'Draw the authorship threshold', motion: 'This house would protect AI art only above a human-authorship threshold' },
    ],
  },

  'should-the-us-ban-tiktok': {
    slug: 'should-the-us-ban-tiktok',
    title: 'Should the US Ban TikTok?',
    eyebrow: 'Tech & Security · Live Motion',
    category: 'Tech & Security',
    difficulty: 'Medium',
    formats: 'PF / Parli / Congress',
    mainClash: 'Security vs speech',
    subtitle: 'A motion where the smartest debaters fight over the wording before they ever weigh: ban, or force a sale?',
    description: 'Should the US ban TikTok? The security case and the free-speech case argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side yourself.',
    keywords: ['should the us ban tiktok', 'tiktok ban debate', 'tiktok ban arguments for and against', 'tiktok national security debate'],
    bestFor: ['Probability vs certainty', 'Definition clash', 'Precedent weighing'],
    clash: {
      question: 'Is the security threat specific enough to justify silencing a platform 150 million Americans speak on?',
      axis: 'Probability of harm versus the certainty of the speech cost.',
      pro: { label: 'Ban', points: ['Adversary control of data and feed', 'Act before a catastrophic risk fires', 'A foreign state is not a US broker'] },
      con: { label: 'Do not ban', points: ['The speech loss is certain and immediate', 'Data leaks through ten other apps', 'A precedent for silencing platforms'] },
    },
    pro: {
      thesis: 'An adversary government with legal authority over the parent company controls both a data pipe and a propaganda dial on 150 million Americans.',
      args: [
        { n: 1, title: 'Two levers', claim: 'The parent answers to a state that can compel data and tune the feed.', warrant: 'One is a surveillance risk; the other is a propaganda lever in a crisis.', impact: 'Both scale to the whole user base at once.', weakSpot: 'Con will say neither lever has actually been pulled.' },
        { n: 2, title: 'Act before it fires', claim: 'You do not wait for a national-security risk of this magnitude to realize.', warrant: 'It is low-probability per day but catastrophic if it ever triggers.', impact: 'The lever cannot be unpulled once it is used.', weakSpot: 'Con will say "catastrophic someday" justifies almost anything.' },
        { n: 3, title: 'Control asymmetry', claim: 'A US broker answers to subpoenas; an adversary state answers to itself.', warrant: 'That difference in who controls the data is the whole case.', impact: 'It is the one thing that makes this platform different in kind.', weakSpot: 'Pro\'s own fix, divestiture, keeps the platform alive and undercuts "ban."' },
      ],
    },
    con: {
      thesis: 'Pro is selling a hypothetical at the price of a certainty, and the ban does not even fix the harm it names.',
      args: [
        { n: 1, title: 'Certain speech loss', claim: 'Shut the platform and you silence 150 million people immediately.', warrant: 'The livelihoods built on it disappear with it.', impact: 'A guaranteed loss outweighs a speculative one on probability.', weakSpot: 'Pro will say divestiture keeps speech alive under safe ownership.' },
        { n: 2, title: 'The pipe stays open', claim: 'American data is sold on the open market to any buyer, including foreign brokers.', warrant: 'Ban one app and the data flows through ten others.', impact: 'You pay the full speech cost for a fraction of the security benefit.', weakSpot: 'Pro will say a foreign state\'s control is categorically worse than a broker\'s.' },
        { n: 3, title: 'Precedent', claim: 'A government shutting a speech platform on a classified threat sets a tool.', warrant: 'The next administration inherits the power to silence on unproven grounds.', impact: 'The magnitude is a permanent expansion of the power to silence.', weakSpot: 'Pro will say targeted national-security action is not a general precedent.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'An adversary government with legal authority over the parent company controls both a data pipe on 150 million Americans and the dial on what they see. The first is a surveillance risk; the second is a propaganda lever during a crisis or an election. You do not wait for the harm to fire before pulling a national-security risk of that magnitude.', note: 'Magnitude is real. But "act before it fires" needs a probability, not just a fear.', badge: 'Strong frame' },
      { side: 'con', speech: 'Con · response', text: 'Pro is selling a hypothetical at the price of a certainty. The speech loss is guaranteed and immediate: shut the platform and you silence 150 million people and the livelihoods built on it. The security harm is speculative and, crucially, unfixed by a ban. Data on Americans is sold on the open market, so ban one app and the pipe stays open through ten others.', note: 'Probability vs certainty is the right axis. The "pipe stays open" point bites.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: '"Other apps leak too" is an argument for a data-broker law, not against closing the worst single channel. The difference is control: a US broker responds to subpoenas and courts; an adversary state responds to its own strategic interest. And the speech harm is overstated. A forced divestiture keeps the platform alive under non-adversary ownership, so users keep speaking.', note: 'Control asymmetry is the best Pro point. But divestiture is not the motion.', badge: 'Shifts ground' },
      { side: 'con', speech: 'Con · weighing', text: 'Now Pro is defending divestiture, which is not a ban. If the clean version of the policy is "force a sale," concede that the ban itself, the thing on the ballot, is the blunt instrument we should avoid. And the precedent cost is real: a government shutting down a speech platform on a classified, unproven threat is a tool the next administration inherits.', note: 'Pins Pro to the wording. Once Pro defends divestiture, the motion is lost.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'The decisive move was Con forcing Pro onto divestiture. Once Pro\'s safe version is "force a sale, not a ban," Pro is no longer defending the motion as worded. Pro won the control-asymmetry point, an adversary state is not a US data broker, and that is the strongest reason the platform is different in kind. Con won probability versus certainty and the precedent cost. On "ban," Con takes it.',
      keyClash: 'Ban as worded vs forced divestiture, and probability vs certainty.',
      proFeedback: 'Control asymmetry was your best argument. Stop drifting to divestiture; it is a different motion and it sinks you. Defend the ban or lose the wording.',
      conFeedback: 'You won on the wording. Do not undersell the real security concern; granting it costs you nothing and makes the precedent point land harder.',
      drill: 'Pin your opponent to the exact wording before you weigh. Run Pro and defend the literal ban without ever retreating to divestiture.',
    },
    related: ['should-social-media-be-banned-for-minors', 'should-ai-be-regulated', 'should-ai-generated-art-be-copyrighted', 'universal-basic-income'],
    drills: [
      { label: 'Defend the literal ban', motion: 'This house would ban TikTok in the United States' },
      { label: 'Argue probability vs certainty', motion: 'This house believes speculative security risks cannot justify certain speech costs' },
      { label: 'Run the divestiture counter-model', motion: 'This house would force the sale of TikTok rather than ban it' },
    ],
  },

  'should-social-media-be-banned-for-minors': {
    slug: 'should-social-media-be-banned-for-minors',
    title: 'Should Social Media Be Banned for Minors?',
    eyebrow: 'Tech & Youth · Live Motion',
    category: 'Tech & Youth',
    difficulty: 'Medium',
    formats: 'PF / Parli / WSDC',
    mainClash: 'Harm vs enforceability',
    subtitle: 'From Australia\'s under-16 law to school phone bans, this is one of the most-run motions on the circuit, and it is usually won on enforcement.',
    description: 'Should under-16s be banned from social media? Both sides argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['should social media be banned for minors', 'social media age ban debate', 'should kids be banned from social media', 'under 16 social media ban'],
    bestFor: ['Causation analysis', 'Feasibility weighing', 'Harm framing'],
    clash: {
      question: 'Does a hard ban prevent more harm than it causes, and can it be enforced without surveilling everyone?',
      axis: 'Most rounds here are won or lost on enforcement, not on the harm.',
      pro: { label: 'Ban', points: ['Engagement design targets young brains', 'Harm concentrates in heavy users', 'Age limits for addictive products exist'] },
      con: { label: 'Do not ban', points: ['The effect sizes are small and contested', 'It cuts off isolated teens', 'Enforcement means ID for everyone'] },
    },
    pro: {
      thesis: 'The product is engineered to maximize time on screen, and the test subjects are children whose impulse control is not finished developing.',
      args: [
        { n: 1, title: 'Designed to hook', claim: 'The feed is optimized for engagement, not for the user\'s wellbeing.', warrant: 'A developing brain cannot consent to a product built to override it.', impact: 'The harm correlates with the rollout of the algorithmic feed.', weakSpot: 'Con will say correlation is not causation, and effects are small.' },
        { n: 2, title: 'Dose response', claim: 'The harm concentrates in the kids doing three-plus hours a day.', warrant: 'Averaging across all use hides the damage at the heavy end.', impact: 'A ban targets exactly the dose that does the damage.', weakSpot: 'Con will say heavy use may be the symptom, not the cause.' },
        { n: 3, title: 'Accepted principle', claim: 'We already bar minors from cigarettes and gambling.', warrant: 'Some products are too addictive for a developing brain to consent to.', impact: 'Age limits for addictive products are a settled idea, not a novel one.', weakSpot: 'Con will say speech platforms are not cigarettes and the analogy fails.' },
      ],
    },
    con: {
      thesis: 'The strongest studies show small effects that do not survive controls, and the ban\'s harms are concrete while its benefit is contested.',
      args: [
        { n: 1, title: 'Weak causation', claim: 'The best studies show small effects, possibly reverse causation.', warrant: 'Anxious kids may use more, rather than use making them anxious.', impact: 'You bet a generation\'s online life on the arrow pointing the convenient way.', weakSpot: 'Pro will say dose-response at the heavy end isolates the harm.' },
        { n: 2, title: 'Cuts the lifeline', claim: 'A ban severs isolated and marginalized teens from real community.', warrant: 'LGBTQ teens and kids in remote towns find each other online first.', impact: 'You harm the most vulnerable kids most.', weakSpot: 'Pro will say fund safe alternatives instead of leaving them on the feed.' },
        { n: 3, title: 'Unenforceable', claim: 'Verifying the age of minors means ID checks on every adult.', warrant: 'You cannot gate a few without surveilling all.', impact: 'A policy that needs mass surveillance fails on feasibility.', weakSpot: 'Pro will say platform-side age estimation avoids universal ID upload.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'The product is engineered to maximize time on screen, and the test subjects are children whose impulse control is not finished developing. The correlation with teen anxiety, sleep loss, and self-harm presentations tracks the rollout of the algorithmic feed. We do not let minors buy cigarettes or gamble because we accept that some products are too addictive for a developing brain to consent to.', note: 'Good design argument. The cigarettes analogy is strong but contestable.', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: 'Correlation is doing all the work in that case, and the strongest studies show small effects that do not survive controls. Meanwhile the ban\'s harms are concrete: you cut isolated kids off from the communities that keep them sane, LGBTQ teens and kids in remote towns first. And enforcement requires age verification, which means every user uploads ID. You cannot check the age of minors without surveilling adults.', note: 'Two clean attacks: weak causation and the enforcement problem. Enforcement is the killer.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'The "small effect" studies average across all use. Break it out by heavy use and the harm concentrates exactly where you would predict, in the kids doing three-plus hours a day. A ban targets the dose that does the damage. On the isolated-teen point, that is a reason to fund safe alternatives, not to leave the most vulnerable kids on the platform doing the most harm.', note: 'Dose-response is the right answer on causation. But enforcement still hangs unanswered.', badge: 'Half-answer' },
      { side: 'con', speech: 'Con · weighing', text: 'Heavy use correlating with distress is just as likely reverse causation: anxious kids use more, not use makes them anxious. Pro has not isolated the arrow. And Pro never answered enforcement. "Fund alternatives" does not tell me how you verify age without an ID checkpoint on the whole internet. A policy you cannot enforce without mass surveillance fails on feasibility before we even weigh the harm.', note: 'Reverse causation neutralizes the dose point, and the dropped enforcement argument decides it.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'Two live cruxes: causation direction and enforceability. On causation it was a draw; Pro\'s dose-response point is the best version of the harm, but Con\'s reverse-causation answer is exactly the rebuttal it invites, and neither resolved it. Enforceability decided the round. Con raised the age-verification problem twice and Pro never answered it, only pivoting to "fund alternatives." A ban you cannot enforce without surveilling adults is a real cost left standing.',
      keyClash: 'Does use cause harm, and can a ban be enforced at all.',
      proFeedback: 'Dose-response was smart. You lost because you never touched enforcement; that argument was on the table twice. Answer it or you cannot win this motion.',
      conFeedback: 'Enforcement carried you. Push the reverse-causation point earlier; you let Pro frame the harm before you complicated it.',
      drill: 'Run Pro and pre-empt enforcement in your opening: name an age-verification mechanism that does not surveil adults, then defend it.',
    },
    related: ['should-the-us-ban-tiktok', 'should-students-be-allowed-to-use-ai', 'should-ai-be-regulated', 'will-ai-replace-human-jobs'],
    drills: [
      { label: 'Solve the enforcement problem', motion: 'This house would ban under-16s from social media platforms' },
      { label: 'Argue the causation crux', motion: 'This house believes social media is a primary cause of the teen mental-health crisis' },
      { label: 'Defend the vulnerable-teen lifeline', motion: 'This house believes a youth social-media ban harms marginalized teens most' },
    ],
  },

  'universal-basic-income': {
    slug: 'universal-basic-income',
    title: 'Is Universal Basic Income a Good Idea?',
    eyebrow: 'Economics · Live Motion',
    category: 'Economics',
    difficulty: 'Medium',
    formats: 'BP / Parli / PF',
    mainClash: 'Universality vs targeting',
    subtitle: 'A staple economics motion, sharper now that automation is in the headlines, and usually fought over one word: universal.',
    description: 'Is universal basic income a good idea? Both sides argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side and run it yourself.',
    keywords: ['is universal basic income a good idea', 'ubi debate', 'universal basic income arguments for and against', 'ubi pros and cons debate'],
    bestFor: ['Economic weighing', 'Mechanism design', 'Cost-benefit framing'],
    clash: {
      question: 'Does an unconditional floor buy enough security to justify paying people who do not need it?',
      axis: 'Is "universal" the feature or the flaw? That is the whole round.',
      pro: { label: 'For UBI', points: ['Removes the welfare cliff', 'Unconditional cash improves outcomes', 'Deletes means-testing overhead'] },
      con: { label: 'Against UBI', points: ['Paying everyone wastes scarce money', 'A livable floor costs too much', 'Cash is worse than services for some'] },
    },
    pro: {
      thesis: 'Means-tested welfare punishes people for earning; an unconditional floor removes the trap.',
      args: [
        { n: 1, title: 'No more cliff', claim: 'Benefits claw back as income rises, so the system traps the people it serves.', warrant: 'A flat floor means every extra hour worked is money kept.', impact: 'You remove the disincentive baked into targeted welfare.', weakSpot: 'Con will say tax clawback recreates the cliff at the back end.' },
        { n: 2, title: 'Cash works', claim: 'Unconditional cash improves health and school outcomes in trials.', warrant: 'It barely dents work hours, contrary to the dependency worry.', impact: 'Millions lifted out of precarity with evidence behind it.', weakSpot: 'Con will say pilots are not the same as a permanent universal program.' },
        { n: 3, title: 'Less bureaucracy', claim: 'Scrapping means-testing deletes a whole administrative apparatus.', warrant: 'No eligibility checks, no caseworkers gatekeeping the floor.', impact: 'The saved overhead offsets a real share of the headline cost.', weakSpot: 'Con will say the savings are dwarfed by the cost of universality.' },
      ],
    },
    con: {
      thesis: 'Universality is the flaw in the name: sending a cheque to millionaires is money not spent on the poor.',
      args: [
        { n: 1, title: 'Wasted on the rich', claim: 'A monthly cheque to everyone includes people who do not need it.', warrant: 'Per dollar, a targeted program helps the needy far more.', impact: 'Universality buys political simplicity at the cost of efficiency.', weakSpot: 'Pro will say progressive tax claws it back from the top.' },
        { n: 2, title: 'The math', claim: 'A floor high enough to live on, paid to all, costs a brutal share of GDP.', warrant: 'It forces either growth-shrinking taxes or cuts to core services.', impact: 'You fund the cheque by gutting healthcare and housing the poor rely on.', weakSpot: 'Pro will say the honest comparison is UBI versus the patchwork it replaces.' },
        { n: 3, title: 'Cash is not enough', claim: 'For some, the problem is not a lack of money.', warrant: 'Addiction, disability, and crisis need in-kind support, not a transfer.', impact: 'Replacing services with cash is a downgrade for the most vulnerable.', weakSpot: 'Pro will say UBI supplements services rather than replacing them.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Means-tested welfare punishes people for earning, because benefits claw back as income rises, so the system traps the people it is meant to free. An unconditional floor removes that cliff: every extra hour worked is money kept. The trial evidence is consistent. Cash with no strings improves health and school outcomes and barely dents work hours.', note: 'No-cliff is the strongest pro mechanism. Pilot evidence is good but contestable at scale.', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: '"Universal" is the flaw in the name. Sending a monthly cheque to millionaires is money not spent on the poor, so per dollar a targeted program helps the needy far more. And the math is brutal. A floor high enough to live on, paid to everyone, costs a share of GDP that forces either tax rises that shrink the economy or cuts to the very services the poor rely on more than cash.', note: 'Efficiency + cost is the standard con case, run cleanly. The math point lands.', badge: 'Solid turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'The millionaire point dissolves once you read UBI with the tax system that funds it. The cheque goes out universally, but progressive taxation claws it back from the top. Net, the rich pay in more than they receive. On cost: the honest comparison is not UBI versus nothing, it is UBI versus the existing patchwork it replaces, plus the overhead it deletes.', note: 'Tax-clawback neutralizes the millionaire jab, but it reopens the cliff question.', badge: 'Good answer' },
      { side: 'con', speech: 'Con · weighing', text: 'If you claw it back through taxes from everyone above a threshold, you have reinvented means-testing, just at the back end. The no-cliff advantage shrinks the moment the tax schedule does the targeting. And cash is worse than in-kind support for the people whose problem is not a lack of money but addiction, disability, or crisis. For them, "here is cash, the programs are gone" is a downgrade.', note: 'Clawback-recreates-means-testing is the sharpest point. The in-kind harm is under-answered by Pro.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Pro', side: 'pro', margin: 'Narrow',
      rfd: 'The round hinged on whether "universal" is a feature or a bug. Pro\'s best move was folding the tax system in to neutralize the millionaire objection. Con\'s sharpest counter was that clawback-by-tax recreates means-testing and erodes the no-cliff selling point. Con edged the in-kind point Pro under-answered. Pro takes it narrowly by defending UBI as a supplement to core services rather than a replacement, which dodges Con\'s best attack.',
      keyClash: 'Universality as dignity vs universality as waste.',
      proFeedback: 'Tax-clawback was the right answer. But it costs you the no-cliff purity; own that tradeoff instead of letting Con spring it. And defend services explicitly.',
      conFeedback: 'The in-kind point was your cleanest win and you raised it late. Lead with the people cash cannot help.',
      drill: 'Defend UBI as a supplement, not a replacement, for healthcare and housing. See if Con\'s "cash is not enough" attack still has anywhere to go.',
    },
    related: ['will-ai-replace-human-jobs', 'should-ai-be-regulated', 'is-nuclear-energy-worth-it', 'should-the-us-ban-tiktok'],
    drills: [
      { label: 'Defend universality directly', motion: 'This house would replace means-tested welfare with a universal basic income' },
      { label: 'Argue the cost problem', motion: 'This house believes a livable UBI is unaffordable without gutting public services' },
      { label: 'Run the in-kind counter', motion: 'This house prefers targeted services to unconditional cash for the most vulnerable' },
    ],
  },

  'is-nuclear-energy-worth-it': {
    slug: 'is-nuclear-energy-worth-it',
    title: 'Is Nuclear Energy Worth the Risk?',
    eyebrow: 'Climate & Energy · Live Motion',
    category: 'Climate & Energy',
    difficulty: 'Medium',
    formats: 'PF / Parli / Policy',
    mainClash: 'Firm power vs cost',
    subtitle: 'A climate-era motion that splits even environmentalists, and comes down to which future bet you trust.',
    description: 'Is nuclear energy worth the risk? The climate case and the cost case argued by an AI debater, with a clash map, a sample round, and a judge ballot. Then take a side yourself.',
    keywords: ['is nuclear energy worth it', 'nuclear power debate', 'nuclear energy pros and cons debate', 'nuclear vs renewables debate'],
    bestFor: ['Comparative weighing', 'Opportunity-cost framing', 'Risk analysis'],
    clash: {
      question: 'Is firm, carbon-free power worth the cost and the tail risk, or do renewables get there faster and cheaper?',
      axis: 'Whose future bet do you trust: cheap reactors or grid-scale storage?',
      pro: { label: 'Build nuclear', points: ['The only proven firm clean power', 'Lowest deaths per unit energy', 'Hedges a storage breakthrough'] },
      con: { label: 'Do not', points: ['Plants run a decade late, over budget', 'Money sunk now is clean power forgone', 'Battery costs are falling fast'] },
    },
    pro: {
      thesis: 'Nuclear is the only proven source of firm, zero-carbon power that runs when the wind drops and the sun sets.',
      args: [
        { n: 1, title: 'Firm clean power', claim: 'Nuclear runs around the clock regardless of weather.', warrant: 'An intermittent-only grid still burns gas to cover the gaps.', impact: 'Firm clean power closes the emissions hiding in those gaps.', weakSpot: 'Con will say storage will cover the gaps cheaper and sooner.' },
        { n: 2, title: 'Safety record', claim: 'Per unit of energy, nuclear has killed fewer people than coal, gas, or rooftop solar.', warrant: 'The dread is out of proportion to the actual body count.', impact: 'The tail risk is rare and contained; the climate harm is global.', weakSpot: 'Con will say safety is real but beside the binding constraint, cost.' },
        { n: 3, title: 'A hedge', claim: 'Firm power works without betting on a battery breakthrough.', warrant: 'Grid-scale storage at the needed scale and cost does not exist yet.', impact: 'Nuclear is the hedge if the storage curve stalls.', weakSpot: 'Con will say the storage curve is improving while reactor costs rise.' },
      ],
    },
    con: {
      thesis: 'The safety stat is real and beside the point, because the binding constraint is time and money.',
      args: [
        { n: 1, title: 'Late and over budget', claim: 'New plants run a decade late and double over budget.', warrant: 'Climate is a race against the clock, and nuclear shows up after the deadline.', impact: 'Cost per ton avoided is several times the alternative.', weakSpot: 'Pro will say standardized modular build brings the curve down.' },
        { n: 2, title: 'Opportunity cost', claim: 'A dollar in a plant that opens in 2040 is a dollar not spent on power that ships now.', warrant: 'Solar, wind, and storage are deployable this year.', impact: 'Same climate goal, slower and dearer route.', weakSpot: 'Pro will say an intermittent-only grid leans on gas for the gaps.' },
        { n: 3, title: 'Bet the right curve', claim: 'Battery costs fell by double digits a year while reactor costs rose.', warrant: 'SMRs that fix the cost are a promise, not yet a proven plant.', impact: 'Bet on the curve that is improving, not the one that is not.', weakSpot: 'Pro will say betting the climate on a storage breakthrough is the riskier wager.' },
      ],
    },
    round: [
      { side: 'pro', speech: 'Pro · opening', text: 'Nuclear is the only proven source of firm, zero-carbon power that runs when the wind drops and the sun sets. Per unit of energy it has killed fewer people than coal, oil, gas, or even rooftop solar once you count installation falls. The impact is the climate timeline. A grid that leans only on intermittent sources still burns gas for the gaps, and those gaps are where the emissions hide.', note: 'Owns firmness and the safety record. The gaps argument is the strongest pro line.', badge: 'Strong open' },
      { side: 'con', speech: 'Con · response', text: 'The safety stat is real and beside the point, because the binding constraint is time and money. New plants run a decade late and double over budget. Climate is a race against the clock, and nuclear shows up after the deadline at several times the cost per ton avoided. Every dollar sunk into a plant that opens in 2040 is a dollar not spent on solar, wind, and storage that ship this year.', note: 'Reframes around cost and opportunity cost. Concedes safety, which is the smart move.', badge: 'Best turn' },
      { side: 'pro', speech: 'Pro · rebuttal', text: 'Cost and delay are mostly a function of building one-off plants in a stalled industry. Standardized small modular reactors and a repeated build pipeline are how every country that kept building brought the curve down. The expense is a policy choice, not a law of physics. And storage at the scale Con needs for a wind-and-solar-only grid does not exist yet at cost.', note: 'SMR optimism is a promise, not a plant. Storage point is fair but cuts both ways.', badge: 'Leans on hope' },
      { side: 'con', speech: 'Con · weighing', text: '"SMRs will fix the cost" is a promise, not a plant. The ones operating today are still more expensive per megawatt than the large reactors, and the cheap mass-produced version is years from proven. Pro is weighing a hope against renewables I can buy at auction this quarter. On storage, battery costs fell by double digits a year while reactor costs rose. Bet on the curve that is improving.', note: 'Concrete-now beats promised-later. The burden on "worth it" is comparative, and Con keeps it comparative.', badge: 'Sharp weighing' },
    ],
    ballot: {
      winner: 'Con', side: 'con', margin: 'Narrow',
      rfd: 'Clean clash: Pro owns firmness and the safety record, Con owns cost, speed, and opportunity cost. The round came down to whose future bet you trust, cheap modular reactors or grid-scale storage. Con takes it narrowly, because the burden on a "worth the risk" motion is comparative, and Con kept the comparison concrete, renewables you can buy now, while Pro leaned on SMRs not yet proven at price.',
      keyClash: 'Firm power you can rely on vs clean power you can deploy today.',
      proFeedback: 'Firmness and the gas-gap point were your real ground. Stop promising SMR savings; defend nuclear as a firm-power role alongside renewables, not instead of them.',
      conFeedback: 'Keeping it comparative won it. Do not over-claim the storage curve; one honest "not solved yet" makes you more credible, not less.',
      drill: 'Run Pro but concede new gigawatt plants. Defend only a firm-power role for standardized modular build, and see if the cost attack still lands.',
    },
    related: ['universal-basic-income', 'should-ai-be-regulated', 'will-ai-replace-human-jobs', 'should-the-us-ban-tiktok'],
    drills: [
      { label: 'Weigh firm power vs deployable now', motion: 'This house would massively expand nuclear power to meet climate targets' },
      { label: 'Argue the opportunity cost', motion: 'This house believes nuclear investment is better spent on renewables and storage' },
      { label: 'Defend a narrow firm-power role', motion: 'This house would build standardized modular reactors only for grid firmness' },
    ],
  },

};

export function getMotion(slug) {
  if (!slug) return null;
  return MOTION_BANK[slug.toLowerCase()] || null;
}

export function listMotions() {
  return Object.values(MOTION_BANK);
}
