/* landing-chatter.js: the scripted chatter in the homepage Highlights panel.
 *
 * 2026-09-25, Aidan: "add more random fake chats under fake names but make
 * them really human ... so when ppl see it there is a feeling of liveliness".
 * He was shown the 2026-08-31 real-only rule ("get rid of the bots on the
 * open group chat") and the practical risk (real regulars reply to names
 * that are not there), and chose untagged personas over an AI-tagged
 * version. The soul.md decision log carries the reversal.
 *
 * This file is DATA AND A CLOCK. It draws nothing and sends nothing: the
 * renderer in landing.html asks it which lines exist at a given instant.
 * The limits below are enforced here and by scripts/test-landing-chatter.mjs,
 * and they are not a style preference:
 *
 *  - Browser only. Nothing here is written to The Commons, Firestore, or any
 *    endpoint. A scripted line in a real room is a record other people read
 *    and answer; that line stays where it was drawn in 2026-08-29.
 *  - Every person here is invented, and no name matches a real account.
 *    Checked against every public name on the site when written; the
 *    renderer also drops any persona that matches a real handle in the feed.
 *  - Scripted people never reply to, name, or quote a real person. Every
 *    episode opens with a standalone line and is answered only by other
 *    scripted people, and the renderer never lets a scripted reply land
 *    directly under a real message.
 *  - No praise of the site, no claims about the judge, ranks, results,
 *    prizes, or money. People chat about topics and about arguing. That is
 *    the line between atmosphere and a fake testimonial.
 *  - Same content bar as real chat: the site's motion boundary, the
 *    highlight filter, no em dashes, no retired brand language.
 *
 * DETERMINISTIC BY WALL CLOCK. Time is cut into one-minute slots and each
 * slot's episode is a pure function of the slot number, so two visitors at
 * the same moment see the same room, and a reload shows the same history
 * plus whatever "arrived" since. A room that reshuffled on every reload
 * would give itself away in one refresh.
 */
(function (root) {
  'use strict';

  var VERSION = 'chatter-2026-09-25';
  var SLOT_MS = 60000;
  var DAY_MS = 86400000;

  /* People: [handle, IANA zone, city as they would type it, region, language].
     Region and language let an episode ask for a speaker who fits the line
     ("any europeans on?", "bom dia"). Local times are real: {time} and
     {weekday} are computed in the speaker's own zone, and an episode that
     says it is late only runs when it is actually late where they are. */
  var PEOPLE = [
    ['tiago r', 'Europe/Lisbon', 'lisbon', 'eu', 'pt'],
    ['shreya_p', 'America/Toronto', 'toronto', 'ca', 'in'],
    ['dele_o', 'Africa/Lagos', 'lagos', 'af', ''],
    ['taiga.k', 'Asia/Tokyo', 'osaka', 'as', ''],
    ['Marisol', 'America/Mexico_City', 'cdmx', 'la', 'es'],
    ['bethan', 'Europe/London', 'leeds', 'eu', ''],
    ['ayo', 'Africa/Accra', 'accra', 'af', ''],
    ['rhys_', 'Europe/London', 'cardiff', 'eu', ''],
    ['rawan', 'Asia/Amman', 'amman', 'me', ''],
    ['jojo m', 'Asia/Manila', 'manila', 'as', ''],
    ['sven', 'Europe/Stockholm', 'stockholm', 'eu', ''],
    ['agus_', 'America/Argentina/Buenos_Aires', 'buenos aires', 'la', 'es'],
    ['Callum P', 'Australia/Melbourne', 'melbourne', 'oc', ''],
    ['wanjiru', 'Africa/Nairobi', 'nairobi', 'af', ''],
    ['Mateus', 'America/Sao_Paulo', 'são paulo', 'la', 'pt'],
    ['fenna', 'Europe/Amsterdam', 'amsterdam', 'eu', ''],
    ['coop', 'America/Denver', 'denver', 'us', ''],
    ['fer', 'Europe/Madrid', 'madrid', 'eu', 'es'],
    ['yuki_t', 'Asia/Tokyo', 'tokyo', 'as', ''],
    ['arjun07', 'Asia/Kolkata', 'pune', 'as', 'in'],
    ['wenjie', 'Asia/Singapore', 'singapore', 'as', ''],
    ['Marek', 'Europe/Warsaw', 'kraków', 'eu', ''],
    ['esi', 'Africa/Accra', 'kumasi', 'af', ''],
    ['gabe', 'America/Chicago', 'chicago', 'us', ''],
    ['laila m', 'Asia/Dubai', 'dubai', 'me', ''],
    ['conor', 'Europe/Dublin', 'dublin', 'eu', ''],
    ['Varun M', 'Asia/Kolkata', 'bangalore', 'as', 'in'],
    ['thabo', 'Africa/Johannesburg', 'joburg', 'af', ''],
    ['clémence', 'Europe/Paris', 'lyon', 'eu', ''],
    ['d.nguyen', 'Asia/Ho_Chi_Minh', 'hanoi', 'as', ''],
    ['sam w', 'America/Chicago', 'austin', 'us', ''],
    ['mira', 'Europe/Berlin', 'berlin', 'eu', ''],
    ['femi', 'Europe/London', 'london', 'eu', ''],
    ['ruslan', 'Asia/Almaty', 'almaty', 'as', ''],
    ['ana l', 'America/Bogota', 'bogotá', 'la', 'es'],
    ['wes', 'America/Los_Angeles', 'seattle', 'us', ''],
    ['hamza_', 'Asia/Karachi', 'karachi', 'as', ''],
    ['bex', 'Pacific/Auckland', 'auckland', 'oc', ''],
    ['Dom', 'America/New_York', 'philly', 'us', ''],
    ['yasmine_', 'Africa/Casablanca', 'casablanca', 'af', ''],
    ['ike', 'Africa/Lagos', 'abuja', 'af', ''],
    ['sol', 'America/Santiago', 'santiago', 'la', 'es'],
    ['jiwoo', 'Asia/Seoul', 'seoul', 'as', ''],
    ['salma', 'Africa/Cairo', 'cairo', 'me', ''],
    ['ishita', 'Asia/Kolkata', 'mumbai', 'as', 'in'],
    ['eirik', 'Europe/Oslo', 'oslo', 'eu', ''],
    ['yuting', 'Asia/Taipei', 'taipei', 'as', ''],
    ['dre.w', 'America/New_York', 'atlanta', 'us', ''],
    ['rosie', 'Europe/London', 'glasgow', 'eu', ''],
    ['hollis', 'America/New_York', 'nyc', 'us', ''],
    ['pablo', 'Europe/Madrid', 'valencia', 'eu', 'es'],
    ['saki', 'Asia/Tokyo', 'kyoto', 'as', ''],
    ['olu', 'Europe/London', 'manchester', 'eu', ''],
    ['keira', 'Australia/Sydney', 'sydney', 'oc', ''],
    ['facu', 'America/Argentina/Buenos_Aires', 'rosario', 'la', 'es'],
    ['kels', 'America/Los_Angeles', 'los angeles', 'us', ''],
    ['giulia', 'Europe/Rome', 'milan', 'eu', ''],
    ['margaux', 'America/Toronto', 'montreal', 'ca', '']
  ];

  // How a name is written when someone else mentions it in a line.
  var SHORT = { 'd.nguyen': 'nguyen', 'taiga.k': 'taiga', 'dre.w': 'dre', 'Callum P': 'callum', 'Varun M': 'varun' };

  /* Everyday clashes only, the same bar suggested topics meet (soul.md,
     2026-09-14 and 2026-09-19): a real choice with a cost or a competing
     value on each side. No taste rankings of food, pets or entertainment,
     no fandom or sports trivia, and the site-wide motion boundary applies
     the same way it applies to real rooms. [noun as people say it, the
     yes-or-no version]. */
  var TOPICS = [
    ['tipping', 'should tipping be replaced with higher wages'],
    ['school uniforms', 'should schools get rid of uniforms'],
    ['the four day work week', 'should the four day work week be normal'],
    ['phones in school', 'should phones be banned during school hours'],
    ['homework', 'should homework be optional'],
    ['social media age limits', 'should social media be 16 and up'],
    ['remote work', 'is remote work better than the office'],
    ['self checkout', 'should stores keep human cashiers'],
    ['college', 'is college still worth it'],
    ['space exploration', 'is space exploration worth the money'],
    ['nuclear power', 'should we build more nuclear plants'],
    ['zoos', 'should zoos exist'],
    ['cashless shops', 'should shops be allowed to refuse cash'],
    ['daylight saving time', 'should daylight saving time end'],
    ['car free city centers', 'should city centers ban cars'],
    ['free public transport', 'should public transport be free'],
    ['going through your partners phone', 'is it ever ok to go through your partners phone'],
    ['group projects', 'should group projects be graded individually'],
    ['grading on a curve', 'is grading on a curve fair'],
    ['open plan offices', 'should open plan offices go away'],
    ['ai for homework', 'should students be allowed to use ai for homework'],
    ['standardized tests', 'should colleges drop standardized tests'],
    ['gap years', 'should gap years be normal'],
    ['sharing locations', 'should couples share their locations'],
    ['athlete salaries', 'are pro athletes paid too much'],
    ['the minimum wage', 'should the minimum wage go up'],
    ['rent control', 'does rent control actually help renters'],
    ['lab grown meat', 'should lab grown meat be sold in supermarkets'],
    ['electric cars', 'should new petrol cars be phased out'],
    ['dating a friends ex', 'is it ever ok to date a friends ex'],
    ['later school start times', 'should school start later'],
    ['voting at 16', 'should the voting age be 16'],
    ['compulsory voting', 'should voting be compulsory'],
    ['universal basic income', 'should there be a universal basic income'],
    ['ghosting', 'is ghosting ever ok'],
    ['fast fashion', 'should fast fashion be taxed'],
    ['plastic bag bans', 'should plastic bags be banned'],
    ['lending money to friends', 'should you ever lend money to friends'],
    ['participation trophies', 'should kids get participation trophies'],
    ['cursive', 'should schools still teach cursive'],
    ['unpaid internships', 'should unpaid internships be banned'],
    ['free college', 'should college be free'],
    ['white lies', 'is it ok to lie to spare someones feelings'],
    ['reclining plane seats', 'is it ok to recline your seat on a plane'],
    ['splitting the bill', 'should you always split the bill evenly'],
    ['paying on a first date', 'should whoever asked pay on the first date'],
    ['hosting the olympics', 'is hosting the olympics worth it for a city'],
    ['paying college athletes', 'should college athletes be paid'],
    ['living with your parents', 'is living with your parents at 25 fine'],
    ['meetings', 'should most meetings be emails'],
    ['learning a second language', 'should everyone learn a second language in school'],
    ['coding in school', 'should kids learn to code in primary school'],
    ['free school lunches', 'should school lunches be free'],
    ['chore money', 'should kids get paid for chores'],
    ['owning a car', 'do you need a car in your twenties'],
    ['sunday shopping', 'should shops close on sundays'],
    ['weekend homework', 'should weekends be homework free'],
    ['screen time for kids', 'should kids have screen time limits'],
    ['three year degrees', 'should degrees be three years instead of four'],
    ['work emails after hours', 'should work emails after hours be banned'],
    ['jury duty pay', 'should jury duty pay a real wage'],
    ['splitting rent', 'should roommates split rent by room size'],
    ['sugar taxes', 'should sugary drinks be taxed'],
    ['the drinking age', 'should the us drinking age be 18'],
    ['pet bans in rentals', 'should landlords be allowed to ban pets']
  ];

  /* Episodes. One line per message, "A: text", in the order they are sent.
     An optional first line starting with # constrains who can speak:
       #A=late B=nonus+evening C=late|night
     Time windows use the speaker's local hour: late (23 to 3), night (21 to
     2), morning (6 to 10), day (10 to 17), evening (17 to 22). With no time
     window a speaker is someone awake (7 to 1). Places: us, eu, nonus. Languages: es, pt, in.
     In a line, [a|b|c] picks one; {topic} {topicQ} {topic2} {topic2Q} fill
     from TOPICS; {city} {time} {weekday} describe the speaker; {A} {B} {C}
     {D} are another scripted speaker's short name. The first line of every
     episode stands on its own, because it can land under a real message. */
  var EPISODES = [
    // Finding someone to argue with
    `A: [anyone|anybody] up for a quick one? [any side|either side is fine|dont care which side]
B: what topic
A: [dealers choice|you pick|surprise me]
B: school uniforms. im against
A: bet. ill defend them`,
    `A: looking for someone to argue about {topic} with. ill take whatever side you dont want
B: im in but give me 5 min
A: take your time`,
    `A: need a practice partner for like 20 min. [nothing too serious|low stakes please|anything but politics]
B: {topic}?
A: perfect`,
    `A: who wants con on "{topicQ}"
B: me
B: wait is that the exact wording
A: yeah
B: ok im in`,
    `#A=eu B=eu
A: any europeans on? want someone in my timezone for once
B: {city}. [awake unfortunately|here|yep]
A: want to do {topic}? im con
B: sure give me 2 min`,
    `A: 10 min round anyone? i have class at the hour
B: ya what topic
A: dont care just need reps
B: {topic}, you pick
A: ill take pro`,
    `A: anyone want to do a slow one, like chill pace? trying to work on not rushing
B: honestly same. im in
A: {topic}?
B: sure`,
    `A: someone argue that homework should be banned. ill defend homework, i know
B: youre defending homework?? voluntarily?
A: someone has to
B: fine im in`,
    `A: looking for someone who actually disagrees with me about {topic}. everyone i know agrees with me and its boring
B: which side are you
A: [pro|for it]
B: perfect im against. lets go`,
    `A: can someone take pro on "{topicQ}"? i always end up on con
B: ill do it
A: [thank you|ty|legend]`,
    `#A=morning
A: i have 30 min before work, give me your spiciest topic
B: {topicQ}
A: oof ok. which side do you want
B: youre con
A: [fine|of course i am]`,
    `#A=evening
A: whos free for a round in like 15? making dinner first
B: [ya|yeah] ping me when youre back`,
    `A: need someone to argue about {topic} with before my exam brain melts
B: whats the exam
A: stats
B: youre not winning anything if youre thinking about stats
A: thats the spirit`,
    `A: first round of the day, anyone? im rusty
B: same, lets be rusty together
A: {topic}?
B: [sure|go|yes]`,
    `A: will argue literally anything right now. [im bored|procrastinating hard|exam tomorrow and i refuse to study]
B: tipping at self checkout
A: pro. obviously
C: oh no`,
    `A: anyone want to argue about {topic}? [either side|ill take either side|i dont mind which side]`,
    `A: quick round on {topic} anyone? 10 min`,
    `A: im pro on {topic}. who wants con
B: [me|ill take it|i will]`,
    `A: [want|need] someone to argue about {topic} with, ive got like 20 min`,
    `A: {topicQ}? [go|thoughts|discuss]
B: [yes|no|depends]
C: [depends on who you ask|no lol|obviously yes]`,
    `A: someone give me a topic i know nothing about. i want to suffer
B: [rent control|lab grown meat|hosting the olympics]
A: [perfect|oh no|i asked for this]`,
    `A: anyone good at arguing the side they dont believe? i want to practice that
B: its the only way ive ever changed my mind about anything
C: i hate it and im better at it somehow
A: lol thats exactly what i want`,
    `A: can someone do a round where i practice going second? i always go first and panic
B: i can, give me a topic
A: {topic}
B: ok youre answering me. give me a sec`,
    `A: [someone wanna|anyone wanna] do {topic}? i promise im not good
B: perfect neither am i`,
    `A: taking requests: [any topic|you pick the topic], ill argue whichever side you dont want
B: {topicQ}
A: [alright|done]. you pick first
B: im for it
A: then im against. [lets go|go]`,
    `#A=late
A: its {time} and i want to argue about something low stakes
B: go to bed
A: after one round
B: famous last words`,
    `A: anyone free later? i want to try arguing something i actually care about
B: whats the thing
A: {topic}. i have opinions
B: [ping me later|im around later|i can do later]`,
    `A: open challenge: change my mind on {topic}
B: whats your current position
A: [strongly for|strongly against]
B: ok ill take the other side`,
    `A: anyone want to practice being calm? i get way too heated
B: lol same. lets both try
A: {topic}. dont let me yell
B: no promises`,
    `A: can we do a round where nobody says "literally"
B: impossible
C: literally impossible
A: im leaving`,
    `A: anyone around who actually knows economics? i want to argue the minimum wage and not embarrass myself
B: i took one class so im basically an expert
A: perfect`,
    `A: i want to argue about space. anything space
B: should we spend less on space and more on problems here
A: oh good one. im against`,
    `A: {topic} or {topic2}. pick one and pick a side
B: {topic2}. im pro
A: great im con`,
    `A: taking con on anything for the next 20 min. just need the practice
B: "{topicQ}"
A: im against then. go`,
    `A: give me your worst topic
B: {topicQ}
A: thats not even bad
C: {topic2Q}
A: ok thats bad`,
    `#A=evening|night
A: kinda want to argue something silly tonight
B: is water wet
A: oh were doing this`,
    `#A=es
A: alguien para una rápida? i can do english too
B: english pls, my spanish is bad
A: jaja ok. {topic}?
B: si. i mean yes`,
    `#A=in
A: need a round yaar, my brain is fried from studying
B: same. {topic}?
A: done`,
    `#A=evening
A: who else just finished work and wants to argue about something useless
B: me. i want to argue about whether cereal is soup
A: that was settled. no`,
    `#A=morning B=evening|night
A: morning argument to wake up? anyone
B: its {time} here but sure`,

    // Hot takes that turn into a few lines
    `A: hot take: group projects should be graded individually
B: thats not even hot, everyone agrees
C: i dont. carrying people taught me more than any class did
B: thats trauma talking
C: lol`,
    `A: cereal is soup and i will defend this [to anyone|with my life|in any round]
B: soup has to be hot
A: gazpacho
B: ...
B: fine`,
    `A: daylight saving time should just [go away|end|be abolished]. nobody benefits
B: farmers?
C: pretty sure the farmer thing is a myth
B: ok but i like light in the evening
A: then pick one and keep it`,
    `A: remote work is worse for people in their first job. [change my mind|fight me]
B: agree tbh. i learned half my job from overhearing people
C: or you learn to ask questions instead of overhearing
A: nice idea in theory`,
    `A: unpopular opinion: exams are fairer than coursework
B: how
A: nobody's parents can write your exam for you
B: ok thats actually a point`,
    `A: reclining your seat on a plane is fine and people need to relax
B: absolutely not
C: its literally a button on the seat
B: so is the call button, doesnt mean you press it every 5 min
C: lmao`,
    `A: splitting the bill evenly is wrong if someone only got a salad
B: counterpoint: nobody wants to do math at dinner
A: then dont order the steak`,
    `A: self checkout was a mistake
B: it was fine until the weight sensor
C: unexpected item in bagging area
B: exactly`,
    `A: the four day week only works for office jobs
B: nurses already do long shifts on fewer days though
A: hm
A: ok thats fair`,
    `A: phones should be locked away during school. i will not be taking questions
B: what if theres an emergency
A: schools had landlines before we had phones
C: this is true lol`,
    `#A=us B=nonus
A: tipping has gotten completely out of hand here
B: where is here
A: {city}. they ask for tips at self checkout now
B: wait really
A: really`,
    `A: participation trophies never hurt anyone
B: they hurt the kids who actually won
A: did they though
B: yes. i was one of them
A: lol ok`,
    `A: learning cursive is pointless now
B: signatures?
A: my signature is a line
C: same`,
    `A: universities should drop lectures and just post the videos
B: then what are we paying for
A: exactly
B: that wasnt an agreement`,
    `A: cities should ban cars from the center. [honestly|genuinely] no downside
B: until you need to carry something heavy
A: delivery exists
C: delivery vans are cars
A: fine, vans can come in`,
    `A: a gap year should be normal, not something you have to justify
B: depends what you do with it
C: i did nothing with mine and it was great
B: thats what im worried about`,
    `A: open plan offices were a mistake and im tired of pretending they werent
B: theyre fine with headphones
A: so the solution is to pretend youre not in an office`,
    `A: gift cards are a perfectly good gift
B: its money with extra steps
C: its money with fewer choices
A: its money with thought behind it
B: minimal thought`,
    `A: nuclear is the obvious answer for clean energy and im tired of pretending it isnt
B: waste though
A: the waste is tiny next to what coal puts out
C: build time is the real issue imo
A: ok thats a better argument than waste`,
    `A: zoos are fine if theyre actually doing conservation
B: most arent though
A: then fix those ones
B: easier said than done`,
    `A: unpaid internships should be illegal everywhere
B: they basically are in some places
A: basically isnt enough`,
    `A: the voting age should be 16
B: based on what
A: 16 year olds work and pay taxes
B: some. not most
A: some is enough for a start`,
    `A: compulsory voting would fix a lot
B: or itd just add a lot of random votes
A: random votes cancel out
B: thats not how that works i dont think`,
    `A: [hot take|unpopular opinion]: homework in primary school does nothing
B: it teaches you to sit still
A: so does a chair`,
    `A: school should start at 10. teenagers are not morning people
B: then it ends later and nobody has time for anything
A: worth it
B: easy to say when youre not the one driving`,
    `A: lab grown meat is going to be normal in 20 years and people will act like they always liked it
B: id try it
C: i would not
A: you will`,
    `A: electric cars are great but everyone skips the part about the batteries
B: the batteries get better every year though
A: better isnt solved
B: nothing is solved, thats not a standard`,
    `A: athletes arent overpaid, the owners are just richer
B: both can be true
A: ...ok yes`,
    `A: rent control helps the people who already have a place and nobody else
B: which is still a lot of people
C: i thought most economists say it backfires long term?
B: "most" is doing a lot of work there`,
    `A: everyone should have to learn a second language in school. not optional
B: in a lot of places it already isnt optional
A: then everywhere else
B: fair`,
    `A: coding should be taught before algebra
B: coding is algebra with extra steps
A: coding is algebra with a reason to care`,
    `A: most meetings should be emails and i will die on this hill
B: some emails should be meetings though
C: name one
B: ...fine`,
    `#B=morning
A: morning people are not better at life, theyre just louder about it
B: as a morning person i feel attacked
A: good`,
    `A: fast fashion should be taxed like cigarettes
B: thats a lot
A: the landfills are a lot
C: tax the brands not the people buying it
A: ok thats better`,
    `A: plastic bag bans are the most annoying good policy
B: this is extremely accurate`,
    `A: surprise parties are for the people throwing them, not the person being surprised
B: [this is so true|correct|facts]
C: i love surprise parties
A: you would`,
    `A: texting is better than calling and i will not be taking calls about it
B: lol
C: calling is faster though
A: calling is an ambush`,
    `A: streaming was supposed to be cheaper than cable and now its worse
B: its still cheaper if you rotate
A: nobody rotates
B: i rotate
A: you are one person`,
    `A: you dont need a car in your twenties if you live in a city
B: depends on the city
A: obviously
B: then its not "if you live in a city", its "if you live in a good city"`,
    `A: shops should close on sundays. everyone deserves a day off
B: not the people who only have sundays to shop
C: they have saturday
B: some people work saturdays
A: this is why i like this topic`,
    `A: every degree should be 3 years instead of 4
B: 4 is already short for some subjects
A: then those can be 4
B: so it depends on the subject. thats what we have now
A: ...hm`,
    `A: work emails after hours should be illegal
B: illegal is a lot
A: fine, strongly discouraged
B: with fines?
A: with fines`,
    `A: jury duty should come with real pay
B: agreed. and time off that doesnt get held against you`,
    `A: a universal basic income would change way less than people think
B: or way more
A: thats what i mean, nobody actually knows
B: which is a reason to test it`,
    `A: grading on a curve punishes you for having smart classmates
B: or rewards you for having lazy ones
A: so its luck either way
B: yes`,
    `A: standardized tests are less unfair than essays and nobody wants to hear it
B: essays at least show how you think
A: essays show who could afford help
B: tests too, with tutors
A: ok both are unfair, tests are less unfair`,
    `A: living with your parents at 25 is just smart
B: depends on the parents lol
A: ok that is the whole argument actually`,
    `A: city life > countryside and its not close
B: you have never heard silence
A: i dont want to hear silence
C: this explains a lot`,
    `A: kids should get less screen time, not zero
B: who decides how much less
A: the parents obviously
B: then its not a policy, its just parenting`,
    `A: hosting the olympics is almost never worth it for a city
B: the transport upgrades stick around though
A: at like 10x the price
B: citation needed
A: fair i dont have one`,
    `A: college athletes should get paid, the schools make so much off them
B: some of them get scholarships
A: a scholarship isnt a salary`,
    `A: tiny homes are cute until you need to store anything
B: you just own less stuff
A: i like my stuff`,
    `A: should weekends be homework free? yes. next question
B: some classes need practice every day though
A: then assign less during the week`,
    `A: people who clap when the plane lands are right and i will not apologize
B: absolutely not
C: theyre celebrating being alive, let them`,
    `A: the office is good actually. for like two days a week
B: this is the correct amount
C: zero is the correct amount`,
    `A: gyms that make you cancel in person should be illegal
B: [agreed|yes|this one is easy]
C: some places already banned that i think`,
    `A: is it ever ok to text someone "k"
B: no
C: only if you want them to spiral
A: noted`,
    `A: is it rude to change your mind in the middle of an argument
B: no, thats the whole point
C: its rude to not tell anyone
A: fair`,
    `A: whats the most useless thing youve argued about and lost
B: whether a pop tart is a ravioli
C: which way the toilet paper goes
A: those are both important actually`,

    // Just talking
    `A: hey all
B: [hey|hi|yo]
A: whats everyone arguing about today
B: {topic}, apparently
C: still?`,
    `#A=evening
A: brb dinner`,
    `A: back. did i miss anything
B: [not really|someone said cereal is soup|a whole thing about {topic}]
A: [ok good|oh no|of course]`,
    `#A=late
A: its {time} in {city} and i should be asleep
B: go to sleep
A: after one more round
B: you said that last night`,
    `A: anyone else [procrastinating|avoiding] an essay right now
B: me. 2000 words due tomorrow
C: me but its a lab report
A: solidarity`,
    `#A=morning
A: [coffee number three|third coffee] and its not even noon
B: rookie numbers`,
    `A: hows everyones week going
B: long
C: good actually. finished exams
A: congrats
C: thanks. i dont know what to do with myself now`,
    `#A=late
A: gn everyone
B: gn`,
    `A: does anyone else rehearse arguments in the shower or is that just me
B: in the car
C: in the shower but i always win
B: undefeated in the shower`,
    `A: i said "to be fair" like 9 times in one argument today
B: to be fair thats not that many
A: lol`,
    `A: learning to argue has made me unbearable at family dinners
B: this is the way
C: my mom wont discuss anything with me anymore
A: same lmao`,
    `#A=nonus
A: anyone here practicing english by arguing? im so slow still
B: me! slow is fine, clear is better
A: thank you, that helps`,
    `#A=day
A: who else is supposed to be working right now
B: 🙋
C: me but im arguing about work so it counts`,
    `A: is it weird that i like losing arguments sometimes
B: no, thats how you know you learned something
C: yes`,
    `A: happy {weekday}
B: is it {weekday} already
C: [every day is the same|time isnt real|dont remind me]`,
    `A: first day of classes tomorrow and im arguing with strangers instead of packing
B: priorities`,
    `A: [finally|officially] done with midterms
B: howd it go
A: dont ask`,
    `A: sorry if i disappear, my cat keeps sitting on the keyboard`,
    `#A=morning C=night|late
A: [gm|good morning] from {city}
B: gm
C: its {time} here but gm`,
    `A: its [raining|pouring] in {city}. perfect arguing weather
B: [sunny here, also perfect arguing weather|its always arguing weather]`,
    `A: i just got called "argumentative" at work like its a bad thing
B: was it about the thermostat
A: ...maybe`,
    `#A=evening
A: my little brother just asked me if a straw has one hole or two. i need backup
B: one. its a long hole
C: two. obviously
A: this is going to ruin my night`,
    `A: tried to argue with my professor today. lost
B: on what
A: whether the reading was assigned
B: lol was it
A: yes`,
    `A: anyone else get nervous even when its casual
B: every time. goes away after the first minute
C: slow breath out before you start. helps me
A: trying that`,
    `A: how do you all prep for a topic you know nothing about
B: i think about who it affects and go from there
C: google for 3 min and pray
A: the second one is my current method`,
    `A: whats the best way to answer someone who talks really fast
B: pick their best point and ignore the rest
C: slow down on purpose. reads as confident
A: noted`,
    `A: the hardest thing is when they agree with your whole case and still say youre wrong
B: thats when you ask them why it matters
A: i froze instead lol`,
    `A: do people actually take notes while the other person talks
B: yes or you forget everything
C: i write 3 words and cant read them later`,
    `A: tip: say your conclusion first. people stop listening fast
B: who told you that
A: my english teacher. she was right about most things`,
    `A: whats a topic where arguing the other side changed your mind
B: school uniforms honestly
C: nuclear power
A: same, nuclear`,
    `A: note to self: stop agreeing with the first thing they say just to seem nice`,
    `A: practiced my opening out loud on the bus. got looks`,
    `A: today i learned the word "sophistry" and im going to use it way too much
B: please dont
A: too late`,
    `A: why is it always easier to argue the side you dont believe
B: because youre not scared of being wrong
A: oh
A: thats kind of deep actually`,
    `A: someone just told me "thats a good point" and then ignored it completely. respect honestly
B: classic
C: the "thats a good point" pivot is undefeated`,
    `A: i keep starting every reply with "so"
A: every single one
A: so. anyway`,
    `A: arguing with my roommate about whether water is wet. need backup
B: its not wet, it makes things wet
C: its wet
A: this is not helping`,
    `#A=night
A: i always argue better at night and i dont know why
B: nobody is watching the clock
A: maybe`,
    `A: anyone else learn more from losing than winning
B: yeah but winning feels better
A: fair`,
    `A: my friends have banned me from saying "define that"
B: lol why
A: i said it 4 times at dinner
C: thats fair of them`,
    `#A=day
A: back from class`,
    `A: brb`,
    `A: im back`,
    `A: that feeling when you think of the perfect response 2 hours later
B: every time
C: the shower comeback
A: always the shower`,
    `A: just realized i argue better when im annoyed. not sure how to feel about that`,
    `A: new here, hi
B: [hi|welcome|hey]
C: [hey|welcome in|hi hi]`,
    `#A=late
A: cant sleep so im reading about {topic}. this is who i am now`,
    `A: arguing {topic} is way harder than it looks`,
    `A: {topic} discourse is back and i am so ready
B: it never left`,
    `A: i need someone to tell me im wrong about {topic}
A: please`,
    `A: does anyone have a good topic that isnt politics
B: {topicQ}
A: [perfect|ooh ok|that works]`,
    `A: lost an argument to my 12 year old cousin today. she was right
B: happens to the best of us`,
    `A: my grandma argues better than anyone i know. no notes, just confidence
B: grandma energy is undefeated`,
    `A: the worst feeling is agreeing with the other side halfway through
B: just switch sides lol
A: cant switch sides mid sentence
C: you can if youre brave enough`,
    `A: i have a presentation tomorrow and im practicing by arguing with strangers. is that normal
B: its the most normal thing ive heard today`,
    `A: why do i always talk faster when i know im losing
B: we all do that
C: slow down when youre losing, speed up when youre winning. my rule
A: ill try`,
    `#A=pt+morning
A: bom dia everyone
B: bom dia
C: good morning i think`,
    `A: be honest, does anyone actually like the side they get
B: never
C: once. and i still lost
A: brutal`,
    `A: people who start with "im just asking questions" are never just asking questions
B: im just asking questions but why
A: see`,
    `A: i think i finally get the difference between a reason and an example
B: whats the difference
A: an example is one time, a reason is why it keeps happening
C: ooh thats good`,
    `A: is there a word for when someone agrees with you but for the worst reason
B: an ally
C: a liability
A: lmao`,
    `A: someone told me they "dont do hypotheticals". how do you even argue with that
B: you ask them a hypothetical about hypotheticals
A: genius`,
    `A: my study group just turned into a 40 minute argument about {topic}
B: best study session
A: we did zero studying`,
    `A: {topicQ}
A: asking for a round, not a vibe check`,
    `A: im convinced the person who replies first always wins
B: the person who replies last wins
C: the person who logs off wins
A: ok {C} wins`,
    `A: argued with my barber about {topic}. hes very pro. im very scared`,
    `A: i want an argument where both of us are wrong
B: those are the best ones
C: most of mine are like that already`,
    `#A=night
A: trying to get better at comebacks that arent just "no u"
B: "no u" is undefeated though
A: its not an argument
B: neither is anything after midnight`,
    `A: arguing hungry is a mistake. learned that today
B: hangry takes are the worst takes`,
    `A: {city} has the best food and im willing to argue it
B: go on then
A: no i just wanted to say it`,
    `A: my english teacher would be proud of how much im arguing right now
B: or horrified`,
    `A: whos actually good at staying on topic
B: not me. i started on {topic} and ended up on {topic2}
A: honestly impressive`,
    `A: [anyone want|who wants] a round on {topic}? ill take either side`,
    `A: hi all`,
    `A: coffee first then arguing`,
    `A: im [so|very] ready to be wrong about something today`,
    `A: honestly {topic} might be the best topic. nobody agrees on it`,
    `A: going for a walk, back in 20`,
    `A: trying to get better at not saying "like" every 3 words`,
    `A: why does every argument with my sister end in "whatever"`,
    `A: need to stop conceding points i didnt have to concede`,
    `A: i think i talk too fast when im nervous. tips?
B: pause after every point. feels weird, sounds better`,
    `A: my laptop is at 4% and i refuse to get up`,
    `A: every time i win an argument with my dad he changes the subject
B: thats a concession
A: thats what i said`,
    `#A=late
A: {time} and still going`,
    `A: reading about {topic} for a paper and now i have opinions`,
    `A: tip for anyone new: you dont have to win, you just have to be clear`,
    `A: my opinion on {topic} changed twice today`,
    `A: {weekday} arguments hit different`,
    `A: hello from {city}
B: [hey|hi|hello]`,
    `A: the best arguments ive heard all week started with "i might be wrong but"
B: honestly yes`,
    `A: anyone else keep a list of topics they want to argue someday
B: my notes app is 90% that
A: same`,
    `A: my roommate walked in mid argument and thought i was on the phone with my ex
B: lmao were you winning
A: yes`,
    `A: i can argue anything except why i should go to bed
B: that one you always lose`,
    `A: realized i say "basically" before everything i dont know how to explain
B: basically same`
  ];

  /* Lines that cannot open an episode: each reads as an answer to whatever
     sits above it, and above an opener there may be a real person. */
  var REPLY_SHAPED = /^(ok\b|okay|sure|yes\b|yeah|yea\b|yep|no\b|nah|same|lol|lmao|haha|fair|true|wait|which|what\??$|how\??$|me\b|this\b|facts|exactly|agreed|also|and\b|but\b|so\b|@)/i;

  function hash32(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function firstToken(value) {
    return (String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/) || [''])[0];
  }
  function shortName(handle) {
    if (SHORT[handle]) return SHORT[handle];
    return handle.replace(/[_\d]+$/, '').replace(/\s+[a-z]$/i, '').toLowerCase();
  }

  // ── Speaker-local time. Intl knows every zone's daylight saving, so a
  // line that says "its 1am here" is true where that person lives.
  var formatters = {};
  var timeCache = {};
  var WEEKDAYS = { Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday' };
  function localTime(zone, ms) {
    var key = zone + '|' + Math.floor(ms / 60000);
    if (timeCache[key]) return timeCache[key];
    var out = null;
    try {
      var f = formatters[zone] || (formatters[zone] = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23'
      }));
      var parts = f.formatToParts(new Date(ms));
      var h = 0, m = 0, wd = 'Sun';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
        else if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
        else if (parts[i].type === 'weekday') wd = parts[i].value;
      }
      out = { h: h, m: m, weekday: WEEKDAYS[wd] || 'sunday' };
    } catch (e) {
      var d = new Date(ms);
      out = { h: d.getUTCHours(), m: d.getUTCMinutes(), weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()] };
    }
    var keys = Object.keys(timeCache);
    if (keys.length > 4000) timeCache = {};
    timeCache[key] = out;
    return out;
  }
  function timeLabel(t, rng) {
    if (t.h === 0 && t.m < 20) return 'midnight';
    if (t.h === 12 && t.m < 20) return 'noon';
    var h12 = t.h % 12 === 0 ? 12 : t.h % 12;
    var suffix = t.h < 12 ? 'am' : 'pm';
    if (rng() < 0.3) return h12 + ':' + (t.m < 10 ? '0' : '') + t.m + suffix;
    return h12 + suffix;
  }

  var WINDOWS = {
    late: function (h) { return h >= 23 || h <= 3; },
    night: function (h) { return h >= 21 || h <= 2; },
    morning: function (h) { return h >= 6 && h <= 10; },
    day: function (h) { return h >= 10 && h <= 17; },
    evening: function (h) { return h >= 17 && h <= 22; }
  };
  function awake(h) { return h >= 7 || h <= 1; }
  function fits(person, expr, ms) {
    var h = localTime(person[1], ms).h;
    if (!expr) return awake(h);
    var alternatives = expr.split('|');
    for (var i = 0; i < alternatives.length; i++) {
      var tokens = alternatives[i].split('+');
      var ok = true, timed = false;
      for (var j = 0; j < tokens.length && ok; j++) {
        var tok = tokens[j];
        if (WINDOWS[tok]) { timed = true; ok = WINDOWS[tok](h); }
        else if (tok === 'us' || tok === 'eu') ok = person[3] === tok;
        else if (tok === 'nonus') ok = person[3] !== 'us';
        else if (tok === 'es' || tok === 'pt' || tok === 'in') ok = person[4] === tok;
        else ok = false;
      }
      if (ok && (timed || awake(h))) return true;
    }
    return false;
  }

  // ── Parse the bank once.
  var PARSED = EPISODES.map(function (raw, index) {
    var rows = raw.split('\n');
    var rules = {};
    if (rows[0].charAt(0) === '#') {
      rows.shift().slice(1).trim().split(/\s+/).forEach(function (pair) {
        var bits = pair.split('=');
        rules[bits[0]] = bits[1];
      });
    }
    var lines = [];
    rows.forEach(function (row) {
      var match = /^([A-D]):\s(.+)$/.exec(row);
      if (match) lines.push({ role: match[1], text: match[2] });
    });
    var roles = [];
    lines.forEach(function (line) { if (roles.indexOf(line.role) === -1) roles.push(line.role); });
    return { index: index, rules: rules, lines: lines, roles: roles };
  });

  function expand(text, rng, ctx, speaker, at) {
    var out = text.replace(/\[([^\[\]]*\|[^\[\]]*)\]/g, function (_, body) {
      return pick(rng, body.split('|'));
    });
    return out.replace(/\{(topic2Q|topicQ|topic2|topic|city|time|weekday|A|B|C|D)\}/g, function (_, key) {
      if (key === 'topic') return ctx.topic[0];
      if (key === 'topicQ') return ctx.topic[1];
      if (key === 'topic2') return ctx.topic2[0];
      if (key === 'topic2Q') return ctx.topic2[1];
      if (key === 'city') return speaker[2];
      if (key === 'time') return timeLabel(localTime(speaker[1], at), rng);
      if (key === 'weekday') return localTime(speaker[1], at).weekday;
      var other = ctx.cast[key];
      return other ? shortName(other[0]) : '';
    });
  }

  // ── The clock.
  var avoid = {};
  var avoidKey = '';
  var cache = {};
  var cacheSize = 0;
  var permCache = {};

  function permutation(day, cycle) {
    var key = day + '|' + cycle;
    if (permCache[key]) return permCache[key];
    var rng = makeRng(hash32('perm|' + key));
    var order = PARSED.map(function (p) { return p.index; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    if (Object.keys(permCache).length > 12) permCache = {};
    permCache[key] = order;
    return order;
  }

  // How busy the room is: a level that drifts every 20 minutes, quieter in
  // the hours when most of the audience is asleep or at work.
  function activity(k) {
    var start = k * SLOT_MS;
    var level = 0.5 + 0.45 * makeRng(hash32('lvl|' + Math.floor(k / 20)))();
    var hour = new Date(start).getUTCHours();
    if (hour >= 6 && hour <= 11) level *= 0.65;
    return level;
  }

  function castFor(ep, rng, at) {
    var cast = {};
    var used = {};
    for (var r = 0; r < ep.roles.length; r++) {
      var role = ep.roles[r];
      var chosen = null;
      for (var tries = 0; tries < 30 && !chosen; tries++) {
        var person = pick(rng, PEOPLE);
        if (used[person[0]] || avoided(avoid, person)) continue;
        if (fits(person, ep.rules[role], at)) chosen = person;
      }
      if (!chosen) return null;
      cast[role] = chosen;
      used[chosen[0]] = true;
    }
    return cast;
  }

  // One slot's episode, ignoring its neighbours. Pure in k.
  function rawSlot(k) {
    var key = String(k);
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    var result = null;
    var rng = makeRng(hash32('slot|' + k));
    if (rng() < activity(k)) {
      var slotStart = k * SLOT_MS;
      var start = slotStart + 1000 + Math.floor(rng() * 44000);
      var day = Math.floor(slotStart / DAY_MS);
      var sod = k - day * (DAY_MS / SLOT_MS);
      var n = PARSED.length;
      var order = permutation(day, Math.floor(sod / n));
      for (var attempt = 0; attempt < 8 && !result; attempt++) {
        var ep = PARSED[order[(sod + attempt * 17) % n]];
        var cast = castFor(ep, rng, start);
        if (!cast) continue;
        var ctx = { cast: cast, topic: pick(rng, TOPICS), topic2: null };
        do { ctx.topic2 = pick(rng, TOPICS); } while (ctx.topic2 === ctx.topic);
        var at = start;
        var lines = [];
        var prev = null;
        for (var i = 0; i < ep.lines.length; i++) {
          var line = ep.lines[i];
          var speaker = cast[line.role];
          if (i > 0) {
            var len = ep.lines[i].text.length;
            var gap = line.role === prev
              ? 1200 + rng() * 2500 + len * 50
              : 2500 + rng() * 7000 + len * 130 + (rng() < 0.12 ? 8000 + rng() * 17000 : 0);
            at += Math.round(gap);
          }
          lines.push({ role: line.role, speaker: speaker, text: line.text, at: at });
          prev = line.role;
        }
        // Keep the whole episode inside two slots so the one after it can
        // start cleanly: squeeze the gaps rather than drop a line.
        var limit = slotStart + 2 * SLOT_MS - 4000;
        var last = lines[lines.length - 1].at;
        if (last > limit && lines.length > 1) {
          var span = last - start;
          var room = limit - start;
          lines.forEach(function (l) { l.at = start + Math.round((l.at - start) * room / span); });
        }
        result = {
          k: k,
          start: start,
          end: lines[lines.length - 1].at,
          episode: ep.index,
          lines: lines.map(function (l, idx) {
            var t = localTime(l.speaker[1], l.at);
            return {
              id: k + '.' + idx,
              ep: k,
              e: ep.index,
              i: idx,
              handle: l.speaker[0],
              text: expand(l.text, rng, ctx, l.speaker, l.at),
              at: l.at,
              h: t.h
            };
          })
        };
      }
    }
    if (cacheSize > 600) { cache = {}; cacheSize = 0; }
    cache[key] = result;
    cacheSize++;
    return result;
  }

  // A slot plays only when the episode before it has finished, with a
  // breath between them, so conversations never interleave.
  function slot(k) {
    var mine = rawSlot(k);
    if (!mine) return null;
    var before = rawSlot(k - 1);
    if (before && before.end + 3000 > mine.start) return null;
    return mine;
  }

  function between(fromMs, toMs) {
    var out = [];
    var first = Math.floor(fromMs / SLOT_MS) - 2;
    var last = Math.floor(toMs / SLOT_MS);
    for (var k = first; k <= last; k++) {
      var ep = slot(k);
      if (!ep) continue;
      for (var i = 0; i < ep.lines.length; i++) {
        var line = ep.lines[i];
        if (line.at > fromMs && line.at <= toMs) out.push(line);
      }
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  // Whole episodes, newest last, until at least minLines have been sent by
  // now. Always starts on an episode's first line.
  function backlog(now, opts) {
    var minLines = (opts && opts.minLines) || 9;
    var episodes = [];
    var count = 0;
    var k = Math.floor(now / SLOT_MS);
    for (var steps = 0; steps < 60 && count < minLines; steps++, k--) {
      var ep = slot(k);
      if (!ep || ep.start > now) continue;
      var sent = ep.lines.filter(function (line) { return line.at <= now; });
      episodes.unshift(sent);
      count += sent.length;
    }
    return [].concat.apply([], episodes);
  }

  // The renderer passes the real handles on screen. A persona whose name or
  // first name matches one of them sits out, so a scripted line can never
  // be mistaken for a real person who is in the same feed.
  function avoided(set, person) {
    return !!(set[norm(person[0])] || set['#' + firstToken(person[0])]);
  }
  // Returns true only when a persona actually joins or leaves the bench.
  // Real names that match nobody leave the schedule untouched, so two
  // visitors looking at different real rows still see the same room.
  function setAvoid(handles) {
    var next = {};
    (handles || []).forEach(function (handle) {
      var n = norm(handle);
      if (!n) return;
      next[n] = true;
      var f = firstToken(handle);
      if (f && f.length > 2) next['#' + f] = true;
    });
    var key = Object.keys(next).sort().join(',');
    if (key === avoidKey) return false;
    var changed = PEOPLE.some(function (person) { return avoided(next, person) !== avoided(avoid, person); });
    avoidKey = key;
    avoid = next;
    if (!changed) return false;
    cache = {};
    cacheSize = 0;
    return true;
  }

  // For the guard only: the raw bank, so the test can check every line.
  function bank() {
    return { people: PEOPLE.slice(), topics: TOPICS.slice(), episodes: PARSED, replyShaped: REPLY_SHAPED };
  }

  root.DBLandingChatter = {
    version: VERSION,
    slotMs: SLOT_MS,
    backlog: backlog,
    between: between,
    setAvoid: setAvoid,
    avoids: function (handle) {
      return avoided(avoid, [handle]);
    },
    isScripted: function (handle) {
      return PEOPLE.some(function (p) { return p[0] === handle; });
    },
    _bank: bank
  };
  if (typeof root.__fsChatterReady === 'function') {
    try { root.__fsChatterReady(); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
