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
//   ctaHref       — /debate-ai?format=...&motion=... preloaded round
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
    ctaHref: '/debate-ai?format=asian&motion=This%20house%20would%20ban%20political%20donations%20from%20corporations.',
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
    ctaHref: '/debate-ai?format=worlds&motion=THBT%20social%20media%20platforms%20should%20be%20liable%20for%20user%20content.',
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
    ctaHref: '/debate-ai?format=pf&motion=Resolved%3A%20The%20United%20States%20should%20adopt%20a%20carbon%20tax.',
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
    ctaHref: '/debate-ai?format=bp&motion=This%20house%20would%20impose%20a%20carbon%20tax%20on%20heavy%20industry.',
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

};

export function getGuide(slug) {
  if (!slug) return null;
  return GUIDE_BANK[slug.toLowerCase()] || null;
}

export function listGuides() {
  return Object.values(GUIDE_BANK);
}
