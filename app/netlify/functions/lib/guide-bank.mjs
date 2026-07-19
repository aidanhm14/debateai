// Per-guide content for /learn/guides/{slug} pages.
//
// Each entry is a long-tail SEO target. The /learn/formats/{slug}
// pages catch generic format queries ("Asian Parliamentary debate
// format"); guides catch the question-style queries debaters actually
// type ("how to open as PM in Asian Parli", "WSDC reply speech
// structure", "PF crossfire questions to ask").
//
// Schema:
//   slug          — URL fragment, kebab-case
//   question      — H1 + title core (exact-match the search query)
//   hook          — one-line summary used in meta description + intro
//   format        — corresponds to a FORMAT_BANK slug for cross-linking
//   formatName    — display label
//   readTime      — "5 min" / "6 min"
//   takeaways     — 3-4 TL;DR bullets above the fold
//   sections      — [{ heading, body: [paragraphs] }]
//   examples      — [{ context, line, why }] real lines + commentary
//   related       — slugs of related guides for cross-link block
//   keywords      — meta + JSON-LD
//   ctaLabel      — start-a-round CTA text
//   ctaHref       — /debate-it?format=...&motion=... preloaded round
//
// Voice rules (per soul.md §5):
//   - No em-dashes. Periods, commas, semicolons only.
//   - No banned phrases ("let's break down", "in today's world", etc.)
//   - No-preface rule: say the thing, don't announce it.
//   - Varsity debater register. Not philosophy seminar.
//   - Real motions, real lines, concrete examples.

export const GUIDE_BANK = {

  'asian-parli-pm-opening': {
    slug: 'asian-parli-pm-opening',
    question: 'How to open as PM in Asian Parliamentary',
    hook: 'The PMC is the blueprint Gov runs on for the next 35 minutes. Define the motion, build 2-3 contentions, weigh in the constructive, pre-empt the obvious Opp move.',
    format: 'asian',
    formatName: 'Asian Parliamentary',
    readTime: '6 min',
    takeaways: [
      'State motion, actor, mechanism in the first 30 seconds, then move on.',
      'Build 2-3 contentions, not 5. Three strong beats five mid every round.',
      'Start weighing in the constructive. Do not save the impact framework for DPM.',
      'Pre-empt the obvious Opp move in your final contention, not in cross.',
    ],
    sections: [
      {
        heading: 'What the PMC actually does',
        body: [
          "The PMC isn't a speech. It's the blueprint Gov runs on for the next 35 minutes. If you set the definition badly, your second speaker spends their constructive cleaning up. If you bury the mechanism, Opp gets to characterize the motion for you. If you over-stuff the case with contentions, you lose the round on the ones you couldn't develop.",
          "The job has three parts in this order: define what the round is about, build the case, pre-empt the cleanest Opp moves. Most novice PMs spend 90 seconds on the first part. That's wasted time.",
        ],
      },
      {
        heading: 'Definition: the 30-second framework',
        body: [
          'Open by stating motion, actor, mechanism, status quo. Then move on.',
          'Example, motion = "This house would ban political donations from corporations": "The actor is the United States federal government. The mechanism is a statutory ban on direct and PAC-mediated corporate political contributions, enforced by the FEC. The status quo allows unlimited contributions through PACs and 501(c)(4)s post-Citizens United. We affirm." 30 seconds. The judge now knows what you\'re defending. Opp can\'t squirrel you because you\'ve claimed the territory.',
          "Squirrelling is the most-common novice mistake: defining the motion so narrowly that nobody could reasonably oppose it. Don't. Adjudicators on the Asian circuit will rule against unfair definitions on principle, and your opp will use the squirrel as a free hit in extension.",
        ],
      },
      {
        heading: 'Build 2-3 contentions, not 5',
        body: [
          'A common varsity mistake is loading up the PMC with arguments to "give Opp targets to miss." This is backwards. Every contention you state is a thread you have to defend across the round. Three contentions with clean warranting beats five contentions where two die in the first cross.',
          'Pick your strongest argument and lead with it. Pick your second strongest and put it second. If you have a third, make it short and concede that it\'s a backup. Do not bury your best argument at the end where the judge has stopped flowing.',
          'A contention has three parts: claim, warrant, impact. Skip any of them and you\'re just stating an opinion. "Corporate donations corrupt democracy" is a claim with no warrant. "Corporate donations corrupt democracy because elected officials demonstrably vote with donor interests, see Page and Gilens 2014, where bottom-90% preferences had near-zero statistical correlation with policy outcomes" is a contention.',
        ],
      },
      {
        heading: 'Start weighing in the constructive',
        body: [
          'The single biggest gap between novice and varsity PMCs: novices argue, varsity weighs. Do not wait for the rebuttal to tell the judge why your arguments outweigh. Plant the impact framework in the constructive.',
          'Example transition into your final contention: "If we win one argument, we win the round. That argument is X. The reason X outweighs anything Opp brings: magnitude (Y people affected); probability (high, because Z mechanism is already in motion); reversibility (irreversible once X happens). Anything Opp argues fits inside that frame."',
          'The judge writes that down. When DPM picks it back up in the reply, the weighing already has roots in the flow. Without that anchor, your team is weighing on top of nothing.',
        ],
      },
      {
        heading: 'Set the traps before they trip on them',
        body: [
          "The strongest PMs pre-empt the obvious Opp move. Not all of them. Just the one you know they're going to lead with.",
          'Motion = "TH would mandate vaccination." You know Opp\'s first contention is bodily autonomy. Do not wait for them to deploy it; address it in your final contention: "Opp will say bodily autonomy. We agree it\'s a real value. Here\'s why it\'s outweighed in this specific case: vaccination externalities are non-trivial, the bodily-autonomy frame doesn\'t apply when one body\'s choice imposes measurable risk on every other body in the room."',
          "You haven't won the bodily-autonomy fight. But you've planted a frame, and the LO now has to clear two arguments instead of one to make their lead stick.",
        ],
      },
      {
        heading: 'Common PMC mistakes that cost the round',
        body: [
          'Burying the mechanism. If the judge can\'t articulate "what Gov is actually doing" 90 seconds in, you\'ve already lost half the bench.',
          "Reading the case at 220 WPM. Asian Parli is not Policy. The judge needs to flow you, not transcribe you.",
          "Skipping the partner handoff. End the PMC with one line that tells DPM what's coming next. \"DPM will extend on the donor-corruption mechanism with the Page-Gilens data and respond to LO's framing.\" One line. Saves your bench a panicked huddle.",
          'No memorable line. The PMC sets the round\'s tone. One image or one phrase the judge writes down and the reply caller picks back up.',
        ],
      },
    ],
    examples: [
      {
        context: 'Motion: TH would ban political donations from corporations.',
        line: '"The actor is the United States federal government. The mechanism is a statutory ban on direct and PAC-mediated corporate political contributions, enforced by the FEC. We affirm."',
        why: 'Tight definition. Names the actor, names the mechanism, dispatches the status quo in one sentence. Judge can flow it. Opp can\'t squirrel it.',
      },
      {
        context: 'Pre-empt the obvious Opp move.',
        line: '"Opp will say bodily autonomy. We agree it\'s a real value. Here\'s why it\'s outweighed in this case."',
        why: 'You haven\'t conceded; you\'ve framed the clash on your terms before LO got the mic.',
      },
    ],
    related: ['asian-parli-whip', 'bp-poi', 'apda-opp-case'],
    keywords: [
      'asian parliamentary pm opening',
      'asian parli pmc structure',
      'prime minister speech asian parli',
      'how to start asian parli pmc',
      'asian parli first speaker tips',
      'asian parliamentary debate prime minister constructive',
    ],
    ctaLabel: 'Start an Asian Parli round',
    ctaHref: '/debate-it?format=asian&motion=This%20house%20would%20ban%20political%20donations%20from%20corporations.',
  },

  'wsdc-reply-speech': {
    slug: 'wsdc-reply-speech',
    question: 'WSDC reply speech structure',
    hook: 'The reply isn\'t a 4th constructive. It\'s a closing argument. Two issues, no new matter, weighing-first, biased toward your side.',
    format: 'worlds',
    formatName: 'World Schools',
    readTime: '5 min',
    takeaways: [
      'Reply speeches are 4 minutes, given by the 1st or 2nd speaker (not the 3rd).',
      'No new arguments. New comparisons and new weighing are fine; new contentions get struck.',
      'Structure: 2-3 "issues" that organize the round, not a contention-by-contention rebuttal.',
      'Bias the framing toward your side. The reply is allowed to be partisan in a way the constructives are not.',
    ],
    sections: [
      {
        heading: 'What the reply speech is for',
        body: [
          "WSDC reply speeches sit at the end of the round, after the 3rd-speaker rebuttals. They are 4 minutes long and delivered by the 1st or 2nd speaker on each side (never the 3rd). The Opposition replies first; Proposition replies last and gets the final word.",
          "The reply is not a 4th constructive. It is a closing argument. Treat it the way a lawyer treats closing: organize the round into 2-3 issues, walk the judge through why your side wins each, and end with one image they'll carry into the ballot.",
        ],
      },
      {
        heading: 'The two-issue structure',
        body: [
          "The strongest reply speeches identify 2 (sometimes 3) issues that the round actually turned on, and walk each one. An issue is bigger than an argument; it's a thematic axis the round was clashing on.",
          'Example, motion = "THBT social media platforms should be liable for user content." Issues might be: (1) Speech and chilling effects, (2) Platform incentives and content quality. Notice these aren\'t individual contentions; they\'re frames that cover multiple contentions from both sides.',
          "Walking each issue: name the issue, summarize your side's strongest line, summarize Opp's strongest line, then weigh. Don't rebut every individual point. Pick the central clash and resolve it.",
        ],
      },
      {
        heading: 'The "no new matter" rule and how to bend it',
        body: [
          "WSDC adjudicators strike new arguments in reply. But they accept new comparisons, new weighing, new examples that illustrate existing arguments, and new responses to attacks Opp made in the 3rd rebuttal.",
          "The trick: frame everything as something already in the round. \"Building on the inequality argument from our 2nd speaker, here's the new framing: the only people who benefit from the status quo are the ones already insulated from its costs.\" The argument is new-ish; the framing presents it as extending what's on the flow.",
          'Adjudicators will let you get away with this if it\'s clearly downstream of existing matter. They will not let you introduce a whole new contention. Know the line.',
        ],
      },
      {
        heading: "Bias the framing: that's your job in reply",
        body: [
          "The constructives have to be balanced; the reply does not. You're the closer. Your job is to characterize the round in a way that makes your side look like the obvious winner.",
          'Example: "This round turned on one question: who bears the cost of the status quo? Proposition said children. Opposition said platform innovation. You as an adjudicator have to decide whose harm matters more. Here\'s why ours does, and here\'s why theirs is speculative."',
          'Notice the framing already cast their side as "speculative" and yours as concrete. That\'s the move. You don\'t have to hide it. Adjudicators expect partisan framing in the reply.',
        ],
      },
      {
        heading: 'The closing image',
        body: [
          "End on one image, not a recap. Recaps are dead weight by minute 3:40. An image is something the adjudicator can write on the flow and remember when they're filling out the ballot.",
          'Example: "If you adopt our side, the next time a 14-year-old gets targeted by an algorithmic feed designed to maximize their engagement at the cost of their wellbeing, there\'s a remedy. If you adopt their side, there isn\'t. That\'s the round."',
          "Don't end with 'and therefore we propose.' End with the image.",
        ],
      },
    ],
    examples: [
      {
        context: 'Opening the reply (Opposition replying first).',
        line: '"This round turned on two issues. One: whether liability actually changes platform behavior in the direction Prop claimed. Two: who bears the cost of getting that wrong."',
        why: 'Two-issue structure stated up front. The adjudicator knows what they\'re tracking for the next 4 minutes.',
      },
      {
        context: 'Closing image, Proposition reply.',
        line: '"If you adopt our side and we\'re wrong, platforms moderate slightly more cautiously. If you adopt their side and they\'re wrong, the harm we documented continues. That\'s the asymmetry."',
        why: 'Frames the round as a risk asymmetry the adjudicator can resolve in one line. No new argument; new weighing.',
      },
    ],
    related: ['asian-parli-pm-opening', 'bp-closing-extension', 'asian-parli-whip'],
    keywords: [
      'wsdc reply speech structure',
      'world schools reply speech',
      'wsdc 4 minute reply',
      'how to write wsdc reply',
      'world schools closing speech',
      'wsdc reply speaker tips',
    ],
    ctaLabel: 'Practice a WSDC round',
    ctaHref: '/debate-it?format=worlds&motion=THBT%20social%20media%20platforms%20should%20be%20liable%20for%20user%20content.',
  },

  'pf-crossfire-questions': {
    slug: 'pf-crossfire-questions',
    question: 'PF crossfire questions to ask',
    hook: 'Crossfire isn\'t cross-ex. You\'re fighting for control of three minutes and the judge\'s attention. Ask questions that set up your next speech, not questions you actually want answered.',
    format: 'pf',
    formatName: 'Public Forum',
    readTime: '5 min',
    takeaways: [
      'The best crossfire questions are not questions; they\'re traps that lock the opponent into a position you\'ll exploit in the next speech.',
      'Lead with concessions you want them to make. "Would you agree that..." beats "Why do you think...".',
      'Never ask "why" in crossfire. "Why" hands them a free speech.',
      'Cut them off cleanly. "I have my answer, moving on" is legal and effective.',
    ],
    sections: [
      {
        heading: 'What crossfire actually rewards',
        body: [
          'PF crossfire is 3 minutes of shared time. Both debaters can ask and answer. The judge is watching for who controls the exchange, not who scores literal points. Speeding through 12 questions you don\'t use beats asking 3 the judge actually flowed and that come back in your next speech.',
          'The single most-common novice mistake: asking exploratory questions you don\'t already know the answer to. Crossfire is not discovery. You should be 95% certain how they\'ll answer before you ask. The question exists to make them say the answer on the record so you can quote it in the next speech.',
        ],
      },
      {
        heading: 'Lead with the concession you want',
        body: [
          'Phrasing matters. "Would you agree that X?" is harder for them to refuse than "What do you think about X?" The first frames a concession; the second hands them a microphone.',
          'Examples of concession-first questions:',
          '"Would you agree that the warming trend in your evidence is global, not localized?"',
          '"You said earlier that markets self-correct. Is there a timeframe on that?"',
          '"Does your contention 1 evidence cover the post-2020 period or end in 2018?"',
          "Each of these locks them into a position you can exploit. If they agree, you got the concession. If they refuse to agree, you ask them to explain why and they're now defending a position they shouldn't be defending.",
        ],
      },
      {
        heading: 'Never ask "why" in crossfire',
        body: [
          '"Why do you think X" is a free 45-second speech for your opponent. They\'ll use it to re-explain their case, add warrants you couldn\'t flow in the constructive, and run out the clock.',
          'Replace "why" with structural questions: "Can you point to the specific evidence?" "Which contention does that fall under?" "What\'s the timeframe?" "Is your impact reversible?" These force short factual answers, not extended argumentation.',
          'If you actually need to attack a warrant, attack it in your next speech, not in crossfire. Crossfire is for setup, not for fighting.',
        ],
      },
      {
        heading: 'Control the exchange',
        body: [
          "Crossfire isn't polite conversation; it's shared airtime. If they're running long on an answer, cut them: \"I have my answer, moving on.\" Adjudicators expect this. Letting your opponent monologue for 90 seconds while you stand there is a sign you've lost control.",
          'Conversely, when they ask you a question, decide whether to answer fully (when it\'s a softball you can hit), partially (when they\'re fishing), or pivot ("That\'s a fair question; the more important issue is X"). Pivots work in PF in a way they don\'t in cross-ex.',
          "Don't talk over each other. Two debaters arguing simultaneously is unflowable. If they're talking, wait one beat, then jump in clean: \"Let me finish that thought.\" Polite, firm, controlled.",
        ],
      },
      {
        heading: 'Question sequences that win rounds',
        body: [
          'The strongest crossfire moves are sequences, not single questions. A sequence builds: each question depends on the previous answer.',
          'Example, attacking their economic-harm contention:',
          'Q1: "Your evidence on jobs lost is from the Heritage 2019 study, correct?" (They say yes.)',
          'Q2: "Does that study control for sector-specific effects, or is it aggregate national?" (They probably don\'t know; they\'ll hedge.)',
          'Q3: "Then would you agree the number is aggregate and doesn\'t distinguish between the affected sector and others?" (They have to concede.)',
          "You haven't won the round; you've just gotten a concession you can quote in the summary: \"Their own evidence doesn't distinguish sectors. By their own admission in crossfire, the number is aggregate.\"",
        ],
      },
    ],
    examples: [
      {
        context: 'Setting up a concession on their warrant.',
        line: '"Would you agree that the warming trend in your evidence is global, not localized?"',
        why: 'They almost have to agree. You now own the framing for your next speech: "Their own evidence concedes the trend is global, which means a localized response doesn\'t solve."',
      },
      {
        context: 'Cutting them off mid-monologue.',
        line: '"I have my answer, moving on."',
        why: 'Legal, expected, and the only way to keep control of a 3-minute shared clock.',
      },
    ],
    related: ['ld-value-criterion', 'bp-poi', 'apda-opp-case'],
    keywords: [
      'pf crossfire questions',
      'public forum crossfire strategy',
      'pf crossfire tips',
      'how to win pf crossfire',
      'public forum debate crossfire',
      'pf crossfire what to ask',
    ],
    ctaLabel: 'Practice PF crossfire',
    ctaHref: '/debate-it?format=pf&motion=Resolved%3A%20The%20United%20States%20should%20adopt%20a%20carbon%20tax.',
  },

  'bp-poi': {
    slug: 'bp-poi',
    question: 'How to take a POI in BP',
    hook: 'POIs are scored on both sides: how you ask matters, and how you handle one matters more. Take 1-2 per speech, refuse the rest cleanly, and have a one-line response ready before they finish the question.',
    format: 'bp',
    formatName: 'British Parliamentary',
    readTime: '5 min',
    takeaways: [
      'POIs are only legal in minutes 1-6 of a 7-minute speech (not the first or last minute).',
      'Take 1-2 POIs per speech. Refusing all of them costs you; taking all of them ruins your structure.',
      'Refuse politely: "No thank you" or a hand wave. Don\'t insult, don\'t engage, don\'t apologize.',
      'When you take one, answer it in one sentence and immediately return to your structure. Do not let it derail your speech.',
    ],
    sections: [
      {
        heading: 'The POI window',
        body: [
          "Points of Information are 15-second interruptions any opposing speaker can offer during your constructive. They are legal in minutes 1-6 of your 7-minute speech. The first minute (your protected opening) and the last minute (your protected closing) are off-limits; offering a POI in either window gets you marked down by the chair.",
          "POIs serve two functions: they let opposing teams force a clash on a key point, and they let speakers prove they can think on their feet under pressure. Both sides of the exchange get scored. Asking good POIs raises your speaker score; handling them well raises it more.",
        ],
      },
      {
        heading: 'How many to take',
        body: [
          "Take 1-2 POIs per speech. The math: taking zero signals you can't think on your feet and the bench will mark you down. Taking 4 means you've spent a minute and a half of your speech responding to other people's points, which destroys your own structure.",
          "Take the first POI offered after about 90 seconds in. This shows you can engage, and you've gotten through the opening without being interrupted. Take a second around the 4:30 mark if one is offered. Refuse the rest.",
          'Time your acceptance: take a POI between two of your contentions, not in the middle of one. Mid-contention interruptions break your flow and the judge\'s flow.',
        ],
      },
      {
        heading: 'How to refuse cleanly',
        body: [
          'When you don\'t want to take a POI, refuse with one of: a polite "no thank you," a hand wave, or "not at this time." That\'s it. Do not insult the offerer ("nice try" reads as defensive). Do not apologize ("sorry, I can\'t" wastes a beat). Do not engage with the question even briefly.',
          'The cleanest refusal is silent: you make eye contact, shake your head once, hand-wave the speaker down, and keep talking without breaking stride. Watch any varsity BP debater and they refuse 80% of POIs without saying a word.',
        ],
      },
      {
        heading: 'How to handle the one you take',
        body: [
          'The strongest BP speakers answer a POI in one sentence and return to their structure without skipping a beat.',
          'Pattern: pause the moment the POI ends, deliver a one-line response, then signpost back: "I\'ll take that. The answer is X. Returning to my second argument..."',
          'Have responses pre-built for the obvious POIs. If you\'re defending a motion on carbon pricing, you know someone will ask about competitiveness effects. Have one sentence ready: "Carbon-pricing schemes in jurisdictions like British Columbia and Sweden showed no net competitiveness loss; the empirical record doesn\'t support that concern."',
          'Bad answer: a 30-second rebuttal that absorbs the POI into your speech. Good answer: a 10-second knockdown that lets you keep your structure.',
        ],
      },
      {
        heading: 'When you should offer one',
        body: [
          'On the asking side: offer 4-5 POIs across the round. Most will be refused. The goal isn\'t to land every POI; it\'s to demonstrate engagement and to plant questions the adjudicator notes even if they\'re refused.',
          'Make the POI a question, not a speech. "On the competitiveness concern, isn\'t it true that British Columbia saw no GDP impact?" is a POI. A 30-second rebuttal followed by "what do you say to that?" is not, and you\'ll get cut by the chair.',
          "Offer POIs at strategic moments: right after they finish a contention you want to attack, or right before a key transition where derailing them helps. Don't offer one when they're already losing. Let them keep digging.",
        ],
      },
    ],
    examples: [
      {
        context: 'Refusing a POI mid-speech.',
        line: '[Silent hand wave, continues speaking.]',
        why: 'Cleanest refusal possible. No verbal break, no engagement, no apology. Maintains speech flow.',
      },
      {
        context: 'Taking and answering a POI in 10 seconds.',
        line: '"I\'ll take that. The empirical record from British Columbia and Sweden shows no net competitiveness loss. Returning to my second argument..."',
        why: 'One-line knockdown. Names the evidence. Signposts back to structure. Costs maybe 12 seconds of speech time.',
      },
    ],
    related: ['bp-closing-extension', 'asian-parli-pm-opening', 'pf-crossfire-questions'],
    keywords: [
      'how to take poi in bp',
      'british parliamentary points of information',
      'bp poi strategy',
      'how to refuse poi politely',
      'bp poi rules',
      'british parliamentary poi tips',
    ],
    ctaLabel: 'Practice taking POIs',
    ctaHref: '/debate-it?format=bp&motion=This%20house%20would%20impose%20a%20carbon%20tax%20on%20heavy%20industry.',
  },

  'viva-exam-questions': {
    slug: 'viva-exam-questions',
    question: 'Viva exam questions to expect',
    hook: 'Examiners ask three kinds of questions: did you understand it, can you defend the choices you made, and can you connect this to something outside your paper. Prepare answers to all three and you handle 90% of vivas.',
    format: 'viva',
    formatName: 'Viva / Oral Exam',
    readTime: '6 min',
    takeaways: [
      'Most viva questions fall into three buckets: comprehension, defense of methodology, and connections to broader theory.',
      'For every claim in your paper, prepare a 30-second answer to "why did you choose this and not the alternative."',
      "Don't memorize answers; memorize the structure of answers. Examiners will rephrase questions to test depth.",
      'When you don\'t know, say so directly: "I haven\'t thought about that specifically; my best guess is X, and the reason I\'m uncertain is Y."',
    ],
    sections: [
      {
        heading: 'The three question categories',
        body: [
          'Across CBSE/ICSE boards, JEE/NEET interviews, undergraduate thesis defenses, and PhD vivas, examiners draw questions from three buckets in predictable ratios.',
          'Category 1: comprehension. "Explain what you did in chapter 3 in your own words." "Define the term X as you used it." These check whether you understood your own work. Examiners use them to warm up and to identify candidates who memorized without understanding.',
          'Category 2: defense of methodology. "Why did you use approach A and not approach B?" "What\'s the limitation of your sample size?" "How would your result change if X assumption failed?" These are the heart of the viva. Examiners want to see you understood the choices you made, including the trade-offs.',
          'Category 3: connections and extensions. "How does this relate to recent work by author X?" "If you had six more months, what would you investigate next?" "What\'s the practical application of this outside the lab?" These check whether you can think beyond the four corners of your paper.',
        ],
      },
      {
        heading: 'How to prepare for each category',
        body: [
          'Comprehension prep is just rehearsal. Re-read your paper out loud. For every section, write a 60-second summary of what it does and why it\'s there. Practice delivering these summaries without referring to your notes.',
          "Defense-of-methodology prep is the real work. For every methodological choice you made (your sample, your statistical test, your control group, your survey instrument), write down: (a) what you did, (b) what the alternative was, (c) why you picked yours, (d) what the limitation is. Examiners are not trying to catch you in errors; they're trying to see if you can articulate the trade-off.",
          'Connections prep: read 3-5 recent papers in your area that you didn\'t cite. Be ready to say "I saw work by X on this; the difference is Y." If you didn\'t read them, that\'s fine. Be ready to say "I haven\'t seen that work, but if it argues Z, my response would be..."',
        ],
      },
      {
        heading: 'The "I don\'t know" answer',
        body: [
          'Every viva includes at least one question you can\'t answer. How you handle it matters more than whether you knew the answer.',
          'Wrong: "Um, I think... maybe..." (stalling). Wrong: "I don\'t know" full stop (gives nothing). Wrong: bluffing an answer (examiner sees through it and you\'ve now lied).',
          'Right: "I haven\'t thought about that specifically. My best guess is X. The reason I\'m uncertain is Y. If I had to investigate, I\'d start by checking Z." This shows you can reason under uncertainty, which is what examiners are actually testing.',
        ],
      },
      {
        heading: 'Common viva questions, by domain',
        body: [
          'Science thesis: "Why this control?" "What\'s your p-value and what does it mean?" "Could the effect be explained by [confounder]?" "What would you do differently?"',
          'Engineering / IIT: "Why this algorithm and not [alternative]?" "What\'s the complexity?" "How does this scale?" "What happens at the boundary case?"',
          'Medical / NEET: "Differential diagnosis?" "First-line treatment?" "Mechanism of action?" "Contraindications?" Examiners want fast structured answers, not improvised reasoning.',
          'Humanities thesis: "Why this theoretical framework and not [alternative]?" "How does your reading differ from [scholar X]?" "What\'s the political implication of your argument?"',
          'CBSE/ICSE board viva: "Define [term]." "Derive [formula]." "Give an example." "Real-world application?" These are predictable; rehearse the curriculum, not improvise.',
        ],
      },
      {
        heading: 'Body language and pacing',
        body: [
          "Pacing matters more than novices realize. A confident 10-second pause before answering reads as thinking; an instant answer reads as rehearsed. Take the pause. Examiners aren't timing you.",
          'Eye contact: look at the examiner asking, not at your notes. If you have a paper in front of you, gesture to it ("on page 7, I argued...") rather than reading from it.',
          "Volume and clarity: speak slightly slower and slightly louder than you would in conversation. Vivas are usually in echoey rooms with note-taking examiners. If they can't hear you, they assume you don't know.",
        ],
      },
    ],
    examples: [
      {
        context: 'Defending a methodological choice.',
        line: '"I chose a within-subjects design because it controls for individual variation. The alternative would have been a between-subjects design with random assignment, which I considered, but the sample size needed to detect the effect at 80% power would have been roughly three times larger and outside the scope of this project."',
        why: 'Names the choice, names the alternative, names the trade-off, names the limitation. Examiner has nothing to push on.',
      },
      {
        context: 'The "I don\'t know" answer done right.',
        line: '"I haven\'t looked at that specifically. My intuition is that the effect would attenuate but not disappear, because the underlying mechanism doesn\'t depend on the condition you\'re describing. If I had to check, I\'d run the same analysis on the subset where that condition holds and see whether the effect size changes."',
        why: 'Honest, reasoned, shows methodological thinking. Examiner sees you can reason about your own work in a state of uncertainty.',
      },
    ],
    related: ['ld-value-criterion', 'pf-crossfire-questions', 'apda-opp-case'],
    keywords: [
      'viva exam questions to expect',
      'viva voce questions',
      'oral exam preparation',
      'thesis defense questions',
      'cbse viva questions',
      'iit jee neet interview questions',
      'phd viva questions',
      'viva exam tips india',
    ],
    ctaLabel: 'Practice a viva oral exam',
    ctaHref: '/voice-debate?mode=crossex&motion=Defend%20your%20methodology%20choices%20in%20your%20thesis.',
  },

  'apda-opp-case': {
    slug: 'apda-opp-case',
    question: 'APDA opp case structure',
    hook: 'The LOC is the round-defining speech for Opp. Concede one minor thing for credibility, attack the two strongest Gov contentions, build offense, set up your partner.',
    format: 'apda',
    formatName: 'APDA Parliamentary',
    readTime: '6 min',
    takeaways: [
      "The LOC is not just rebuttal. It's case construction plus rebuttal, in 8 minutes.",
      "Concede one trivial point in your first 20 seconds. It buys credibility for everything you attack next.",
      "Pick two Gov contentions to actually fight. Trying to attack all four kills your time.",
      "Build offense, not just defense. Pure negation cases lose more rounds than they win on APDA.",
    ],
    sections: [
      {
        heading: 'What the LOC actually does',
        body: [
          "The Leader of Opposition Constructive is the second speech in an APDA round. Eight minutes. You've heard the PMC and had its delivery time plus your own prep window to plan. The LOC has three jobs running in parallel: tear down what Gov built, build your own affirmative case, and pre-empt the rebuttal.",
          "Most novice LOs run one of two bad strategies. Strategy one: pure rebuttal, no offense. You spend 8 minutes saying why Gov is wrong and the judge has no positive reason to vote Opp. Strategy two: pure counter-case, ignoring Gov. You spend 8 minutes building your own world and the PMC's case sits unattacked on the flow. Both lose.",
          "The cleanest LOCs do both: 3-4 minutes of targeted attack on Gov's strongest 2 contentions, 3-4 minutes of Opp offense (counter-narrative, alternative actor analysis, or a counter-prop), and 30 seconds of weighing setup.",
        ],
      },
      {
        heading: 'The opening concession move',
        body: [
          "The strongest LOs start by conceding one trivial point from Gov's case in the first 20 seconds. It looks like this: \"We agree with Gov that political polarization is a real problem and worth caring about. That's not the question. The question is whether their proposed mechanism actually addresses it. We say no, for three reasons.\"",
          "Why this works: judges are pattern-matching for credibility. A speaker who concedes nothing reads as a hack who'll oppose anything. A speaker who concedes one minor point reads as someone with a serious analytical position. The concession costs you nothing because you're going to attack the mechanism anyway, but you've banked trust for the attacks that follow.",
          "Don't over-concede. One trivial point in 20 seconds. Two minor points start to feel like you're losing arguments before you start. The goal is calibration, not capitulation.",
        ],
      },
      {
        heading: 'Pick two contentions to actually fight',
        body: [
          "Gov gave you three or four contentions in the PMC. You cannot attack all of them in depth in 8 minutes. Trying makes every attack shallow. Pick two: the strongest one (because if you knock it out, the case collapses) and the second strongest (because if you knock both out, the case has no path to win).",
          "What about the others? Group them. \"Gov also gave us their argument about implementation cost and their argument about democratic legitimacy. Both rest on the same flawed premise we just knocked out, so they fall with it. We don't need to address them individually.\" The judge follows.",
          "Pick your attacks based on warrant quality, not impact size. If Gov's third contention has a huge impact but a paper-thin warrant, that's the one to attack. Impacts only matter if the warrant holds.",
        ],
      },
      {
        heading: 'Build offense: three ways',
        body: [
          'Offensive option 1: counter-narrative. Same actor, different theory of the problem. "Gov said the issue is X; we say the issue is Y, and their solution doesn\'t address Y at all." Cleanest for motions where the actor is constrained.',
          'Offensive option 2: counter-prop. Different actor or different mechanism. "Instead of federal regulation, the better approach is state-level experimentation, which we defend because of A and B." Requires you to build a positive case Opp has to defend on the flow, but lets you out-bid Gov on impact.',
          'Offensive option 3: K (critique). Attack the framing of the motion itself. "Gov is asking the wrong question. The real question is whether this category of intervention is legitimate at all." Risky in front of flow-based judges; powerful with policy-minded ones. Know your judge.',
        ],
      },
      {
        heading: 'Set up MGC',
        body: [
          "End the LOC with a 20-second handoff to your partner. \"MGC will extend on the counter-narrative I built around stakeholder analysis, respond to whatever Gov throws at our second contention in the MGC speech, and add the empirical evidence for the case study I previewed.\"",
          "This does two things. It tells the judge there's a coherent two-speech strategy on Opp, not just two solo speeches stapled together. And it gives your partner explicit licensed turf so they don't accidentally retread your ground in their own constructive.",
        ],
      },
      {
        heading: 'Common LOC mistakes',
        body: [
          'Linear point-by-point rebuttal. The PMC has 4 contentions; you spend 90 seconds on each; you have 2 minutes left for offense. Bad time allocation. Group and prioritize.',
          "Reading the PMC line by line for nuance. Judges flow the PMC; they don't need you to repeat it. Quote the warrant, attack, move on.",
          "Forgetting weighing. Even in the constructive, plant the impact framework. \"If we win our counter-narrative, the case structurally cannot solve, and that's the round.\"",
          'No pre-empt of the PMR. The PM rebuttal is the last speech of the round. If you build a strategy that depends on the LOR landing a particular hit, the PMR will respond. Anticipate it.',
        ],
      },
    ],
    examples: [
      {
        context: 'Opening 20 seconds of the LOC.',
        line: '"We agree with Gov that political polarization is a real problem and worth caring about. That\'s not the question. The question is whether their proposed mechanism actually addresses it. We say no, for three reasons."',
        why: 'Concession bought credibility. Refocused the round on mechanism (where Opp is strong) instead of problem (where Gov picked the framing).',
      },
      {
        context: 'Grouping the contentions you won\'t attack.',
        line: '"Gov also gave us their argument about implementation cost and their argument about democratic legitimacy. Both rest on the same flawed premise we just knocked out, so they fall with it. We don\'t need to address them individually."',
        why: 'Saves 90+ seconds. Tells the judge those points are conceded as falling, not ignored. They flow it as a chain-attack, not a drop.',
      },
    ],
    related: ['asian-parli-pm-opening', 'asian-parli-whip', 'bp-poi'],
    keywords: [
      'apda opp case structure',
      'leader of opposition apda',
      'loc speech apda',
      'apda opposition strategy',
      'how to give a loc',
      'american parliamentary debate opp case',
    ],
    ctaLabel: 'Practice an APDA round on Opp',
    ctaHref: '/debate-it?format=apda&side=opp&motion=This%20house%20would%20scrap%20legacy%20admissions%20at%20universities.',
  },

  'policy-speed-reading': {
    slug: 'policy-speed-reading',
    question: 'Policy debate speed reading for beginners',
    hook: 'Speed only helps if judges can flow you. Clean at 175 WPM beats unflowable at 350. Drill articulation first, breath second, speed third.',
    format: 'policy',
    formatName: 'Policy / CX',
    readTime: '6 min',
    takeaways: [
      "Speed is a means, not an end. Judges who can't flow you flow you against.",
      "Tags and cites get read at conversational pace. Card bodies get speed. Cross-ex and rebuttals stay clear.",
      "Drill articulation before speed: tongue twisters, word lists, consonant clusters.",
      "Build up gradually. 30 WPM increments over weeks, not overnight.",
    ],
    sections: [
      {
        heading: 'Why beginners go too fast too fast',
        body: [
          "Walk into any high school Policy round and the spreading sounds like a magic trick. New debaters assume speed itself is what wins, so they try to match the pace before they've built the articulation to handle it. The result is unflowable garbage that loses on the same flow speed it was trying to weaponize.",
          "The actual hierarchy: clarity, then warrants, then speed. A debater reading 175 words per minute clean with tagged warrants beats one reading 350 unflowable WPM, every time, in front of any judge who isn't already a tech-debater themselves. The reason is simple: if the judge can't write it down, it didn't happen.",
        ],
      },
      {
        heading: 'The structure of a Policy card and how to pace it',
        body: [
          "A Policy card has four parts: a tag (the claim, in your own words), a cite (author, date, qualifications), a body (the evidence text), and an underlined/highlighted portion (the actual functional warrant). Each gets a different pace.",
          "Tag: conversational. About 150 WPM. The tag is the argument; if the judge doesn't catch it, the card is wasted. Make it short and crisp.",
          "Cite: slow. 120 WPM. Author and year only; qualifications can be faster. Adjudicators flow citations as proof of evidence quality.",
          "Card body: fast. 250-300 WPM if you're solid. The judge isn't flowing every word; they're flowing the underlined portion.",
          "Underlined portion: medium-fast. 200-220 WPM. Slow down slightly so the warrant lands.",
          'Tagline summary after the card: back to 150 WPM. "So this evidence proves X, which means Y for our case." This is what the judge actually writes on the flow.',
        ],
      },
      {
        heading: 'Drills that actually build speed',
        body: [
          'Tongue twisters at full volume. "Red lorry yellow lorry" / "the sixth sick sheikh\'s sixth sheep\'s sick" / "she sells sea shells". Five minutes a day. The goal is clean articulation under load, not speed.',
          "Word list reading. Take any random word list (most debate teams have one); read down it at increasing speed. Stop when you start slurring. Drill at the speed just below the slur point.",
          "Breath control. Run a mile, then immediately try to read a card. The breath patterns you build under aerobic load translate to speech endurance.",
          "Card-specific drills. Pick a card you'll actually use in a round. Read it three times at three speeds: conversational, fast, max. Notice which words you trip on at max. Drill those.",
          "Recording playback. Record yourself spreading. Listen back. If you can't understand your own delivery, neither can the judge.",
        ],
      },
      {
        heading: 'When to slow down',
        body: [
          "Cross-examination. Speed in cross-ex makes you look defensive. CX is a conversation; have it at conversation pace.",
          "Rebuttals. The 2NR and 2AR are about weighing, not card-dumping. Speed those at 150 WPM. Judges write the ballot from the rebuttal, so make it flowable.",
          "Theory arguments. T-violations and condo-bad arguments depend on the judge catching every line. Slow them down.",
          "When the judge stops flowing. Watch for it. If their pen stops moving, you're spreading past them. Drop pace until the pen comes back.",
        ],
      },
      {
        heading: 'The first three months of speed work',
        body: [
          "Month 1: articulation only. No timer. Five tongue-twister minutes daily, then read one card at deliberately slow pace, full enunciation. The goal is to make every consonant cluster crisp.",
          "Month 2: gradual speed buildup. Add 30 WPM each week. Start at 150, end at 230. If you start slurring, drop back 10 WPM for a week, then climb again.",
          "Month 3: integration. Practice spreading in mock rounds against a partner who's flowing. After each speech, have them tell you which arguments they couldn't flow. Those are your weak spots; drill them.",
        ],
      },
    ],
    examples: [
      {
        context: 'Tag for a uniqueness card on China-Taiwan tensions.',
        line: '"Tensions are escalating now. PLA exercises near Taiwan have tripled in 2024, signaling intent for confrontation."',
        why: 'Tag is short, claim-first, has a quantifier. Judge can flow it in 4 seconds. Body of the card will fill in mechanism.',
      },
      {
        context: 'Slowing down at the warrant.',
        line: '"...quote: \'continued PLA escalation creates a window in which miscalculation becomes likely.\' That\'s Glaser 2024."',
        why: 'Voice drops 20 WPM on the underlined section. Cite gets named after the warrant lands. Adjudicator now has both flow and source.',
      },
    ],
    related: ['ld-value-criterion', 'bp-poi', 'pf-crossfire-questions'],
    keywords: [
      'policy debate speed reading',
      'how to spread debate',
      'cx debate speed',
      'policy debate spreading beginner',
      'how to read fast in policy debate',
      'cross examination debate speed tips',
    ],
    ctaLabel: 'Practice a Policy round',
    ctaHref: '/debate-it?format=policy&motion=Resolved%3A%20The%20United%20States%20federal%20government%20should%20substantially%20increase%20its%20military%20presence%20in%20the%20Indo-Pacific.',
  },

  'ld-value-criterion': {
    slug: 'ld-value-criterion',
    question: 'Value and criterion examples: 6 classic LD pairings',
    hook: 'Six LD value-criterion pairs with full warrants: Justice/Veil of Ignorance, Morality/Categorical Imperative, Wellbeing/Util, Liberty/Harm Principle, and more. Plus a link test for picking the pair your contentions actually hit.',
    format: 'ld',
    formatName: 'Lincoln-Douglas',
    readTime: '6 min',
    published: '2026-01-20',
    updated: '2026-07-14',
    takeaways: [
      "Value = the abstract concept the round is about (Justice, Morality, Liberty).",
      "Criterion = the standard for measuring achievement of the value (Util, Cat. Imperative, Veil of Ignorance).",
      "Pick the pair where your contentions actually link cleanly. Fancy framework + weak link is worse than basic framework + strong link.",
      "Defending the framework is half the round. Have warrants for both the value and the criterion.",
    ],
    sections: [
      {
        heading: 'Quick reference: the 8 most common LD values and the criterion that fits each',
        body: [
          'Justice paired with the Veil of Ignorance, the Social Contract, or Retributivism. The default value for resolutions about fairness, rights, and state action.',
          'Morality paired with the Categorical Imperative (Kant) or Care Ethics. Use when a resolution asks whether an act is inherently permissible, not whether it pays off.',
          'Wellbeing (or Societal Welfare) paired with Utilitarianism. The workhorse for policy-flavored, consequence-heavy resolutions.',
          'Liberty paired with Mill\'s Harm Principle. Dominant on autonomy, speech, and state-restriction topics.',
          'Equality paired with Rawls\' Difference Principle. For resolutions about inequality of outcome, redistribution, and access.',
          'Human Dignity paired with a basic-needs floor or Kantian ends-not-means. Strong for humanitarian and bioethics rounds.',
          'Autonomy paired with informed consent or bodily integrity. For medical, privacy, and paternalism resolutions.',
          'Security paired with Just War Theory or a least-restrictive-means test. For foreign policy, surveillance, and public-safety topics. Full warrants and worked framework blocks for each pair are below.',
        ],
      },
      {
        heading: 'Value vs criterion: what they each do',
        body: [
          'The value premise is the abstract concept the round is about. Standard LD values: Justice, Morality, Liberty, Equality, Human Dignity, Wellbeing, Security, Democracy. You pick one that the resolution actually engages with. A resolution about criminal sentencing engages with Justice; a resolution about pandemic response engages with Wellbeing or Security; a resolution about speech regulation engages with Liberty.',
          "The criterion (also called the standard or value criterion) is the test for measuring whether something achieves the value. If your value is Justice, your criterion might be the Rawlsian Veil of Ignorance (asking which institutions would be chosen behind ignorance of one's position) or the Categorical Imperative (asking whether the action could be universalized).",
          "The structure works like this: I value X, achieved through Y, and my contentions prove the Aff/Neg side achieves Y better. The framework tells the judge what to measure; your contentions hit that measure.",
        ],
      },
      {
        heading: 'Classic value-criterion pairings',
        body: [
          "Value: Justice / Criterion: Rawlsian Veil of Ignorance. Use when the resolution is about institutional fairness, distribution, or unequal access. The veil asks which rules a rational person behind ignorance of their position would consent to. Pairs naturally with welfare-state, equal-access, and anti-discrimination cases.",
          "Value: Morality / Criterion: Categorical Imperative (Kant). Use when the resolution involves the inherent permissibility of an act, not its consequences. The CI asks whether you could universalize the action without contradiction. Strong for cases against lying, exploitation, and using people as means.",
          "Value: Wellbeing / Criterion: Utilitarianism (Mill / Bentham). Use when consequences and scale of impact are central. Util asks which choice maximizes net wellbeing. Best for policy-flavored resolutions, public health, harm reduction.",
          "Value: Liberty / Criterion: Mill’s Harm Principle. Use when state intervention or restriction of action is at stake. The harm principle says government may only restrict action to prevent harm to others. Strong for autonomy, drug policy, free expression.",
          "Value: Justice / Criterion: Lockean / Social Contract. Use when government legitimacy is in question. Locke argues legitimate government depends on consent and protection of natural rights. Pairs with cases about civil disobedience, revolution, governmental overreach.",
          "Value: Equality / Criterion: Rawls' Difference Principle. Use when inequality of outcome is the issue. The DP allows inequality only when it benefits the worst-off. Strong for redistribution, affirmative action, progressive taxation.",
        ],
      },
      {
        heading: 'The reference list: 30 more value-criterion pairs by resolution type',
        body: [
          "Criminal justice resolutions (sentencing, policing, punishment): Justice / Retributivism; Justice / Proportionality; Justice / Due Process; Human Dignity / Rehabilitation over retribution; Societal Welfare / Deterrence.",
          "State power and civil liberties (surveillance, speech, protest): Liberty / Harm Principle; Liberty / Negative rights protection; Autonomy / Informed consent; Democracy / Free flow of information; Privacy / Reasonable expectation test.",
          "War, security, and foreign policy: National Security / Just War Theory; Morality / Doctrine of Double Effect; Human Rights / Universal Declaration compliance; Peace / Diplomatic primacy; Justice / International law.",
          "Economic and welfare resolutions (taxation, redistribution, labor): Equality / Difference Principle; Justice / Equal opportunity; Societal Welfare / Cost-benefit analysis; Human Dignity / Basic needs floor; Equity / Capabilities approach (Sen and Nussbaum).",
          "Bioethics and public health (pandemic policy, medical autonomy): Wellbeing / Utilitarianism; Autonomy / Bodily integrity; Life / Sanctity of life; Public Health / Least restrictive means; Morality / Care ethics (Gilligan and Noddings).",
          "Education and youth resolutions: Equality / Equal access; Human Development / Capabilities approach; Autonomy / Paternalism threshold; Societal Welfare / Long-run social returns; Justice / Fair start doctrine.",
          "Environment and future generations: Justice / Intergenerational equity; Wellbeing / Long-term utility; Human Survival / Precautionary principle; Stewardship / Sustainable yield; Rights / Standing for future persons.",
          "Every pair above passes the same two tests from the previous section: the criterion is defensible in cross-ex, and standard contentions on that resolution type link to it cleanly. Treat this list as a menu, not homework. Pick the pair whose criterion your best two contentions already hit.",
        ],
      },
      {
        heading: 'How to pick (and how to lose by picking badly)',
        body: [
          'Read the resolution. Ask: what is this resolution actually about? "Resolved: The United States ought to abolish capital punishment" is about justice, but more specifically about state-imposed irreversible harm. Justice + CI or Justice + the harm principle both fit. Wellbeing + Util feels off because the resolution centers on permissibility, not aggregate outcome.',
          "Reach test: can you defend the criterion? If you pick Kantian ethics, you'll get attacked on edge cases (the murderer at the door, the categorical imperative formula). If you can't articulate the response, pick a different criterion. The Util defense is generally the most forgiving because it follows everyday moral reasoning.",
          'Link test: do your contentions actually hit the criterion? If your value is Justice and your criterion is Util, but your contentions are about respecting individual rights, the framework and the case don\'t link. The judge picks up on this. A simpler framework (Justice / preventing exploitation) that your contentions actually warrant beats a fancy framework that doesn\'t fit.',
        ],
      },
      {
        heading: 'Defending the framework in cross-ex',
        body: [
          'Your opponent will attack one of three things: the value (why Justice and not Wellbeing?), the criterion (why Util and not Kantian?), or the link between your contentions and the criterion (your evidence doesn\'t prove what you say it proves).',
          "For value attacks: have a clean two-sentence reason. \"Justice is the value because the resolution is about state action, and state action requires justification on Justice grounds before consequence grounds.\"",
          'For criterion attacks: be ready with the standard objection-and-response. If you ran Kant, you should know the murderer-at-the-door objection and your Korsgaard-style response. If you ran Util, you should know the experience-machine objection.',
          "For link attacks: this is where most LD rounds are actually won and lost. Make sure each contention explicitly says \"and this hits the criterion because X.\" Don't make the judge do the linking work.",
        ],
      },
      {
        heading: 'When to run a non-standard framework',
        body: [
          'Most rounds, run a standard framework. Standard frameworks are well-warranted by 200 years of philosophical literature; you don\'t need to invent.',
          "Non-standard frameworks (Levinasian ethics, Foucauldian power analysis, capabilities approach) work when (a) the resolution genuinely engages the framework and (b) you've done the reading. Running Foucault on a death penalty round to sound smart, without being able to defend the framework, loses the round on framework debate before contentions even matter.",
          'A solid intermediate: Capabilities approach (Sen / Nussbaum) for development and welfare resolutions, Care ethics (Gilligan / Noddings) for relational and dependency resolutions. Both have enough literature to defend and enough specificity to differentiate from generic Util.',
        ],
      },
    ],
    examples: [
      {
        context: 'Framework block opening, Justice / Veil of Ignorance.',
        line: '"My value is Justice, because the resolution turns on the legitimacy of state action. My criterion is the Rawlsian Veil of Ignorance: which institutions would a rational person consent to from behind ignorance of their own position. My contentions show that the Aff position fails this test."',
        why: 'Names value and criterion, warrants both in one sentence, signposts that the case will return to the framework. Three sentences, no wasted words.',
      },
      {
        context: 'Linking a contention to the criterion.',
        line: '"This is my second contention: the policy disproportionately harms low-income communities. Under the Veil of Ignorance, a rational person doesn\'t know whether they\'ll land in a low-income community, so they\'d reject institutions that load harm onto the worst-off. My contention hits the criterion."',
        why: 'Explicit link work. Judge doesn\'t have to guess how the contention connects to the framework. This is the move that wins close rounds.',
      },
    ],
    related: ['apda-opp-case', 'pf-crossfire-questions', 'policy-speed-reading'],
    keywords: [
      'value and criterion examples',
      'value criterion',
      'ld value criterion examples',
      'lincoln douglas debate values',
      'lincoln douglas value criterion',
      'ld framework examples',
      'how to pick ld framework',
      'ld value premise',
      'lincoln douglas debate framework',
    ],
    faqs: [
      {
        q: 'What is the difference between value and criterion in LD debate?',
        a: 'The value is the abstract concept the round is about (Justice, Liberty, Wellbeing). The criterion is the standard for measuring whether something achieves the value. If your value is Justice, your criterion might be the Rawlsian Veil of Ignorance or the Categorical Imperative. The structure: I value X, achieved through Y, and my contentions prove the Aff/Neg achieves Y better.',
      },
      {
        q: 'What are examples of LD values and criteria?',
        a: 'Six classic pairings: Justice with the Rawlsian Veil of Ignorance (institutional fairness), Morality with the Categorical Imperative (Kantian cases), Wellbeing with Utilitarianism (consequence-heavy resolutions), Liberty with Mill\'s Harm Principle (autonomy cases), Justice with the Social Contract (government legitimacy), and Equality with Rawls\' Difference Principle (redistribution cases).',
      },
      {
        q: 'How do I pick a value and criterion for Lincoln-Douglas?',
        a: 'Read the resolution and ask: what is this resolution actually about? Apply two tests. Reach test: can you defend this criterion if attacked? Link test: do your contentions actually hit the criterion? A simpler framework your contentions warrant beats a fancy framework that does not link.',
      },
      {
        q: 'What is a value criterion?',
        a: 'A value criterion (also called the standard) is the measuring stick for the value premise in Lincoln-Douglas debate. The value names what the round is about; the criterion says how the judge should test it. Example: value Justice, criterion the Veil of Ignorance. An argument wins framework weight when it satisfies the criterion, not just when it sounds like the value.',
      },
      {
        q: 'What is the most common value in LD debate?',
        a: 'Justice and Morality are the most common LD values. Justice pairs with the Veil of Ignorance, Social Contract, or Harm Principle. Morality pairs with the Categorical Imperative for Kantian cases. For policy-flavored resolutions, Wellbeing with Utilitarianism is the default. Liberty with Mill\'s Harm Principle dominates autonomy and speech topics.',
      },
      {
        q: 'How do I defend my LD framework in cross-examination?',
        a: 'Prepare for three attacks: value attacks (why this value?), criterion attacks (why this standard?), and link attacks (does your evidence actually prove what you say?). For each, have a two-sentence response ready. The link attack is where most LD rounds are won and lost: make each contention explicitly say "this hits the criterion because X" rather than leaving the judge to connect it.',
      },
    ],
    ctaLabel: 'Practice an LD round',
    ctaHref: '/debate-it?format=ld&motion=Resolved%3A%20The%20United%20States%20ought%20to%20abolish%20capital%20punishment.',
  },

  'asian-parli-whip': {
    slug: 'asian-parli-whip',
    question: 'Asian Parli whip speech tips',
    hook: 'The whip is not a 3rd constructive. Pick 2-3 issues that the round actually clashed on, walk each one, weigh, close. No new arguments, new weighing only.',
    format: 'asian',
    formatName: 'Asian Parliamentary',
    readTime: '5 min',
    takeaways: [
      "Whip speeches are 8 minutes, no new arguments, given by the 3rd speaker on each side.",
      "Structure: 2-3 issues, not point-by-point rebuttal of every contention.",
      "Weighing is most of the job: magnitude, probability, reversibility, link strength.",
      "End on one image the adjudicator writes on the flow.",
    ],
    sections: [
      {
        heading: 'What the whip actually does',
        body: [
          "In Asian Parliamentary, the 3rd speaker on each side (Government Whip, Opposition Whip) gives the closing speech of the constructive phase. Eight minutes. No new arguments allowed; new comparisons, new weighing, new examples illustrating existing arguments are fine.",
          "The whip's job is not to give a 3rd constructive. It's to make the round legible to the adjudicator. Identify the 2-3 issues the round actually clashed on, walk each one, and tell the adjudicator how to resolve them in your side's favor.",
          "The single most common novice mistake is treating the whip like a third speaker on the case. Going through your team's three contentions, restating them louder, and then doing a quick rebuttal. The adjudicator already flowed those. They want the round resolved, not re-delivered.",
        ],
      },
      {
        heading: 'The two-issue or three-issue structure',
        body: [
          "Strongest whips open by naming the issues. \"This round turned on two issues. One: whether the policy actually solves the harm Gov identified. Two: whether the costs Opp brought are proportionate to the gain.\"",
          "An issue is bigger than a single argument. It's a thematic axis that multiple arguments fed into. Issue 1 might collect Gov's mechanism contention plus Opp's circumvention rebuttal plus the cross-ex exchange where mechanism got pressure-tested.",
          "Walking an issue: state the issue, summarize the strongest version of each side's position, weigh, declare who won and why. Repeat for the next issue.",
        ],
      },
      {
        heading: 'Weighing is most of the speech',
        body: [
          "Once you've named an issue and summarized both positions, the bulk of the whip is weighing. Why does your side's argument outweigh theirs?",
          "Four standard weighing axes: magnitude (how much harm or benefit), probability (how likely is the impact), reversibility (can it be undone), link strength (does the warrant actually connect to the impact).",
          'Concrete example: "Opp argued the policy creates a brain drain in source countries. We argued it raises individual wellbeing for migrants. Weighing: their impact is speculative and reversible (countries can recover; brain drain is also empirically contested in the literature). Our impact is concrete and ongoing (individual welfare gains start day one). Magnitude favors us because we\'re counting actual people; theirs is a system-level argument that depends on chained empirical claims. We win this issue."',
        ],
      },
      {
        heading: 'New weighing is legal; new arguments are not',
        body: [
          'Adjudicators allow you to bring up a new comparison or a new way of framing an existing argument. They strike new contentions.',
          'Legal: "Building on our first speaker\'s argument about institutional trust, the new framing is this: any policy that erodes trust faster than it solves the immediate harm has negative net welfare." (New framing of an existing argument; argument was already on the flow.)',
          "Not legal: \"Here's a fourth reason Gov fails: civil society backlash, which we haven't mentioned yet.\" (New argument, not on the flow.) The chair will visibly cross it out and the adjudicator won't weight it.",
          "If you find yourself reaching for new arguments in the whip, your team had a hole in the constructives. The whip can't fix that; it can only minimize the damage with framing.",
        ],
      },
      {
        heading: 'Closing the whip',
        body: [
          'Last 30 seconds: one memorable image or line that captures why your side wins. Not a recap.',
          'Example: "If you adopt our side and we\'re wrong, the policy reverts in a year and the harm is small. If you adopt their side and they\'re wrong, the harm compounds and there\'s no remedy. That\'s the asymmetry. Vote Gov."',
          "Don't end with a recap of your case. Don't end with \"and that's why we propose.\" End with the image. The adjudicator writes it on the flow and carries it into the ballot."
,
        ],
      },
    ],
    examples: [
      {
        context: 'Opening the whip by naming the issues.',
        line: '"This round turned on two issues. One: whether the policy actually solves the harm Gov identified. Two: whether the costs Opp brought are proportionate to the gain. I\'ll walk each."',
        why: 'Adjudicator now knows what to flow for the next 8 minutes. Issue-driven, not contention-driven.',
      },
      {
        context: 'Closing image.',
        line: '"If you adopt our side and we\'re wrong, the policy reverts in a year and the harm is small. If you adopt their side and they\'re wrong, the harm compounds and there\'s no remedy. Vote Gov."',
        why: 'Frames the round as a risk asymmetry the adjudicator can resolve in one line. No new argument, just new weighing.',
      },
    ],
    related: ['asian-parli-pm-opening', 'wsdc-reply-speech', 'bp-closing-extension'],
    keywords: [
      'asian parli whip speech',
      'government whip asian parliamentary',
      'opposition whip asian parli',
      'how to give a whip speech',
      'asian parli 3rd speaker',
      'asian parliamentary closing speech',
    ],
    ctaLabel: 'Practice the whip speech',
    ctaHref: '/debate-it?format=asian&motion=This%20house%20would%20open%20borders%20to%20skilled%20migration%20without%20quota.',
  },

  'bp-closing-extension': {
    slug: 'bp-closing-extension',
    question: 'BP closing extension how-to',
    hook: 'Your extension has to be substantively new, not louder. New mechanism, new actor, new impact axis, or new stakeholder. If Opening could have said it, you didn\'t extend.',
    format: 'bp',
    formatName: 'British Parliamentary',
    readTime: '6 min',
    takeaways: [
      "The extension is what differentiates Closing from Opening on the same bench. Without it, Closing comes 4th.",
      "Four extension types that work: new mechanism, new actor, new impact axis, new stakeholder analysis.",
      "Don't 'knife' Opening (contradict them) unless Opening's case is structurally broken. Even then, redirect, don't betray.",
      "POI strategy in BP closing matters: take 1-2, refuse the rest, and use the answer to plant your extension hook.",
    ],
    sections: [
      {
        heading: 'What the extension is and why it matters',
        body: [
          "In British Parliamentary, four teams compete: Opening Government, Opening Opposition, Closing Government, Closing Opposition. Each pair shares a side. The Closing team's job is to extend the case beyond what their Opening team already established. Without a real extension, the adjudicators have no reason to rank Closing above Opening on the same bench, and Closing typically finishes 3rd or 4th.",
          "A real extension is substantively new material the Opening could not have said. It's not a louder version of Opening's contentions. It's not a more polished version of the same argument. It's a separate analytical contribution that, if Opening had run it themselves, would have been their next contention.",
          "Adjudicators specifically write 'Closing extension' on the bench and look for it. If they can't find one, the team drops down the rank.",
        ],
      },
      {
        heading: 'Extension type 1: new mechanism',
        body: [
          'Opening said the policy works because of mechanism A. You add mechanism B that operates independently.',
          'Example, motion = "This house would impose a carbon tax." Opening Gov argued that price signals shift consumer demand toward low-carbon alternatives (Pigovian mechanism). Closing Gov extension: revenue recycling. The tax revenue funds R&D and just-transition payments, creating a second pathway to decarbonization that doesn\'t depend on consumer behavior at all.',
          "Two independent mechanisms make the case more robust: even if Opp knocks out one, the other still solves. Adjudicators read this as analytical depth and bench Closing Gov above Opening Gov."
,
        ],
      },
      {
        heading: 'Extension type 2: new actor or new actor analysis',
        body: [
          'Opening discussed the policy from the national-government level. You shift to international, sub-national, or corporate actors and analyze the policy from there.',
          'Example, motion = "TH would make tech companies liable for misinformation." Opening Opp argued chilling effects on free speech (state-actor framing). Closing Opp extension: analyze the actor incentives of platforms themselves. Under liability, they over-moderate, which then incentivizes consolidation around the largest platforms that can afford the compliance overhead, which then entrenches the exact monopoly problem Gov said they wanted to fight.',
          "Notice the extension introduces actor analysis Opening never touched. The platforms-as-actors angle is independently warranted, doesn't depend on Opening's free-speech argument to work.",
        ],
      },
      {
        heading: 'Extension type 3: new impact axis',
        body: [
          "Opening's case landed on impact category X (economic). You extend on impact category Y (social, political, security, equity) that Opening did not run.",
          "Example, motion = \"TH would scrap legacy admissions.\" Opening Gov argued meritocracy and economic mobility (economic equity frame). Closing Gov extension: institutional legitimacy. Universities that maintain legacy preferences face declining public trust and political vulnerability (PR and state-funding angles), which is a separate impact axis from individual mobility.",
          "The extension is impact-level, not contention-level. Doesn't have to add a new argument; can add a new way to count what matters.",
        ],
      },
      {
        heading: 'Extension type 4: new stakeholder',
        body: [
          'Opening discussed how the policy affects stakeholder A. You bring in stakeholder B that Opening ignored.',
          'Example, motion = "TH would require employer-sponsored therapy." Opening Gov argued benefits for employees with mental health needs. Closing Gov extension: the labor-market signaling effects on people who don\'t need therapy. They read company sponsorship as a strong workplace-culture signal, which improves hiring and retention. New stakeholder (the broader workforce), new mechanism (signaling), separate from Opening\'s case.',
          "Stakeholder extensions are forgiving because they rarely contradict Opening. They just enlarge the set of people the case helps, which the adjudicator reads as case strength."
,
        ],
      },
      {
        heading: 'Don\'t knife Opening',
        body: [
          "Knifing = your extension implicitly contradicts your Opening's argument. Common when Closing teams reach for a fancy extension without checking compatibility.",
          'Example knife: Opening Gov argued the carbon tax works because demand is price-elastic. Closing Gov "extends" by arguing the tax works even if demand is inelastic, because revenue recycling drives the outcome. Sounds fine in isolation; but the Closing argument implicitly grants that the price-signal mechanism (Opening\'s case) is weak. Adjudicators notice and dock both teams.',
          "Safer pattern: build the extension as a parallel pathway, not a replacement. \"Even if Opp succeeds in knocking out the price-signal mechanism Opening argued, revenue recycling provides an independent route. Both mechanisms work; we\'re adding the second.\" Now you've reinforced Opening rather than undermining them.",
          "Sometimes knifing is unavoidable because Opening's case is structurally broken. If that happens, redirect rather than betray: \"Building on Opening's intuition that revenue matters, the strongest version of this argument is...\" Reframe rather than reject.",
        ],
      },
      {
        heading: 'POIs in BP closing: plant the extension early',
        body: [
          "The Member of the closing team speaks 3rd or 4th in the round (after both Opening speakers and Opening's response). You have 7 minutes; the first minute is protected. POIs are legal for minutes 2-6.",
          "Take 1-2 POIs. When you take one, use the response to plant the extension hook before you've explicitly delivered it. \"That's a fair question; what you're missing is the stakeholder-signaling effect, which I'll come back to.\" Now the adjudicator is primed for the extension when you deliver it.",
          "Refuse the rest cleanly: hand wave or 'not at this time.' Don't engage with attempts to derail you onto Opening's territory.",
        ],
      },
    ],
    examples: [
      {
        context: 'Setting up a new-mechanism extension.',
        line: '"Opening Gov ran the price-signal mechanism. We extend on a second, independent mechanism: revenue recycling. Even if Opp knocks out demand elasticity entirely, this pathway still solves."',
        why: 'Names the extension explicitly. Tells the adjudicator this is a Closing contribution, not a restatement. Frames it as additive, not a knife.',
      },
      {
        context: 'Using a POI to plant the extension.',
        line: '"That\'s a fair question; what you\'re missing is the stakeholder-signaling effect, which I\'ll come back to in 90 seconds."',
        why: 'Refuses to fight on Opening\'s territory. Pre-loads the extension into the adjudicator\'s flow before delivering it.',
      },
    ],
    related: ['bp-poi', 'asian-parli-whip', 'wsdc-reply-speech'],
    keywords: [
      'bp closing extension',
      'british parliamentary closing team',
      'closing government extension',
      'closing opposition extension',
      'bp extension examples',
      'how to extend in bp debate',
      'wudc closing strategy',
    ],
    ctaLabel: 'Practice a BP round on Closing',
    ctaHref: '/debate-it?format=bp&motion=This%20house%20would%20impose%20a%20carbon%20tax%20on%20heavy%20industry.',
  },

  'apda-pmr': {
    slug: 'apda-pmr',
    question: 'APDA Prime Minister Rebuttal: how to write the last speech',
    hook: 'The PMR is 5 minutes, no new arguments, and the last word. Collapse to one voter, respond to the LOR cleanly, and write the judge\'s ballot for them.',
    format: 'apda',
    formatName: 'APDA Parliamentary',
    readTime: '6 min',
    takeaways: [
      'PMR rule: no new arguments. Only direct responses to MOC and LOR are permitted.',
      'Collapse to 1-2 voting issues. Trying to extend four contentions in five minutes is how PMRs lose.',
      'Always respond to LOR\'s strongest attack first. Skipping it reads as concession.',
      "End by writing the judge's ballot in one sentence. \"Vote government on contention two: magnitude, probability, irreversibility.\"",
    ],
    sections: [
      {
        heading: 'What the PMR actually is',
        body: [
          "Prime Minister Rebuttal. Five minutes. The last speech of the round, delivered by the same person who gave the PMC eight speeches and forty minutes earlier. By the time you stand for the PMR, the LOR has just landed (the opposition's structured collapse) and the MOC sits in your memory from earlier.",
          "The PMR is the only speech in APDA where you do not get to introduce new arguments. The exception is narrow: you can respond directly to attacks in the MOC and LOR. You cannot add a third contention. You cannot bring a new framework. You cannot run a kritik. Adjudicators strike new arguments cleanly and dock the team for trying.",
          'Most rounds are won or lost in the PMR. The LOR collapsed the opp case to its strongest voter; the PMR has to dismantle that voter, extend the strongest gov argument, and weigh the round in five minutes. There is no slack.',
        ],
      },
      {
        heading: 'Collapse to one voter',
        body: [
          'The PMR rule: pick one or two issues the round actually turns on and walk them. Trying to extend all four PMC contentions in five minutes is how rounds get lost. You spend 75 seconds per contention, none of them get developed, the judge has no clear ballot path.',
          "Pick your voter by working backward from where you actually win. Look at the flow. Which argument did the LOR not attack cleanly? Which contention has both warrant and impact intact after MOC? That is your voter. Lead with it.",
          'Concede the rest. "We grant the framework challenge from LOR. The round still comes down to contention two, and on contention two we win." Conceding minor points buys you time AND signals to the judge that you have a clear path to win.',
        ],
      },
      {
        heading: 'Respond to LOR first',
        body: [
          "The LOR just happened. The adjudicator's pen is hovering over their attacks. If you skip the LOR response and jump to your extension, the judge reads it as conceded.",
          'Open the PMR with the LOR response. \"LOR made one strong attack: that our mechanism doesn\'t work in the post-2020 environment. Three responses.\" Then deliver three short responses. Each takes 20 seconds.',
          'After the LOR is handled, move to MOC responses (briefer, since the LOR already filtered them) and then to your extension. Order matters: most-recent attacks get priority because that is what the judge has top-of-mind.',
        ],
      },
      {
        heading: 'Extend, do not introduce',
        body: [
          'After defense, extend your voter. Extension means deepening an argument that is already on the flow, not adding a new one.',
          'Legal extension: "On contention two, the empirical evidence we cited still stands; LOR\'s rebuttal misread the methodology. Specifically, their counter-cite was a 2015 study; ours is a 2023 update. Our number is current."',
          'Illegal: "Building on contention two, here\'s a new argument: institutional trust." Adding institutional trust as a new line of analysis is a new argument. The chair strikes it.',
          'Adjudicators allow new comparisons and new weighing. A new example illustrating an existing argument is usually fine. New contentions are not.',
        ],
      },
      {
        heading: 'Write the ballot',
        body: [
          'Final 30 seconds of the PMR: write the judge\'s ballot in one sentence. "Vote government on contention two. Magnitude favors us because 50 million people are affected. Probability favors us because the Medicaid mechanism is empirically demonstrated in 38 states. Reversibility favors us because mortality is irreversible. That is the round."',
          'The judge writes that sentence on their flow. When they sit down to fill out the ballot, your sentence is already in their notes. They may write a different ballot, but they have to actively reject yours to do it. Most adjudicators do not bother.',
          "Do not end with \"and that's why we propose.\" Do not end with a recap. End with the ballot sentence and stop. The silence after a strong PMR is the moment the round is decided.",
        ],
      },
      {
        heading: 'Common PMR mistakes',
        body: [
          'Trying to extend everything. Four contentions in five minutes is 75 seconds each. None develop. Collapse to one or two.',
          'Skipping the LOR. The LOR is the most-recent speech in the judge\'s memory. Skipping it reads as concession.',
          'New arguments. Adjudicators strike them cleanly. Sometimes the chair will visibly cross them out on their flow. The team loses credibility.',
          'Forgetting to weigh. If you extend your voter without weighing it against opp\'s strongest argument, the judge has no comparison to resolve the round on.',
          'Reading the speech. The PMR is the only APDA speech where the speaker had no real prep time on the content (it depends entirely on LOR). Reading a pre-written PMR is impossible; tracking the LOR live and responding in real time is the actual skill.',
        ],
      },
    ],
    examples: [
      {
        context: 'Opening the PMR with LOR response.',
        line: '"LOR made one strong attack: that our mechanism doesn\'t work in the post-2020 environment. Three responses. One: the mechanism is structural, not period-specific. Two: their counter-evidence is a 2015 study, ours is 2023. Three: even if attenuated, magnitude still favors us."',
        why: 'Acknowledges LOR\'s best attack, dispatches it in 25 seconds, moves on. Judge sees the response on their flow before mental commitment to LOR has set.',
      },
      {
        context: 'Writing the ballot in the last 30 seconds.',
        line: '"Vote government on contention two. Magnitude: 50 million people. Probability: empirically demonstrated in 38 states. Reversibility: mortality is irreversible. That is the round."',
        why: 'One sentence. Names the voter, names the weighing axes, gives the judge the ballot path. Pen-ready.',
      },
    ],
    related: ['apda-opp-case', 'asian-parli-whip', 'wsdc-reply-speech'],
    keywords: [
      'apda pmr',
      'prime minister rebuttal apda',
      'how to give a pmr',
      'apda last speech',
      'apda rebuttal strategy',
      'pm rebuttal debate',
      'american parliamentary debate pmr',
      'apda final speech',
    ],
    ctaLabel: 'Practice the PMR speech',
    ctaHref: '/debate-it?format=apda&motion=This%20house%20would%20fund%20universal%20healthcare%20by%20raising%20marginal%20income%20tax.',
  },

  'wsdc-first-prop': {
    slug: 'wsdc-first-prop',
    question: 'WSDC first proposition speech: how to open the round',
    hook: 'The 1st Proposition speech in WSDC sets the entire round. Definition, burden, two substantive arguments, and a clean handoff to your partner.',
    format: 'worlds',
    formatName: 'World Schools',
    readTime: '6 min',
    takeaways: [
      'The 1st Prop has 8 minutes to define the motion, set the burden, and present 2-3 substantive arguments.',
      "Definitions in WSDC are looser than in Asian Parli. Reasonable interpretations are protected; squirrels lose on principle.",
      'Build 2-3 arguments, not 5. Three substantive arguments develop; five thin ones die in cross.',
      'End with a one-line handoff to your 2nd Prop so the bench has a coherent two-speech strategy on the flow.',
    ],
    sections: [
      {
        heading: 'What the 1st Prop does',
        body: [
          "The first proposition speech in World Schools Debate is eight minutes. You are the first speaker the panel hears, you set the definition the round will run on, you build the substantive case, and you hand it off to your 2nd speaker who extends.",
          'The job has four parts: define the motion clearly, state the burden of proof both sides should meet, present 2-3 substantive arguments, and end with one line that sets up the rest of the prop case for the 2nd speaker. In that order.',
          "WSDC panels are mixed: some are pure-flow adjudicators, some weight rhetoric and adaptation more heavily. The 1st Prop speech is where you signal you understand the format. Sloppy here and you spend the rest of the round digging out.",
        ],
      },
      {
        heading: 'Definition: be reasonable',
        body: [
          'WSDC definitions are looser than Asian Parli definitions. You do not need a statutory mechanism with named actors. You need a reasonable interpretation that gives the opposition genuine ground to attack and the proposition genuine ground to defend.',
          'Squirrels (unreasonably narrow definitions) lose on principle in WSDC. Panels will rule against a proposition that defined the motion in a way no reasonable opposition could attack. So define generously: state what the motion would mean in plain reading, name the most contested interpretation, and move on.',
          'Example, motion = "This house believes that social media has done more harm than good." Definition: "We interpret social media as the major platforms (Facebook, Instagram, TikTok, X, YouTube) and the 2010-present period. The harm-vs-good question is comparative: net welfare assessment across the population using these platforms." 20 seconds. Both sides have clear ground.',
        ],
      },
      {
        heading: 'Burden of proof',
        body: [
          'After the definition, state the burden: what does each side need to prove to win. This is more formal in WSDC than in APDA. Adjudicators expect it.',
          'On comparative motions ("does more harm than good"), state that both sides need to show net effect, with examples representative of the affected population. On policy motions ("this house would..."), state that proposition shows the policy is preferable to the status quo on key axes.',
          'Stating the burden does two things. It commits the opposition to the same standard. And it signals to the panel that you understand the structure of the round, which builds early credibility.',
        ],
      },
      {
        heading: 'Build 2-3 substantive arguments',
        body: [
          'After definition and burden (about 90 seconds combined), you have 6.5 minutes for substantive content. Build 2-3 arguments. Not 5.',
          "Each argument should have: a clear claim, two or three warrants (mechanism + evidence), an impact, and a brief comparative note about why this argument matters more than the obvious opposition response.",
          'Order the arguments by strength: lead with your most defensible argument (because the judge\'s attention is highest in the first 3 minutes), put your second-strongest second, and if you have a third, make it short.',
          'In a motion about social media harm: argument 1 = mental health (strongest, most-cited evidence, biggest magnitude). Argument 2 = political polarization (substantive, well-warranted, harder to attack on warrant). Argument 3 (short) = attention economy externalities. Three arguments in 6 minutes, each gets 2 minutes, all develop.',
        ],
      },
      {
        heading: 'Pre-empt the obvious opposition attack',
        body: [
          'The strongest 1st Prop speeches pre-empt the obvious opp move. You know opp\'s 1st speaker will argue that social media also has connective benefits. Address it in your final argument: "Opp will argue connective benefits. We grant connective benefits exist. The burden, as we stated, is comparative net welfare. Three responses on why net welfare still favors prop..."',
          'You have not won the connective-benefits fight. But you have planted a frame, and now opp 1 has to clear two arguments instead of one to make their lead stick.',
          'Do not pre-empt every possible opp move. Pick the one you know they will lead with. One pre-empt is strategic; five is paranoid and eats your time.',
        ],
      },
      {
        heading: 'Hand off to your 2nd Prop',
        body: [
          'End the speech with 20 seconds reserved for partner handoff. \"2nd prop will extend on the mental-health argument with the new platform-specific data, respond to whatever opp 1 brings on the political-polarization piece, and add the third argument I previewed.\"',
          'This does two things. It tells the panel there is a coherent two-speech strategy on prop, not just two solo speeches stapled together. And it gives your 2nd Prop explicit licensed turf so they do not retread your ground.',
          'WSDC panels reward bench coordination. If 1st and 2nd Prop sound like they prepped together, the prop case feels more substantial than the opp case even when the content is similar.',
        ],
      },
    ],
    examples: [
      {
        context: 'Definition for a social-media motion.',
        line: '"We interpret social media as the major platforms (Facebook, Instagram, TikTok, X, YouTube) over the 2010-present period. The harm-vs-good question is comparative: net welfare assessment across the population using these platforms."',
        why: 'Concrete platform list, time-bounded, frames the burden as comparative. Opp gets attackable ground; prop gets defendable ground. No squirrel.',
      },
      {
        context: 'Partner handoff line.',
        line: '"2nd prop will extend on the mental-health argument with the new platform-specific data, respond to whatever opp 1 brings on political polarization, and add the third argument I previewed."',
        why: 'Tells the panel there is a coherent two-speech strategy. Licenses turf for 2nd prop. Saves the bench from a panicked huddle between speeches.',
      },
    ],
    related: ['wsdc-reply-speech', 'asian-parli-pm-opening', 'bp-poi'],
    keywords: [
      'wsdc first proposition',
      'world schools 1st speaker prop',
      'wsdc opening speech',
      'how to give wsdc first proposition',
      'world schools debate first speaker',
      'wsdc proposition strategy',
      'wsdc 1st prop structure',
    ],
    ctaLabel: 'Practice a WSDC opening',
    ctaHref: '/debate-it?format=worlds&motion=This%20house%20believes%20social%20media%20has%20done%20more%20harm%20than%20good.',
  },

  'pf-summary-speech': {
    slug: 'pf-summary-speech',
    question: 'PF summary speech structure: how to collapse the round in 3 minutes',
    hook: 'The PF summary is not a 3rd rebuttal. It is the round\'s first collapse. Pick 2-3 voting issues, walk each, and start weighing.',
    format: 'pf',
    formatName: 'Public Forum',
    readTime: '5 min',
    takeaways: [
      'PF summary is 3 minutes per speaker. It comes after both rebuttals and before final focus.',
      'Collapse to 2-3 voting issues. Trying to walk every argument in the round is how summaries lose.',
      'Reorganize by issue, not by speech. Issues are thematic axes that collect multiple arguments from both sides.',
      'Start weighing in the summary. Full weighing comes in final focus, but plant the weighing axes here so final focus has roots.',
    ],
    sections: [
      {
        heading: 'What the PF summary does',
        body: [
          "Public Forum summaries are 3-minute speeches given by speaker 1 of each team (or speaker 2, depending on team strategy) after both rebuttal speeches. They are followed by 3 minutes of grand crossfire and then the 2-minute final focus.",
          "The summary is the round's first collapse. The constructives built 4-5 contentions per side. The rebuttals attacked across the board. By the time the summary stands, there are 8-10 arguments still alive on the flow. The summary's job is to walk the panel through which 2-3 actually matter and which side wins each.",
          "The most common novice mistake: treating the summary like a 3rd rebuttal. Going argument by argument through opp's case, knocking each one down, and never reorganizing the round. The summary is reorganization, not rebuttal.",
        ],
      },
      {
        heading: 'Collapse to 2-3 voting issues',
        body: [
          "Three minutes does not fit five issues. Pick two, maybe three, and walk them. Drop the rest.",
          'How to pick: look at where the round actually clashed. Which contention does each team most need to win? Which response from your rebuttal landed cleanly? Those are voters.',
          'Concede the rest. "We concede their first contention on consumer benefits. The round comes down to the second contention on supplier consolidation and the third on long-term innovation. Those are the voters." Conceding gives you 60 more seconds of speech time.',
        ],
      },
      {
        heading: 'Reorganize by issue, not by speech',
        body: [
          "Issues are not contentions. An issue is a thematic axis that collects arguments from both sides. The 'supplier consolidation' issue collects pro's contention 2, con's rebuttal response, the cross from grand crossfire, and any new evidence from the second rebuttal.",
          "Walking an issue: name the issue, summarize pro's position, summarize con's position, weigh briefly, declare who wins. Repeat for the next issue.",
          "Example: \"Issue one: supplier consolidation. We argued that the policy concentrates market power in three players. Con responded that consolidation is offset by entry incentives. Three reasons we still win: one, empirical evidence from the 2022 merger wave shows entry incentives don't materialize in this sector. Two, even if they did, the timeline is 5-7 years; consolidation harms hit year one. Three, magnitude favors us because consumer prices rise immediately. We win issue one.\"",
        ],
      },
      {
        heading: 'Start weighing in the summary',
        body: [
          'Full weighing happens in final focus, but you must plant the weighing axes in the summary. Without weighing in summary, your final focus has no roots; the panel did not see the weighing develop, only the conclusion.',
          'Pick the weighing axis where you win and state it as part of each issue walk. "Issue one: supplier consolidation. We win on magnitude and probability." "Issue two: long-term innovation. We win on timeframe (impacts land in year one vs their year ten)."',
          'By the time final focus stands, the panel has already seen "magnitude," "probability," "timeframe" written next to your issues. Final focus extends the weighing; summary plants it.',
        ],
      },
      {
        heading: "What to skip",
        body: [
          'New arguments are illegal in the summary. Same rule as the WSDC reply or APDA PMR. Adjudicators strike new contentions.',
          "Skip the framework rehash. If your constructive set a comparative-cost framework, do not re-derive it in the summary. Use it as the lens you weigh through.",
          'Skip extending arguments that the rebuttals already locked down. If con\'s rebuttal cleanly answered your first contention and you do not need it to win, drop it. Conceding shows confidence and saves time.',
          'Skip cross-applies. If you need to reference an earlier argument, do it inline as part of an issue walk. "Pulling through our contention 2 evidence into this issue" is cleaner than a separate cross-apply block.',
        ],
      },
      {
        heading: 'Closing the summary',
        body: [
          "Final 20 seconds: signpost what final focus will do. \"In final focus, we'll extend on the consolidation issue, respond to whatever con brings on innovation timeline, and finish weighing on magnitude.\" The panel knows what to expect; they listen for those three pieces.",
          "Do not end with 'and that is why we propose' or a recap. Recaps in a 3-minute speech are dead weight. End with the final-focus preview and stop.",
        ],
      },
    ],
    examples: [
      {
        context: 'Issue walk in the summary.',
        line: '"Issue one: supplier consolidation. Three reasons we win. One: empirical evidence on the 2022 merger wave. Two: con\'s timeline argument is 5-7 years, ours is year one. Three: magnitude favors us because prices rise immediately. We win issue one on magnitude and timeframe."',
        why: 'Names the issue, gives three responses, names the weighing axes. Panel writes "magnitude, timeframe" next to issue one on the flow. Final focus can pick it up.',
      },
      {
        context: 'Final-focus preview at the close.',
        line: '"In final focus, we will extend on the consolidation issue, respond to whatever con brings on innovation timeline, and finish weighing on magnitude."',
        why: 'Panel knows the shape of the final focus. They flow against this preview. Speech ends with a forward-looking commitment, not a backward-looking recap.',
      },
    ],
    related: ['pf-crossfire-questions', 'wsdc-reply-speech', 'apda-opp-case'],
    keywords: [
      'pf summary speech structure',
      'public forum summary speech',
      'pf 3 minute summary',
      'how to write pf summary',
      'public forum collapse speech',
      'pf summary tips',
      'pf summary vs final focus',
    ],
    ctaLabel: 'Practice a PF round',
    ctaHref: '/debate-it?format=pf&motion=Resolved%3A%20The%20benefits%20of%20regulating%20social%20media%20outweigh%20the%20harms.',
  },


  // ── 2026-07-14 top-funnel pack: question queries new debaters type ──

  'how-to-practice-debate-online': {
    slug: 'how-to-practice-debate-online',
    question: 'How to Practice Debate Online',
    hook: 'Watching rounds is not practice. Practice needs a clock, your voice, and a ballot: timed solo drills, live online rounds, and AI sparring that ends in a judged RFD.',
    format: 'general',
    formatName: 'All formats',
    readTime: '7 min',
    takeaways: [
      'Every online session needs a running clock and a feedback loop. If either is missing, you are consuming content, not practicing.',
      'Record every drill speech on your webcam and watch it back within ten minutes. The recording is your judge when nobody else is around.',
      'One live round against a stranger per week beats five scrims against a teammate who already knows your habits.',
      'End every practice round with a written ballot, from a judge, a peer, or an AI. Unjudged reps groove your errors as fast as your skills.',
    ],
    sections: [
      {
        heading: 'Why most online practice does nothing',
        body: [
          'The default version of "practicing online" is watching a WUDC final at 1.5x, reading a rebuttal guide, and scrolling a debate subreddit. That is study, and study has a place, but none of it is practice. Debate is a motor skill. The gap between knowing what a good rebuttal looks like and producing one at minute six of a speech closes only when your mouth does the work.',
          'Every online session that counts has three parts: a running clock, your voice out loud, and a feedback loop that tells you what to fix. A drill with no timer becomes a leisurely think. A speech given in your head transfers nothing. A round nobody judges grooves your errors exactly as fast as it grooves your skills. Build all three into every session and the internet becomes the best practice room you have ever had.',
        ],
      },
      {
        heading: 'Solo drills, adapted for a laptop',
        body: [
          'The redo drill is the highest-value 20 minutes available to a debater practicing online. Pick a motion, take 90 seconds of prep, and deliver a 4-minute constructive into your webcam. Watch the recording once, flowing yourself like a judge would. Then deliver the same speech again. The second take is always sharper, and the specific edits you make between takes, cutting the dead opening, moving the weighing up, killing the filler phrase you said eleven times, are the actual lesson.',
          'Two rules keep the recording honest. Stand up, because you will stand at tournaments and your breath support changes when you do. And speak at tournament volume, not consideration-for-roommates volume. A speech mumbled at a screen from a desk chair rehearses a delivery you will never use in competition.',
          'For rebuttal work without an opponent, cue up any recorded round on YouTube, flow the first constructive, pause the video, and give a timed 4-minute response before watching what the real opponent said. Recorded finals are a bottomless pool of sparring partners, most of them better than anyone at your club.',
        ],
      },
      {
        heading: 'Getting live rounds against real humans',
        body: [
          'Solo reps build mechanics. Live rounds test them against a person who does not care about your plan. The usual sources, in rough order of accessibility: your own club moved onto a video call with full speech times, the Discord practice servers where most competitive circuits organize offseason scrims, and matchmaking built for exactly this. Debatable runs live matchmaking at /spar that pairs you with another debater for a judged round, with an AI opponent as the fallback when the queue is thin.',
          'Whatever the source, one habit decides whether the round is worth anything: treat it like a tournament round. Full speech times, POIs live, no restarts, cameras on. And favor strangers. A teammate who has heard your extension six times rebuts it from memory; a stranger rebuts what you actually said. One stranger round a week is worth more than five inside your own club.',
          'When no judge is present, trade ballots. After the round, each debater writes a three-line RFD for the other: who won, on which argument, and the one thing to fix before the next round. Two minutes of writing each, and both of you leave with the thing practice rounds usually fail to produce: a written record of what actually happened.',
        ],
      },
      {
        heading: 'AI sparring, and why the ballot is the point',
        body: [
          'At 11pm before a tournament, no human is queuing for a round. This is the slot AI sparring fills: an opponent that argues back in your format, takes POIs, and never cancels. Run these rounds switch-side, and run them on the motions you would dread drawing, because an opponent with no ego is the cheapest place to be bad at something.',
          'The round itself is half the value. The other half is the ballot. A judged round ends with an RFD, and the RFD is where practice turns into improvement: read it, find the recurring note, and carry one concrete fix into your next rep. If the ballot says you lost the weighing, your next redo drill is a weighing drill. Rounds without that extraction step are just cardio.',
          'One caution. Do not let AI rounds become all of your rounds. They are for volume, odd hours, and deliberate work on weaknesses. Humans still supply the unpredictability, the nerves, and the judge whose face you have to read mid-speech.',
        ],
      },
      {
        heading: 'Making it transfer to in-person tournaments',
        body: [
          'Online practice builds real skills with a few systematic distortions. You learn to speak to a camera 40 centimeters away instead of a judge eight meters away. You learn to pause for latency. You get used to a flow sitting on a second monitor and a mute button that erases your hesitation sounds. None of those habits exist in a school gym on tournament morning.',
          'The countermeasures cost nothing. Project to the far wall of your room, not into the mic. Stand for every speech. Once a week, deliver a speech from paper notes instead of a screen. And once a week, add friction on purpose: no headphones, someone talking in the next room, a speech given straight after climbing a flight of stairs. Tournaments are noisy, hostile environments; sterile practice under-prepares you for them.',
          'The flow deserves its own transfer work. If you type your flow during online rounds, hand-write it at least once a week. Most tournaments still put you at a desk with paper and a pen, and a flowing habit that lives in a keyboard will desert you there.',
        ],
      },
      {
        heading: 'A week that compounds',
        body: [
          'Monday, 25 minutes: redo drill on a fresh motion, both takes recorded and reviewed. Wednesday, 60 minutes: one full live round, human if the queue gives you one, AI if not, then ten minutes with the ballot. Friday, 25 minutes: rebuttal reps against a recorded speech, two cycles of pause-and-respond. Weekend, 45 minutes: one switch-side round in your weakest format, plus a review of the week\'s flows.',
          'That is roughly three hours, and it beats a single unbroken three-hour session because every block has its own clock and its own feedback loop. Track one number a month: a ballot criticism that keeps repeating, filler words per minute, seconds of prep you actually use. Whatever your recordings say is the weakest axis, next month\'s drills point at it. Improvement in debate is measurable the moment you bother to measure it.',
        ],
      },
    ],
    examples: [
      {
        context: 'Redo drill, second take, after watching the first recording.',
        line: '"Their entire case rests on one link: that the ban actually cuts consumption. Three reasons that link is broken."',
        why: 'The first take opened with 20 seconds of case summary. The redo opens on the collapse point. That edit is what the recording exists to expose.',
      },
      {
        context: 'First 15 seconds of a live online round with a stranger.',
        line: '"Seven-minute speeches, POIs live after the first minute, no restarts, ballot at the end. Ready?"',
        why: 'Ten seconds of agreed rules separates a real round from a chat with speeches in it. Set tournament conditions, then start the clock.',
      },
      {
        context: 'Extracting the fix from an AI judge\'s RFD.',
        line: '"Ballot says I lost the weighing, not the argument. Next session: magnitude versus probability comparison goes inside the constructive, not the last 30 seconds."',
        why: 'One diagnosis, one fix, carried into the next rep. This extraction step is the difference between playing rounds and training.',
      },
    ],
    related: ['how-to-practice-debate-alone', 'how-to-get-better-at-debating', 'how-to-prepare-for-a-debate-tournament', 'how-to-improve-your-rebuttals'],
    keywords: [
      'how to practice debate online',
      'online debate practice',
      'practice debate online free',
      'debate practice websites',
      'how to practice debating at home',
    ],
    ctaLabel: 'Run a judged practice round',
    ctaHref: '/debate-it',
    faqs: [
      {
        q: 'Can you get good at debate by practicing online?',
        a: 'Yes, if the practice involves speaking rather than watching. Timed speeches on camera, live rounds over video call, and judged sparring build the same core skills as in-person practice: argument generation, structure under a clock, and direct clash. What online practice trains less well is room presence and projection, so pair it with deliberate transfer habits like standing, projecting, and speaking from paper notes.',
      },
      {
        q: 'How many hours a week should I practice debate online?',
        a: 'Three focused hours beats ten passive ones. A workable floor is four sessions a week: one redo drill, one live judged round, one rebuttal-rep session against a recorded speech, and one switch-side round. Each block runs 25 to 60 minutes. Consistency across weeks matters more than volume inside any single week.',
      },
      {
        q: 'Is AI debate practice as good as a human partner?',
        a: 'They do different jobs. A human gives you unpredictability, nerves, and a judge whose reactions you have to read. An AI opponent gives you volume, odd-hour availability, switch-side reps without ego, and a written ballot after every round. Strong online practice uses both: humans for realism, AI for rep count and feedback density.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

  'how-to-practice-debate-alone': {
    slug: 'how-to-practice-debate-alone',
    question: 'How to Practice Debate Alone (No Partner Needed)',
    hook: 'A partner is a scheduling problem, not a prerequisite. Switch-side timer drills, rebuttal reps against recorded finals, self-judge rubrics, impromptu ladders. All on a clock.',
    format: 'general',
    formatName: 'All formats',
    readTime: '6 min',
    takeaways: [
      'Solo practice yields more speeches per hour than team practice. You are always the one holding the floor.',
      'Switch sides on every motion. Arguing the side you hate is where argument generation actually gets built.',
      'Record everything and score it against the same five-axis rubric every time. Your memory of a speech flatters you; the file does not.',
      'Recorded finals are an endless supply of opponents. Flow a constructive, pause the video, rebut it on a timer.',
    ],
    sections: [
      {
        heading: 'The rep math favors you',
        body: [
          'A two-hour team practice yields maybe two speeches per debater and twenty minutes of waiting around each one. Two hours alone can yield eight. Nobody is scheduling around you, nobody else needs the floor, and every timed slot belongs to your mouth. Debaters who train alone between practices out-rep debaters who only speak at practice, and rep count is the single most reliable predictor of delivery improvement.',
          'What solo practice lacks is also real: an opponent who surprises you, and a judge who tells you the truth. Every drill below is built to patch one of those two holes, unpredictability or feedback, without requiring a second person in the room.',
        ],
      },
      {
        heading: 'Switch-side timer drills',
        body: [
          'Take a motion. 90 seconds of prep, then a 4-minute Gov constructive, out loud, standing, recorded. The moment you finish, take 90 more seconds and deliver a 4-minute Opp speech against the case you just built. No break between the two; the discomfort of turning on your own material is the drill.',
          'Arguing against yourself does two things nothing else does. It forces you to locate the real weakness in your own case, because you know exactly where you hid the weak link. And it doubles argument generation on every motion, since you have now built both benches. Three full cycles runs about 35 minutes and contains six timed speeches. One integrity rule: if your Opp take never names your Gov speech\'s best argument, you dodged, and the rep does not count. Redo it.',
          'The drill scales to prepared formats. On a PF or Policy topic you will live with for a month, run the same cycle with 3 minutes of prep per side and keep the takes you liked as case skeletons. In parli formats, draw a fresh motion every cycle; the point there is range, not depth.',
        ],
      },
      {
        heading: 'Rebuttal reps against recorded speeches',
        body: [
          'Recorded rounds are an infinite supply of opponents, most of them better than anyone you know personally. Pull up a WUDC final, an NSDA nationals round, or any circuit round on YouTube. Flow the first constructive in full, pause the video, take one minute of prep, and deliver a timed 4-minute rebuttal to what you flowed.',
          'Then unpause and watch what the actual opponent said. The comparison is the feedback: which of your responses matched theirs, which of theirs you missed entirely, and which answers you found that they did not. Catching a press that a world-class speaker missed is a confidence rep; missing one they found is the most instructive 30 seconds available to a debater working alone.',
          'The escalation is to rebut the side that won. Winners leave fewer soft targets, so the drill forces you past the easy presses and into structural attacks on links and weighing.',
        ],
      },
      {
        heading: 'Self-judging with a fixed rubric',
        body: [
          'Your memory of your own speech is unreliable in the specific direction of flattery. The recording is not. Watch every drill speech within ten minutes of giving it, and score it 1 to 5 on the same five axes every time: signposting, warrant depth, weighing, pace, and directness of clash. Fixed axes are what make week-to-week scores comparable; if you grade a different vibe each session, the numbers mean nothing.',
          'Then write a two-sentence RFD against yourself, timestamped. "Weighing arrived at 3:50 of 4:00" is a note you can drill against on the next rep. "Sound more confident" is not. Keep the scores and RFDs in one running note. A month of entries names your weakest axis with no ambiguity, and that axis picks next month\'s drills.',
          'Once a week, judge someone else\'s round the same way. Watch a recorded round in full, write your RFD before the adjudicator on the video announces theirs, then compare. Calibrating your judging against real panels sharpens the same instinct you turn on yourself, and it teaches you what a dropped argument actually costs on a ballot.',
        ],
      },
      {
        heading: 'Impromptu ladders',
        body: [
          'The ladder compresses prep time in stages. Draw a random motion and give a 1-minute speech after 30 seconds of prep. New motion: a 2-minute speech after 60 seconds. New motion: 3 minutes after 90 seconds. Finish with a 5-minute speech after 2 minutes of prep. The full ladder runs about 20 minutes, and every rung uses a fresh motion so you never coast on recycled material.',
          'The early rungs teach you to reach structure instantly: model first, then two arguments, no wind-up. By the top rung, 2 minutes of prep feels roomy, and the 15 or more minutes most parli formats actually give you starts to feel long. Run the ladder twice a week; it is the highest-density argument-generation work a solo debater can do.',
          'Motion supply is a solved problem. Major tournaments publish their motions, and the archives from WUDC, EUDC, and national championships hold hundreds of tested, balanced motions sorted by theme. Save a list of 50, draw blind, and no rung of the ladder ever gets comfortable.',
        ],
      },
      {
        heading: 'Where AI sparring fits',
        body: [
          'The one thing no solo drill fakes is an opponent who answers the argument you actually made and presses exactly where you flinched. When no partner exists, an AI round fills that slot: pick a format, argue out loud, take the POIs, and read the judged RFD when it ends. On Debatable that is one click and zero scheduling, which matters most at the hours nobody else is practicing.',
          'Keep the ratio honest. Drills build the mechanics; sparring tests whether they hold under interruption. A workable split for a partnerless week is four drill sessions to two judged rounds, with the ballots from those rounds deciding which drills the next week gets.',
        ],
      },
    ],
    examples: [
      {
        context: 'Switch-side drill, Opp take against your own Gov case.',
        line: '"The best thing Gov said was deterrence. Deterrence fails on its own logic: the people this policy targets do not price in consequences before acting."',
        why: 'The Opp rep names and attacks the Gov speech\'s strongest argument. If your second take dodges your first take\'s best material, the rep taught you nothing.',
      },
      {
        context: 'Two-sentence self-RFD, written five minutes after a recorded drill speech.',
        line: '"Dropped the economy turn at 2:40 and never recovered it. Weighing arrived at 3:50 of 4:00; it moves to the top of the final minute next rep."',
        why: 'Timestamped and specific, so the next rep has a target. A self-RFD that says "be more confident" cannot be drilled against.',
      },
      {
        context: 'Top rung of an impromptu ladder, motion drawn two minutes ago.',
        line: '"Model first: a national statutory ban, enforced at point of sale. Two arguments: substitution into black markets, and enforcement that lands hardest on the poorest users."',
        why: 'Structure arrives in the first sentence because the early rungs made it automatic. Model, two arguments, no wind-up.',
      },
    ],
    related: ['how-to-practice-debate-online', 'how-to-improve-your-rebuttals', 'how-to-get-better-at-debating', 'how-to-win-a-debate'],
    keywords: [
      'how to practice debate alone',
      'practice debate by yourself',
      'solo debate drills',
      'debate practice without a partner',
      'how to practice debate at home alone',
    ],
    ctaLabel: 'Start a solo round with an AI judge',
    ctaHref: '/debate-it',
    faqs: [
      {
        q: 'Can you really practice debate without a partner?',
        a: 'Yes. Most core debate skills, argument generation, prep speed, structure, delivery, and rebuttal mechanics, are individual skills that improve fastest through solo reps on a timer. What a partner adds is unpredictability and feedback, and both have solo substitutes: recorded speeches to rebut, a fixed self-judging rubric, and AI rounds that end in a judged ballot.',
      },
      {
        q: 'What is the best solo debate drill for beginners?',
        a: 'The redo drill. Give a 4-minute speech on a timer, watch the recording once, then give the same speech again. It needs no materials, takes 20 minutes, and the edits you make between takes teach structure and economy faster than any lecture. Add switch-side drills and impromptu ladders once the redo drill feels comfortable.',
      },
      {
        q: 'How long should a solo debate practice session be?',
        a: 'Twenty to forty minutes, four or five days a week. Solo work is dense: a 35-minute switch-side block contains six timed speeches, more than most debaters give in a two-hour team practice. Stop while your delivery is still sharp; a tired final rep grooves the exact habits you are trying to remove.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

  'how-to-get-better-at-debating': {
    slug: 'how-to-get-better-at-debating',
    question: 'How to Get Better at Debating',
    hook: 'Debating is four trainable skills: argument construction, refutation, weighing, delivery. Diagnose the weakest one, drill it on a clock, and close the feedback loop on every speech. A 30-day plan inside.',
    format: 'general',
    formatName: 'All formats',
    readTime: '7 min',
    takeaways: [
      'Debate is four separate skills: argument construction, refutation, weighing, delivery. Train the weakest one, not the favorite.',
      'Rounds are tests, not training. Drills with reps and a clock are where the skill actually builds.',
      'Flow everything, including rounds you only watch. The flow is the skill under every other skill.',
      'Close the feedback loop: mine ballots for repeat comments, record your speeches, rewatch outrounds with predictions.',
    ],
    sections: [
      {
        heading: 'The skill stack: four things, not one',
        body: [
          'Debating is four separate skills wearing one name. Argument construction: building a claim, warrant, and impact that survive contact. Refutation: finding the load-bearing link in an opposing argument and cutting it. Weighing: telling the judge why your argument matters more on magnitude, probability, and timeframe. Delivery: speaking so a judge can flow you and wants to keep listening.',
          'Most debaters plateau because they only train the skill they already enjoy. The researcher builds beautiful cases and folds in rebuttal. The natural speaker sounds like a champion while saying nothing the judge can vote on. Getting better starts with an honest diagnosis: pull your last five ballots, list every criticism, and circle the comment that appears more than once. That comment names your training priority for the next month.',
          'No ballots yet? Run this test instead. Record a 4-minute speech on any motion, wait a day, then flow your own recording. If you cannot reconstruct the case from your own flow, the problem is structure. If the arguments flow cleanly but feel thin, the problem is warranting. If everything is there and nothing compares, the problem is weighing.',
        ],
      },
      {
        heading: 'Deliberate practice beats round volume',
        body: [
          'Playing full rounds every week feels like training. Mostly it is testing. A round exercises everything at once, which means it improves nothing in particular; under pressure you fall back on the moves you already have. Improvement comes from isolating one skill and repping it under a clock.',
          'Three drills that work. Rebuttal reps: take any published case, give yourself 60 seconds of prep, deliver a 2-minute refutation. Ten reps, twice a week. Weighing sprints: take two finished arguments on opposite sides and give a 1-minute speech that only compares them, no new material, comparison only. Redelivery: give the same 5-minute speech three times, cutting to 4 minutes, then 3, keeping every argument. The third version is what an efficient speech feels like.',
          'Keep the ratio near three drill sessions per practice round. Rounds tell you what to drill next; drills produce the change. A weekly rhythm that holds up: two 20-minute drill blocks, one full practice round, one review pass on the recording.',
        ],
      },
      {
        heading: 'Flowing is the skill under every other skill',
        body: [
          'The flow is the written map of the round: every argument, every response, every drop, tracked in columns by speech. Debaters who flow badly refute the speech they remember instead of the speech that happened, miss drops they could have called out, and weigh against arguments the other side never made.',
          'Train it directly. Flow one recorded round per week that you are not debating in. Pause after each speech and check: could you deliver the next speech off your flow alone? Then build shorthand: 20 to 30 personal abbreviations (mag for magnitude, b/c for because, arrows for causation) and force yourself to use them until they are automatic. Flowing speed comes from shorthand, not from writing faster.',
          'Use the flow to pick fights, not just to record them. Before you stand, star the two arguments on the page that decide the round and cross out anything you plan to concede. A speech delivered off a marked-up flow follows the round\'s actual geography. A speech delivered from memory follows whatever happened to be memorable, and those are rarely the same round.',
        ],
      },
      {
        heading: 'Watch outrounds like a scout, not a fan',
        body: [
          'Watching elite rounds passively is entertainment. Watching them actively is training. The method: before each speech starts, pause and write the three responses you would make. Play the speech. Compare your three against what the speaker actually did. The gap between your list and theirs is the most precise map of your blind spots you will ever get.',
          'Steal structure, not lines. When a closing speech makes a messy round feel simple, ask what the speaker chose to drop, what order they took the issues in, and where the weighing landed. Those choices transfer to every motion you will ever debate. The specific zinger does not.',
        ],
      },
      {
        heading: 'Close the feedback loop',
        body: [
          'A speech without feedback is a rep with no weight on the bar. Two loops cost nothing. Ballots: keep a running document of every judge comment; one ballot is noise, five ballots are a diagnosis. When the format allows questions after the round, ask one specific one, not "how did I do" but "what would have made the second speech a clear win." Specific questions get answers you can drill. Recordings: record every practice speech on your phone and listen back the same day for filler words, dead pace, and missing signposts. Count the filler words, write the number down, beat it next session.',
          'The third loop is an opponent who pushes back. A teammate works. So does an AI sparring partner; a practice round on Debatable ends with a judge ballot, which turns a solo session into a scored rep instead of a monologue. Whatever the source, the rule is the same: no speech disappears unexamined. If you spoke and nothing graded it, you rehearsed your habits, good and bad alike.',
        ],
      },
      {
        heading: 'The 30-day plan',
        body: [
          'Days 1 to 7: diagnose. Collect ballots or run the self-flow test, pick your weakest skill, and set a baseline: one recorded 4-minute speech you will compare against on day 30. Days 8 to 14: drill that weakness 20 minutes a day. Structure problem: outline drills, claim, warrant, impact for every argument before you speak. Refutation problem: rebuttal reps. Weighing problem: weighing sprints, and end every speech with one even-if comparison.',
          'Days 15 to 21: reintegrate. Three full practice rounds this week, flowing every one, with a review pass the same day. Days 22 to 30: pressure. Harder motions, shorter prep, at least one round on the side you find harder to defend. On day 30, record the same speech from day 1 and play both back to back. The difference you can hear is the difference a judge scores.',
        ],
      },
    ],
    examples: [
      {
        context: 'Signposted refutation, any format.',
        line: '"Three responses to their second contention. One: the link runs backwards. Two: the harm already exists in the status quo. Three: even if it all stands, we outweigh on timeframe."',
        why: 'The numbers are the structure. A judge can flow all three responses in real time, and the even-if cap means losing two of the three still leaves a path to the ballot.',
      },
      {
        context: 'Weighing sentence that ends a practice speech.',
        line: '"Even if you grant their whole economy argument, a recession recovers and a surveillance state does not. Reversibility decides this round."',
        why: 'One sentence, one comparison, one named metric. Ending every drill speech with a line like this is how weighing becomes a reflex instead of an afterthought.',
      },
      {
        context: 'Refutation aimed at the warrant, not the claim.',
        line: '"Their entire impact assumes firms pass the tax on to consumers. In a competitive market firms eat the margin instead, and the argument dies at its first link."',
        why: 'Cutting the warrant collapses everything built on top of it. Attacking the claim head-on just produces a they-said-we-said the judge has to coin-flip.',
      },
    ],
    related: ['how-to-practice-debate-online', 'how-to-practice-debate-alone', 'how-to-improve-your-rebuttals', 'how-to-prepare-for-a-debate-tournament'],
    keywords: [
      'how to get better at debating',
      'how to improve debate skills',
      'debate practice drills',
      'how to become a better debater',
      'debate improvement plan',
    ],
    ctaLabel: 'Run a practice round',
    ctaHref: '/debate-it?motion=This%20house%20would%20ban%20targeted%20political%20advertising.',
    faqs: [
      {
        q: 'How can I get better at debating fast?',
        a: 'Isolate one skill and drill it daily instead of only playing full rounds. Twenty minutes of rebuttal reps or weighing sprints, five days a week, moves a specific weakness faster than three unfocused practice rounds. Record every speech, count your filler words, and end each speech with one even-if comparison so weighing becomes automatic.',
      },
      {
        q: 'Can I improve at debate without a club or partner?',
        a: 'Yes. Flow recorded outrounds and predict each speech before playing it, run redelivery drills against your phone, and rebut published cases on a 60-second prep clock. For live pushback, an AI opponent works: Debatable runs a timed round and writes a judge ballot, so solo practice still ends with feedback.',
      },
      {
        q: 'Is watching debate videos good practice?',
        a: 'Only if you watch actively. Pause before each speech, write the three responses you would give, then compare your list against what the speaker delivered. Flow the round as if you were judging it. Passive watching entertains; prediction plus comparison converts elite rounds into a map of your own blind spots.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

  'how-to-win-a-debate': {
    slug: 'how-to-win-a-debate',
    question: 'How to Win a Debate',
    hook: 'Rounds are won on comparison, not argument count. Frame the question early, collapse to your best ground late, answer the strongest version of the other side, and hand the judge the ballot in your last speech.',
    format: 'general',
    formatName: 'All formats',
    readTime: '7 min',
    takeaways: [
      'Judges vote on comparison. Winning more arguments matters less than winning the arguments the round turns on.',
      'Set the framing early: name the question the round answers and the standard for judging the answers.',
      'Collapse in the back half. Two issues developed and weighed beat six issues touched.',
      'Answer the best version of their case, adapt to the judge in front of you, and end with the sentence you want on the ballot.',
    ],
    sections: [
      {
        heading: 'Rounds are won on comparison, not count',
        body: [
          'A judge deciding a debate is not tallying arguments. They are answering one question: given everything said, which side won the issues that mattered most? You can win six clashes and lose the round because the other side won the one clash that decided it. Winning a debate means controlling which issues count as decisive, then winning those.',
          'Run this test before every speech: if both sides are fully right about their own arguments, who wins? If the honest answer is unclear, the round is missing comparison, and the first speaker to supply it usually takes the ballot. That comparison work is called weighing, and it is the highest-leverage minute in any speech you will ever give.',
        ],
      },
      {
        heading: 'Frame the question before you argue the answer',
        body: [
          'Framing means naming what the round is actually about and what standard the judge should use to decide it. Do it early, in the first speech if the format lets you. A motion like "schools should ban phones" can be a round about learning outcomes, about student autonomy, or about enforceability. Whoever names the question first makes the other side argue on foreign ground.',
          'Then hand the judge a measuring stick. Weighing runs on a few comparative metrics: magnitude, how many people and how badly; probability, how likely the harm or benefit actually is; timeframe, how soon it lands; reversibility, whether the damage can be undone. Say which metric should dominate and why. "Prefer probability over magnitude here, because their harm is speculative and ours is already documented" is a sentence a judge writes down and reuses while deciding.',
        ],
      },
      {
        heading: 'Collapse: go for less, better',
        body: [
          'The most common way strong debaters lose: trying to win everything in the final speeches. Coverage feels safe, and judges quietly hate it, because 40 seconds per issue is enough to mention arguments and never enough to win them. The back half of a round is for collapsing: pick the one or two issues you are winning that also matter most, and spend real time there.',
          'Choose with two filters. First: am I actually ahead on this issue on the flow, not just in my head? Second: does this issue matter under the weighing the round has settled on? An argument you are winning that does not matter is a trap. An argument that matters that you are losing is a bigger one. The intersection of winning and mattering is your collapse target.',
          'Kick the rest out loud. "We do not need our second contention to win, so we will not extend it" costs nothing when said explicitly. Silence costs more: the other side keeps attacking a ghost, looks dominant doing it, and the judge reads your quiet retreat as a drop instead of a choice.',
        ],
      },
      {
        heading: 'Answer the best version of their case',
        body: [
          'Strawmanning feels efficient and loses rounds. Any decent opponent rebuilds the argument stronger than you attacked it, and the judge scores you as having answered nothing. Answer the version their best teammate would give. If they said it badly, repair it before you refute it: "the strongest form of this argument says X, and even that fails for two reasons."',
          'Layer your answers with even-if. First line: the argument is wrong, and here is the broken link. Second line: even if it stands, it is smaller, slower, or less likely than ours. Layered responses mean losing the first exchange does not lose the issue. A single-line response is an all-or-nothing bet you never needed to make.',
        ],
      },
      {
        heading: 'Adapt to the judge you actually have',
        body: [
          'The same speech wins in front of one judge and loses in front of another. A flow judge tracks every argument and rewards line-by-line coverage plus explicit weighing. A lay judge, which includes nearly every teacher and classmate in a classroom debate, rewards clarity, structure, and evident fairness, and is actively put off by speed and jargon.',
          'In front of lay judges: cut the jargon, slow down, signpost in plain language ("my second point," not "extend the link turn"), and stay visibly reasonable toward the other side; conceding one small point often buys the credibility that decides a close round. In front of trained judges: use the flow, number your responses, weigh explicitly. When you can ask how a judge likes to evaluate rounds, ask. When you cannot, watch the pen: if they stop writing, they stopped flowing, and it is time to slow down and simplify.',
          'Class debates reward the same skills in different packaging. The winning move in third period is the winning move in an elimination round: name the question, compare the answers, stay composed. The student who calmly says "even if my opponent is right about the costs, the benefits I have shown are larger and arrive sooner" reads as the winner to everyone in the room, including the teacher deciding the grade.',
        ],
      },
      {
        heading: 'The last-speech checklist',
        body: [
          'The final speech is not a summary; it is the ballot, written out loud. Five items, in order. One: name the voting issues, two of them, three at most. Two: for each, state what you said, the best thing they said back, and why your side still wins it. Three: weigh, comparing your strongest impact against theirs on magnitude, probability, and timeframe. Four: fire one even-if line at their best remaining argument. Five: end with the single sentence you want to appear on the ballot.',
          'No new arguments. In most formats they get struck, and in a classroom they read as unfair. New comparisons of old material are always legal, and they are exactly what the last speech is for. Then drill it: after any practice round, take 60 seconds of prep and deliver a 3-minute final speech off this checklist. Rounds go to whoever makes the judge\'s decision easiest to write, and that is rehearsable on any motion, in a tournament round, a classroom, or a practice round on Debatable.',
        ],
      },
    ],
    examples: [
      {
        context: 'Collapsing in a final speech.',
        line: '"We ran three arguments tonight. We need one. This round is the safety issue, and we win it three ways."',
        why: 'Explicit collapse. The judge hears a choice, not a drop, and the speaker buys three minutes of depth on the single issue that decides the ballot.',
      },
      {
        context: 'An even-if answer that survives losing the clash.',
        line: '"Even if their deterrence argument stands, it protects hypothetical future victims at some unknown rate. Our harm is certain and it is happening now. Probability and timeframe both break our way."',
        why: 'The response works without winning the underlying argument. Naming the metrics turns a rebuttal into weighing the judge can quote in the decision.',
      },
      {
        context: 'Framing a classroom debate on social media.',
        line: '"The question is not whether social media has benefits. Of course it does. The question is whether those benefits justify the documented costs to teenagers, and on that comparison we win."',
        why: 'Concedes the obvious to claim the comparison. The teacher now judges the round on the speaker\'s question, which is the version their side wins.',
      },
    ],
    related: ['how-to-improve-your-rebuttals', 'pf-summary-speech', 'apda-pmr', 'bp-closing-extension'],
    keywords: [
      'how to win a debate',
      'how to win a class debate',
      'debate winning strategies',
      'weighing in debate',
      'how to win an argument in a debate',
    ],
    ctaLabel: 'Debate it now',
    ctaHref: '/debate-it?motion=This%20house%20would%20ban%20phones%20in%20schools.',
    faqs: [
      {
        q: 'How do you win a debate against someone more experienced?',
        a: 'Narrow the round. Experienced debaters win wide rounds because they cover more, faster. Frame one clear question early, collapse to your strongest issue, and force depth over breadth. Answer their best argument with an even-if so one lost exchange does not lose the round, and weigh explicitly; experience matters less once the comparison is stated for the judge.',
      },
      {
        q: 'What is weighing in debate?',
        a: 'Weighing is comparing impacts across sides instead of just asserting your own. The standard metrics: magnitude (how many people, how badly), probability (how likely it actually is), timeframe (how soon it lands), and reversibility (whether it can be undone). A weighing sentence names the metric and does the comparison: "our harm is certain and immediate; theirs is speculative and a decade out."',
      },
      {
        q: 'How do you win a class debate?',
        a: 'Treat the teacher and classmates as lay judges. Speak plainly, signpost every point, and stay visibly fair to the other side; credibility decides most classroom rounds. Pick two arguments and develop them instead of listing six. In your last turn, name the main clash, explain why you won it, and end on one clean sentence.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

  'how-to-prepare-for-a-debate-tournament': {
    slug: 'how-to-prepare-for-a-debate-tournament',
    question: 'How to Prepare for a Debate Tournament',
    hook: 'A 14-day plan that survives contact with the tournament: case file, blocks file, judged dress rehearsals, and the round-day habits that keep you sharp through round 5.',
    format: 'general',
    formatName: 'All formats',
    readTime: '7 min',
    takeaways: [
      'Start 14 days out: research days 1 to 4, case and blocks days 5 to 9, judged practice rounds days 10 to 13, rest day 14.',
      'Write a blocks file: the ten most likely attacks on your case, each with a prewritten 30-second answer.',
      'Run at least two full-length judged rounds before you travel. Unjudged reps hide your weaknesses.',
      'On the day: flow every speech, eat between every round, and read the judge before you adapt to them.',
    ],
    sections: [
      {
        heading: 'Start two weeks out, not two nights',
        body: [
          'Prep that starts the night before produces a case you half remember and blocks you never wrote. The fix is not more hours, it is earlier hours. Two weeks out is the point where research, casework, and practice rounds all fit without one of them getting cut.',
          'The split that works: days 1 to 4 for research and brainstorming, days 5 to 9 for writing the case and the blocks file, days 10 to 13 for practice rounds and repairs, day 14 for rest and logistics. Write the schedule down and put it somewhere you will see it. A plan that lives only in your head quietly becomes "I will do it this weekend."',
          'Impromptu formats change the middle of the plan, not its shape. If you compete in APDA or BP, there is no case to write in advance, so days 5 to 9 become prep-time drills instead: two 15-minute case sprints a day on random motions, one on Gov and one on Opp. The muscle you are training is the one the tournament actually tests, building a case under a clock.',
        ],
      },
      {
        heading: 'The case file and the blocks file',
        body: [
          'Two documents, and the second one matters more. The case file holds your constructive material. For prepared-motion formats that means the full case: contentions, warrants, evidence, and the weighing you plan to run. For impromptu formats it is an example bank sorted by theme, economics, rights, international relations, tech, with two or three examples per theme that you know cold.',
          'The blocks file is the document most debaters never make. List the ten arguments you are most likely to hear against your case. For each one, write a 30-second answer: what they say, your counter, the warrant behind your counter, and the comparison that tells the judge why your side of the exchange matters more. Ten blocks is one evening of work, and every block you wrote in advance is 30 seconds of in-round prep time freed up for the argument you did not predict.',
          'Keep both files short enough to reread in the ten minutes before round 1. A 20-page case file is a research archive, not a tournament document. One page of case skeleton and two pages of blocks means you can hold the whole thing in your head while you flow.',
        ],
      },
      {
        heading: 'Partner prep and solo prep do different jobs',
        body: [
          'Research alone, argue together. Reading and writing parallelize badly; two people staring at the same document is one person working. Save partner time for the thing you cannot do alone, which is testing the case against someone trying to break it.',
          'A partner session that earns its 45 minutes: 10 minutes, one of you delivers the case at full speed. 15 minutes, the other attacks it as the best version of your likely opponent, no politeness. 15 minutes, patch the holes together and update the blocks file with whatever landed. 5 minutes, agree on the split: who extends what, and who covers which likely response.',
          'If you are prepping alone, the missing ingredient is opposition. Argue the other side of your own case out loud for five minutes and write down the answer that scared you most; it goes straight into the blocks file. A sparring round on Debatable does the same job faster, since an opponent that pushes back finds holes a reread never will.',
        ],
      },
      {
        heading: 'Judged practice rounds are the dress rehearsal',
        body: [
          'Unjudged practice rounds feel productive and hide everything. You speak, your partner nods, and nobody tells you the second contention has no warrant. In days 10 to 13, run at least two full-length rounds in front of someone who gives a decision and a reason for it: a coach, a teammate who did not help write the case, an older debater on a video call.',
          'Simulate the real conditions or the rehearsal lies to you. Full speech times, real prep time, standing up, a visible timer, phones away. Then treat the reason for decision as data: write down what the judge said, especially the parts you disagree with, because a judge you disagree with at practice is a judge you will meet in round 3. The point of the rehearsal is to lose in private, cheaply, instead of losing the same way on Saturday.',
        ],
      },
      {
        heading: 'Tournament day runs on logistics',
        body: [
          'Flow every speech, including your own side\'s. Adrenaline deletes short-term memory, and the flow is the only reliable record of what was actually said. One pad, one column per speech, their claims on the left, your responses on the right. If you keep dropping arguments in rebuttals, the fix is almost never listening harder. It is flowing better.',
          'Breaks between rounds are for three things: food, water, and the blocks file. Eat something real between every round instead of a vending-machine sprint at 2pm when your energy is already gone; five rounds of speaking burns more than you expect. And do not relitigate the last round in the hallway. It is over, and round 4 does not care.',
          'Read the judge before you adapt to them. Check paradigms where they are published, listen to disclosure, or ask a polite question before the round where the circuit allows it. A lay judge gets slower delivery, no jargon, and one big clear frame. A flow judge gets signposting and the line-by-line. Delivering the same speech to both is choosing to lose one of them.',
        ],
      },
      {
        heading: 'The ballot is the syllabus for the next tournament',
        body: [
          'Read every ballot within a week, wins included. Wins hide mistakes; judges often vote for you and still write down the thing that nearly cost you the round. The loss ballots sting more and teach faster, which is exactly why most debaters never reread them.',
          'Convert comments into drills, one for one. "Too fast in the final minute" becomes a redelivery drill at conversational pace. "Never answered the turn" becomes a flowing drill. "Weighing came too late" becomes a rule that the impact comparison starts in the constructive. A ballot line that never becomes a drill is feedback you paid an entry fee for and threw away.',
        ],
      },
    ],
    examples: [
      {
        context: 'A prewritten block, deployed against the most common attack on a school-vouchers case.',
        line: '"They say vouchers drain public schools. Two answers. One: funding already follows enrollment, so the drain exists in the status quo. Two: their own logic concedes families are fleeing schools that fail them, which is the problem we solve."',
        why: 'Written five days before the tournament, delivered in twelve seconds. Every block you write in advance frees in-round prep time for the argument you did not see coming.',
      },
      {
        context: 'Round 3 judge adaptation, after learning the judge is a parent volunteer, not a coach.',
        line: '"Keep two numbers in mind this round: 40 percent of the district\'s students, and six years before results show. Everything both teams say today fits under those two numbers."',
        why: 'Lay-judge adaptation. No jargon, one clear frame the judge can carry into the decision. The same material delivered line-by-line at speed would have lost this ballot.',
      },
      {
        context: 'Post-round review on the bus home, reading a loss ballot with a partner.',
        line: '"The judge wrote: never heard a response to the mentor-matching turn. We flowed it. We just never said the answer out loud. New rule: answers get spoken, not just written down."',
        why: 'One ballot line converted into one concrete fix. That habit, repeated across a season, is the difference between attending tournaments and improving at them.',
      },
    ],
    related: ['how-to-practice-debate-online', 'how-to-practice-debate-alone', 'how-to-get-better-at-debating', 'how-to-win-a-debate'],
    keywords: [
      'how to prepare for a debate tournament',
      'debate tournament prep checklist',
      'debate tournament tips',
      'what to do before a debate tournament',
      'debate case file and blocks',
    ],
    ctaLabel: 'Run a judged practice round',
    ctaHref: '/debate-it?format=quick&motion=This%20house%20would%20make%20voting%20compulsory.',
    faqs: [
      {
        q: 'How early should I start preparing for a debate tournament?',
        a: 'Two weeks for prepared-motion formats. Days 1 to 4 for research, days 5 to 9 for the case and blocks file, days 10 to 13 for judged practice rounds, day 14 for rest and logistics. For impromptu formats like APDA or BP, replace the casework days with timed prep drills on random motions.',
      },
      {
        q: 'What should I bring to a debate tournament?',
        a: 'Your case file and blocks file, printed or saved offline, a legal pad and two pens for flowing, a timer, water, and food that survives a backpack: nuts, fruit, sandwiches. Add the tournament schedule and any published judge paradigms. Phones die and wifi drops, so anything you need in round should work without either.',
      },
      {
        q: 'How many practice rounds should I do before a tournament?',
        a: 'At least two full-length judged rounds in the final four days, with someone who gives a real decision and a reason for it. Unjudged rounds hide your weaknesses. If no judge is available, run the round under full time constraints anyway, then have your partner attack the case as the best version of your likely opponent.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

  'how-to-improve-your-rebuttals': {
    slug: 'how-to-improve-your-rebuttals',
    question: 'How to Improve Your Rebuttals',
    hook: 'Four steps per answer, warrant-level refutation, turns over takeouts, and a 15-minute daily rep drill. Rebuttal is a trainable skill, not a talent.',
    format: 'general',
    formatName: 'All formats',
    readTime: '7 min',
    takeaways: [
      'Every answer runs four steps: they say, but, because, therefore. Reference, counter, warrant, impact.',
      'Attack the warrant, not the claim. A claim with a dead warrant is an assertion, and assertions lose to arguments.',
      'Prefer turns over takeouts. A takeout neutralizes; a turn converts their offense into yours.',
      'Answer fewer arguments at full depth. Two 60-second answers beat six 10-second ones on the same flow.',
    ],
    sections: [
      {
        heading: 'The four-step skeleton: they say, but, because, therefore',
        body: [
          'Every rebuttal answer runs the same skeleton. They say: reference the argument you are answering, in their words, so the judge can find it on the flow. But: state your counter in one sentence. Because: warrant the counter with a reason, a mechanism, or an example. Therefore: tell the judge what winning this exchange does to the round.',
          'Most bad rebuttals die at step one or step four. Skip the reference and the judge hears three smart sentences floating loose, attached to nothing on the flow. Skip the therefore and you win an exchange without cashing it in; the judge agrees with you and still votes the other way, because nobody told them the exchange mattered.',
          'Budget 20 to 40 seconds per answer, and say the signposts out loud while you learn the structure: "they said, but, because, so." It feels mechanical for about two weeks. Then it becomes the shape your thinking takes under pressure, which is the entire point.',
        ],
      },
      {
        heading: 'Answer the warrant, not the claim',
        body: [
          'Every argument has three parts: claim, warrant, impact. Novices attack the claim, which produces a stalemate; your counterclaim against their claim is a coin flip the judge resolves on instinct. Varsity debaters attack the warrant, because a claim whose warrant is dead is just an assertion, and assertions lose to arguments by default.',
          'Their argument: raising the minimum wage increases unemployment, because employers protect margins by cutting hours. The claim-level answer is "studies show it does not," which is the coin flip. The warrant-level answer: "their mechanism assumes labor cost is the first thing employers cut. In low-wage service work, turnover is the dominant cost, and higher wages cut turnover. The mechanism runs backwards." Now they rebuild from zero or the argument stays dead.',
          'The practical habit: when you flow their speech, hunt for the word because. Whatever follows it is your target. If nothing follows it, say so on the mic: they asserted, they did not argue, and the judge should weigh your warranted material against their unwarranted material.',
        ],
      },
      {
        heading: 'Turns beat takeouts',
        body: [
          'A takeout says their argument is false. Done well, it neutralizes; the flow goes quiet on that line and nobody scores. A turn says their argument is true and helps you. Link turn: the mechanism actually runs in your direction. Impact turn: the outcome they describe actually favors your side. Turns are worth more because they generate offense on ground your opponent chose.',
          'After a clean takeout, your opponent can rebuild the argument in the next speech. After a clean turn, rebuilding hurts them; every minute they spend proving the argument makes your version of it stronger. You have converted their offense into yours, and they are now cross-examining their own case.',
          'One warning that saves rounds: never run a link turn and an impact turn on the same argument. If their mechanism runs your way and their outcome is also good, you have argued their side for them. Pick the stronger turn, run it alone, and keep a plain takeout as the backup.',
        ],
      },
      {
        heading: 'Collapse discipline: answer less, win more',
        body: [
          'You cannot answer everything, and trying to answers nothing. Six 10-second answers lose to two 60-second answers on the same flow, because none of the six carries a full warrant and the judge protects whatever went unanswered at depth. The skill is choosing which arguments sit on the path to the ballot and letting the rest go.',
          'Priority rules, in order. Answer the argument that is winning, not the one that annoyed you. Answer offense before defense; a dropped harm can cost you the round, a dropped definitional quibble cannot. Answer what the judge flowed longest, since that is what they think the round is about. Group everything else and dispatch it in one sentence.',
          'Say the collapse out loud. "This round comes down to two questions" tells the judge where to look, and it reframes your selectivity as control of the round rather than gaps in it. A silent collapse looks like dropping arguments. A named collapse looks like judgment.',
        ],
      },
      {
        heading: 'Rebuttal reps: the 15-minute daily drill',
        body: [
          'Rebuttal is a rep skill, closer to a jump shot than to essay writing. The base drill: take a motion, write one argument for it or have a partner state one, start a 60-second timer, and deliver a four-step answer out loud. Ten reps takes about 15 minutes. Out loud is non-negotiable; the rebuttals you compose in your head are always better than the ones that leave your mouth.',
          'Progress the drill weekly. Week one, no cap on think time before the timer starts. Week two, 15 seconds of think time, then speak. Week three, every answer must be a turn, not a takeout. Record every fifth rep and check it against the skeleton: was the reference clear, did a warrant follow the counter, did you land a therefore.',
          'Once the structure is automatic, solo reps plateau, because a wall never rebuilds the argument. That is when you need an opponent who answers back. A Debatable round gives you one on demand, and the rebuild is where warrant-level answering actually gets tested.',
        ],
      },
      {
        heading: 'Prewritten blocks and live thinking are both jobs',
        body: [
          'On a prepared topic, roughly seven of the ten answers you will need are predictable. Write those as blocks: the four-step answer, on paper, before the tournament. Delivering beats composing under time pressure, and a block you wrote on Tuesday is calmer and tighter than anything you improvise on Saturday.',
          'Blocks fail when they become scripts. If you read a block against an argument your opponent did not quite make, the judge hears the mismatch and discounts the answer. Keep the warrant from the block and rebuild the reference line live: their words first, your prepared material second.',
          'The honest self-test: if your rebuttal sounds identical every round, you are reading. If it never sounds prepared, you are wasting your prep. The target is rebuttal that sounds live and lands prepared, and the four-step skeleton is what holds that together when the round gets fast.',
        ],
      },
    ],
    examples: [
      {
        context: 'Motion: This house would ban targeted political advertising. Answering the "targeted ads inform voters" argument.',
        line: '"They say targeting informs voters. But it does the opposite, because the mechanism is showing each voter only what tests well on them, which narrows what they see instead of adding to it. So their best impact flips to us: voters finish the campaign knowing less."',
        why: 'All four steps in one breath: reference, counter, warrant, cash-out. The judge can flow it as a complete answer instead of a stray objection.',
      },
      {
        context: 'Turning an economic growth argument instead of taking it out.',
        line: '"Take their growth argument at full strength. Growth concentrated in the top decile is exactly what erodes the political stability their whole case depends on. The stronger their economy gets, the stronger our instability impact gets."',
        why: 'A takeout would leave the flow neutral. The turn converts their offense into yours; every minute they spend rebuilding growth feeds your impact.',
      },
      {
        context: 'Final rebuttal, collapsing from six arguments on the flow down to two.',
        line: '"This round comes down to two questions: does the policy actually reach rural clinics, and who carries the transition cost. Everything else on the flow is noise. Here is why we win both."',
        why: 'A named collapse reads as control of the round. The judge now evaluates the two exchanges you are deepest on instead of the six you would have skimmed.',
      },
    ],
    related: ['how-to-win-a-debate', 'how-to-get-better-at-debating', 'asian-parli-whip', 'pf-crossfire-questions'],
    keywords: [
      'how to improve rebuttals in debate',
      'debate rebuttal structure',
      'four step refutation debate',
      'rebuttal examples for debate',
      'how to rebut an argument',
    ],
    ctaLabel: 'Drill rebuttals against the AI',
    ctaHref: '/debate-it?format=quick&motion=This%20house%20would%20ban%20targeted%20political%20advertising.',
    faqs: [
      {
        q: 'What is the four-step rebuttal structure?',
        a: 'They say, but, because, therefore. Reference the argument you are answering, state your counter, warrant the counter with a reason or mechanism, then tell the judge what winning the exchange means for the round. The structure keeps every answer flowable and forces you past assertion into actual clash. Budget 20 to 40 seconds per answer.',
      },
      {
        q: 'What is the difference between a turn and a takeout in debate?',
        a: 'A takeout argues the point is false and neutralizes it; the flow goes quiet. A turn accepts the argument and flips it: the mechanism actually runs your way, or the outcome actually favors your side. Turns generate offense, which makes them worth more. Never combine a link turn and an impact turn on the same argument.',
      },
      {
        q: 'Should I write rebuttal blocks in advance?',
        a: 'Yes, for the predictable arguments. On a prepared topic, write the ten answers you know you will need, then deliver them from memory rather than off the page, adapting the reference line to what your opponent actually said. Anything unpredicted gets answered live with the four-step structure. Blocks buy time; they do not replace listening.',
      },
    ],
    published: '2026-07-14',
    updated: '2026-07-14',
  },

};

export function getGuide(slug) {
  if (!slug) return null;
  return GUIDE_BANK[slug.toLowerCase()] || null;
}

export function listGuides() {
  return Object.values(GUIDE_BANK);
}
