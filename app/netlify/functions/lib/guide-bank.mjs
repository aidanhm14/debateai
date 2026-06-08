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
    question: 'LD value and criterion examples',
    hook: 'Value names what matters; criterion gives you the test. Pick a value that fits the resolution and a criterion you can actually warrant. Don\'t reach for Kant if your case is consequentialist.',
    format: 'ld',
    formatName: 'Lincoln-Douglas',
    readTime: '5 min',
    takeaways: [
      "Value = the abstract concept the round is about (Justice, Morality, Liberty).",
      "Criterion = the standard for measuring achievement of the value (Util, Cat. Imperative, Veil of Ignorance).",
      "Pick the pair where your contentions actually link cleanly. Fancy framework + weak link is worse than basic framework + strong link.",
      "Defending the framework is half the round. Have warrants for both the value and the criterion.",
    ],
    sections: [
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
      'ld value criterion examples',
      'lincoln douglas value criterion',
      'ld framework examples',
      'how to pick ld framework',
      'ld value premise',
      'lincoln douglas debate framework',
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

};

export function getGuide(slug) {
  if (!slug) return null;
  return GUIDE_BANK[slug.toLowerCase()] || null;
}

export function listGuides() {
  return Object.values(GUIDE_BANK);
}
